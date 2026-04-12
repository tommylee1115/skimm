import { create } from 'zustand'

export type ChunkingLevel = 'none' | 'sentence' | 'clause'

// Settings keys that should persist across sessions
const PERSISTED_KEYS = [
  'theme', 'fontFamily', 'fontSize', 'lineHeight', 'maxWidth',
  'chunkingLevel', 'lineFocusLines'
] as const

interface ReaderStore {
  theme: 'light' | 'dark'
  fontFamily: string
  fontSize: number
  lineHeight: number
  maxWidth: number
  lineFocusEnabled: boolean
  lineFocusLines: 1 | 2 | 3
  focusLineIndex: number
  beelineEnabled: boolean
  chunkingLevel: ChunkingLevel
  _loaded: boolean

  loadSettings: () => Promise<void>
  toggleTheme: () => void
  setFontFamily: (font: string) => void
  setFontSize: (size: number) => void
  setLineHeight: (height: number) => void
  setMaxWidth: (width: number) => void
  toggleLineFocus: () => void
  setLineFocusLines: (lines: 1 | 2 | 3) => void
  moveFocusUp: () => void
  moveFocusDown: () => void
  setFocusLineIndex: (index: number) => void
  toggleBeeline: () => void
  setChunkingLevel: (level: ChunkingLevel) => void
}

function persistSetting(key: string, value: unknown): void {
  window.api.settings.set(`reader.${key}`, value)
}

export const useReaderStore = create<ReaderStore>((set) => ({
  theme: 'dark',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
  fontSize: 18,
  lineHeight: 1.8,
  maxWidth: 860,
  lineFocusEnabled: false,
  lineFocusLines: 1,
  focusLineIndex: 0,
  beelineEnabled: false,
  chunkingLevel: 'sentence',
  _loaded: false,

  loadSettings: async () => {
    const settings: Record<string, unknown> = {}
    for (const key of PERSISTED_KEYS) {
      const val = await window.api.settings.get(`reader.${key}`)
      if (val !== undefined && val !== null) {
        settings[key] = val
      }
    }
    if (Object.keys(settings).length > 0) {
      set(settings as Partial<ReaderStore>)
      // Apply theme
      if (settings.theme) {
        document.documentElement.setAttribute('data-theme', settings.theme as string)
      }
    }
    set({ _loaded: true })
  },

  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'light' ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', next)
      persistSetting('theme', next)
      return { theme: next }
    }),
  setFontFamily: (fontFamily) => {
    set({ fontFamily })
    persistSetting('fontFamily', fontFamily)
  },
  setFontSize: (fontSize) => {
    const clamped = Math.max(12, Math.min(32, fontSize))
    set({ fontSize: clamped })
    persistSetting('fontSize', clamped)
  },
  setLineHeight: (lineHeight) => {
    const clamped = Math.max(1.2, Math.min(3.0, lineHeight))
    set({ lineHeight: clamped })
    persistSetting('lineHeight', clamped)
  },
  setMaxWidth: (maxWidth) => {
    const clamped = Math.max(400, Math.min(1200, maxWidth))
    set({ maxWidth: clamped })
    persistSetting('maxWidth', clamped)
  },
  toggleLineFocus: () => set((s) => ({ lineFocusEnabled: !s.lineFocusEnabled })),
  setLineFocusLines: (lineFocusLines) => {
    set({ lineFocusLines })
    persistSetting('lineFocusLines', lineFocusLines)
  },
  moveFocusUp: () => set((s) => ({ focusLineIndex: Math.max(0, s.focusLineIndex - 1) })),
  moveFocusDown: () => set((s) => ({ focusLineIndex: s.focusLineIndex + 1 })),
  setFocusLineIndex: (focusLineIndex) => set({ focusLineIndex }),
  toggleBeeline: () => set((s) => ({ beelineEnabled: !s.beelineEnabled })),
  setChunkingLevel: (chunkingLevel) => {
    set({ chunkingLevel })
    persistSetting('chunkingLevel', chunkingLevel)
  }
}))
