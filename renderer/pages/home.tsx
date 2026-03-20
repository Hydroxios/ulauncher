import React, { useEffect, useState } from 'react'
import Head from 'next/head'

type LauncherAccount = {
  username: string
  uuid: string
  xuid: string
  skinUrl: string | null
  avatarUrl: string | null
}

type AuthResponse = {
  ok: boolean
  account?: LauncherAccount
  error?: string
}

type LauncherSettings = {
  memoryGb: number
  instanceDirectory: string
  openLogsOnLaunch: boolean
  packManifestUrl: string
}

type LauncherPackState = {
  manifestUrl: string | null
  packVersion: string | null
  minecraftVersion: string | null
  fabricLoaderVersion: string | null
  installed: boolean
  needsUpdate: boolean
  status: 'not-configured' | 'not-installed' | 'ready' | 'update-available' | 'error'
  error?: string
}

type LauncherStateResponse = {
  ok: boolean
  settings: LauncherSettings
  pack: LauncherPackState
  error?: string
}

type LauncherActionResponse = {
  ok: boolean
  settings?: LauncherSettings
  pack?: LauncherPackState
  error?: string
}

type LauncherEvent = {
  type: string
  payload: unknown
  timestamp: number
}

const sidebarBackgroundStyle = {
  backgroundImage:
    "linear-gradient(180deg, rgba(11,4,18,0.46) 0%, rgba(11,4,18,0.86) 58%, rgba(11,4,18,0.96) 100%), url('/images/sidebar.png')",
  backgroundPosition: '58% center',
  backgroundSize: 'cover',
  backgroundRepeat: 'no-repeat',
}

const contentPanelBackgroundStyle = {
  backgroundImage:
    "linear-gradient(180deg, rgba(12,4,19,0.48) 0%, rgba(12,4,19,0.78) 42%, rgba(12,4,19,0.92) 100%), url('/images/banner.png')",
  backgroundPosition: 'center',
  backgroundSize: 'cover',
  backgroundRepeat: 'no-repeat',
}

const getPackStatusLabel = (pack: LauncherPackState | null) => {
  if (!pack) {
    return 'Chargement'
  }

  switch (pack.status) {
    case 'ready':
      return 'Pret'
    case 'update-available':
      return 'Mise a jour'
    case 'not-installed':
      return 'A installer'
    case 'not-configured':
      return 'A configurer'
    case 'error':
      return 'Erreur'
    default:
      return 'Inconnu'
  }
}

const getPackStatusClasses = (pack: LauncherPackState | null) => {
  if (!pack) {
    return 'border-[rgba(231,214,255,0.12)] bg-[#251038] text-[#d7c1ec]'
  }

  switch (pack.status) {
    case 'ready':
      return 'border-[#a311f9] bg-[rgba(163,17,249,0.18)] text-[#f0c9ff]'
    case 'update-available':
      return 'border-[#bb4fff] bg-[rgba(163,17,249,0.12)] text-[#e5b2ff]'
    case 'not-installed':
      return 'border-[rgba(231,214,255,0.12)] bg-[#251038] text-[#d7c1ec]'
    case 'not-configured':
      return 'border-[rgba(231,214,255,0.12)] bg-[#251038] text-[#ab8ec8]'
    case 'error':
      return 'border-[#d241a2] bg-[rgba(210,65,162,0.12)] text-[#ffb7ea]'
    default:
      return 'border-[rgba(231,214,255,0.12)] bg-[#251038] text-[#d7c1ec]'
  }
}

