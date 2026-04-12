import { useState, useEffect } from 'react'

export function UpdateBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.api.update.onDownloaded(() => setVisible(true))
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        borderRadius: 10,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        fontSize: 13,
        color: 'var(--text-primary)'
      }}
    >
      <span>A new version is ready.</span>
      <button
        onClick={() => window.api.update.install()}
        style={{
          padding: '4px 12px',
          borderRadius: 6,
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        Restart to update
      </button>
      <button
        onClick={() => setVisible(false)}
        style={{
          padding: '2px 6px',
          borderRadius: 4,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontSize: 14,
          cursor: 'pointer',
          lineHeight: 1
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
