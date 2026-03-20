import fs from 'fs'
import path from 'path'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { WebContents } from 'electron'
import serve from 'electron-serve'
import Store from 'electron-store'
import { Client } from 'minecraft-launcher-core'
import { Auth } from 'msmc'
import { createWindow } from './helpers'

const isProd = process.env.NODE_ENV === 'production'
const PACK_STATE_FILE_NAME = '.uztik-pack.json'
const PACK_CACHE_DIRECTORY = '.uztik-cache'
const DEFAULT_PACK_MANIFEST_URL = process.env.UZTIK_PACK_MANIFEST_URL?.trim() ?? ''
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
const MANAGED_PACK_PATHS = [
  'mods',
  'config',
  'defaultconfigs',
  'kubejs',
  'resourcepacks',
  'shaderpacks',
]

type StoredSession = {
  refreshToken: string
}

type LauncherAccount = {
  username: string
  uuid: string
  xuid: string
  skinUrl: string | null
  avatarUrl: string | null
}

type AuthResponse = {
  ok: boolean
  account?: LauncherAccount
  error?: string
}

type LauncherSettings = {
  memoryGb: number
  instanceDirectory: string
  openLogsOnLaunch: boolean
  packManifestUrl: string
}

type PackManifest = {
  packVersion: string
  minecraftVersion: string
  fabricLoaderVersion: string
  packUrl: string
}

type InstalledPackState = {
  packVersion: string
  minecraftVersion: string
  fabricLoaderVersion: string
  fabricProfileId: string
  installedAt: string
}

type LauncherPackState = {
  manifestUrl: string | null
  packVersion: string | null
  minecraftVersion: string | null
  fabricLoaderVersion: string | null
  installed: boolean
  needsUpdate: boolean
  status: 'not-configured' | 'not-installed' | 'ready' | 'update-available' | 'error'
  error?: string
}

type LauncherStateResponse = {
  ok: boolean
  settings: LauncherSettings
  pack: LauncherPackState
  error?: string
}

type LauncherActionResponse = {
  ok: boolean
  settings?: LauncherSettings
  pack?: LauncherPackState
  error?: string
}

type FabricProfileResponse = {
  id?: string
}

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

type PreparedPack = {
  manifest: PackManifest
  fabricProfileId: string
  installedState: InstalledPackState
  clientPackagePath?: string
}

const sessionStore = new Store<{ session?: StoredSession }>({
  name: 'launcher-session',
})
const launcherStore = new Store<{ settings?: LauncherSettings }>({
  name: 'launcher-settings',
})

let activeMinecraftProcess: ChildProcessWithoutNullStreams | null = null
let logsWindow: BrowserWindow | null = null
const launcherLogBuffer: string[] = []

const createAuthManager = () => new Auth('select_account')

const getDefaultLauncherSettings = (): LauncherSettings => ({
  memoryGb: 4,
  instanceDirectory: path.join(app.getPath('appData'), '.minecraft'),
  openLogsOnLaunch: false,
  packManifestUrl: DEFAULT_PACK_MANIFEST_URL,
})

const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'pack'

const getPackStatePath = (instanceDirectory: string) =>
  path.join(instanceDirectory, PACK_STATE_FILE_NAME)

const getFabricProfilePath = (instanceDirectory: string, fabricProfileId: string) =>
  path.join(instanceDirectory, 'versions', fabricProfileId, `${fabricProfileId}.json`)

const getPackCachePath = (instanceDirectory: string, packVersion: string) =>
  path.join(
    instanceDirectory,
    PACK_CACHE_DIRECTORY,
    `${sanitizeFileName(packVersion)}.zip`
  )

const getLauncherSettings = (): LauncherSettings => {
  const stored = launcherStore.get('settings')

  return {
    ...getDefaultLauncherSettings(),
    ...stored,
  }
}

