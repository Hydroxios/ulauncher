import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { IpcEventChannel, IpcInvokeChannel, IpcSendChannel } from '../shared/ipc'

const handler = {
  send(channel: IpcSendChannel, value?: unknown) {
    ipcRenderer.send(channel, value)
  },
  invoke(channel: IpcInvokeChannel, value?: unknown) {
    return ipcRenderer.invoke(channel, value)
  },
  on(channel: IpcEventChannel, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)

    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
}

contextBridge.exposeInMainWorld('ipc', handler)

export type IpcHandler = typeof handler
