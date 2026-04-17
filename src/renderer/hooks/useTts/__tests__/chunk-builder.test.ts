import { describe, it, expect } from 'vitest'
import {
  buildChunks,
  findLocalSpanIndex,
  findCharAtWeight,
  buildTimeWeights
} from '../chunk-builder'

/**
 * Pure-utility tests for the TTS chunk builder. The DOM-dependent
 * `buildChunks` piece runs against spans created with jsdom; the other
 * three are pure number-crunching.
 */

// ─────────────────────────────────────────────────────────────
// findLocalSpanIndex — binary search over sorted char offsets
// ─────────────────────────────────────────────────────────────

describe('findLocalSpanIndex', () => {
  it('returns -1 for an empty starts array', () => {
    expect(findLocalSpanIndex([], 0)).toBe(-1)
    expect(findLocalSpanIndex([], 100)).toBe(-1)
  })

  it('returns -1 when charIdx is before the first span', () => {
    expect(findLocalSpanIndex([5, 10, 15], 0)).toBe(-1)
    expect(findLocalSpanIndex([5, 10, 15], 4)).toBe(-1)
  })

  it('returns the index when charIdx is exactly on a boundary', () => {
    expect(findLocalSpanIndex([0, 5, 10, 15], 0)).toBe(0)
    expect(findLocalSpanIndex([0, 5, 10, 15], 5)).toBe(1)
    expect(findLocalSpanIndex([0, 5, 10, 15], 10)).toBe(2)
    expect(findLocalSpanIndex([0, 5, 10, 15], 15)).toBe(3)
  })

  it('returns the largest index <= charIdx between boundaries', () => {
    expect(findLocalSpanIndex([0, 5, 10, 15], 3)).toBe(0)
    expect(findLocalSpanIndex([0, 5, 10, 15], 7)).toBe(1)
    expect(findLocalSpanIndex([0, 5, 10, 15], 14)).toBe(2)
  })

  it('returns the last index for charIdx past the end', () => {
    expect(findLocalSpanIndex([0, 5, 10, 15], 999)).toBe(3)
  })

  it('handles a single-element starts array', () => {
    expect(findLocalSpanIndex([0], 0)).toBe(0)
    expect(findLocalSpanIndex([0], 100)).toBe(0)
    expect(findLocalSpanIndex([10], 5)).toBe(-1)
  })
})

// ─────────────────────────────────────────────────────────────
// buildTimeWeights — cumulative weight profile with punctuation
// ─────────────────────────────────────────────────────────────

