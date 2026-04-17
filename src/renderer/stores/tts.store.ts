import { create } from 'zustand'
import type { OpenAIVoice, OpenAIModel, TtsProvider } from '@shared/tts.types'

// Re-exports let existing imports from '@/stores/tts.store' keep working.
export type { OpenAIVoice, OpenAIModel, TtsProvider }

/**
 * Per-document TTS overrides. When the user changes speed/voice/provider
 * while a file is the active tab, those choices are remembered for that
 * file and restored automatically on return. Falls back to the global
 * defaults if no entry exists for the active file.
 */
export interface PerDocTts {
  speed?: number
  selectedVoice?: string
  openaiVoice?: OpenAIVoice
  openaiModel?: OpenAIModel
  provider?: TtsProvider
}

interface TtsStore {
  // Visibility + state
  transportVisible: boolean
  isPlaying: boolean
  isLoading: boolean
  errorMessage: string | null

  // Settings
  playbackSpeed: number       // 0.5 – 2.0
  ttsProvider: TtsProvider    // which engine to use
  selectedVoice: string       // Web Speech voice name (when provider = web-speech)
  openaiVoice: OpenAIVoice    // OpenAI voice id  (when provider = openai)
  openaiModel: OpenAIModel    // OpenAI model id  (when provider = openai)
  whisperSyncEnabled: boolean // OpenAI: use Whisper for accurate word timing

  // Per-document memory
  activeFilePath: string | null
  perDoc: Record<string, PerDocTts>

  // Playback state
  currentWordIndex: number    // -1 if no active word
  totalWords: number
  currentTimeMs: number
  durationMs: number

  // Actions
  setTransportVisible: (visible: boolean) => void
  setIsPlaying: (playing: boolean) => void
  setIsLoading: (loading: boolean) => void
  setError: (msg: string | null) => void
  setSpeed: (speed: number) => void
  setProvider: (provider: TtsProvider) => void
  setVoice: (voice: string) => void
  setOpenaiVoice: (voice: OpenAIVoice) => void
  setOpenaiModel: (model: OpenAIModel) => void
  setWhisperSyncEnabled: (enabled: boolean) => void
  setCurrentWordIndex: (idx: number) => void
  setTotalWords: (n: number) => void
  setTime: (currentMs: number, durationMs: number) => void
  /** Switch active file. Hydrates settings from perDoc[path] if it exists;
   *  otherwise leaves current settings untouched. */
  setActiveFilePath: (path: string | null) => void
  loadSettings: () => Promise<void>
}

// Empty default = useTts auto-picks the highest-scoring Web Speech voice.
// Legacy msedge-tts names and Microsoft David (the robotic Windows default)
// are discarded on load so the auto-picker re-runs.
const DEFAULT_WEB_VOICE = ''
const DISCARDED_VOICE_PATTERNS = [
  /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/,
  /microsoft david/i
]

const DEFAULT_OPENAI_VOICE: OpenAIVoice = 'nova'
const DEFAULT_OPENAI_MODEL: OpenAIModel = 'tts-1-hd'

const VALID_OPENAI_VOICES: OpenAIVoice[] = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse'
]
const VALID_OPENAI_MODELS: OpenAIModel[] = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts']

/**
 * Controller registry — lets external components (toolbar buttons, transport
 * bar) call into the useTts hook's imperative methods. The hook registers
 * itself on mount.
 */
export interface TtsController {
  play: () => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => void
  seekToSpan: (span: HTMLElement) => void
}

let controller: TtsController | null = null

export function registerTtsController(c: TtsController | null): void {
  controller = c
}

export function getTtsController(): TtsController | null {
  return controller
}

// Module-scoped flag so setters can tell "user changed the slider" from
// "perDoc hydration applied this value automatically." Only the former
// should write back to perDoc. Prevents a feedback loop.
let hydratingPerDoc = false

/** Merge a patch into perDoc[activeFilePath] and persist. No-op when no
 *  file is active (e.g. welcome screen). */
function writePerDoc(
  get: () => TtsStore,
  set: (partial: Partial<TtsStore>) => void,
  patch: Partial<PerDocTts>
): void {
  const state = get()
  const path = state.activeFilePath
  if (!path) return
  const nextEntry: PerDocTts = { ...(state.perDoc[path] ?? {}), ...patch }
  const nextPerDoc = { ...state.perDoc, [path]: nextEntry }
  set({ perDoc: nextPerDoc })
  window.api.settings.set('tts.perDoc', nextPerDoc)
}

