import { useMemo } from 'react'
import { Hash } from 'lucide-react'
import { useFileStore } from '@/stores/file.store'
import { extractHeadings, type TocEntry } from '@/lib/markdown/toc'

/**
 * Outline sidebar: extracts H1–H6 headings from the active markdown file
 * and renders a nested, clickable list. Clicking an entry scrolls the
 * reading pane to that heading via the `id` attribute `rehype-slug`
 * attaches inside the render pipeline (same slug algorithm, same ids).
 *
 * Recomputes only when the active file's content changes — memoized on
 * the raw markdown string, which is already a stable reference per tab
 * in the file store.
 */
export function TocPanel() {
  const openFiles = useFileStore((s) => s.openFiles)
  const activeFileId = useFileStore((s) => s.activeFileId)
  const activeFile = openFiles.find((f) => f.id === activeFileId)

  const headings = useMemo(
    () => extractHeadings(activeFile?.content ?? ''),
    [activeFile?.content]
  )

  // Normalize indentation so the shallowest heading sits flush left
  // regardless of whether the doc starts at h1 or h2.
  const minDepth = headings.length > 0 ? Math.min(...headings.map((h) => h.depth)) : 1

  if (!activeFile) {
    return (
      <div
        className="text-[13px] px-2 py-6 leading-relaxed"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <p>No file open.</p>
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Open a markdown file to see its outline.
        </p>
      </div>
    )
  }

  if (headings.length === 0) {
    return (
      <div
        className="text-[13px] px-2 py-6 leading-relaxed"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <p>No headings in this document.</p>
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Add <code style={{ fontFamily: 'monospace' }}>#</code>,{' '}
          <code style={{ fontFamily: 'monospace' }}>##</code>, or deeper headers to build an outline.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col py-2">
      <div
        className="px-2 pb-2 text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: 'var(--text-muted)' }}
      >
        Outline · {activeFile.name}
      </div>
      <nav aria-label="Document outline">
        {headings.map((h, i) => (
          <TocItem key={`${h.id}-${i}`} entry={h} minDepth={minDepth} />
        ))}
      </nav>
    </div>
  )
}

function TocItem({ entry, minDepth }: { entry: TocEntry; minDepth: number }) {
  const relDepth = Math.max(0, entry.depth - minDepth)
  // 12px per level of nesting; headings flush-left get 8px baseline
  // so the leftmost entries aren't glued to the panel edge.
  const paddingLeft = 8 + relDepth * 12

  const handleClick = () => {
    const target = document.getElementById(entry.id)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Visual cue that nested items are subordinate: lighter color and
  // slightly smaller at deeper depths. H1-H2 stay full weight.
  const isTop = entry.depth <= 2
  const fontSize = entry.depth <= 2 ? 13 : entry.depth === 3 ? 12 : 11.5

  return (
    <button
      onClick={handleClick}
      className="w-full text-left px-2 py-1 rounded transition-colors cursor-pointer flex items-start gap-1.5 group"
      style={{
        paddingLeft,
        color: isTop ? 'var(--text-secondary)' : 'var(--text-tertiary)',
        fontSize,
        lineHeight: 1.4,
        background: 'transparent'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = isTop ? 'var(--text-secondary)' : 'var(--text-tertiary)'
      }}
      title={entry.text}
      aria-label={`Jump to heading: ${entry.text}`}
    >
      {entry.depth >= 3 && (
        <Hash
          size={10}
          strokeWidth={1.5}
          style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 3 }}
        />
      )}
      <span className="truncate flex-1">{entry.text}</span>
    </button>
  )
}
