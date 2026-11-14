// FR-13.1 — the ship interior is generated from the player's design: one station per installed
// subsystem, stations grouped into rooms, ship size from the bus class.
// PURE and deterministic: no Phaser, no randomness. Same design -> identical layout.
import type { BusClass, GameData, MissionDesign, Station } from '../engine/types'
import { ROOM_GROUPS, ROOM_GROUP_NAMES, STATION_NAMES, type RoomGroup } from './stations'
import { COLLIDING_TILES, TILES } from './tiles'

/** The slice of the catalog the layout needs. */
export type ShipData = Pick<GameData, 'busClasses' | 'components'>

export type RoomId = Station | RoomGroup

export interface ShipRoom {
  id: RoomId
  name: string
  /** Walkable floor rectangle in tiles (walls are outside it). */
  x: number
  y: number
  w: number
  h: number
  stations: Station[]
}

export interface ShipConsole {
  station: Station
  /** Top-left tile of the console footprint (CONSOLE_TILES x CONSOLE_TILES floor tiles). */
  tileX: number
  tileY: number
}

export interface ShipLayout {
  widthTiles: number
  heightTiles: number
  /** tiles[y][x] = tile index in the tileset (see tiles.ts). */
  tiles: number[][]
  /** collides[y][x] = wall or void. Consoles are not included: they are separate physics bodies. */
  collides: boolean[][]
  /** rooms[0] is the bridge room, where the player spawns. */
  rooms: ShipRoom[]
  consoles: ShipConsole[]
  spawn: { tileX: number; tileY: number }
}

/** Consoles are 32 px sprites drawn at 2x, so each covers 2 x 2 tiles. */
export const CONSOLE_TILES = 2
/** Free tiles between two consoles. */
const CONSOLE_GAP = 1
/** Used when the design has no (known) bus class. */
export const FALLBACK_ROOM_COUNT = 3
/** Buses up to this volume (all CubeSats) get cramped rooms. */
const CRAMPED_MAX_VOLUME_L = 50
const ROOM_SIZE = {
  cramped: { w: 7, h: 6 },
  roomy: { w: 9, h: 7 },
} as const
/** Single row of rooms up to this many; beyond that, two rows. */
const MAX_ROOMS_PER_ROW = 4
/** Doorways and corridors are this many tiles wide. */
const DOOR_TILES = 2
/** Void columns/rows between neighbouring rooms' walls. */
const GAP = 1
/** Rows above the floor: void wall top + two wall-face rows. Plus one wall row below the floor. */
const WALL_ABOVE = 3
const WALL_BELOW = 1
/** The map is never smaller than the camera view (640x360 px = 20 x 11.25 tiles). */
const MIN_WIDTH_TILES = 20
const MIN_HEIGHT_TILES = 12

// ─── Stations ───────────────────────────────────────────────────────────

/** Which stations the ship gets, in layout order (bridge first). */
export function stationsForDesign(design: MissionDesign, data: Pick<GameData, 'components'>): Station[] {
  const c = design.componentIds
  const present: Record<Station, boolean> = {
    bridge: true,
    power: Boolean(c.power || c.battery),
    comms: Boolean(c.comms),
    science: design.instrumentIds.length > 0,
    navigation: Boolean(c.attitude),
    engine: hasPropulsion(c.propulsion, data),
    computer: Boolean(c.computer),
  }
  return ROOM_GROUPS.flatMap((g) => g.stations.filter((s) => present[s]))
}

/** The catalog has a "No propulsion" component (0 m/s delta-v): that must not build an engine bay. */
function hasPropulsion(id: string | undefined, data: Pick<GameData, 'components'>): boolean {
  if (!id) return false
  const comp = data.components.find((x) => x.id === id)
  return comp?.deltaVms !== 0
}

// ─── Grouping ───────────────────────────────────────────────────────────

/**
 * Splits stations into at most `roomCount` rooms. Starts from the three groups (command,
 * engineering, operations); while rooms are left over, the biggest room (first in layout order
 * on ties) hands its last station a room of its own.
 */
export function groupStations(stations: readonly Station[], roomCount: number): Station[][] {
  const present = new Set(stations)
  const units = ROOM_GROUPS.map((g) => g.stations.filter((s) => present.has(s))).filter((u) => u.length > 0)
  const rooms = Math.max(1, Math.floor(roomCount))

  // Only reachable with odd catalog data (fewer than 3 rooms): merge from the back.
  while (units.length > rooms) {
    const last = units.pop()!
    units[units.length - 1]!.push(...last)
  }

  while (units.length < rooms) {
    let pick = -1
    units.forEach((u, i) => {
      if (u.length > 1 && (pick < 0 || u.length > units[pick]!.length)) pick = i
    })
    if (pick < 0) break
    const split = units[pick]!.pop()!
    units.splice(pick + 1, 0, [split])
  }
  return units
}

function roomIdentity(stations: readonly Station[]): { id: RoomId; name: string } {
  const first = stations[0]!
  if (stations.length === 1) return { id: first, name: STATION_NAMES[first] }
  const group = ROOM_GROUPS.find((g) => g.stations.includes(first))!
  return { id: group.id, name: ROOM_GROUP_NAMES[group.id] }
}

