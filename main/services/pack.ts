import fs from 'fs'
import path from 'path'
import type { WebContents } from 'electron'
import type {
  InstalledPackState,
  LauncherPackState,
  LauncherSettings,
  PackManifest,
} from '../../shared/launcher'
import {
  downloadToFile,
  fetchJson,
  normalizeString,
  sanitizeFileName,
  toErrorMessage,
} from '../utils/common'

const PACK_STATE_FILE_NAME = '.uztik-pack.json'
const PACK_CACHE_DIRECTORY = '.uztik-cache'
const MANAGED_PACK_PATHS = [
  'mods',
  'config',
  'defaultconfigs',
  'kubejs',
  'resourcepacks',
  'shaderpacks',
]

type FabricProfileResponse = {
  id?: string
}

export type PreparedPack = {
  manifest: PackManifest
  fabricProfileId: string
  installedState: InstalledPackState
  clientPackagePath?: string
}

type PackServiceDependencies = {
  emitLauncherEvent: (sender: WebContents | null, type: string, payload: unknown) => void
}

export const createPackService = ({ emitLauncherEvent }: PackServiceDependencies) => {
  const getPackStatePath = (instanceDirectory: string) =>
    path.join(instanceDirectory, PACK_STATE_FILE_NAME)

  const getFabricProfilePath = (instanceDirectory: string, fabricProfileId: string) =>
    path.join(instanceDirectory, 'versions', fabricProfileId, `${fabricProfileId}.json`)

  const getPackCachePath = (instanceDirectory: string, packVersion: string) =>
    path.join(instanceDirectory, PACK_CACHE_DIRECTORY, `${sanitizeFileName(packVersion)}.zip`)

  const parsePackManifest = (value: unknown, manifestUrl: string): PackManifest => {
    const source = value as Record<string, unknown>
    const packVersion = normalizeString(source?.packVersion)
    const minecraftVersion = normalizeString(source?.minecraftVersion)
    const fabricLoaderVersion = normalizeString(source?.fabricLoaderVersion)
    const rawPackUrl = normalizeString(source?.packUrl)

    if (!packVersion || !minecraftVersion || !fabricLoaderVersion || !rawPackUrl) {
      throw new Error('Le manifeste du pack est invalide.')
    }

    return {
      packVersion,
      minecraftVersion,
      fabricLoaderVersion,
      packUrl: new URL(rawPackUrl, manifestUrl).toString(),
    }
  }

  const fetchPackManifest = async (manifestUrl: string) =>
    parsePackManifest(await fetchJson<unknown>(manifestUrl), manifestUrl)

  const readInstalledPackState = async (
    instanceDirectory: string
  ): Promise<InstalledPackState | null> => {
    try {
      const raw = await fs.promises.readFile(getPackStatePath(instanceDirectory), 'utf8')
      const parsed = JSON.parse(raw) as Partial<InstalledPackState>

      const packVersion = normalizeString(parsed.packVersion)
      const minecraftVersion = normalizeString(parsed.minecraftVersion)
      const fabricLoaderVersion = normalizeString(parsed.fabricLoaderVersion)
      const fabricProfileId = normalizeString(parsed.fabricProfileId)
      const installedAt = normalizeString(parsed.installedAt)

      if (
        !packVersion ||
        !minecraftVersion ||
        !fabricLoaderVersion ||
        !fabricProfileId ||
        !installedAt
      ) {
        return null
      }

      return {
        packVersion,
        minecraftVersion,
        fabricLoaderVersion,
        fabricProfileId,
        installedAt,
      }
    } catch {
      return null
    }
  }

  const writeInstalledPackState = async (
    instanceDirectory: string,
    installedState: InstalledPackState
  ) => {
    await fs.promises.mkdir(instanceDirectory, { recursive: true })
    await fs.promises.writeFile(
      getPackStatePath(instanceDirectory),
      JSON.stringify(installedState, null, 2),
      'utf8'
    )
  }

  const clearInstalledPackState = async (instanceDirectory: string) => {
    await fs.promises.rm(getPackStatePath(instanceDirectory), { force: true })
  }

  const isInstalledPackUpToDate = (
    installedState: InstalledPackState | null,
    manifest: PackManifest,
    instanceDirectory: string
  ) => {
    if (!installedState) {
      return false
    }

    if (
      installedState.packVersion !== manifest.packVersion ||
      installedState.minecraftVersion !== manifest.minecraftVersion ||
      installedState.fabricLoaderVersion !== manifest.fabricLoaderVersion
    ) {
      return false
    }

    return fs.existsSync(getFabricProfilePath(instanceDirectory, installedState.fabricProfileId))
  }

  const resolvePackState = async (settings: LauncherSettings): Promise<LauncherPackState> => {
    const manifestUrl = normalizeString(settings.packManifestUrl)

    if (!manifestUrl) {
      return {
        manifestUrl: null,
        packVersion: null,
        minecraftVersion: null,
        fabricLoaderVersion: null,
        installed: false,
        needsUpdate: false,
        status: 'not-configured',
      }
    }

    try {
      const manifest = await fetchPackManifest(manifestUrl)
      const installedState = await readInstalledPackState(settings.instanceDirectory)
      const installed = isInstalledPackUpToDate(
        installedState,
        manifest,
        settings.instanceDirectory
      )

      return {
        manifestUrl,
        packVersion: manifest.packVersion,
        minecraftVersion: manifest.minecraftVersion,
        fabricLoaderVersion: manifest.fabricLoaderVersion,
        installed,
        needsUpdate: !installed,
        status: installed
          ? 'ready'
          : installedState
            ? 'update-available'
            : 'not-installed',
      }
    } catch (error) {
      return {
        manifestUrl,
        packVersion: null,
        minecraftVersion: null,
        fabricLoaderVersion: null,
        installed: false,
        needsUpdate: false,
        status: 'error',
        error: toErrorMessage(error),
      }
    }
  }

  const buildFabricProfileUrl = (manifest: PackManifest) =>
    `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(
      manifest.minecraftVersion
    )}/${encodeURIComponent(manifest.fabricLoaderVersion)}/profile/json`

  const ensureFabricProfile = async (
    instanceDirectory: string,
    manifest: PackManifest
  ): Promise<string> => {
    const profile = await fetchJson<FabricProfileResponse>(buildFabricProfileUrl(manifest))
    const fabricProfileId = normalizeString(profile.id)

    if (!fabricProfileId) {
      throw new Error('Profil Fabric introuvable.')
    }

    const versionDirectory = path.join(instanceDirectory, 'versions', fabricProfileId)

    await fs.promises.mkdir(versionDirectory, { recursive: true })
    await fs.promises.writeFile(
      getFabricProfilePath(instanceDirectory, fabricProfileId),
      JSON.stringify(profile, null, 2),
      'utf8'
    )

    return fabricProfileId
  }

  const removeManagedPackContent = async (
    instanceDirectory: string,
    previousState: InstalledPackState | null,
    nextFabricProfileId: string
  ) => {
    await Promise.all(
      MANAGED_PACK_PATHS.map((entry) =>
        fs.promises.rm(path.join(instanceDirectory, entry), {
          recursive: true,
          force: true,
        })
      )
    )

    if (previousState?.fabricProfileId && previousState.fabricProfileId !== nextFabricProfileId) {
      await fs.promises.rm(
        path.join(instanceDirectory, 'versions', previousState.fabricProfileId),
        {
          recursive: true,
          force: true,
        }
      )
    }
  }

  const preparePack = async (
    instanceDirectory: string,
    manifestUrl: string,
    sender: WebContents | null
  ): Promise<PreparedPack> => {
    emitLauncherEvent(sender, 'status', 'Recuperation du manifeste du pack')

    const manifest = await fetchPackManifest(manifestUrl)
    const installedState = await readInstalledPackState(instanceDirectory)

    if (isInstalledPackUpToDate(installedState, manifest, instanceDirectory)) {
      emitLauncherEvent(sender, 'status', `Pack ${manifest.packVersion} deja installe`)

      return {
        manifest,
        fabricProfileId: installedState!.fabricProfileId,
        installedState: installedState!,
      }
    }

    emitLauncherEvent(sender, 'status', 'Preparation du profil Fabric')
    const fabricProfileId = await ensureFabricProfile(instanceDirectory, manifest)

    emitLauncherEvent(sender, 'status', 'Nettoyage des fichiers geres par le pack')
    await removeManagedPackContent(instanceDirectory, installedState, fabricProfileId)
    await clearInstalledPackState(instanceDirectory)

    const clientPackagePath = getPackCachePath(instanceDirectory, manifest.packVersion)

    emitLauncherEvent(sender, 'status', `Telechargement du pack ${manifest.packVersion}`)
    await downloadToFile(manifest.packUrl, clientPackagePath)

    return {
      manifest,
      fabricProfileId,
      clientPackagePath,
      installedState: {
        packVersion: manifest.packVersion,
        minecraftVersion: manifest.minecraftVersion,
        fabricLoaderVersion: manifest.fabricLoaderVersion,
        fabricProfileId,
        installedAt: new Date().toISOString(),
      },
    }
  }

  return {
    clearInstalledPackState,
    preparePack,
    resolvePackState,
    writeInstalledPackState,
  }
}

export type PackService = ReturnType<typeof createPackService>
