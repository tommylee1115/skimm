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

### 4. Rebuild and repackage

```bash
npm run build && npm run package
```

New installer lands at `dist/Skimm Setup 0.1.1.exe`.

### 5. Distribute

- Upload the new `.exe` to Google Drive / Dropbox / WeTransfer
- Send the link to your friend
- Tell them to run the new installer — NSIS detects the existing install and
  replaces the old version **in place**. No uninstall needed.

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

## Future: auto-updates via `electron-updater`

Currently updates are **manual** — you send a new `.exe`, friend runs it.
To give users the "new version available" toast like Notion / VSCode:

1. `npm install electron-updater`
2. In `src/main/index.ts`, on app ready:
   ```ts
   import { autoUpdater } from 'electron-updater'
   autoUpdater.checkForUpdatesAndNotify()
   ```
3. Host the installer + the `latest.yml` file (electron-builder already
   generates this alongside the `.exe`) somewhere reachable:
   - **GitHub Releases** (free, recommended) — add `publish` config to
     `electron-builder.yml`
   - S3 / Azure blob / custom server
4. Add the publish config to `electron-builder.yml`:
   ```yaml
   publish:
     provider: github
     owner: <your-username>
     repo: skimm
   ```
5. Push a release with `npm run build && npm run package && npx electron-builder --publish always`

**Caveat:** auto-updater works on Windows without code signing, but **macOS
requires signing** for auto-updates to work at all.

## Handy paths

| Item                      | Path                                             |
|---------------------------|--------------------------------------------------|
| Installer output          | `dist/Skimm Setup <version>.exe`                 |
| Unpacked app (portable)   | `dist/win-unpacked/`                             |
| Update manifest           | `dist/latest.yml` (generated when `publish` set) |
| Installed app             | `%LOCALAPPDATA%\Programs\skimm\`                 |
| User data                 | `%APPDATA%\skimm\`                               |
