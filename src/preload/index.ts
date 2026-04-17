import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AIExplanationRequest,
  AIUsage
} from '../shared/ai.types'
import type {
  OpenAIVoice,
  OpenAIModel,
  OpenAiSynthesisResult,
  WhisperResult,
  WhisperWord
} from '../shared/tts.types'
import type { StudyCard } from '../shared/study.types'

// Re-exports. Historical names stay available for back-compat:
//   AIExplainRequest → AIExplanationRequest
//   StudyCardData   → StudyCard
export type {
  AIExplanationRequest,
  AIUsage,
  OpenAIVoice,
  OpenAIModel,
  OpenAiSynthesisResult,
  WhisperResult,
  WhisperWord,
  StudyCard
}
export type AIExplainRequest = AIExplanationRequest
export type StudyCardData = StudyCard

/** Union surfaced by `update.onStatus`. Kept inline so preload stays
 *  self-contained — the matching definition lives in main/ipc/update.ts. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number; version?: string }
  | { state: 'downloaded' }
  | { state: 'error'; message: string }

export interface FileResult {
  path: string
  content: string
}

export interface SkimmApi {
  app: {
    version: () => Promise<string>
  }
  update: {
    onDownloaded: (callback: () => void) => void
    install: () => Promise<void>
    /** Trigger a manual update check. Results arrive via onStatus. */
    check: () => Promise<void>
    /** Subscribe to live update state (checking / available /
     *  downloading / downloaded / error / up-to-date). */
    onStatus: (callback: (status: UpdateStatus) => void) => void
  }
  file: {
    openDialog: () => Promise<FileResult | null>
    read: (path: string) => Promise<FileResult>
    openFolderDialog: () => Promise<string | null>
  }
  ai: {
    // The caller generates the requestId. All stream events are tagged
    // with the same id, so the caller can filter out events from
    // superseded requests and target ai.cancel at a specific in-flight
    // stream.
    explain: (requestId: string, request: AIExplanationRequest) => Promise<string>
    cancel: (requestId: string) => Promise<void>
    onStream: (callback: (requestId: string, chunk: string) => void) => void
    onUsage: (callback: (requestId: string, usage: AIUsage) => void) => void
    onDone: (callback: (requestId: string, aborted: boolean) => void) => void
    removeStreamListeners: () => void
  }
  tts: {
    openaiAvailable: () => Promise<boolean>
    openaiSynthesize: (
      text: string,
      voice: OpenAIVoice,
      speed: number,
      model: OpenAIModel
    ) => Promise<OpenAiSynthesisResult>
    openaiTranscribe: (audioBase64: string) => Promise<WhisperResult>
  }
  cards: {
    save: (card: StudyCard) => Promise<void>
    list: () => Promise<StudyCard[]>
    delete: (id: string) => Promise<void>
    search: (query: string) => Promise<StudyCard[]>
  }
  settings: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    /** Batch getter — one IPC round-trip per `load settings` call. */
    getMany: (keys: string[]) => Promise<Record<string, unknown>>
  }
  onDragDrop: (callback: (filePaths: string[]) => void) => void
}

const api: SkimmApi = {
  app: {
    version: () => ipcRenderer.invoke('app:version')
  },
  update: {
    onDownloaded: (callback) => {
      ipcRenderer.on('update:downloaded', () => callback())
    },
    install: () => ipcRenderer.invoke('update:install'),
    check: () => ipcRenderer.invoke('update:check'),
    onStatus: (callback) => {
      ipcRenderer.on('update:status', (_event, status: UpdateStatus) => callback(status))
    }
  },
  file: {
    openDialog: () => ipcRenderer.invoke('file:open-dialog'),
    read: (path: string) => ipcRenderer.invoke('file:read', path),
    openFolderDialog: () => ipcRenderer.invoke('file:open-folder-dialog')
  },
  ai: {
    explain: (requestId, request) => ipcRenderer.invoke('ai:explain', requestId, request),
    cancel: (requestId) => ipcRenderer.invoke('ai:cancel', requestId),
    onStream: (callback) => {
      ipcRenderer.on(
        'ai:explain-stream',
        (_event, envelope: { requestId: string; text: string }) =>
          callback(envelope.requestId, envelope.text)
      )
    },
    onUsage: (callback) => {
      ipcRenderer.on(
        'ai:explain-usage',
        (_event, envelope: { requestId: string; usage: AIUsage }) =>
          callback(envelope.requestId, envelope.usage)
      )
    },
    onDone: (callback) => {
      ipcRenderer.on(
        'ai:explain-done',
        (_event, envelope: { requestId: string; aborted: boolean }) =>
          callback(envelope.requestId, envelope.aborted)
      )
    },
    removeStreamListeners: () => {
      ipcRenderer.removeAllListeners('ai:explain-stream')
      ipcRenderer.removeAllListeners('ai:explain-usage')
      ipcRenderer.removeAllListeners('ai:explain-done')
    }
  },
  tts: {
    openaiAvailable: () => ipcRenderer.invoke('tts:openai-available'),
    openaiSynthesize: (text, voice, speed, model) =>
      ipcRenderer.invoke('tts:openai-synthesize', text, voice, speed, model),
    openaiTranscribe: (audioBase64) => ipcRenderer.invoke('tts:openai-transcribe', audioBase64)
  },
  cards: {
    save: (card) => ipcRenderer.invoke('cards:save', card),
    list: () => ipcRenderer.invoke('cards:list'),
    delete: (id) => ipcRenderer.invoke('cards:delete', id),
    search: (query) => ipcRenderer.invoke('cards:search', query)
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getMany: (keys) => ipcRenderer.invoke('settings:getMany', keys)
  },
  onDragDrop: (callback) => {
    document.addEventListener('drop', async (e) => {
      // Only handle drops that carry actual OS files (external drag).
      // Internal drags (e.g. sidebar file-row reorder) use a custom MIME
      // type and are handled by React handlers — we must not swallow them.
      const hasFiles = e.dataTransfer && e.dataTransfer.types.includes('Files')
      if (!hasFiles) return

      e.preventDefault()
      e.stopPropagation()
      const files = Array.from(e.dataTransfer?.files || [])
        .filter((f) => f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.name.endsWith('.txt'))
        .map((f) => {
          try {
            return webUtils.getPathForFile(f)
          } catch {
            return (f as unknown as { path?: string }).path ?? ''
          }
        })
        .filter((p) => p.length > 0)
      if (files.length === 0) return

      // Authorise these paths with main BEFORE handing them to the renderer,
      // so the renderer's subsequent file:read calls don't bounce off the
      // allow-list.
      const accepted = (await ipcRenderer.invoke('file:register-dropped', files)) as string[]
      if (accepted.length > 0) callback(accepted)
    })
    document.addEventListener('dragover', (e) => {
      // Only preventDefault for external file drags so the browser shows
      // the "drop allowed" cursor. Internal drags are handled by React's
      // onDragOver handlers and must not be intercepted here.
      const hasFiles = e.dataTransfer && e.dataTransfer.types.includes('Files')
      if (!hasFiles) return

      e.preventDefault()
      e.stopPropagation()
    })
  }
}

contextBridge.exposeInMainWorld('api', api)
