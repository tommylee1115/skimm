import { ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { log } from '../services/log'

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number; version?: string }
  | { state: 'downloaded' }
  | { state: 'error'; message: string }

/**
 * Wires up the renderer-facing update surface:
 *   - `update:install` — quit and apply a downloaded update (existing)
 *   - `update:check` — trigger a manual check (new, backs the Settings
 *     "Check for updates" button)
 *   - outbound `update:status` events — every auto-updater state
 *     transition is broadcast to all windows so the UI can reflect
 *     checking / up-to-date / downloading / etc.
 *
 * Dev builds have no update manifest on disk, so `update:check`
 * short-circuits with a friendly status instead of failing.
 */
export function registerUpdateIpc(): void {
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())

  ipcMain.handle('update:check', async () => {
    if (is.dev) {
      broadcastStatus({
        state: 'error',
        message: 'Updates are disabled in dev builds.'
      })
      return
    }
    try {
      broadcastStatus({ state: 'checking' })
      await autoUpdater.checkForUpdates()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('[updater] manual check failed:', err)
      broadcastStatus({ state: 'error', message })
    }
  })
}

/** Subscribe to the live autoUpdater and broadcast each transition to
 *  every open window. Called once from main/index.ts at startup. */
export function wireAutoUpdaterEvents(): void {
  if (is.dev) return
  autoUpdater.on('checking-for-update', () => broadcastStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    broadcastStatus({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () =>
    broadcastStatus({ state: 'up-to-date' })
  )
  autoUpdater.on('download-progress', (p) =>
    broadcastStatus({
      state: 'downloading',
      percent: Math.round(p.percent ?? 0)
    })
  )
  autoUpdater.on('update-downloaded', () => broadcastStatus({ state: 'downloaded' }))
  autoUpdater.on('error', (err) =>
    broadcastStatus({
      state: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
  )
}

function broadcastStatus(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:status', status)
  }
}
