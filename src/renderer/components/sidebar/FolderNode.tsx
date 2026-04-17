import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, X } from 'lucide-react'
import type { VirtualFolder } from '@/stores/file.store'
import { FileRow } from './FileRow'
import { FolderNameInput } from './FolderNameInput'

interface FolderNodeProps {
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
}

export function FolderNode({
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
}: FolderNodeProps) {
  const [renaming, setRenaming] = useState(false)
  const [hovered, setHovered] = useState(false)

  const Chevron = folder.collapsed ? ChevronRight : ChevronDown
  const FolderIcon = folder.collapsed ? Folder : FolderOpen

  // isHighlighted (drag hover) takes visual priority over plain hover.
  const headerBg = isHighlighted ? 'var(--bg-active)' : hovered ? 'var(--bg-hover)' : 'transparent'

  return (
    // data-skimm-folder-row on the OUTER wrapper so hovering over any child
    // (including files inside) is detected as a drop onto this folder.
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
              if (
                folder.files.length === 0 ||
                confirm(
                  `Delete folder "${folder.name}"? Files inside will move back to the root.`
                )
              ) {
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
            <div className="text-[11px] px-2 py-1 italic" style={{ color: 'var(--text-muted)' }}>
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
