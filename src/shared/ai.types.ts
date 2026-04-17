/**
 * AI explanation types shared across main, preload, and renderer.
 */

export interface AIExplanationRequest {
  /** Selected word or phrase to explain. */
  text: string
  /** Surrounding paragraph (grounds the explanation). */
  context: string
  /** Full markdown document (gives the model whole-doc context). */
  fullDocument: string
  language: 'ko' | 'en'
  /** Optional source filename, for UI citation. */
  sourceFile?: string
}

export interface AIUsage {
  inputTokens: number
  outputTokens: number
  model: string
  costUsd: number
}

export type AIExplainChunk =
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: AIUsage }
