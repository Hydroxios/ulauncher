import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  LauncherAccount,
  LauncherActionResponse,
  LauncherEvent,
  LauncherPackState,
  LauncherProgressPayload,
  LauncherSettings,
} from '../../shared/launcher'
import { launcherIpc } from '../lib/launcher-ipc'

export type LaunchProgressState = {
  current: number
  label: string
  percent: number | null
  total: number
  type: string
  unit: 'items' | 'bytes'
}

const isLauncherProgressPayload = (value: unknown): value is LauncherProgressPayload => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const payload = value as Partial<LauncherProgressPayload>

  return (
    typeof payload.type === 'string' &&
    typeof payload.task === 'number' &&
    Number.isFinite(payload.task) &&
    typeof payload.total === 'number' &&
    Number.isFinite(payload.total)
  )
}

const getProgressLabel = (payload: LauncherProgressPayload) => {
  if (payload.label) {
    return payload.label
  }

  switch (payload.type) {
    case 'pack-download':
      return 'Pack'
    case 'pack-extract':
      return 'Extraction du pack'
    case 'java-runtime':
      return 'Java'
    case 'assets':
      return 'Assets'
    case 'assets-copy':
      return 'Copie des assets'
    case 'natives':
      return 'Natives'
    case 'classes':
      return 'Libraries'
    case 'classes-custom':
      return 'Libraries custom'
    case 'classes-maven-custom':
      return 'Libraries Fabric'
    default:
      return 'Preparation'
  }
}

const toLaunchProgressState = (payload: LauncherProgressPayload): LaunchProgressState => {
  const total = payload.total > 0 ? payload.total : 0
  const current = Math.max(0, total > 0 ? Math.min(payload.task, total) : payload.task)
  const percent = total > 0 ? (current / total) * 100 : null

  return {
    current,
    label: getProgressLabel(payload),
    percent,
    total,
    type: payload.type,
    unit: payload.unit === 'bytes' ? 'bytes' : 'items',
  }
}

const applyLauncherResponseState = (
  response: LauncherActionResponse,
  setLauncherSettings: (value: LauncherSettings | null) => void,
  setLauncherPack: Dispatch<SetStateAction<LauncherPackState | null>>,
  setPackManifestInput: (value: string) => void
) => {
  if (response.settings) {
    setLauncherSettings(response.settings)
    setPackManifestInput(response.settings.packManifestUrl)
  }

  if (response.pack) {
    setLauncherPack(response.pack)
  }
}

