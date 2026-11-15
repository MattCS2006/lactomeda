// Team rooms (FR-8.1, SCRUM-82): create or join a room with a 6-character code, up to 4 players. One Supabase
// Realtime channel per room; who is in the room comes from Realtime Presence. Without Supabase (no env vars, or
// offline) rooms are unavailable and solo play is untouched (NFR-07).
//
// Seating is decided the same way on every client, with no server: players are ordered by the time they joined
// (then by id), the first MAX_PLAYERS are seated and anyone after them leaves the room with status 'full'.
import type { SupabaseClient } from '@supabase/supabase-js'

export const ROOM_CODE_LENGTH = 6
export const MAX_PLAYERS = 4
/** Letters and digits that can't be confused when read aloud or typed (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
/** How long to wait for the server before giving up. */
export const ROOM_TIMEOUT_MS = 8000

export interface RoomPlayer {
  id: string
  name: string
  joinedAt: number
}

export type RoomStatus = 'idle' | 'connecting' | 'joined' | 'full' | 'notFound' | 'offline' | 'error'

export interface RoomState {
  status: RoomStatus
  code: string | null
  selfId: string
  /** Seated players in seat order; the first one is the host. */
  players: RoomPlayer[]
}

/** A new random room code. */
export function generateRoomCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length) % ROOM_CODE_ALPHABET.length]
  }
  return code
}

/** What the player typed, as a code: upper case, without spaces or dashes. */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '')
}

export function isValidRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_CODE_ALPHABET.includes(c))
}

/** Same order on every client: who joined first, then id. The first MAX_PLAYERS are seated, the rest rejected. */
export function seatPlayers(
  players: RoomPlayer[],
  max = MAX_PLAYERS,
): { seated: RoomPlayer[]; rejected: RoomPlayer[] } {
  const unique = [...new Map(players.map((p) => [p.id, p])).values()]
  const ordered = unique.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))
  return { seated: ordered.slice(0, max), rejected: ordered.slice(max) }
}

/** Presence state ({ key: [payload, ...] }) to players. Malformed entries are ignored. */
export function playersFromPresence(state: Record<string, unknown[]>): RoomPlayer[] {
  const out: RoomPlayer[] = []
  for (const entries of Object.values(state)) {
    for (const e of entries) {
      const p = e as Partial<RoomPlayer>
      if (typeof p.id === 'string' && typeof p.name === 'string' && typeof p.joinedAt === 'number') {
        out.push({ id: p.id, name: p.name, joinedAt: p.joinedAt })
      }
    }
  }
  return out
}

/** The part of the Supabase client rooms use (tests pass a fake). */
export type RealtimeClient = Pick<SupabaseClient, 'channel' | 'removeChannel'>

export interface RoomClientOptions {
  client: RealtimeClient | null
  /** This tab's player id (default: random). */
  selfId?: string
  now?: () => number
  random?: () => number
  timeoutMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface RoomClient {
  getState(): RoomState
  /** Create a room with a fresh code and join it as host. */
  create(name: string): void
  /** Join an existing room. A room nobody is in reports 'notFound'; a 5th player reports 'full'. */
  join(code: string, name: string): void
  leave(): void
  /** Subscribe to state changes; returns the unsubscribe function. */
  subscribe(listener: (state: RoomState) => void): () => void
}

type Channel = ReturnType<RealtimeClient['channel']>

export function createRoomClient(options: RoomClientOptions): RoomClient {
  const client = options.client
  const selfId = options.selfId ?? randomId(options.random ?? Math.random)
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const timeoutMs = options.timeoutMs ?? ROOM_TIMEOUT_MS
  const setTimer = options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>))

  let state: RoomState = { status: client ? 'idle' : 'offline', code: null, selfId, players: [] }
  const listeners = new Set<(s: RoomState) => void>()
  let channel: Channel | null = null
  let timer: unknown = null
  let attempt = 0 // ignores late callbacks from a channel that was already left

  const set = (next: Partial<RoomState>) => {
    state = { ...state, ...next }
    for (const l of [...listeners]) l(state)
  }

  const closeChannel = () => {
    if (timer !== null) clearTimer(timer)
    timer = null
    if (channel && client) void client.removeChannel(channel)
    channel = null
  }

  const open = (code: string, name: string, mode: 'create' | 'join', retries = 3) => {
    if (!client) return set({ status: 'offline', code: null, players: [] })
    closeChannel()
    const id = ++attempt
    const me: RoomPlayer = { id: selfId, name: name.trim() || 'Astronaut', joinedAt: now() }
    const ch = client.channel(`room:${code}`, { config: { presence: { key: selfId } } })
    channel = ch
    set({ status: 'connecting', code, players: [] })
    timer = setTimer(() => {
      if (id !== attempt) return
      closeChannel()
      set({ status: 'error', players: [] })
    }, timeoutMs)

    ch.on('presence', { event: 'sync' }, () => {
      if (id !== attempt) return
      const everyone = playersFromPresence(ch.presenceState() as Record<string, unknown[]>)
      if (!everyone.some((p) => p.id === selfId)) return // our own track hasn't arrived yet
      const others = everyone.filter((p) => p.id !== selfId)
      if (state.status === 'connecting') {
        if (timer !== null) clearTimer(timer)
        timer = null
        if (mode === 'join' && others.length === 0) {
          closeChannel()
          return set({ status: 'notFound', players: [] })
        }
        if (mode === 'create' && others.length > 0) {
          // The code is already in use (very rare): try another one
          if (retries > 0) return open(generateRoomCode(random), name, mode, retries - 1)
          closeChannel()
          return set({ status: 'error', players: [] })
        }
      }
      const { seated } = seatPlayers(everyone)
      if (!seated.some((p) => p.id === selfId)) {
        closeChannel()
        return set({ status: 'full', players: [] })
      }
      set({ status: 'joined', players: seated })
    })

    ch.subscribe((status) => {
      if (id !== attempt) return
      if (status === 'SUBSCRIBED') void ch.track(me)
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        closeChannel()
        set({ status: 'error', players: [] })
      }
    })
  }

  return {
    getState: () => state,
    create: (name) => open(generateRoomCode(random), name, 'create'),
    join: (code, name) => {
      const c = normalizeRoomCode(code)
      if (!isValidRoomCode(c)) return set({ status: 'notFound', code: c, players: [] })
      open(c, name, 'join')
    },
    leave: () => {
      attempt++
      closeChannel()
      set({ status: client ? 'idle' : 'offline', code: null, players: [] })
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function randomId(random: () => number): string {
  return Array.from({ length: 12 }, () => Math.floor(random() * 36).toString(36)).join('')
}
