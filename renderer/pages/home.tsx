import React from 'react'
import Head from 'next/head'
import { launcherIpc } from '../lib/launcher-ipc'
import { useLauncherHomeState } from '../hooks/use-launcher-home-state'
import { AccountSidebar } from '../components/launcher/account-sidebar'
import { MicrosoftLoginCard } from '../components/launcher/microsoft-login-card'
import { OverviewPanel } from '../components/launcher/overview-panel'
import { SettingsPanel } from '../components/launcher/settings-panel'
import { WindowControls } from '../components/launcher/window-controls'

export default function HomePage() {
  const {
    account,
    error,
    isAuthenticated,
    isGameRunning,
    isLaunching,
    isLoading,
    isRestoring,
    isSettingsOpen,
    launchProgress,
    launchStatus,
    launcherPack,
    launcherSettings,
    openExternal,
    openLogsNow,
    packConfigured,
    saveSettings,
    setIsSettingsOpen,
    skinPortraitUrl,
    handleCloseGame,
    handleLaunch,
    handleLogout,
    handleMicrosoftLogin,
    handlePickInstanceDirectory,
    handleRepairPack,
  } = useLauncherHomeState()

  return (
    <React.Fragment>
      <Head>
        <title>{isAuthenticated ? 'Uztik Launcher' : 'Connexion - Uztik Launcher'}</title>
      </Head>

      <main className="relative h-screen overflow-hidden bg-slate-950 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-900 via-slate-950 to-black animate-gradient-xy p-3 text-white sm:p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 [-webkit-app-region:drag]" />

        <WindowControls onControl={launcherIpc.sendWindowControl} />

        <div className="mx-auto h-full w-full max-w-7xl pt-10">
          {isRestoring ? (
            <section className="grid h-full min-h-0 border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl lg:p-6">
              <div className="grid place-items-center">
                <div className="w-full max-w-[340px] border border-white/10 bg-white/5 p-6 text-center text-sm uppercase tracking-[0.16em] text-white/70 shadow-lg backdrop-blur-md">
                  Chargement de la session...
                </div>
              </div>
            </section>
          ) : isAuthenticated && account ? (
            <section className="grid h-full min-h-0 border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur-xl lg:p-4">
              <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[290px_minmax(0,1fr)]">
                <AccountSidebar
                  account={account}
                  isGameRunning={isGameRunning}
                  isLaunching={isLaunching}
                  isLoading={isLoading}
                  isSettingsOpen={isSettingsOpen}
                  launcherPack={launcherPack}
                  launcherSettings={launcherSettings}
                  onCloseGame={handleCloseGame}
                  onLaunch={handleLaunch}
                  onLogout={handleLogout}
                  onToggleSettings={() => setIsSettingsOpen((current) => !current)}
                  packConfigured={packConfigured}
                  skinPortraitUrl={skinPortraitUrl}
                />

                {isSettingsOpen ? (
                  <SettingsPanel
                    launcherSettings={launcherSettings}
                    onOpenExternal={openExternal}
                    onOpenLogsNow={openLogsNow}
                    onPickInstanceDirectory={handlePickInstanceDirectory}
                    onRepairPack={handleRepairPack}
                    onSaveSettings={saveSettings}
                    onToggleSettings={() => setIsSettingsOpen(false)}
                  />
                ) : (
                  <OverviewPanel
                    account={account}
                    error={error}
                    isLaunching={isLaunching}
                    launchProgress={launchProgress}
                    launchStatus={launchStatus}
                    launcherPack={launcherPack}
                    launcherSettings={launcherSettings}
                  />
                )}
              </div>
            </section>
          ) : (
            <section className="grid h-full min-h-0 border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl lg:p-6">
              <div className="grid place-items-center">
              <MicrosoftLoginCard
                error={error}
                isLoading={isLoading}
                onLogin={handleMicrosoftLogin}
              />
              </div>
            </section>
          )}
        </div>
      </main>
    </React.Fragment>
  )
}
