import type { LauncherPackState } from '../../../shared/launcher'

export const getPackStatusLabel = (pack: LauncherPackState | null) => {
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
    return 'border-white/10 bg-white/5 text-purple-200/80 shadow-inner backdrop-blur-sm'
  }

  switch (pack.status) {
    case 'ready':
      return 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-200 shadow-[0_0_15px_rgba(217,70,239,0.15)] backdrop-blur-sm'
    case 'update-available':
      return 'border-purple-400/50 bg-purple-500/10 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.15)] backdrop-blur-sm'
    case 'not-installed':
      return 'border-white/10 bg-white/5 text-purple-200/80 shadow-inner backdrop-blur-sm'
    case 'not-configured':
      return 'border-white/10 bg-white/5 text-purple-200/80 shadow-inner backdrop-blur-sm'
    case 'error':
      return 'border-rose-500/50 bg-rose-500/10 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.15)] backdrop-blur-sm'
    default:
      return 'border-white/10 bg-white/5 text-purple-200/80 shadow-inner backdrop-blur-sm'
  }
}

type PackStatusBadgeProps = {
  pack: LauncherPackState | null
  compact?: boolean
  className?: string
}

export const PackStatusBadge = ({
  pack,
  compact = false,
  className = '',
}: PackStatusBadgeProps) => {
  return (
    <div
      className={`border px-4 py-3 text-[0.72rem] font-bold uppercase tracking-[0.16em] transition-all duration-300 ${getPackStatusClasses(
        pack
      )} ${className}`.trim()}
    >
      {getPackStatusLabel(pack)}
      {!compact && pack?.error ? (
        <span className="mt-2 block text-[0.68rem] normal-case tracking-normal">{pack.error}</span>
      ) : null}
    </div>
  )
}