const saveLauncherSettings = (partial?: Partial<LauncherSettings>) => {
  const next = {
    ...getLauncherSettings(),
    ...partial,
  }

  next.memoryGb = Math.max(1, Math.min(16, Number(next.memoryGb) || 4))
  next.instanceDirectory =
    normalizeString(next.instanceDirectory) || getDefaultLauncherSettings().instanceDirectory
  next.packManifestUrl = normalizeString(next.packManifestUrl)

  launcherStore.set('settings', next)

  return next
}

const shouldRefreshPackState = (partial?: Partial<LauncherSettings>) => {
  if (!partial) {
    return true
  }

  return 'instanceDirectory' in partial || 'packManifestUrl' in partial
}

const toErrorMessage = (error: unknown) => {
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

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Requete invalide (${response.status})`)
  }

  return (await response.json()) as T
}

const fetchJsonFromUrls = async <T>(urls: string[]): Promise<T> => {
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
  const manifest = await fetchJsonFromUrls<MinecraftVersionManifest>(MINECRAFT_VERSION_MANIFEST_URLS)
  const versionEntry = manifest.versions?.find((entry) => normalizeString(entry.id) === minecraftVersion)
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

const downloadBinaryFile = async (url: string, destination: string) => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Telechargement impossible (${response.status})`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  await fs.promises.mkdir(path.dirname(destination), { recursive: true })
  await fs.promises.writeFile(destination, buffer)
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

  await fs.promises.rm(temporaryDirectory, { recursive: true, force: true })
  await fs.promises.mkdir(temporaryDirectory, { recursive: true })

  try {
    for (const [relativePath, file] of Object.entries(runtimeManifest.files ?? {})) {
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
        continue
      }

      const downloadUrl = normalizeString(file.downloads?.raw?.url)

      if (!downloadUrl) {
        throw new Error(`Fichier runtime incomplet: ${relativePath}`)
      }

      await downloadBinaryFile(downloadUrl, destinationPath)

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

  if (
    previousState?.fabricProfileId &&
    previousState.fabricProfileId !== nextFabricProfileId
  ) {
    await fs.promises.rm(
      path.join(instanceDirectory, 'versions', previousState.fabricProfileId),
      {
        recursive: true,
        force: true,
      }
    )
  }
}

const downloadFile = async (url: string, destination: string) => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Telechargement impossible (${response.status})`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  await fs.promises.mkdir(path.dirname(destination), { recursive: true })
  await fs.promises.writeFile(destination, buffer)
}

const loadAccountFromRefreshToken = async (
  refreshToken: string
): Promise<LauncherAccount> => {
  const authManager = createAuthManager()
  const xbox = await authManager.refresh(refreshToken)
  const minecraft = await xbox.getMinecraft()

  let avatarUrl: string | null = null

  try {
    const social = await xbox.getSocial()
    const profile = await social.getProfile()
    avatarUrl = profile.profilePictureURL ?? null
  } catch {
    avatarUrl = null
  }

  sessionStore.set('session', { refreshToken: xbox.save() })

  return {
    username: minecraft.profile?.name ?? 'Player',
    uuid: minecraft.profile?.id ?? '',
    xuid: minecraft.xuid,
    skinUrl: minecraft.profile?.skins?.[0]?.url ?? null,
    avatarUrl,
  }
}

const pushLauncherLog = (line: string) => {
  launcherLogBuffer.push(line)

  if (launcherLogBuffer.length > 300) {
    launcherLogBuffer.shift()
  }
}

const emitLauncherEvent = (
  sender: WebContents | null,
  type: string,
  payload: unknown
) => {
  const line =
    typeof payload === 'string' ? `[${type}] ${payload}` : `[${type}] ${JSON.stringify(payload)}`

  pushLauncherLog(line)

  sender?.send('launcher:event', {
    type,
    payload,
    timestamp: Date.now(),
  })

  logsWindow?.webContents.send('launcher:event', {
    type,
    payload,
    timestamp: Date.now(),
  })
}

const openLogsWindow = async () => {
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.focus()
    return logsWindow
  }

  logsWindow = createWindow('logs', {
    width: 900,
    height: 620,
    minWidth: 720,
    minHeight: 480,
    frame: true,
    backgroundColor: '#110518',
    title: 'Logs',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  logsWindow.on('closed', () => {
    logsWindow = null
  })

  if (isProd) {
    await logsWindow.loadURL('app://./logs')
  } else {
    const port = process.argv[2]
    await logsWindow.loadURL(`http://localhost:${port}/logs`)
  }

  return logsWindow
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
  await downloadFile(manifest.packUrl, clientPackagePath)

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

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