export const useTtsStore = create<TtsStore>((set, get) => ({
  transportVisible: false,
  isPlaying: false,
  isLoading: false,
  errorMessage: null,
  playbackSpeed: 1.0,
  ttsProvider: 'openai',
  selectedVoice: DEFAULT_WEB_VOICE,
  openaiVoice: DEFAULT_OPENAI_VOICE,
  openaiModel: DEFAULT_OPENAI_MODEL,
  whisperSyncEnabled: true,
  activeFilePath: null,
  perDoc: {},
  currentWordIndex: -1,
  totalWords: 0,
  currentTimeMs: 0,
  durationMs: 0,

  setTransportVisible: (transportVisible) => set({ transportVisible }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (errorMessage) => set({ errorMessage }),

  setSpeed: (playbackSpeed) => {
    const clamped = Math.max(0.5, Math.min(2.0, playbackSpeed))
    set({ playbackSpeed: clamped })
    if (!hydratingPerDoc) {
      window.api.settings.set('tts.speed', clamped)
      writePerDoc(get, set, { speed: clamped })
    }
  },

  setProvider: (ttsProvider) => {
    set({ ttsProvider })
    if (!hydratingPerDoc) {
      window.api.settings.set('tts.provider', ttsProvider)
      writePerDoc(get, set, { provider: ttsProvider })
    }
  },

  setVoice: (selectedVoice) => {
    set({ selectedVoice })
    if (!hydratingPerDoc) {
      window.api.settings.set('tts.voice', selectedVoice)
      writePerDoc(get, set, { selectedVoice })
    }
  },

  setOpenaiVoice: (openaiVoice) => {
    set({ openaiVoice })
    if (!hydratingPerDoc) {
      window.api.settings.set('tts.openaiVoice', openaiVoice)
      writePerDoc(get, set, { openaiVoice })
    }
  },

  setOpenaiModel: (openaiModel) => {
    set({ openaiModel })
    if (!hydratingPerDoc) {
      window.api.settings.set('tts.openaiModel', openaiModel)
      writePerDoc(get, set, { openaiModel })
    }
  },

  setWhisperSyncEnabled: (whisperSyncEnabled) => {
    set({ whisperSyncEnabled })
    if (!hydratingPerDoc) {
      window.api.settings.set('tts.whisperSyncEnabled', whisperSyncEnabled)
    }
  },

  setCurrentWordIndex: (currentWordIndex) => set({ currentWordIndex }),
  setTotalWords: (totalWords) => set({ totalWords }),
  setTime: (currentTimeMs, durationMs) => set({ currentTimeMs, durationMs }),

  setActiveFilePath: (path) => {
    set({ activeFilePath: path })
    if (!path) return
    const entry = get().perDoc[path]
    if (!entry) return
    // Apply per-doc overrides without re-persisting them back.
    hydratingPerDoc = true
    try {
      if (typeof entry.speed === 'number') get().setSpeed(entry.speed)
      if (entry.provider) get().setProvider(entry.provider)
      if (entry.selectedVoice !== undefined) get().setVoice(entry.selectedVoice)
      if (entry.openaiVoice) get().setOpenaiVoice(entry.openaiVoice)
      if (entry.openaiModel) get().setOpenaiModel(entry.openaiModel)
    } finally {
      hydratingPerDoc = false
    }
  },

  loadSettings: async () => {
    // One IPC round-trip for all tts.* keys; openaiAvailable stays separate
    // because it runs a filesystem check, not a store lookup.
    const [persisted, openaiAvailable] = await Promise.all([
      window.api.settings.getMany([
        'tts.voice',
        'tts.speed',
        'tts.provider',
        'tts.openaiVoice',
        'tts.openaiModel',
        'tts.whisperSyncEnabled',
        'tts.perDoc'
      ]),
      window.api.tts.openaiAvailable()
    ])
    const voice = persisted['tts.voice']
    const speed = persisted['tts.speed']
    const provider = persisted['tts.provider']
    const openaiVoice = persisted['tts.openaiVoice']
    const openaiModel = persisted['tts.openaiModel']
    const whisperSync = persisted['tts.whisperSyncEnabled']
    const perDocRaw = persisted['tts.perDoc']

    const isDiscarded =
      typeof voice === 'string' &&
      DISCARDED_VOICE_PATTERNS.some((re) => re.test(voice))
    const usableWebVoice =
      typeof voice === 'string' && voice && !isDiscarded ? voice : DEFAULT_WEB_VOICE
    if (usableWebVoice !== voice) {
      window.api.settings.set('tts.voice', usableWebVoice)
    }

    // Default to OpenAI when the key is available, otherwise Web Speech.
    const resolvedProvider: TtsProvider =
      provider === 'openai' || provider === 'web-speech'
        ? provider
        : openaiAvailable
          ? 'openai'
          : 'web-speech'
    // Downgrade silently if user had openai selected but the key disappeared
    const finalProvider: TtsProvider =
      resolvedProvider === 'openai' && !openaiAvailable ? 'web-speech' : resolvedProvider

    const resolvedOpenaiVoice: OpenAIVoice =
      typeof openaiVoice === 'string' && VALID_OPENAI_VOICES.includes(openaiVoice as OpenAIVoice)
        ? (openaiVoice as OpenAIVoice)
        : DEFAULT_OPENAI_VOICE

    const resolvedOpenaiModel: OpenAIModel =
      typeof openaiModel === 'string' && VALID_OPENAI_MODELS.includes(openaiModel as OpenAIModel)
        ? (openaiModel as OpenAIModel)
        : DEFAULT_OPENAI_MODEL

    const perDoc: Record<string, PerDocTts> =
      perDocRaw && typeof perDocRaw === 'object' && !Array.isArray(perDocRaw)
        ? (perDocRaw as Record<string, PerDocTts>)
        : {}

    set({
      selectedVoice: usableWebVoice,
      playbackSpeed: typeof speed === 'number' ? speed : 1.0,
      ttsProvider: finalProvider,
      openaiVoice: resolvedOpenaiVoice,
      openaiModel: resolvedOpenaiModel,
      whisperSyncEnabled: typeof whisperSync === 'boolean' ? whisperSync : true,
      perDoc
    })
  }
}))
