import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import { formatLauncherEventLine, type LauncherEvent } from '../../shared/launcher'
import { launcherIpc } from '../lib/launcher-ipc'

export default function LogsPage() {
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    const loadLogs = async () => {
      const response = await launcherIpc.getLogs()

      if (!cancelled) {
        setLogs(response)
      }
    }

    loadLogs()

    const unsubscribe = launcherIpc.onLauncherEvent((event: LauncherEvent) =>
      setLogs((current) => [...current, formatLauncherEventLine(event)].slice(-300))
    )

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return (
    <React.Fragment>
      <Head>
        <title>Logs</title>
      </Head>

      <main className="min-h-screen bg-[#110518] p-4 text-[#f6ecff]">
        <section className="border border-[rgba(231,214,255,0.12)] bg-[#1a0c27] p-4">
          <h1 className="text-sm font-bold uppercase tracking-[0.12em] text-[#f6ecff]">
            Logs du launcher
          </h1>

          <div className="mt-4 h-[calc(100vh-7rem)] overflow-auto whitespace-pre-wrap border border-[rgba(231,214,255,0.12)] bg-[#251038] p-2 font-mono text-xs leading-6 text-[#d7c1ec]">
            {logs.length > 0 ? logs.join('\n') : 'Aucun log pour le moment.'}
          </div>
        </section>
      </main>
    </React.Fragment>
  )
}
