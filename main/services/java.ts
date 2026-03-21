import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { WebContents } from 'electron'
import {
  downloadToFile,
  fetchJson,
  fetchJsonFromUrls,
  normalizeString,
  sanitizeFileName,
  toErrorMessage,
} from '../utils/common'

const JAVA_RUNTIME_INDEX_HASH = '2ec0cc96c44e5a76b9c8b7c39df7210883d12871'
const MINECRAFT_VERSION_MANIFEST_URLS = [
  process.env.UZTIK_MINECRAFT_VERSION_MANIFEST_URL?.trim() ?? '',
  'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
  'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json',
].filter(Boolean)
const JAVA_RUNTIME_INDEX_URLS = [
  process.env.UZTIK_JAVA_RUNTIME_INDEX_URL?.trim() ?? '',
  `https://piston-meta.mojang.com/v1/products/java-runtime/${JAVA_RUNTIME_INDEX_HASH}/all.json`,
  `https://launchermeta.mojang.com/v1/products/java-runtime/${JAVA_RUNTIME_INDEX_HASH}/all.json`,
].filter(Boolean)

type MinecraftVersionManifestEntry = {
  id?: string
  url?: string
}

type MinecraftVersionManifest = {
  versions?: MinecraftVersionManifestEntry[]
}

type MinecraftVersionMetadata = {
  javaVersion?: {
    component?: string
    majorVersion?: number
  }
}

type JavaRuntimeIndexEntry = {
  manifest?: {
    url?: string
  }
  version?: {
    name?: string
  }
}

type JavaRuntimeIndex = Record<string, Record<string, JavaRuntimeIndexEntry[] | undefined> | undefined>

type JavaRuntimeManifestFile = {
  downloads?: {
    raw?: {
      url?: string
    }
  }
  executable?: boolean
  target?: string
  type?: 'directory' | 'file' | 'link'
}

type JavaRuntimeManifest = {
  files?: Record<string, JavaRuntimeManifestFile | undefined>
}

type JavaRuntimeRequirement = {
  component: string
  majorVersion: number
}

type JavaRuntimeDescriptor = {
  manifestUrl: string
  platformKey: string
  versionName: string
} & JavaRuntimeRequirement

type JavaServiceDependencies = {
  emitLauncherEvent: (sender: WebContents | null, type: string, payload: unknown) => void
}

