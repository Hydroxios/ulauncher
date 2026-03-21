import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import { createWindow } from '../helpers'
import { IPC_CHANNELS, type WindowControlChannel } from '../../shared/ipc'

type WindowServiceOptions = {
  isProd: boolean
  preloadPath: string
  getDevServerPort: () => string
}

export const createWindowService = ({
  isProd,
  preloadPath,
  getDevServerPort,
}: WindowServiceOptions) => {
  let mainWindow: BrowserWindow | null = null
  let logsWindow: BrowserWindow | null = null

  const loadRoute = async (window: BrowserWindow, route: string) => {
    if (isProd) {
      await window.loadURL(`app://./${route}`)
      return
    }

    const port = getDevServerPort()
    await window.loadURL(`http://localhost:${port}/${route}`)
  }

  const createMainWindow = async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow
    }

    mainWindow = createWindow('main', {
      width: 1280,
      height: 720,
      minWidth: 1100,
      minHeight: 680,
      frame: false,
      backgroundColor: '#09030d',
      webPreferences: {
        preload: preloadPath,
      },
    })

    await loadRoute(mainWindow, 'home')

    return mainWindow
  }

  const openLogsWindow = async () => {
    if (logsWindow && !logsWindow.isDestroyed()) {
      logsWindow.focus()
      return logsWindow
    }

    logsWindow = createWindow('logs', {
      width: 900,
      height: 620,
      minWidth: 720,
      minHeight: 480,
      frame: false,
      backgroundColor: '#110518',
      title: 'Logs',
      webPreferences: {
        preload: preloadPath,
      },
    })

    logsWindow.on('closed', () => {
      logsWindow = null
    })

    await loadRoute(logsWindow, 'logs')

    return logsWindow
  }

  const getLogsWindowContents = () => {
    if (!logsWindow || logsWindow.isDestroyed()) {
      return null
    }

    return logsWindow.webContents
  }

  const handleWindowControl = (channel: WindowControlChannel, sender: WebContents) => {
    const window = BrowserWindow.fromWebContents(sender)

    if (!window) {
      return
    }

    if (channel === IPC_CHANNELS.windowMinimize) {
      window.minimize()
      return
    }

    if (channel === IPC_CHANNELS.windowToggleMaximize) {
      if (window.isMaximized()) {
        window.unmaximize()
        return
      }

      window.maximize()
      return
    }

    window.close()
  }

  return {
    createMainWindow,
    getLogsWindowContents,
    handleWindowControl,
    openLogsWindow,
  }
}

export type WindowService = ReturnType<typeof createWindowService>
