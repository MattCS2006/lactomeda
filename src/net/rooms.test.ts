import { describe, expect, it } from 'vitest'
import {
  MAX_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  createRoomClient,
  generateRoomCode,
  hasStarted,
  isValidRoomCode,
  normalizeRoomCode,
  playersFromPresence,
  seatPlayers,
  type RealtimeClient,
  type RoomPlayer,
} from './rooms'

/** In-memory stand-in for Supabase Realtime Presence: channels with the same name share one presence state. */
function fakeRealtime() {
  const rooms = new Map<string, Map<string, RoomPlayer>>()
  const channels = new Set<FakeChannel>()
  class FakeChannel {
    syncs: (() => void)[] = []
    key: string
    name: string
    constructor(name: string, opts: { config: { presence: { key: string } } }) {
      this.name = name
      this.key = opts.config.presence.key
    }
    on(_type: string, _filter: unknown, cb: () => void) {
      this.syncs.push(cb)
      return this
    }
    subscribe(cb: (status: string) => void) {
      channels.add(this)
      cb('SUBSCRIBED')
      return this
    }
    track(payload: RoomPlayer) {
      if (!rooms.has(this.name)) rooms.set(this.name, new Map())
      rooms.get(this.name)!.set(this.key, payload)
      broadcast(this.name)
      return Promise.resolve('ok')
    }
    presenceState() {
      return Object.fromEntries([...(rooms.get(this.name) ?? new Map())].map(([k, v]) => [k, [v]]))
    }
  }
  const broadcast = (name: string) => {
    for (const c of [...channels]) if (c.name === name) c.syncs.forEach((s) => s())
  }
  const client = {
    channel: (name: string, opts: { config: { presence: { key: string } } }) => new FakeChannel(name, opts),
    removeChannel: (c: FakeChannel) => {
      channels.delete(c)
      rooms.get(c.name)?.delete(c.key)
      broadcast(c.name)
      return Promise.resolve('ok')
    },
  } as unknown as RealtimeClient
  return { client, rooms }
}

const noTimers = { setTimer: () => 0, clearTimer: () => {} }

describe('room codes', () => {
  it('are 6 characters from an alphabet without look-alikes', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode()
      expect(code).toHaveLength(ROOM_CODE_LENGTH)
      expect(isValidRoomCode(code)).toBe(true)
    }
    for (const c of '01OIL') expect(ROOM_CODE_ALPHABET).not.toContain(c)
  })

  it('typed codes are normalised: lower case, spaces and dashes are fine', () => {
    expect(normalizeRoomCode(' ab3-k9q ')).toBe('AB3K9Q')
    expect(isValidRoomCode('AB3K9Q')).toBe(true)
    expect(isValidRoomCode('AB3K9')).toBe(false)
    expect(isValidRoomCode('AB3K9O')).toBe(false)
  })
})