;(async () => {
  await app.whenReady()

  const mainWindow = createWindow('main', {
    width: 1280,
    height: 720,
    minWidth: 1100,
    minHeight: 680,
    frame: false,
    backgroundColor: '#09030d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/home`)
  }
})()

app.on('window-all-closed', () => {
  app.quit()
})

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})

ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)

  if (!window) {
    return
  }

  if (window.isMaximized()) {
    window.unmaximize()
    return
  }

  window.maximize()
})

ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.removeHandler('auth:login')
ipcMain.removeHandler('auth:restore')
ipcMain.removeHandler('auth:logout')
ipcMain.removeHandler('launcher:get-state')
ipcMain.removeHandler('launcher:save-settings')
ipcMain.removeHandler('launcher:pick-instance-directory')
ipcMain.removeHandler('launcher:launch')
ipcMain.removeHandler('launcher:open-logs')
ipcMain.removeHandler('launcher:get-logs')
ipcMain.removeHandler('launcher:repair-pack')

ipcMain.handle('auth:login', async (): Promise<AuthResponse> => {
  try {
    const authManager = createAuthManager()
    const xbox = await authManager.launch('electron', {
      width: 540,
      height: 720,
      resizable: false,
      autoHideMenuBar: true,
      backgroundColor: '#110518',
      title: 'Connexion Microsoft',
    })

    const account = await loadAccountFromRefreshToken(xbox.save())

    return {
      ok: true,
      account,
    }
  } catch (error) {
    return {
      ok: false,
      error: toErrorMessage(error),
    }
  }
})

ipcMain.handle('auth:restore', async (): Promise<AuthResponse> => {
  const session = sessionStore.get('session')

  if (!session?.refreshToken) {
    return { ok: false }
  }

  try {
    const account = await loadAccountFromRefreshToken(session.refreshToken)

    return {
      ok: true,
      account,
    }
  } catch (error) {
    sessionStore.delete('session')

    return {
      ok: false,
      error: toErrorMessage(error),
    }
  }
})

ipcMain.handle('auth:logout', async (): Promise<AuthResponse> => {
  sessionStore.delete('session')
  return { ok: false }
})

ipcMain.handle('launcher:get-state', async (): Promise<LauncherStateResponse> => {
  const settings = saveLauncherSettings()
  const pack = await resolvePackState(settings)

  return {
    ok: true,
    settings,
    pack,
  }
})

ipcMain.handle(
  'launcher:save-settings',
  async (_event, partial: Partial<LauncherSettings>): Promise<LauncherActionResponse> => {
    const settings = saveLauncherSettings(partial)

    return {
      ok: true,
      settings,
      pack: shouldRefreshPackState(partial) ? await resolvePackState(settings) : undefined,
    }
  }
)

ipcMain.handle(
  'launcher:pick-instance-directory',
  async (): Promise<LauncherActionResponse> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getLauncherSettings().instanceDirectory,
      title: "Choisir le dossier de l'instance",
    })

    if (result.canceled || result.filePaths.length === 0) {
      return {
        ok: false,
      }
    }

    const settings = saveLauncherSettings({
      instanceDirectory: result.filePaths[0],
    })
    const pack = await resolvePackState(settings)

    return {
      ok: true,
      settings,
      pack,
    }
  }
)

