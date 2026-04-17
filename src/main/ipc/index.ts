import type Store from 'electron-store'
import { registerFilesIpc } from './files'
import { registerAiIpc } from './ai'
import { registerTtsIpc } from './tts'
import { registerCardsIpc } from './cards'
import { registerSettingsIpc } from './settings'
import { registerUpdateIpc } from './update'

/**
 * Registers every ipcMain.handle under src/main/ipc/*. Called once from
 * main/index.ts during app bootstrap. Each module owns the handlers for
 * one domain and keeps its own private state (e.g. ai.ts owns the
 * inflight explain map).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerAllIpc(store: Store<any>): void {
  registerFilesIpc()
  registerAiIpc()
  registerTtsIpc()
  registerCardsIpc()
  registerSettingsIpc(store)
  registerUpdateIpc()
}
