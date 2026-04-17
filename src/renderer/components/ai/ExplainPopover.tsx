import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useAiStore } from '@/stores/ai.store'
import { useFileStore } from '@/stores/file.store'

/**
 * Floating "Explain" button anchored to the current text selection inside the
 * reading pane. Replaces the old auto-fire-on-mouseup behavior — now every
 * Claude call needs one explicit click, so accidental selections don't rack
 * up API charges.
 *
 * Positioning never uses the mouse cursor as an anchor; it anchors to the
 * selection's own bounding rect so the button never lands directly under the
 * user's cursor. Default placement is 28px below and 12px right of the
 * selection's bottom-right; flips above the selection when the below slot
 * would be clipped by the viewport.
 */

const POPOVER_WIDTH = 92
const POPOVER_HEIGHT = 30
const OFFSET_BELOW = 28
const OFFSET_ABOVE = 14
const OFFSET_RIGHT = 12
const VIEWPORT_PADDING = 8

interface Anchor {
  left: number
  top: number
}

function computePosition(rect: DOMRect): Anchor | null {
  if (!rect || (rect.width === 0 && rect.height === 0)) return null

  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = rect.right + OFFSET_RIGHT
  let top = rect.bottom + OFFSET_BELOW

  // Clamp horizontally
  if (left + POPOVER_WIDTH > vw - VIEWPORT_PADDING) {
    left = vw - POPOVER_WIDTH - VIEWPORT_PADDING
  }
  if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING

  // Flip above if below would be clipped
  if (top + POPOVER_HEIGHT > vh - VIEWPORT_PADDING) {
    top = rect.top - POPOVER_HEIGHT - OFFSET_ABOVE
  }
  if (top < VIEWPORT_PADDING) top = VIEWPORT_PADDING

  return { left, top }
}

function selectionIsInReadingArea(selection: Selection): boolean {
  if (selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const node = range.commonAncestorContainer
  const el = node instanceof HTMLElement ? node : node.parentElement
  return !!el?.closest('.reading-area')
}

export function ExplainPopover() {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [text, setText] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let rafId = 0

    const update = (): void => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        setAnchor(null)
        return
      }
      const selected = selection.toString().trim()
      if (selected.length < 2) {
        setAnchor(null)
        return
      }
      if (!selectionIsInReadingArea(selection)) {
        setAnchor(null)
        return
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      const pos = computePosition(rect)
      if (!pos) {
        setAnchor(null)
        return
      }
      setText(selected)
      setAnchor(pos)
    }

    const scheduleUpdate = (): void => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(update)
    }

    document.addEventListener('selectionchange', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)
    window.addEventListener('resize', scheduleUpdate)

    const keyHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && anchor) {
        setAnchor(null)
      }
    }
    window.addEventListener('keydown', keyHandler)

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('selectionchange', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [anchor])

  if (!anchor) return null

  const handleExplain = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()

    // Recover the selection now (the popover is already visible and the
    // click could otherwise shift focus — using onMouseDown + preventDefault
    // keeps the selection alive until this handler fires).
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    const selected = selection.toString().trim()
    if (!selected) return

    const node = range.commonAncestorContainer
    const container = node instanceof HTMLElement ? node : node.parentElement
    const context = container?.closest('p, div, blockquote, li')?.textContent ?? ''

    const fileState = useFileStore.getState()
    const activeFile = fileState.openFiles.find((f) => f.id === fileState.activeFileId)
    const fullDocument = activeFile?.content ?? ''
    const sourceFile = activeFile?.name ?? ''

    useAiStore.getState().requestExplanation(selected, context, fullDocument, sourceFile)

    setAnchor(null)
    selection.removeAllRanges()
  }

  return (
    <button
      ref={buttonRef}
      // Use onMouseDown (not onClick) and preventDefault so the selection
      // isn't torn down before handleExplain runs.
      onMouseDown={handleExplain}
      aria-label={`Explain "${text.slice(0, 40)}"`}
      title="Explain selection"
      style={{
        position: 'fixed',
        left: anchor.left,
        top: anchor.top,
        width: POPOVER_WIDTH,
        height: POPOVER_HEIGHT,
        zIndex: 8000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 8,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
        color: 'var(--text-primary)',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        userSelect: 'none'
      }}
    >
      <Sparkles size={12} />
      Explain
    </button>
  )
}
