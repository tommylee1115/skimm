import { useEffect, useRef, useCallback } from 'react'
import { useTtsStore, registerTtsController } from '@/stores/tts.store'
import { pickVoice, waitForVoices } from '@/lib/speech/web-speech'
import { buildTimingCurve, charAtTime, type TimePoint } from '@/lib/speech/whisper-map'

interface TtsChunk {
  text: string                   // exact string passed to TTS engine
  spans: HTMLElement[]
  spanCharStarts: number[]       // char offset of each span's first char in `text`
  startGlobalIndex: number       // global span index of this chunk's first span
  estimatedDurationMs: number    // rough duration at rate 1.0 for scrubber display
}

interface InternalState {
  allSpans: HTMLElement[]
  chunks: TtsChunk[]
  currentChunkIndex: number
  currentSpanInChunk: number     // first-span-to-speak within current chunk
  activeLocalSpanIndex: number   // currently highlighted span within current chunk
  playToken: number              // incremented on each cancel — stale events compare and no-op
  lastScrolledGlobalIndex: number
  totalElapsedBeforeChunk: number
  totalDurationMs: number
  openaiAudio: HTMLAudioElement | null  // OpenAI path: currently loaded audio element
  openaiStartChar: number               // OpenAI path: char offset where current audio begins in chunk.text
}

// ~150 words → ~60s at rate 1.0. Small enough to dodge Chromium's long-utterance
// quirks, large enough to avoid unnatural prosody breaks on both engines.
const MAX_WORDS_PER_CHUNK = 150
// Rough English speech rate at rate 1.0, used only for scrubber duration estimate.
const CHARS_PER_SECOND_AT_1X = 13

function collectSpans(): HTMLElement[] {
  const root = document.querySelector('.markdown-body')
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>('[data-word]'))
}

