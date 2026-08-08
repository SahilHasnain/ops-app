import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import type { Repo } from "@/lib/github";
import ErrorView from "@/components/ErrorView";
import Loading from "@/components/Loading";
import Screen from "@/components/Screen";
import { timeAgo } from "@/lib/format";

export default function SearchTab() {
  const { api, booting, status, token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }, [])
  );

  const load = useCallback(async (refresh = false) => {
    if (!api) return;
    if (refresh) setRefreshing(true);
    try {
      setError(null);
      setRepos(await api.listRepos());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load repositories.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return [];
    return repos.filter((repo) =>
      [repo.name, repo.full_name, repo.description ?? ""].some((value) =>
        value.toLowerCase().includes(q)
      )
    );
  }, [deferredQuery, repos]);

  if (booting) return <Loading />;
  if (status !== "signed-in" || !token) return <Redirect href="/" />;
  if (loading) return <Loading label="Loading search" />;
  if (error && repos.length === 0) return <ErrorView message={error} onRetry={() => load()} />;

  const hasQuery = deferredQuery.trim().length > 0;

  return (
    <Screen edges={[]}>
      <View
        className="border-b border-line bg-panel px-4 pb-3"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="min-h-[48px] flex-row items-center rounded-2xl border border-line bg-ink px-3">
          <Ionicons name="search" size={19} color={theme.accent} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search repositories..."
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            autoFocus
            className="flex-1 px-2.5 py-2.5 text-[16px] text-copy"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} className="rounded-full bg-raised p-1">
              <Ionicons name="close" size={15} color={theme.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.accent} />}
        ListHeaderComponent={
          <View className="mb-3">
            <Text className="text-[22px] font-extrabold text-copy">Search</Text>
            <Text className="mt-1 text-[13px] text-dim">
              Find a repository in your GitHub workspace.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center rounded-2xl bg-panel p-10">
            <Ionicons name={hasQuery ? "search-outline" : "compass-outline"} size={32} color={theme.muted} />
            <Text className="mt-3 text-center text-sm text-dim">
              {hasQuery ? "No repositories match your search." : "Start typing to search your repositories."}
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
                {item.full_name}{item.description ? ` · ${item.description}` : ""}
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
