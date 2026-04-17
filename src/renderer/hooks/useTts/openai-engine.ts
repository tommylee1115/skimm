import type { OpenAIVoice, OpenAIModel } from '@shared/tts.types'
import type { TtsChunk, EngineCallbacks, EngineHandle } from './types'
import {
  buildTimeWeights,
  findCharAtWeight,
  findLocalSpanIndex
} from './chunk-builder'
import { buildTimingCurve, charAtTime, type TimePoint } from '@/lib/speech/whisper-map'

/**
 * OpenAI TTS engine. Kicks off synthesis via main-process IPC, then
 * plays the returned base64 MP3 via an <audio>. Fires a parallel
 * Whisper transcription to replace the weighted-estimation time curve
 * with ground-truth word timings once it lands — playback stays on
 * the weighted estimate until then so we never block the audio.
 *
 * seekWithinChunk handles the OpenAI fast path: if the seek is inside
 * the currently loaded chunk's audio, we just move audio.currentTime
 * rather than re-synthesising.
 */

interface OpenAiOptions {
  voice: OpenAIVoice
  model: OpenAIModel
  speed: number
  whisperSync: boolean
}

export interface OpenAiEngineRun extends EngineHandle {
  /** Currently loaded audio (null until synth returns). */
  getAudio(): HTMLAudioElement | null
  /** Char offset in chunk.text where the current audio starts. */
  getStartChar(): number
}

export function startOpenAiChunk(
  chunk: TtsChunk,
  spanInChunk: number,
  opts: OpenAiOptions,
  cb: EngineCallbacks
): OpenAiEngineRun {
  const startChar = chunk.spanCharStarts[spanInChunk] ?? 0
  const utterText = chunk.text.slice(startChar).trim()
  let activeLocalIndex = -1
  let audio: HTMLAudioElement | null = null
  let cancelled = false
  let whisperCurve: TimePoint[] | null = null

  // Empty span → advance.
  if (!utterText) {
    queueMicrotask(() => {
      if (cb.ourToken !== cb.getToken()) return
      cb.onChunkEnd()
    })
    return noopRun(startChar)
  }

  const timeWeights = buildTimeWeights(utterText)

  void (async () => {
    let result: Awaited<ReturnType<typeof window.api.tts.openaiSynthesize>>
    try {
      result = await window.api.tts.openaiSynthesize(
        utterText,
        opts.voice,
        opts.speed,
        opts.model
      )
    } catch (err) {
      if (cancelled || cb.ourToken !== cb.getToken()) return
      cb.onError(
        `OpenAI TTS error: ${err instanceof Error ? err.message : String(err)}`
      )
      return
    }

    if (cancelled || cb.ourToken !== cb.getToken()) return

    // Fire Whisper transcription in parallel. Audio plays on the weighted
    // estimation until (and if) the curve lands.
    if (opts.whisperSync) {
      window.api.tts
        .openaiTranscribe(result.audioBase64)
        .then((wr) => {
          if (cancelled || cb.ourToken !== cb.getToken()) return
          const curve = buildTimingCurve(utterText, wr.words)
          if (curve.length > 0) whisperCurve = curve
        })
        .catch(() => {
          /* best-effort — stay on weighted estimate */
        })
    }

    audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`)
    audio.preload = 'auto'

    audio.addEventListener('timeupdate', () => {
      if (cancelled || cb.ourToken !== cb.getToken()) return
      const duration = audio?.duration ?? 0
      if (!audio || duration === 0 || !isFinite(duration)) return

      // Prefer Whisper's ground-truth curve once available; otherwise
      // use the weighted-punctuation estimate.
      let relCharIdx: number
      if (whisperCurve && whisperCurve.length > 0) {
        relCharIdx = charAtTime(whisperCurve, audio.currentTime)
      } else {
        const fraction = audio.currentTime / duration
        const target = fraction * timeWeights.total
        relCharIdx = findCharAtWeight(timeWeights.weights, target)
      }
      if (relCharIdx < 0) return
      const chunkCharIdx = startChar + relCharIdx
      const localIdx = findLocalSpanIndex(chunk.spanCharStarts, chunkCharIdx)
      if (localIdx >= 0 && localIdx !== activeLocalIndex) {
        activeLocalIndex = localIdx
        cb.onWordAdvance(localIdx)
      }
      cb.onTimeUpdate(audio.currentTime * 1000)
    })

    audio.addEventListener('ended', () => {
      if (cancelled || cb.ourToken !== cb.getToken()) return
      cb.onChunkEnd()
    })

    audio.addEventListener('error', () => {
      if (cancelled || cb.ourToken !== cb.getToken()) return
      const mediaError = audio?.error
      cb.onError(
        mediaError
          ? `Audio error code ${mediaError.code}: ${mediaError.message || 'unknown'}`
          : 'Audio playback error'
      )
    })

    try {
      await audio.play()
      if (cancelled || cb.ourToken !== cb.getToken()) return
      cb.onLoadingEnd()
      cb.onPlaybackStart()
    } catch (err) {
      if (cancelled || cb.ourToken !== cb.getToken()) return
      cb.onError(
        `Play failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  })()

  return {
    pause: () => {
      try {
        audio?.pause()
      } catch {
        /* ignore */
      }
    },
    resume: () => {
      audio?.play().catch(() => {
        /* paused state was stale; ignore */
      })
    },
    cancel: () => {
      cancelled = true
      if (audio) {
        try {
          audio.pause()
          audio.src = ''
        } catch {
          /* ignore */
        }
        audio = null
      }
    },
    /**
     * Fast-path seek: only handle if we're targeting the same chunk
     * that's currently loaded. Otherwise the coordinator needs to
     * cancel+restart with a fresh synth call.
     */
    seekWithinChunk: (targetChunkIdx: number, currentChunkIdx: number, targetSpanLocalIdx: number): boolean => {
      if (!audio) return false
      if (targetChunkIdx !== currentChunkIdx) return false

      const duration = audio.duration || 0
      if (duration <= 0 || !isFinite(duration)) return false

      const targetChar = chunk.spanCharStarts[targetSpanLocalIdx] ?? 0
      const relChar = targetChar - startChar
      const remaining = chunk.text.length - startChar
      if (relChar < 0 || remaining <= 0) return false

      const fraction = relChar / remaining
      audio.currentTime = Math.max(0, fraction * duration)
      activeLocalIndex = -1
      audio.play().catch(() => {
        /* ignore */
      })
      return true
    },
    getAudio: () => audio,
    getStartChar: () => startChar
  }
}

function noopRun(startChar: number): OpenAiEngineRun {
  return {
    pause: () => {},
    resume: () => {},
    cancel: () => {},
    seekWithinChunk: () => false,
    getAudio: () => null,
    getStartChar: () => startChar
  }
}
