import { Files, Settings, Sun, Moon, BookOpen } from 'lucide-react'
import { useReaderStore } from '@/stores/reader.store'

export type SidebarView = 'files' | 'study' | 'settings'

interface IconBarProps {
  activeView: SidebarView
  onViewChange: (view: SidebarView) => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function IconBar({ activeView, onViewChange, sidebarOpen, onToggleSidebar }: IconBarProps) {
  const { theme, toggleTheme } = useReaderStore()

  const handleClick = (view: SidebarView) => {
    if (activeView === view && sidebarOpen) {
      onToggleSidebar()
    } else {
      onViewChange(view)
      if (!sidebarOpen) onToggleSidebar()
    }
  }

  const iconClass = (view: SidebarView) =>
    `flex items-center justify-center w-10 h-10 rounded-md cursor-pointer transition-colors ${
      activeView === view && sidebarOpen
        ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
    }`

  return (
    <div
      className="flex flex-col items-center py-2 gap-1 border-r"
      style={{
        width: 48,
        background: 'var(--bg-sidebar)',
        borderColor: 'var(--border-primary)'
      }}
    >
      <button
        className={iconClass('files')}
        onClick={() => handleClick('files')}
        title="Files"
        aria-label="Files"
        aria-pressed={activeView === 'files' && sidebarOpen}
      >
        <Files size={20} />
      </button>
      <button
        className={iconClass('study')}
        onClick={() => handleClick('study')}
        title="Study Cards"
        aria-label="Study Cards"
        aria-pressed={activeView === 'study' && sidebarOpen}
      >
        <BookOpen size={20} />
      </button>

      <div className="flex-1" />

      <button
        className="flex items-center justify-center w-10 h-10 rounded-md cursor-pointer transition-colors text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        onClick={toggleTheme}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      >
        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </button>
      <button
        className={iconClass('settings')}
        onClick={() => handleClick('settings')}
        title="Settings"
        aria-label="Settings"
        aria-pressed={activeView === 'settings' && sidebarOpen}
      >
        <Settings size={20} />
      </button>
    </div>
  )
}
