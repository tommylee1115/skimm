import { loadOpenAIKey } from './openai-key'

export interface WhisperWord {
  word: string
  start: number // seconds
  end: number
}

export interface WhisperResult {
  words: WhisperWord[]
  durationSec: number
}

const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'

/**
 * Transcribe an audio buffer via OpenAI Whisper and return word-level
 * timestamps. Used to get ground-truth timing for TTS playback word sync.
 *
 * Called immediately after TTS synthesis — runs in parallel with the
 * renderer's audio playback so the latency is hidden.
 */
export async function openAiTranscribe(audioBase64: string): Promise<WhisperResult> {
  const key = loadOpenAIKey()
  if (!key) {
    throw new Error('OpenAI API key not available for Whisper transcription')
  }

  const buffer = Buffer.from(audioBase64, 'base64')
  const startedAt = Date.now()

  // FormData / Blob / fetch are all global in Node 22 / Electron 35
  const blob = new Blob([buffer], { type: 'audio/mpeg' })
  const form = new FormData()
  form.append('file', blob, 'audio.mp3')
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('language', 'en')

  const resp = await fetch(WHISPER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`
      // Don't set Content-Type — fetch picks the multipart boundary automatically
    },
    body: form
  })

  if (!resp.ok) {
    let detail = ''
    try {
      detail = await resp.text()
    } catch {
      /* ignore */
    }
    throw new Error(
      `Whisper ${resp.status} ${resp.statusText}${detail ? ': ' + detail.slice(0, 400) : ''}`
    )
  }

  const json = (await resp.json()) as {
    duration: number
    words?: Array<{ word: string; start: number; end: number }>
  }

  const words = (json.words ?? []).map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end
  }))

  console.log(
    `[Whisper] transcribed ${buffer.length} bytes → ${words.length} words in ${Date.now() - startedAt}ms`
  )

  return {
    words,
    durationSec: json.duration
  }
}
