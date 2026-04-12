# Skimm Error Log

A running record of non-obvious bugs, their root causes, and the fixes that actually worked.
Each entry documents the failure path so we don't repeat it.

---

## 2026-04-12 — Drag-and-drop only fires from bottom edge of file rows

**Symptom**
Dragging a file row in the Explorer sidebar only worked when clicking the very bottom ~2px of the row. Clicking anywhere else on the row did nothing.

**Environment**
Electron 35 (Chromium 134), Windows 11. `overflow-y: auto` scrollable sidebar.

**Root cause**
HTML5 Drag and Drop API (`draggable`, `dragstart`) is broken in Chromium 134+ inside scrollable containers. Chromium's scroll-vs-drag gesture disambiguator silently swallows `dragstart` before it fires whenever the element is inside `overflow-y: auto`. The only pixel that escaped the interception was the very bottom edge of each row — a quirk of the heuristic, not intentional behavior.

**Failed workarounds (each took half a day)**
1. Removing `e.preventDefault()` on `mousedown` — no effect
2. Setting `overflow-y: hidden` on `mousedown` and restoring on `mouseup` / `dragend` — gesture detection happens before any JS runs; too late
3. Moving `draggable` from an overlay div to the outer row div — still relies on `dragstart`; same failure

**Fix**
Replace HTML5 DnD entirely with a custom mouse-event drag system (same approach VSCode uses):

1. **`mousedown` on the file row** → arm a ref `{ paths, startX, startY, moved: false, chip: null, dropTarget: null }`. No `draggable`, no `dragstart`.
2. **Window-level `mousemove`** → once moved >5px: create a `position:fixed` floating chip that follows the cursor. Temporarily set `visibility:hidden` on the chip, call `document.elementFromPoint(x, y)`, restore visibility. Walk the result up with `closest('[data-skimm-folder-row]')` / `closest('[data-skimm-root-zone]')` to find the drop target.
3. **Window-level `mouseup`** → commit the move, clean up chip, reset state.
4. Drop targets need **no DnD event handlers** — just data attributes discovered by `elementFromPoint`.

**Extra gotchas**
- Put `data-skimm-folder-row` on the **outer wrapper** of a folder component, not just the header. If it's only on the header, hovering over files inside the folder won't detect the folder as a drop target.
- Use a `commitRef` updated every render (`commitRef.current = fn`) to call the latest `moveFileToFolder`/`setSelectedPaths` from inside `useEffect(() => {...}, [])` without stale closures.
- After a drag completes, a spurious `click` may fire. Guard with a `fileDragHappenedRef` flag to suppress the post-drag background click that would otherwise clear selection.

**Files changed**
- `src/renderer/components/layout/Sidebar.tsx` — complete replacement of HTML5 DnD drag source; FolderNode and RootDropZone stripped of DnD handlers; custom drag integrated into existing marquee mouse-event infrastructure.

---
