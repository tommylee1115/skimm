import { useReaderStore } from '@/stores/reader.store'
import { getTtsController, useTtsStore } from '@/stores/tts.store'
import { useAiStore } from '@/stores/ai.store'
import { Minus, Plus, AlignJustify, Focus, Play, Sparkles } from 'lucide-react'

export function ReadingToolbar() {
  const {
    fontSize,
    setFontSize,
    lineHeight,
    setLineHeight,
    chunkingLevel,
    setChunkingLevel,
    lineFocusEnabled,
    toggleLineFocus,
  } = useReaderStore()

  const { maxWidth } = useReaderStore()

  return (
    <div
      className="flex justify-center border-b shrink-0 select-none"
      style={{
        height: 36,
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-secondary)'
      }}
    >
    <div
      className="flex items-center gap-4 w-full px-10"
      style={{ maxWidth }}
    >
      {/* Font size */}
      <ToolbarGroup label="Size">
        <ToolbarButton onClick={() => setFontSize(fontSize - 1)} title="Decrease font size">
          <Minus size={12} />
        </ToolbarButton>
        <span className="text-[11px] w-6 text-center" style={{ color: 'var(--text-secondary)' }}>
          {fontSize}
        </span>
        <ToolbarButton onClick={() => setFontSize(fontSize + 1)} title="Increase font size">
          <Plus size={12} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Line height */}
      <ToolbarGroup label="Spacing">
        <ToolbarButton onClick={() => setLineHeight(lineHeight - 0.1)} title="Tighter spacing">
          <Minus size={12} />
        </ToolbarButton>
        <span className="text-[11px] w-6 text-center" style={{ color: 'var(--text-secondary)' }}>
          {lineHeight.toFixed(1)}
        </span>
        <ToolbarButton onClick={() => setLineHeight(lineHeight + 0.1)} title="Looser spacing">
          <Plus size={12} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Chunking level */}
      <ToolbarGroup label="Chunking">
        <ToolbarToggle
          active={chunkingLevel === 'none'}
          onClick={() => setChunkingLevel('none')}
          title="No chunking"
        >
          Off
        </ToolbarToggle>
        <ToolbarToggle
          active={chunkingLevel === 'sentence'}
          onClick={() => setChunkingLevel('sentence')}
          title="Split by sentence"
        >
          <AlignJustify size={12} />
        </ToolbarToggle>
        <ToolbarToggle
          active={chunkingLevel === 'clause'}
          onClick={() => setChunkingLevel('clause')}
          title="Split by clause"
        >
          <AlignJustify size={12} strokeWidth={1} />
        </ToolbarToggle>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Toggle features */}
      <ToolbarToggle
        active={lineFocusEnabled}
        onClick={toggleLineFocus}
        title="Line focus mode"
      >
        <Focus size={13} />
      </ToolbarToggle>

      <div className="flex-1" />

      {/* Explain panel toggle */}
      <ExplainButton />

      {/* Play TTS button — sits on the right side */}
      <PlayButton />
    </div>
    </div>
  )
}

function ExplainButton() {
  const panelOpen = useAiStore((s) => s.panelOpen)
  const togglePanel = useAiStore((s) => s.togglePanel)

  return (
    <button
      className="h-6 px-2.5 flex items-center gap-1.5 rounded text-[11px] transition-colors cursor-pointer"
      style={{
        background: panelOpen ? 'var(--bg-active)' : 'transparent',
        color: panelOpen ? 'var(--text-primary)' : 'var(--text-tertiary)'
      }}
      onMouseEnter={(e) => {
        if (!panelOpen) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!panelOpen) e.currentTarget.style.background = 'transparent'
      }}
      onClick={togglePanel}
      title={panelOpen ? 'Hide Explain panel (Ctrl+J)' : 'Show Explain panel (Ctrl+J)'}
    >
      <Sparkles size={12} />
      Explain
    </button>
  )
}

function PlayButton() {
  const transportVisible = useTtsStore((s) => s.transportVisible)

  const handleClick = () => {
    console.log('[TTS] Read button clicked. transportVisible:', transportVisible)
    const controller = getTtsController()
    if (!controller) {
      console.error('[TTS] No controller registered! useTts hook may not have mounted yet.')
      return
    }
    console.log('[TTS] Controller found, calling', transportVisible ? 'stop()' : 'play()')
    if (transportVisible) {
      controller.stop()
    } else {
      controller.play()
    }
  }

  return (
    <button
      className="h-6 px-2.5 flex items-center gap-1.5 rounded text-[11px] transition-colors cursor-pointer"
      style={{
        background: transportVisible ? 'var(--bg-active)' : 'transparent',
        color: transportVisible ? 'var(--text-primary)' : 'var(--text-tertiary)'
      }}
      onMouseEnter={(e) => {
        if (!transportVisible) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!transportVisible) e.currentTarget.style.background = 'transparent'
      }}
      onClick={handleClick}
      title={transportVisible ? 'Stop reading' : 'Read aloud'}
    >
      <Play size={12} fill="currentColor" />
      Read
    </button>
  )
}

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] uppercase mr-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

function ToolbarButton({
  children,
  onClick,
  title
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <button
      className="w-6 h-6 flex items-center justify-center rounded transition-colors cursor-pointer"
      style={{ color: 'var(--text-secondary)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

function ToolbarToggle({
  children,
  active,
  onClick,
  title
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      className="h-6 px-1.5 flex items-center justify-center rounded text-[11px] transition-colors cursor-pointer"
      style={{
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)'
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return (
    <div className="w-px h-4" style={{ background: 'var(--border-secondary)' }} />
  )
}
