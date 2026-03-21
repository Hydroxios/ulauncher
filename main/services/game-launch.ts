import type { ChildProcessWithoutNullStreams } from 'child_process'
import type { WebContents } from 'electron'
import { Client } from 'minecraft-launcher-core'
import type { LauncherActionResponse, LauncherSettings } from '../../shared/launcher'
import { toErrorMessage } from '../utils/common'
import type { AuthService } from './auth'
import type { JavaService } from './java'
import type { LauncherEventsService } from './events'
import type { PackService } from './pack'
import type { SettingsService } from './settings'

type GameLaunchServiceDependencies = {
  authService: AuthService
  javaService: JavaService
  launcherEventsService: LauncherEventsService
  openLogsWindow: () => Promise<unknown>
  packService: PackService
  settingsService: SettingsService
}

type LauncherProgressMessage = {
  type?: string
  task?: number
  total?: number
  unit?: 'items' | 'bytes'
  label?: string
}

type LauncherDownloadStatusMessage = {
  name?: string
  type?: string
  current?: number
  total?: number
}

type SmoothedProgressTracker = {
  completedTasks: number
  totalTasks: number
  activeDownloads: Map<string, { current: number; total: number }>
}

export const createGameLaunchService = ({
  authService,
  javaService,
  launcherEventsService,
  openLogsWindow,
  packService,
  settingsService,
}: GameLaunchServiceDependencies) => {
  let activeMinecraftProcess: ChildProcessWithoutNullStreams | null = null

  const launch = async (
    sender: WebContents,
    partial: Partial<LauncherSettings>
  ): Promise<LauncherActionResponse> => {
    if (activeMinecraftProcess) {
      return {
        ok: false,
        error: 'Minecraft est deja en cours de lancement.',
      }
    }

    const session = authService.getSession()

    if (!session?.refreshToken) {
      return {
        ok: false,
        error: 'Aucune session Microsoft active.',
      }
    }

    const settings = settingsService.saveSettings(partial)

    if (!settings.packManifestUrl) {
      return {
        ok: false,
        error: 'Configure une URL de manifeste de pack avant de lancer le jeu.',
      }
    }

    try {
      const { minecraft } = await authService.refreshMinecraftSession(session.refreshToken)
      const launcher = new Client()
      const smoothedProgressTypes = new Set(['assets', 'natives'])
      const smoothedProgressTrackers = new Map<string, SmoothedProgressTracker>()

      if (settings.openLogsOnLaunch) {
        await openLogsWindow()
      }

      const preparedPack = await packService.preparePack(
        settings.instanceDirectory,
        settings.packManifestUrl,
        sender
      )
      const javaPath = await javaService.ensureJavaRuntime(
        preparedPack.manifest.minecraftVersion,
        sender
      )

      const emitSmoothedProgress = (type: string) => {
        const tracker = smoothedProgressTrackers.get(type)

        if (!tracker || tracker.totalTasks <= 0) {
          return
        }

        const activeDownloadFraction = [...tracker.activeDownloads.values()].reduce(
          (total, download) => {
            if (!Number.isFinite(download.total) || download.total <= 0) {
              return total
            }

            return total + Math.min(download.current / download.total, 0.99)
          },
          0
        )

        launcherEventsService.emit(sender, 'progress', {
          type,
          task: Math.min(tracker.totalTasks, tracker.completedTasks + activeDownloadFraction),
          total: tracker.totalTasks,
          unit: 'items',
        })
      }

      const isLauncherProgressMessage = (value: unknown): value is LauncherProgressMessage => {
        if (!value || typeof value !== 'object') {
          return false
        }

        const message = value as LauncherProgressMessage

        return (
          typeof message.type === 'string' &&
          typeof message.task === 'number' &&
          Number.isFinite(message.task) &&
          typeof message.total === 'number' &&
          Number.isFinite(message.total)
        )
      }

      const isLauncherDownloadStatusMessage = (
        value: unknown
      ): value is LauncherDownloadStatusMessage => {
        if (!value || typeof value !== 'object') {
          return false
        }

        const message = value as LauncherDownloadStatusMessage

        return (
          typeof message.name === 'string' &&
          typeof message.type === 'string' &&
          typeof message.current === 'number' &&
          Number.isFinite(message.current) &&
          typeof message.total === 'number' &&
          Number.isFinite(message.total)
        )
      }

      launcher.on('debug', (message) =>
        launcherEventsService.emit(sender, 'debug', String(message))
      )
      launcher.on('data', (message) => launcherEventsService.emit(sender, 'data', String(message)))
      launcher.on('progress', (message) => {
        if (!isLauncherProgressMessage(message) || !smoothedProgressTypes.has(message.type)) {
          launcherEventsService.emit(sender, 'progress', message)
          return
        }

        const tracker = smoothedProgressTrackers.get(message.type) ?? {
          completedTasks: 0,
          totalTasks: message.total,
          activeDownloads: new Map<string, { current: number; total: number }>(),
        }

        tracker.completedTasks = message.task
        tracker.totalTasks = message.total

        if (tracker.completedTasks >= tracker.totalTasks) {
          tracker.activeDownloads.clear()
        } else {
          for (const [name, download] of tracker.activeDownloads.entries()) {
            if (download.current >= download.total) {
              tracker.activeDownloads.delete(name)
            }
          }
        }

        smoothedProgressTrackers.set(message.type, tracker)
        emitSmoothedProgress(message.type)
      })
      launcher.on('download-status', (message) => {
        if (
          !isLauncherDownloadStatusMessage(message) ||
          !smoothedProgressTypes.has(message.type) ||
          message.total <= 0
        ) {
          return
        }

        const tracker = smoothedProgressTrackers.get(message.type)

        if (!tracker || tracker.totalTasks <= 0) {
          return
        }

        tracker.activeDownloads.set(message.name, {
          current: message.current,
          total: message.total,
        })
        emitSmoothedProgress(message.type)
      })
      launcher.on('close', (code) => {
        launcherEventsService.emit(sender, 'close', code)
        activeMinecraftProcess = null
      })

      const minMemory = Math.max(
        1,
        Math.min(settings.memoryGb, Math.floor(settings.memoryGb / 2) || 1)
      )
      const process = await launcher.launch({
        authorization: minecraft.mclc(true) as any,
        javaPath,
        root: settings.instanceDirectory,
        version: {
          number: preparedPack.manifest.minecraftVersion,
          type: 'release',
          custom: preparedPack.fabricProfileId,
        },
        memory: {
          max: `${settings.memoryGb}G`,
          min: `${minMemory}G`,
        },
        overrides: {
          detached: false,
        },
      })

      if (!process) {
        activeMinecraftProcess = null
        return {
          ok: false,
          error: 'Le lancement de Minecraft a echoue.',
        }
      }

      activeMinecraftProcess = process
      await packService.writeInstalledPackState(
        settings.instanceDirectory,
        preparedPack.installedState
      )

      launcherEventsService.emit(
        sender,
        'status',
        `Lancement de Minecraft ${preparedPack.manifest.minecraftVersion} avec Fabric ${preparedPack.manifest.fabricLoaderVersion}`
      )

      return {
        ok: true,
        settings,
        pack: await packService.resolvePackState(settings),
      }
    } catch (error) {
      activeMinecraftProcess = null
      launcherEventsService.emit(sender, 'error', toErrorMessage(error))

      return {
        ok: false,
        error: toErrorMessage(error),
        pack: await packService.resolvePackState(settings),
      }
    }
  }

  const closeGame = async (): Promise<LauncherActionResponse> => {
    if (!activeMinecraftProcess) {
      return {
        ok: false,
        error: 'Minecraft n est pas en cours dexecution.',
      }
    }

    try {
      activeMinecraftProcess.kill()

      return {
        ok: true,
      }
    } catch (error) {
      return {
        ok: false,
        error: toErrorMessage(error),
      }
    }
  }

  return {
    closeGame,
    launch,
  }
}

export type GameLaunchService = ReturnType<typeof createGameLaunchService>
