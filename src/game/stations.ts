import type { Station, Subsystem } from '../engine/types'

/** Ship rooms that hold several stations when the bus is too small for one room each (FR-13.1). */
export type RoomGroup = 'command' | 'engineering' | 'operations'

/**
 * Station groups, in layout order. Within a group the first station stays in the group room and
 * the last one is split out first when the ship has spare rooms.
 */
export const ROOM_GROUPS: readonly { id: RoomGroup; stations: readonly Station[] }[] = [
  { id: 'command', stations: ['bridge', 'navigation', 'computer'] },
  { id: 'engineering', stations: ['power', 'engine'] },
  { id: 'operations', stations: ['comms', 'science'] },
]

/** Every station a ship can have, in layout order (bridge first). */
export const SHIP_STATIONS = [
  'bridge',
  'navigation',
  'computer',
  'power',
  'engine',
  'comms',
  'science',
] as const satisfies readonly Station[]

/** Stations of the first placeholder ship. Kept for older callers; new code uses SHIP_STATIONS. */
export const MVP_STATIONS = ['bridge', 'comms', 'power', 'science', 'navigation'] as const satisfies readonly Station[]

// TODO(i18n): move to src/i18n once it exists (Dev 2).
export const STATION_NAMES: Record<Station, string> = {
  bridge: 'Bridge',
  comms: 'Comms',
  power: 'Power',
  science: 'Science Lab',
  navigation: 'Navigation',
  engine: 'Engine Bay',
  computer: 'Computer Core',
}

// TODO(i18n): move to src/i18n once it exists (Dev 2).
export const ROOM_GROUP_NAMES: Record<RoomGroup, string> = {
  command: 'Command',
  engineering: 'Engineering',
  operations: 'Operations',
}

export const ALL_SUBSYSTEMS: readonly Subsystem[] = [
  'structure',
  'power',
  'battery',
  'computer',
  'attitude',
  'propulsion',
  'thermal',
  'comms',
]

/** Which subsystems each station represents. Science has none (it shows instrument data instead). */
export const STATION_SUBSYSTEMS: Record<Station, readonly Subsystem[]> = {
  bridge: ALL_SUBSYSTEMS, // whole mission
  comms: ['comms'],
  power: ['power', 'battery'],
  science: [],
  navigation: ['attitude', 'propulsion'],
  engine: ['propulsion'],
  computer: ['computer'],
}
