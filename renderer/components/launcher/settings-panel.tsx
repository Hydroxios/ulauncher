import type { LauncherSettings } from '../../../shared/launcher'

const contentPanelBackgroundStyle = {
  backgroundImage:
    "linear-gradient(180deg, rgba(12,4,19,0.48) 0%, rgba(12,4,19,0.78) 42%, rgba(12,4,19,0.92) 100%), url('/images/banner.png')",
  backgroundPosition: 'center',
  backgroundSize: 'cover',
  backgroundRepeat: 'no-repeat',
}

type SettingsPanelProps = {
  launcherSettings: LauncherSettings | null
  onOpenExternal: (url: string) => Promise<void>
  onOpenLogsNow: () => Promise<void>
  onPickInstanceDirectory: () => Promise<void>
  onRepairPack: () => Promise<void>
  onSaveSettings: (partial: Partial<LauncherSettings>) => Promise<void>
  onToggleSettings: () => void
}

export const SettingsPanel = ({
  launcherSettings,
  onOpenExternal,
  onOpenLogsNow,
  onPickInstanceDirectory,
  onRepairPack,
  onSaveSettings,
  onToggleSettings,
}: SettingsPanelProps) => {
  return (
    <section
      className="grid min-h-0 place-items-center overflow-hidden border border-white/10 bg-black/40 p-6 shadow-inner backdrop-blur-md"
      style={contentPanelBackgroundStyle}
    >
      <div className="w-full max-w-4xl">
        <div className="border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-md sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.2em] text-purple-300">
                Settings
              </p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.05em] text-white">
                Configuration du pack
              </h1>
            </div>

            <button
              type="button"
              onClick={onToggleSettings}
              className="border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:bg-white/10"
            >
              Retour
            </button>
          </div>

          {launcherSettings ? (
            <div className="mt-6 grid gap-4">
              <div className="grid gap-2">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-purple-300/80">
                  Mémoire allouée
                </span>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
                  <div className="flex items-center">
                    <input
                      type="range"
                      min="1"
                      max="16"
                      value={launcherSettings.memoryGb}
                      onChange={(event) =>
                        void onSaveSettings({ memoryGb: Number(event.target.value) })
                      }
                      className="h-2 w-full appearance-none rounded-full bg-white/10 outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 hover:[&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                    />
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="16"
                    value={launcherSettings.memoryGb}
                    onChange={(event) =>
                      void onSaveSettings({ memoryGb: Number(event.target.value) })
                    }
                    className="border border-white/10 bg-black/40 px-4 py-3 text-sm text-white shadow-inner backdrop-blur-sm outline-none transition-all focus:border-purple-500 focus:bg-black/60"
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                <div className="grid gap-2">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-purple-300/80">
                    Dossier de l&apos;instance
                  </span>
                  <input
                    type="text"
                    value={launcherSettings.instanceDirectory}
                    onChange={(event) =>
                      void onSaveSettings({ instanceDirectory: event.target.value })
                    }
                    className="border border-white/10 bg-black/40 px-4 py-3 text-sm text-white shadow-inner backdrop-blur-sm outline-none transition-all focus:border-purple-500 focus:bg-black/60"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void onPickInstanceDirectory()}
                  className="self-end border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:bg-white/10"
                >
                  Parcourir
                </button>
              </div>

              <label className="flex items-center justify-between gap-4 border border-white/10 bg-white/5 px-5 py-4 shadow-inner backdrop-blur-sm transition-colors hover:bg-white/10">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-white">
                  Ouvrir les logs au lancement
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={launcherSettings.openLogsOnLaunch}
                  onClick={() =>
                    void onSaveSettings({
                      openLogsOnLaunch: !launcherSettings.openLogsOnLaunch,
                    })
                  }
                  className={`relative h-7 w-14 rounded-full border transition-all duration-300 ${
                    launcherSettings.openLogsOnLaunch
                      ? 'border-purple-500 bg-purple-600 shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                      : 'border-white/20 bg-black/40'
                  }`}
                >
                  <span
                    className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white transition-all duration-300 ${
                      launcherSettings.openLogsOnLaunch ? 'left-8 scale-110' : 'left-1'
                    }`}
                  />
                </button>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void onOpenLogsNow()}
                  className="border border-white/10 bg-white/5 px-4 py-4 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:bg-white/10 hover:shadow-xl"
                >
                  Ouvrir les logs
                </button>
                <button
                  type="button"
                  onClick={() => void onRepairPack()}
                  className="border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm font-bold uppercase tracking-[0.08em] text-rose-200 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:bg-rose-500/20 hover:text-white"
                >
                  Réinstaller le pack
                </button>
              </div>

              <p className="text-right text-xs text-[#ab8ec8]">
                Made with ❤️ by{' '}
                <a
                  href="https://github.com/Hydroxios"
                  onClick={(event) => {
                    event.preventDefault()
                    void onOpenExternal('https://github.com/Hydroxios')
                  }}
                  className="transition duration-150 hover:text-[#f6ecff]"
                >
                  Hydroxios
                </a>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
