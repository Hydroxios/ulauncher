import path from 'path'
import { app } from 'electron'
import Store from 'electron-store'
import type { LauncherSettings } from '../../shared/launcher'
import { normalizeString } from '../utils/common'

type PersistedLauncherSettings = Partial<LauncherSettings> & {
  packManifestUrl?: string
}

const DEFAULT_PACK_MANIFEST_URL = normalizeString(process.env.MANIFEST_URL)

export const configureUserDataPath = (isProd: boolean) => {
  const userDataDirectoryName = isProd ? 'mlauncher' : 'mlauncher (development)'
  app.setPath('userData', path.join(app.getPath('appData'), userDataDirectoryName))
}

export const createSettingsService = () => {
  const launcherStore = new Store<{ settings?: PersistedLauncherSettings }>({
    name: 'launcher-settings',
  })

  const getDefaultLauncherSettings = (): LauncherSettings => ({
    memoryGb: 4,
    instanceDirectory: path.join(app.getPath('appData'), '.minecraft'),
    openLogsOnLaunch: false,
  })

  const sanitizeLauncherSettings = (
    value?: Partial<PersistedLauncherSettings>
  ): LauncherSettings => {
    const defaults = getDefaultLauncherSettings()
    const next = {
      ...defaults,
      ...value,
    }

    return {
      memoryGb: Math.max(1, Math.min(16, Number(next.memoryGb) || defaults.memoryGb)),
      instanceDirectory: normalizeString(next.instanceDirectory) || defaults.instanceDirectory,
      openLogsOnLaunch: Boolean(next.openLogsOnLaunch),
    }
  }

  const getSettings = (): LauncherSettings => {
    return sanitizeLauncherSettings(launcherStore.get('settings'))
  }

  const saveSettings = (partial?: Partial<LauncherSettings>) => {
    const next = sanitizeLauncherSettings({
      ...getSettings(),
      ...partial,
    })

    launcherStore.set('settings', next)

    return next
  }

  const shouldRefreshPackState = (partial?: Partial<LauncherSettings>) => {
    if (!partial) {
      return true
    }

    return 'instanceDirectory' in partial
  }

  return {
    getDefaultLauncherSettings,
    getPackManifestUrl: () => DEFAULT_PACK_MANIFEST_URL,
    getSettings,
    saveSettings,
    shouldRefreshPackState,
  }
}

export type SettingsService = ReturnType<typeof createSettingsService>