export default function HomePage() {
  const [account, setAccount] = useState<LauncherAccount | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [launcherSettings, setLauncherSettings] = useState<LauncherSettings | null>(null)
  const [launcherPack, setLauncherPack] = useState<LauncherPackState | null>(null)
  const [packManifestInput, setPackManifestInput] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [launchStatus, setLaunchStatus] = useState<string | null>(null)

  const handleWindowControl = (
    channel: 'window:minimize' | 'window:toggle-maximize' | 'window:close'
  ) => {
    window.ipc.send(channel)
  }

  useEffect(() => {
    let cancelled = false

    const restoreSession = async () => {
      try {
        const response = (await window.ipc.invoke('auth:restore')) as AuthResponse

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
        const response = (await window.ipc.invoke('launcher:get-state')) as LauncherStateResponse

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
    const unsubscribe = window.ipc.on('launcher:event', (eventData) => {
      const event = eventData as LauncherEvent

      if (event.type === 'close') {
        setIsLaunching(false)
        setLaunchStatus('Minecraft ferme.')
      }

      if (event.type === 'error') {
        setError(typeof event.payload === 'string' ? event.payload : 'Erreur de lancement.')
        setIsLaunching(false)
      }

      if (event.type === 'status' && typeof event.payload === 'string') {
        setLaunchStatus(event.payload)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleMicrosoftLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = (await window.ipc.invoke('auth:login')) as AuthResponse

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
      await window.ipc.invoke('auth:logout')
      setAccount(null)
      setLaunchStatus(null)
    } finally {
      setIsLoading(false)
    }
  }

  const saveSettings = async (partial: Partial<LauncherSettings>) => {
    if (!launcherSettings) {
      return
    }

    const next = {
      ...launcherSettings,
      ...partial,
    }

    setLauncherSettings(next)

    const response = (await window.ipc.invoke(
      'launcher:save-settings',
      partial
    )) as LauncherActionResponse

    if (response.ok && response.settings) {
      setLauncherSettings(response.settings)
      setLauncherPack((current) => response.pack ?? current)
      setPackManifestInput(response.settings.packManifestUrl)
    }
  }

  const persistManifestUrl = async () => {
    if (!launcherSettings || packManifestInput === launcherSettings.packManifestUrl) {
      return
    }

    await saveSettings({ packManifestUrl: packManifestInput.trim() })
  }

  const handlePickInstanceDirectory = async () => {
    const response = (await window.ipc.invoke(
      'launcher:pick-instance-directory'
    )) as LauncherActionResponse

    if (response.ok && response.settings) {
      setLauncherSettings(response.settings)
      setLauncherPack((current) => response.pack ?? current)
      setPackManifestInput(response.settings.packManifestUrl)
    }
  }

  const handleRepairPack = async () => {
    if (!launcherSettings) {
      return
    }

    setLaunchStatus('Le pack sera reinstalle au prochain lancement.')
    setError(null)

    const response = (await window.ipc.invoke(
      'launcher:repair-pack',
      launcherSettings
    )) as LauncherActionResponse

    if (response.ok && response.settings) {
      setLauncherSettings(response.settings)
      setLauncherPack((current) => response.pack ?? current)
      return
    }

    setError(response.error ?? 'Impossible de reinitialiser le pack.')
  }

  const handleLaunch = async () => {
    if (!launcherSettings) {
      return
    }

    setIsLaunching(true)
    setError(null)
    setLaunchStatus('Preparation du lancement')

    try {
      const response = (await window.ipc.invoke(
        'launcher:launch',
        launcherSettings
      )) as LauncherActionResponse

      if (!response.ok) {
        setIsLaunching(false)
        setError(response.error ?? 'Le lancement de Minecraft a echoue.')
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

  const isAuthenticated = Boolean(account)
  const skinPortraitUrl = account ? `https://mc-heads.net/avatar/${account.uuid}` : null
  const packConfigured = Boolean(launcherSettings?.packManifestUrl)

  return (
    <React.Fragment>
      <Head>
        <title>{isAuthenticated ? 'Uztik Launcher' : 'Connexion - Uztik Launcher'}</title>
      </Head>
      <main className="relative h-screen overflow-hidden bg-[linear-gradient(180deg,_#14061f_0%,_#09030d_100%)] p-3 text-[#f6ecff] sm:p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 [-webkit-app-region:drag]" />

        <div className="pointer-events-none absolute right-0 top-0 z-30">
          <div className="pointer-events-auto flex items-center [-webkit-app-region:no-drag]">
            <button
              type="button"
              aria-label="Minimiser"
              onClick={() => handleWindowControl('window:minimize')}
              className="flex h-12 w-12 items-center justify-center bg-[rgba(22,10,33,0.96)] text-lg text-[#d9c3ee] transition duration-150 hover:bg-[rgba(231,214,255,0.08)]"
            >
              <span className="-mt-1">_</span>
            </button>
            <button
              type="button"
              aria-label="Maximiser ou restaurer"
              onClick={() => handleWindowControl('window:toggle-maximize')}
              className="flex h-12 w-12 items-center justify-center bg-[rgba(22,10,33,0.96)] text-sm text-[#d9c3ee] transition duration-150 hover:bg-[rgba(231,214,255,0.08)]"
            >
              <span className="inline-block h-3.5 w-3.5 border border-current" />
            </button>
            <button
              type="button"
              aria-label="Fermer"
              onClick={() => handleWindowControl('window:close')}
              className="flex h-12 w-12 items-center justify-center bg-[rgba(22,10,33,0.96)] text-lg text-[#f6dcff] transition duration-150 hover:bg-[#7a0fc0]"
            >
              <span>&times;</span>
            </button>
          </div>
        </div>

        <div className="mx-auto h-full w-full max-w-7xl pt-10">
          <section className="grid h-full min-h-0 border border-[rgba(231,214,255,0.12)] bg-[#1a0c27] p-4 lg:p-6">
            {isRestoring ? (
              <div className="grid place-items-center">
                <div className="w-full max-w-[340px] border border-[rgba(231,214,255,0.12)] bg-[#251038] p-6 text-center text-sm uppercase tracking-[0.16em] text-[#ab8ec8]">
                  Chargement de la session
                </div>
              </div>
            ) : account ? (
              <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside
                  className="relative flex min-h-0 flex-col justify-between overflow-hidden border border-[rgba(231,214,255,0.12)] bg-[#251038] p-5"
                  style={sidebarBackgroundStyle}
                >
                  <div className="relative z-10">
                    <p className="text-[0.72rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                      Compte
                    </p>

                    <div className="mt-5 flex items-center gap-4">
                      {skinPortraitUrl ? (
                        <img
                          src={skinPortraitUrl}
                          alt={account.username}
                          className="h-16 w-16 border border-[rgba(231,214,255,0.12)] object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center border border-[rgba(231,214,255,0.12)] bg-[#34164c] text-xl font-bold text-[#e8a8ff]">
                          {account.username.slice(0, 1).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold uppercase tracking-[0.08em] text-[#f6ecff]">
                          {account.username}
                        </p>
                        <p className="mt-1 truncate text-xs uppercase tracking-[0.12em] text-[#ab8ec8]">
                          Connecté
                        </p>
                      </div>
                    </div>

                    <div
                      className={`mt-6 border px-4 py-3 text-[0.72rem] uppercase tracking-[0.16em] ${getPackStatusClasses(
                        launcherPack
                      )}`}
                    >
                      {getPackStatusLabel(launcherPack)}
                    </div>
                  </div>

                  <div className="relative z-10 mt-6 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={handleLaunch}
                      disabled={isLaunching || !launcherSettings || !packConfigured}
                      className="w-full bg-[#a311f9] px-5 py-4 text-sm font-black uppercase tracking-[0.08em] text-white transition duration-150 hover:bg-[#bb4fff] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isLaunching ? 'Lancement...' : 'Play'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen((current) => !current)}
                      className="w-full border border-[rgba(231,214,255,0.12)] bg-[#160a21] px-5 py-4 text-sm font-bold uppercase tracking-[0.08em] text-[#f6ecff] transition duration-150 hover:bg-[#20102f]"
                    >
                      Settings
                    </button>

                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={isLoading}
                      className="w-full border border-[rgba(231,214,255,0.12)] bg-[#160a21] px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[#ab8ec8] transition duration-150 hover:bg-[#20102f] disabled:opacity-60"
                    >
                      Se deconnecter
                    </button>

                    {launchStatus ? (
                      <p className="text-center text-xs text-[#d7c1ec]">{launchStatus}</p>
                    ) : null}

                    {error ? (
                      <p className="text-center text-xs text-[#f1a9df]">{error}</p>
                    ) : null}
                  </div>
                </aside>

                <section
                  className="grid min-h-0 place-items-center overflow-hidden border border-[rgba(231,214,255,0.12)] bg-[#251038] p-6"
                  style={contentPanelBackgroundStyle}
                >
                  <div className="w-full max-w-3xl">
                    {isSettingsOpen ? (
                      <div className="border border-[rgba(231,214,255,0.12)] bg-[rgba(22,10,33,0.72)] p-5 backdrop-blur-[2px]">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-[0.72rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                              Settings
                            </p>
                            <h1 className="mt-2 text-2xl font-black uppercase tracking-[0.08em] text-[#f6ecff]">
                              Configuration du pack
                            </h1>
                          </div>
                        </div>

                        {launcherSettings ? (
                          <div className="mt-6 grid gap-4">
                            <label className="grid gap-2">
                              <span className="text-[0.72rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                                URL du manifeste
                              </span>
                              <input
                                type="text"
                                value={packManifestInput}
                                onChange={(event) => setPackManifestInput(event.target.value)}
                                onBlur={persistManifestUrl}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    void persistManifestUrl()
                                  }
                                }}
                                placeholder="https://..."
                                className="border border-[rgba(231,214,255,0.12)] bg-[#251038] px-4 py-3 text-sm text-[#f6ecff] outline-none placeholder:text-[#7d6895]"
                              />
                            </label>

                            <label className="grid gap-2">
                              <span className="text-[0.72rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                                Memoire allouee
                              </span>
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
                                <input
                                  type="range"
                                  min="1"
                                  max="16"
                                  value={launcherSettings.memoryGb}
                                  onChange={(event) =>
                                    saveSettings({ memoryGb: Number(event.target.value) })
                                  }
                                />
                                <input
                                  type="number"
                                  min="1"
                                  max="16"
                                  value={launcherSettings.memoryGb}
                                  onChange={(event) =>
                                    saveSettings({ memoryGb: Number(event.target.value) })
                                  }
                                  className="border border-[rgba(231,214,255,0.12)] bg-[#251038] px-4 py-3 text-sm text-[#f6ecff] outline-none"
                                />
                              </div>
                            </label>

                            <div className="grid gap-2">
                              <span className="text-[0.72rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                                Dossier de l&apos;instance
                              </span>
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                                <input
                                  type="text"
                                  value={launcherSettings.instanceDirectory}
                                  onChange={(event) =>
                                    saveSettings({ instanceDirectory: event.target.value })
                                  }
                                  className="border border-[rgba(231,214,255,0.12)] bg-[#251038] px-4 py-3 text-sm text-[#f6ecff] outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={handlePickInstanceDirectory}
                                  className="border border-[rgba(231,214,255,0.12)] bg-[#251038] px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[#f6ecff] transition duration-150 hover:bg-[#28133b]"
                                >
                                  Parcourir
                                </button>
                              </div>
                            </div>

                            <label className="flex items-center justify-between gap-4 border border-[rgba(231,214,255,0.12)] bg-[#251038] px-4 py-3">
                              <span className="text-[0.72rem] uppercase tracking-[0.16em] text-[#f6ecff]">
                                Ouvrir les logs au lancement
                              </span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={launcherSettings.openLogsOnLaunch}
                                onClick={() =>
                                  saveSettings({
                                    openLogsOnLaunch: !launcherSettings.openLogsOnLaunch,
                                  })
                                }
                                className={`relative h-7 w-14 border transition duration-150 ${
                                  launcherSettings.openLogsOnLaunch
                                    ? 'border-[#a311f9] bg-[#a311f9]'
                                    : 'border-[rgba(231,214,255,0.16)] bg-[#160a21]'
                                }`}
                              >
                                <span
                                  className={`absolute top-1 h-5 w-5 bg-[#f6ecff] transition duration-150 ${
                                    launcherSettings.openLogsOnLaunch ? 'left-8' : 'left-1'
                                  }`}
                                />
                              </button>
                            </label>

                            <button
                              type="button"
                              onClick={handleRepairPack}
                              className="border border-[rgba(231,214,255,0.12)] bg-[#251038] px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[#f6ecff] transition duration-150 hover:bg-[#28133b]"
                            >
                              Reinstaller le pack au prochain lancement
                            </button>
                          </div>
                        ) : null}

                        <div className="mt-6 flex justify-end">
                          <p className="text-right text-xs text-[#ab8ec8]">
                            Made with ❤️ by{' '}
                            <a
                              href="https://github.com/Hydroxios"
                              onClick={(event) => {
                                event.preventDefault()
                                void window.ipc.invoke(
                                  'system:open-external',
                                  'https://github.com/Hydroxios'
                                )
                              }}
                              className="transition duration-150 hover:text-[#f6ecff]"
                            >
                              Hydroxios
                            </a>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-[rgba(231,214,255,0.12)] bg-[rgba(22,10,33,0.72)] p-5 backdrop-blur-[2px]">
                        <p className="text-[0.72rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                          Launcher
                        </p>
                        <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.08em] text-[#f6ecff]">
                          Bienvenue {account.username}
                        </h1>
                        <p className="mt-4 max-w-lg text-sm leading-7 text-[#d7c1ec]">
                          Le launcher prepare ton pack custom, installe Fabric si necessaire puis
                          lance directement ton instance.
                        </p>

                        <div className="mt-8 grid gap-3 sm:grid-cols-4">
                          <div className="border border-[rgba(231,214,255,0.12)] bg-[#251038] p-4">
                            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                              Pack
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#f6ecff]">
                              {launcherPack?.packVersion ?? 'Non configure'}
                            </p>
                          </div>
                          <div className="border border-[rgba(231,214,255,0.12)] bg-[#251038] p-4">
                            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                              Minecraft
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#f6ecff]">
                              {launcherPack?.minecraftVersion ?? '-'}
                            </p>
                          </div>
                          <div className="border border-[rgba(231,214,255,0.12)] bg-[#251038] p-4">
                            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                              Fabric
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#f6ecff]">
                              {launcherPack?.fabricLoaderVersion ?? '-'}
                            </p>
                          </div>
                          <div className="border border-[rgba(231,214,255,0.12)] bg-[#251038] p-4">
                            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                              Memoire
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#f6ecff]">
                              {launcherSettings ? `${launcherSettings.memoryGb} Go` : '-'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                          <div className="border border-[rgba(231,214,255,0.12)] bg-[#251038] p-4">
                            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#ab8ec8]">
                              Dossier d&apos;instance
                            </p>
                            <p className="mt-2 truncate text-sm font-semibold text-[#f6ecff]">
                              {launcherSettings?.instanceDirectory ?? '-'}
                            </p>
                          </div>
                          <div
                            className={`border px-4 py-4 text-center text-[0.68rem] uppercase tracking-[0.16em] ${getPackStatusClasses(
                              launcherPack
                            )}`}
                          >
                            {getPackStatusLabel(launcherPack)}
                          </div>
                        </div>

                        {launcherPack?.error ? (
                          <p className="mt-4 text-sm text-[#f1a9df]">{launcherPack.error}</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="grid place-items-center">
                <div className="flex w-full max-w-[380px] flex-col border border-[rgba(231,214,255,0.12)] bg-[#251038] p-5 sm:p-6">
                  <div className="mx-auto grid h-12 w-12 grid-cols-2 grid-rows-2 gap-1">
                    <span className="bg-[#f25022]" />
                    <span className="bg-[#7fba00]" />
                    <span className="bg-[#00a4ef]" />
                    <span className="bg-[#ffb900]" />
                  </div>

                  <h1 className="mt-5 text-center text-lg font-bold uppercase tracking-[0.08em] text-[#f6ecff]">
                    Connexion Microsoft
                  </h1>

                  <button
                    type="button"
                    onClick={handleMicrosoftLogin}
                    disabled={isLoading}
                    className="mt-6 flex w-full items-center justify-center gap-3 bg-[#f3f3f3] px-4 py-4 text-sm font-bold uppercase tracking-[0.08em] text-[#111111] transition duration-150 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <span className="grid h-5 w-5 grid-cols-2 grid-rows-2 gap-[2px]">
                      <span className="bg-[#f25022]" />
                      <span className="bg-[#7fba00]" />
                      <span className="bg-[#00a4ef]" />
                      <span className="bg-[#ffb900]" />
                    </span>
                    {isLoading ? 'Connexion...' : 'Se connecter'}
                  </button>

                  {error ? (
                    <p className="mt-4 text-center text-xs text-[#f1a9df]">{error}</p>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </React.Fragment>
  )
}
