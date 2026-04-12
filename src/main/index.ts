import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readFile } from 'fs/promises'
import Store from 'electron-store'
import { autoUpdater } from 'electron-updater'
import { aiManager } from './services/ai/ai-manager'
import type { AIExplanationRequest } from './services/ai/provider.interface'
import { hasOpenAIKey, loadOpenAIKey } from './services/tts/openai-key'
import { openAiSynthesize, type OpenAIModel, type OpenAIVoice } from './services/tts/openai-tts.service'
import { openAiTranscribe } from './services/tts/whisper-transcribe.service'
import { initDatabase, saveCard, getAllCards, deleteCard, searchCards, type StudyCard } from './services/study-cards'
import icon from '../../resources/icon.png?asset'

const store = new Store<{ apiKey?: string; apiProvider?: string }>()

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Skimm',
    icon,
    titleBarStyle: 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// IPC Handlers
function registerIpcHandlers(): void {
  ipcMain.handle('file:open-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const content = await readFile(filePath, 'utf-8')
    return { path: filePath, content }
  })

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    const content = await readFile(filePath, 'utf-8')
    return { path: filePath, content }
  })

  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  ipcMain.handle('file:open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Settings
  ipcMain.handle('settings:get', (_event, key: string) => {
    return store.get(key)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    store.set(key, value)
    if (key === 'apiKey' && typeof value === 'string') {
      aiManager.setApiKey(value)
    }
  })

  // AI explain — streams chunks back to renderer
  ipcMain.handle('ai:explain', async (event, request: AIExplanationRequest) => {
    const provider = aiManager.getProvider()
    const textChunks: string[] = []

    for await (const chunk of provider.explain(request)) {
      if (chunk.type === 'text') {
        event.sender.send('ai:explain-stream', chunk.text)
        textChunks.push(chunk.text)
      } else if (chunk.type === 'usage') {
        event.sender.send('ai:explain-usage', chunk.usage)
      }
    }

    // Signal end of stream
    event.sender.send('ai:explain-done')
    return textChunks.join('')
  })

  // OpenAI TTS
  ipcMain.handle('tts:openai-available', () => {
    return hasOpenAIKey()
  })

  ipcMain.handle(
    'tts:openai-synthesize',
    async (
      _event,
      text: string,
      voice: OpenAIVoice,
      speed: number,
      model: OpenAIModel
    ) => {
      return await openAiSynthesize(text, voice, speed, model)
    }
  )

  ipcMain.handle('tts:openai-transcribe', async (_event, audioBase64: string) => {
    return await openAiTranscribe(audioBase64)
  })

  // Study cards
  ipcMain.handle('cards:save', (_event, card: StudyCard) => {
    saveCard(card)
  })

  ipcMain.handle('cards:list', () => {
    return getAllCards()
  })

  ipcMain.handle('cards:delete', (_event, id: string) => {
    deleteCard(id)
  })

  ipcMain.handle('cards:search', (_event, query: string) => {
    return searchCards(query)
  })

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.skimm.reader')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Override default menu to prevent Ctrl+W from closing the window
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Open File',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('menu:open-file')
          }
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            // Handled in renderer — do NOT close the window
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'copy' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)

  // Initialize SQLite database
  initDatabase()

  // Restore API key from settings
  const savedKey = store.get('apiKey')
  if (savedKey) aiManager.setApiKey(savedKey)

  // Load OpenAI key for TTS (logs to terminal only — never persisted)
  loadOpenAIKey()

  registerIpcHandlers()
  const mainWindow = createWindow()

  // Auto-updater — production only (dev builds have no update manifest)
  if (!is.dev) {
    autoUpdater.on('error', (err) => console.error('Auto-updater error:', err))
    autoUpdater.on('update-downloaded', () => {
      mainWindow.webContents.send('update:downloaded')
    })
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
