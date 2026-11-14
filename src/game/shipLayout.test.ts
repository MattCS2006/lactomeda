import { describe, expect, it } from 'vitest'
import { gameData } from '../data'
import type { MissionDesign, Station } from '../engine/types'
import {
  CONSOLE_TILES,
  generateShipLayout,
  groupStations,
  stationsForDesign,
  type ShipConsole,
  type ShipLayout,
} from './shipLayout'
import { fullSampleDesign, previewDesign } from './shipSource'
import { TILES } from './tiles'

const data = gameData

function design(over: Partial<MissionDesign> = {}): MissionDesign {
  return {
    scenarioId: 'student-cubesat',
    difficulty: 'cadet',
    requirementLevels: {},
    busClassId: 'cubesat-3u',
    componentIds: {},
    redundant: [],
    propellantKg: 0,
    instrumentIds: [],
    dutyCycle: {},
    orbitId: null,
    launcherId: null,
    groundNetworkId: null,
    seed: 'test',
    ...over,
  }
}

const ALL_COMPONENTS: MissionDesign['componentIds'] = {
  structure: 'str-3u',
  power: 'pwr-body',
  battery: 'bat-40',
  computer: 'obc-cubesat',
  attitude: 'adcs-cubesat',
  propulsion: 'prop-coldgas',
  thermal: 'thm-passive',
  comms: 'com-uhf',
}
const FULL = { componentIds: ALL_COMPONENTS, instrumentIds: ['inst-visible-cam'] }

const footprint = (c: ShipConsole) =>
  Array.from({ length: CONSOLE_TILES * CONSOLE_TILES }, (_, i) => ({
    x: c.tileX + (i % CONSOLE_TILES),
    y: c.tileY + Math.floor(i / CONSOLE_TILES),
  }))

/** BFS from spawn over tiles that are neither walls nor console footprints. */
function reachable(layout: ShipLayout): boolean[][] {
  const blocked = layout.collides.map((row) => [...row])
  for (const c of layout.consoles) for (const t of footprint(c)) blocked[t.y]![t.x] = true
  const seen = layout.tiles.map((row) => row.map(() => false))
  const queue = [{ x: layout.spawn.tileX, y: layout.spawn.tileY }]
  seen[queue[0]!.y]![queue[0]!.x] = true
  while (queue.length) {
    const { x, y } = queue.shift()!
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (ny < 0 || nx < 0 || ny >= layout.heightTiles || nx >= layout.widthTiles) continue
      if (seen[ny]![nx] || blocked[ny]![nx]) continue
      seen[ny]![nx] = true
      queue.push({ x: nx, y: ny })
    }
  }
  return seen
}

const roomOf = (layout: ShipLayout, station: Station) => layout.rooms.find((r) => r.stations.includes(station))!

/** Designs that every structural check runs against. */
const CASES: [string, MissionDesign][] = [
  ['empty 1U', design({ busClassId: 'cubesat-1u' })],
  ['preview 3U', previewDesign(data)],
  ['full 3U', design(FULL)],
  ['full 6U', design({ ...FULL, busClassId: 'cubesat-6u' })],
  ['full smallsat', design({ ...FULL, busClassId: 'smallsat' })],
  ['full medium', design({ ...FULL, busClassId: 'medium' })],
  ['full large', design({ ...FULL, busClassId: 'large' })],
  ['no bus', design({ ...FULL, busClassId: null })],
  ['unknown bus', design({ ...FULL, busClassId: 'nope' })],
  ...data.busClasses.map((b): [string, MissionDesign] => [`sample ${b.id}`, fullSampleDesign(b.id, data)]),
]

