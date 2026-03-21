import React, { useEffect, useRef } from 'react'
import Head from 'next/head'
import { launcherIpc } from '../lib/launcher-ipc'
import { useLauncherLogs } from '../hooks/use-launcher-logs'
import { WindowControls } from '../components/launcher/window-controls'

export default function LogsPage() {
  const { isReady, logs, logCount } = useLauncherLogs()
  const logsContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = logsContainerRef.current

    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [logs])

  return (
    <React.Fragment>
      <Head>
        <title>Logs</title>
      </Head>

      <main className="relative h-screen overflow-hidden bg-[#110518] p-4 text-[#f6ecff]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 [-webkit-app-region:drag]" />

        <WindowControls onControl={launcherIpc.sendWindowControl} />

        <section className="h-full p-2 pt-8">
          <div
            ref={logsContainerRef}
            className="h-[calc(100vh-5rem)] overflow-auto whitespace-pre-wrap border border-[rgba(231,214,255,0.12)] bg-[#251038] p-3 font-mono text-xs leading-none text-[#d7c1ec]"
          >
            {logs.length > 0 ? logs.join('\n') : 'Aucun log pour le moment.'}
          </div>
        </section>
      </main>
    </React.Fragment>
  )
}
