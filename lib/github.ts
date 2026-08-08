import { GITHUB_API, GITHUB_CLIENT_ID } from "@/constants/config";

export class UnauthorizedError extends Error {
  constructor(message = "Session expired. Please sign in again.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/* ------------------------------------------------------------------ */
/* Device flow                                                         */
/* ------------------------------------------------------------------ */

export type DeviceCode = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

type TokenPayload = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export async function requestDeviceCode(): Promise<DeviceCode> {
  if (!GITHUB_CLIENT_ID) {
    throw new Error(
      "EXPO_PUBLIC_GITHUB_CLIENT_ID is not set. Copy .env.example to .env and add your GitHub OAuth App client ID."
    );
  }
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    // Use a plain string for React Native compatibility; some runtimes do not
    // serialize URLSearchParams bodies correctly.
    body: `client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}&scope=${encodeURIComponent("repo workflow")}`,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Failed to start GitHub sign-in (${res.status})${detail ? `: ${detail}` : "."}`
    );
  }
  return (await res.json()) as DeviceCode;
}

export async function pollForToken(
  device_code: string,
  interval: number,
  expires_in: number
): Promise<string> {
  const deadline = Date.now() + expires_in * 1000;
  let wait = Math.max(interval, 1) * 1000;
  while (Date.now() < deadline) {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: `client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}&device_code=${encodeURIComponent(device_code)}&grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:device_code")}`,
    });
    const data = (await res.json()) as TokenPayload;
    if (data.access_token) return data.access_token;
    if (data.error === "authorization_pending") {
      // keep polling
    } else if (data.error === "slow_down") {
      wait += 5000;
    } else {
      throw new Error(data.error_description ?? data.error ?? "GitHub sign-in failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  throw new Error("Sign-in timed out. Please try again.");
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(out));
  }
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type User = {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
};

export type Repo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  owner: { login: string };
  updated_at: string;
};

export type ContentsEntry = {
  type: "file" | "dir" | "submodule" | "symlink";
  name: string;
  path: string;
  sha: string;
  size?: number;
};

export type FileContent = ContentsEntry & {
  content?: string | null;
  encoding?: string;
};

export type ContentsResult =
  | { kind: "dir"; entries: ContentsEntry[] }
  | { kind: "file"; file: FileContent };

export type GitRef = { object: { type: string; sha: string; url: string } };
export type GitCommitMeta = { sha: string; tree: { sha: string } };
export type TreeItem = { path: string; mode: "100644"; type: "blob"; sha: string };

export type TreeEntry = {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
};

export type GitTree = {
  sha: string;
  tree: TreeEntry[];
  truncated?: boolean;
};

export type Workflow = {
  id: number;
  name: string;
  path: string;
  state: string;
  created_at: string;
  updated_at: string;
};

export type WorkflowList = { total_count: number; workflows: Workflow[] };

export type Run = {
  id: number;
  name: string | null;
  run_number: number;
  workflow_id: number;
  head_branch: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
};

export type RunList = { total_count: number; workflow_runs: Run[] };

export type JobStep = {
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type Job = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  run_id: number;
  steps?: JobStep[];
};

export type JobList = { total_count: number; jobs: Job[] };

/* ------------------------------------------------------------------ */
/* API client                                                          */
/* ------------------------------------------------------------------ */

type RequestInitExt = { method?: string; body?: unknown };

