export interface AIExplanationRequest {
  text: string              // selected word or phrase
  context: string           // surrounding paragraph
  fullDocument: string      // entire markdown file content
  language: 'ko' | 'en'
  sourceFile?: string       // filename for reference
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

export interface AIProvider {
  readonly name: string
  explain(request: AIExplanationRequest): AsyncGenerator<AIExplainChunk, void, unknown>
}
