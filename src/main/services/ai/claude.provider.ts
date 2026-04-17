import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AIExplanationRequest, AIExplainChunk } from './provider.interface'

// Claude Haiku 4.5 pricing (USD per million tokens). Keep in sync with
// https://www.anthropic.com/pricing when Anthropic updates them.
const HAIKU_4_5_INPUT_PRICE_PER_MTOK = 1.0
const HAIKU_4_5_OUTPUT_PRICE_PER_MTOK = 5.0
const MODEL_ID = 'claude-haiku-4-5-20251001'

export class ClaudeProvider implements AIProvider {
  readonly name = 'Claude'
  private client: Anthropic | null = null

  setApiKey(key: string): void {
    this.client = new Anthropic({ apiKey: key })
  }

  async *explain(
    request: AIExplanationRequest,
    signal?: AbortSignal
  ): AsyncGenerator<AIExplainChunk, void, unknown> {
    if (!this.client) {
      yield { type: 'text', text: 'Error: No API key configured. Go to Settings to add your Claude API key.' }
      return
    }

    const { text, context, fullDocument, language } = request

    const langInstruction = language === 'ko'
      ? 'Respond in Korean (한국어). Simple, natural Korean.'
      : 'Respond in simple English (A2-B1 level). Short, common words.'

    // Trim document if too long (keep under ~8k chars to save tokens)
    const docPreview = fullDocument.length > 8000
      ? fullDocument.slice(0, 8000) + '\n\n[... document truncated ...]'
      : fullDocument

    const systemPrompt = `You explain English text to a Korean reader.

${langInstruction}

STRICT RULES:
- Maximum 2 sentences. One sentence is ideal.
- Explain what it means HERE in this document, not dictionary definition.
- No preamble, no "In this context", no "This means", no hedging.
- Just the meaning. Direct.`

    const userMessage = `## Document
${docPreview}

## Surrounding paragraph
${context}

## Selected text to explain
"${text}"`

    // Combine the caller's cancel signal with a 30s hard timeout. Either
    // one firing tears the stream down via the SDK's AbortSignal plumbing.
    const timeout = AbortSignal.timeout(30_000)
    const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout

    try {
      const stream = this.client.messages.stream(
        {
          model: MODEL_ID,
          max_tokens: Math.min(400, Math.max(150, text.length * 2)),
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        },
        { signal: combinedSignal }
      )

      for await (const event of stream) {
        if (combinedSignal.aborted) return
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text }
        }
      }

      if (combinedSignal.aborted) return

      // After streaming completes, surface the token usage so the renderer
      // can show per-card cost in the Explain panel.
      const finalMessage = await stream.finalMessage()
      const inputTokens = finalMessage.usage.input_tokens
      const outputTokens = finalMessage.usage.output_tokens
      const costUsd =
        (inputTokens / 1_000_000) * HAIKU_4_5_INPUT_PRICE_PER_MTOK +
        (outputTokens / 1_000_000) * HAIKU_4_5_OUTPUT_PRICE_PER_MTOK

      yield {
        type: 'usage',
        usage: { inputTokens, outputTokens, model: MODEL_ID, costUsd }
      }
    } catch (err) {
      // Clean user-cancel — swallow without surfacing an error message.
      if (signal?.aborted) return
      const name = err instanceof Error ? err.name : ''
      if (name === 'APIUserAbortError' || name === 'AbortError') return
      // Timeout surfaces as a TimeoutError (TimeoutError on AbortSignal.timeout).
      if (name === 'TimeoutError' || combinedSignal.aborted) {
        yield {
          type: 'text',
          text: 'Error: request timed out after 30 seconds. Check your network and retry.'
        }
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'text', text: `Error: ${msg}` }
    }
  }
}
