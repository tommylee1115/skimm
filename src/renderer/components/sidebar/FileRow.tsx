import { useEffect, useRef, useState } from 'react'
import { FileText, Folder, FolderOpen, MoreHorizontal, X } from 'lucide-react'
import type { VirtualFolder } from '@/stores/file.store'
import { fileNameFromPath } from '@/lib/path-utils'

interface FileRowProps {
  path: string
  isActive: boolean
  isSelected: boolean
  folders: VirtualFolder[]
  currentFolderId?: string
  onClick: (e: React.MouseEvent) => void
  onRemove: () => void
  onMoveTo: (folderId: string | null) => void
}

export function FileRow({
  path,
  isActive,
  isSelected,
  folders,
  currentFolderId,
  onClick,
  onRemove,
  onMoveTo
}: FileRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const name = fileNameFromPath(path)

  // Close menu on outside click.
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

      {/* Move-to menu — z-20 so it floats above the buttons (z-10). */}
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