describe('buildTimeWeights', () => {
  it('gives +1 per ordinary character', () => {
    const { weights, total } = buildTimeWeights('abc')
    expect(weights).toEqual([1, 2, 3])
    expect(total).toBe(3)
  })

  it('adds +8 for sentence-end punctuation', () => {
    const { weights, total } = buildTimeWeights('a.')
    // 'a' → 1; '.' → 1 (base) + 8 (sentence punct) = 10 cumulative
    expect(weights).toEqual([1, 10])
    expect(total).toBe(10)
  })

  it('adds +3 for comma / semicolon / colon / dash', () => {
    const { weights } = buildTimeWeights('a,b;c:d-e—f')
    // Each delimiter adds 3 over its base weight of 1.
    // a(1) ,(1+3=+4→5) b(6) ;(+4→10) c(11) :(+4→15) d(16) -(+4→20) e(21) —(+4→25) f(26)
    expect(weights).toEqual([1, 5, 6, 10, 11, 15, 16, 20, 21, 25, 26])
  })

  it('adds +5 for newline', () => {
    const { weights } = buildTimeWeights('a\nb')
    // a(1) \n(1+5=+6→7) b(8)
    expect(weights).toEqual([1, 7, 8])
  })

  it('returns empty arrays for empty input', () => {
    const { weights, total } = buildTimeWeights('')
    expect(weights).toEqual([])
    expect(total).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// findCharAtWeight — binary search on cumulative weights
// ─────────────────────────────────────────────────────────────

describe('findCharAtWeight', () => {
  it('returns -1 for empty weights', () => {
    expect(findCharAtWeight([], 5)).toBe(-1)
  })

  it('returns 0 for target <= 0', () => {
    expect(findCharAtWeight([1, 2, 3], 0)).toBe(0)
    expect(findCharAtWeight([1, 2, 3], -10)).toBe(0)
  })

  it('returns the last index for target >= total', () => {
    expect(findCharAtWeight([1, 2, 3], 3)).toBe(2)
    expect(findCharAtWeight([1, 2, 3], 999)).toBe(2)
  })

  it('finds the largest index whose weight <= target', () => {
    const weights = [1, 10, 11, 15, 16]
    expect(findCharAtWeight(weights, 1)).toBe(0)
    expect(findCharAtWeight(weights, 9)).toBe(0)
    expect(findCharAtWeight(weights, 10)).toBe(1)
    expect(findCharAtWeight(weights, 12)).toBe(2)
    expect(findCharAtWeight(weights, 15)).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────
// buildChunks — DOM-dependent chunk assembly
// ─────────────────────────────────────────────────────────────

/** Build an array of clickable-word spans arranged under a given
 *  block-level parent (p, h1, li, etc.). Returns the spans directly. */
function makeSpansInBlock(
  tag: string,
  words: string[],
  root: HTMLElement
): HTMLElement[] {
  const block = document.createElement(tag)
  const spans: HTMLElement[] = []
  for (const w of words) {
    const span = document.createElement('span')
    span.setAttribute('data-word', '')
    span.textContent = w
    block.appendChild(span)
    spans.push(span)
  }
  root.appendChild(block)
  return spans
}

describe('buildChunks', () => {
  it('returns [] for zero spans', () => {
    expect(buildChunks([])).toEqual([])
  })

  it('builds a single chunk from a short paragraph', () => {
    const root = document.createElement('div')
    const spans = makeSpansInBlock('p', ['Hello', 'world'], root)
    const chunks = buildChunks(spans)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('Hello world')
    expect(chunks[0].spans).toHaveLength(2)
    expect(chunks[0].spanCharStarts).toEqual([0, 6])
    expect(chunks[0].startGlobalIndex).toBe(0)
    expect(chunks[0].estimatedDurationMs).toBeGreaterThan(0)
  })

  it('injects a period between paragraphs lacking sentence punctuation', () => {
    const root = document.createElement('div')
    const a = makeSpansInBlock('h1', ['Chapter'], root)
    const b = makeSpansInBlock('p', ['Opens'], root)
    const chunks = buildChunks([...a, ...b])

    // A single chunk is fine when both blocks are short — we just want
    // the breath-period injected at the paragraph boundary.
    expect(chunks[0].text).toBe('Chapter. Opens')
  })

  it('does not double-punctuate when the previous block ends with .!?', () => {
    const root = document.createElement('div')
    const a = makeSpansInBlock('p', ['Done.'], root)
    const b = makeSpansInBlock('p', ['Next'], root)
    const chunks = buildChunks([...a, ...b])
    // Space between, no extra period.
    expect(chunks[0].text).toBe('Done. Next')
  })

  it('breaks at paragraph boundaries when above the soft cap', () => {
    const root = document.createElement('div')
    // 160 words in paragraph A (over the 150-word soft cap), then a
    // paragraph B — chunker should flush on the B boundary.
    const wordsA = Array.from({ length: 160 }, (_, i) => `a${i}`)
    const wordsB = ['startB']
    const spansA = makeSpansInBlock('p', wordsA, root)
    const spansB = makeSpansInBlock('p', wordsB, root)

    const chunks = buildChunks([...spansA, ...spansB])
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    // First chunk contains all of A; second begins with startB.
    expect(chunks[0].spans).toHaveLength(160)
    expect(chunks[1].spans[0].textContent).toBe('startB')
  })

  it('enforces a hard cap at 1.5x the soft cap even without paragraph breaks', () => {
    const root = document.createElement('div')
    // 250 words (above 150 * 1.5 = 225) all inside one <p> — no paragraph
    // break to flush early, so the hard cap must fire.
    const words = Array.from({ length: 250 }, (_, i) => `w${i}`)
    const spans = makeSpansInBlock('p', words, root)
    const chunks = buildChunks(spans)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    // No chunk exceeds the 1.5x cap.
    for (const c of chunks) expect(c.spans.length).toBeLessThanOrEqual(225)
  })

  it('tracks startGlobalIndex cumulatively across chunks', () => {
    const root = document.createElement('div')
    const wordsA = Array.from({ length: 160 }, (_, i) => `a${i}`)
    const wordsB = ['b0', 'b1', 'b2']
    const spansA = makeSpansInBlock('p', wordsA, root)
    const spansB = makeSpansInBlock('p', wordsB, root)
    const chunks = buildChunks([...spansA, ...spansB])
    expect(chunks[0].startGlobalIndex).toBe(0)
    expect(chunks[1].startGlobalIndex).toBe(160)
  })
})
