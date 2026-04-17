import type { TtsChunk, EngineCallbacks, EngineHandle } from './types'
import { findLocalSpanIndex } from './chunk-builder'

/**
 * Web Speech API engine. Stateless module-level function — instantiates
 * one SpeechSynthesisUtterance per chunk and reports word-boundary events
 * via callbacks. Web Speech has no seek within an utterance, so
 * seekWithinChunk always returns false (the coordinator must cancel and
 * restart with the new span).
 */

interface WebSpeechOptions {
  voice: SpeechSynthesisVoice | null
  rate: number
}

export function startWebSpeechChunk(
  chunk: TtsChunk,
  spanInChunk: number,
  opts: WebSpeechOptions,
  cb: EngineCallbacks
): EngineHandle {
  const startChar = chunk.spanCharStarts[spanInChunk] ?? 0
  const utterText = chunk.text.slice(startChar).trim()

  let activeLocalIndex = -1

  // Empty span → ask coordinator to advance.
  if (!utterText) {
    queueMicrotask(() => {
      if (cb.ourToken !== cb.getToken()) return
      cb.onChunkEnd()
    })
    return noopHandle()
  }

  const utterance = new SpeechSynthesisUtterance(utterText)
  if (opts.voice) utterance.voice = opts.voice
  utterance.rate = opts.rate
  utterance.volume = 1
  utterance.pitch = 1

  utterance.onstart = (): void => {
    if (cb.ourToken !== cb.getToken()) return
    cb.onLoadingEnd()
    cb.onPlaybackStart()
  }

  utterance.onboundary = (e: SpeechSynthesisEvent): void => {
    if (cb.ourToken !== cb.getToken()) return
    if (e.name && e.name !== 'word') return

    const chunkCharIdx = startChar + e.charIndex
    const localIdx = findLocalSpanIndex(chunk.spanCharStarts, chunkCharIdx)
    if (localIdx < 0 || localIdx === activeLocalIndex) return

    activeLocalIndex = localIdx
    cb.onWordAdvance(localIdx)

    const chunkProgress = chunk.text.length > 0 ? chunkCharIdx / chunk.text.length : 0
    cb.onTimeUpdate(Math.round(chunkProgress * chunk.estimatedDurationMs))
  }

  utterance.onend = (): void => {
    if (cb.ourToken !== cb.getToken()) return
    cb.onChunkEnd()
  }

  utterance.onerror = (e: SpeechSynthesisErrorEvent): void => {
    if (cb.ourToken !== cb.getToken()) return
    if (e.error === 'canceled' || e.error === 'interrupted') return
    cb.onError(`Speech error: ${e.error}`)
  }

  try {
    window.speechSynthesis.speak(utterance)
  } catch (err) {
    cb.onError(
      `Failed to start speech: ${err instanceof Error ? err.message : String(err)}`
    )
    return noopHandle()
  }

  return {
    pause: () => {
      try {
        window.speechSynthesis.pause()
      } catch {
        /* ignore */
      }
    },
    resume: () => {
      try {
        window.speechSynthesis.resume()
      } catch {
        /* ignore */
      }
    },
    cancel: () => {
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* ignore */
      }
    },
    // Web Speech has no intra-utterance seek primitive.
    seekWithinChunk: () => false
  }
}

function noopHandle(): EngineHandle {
  return {
    pause: () => {},
    resume: () => {},
    cancel: () => {},
    seekWithinChunk: () => false
  }
}
