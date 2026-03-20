import path from 'path'
import { app } from 'electron'
import Store from 'electron-store'
import type { LauncherSettings } from '../../shared/launcher'
import { normalizeString } from '../utils/common'

const DEFAULT_PACK_MANIFEST_URL = process.env.UZTIK_PACK_MANIFEST_URL?.trim() ?? ''

export const configureUserDataPath = (isProd: boolean) => {
  const userDataDirectoryName = isProd ? 'mlauncher' : 'mlauncher (development)'
  app.setPath('userData', path.join(app.getPath('appData'), userDataDirectoryName))
}

export const createSettingsService = () => {
  const launcherStore = new Store<{ settings?: LauncherSettings }>({
    name: 'launcher-settings',
  })

  const getDefaultLauncherSettings = (): LauncherSettings => ({
    memoryGb: 4,
    instanceDirectory: path.join(app.getPath('appData'), '.minecraft'),
    openLogsOnLaunch: false,
    packManifestUrl: DEFAULT_PACK_MANIFEST_URL,
  })

  const getSettings = (): LauncherSettings => {
    const stored = launcherStore.get('settings')

    return {
      ...getDefaultLauncherSettings(),
      ...stored,
    }
  }

  const saveSettings = (partial?: Partial<LauncherSettings>) => {
    const next = {
      ...getSettings(),
      ...partial,
    }

    next.memoryGb = Math.max(1, Math.min(16, Number(next.memoryGb) || 4))
    next.instanceDirectory =
      normalizeString(next.instanceDirectory) || getDefaultLauncherSettings().instanceDirectory
    next.packManifestUrl = normalizeString(next.packManifestUrl)

    launcherStore.set('settings', next)

    return next
  }

  const shouldRefreshPackState = (partial?: Partial<LauncherSettings>) => {
    if (!partial) {
      return true
    }

    return 'instanceDirectory' in partial || 'packManifestUrl' in partial
  }

  return {
    getDefaultLauncherSettings,
    getSettings,
    saveSettings,
    shouldRefreshPackState,
  }
}

export type SettingsService = ReturnType<typeof createSettingsService>
