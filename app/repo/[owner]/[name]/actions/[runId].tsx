import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme, mono } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import { parseLogSections, statusStyle } from "@/lib/format";
import type { LogLine } from "@/lib/format";
import type { Job, JobStep, Run } from "@/lib/github";
import ErrorView from "@/components/ErrorView";
import Loading from "@/components/Loading";
import RequireAuth from "@/components/RequireAuth";
import Screen from "@/components/Screen";
import ScreenHeader from "@/components/ScreenHeader";

const POLL_MS = 3000;

function LogsScreen() {
  const params = useLocalSearchParams<{ owner: string; name: string; runId: string }>();
  const owner = params.owner as string;
  const name = params.name as string;
  const runId = Number(params.runId);
  const router = useRouter();
  const { api } = useAuth();

  const [run, setRun] = useState<Run | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [logErrors, setLogErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollViewHeightRef = useRef(0);
  const jobOffsetsRef = useRef<Record<string, number>>({});
  const logOffsetsRef = useRef<Record<string, number>>({});
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const sectionHeightsRef = useRef<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const autoExpandedRef = useRef<Set<string>>(new Set());
  const expandedRef = useRef<Set<string>>(new Set());
  const scrollYRef = useRef(0);
  const sectionKeysRef = useRef<string[]>([]);
  const [jump, setJump] = useState<{ key: string; atEnd: boolean } | null>(null);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  const toggleSection = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      setJump(computeJump(scrollYRef.current, next));
      return next;
    });
  };

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!api) return;
      try {
        setError(null);
        const [r, j] = await Promise.all([
          api.getRun(owner, name, runId),
          api.listJobs(owner, name, runId),
        ]);
        if (!alive) return;
         setRun(r);
         setJobs(j.jobs);
         setLastSynced(Date.now());

        const fetchLogs = j.jobs.filter(
          (job) => job.status === "in_progress" || job.status === "completed"
        );
        for (const job of fetchLogs) {
          try {
            const text = await api.getJobLogs(owner, name, job.id);
            if (!alive) return;
            setLogs((prev) => ({ ...prev, [String(job.id)]: text }));
            setLogErrors((prev) => {
              const next = { ...prev };
              delete next[String(job.id)];
              return next;
            });
          } catch (e) {
            if (!alive) return;
            setLogErrors((prev) => ({
              ...prev,
              [String(job.id)]: e instanceof Error ? e.message : "Logs are unavailable.",
            }));
          }
        }

        if (r.status === "completed" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load run.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    tick();
    pollRef.current = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [api, owner, name, runId]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // GitHub's flattened log groups don't map 1:1 to API steps, so we render the
  // log by its own group markers. Auto-expand any section that carries a
  // failure so the actual error is visible without hunting for it.
  useEffect(() => {
    for (const job of jobs) {
      const jobLogs = logs[String(job.id)];
      if (!jobLogs) continue;
      parseLogSections(jobLogs).forEach((section, sectionIdx) => {
        if (!section.failed) return;
        const key = `${job.id}:section:${sectionIdx}`;
        if (autoExpandedRef.current.has(key)) return;
        autoExpandedRef.current.add(key);
        setExpanded((prev) => {
          if (prev.has(key)) return prev;
          const next = new Set(prev);
          next.add(key);
          return next;
        });
      });
    }
  }, [jobs, logs]);

  useEffect(() => {
    const keys: string[] = [];
    for (const job of jobs) {
      const jobLogs = logs[String(job.id)];
      if (!jobLogs) continue;
      parseLogSections(jobLogs).forEach((_, idx) => {
        keys.push(`${job.id}:section:${idx}`);
      });
    }
    sectionKeysRef.current = keys;
  }, [jobs, logs]);

  const s = run ? statusStyle(run.status, run.conclusion) : null;
  const isLive = run ? run.status !== "completed" : false;
  const elapsed = run ? formatDuration(run.created_at, isLive ? new Date(clock).toISOString() : run.updated_at) : "—";

  const scrollToSection = (key: string | null) => {
    if (!key) return;
    const y = sectionOffsetsRef.current[key];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  const scrollToSectionEnd = (key: string) => {
    const y = sectionOffsetsRef.current[key];
    const height = sectionHeightsRef.current[key];
    if (y === undefined || height === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y + height - scrollViewHeightRef.current + 20), animated: true });
  };

  const scrollToSectionStart = (key: string) => {
    const y = sectionOffsetsRef.current[key];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  const computeJump = (scrollY: number, expandedSet: Set<string>): { key: string; atEnd: boolean } | null => {
    const viewHeight = scrollViewHeightRef.current;
    if (!viewHeight) return null;
    const centerY = scrollY + viewHeight / 2;
    for (const key of sectionKeysRef.current) {
      const y = sectionOffsetsRef.current[key];
      const h = sectionHeightsRef.current[key];
      if (y === undefined || h === undefined) continue;
      if (centerY >= y && centerY < y + h) {
        if (expandedSet.has(key) && h > viewHeight) {
          const atEnd = scrollY + viewHeight >= y + h - 60;
          return { key, atEnd };
        }
        return null;
      }
    }
    return null;
  };

  const updateActiveJump = (scrollY: number) => {
    const next = computeJump(scrollY, expandedRef.current);
    setJump((prev) => {
      if (prev && next && prev.key === next.key && prev.atEnd === next.atEnd) return prev;
      return next;
    });
  };

  const header = (
    <ScreenHeader
      title={run ? `Run #${run.run_number}` : "Run"}
      onBack={() => router.back()}
      right={
        run ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.surfaceAlt,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
              marginRight: 8,
              gap: 6,
            }}
          >
            {run.status !== "completed" ? (
              <ActivityIndicator size="small" color={s?.color ?? theme.yellow} />
            ) : (
              <Ionicons name="ellipse" size={8} color={s?.color} />
            )}
            <Text style={{ color: s?.color ?? theme.text, fontSize: 13, fontWeight: "700" }}>
              {s?.label}
            </Text>
          </View>
        ) : null
      }
    />
  );

  if (loading) return <Loading />;
  if (error && !run) {
    return (
      <Screen>
        {header}
        <ErrorView message={error} onRetry={() => setLoading(true)} />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          scrollYRef.current = y;
          updateActiveJump(y);
        }}
        onLayout={(e) => {
          scrollViewHeightRef.current = e.nativeEvent.layout.height;
          updateActiveJump(scrollYRef.current);
        }}
      >
        <View style={{ margin: 16, padding: 16, gap: 5, backgroundColor: theme.surface, borderColor: isLive ? `${s?.color ?? theme.yellow}66` : theme.border, borderWidth: 1, borderRadius: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s?.color ?? theme.muted, marginRight: 8 }} />
            <Text style={{ color: s?.color ?? theme.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.7 }}>
              {isLive ? "LIVE RUN" : "RUN COMPLETE"}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginLeft: "auto" }}>
              {lastSynced ? `Synced ${timeSince(lastSynced)}` : "Connecting…"}
            </Text>
          </View>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: "800" }}>
            {run?.name ?? `Run #${run?.run_number ?? ""}`}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 13 }}>
            {owner}/{name} · branch {run?.head_branch ?? "—"}
          </Text>
          <View style={{ flexDirection: "row", marginTop: 12, gap: 18 }}>
            <Metric label="Duration" value={elapsed} />
            <Metric label="Jobs" value={`${jobs.filter((job) => job.status === "completed").length}/${jobs.length}`} />
          </View>
          {run && run.status !== "completed" ? (
          <Text style={{ color: theme.yellow, fontSize: 13, marginTop: 8, backgroundColor: "rgba(210,153,34,0.12)", padding: 9, borderRadius: 8 }}>
              Live logs update automatically while the run is in progress.
            </Text>
          ) : null}
        </View>

        {jobs.map((job) => {
          const jobStatus = statusStyle(job.status, job.conclusion);
          const jobLogs = logs[String(job.id)];
          const logError = logErrors[String(job.id)];
          return (
            <View
              key={job.id}
              onLayout={(event) => {
                jobOffsetsRef.current[String(job.id)] = event.nativeEvent.layout.y;
              }}
              style={{
                 marginHorizontal: 16,
                 marginBottom: 12,
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 12,
                  gap: 8,
                }}
              >
                <Ionicons name="ellipse" size={10} color={jobStatus.color} />
                <Text style={{ flex: 1, color: theme.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
                  {job.name}
                </Text>
                <Text style={{ color: jobStatus.color, fontSize: 13, fontWeight: "600" }}>
                  {jobStatus.label}
                </Text>
              </View>
              {jobLogs ? (
                (() => {
                  const sections = parseLogSections(jobLogs);
                  const steps = job.steps && job.steps.length > 0 ? job.steps : null;
                  return (
                    <View
                      onLayout={(event) => {
                        const jobY = jobOffsetsRef.current[String(job.id)] ?? 0;
                        logOffsetsRef.current[String(job.id)] = jobY + event.nativeEvent.layout.y;
                      }}
                      style={{ padding: 10, gap: 8, backgroundColor: theme.bg }}
                    >
                      {steps ? (
                        <StepsOverview
                          steps={steps}
                          firstSectionKey={sections.length > 0 ? `${job.id}:section:0` : null}
                          firstFailedSectionKey={
                            (() => {
                              const index = sections.findIndex((section) => section.failed);
                              return index >= 0 ? `${job.id}:section:${index}` : null;
                            })()
                          }
                          onStepPress={scrollToSection}
                        />
                      ) : null}
                      {sections.length === 0 ? (
                        <View style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
                          <Text style={{ color: theme.muted, fontSize: 12 }}>
                            {job.status === "completed"
                              ? "No output."
                              : "Waiting for output…"}
                          </Text>
                        </View>
                      ) : (
                        sections.map((section, sectionIdx) => {
                          const key = `${job.id}:section:${sectionIdx}`;
                          const errorCount = section.failed
                            ? section.lines.filter((l) => l.kind === "error").length
                            : 0;
                          return (
                            <StepCard
                              key={key}
                              title={section.failed ? `Failure details · ${section.title}` : section.title}
                              visual={sectionVisual(section.failed)}
                              errorCount={errorCount}
                              expanded={expanded.has(key)}
                              onToggle={() => toggleSection(key)}
                              onLayout={(event) => {
                                const logY = logOffsetsRef.current[String(job.id)] ?? 0;
                                sectionOffsetsRef.current[key] = logY + event.nativeEvent.layout.y;
                                sectionHeightsRef.current[key] = event.nativeEvent.layout.height;
                                updateActiveJump(scrollYRef.current);
                              }}
                              content={<LogLines lines={section.lines} />}
                            />
                          );
                        })
                      )}
                    </View>
                  );
                })()
              ) : logError ? (
                <View style={{ padding: 12, backgroundColor: theme.bg }}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{logError}</Text>
                </View>
              ) : job.status === "queued" || job.status === "waiting" ? (
                <View style={{ padding: 12, backgroundColor: theme.bg }}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>Waiting for a runner…</Text>
                </View>
              ) : null}
            </View>
          );
        })}

        {jobs.length === 0 ? (
          <View style={{ padding: 32, alignItems: "center", backgroundColor: theme.surface, borderRadius: 16, marginHorizontal: 16 }}>
            <Ionicons name="hourglass-outline" size={28} color={theme.muted} />
            <Text style={{ color: theme.muted, fontSize: 14, marginTop: 10 }}>No jobs yet.</Text>
          </View>
        ) : null}
      </ScrollView>

      {jump && expanded.has(jump.key) ? (
        <Pressable
          onPress={() =>
            jump.atEnd ? scrollToSectionStart(jump.key) : scrollToSectionEnd(jump.key)
          }
          style={{
            position: "absolute",
            right: 14,
            bottom: 100,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
            shadowColor: "#000",
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 5,
          }}
        >
          <Ionicons
            name={jump.atEnd ? "arrow-up-outline" : "arrow-down-outline"}
            size={15}
            color={theme.accent}
          />
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>
            {jump.atEnd ? "Jump to start" : "Jump to end"}
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ color: theme.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", marginTop: 3 }}>{value}</Text>
    </View>
  );
}

type StepVisual = {
  color: string;
  label: string;
  failed: boolean;
  running: boolean;
  skipped: boolean;
  queued: boolean;
};

function stepStatus(status: string, conclusion: string | null): StepVisual {
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return { color: theme.green, label: "Passed", failed: false, running: false, skipped: false, queued: false };
      case "failure":
      case "timed_out":
        return { color: theme.red, label: "Failed", failed: true, running: false, skipped: false, queued: false };
      case "cancelled":
        return { color: theme.muted, label: "Cancelled", failed: false, running: false, skipped: true, queued: false };
      case "skipped":
        return { color: theme.muted, label: "Skipped", failed: false, running: false, skipped: true, queued: false };
      default:
        return { color: theme.muted, label: conclusion ?? "Completed", failed: false, running: false, skipped: false, queued: false };
    }
  }
  if (status === "in_progress") {
    return { color: theme.yellow, label: "Running", failed: false, running: true, skipped: false, queued: false };
  }
  return { color: theme.muted, label: "Queued", failed: false, running: false, skipped: false, queued: true };
}

