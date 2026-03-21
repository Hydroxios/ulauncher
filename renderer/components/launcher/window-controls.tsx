import type { WindowControlChannel } from '../../../shared/ipc'

type WindowControlsProps = {
  onControl: (channel: WindowControlChannel) => void
}

export const WindowControls = ({ onControl }: WindowControlsProps) => {
  return (
    <div className="pointer-events-none absolute right-0 top-0 z-30">
      <div className="pointer-events-auto flex items-center overflow-hidden backdrop-blur-md [-webkit-app-region:no-drag]">
        <button
          type="button"
          aria-label="Minimiser"
          onClick={() => onControl('window:minimize')}
          className="flex h-12 w-12 items-center justify-center text-lg text-white/70 transition-all duration-300 hover:bg-white/10 hover:text-white"
        >
          <span className="-mt-1">_</span>
        </button>
        <button
          type="button"
          aria-label="Maximiser ou restaurer"
          onClick={() => onControl('window:toggle-maximize')}
          className="flex h-12 w-12 items-center justify-center text-sm text-white/70 transition-all duration-300 hover:bg-white/10 hover:text-white"
        >
          <span className="inline-block h-3.5 w-3.5 border border-current" />
        </button>
        <button
          type="button"
          aria-label="Fermer"
          onClick={() => onControl('window:close')}
          className="flex h-12 w-12 items-center justify-center text-lg text-white/70 transition-all duration-300 hover:bg-rose-500 hover:text-white"
        >
          <span>&times;</span>
        </button>
      </div>
    </div>
  )
}
