/**
 * Backwards-compatible facade over the shared AI types. Keeping this file
 * so existing main-side imports from './provider.interface' keep working
 * while the source of truth lives in src/shared/ai.types.
 */
export type {
  AIExplanationRequest,
  AIUsage,
  AIExplainChunk
} from '../../../shared/ai.types'

import type { AIExplanationRequest, AIExplainChunk } from '../../../shared/ai.types'

export interface AIProvider {
  readonly name: string
  explain(
    request: AIExplanationRequest,
    signal?: AbortSignal
  ): AsyncGenerator<AIExplainChunk, void, unknown>
}
