import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { statusStyle, timeAgo } from "@/lib/format";
import type { Repo, Run } from "@/lib/github";
import ErrorView from "@/components/ErrorView";
import Loading from "@/components/Loading";
import Screen from "@/components/Screen";

type LatestRun = Run & { repoOwner: string; repoName: string };

export default function RepoList() {
  const { api } = useAuth();
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<LatestRun | null>(null);
  const [latestLoading, setLatestLoading] = useState(true);

  const loadLatestRuns = useCallback(async (repoList: Repo[]) => {
    if (!api) return;
    setLatestLoading(true);
    try {
      const candidates = await Promise.all(
        repoList.map(async (repo) => {
          try {
            const result = await api.listRuns(repo.owner.login, repo.name, 1);
            const run = result.workflow_runs[0];
            return run
              ? { ...run, repoOwner: repo.owner.login, repoName: repo.name }
              : null;
          } catch {
            return null;
          }
        })
      );
      const runs = candidates.filter((run): run is LatestRun => run !== null);
      setLatestRun(
        runs.reduce<LatestRun | null>(
          (latest, run) =>
            !latest || new Date(run.created_at).getTime() > new Date(latest.created_at).getTime()
              ? run
              : latest,
          null
        )
      );
    } finally {
      setLatestLoading(false);
    }
  }, [api]);

  const load = useCallback(async (refresh = false) => {
    if (!api) return;
    if (refresh) setRefreshing(true);
    try {
      setError(null);
      const nextRepos = await api.listRepos();
      setRepos(nextRepos);
      void loadLatestRuns(nextRepos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load repositories.");
      setLatestLoading(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, loadLatestRuns]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => repos ?? [], [repos]);

  if (loading) return <Loading label="Loading your workspace" />;
  if (error && !repos) return <ErrorView message={error} onRetry={() => load()} />;

  return (
    <Screen edges={[]}>
      <SafeAreaView edges={["top"]} className="bg-panel">
        <View className="bg-panel px-4 pb-3 pt-3">
          <View className="mb-3 flex-row items-center">
            <View className="flex-1">
              <Text className="text-[11px] font-bold tracking-[1.5px] text-dim">DEVPOCKET</Text>
              <Text className="mt-0.5 text-[21px] font-extrabold text-copy">Your Repos</Text>
            </View>
            <View className="mr-3 flex-row items-center gap-1.5 rounded-lg bg-brand/15 px-2.5 py-1.5">
              <Text className="text-[15px] font-extrabold leading-4 text-brand">{repos?.length ?? 0}</Text>
              <Text className="text-[10px] font-bold text-brand">REPOS</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.accent} />}
        ListHeaderComponent={
          <LatestRunCard
            run={latestRun}
            loading={latestLoading}
            onPress={() => {
              if (!latestRun) return;
              router.push({
                pathname: "/repo/[owner]/[name]/actions/[runId]",
                params: {
                  owner: latestRun.repoOwner,
                  name: latestRun.repoName,
                  runId: String(latestRun.id),
                },
              });
            }}
          />
        }
        ListEmptyComponent={
          <View className="mt-2 items-center rounded-2xl bg-panel p-10">
            <Ionicons name="folder-open-outline" size={30} color={theme.muted} />
            <Text className="mt-2.5 text-sm text-dim">
              No repositories found.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/repo/[owner]/[name]", params: { owner: item.owner.login, name: item.name } })}
            className="flex-row items-center border-b border-line px-1 py-4 active:bg-raised"
          >
            <View className={`mr-3 rounded-lg p-2 ${item.private ? "bg-warning/10" : "bg-brand/10"}`}>
              <Ionicons name={item.private ? "lock-closed" : "git-branch"} size={16} color={item.private ? theme.yellow : theme.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-copy" numberOfLines={1}>{item.name}</Text>
              <Text className="mt-0.5 text-xs text-dim" numberOfLines={1}>
                {item.owner.login}{item.description ? ` - ${item.description}` : ""}
              </Text>
            </View>
            <View className="ml-2 items-end">
              <Text className="text-[11px] text-dim">{timeAgo(item.updated_at)}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.muted} style={{ marginTop: 6 }} />
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

function LatestRunCard({
  run,
  loading,
  onPress,
}: {
  run: LatestRun | null;
  loading: boolean;
  onPress: () => void;
}) {
  if (!loading && !run) return null;

  return (
    <View className="pb-4">
      {run ? (
        (() => {
          const status = statusStyle(run.status, run.conclusion);
          return (
            <Pressable
              onPress={onPress}
              className="rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3.5 active:bg-brand/15"
            >
              <View className="flex-row items-center">
                <View className="mr-2 rounded-lg bg-brand/15 p-1.5">
                  <Ionicons name="pulse" size={16} color={theme.accent} />
                </View>
                <Text className="flex-1 text-[11px] font-bold uppercase tracking-[1.2px] text-brand">
                  Latest workflow run
                </Text>
                <Ionicons name="chevron-forward" size={17} color={theme.accent} />
              </View>
              <Text className="mt-2 text-base font-extrabold text-copy" numberOfLines={1}>
                {run.name ?? "Workflow run"}
              </Text>
              <View className="mt-1 flex-row items-center">
                <Text className="flex-1 text-xs text-dim" numberOfLines={1}>
                  {run.repoOwner}/{run.repoName} · {run.head_branch}
                </Text>
                <Text style={{ color: status.color, fontSize: 12, fontWeight: "800" }}>
                  {status.label}
                </Text>
              </View>
              <Text className="mt-1 text-[11px] text-dim">{timeAgo(run.created_at)}</Text>
            </Pressable>
          );
        })()
      ) : (
        <View className="rounded-2xl border border-line bg-panel px-4 py-4">
          <Text className="text-xs text-dim">Finding your latest workflow run...</Text>
        </View>
      )}
    </View>
  );
}