export class GithubApi {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(path: string, init?: RequestInitExt): Promise<T> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (res.status === 204) return undefined as T;
    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const j = (await res.json()) as { message?: string };
        if (j?.message) detail = j.message;
      } catch {
        // fall through with default detail
      }
      throw new Error(detail);
    }
    return (await res.json()) as T;
  }

  private async rawText(path: string): Promise<string> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      redirect: "follow",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      let detail = `Logs unavailable (${res.status})`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) detail = body.message;
      } catch {
        // Keep the status-based message for non-JSON log responses.
      }
      throw new Error(detail);
    }
    const text = await res.text();
    if (!text.trim()) throw new Error("GitHub returned empty logs for this job.");
    return text;
  }

  /* Account & repos */

  getUser = (): Promise<User> => this.request<User>("/user");

  getRepo = (owner: string, repo: string): Promise<Repo> =>
    this.request<Repo>(`/repos/${owner}/${repo}`);

  listRepos = (): Promise<Repo[]> =>
    this.request<Repo[]>("/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member");

  /* Contents */

  async getContents(owner: string, repo: string, path = ""): Promise<ContentsResult> {
    const p = path ? `/${path}` : "";
    const res = await this.request<ContentsEntry[] | FileContent>(
      `/repos/${owner}/${repo}/contents${p}`
    );
    if (Array.isArray(res)) return { kind: "dir", entries: res };
    return { kind: "file", file: res };
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string
  ): Promise<{ sha: string; text: string; name: string; size: number }> {
    const res = await this.request<FileContent>(`/repos/${owner}/${repo}/contents/${path}`);
    if (res.type !== "file") throw new Error("Not a file");
    let b64 = res.content;
    if (!b64) {
      const blob = await this.request<{ content: string }>(
        `/repos/${owner}/${repo}/git/blobs/${res.sha}`
      );
      b64 = blob.content;
    }
    return { sha: res.sha, text: base64ToUtf8(b64), name: res.name, size: res.size ?? 0 };
  }

  /* Git data */

  getRef = (owner: string, repo: string, branch: string): Promise<GitRef> =>
    this.request<GitRef>(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);

  getCommit = (owner: string, repo: string, sha: string): Promise<GitCommitMeta> =>
    this.request<GitCommitMeta>(`/repos/${owner}/${repo}/git/commits/${sha}`);

  getTree = (owner: string, repo: string, sha: string, recursive = false): Promise<GitTree> =>
    this.request<GitTree>(
      `/repos/${owner}/${repo}/git/trees/${sha}${recursive ? "?recursive=1" : ""}`
    );

  async getFullTree(owner: string, repo: string): Promise<GitTree> {
    const meta = await this.getRepo(owner, repo);
    const ref = await this.getRef(owner, repo, meta.default_branch);
    const commit = await this.getCommit(owner, repo, ref.object.sha);
    return this.getTree(owner, repo, commit.tree.sha, true);
  }

  createBlob = (owner: string, repo: string, content: string): Promise<{ sha: string }> =>
    this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: { content, encoding: "utf-8" },
    });

  createTree = (
    owner: string,
    repo: string,
    baseTree: string,
    tree: TreeItem[]
  ): Promise<{ sha: string }> =>
    this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      body: { base_tree: baseTree, tree },
    });

  createCommit = (
    owner: string,
    repo: string,
    message: string,
    tree: string,
    parents: string[]
  ): Promise<{ sha: string }> =>
    this.request<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      body: { message, tree, parents },
    });

  updateRef = (owner: string, repo: string, branch: string, sha: string): Promise<unknown> =>
    this.request<unknown>(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: { sha, force: false },
    });

  /* Workflows & runs */

  listWorkflows = (owner: string, repo: string): Promise<WorkflowList> =>
    this.request<WorkflowList>(`/repos/${owner}/${repo}/actions/workflows`);

  dispatchWorkflow = (
    owner: string,
    repo: string,
    workflowId: number,
    ref: string
  ): Promise<void> =>
    this.request<void>(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
      method: "POST",
      body: { ref },
    });

  listRuns = (owner: string, repo: string, perPage = 30): Promise<RunList> =>
    this.request<RunList>(`/repos/${owner}/${repo}/actions/runs?per_page=${Math.min(perPage, 100)}`);

  getRun = (owner: string, repo: string, runId: number): Promise<Run> =>
    this.request<Run>(`/repos/${owner}/${repo}/actions/runs/${runId}`);

  listJobs = (owner: string, repo: string, runId: number): Promise<JobList> =>
    this.request<JobList>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);

  async getJobLogs(owner: string, repo: string, jobId: number): Promise<string> {
    const text = await this.rawText(`/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`);
    return text.replace(/\u001b\[[0-9;]*m/g, "");
  }
}
