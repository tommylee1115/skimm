import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { autoUpdater } from 'electron-updater'
import { aiManager } from './services/ai/ai-manager'
import { loadOpenAIKey } from './services/tts/openai-key'
import { initDatabase } from './services/study-cards'
import { initLogger, log } from './services/log'
import { initSecrets, secrets } from './services/secrets'
import { seedAllowedPathsFromStore } from './services/file-access'
import { registerAllIpc } from './ipc'
import { wireAutoUpdaterEvents } from './ipc/update'
import icon from '../../resources/icon.png?asset'

const store = new Store<{
  apiKey?: string
  apiKeyEncrypted?: string
  apiProvider?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}>()

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
      // Full sandbox: the renderer + preload run in a Chromium sandbox
      // with no Node runtime. Preload only imports { contextBridge,
      // ipcRenderer, webUtils } from 'electron', all of which are
      // sandbox-compatible. A compromised renderer now cannot touch the
      // filesystem, spawn processes, or reach the OS — only IPC over
      // the narrow SkimmApi.
      sandbox: true,
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

function buildAppMenu(): Menu {
  return Menu.buildFromTemplate([
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
          // Handled in renderer — do NOT close the window here.
          click: () => {}
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [{ role: 'copy' }, { role: 'selectAll' }]
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
      submenu: [{ role: 'minimize' }]
    }
  ])
}

function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // Production only — dev builds have no update manifest.
  if (is.dev) return

  autoUpdater.logger = log

  // Per-event logging stays here; the renderer-facing broadcast lives
  // in wireAutoUpdaterEvents (src/main/ipc/update.ts).
  autoUpdater.on('checking-for-update', () => log.info('[updater] checking-for-update'))
  autoUpdater.on('update-available', (info) =>
    log.info('[updater] update-available', info.version)
  )
  autoUpdater.on('update-not-available', () => log.info('[updater] update-not-available'))
  autoUpdater.on('download-progress', (p) =>
    log.info(`[updater] download-progress ${p.percent?.toFixed(1)}%`)
  )
  autoUpdater.on('update-downloaded', () => {
    log.info('[updater] update-downloaded — notifying renderer')
    mainWindow.webContents.send('update:downloaded')
  })
  autoUpdater.on('error', (err) => log.error('[updater] error:', err))

  // Broadcast every state change to the renderer so the Settings panel
  // can reflect live status.
  wireAutoUpdaterEvents()

  autoUpdater.checkForUpdatesAndNotify()
}

app.whenReady().then(() => {
  // Logger first — everything below logs through the rotating file transport.
  initLogger()

  electronApp.setAppUserModelId('com.skimm.reader')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  Menu.setApplicationMenu(buildAppMenu())

  // Bootstrap services in dependency order: DB → secrets (migrates legacy
  // plaintext apiKey) → file-access allow-list (seeded from persisted
  // workspace) → OpenAI key loader → IPC registry.
  initDatabase()
  initSecrets(store)
  seedAllowedPathsFromStore(store)

  const savedKey = secrets.getApiKey()
  if (savedKey) aiManager.setApiKey(savedKey)

  loadOpenAIKey()

  registerAllIpc(store)

  const mainWindow = createWindow()
  setupAutoUpdater(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
