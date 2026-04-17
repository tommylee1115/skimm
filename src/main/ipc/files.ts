import { ipcMain, dialog, app } from 'electron'
import {
  hasAllowedExtension,
  registerAllowedPath,
  safeReadFile
} from '../services/file-access'

export function registerFilesIpc(): void {
  ipcMain.handle('file:open-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    registerAllowedPath(filePath)
    return await safeReadFile(filePath)
  })

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    return await safeReadFile(filePath)
  })

  /**
   * Drag-and-drop bridge. Preload filters the drop for .md/.markdown/.txt
   * then notifies main which paths the user just dropped so file:read will
   * accept them. Returns the subset that was accepted.
   */
  ipcMain.handle('file:register-dropped', (_event, paths: string[]) => {
    if (!Array.isArray(paths)) return []
    const accepted: string[] = []
    for (const p of paths) {
      if (typeof p !== 'string' || !p) continue
      if (!hasAllowedExtension(p)) continue
      registerAllowedPath(p)
      accepted.push(p)
    }
    return accepted
  })

  ipcMain.handle('file:open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('app:version', () => app.getVersion())
}
