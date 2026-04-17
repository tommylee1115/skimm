import { create } from 'zustand'
import type { AIUsage } from '@shared/ai.types'

// Re-export for existing `import { AIUsage } from '@/stores/ai.store'` sites.
export type { AIUsage }

/**
 * In-memory cap on the explanations array. Power users who click a lot
 * can accumulate hundreds of entries per session — each holds the full
 * streamed explanation text plus context. At ~1 KB per card this is
 * bounded at ~100 KB of React state. Saved cards live in SQLite.
 */
const MAX_EXPLANATIONS = 100

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
  currentRequestId: string | null  // id of the stream currently owning the UI state
  isLoading: boolean
  selectedText: string
  selectedContext: string
  selectedSourceFile: string
  streamListenersRegistered: boolean

  togglePanel: () => void
  setLanguage: (lang: 'ko' | 'en') => void
  setPanelFontSize: (size: number) => void
  requestExplanation: (text: string, context: string, fullDocument: string, sourceFile: string) => void
  cancelExplanation: () => void
  appendChunk: (chunk: string) => void
  setUsage: (usage: AIUsage) => void
  finishExplanation: (aborted: boolean) => void
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
  currentRequestId: null,
  isLoading: false,
  selectedText: '',
  selectedContext: '',
  selectedSourceFile: '',
  streamListenersRegistered: false,

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
    const { language, streamListenersRegistered } = get()
    const requestId = crypto.randomUUID()

    // Open panel and start loading. currentRequestId becomes the gate:
    // any stream/usage/done events whose requestId doesn't match this are
    // dropped by the listeners below.
    set({
      panelOpen: true,
      isLoading: true,
      currentExplanation: '',
      currentUsage: null,
      currentRequestId: requestId,
      selectedText: text,
      selectedContext: context,
      selectedSourceFile: sourceFile
    })

    // Register stream listeners once per app session. Filtering by requestId
    // on each event makes re-registration unnecessary and avoids the
    // remove-then-register race that let superseded streams corrupt a
    // newer card.
    if (!streamListenersRegistered) {
      window.api.ai.onStream((id, chunk) => {
        if (id !== get().currentRequestId) return
        get().appendChunk(chunk)
      })
      window.api.ai.onUsage((id, usage) => {
        if (id !== get().currentRequestId) return
        get().setUsage(usage)
      })
      window.api.ai.onDone((id, aborted) => {
        if (id !== get().currentRequestId) return
        get().finishExplanation(aborted)
      })
      set({ streamListenersRegistered: true })
    }

    // Fire the request (fire-and-forget — stream events drive the UI)
    window.api.ai.explain(requestId, {
      text,
      context,
      fullDocument,
      language,
      sourceFile
    })
  },

  cancelExplanation: () => {
    const id = get().currentRequestId
    if (!id) return
    window.api.ai.cancel(id)
    // Optimistically clear loading state. The main-side `done` event will
    // arrive with aborted=true shortly after, but its handler will no-op
    // because we've already nulled currentRequestId.
    set({
      isLoading: false,
      currentExplanation: '',
      currentUsage: null,
      currentRequestId: null
    })
  },

  appendChunk: (chunk) => {
    set((s) => ({ currentExplanation: s.currentExplanation + chunk }))
  },

  setUsage: (usage) => {
    set({ currentUsage: usage })
  },

  finishExplanation: (aborted) => {
    if (aborted) {
      // A cancelled stream leaves no card behind — the user clicked Cancel
      // and doesn't want the partial result.
      set({
        isLoading: false,
        currentExplanation: '',
        currentUsage: null,
        currentRequestId: null
      })
      return
    }
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
      currentRequestId: null,
      // Cap in-memory history at MAX_EXPLANATIONS. Older cards the user
      // wanted to keep are still in SQLite via "Save to study cards";
      // unsaved ones fall off the bottom of the panel.
      explanations: [explanation, ...s.explanations].slice(0, MAX_EXPLANATIONS)
    }))
  },

  removeExplanation: (id: string) => {
    set((s) => ({ explanations: s.explanations.filter((e) => e.id !== id) }))
  },
  clearHistory: () => set({ explanations: [] })
}))
