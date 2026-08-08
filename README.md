# DevPocket

Make quick GitHub edits and trigger GitHub Actions from your phone.

## How it works

1. **Sign in with GitHub** — uses GitHub's OAuth *device flow* (no password stored on device).
2. **Browse repositories** — searchable list of your repos.
3. **Edit a file** — mobile code editor with syntax highlighting, line numbers, and search.
4. **Commit** — commit to the default branch with a message.
5. **Run a workflow** — list `.github/workflows`, dispatch with one tap.
6. **Live logs** — stream job output in real time.

Out of scope for the MVP: merge conflicts, pull requests, branch comparison, git history, AI, terminal.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a GitHub OAuth App at https://github.com/settings/developers/new
   - Name it anything (e.g. "DevPocket")
   - Homepage URL: `https://example.com`
   - Callback URL: `https://example.com/callback` (not used for device flow, but required)
   - No scopes need to be selected — the app requests `repo workflow` at sign-in

3. Copy the env template and add your client ID:

   ```bash
   cp .env.example .env
   ```

   Set `EXPO_PUBLIC_GITHUB_CLIENT_ID=your_client_id`.

4. Start the app:

   ```bash
   npx expo start
   ```

   Open it in Expo Go on your phone (or press `w` for web).

## Project structure

```
app/
  index.tsx                        # sign-in + repo list
  repo/[owner]/[name]/index.tsx    # file browser
  repo/[owner]/[name]/edit/[...path].tsx   # editor + commit
  repo/[owner]/[name]/actions/index.tsx    # workflow list + dispatch
  repo/[owner]/[name]/actions/[runId].tsx  # live logs
lib/
  auth.tsx      # auth context (device flow + secure storage)
  github.ts     # GitHub API client
  editorHtml.ts # CodeMirror editor injected into a WebView
components/     # shared UI
```

## Scripts

```bash
npm run lint       # eslint
npx tsc --noEmit   # typecheck
```
