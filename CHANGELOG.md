# Skimm Changelog

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
