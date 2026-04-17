import { useState, useEffect } from 'react'
import { Sparkles, RotateCw, X } from 'lucide-react'

/**
 * Toast that appears bottom-right when `electron-updater` has finished
 * downloading a new version. Clicking Restart fires `quitAndInstall()`.
 *
 * Visual priority: uses the brand accent as the banner background (not
 * the ambient cream) so it breaks from the page and demands attention
 * against the reading area. Larger type, heavier weight, and a subtle
 * slide-in animation make it obvious without being intrusive.
 */
export function UpdateBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    window.api.update.onDownloaded(() => setVisible(true))
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        borderRadius: 12,
        // Accent brown as the banner base — contrasts hard against the
        // cream reading area so users can't miss the update prompt.
        background: 'var(--accent-primary, #8B6F47)',
        color: '#FFFFFF',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow:
          '0 10px 28px rgba(69, 50, 28, 0.32), 0 2px 6px rgba(69, 50, 28, 0.18)',
        fontSize: 15,
        fontWeight: 500,
        lineHeight: 1.2,
        animation: 'skimm-update-banner-in 280ms cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <Sparkles size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ whiteSpace: 'nowrap' }}>A new version is ready</span>

      <button
        onClick={() => window.api.update.install()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 14px',
          borderRadius: 8,
          border: 'none',
          // Inverted: white button on brown banner → highest contrast CTA.
          background: '#FFFFFF',
          color: 'var(--accent-primary, #8B6F47)',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'transform 120ms ease, box-shadow 120ms ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.18)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none'
          e.currentTarget.style.boxShadow = 'none'
        }}
        aria-label="Restart Skimm to install the update"
      >
        <RotateCw size={14} strokeWidth={2.5} />
        Restart to update
      </button>

      <button
        onClick={() => setVisible(false)}
        style={{
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          borderRadius: 6,
          border: 'none',
          background: 'transparent',
          color: 'rgba(255, 255, 255, 0.75)',
          cursor: 'pointer',
          transition: 'background-color 120ms ease, color 120ms ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
          e.currentTarget.style.color = '#FFFFFF'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.75)'
        }}
        aria-label="Dismiss update notification"
        title="Dismiss"
      >
        <X size={16} strokeWidth={2.5} />
      </button>
    </div>
  )
}
