import { loadOpenAIKey } from './openai-key'
import type { OpenAIVoice, OpenAIModel, OpenAiSynthesisResult } from '../../../shared/tts.types'

// Re-exports preserved for back-compat with existing main-side imports.
export type { OpenAIVoice, OpenAIModel, OpenAiSynthesisResult }

const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech'

/**
 * Synthesize speech via OpenAI's TTS API. Returns the MP3 audio as base64
 * so the caller can ship it over IPC without worrying about Buffer transfers.
 *
 * Throws if the API key is not available or the request fails.
 */
export async function openAiSynthesize(
  text: string,
  voice: OpenAIVoice,
  speed: number,
  model: OpenAIModel
): Promise<OpenAiSynthesisResult> {
  const key = loadOpenAIKey()
  if (!key) {
    throw new Error(
      'OpenAI API key not available. Set OPENAI_API_KEY or place it in C:\\MGT4170\\ClassKeys\\classkey.env'
    )
  }

  const clampedSpeed = Math.max(0.25, Math.min(4.0, speed))

  const startedAt = Date.now()
  console.log(
    `[OpenAI TTS] synth start — model=${model}, voice=${voice}, speed=${clampedSpeed}, chars=${text.length}`
  )

  const resp = await fetch(OPENAI_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: 'mp3',
      speed: clampedSpeed
    }),
    // Hard 30s timeout. A hung OpenAI request leaves the renderer stuck
    // on "loading" forever without this.
    signal: AbortSignal.timeout(30_000)
  })

  if (!resp.ok) {
    let detail = ''
    try {
      detail = await resp.text()
    } catch {
      /* ignore */
    }
    throw new Error(
      `OpenAI TTS ${resp.status} ${resp.statusText}${detail ? ': ' + detail.slice(0, 400) : ''}`
    )
  }

  const arrayBuffer = await resp.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const audioBase64 = buffer.toString('base64')

  console.log(
    `[OpenAI TTS] synth done in ${Date.now() - startedAt}ms — ${buffer.length} bytes MP3`
  )

  return {
    audioBase64,
    mimeType: 'audio/mpeg',
    bytes: buffer.length
  }
}
