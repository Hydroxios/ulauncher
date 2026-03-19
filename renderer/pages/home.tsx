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
    return 'border-[rgba(255,255,255,0.08)] bg-[#1a1512] text-[#c9bbb0]'
  }

  switch (pack.status) {
    case 'ready':
      return 'border-[#d1894f] bg-[rgba(209,137,79,0.12)] text-[#ffcf9e]'
    case 'update-available':
      return 'border-[#d1894f] bg-[rgba(209,137,79,0.08)] text-[#f0bf8d]'
    case 'not-installed':
      return 'border-[rgba(255,255,255,0.08)] bg-[#1a1512] text-[#c9bbb0]'
    case 'not-configured':
      return 'border-[rgba(255,255,255,0.08)] bg-[#1a1512] text-[#9e8f82]'
    case 'error':
      return 'border-[#b35a49] bg-[rgba(179,90,73,0.1)] text-[#e0aa9f]'
    default:
      return 'border-[rgba(255,255,255,0.08)] bg-[#1a1512] text-[#c9bbb0]'
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
      <main className="relative h-screen overflow-hidden bg-[linear-gradient(180deg,_#171311_0%,_#0d0a09_100%)] p-3 text-[#f2ede7] sm:p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 [-webkit-app-region:drag]" />

        <div className="pointer-events-none absolute right-0 top-0 z-30">
          <div className="pointer-events-auto flex items-center [-webkit-app-region:no-drag]">
            <button
              type="button"
              aria-label="Minimiser"
              onClick={() => handleWindowControl('window:minimize')}
              className="flex h-12 w-12 items-center justify-center border-l border-[rgba(255,255,255,0.08)] bg-[rgba(20,16,14,0.96)] text-lg text-[#d7cec4] transition duration-150 hover:bg-[rgba(255,255,255,0.08)]"
            >
              <span className="-mt-1">_</span>
            </button>
            <button
              type="button"
              aria-label="Maximiser ou restaurer"
              onClick={() => handleWindowControl('window:toggle-maximize')}
              className="flex h-12 w-12 items-center justify-center border-l border-[rgba(255,255,255,0.08)] bg-[rgba(20,16,14,0.96)] text-sm text-[#d7cec4] transition duration-150 hover:bg-[rgba(255,255,255,0.08)]"
            >
              <span className="inline-block h-3.5 w-3.5 border border-current" />
            </button>
            <button
              type="button"
              aria-label="Fermer"
              onClick={() => handleWindowControl('window:close')}
              className="flex h-12 w-12 items-center justify-center border-l border-[rgba(255,255,255,0.08)] bg-[rgba(20,16,14,0.96)] text-lg text-[#f6d7d0] transition duration-150 hover:bg-[#b0442d]"
            >
              <span>&times;</span>
            </button>
          </div>
        </div>

        <div className="mx-auto h-full w-full max-w-7xl pt-10">
          <section className="grid h-full min-h-0 border border-[rgba(255,255,255,0.08)] bg-[#15110f] p-4 lg:p-6">
            {isRestoring ? (
              <div className="grid place-items-center">
                <div className="w-full max-w-[340px] border border-[rgba(255,255,255,0.08)] bg-[#1a1512] p-6 text-center text-sm uppercase tracking-[0.16em] text-[#9e8f82]">
                  Chargement de la session
                </div>
              </div>
            ) : account ? (
              <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="flex min-h-0 flex-col justify-between border border-[rgba(255,255,255,0.08)] bg-[#1a1512] p-5">
                  <div>
                    <p className="text-[0.72rem] uppercase tracking-[0.16em] text-[#9e8f82]">
                      Compte
                    </p>

                    <div className="mt-5 flex items-center gap-4">
                      {skinPortraitUrl ? (
                        <img
                          src={skinPortraitUrl}
                          alt={account.username}
                          className="h-16 w-16 border border-[rgba(255,255,255,0.08)] object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center border border-[rgba(255,255,255,0.08)] bg-[#2a211b] text-xl font-bold text-[#ffb366]">
                          {account.username.slice(0, 1).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold uppercase tracking-[0.08em] text-[#f2ede7]">
                          {account.username}
                        </p>
                        <p className="mt-1 truncate text-xs uppercase tracking-[0.12em] text-[#9e8f82]">
                          Microsoft connecte
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

                  <div className="mt-6 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={handleLaunch}
                      disabled={isLaunching || !launcherSettings || !packConfigured}
                      className="w-full bg-[#d1894f] px-5 py-4 text-sm font-black uppercase tracking-[0.08em] text-[#120d09] transition duration-150 hover:bg-[#e09a62] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isLaunching ? 'Lancement...' : 'Play'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen((current) => !current)}
                      className="w-full border border-[rgba(255,255,255,0.08)] bg-[#14100e] px-5 py-4 text-sm font-bold uppercase tracking-[0.08em] text-[#f2ede7] transition duration-150 hover:bg-[#1d1714]"
                    >
                      Settings
                    </button>

                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={isLoading}
                      className="w-full border border-[rgba(255,255,255,0.08)] bg-[#14100e] px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[#9e8f82] transition duration-150 hover:bg-[#1d1714] disabled:opacity-60"
                    >
                      Se deconnecter
                    </button>

                    {launchStatus ? (
                      <p className="text-center text-xs text-[#c9bbb0]">{launchStatus}</p>
                    ) : null}

                    {error ? (
                      <p className="text-center text-xs text-[#d8a59b]">{error}</p>
                    ) : null}
                  </div>
                </aside>

                <section className="grid min-h-0 place-items-center border border-[rgba(255,255,255,0.08)] bg-[#1a1512] p-6">
                  <div className="w-full max-w-3xl">
                    {isSettingsOpen ? (
                      <div className="border border-[rgba(255,255,255,0.08)] bg-[#14100e] p-5">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-[0.72rem] uppercase tracking-[0.16em] text-[#9e8f82]">
                              Settings
                            </p>
                            <h1 className="mt-2 text-2xl font-black uppercase tracking-[0.08em] text-[#f2ede7]">
                              Configuration du pack
                            </h1>
                          </div>
                        </div>

                        {launcherSettings ? (
                          <div className="mt-6 grid gap-4">
                            <label className="grid gap-2">
                              <span className="text-[0.72rem] uppercase tracking-[0.16em] text-[#9e8f82]">
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
                                className="border border-[rgba(255,255,255,0.08)] bg-[#1a1512] px-4 py-3 text-sm text-[#f2ede7] outline-none placeholder:text-[#6d6258]"
                              />
                            </label>

                            <label className="grid gap-2">
                              <span className="text-[0.72rem] uppercase tracking-[0.16em] text-[#9e8f82]">
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
                                  className="border border-[rgba(255,255,255,0.08)] bg-[#1a1512] px-4 py-3 text-sm text-[#f2ede7] outline-none"
                                />
                              </div>
                            </label>

                            <div className="grid gap-2">
                              <span className="text-[0.72rem] uppercase tracking-[0.16em] text-[#9e8f82]">
                                Dossier de l&apos;instance
                              </span>
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                                <input
                                  type="text"
                                  value={launcherSettings.instanceDirectory}
                                  onChange={(event) =>
                                    saveSettings({ instanceDirectory: event.target.value })
                                  }
                                  className="border border-[rgba(255,255,255,0.08)] bg-[#1a1512] px-4 py-3 text-sm text-[#f2ede7] outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={handlePickInstanceDirectory}
                                  className="border border-[rgba(255,255,255,0.08)] bg-[#1a1512] px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[#f2ede7] transition duration-150 hover:bg-[#211a16]"
                                >
                                  Parcourir
                                </button>
                              </div>
                            </div>

                            <label className="flex items-center justify-between gap-4 border border-[rgba(255,255,255,0.08)] bg-[#1a1512] px-4 py-3">
                              <span className="text-[0.72rem] uppercase tracking-[0.16em] text-[#f2ede7]">
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
                                    ? 'border-[#d1894f] bg-[#d1894f]'
                                    : 'border-[rgba(255,255,255,0.12)] bg-[#14100e]'
                                }`}
                              >
                                <span
                                  className={`absolute top-1 h-5 w-5 bg-[#f2ede7] transition duration-150 ${
                                    launcherSettings.openLogsOnLaunch ? 'left-8' : 'left-1'
                                  }`}
                                />
                              </button>
                            </label>

                            <button
                              type="button"
                              onClick={handleRepairPack}
                              className="border border-[rgba(255,255,255,0.08)] bg-[#1a1512] px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[#f2ede7] transition duration-150 hover:bg-[#211a16]"
                            >
                              Reinstaller le pack au prochain lancement
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="border border-[rgba(255,255,255,0.08)] bg-[#14100e] p-5">
                        <p className="text-[0.72rem] uppercase tracking-[0.16em] text-[#9e8f82]">
                          Launcher
                        </p>
                        <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.08em] text-[#f2ede7]">
                          Bienvenue {account.username}
                        </h1>
                        <p className="mt-4 max-w-lg text-sm leading-7 text-[#c9bbb0]">
                          Le launcher prepare ton pack custom, installe Fabric si necessaire puis
                          lance directement ton instance.
                        </p>

                        <div className="mt-8 grid gap-3 sm:grid-cols-4">
                          <div className="border border-[rgba(255,255,255,0.08)] bg-[#1a1512] p-4">
                            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#9e8f82]">
                              Pack
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#f2ede7]">
                              {launcherPack?.packVersion ?? 'Non configure'}
                            </p>
                          </div>
                          <div className="border border-[rgba(255,255,255,0.08)] bg-[#1a1512] p-4">
                            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#9e8f82]">
                              Minecraft
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#f2ede7]">
                              {launcherPack?.minecraftVersion ?? '-'}
                            </p>
                          </div>
                          <div className="border border-[rgba(255,255,255,0.08)] bg-[#1a1512] p-4">
                            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#9e8f82]">
                              Fabric
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#f2ede7]">
                              {launcherPack?.fabricLoaderVersion ?? '-'}
                            </p>
                          </div>
                          <div className="border border-[rgba(255,255,255,0.08)] bg-[#1a1512] p-4">
                            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#9e8f82]">
                              Memoire
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[#f2ede7]">
                              {launcherSettings ? `${launcherSettings.memoryGb} Go` : '-'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                          <div className="border border-[rgba(255,255,255,0.08)] bg-[#1a1512] p-4">
                            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-[#9e8f82]">
                              Dossier d&apos;instance
                            </p>
                            <p className="mt-2 truncate text-sm font-semibold text-[#f2ede7]">
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
                          <p className="mt-4 text-sm text-[#d8a59b]">{launcherPack.error}</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="grid place-items-center">
                <div className="flex w-full max-w-[380px] flex-col border border-[rgba(255,255,255,0.08)] bg-[#1a1512] p-5 sm:p-6">
                  <div className="mx-auto grid h-12 w-12 grid-cols-2 grid-rows-2 gap-1">
                    <span className="bg-[#f25022]" />
                    <span className="bg-[#7fba00]" />
                    <span className="bg-[#00a4ef]" />
                    <span className="bg-[#ffb900]" />
                  </div>

                  <h1 className="mt-5 text-center text-lg font-bold uppercase tracking-[0.08em] text-[#f2ede7]">
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
                    <p className="mt-4 text-center text-xs text-[#d8a59b]">{error}</p>
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
