import { Play, Pause, Square, Loader2, AlertCircle, X } from 'lucide-react'
import { useTtsStore, getTtsController } from '@/stores/tts.store'

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0]

export function TtsTransport() {
  const transportVisible = useTtsStore((s) => s.transportVisible)
  const isPlaying = useTtsStore((s) => s.isPlaying)
  const isLoading = useTtsStore((s) => s.isLoading)
  const errorMessage = useTtsStore((s) => s.errorMessage)
  const setError = useTtsStore((s) => s.setError)
  const playbackSpeed = useTtsStore((s) => s.playbackSpeed)
  const setSpeed = useTtsStore((s) => s.setSpeed)

  const handlePlayPause = (): void => {
    const c = getTtsController()
    if (!c) return
    if (isPlaying) c.pause()
    else c.resume()
  }

  const handleStop = (): void => {
    getTtsController()?.stop()
  }

  return (
    <div
      className="fixed left-1/2 pointer-events-none z-40"
      style={{
        bottom: 32,
        transform: `translateX(-50%) translateY(${transportVisible ? '0' : 'calc(100% + 40px)'})`,
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: transportVisible ? 1 : 0
      }}
    >
      <div
        className="pointer-events-auto flex flex-col rounded-2xl"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          backdropFilter: 'blur(12px)',
          maxWidth: 'calc(100vw - 200px)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.04)'
        }}
      >
        {/* Error banner — dismissable. Retry is via the Play button. */}
        {errorMessage && (
          <div
            className="flex items-center gap-2 px-4 py-2 text-[12px] rounded-t-2xl"
            style={{
              background: 'rgba(220, 80, 80, 0.12)',
              color: '#e57373',
              borderBottom: '1px solid rgba(220, 80, 80, 0.2)',
              maxWidth: 560
            }}
          >
            <AlertCircle size={14} />
            <span className="flex-1">{errorMessage}</span>
            <button
              className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors"
              style={{ color: '#e57373', opacity: 0.8 }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(220, 80, 80, 0.2)'
                e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.opacity = '0.8'
              }}
              onClick={() => setError(null)}
              title="Dismiss error"
              aria-label="Dismiss TTS error"
            >
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 pl-4 pr-5 py-2.5">
          {/* Stop */}
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
            onClick={handleStop}
            title="Stop (Esc)"
            aria-label="Stop reading"
          >
            <Square size={14} />
          </button>

          {/* Play/Pause */}
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer transition-colors"
            style={{
              background: 'var(--text-primary)',
              color: 'var(--bg-primary)'
            }}
            onClick={handlePlayPause}
            disabled={isLoading}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>

          {/* Divider */}
          <div className="w-px h-5" style={{ background: 'var(--border-secondary)' }} />

          {/* Speed selector */}
          <select
            value={playbackSpeed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="text-[11px] bg-transparent outline-none cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
            title="Speed"
            aria-label="Playback speed"
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s} style={{ background: 'var(--bg-primary)' }}>
                {s}x
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
