import path from 'path'
import { app } from 'electron'
import serve from 'electron-serve'
import dotenv from 'dotenv'
import { registerIpcHandlers } from './ipc/register-handlers'
import { createAuthService } from './services/auth'
import { createLauncherEventsService } from './services/events'
import { createGameLaunchService } from './services/game-launch'
import { createJavaService } from './services/java'
import { createPackService } from './services/pack'
import { configureUserDataPath, createSettingsService } from './services/settings'
import { createWindowService } from './services/windows'

dotenv.config()

const isProd = process.env.NODE_ENV === 'production'

configureUserDataPath(isProd)

if (isProd) {
  serve({ directory: 'app' })
}

const preloadPath = path.join(__dirname, 'preload.js')
const settingsService = createSettingsService()
const authService = createAuthService()
const windowService = createWindowService({
  isProd,
  preloadPath,
  getDevServerPort: () => process.argv[2],
})
const launcherEventsService = createLauncherEventsService(() =>
  windowService.getLogsWindowContents()
)
const packService = createPackService({
  emitLauncherEvent: launcherEventsService.emit,
})
const javaService = createJavaService({
  emitLauncherEvent: launcherEventsService.emit,
})
const gameLaunchService = createGameLaunchService({
  authService,
  javaService,
  launcherEventsService,
  openLogsWindow: windowService.openLogsWindow,
  packService,
  settingsService,
})

registerIpcHandlers({
  authService,
  gameLaunchService,
  launcherEventsService,
  packService,
  settingsService,
  windowService,
})

;(async () => {
  await app.whenReady()
  await windowService.createMainWindow()
})()

app.on('window-all-closed', () => {
  app.quit()
})
