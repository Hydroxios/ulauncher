export type StoredSession = {
  refreshToken: string
}

export type LauncherAccount = {
  username: string
  uuid: string
  xuid: string
  skinUrl: string | null
  avatarUrl: string | null
}

export type AuthResponse = {
  ok: boolean
  account?: LauncherAccount
  error?: string
}

export type LauncherSettings = {
  memoryGb: number
  instanceDirectory: string
  openLogsOnLaunch: boolean
}

export type PackManifest = {
  packVersion: string
  minecraftVersion: string
  fabricLoaderVersion: string
  packUrl: string
}

export type InstalledPackState = {
  packVersion: string
  minecraftVersion: string
  fabricLoaderVersion: string
  fabricProfileId: string
  installedAt: string
}

export type LauncherPackStatus =
  | 'not-configured'
  | 'not-installed'
  | 'ready'
  | 'update-available'
  | 'error'

export type LauncherPackState = {
  manifestUrl: string | null
  packVersion: string | null
  minecraftVersion: string | null
  fabricLoaderVersion: string | null
  installed: boolean
  needsUpdate: boolean
  status: LauncherPackStatus
  error?: string
}

export type LauncherStateResponse = {
  ok: boolean
  settings: LauncherSettings
  pack: LauncherPackState
  error?: string
}

export type LauncherActionResponse = {
  ok: boolean
  settings?: LauncherSettings
  pack?: LauncherPackState
  error?: string
}

export type LauncherEvent = {
  type: string
  payload: unknown
  timestamp: number
}

export type LauncherProgressPayload = {
  type: string
  task: number
  total: number
  unit?: 'items' | 'bytes'
  label?: string
}

export const formatLauncherEventLine = (event: Pick<LauncherEvent, 'type' | 'payload'>) =>
  typeof event.payload === 'string'
    ? `[${event.type}] ${event.payload}`
    : `[${event.type}] ${JSON.stringify(event.payload)}`
