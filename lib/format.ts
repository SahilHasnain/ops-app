import { theme } from "@/constants/theme";

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function statusStyle(
  status: string,
  conclusion: string | null
): { color: string; label: string } {
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return { color: theme.green, label: "Success" };
      case "failure":
      case "cancelled":
      case "timed_out":
      case "action_required":
        return { color: theme.red, label: "Failed" };
      case "neutral":
      case "skipped":
        return { color: theme.muted, label: "Skipped" };
      case "stale":
        return { color: theme.muted, label: "Stale" };
      case "startup_failure":
        return { color: theme.red, label: "Startup failure" };
      default:
        return { color: theme.muted, label: conclusion ?? "Completed" };
    }
  }
  return { color: theme.yellow, label: status.replace(/_/g, " ") };
}

export type LogSection = {
  title: string;
  kind: "group" | "output";
  failed: boolean;
  lines: LogLine[];
};

export function parseLogSections(raw: string): LogSection[] {
  const lines = parseLogLines(raw);
  const sections: LogSection[] = [];
  let current: LogSection | null = null;

  const start = (title: string, kind: "group" | "output") => {
    if (current) sections.push(current);
    current = { title, kind, failed: false, lines: [] };
  };

  for (const line of lines) {
    if (line.kind === "empty") continue;
    if (line.kind === "group") {
      start(line.text, "group");
      continue;
    }
    if (!current) {
      start("Other output", "output");
    }
    const section = current as unknown as LogSection;
    section.lines.push(line);
    if (line.kind === "error") section.failed = true;
  }
  if (current) sections.push(current);
  return sections;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type LogLine = {
  text: string;
  kind: "group" | "command" | "error" | "warning" | "notice" | "normal" | "empty";
};

function stripTimestamp(line: string): string {
  return line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*/, "");
}

export function parseLogLines(raw: string): LogLine[] {
  const lines = raw.split("\n");
  const out: LogLine[] = [];
  for (const line of lines) {
    const stripped = stripTimestamp(line);
    if (stripped.startsWith("##[group]")) {
      out.push({ text: stripped.slice("##[group]".length).trim(), kind: "group" });
      continue;
    }
    if (stripped.startsWith("##[endgroup]")) {
      out.push({ text: "", kind: "empty" });
      continue;
    }
    if (stripped.startsWith("##[command]")) {
      out.push({ text: stripped.slice("##[command]".length), kind: "command" });
      continue;
    }
    if (stripped.startsWith("##[error]")) {
      out.push({ text: stripped.slice("##[error]".length), kind: "error" });
      continue;
    }
    if (stripped.startsWith("##[warning]")) {
      out.push({ text: stripped.slice("##[warning]".length), kind: "warning" });
      continue;
    }
    if (stripped.startsWith("##[notice]")) {
      out.push({ text: stripped.slice("##[notice]".length), kind: "notice" });
      continue;
    }
    const wf = stripped.match(/^::([a-z]+)::(.*)$/);
    if (wf) {
      if (wf[1] === "group") {
        out.push({ text: wf[2].trim(), kind: "group" });
      } else if (wf[1] === "endgroup") {
        out.push({ text: "", kind: "empty" });
      } else {
        out.push({ text: wf[2].trim() || stripped, kind: "command" });
      }
      continue;
    }
    const trimmed = stripped.trim();
    out.push({ text: stripped, kind: trimmed.length === 0 ? "empty" : "normal" });
  }
  return out;
}
