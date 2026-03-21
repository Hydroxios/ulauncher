import type {
  LauncherAccount,
  LauncherPackState,
  LauncherSettings,
} from '../../../shared/launcher'
import { PackStatusBadge } from './status'

const sidebarBackgroundStyle = {
  backgroundImage:
    "linear-gradient(180deg, rgba(11,4,18,0.46) 0%, rgba(11,4,18,0.86) 58%, rgba(11,4,18,0.96) 100%), url('/images/sidebar.png')",
  backgroundPosition: '58% center',
  backgroundSize: 'cover',
  backgroundRepeat: 'no-repeat',
}

type AccountSidebarProps = {
  account: LauncherAccount
  isGameRunning: boolean
  isLaunching: boolean
  isLoading: boolean
  isSettingsOpen: boolean
  launcherPack: LauncherPackState | null
  launcherSettings: LauncherSettings | null
  onCloseGame: () => Promise<void>
  onLaunch: () => Promise<void>
  onLogout: () => Promise<void>
  onToggleSettings: () => void
  packConfigured: boolean
  skinPortraitUrl: string | null
}

export const AccountSidebar = ({
  account,
  isGameRunning,
  isLaunching,
  isLoading,
  isSettingsOpen,
  launcherPack,
  launcherSettings,
  onCloseGame,
  onLaunch,
  onLogout,
  onToggleSettings,
  packConfigured,
  skinPortraitUrl,
}: AccountSidebarProps) => {
  return (
    <aside
      className="relative flex min-h-0 flex-col justify-between overflow-hidden border border-white/10 bg-black/40 p-4 shadow-2xl backdrop-blur-md"
      style={sidebarBackgroundStyle}
    >
      <div className="relative z-10">
        <div className="mt-2 flex items-center gap-3">
          {skinPortraitUrl ? (
            <img
              src={skinPortraitUrl}
              alt={account.username}
              className="h-14 w-14 border border-white/10 object-cover shadow-lg"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center border border-white/10 bg-white/5 text-lg font-bold text-purple-300 shadow-inner backdrop-blur-sm">
              {account.username.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-base font-bold uppercase tracking-[0.08em] text-white">
              {account.username}
            </p>
            <p className="mt-1 truncate text-xs uppercase tracking-[0.12em] text-green-400/80">
              Connecté
            </p>
          </div>
        </div>

        <PackStatusBadge pack={launcherPack} className="mt-4" />

        <div className="mt-5 grid gap-3">
          <div className="border border-white/10 bg-white/5 p-3 shadow-inner backdrop-blur-sm transition-colors hover:bg-white/10">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-purple-300/80">Pack</p>
            <p className="mt-2 text-sm font-bold text-white">
              {launcherPack?.packVersion ?? 'Non configuré'}
            </p>
          </div>

          <div className="border border-white/10 bg-white/5 p-3 shadow-inner backdrop-blur-sm transition-colors hover:bg-white/10">
            <div className="flex items-center justify-between gap-4 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-purple-300/80">
              <span>Mémoire</span>
              <span className="font-bold text-white">
                {launcherSettings ? `${launcherSettings.memoryGb} Go` : '-'}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-purple-300/80">
              <span>Logs</span>
              <span className="font-bold text-white">
                {launcherSettings?.openLogsOnLaunch ? 'Auto' : 'Manuel'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void (isGameRunning ? onCloseGame() : onLaunch())}
          disabled={(!isGameRunning && (isLaunching || !launcherSettings || !packConfigured)) || isLoading}
          className="w-full bg-gradient-to-r from-fuchsia-600 to-purple-600 px-4 py-3 text-sm font-black uppercase tracking-[0.1em] text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:from-fuchsia-500 hover:to-purple-500 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
        >
          {isGameRunning ? 'Close' : isLaunching ? 'Lancement...' : 'Play'}
        </button>

        <button
          type="button"
          onClick={onToggleSettings}
          className={`w-full border border-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:bg-white/20 ${
            isSettingsOpen ? 'bg-white/20' : 'bg-white/5'
          }`}
        >
          {isSettingsOpen ? 'Retour' : 'Settings'}
        </button>

        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={isLoading}
          className="w-full border border-white/10 bg-transparent px-4 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-purple-300/80 transition-all duration-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          Se déconnecter
        </button>
      </div>
    </aside>
  )
}
