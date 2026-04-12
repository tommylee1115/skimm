import { useState, useRef, useEffect } from 'react'
import type { SidebarView } from './IconBar'
import { SettingsPanel } from '@/components/sidebar/SettingsPanel'
import { StudyPanel } from '@/components/sidebar/StudyPanel'
import { useFileStore, type VirtualFolder } from '@/stores/file.store'
import { FileText, X, FolderPlus, Folder, FolderOpen, ChevronRight, ChevronDown, MoreHorizontal } from 'lucide-react'

interface SidebarProps {
  view: SidebarView
  open: boolean
  width: number
}

export function Sidebar({ view, open, width }: SidebarProps) {
  if (!open) return null

  return (
    <div
      className="flex flex-col overflow-hidden border-r"
      style={{
        width,
        minWidth: 180,
        maxWidth: 400,
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-primary)'
      }}
    >
      <div
        className="flex items-center px-5 text-[11px] font-semibold uppercase tracking-[0.08em] shrink-0 border-b"
        style={{
          height: 40,
          color: 'var(--text-tertiary)',
          borderColor: 'var(--border-secondary)'
        }}
      >
        {view === 'files' && 'Explorer'}
        {view === 'study' && 'Study Cards'}
        {view === 'settings' && 'Settings'}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-2">
        {view === 'files' && <FilesPanel />}
        {view === 'study' && <StudyPanel />}
        {view === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

interface MarqueeState {
  startX: number
  startY: number
  currX: number
  currY: number
  additive: boolean   // true when Shift/Ctrl was held on mousedown
}

interface FileDragState {
  paths: string[]
  startX: number
  startY: number
  moved: boolean
  chip: HTMLElement | null
  dropTarget: { type: 'folder'; id: string } | { type: 'root' } | null
}

function FilesPanel() {
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

  // Updated on every render so the useEffect closure always calls the latest
  // versions of moveFileToFolder / setSelectedPaths without stale closures.
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

    // File row — arm drag tracker (also start for marquee-selected multi-file drags).
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
      // ── Custom file drag ────────────────────────────────────────────────
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
            fd.paths.length > 1
              ? `${fd.paths.length} files`
              : fileNameFromPath(fd.paths[0])
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

        // Detect drop target under cursor (briefly hide chip so it doesn't
        // block elementFromPoint).
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
          newTarget == null
            ? null
            : newTarget.type === 'folder'
              ? newTarget.id
              : '__root__'
        )
        return
      }

      // ── Marquee ─────────────────────────────────────────────────────────
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
      // ── Finish file drag ─────────────────────────────────────────────────
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

      // ── Finish marquee ───────────────────────────────────────────────────
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

function NewFolderButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      className="w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer"
      style={{ color: 'var(--text-muted)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-muted)'
      }}
      onClick={onClick}
      title="New folder"
    >
      <FolderPlus size={13} strokeWidth={1.5} />
    </button>
  )
}

function FolderNameInput({
  initialValue,
  placeholder,
  onSubmit,
  onCancel
}: {
  initialValue: string
  placeholder?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="px-2 py-1">
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(value)
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => onSubmit(value)}
        onClick={(e) => e.stopPropagation()}
        className="w-full text-[13px] px-2 py-1 rounded outline-none"
        style={{
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--accent-primary)'
        }}
      />
    </div>
  )
}

