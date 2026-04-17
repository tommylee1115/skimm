import { useState, useEffect, useCallback, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { MarkdownText } from '@/components/ai/MarkdownText'
import type { StudyCard as StudyCardData } from '@shared/study.types'

interface StudyCardModalProps {
  cards: StudyCardData[]
  initialIndex: number
  onClose: () => void
  onDelete: (id: string) => void
}

const MIN_WIDTH = 500
const MIN_HEIGHT = 400
const DEFAULT_WIDTH = 820
const DEFAULT_HEIGHT = 600

export function StudyCardModal({ cards, initialIndex, onClose }: StudyCardModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [showContext, setShowContext] = useState(false)
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const resizingRef = useRef(false)
  const startPosRef = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const card = cards[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < cards.length - 1

  const goNext = useCallback(() => {
    if (hasNext) {
      setCurrentIndex((i) => i + 1)
      setShowContext(false)
    }
  }, [hasNext])

  const goPrev = useCallback(() => {
    if (hasPrev) {
      setCurrentIndex((i) => i - 1)
      setShowContext(false)
    }
  }, [hasPrev])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, goNext, goPrev])

  // Resize handling
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = true
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    }

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const dx = ev.clientX - startPosRef.current.x
      const dy = ev.clientY - startPosRef.current.y
      const maxW = window.innerWidth - 80
      const maxH = window.innerHeight - 80
      setSize({
        width: Math.max(MIN_WIDTH, Math.min(maxW, startPosRef.current.width + dx)),
        height: Math.max(MIN_HEIGHT, Math.min(maxH, startPosRef.current.height + dy))
      })
    }

    const onMouseUp = () => {
      resizingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [size.width, size.height])

  if (!card) return null

  const typeLabel = card.selection_type
  const langLabel = card.language === 'ko' ? '한국어' : 'English'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="relative rounded-xl shadow-2xl flex flex-col"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          width: size.width,
          height: size.height,
          maxWidth: 'calc(100vw - 80px)',
          maxHeight: 'calc(100vh - 80px)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b shrink-0"
          style={{ borderColor: 'var(--border-secondary)', padding: '20px 32px' }}
        >
          <div className="flex items-center gap-3">
            <span
              className="text-[11px] px-2.5 py-1 rounded-full"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-secondary)' }}
            >
              {typeLabel}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {langLabel}
            </span>
            <span className="text-[12px] truncate max-w-[200px]" style={{ color: 'var(--text-muted)' }}>
              {card.source_file}
            </span>
          </div>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '48px 56px' }}>
          {/* Selected text */}
          <h2
            className="text-3xl font-semibold mb-8 leading-snug"
            style={{ color: 'var(--text-primary)' }}
          >
            "{card.selected_text}"
          </h2>

          {/* Explanation */}
          <div
            className="mb-8"
            style={{ color: 'var(--text-secondary)', fontSize: 17, lineHeight: 1.9 }}
          >
            <MarkdownText text={card.explanation} />
          </div>

          {/* Collapsible context */}
          {card.context && (
            <div className="mt-10">
              <button
                className="flex items-center gap-1.5 text-[13px] cursor-pointer transition-colors mb-3"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => setShowContext(!showContext)}
              >
                {showContext ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showContext ? 'Hide context' : 'Show original context'}
              </button>
              {showContext && (
                <div
                  className="px-5 py-4 rounded-lg italic"
                  style={{
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-tertiary)',
                    borderLeft: '3px solid var(--border-primary)',
                    fontSize: 14,
                    lineHeight: 1.8
                  }}
                >
                  {card.context}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — navigation */}
        <div
          className="flex items-center justify-between border-t shrink-0"
          style={{ borderColor: 'var(--border-secondary)', padding: '16px 32px' }}
        >
          <button
            className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
            style={{
              color: hasPrev ? 'var(--text-secondary)' : 'var(--text-muted)',
              background: 'transparent'
            }}
            onMouseEnter={(e) => { if (hasPrev) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            onClick={goPrev}
            disabled={!hasPrev}
          >
            <ChevronLeft size={16} />
            Previous
          </button>

          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {currentIndex + 1} / {cards.length}
          </span>

          <button
            className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
            style={{
              color: hasNext ? 'var(--text-secondary)' : 'var(--text-muted)',
              background: 'transparent'
            }}
            onMouseEnter={(e) => { if (hasNext) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            onClick={goNext}
            disabled={!hasNext}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Resize handle (bottom-right corner) */}
        <div
          className="absolute bottom-0 right-0 cursor-nwse-resize"
          style={{
            width: 20,
            height: 20,
            background: 'linear-gradient(135deg, transparent 50%, var(--text-muted) 50%, var(--text-muted) 55%, transparent 55%, transparent 65%, var(--text-muted) 65%, var(--text-muted) 70%, transparent 70%)',
            borderBottomRightRadius: 12,
            opacity: 0.4
          }}
          onMouseDown={startResize}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4' }}
        />
      </div>
    </div>
  )
}
