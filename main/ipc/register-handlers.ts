import { dialog, ipcMain, shell } from 'electron'
import { IPC_CHANNELS, IPC_INVOKE_CHANNELS, IPC_SEND_CHANNELS } from '../../shared/ipc'
import type { AuthService } from '../services/auth'
import type { GameLaunchService } from '../services/game-launch'
import type { LauncherEventsService } from '../services/events'
import type { PackService } from '../services/pack'
import type { SettingsService } from '../services/settings'
import type { WindowService } from '../services/windows'

type RegisterHandlersDependencies = {
  authService: AuthService
  gameLaunchService: GameLaunchService
  launcherEventsService: LauncherEventsService
  packService: PackService
  settingsService: SettingsService
  windowService: WindowService
}

export const registerIpcHandlers = ({
  authService,
  gameLaunchService,
  launcherEventsService,
  packService,
  settingsService,
  windowService,
}: RegisterHandlersDependencies) => {
  for (const channel of IPC_SEND_CHANNELS) {
    ipcMain.removeAllListeners(channel)
  }

  for (const channel of IPC_INVOKE_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.on(IPC_CHANNELS.windowMinimize, (event) => {
    windowService.handleWindowControl(IPC_CHANNELS.windowMinimize, event.sender)
  })

  ipcMain.on(IPC_CHANNELS.windowToggleMaximize, (event) => {
    windowService.handleWindowControl(IPC_CHANNELS.windowToggleMaximize, event.sender)
  })

  ipcMain.on(IPC_CHANNELS.windowClose, (event) => {
    windowService.handleWindowControl(IPC_CHANNELS.windowClose, event.sender)
  })

  ipcMain.handle(IPC_CHANNELS.authLogin, () => authService.login())
  ipcMain.handle(IPC_CHANNELS.authRestore, () => authService.restore())
  ipcMain.handle(IPC_CHANNELS.authLogout, () => authService.logout())

  ipcMain.handle(IPC_CHANNELS.launcherGetState, async () => {
    const settings = settingsService.saveSettings()
    const pack = await packService.resolvePackState(settings)

    return {
      ok: true,
      settings,
      pack,
    }
  })

  ipcMain.handle(IPC_CHANNELS.launcherSaveSettings, async (_event, partial) => {
    const settings = settingsService.saveSettings(partial)

    return {
      ok: true,
      settings,
      pack: settingsService.shouldRefreshPackState(partial)
        ? await packService.resolvePackState(settings)
        : undefined,
    }
  })

  ipcMain.handle(IPC_CHANNELS.launcherPickInstanceDirectory, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: settingsService.getSettings().instanceDirectory,
      title: "Choisir le dossier de l'instance",
    })

    if (result.canceled || result.filePaths.length === 0) {
      return {
        ok: false,
      }
    }

    const settings = settingsService.saveSettings({
      instanceDirectory: result.filePaths[0],
    })
    const pack = await packService.resolvePackState(settings)

    return {
      ok: true,
      settings,
      pack,
    }
  })

  ipcMain.handle(IPC_CHANNELS.launcherOpenLogs, async () => {
    await windowService.openLogsWindow()

    return {
      ok: true,
    }
  })

  ipcMain.handle(IPC_CHANNELS.launcherGetLogs, () => launcherEventsService.getLogs())

  ipcMain.handle(IPC_CHANNELS.systemOpenExternal, async (_event, value: unknown) => {
    const url = typeof value === 'string' ? value.trim() : ''

    if (!url) {
      return { ok: false }
    }

    await shell.openExternal(url)

    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.launcherRepairPack, async (_event, partial) => {
    const settings = settingsService.saveSettings(partial)

    await packService.clearInstalledPackState(settings.instanceDirectory)

    return {
      ok: true,
      settings,
      pack: await packService.resolvePackState(settings),
    }
  })

  ipcMain.handle(IPC_CHANNELS.launcherLaunch, (event, partial) =>
    gameLaunchService.launch(event.sender, partial)
  )
}