function FolderNode({
  folder,
  activePath,
  allFolders,
  selectedPaths,
  isHighlighted,
  onFileClick,
  onToggle,
  onRename,
  onDelete,
  onRemoveFile,
  onMoveFile
}: {
  folder: VirtualFolder
  activePath: string | null
  allFolders: VirtualFolder[]
  selectedPaths: Set<string>
  isHighlighted: boolean
  onFileClick: (e: React.MouseEvent, path: string, container: string[]) => void
  onToggle: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onRemoveFile: (path: string) => void
  onMoveFile: (path: string, folderId: string | null) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [hovered, setHovered] = useState(false)

  const Chevron = folder.collapsed ? ChevronRight : ChevronDown
  const FolderIcon = folder.collapsed ? Folder : FolderOpen

  // isHighlighted (drag hover) takes visual priority over plain hover.
  const headerBg = isHighlighted ? 'var(--bg-active)' : hovered ? 'var(--bg-hover)' : 'transparent'

  return (
    // data-skimm-folder-row on the OUTER wrapper so that hovering over any
    // child (including files inside) is detected as a drop onto this folder.
    <div data-skimm-folder-row={folder.id}>
      <div
        className="group flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-[13px] transition-colors select-none"
        style={{
          color: 'var(--text-secondary)',
          background: headerBg,
          outline: isHighlighted ? '1px dashed var(--accent-primary)' : 'none',
          outlineOffset: -2,
          userSelect: 'none'
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setRenaming(true)
        }}
      >
        <Chevron size={12} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
        <FolderIcon size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
        {renaming ? (
          <div onClick={(e) => e.stopPropagation()} className="flex-1">
            <FolderNameInput
              initialValue={folder.name}
              onSubmit={(name) => {
                onRename(name)
                setRenaming(false)
              }}
              onCancel={() => setRenaming(false)}
            />
          </div>
        ) : (
          <span className="truncate flex-1">{folder.name}</span>
        )}
        {!renaming && (
          <button
            className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (folder.files.length === 0 || confirm(`Delete folder "${folder.name}"? Files inside will move back to the root.`)) {
                onDelete()
              }
            }}
            title="Delete folder"
          >
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Folder contents */}
      {!folder.collapsed && (
        <div style={{ paddingLeft: 14 }}>
          {folder.files.length === 0 ? (
            <div
              className="text-[11px] px-2 py-1 italic"
              style={{ color: 'var(--text-muted)' }}
            >
              empty — drop files here
            </div>
          ) : (
            folder.files.map((path) => (
              <FileRow
                key={path}
                path={path}
                isActive={path === activePath}
                isSelected={selectedPaths.has(path)}
                folders={allFolders}
                currentFolderId={folder.id}
                onClick={(e) => onFileClick(e, path, folder.files)}
                onRemove={() => onRemoveFile(path)}
                onMoveTo={(folderId) => onMoveFile(path, folderId)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Slim drop target for moving files back to root. Visible only during a drag.
// Drop handling is performed by commitDragRef in the parent's mouseup handler;
// this component is purely visual.
function RootDropZone({
  isFileDragging,
  isHighlighted
}: {
  isFileDragging: boolean
  isHighlighted: boolean
}) {
  if (!isFileDragging) return null

  return (
    <div
      data-skimm-root-zone=""
      className="mx-2 my-1 px-2 py-1.5 rounded text-[11px] text-center"
      style={{
        border: '1px dashed var(--border-primary)',
        color: isHighlighted ? 'var(--text-primary)' : 'var(--text-muted)',
        background: isHighlighted ? 'var(--bg-active)' : 'transparent'
      }}
    >
      Drop here to move to root
    </div>
  )
}

function FileRow({
  path,
  isActive,
  isSelected,
  folders,
  currentFolderId,
  onClick,
  onRemove,
  onMoveTo
}: {
  path: string
  isActive: boolean
  isSelected: boolean
  folders: VirtualFolder[]
  currentFolderId?: string
  onClick: (e: React.MouseEvent) => void
  onRemove: () => void
  onMoveTo: (folderId: string | null) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const name = fileNameFromPath(path)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const bg = isActive
    ? 'var(--bg-active)'
    : isSelected
      ? 'var(--selection-bg, var(--bg-hover))'
      : hovered
        ? 'var(--bg-hover)'
        : 'transparent'

  return (
    // data-skimm-file-row is used by both the marquee and the custom drag
    // tracker (handlePanelMouseDown detects it to arm a drag on mousedown).
    <div
      className="relative group"
      ref={rowRef}
      data-skimm-file-row={path}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={path}
      style={{ cursor: 'grab' }}
    >
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded text-[13px] select-none"
        style={{
          background: bg,
          color: isActive || isSelected || hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
          paddingRight: 52
        }}
      >
        <FileText size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
        <span className="truncate flex-1">{name}</span>
      </div>

      {/* Action buttons — sit above the row content via z-10. */}
      <div
        className="absolute top-0 right-2 h-full flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ pointerEvents: 'none', zIndex: 10 }}
      >
        <button
          className="w-5 h-5 flex items-center justify-center rounded"
          style={{ color: 'var(--text-muted)', pointerEvents: 'auto' }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-tertiary)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((o) => !o)
          }}
          title="More"
        >
          <MoreHorizontal size={12} strokeWidth={2} />
        </button>
        <button
          className="w-5 h-5 flex items-center justify-center rounded"
          style={{ color: 'var(--text-muted)', pointerEvents: 'auto' }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-tertiary)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="Remove from workspace"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Move-to menu — z-20 so it floats above the buttons (z-10) */}
      {menuOpen && (
        <div
          className="absolute right-2 mt-1 rounded shadow-lg text-[12px] overflow-hidden"
          style={{
            zIndex: 20,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            minWidth: 160,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-secondary)' }}
          >
            Move to
          </div>
          {currentFolderId !== undefined && (
            <MenuItem
              onClick={() => {
                onMoveTo(null)
                setMenuOpen(false)
              }}
            >
              <FolderOpen size={12} strokeWidth={1.5} />
              Root
            </MenuItem>
          )}
          {folders
            .filter((f) => f.id !== currentFolderId)
            .map((f) => (
              <MenuItem
                key={f.id}
                onClick={() => {
                  onMoveTo(f.id)
                  setMenuOpen(false)
                }}
              >
                <Folder size={12} strokeWidth={1.5} />
                {f.name}
              </MenuItem>
            ))}
          {folders.length === 0 && currentFolderId === undefined && (
            <div className="px-3 py-2 italic" style={{ color: 'var(--text-muted)' }}>
              No folders yet
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer"
      style={{ color: 'var(--text-secondary)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-secondary)'
      }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
