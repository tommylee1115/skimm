import { useRef, useCallback, useEffect } from 'react'
import { useFileStore } from '@/stores/file.store'
import { useReaderStore } from '@/stores/reader.store'
import { useAiStore } from '@/stores/ai.store'
import { useTtsStore, getTtsController } from '@/stores/tts.store'
import { useMarkdownProcessor } from '@/hooks/useMarkdownProcessor'
import { useLineFocus, getFocusController } from '@/hooks/useLineFocus'
import { useTts } from '@/hooks/useTts'
import { ReadingToolbar } from '@/components/reader/ReadingToolbar'
import { TtsTransport } from '@/components/tts/TtsTransport'
import { FileText, FolderOpen } from 'lucide-react'
import skimmIcon from '@/assets/brand/skimm_icon_512.png'
import skimmWordmark from '@/assets/brand/skimm_wordmark.svg'

export function MainPane() {
  const { openFiles, activeFileId } = useFileStore()
  const { fontSize, lineHeight, maxWidth, fontFamily } = useReaderStore()
  const readingAreaRef = useRef<HTMLDivElement>(null)
  const markdownRef = useRef<HTMLDivElement>(null)

  const activeFile = openFiles.find((f) => f.id === activeFileId)

  // Initialize TTS controller (registers play/pause/stop/seek functions in the store)
  useTts()

  const handleWordClick = useCallback((word: string, offset: number, context: string, altKey: boolean) => {
    // Every click remembers the focus anchor, so enabling focus mode later
    // resumes from the last clicked word instead of restarting at the top.
    const clickedSpan = document.querySelector(`[data-offset="${offset}"]`) as HTMLElement | null
    if (clickedSpan) getFocusController()?.focusOnElement(clickedSpan)

    // Alt+click ALWAYS seeks/starts TTS at the clicked word. Plain click during
    // playback also seeks. Plain click while idle shows an AI explanation.
    const ttsState = useTtsStore.getState()
    if (altKey || ttsState.isPlaying) {
      if (clickedSpan) {
        getTtsController()?.seekToSpan(clickedSpan)
        return
      }
    }

    const fullDocument = activeFile?.content ?? ''
    const sourceFile = activeFile?.name ?? ''

    // If user has selected text (a phrase/sentence), use that instead of the single word
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim()

    if (selectedText && selectedText.length > 1 && selectedText !== word) {
      const range = selection?.getRangeAt(0)
      const container = range?.commonAncestorContainer
      const parentEl = container instanceof HTMLElement
        ? container
        : container?.parentElement
      const phraseContext = parentEl?.closest('p, div, blockquote, li')?.textContent ?? context
      useAiStore.getState().requestExplanation(selectedText, phraseContext, fullDocument, sourceFile)
    } else {
      useAiStore.getState().requestExplanation(word, context, fullDocument, sourceFile)
    }
  }, [activeFile])

  const renderedMarkdown = useMarkdownProcessor(activeFile?.content ?? '', handleWordClick)

  // Line focus — dims all blocks except the focused one
  useLineFocus(markdownRef)

  // Auto-explain on text selection release (drag and release)
  useEffect(() => {
    const area = readingAreaRef.current
    if (!area) return

    const handleMouseUp = () => {
      // Skip AI explain if TTS is actively playing — drags during playback are awkward
      if (useTtsStore.getState().isPlaying) return

      // Small delay to let browser finalize the selection
      setTimeout(() => {
        const selection = window.getSelection()
        const selectedText = selection?.toString().trim()
        if (selectedText && selectedText.length > 1) {
          const range = selection?.getRangeAt(0)
          const container = range?.commonAncestorContainer
          const parentEl = container instanceof HTMLElement
            ? container
            : container?.parentElement
          const context = parentEl?.closest('p, div, blockquote, li')?.textContent ?? ''
          const fullDocument = activeFile?.content ?? ''
          const sourceFile = activeFile?.name ?? ''
          useAiStore.getState().requestExplanation(selectedText, context, fullDocument, sourceFile)
        }
      }, 50)
    }

    area.addEventListener('mouseup', handleMouseUp)
    return () => area.removeEventListener('mouseup', handleMouseUp)
  }, [activeFile])

  const handleOpenFile = async () => {
    const result = await window.api.file.openDialog()
    if (result) {
      useFileStore.getState().openFile(result.path, result.content)
    }
  }

  if (!activeFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <img
          src={skimmIcon}
          alt="Skimm"
          width={112}
          height={112}
          style={{ imageRendering: 'auto' }}
        />
        <img
          src={skimmWordmark}
          alt="Skimm"
          style={{ height: 28, opacity: 0.85 }}
        />
        <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>
          Open a markdown file to begin reading.
        </p>
        <button
          onClick={handleOpenFile}
          className="flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer border"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            borderColor: 'var(--border-primary)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-tertiary)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <FolderOpen size={16} strokeWidth={1.5} />
          Open a Markdown file
        </button>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          or drag & drop a .md file anywhere
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Tabs */}
      <div
        className="flex items-center gap-0 border-b overflow-x-auto flex-nowrap shrink-0 skimm-tab-bar"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
        onWheel={(e) => {
          // Vertical wheel scrolls tabs horizontally
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY
          }
        }}
      >
        {openFiles.map((file) => (
          <TabItem key={file.id} file={file} isActive={file.id === activeFileId} />
        ))}
      </div>

      {/* Reading toolbar */}
      <ReadingToolbar />

      {/* Reading area — Ctrl+A is scoped here */}
      <div
        ref={readingAreaRef}
        className="flex-1 overflow-y-auto flex justify-center reading-area"
        style={{ background: 'var(--bg-primary)' }}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key === 'a') {
            e.preventDefault()
            e.stopPropagation()
            const selection = window.getSelection()
            if (selection && readingAreaRef.current) {
              const range = document.createRange()
              range.selectNodeContents(readingAreaRef.current)
              selection.removeAllRanges()
              selection.addRange(range)
            }
          }
        }}
        tabIndex={-1}
      >
        <div
          className="w-full px-10 py-12"
          style={{
            maxWidth,
            fontFamily,
            fontSize,
            lineHeight
          }}
        >
          <div ref={markdownRef} className="markdown-body" style={{ color: 'var(--text-primary)' }}>
            {renderedMarkdown}
          </div>
        </div>
      </div>

      {/* Floating TTS transport bar */}
      <TtsTransport />
    </div>
  )
}

function TabItem({
  file,
  isActive
}: {
  file: { id: string; name: string }
  isActive: boolean
}) {
  const { setActiveFile, closeFile } = useFileStore()

  return (
    <div
      className="flex items-center gap-2 px-4 py-0 text-[13px] cursor-pointer border-r select-none shrink-0 whitespace-nowrap"
      style={{
        height: 40,
        minWidth: 140,
        maxWidth: 260,
        background: isActive ? 'var(--bg-primary)' : 'transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderColor: 'var(--border-secondary)',
        borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent'
      }}
      onClick={() => setActiveFile(file.id)}
      title={file.name}
    >
      <FileText size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
      <span className="truncate">{file.name}</span>
      <button
        className="ml-1 rounded w-5 h-5 flex items-center justify-center text-[11px] transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-hover)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-tertiary)'
        }}
        onClick={(e) => {
          e.stopPropagation()
          closeFile(file.id)
        }}
      >
        ×
      </button>
    </div>
  )
}
