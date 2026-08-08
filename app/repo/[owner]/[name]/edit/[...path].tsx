import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { theme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { repoKey, useDrafts } from "@/lib/drafts";
import { buildEditorHtml } from "@/lib/editorHtml";
import ErrorView from "@/components/ErrorView";
import Loading from "@/components/Loading";
import RequireAuth from "@/components/RequireAuth";
import Screen from "@/components/Screen";
import ScreenHeader from "@/components/ScreenHeader";

type LoadedFile = { sha: string; text: string; name: string; size: number };

function EditScreen() {
  const params = useLocalSearchParams<{
    owner: string;
    name: string;
    path: string | string[];
  }>();
  const owner = params.owner as string;
  const name = params.name as string;
  const rawPath = params.path;
  const filePath = Array.isArray(rawPath) ? rawPath.join("/") : (rawPath ?? "");

  const router = useRouter();
  const { api } = useAuth();
  const { drafts, saveDraft } = useDrafts();
  const initialDrafts = useRef(drafts);
  const webRef = useRef<WebView>(null);

  const [file, setFile] = useState<LoadedFile | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<number[]>([]);
  const [matchIdx, setMatchIdx] = useState(0);

  const [webContent, setWebContent] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!api) return;
      try {
        setError(null);
        const fc = await api.getFileContent(owner, name, filePath);
        if (cancelled) return;
         const draft = initialDrafts.current[`${repoKey(owner, name)}:${filePath}`];
         const content = draft?.content ?? fc.text;
         setFile(fc);
         setHtml(buildEditorHtml(fc.name, content));
         setWebContent(content);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load file.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, owner, name, filePath]);

  const saveLocalDraft = useCallback((content: string) => {
    if (!file) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft(repoKey(owner, name), { path: filePath, content, originalSha: file.sha });
      setSaveState("saved");
    }, 650);
  }, [file, filePath, name, owner, saveDraft]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const onWebMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { type?: string; value?: string };
      if (data.type === "change" && typeof data.value === "string") {
        saveLocalDraft(data.value);
        return;
      }
    } catch {
      // ignore malformed messages
    }
  }, [saveLocalDraft]);

  useEffect(() => {
    if (!search.trim() || !file) {
      setMatches([]);
      setMatchIdx(0);
      return;
    }
    const q = search.toLowerCase();
    const lines: number[] = [];
    file.text.split("\n").forEach((line, i) => {
      if (line.toLowerCase().includes(q)) lines.push(i + 1);
    });
    setMatches(lines);
    setMatchIdx(0);
  }, [search, file]);

  const jumpToMatch = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const clamped = ((index % matches.length) + matches.length) % matches.length;
      setMatchIdx(clamped);
      webRef.current?.injectJavaScript(
        `window.postMessage({type:'scrollToLine', line: ${matches[clamped]}}); true;`
      );
    },
    [matches]
  );

  const header = (
    <ScreenHeader
      title={file ? file.name : filePath.split("/").pop() ?? "Edit"}
      onBack={() => router.back()}
      right={
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={() => setSearchOpen((open) => !open)}
            hitSlop={8}
            style={{ padding: 6, marginRight: 4 }}
            accessibilityLabel="Search in file"
          >
            <Ionicons name="search" size={22} color={theme.text} />
          </Pressable>
          <Text style={{ color: saveState === "saving" ? theme.yellow : theme.green, fontSize: 12, fontWeight: "700", marginRight: 8 }}>
            {saveState === "saving" ? "Saving…" : "Saved"}
          </Text>
        </View>
      }
    />
  );

  if (loading) return <Loading />;
  if (error || !file || !html) {
    return (
      <Screen>
        {header}
        <ErrorView message={error ?? "File could not be loaded."} onRetry={() => router.back()} />
      </Screen>
    );
  }

  const searchBar = searchOpen ? (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: theme.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        gap: 8,
      }}
    >
      <Ionicons name="search" size={16} color={theme.muted} />
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search…"
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          flex: 1,
          color: theme.text,
          fontSize: 14,
          paddingVertical: 4,
        }}
      />
      {matches.length > 0 ? (
        <Text style={{ color: theme.muted, fontSize: 12 }}>
          {matchIdx + 1}/{matches.length}
        </Text>
      ) : search.trim() ? (
        <Text style={{ color: theme.red, fontSize: 12 }}>No results</Text>
      ) : null}
      <Pressable
        onPress={() => jumpToMatch(matchIdx - 1)}
        hitSlop={8}
        disabled={matches.length === 0}
        accessibilityLabel="Previous match"
      >
        <Ionicons name="chevron-up" size={20} color={matches.length ? theme.text : theme.muted} />
      </Pressable>
      <Pressable
        onPress={() => jumpToMatch(matchIdx + 1)}
        hitSlop={8}
        disabled={matches.length === 0}
        accessibilityLabel="Next match"
      >
        <Ionicons name="chevron-down" size={20} color={matches.length ? theme.text : theme.muted} />
      </Pressable>
    </View>
  ) : null;

  return (
    <Screen>
      {header}
      {searchBar}
      {Platform.OS === "web" ? (
        <TextInput
          value={webContent}
          onChangeText={(content) => {
            setWebContent(content);
            saveLocalDraft(content);
          }}
          multiline
          editable
          selectTextOnFocus={false}
          style={{
            flex: 1,
            color: theme.text,
            backgroundColor: theme.bg,
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 13,
            lineHeight: 20,
            padding: 8,
            textAlignVertical: "top",
          }}
        />
      ) : (
        <WebView
          ref={webRef}
          source={{ html }}
          onMessage={onWebMessage}
          style={{ flex: 1, backgroundColor: theme.bg }}
          onLoadEnd={() => webRef.current?.injectJavaScript("editor.setOption('readOnly', false); editor.refresh(); true;")}
          keyboardDisplayRequiresUserAction={false}
          onContentProcessDidTerminate={() => webRef.current?.reload()}
        />
      )}

    </Screen>
  );
}