export const createJavaService = ({ emitLauncherEvent }: JavaServiceDependencies) => {
  const getJavaRuntimeBasePath = () => path.join(app.getPath('userData'), 'java-runtimes')

  const getJavaRuntimePlatformKey = () => {
    if (process.platform === 'win32') {
      if (process.arch === 'x64') {
        return 'windows-x64'
      }

      if (process.arch === 'ia32') {
        return 'windows-x86'
      }

      if (process.arch === 'arm64') {
        return 'windows-arm64'
      }
    }

    if (process.platform === 'linux') {
      if (process.arch === 'x64') {
        return 'linux'
      }

      if (process.arch === 'ia32') {
        return 'linux-i386'
      }
    }

    if (process.platform === 'darwin') {
      if (process.arch === 'x64') {
        return 'mac-os'
      }

      if (process.arch === 'arm64') {
        return 'mac-os-arm64'
      }
    }

    throw new Error(`Plateforme Java non supportee: ${process.platform} ${process.arch}`)
  }

  const getJavaExecutablePath = (runtimeDirectory: string) =>
    path.join(runtimeDirectory, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')

  const getJavaRuntimeDirectory = (descriptor: JavaRuntimeDescriptor) =>
    path.join(
      getJavaRuntimeBasePath(),
      descriptor.platformKey,
      descriptor.component,
      sanitizeFileName(descriptor.versionName)
    )

  const getMinecraftVersionMetadata = async (
    minecraftVersion: string
  ): Promise<MinecraftVersionMetadata> => {
    const manifest =
      await fetchJsonFromUrls<MinecraftVersionManifest>(MINECRAFT_VERSION_MANIFEST_URLS)
    const versionEntry = manifest.versions?.find(
      (entry) => normalizeString(entry.id) === minecraftVersion
    )
    const versionUrl = normalizeString(versionEntry?.url)

    if (!versionUrl) {
      throw new Error(`Version Minecraft introuvable: ${minecraftVersion}`)
    }

    return fetchJson<MinecraftVersionMetadata>(versionUrl)
  }

  const resolveJavaRuntimeRequirement = async (
    minecraftVersion: string
  ): Promise<JavaRuntimeRequirement> => {
    const metadata = await getMinecraftVersionMetadata(minecraftVersion)
    const component = normalizeString(metadata.javaVersion?.component)
    const majorVersion = Number(metadata.javaVersion?.majorVersion)

    if (!component || !Number.isFinite(majorVersion) || majorVersion <= 0) {
      return {
        component: 'jre-legacy',
        majorVersion: 8,
      }
    }

    return {
      component,
      majorVersion,
    }
  }

  const resolveJavaRuntimeDescriptor = async (
    minecraftVersion: string
  ): Promise<JavaRuntimeDescriptor> => {
    const requirement = await resolveJavaRuntimeRequirement(minecraftVersion)
    let runtimeIndex: JavaRuntimeIndex

    try {
      runtimeIndex = await fetchJsonFromUrls<JavaRuntimeIndex>(JAVA_RUNTIME_INDEX_URLS)
    } catch (error) {
      throw new Error(
        `Impossible de recuperer l'index des runtimes Java officiels. Verifie la connexion ou redefine UZTIK_JAVA_RUNTIME_INDEX_URL. (${toErrorMessage(
          error
        )})`
      )
    }

    const platformKey = getJavaRuntimePlatformKey()
    const platformEntry = runtimeIndex[platformKey]
    const runtimeEntry = platformEntry?.[requirement.component]?.[0]
    const manifestUrl = normalizeString(runtimeEntry?.manifest?.url)
    const versionName = normalizeString(runtimeEntry?.version?.name)

    if (!manifestUrl || !versionName) {
      throw new Error(
        `Aucun runtime Java ${requirement.majorVersion} n'est disponible pour ${platformKey}.`
      )
    }

    return {
      ...requirement,
      manifestUrl,
      platformKey,
      versionName,
    }
  }

  const installJavaRuntime = async (
    descriptor: JavaRuntimeDescriptor,
    sender: WebContents | null
  ) => {
    emitLauncherEvent(
      sender,
      'status',
      `Installation de Java ${descriptor.majorVersion} (${descriptor.versionName})`
    )

    const runtimeManifest = await fetchJson<JavaRuntimeManifest>(descriptor.manifestUrl)
    const runtimeDirectory = getJavaRuntimeDirectory(descriptor)
    const temporaryDirectory = `${runtimeDirectory}.tmp-${Date.now()}`
    const runtimeEntries = Object.entries(runtimeManifest.files ?? {})
    const progressLabel = `Java ${descriptor.majorVersion}`
    const totalTasks = runtimeEntries.filter(([, file]) => file && file.type !== 'directory').length
    let completedTasks = 0

    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true })
    await fs.promises.mkdir(temporaryDirectory, { recursive: true })

    emitLauncherEvent(sender, 'progress', {
      type: 'java-runtime',
      task: 0,
      total: totalTasks,
      unit: 'items',
      label: progressLabel,
    })

    try {
      for (const [relativePath, file] of runtimeEntries) {
        if (!file) {
          continue
        }

        const destinationPath = path.join(temporaryDirectory, relativePath)

        if (file.type === 'directory') {
          await fs.promises.mkdir(destinationPath, { recursive: true })
          continue
        }

        if (file.type === 'link') {
          const targetPath = normalizeString(file.target)

          if (!targetPath) {
            throw new Error(`Lien runtime invalide: ${relativePath}`)
          }

          await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true })
          await fs.promises.symlink(targetPath, destinationPath)
          completedTasks += 1
          emitLauncherEvent(sender, 'progress', {
            type: 'java-runtime',
            task: completedTasks,
            total: totalTasks,
            unit: 'items',
            label: progressLabel,
          })
          continue
        }

        const downloadUrl = normalizeString(file.downloads?.raw?.url)

        if (!downloadUrl) {
          throw new Error(`Fichier runtime incomplet: ${relativePath}`)
        }

        await downloadToFile(downloadUrl, destinationPath)
        completedTasks += 1
        emitLauncherEvent(sender, 'progress', {
          type: 'java-runtime',
          task: completedTasks,
          total: totalTasks,
          unit: 'items',
          label: progressLabel,
        })

        if (file.executable && process.platform !== 'win32') {
          await fs.promises.chmod(destinationPath, 0o755)
        }
      }

      await fs.promises.rm(runtimeDirectory, { recursive: true, force: true })
      await fs.promises.mkdir(path.dirname(runtimeDirectory), { recursive: true })
      await fs.promises.rename(temporaryDirectory, runtimeDirectory)
    } catch (error) {
      await fs.promises.rm(temporaryDirectory, { recursive: true, force: true })
      throw error
    }

    emitLauncherEvent(sender, 'progress', {
      type: 'java-runtime',
      task: totalTasks,
      total: totalTasks,
      unit: 'items',
      label: progressLabel,
    })

    emitLauncherEvent(
      sender,
      'status',
      `Java ${descriptor.majorVersion} pret (${descriptor.versionName})`
    )
  }

  const ensureJavaRuntime = async (
    minecraftVersion: string,
    sender: WebContents | null
  ) => {
    const descriptor = await resolveJavaRuntimeDescriptor(minecraftVersion)
    const runtimeDirectory = getJavaRuntimeDirectory(descriptor)
    const javaPath = getJavaExecutablePath(runtimeDirectory)

    if (fs.existsSync(javaPath)) {
      emitLauncherEvent(
        sender,
        'status',
        `Java ${descriptor.majorVersion} detecte (${descriptor.versionName})`
      )
      return javaPath
    }

    await installJavaRuntime(descriptor, sender)

    if (!fs.existsSync(javaPath)) {
      throw new Error(`Java ${descriptor.majorVersion} est installe mais introuvable sur disque.`)
    }

    return javaPath
  }

  return {
    ensureJavaRuntime,
  }
}

export type JavaService = ReturnType<typeof createJavaService>
