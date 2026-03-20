export const IPC_CHANNELS = {
  launcherEvent: 'launcher:event',
  authLogin: 'auth:login',
  authRestore: 'auth:restore',
  authLogout: 'auth:logout',
  launcherGetState: 'launcher:get-state',
  launcherSaveSettings: 'launcher:save-settings',
  launcherPickInstanceDirectory: 'launcher:pick-instance-directory',
  launcherLaunch: 'launcher:launch',
  launcherOpenLogs: 'launcher:open-logs',
  launcherGetLogs: 'launcher:get-logs',
  launcherRepairPack: 'launcher:repair-pack',
  systemOpenExternal: 'system:open-external',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
} as const

export const IPC_INVOKE_CHANNELS = [
  IPC_CHANNELS.authLogin,
  IPC_CHANNELS.authRestore,
  IPC_CHANNELS.authLogout,
  IPC_CHANNELS.launcherGetState,
  IPC_CHANNELS.launcherSaveSettings,
  IPC_CHANNELS.launcherPickInstanceDirectory,
  IPC_CHANNELS.launcherLaunch,
  IPC_CHANNELS.launcherOpenLogs,
  IPC_CHANNELS.launcherGetLogs,
  IPC_CHANNELS.launcherRepairPack,
  IPC_CHANNELS.systemOpenExternal,
] as const

export const IPC_SEND_CHANNELS = [
  IPC_CHANNELS.windowMinimize,
  IPC_CHANNELS.windowToggleMaximize,
  IPC_CHANNELS.windowClose,
] as const

export const IPC_EVENT_CHANNELS = [IPC_CHANNELS.launcherEvent] as const

export type IpcInvokeChannel = (typeof IPC_INVOKE_CHANNELS)[number]
export type IpcSendChannel = (typeof IPC_SEND_CHANNELS)[number]
export type IpcEventChannel = (typeof IPC_EVENT_CHANNELS)[number]
export type WindowControlChannel = IpcSendChannel
