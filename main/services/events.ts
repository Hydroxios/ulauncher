import type { WebContents } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc'
import { formatLauncherEventLine, type LauncherEvent } from '../../shared/launcher'

export const createLauncherEventsService = (
  getLogsWindowContents: () => WebContents | null
) => {
  const launcherLogBuffer: string[] = []

  const emit = (sender: WebContents | null, type: string, payload: unknown) => {
    const event: LauncherEvent = {
      type,
      payload,
      timestamp: Date.now(),
    }

    launcherLogBuffer.push(formatLauncherEventLine(event))

    if (launcherLogBuffer.length > 300) {
      launcherLogBuffer.shift()
    }

    sender?.send(IPC_CHANNELS.launcherEvent, event)
    getLogsWindowContents()?.send(IPC_CHANNELS.launcherEvent, event)
  }

  const getLogs = () => [...launcherLogBuffer]

  return {
    emit,
    getLogs,
  }
}

export type LauncherEventsService = ReturnType<typeof createLauncherEventsService>
