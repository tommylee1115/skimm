# Security

This document is the single page you should skim before deciding to install Skimm. It describes the trust model, the threats in scope, and what Skimm does (and deliberately does not) do about them.

## Trust model in one paragraph

Skimm is an unsigned Windows desktop app auto-updated from a public GitHub repository (`tommylee1115/skimm`). Every update you receive is whatever was published to GitHub Releases by the maintainer's GitHub account. There is no code-signing certificate, so Windows SmartScreen shows an "unknown publisher" warning on first install. After installation, `electron-updater` verifies the SHA-512 of each downloaded installer against the manifest hosted alongside it on GitHub, but both sides come from the same GitHub account — **auto-update safety reduces to GitHub-account integrity**.

If that trust story is unacceptable for your setting, do not install Skimm.

## Assets we protect

| Asset | Where it lives | Protection |
|---|---|---|
| Claude API key | `%APPDATA%\skimm\config.json` under `apiKeyEncrypted` | Encrypted at rest via Electron `safeStorage` (Windows DPAPI). Only the installing Windows user on the installing machine can decrypt. |
| OpenAI API key | Classroom env file (`C:\MGT4170\ClassKeys\classkey.env`) or `OPENAI_API_KEY` env var | Read once at launch, cached in memory only, never written to disk by Skimm, never sent to the renderer. |
| Study cards | `%APPDATA%\skimm\study-cards.db` (SQLite) | Plain SQLite file. User-owned on their own machine. |
| Workspace paths / session | `%APPDATA%\skimm\config.json` | Plaintext. No contents of the files, only absolute paths. |
| Main-process logs | `%APPDATA%\skimm\logs\main.log` | Plaintext. Does not include API keys or prompts. |

## Threats in scope

- **Compromised markdown input.** Raw HTML in markdown is stripped by `remark-rehype` with `allowDangerousHtml: false`; the renderer has a restrictive Content-Security-Policy (`script-src 'self'`, no inline scripts, connect limited to `api.anthropic.com` and `api.openai.com`). Renderer and preload run in the Chromium sandbox with `nodeIntegration: false` and `contextIsolation: true`.
- **Arbitrary-path reads.** The `file:read` IPC only reads paths the user has explicitly opened via the file dialog, drag-and-drop, or a previously-persisted workspace entry. Every read has a 10 MB cap and an extension allow-list (`.md`, `.markdown`, `.txt`). A compromised renderer cannot read SSH keys, browser cookies, or other `%APPDATA%` files.
- **API-key exfiltration from disk at rest.** The Claude API key is encrypted at rest via `safeStorage`. Copying `config.json` to another Windows user account on another machine yields an opaque blob.
- **Overlong / hung API requests.** Claude, OpenAI TTS, and Whisper calls all carry a 30-second `AbortSignal.timeout`.

## Threats out of scope

- **A compromised maintainer GitHub account** can push any installer it wants, which auto-updating users will install on next launch. Mitigations the maintainer applies: 2FA on the GitHub account, fine-grained PAT scoped to the `skimm` repo only (90-day expiry, `Contents: Write` + `Metadata: Read`), branch protection on `main`, `GH_TOKEN` held in the OS keychain via `gh auth login` (never on disk in a `.env` file). Users cannot mitigate this themselves other than by declining auto-updates or verifying installers manually (below).
- **Memory-scraping malware on the installed machine** can read the Claude key while Skimm is running (the key must be decrypted to be used). `safeStorage` protects the key at rest, not in memory.
- **Physical access to an unlocked machine**, since the Windows login session has everything needed to decrypt.
- **Chromium zero-days** that escape the renderer sandbox. Kept reasonably recent by shipping a current Electron major; we don't promise a same-day patch cadence.

## Manual installer verification (optional)

For every GitHub Release, `electron-builder` publishes three assets:

- `Skimm-Setup-<version>.exe` — the installer
- `Skimm-Setup-<version>.exe.blockmap` — for delta updates
- `latest.yml` — the manifest `electron-updater` consumes

The SHA-512 of the installer is inside `latest.yml`. To verify manually before installing the first time (or after a suspicious update):

```powershell
# Paste the sha512 from latest.yml on the release page, base64-decoded.
$expected = "<base64-sha512-from-latest.yml>"
$actual   = [Convert]::ToBase64String((Get-FileHash -Algorithm SHA512 .\Skimm-Setup-<version>.exe).Hash -as [byte[]])
if ($expected -eq $actual) { "OK" } else { "MISMATCH — do not install" }
```

This verification is itself only as trustworthy as the GitHub Release page serving `latest.yml`, so it does not remove the "compromised maintainer account" threat — it only catches a corrupted or swapped installer blob.

## Disclosure

Found a bug that looks like a security issue? Please open an issue on the repo with enough detail to reproduce, or contact the maintainer directly. Skimm is a personal project; response times are best-effort.

## Version history

- **0.4.0** (2026-04-16) — Initial SECURITY.md. Everything above reflects the state of the codebase at this version (safeStorage, sandbox, allow-listed reads, CSP, 30s timeouts).
