/**
 * Whisper timestamps → char-index timing curve.
 *
 * Whisper transcribes the TTS audio and returns an ordered list of words with
 * exact start/end times. We walk that list in parallel with the original text,
 * matching each Whisper word to its position via normalized lowercase ASCII
 * comparison. The result is a sparse `(audioTimeSec, charIndex)` curve that
 * we interpolate at playback time for frame-accurate word highlighting.
 */

export interface WhisperWord {
  word: string
  start: number
  end: number
}

export interface TimePoint {
  time: number        // seconds in audio
  charIndex: number   // position in the synthesized text
}

/**
 * Normalize a word for matching: lowercase, strip everything that isn't a
 * letter or digit. "Hello," and "hello" both become "hello".
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Tokenize text into (normalized-word, char-start) pairs. Non-word characters
 * serve as separators.
 */
function tokenize(text: string): { word: string; charStart: number }[] {
  const tokens: { word: string; charStart: number }[] = []
  const re = /\S+/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const normalized = normalize(match[0])
    if (normalized) {
      tokens.push({ word: normalized, charStart: match.index })
    }
  }
  return tokens
}

/**
 * Match Whisper's word list against the original text, producing a sequence
 * of `(time, charIndex)` control points. The walk is forward-only with a
 * small look-ahead window to tolerate transcription drift (whisper dropping
 * filler words, mishearing, etc.).
 */
export function buildTimingCurve(
  text: string,
  whisperWords: WhisperWord[]
): TimePoint[] {
  if (whisperWords.length === 0) return []
  const tokens = tokenize(text)
  if (tokens.length === 0) return []

  const points: TimePoint[] = []
  let srcIdx = 0
  const LOOK_AHEAD = 5

  for (const ww of whisperWords) {
    const normWW = normalize(ww.word)
    if (!normWW) continue

    // Forward search within look-ahead window
    let found = -1
    for (let k = 0; k < LOOK_AHEAD && srcIdx + k < tokens.length; k++) {
      if (tokens[srcIdx + k].word === normWW) {
        found = srcIdx + k
        break
      }
    }

    if (found < 0) {
      // Try prefix match — whisper may split "don't" as "don" or similar
      for (let k = 0; k < LOOK_AHEAD && srcIdx + k < tokens.length; k++) {
        const t = tokens[srcIdx + k].word
        if (t.startsWith(normWW) || normWW.startsWith(t)) {
          found = srcIdx + k
          break
        }
      }
    }

    if (found < 0) continue

    points.push({
      time: ww.start,
      charIndex: tokens[found].charStart
    })
    srcIdx = found + 1
  }

  return points
}

/**
 * Given a sorted timing curve and a current audio time, return the
 * interpolated character index. Linearly interpolates between surrounding
 * control points; clamps to the endpoints outside the range.
 */
export function charAtTime(points: TimePoint[], timeSec: number): number {
  if (points.length === 0) return -1
  if (timeSec <= points[0].time) return points[0].charIndex
  const last = points[points.length - 1]
  if (timeSec >= last.time) return last.charIndex

  // Binary search for the largest index whose time is <= timeSec
  let lo = 0
  let hi = points.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].time <= timeSec) {
      lo = mid
    } else {
      hi = mid
    }
  }

  const p0 = points[lo]
  const p1 = points[hi]
  const span = p1.time - p0.time
  if (span <= 0) return p0.charIndex
  const t = (timeSec - p0.time) / span
  return Math.round(p0.charIndex + t * (p1.charIndex - p0.charIndex))
}
