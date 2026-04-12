import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface FileResult {
  path: string
  content: string
}

export interface AIExplainRequest {
  text: string
  context: string
  fullDocument: string
  language: 'ko' | 'en'
  sourceFile?: string
}

export interface AIUsage {
  inputTokens: number
  outputTokens: number
  model: string
  costUsd: number
}

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

export interface SkimmApi {
  app: {
    version: () => Promise<string>
  }
  update: {
    onDownloaded: (callback: () => void) => void
    install: () => Promise<void>
  }
  file: {
    openDialog: () => Promise<FileResult | null>
    read: (path: string) => Promise<FileResult>
    openFolderDialog: () => Promise<string | null>
  }
  ai: {
    explain: (request: AIExplainRequest) => Promise<string>
    onStream: (callback: (chunk: string) => void) => void
    onUsage: (callback: (usage: AIUsage) => void) => void
    onDone: (callback: () => void) => void
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
    save: (card: StudyCardData) => Promise<void>
    list: () => Promise<StudyCardData[]>
    delete: (id: string) => Promise<void>
    search: (query: string) => Promise<StudyCardData[]>
  }
  settings: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
  }
  onDragDrop: (callback: (filePaths: string[]) => void) => void
}

export interface StudyCardData {
  id: string
  selected_text: string
  selection_type: 'word' | 'phrase' | 'sentence'
  explanation: string
  language: string
  context: string
  source_file: string
  saved_at: string
}

const api: SkimmApi = {
  app: {
    version: () => ipcRenderer.invoke('app:version')
  },
  update: {
    onDownloaded: (callback) => {
      ipcRenderer.on('update:downloaded', () => callback())
    },
    install: () => ipcRenderer.invoke('update:install')
  },
  file: {
    openDialog: () => ipcRenderer.invoke('file:open-dialog'),
    read: (path: string) => ipcRenderer.invoke('file:read', path),
    openFolderDialog: () => ipcRenderer.invoke('file:open-folder-dialog')
  },
  ai: {
    explain: (request) => ipcRenderer.invoke('ai:explain', request),
    onStream: (callback) => {
      ipcRenderer.on('ai:explain-stream', (_event, chunk: string) => callback(chunk))
    },
    onUsage: (callback) => {
      ipcRenderer.on('ai:explain-usage', (_event, usage: AIUsage) => callback(usage))
    },
    onDone: (callback) => {
      ipcRenderer.on('ai:explain-done', () => callback())
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
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value)
  },
  onDragDrop: (callback) => {
    document.addEventListener('drop', (e) => {
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
      if (files.length > 0) callback(files)
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
