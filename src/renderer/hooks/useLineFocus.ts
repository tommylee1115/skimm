import { useEffect, useCallback, useRef } from 'react'
import { useReaderStore } from '@/stores/reader.store'

/**
 * Line focus mode — dims all block elements except the focused one.
 *
 * IMPORTANT: This hook NEVER modifies DOM structure. It only sets
 * inline opacity styles on existing elements. All DOM structure
 * is managed by React.
 *
 * Focusable units:
 * - Each <li> individually
 * - Each heading (h1-h6)
 * - Each <p> as a whole
 * - Each pre, blockquote, hr, table as a whole
 */

export interface FocusController {
  // Move focus to the unit containing this DOM element. Also remembers the
  // index so that the next time focus mode is enabled it starts from here.
  focusOnElement: (el: HTMLElement) => void
}

let focusController: FocusController | null = null

export function getFocusController(): FocusController | null {
  return focusController
}

export function useLineFocus(containerRef: React.RefObject<HTMLDivElement | null>) {
  const lineFocusEnabled = useReaderStore((s) => s.lineFocusEnabled)
  const focusLineIndex = useReaderStore((s) => s.focusLineIndex)
  const setFocusLineIndex = useReaderStore((s) => s.setFocusLineIndex)
  const unitCountRef = useRef(0)

  const getUnits = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return []
    // containerRef IS the .markdown-body element
    const root = containerRef.current

    const units: HTMLElement[] = []

    for (const child of Array.from(root.children) as HTMLElement[]) {
      const tag = child.tagName.toLowerCase()

      if (tag === 'ul' || tag === 'ol') {
        // Each list item individually
        child.querySelectorAll(':scope > li').forEach((li) => units.push(li as HTMLElement))
      } else {
        // Everything else (p, h1-h6, pre, blockquote, hr, table) as a whole
        units.push(child)
      }
    }

    return units
  }, [containerRef])

  // Register a module-level focus controller so other modules (MainPane's
  // click handler) can seek focus without going through props.
  useEffect(() => {
    const controller: FocusController = {
      focusOnElement: (el: HTMLElement) => {
        const units = getUnits()
        if (units.length === 0) return

        // Walk up from the clicked element until we find a unit.
        let node: HTMLElement | null = el
        while (node) {
          const index = units.indexOf(node)
          if (index !== -1) {
            useReaderStore.getState().setFocusLineIndex(index)
            return
          }
          node = node.parentElement
        }
      }
    }
    focusController = controller
    return () => {
      if (focusController === controller) focusController = null
    }
  }, [getUnits])

  // Apply/remove focus styling
  useEffect(() => {
    const units = getUnits()
    unitCountRef.current = units.length

    if (!lineFocusEnabled || units.length === 0) {
      // Clear all inline styles
      units.forEach((el) => {
        el.style.opacity = ''
        el.style.transition = ''
      })
      return
    }

    const maxIndex = units.length - 1
    const clamped = Math.max(0, Math.min(focusLineIndex, maxIndex))
    if (clamped !== focusLineIndex) {
      setFocusLineIndex(clamped)
      return // will re-run with corrected index
    }

    units.forEach((el, i) => {
      el.style.transition = 'opacity 0.15s ease'
      el.style.opacity = i === clamped ? '1' : '0.12'
    })

    // Scroll focused unit into view
    units[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [lineFocusEnabled, focusLineIndex, getUnits, setFocusLineIndex])

  // Keyboard navigation
  useEffect(() => {
    if (!lineFocusEnabled) return

    const handler = (e: KeyboardEvent) => {
      const max = Math.max(0, unitCountRef.current - 1)
      const store = useReaderStore.getState()

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        store.setFocusLineIndex(Math.min(store.focusLineIndex + 1, max))
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        store.setFocusLineIndex(Math.max(store.focusLineIndex - 1, 0))
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lineFocusEnabled])

  // Note: focus mode intentionally preserves `focusLineIndex` when toggled
  // off and back on. The last clicked word (via handleWordClick →
  // focusController.focusOnElement) sets the index, so re-enabling focus
  // resumes reading from wherever the user last looked — not from the top.
}
