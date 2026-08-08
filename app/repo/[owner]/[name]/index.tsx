import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { repoKey, useDrafts } from "@/lib/drafts";
import type { ContentsEntry, TreeEntry } from "@/lib/github";
import ErrorView from "@/components/ErrorView";
import Loading from "@/components/Loading";
import RequireAuth from "@/components/RequireAuth";
import Screen from "@/components/Screen";
import ScreenHeader from "@/components/ScreenHeader";

function sortEntries(entries: ContentsEntry[]): ContentsEntry[] {
  return [...entries].sort((a, b) => {
    const aDir = a.type === "dir" ? 0 : 1;
    const bDir = b.type === "dir" ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name.localeCompare(b.name);
  });
}

function RepoFilesScreen() {
  const params = useLocalSearchParams<{ owner: string; name: string }>();
  const owner = params.owner as string;
  const name = params.name as string;
  const router = useRouter();
  const { api } = useAuth();
  const { drafts, clearDrafts } = useDrafts();

  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<ContentsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitError, setCommitError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tree, setTree] = useState<TreeEntry[] | null>(null);
  const [treeTruncated, setTreeTruncated] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const load = useCallback(
    async (target: string, refresh = false) => {
      if (!api) return;
      if (refresh) setRefreshing(true);
      try {
        setError(null);
        const res = await api.getContents(owner, name, target);
        if (res.kind === "dir") {
          setEntries(sortEntries(res.entries));
        } else {
          setEntries([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load files.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, owner, name]
  );

  useEffect(() => {
    setLoading(true);
    load(path);
  }, [path, load]);

  const crumbs = useMemo(() => path.split("/").filter(Boolean), [path]);
  const draftList = useMemo(
    () => Object.entries(drafts)
      .filter(([key]) => key.startsWith(`${repoKey(owner, name)}:`))
      .map(([, draft]) => draft),
    [drafts, owner, name]
  );

  const commitDrafts = async () => {
    if (!api || draftList.length === 0) return;
    const message = commitMessage.trim();
    if (!message) {
      setCommitError("Add a commit message before committing.");
      return;
    }
    setCommitting(true);
    setCommitError(null);
    try {
      const repo = await api.getRepo(owner, name);
      const ref = await api.getRef(owner, name, repo.default_branch);
      const base = await api.getCommit(owner, name, ref.object.sha);
      const blobs = await Promise.all(draftList.map(async (draft) => ({
        path: draft.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: (await api.createBlob(owner, name, draft.content)).sha,
      })));
      const tree = await api.createTree(owner, name, base.tree.sha, blobs);
      const commit = await api.createCommit(owner, name, message, tree.sha, [ref.object.sha]);
      await api.updateRef(owner, name, repo.default_branch, commit.sha);
      clearDrafts(repoKey(owner, name));
      setCommitOpen(false);
      setCommitMessage("");
      await load(path, true);
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "Commit failed.");
    } finally {
      setCommitting(false);
    }
  };

  const openFile = (file: ContentsEntry) => {
    const full = path ? `${path}/${file.name}` : file.name;
    router.push({
      pathname: "/repo/[owner]/[name]/edit/[...path]",
      params: { owner, name, path: full.split("/") },
    });
  };

  const ensureTree = useCallback(async () => {
    if (!api || tree) return;
    setTreeLoading(true);
    try {
      const full = await api.getFullTree(owner, name);
      setTree(full.tree);
      setTreeTruncated(full.truncated === true);
    } catch (e) {
      setTreeError(e instanceof Error ? e.message : "Failed to load file tree.");
    } finally {
      setTreeLoading(false);
    }
  }, [api, owner, name, tree]);

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (!open) {
        ensureTree();
      } else {
        setSearchQuery("");
      }
      return !open;
    });
  }, [ensureTree]);

  const searchItems = useMemo((): ContentsEntry[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !tree) return [];
    return (tree as TreeEntry[])
      .filter((e) => e.type !== "commit" && e.path.toLowerCase().includes(q))
      .sort((a, b) => {
        const aName = a.path.split("/").pop()?.toLowerCase().includes(q) ? 0 : 1;
        const bName = b.path.split("/").pop()?.toLowerCase().includes(q) ? 0 : 1;
        if (aName !== bName) return aName - bName;
        const aDir = a.type === "tree" ? 0 : 1;
        const bDir = b.type === "tree" ? 0 : 1;
        if (aDir !== bDir) return aDir - bDir;
        return a.path.localeCompare(b.path);
      })
      .slice(0, 100)
      .map((e) => ({
        type: e.type === "tree" ? ("dir" as const) : ("file" as const),
        name: e.path.split("/").pop() ?? e.path,
        path: e.path,
        sha: e.sha,
        size: e.size,
      }));
  }, [tree, searchQuery]);

  const onPressItem = (item: ContentsEntry) => {
    if (searchOpen) {
      if (item.type === "dir") {
        setPath(item.path);
        setSearchOpen(false);
        setSearchQuery("");
      } else {
        router.push({
          pathname: "/repo/[owner]/[name]/edit/[...path]",
          params: { owner, name, path: item.path.split("/") },
        });
      }
    } else if (item.type === "dir") {
      setPath(item.path);
    } else {
      openFile(item);
    }
  };

  const header = (
    <>
      <ScreenHeader
        title={`${owner}/${name}`}
        onBack={() => router.back()}
        right={
          <>
            <Pressable
              onPress={toggleSearch}
              hitSlop={8}
              style={{ padding: 6 }}
              accessibilityLabel={searchOpen ? "Close search" : "Search files"}
            >
              <Ionicons name={searchOpen ? "close" : "search"} size={22} color={theme.accent} />
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/repo/[owner]/[name]/actions",
                  params: { owner, name },
                })
              }
              hitSlop={8}
              style={{ padding: 6, marginLeft: 8, marginRight: 4 }}
              accessibilityLabel="Actions"
            >
              <Ionicons name="play-circle-outline" size={24} color={theme.accent} />
            </Pressable>
          </>
        }
      />
      {searchOpen ? (
        <View className="flex-row items-center border-b border-line bg-panel px-4 py-2">
          <Ionicons name="search" size={16} color={theme.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search every file…"
            placeholderTextColor={theme.muted}
            className="ml-2 flex-1 py-1 text-[15px] text-copy"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {treeLoading ? <ActivityIndicator size="small" color={theme.accent} /> : null}
        </View>
      ) : (
        <View className="flex-row flex-wrap items-center border-b border-line px-4 py-2.5">
          <BreadcrumbChip label="root" active={path === ""} onPress={() => setPath("")} />
          {crumbs.map((crumb, index) => {
            const target = crumbs.slice(0, index + 1).join("/");
            return (
              <BreadcrumbChip
                key={target}
                label={crumb}
                active={index === crumbs.length - 1}
                onPress={() => setPath(target)}
              />
            );
          })}
        </View>
      )}
      {searchOpen && treeTruncated ? (
        <View className="border-b border-warning/30 bg-warning/10 px-4 py-2">
          <Text className="text-xs text-warning">
            Large repo — tree was truncated, some results may be missing.
          </Text>
        </View>
      ) : null}
    </>
  );

  if (loading) return <Loading />;
  if (error && entries.length === 0) {
    return (
      <Screen>
        {header}
        <ErrorView message={error} onRetry={() => load(path)} />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      {draftList.length > 0 ? (
        <View className="mx-4 mt-3 rounded-2xl border border-brand/40 bg-brand/10 p-3.5">
          <View className="flex-row items-center">
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-copy">{draftList.length} unsaved file{draftList.length === 1 ? "" : "s"}</Text>
              <Text className="mt-1 text-xs text-dim">Review your drafts and create one commit when ready.</Text>
            </View>
            <Pressable onPress={() => { setCommitError(null); setCommitOpen(true); }} className="rounded-xl bg-brand px-3.5 py-2.5">
              <Text className="text-[13px] font-bold text-white">Commit all</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <FlatList
        data={searchOpen ? searchItems : entries}
        keyExtractor={(item) => item.path}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(path, true)}
            tintColor={theme.accent}
          />
        }
        ListEmptyComponent={
          searchOpen ? (
            <View className="mt-2 items-center rounded-2xl bg-panel p-9">
              {treeLoading ? (
                <ActivityIndicator color={theme.accent} />
              ) : treeError ? (
                <>
                  <Ionicons name="alert-circle-outline" size={30} color={theme.muted} />
                  <Text className="mt-2.5 text-center text-sm text-dim">{treeError}</Text>
                  <Pressable
                    onPress={() => {
                      setTree(null);
                      setTreeError(null);
                      ensureTree();
                    }}
                    className="mt-4 rounded-xl bg-brand px-4 py-2.5"
                  >
                    <Text className="text-[13px] font-bold text-white">Retry</Text>
                  </Pressable>
                </>
              ) : !searchQuery.trim() ? (
                <>
                  <Ionicons name="search" size={30} color={theme.muted} />
                  <Text className="mt-2.5 text-center text-sm text-dim">
                    Search every file in {owner}/{name}, at any depth.
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="file-tray-outline" size={30} color={theme.muted} />
                  <Text className="mt-2.5 text-sm text-dim">
                    No files match &quot;{searchQuery}&quot;.
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View className="mt-2 items-center rounded-2xl bg-panel p-9">
              <Ionicons name="file-tray-outline" size={30} color={theme.muted} />
              <Text className="mt-2.5 text-sm text-dim">This folder is empty.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const isDir = item.type === "dir";
          const fullPath = path ? `${path}/${item.path}` : item.path;
          const hasDraft = draftList.some((draft) =>
            draft.path === (searchOpen ? item.path : fullPath)
          );
          return (
            <Pressable
              onPress={() => onPressItem(item)}
              className="flex-row items-center border-b border-line px-1 py-4 active:bg-raised"
            >
              <View className={`mr-3 rounded-lg p-2 ${isDir ? "bg-warning/10" : "bg-raised"}`}>
                <Ionicons name={isDir ? "folder" : "document-text"} size={18} color={isDir ? theme.yellow : theme.muted} />
              </View>
              <View className="flex-1">
                <Text className={`text-[15px] ${isDir ? "font-bold" : "font-medium"} text-copy`} numberOfLines={1}>
                  {item.name}
                </Text>
                {searchOpen ? (
                  <Text className="mt-0.5 text-xs text-dim" numberOfLines={1}>
                    {item.path}
                  </Text>
                ) : null}
              </View>
              {hasDraft ? (
                <Text className="mr-2 rounded-md bg-brand/15 px-1.5 py-1 text-[10px] font-bold text-brand">DRAFT</Text>
              ) : null}
              {!searchOpen && item.type === "file" && item.size !== undefined ? (
                <Text className="text-xs text-dim">{formatSize(item.size)}</Text>
              ) : null}
            </Pressable>
          );
        }}
      />
      <Modal visible={commitOpen} transparent animationType="slide" onRequestClose={() => !committing && setCommitOpen(false)}>
        <View className="flex-1 justify-end bg-black/60">
          <Pressable className="flex-1" onPress={committing ? undefined : () => setCommitOpen(false)} />
          <View className="rounded-t-3xl bg-panel px-5 pb-8 pt-5">
            <Text className="text-xl font-extrabold text-copy">Commit your changes</Text>
            <Text className="mt-1 text-[13px] text-dim">{draftList.length} file{draftList.length === 1 ? "" : "s"} to {owner}/{name}</Text>
            <TextInput
              value={commitMessage}
              onChangeText={setCommitMessage}
              placeholder="Describe what changed"
              placeholderTextColor={theme.muted}
              className="mt-5 rounded-xl border border-line bg-ink px-3 py-3.5 text-[15px] text-copy"
              autoFocus
            />
            {commitError ? <Text className="mt-2 text-[13px] text-danger">{commitError}</Text> : null}
            <Pressable onPress={commitDrafts} disabled={committing} className="mt-4 items-center rounded-xl bg-success py-3.5 active:opacity-80">
              <Text className="text-base font-bold text-white">{committing ? "Committing..." : "Create one commit"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function BreadcrumbChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? theme.surfaceAlt : "transparent",
        borderColor: active ? theme.border : "transparent",
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginRight: 4,
        marginBottom: 2,
      }}
    >
      <Text style={{ color: active ? theme.text : theme.muted, fontSize: 13 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProtectedRepoFiles() {
  return (
    <RequireAuth>
      <RepoFilesScreen />
    </RequireAuth>
  );
}
