# Releasing Skimm

How to build, package, and ship new versions of Skimm to yourself and friends.

## Prerequisites

- Node + npm installed
- Run `npm install` once after cloning
- Windows (the current packaging config targets Windows NSIS)

## First-time packaging (already done for v0.1.0)

```bash
npm run build && npm run package
```

- `npm run build` → compiles main / preload / renderer via `electron-vite build`
- `npm run package` → runs `electron-builder --win`, which:
  - Downloads Electron binary if not cached (~120 MB, one-time)
  - Rebuilds native deps (`better-sqlite3`) for Electron's Node ABI
  - Produces `dist/Skimm Setup <version>.exe` (NSIS installer, ~90 MB)

Installer target: **NSIS, per-user install, one-click**. No admin rights needed.

## Shipping an update

When you've added features or fixed bugs and want to ship a new version:

### 1. Make code changes

Edit whatever you need in `src/`. Verify it runs in dev first:

```bash
npm run dev
```

### 2. Bump the version in `package.json`

Use semver:

| Change        | Bump              | Example         |
|---------------|-------------------|-----------------|
| Bug fix       | patch             | 0.1.0 → 0.1.1   |
| New feature   | minor             | 0.1.1 → 0.2.0   |
| Breaking / v1 | major             | 0.9.0 → 1.0.0   |

```json
{
  "version": "0.1.1"
}
```

### 3. (Optional) Update `CHANGELOG.md`

Tiny habit, pays off when you want to remember what shipped. Keep it human-readable:

```md
## 0.1.1 — 2026-04-12
- Added cherry blossom drag-and-drop overlay
- Fixed workspace persistence across restarts
```

### 4. Rebuild and publish

**PowerShell 7+** (Windows default):
```powershell
$env:GH_TOKEN = gh auth token
npm run build && npm run package -- --publish always
```

**bash / zsh** (Git Bash, WSL, macOS):
```bash
GH_TOKEN=$(gh auth token) npm run build && GH_TOKEN=$(gh auth token) npm run package -- --publish always
```

`gh auth token` reads from the OS keychain (set up once via `gh auth login`)
so no plaintext `.env` file is required.

This builds the installer **and** pushes it to GitHub Releases automatically.
New installer lands at `dist/Skimm Setup <version>.exe` locally, and a GitHub
Release tagged `v<version>` is created with:

- `Skimm-Setup-<version>.exe` — the installer
- `Skimm-Setup-<version>.exe.blockmap` — block map for delta updates
- `latest.yml` — version manifest the auto-updater reads

Users who already have Skimm installed will see the **"A new version is ready —
Restart to update"** banner automatically. No manual distribution needed.

### 5. First-time install (share the exe directly)

For users who don't have Skimm yet, share the `.exe` from `dist/` or from the
GitHub Release page. After that first install, all future updates are automatic.

### 6. First-run warning (unsigned builds)

Windows SmartScreen shows "Windows protected your PC" because the `.exe` is
unsigned. Your friend clicks:

```
More info → Run anyway
```

One-time per machine. After that it launches normally. To avoid this entirely
you'd need a code-signing certificate (~$200/yr — not worth it until you have
real users).

## User data is safe across updates

All user-owned state lives **outside** the install folder:

| What              | Where                                   |
|-------------------|------------------------------------------|
| Settings, prefs   | `%APPDATA%\skimm\config.json`            |
| Study cards       | `%APPDATA%\skimm\study-cards.db` (SQLite) |
| API keys          | `%APPDATA%\skimm\config.json`            |
| Workspace files   | `%APPDATA%\skimm\config.json` (paths only) |

Updates only touch the Electron app binaries in
`%LOCALAPPDATA%\Programs\skimm\`. Your friend's cards, workspace, and settings
survive every update.

## Uninstalling

Windows → Settings → Apps → Skimm → Uninstall.

To also wipe user data, manually delete `%APPDATA%\skimm\` after uninstalling.

## Auto-updates (implemented)

Auto-updates are live via `electron-updater` + GitHub Releases:

- On launch, the app silently checks `https://github.com/tommylee1115/skimm/releases`
  for a newer `latest.yml`.
- If a new version exists, it downloads in the background.
- When the download finishes, a **"A new version is ready — Restart to update"**
  banner appears at the bottom-right of the window.
- Clicking "Restart to update" runs `autoUpdater.quitAndInstall()` — the new
  version is installed and the app relaunches.

**GH_TOKEN** is required only at publish time (your machine), never at runtime.
Use `gh auth login` (one-time) so the token is held by the OS keychain, and
inject it per-command only when publishing:

```powershell
# one-time
gh auth login   # paste a fine-grained PAT scoped to tommylee1115/skimm

# per-release (PowerShell 7+)
$env:GH_TOKEN = gh auth token
npm run build && npm run package -- --publish always
```

```bash
# per-release (bash / zsh)
GH_TOKEN=$(gh auth token) npm run build && GH_TOKEN=$(gh auth token) npm run package -- --publish always
```

Do **not** store the token in a `.env` file checked into the repo, or in your
shell profile as a persistent `export`. `gh auth token` pulls it into the
process env only for the duration of the publish command.

**Caveat:** auto-updater works on Windows without code signing. macOS requires
signing for auto-updates; skip macOS targets until then.

## Handy paths

| Item                      | Path                                             |
|---------------------------|--------------------------------------------------|
| Installer output          | `dist/Skimm Setup <version>.exe`                 |
| Unpacked app (portable)   | `dist/win-unpacked/`                             |
| Update manifest           | `dist/latest.yml` (generated when `publish` set) |
| Installed app             | `%LOCALAPPDATA%\Programs\skimm\`                 |
| User data                 | `%APPDATA%\skimm\`                               |
