import { create } from 'zustand'

export interface AIUsage {
  inputTokens: number
  outputTokens: number
  model: string
  costUsd: number
}

export interface Explanation {
  id: string
  text: string              // selected word/phrase
  selectionType: 'word' | 'phrase' | 'sentence'
  explanation: string       // AI response
  context: string           // surrounding paragraph
  sourceFile: string
  language: 'ko' | 'en'
  timestamp: number
  usage?: AIUsage
}

interface AiStore {
  panelOpen: boolean
  language: 'ko' | 'en'
  panelFontSize: number
  explanations: Explanation[]
  currentExplanation: string    // streaming accumulator
  currentUsage: AIUsage | null  // usage from the in-flight call
  isLoading: boolean
  selectedText: string
  selectedContext: string
  selectedSourceFile: string

  togglePanel: () => void
  setLanguage: (lang: 'ko' | 'en') => void
  setPanelFontSize: (size: number) => void
  requestExplanation: (text: string, context: string, fullDocument: string, sourceFile: string) => void
  appendChunk: (chunk: string) => void
  setUsage: (usage: AIUsage) => void
  finishExplanation: () => void
  removeExplanation: (id: string) => void
  clearHistory: () => void
}

function detectSelectionType(text: string): 'word' | 'phrase' | 'sentence' {
  const trimmed = text.trim()
  if (!trimmed.includes(' ')) return 'word'
  const wordCount = trimmed.split(/\s+/).length
  if (wordCount >= 15) return 'sentence'
  return 'phrase'
}

export const useAiStore = create<AiStore>((set, get) => ({
  panelOpen: false,
  language: 'ko',
  panelFontSize: 14,
  explanations: [],
  currentExplanation: '',
  currentUsage: null,
  isLoading: false,
  selectedText: '',
  selectedContext: '',
  selectedSourceFile: '',

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  setLanguage: (language) => {
    set({ language })
    window.api.settings.set('ai.language', language)
  },

  setPanelFontSize: (panelFontSize) => {
    const clamped = Math.max(11, Math.min(20, panelFontSize))
    set({ panelFontSize: clamped })
    window.api.settings.set('ai.panelFontSize', clamped)
  },

  requestExplanation: (text, context, fullDocument, sourceFile) => {
    const { language } = get()

    // Open panel and start loading
    set({
      panelOpen: true,
      isLoading: true,
      currentExplanation: '',
      currentUsage: null,
      selectedText: text,
      selectedContext: context,
      selectedSourceFile: sourceFile
    })

    // Set up stream listeners
    window.api.ai.removeStreamListeners()
    window.api.ai.onStream((chunk) => {
      get().appendChunk(chunk)
    })
    window.api.ai.onUsage((usage) => {
      get().setUsage(usage)
    })
    window.api.ai.onDone(() => {
      get().finishExplanation()
    })

    // Fire the request
    window.api.ai.explain({
      text,
      context,
      fullDocument,
      language,
      sourceFile
    })
  },

  appendChunk: (chunk) => {
    set((s) => ({ currentExplanation: s.currentExplanation + chunk }))
  },

  setUsage: (usage) => {
    set({ currentUsage: usage })
  },

  finishExplanation: () => {
    const {
      selectedText,
      currentExplanation,
      currentUsage,
      selectedContext,
      selectedSourceFile,
      language
    } = get()

    const explanation: Explanation = {
      id: crypto.randomUUID(),
      text: selectedText,
      selectionType: detectSelectionType(selectedText),
      explanation: currentExplanation,
      context: selectedContext,
      sourceFile: selectedSourceFile,
      language,
      timestamp: Date.now(),
      usage: currentUsage ?? undefined
    }

    set((s) => ({
      isLoading: false,
      currentUsage: null,
      explanations: [explanation, ...s.explanations]
    }))

    window.api.ai.removeStreamListeners()
  },

  removeExplanation: (id: string) => {
    set((s) => ({ explanations: s.explanations.filter((e) => e.id !== id) }))
  },
  clearHistory: () => set({ explanations: [] })
}))