export const useLauncherHomeState = () => {
  const [account, setAccount] = useState<LauncherAccount | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [launcherSettings, setLauncherSettings] = useState<LauncherSettings | null>(null)
  const [launcherPack, setLauncherPack] = useState<LauncherPackState | null>(null)
  const [packManifestInput, setPackManifestInput] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [isGameRunning, setIsGameRunning] = useState(false)
  const [launchStatus, setLaunchStatus] = useState<string | null>(null)
  const [launchProgress, setLaunchProgress] = useState<LaunchProgressState | null>(null)

  useEffect(() => {
    let cancelled = false

    const restoreSession = async () => {
      try {
        const response = await launcherIpc.restore()

        if (cancelled) {
          return
        }

        if (response.ok && response.account) {
          setAccount(response.account)
          setError(null)
        } else if (response.error) {
          setError(response.error)
        }
      } catch (restoreError) {
        if (!cancelled) {
          setError(
            restoreError instanceof Error
              ? restoreError.message
              : 'Impossible de restaurer la session.'
          )
        }
      } finally {
        if (!cancelled) {
          setIsRestoring(false)
        }
      }
    }

    restoreSession()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadLauncherState = async () => {
      try {
        const response = await launcherIpc.getState()

        if (cancelled || !response.ok) {
          return
        }

        setLauncherSettings(response.settings)
        setLauncherPack(response.pack)
        setPackManifestInput(response.settings.packManifestUrl)
      } catch {
        if (!cancelled) {
          setLauncherPack(null)
        }
      }
    }

    loadLauncherState()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const unsubscribe = launcherIpc.onLauncherEvent((event: LauncherEvent) => {
      if (event.type === 'close') {
        setIsLaunching(false)
        setIsGameRunning(false)
        setLaunchStatus('Minecraft ferme.')
        setLaunchProgress(null)
      }

      if (event.type === 'error') {
        setError(typeof event.payload === 'string' ? event.payload : 'Erreur de lancement.')
        setIsLaunching(false)
        setIsGameRunning(false)
        setLaunchProgress(null)
      }

      if (event.type === 'status' && typeof event.payload === 'string') {
        setLaunchStatus(event.payload)
      }

      if (event.type === 'progress' && isLauncherProgressPayload(event.payload)) {
        setLaunchProgress(toLaunchProgressState(event.payload))
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const saveSettings = async (partial: Partial<LauncherSettings>) => {
    if (!launcherSettings) {
      return
    }

    setLauncherSettings({
      ...launcherSettings,
      ...partial,
    })

    const response = await launcherIpc.saveSettings(partial)

    if (response.ok) {
      applyLauncherResponseState(
        response,
        setLauncherSettings,
        setLauncherPack,
        setPackManifestInput
      )
      return
    }

    setError(response.error ?? 'Impossible de sauvegarder les settings.')
  }

  const persistManifestUrl = async () => {
    if (!launcherSettings || packManifestInput === launcherSettings.packManifestUrl) {
      return
    }

    await saveSettings({ packManifestUrl: packManifestInput.trim() })
  }

  const handleMicrosoftLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await launcherIpc.login()

      if (response.ok && response.account) {
        setAccount(response.account)
        return
      }

      setError(response.error ?? 'Connexion Microsoft annulee.')
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : 'Connexion Microsoft impossible.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    setIsLoading(true)
    setError(null)

    try {
      await launcherIpc.logout()
      setAccount(null)
      setIsGameRunning(false)
      setLaunchStatus(null)
      setLaunchProgress(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePickInstanceDirectory = async () => {
    const response = await launcherIpc.pickInstanceDirectory()

    if (response.ok) {
      applyLauncherResponseState(
        response,
        setLauncherSettings,
        setLauncherPack,
        setPackManifestInput
      )
      return
    }

    if (response.error) {
      setError(response.error)
    }
  }

  const handleRepairPack = async () => {
    if (!launcherSettings) {
      return
    }

    setLaunchStatus('Le pack sera reinstalle au prochain lancement.')
    setLaunchProgress(null)
    setError(null)

    const response = await launcherIpc.repairPack(launcherSettings)

    if (response.ok) {
      applyLauncherResponseState(
        response,
        setLauncherSettings,
        setLauncherPack,
        setPackManifestInput
      )
      return
    }

    setError(response.error ?? 'Impossible de reinitialiser le pack.')
  }

  const handleLaunch = async () => {
    if (!launcherSettings) {
      return
    }

    setIsLaunching(true)
    setIsGameRunning(false)
    setError(null)
    setLaunchStatus('Preparation du lancement')
    setLaunchProgress(null)

    try {
      const response = await launcherIpc.launch(launcherSettings)

      if (!response.ok) {
        setIsLaunching(false)
        setError(response.error ?? 'Le lancement de Minecraft a echoue.')
      } else {
        setIsLaunching(false)
        setIsGameRunning(true)
        setLaunchProgress(null)
        setLaunchStatus('Minecraft lance.')
      }

      if (response.pack) {
        setLauncherPack(response.pack)
      }
    } catch (launchError) {
      setIsLaunching(false)
      setError(
        launchError instanceof Error ? launchError.message : 'Le lancement a echoue.'
      )
    }
  }

  const handleCloseGame = async () => {
    setError(null)

    const response = await launcherIpc.closeGame()

    if (!response.ok) {
      setError(response.error ?? 'Impossible de fermer Minecraft.')
    }
  }

  const openLogsNow = async () => {
    const response = await launcherIpc.openLogs()

    if (!response.ok) {
      setError("Impossible d'ouvrir la fenetre de logs.")
    }
  }

  const openExternal = async (url: string) => {
    const response = await launcherIpc.openExternal(url)

    if (!response.ok) {
      setError("Impossible d'ouvrir le lien externe.")
    }
  }

  return {
    account,
    error,
    isAuthenticated: Boolean(account),
    isGameRunning,
    isLaunching,
    isLoading,
    isRestoring,
    isSettingsOpen,
    launchStatus,
    launchProgress,
    launcherPack,
    launcherSettings,
    openExternal,
    openLogsNow,
    packConfigured: Boolean(launcherSettings?.packManifestUrl),
    packManifestInput,
    persistManifestUrl,
    saveSettings,
    setIsSettingsOpen,
    setPackManifestInput,
    skinPortraitUrl: account ? `https://mc-heads.net/avatar/${account.uuid}` : null,
    handleCloseGame,
    handleLaunch,
    handleLogout,
    handleMicrosoftLogin,
    handlePickInstanceDirectory,
    handleRepairPack,
  }
}
