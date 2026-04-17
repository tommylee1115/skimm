import { useState, useEffect } from 'react'
import { Eye, EyeOff, Check, RefreshCw, AlertTriangle, Download } from 'lucide-react'
import { useTtsStore, type OpenAIVoice, type OpenAIModel } from '@/stores/tts.store'
import { subscribeToVoiceChanges } from '@/lib/speech/web-speech'

// Inline mirror of the preload type so the renderer's tsconfig doesn't
// need to cross into src/preload. Source of truth: main/ipc/update.ts.
type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number; version?: string }
  | { state: 'downloaded' }
  | { state: 'error'; message: string }

function formatVoiceLabel(v: SpeechSynthesisVoice): string {
  const name = v.name.replace(/^Microsoft\s+/i, '').replace(/\s*-.*$/, '')
  return `${name} (${v.lang})`
}

export function SettingsPanel() {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  // OpenAI key (for TTS) lives next to Claude — separate state so the
  // password inputs and Save/Remove buttons don't share mutable UI state.
  const [openaiKey, setOpenaiKey] = useState('')
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [openaiSaved, setOpenaiSaved] = useState(false)

  // Lifted so `TtsSettings` immediately reflects a newly-saved OpenAI
  // key in its provider toggle without waiting for a remount.
  const [openaiAvailable, setOpenaiAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.settings.get('apiKey').then((key) => {
      if (typeof key === 'string') setApiKey(key)
    })
    window.api.settings.get('openaiApiKey').then((key) => {
      if (typeof key === 'string') setOpenaiKey(key)
    })
    window.api.tts.openaiAvailable().then(setOpenaiAvailable).catch(() => setOpenaiAvailable(false))
    window.api.app.version().then(setAppVersion).catch(() => setAppVersion(null))
  }, [])

  const handleSave = async () => {
    await window.api.settings.set('apiKey', apiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveOpenai = async () => {
    await window.api.settings.set('openaiApiKey', openaiKey)
    setOpenaiSaved(true)
    setTimeout(() => setOpenaiSaved(false), 2000)
    // Re-query after the write so the TTS provider toggle unlocks.
    window.api.tts.openaiAvailable().then(setOpenaiAvailable).catch(() => {})
  }

  const handleRemoveOpenai = async () => {
    setOpenaiKey('')
    await window.api.settings.set('openaiApiKey', '')
    window.api.tts.openaiAvailable().then(setOpenaiAvailable).catch(() => {})
  }

  return (
    <div className="px-2 py-4">
      <div className="mb-6">
        <label
          className="block text-[11px] font-semibold uppercase tracking-wider mb-2"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Claude API Key
        </label>
        <div className="flex items-center gap-1.5 mb-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="flex-1 text-[12px] px-2.5 py-1.5 rounded border outline-none"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-primary)'
            }}
          />
          <button
            className="w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded border cursor-pointer transition-colors"
            style={{
              background: saved ? 'var(--bg-tertiary)' : 'transparent',
              color: saved ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderColor: 'var(--border-primary)'
            }}
          >
            {saved ? <><Check size={12} /> Saved</> : 'Save key'}
          </button>
          {apiKey && (
            <button
              onClick={async () => {
                setApiKey('')
                await window.api.settings.set('apiKey', '')
              }}
              className="text-[12px] px-3 py-1.5 rounded border cursor-pointer transition-colors"
              style={{
                color: 'var(--text-muted)',
                borderColor: 'var(--border-primary)',
                background: 'transparent'
              }}
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Get your key at console.anthropic.com. It stays on your machine — never sent anywhere except Anthropic's API.
        </p>
      </div>

      {/* OpenAI API Key — powers neural TTS voices + Whisper word sync. */}
      <div className="mb-6">
        <label
          className="block text-[11px] font-semibold uppercase tracking-wider mb-2"
          style={{ color: 'var(--text-tertiary)' }}
        >
          OpenAI API Key
          <span
            className="ml-2 text-[10px] font-normal normal-case tracking-normal"
            style={{ color: 'var(--text-muted)' }}
          >
            for TTS (optional)
          </span>
        </label>
        <div className="flex items-center gap-1.5 mb-2">
          <input
            type={showOpenaiKey ? 'text' : 'password'}
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 text-[12px] px-2.5 py-1.5 rounded border outline-none"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-primary)'
            }}
            aria-label="OpenAI API Key"
          />
          <button
            className="w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            onClick={() => setShowOpenaiKey(!showOpenaiKey)}
            aria-label={showOpenaiKey ? 'Hide OpenAI API key' : 'Show OpenAI API key'}
          >
            {showOpenaiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveOpenai}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded border cursor-pointer transition-colors"
            style={{
              background: openaiSaved ? 'var(--bg-tertiary)' : 'transparent',
              color: openaiSaved ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderColor: 'var(--border-primary)'
            }}
          >
            {openaiSaved ? <><Check size={12} /> Saved</> : 'Save key'}
          </button>
          {openaiKey && (
            <button
              onClick={handleRemoveOpenai}
              className="text-[12px] px-3 py-1.5 rounded border cursor-pointer transition-colors"
              style={{
                color: 'var(--text-muted)',
                borderColor: 'var(--border-primary)',
                background: 'transparent'
              }}
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Optional — enables high-quality neural TTS and Whisper word-sync highlighting. Get a key at platform.openai.com. Without it, Skimm uses your system's built-in voices. Stays on your machine, encrypted at rest.
        </p>
      </div>

      <TtsSettings openaiAvailable={openaiAvailable} />

      <UpdateSection />

      {/* App version footer */}
      <div
        className="mt-2 pt-4 border-t text-[11px] text-center"
        style={{
          borderColor: 'var(--border-secondary)',
          color: 'var(--text-muted)'
        }}
      >
        Skimm {appVersion ? `v${appVersion}` : ''}
      </div>
    </div>
  )
}

/**
 * Manual update check + live status. Subscribes to `update:status`
 * events from main; the button triggers `update:check` which runs
 * `autoUpdater.checkForUpdates()`.
 */
function UpdateSection() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [lastChecked, setLastChecked] = useState<number | null>(null)

  useEffect(() => {
    window.api.update.onStatus((next) => {
      setStatus(next)
      if (next.state === 'up-to-date' || next.state === 'available' || next.state === 'error') {
        setLastChecked(Date.now())
      }
    })
  }, [])

  const busy = status.state === 'checking' || status.state === 'downloading'

  const handleCheck = async () => {
    setStatus({ state: 'checking' })
    try {
      await window.api.update.check()
    } catch {
      /* main surfaces errors via onStatus */
    }
  }

  return (
    <div className="mb-6">
      <label
        className="block text-[11px] font-semibold uppercase tracking-wider mb-2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Updates
      </label>

      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={handleCheck}
          disabled={busy}
          className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded border cursor-pointer transition-colors"
          style={{
            color: busy ? 'var(--text-muted)' : 'var(--text-secondary)',
            borderColor: 'var(--border-primary)',
            background: 'transparent',
            opacity: busy ? 0.6 : 1,
            cursor: busy ? 'default' : 'pointer'
          }}
          aria-label="Check for updates"
        >
          <RefreshCw
            size={12}
            className={busy ? 'animate-spin' : ''}
            strokeWidth={1.5}
          />
          {busy ? 'Checking…' : 'Check for updates'}
        </button>
        {status.state === 'downloaded' && (
          <button
            onClick={() => window.api.update.install()}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded cursor-pointer"
            style={{
              background: 'var(--accent-primary, #8B6F47)',
              color: 'white',
              border: 'none',
              fontWeight: 600
            }}
            aria-label="Restart to install update"
          >
            <Download size={12} strokeWidth={2} />
            Restart to install
          </button>
        )}
      </div>

      <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        <UpdateStatusLine status={status} lastChecked={lastChecked} />
      </div>
    </div>
  )
}

