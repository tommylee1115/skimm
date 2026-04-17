import { useEffect, useRef, useCallback } from 'react'
import { useTtsStore, registerTtsController } from '@/stores/tts.store'
import { pickVoice, waitForVoices } from '@/lib/speech/web-speech'
import type { TtsChunk, EngineHandle } from './types'
import { collectSpans, buildChunks } from './chunk-builder'
import { startWebSpeechChunk } from './web-speech-engine'
import { startOpenAiChunk, type OpenAiEngineRun } from './openai-engine'

/**
 * Public TTS coordinator hook.
 *
 * Owns all chunk/position state and the play token. Engines are pure
 * per-chunk starters that fire callbacks; this file dispatches the
 * right engine per `store.ttsProvider`, handles seek fast-paths, and
 * registers the controller so the toolbar / transport can drive play,
 * pause, resume, stop, and seek.
 */

interface InternalState {
  allSpans: HTMLElement[]
  chunks: TtsChunk[]
  currentChunkIndex: number
  currentSpanInChunk: number
  activeLocalSpanIndex: number
  playToken: number
  lastScrolledGlobalIndex: number
  totalElapsedBeforeChunk: number
  totalDurationMs: number
  activeEngine: EngineHandle | null
  /** When the active engine is OpenAI, its run handle is stored here so
   *  seekWithinChunk can use the fast path. */
  activeOpenAi: OpenAiEngineRun | null
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
    activeEngine: null,
    activeOpenAi: null
  })

  // ─────────────────────────────────────────────────────────────────────
  // Highlight + scroll helpers
  // ─────────────────────────────────────────────────────────────────────

  const clearHighlight = useCallback(() => {
    document
      .querySelectorAll<HTMLElement>('.tts-word-active')
      .forEach((el) => el.classList.remove('tts-word-active'))
  }, [])

  const applyWordHighlight = useCallback(
    (chunk: TtsChunk, localIdx: number) => {
      const s = stateRef.current
      if (localIdx < 0 || localIdx === s.activeLocalSpanIndex) return
      clearHighlight()
      s.activeLocalSpanIndex = localIdx
      const span = chunk.spans[localIdx]
      if (!span) return
      span.classList.add('tts-word-active')
      const globalIdx = chunk.startGlobalIndex + localIdx
      if (globalIdx - s.lastScrolledGlobalIndex >= 3 || s.lastScrolledGlobalIndex < 0) {
        span.scrollIntoView({ behavior: 'smooth', block: 'center' })
        s.lastScrolledGlobalIndex = globalIdx
      }
      useTtsStore.getState().setCurrentWordIndex(globalIdx)
    },
    [clearHighlight]
  )

  // ─────────────────────────────────────────────────────────────────────
  // Engine teardown
  // ─────────────────────────────────────────────────────────────────────

  const cancelActiveEngine = useCallback(() => {
    const s = stateRef.current
    try {
      s.activeEngine?.cancel()
    } catch {
      /* ignore */
    }
    s.activeEngine = null
    s.activeOpenAi = null
    // Web Speech retains utterance state across browser tabs; belt-and-
    // braces cancel even when we already called engine.cancel().
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
  }, [])

  const fullCleanup = useCallback(() => {
    const s = stateRef.current
    s.playToken++
    cancelActiveEngine()
    clearHighlight()
    s.allSpans = []
    s.chunks = []
    s.currentChunkIndex = 0
    s.currentSpanInChunk = 0
    s.activeLocalSpanIndex = -1
    s.lastScrolledGlobalIndex = -1
    s.totalElapsedBeforeChunk = 0
    s.totalDurationMs = 0
  }, [cancelActiveEngine, clearHighlight])

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
    stateRef.current.activeEngine?.pause()
    useTtsStore.getState().setIsPlaying(false)
  }, [])

  const resume = useCallback(() => {
    stateRef.current.activeEngine?.resume()
    useTtsStore.getState().setIsPlaying(true)
  }, [])

  // ─────────────────────────────────────────────────────────────────────
  // Start a chunk on whichever engine the user selected
  // ─────────────────────────────────────────────────────────────────────

  const speakChunk = useCallback(
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

      // Running total through prior chunks + partial-current for accurate scrub.
      let elapsedBefore = 0
      for (let i = 0; i < chunkIdx; i++) elapsedBefore += s.chunks[i].estimatedDurationMs
      if (spanInChunk > 0 && chunk.text.length > 0) {
        elapsedBefore += Math.round(
          (startChar / chunk.text.length) * chunk.estimatedDurationMs
        )
      }
      s.totalElapsedBeforeChunk = elapsedBefore

      store.setIsLoading(true)
      const ourToken = s.playToken

      const callbacks = {
        ourToken,
        getToken: () => stateRef.current.playToken,
        onLoadingEnd: () => store.setIsLoading(false),
        onPlaybackStart: () => store.setIsPlaying(true),
        onWordAdvance: (localIdx: number) => applyWordHighlight(chunk, localIdx),
        onTimeUpdate: (elapsedInChunk: number) => {
          store.setTime(s.totalElapsedBeforeChunk + elapsedInChunk, s.totalDurationMs)
        },
        onChunkEnd: () => speakChunk(chunkIdx + 1, 0),
        onError: (msg: string) => {
          store.setError(msg)
          store.setIsPlaying(false)
          store.setIsLoading(false)
        }
      }

      cancelActiveEngine()

      if (store.ttsProvider === 'openai') {
        const run = startOpenAiChunk(
          chunk,
          spanInChunk,
          {
            voice: store.openaiVoice,
            model: store.openaiModel,
            speed: store.playbackSpeed,
            whisperSync: store.whisperSyncEnabled
          },
          callbacks
        )
        s.activeEngine = run
        s.activeOpenAi = run
      } else {
        const voices = window.speechSynthesis.getVoices()
        const voice = pickVoice(store.selectedVoice, voices)
        s.activeEngine = startWebSpeechChunk(
          chunk,
          spanInChunk,
          { voice, rate: store.playbackSpeed },
          callbacks
        )
        s.activeOpenAi = null
      }
    },
    [applyWordHighlight, cancelActiveEngine, stop]
  )

  // ─────────────────────────────────────────────────────────────────────
  // Init + seek + public play
  // ─────────────────────────────────────────────────────────────────────

  const initializePlayback = useCallback(
    async (startAt?: HTMLElement): Promise<void> => {
      const store = useTtsStore.getState()
      const s = stateRef.current

      s.playToken++
      cancelActiveEngine()
      clearHighlight()

      const spans = collectSpans()
      if (spans.length === 0) {
        store.setError('No text to read in this document')
        store.setTransportVisible(true)
        return
      }

      // Only Web Speech needs voice loading; OpenAI is unaffected.
      if (store.ttsProvider === 'web-speech') await waitForVoices()

      const chunks = buildChunks(spans)
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

      // Small delay so any engine cancel settles before the next speak.
      setTimeout(() => speakChunk(startChunkIdx, startLocalIdx), 20)
    },
    [cancelActiveEngine, clearHighlight, speakChunk]
  )

  const play = useCallback(async (): Promise<void> => {
    await initializePlayback()
  }, [initializePlayback])

  const seekToSpan = useCallback(
    (target: HTMLElement): void => {
      const s = stateRef.current

      if (s.chunks.length === 0) {
        initializePlayback(target).catch((err) =>
          // eslint-disable-next-line no-console
          console.error('[TTS] init from seek failed:', err)
        )
        return
      }

      const chunkIdx = s.chunks.findIndex((c) => c.spans.includes(target))
      if (chunkIdx < 0) return
      const localIdx = s.chunks[chunkIdx].spans.indexOf(target)
      if (localIdx < 0) return

      // Fast path: ask the engine to seek inside the currently loaded
      // chunk. If it can't (Web Speech, or a different chunk), fall
      // through to cancel+restart.
      if (s.activeOpenAi) {
        const handled = s.activeOpenAi.seekWithinChunk(chunkIdx, s.currentChunkIndex, localIdx)
        if (handled) {
          clearHighlight()
          s.activeLocalSpanIndex = -1
          if (!useTtsStore.getState().isPlaying) useTtsStore.getState().setIsPlaying(true)
          return
        }
      }

      // Slow path: bump token, cancel, re-speak from target.
      s.playToken++
      cancelActiveEngine()
      clearHighlight()
      s.activeLocalSpanIndex = -1
      setTimeout(() => speakChunk(chunkIdx, localIdx), 50)
    },
    [cancelActiveEngine, clearHighlight, initializePlayback, speakChunk]
  )

  // ─────────────────────────────────────────────────────────────────────
  // Effects: restart on speed/voice/provider change mid-playback,
  // voice auto-pick on mount, controller registration, cleanup,
  // keyboard shortcuts.
  // ─────────────────────────────────────────────────────────────────────

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

      const webSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending
      const openAiPlaying = !!s.activeOpenAi?.getAudio() && !s.activeOpenAi.getAudio()?.paused
      if (!webSpeaking && !openAiPlaying) return

      const resumeFromSpan =
        s.activeLocalSpanIndex >= 0 ? s.activeLocalSpanIndex : s.currentSpanInChunk

      s.playToken++
      cancelActiveEngine()
      setTimeout(() => speakChunk(s.currentChunkIndex, resumeFromSpan), 50)
    })
    return unsub
  }, [cancelActiveEngine, speakChunk])

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
        if (picked) store.setVoice(picked.name)
      }
    }
    init().catch(() => {
      /* best-effort voice init */
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    registerTtsController({ play, pause, resume, stop, seekToSpan })
    return () => registerTtsController(null)
  }, [play, pause, resume, stop, seekToSpan])

  useEffect(() => {
    return () => fullCleanup()
  }, [fullCleanup])

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
