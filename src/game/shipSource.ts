// Which design the ship interior is built from (FR-13.1). Pure: the URL query string is passed in.
// - ?ship=<busClassId>  -> full sample design on that bus (testing and demo)
// - player design with a bus class and at least one component -> that design
// - otherwise -> preview design: 3U CubeSat with power, battery, comms, computer, attitude, 1 instrument
import type { GameData, MissionDesign, Subsystem } from '../engine/types'
import { ALL_SUBSYSTEMS } from './stations'

/** Phaser registry key holding a ShipSource (set by PhaserGame, read by ShipInteriorScene). */
export const SHIP_REGISTRY_KEY = 'ship'

export type ShipCatalog = Pick<GameData, 'busClasses' | 'components' | 'instruments' | 'scenarios'>

export interface ShipSource {
  design: MissionDesign
  data: ShipCatalog
}

export const PREVIEW_BUS_ID = 'cubesat-3u'
const PREVIEW_SUBSYSTEMS: readonly Subsystem[] = ['power', 'battery', 'comms', 'computer', 'attitude']

/** First catalog component of a subsystem; for propulsion, one that actually gives delta-v. */
function pickComponent(subsystem: Subsystem, data: ShipCatalog): string | undefined {
  return data.components.find((c) => c.subsystem === subsystem && (subsystem !== 'propulsion' || (c.deltaVms ?? 0) > 0))
    ?.id
}

/** A sample design built from the catalog (no hard-coded component ids). */
export function sampleDesign(busClassId: string, subsystems: readonly Subsystem[], data: ShipCatalog): MissionDesign {
  const componentIds: MissionDesign['componentIds'] = {}
  for (const sub of subsystems) {
    const id = pickComponent(sub, data)
    if (id) componentIds[sub] = id
  }
  const instrument = data.instruments[0]?.id
  return {
    scenarioId: data.scenarios[0]?.id ?? 'preview',
    difficulty: 'cadet',
    requirementLevels: {},
    busClassId,
    componentIds,
    redundant: [],
    propellantKg: componentIds.propulsion ? 1 : 0,
    instrumentIds: instrument ? [instrument] : [],
    dutyCycle: {},
    orbitId: null,
    launcherId: null,
    groundNetworkId: null,
    seed: 'preview',
  }
}

/** Default preview ship when the player has not designed one yet. */
export function previewDesign(data: ShipCatalog): MissionDesign {
  const bus = data.busClasses.some((b) => b.id === PREVIEW_BUS_ID) ? PREVIEW_BUS_ID : (data.busClasses[0]?.id ?? PREVIEW_BUS_ID)
  return sampleDesign(bus, PREVIEW_SUBSYSTEMS, data)
}

/** Every subsystem installed on the given bus. */
export function fullSampleDesign(busClassId: string, data: ShipCatalog): MissionDesign {
  return sampleDesign(busClassId, ALL_SUBSYSTEMS, data)
}

/** True when the player's design is far enough along to build a ship from. */
export function isShipReady(design: MissionDesign | null): design is MissionDesign {
  return Boolean(design?.busClassId) && Object.values(design!.componentIds).some(Boolean)
}

export function resolveShipDesign(design: MissionDesign | null, data: ShipCatalog, search = ''): MissionDesign {
  const shipParam = new URLSearchParams(search).get('ship')
  if (shipParam && data.busClasses.some((b) => b.id === shipParam)) return fullSampleDesign(shipParam, data)
  return isShipReady(design) ? design : previewDesign(data)
}
