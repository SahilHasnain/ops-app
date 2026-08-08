import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { sleep, statusStyle, timeAgo } from "@/lib/format";
import type { Repo, Run, Workflow } from "@/lib/github";
import ErrorView from "@/components/ErrorView";
import Loading from "@/components/Loading";
import RequireAuth from "@/components/RequireAuth";
import Screen from "@/components/Screen";
import ScreenHeader from "@/components/ScreenHeader";

function ActionsScreen() {
  const params = useLocalSearchParams<{ owner: string; name: string }>();
  const owner = params.owner as string;
  const name = params.name as string;
  const router = useRouter();
  const { api } = useAuth();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Workflow | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!api) return;
      if (refresh) setRefreshing(true);
      try {
        setError(null);
        const [wf, rn, repo] = await Promise.all([
          api.listWorkflows(owner, name),
          api.listRuns(owner, name),
          api.getRepo(owner, name) as Promise<Repo>,
        ]);
        setWorkflows(wf.workflows);
        setRuns(rn.workflow_runs);
        setBranch(repo.default_branch);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load workflows.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, owner, name]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!api) return;
    const poll = setInterval(async () => {
      try {
        const next = await api.listRuns(owner, name);
        setRuns(next.workflow_runs);
      } catch {
        // Keep the current list visible if a background refresh fails.
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [api, owner, name]);

  const workflowName = useCallback(
    (id: number) => workflows.find((w) => w.id === id)?.name ?? `Workflow #${id}`,
    [workflows]
  );

  const handleDispatch = useCallback(async () => {
    if (!selected || !api) return;
    setDispatching(true);
    setDispatchError(null);
    try {
      await api.dispatchWorkflow(owner, name, selected.id, branch);
      let newRun: Run | null = null;
      for (let i = 0; i < 8; i++) {
        await sleep(1500);
        const list = await api.listRuns(owner, name);
        const matches = list.workflow_runs.filter((r) => r.workflow_id === selected.id);
        if (matches.length > 0) {
          newRun = matches.reduce((a, b) => (a.run_number > b.run_number ? a : b));
          break;
        }
      }
      if (newRun) {
        setSelected(null);
        setRuns((prev) => {
          const without = prev.filter((r) => r.id !== newRun!.id);
          return [newRun!, ...without];
        });
        router.push({
          pathname: "/repo/[owner]/[name]/actions/[runId]",
          params: { owner, name, runId: String(newRun.id) },
        });
      } else {
        setDispatchError(
          "Workflow dispatched, but the run hasn't appeared yet. Check recent runs."
        );
        setDispatching(false);
      }
    } catch (e) {
      setDispatchError(e instanceof Error ? e.message : "Failed to dispatch workflow.");
      setDispatching(false);
    }
  }, [api, owner, name, selected, branch, router]);

  const header = (
    <ScreenHeader title={`${owner}/${name} · Actions`} onBack={() => router.back()} />
  );

  if (loading) return <Loading />;
  if (error && workflows.length === 0 && runs.length === 0) {
    return (
      <Screen>
        {header}
        <ErrorView message={error} onRetry={() => load()} />
      </Screen>
    );
  }

  type ListItem =
    | { kind: "header-workflows" }
    | { kind: "workflow"; workflow: Workflow }
    | { kind: "header-runs" }
    | { kind: "run"; run: Run };

  const sections: ListItem[] = [
    { kind: "header-workflows" },
    ...workflows.map((w) => ({ kind: "workflow" as const, workflow: w })),
  ];
  if (runs.length > 0) {
    sections.push({ kind: "header-runs" });
    sections.push(...runs.map((r) => ({ kind: "run" as const, run: r })));
  }

  return (
    <Screen>
      {header}
      <View className="px-4 pb-2 pt-5">
        <Text className="text-[22px] font-extrabold text-copy">Automation</Text>
        <Text className="mt-1 text-[13px] text-dim">
          Run checks and keep an eye on your latest deployments.
        </Text>
      </View>
      {error ? (
        <Text className="px-4 py-2 text-[13px] text-danger">
          {error}
        </Text>
      ) : null}
      <FlatList
        data={sections}
        keyExtractor={(item) =>
          item.kind === "workflow"
            ? `wf-${item.workflow.id}`
            : item.kind === "run"
              ? `run-${item.run.id}`
              : `hdr-${item.kind}`
        }
         contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={theme.accent}
          />
        }
        ListEmptyComponent={
           <View className="mt-2 items-center rounded-2xl bg-panel p-10">
             <Ionicons name="pulse-outline" size={30} color={theme.muted} />
             <Text className="mt-2.5 text-sm text-dim">
              No workflows found in this repository.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === "header-workflows") {
            return (
                 <View className="pb-2 pt-3.5">
                <SectionTitle text="Workflows" />
              </View>
            );
          }
          if (item.kind === "header-runs") {
            return (
                 <View className="pb-2 pt-5">
                <SectionTitle text="Recent runs" />
              </View>
            );
          }
          if (item.kind === "workflow") {
            const w = item.workflow;
            const active = w.state === "active";
            return (
              <Pressable
                onPress={() => {
                  setDispatchError(null);
                  setSelected(w);
                }}
                 className="flex-row items-center border-b border-line px-1 py-4 active:bg-raised"
              >
                <View className={`mr-3 rounded-xl p-2 ${active ? "bg-success/15" : "bg-raised"}`}>
                  <Ionicons name="pulse" size={18} color={active ? theme.green : theme.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text className="text-[15px] font-bold text-copy" numberOfLines={1}>
                    {w.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-dim" numberOfLines={1}>
                    {w.path}
                  </Text>
                </View>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    if (active) {
                      setDispatchError(null);
                      setSelected(w);
                    }
                  }}
                  disabled={!active}
                   style={{
                     backgroundColor: active ? theme.accent : theme.surfaceAlt,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    marginLeft: 8,
                    opacity: active ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: theme.white, fontSize: 13, fontWeight: "700" }}>
                    {active ? "Run" : "Disabled"}
                  </Text>
                </Pressable>
              </Pressable>
            );
          }
          const r = item.run;
          const s = statusStyle(r.status, r.conclusion);
          return (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/repo/[owner]/[name]/actions/[runId]",
                  params: { owner, name, runId: String(r.id) },
                })
              }
               className="flex-row items-center border-b border-line px-1 py-4 active:bg-raised"
            >
               <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${s.color}22`, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                 <Ionicons name="ellipse" size={9} color={s.color} />
               </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 14 }} numberOfLines={1}>
                  {workflowName(r.workflow_id)} · #{r.run_number}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>
                  {r.head_branch} · {timeAgo(r.updated_at)}
                </Text>
              </View>
              <Text style={{ color: s.color, fontSize: 13, fontWeight: "600" }}>{s.label}</Text>
            </Pressable>
          );
        }}
      />

      <DispatchModal
        visible={selected !== null}
        workflow={selected}
        branch={branch}
        dispatching={dispatching}
        error={dispatchError}
        onClose={() => {
          if (!dispatching) setSelected(null);
        }}
        onDispatch={handleDispatch}
      />
    </Screen>
  );
}

function SectionTitle({ text }: { text: string }) {
  return (
    <Text
      style={{
        color: theme.muted,
        fontSize: 13,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 4,
      }}
    >
      {text}
    </Text>
  );
}

function DispatchModal({
  visible,
  workflow,
  branch,
  dispatching,
  error,
  onClose,
  onDispatch,
}: {
  visible: boolean;
  workflow: Workflow | null;
  branch: string;
  dispatching: boolean;
  error: string | null;
  onClose: () => void;
  onDispatch: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }}>
        <Pressable style={{ flex: 1 }} onPress={dispatching ? undefined : onClose} />
        <View
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 20,
            paddingBottom: 32,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
            Run workflow
          </Text>
          <Text style={{ color: theme.muted, fontSize: 14, marginTop: 6 }} numberOfLines={1}>
            {workflow?.name}
          </Text>

          <View
            style={{
              marginTop: 16,
              backgroundColor: theme.bg,
              borderColor: theme.border,
              borderWidth: 1,
              borderRadius: 10,
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="git-branch" size={16} color={theme.muted} />
            <Text style={{ color: theme.text, fontSize: 14, flex: 1 }}>{branch}</Text>
          </View>

          {error ? (
            <Text style={{ color: theme.red, fontSize: 13, marginTop: 10 }}>{error}</Text>
          ) : null}

          <Pressable
            onPress={onDispatch}
            disabled={dispatching}
            style={{
              backgroundColor: theme.green,
              paddingVertical: 14,
              borderRadius: 10,
              alignItems: "center",
              marginTop: 16,
              opacity: dispatching ? 0.6 : 1,
            }}
          >
            <Text style={{ color: theme.white, fontSize: 16, fontWeight: "700" }}>
              {dispatching ? "Dispatching…" : "Run workflow"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function ProtectedActions() {
  return (
    <RequireAuth>
      <ActionsScreen />
    </RequireAuth>
  );
}