// ─── Layout ─────────────────────────────────────────────────────────────

function findBus(design: MissionDesign, data: ShipData): BusClass | undefined {
  return design.busClassId ? data.busClasses.find((b) => b.id === design.busClassId) : undefined
}

/** Width the console row needs: k consoles with gaps, plus room for a top doorway and its margin. */
function consoleRowWidth(k: number, topDoor: boolean): number {
  return k * CONSOLE_TILES + (k - 1) * CONSOLE_GAP + (topDoor ? DOOR_TILES + CONSOLE_GAP : 0)
}

export function generateShipLayout(design: MissionDesign, data: ShipData): ShipLayout {
  const bus = findBus(design, data)
  const roomCount = bus?.roomCount ?? FALLBACK_ROOM_COUNT
  const units = groupStations(stationsForDesign(design, data), roomCount)
  const n = units.length

  const cols = n <= MAX_ROOMS_PER_ROW ? n : Math.ceil(n / 2)
  const rowCount = Math.ceil(n / cols)
  // Rooms in the second row are entered through their top wall, right above room (row 0, same column).
  const hasTopDoor = (i: number) => i >= cols

  const base = !bus || bus.volumeL <= CRAMPED_MAX_VOLUME_L ? ROOM_SIZE.cramped : ROOM_SIZE.roomy
  const w = Math.max(base.w, ...units.map((u, i) => consoleRowWidth(u.length, hasTopDoor(i))))
  const h = base.h

  // Every room uses the same cell so the grid lines up: walls on each side, wall rows above/below.
  const cellW = w + 2
  const cellH = h + WALL_ABOVE + WALL_BELOW
  const contentW = cols * cellW + (cols - 1) * GAP
  const contentH = rowCount * cellH + (rowCount - 1) * GAP
  const widthTiles = Math.max(contentW, MIN_WIDTH_TILES)
  const heightTiles = Math.max(contentH, MIN_HEIGHT_TILES)
  const offX = Math.floor((widthTiles - contentW) / 2)
  const offY = Math.floor((heightTiles - contentH) / 2)

  const tiles: number[][] = Array.from({ length: heightTiles }, () => Array<number>(widthTiles).fill(TILES.VOID))
  const set = (x: number, y: number, t: number) => {
    tiles[y]![x] = t
  }

  // Rooms: floor + two wall-face rows on top (side and bottom walls stay void).
  const rooms: ShipRoom[] = units.map((stations, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = offX + col * (cellW + GAP) + 1
    const y = offY + row * (cellH + GAP) + WALL_ABOVE
    for (let dx = 0; dx < w; dx++) {
      set(x + dx, y - 2, (dx + i) % 3 === 2 ? TILES.WALL_TOP_B : TILES.WALL_TOP_A)
      const decor = (dx + 2 * i) % 5
      set(x + dx, y - 1, decor === 1 ? TILES.WALL_FACE_PIPES : decor === 3 ? TILES.WALL_FACE_SCREENS : TILES.WALL_FACE)
      for (let dy = 0; dy < h; dy++) set(x + dx, y + dy, TILES.FLOOR)
    }
    return { ...roomIdentity(stations), x, y, w, h, stations: [...stations] }
  })

  // Side doorways between neighbours in a row, below the console rows.
  const doorRow = Math.max(CONSOLE_TILES, Math.ceil((h - DOOR_TILES) / 2))
  rooms.forEach((room, i) => {
    const right = rooms[i + 1]
    if (!right || (i + 1) % cols === 0) return
    for (let x = room.x + room.w; x < right.x; x++) {
      for (let d = 0; d < DOOR_TILES; d++) set(x, room.y + doorRow + d, TILES.DOORWAY)
    }
  })

  // Doorways between the two rows, through the lower room's top wall (its rightmost columns).
  rooms.forEach((room, i) => {
    if (!hasTopDoor(i)) return
    const above = rooms[i - cols]!
    for (let y = above.y + above.h; y < room.y; y++) {
      for (let d = 1; d <= DOOR_TILES; d++) set(room.x + room.w - d, y, TILES.DOORWAY)
    }
  })

  // Consoles: centred against the top wall, clear of the top doorway.
  const consoles: ShipConsole[] = rooms.flatMap((room, i) => {
    const k = room.stations.length
    const usable = room.w - (hasTopDoor(i) ? DOOR_TILES + CONSOLE_GAP : 0)
    const span = consoleRowWidth(k, false)
    const start = room.x + Math.floor((usable - span) / 2)
    return room.stations.map((station, j) => ({
      station,
      tileX: start + j * (CONSOLE_TILES + CONSOLE_GAP),
      tileY: room.y,
    }))
  })

  const bridgeRoom = rooms[0]!
  const spawn = { tileX: bridgeRoom.x + Math.floor(bridgeRoom.w / 2), tileY: bridgeRoom.y + bridgeRoom.h - 2 }

  const collides = tiles.map((row) => row.map((t) => COLLIDING_TILES.has(t)))
  return { widthTiles, heightTiles, tiles, collides, rooms, consoles, spawn }
}
