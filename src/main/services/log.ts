import log from 'electron-log/main'
import { app } from 'electron'
import { join } from 'path'

/**
 * Central logger. File transport writes to:
 *   Windows: %APPDATA%/skimm/logs/main.log
 *   macOS:   ~/Library/Logs/skimm/main.log
 *   Linux:   ~/.config/skimm/logs/main.log
 *
 * Rotation happens at 1 MB — electron-log renames main.log → main.old.log
 * and starts a fresh main.log. We keep one generation so on-disk log cost
 * is bounded at ~2 MB per installed copy.
 *
 * Why bother: once the app is packaged, console.log goes to a Chromium
 * DevTools panel the user never opens. Auto-update failures, TTS errors,
 * and main-process exceptions would otherwise vanish. This file is the
 * paper trail we ask users to send when something breaks in the wild.
 */
export function initLogger(): void {
  log.transports.file.level = 'info'
  log.transports.file.maxSize = 1 * 1024 * 1024 // 1 MB
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  log.transports.file.resolvePathFn = () =>
    join(app.getPath('userData'), 'logs', 'main.log')

  // Spy renderer console.* → append to the main log too. Falls back to
  // noop if the renderer process hasn't loaded yet.
  log.initialize({ spyRendererConsole: true })

  // Redirect main-process console.* to electron-log. Everything we log
  // via console.log/error/warn from here on lands in the rotating file.
  Object.assign(console, log.functions)

  log.info('[log] electron-log initialised', { logFile: log.transports.file.getFile().path })
}

export { log }
