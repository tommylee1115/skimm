/**
 * TTS types shared across main, preload, and renderer.
 * Purely compile-time — type-only imports are erased at build.
 */

export type OpenAIVoice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'fable'
  | 'onyx'
  | 'nova'
  | 'sage'
  | 'shimmer'
  | 'verse'

export type OpenAIModel = 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts'

export interface OpenAiSynthesisResult {
  audioBase64: string
  mimeType: 'audio/mpeg'
  /** Bytes of the MP3 — a rough duration hint, not exact. */
  bytes: number
}

export interface WhisperWord {
  word: string
  start: number
  end: number
}

export interface WhisperResult {
  words: WhisperWord[]
  durationSec: number
}

export type TtsProvider = 'openai' | 'web-speech'
