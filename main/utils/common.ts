import fs from 'fs'
import path from 'path'

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

export const downloadToFile = async (url: string, destination: string) => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Telechargement impossible (${response.status})`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  await fs.promises.mkdir(path.dirname(destination), { recursive: true })
  await fs.promises.writeFile(destination, buffer)
}
