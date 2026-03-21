import Store from 'electron-store'
import { Auth, lexicon as msmcLexicon } from 'msmc'
import type { AuthResponse, LauncherAccount, StoredSession } from '../../shared/launcher'
import { toErrorMessage } from '../utils/common'

type RefreshedMinecraftSession = {
  minecraft: any
  refreshToken: string
}

const createAuthManager = () => new Auth('select_account')

export const createAuthService = () => {
  const sessionStore = new Store<{ session?: StoredSession }>({
    name: 'launcher-session',
  })

  const saveRefreshToken = (refreshToken: string) => {
    sessionStore.set('session', { refreshToken })
  }

  const stringifyUnknownError = (error: unknown) => {
    if (typeof error === 'string') {
      return error
    }

    if (error instanceof Error) {
      return error.message
    }

    if (error && typeof error === 'object') {
      const entries = Object.entries(error as Record<string, unknown>).slice(0, 8)

      if (entries.length > 0) {
        return entries
          .map(([key, value]) => {
            try {
              return `${key}=${JSON.stringify(value)}`
            } catch {
              return `${key}=[unserializable]`
            }
          })
          .join(', ')
      }
    }

    return ''
  }

  const toAuthErrorMessage = (error: unknown, lastLoadCode?: string | null) => {
    try {
      const wrapped = msmcLexicon.wrapError(error)
      const responseStatus =
        wrapped.opt?.response && typeof wrapped.opt.response.status === 'number'
          ? wrapped.opt.response.status
          : null

      switch (wrapped.name) {
        case 'error.gui.closed':
          return 'Connexion Microsoft annulée.'
        case 'error.auth.xsts.userNotFound':
          return "Ce compte Microsoft n'a pas de profil Xbox."
        case 'error.auth.xsts.bannedCountry':
          return "Le Xbox Live n'est pas disponible dans le pays de ce compte."
        case 'error.auth.xsts.child':
        case 'error.auth.xsts.child.SK':
          return 'Ce compte Xbox enfant doit etre autorise par un adulte.'
        default:
          if (typeof wrapped.message === 'string' && wrapped.message.trim()) {
            if (
              wrapped.message === 'An unknown error has occurred' ||
              wrapped.message === 'Unknown error occurred when attempting to login to Minecraft'
            ) {
              if (responseStatus !== null) {
                return `Authentification Minecraft impossible (HTTP ${responseStatus}).`
              }

              if (wrapped.name) {
                return `Authentification Minecraft impossible (${wrapped.name}).`
              }
            }

            return wrapped.message
          }
      }
    } catch {
      // Fallback handled below.
    }

    if (error && typeof error === 'object') {
      const source = error as {
        message?: unknown
        ts?: unknown
        response?: { status?: unknown }
      }

      if (typeof source.message === 'string' && source.message.trim()) {
        return source.message
      }

      if (typeof source.ts === 'string' && source.ts.trim()) {
        return `Authentification Minecraft impossible (${source.ts}).`
      }

      if (typeof source.response?.status === 'number') {
        return `Authentification Minecraft impossible (HTTP ${source.response.status}).`
      }
    }

    const rawDetails = stringifyUnknownError(error)

    if (lastLoadCode && rawDetails) {
      return `Authentification Minecraft impossible apres ${lastLoadCode}. ${rawDetails}`
    }

    if (lastLoadCode) {
      return `Authentification Minecraft impossible apres ${lastLoadCode}.`
    }

    if (rawDetails) {
      return `Authentification Minecraft impossible. ${rawDetails}`
    }

    return toErrorMessage(error)
  }

  const isMsmcError = (error: unknown, code: string) => {
    try {
      return msmcLexicon.wrapError(error).name === code
    } catch {
      return false
    }
  }

  const getMinecraftFromXbox = async (xbox: any, lastLoadCode?: string | null) => {
    try {
      return await xbox.getMinecraft()
    } catch (error) {
      if (!isMsmcError(error, 'error.auth.minecraft.login')) {
        throw error
      }

      try {
        await xbox.refresh(true)
        return await xbox.getMinecraft()
      } catch (retryError) {
        throw new Error(
          `Connexion Microsoft/Xbox reussie, mais l'authentification Minecraft Java a echoue${
            lastLoadCode ? ` apres ${lastLoadCode}` : ''
          }. Verifie que tu as bien Minecraft Java sur ce compte Microsoft et que ce n'est pas le mauvais profil Xbox.`
        )
      }
    }
  }

  const loadAccountFromXbox = async (
    xbox: any,
    lastLoadCode?: string | null
  ): Promise<LauncherAccount> => {
    const minecraft = await getMinecraftFromXbox(xbox, lastLoadCode)

    let avatarUrl: string | null = null

    try {
      const social = await xbox.getSocial()
      const profile = await social.getProfile()
      avatarUrl = profile.profilePictureURL ?? null
    } catch {
      avatarUrl = null
    }

    saveRefreshToken(xbox.save())

    return {
      username: minecraft.profile?.name ?? 'Player',
      uuid: minecraft.profile?.id ?? '',
      xuid: minecraft.xuid,
      skinUrl: minecraft.profile?.skins?.[0]?.url ?? null,
      avatarUrl,
    }
  }

  const loadAccountFromRefreshToken = async (
    refreshToken: string
  ): Promise<LauncherAccount> => {
    const authManager = createAuthManager()
    const xbox = await authManager.refresh(refreshToken)

    return loadAccountFromXbox(xbox)
  }

  const login = async (): Promise<AuthResponse> => {
    let lastLoadCode: string | null = null

    try {
      const authManager = createAuthManager()
      authManager.on('load', (asset) => {
        lastLoadCode = asset
      })
      const xbox = await authManager.launch('raw')
      const account = await loadAccountFromXbox(xbox, lastLoadCode)

      return {
        ok: true,
        account,
      }
    } catch (error) {
      return {
        ok: false,
        error: toAuthErrorMessage(error, lastLoadCode),
      }
    }
  }

  const restore = async (): Promise<AuthResponse> => {
    const session = sessionStore.get('session')

    if (!session?.refreshToken) {
      return { ok: false }
    }

    try {
      const account = await loadAccountFromRefreshToken(session.refreshToken)

      return {
        ok: true,
        account,
      }
    } catch (error) {
      sessionStore.delete('session')

      return {
        ok: false,
        error: toAuthErrorMessage(error),
      }
    }
  }

  const logout = (): AuthResponse => {
    sessionStore.delete('session')
    return { ok: false }
  }

  const getSession = () => sessionStore.get('session')

  const refreshMinecraftSession = async (
    refreshToken: string
  ): Promise<RefreshedMinecraftSession> => {
    const authManager = createAuthManager()
    const xbox = await authManager.refresh(refreshToken)
    const minecraft = await getMinecraftFromXbox(xbox)
    const nextRefreshToken = xbox.save()

    saveRefreshToken(nextRefreshToken)

    return {
      minecraft,
      refreshToken: nextRefreshToken,
    }
  }

  return {
    getSession,
    login,
    restore,
    logout,
    refreshMinecraftSession,
  }
}

export type AuthService = ReturnType<typeof createAuthService>
