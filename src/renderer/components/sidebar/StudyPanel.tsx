import { useState, useEffect, useCallback } from 'react'
import { Trash2, Search } from 'lucide-react'
import { MarkdownText } from '@/components/ai/MarkdownText'
import { StudyCardModal } from './StudyCardModal'
// StudyCardData type matches what window.api.cards returns
interface StudyCardData {
  id: string
  selected_text: string
  selection_type: 'word' | 'phrase' | 'sentence'
  explanation: string
  language: string
  context: string
  source_file: string
  saved_at: string
}

export function StudyPanel() {
  const [cards, setCards] = useState<StudyCardData[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalIndex, setModalIndex] = useState<number | null>(null)

  const loadCards = useCallback(async () => {
    setLoading(true)
    const result = searchQuery
      ? await window.api.cards.search(searchQuery)
      : await window.api.cards.list()
    setCards(result)
    setLoading(false)
  }, [searchQuery])

  useEffect(() => {
    loadCards()
  }, [loadCards])

  const handleDelete = async (id: string) => {
    await window.api.cards.delete(id)
    setCards((c) => c.filter((card) => card.id !== id))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2 pt-2 pb-1">
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded border"
          style={{
            background: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)'
          }}
        >
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cards..."
            className="flex-1 text-[12px] bg-transparent outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Card count */}
      <div
        className="px-4 py-2 text-[11px]"
        style={{ color: 'var(--text-muted)' }}
      >
        {cards.length} card{cards.length !== 1 ? 's' : ''} saved
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto px-2">
        {loading && (
          <div className="text-[13px] px-2 py-6 text-center" style={{ color: 'var(--text-muted)' }}>
            Loading...
          </div>
        )}

        {!loading && cards.length === 0 && (
          <div className="text-[13px] px-2 py-6 text-center leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            {searchQuery ? 'No cards match your search.' : 'No study cards yet. Save words from the Explain panel!'}
          </div>
        )}

        {cards.map((card, index) => (
          <StudyCardItem
            key={card.id}
            card={card}
            onDelete={handleDelete}
            onClick={() => setModalIndex(index)}
          />
        ))}

        {/* Modal */}
        {modalIndex !== null && (
          <StudyCardModal
            cards={cards}
            initialIndex={modalIndex}
            onClose={() => setModalIndex(null)}
            onDelete={(id) => {
              handleDelete(id)
              setModalIndex(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

function StudyCardItem({
  card,
  onDelete,
  onClick
}: {
  card: StudyCardData
  onDelete: (id: string) => void
  onClick: () => void
}) {
  return (
    <div
      className="px-3 py-3 mb-1.5 rounded-lg cursor-pointer group relative"
      style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
      onClick={onClick}
    >
      {/* Delete button */}
      <button
        className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-hover)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-muted)'
        }}
        onClick={(e) => {
          e.stopPropagation()
          onDelete(card.id)
        }}
        title="Delete card"
      >
        <Trash2 size={12} />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-1 pr-6">
        <span className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {card.selected_text}
        </span>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
        >
          {card.selection_type}
        </span>
      </div>

      {/* Preview */}
      <p
        className="text-[12px] leading-relaxed line-clamp-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        <MarkdownText text={card.explanation} />
      </p>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {card.source_file || 'unknown'}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {card.language === 'ko' ? '한국어' : 'EN'}
        </span>
      </div>
    </div>
  )
}