// Retained for the old commit flow's layout code; draft saving now happens automatically.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CommitModal({
  visible,
  fileName,
  branch,
  state,
  message,
  description,
  error,
  sha,
  onChangeMessage,
  onChangeDescription,
  onCommit,
  onClose,
  onViewActions,
  onBackToFiles,
}: {
  visible: boolean;
  fileName: string;
  branch: string;
  state: "idle" | "committing" | "done";
  message: string;
  description: string;
  error: string | null;
  sha: string | null;
  onChangeMessage: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onCommit: () => void;
  onClose: () => void;
  onViewActions: () => void;
  onBackToFiles: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }}
      >
        <Pressable style={{ flex: 1 }} onPress={state === "committing" ? undefined : onClose} />
        <View
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 20,
            paddingBottom: 32,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Save draft</Text>
          <Text style={{ color: theme.muted, fontSize: 13, marginTop: 4 }} numberOfLines={1}>
            {fileName} → {branch}
          </Text>

          {state === "done" ? (
            <View style={{ marginTop: 20, gap: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "rgba(63,185,80,0.12)",
                  borderColor: theme.green,
                  borderWidth: 1,
                  borderRadius: 10,
                  padding: 14,
                  gap: 10,
                }}
              >
                <Ionicons name="checkmark-circle" size={22} color={theme.green} />
                <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>
                   Saved locally. You can add more files before committing.
                </Text>
              </View>
               <PrimaryButton label="Back to files" onPress={onViewActions} color={theme.accent} />
               <PrimaryButton label="Keep editing" onPress={onClose} color={theme.surfaceAlt} />
            </View>
          ) : (
            <>
               <Text style={labelStyle}>Draft note (optional)</Text>
              <TextInput
                value={message}
                onChangeText={onChangeMessage}
                 placeholder="What are you changing?"
                placeholderTextColor={theme.muted}
                style={inputStyle}
              />
               <Text style={labelStyle}>More context (optional)</Text>
              <TextInput
                value={description}
                onChangeText={onChangeDescription}
                placeholder="What changed and why"
                placeholderTextColor={theme.muted}
                multiline
                style={[inputStyle, { minHeight: 72, textAlignVertical: "top" }]}
              />
              {error ? (
                <Text style={{ color: theme.red, fontSize: 13, marginTop: 10 }}>{error}</Text>
              ) : null}
              <Pressable
                onPress={onCommit}
                disabled={state === "committing"}
                style={{
                  backgroundColor: theme.green,
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: "center",
                  marginTop: 16,
                  opacity: state === "committing" ? 0.6 : 1,
                }}
              >
                <Text style={{ color: theme.white, fontSize: 16, fontWeight: "700" }}>
                   {state === "committing" ? "Saving…" : "Save draft"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const labelStyle = {
  color: theme.muted,
  fontSize: 13,
  marginTop: 14,
  marginBottom: 6,
};

const inputStyle = {
  backgroundColor: theme.bg,
  borderColor: theme.border,
  borderWidth: 1,
  borderRadius: 10,
  color: theme.text,
  fontSize: 15,
  paddingHorizontal: 12,
  paddingVertical: 10,
} as const;

function PrimaryButton({
  label,
  onPress,
  color,
}: {
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: color,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: "center",
      }}
    >
      <Text style={{ color: theme.white, fontSize: 16, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export default function ProtectedEdit() {
  return (
    <RequireAuth>
      <EditScreen />
    </RequireAuth>
  );
}
