import dns from 'dns'
import net from 'net'
import type { LauncherServerState } from '../../shared/launcher'
import { normalizeString, toErrorMessage } from '../utils/common'

const DEFAULT_MINECRAFT_PORT = 25565
const STATUS_TIMEOUT_MS = 5000
const STATUS_PROTOCOL_VERSION = 760

type ResolvedMinecraftAddress = {
  displayAddress: string
  host: string
  port: number
}

type MinecraftStatusResponse = {
  version?: {
    name?: string
  }
  players?: {
    online?: number
    max?: number
    sample?: Array<{
      name?: string
    }>
  }
}

const writeVarInt = (value: number) => {
  const bytes: number[] = []
  let current = value >>> 0

  do {
    let temp = current & 0x7f
    current >>>= 7

    if (current !== 0) {
      temp |= 0x80
    }

    bytes.push(temp)
  } while (current !== 0)

  return Buffer.from(bytes)
}

const readVarInt = (buffer: Buffer, offset: number) => {
  let result = 0
  let shift = 0
  let cursor = offset

  while (cursor < buffer.length) {
    const byte = buffer[cursor]
    result |= (byte & 0x7f) << shift
    cursor += 1

    if ((byte & 0x80) !== 0x80) {
      return {
        size: cursor - offset,
        value: result,
      }
    }

    shift += 7

    if (shift >= 35) {
      throw new Error('VarInt invalide.')
    }
  }

  return null
}

const writeString = (value: string) => {
  const stringBuffer = Buffer.from(value, 'utf8')

  return Buffer.concat([writeVarInt(stringBuffer.length), stringBuffer])
}

const buildPacket = (payload: Buffer) => Buffer.concat([writeVarInt(payload.length), payload])

const extractPacket = (buffer: Buffer) => {
  const packetLength = readVarInt(buffer, 0)

  if (!packetLength) {
    return null
  }

  const frameLength = packetLength.size + packetLength.value

  if (buffer.length < frameLength) {
    return null
  }

  return buffer.subarray(packetLength.size, frameLength)
}

const parseServerAddress = (value: string) => {
  const cleanedValue = value.replace(/^minecraft:\/\//i, '').replace(/\/+$/, '')

  if (cleanedValue.startsWith('[')) {
    const closingBracketIndex = cleanedValue.indexOf(']')

    if (closingBracketIndex === -1) {
      return {
        host: cleanedValue,
        port: null,
      }
    }

    const host = cleanedValue.slice(1, closingBracketIndex)
    const portCandidate = cleanedValue.slice(closingBracketIndex + 1)
    const port =
      portCandidate.startsWith(':') && portCandidate.length > 1
        ? Number.parseInt(portCandidate.slice(1), 10)
        : Number.NaN

    return {
      host,
      port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : null,
    }
  }

  const segments = cleanedValue.split(':')

  if (segments.length === 2) {
    const port = Number.parseInt(segments[1], 10)

    return {
      host: segments[0],
      port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : null,
    }
  }

  return {
    host: cleanedValue,
    port: null,
  }
}

const resolveMinecraftAddress = async (value: string): Promise<ResolvedMinecraftAddress> => {
  const parsed = parseServerAddress(value)
  const host = normalizeString(parsed.host)

  if (!host) {
    throw new Error('SERVER_ADDRESS est invalide.')
  }

  if (parsed.port) {
    return {
      displayAddress: `${host}:${parsed.port}`,
      host,
      port: parsed.port,
    }
  }

  try {
    const records = await dns.promises.resolveSrv(`_minecraft._tcp.${host}`)

    if (records.length > 0) {
      const selectedRecord = [...records].sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority
        }

        return right.weight - left.weight
      })[0]

      return {
        displayAddress: host,
        host: selectedRecord.name,
        port: selectedRecord.port,
      }
    }
  } catch {
    // Fallback sur l'adresse directe si aucun SRV n'est défini.
  }

  return {
    displayAddress: host,
    host,
    port: DEFAULT_MINECRAFT_PORT,
  }
}