function UpdateStatusLine({
  status,
  lastChecked
}: {
  status: UpdateStatus
  lastChecked: number | null
}) {
  switch (status.state) {
    case 'checking':
      return <span>Checking for updates…</span>
    case 'up-to-date':
      return (
        <span>
          You're on the latest version
          {lastChecked ? ` · checked ${formatRelative(lastChecked)}` : ''}
        </span>
      )
    case 'available':
      return <span>Update available: v{status.version} — downloading…</span>
    case 'downloading':
      return <span>Downloading update… {status.percent}%</span>
    case 'downloaded':
      return <span style={{ color: 'var(--text-secondary)' }}>Ready to install — click Restart.</span>
    case 'error':
      return (
        <span style={{ color: '#e57373', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <AlertTriangle size={11} />
          {status.message}
        </span>
      )
    case 'idle':
    default:
      return lastChecked ? (
        <span>Last checked {formatRelative(lastChecked)}</span>
      ) : (
        <span>Checks automatically on launch. Click above to check now.</span>
      )
  }
}

function formatRelative(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000)
  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return new Date(ts).toLocaleString()
}

const OPENAI_VOICES: { id: OpenAIVoice; label: string }[] = [
  { id: 'nova', label: 'Nova · bright female' },
  { id: 'alloy', label: 'Alloy · neutral' },
  { id: 'shimmer', label: 'Shimmer · warm female' },
  { id: 'coral', label: 'Coral · warm female' },
  { id: 'sage', label: 'Sage · calm' },
  { id: 'fable', label: 'Fable · British male' },
  { id: 'onyx', label: 'Onyx · deep male' },
  { id: 'echo', label: 'Echo · male' },
  { id: 'ash', label: 'Ash · cool male' },
  { id: 'ballad', label: 'Ballad · expressive' },
  { id: 'verse', label: 'Verse · storyteller' }
]

const OPENAI_MODELS: { id: OpenAIModel; label: string; hint: string }[] = [
  { id: 'tts-1-hd', label: 'tts-1-hd', hint: 'higher quality, slower' },
  { id: 'tts-1', label: 'tts-1', hint: 'faster, cheaper' },
  { id: 'gpt-4o-mini-tts', label: 'gpt-4o-mini-tts', hint: 'newest' }
]

function TtsSettings({ openaiAvailable }: { openaiAvailable: boolean | null }) {
  const ttsProvider = useTtsStore((s) => s.ttsProvider)
  const setProvider = useTtsStore((s) => s.setProvider)
  const selectedVoice = useTtsStore((s) => s.selectedVoice)
  const setVoice = useTtsStore((s) => s.setVoice)
  const openaiVoice = useTtsStore((s) => s.openaiVoice)
  const setOpenaiVoice = useTtsStore((s) => s.setOpenaiVoice)
  const openaiModel = useTtsStore((s) => s.openaiModel)
  const setOpenaiModel = useTtsStore((s) => s.setOpenaiModel)
  const whisperSyncEnabled = useTtsStore((s) => s.whisperSyncEnabled)
  const setWhisperSyncEnabled = useTtsStore((s) => s.setWhisperSyncEnabled)
  const playbackSpeed = useTtsStore((s) => s.playbackSpeed)
  const setSpeed = useTtsStore((s) => s.setSpeed)

  const [webVoices, setWebVoices] = useState<SpeechSynthesisVoice[]>([])
  const [webFilter, setWebFilter] = useState<'en' | 'ko' | 'local' | 'all'>('en')

  useEffect(() => subscribeToVoiceChanges(setWebVoices), [])

  const filteredWebVoices = webVoices.filter((v) => {
    if (webFilter === 'all') return true
    if (webFilter === 'en') return v.lang.toLowerCase().startsWith('en')
    if (webFilter === 'ko') return v.lang.toLowerCase().startsWith('ko')
    if (webFilter === 'local') return v.localService
    return true
  })

  return (
    <div className="mb-6">
      <label
        className="block text-[11px] font-semibold uppercase tracking-wider mb-2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Read Aloud (TTS)
      </label>

      {/* Provider toggle */}
      <div className="flex gap-1 mb-3">
        {(['openai', 'web-speech'] as const).map((p) => {
          const disabled = p === 'openai' && openaiAvailable === false
          return (
            <button
              key={p}
              onClick={() => !disabled && setProvider(p)}
              disabled={disabled}
              className="flex-1 text-[11px] px-2 py-1.5 rounded cursor-pointer transition-colors"
              style={{
                background: ttsProvider === p ? 'var(--bg-active)' : 'transparent',
                color: disabled
                  ? 'var(--text-muted)'
                  : ttsProvider === p
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                border: '1px solid var(--border-secondary)',
                opacity: disabled ? 0.5 : 1
              }}
              title={
                disabled
                  ? 'Add an OpenAI API key in Settings above to enable neural TTS.'
                  : undefined
              }
            >
              {p === 'openai' ? 'OpenAI' : 'System'}
            </button>
          )
        })}
      </div>

      {ttsProvider === 'openai' ? (
        <>
          {/* OpenAI voice */}
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
            Voice
          </label>
          <select
            value={openaiVoice}
            onChange={(e) => setOpenaiVoice(e.target.value as OpenAIVoice)}
            className="w-full text-[12px] px-2.5 py-1.5 rounded border outline-none mb-3 cursor-pointer"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-primary)'
            }}
          >
            {OPENAI_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>

          {/* OpenAI model */}
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
            Model
          </label>
          <select
            value={openaiModel}
            onChange={(e) => setOpenaiModel(e.target.value as OpenAIModel)}
            className="w-full text-[12px] px-2.5 py-1.5 rounded border outline-none mb-3 cursor-pointer"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-primary)'
            }}
          >
            {OPENAI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.hint}
              </option>
            ))}
          </select>

          {/* Whisper sync toggle */}
          <label
            className="flex items-start gap-2 mb-3 cursor-pointer select-none"
            style={{ color: 'var(--text-secondary)' }}
          >
            <input
              type="checkbox"
              checked={whisperSyncEnabled}
              onChange={(e) => setWhisperSyncEnabled(e.target.checked)}
              className="mt-0.5 cursor-pointer"
              style={{ accentColor: 'var(--text-secondary)' }}
            />
            <div className="flex-1">
              <div className="text-[12px]">Precise word sync (Whisper)</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Transcribes the audio for frame-accurate highlighting. Adds ~$0.006/chunk.
              </div>
            </div>
          </label>
        </>
      ) : (
        <>
          {/* Web Speech filter pills */}
          <div className="flex gap-1 mb-2">
            {(['en', 'ko', 'local', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setWebFilter(f)}
                className="text-[10px] px-2 py-1 rounded cursor-pointer transition-colors"
                style={{
                  background: webFilter === f ? 'var(--bg-active)' : 'transparent',
                  color: webFilter === f ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: '1px solid var(--border-secondary)'
                }}
              >
                {f === 'en' ? 'English' : f === 'ko' ? '한국어' : f === 'local' ? 'Local' : 'All'}
              </button>
            ))}
          </div>

          {/* Web Speech voice dropdown */}
          <select
            value={selectedVoice}
            onChange={(e) => {
              const name = e.target.value
              setVoice(name)
              if (!useTtsStore.getState().isPlaying && name) {
                const voice = webVoices.find((v) => v.name === name)
                if (voice) {
                  try {
                    window.speechSynthesis.cancel()
                    const sample = new SpeechSynthesisUtterance(
                      "Hello — this is how I sound."
                    )
                    sample.voice = voice
                    window.speechSynthesis.speak(sample)
                  } catch {
                    /* preview failure is non-fatal */
                  }
                }
              }
            }}
            className="w-full text-[12px] px-2.5 py-1.5 rounded border outline-none mb-3 cursor-pointer"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-primary)'
            }}
          >
            {webVoices.length === 0 && <option value="">Loading voices…</option>}
            {webVoices.length > 0 && filteredWebVoices.length === 0 && (
              <option value="">No voices match filter</option>
            )}
            {filteredWebVoices.map((v) => (
              <option key={v.voiceURI} value={v.name}>
                {formatVoiceLabel(v)}
                {v.localService ? '' : ' · remote'}
              </option>
            ))}
          </select>
        </>
      )}

      {/* Speed slider — shared between providers */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Default speed
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {playbackSpeed.toFixed(2)}x
          </span>
        </div>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.25}
          value={playbackSpeed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-full cursor-pointer"
          style={{ accentColor: 'var(--text-secondary)' }}
        />
      </div>

      <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {ttsProvider === 'openai'
          ? 'OpenAI TTS streams higher-quality neural voices over the network. Costs per character — use sparingly for long docs.'
          : "Uses your system's built-in voices (Web Speech API). Local voices work offline and fire per-word highlight events reliably."}
      </p>
    </div>
  )
}
