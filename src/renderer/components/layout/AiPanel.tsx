import { useState } from 'react'
import { useAiStore, type Explanation } from '@/stores/ai.store'
import { Bookmark, Check, Loader2, Trash2, Minus, Plus, X } from 'lucide-react'
import { MarkdownText } from '@/components/ai/MarkdownText'

interface AiPanelProps {
  open: boolean
  width: number
}

function formatCost(costUsd: number): string {
  if (costUsd === 0) return '$0'
  // Sub-cent costs: show up to 4 decimals so the user sees they're paying ~$0.0002
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`
  return `$${costUsd.toFixed(3)}`
}

export function AiPanel({ open, width }: AiPanelProps) {
  const {
    language,
    setLanguage,
    panelFontSize,
    setPanelFontSize,
    explanations,
    currentExplanation,
    currentUsage,
    isLoading,
    selectedText,
    clearHistory,
    togglePanel
  } = useAiStore()

  if (!open) return null

  return (
    <div
      className="flex flex-col overflow-hidden border-l"
      style={{
        width,
        minWidth: 250,
        maxWidth: 500,
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-primary)'
      }}
    >
      {/* Header */}
      <div className="shrink-0 border-b" style={{ borderColor: 'var(--border-secondary)' }}>
        <div
          className="flex items-center justify-between px-4"
          style={{ height: 40 }}
        >
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Explain
          </span>
          <button
            className="w-6 h-6 flex items-center justify-center rounded transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
            onClick={togglePanel}
            title="Close Explain panel (Ctrl+J)"
          >
            <X size={14} />
          </button>
        </div>

        {/* Controls row */}
        <div
          className="flex items-center justify-between px-4 pb-3"
        >
          {/* Language toggle */}
          <div
            className="flex items-center rounded-md overflow-hidden border"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <LanguageButton label="한국어" active={language === 'ko'} onClick={() => setLanguage('ko')} />
            <LanguageButton label="English" active={language === 'en'} onClick={() => setLanguage('en')} />
          </div>

          {/* Font size control */}
          <div className="flex items-center gap-1">
            <SizeButton onClick={() => setPanelFontSize(panelFontSize - 1)}>
              <Minus size={10} />
            </SizeButton>
            <span className="text-[10px] w-4 text-center" style={{ color: 'var(--text-muted)' }}>
              {panelFontSize}
            </span>
            <SizeButton onClick={() => setPanelFontSize(panelFontSize + 1)}>
              <Plus size={10} />
            </SizeButton>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ fontSize: panelFontSize }}>
        {/* Currently streaming explanation */}
        {isLoading && (
          <div className="px-4 py-4 mx-3 my-2 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                "{selectedText}"
              </span>
            </div>
            <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {currentExplanation ? <MarkdownText text={currentExplanation} /> : 'Thinking...'}
            </p>
            {currentUsage && (
              <div
                className="mt-3 text-[10px] font-mono"
                style={{ color: 'var(--text-muted)' }}
                title={`${currentUsage.inputTokens} in · ${currentUsage.outputTokens} out · ${currentUsage.model}`}
              >
                {formatCost(currentUsage.costUsd)} · {currentUsage.inputTokens}→{currentUsage.outputTokens} tok
              </div>
            )}
          </div>
        )}

        {/* Past explanations */}
        {explanations.map((exp) => (
          <ExplanationCard key={exp.id} explanation={exp} />
        ))}

        {/* Empty state */}
        {!isLoading && explanations.length === 0 && (
          <div
            className="flex items-center justify-center px-6 py-12 text-center leading-relaxed"
            style={{ color: 'var(--text-tertiary)', fontSize: 13 }}
          >
            <p>Click any word or select text in the reading pane to get a contextual explanation.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {explanations.length > 0 && (
        <div
          className="flex items-center justify-end px-4 py-2 border-t shrink-0"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <button
            className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
            onClick={clearHistory}
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

function ExplanationCard({ explanation }: { explanation: Explanation }) {
  const typeLabel = explanation.selectionType
  const removeExplanation = useAiStore((s) => s.removeExplanation)
  const [saved, setSaved] = useState(false)

  return (
    <div
      className="px-4 py-4 mx-3 my-2 rounded-lg relative group"
      style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
    >
      {/* Delete button */}
      <button
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-hover)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-muted)'
        }}
        onClick={() => removeExplanation(explanation.id)}
        title="Remove"
      >
        <X size={14} />
      </button>

      {/* Selected text + type badge */}
      <div className="mb-3 pr-6">
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
          "{explanation.text}"
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full ml-2 inline-block align-middle"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-tertiary)',
            border: '1px solid var(--border-secondary)'
          }}
        >
          {typeLabel}
        </span>
      </div>

      {/* Explanation */}
      <p
        className="leading-relaxed mb-3"
        style={{ color: 'var(--text-secondary)' }}
      >
        <MarkdownText text={explanation.explanation} />
      </p>

      {/* Source citation */}
      {explanation.sourceFile && (
        <p
          className="mb-3 flex items-center gap-1"
          style={{ color: 'var(--text-muted)', fontSize: '0.78em' }}
        >
          <span style={{ opacity: 0.6 }}>—</span>
          <span className="truncate" title={explanation.sourceFile}>
            {explanation.sourceFile}
          </span>
        </p>
      )}

      {/* Cost + token breakdown (shown only when we have usage data) */}
      {explanation.usage && (
        <div
          className="mb-3 text-[10px] font-mono"
          style={{ color: 'var(--text-muted)' }}
          title={`${explanation.usage.inputTokens} input · ${explanation.usage.outputTokens} output · ${explanation.usage.model}`}
        >
          {formatCost(explanation.usage.costUsd)} · {explanation.usage.inputTokens}→{explanation.usage.outputTokens} tok
        </div>
      )}

      {/* Save button */}
      <button
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border transition-colors cursor-pointer"
        style={{
          color: saved ? 'var(--text-primary)' : 'var(--text-tertiary)',
          borderColor: 'var(--border-primary)',
          background: saved ? 'var(--bg-tertiary)' : 'transparent',
          fontSize: '0.85em'
        }}
        onMouseEnter={(e) => {
          if (!saved) {
            e.currentTarget.style.background = 'var(--bg-tertiary)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }
        }}
        onMouseLeave={(e) => {
          if (!saved) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }
        }}
        disabled={saved}
        onClick={async () => {
          await window.api.cards.save({
            id: explanation.id,
            selected_text: explanation.text,
            selection_type: explanation.selectionType,
            explanation: explanation.explanation,
            language: explanation.language,
            context: explanation.context,
            source_file: explanation.sourceFile,
            saved_at: new Date(explanation.timestamp).toISOString()
          })
          setSaved(true)
        }}
      >
        {saved ? <Check size={12} /> : <Bookmark size={12} />}
        {saved ? 'Saved' : 'Save to study cards'}
      </button>
    </div>
  )
}

function LanguageButton({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      className="text-[12px] font-semibold px-3 py-1 transition-colors cursor-pointer"
      style={{
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)'
      }}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function SizeButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className="w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer"
      style={{ color: 'var(--text-tertiary)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
