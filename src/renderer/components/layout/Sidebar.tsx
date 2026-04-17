import type { SidebarView } from './IconBar'
import { SettingsPanel } from '@/components/sidebar/SettingsPanel'
import { StudyPanel } from '@/components/sidebar/StudyPanel'
import { FilesPanel } from '@/components/sidebar/FilesPanel'
import { TocPanel } from '@/components/sidebar/TocPanel'

interface SidebarProps {
  view: SidebarView
  open: boolean
  width: number
}

/**
 * Left sidebar shell. Renders the view header and dispatches to one of
 * three panels based on the IconBar selection. Each panel owns its own
 * state and behaviours.
 */
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
        {view === 'toc' && 'Outline'}
        {view === 'study' && 'Study Cards'}
        {view === 'settings' && 'Settings'}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-2">
        {view === 'files' && <FilesPanel />}
        {view === 'toc' && <TocPanel />}
        {view === 'study' && <StudyPanel />}
        {view === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
