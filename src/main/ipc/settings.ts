import { ipcMain } from 'electron'
import type Store from 'electron-store'
import { aiManager } from '../services/ai/ai-manager'
import { secrets } from '../services/secrets'
import { registerAllowedPath } from '../services/file-access'

/**
 * Settings IPC. Most keys are transparent electron-store get/set, but:
 *   - `apiKey` is held by safeStorage, not the electron-store plaintext
 *     field. The renderer still sees a decrypted value on `get` so the
 *     Settings panel can prefill the input — it never lands on disk
 *     outside the OS keychain.
 *   - workspace.* / session.* keys mirror paths into the file-access
 *     allow-list so a fresh session restore can read the persisted
 *     workspace without bouncing off the allow-list on first call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerSettingsIpc(store: Store<any>): void {
  ipcMain.handle('settings:get', (_event, key: string) => {
    // Secret keys — routed through safeStorage (DPAPI on Windows). The
    // decrypted value is only returned to the same renderer that called
    // settings:get; it never touches disk outside the OS keychain and
    // never crosses a network boundary from the main process.
    if (key === 'apiKey') return secrets.getApiKey() ?? ''
    if (key === 'openaiApiKey') return secrets.getOpenaiKey() ?? ''
    return store.get(key)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    if (key === 'apiKey' && typeof value === 'string') {
      if (value.length > 0) secrets.setApiKey(value)
      else secrets.clearApiKey()
      aiManager.setApiKey(value)
      return
    }

    if (key === 'openaiApiKey' && typeof value === 'string') {
      if (value.length > 0) secrets.setOpenaiKey(value)
      else secrets.clearOpenaiKey()
      // openai-key.ts re-reads on every call, so TTS / Whisper pick up
      // the change immediately with no additional plumbing.
      return
    }

    store.set(key, value)

    // Keep the file-read allow-list in sync with anything the renderer
    // persists that represents a file path. Session restore will ask
    // main to read these later.
    if (key === 'workspace.files' && Array.isArray(value)) {
      for (const p of value) if (typeof p === 'string') registerAllowedPath(p)
    } else if (key === 'workspace.folders' && Array.isArray(value)) {
      for (const folder of value as Array<{ files?: unknown }>) {
        if (!folder || !Array.isArray(folder.files)) continue
        for (const p of folder.files) if (typeof p === 'string') registerAllowedPath(p)
      }
    } else if (key === 'session.openFiles' && Array.isArray(value)) {
      for (const p of value) if (typeof p === 'string') registerAllowedPath(p)
    } else if (key === 'session' && value && typeof value === 'object') {
      // Phase 3.6 combined session blob.
      const openFiles = (value as { openFiles?: unknown }).openFiles
      if (Array.isArray(openFiles)) {
        for (const p of openFiles) if (typeof p === 'string') registerAllowedPath(p)
      }
    }
  })

  /** Batch getter — one IPC round-trip per store load. */
  ipcMain.handle('settings:getMany', (_event, keys: string[]) => {
    if (!Array.isArray(keys)) return {}
    const result: Record<string, unknown> = {}
    for (const key of keys) {
      if (typeof key !== 'string') continue
      if (key === 'apiKey') {
        result[key] = secrets.getApiKey() ?? ''
      } else if (key === 'openaiApiKey') {
        result[key] = secrets.getOpenaiKey() ?? ''
      } else {
        result[key] = store.get(key)
      }
    }
    return result
  })
}
