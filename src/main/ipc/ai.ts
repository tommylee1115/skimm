import { ipcMain } from 'electron'
import { aiManager } from '../services/ai/ai-manager'
import type { AIExplanationRequest } from '../../shared/ai.types'

// In-flight AI explain streams keyed by renderer-supplied requestId.
// ai:cancel looks up the AbortController here to stop the matching stream.
const inflightExplains = new Map<string, AbortController>()

export function registerAiIpc(): void {
  /**
   * Stream an AI explanation. Every call is tagged with a renderer-generated
   * requestId so the renderer can drop stale events from a superseded
   * request and route cancels to the right in-flight stream.
   */
  ipcMain.handle(
    'ai:explain',
    async (event, requestId: string, request: AIExplanationRequest) => {
      const provider = aiManager.getProvider()
      const abort = new AbortController()
      inflightExplains.set(requestId, abort)
      const textChunks: string[] = []

      try {
        for await (const chunk of provider.explain(request, abort.signal)) {
          if (abort.signal.aborted) break
          if (chunk.type === 'text') {
            event.sender.send('ai:explain-stream', { requestId, text: chunk.text })
            textChunks.push(chunk.text)
          } else if (chunk.type === 'usage') {
            event.sender.send('ai:explain-usage', { requestId, usage: chunk.usage })
          }
        }
        event.sender.send('ai:explain-done', {
          requestId,
          aborted: abort.signal.aborted
        })
        return textChunks.join('')
      } finally {
        inflightExplains.delete(requestId)
      }
    }
  )

  /** Cancel an in-flight stream. No-op if it already finished. */
  ipcMain.handle('ai:cancel', (_event, requestId: string) => {
    const abort = inflightExplains.get(requestId)
    if (abort) abort.abort()
  })
}
