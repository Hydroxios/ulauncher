import { useEffect, useState } from 'react'
import type { LauncherAccount, LauncherPackState, LauncherSettings } from '../../../shared/launcher'
import type { LaunchProgressState } from '../../hooks/use-launcher-home-state'
import { PackStatusBadge } from './status'

const contentPanelBackgroundStyle = {
  backgroundImage:
    "linear-gradient(180deg, rgba(12,4,19,0.48) 0%, rgba(12,4,19,0.78) 42%, rgba(12,4,19,0.92) 100%), url('/images/banner.png')",
  backgroundPosition: 'center',
  backgroundSize: 'cover',
  backgroundRepeat: 'no-repeat',
}

type OverviewPanelProps = {
  account: LauncherAccount
  error: string | null
  isLaunching: boolean
  launchProgress: LaunchProgressState | null
  launchStatus: string | null
  launcherPack: LauncherPackState | null
  launcherSettings: LauncherSettings | null
}

const mockOnlinePlayers = [
  "Hydroxios",
  "Koda_62",
  "uzt1k",
  "Azurria44"
]

const formatProgressValue = (progress: LaunchProgressState) => {
  if (progress.unit === 'bytes') {
    const currentValue = `${(progress.current / 1024 / 1024).toFixed(1)} Mo`

    if (progress.total <= 0) {
      return currentValue
    }

    return `${currentValue} / ${(progress.total / 1024 / 1024).toFixed(1)} Mo`
  }

  if (progress.total <= 0) {
    return `${progress.current}`
  }

  return `${progress.current} / ${progress.total}`
}

export const OverviewPanel = ({
  account,
  error,
  isLaunching,
  launchProgress,
  launchStatus,
  launcherPack,
  launcherSettings,
}: OverviewPanelProps) => {
  const hasOnlinePlayers = mockOnlinePlayers.length > 0
  const isGameLaunched = isLaunching && launchStatus === 'Minecraft lance.' && !launchProgress
  const [displayedProgressWidth, setDisplayedProgressWidth] = useState<number | null>(null)
  const isIndeterminateProgress = Boolean(launchProgress && launchProgress.percent == null)
  const isPhaseStarting = Boolean(
    launchProgress &&
      launchProgress.percent != null &&
      launchProgress.total > 0 &&
      launchProgress.current === 0
  )
  const progressWidth =
    launchProgress?.percent != null ? Math.max(0, Math.min(launchProgress.percent, 100)) : null

  useEffect(() => {
    if (progressWidth == null) {
      setDisplayedProgressWidth(null)
      return
    }

    setDisplayedProgressWidth(launchProgress?.current === 0 ? 0 : progressWidth)
  }, [progressWidth, launchProgress?.current])

  useEffect(() => {
    if (!launchProgress || progressWidth == null) {
      return
    }

    setDisplayedProgressWidth(0)

    const animationFrameId = window.requestAnimationFrame(() => {
      setDisplayedProgressWidth(progressWidth)
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [launchProgress?.type])

  const progressBarStyle =
    isPhaseStarting
      ? {
          width: '22%',
          minWidth: '28px',
        }
      : displayedProgressWidth != null
      ? {
          width: `${displayedProgressWidth}%`,
          minWidth: displayedProgressWidth > 0 ? '6px' : '0px',
        }
      : isIndeterminateProgress
        ? {
            width: '28%',
            minWidth: '32px',
          }
      : {
          width: isLaunching && !isGameLaunched ? '100%' : '0%',
          minWidth: '0px',
        }
  const launchHeadline = launchProgress
    ? launchProgress.label
    : launchStatus ?? (isLaunching ? 'Lancement en cours' : 'Jeu pret')
  const launchDescription = launchStatus ?? 'Le launcher est en attente d un lancement.'
  const shouldShowLaunchPanel =
    !isGameLaunched &&
    (Boolean(launchProgress) || (isLaunching && Boolean(launchStatus)) || Boolean(error))

  return (
    <section
      className="grid min-h-0 place-items-start overflow-hidden border border-white/10 bg-black/40 p-6 shadow-inner backdrop-blur-md"
      style={contentPanelBackgroundStyle}
    >
      <div className="w-full max-w-4xl">
        <div className="grid gap-6">
          <div className="border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-md sm:p-8">
            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
              <div className={`flex w-full items-center ${hasOnlinePlayers ? 'justify-center' : 'justify-center lg:col-span-2'}`}>
                <div className="flex flex-col items-center justify-center">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-purple-300/80">
                    Joueurs connectes
                  </p>
                  <p className="mt-2 text-2xl font-black uppercase tracking-[0.05em] text-white">
                    {mockOnlinePlayers.length} en ligne
                  </p>
                </div>
              </div>

              <div className={`${hasOnlinePlayers ? 'grid gap-2' : 'hidden'}`}>
                {hasOnlinePlayers ? (
                  mockOnlinePlayers.map((player) => (
                    <div
                      key={player}
                      className="flex flex-row items-center justify-start gap-4 border border-white/10 bg-white/5 px-4 py-2"
                    >
                      <img src={`https://mc-heads.net/avatar/${player}`} alt={player} className="h-8 w-8" />
                      <p className="truncate text-sm font-bold uppercase tracking-[0.08em] text-white">
                        {player}
                      </p>
                    </div>
                  ))
                ) : null}
              </div>
            </div>
          </div>

          {shouldShowLaunchPanel ? (
            <div className="mt-6 border border-white/10 bg-black/30 p-5 shadow-inner backdrop-blur-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-purple-300/80">
                    Etat du jeu
                  </p>
                  <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.05em] text-white">
                    {launchHeadline}
                  </h2>
                  <p className="mt-3 text-sm text-white/70">{launchDescription}</p>
                </div>
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-white">
                  {launchProgress?.percent != null
                    ? `${Math.round(launchProgress.percent)}%`
                    : isLaunching
                      ? 'En cours'
                      : 'Statut'}
                </p>
              </div>

              <div className="mt-5 h-4 overflow-hidden border border-white/10 bg-white/5 shadow-inner">
                <div
                  className={`h-full bg-gradient-to-r from-fuchsia-500 via-purple-400 to-cyan-300 ${isIndeterminateProgress || isPhaseStarting
                    ? 'launcher-progress-indeterminate'
                    : `transition-[width] duration-75 ease-linear ${launchProgress?.percent == null && isLaunching ? 'animate-pulse' : ''}`
                    }`}
                  style={progressBarStyle}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-white/60">
                <span>{launchProgress ? formatProgressValue(launchProgress) : 'Aucune tache active'}</span>
              </div>

              {error ? (
                <p className="mt-5 border border-[#f1a9df]/25 bg-[#f1a9df]/10 px-4 py-3 text-sm text-[#ffd4f1]">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}

          {launcherPack?.error ? (
            <p className="mt-4 text-sm text-[#f1a9df]">{launcherPack.error}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
