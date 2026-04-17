# Skimm Release Workflow

## One-time setup

Authenticate with GitHub via the `gh` CLI — the token is stored by Windows
Credential Manager, not on disk in a plaintext file:

```bash
gh auth login
# choose: GitHub.com → HTTPS → Paste an authentication token
# paste a **fine-grained PAT** scoped to tommylee1115/skimm
# permissions: Contents: Write, Metadata: Read (90-day expiry)
```

Verify:

```bash
gh auth status
```

No `.env` file is needed anywhere in this repo. If one exists from the old
workflow, delete it.

## Shipping an update

1. Make code changes and test with `npm run dev`
2. Bump version in `package.json` (e.g. `0.2.1` → `0.2.2`)
3. Add entry to `CHANGELOG.md`
4. Build and publish — one command:

   ```bash
   npm run ship
   ```

   This runs `scripts/ship.mjs`, which:
   - Pulls your GitHub token from the `gh` CLI's OS keychain store
   - Builds the app (`electron-vite build`)
   - Packages + publishes to GitHub Releases (`electron-builder
     --win --publish always`)

   The token is injected into the child process env only for the
   duration of the build and package commands — never touches disk,
   never persists in your shell session, never gets logged. If the
   token fetch fails, the script exits before building so you can
   fix auth first.

   **Manual equivalent** (if `npm run ship` isn't available or you
   want to debug a specific step):

   *PowerShell 7+:*
   ```powershell
   $env:GH_TOKEN = gh auth token
   npm run build && npm run package -- --publish always
   ```

   *bash / zsh:*
   ```bash
   GH_TOKEN=$(gh auth token) npm run build && GH_TOKEN=$(gh auth token) npm run package -- --publish always
   ```

That's it. A GitHub Release is created automatically with the installer and
update manifest. Users with Skimm installed will see the **"Restart to update"**
banner on next launch.

## Backing up source code (optional, separate step)

```bash
git add -p
git commit -m "..."
git push
```

Git push has no effect on user updates — only the publish command does.

## Version bumping guide

| Change      | Example         |
|-------------|-----------------|
| Bug fix     | 0.2.1 → 0.2.2   |
| New feature | 0.2.2 → 0.3.0   |
| Breaking    | 0.9.0 → 1.0.0   |

## Files that matter

| File                  | Purpose                                      |
|-----------------------|----------------------------------------------|
| `electron-builder.yml`| Points to `tommylee1115/skimm` on GitHub     |
| `package.json`        | Version number lives here                    |
| `CHANGELOG.md`        | Human-readable history of what shipped       |

## Credentials — where they live now

| Credential  | Storage                                               |
|-------------|-------------------------------------------------------|
| `GH_TOKEN`  | OS keychain via `gh auth login` (Windows DPAPI)       |
| Claude API  | OS keychain via Electron `safeStorage` (Phase 2)      |
| OpenAI key  | Classroom env file (Phase 2 makes this optional)      |

No plaintext credentials are committed, no plaintext `.env` is read at
build time.