ipcMain.handle('launcher:open-logs', async (): Promise<LauncherActionResponse> => {
  await openLogsWindow()

  return {
    ok: true,
  }
})

ipcMain.handle('launcher:get-logs', async () => {
  return [...launcherLogBuffer]
})

ipcMain.handle(
  'launcher:repair-pack',
  async (_event, partial?: Partial<LauncherSettings>): Promise<LauncherActionResponse> => {
    const settings = saveLauncherSettings(partial)

    await clearInstalledPackState(settings.instanceDirectory)

    const pack = await resolvePackState(settings)

    return {
      ok: true,
      settings,
      pack,
    }
  }
)

ipcMain.handle(
  'launcher:launch',
  async (event, partial: Partial<LauncherSettings>): Promise<LauncherActionResponse> => {
    if (activeMinecraftProcess) {
      return {
        ok: false,
        error: 'Minecraft est deja en cours de lancement.',
      }
    }

    const session = sessionStore.get('session')

    if (!session?.refreshToken) {
      return {
        ok: false,
        error: 'Aucune session Microsoft active.',
      }
    }

    const settings = saveLauncherSettings(partial)
    const sender = event.sender

    if (!settings.packManifestUrl) {
      return {
        ok: false,
        error: 'Configure une URL de manifeste de pack avant de lancer le jeu.',
      }
    }

    try {
      const authManager = createAuthManager()
      const xbox = await authManager.refresh(session.refreshToken)
      const minecraft = await xbox.getMinecraft()
      const launcher = new Client()

      sessionStore.set('session', { refreshToken: xbox.save() })

      if (settings.openLogsOnLaunch) {
        await openLogsWindow()
      }

      const preparedPack = await preparePack(
        settings.instanceDirectory,
        settings.packManifestUrl,
        sender
      )
      const javaPath = await ensureJavaRuntime(preparedPack.manifest.minecraftVersion, sender)

      launcher.on('debug', (message) => emitLauncherEvent(sender, 'debug', String(message)))
      launcher.on('data', (message) => emitLauncherEvent(sender, 'data', String(message)))
      launcher.on('progress', (message) => emitLauncherEvent(sender, 'progress', message))
      launcher.on('package-extract', () =>
        emitLauncherEvent(sender, 'status', 'Pack extrait dans l instance')
      )
      launcher.on('close', (code) => {
        emitLauncherEvent(sender, 'close', code)
        activeMinecraftProcess = null
      })

      const minMemory = Math.max(
        1,
        Math.min(settings.memoryGb, Math.floor(settings.memoryGb / 2) || 1)
      )
      const process = await launcher.launch({
        authorization: minecraft.mclc(true) as any,
        javaPath,
        root: settings.instanceDirectory,
        version: {
          number: preparedPack.manifest.minecraftVersion,
          type: 'release',
          custom: preparedPack.fabricProfileId,
        },
        memory: {
          max: `${settings.memoryGb}G`,
          min: `${minMemory}G`,
        },
        overrides: {
          detached: false,
        },
        clientPackage: preparedPack.clientPackagePath,
        removePackage: Boolean(preparedPack.clientPackagePath),
      })

      if (!process) {
        activeMinecraftProcess = null
        return {
          ok: false,
          error: 'Le lancement de Minecraft a echoue.',
        }
      }

      activeMinecraftProcess = process
      await writeInstalledPackState(settings.instanceDirectory, preparedPack.installedState)

      emitLauncherEvent(
        sender,
        'status',
        `Lancement de Minecraft ${preparedPack.manifest.minecraftVersion} avec Fabric ${preparedPack.manifest.fabricLoaderVersion}`
      )

      return {
        ok: true,
        settings,
        pack: await resolvePackState(settings),
      }
    } catch (error) {
      activeMinecraftProcess = null
      emitLauncherEvent(sender, 'error', toErrorMessage(error))

      return {
        ok: false,
        error: toErrorMessage(error),
        pack: await resolvePackState(settings),
      }
    }
  }
)
