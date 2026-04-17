# Skimm Changelog

## 0.7.2 — 2026-04-16

### Fixed

- **Math equations finally render correctly.** The real culprit behind the KaTeX layout breakage wasn't Tailwind's preflight — it was the custom `span` component in the markdown pipeline, which forwarded only `className` to React and silently dropped every inline `style` attribute KaTeX emits. KaTeX's entire layout depends on those: vlist row heights, `top:-X.XXem` vertical offsets for sub/superscripts and accents, `margin-right:-2px` for column alignment, `vertical-align` on struts, and the `border-bottom-width:0.04em` on `.frac-line` that draws the fraction bar itself. Without them, vlists collapsed to the baseline and `β̂_1 = β_1 + \frac{…}{…}` rendered as jumbled glyphs on stacked rows. The CSS shims shipped in 0.6.0 and 0.7.1 were neutralizing preflight side effects but couldn't restore values KaTeX only writes as inline `style`. Fix: forward all remaining rehype-react props on non-clickable-word spans. Added an SSR regression test that asserts `frac-line` keeps its border width, `vlist` keeps its height, and struts keep their vertical-align.

## 0.7.1 — 2026-04-16

### Fixed

- **Update banner is now visible.** The old "A new version is ready" toast used the cream `--bg-secondary` against the cream reading area (low contrast) and referenced an undefined CSS variable `--accent` for the button background (so "Restart to update" had no fill). Rebuilt on the brand accent brown with white text, a large white Restart button, a sparkles icon, and a subtle slide-up entry animation — it's now obvious even mid-reading.
- **KaTeX layout shim widened.** Added pseudo-element coverage (`::before` / `::after`) and `margin: revert` + `padding: revert` to the scoped reset. Addresses stray subscript drop-offs, fraction numerator/denominator drift, and the `katex-mathml` screen-reader-twin leaking visually into the document.

## 0.7.0 — 2026-04-16

### Added

- **Outline sidebar.** New icon in the sidebar (tree icon, between Files and Study Cards) opens a live table-of-contents for the active markdown file. All `#`–`######` headings show up as a nested, clickable outline — click any entry to smooth-scroll the reading pane to that section. Nesting is normalized to the shallowest heading in the doc, so a file that starts at `##` still sits flush left. Headings inside fenced code blocks are correctly ignored.
- **Stable heading IDs.** `rehype-slug` is now in the markdown pipeline, giving every rendered heading a deterministic `id="..."` matching the outline's click target. The same `github-slugger` algorithm is used in both places so IDs always resolve.

### Fixed

- N/A — outline is purely additive.

## 0.6.0 — 2026-04-16

### Added

- **Paste your own OpenAI API key in Settings.** A new "OpenAI API Key" section sits under the Claude one — same password input, show/hide toggle, Save / Remove buttons. Enables the high-quality neural TTS voices and Whisper word-sync highlighting without needing any classroom file on disk. Key stays on your machine, encrypted at rest via Electron `safeStorage` (Windows DPAPI).
- **Live provider unlock.** Saving an OpenAI key in Settings instantly unlocks the "OpenAI" TTS provider toggle — no app restart needed. The resolution order inside Skimm is now: user-saved key → `OPENAI_API_KEY` env var → classroom fallback path.

### Changed

- Disabled-provider tooltip now points at Settings ("Add an OpenAI API key in Settings to enable neural TTS") instead of the classroom-specific file path.

### Fixed

- **Math equations now render correctly.** Tailwind v4's preflight applies `box-sizing: border-box` and `border: 0 solid` globally, which broke KaTeX's internal layout — fractions lost their horizontal bar, numerators and denominators drifted apart, `\hat` accents stacked below their letters. Added a scoped CSS shim in `globals.css` that restores `content-box` + `border revert` inside `.katex` subtrees, plus reinforces KaTeX's own `line-height: 1.2` against the reader's inherited `1.8`.

## 0.5.0 — 2026-04-16

### Added

- **Per-document TTS memory.** Change speed, voice, provider, or model while a file is the active tab and Skimm remembers those choices for that file. Switching tabs restores the per-doc settings; opening a fresh file falls back to your global defaults.
- **Check-for-updates button** in Settings → Updates. Live status line shows checking / up-to-date / downloading (with percent) / ready-to-install; includes a last-checked timestamp. Manual checks complement the existing auto-check on launch.
- **Tab disambiguation.** When two open tabs share a basename, both get a `filename · parentFolder` label so you can tell `chapter-04.md` from another `chapter-04.md` in a different folder.

### Security / docs

- **`SECURITY.md`** at the repo root documents the trust model, in-scope threats (mitigated), out-of-scope threats (e.g. compromised maintainer GitHub account), protected assets, and manual SHA-512 installer verification for paranoid first-installs.

### Accessibility

- **Keyboard focus rings.** `:focus-visible` adds a 2px accent outline on every button, input, select, and tabbable element — only when focus arrives via keyboard, so mouse clicks look the same as before.
- **`aria-label`s on icon-only buttons** across the IconBar, TTS transport, reading toolbar (Explain / Read / chunking / spacing / size / focus-mode toggles), and tab close button. Toggle buttons (Explain panel, chunking, line focus) now expose `aria-pressed` state.

### Infrastructure

- **Vitest + jsdom** installed with 40 tests covering the TTS chunk builder (boundary rules, paragraph breaks, hard cap, punctuation injection, offset tracking), whisper-map (word alignment, look-ahead, prefix match, interpolation edge cases), and rehype-clickable (word wrap + code/pre/link skip + KaTeX subtree skip). `npm test` / `npm run test:watch` / `npm run test:ui`.

