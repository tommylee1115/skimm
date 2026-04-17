import { describe, it, expect } from 'vitest'
import { buildTimingCurve, charAtTime } from '../whisper-map'

// ─────────────────────────────────────────────────────────────
// buildTimingCurve — match whisper words to source tokens
// ─────────────────────────────────────────────────────────────

describe('buildTimingCurve', () => {
  it('returns [] when whisper produced no words', () => {
    expect(buildTimingCurve('hello world', [])).toEqual([])
  })

  it('returns [] when the source has no tokens', () => {
    expect(
      buildTimingCurve('   ', [{ word: 'hi', start: 0, end: 0.3 }])
    ).toEqual([])
  })

  it('aligns a simple three-word sentence', () => {
    const text = 'Hello brave world'
    const curve = buildTimingCurve(text, [
      { word: 'hello', start: 0, end: 0.4 },
      { word: 'brave', start: 0.4, end: 0.9 },
      { word: 'world', start: 0.9, end: 1.4 }
    ])
    expect(curve).toHaveLength(3)
    expect(curve[0]).toEqual({ time: 0, charIndex: 0 })
    expect(curve[1]).toEqual({ time: 0.4, charIndex: 6 })
    expect(curve[2]).toEqual({ time: 0.9, charIndex: 12 })
  })

  it('normalises punctuation and casing when matching', () => {
    const text = 'Hello, World!'
    const curve = buildTimingCurve(text, [
      { word: 'HELLO', start: 0, end: 0.4 },
      { word: 'world', start: 0.5, end: 0.9 }
    ])
    expect(curve.map((p) => p.charIndex)).toEqual([0, 7])
  })

  it('tolerates whisper dropping a filler word via look-ahead', () => {
    const text = 'the quick brown fox'
    // Whisper misses "quick" but still matches brown and fox correctly.
    const curve = buildTimingCurve(text, [
      { word: 'the', start: 0, end: 0.2 },
      { word: 'brown', start: 0.5, end: 0.8 },
      { word: 'fox', start: 0.8, end: 1.0 }
    ])
    const chars = curve.map((p) => p.charIndex)
    expect(chars).toEqual([0, 10, 16])
  })

  it('falls back to prefix matching for split contractions', () => {
    const text = "don't stop"
    // Whisper may split "don't" into "don" — prefix match should catch it.
    const curve = buildTimingCurve(text, [
      { word: 'don', start: 0, end: 0.3 },
      { word: 'stop', start: 0.4, end: 0.9 }
    ])
    expect(curve.map((p) => p.charIndex)).toEqual([0, 6])
  })
})

// ─────────────────────────────────────────────────────────────
// charAtTime — interpolate between control points
// ─────────────────────────────────────────────────────────────

describe('charAtTime', () => {
  it('returns -1 for an empty curve', () => {
    expect(charAtTime([], 0.5)).toBe(-1)
  })

  it('clamps before the first point', () => {
    const curve = [{ time: 1, charIndex: 10 }]
    expect(charAtTime(curve, 0)).toBe(10)
    expect(charAtTime(curve, -5)).toBe(10)
  })

  it('clamps past the last point', () => {
    const curve = [
      { time: 0, charIndex: 0 },
      { time: 1, charIndex: 10 }
    ]
    expect(charAtTime(curve, 999)).toBe(10)
  })

  it('linearly interpolates between two points', () => {
    const curve = [
      { time: 0, charIndex: 0 },
      { time: 1, charIndex: 100 }
    ]
    expect(charAtTime(curve, 0.5)).toBe(50)
    expect(charAtTime(curve, 0.25)).toBe(25)
  })

  it('interpolates correctly on an uneven curve', () => {
    const curve = [
      { time: 0, charIndex: 0 },
      { time: 1, charIndex: 10 },
      { time: 3, charIndex: 40 },
      { time: 5, charIndex: 60 }
    ]
    // At t=2 we sit halfway between (1, 10) and (3, 40) → char = 25
    expect(charAtTime(curve, 2)).toBe(25)
    // At t=4 we sit halfway between (3, 40) and (5, 60) → char = 50
    expect(charAtTime(curve, 4)).toBe(50)
  })

  it('handles zero-span segments gracefully', () => {
    // Two points with identical time (the math would divide by zero) —
    // implementation should return the left charIndex, not NaN.
    const curve = [
      { time: 1, charIndex: 10 },
      { time: 1, charIndex: 20 }
    ]
    expect(charAtTime(curve, 1)).toBe(10)
  })
})