function sectionVisual(failed: boolean): StepVisual {
  return failed
    ? { color: theme.red, label: "Failed", failed: true, running: false, skipped: false, queued: false }
    : { color: theme.green, label: "Passed", failed: false, running: false, skipped: false, queued: false };
}

function StepsOverview({
  steps,
  firstSectionKey,
  firstFailedSectionKey,
  onStepPress,
}: {
  steps: JobStep[];
  firstSectionKey: string | null;
  firstFailedSectionKey: string | null;
  onStepPress: (key: string | null) => void;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        gap: 7,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: theme.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Workflow steps
        </Text>
        <Text style={{ color: theme.muted, fontSize: 11 }}>Tap to view logs</Text>
      </View>
      {steps.map((step, idx) => {
        const visual = stepStatus(step.status, step.conclusion);
        const targetKey = visual.failed ? firstFailedSectionKey : firstSectionKey;
        return (
          <Pressable
            key={`${step.name}:${idx}`}
            disabled={!targetKey}
            onPress={() => onStepPress(targetKey)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 5,
              paddingHorizontal: 6,
              borderRadius: 7,
              backgroundColor: visual.failed ? "rgba(248,81,73,0.10)" : "transparent",
              opacity: targetKey ? 1 : 0.65,
            }}
          >
            {visual.failed ? (
              <Ionicons name="close-circle" size={16} color={visual.color} />
            ) : visual.running ? (
              <ActivityIndicator size="small" color={visual.color} />
            ) : (
              <Ionicons name="ellipse" size={8} color={visual.color} />
            )}
            <Text style={{ flex: 1, color: theme.text, fontSize: 13 }} numberOfLines={1}>
              {step.name}
            </Text>
            <Text style={{ color: visual.color, fontSize: 12, fontWeight: "600" }}>
              {visual.label}
            </Text>
            {targetKey ? <Ionicons name="chevron-forward" size={14} color={theme.muted} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function StepCard({
  title,
  visual,
  errorCount,
  expanded,
  onToggle,
  onLayout,
  content,
}: {
  title: string;
  visual: StepVisual;
  errorCount: number;
  expanded: boolean;
  onToggle: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  content: ReactNode;
}) {
  return (
    <View
      onLayout={onLayout}
      style={{
        backgroundColor: theme.surface,
        borderColor: visual.failed ? theme.red : theme.border,
        borderWidth: 1,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          gap: 8,
          backgroundColor: visual.failed ? "rgba(248,81,73,0.08)" : "transparent",
        }}
      >
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-forward"}
          size={16}
          color={theme.muted}
        />
        {visual.running ? (
          <ActivityIndicator size="small" color={theme.yellow} />
        ) : visual.failed ? (
          <Ionicons name="close-circle" size={16} color={theme.red} />
        ) : visual.skipped || visual.queued ? (
          <Ionicons name="remove-circle-outline" size={16} color={theme.muted} />
        ) : (
          <Ionicons name="checkmark-circle" size={16} color={visual.color} />
        )}
        <Text
          style={{
            flex: 1,
            color: theme.text,
            fontSize: 14,
            fontWeight: "700",
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {visual.failed ? (
          <View
            style={{
              backgroundColor: "rgba(248,81,73,0.15)",
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: theme.red, fontSize: 11, fontWeight: "800" }}>
              FAILED{errorCount ? ` ×${errorCount}` : ""}
            </Text>
          </View>
        ) : visual.running ? (
          <Text style={{ color: theme.yellow, fontSize: 11, fontWeight: "800" }}>RUNNING</Text>
        ) : visual.queued ? (
          <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "800" }}>QUEUED</Text>
        ) : visual.skipped ? (
          <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "800" }}>
            {visual.label.toUpperCase()}
          </Text>
        ) : null}
      </Pressable>
      {expanded ? content : null}
    </View>
  );
}

function LogLines({ lines }: { lines: LogLine[] }) {
  return (
    <View style={{ backgroundColor: theme.bg, paddingVertical: 8 }}>
      {lines.map((line, idx) => {
        const color =
          line.kind === "error"
            ? theme.red
            : line.kind === "warning"
              ? theme.yellow
              : line.kind === "notice"
                ? theme.accent
                : line.kind === "command"
                  ? theme.muted
                  : theme.text;
        return (
          <Text
            key={idx}
            selectable
            style={{
              color,
              fontSize: 12,
              lineHeight: 18,
              paddingHorizontal: 12,
              fontFamily: mono.fontFamily,
            }}
          >
            {line.text}
          </Text>
        );
      })}
    </View>
  );
}

function formatDuration(start: string, end: string): string {
  const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function timeSince(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  return seconds < 2 ? "now" : `${seconds}s ago`;
}

export default function ProtectedLogs() {
  return (
    <RequireAuth>
      <LogsScreen />
    </RequireAuth>
  );
}
