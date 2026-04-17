import { useEffect, useRef, useState } from 'react'
import { useFileStore } from '@/stores/file.store'
import { fileNameFromPath } from '@/lib/path-utils'
import { FolderNameInput } from './FolderNameInput'
import { NewFolderButton } from './NewFolderButton'
import { FolderNode } from './FolderNode'
import { RootDropZone } from './RootDropZone'
import { FileRow } from './FileRow'

interface MarqueeState {
  startX: number
  startY: number
  currX: number
  currY: number
  additive: boolean // true when Shift/Ctrl was held on mousedown
}

interface FileDragState {
  paths: string[]
  startX: number
  startY: number
  moved: boolean
  chip: HTMLElement | null
  dropTarget: { type: 'folder'; id: string } | { type: 'root' } | null
}

export function FilesPanel() {
  const {
    workspaceFiles,
    folders,
    openFiles,
    activeFileId,
    openFromPath,
    removeFromWorkspace,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderCollapsed,
    moveFileToFolder
  } = useFileStore()

  const [creatingFolder, setCreatingFolder] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)

  // Marquee (rubber-band) selection state.
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  marqueeRef.current = marquee
  const marqueeBaseSelectionRef = useRef<Set<string>>(new Set())
  const marqueeMovedRef = useRef(false)

  // Custom mouse-event file drag state.
  const fileDragRef = useRef<FileDragState | null>(null)
  const [isFileDragging, setIsFileDragging] = useState(false)
  // folder.id when hovering a folder, '__root__' for the root zone, null otherwise.
  const [dragHighlightTarget, setDragHighlightTarget] = useState<string | null>(null)
  // Suppress the post-drag click that would otherwise clear selection.
  const fileDragHappenedRef = useRef(false)

  // Updated on every render so the useEffect closure always calls the
  // latest versions of moveFileToFolder / setSelectedPaths without stale
  // closures.
  const commitDragRef = useRef<(paths: string[], folderId: string | null) => void>(() => {})
  commitDragRef.current = (paths: string[], folderId: string | null) => {
    for (const p of paths) moveFileToFolder(p, folderId)
    setSelectedPaths(new Set(paths))
  }

  const handleFileClick = (e: React.MouseEvent, path: string, container: string[]) => {
    const meta = e.ctrlKey || e.metaKey
    const shift = e.shiftKey

    if (shift && selectionAnchor && container.includes(selectionAnchor)) {
      const start = container.indexOf(selectionAnchor)
      const end = container.indexOf(path)
      if (start !== -1 && end !== -1) {
        const [lo, hi] = start < end ? [start, end] : [end, start]
        setSelectedPaths(new Set(container.slice(lo, hi + 1)))
        return
      }
    }

    if (meta) {
      const next = new Set(selectedPaths)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      setSelectedPaths(next)
      setSelectionAnchor(path)
      return
    }

    setSelectedPaths(new Set([path]))
    setSelectionAnchor(path)
    openFromPath(path)
  }

  const handleBackgroundClick = () => {
    if (fileDragHappenedRef.current) {
      fileDragHappenedRef.current = false
      return
    }
    if (marqueeMovedRef.current) {
      marqueeMovedRef.current = false
      return
    }
    if (selectedPaths.size > 0) setSelectedPaths(new Set())
  }

  // Intercepts mousedown across the whole panel.
  // • File row click  → arm custom drag tracker (never starts HTML5 DnD).
  // • Empty background → start marquee selection.
  // • Folder headers / buttons / inputs → ignored (let them handle themselves).
  const handlePanelMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement

    // File row — arm drag tracker (also starts for marquee-selected multi-file drags).
    const fileRow = target.closest('[data-skimm-file-row]') as HTMLElement | null
    if (fileRow && !target.closest('button') && !target.closest('input')) {
      const rowPath = fileRow.dataset.skimmFileRow!
      const paths =
        selectedPaths.has(rowPath) && selectedPaths.size > 1
          ? Array.from(selectedPaths)
          : [rowPath]
      fileDragRef.current = {
        paths,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        chip: null,
        dropTarget: null
      }
      return
    }

    // Folder headers and interactive elements — skip.
    if (
      target.closest('[data-skimm-folder-row]') ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('textarea')
    ) {
      return
    }

    // Empty background — start marquee.
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    marqueeBaseSelectionRef.current = additive ? new Set(selectedPaths) : new Set()
    marqueeMovedRef.current = false

    const initial: MarqueeState = {
      startX: e.clientX,
      startY: e.clientY,
      currX: e.clientX,
      currY: e.clientY,
      additive
    }
    setMarquee(initial)
    marqueeRef.current = initial
  }

  // Window-level listeners handle both file drag and marquee so tracking
  // continues even when the pointer leaves the sidebar panel.
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // ── Custom file drag ────────────────────────────────────────────
      const fd = fileDragRef.current
      if (fd) {
        const dx = e.clientX - fd.startX
        const dy = e.clientY - fd.startY
        if (!fd.moved && dx * dx + dy * dy > 25) {
          fd.moved = true
          setIsFileDragging(true)
          document.body.style.cursor = 'grabbing'
          document.body.style.userSelect = 'none'
        }
        if (!fd.moved) return

        // Create floating chip on first frame after threshold.
        if (!fd.chip) {
          const chip = document.createElement('div')
          chip.textContent =
            fd.paths.length > 1 ? `${fd.paths.length} files` : fileNameFromPath(fd.paths[0])
          chip.style.cssText = [
            'position:fixed',
            'pointer-events:none',
            'z-index:9999',
            'padding:5px 12px',
            'border-radius:6px',
            'background:#8B6F47',
            'color:white',
            'font-size:12px',
            'font-weight:600',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
            'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
            'white-space:nowrap'
          ].join(';')
          document.body.appendChild(chip)
          fd.chip = chip
        }

        // Follow cursor.
        fd.chip.style.left = `${e.clientX + 14}px`
        fd.chip.style.top = `${e.clientY - 10}px`

        // Detect drop target under cursor (briefly hide chip so it
        // doesn't block elementFromPoint).
        fd.chip.style.visibility = 'hidden'
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
        fd.chip.style.visibility = ''

        const folderEl = el?.closest('[data-skimm-folder-row]') as HTMLElement | null
        const rootEl = el?.closest('[data-skimm-root-zone]') as HTMLElement | null

        let newTarget: FileDragState['dropTarget'] = null
        if (folderEl) {
          newTarget = { type: 'folder', id: folderEl.dataset.skimmFolderRow! }
        } else if (rootEl) {
          newTarget = { type: 'root' }
        }
        fd.dropTarget = newTarget
        setDragHighlightTarget(
          newTarget == null ? null : newTarget.type === 'folder' ? newTarget.id : '__root__'
        )
        return
      }

      // ── Marquee ─────────────────────────────────────────────────────
      const m = marqueeRef.current
      if (!m) return

      const dx = e.clientX - m.startX
      const dy = e.clientY - m.startY
      if (!marqueeMovedRef.current && dx * dx + dy * dy > 25) {
        marqueeMovedRef.current = true
      }

      const next: MarqueeState = { ...m, currX: e.clientX, currY: e.clientY }
      marqueeRef.current = next
      setMarquee(next)

      if (!marqueeMovedRef.current) return

      const x1 = Math.min(m.startX, e.clientX)
      const y1 = Math.min(m.startY, e.clientY)
      const x2 = Math.max(m.startX, e.clientX)
      const y2 = Math.max(m.startY, e.clientY)

      const rows = document.querySelectorAll<HTMLElement>('[data-skimm-file-row]')
      const picked = new Set(marqueeBaseSelectionRef.current)
      rows.forEach((row) => {
        const rect = row.getBoundingClientRect()
        const intersects = !(
          rect.right < x1 ||
          rect.left > x2 ||
          rect.bottom < y1 ||
          rect.top > y2
        )
        const path = row.dataset.skimmFileRow
        if (path && intersects) picked.add(path)
      })
      setSelectedPaths(picked)
    }

    const handleMouseUp = () => {
      // ── Finish file drag ────────────────────────────────────────────
      const fd = fileDragRef.current
      if (fd) {
        if (fd.moved) {
          fileDragHappenedRef.current = true
          if (fd.dropTarget) {
            const folderId = fd.dropTarget.type === 'folder' ? fd.dropTarget.id : null
            commitDragRef.current(fd.paths, folderId)
          }
        }
        fd.chip?.remove()
        fileDragRef.current = null
        setIsFileDragging(false)
        setDragHighlightTarget(null)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        return
      }

      // ── Finish marquee ──────────────────────────────────────────────
      if (!marqueeRef.current) return
      marqueeRef.current = null
      setMarquee(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const hasAnything = workspaceFiles.length > 0 || folders.length > 0

  if (!hasAnything && !creatingFolder) {
    return (
      <div className="py-1">
        <div className="flex items-center justify-between px-2 py-2">
          <span
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: 'var(--text-muted)' }}
          >
            Workspace
          </span>
          <NewFolderButton onClick={() => setCreatingFolder(true)} />
        </div>
        <div
          className="text-[13px] px-2 py-6 leading-relaxed"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <p>No files in workspace.</p>
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Drag & drop a .md file, or use Ctrl+O to open.
          </p>
        </div>
      </div>
    )
  }

  const activePath = openFiles.find((f) => f.id === activeFileId)?.path ?? null

  return (
    <div
      className="py-1 relative select-none min-h-full"
      onMouseDown={handlePanelMouseDown}
      onClick={handleBackgroundClick}
    >
      <div className="flex items-center justify-between px-2 py-2">
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: 'var(--text-muted)' }}
        >
          Workspace
        </span>
        <NewFolderButton
          onClick={(e) => {
            e.stopPropagation()
            setCreatingFolder(true)
          }}
        />
      </div>

      {/* Inline "new folder" input */}
      {creatingFolder && (
        <FolderNameInput
          initialValue=""
          placeholder="Folder name"
          onSubmit={(name) => {
            if (name.trim()) createFolder(name)
            setCreatingFolder(false)
          }}
          onCancel={() => setCreatingFolder(false)}
        />
      )}

      {/* Folders */}
      {folders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          activePath={activePath}
          allFolders={folders}
          selectedPaths={selectedPaths}
          isHighlighted={dragHighlightTarget === folder.id}
          onFileClick={handleFileClick}
          onToggle={() => toggleFolderCollapsed(folder.id)}
          onRename={(name) => renameFolder(folder.id, name)}
          onDelete={() => deleteFolder(folder.id)}
          onRemoveFile={removeFromWorkspace}
          onMoveFile={moveFileToFolder}
        />
      ))}

      {/* Root drop zone — shown while a file drag is in progress */}
      <RootDropZone
        isFileDragging={isFileDragging}
        isHighlighted={dragHighlightTarget === '__root__'}
      />

      {/* Root files (not in any folder) */}
      <div>
        {workspaceFiles.map((path) => (
          <FileRow
            key={path}
            path={path}
            isActive={path === activePath}
            isSelected={selectedPaths.has(path)}
            folders={folders}
            onClick={(e) => handleFileClick(e, path, workspaceFiles)}
            onRemove={() => removeFromWorkspace(path)}
            onMoveTo={(folderId) => moveFileToFolder(path, folderId)}
          />
        ))}
      </div>

      {/* Marquee (rubber-band) selection overlay */}
      {marquee && marqueeMovedRef.current && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(marquee.startX, marquee.currX),
            top: Math.min(marquee.startY, marquee.currY),
            width: Math.abs(marquee.currX - marquee.startX),
            height: Math.abs(marquee.currY - marquee.startY),
            background: 'rgba(139, 111, 71, 0.12)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 1000
          }}
        />
      )}
    </div>
  )
}