describe('seating (max 4 players)', () => {
  const p = (id: string, joinedAt: number): RoomPlayer => ({ id, name: id, joinedAt })

  it('seats the first 4 by join time, then id; the rest are rejected', () => {
    const { seated, rejected } = seatPlayers([p('e', 5), p('b', 2), p('a', 1), p('d', 4), p('c', 2)])
    expect(seated.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(rejected.map((x) => x.id)).toEqual(['e'])
    expect(MAX_PLAYERS).toBe(4)
  })

  it('reads players from presence and ignores malformed entries', () => {
    expect(playersFromPresence({ x: [p('x', 1), { bad: true }], y: [] })).toEqual([p('x', 1)])
  })
})

describe('FR-8.1 create / join — acceptance: join in ≤ 3 clicks; a 5th player is rejected with a message', () => {
  const makePlayers = (n: number, client: RealtimeClient) => {
    let t = 0
    return Array.from({ length: n }, (_, i) =>
      createRoomClient({ client, selfId: `p${i}`, now: () => ++t, ...noTimers }),
    )
  }

  it('the host creates a room and gets a code; friends join with it and everyone sees the same list', () => {
    const { client } = fakeRealtime()
    const [host, a, b] = makePlayers(3, client)
    host!.create('Ana')
    const code = host!.getState().code!
    expect(isValidRoomCode(code)).toBe(true)
    expect(host!.getState().status).toBe('joined')
    a!.join(code.toLowerCase(), 'Beto')
    b!.join(code, 'Cami')
    for (const c of [host!, a!, b!]) {
      expect(c.getState().status).toBe('joined')
      expect(c.getState().players.map((x) => x.name)).toEqual(['Ana', 'Beto', 'Cami'])
    }
  })

  it('a 5th player is rejected with status "full"; the 4 seated players are unaffected', () => {
    const { client } = fakeRealtime()
    const players = makePlayers(5, client)
    players[0]!.create('host')
    const code = players[0]!.getState().code!
    for (const p of players.slice(1)) p.join(code, 'x')
    expect(players[4]!.getState().status).toBe('full')
    expect(players[4]!.getState().players).toEqual([])
    for (const p of players.slice(0, 4)) {
      expect(p.getState().status).toBe('joined')
      expect(p.getState().players).toHaveLength(4)
    }
  })

  it('joining a code nobody is in, or a malformed code, reports "notFound"', () => {
    const { client } = fakeRealtime()
    const [p] = makePlayers(1, client)
    p!.join('ZZZZZZ', 'x')
    expect(p!.getState().status).toBe('notFound')
    p!.join('abc', 'x')
    expect(p!.getState().status).toBe('notFound')
  })

  it('leaving frees the seat: the next player can join', () => {
    const { client } = fakeRealtime()
    const players = makePlayers(5, client)
    players[0]!.create('host')
    const code = players[0]!.getState().code!
    for (const p of players.slice(1, 4)) p.join(code, 'x')
    players[2]!.leave()
    expect(players[0]!.getState().players).toHaveLength(3)
    players[4]!.join(code, 'late')
    expect(players[4]!.getState().status).toBe('joined')
    expect(players[2]!.getState().status).toBe('idle')
  })

  it('without the multiplayer server rooms report "offline" and nothing breaks', () => {
    const offline = createRoomClient({ client: null, selfId: 'me', ...noTimers })
    expect(offline.getState().status).toBe('offline')
    offline.create('x')
    expect(offline.getState().status).toBe('offline')
  })

  it('times out with "error" if the server never answers', () => {
    let fire: (() => void) | null = null
    const silent = {
      channel: () => ({ on: () => undefined, subscribe: () => undefined, presenceState: () => ({}), track: () => {} }),
      removeChannel: () => Promise.resolve('ok'),
    } as unknown as RealtimeClient
    const c = createRoomClient({ client: silent, selfId: 'me', setTimer: (fn) => (fire = fn), clearTimer: () => {} })
    c.create('x')
    expect(c.getState().status).toBe('connecting')
    fire!()
    expect(c.getState().status).toBe('error')
  })

  it('listeners get every change and can unsubscribe', () => {
    const { client } = fakeRealtime()
    const [p] = makePlayers(1, client)
    const seen: string[] = []
    const off = p!.subscribe((s) => seen.push(s.status))
    p!.create('x')
    off()
    p!.leave()
    expect(seen).toEqual(['connecting', 'joined'])
  })

  it('FR-8.2: role picks travel with presence and the host starts the design for everyone', () => {
    const { client } = fakeRealtime()
    const [host, a] = makePlayers(2, client)
    host!.create('host')
    a!.join(host!.getState().code!, 'a')
    a!.chooseRole('director')
    expect(host!.getState().players.find((p) => p.id === 'p1')?.role).toBe('director')
    a!.start() // only the host can start
    expect(hasStarted(host!.getState().players)).toBe(false)
    host!.start()
    expect(hasStarted(a!.getState().players)).toBe(true)
    expect(hasStarted(host!.getState().players)).toBe(true)
  })
})
