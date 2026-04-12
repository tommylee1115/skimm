/**
 * Thin wrapper around window.speechSynthesis — voice loading, picking, and
 * subscription helpers. Keeps the rest of the app free of the async
 * voiceschanged quirk.
 */

let cachedVoices: SpeechSynthesisVoice[] = []
let voicesReadyPromise: Promise<SpeechSynthesisVoice[]> | null = null

function readVoices(): SpeechSynthesisVoice[] {
  cachedVoices = window.speechSynthesis.getVoices()
  return cachedVoices
}

/**
 * Resolves once at least one voice is available. Chromium populates the voice
 * list asynchronously, so the first getVoices() call often returns []. This
 * listens for voiceschanged and caches the result.
 */
export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesReadyPromise) return voicesReadyPromise
  voicesReadyPromise = new Promise((resolve) => {
    const initial = readVoices()
    if (initial.length > 0) {
      resolve(initial)
      return
    }
    const handler = (): void => {
      const voices = readVoices()
      if (voices.length > 0) {
        window.speechSynthesis.removeEventListener('voiceschanged', handler)
        resolve(voices)
      }
    }
    window.speechSynthesis.addEventListener('voiceschanged', handler)
  })
  return voicesReadyPromise
}

/**
 * Score a voice for auto-pick quality. Higher is better.
 *   +10  Natural / Neural — Microsoft's modern TTS engines (far less robotic)
 *   +5   local service — reliable, works offline, fires onboundary events
 *   +3   Zira             — the second built-in Windows voice, smoother than David
 *   +2   Mark             — acceptable male voice
 *   +1   Aria / Jenny / Guy / Ava / Andrew — Microsoft's named voices
 *   -4   David            — the classic robotic default, penalize hard
 *   -2   remote but not Natural — boundary events may not fire
 */
function scoreVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase()
  let score = 0

  if (/natural|neural/.test(name)) score += 10
  if (v.localService) score += 5
  if (/zira/.test(name)) score += 3
  if (/mark/.test(name)) score += 2
  if (/aria|jenny|guy|ava|andrew/.test(name)) score += 1
  if (/david/.test(name)) score -= 4
  if (!v.localService && !/natural|neural/.test(name)) score -= 2

  return score
}

/**
 * Pick the best voice given a preferred name. Priority:
 *   1. Exact match by name (user's saved pick)
 *   2. Highest-scoring en-US voice via {@link scoreVoice}
 *   3. Any English voice
 *   4. First available voice (last resort)
 */
export function pickVoice(
  preferredName: string,
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null

  if (preferredName) {
    const exact = voices.find((v) => v.name === preferredName)
    if (exact) return exact
  }

  const enUS = voices.filter((v) => v.lang.toLowerCase().startsWith('en-us'))
  if (enUS.length > 0) {
    const ranked = [...enUS].sort((a, b) => scoreVoice(b) - scoreVoice(a))
    return ranked[0]
  }

  const en = voices.find((v) => v.lang.toLowerCase().startsWith('en'))
  if (en) return en

  return voices[0]
}

/**
 * Subscribe to voice list changes. Fires immediately with the current list
 * (if populated) and on every voiceschanged event.
 */
export function subscribeToVoiceChanges(
  cb: (voices: SpeechSynthesisVoice[]) => void
): () => void {
  const handler = (): void => {
    cb(readVoices())
  }
  window.speechSynthesis.addEventListener('voiceschanged', handler)
  const initial = readVoices()
  if (initial.length > 0) cb(initial)
  return () => {
    window.speechSynthesis.removeEventListener('voiceschanged', handler)
  }
}
