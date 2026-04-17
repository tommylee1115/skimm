import type { TtsChunk } from './types'

/**
 * Pure DOM + text helpers that build TTS chunks and map audio position
 * back to span indices. Extracted from the original monolithic useTts.ts
 * so they can be unit-tested (Phase 4) without an Electron runtime.
 */

// ~150 words → ~60s at rate 1.0. Small enough to dodge Chromium's
// long-utterance quirks, large enough to avoid unnatural prosody breaks.
const MAX_WORDS_PER_CHUNK = 150
// Rough English speech rate at rate 1.0, used only for the scrubber
// duration estimate.
const CHARS_PER_SECOND_AT_1X = 13

/** Collect every clickable word span currently in the reading area. */
export function collectSpans(root?: Document | HTMLElement): HTMLElement[] {
  const scope = root ?? document
  const host = (scope === document ? document.querySelector('.markdown-body') : scope) as
    | HTMLElement
    | null
  if (!host) return []
  return Array.from(host.querySelectorAll<HTMLElement>('[data-word]'))
}

/**
 * Group spans into chunks that fit within MAX_WORDS_PER_CHUNK, preferring
 * paragraph boundaries when we're near the cap. Injects a period at
 * heading/list-item boundaries so the TTS engine takes a breath between
 * structurally distinct units.
 */
export function buildChunks(spans: HTMLElement[]): TtsChunk[] {
  if (spans.length === 0) return []

  const chunks: TtsChunk[] = []
  let current: HTMLElement[] = []
  let currentText = ''
  let currentStarts: number[] = []
  let startIndex = 0
  let lastParent: Element | null = null

  const flush = (): void => {
    if (current.length === 0) return
    const durationMs = Math.max(
      500,
      Math.round((currentText.length / CHARS_PER_SECOND_AT_1X) * 1000)
    )
    chunks.push({
      text: currentText,
      spans: current,
      spanCharStarts: currentStarts,
      startGlobalIndex: startIndex,
      estimatedDurationMs: durationMs
    })
    startIndex += current.length
    current = []
    currentText = ''
    currentStarts = []
    lastParent = null
  }

  for (const span of spans) {
    const parent = span.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th')
    const crossingParagraph = parent !== lastParent
    const spanText = (span.textContent ?? '').trim()
    if (!spanText) continue

    // Prefer to break at paragraph boundaries when near the cap.
    if (current.length >= MAX_WORDS_PER_CHUNK && crossingParagraph) flush()
    // Hard cap — never exceed 1.5× the target.
    if (current.length >= Math.round(MAX_WORDS_PER_CHUNK * 1.5)) flush()

    if (currentText.length > 0) {
      const lastChar = currentText.charAt(currentText.length - 1)
      const endsWithSentencePunct = /[.!?]/.test(lastChar)
      // Inject a period at heading/list-item boundaries so the engine
      // takes a breath between structurally distinct units.
      if (crossingParagraph && !endsWithSentencePunct) currentText += '. '
      else currentText += ' '
    }
    currentStarts.push(currentText.length)
    currentText += spanText
    current.push(span)
    lastParent = parent
  }

  flush()
  return chunks
}

/**
 * Binary-search the largest `starts[i]` whose value is <= charIdx.
 * Returns -1 if charIdx is before the first span.
 */
export function findLocalSpanIndex(starts: number[], charIdx: number): number {
  if (starts.length === 0) return -1
  let lo = 0
  let hi = starts.length - 1
  let result = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] <= charIdx) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}

/**
 * Cumulative time-weight profile for a text string. Used by the OpenAI
 * path to convert audio progress → char position more accurately than a
 * linear mapping. Punctuation gets extra weight because the engine pauses
 * after it, and those pauses consume audio time without advancing the
 * character position linearly.
 *
 * Weights tuned empirically for OpenAI TTS prosody at rate 1.0:
 *   base letter/space/digit: 1
 *   comma / semicolon / colon / dash: +3
 *   period / exclamation / question: +8 (sentence-end pause)
 *   newline: +5
 */
export function buildTimeWeights(text: string): { weights: number[]; total: number } {
  const weights = new Array<number>(text.length)
  let cum = 0
  for (let i = 0; i < text.length; i++) {
    cum += 1
    const ch = text[i]
    if (ch === '.' || ch === '!' || ch === '?') cum += 8
    else if (ch === ',' || ch === ';' || ch === ':' || ch === '—' || ch === '-') cum += 3
    else if (ch === '\n') cum += 5
    weights[i] = cum
  }
  return { weights, total: cum }
}

/**
 * Given cumulative weights and a target weight, return the largest index
 * whose cumulative weight is <= target. Binary search.
 */
export function findCharAtWeight(weights: number[], target: number): number {
  if (weights.length === 0) return -1
  if (target <= 0) return 0
  if (target >= weights[weights.length - 1]) return weights.length - 1
  let lo = 0
  let hi = weights.length - 1
  let result = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (weights[mid] <= target) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}