const fetchMinecraftServerStatus = async (address: ResolvedMinecraftAddress) =>
  new Promise<{ latencyMs: number; response: MinecraftStatusResponse }>((resolve, reject) => {
    const startedAt = Date.now()
    const socket = net.createConnection({
      host: address.host,
      port: address.port,
    })
    let settled = false
    let receivedBuffer = Buffer.alloc(0)

    const settle = (callback: () => void) => {
      if (settled) {
        return
      }

      settled = true
      socket.removeAllListeners()
      socket.end()
      socket.destroy()
      callback()
    }

    socket.setTimeout(STATUS_TIMEOUT_MS)

    socket.once('connect', () => {
      const handshakePayload = Buffer.concat([
        writeVarInt(0),
        writeVarInt(STATUS_PROTOCOL_VERSION),
        writeString(address.host),
        Buffer.from([(address.port >> 8) & 0xff, address.port & 0xff]),
        writeVarInt(1),
      ])
      const requestPayload = writeVarInt(0)

      socket.write(buildPacket(handshakePayload))
      socket.write(buildPacket(requestPayload))
    })

    socket.on('data', (chunk) => {
      receivedBuffer = Buffer.concat([receivedBuffer, chunk])
      const packet = extractPacket(receivedBuffer)

      if (!packet) {
        return
      }

      try {
        const packetId = readVarInt(packet, 0)

        if (!packetId || packetId.value !== 0) {
          throw new Error('Reponse serveur invalide.')
        }

        const jsonLength = readVarInt(packet, packetId.size)

        if (!jsonLength) {
          throw new Error('Reponse serveur incomplete.')
        }

        const jsonStart = packetId.size + jsonLength.size
        const jsonEnd = jsonStart + jsonLength.value

        if (packet.length < jsonEnd) {
          return
        }

        const payload = packet.subarray(jsonStart, jsonEnd).toString('utf8')
        const response = JSON.parse(payload) as MinecraftStatusResponse

        settle(() =>
          resolve({
            latencyMs: Date.now() - startedAt,
            response,
          })
        )
      } catch (error) {
        settle(() => reject(error))
      }
    })

    socket.once('timeout', () => {
      settle(() => reject(new Error('Le serveur ne repond pas.')))
    })

    socket.once('error', (error) => {
      settle(() => reject(error))
    })

    socket.once('end', () => {
      if (!settled) {
        settle(() => reject(new Error('Connexion serveur fermee trop tot.')))
      }
    })
  })

export const createServerStatusService = () => {
  const getConfiguredAddress = () => normalizeString(process.env.SERVER_ADDRESS)

  const getServerStatus = async (): Promise<LauncherServerState> => {
    const configuredAddress = getConfiguredAddress()

    if (!configuredAddress) {
      return {
        address: null,
        onlinePlayers: null,
        maxPlayers: null,
        players: [],
        status: 'not-configured',
        version: null,
        latencyMs: null,
      }
    }

    try {
      const resolvedAddress = await resolveMinecraftAddress(configuredAddress)
      const { latencyMs, response } = await fetchMinecraftServerStatus(resolvedAddress)
      const playerSamples =
        response.players?.sample
          ?.map((player) => normalizeString(player.name))
          .filter(Boolean) ?? []

      return {
        address: resolvedAddress.displayAddress,
        onlinePlayers: Number.isFinite(response.players?.online)
          ? Number(response.players?.online)
          : 0,
        maxPlayers: Number.isFinite(response.players?.max)
          ? Number(response.players?.max)
          : null,
        players: playerSamples,
        status: 'online',
        version: normalizeString(response.version?.name) || null,
        latencyMs,
      }
    } catch (error) {
      return {
        address: configuredAddress,
        onlinePlayers: null,
        maxPlayers: null,
        players: [],
        status: 'offline',
        version: null,
        latencyMs: null,
        error: toErrorMessage(error),
      }
    }
  }

  return {
    getConfiguredAddress,
    getServerStatus,
  }
}

export type ServerStatusService = ReturnType<typeof createServerStatusService>