describe('stationsForDesign', () => {
  it('bridge only for an empty design', () => {
    expect(stationsForDesign(design(), data)).toEqual(['bridge'])
  })

  it('maps subsystems to stations', () => {
    expect(stationsForDesign(design({ componentIds: { battery: 'bat-40' } }), data)).toEqual(['bridge', 'power'])
    expect(stationsForDesign(design({ componentIds: { power: 'pwr-body' } }), data)).toContain('power')
    expect(stationsForDesign(design({ componentIds: { comms: 'com-uhf' } }), data)).toContain('comms')
    expect(stationsForDesign(design({ instrumentIds: ['inst-sar'] }), data)).toContain('science')
    expect(stationsForDesign(design({ componentIds: { attitude: 'adcs-mag' } }), data)).toContain('navigation')
    expect(stationsForDesign(design({ componentIds: { propulsion: 'prop-mono' } }), data)).toContain('engine')
    expect(stationsForDesign(design({ componentIds: { computer: 'obc-edge' } }), data)).toContain('computer')
    // structure and thermal have no station
    expect(stationsForDesign(design({ componentIds: { structure: 'str-3u', thermal: 'thm-passive' } }), data)).toEqual([
      'bridge',
    ])
  })

  it('all seven stations for a full design', () => {
    expect(new Set(stationsForDesign(design(FULL), data))).toEqual(
      new Set(['bridge', 'power', 'comms', 'science', 'navigation', 'engine', 'computer']),
    )
  })

  it('no propulsion (or the "No propulsion" component) -> no engine station', () => {
    const { propulsion: _, ...noProp } = ALL_COMPONENTS
    expect(stationsForDesign(design({ componentIds: noProp }), data)).not.toContain('engine')
    expect(stationsForDesign(design({ componentIds: { propulsion: 'prop-none' } }), data)).not.toContain('engine')
  })
})

describe('groupStations', () => {
  const all: Station[] = ['bridge', 'navigation', 'computer', 'power', 'engine', 'comms', 'science']
  it('3 rooms -> command, engineering, operations', () => {
    expect(groupStations(all, 3)).toEqual([
      ['bridge', 'navigation', 'computer'],
      ['power', 'engine'],
      ['comms', 'science'],
    ])
  })
  it('splits the biggest group first as rooms are added', () => {
    expect(groupStations(all, 4)).toEqual([['bridge', 'navigation'], ['computer'], ['power', 'engine'], ['comms', 'science']])
    expect(groupStations(all, 7)).toEqual(all.map((s) => [s]))
  })
  it('never makes empty rooms', () => {
    expect(groupStations(['bridge'], 7)).toEqual([['bridge']])
  })
})

