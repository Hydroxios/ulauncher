type MicrosoftLoginCardProps = {
  error: string | null
  isLoading: boolean
  onLogin: () => Promise<void>
}

export const MicrosoftLoginCard = ({
  error,
  isLoading,
  onLogin,
}: MicrosoftLoginCardProps) => {
  return (
    <div className="flex w-full max-w-[380px] flex-col border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md sm:p-8">
      <div className="mx-auto grid h-12 w-12 grid-cols-2 grid-rows-2 gap-1">
        <span className="bg-[#f25022]" />
        <span className="bg-[#7fba00]" />
        <span className="bg-[#00a4ef]" />
        <span className="bg-[#ffb900]" />
      </div>

      <h1 className="mt-6 text-center text-lg font-black uppercase tracking-[0.1em] text-white">
        Connexion Microsoft
      </h1>

      <p className="mt-3 text-center text-sm leading-relaxed text-white/60">
        Connecte ton compte pour restaurer la session et lancer directement ton instance.
      </p>

      <button
        type="button"
        onClick={() => void onLogin()}
        disabled={isLoading}
        className="mt-8 flex w-full items-center justify-center gap-3 bg-white/10 px-4 py-4 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="grid h-5 w-5 grid-cols-2 grid-rows-2 gap-[2px]">
          <span className="bg-[#f25022]" />
          <span className="bg-[#7fba00]" />
          <span className="bg-[#00a4ef]" />
          <span className="bg-[#ffb900]" />
        </span>
        {isLoading ? 'Connexion...' : 'Se connecter'}
      </button>

      {error ? <p className="mt-4 text-center text-xs text-[#f1a9df]">{error}</p> : null}
    </div>
  )
}