function buildChunks(spans: HTMLElement[]): TtsChunk[] {
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

    // Prefer to break at paragraph boundaries when near the cap
    if (current.length >= MAX_WORDS_PER_CHUNK && crossingParagraph) {
      flush()
    }
    // Hard cap — never exceed 1.5× the target
    if (current.length >= Math.round(MAX_WORDS_PER_CHUNK * 1.5)) {
      flush()
    }

    // When crossing a paragraph boundary without sentence punctuation, inject
    // a period so the TTS engine takes a breath between structurally distinct
    // units like headings and list items.
    if (currentText.length > 0) {
      const lastChar = currentText.charAt(currentText.length - 1)
      const endsWithSentencePunct = /[.!?]/.test(lastChar)
      if (crossingParagraph && !endsWithSentencePunct) {
        currentText += '. '
      } else {
        currentText += ' '
      }
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
function findLocalSpanIndex(starts: number[], charIdx: number): number {
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
 * Build a cumulative time-weight profile for a text string. Used by the
 * OpenAI path to convert audio progress → char position more accurately
 * than a linear mapping. Punctuation gets extra weight because the TTS
 * engine pauses after it, and those pauses consume audio time without
 * advancing the character position linearly.
 *
 * Weights are empirical and tuned for OpenAI TTS prosody at rate 1.0:
 *   base letter/space/digit: 1
 *   comma / semicolon / colon / dash: +3
 *   period / exclamation / question: +8 (sentence-end pause)
 *   newline: +5
 */
function buildTimeWeights(text: string): { weights: number[]; total: number } {
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
function findCharAtWeight(weights: number[], target: number): number {
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

export function useTts(): void {
  const stateRef = useRef<InternalState>({
    allSpans: [],
    chunks: [],
    currentChunkIndex: 0,
    currentSpanInChunk: 0,
    activeLocalSpanIndex: -1,
    playToken: 0,
    lastScrolledGlobalIndex: -1,
    totalElapsedBeforeChunk: 0,
    totalDurationMs: 0,
    openaiAudio: null,
    openaiStartChar: 0
  })

  const clearHighlight = useCallback(() => {
    document
      .querySelectorAll<HTMLElement>('.tts-word-active')
      .forEach((el) => el.classList.remove('tts-word-active'))
  }, [])

  const teardownOpenAiAudio = useCallback(() => {
    const s = stateRef.current
    if (s.openaiAudio) {
      try {
        s.openaiAudio.pause()
        s.openaiAudio.src = ''
      } catch {
        /* ignore */
      }
      s.openaiAudio = null
    }
  }, [])

  const fullCleanup = useCallback(() => {
    const s = stateRef.current
    s.playToken++
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
    teardownOpenAiAudio()
    clearHighlight()
    s.allSpans = []
    s.chunks = []
    s.currentChunkIndex = 0
    s.currentSpanInChunk = 0
    s.activeLocalSpanIndex = -1
    s.lastScrolledGlobalIndex = -1
    s.totalElapsedBeforeChunk = 0
    s.totalDurationMs = 0
    s.openaiStartChar = 0
  }, [clearHighlight, teardownOpenAiAudio])

  const stop = useCallback(() => {
    fullCleanup()
    const store = useTtsStore.getState()
    store.setIsPlaying(false)
    store.setIsLoading(false)
    store.setTransportVisible(false)
    store.setCurrentWordIndex(-1)
    store.setTime(0, 0)
    store.setError(null)
  }, [fullCleanup])

  const pause = useCallback(() => {
    const s = stateRef.current
    if (s.openaiAudio) {
      try {
        s.openaiAudio.pause()
      } catch {
        /* ignore */
      }
    } else {
      try {
        window.speechSynthesis.pause()
      } catch {
        /* ignore */
      }
    }
    useTtsStore.getState().setIsPlaying(false)
  }, [])

  const resume = useCallback(() => {
    const s = stateRef.current
    if (s.openaiAudio) {
      s.openaiAudio.play().catch((err) => {
        console.error('[TTS] audio resume error:', err)
      })
    } else {
      try {
        window.speechSynthesis.resume()
      } catch {
        /* ignore */
      }
    }
    useTtsStore.getState().setIsPlaying(true)
  }, [])

  // ─────────────────────────────────────────────────────────────────────
  // Web Speech API engine
  // ─────────────────────────────────────────────────────────────────────

  const speakChunkWeb = useCallback(
    (chunkIdx: number, spanInChunk: number): void => {
      const s = stateRef.current
      const store = useTtsStore.getState()

      if (chunkIdx >= s.chunks.length) {
        stop()
        return
      }

      s.currentChunkIndex = chunkIdx
      s.currentSpanInChunk = spanInChunk
      s.activeLocalSpanIndex = -1

      const chunk = s.chunks[chunkIdx]
      const startChar = chunk.spanCharStarts[spanInChunk] ?? 0
      const utterText = chunk.text.slice(startChar).trim()

      if (!utterText) {
        speakChunkWeb(chunkIdx + 1, 0)
        return
      }

      let elapsedBefore = 0
      for (let i = 0; i < chunkIdx; i++) {
        elapsedBefore += s.chunks[i].estimatedDurationMs
      }
      if (spanInChunk > 0 && chunk.text.length > 0) {
        elapsedBefore += Math.round(
          (startChar / chunk.text.length) * chunk.estimatedDurationMs
        )
      }
      s.totalElapsedBeforeChunk = elapsedBefore

      const voices = window.speechSynthesis.getVoices()
      const voice = pickVoice(store.selectedVoice, voices)

      console.log(
        `[TTS web] speakChunk ${chunkIdx + 1}/${s.chunks.length} from span ${spanInChunk}, ` +
          `chars=${utterText.length}, voice="${voice?.name ?? '(default)'}"`
      )

      const utterance = new SpeechSynthesisUtterance(utterText)
      if (voice) utterance.voice = voice
      utterance.rate = store.playbackSpeed
      utterance.volume = 1
      utterance.pitch = 1

      const ourToken = s.playToken

      utterance.onstart = (): void => {
        if (s.playToken !== ourToken) return
        store.setIsLoading(false)
        store.setIsPlaying(true)
      }

      utterance.onboundary = (e: SpeechSynthesisEvent): void => {
        if (s.playToken !== ourToken) return
        if (e.name && e.name !== 'word') return

        const chunkCharIdx = startChar + e.charIndex
        const localIdx = findLocalSpanIndex(chunk.spanCharStarts, chunkCharIdx)
        if (localIdx < 0 || localIdx === s.activeLocalSpanIndex) return

        clearHighlight()
        s.activeLocalSpanIndex = localIdx
        const nextSpan = chunk.spans[localIdx]
        if (nextSpan) {
          nextSpan.classList.add('tts-word-active')
          const globalIdx = chunk.startGlobalIndex + localIdx
          if (
            globalIdx - s.lastScrolledGlobalIndex >= 3 ||
            s.lastScrolledGlobalIndex < 0
          ) {
            nextSpan.scrollIntoView({ behavior: 'smooth', block: 'center' })
            s.lastScrolledGlobalIndex = globalIdx
          }
          store.setCurrentWordIndex(globalIdx)
        }

        const chunkProgress =
          chunk.text.length > 0 ? chunkCharIdx / chunk.text.length : 0
        const elapsedInChunk = Math.round(chunkProgress * chunk.estimatedDurationMs)
        store.setTime(s.totalElapsedBeforeChunk + elapsedInChunk, s.totalDurationMs)
      }

      utterance.onend = (): void => {
        if (s.playToken !== ourToken) return
        speakChunkWeb(chunkIdx + 1, 0)
      }

      utterance.onerror = (e: SpeechSynthesisErrorEvent): void => {
        if (s.playToken !== ourToken) return
        if (e.error === 'canceled' || e.error === 'interrupted') return
        console.error('[TTS web] utterance error:', e.error)
        store.setError(`Speech error: ${e.error}`)
        store.setIsPlaying(false)
        store.setIsLoading(false)
      }

      try {
        window.speechSynthesis.speak(utterance)
      } catch (err) {
        console.error('[TTS web] speak() threw:', err)
        store.setError(
          `Failed to start speech: ${err instanceof Error ? err.message : String(err)}`
        )
        store.setIsPlaying(false)
        store.setIsLoading(false)
      }
    },
    [clearHighlight, stop]
  )

  // ─────────────────────────────────────────────────────────────────────
  // OpenAI TTS engine
  // ─────────────────────────────────────────────────────────────────────

  const speakChunkOpenAi = useCallback(
    async (chunkIdx: number, spanInChunk: number): Promise<void> => {
      const s = stateRef.current
      const store = useTtsStore.getState()

      if (chunkIdx >= s.chunks.length) {
        stop()
        return
      }

      s.currentChunkIndex = chunkIdx
      s.currentSpanInChunk = spanInChunk
      s.activeLocalSpanIndex = -1

      const chunk = s.chunks[chunkIdx]
      const startChar = chunk.spanCharStarts[spanInChunk] ?? 0
      const utterText = chunk.text.slice(startChar).trim()

      if (!utterText) {
        speakChunkOpenAi(chunkIdx + 1, 0).catch((err) =>
          console.error('[TTS openai] advance failed:', err)
        )
        return
      }

      let elapsedBefore = 0
      for (let i = 0; i < chunkIdx; i++) {
        elapsedBefore += s.chunks[i].estimatedDurationMs
      }
      if (spanInChunk > 0 && chunk.text.length > 0) {
        elapsedBefore += Math.round(
          (startChar / chunk.text.length) * chunk.estimatedDurationMs
        )
      }
      s.totalElapsedBeforeChunk = elapsedBefore
      s.openaiStartChar = startChar

      // Pre-compute a weighted time profile for this utterance. Used as a
      // fallback until (and unless) Whisper returns a real timing curve.
      const timeWeights = buildTimeWeights(utterText)
      let whisperCurve: TimePoint[] | null = null

      console.log(
        `[TTS openai] speakChunk ${chunkIdx + 1}/${s.chunks.length} from span ${spanInChunk}, ` +
          `chars=${utterText.length}, weightTotal=${timeWeights.total}, voice=${store.openaiVoice}, model=${store.openaiModel}`
      )

      store.setIsLoading(true)
      const ourToken = s.playToken

      // Synthesize via main process
      let result
      try {
        result = await window.api.tts.openaiSynthesize(
          utterText,
          store.openaiVoice,
          store.playbackSpeed,
          store.openaiModel
        )
      } catch (err) {
        if (s.playToken !== ourToken) return
        const message = err instanceof Error ? err.message : String(err)
        console.error('[TTS openai] synthesis error:', message)
        store.setError(`OpenAI TTS error: ${message}`)
        store.setIsLoading(false)
        store.setIsPlaying(false)
        return
      }

      if (s.playToken !== ourToken) {
        // Stale — user cancelled while we were waiting for the API
        return
      }

      // Kick off Whisper transcription in parallel. It returns while the
      // audio is playing and replaces the fallback weighted estimation
      // with ground-truth word timings. Non-blocking — failures are logged
      // and playback silently continues on the weighted curve.
      if (store.whisperSyncEnabled) {
        window.api.tts
          .openaiTranscribe(result.audioBase64)
          .then((wr) => {
            if (s.playToken !== ourToken) return
            const curve = buildTimingCurve(utterText, wr.words)
            if (curve.length > 0) {
              whisperCurve = curve
              console.log(
                `[TTS openai] whisper curve ready — ${wr.words.length} words → ${curve.length} control points`
              )
            } else {
              console.warn('[TTS openai] whisper returned 0 matched points; keeping weighted estimation')
            }
          })
          .catch((err) => {
            console.warn(
              '[TTS openai] whisper transcription failed, keeping weighted estimation:',
              err instanceof Error ? err.message : err
            )
          })
      }

      // Tear down any prior audio before swapping
      teardownOpenAiAudio()

      const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`)
      audio.preload = 'auto'
      s.openaiAudio = audio

      audio.addEventListener('loadedmetadata', () => {
        if (s.playToken !== ourToken) return
        console.log(`[TTS openai] metadata loaded, duration=${audio.duration}s`)
      })

      audio.addEventListener('timeupdate', () => {
        if (s.playToken !== ourToken || s.openaiAudio !== audio) return
        const duration = audio.duration || 0
        if (duration === 0 || !isFinite(duration)) return

        // Prefer Whisper's ground-truth curve once it's available.
        // Fall back to weighted estimation for the first ~1-2s while
        // whisper is still transcribing.
        let relCharIdx: number
        if (whisperCurve && whisperCurve.length > 0) {
          relCharIdx = charAtTime(whisperCurve, audio.currentTime)
        } else {
          const fraction = audio.currentTime / duration
          const targetWeight = fraction * timeWeights.total
          relCharIdx = findCharAtWeight(timeWeights.weights, targetWeight)
        }
        if (relCharIdx < 0) return
        const chunkCharIdx = s.openaiStartChar + relCharIdx

        const localIdx = findLocalSpanIndex(chunk.spanCharStarts, chunkCharIdx)
        if (localIdx >= 0 && localIdx !== s.activeLocalSpanIndex) {
          clearHighlight()
          s.activeLocalSpanIndex = localIdx
          const nextSpan = chunk.spans[localIdx]
          if (nextSpan) {
            nextSpan.classList.add('tts-word-active')
            const globalIdx = chunk.startGlobalIndex + localIdx
            if (
              globalIdx - s.lastScrolledGlobalIndex >= 3 ||
              s.lastScrolledGlobalIndex < 0
            ) {
              nextSpan.scrollIntoView({ behavior: 'smooth', block: 'center' })
              s.lastScrolledGlobalIndex = globalIdx
            }
            store.setCurrentWordIndex(globalIdx)
          }
        }

        // Scrubber time — use real audio position
        store.setTime(
          s.totalElapsedBeforeChunk + audio.currentTime * 1000,
          s.totalDurationMs
        )
      })

      audio.addEventListener('ended', () => {
        if (s.playToken !== ourToken || s.openaiAudio !== audio) return
        speakChunkOpenAi(chunkIdx + 1, 0).catch((err) =>
          console.error('[TTS openai] advance failed:', err)
        )
      })

      audio.addEventListener('error', () => {
        if (s.playToken !== ourToken) return
        const mediaError = audio.error
        const msg = mediaError
          ? `Audio error code ${mediaError.code}: ${mediaError.message || 'unknown'}`
          : 'Audio playback error'
        console.error('[TTS openai]', msg)
        store.setError(msg)
        store.setIsPlaying(false)
        store.setIsLoading(false)
      })

      try {
        await audio.play()
        store.setIsLoading(false)
        store.setIsPlaying(true)
      } catch (err) {
        if (s.playToken !== ourToken) return
        const message = err instanceof Error ? err.message : String(err)
        console.error('[TTS openai] play() rejected:', message)
        store.setError(`Play failed: ${message}`)
        store.setIsLoading(false)
        store.setIsPlaying(false)
      }
    },
    [clearHighlight, stop, teardownOpenAiAudio]
  )

  // ─────────────────────────────────────────────────────────────────────
  // Provider dispatch
  // ─────────────────────────────────────────────────────────────────────

  const speakChunk = useCallback(
    (chunkIdx: number, spanInChunk: number): void => {
      const provider = useTtsStore.getState().ttsProvider
      if (provider === 'openai') {
        speakChunkOpenAi(chunkIdx, spanInChunk).catch((err) =>
          console.error('[TTS] speakChunkOpenAi threw:', err)
        )
      } else {
        speakChunkWeb(chunkIdx, spanInChunk)
      }
    },
    [speakChunkOpenAi, speakChunkWeb]
  )

  // ─────────────────────────────────────────────────────────────────────
  // Initialization, seek, play, keyboard
  // ─────────────────────────────────────────────────────────────────────

  const initializePlayback = useCallback(
    async (startAt?: HTMLElement): Promise<void> => {
      const store = useTtsStore.getState()
      const s = stateRef.current

      s.playToken++
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* ignore */
      }
      teardownOpenAiAudio()
      clearHighlight()

      const spans = collectSpans()
      console.log(`[TTS] Collected ${spans.length} spans from DOM`)
      if (spans.length === 0) {
        store.setError('No text to read in this document')
        store.setTransportVisible(true)
        return
      }

      // Only Web Speech needs voice loading; OpenAI is unaffected.
      if (store.ttsProvider === 'web-speech') {
        await waitForVoices()
      }

      const chunks = buildChunks(spans)
      console.log(`[TTS] Built ${chunks.length} chunks (provider=${store.ttsProvider})`)
      const totalDuration = chunks.reduce((sum, c) => sum + c.estimatedDurationMs, 0)

      s.allSpans = spans
      s.chunks = chunks
      s.currentChunkIndex = 0
      s.currentSpanInChunk = 0
      s.activeLocalSpanIndex = -1
      s.lastScrolledGlobalIndex = -1
      s.totalElapsedBeforeChunk = 0
      s.totalDurationMs = totalDuration

      store.setTransportVisible(true)
      store.setTotalWords(spans.length)
      store.setError(null)
      store.setIsLoading(true)
      store.setTime(0, totalDuration)

      let startChunkIdx = 0
      let startLocalIdx = 0
      if (startAt) {
        const cIdx = chunks.findIndex((c) => c.spans.includes(startAt))
        if (cIdx >= 0) {
          startChunkIdx = cIdx
          startLocalIdx = chunks[cIdx].spans.indexOf(startAt)
          if (startLocalIdx < 0) startLocalIdx = 0
        }
      }

      // Small delay so any engine cancel settles before the next speak
      setTimeout(() => speakChunk(startChunkIdx, startLocalIdx), 20)
    },
    [clearHighlight, speakChunk, teardownOpenAiAudio]
  )

  const play = useCallback(async (): Promise<void> => {
    console.log('[TTS] play() called')
    await initializePlayback()
  }, [initializePlayback])

  const seekToSpan = useCallback(
    (target: HTMLElement): void => {
      const s = stateRef.current
      const store = useTtsStore.getState()

      if (s.chunks.length === 0) {
        console.log('[TTS] seekToSpan while idle — initializing from target')
        initializePlayback(target).catch((err) =>
          console.error('[TTS] init from seek failed:', err)
        )
        return
      }

      const chunkIdx = s.chunks.findIndex((c) => c.spans.includes(target))
      if (chunkIdx < 0) return
      const localIdx = s.chunks[chunkIdx].spans.indexOf(target)
      if (localIdx < 0) return

      console.log(`[TTS] seekToSpan → chunk ${chunkIdx}, local ${localIdx}`)

      // Fast path for OpenAI: if the seek target is inside the currently
      // loaded chunk's audio, just move audio.currentTime. No re-synthesis.
      if (
        store.ttsProvider === 'openai' &&
        s.openaiAudio &&
        chunkIdx === s.currentChunkIndex
      ) {
        const chunk = s.chunks[chunkIdx]
        const targetChar = chunk.spanCharStarts[localIdx] ?? 0
        const relChar = targetChar - s.openaiStartChar
        if (relChar >= 0 && chunk.text.length - s.openaiStartChar > 0) {
          const duration = s.openaiAudio.duration || 0
          if (duration > 0 && isFinite(duration)) {
            const fraction = relChar / (chunk.text.length - s.openaiStartChar)
            s.openaiAudio.currentTime = Math.max(0, fraction * duration)
            s.activeLocalSpanIndex = -1
            clearHighlight()
            if (!useTtsStore.getState().isPlaying) {
              s.openaiAudio.play().catch((err) =>
                console.error('[TTS openai] seek-resume failed:', err)
              )
            }
            return
          }
        }
      }

      // Slow path: cancel current engine and re-speak from the target span
      s.playToken++
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* ignore */
      }
      teardownOpenAiAudio()
      clearHighlight()
      s.activeLocalSpanIndex = -1

      setTimeout(() => speakChunk(chunkIdx, localIdx), 50)
    },
    [clearHighlight, speakChunk, initializePlayback, teardownOpenAiAudio]
  )

  // Restart the current chunk from the active span when speed, voice, provider,
  // OpenAI voice, or OpenAI model changes mid-playback.
  useEffect(() => {
    const unsub = useTtsStore.subscribe((state, prev) => {
      const changed =
        state.playbackSpeed !== prev.playbackSpeed ||
        state.selectedVoice !== prev.selectedVoice ||
        state.ttsProvider !== prev.ttsProvider ||
        state.openaiVoice !== prev.openaiVoice ||
        state.openaiModel !== prev.openaiModel
      if (!changed) return

      const s = stateRef.current
      if (s.chunks.length === 0) return

      // Are we actually playing something? Either engine.
      const webSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending
      const openAiPlaying = s.openaiAudio && !s.openaiAudio.paused
      if (!webSpeaking && !openAiPlaying) return

      const resumeFromSpan =
        s.activeLocalSpanIndex >= 0 ? s.activeLocalSpanIndex : s.currentSpanInChunk

      s.playToken++
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* ignore */
      }
      teardownOpenAiAudio()
      setTimeout(() => speakChunk(s.currentChunkIndex, resumeFromSpan), 50)
    })
    return unsub
  }, [speakChunk, teardownOpenAiAudio])

  // On first mount, ensure the Web Speech voice is valid. Skipped if provider
  // is openai — the store already holds a valid OpenAI voice by default.
  useEffect(() => {
    let cancelled = false
    const init = async (): Promise<void> => {
      const store = useTtsStore.getState()
      if (store.ttsProvider !== 'web-speech') return
      const voices = await waitForVoices()
      if (cancelled) return
      const current = store.selectedVoice
      const valid = voices.some((v) => v.name === current)
      if (!valid) {
        const picked = pickVoice('', voices)
        if (picked) {
          console.log(`[TTS] auto-picked voice: ${picked.name}`)
          store.setVoice(picked.name)
        }
      }
    }
    init().catch((err) => console.error('[TTS] voice init failed:', err))
    return () => {
      cancelled = true
    }
  }, [])

  // Register controller so toolbar/transport can call these
  useEffect(() => {
    registerTtsController({ play, pause, resume, stop, seekToSpan })
    return () => registerTtsController(null)
  }, [play, pause, resume, stop, seekToSpan])

  // Cleanup on unmount
  useEffect(() => {
    return () => fullCleanup()
  }, [fullCleanup])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const store = useTtsStore.getState()
      if (e.key === 'Escape' && store.transportVisible) {
        e.preventDefault()
        stop()
      }
      if (e.key === ' ' && store.transportVisible) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          if (store.isPlaying) pause()
          else resume()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [stop, pause, resume])
}