### Deferred

- Markdown worker for > 200 KB docs (Phase 4.3). Skipped — no concrete user evidence of large-doc perf issues, and the worker split adds non-trivial complexity. Will revisit when someone actually reports a slow doc.
- `useMarqueeSelection` + `useFileDrag` reusable hooks (Phase 3.2 remainder). Deferred until annotations (planned) give us a second consumer.
- Inline annotations / highlights per document (Phase 5.2). Big enough to deserve its own design pass; not bundled into 0.5.0.

## 0.4.0 — 2026-04-16

### Improved

- **LaTeX equations now render as real math.** Inline `$…$` and display `$$…$$` blocks are parsed by remark-math and rendered via KaTeX. No more raw `\hat\beta_j` source showing through. The clickable-words layer skips math subtrees so equation symbols stay intact for both visuals and TTS.

### Architecture (internal — not user-visible)

- **`useTts.ts` split** from 837 lines into five focused files — `types.ts`, `chunk-builder.ts`, `web-speech-engine.ts`, `openai-engine.ts`, and `index.ts` (the coordinator). Engines are now pure per-chunk start functions with a callback protocol. Largest file is the coordinator at ~400 lines.
- **`Sidebar.tsx` split** from 885 lines: the shell is now 51 lines, with `FilesPanel`, `FolderNode`, `FileRow`, `FolderNameInput`, `RootDropZone`, and `NewFolderButton` in `src/renderer/components/sidebar/*`.
- **Main-process IPC split** into per-domain modules — `src/main/ipc/{files,ai,tts,cards,settings,update}.ts` — registered via `ipc/index.ts`. The file allow-list moved into `services/file-access.ts`. `main/index.ts` is now a ~170-line bootstrap.
- **Shared types** at `src/shared/{tts,ai,study}.types.ts` — one source of truth imported by main, preload, and renderer. `@shared/*` path alias added.
- **`settings:getMany` batch IPC.** Store hydration (tts, reader, session restore) dropped from 7–10 sequential round-trips to 1 per store.
- **Tab operations write one `session` blob** instead of two separate `session.openFiles` + `session.activeFile` settings writes. Back-compat read of the old shape on first restore.

### Fixed

- **End-to-end typecheck now runs clean** for the first time — added `src/preload/index.d.ts` and `src/shared/**/*` to `tsconfig.web.json`'s include (`window.api` types finally reach the renderer), and set `moduleResolution: bundler` in `tsconfig.node.json` (the `@tailwindcss/vite` type resolution error goes away).

## 0.3.0 — 2026-04-16

### Improved

- **Explain panel no longer auto-fires on every text selection.** A small "Explain" button now appears below-right of the selected text — one explicit click to spend tokens. Never covers the cursor, flips above the selection if it would be clipped. Alt+click on a single word still explains instantly.
- **Cancel a streaming explanation.** If you misclick, the streaming card now has a Stop button that aborts the Claude call mid-stream before it finishes.
- **Dismissable TTS error banner** with an X button.

### Security & hardening

- **Claude API keys encrypted at rest** via Electron `safeStorage` (Windows DPAPI). Existing plaintext keys auto-migrate on first launch after update — the raw `apiKey` field disappears from `config.json` and an `apiKeyEncrypted` blob replaces it. Only your Windows user on this machine can decrypt it.
- **`GH_TOKEN` is now managed by the `gh` CLI / OS keychain**, not a `.env` file. See `RELEASING.md` for the new publish one-liner: `GH_TOKEN=$(gh auth token) npm run package -- --publish always`.
- **File reads are now allow-listed.** The main process only reads paths you've explicitly opened via the file dialog, drag-drop, or a persisted workspace — a compromised renderer can no longer ask to read `.ssh/id_rsa` or `%APPDATA%` files. Hard 10 MB size cap.
- **Renderer runs in the Chromium sandbox** now (`sandbox: true`). Combined with `contextIsolation` this removes renderer access to Node.js.
- **Restrictive Content-Security-Policy** meta tag added to `index.html`. `script-src 'self'` blocks any future inline script execution.
- **30-second hard timeouts** on Claude, OpenAI TTS, and Whisper calls — no more UI stuck on "loading" when the network drops.

### Fixed

- **Race condition between rapid explanations.** Each AI request now carries a UUID; stream events from a superseded request are dropped before they touch the UI, so cards can't cross-contaminate when you click two words quickly.
- **Crashes in one pane no longer blank the whole window.** React error boundaries wrap the reading pane and Explain panel, with a "Reload pane" button to recover.

### Operational

- **`electron-log` wired into the main process.** Main-process console output and all auto-updater progress events now land in `%APPDATA%\skimm\logs\main.log` (1 MB rotating). Useful when an update fails on a friend's machine.

## 0.2.1 — 2026-04-12

- Fixed drag-and-drop in Explorer sidebar — HTML5 DnD was silently broken in Electron 35 (Chromium 134) inside scrollable containers; replaced with custom mouse-event drag (VSCode-style).

## 0.2.0 — 2026-04-11

- Explain panel now shows per-call cost and token usage (Claude Haiku 4.5 pricing) on each card.
- Focus mode starts from the last clicked word instead of always jumping to the top.
- Explorer now supports app-internal virtual folders: create, rename, delete, collapse, and move files between them. Folders are persisted inside the app — no real directories are created on disk.
- Explain panel font size now persists across restarts.
- File tabs stay on a single line with horizontal scroll (mouse wheel scrolls horizontally) and a minimum width so names never get cramped.

## 0.1.0 — 2026-04-10

- Initial release.