describe('generateShipLayout', () => {
  it('is deterministic', () => {
    for (const [, d] of CASES) {
      expect(generateShipLayout(d, data)).toEqual(generateShipLayout(structuredClone(d), data))
    }
  })

  it('does not mutate the design', () => {
    const d = design(FULL)
    const copy = structuredClone(d)
    generateShipLayout(d, data)
    expect(d).toEqual(copy)
  })

  it('3U CubeSat with every subsystem fits all its stations in 3 rooms', () => {
    const layout = generateShipLayout(design(FULL), data)
    expect(layout.rooms).toHaveLength(3)
    expect(layout.rooms.map((r) => r.name)).toEqual(['Command', 'Engineering', 'Operations'])
    expect(layout.rooms.flatMap((r) => r.stations)).toHaveLength(7)
    expect(layout.consoles).toHaveLength(7)
  })

  it('Large ship with every subsystem has 7 rooms, one station each', () => {
    const layout = generateShipLayout(design({ ...FULL, busClassId: 'large' }), data)
    expect(layout.rooms).toHaveLength(7)
    for (const room of layout.rooms) expect(room.stations).toHaveLength(1)
  })

  it('CubeSat rooms are smaller than big-ship rooms', () => {
    const cube = generateShipLayout(design({ ...FULL, busClassId: 'cubesat-6u' }), data)
    const big = generateShipLayout(design({ ...FULL, busClassId: 'smallsat' }), data)
    expect(cube.rooms[0]!.w * cube.rooms[0]!.h).toBeLessThan(big.rooms[0]!.w * big.rooms[0]!.h)
  })

  it('unknown or missing bus class falls back to 3 rooms', () => {
    expect(generateShipLayout(design({ ...FULL, busClassId: null }), data).rooms).toHaveLength(3)
    expect(generateShipLayout(design({ ...FULL, busClassId: 'nope' }), data).rooms).toHaveLength(3)
  })

  it('no propulsion -> no engine console', () => {
    const { propulsion: _, ...noProp } = ALL_COMPONENTS
    const layout = generateShipLayout(design({ busClassId: 'large', componentIds: noProp }), data)
    expect(layout.consoles.map((c) => c.station)).not.toContain('engine')
  })

  it('empty design (only a bus) -> bridge only', () => {
    const layout = generateShipLayout(design({ busClassId: 'large' }), data)
    expect(layout.rooms).toHaveLength(1)
    expect(layout.rooms[0]!.id).toBe('bridge')
    expect(layout.consoles.map((c) => c.station)).toEqual(['bridge'])
  })

  it('bridge room is first and the player spawns in it', () => {
    for (const [, d] of CASES) {
      const layout = generateShipLayout(d, data)
      const room = layout.rooms[0]!
      expect(room.stations).toContain('bridge')
      const { tileX, tileY } = layout.spawn
      expect(tileX >= room.x && tileX < room.x + room.w && tileY >= room.y && tileY < room.y + room.h).toBe(true)
    }
  })

  it.each(CASES)('%s: grid sizes match and the map fills the camera', (_, d) => {
    const layout = generateShipLayout(d, data)
    expect(layout.widthTiles).toBeGreaterThanOrEqual(20)
    expect(layout.heightTiles).toBeGreaterThanOrEqual(12)
    for (const grid of [layout.tiles, layout.collides]) {
      expect(grid).toHaveLength(layout.heightTiles)
      for (const row of grid) expect(row).toHaveLength(layout.widthTiles)
    }
  })

  it.each(CASES)('%s: spawn is not on a colliding tile or console', (_, d) => {
    const layout = generateShipLayout(d, data)
    const { tileX, tileY } = layout.spawn
    expect(layout.collides[tileY]![tileX]).toBe(false)
    for (const c of layout.consoles) {
      expect(footprint(c).some((t) => t.x === tileX && t.y === tileY)).toBe(false)
    }
  })

  it.each(CASES)('%s: one console per station, on floor inside its room, against the top wall', (_, d) => {
    const layout = generateShipLayout(d, data)
    expect(layout.consoles.map((c) => c.station).sort()).toEqual(stationsForDesign(d, data).sort())
    for (const c of layout.consoles) {
      const room = roomOf(layout, c.station)
      for (const t of footprint(c)) {
        // FLOOR (not DOORWAY): a console never stands in a doorway
        expect(layout.tiles[t.y]![t.x]).toBe(TILES.FLOOR)
        expect(layout.collides[t.y]![t.x]).toBe(false)
        expect(t.x >= room.x && t.x < room.x + room.w && t.y >= room.y && t.y < room.y + room.h).toBe(true)
      }
      expect(c.tileY).toBe(room.y)
      for (let dx = 0; dx < CONSOLE_TILES; dx++) expect(layout.collides[c.tileY - 1]![c.tileX + dx]).toBe(true)
    }
  })

  it.each(CASES)('%s: consoles are at least 1 tile apart', (_, d) => {
    const { consoles } = generateShipLayout(d, data)
    for (const a of consoles) {
      for (const b of consoles) {
        if (a === b) continue
        const gapX = Math.max(a.tileX, b.tileX) - Math.min(a.tileX, b.tileX) - CONSOLE_TILES
        const gapY = Math.max(a.tileY, b.tileY) - Math.min(a.tileY, b.tileY) - CONSOLE_TILES
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it.each(CASES)('%s: every floor tile and every console is reachable from spawn', (_, d) => {
    const layout = generateShipLayout(d, data)
    const seen = reachable(layout)
    const under = new Set(layout.consoles.flatMap((c) => footprint(c).map((t) => `${t.x},${t.y}`)))
    for (let y = 0; y < layout.heightTiles; y++) {
      for (let x = 0; x < layout.widthTiles; x++) {
        if (layout.collides[y]![x] || under.has(`${x},${y}`)) continue
        expect(seen[y]![x], `tile ${x},${y} unreachable`).toBe(true)
      }
    }
    // A console is usable when a free tile touches its footprint
    for (const c of layout.consoles) {
      const touching = footprint(c).some((t) =>
        [
          [t.x + 1, t.y],
          [t.x - 1, t.y],
          [t.x, t.y + 1],
          [t.x, t.y - 1],
        ].some(([x, y]) => seen[y!]?.[x!] === true),
      )
      expect(touching, `${c.station} console unreachable`).toBe(true)
    }
  })
})
