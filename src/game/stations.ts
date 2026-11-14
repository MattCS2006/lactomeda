import type { Station, Subsystem } from '../engine/types'

/** Stations built for the MVP ship (engine and computer arrive later, FR-13.1). */
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
