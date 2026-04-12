import { create } from 'zustand'

// Mirror of the preload types. Kept inline so the renderer's tsconfig
// doesn't need to cross into src/preload.
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

export type TtsProvider = 'openai' | 'web-speech'

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

export const useTtsStore = create<TtsStore>((set) => ({
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
    window.api.settings.set('tts.speed', clamped)
  },

  setProvider: (ttsProvider) => {
    set({ ttsProvider })
    window.api.settings.set('tts.provider', ttsProvider)
  },

  setVoice: (selectedVoice) => {
    set({ selectedVoice })
    window.api.settings.set('tts.voice', selectedVoice)
  },

  setOpenaiVoice: (openaiVoice) => {
    set({ openaiVoice })
    window.api.settings.set('tts.openaiVoice', openaiVoice)
  },

  setOpenaiModel: (openaiModel) => {
    set({ openaiModel })
    window.api.settings.set('tts.openaiModel', openaiModel)
  },

  setWhisperSyncEnabled: (whisperSyncEnabled) => {
    set({ whisperSyncEnabled })
    window.api.settings.set('tts.whisperSyncEnabled', whisperSyncEnabled)
  },

  setCurrentWordIndex: (currentWordIndex) => set({ currentWordIndex }),
  setTotalWords: (totalWords) => set({ totalWords }),
  setTime: (currentTimeMs, durationMs) => set({ currentTimeMs, durationMs }),

  loadSettings: async () => {
    const [voice, speed, provider, openaiVoice, openaiModel, whisperSync, openaiAvailable] =
      await Promise.all([
        window.api.settings.get('tts.voice'),
        window.api.settings.get('tts.speed'),
        window.api.settings.get('tts.provider'),
        window.api.settings.get('tts.openaiVoice'),
        window.api.settings.get('tts.openaiModel'),
        window.api.settings.get('tts.whisperSyncEnabled'),
        window.api.tts.openaiAvailable()
      ])

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

    set({
      selectedVoice: usableWebVoice,
      playbackSpeed: typeof speed === 'number' ? speed : 1.0,
      ttsProvider: finalProvider,
      openaiVoice: resolvedOpenaiVoice,
      openaiModel: resolvedOpenaiModel,
      whisperSyncEnabled: typeof whisperSync === 'boolean' ? whisperSync : true
    })
  }
}))
