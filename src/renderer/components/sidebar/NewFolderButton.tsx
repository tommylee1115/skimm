import { FolderPlus } from 'lucide-react'

export function NewFolderButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
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
