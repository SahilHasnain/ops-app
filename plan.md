# Plan: Mobile GitHub Actions Trigger

## Goal

One workflow only:

> **"I'm away from my laptop. I need to make a small change and trigger GitHub Actions."**

## Stack

- Expo (React Native) + expo-router + NativeWind (already scaffolded)
- GitHub REST API via `@octokit/rest`
- OAuth sign-in via `expo-auth-session`

## Scope

### In (MVP)

1. Sign in with GitHub, list repositories.
2. Open a repo, browse files.
3. Edit a file (syntax highlighting, line numbers, search — no autocomplete).
4. Commit with a message.
5. List workflows, tap to run.
6. Live workflow run logs.

### Out

Merge conflicts · branch comparison · pull requests · AI · terminal · full IDE · git history.

## Milestones

### M1 — Auth + Repo list

- GitHub OAuth app (local dev + Expo Go)
- `expo-auth-session` sign-in, persist token (`expo-secure-store`)
- `/` route: sign-in screen → repo list (search, paginate)
- `/repo/[owner]/[name]` route

### M2 — File browser + editor

- List root files, navigate into folders
- `/repo/[owner]/[name]/edit/[path]` route
- Load file via Contents API (`media_type: raw` base64)
- Editor: line numbers, syntax highlighting (light-weight, no autocomplete), search
- Binary/large files: view-only, no edit

### M3 — Commit

- Commit message input + optional detail
- Use Blob API (create blob → create commit → update ref) or Contents API update
- Success/failure feedback with `$GITHUB_REF`

### M4 — Workflows + live logs

- List `.github/workflows/*` from default branch
- `/repo/[owner]/[name]/actions` route
- Trigger `workflow_dispatch` runs
- Poll run + job + step logs every ~2s; terminal-style log viewer

### M5 — Polish

- Pull-to-refresh, offline state, error toasts
- Recent repos / continue-where-you-left-off
- E2E happy path on device

## Validation

Build M1–M2 first, put it on a device, ask: **"Would I use this weekly?"**

If retention looks weak, widen the workflow (e.g., also manage envs/secrets or multiple services) before building M3–M4.

## Open Questions

- Fine-grained PAT vs OAuth for `workflow_dispatch` + write scopes
- GitHub App backend for token refresh / longer-lived sessions
- Which editor lib: `react-native-code-editor` vs WebView (`monaco`/`codejar`)
