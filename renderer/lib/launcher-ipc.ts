import { IPC_CHANNELS, type WindowControlChannel } from '../../shared/ipc'
import type {
  AuthResponse,
  LauncherActionResponse,
  LauncherEvent,
  LauncherSettings,
  LauncherStateResponse,
} from '../../shared/launcher'

const invoke = <T>(channel: Parameters<typeof window.ipc.invoke>[0], value?: unknown) =>
  window.ipc.invoke(channel, value) as Promise<T>

export const launcherIpc = {
  login: () => invoke<AuthResponse>(IPC_CHANNELS.authLogin),
  restore: () => invoke<AuthResponse>(IPC_CHANNELS.authRestore),
  logout: () => invoke<AuthResponse>(IPC_CHANNELS.authLogout),
  getState: () => invoke<LauncherStateResponse>(IPC_CHANNELS.launcherGetState),
  saveSettings: (partial: Partial<LauncherSettings>) =>
    invoke<LauncherActionResponse>(IPC_CHANNELS.launcherSaveSettings, partial),
  pickInstanceDirectory: () =>
    invoke<LauncherActionResponse>(IPC_CHANNELS.launcherPickInstanceDirectory),
  launch: (settings: Partial<LauncherSettings>) =>
    invoke<LauncherActionResponse>(IPC_CHANNELS.launcherLaunch, settings),
  closeGame: () => invoke<LauncherActionResponse>(IPC_CHANNELS.launcherCloseGame),
  openLogs: () => invoke<LauncherActionResponse>(IPC_CHANNELS.launcherOpenLogs),
  getLogs: () => invoke<string[]>(IPC_CHANNELS.launcherGetLogs),
  repairPack: (partial?: Partial<LauncherSettings>) =>
    invoke<LauncherActionResponse>(IPC_CHANNELS.launcherRepairPack, partial),
  openExternal: (url: string) => invoke<{ ok: boolean }>(IPC_CHANNELS.systemOpenExternal, url),
  onLauncherEvent: (callback: (event: LauncherEvent) => void) =>
    window.ipc.on(IPC_CHANNELS.launcherEvent, (event) => callback(event as LauncherEvent)),
  sendWindowControl: (channel: WindowControlChannel) => window.ipc.send(channel),
}
