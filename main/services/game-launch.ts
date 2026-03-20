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

      launcher.on('debug', (message) =>
        launcherEventsService.emit(sender, 'debug', String(message))
      )
      launcher.on('data', (message) => launcherEventsService.emit(sender, 'data', String(message)))
      launcher.on('progress', (message) => launcherEventsService.emit(sender, 'progress', message))
      launcher.on('package-extract', () =>
        launcherEventsService.emit(sender, 'status', 'Pack extrait dans l instance')
      )
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
        clientPackage: preparedPack.clientPackagePath,
        removePackage: Boolean(preparedPack.clientPackagePath),
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

  return {
    launch,
  }
}

export type GameLaunchService = ReturnType<typeof createGameLaunchService>
