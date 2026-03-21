import fs from 'fs'
import path from 'path'
import { finished } from 'stream/promises'

type DownloadToFileOptions = {
  onProgress?: (progress: { receivedBytes: number; totalBytes: number | null }) => void
}

const resolveContentLength = async (url: string) => {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
    })

    if (!response.ok) {
      return null
    }

    const totalHeader = response.headers.get('content-length')
    const totalBytes = totalHeader ? Number.parseInt(totalHeader, 10) : Number.NaN

    return Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : null
  } catch {
    return null
  }
}

export const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'pack'

export const toErrorMessage = (error: unknown) => {
  if (typeof error === 'string') {
    if (error === 'error.gui.closed') {
      return 'Connexion Microsoft annulée.'
    }

    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Une erreur est survenue.'
}

export const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Requete invalide (${response.status})`)
  }

  return (await response.json()) as T
}

export const fetchJsonFromUrls = async <T>(urls: string[]): Promise<T> => {
  let lastError: unknown = null

  for (const url of urls) {
    try {
      return await fetchJson<T>(url)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Requete invalide')
}

export const downloadToFile = async (
  url: string,
  destination: string,
  options?: DownloadToFileOptions
) => {
  const response = await fetch(url, {
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`Telechargement impossible (${response.status})`)
  }

  const totalHeader = response.headers.get('content-length')
  const totalBytes = totalHeader ? Number.parseInt(totalHeader, 10) : Number.NaN
  let knownTotalBytes = Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : null

  if (knownTotalBytes === null) {
    knownTotalBytes = await resolveContentLength(url)
  }

  await fs.promises.mkdir(path.dirname(destination), { recursive: true })

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())

    if (knownTotalBytes === null) {
      knownTotalBytes = buffer.length
    }

    options?.onProgress?.({
      receivedBytes: buffer.length,
      totalBytes: knownTotalBytes,
    })

    await fs.promises.writeFile(destination, buffer)
    return
  }

  const reader = response.body.getReader()
  const fileStream = fs.createWriteStream(destination)
  let receivedBytes = 0

  const waitForDrain = () =>
    new Promise<void>((resolve, reject) => {
      const onDrain = () => {
        cleanup()
        resolve()
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const cleanup = () => {
        fileStream.off('drain', onDrain)
        fileStream.off('error', onError)
      }

      fileStream.on('drain', onDrain)
      fileStream.on('error', onError)
    })

  options?.onProgress?.({
    receivedBytes: 0,
    totalBytes: knownTotalBytes,
  })

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      if (!value) {
        continue
      }

      receivedBytes += value.length

      if (knownTotalBytes !== null && receivedBytes > knownTotalBytes) {
        knownTotalBytes = receivedBytes
      }

      if (!fileStream.write(Buffer.from(value))) {
        await waitForDrain()
      }

      options?.onProgress?.({
        receivedBytes,
        totalBytes: knownTotalBytes,
      })
    }

    fileStream.end()
    await finished(fileStream)
  } catch (error) {
    fileStream.destroy()
    await fs.promises.rm(destination, { force: true })
    throw error
  }

  if (knownTotalBytes === null) {
    knownTotalBytes = receivedBytes
  }

  options?.onProgress?.({
    receivedBytes,
    totalBytes: knownTotalBytes,
  })
}
