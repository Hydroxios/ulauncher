import { useEffect, useState } from 'react'
import { formatLauncherEventLine, type LauncherEvent } from '../../shared/launcher'
import { launcherIpc } from '../lib/launcher-ipc'

export const useLauncherLogs = () => {
  const [logs, setLogs] = useState<string[]>([])
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadLogs = async () => {
      const response = await launcherIpc.getLogs()

      if (!cancelled) {
        setLogs(response)
        setIsReady(true)
      }
    }

    loadLogs()

    const unsubscribe = launcherIpc.onLauncherEvent((event: LauncherEvent) => {
      setLogs((current) => [...current, formatLauncherEventLine(event)].slice(-300))
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return {
    isReady,
    logs,
    logCount: logs.length,
  }
}
