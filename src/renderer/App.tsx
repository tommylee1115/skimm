import { useState, useCallback, useEffect } from 'react'
import { IconBar, type SidebarView } from '@/components/layout/IconBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { ResizeHandle } from '@/components/layout/ResizeHandle'
import { MainPane } from '@/components/layout/MainPane'
import { AiPanel } from '@/components/layout/AiPanel'
import { DragDropOverlay } from '@/components/layout/DragDropOverlay'
import { UpdateBanner } from '@/components/layout/UpdateBanner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useFileStore } from '@/stores/file.store'
import { useReaderStore } from '@/stores/reader.store'
import { useAiStore } from '@/stores/ai.store'
import { useTtsStore } from '@/stores/tts.store'

export default function App() {
  const [sidebarView, setSidebarView] = useState<SidebarView>('files')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const aiPanelOpen = useAiStore((s) => s.panelOpen)
  const toggleAiPanel = useAiStore((s) => s.togglePanel)
  const [aiPanelWidth, setAiPanelWidth] = useState(320)

  const handleSidebarResize = useCallback(
    (delta: number) => setSidebarWidth((w) => Math.max(180, Math.min(400, w + delta))),
    []
  )

  const handleAiPanelResize = useCallback(
    (delta: number) => setAiPanelWidth((w) => Math.max(250, Math.min(500, w - delta))),
    []
  )

  // Restore session on startup
  useEffect(() => {
    useReaderStore.getState().loadSettings()
    useTtsStore.getState().loadSettings()
    useFileStore.getState().restoreSession()
    window.api.settings.get('ai.language').then((lang) => {
      if (lang === 'ko' || lang === 'en') useAiStore.getState().setLanguage(lang)
    })
    window.api.settings.get('ai.panelFontSize').then((size) => {
      if (typeof size === 'number') useAiStore.getState().setPanelFontSize(size)
    })
  }, [])

  // Bridge file-store active tab into the TTS store so per-document TTS
  // overrides (speed/voice/provider remembered per file) can hydrate on
  // tab switch. Subscribe once at mount.
  useEffect(() => {
    const syncActivePath = (): void => {
      const { activeFileId, openFiles } = useFileStore.getState()
      const path = openFiles.find((f) => f.id === activeFileId)?.path ?? null
      useTtsStore.getState().setActiveFilePath(path)
    }
    // Apply once (handles restored session) and subscribe for changes.
    syncActivePath()
    return useFileStore.subscribe(syncActivePath)
  }, [])

  // Drag and drop handler
  useEffect(() => {
    window.api.onDragDrop(async (filePaths) => {
      for (const path of filePaths) {
        const result = await window.api.file.read(path)
        useFileStore.getState().openFile(result.path, result.content)
      }
    })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+O — open file
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        window.api.file.openDialog().then((result) => {
          if (result) useFileStore.getState().openFile(result.path, result.content)
        })
      }
      // Ctrl+B — toggle sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        setSidebarOpen((o) => !o)
      }
      // Ctrl+J — toggle AI panel
      if (e.ctrlKey && e.key === 'j') {
        e.preventDefault()
        toggleAiPanel()
      }
      // Ctrl+W — close active tab (not the app window)
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        const { activeFileId, closeFile } = useFileStore.getState()
        if (activeFileId) closeFile(activeFileId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-full w-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Icon bar (always visible) */}
      <IconBar
        activeView={sidebarView}
        onViewChange={setSidebarView}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />

      {/* Left sidebar */}
      <Sidebar view={sidebarView} open={sidebarOpen} width={sidebarWidth} />
      {sidebarOpen && <ResizeHandle onResize={handleSidebarResize} />}

      {/* Center reading pane — wrapped in an error boundary so a crash in
          the markdown pipeline or TTS DOM walker can't blank the window. */}
      <ErrorBoundary label="Reading pane">
        <MainPane />
      </ErrorBoundary>

      {/* Right AI panel — same protection. An error in the streaming
          explanation renderer stays contained. */}
      {aiPanelOpen && <ResizeHandle onResize={handleAiPanelResize} />}
      <ErrorBoundary label="Explain panel">
        <AiPanel open={aiPanelOpen} width={aiPanelWidth} />
      </ErrorBoundary>

      {/* Cherry blossom drag & drop overlay */}
      <DragDropOverlay />

      {/* Auto-update toast — appears when a downloaded update is ready */}
      <UpdateBanner />
    </div>
  )
}
