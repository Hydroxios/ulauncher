import Store from 'electron-store'
import { Auth } from 'msmc'
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

  const loadAccountFromRefreshToken = async (
    refreshToken: string
  ): Promise<LauncherAccount> => {
    const authManager = createAuthManager()
    const xbox = await authManager.refresh(refreshToken)
    const minecraft = await xbox.getMinecraft()

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

  const login = async (): Promise<AuthResponse> => {
    try {
      const authManager = createAuthManager()
      const xbox = await authManager.launch('raw')
      const account = await loadAccountFromRefreshToken(xbox.save())

      return {
        ok: true,
        account,
      }
    } catch (error) {
      return {
        ok: false,
        error: toErrorMessage(error),
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
        error: toErrorMessage(error),
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
    const minecraft = await xbox.getMinecraft()
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
