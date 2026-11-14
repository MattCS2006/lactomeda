// Which exterior sprite each catalog id uses and where it mounts on the bus (SCRUM-92, FR-9.1).
// Sprite sizes come from the generator (exteriorSprites.generated.ts). Unknown ids fall back to a
// generic box, never an error. Ids with no outside presence (battery, computer...) are simply absent.
import type { Subsystem } from '../engine/types'
import { EXTERIOR_SPRITES } from './exteriorSprites.generated'

export type ExteriorKey = keyof typeof EXTERIOR_SPRITES

/**
 * Where a part attaches (side view):
 * - top: stands on the roof (antennas, star tracker)   - bottom: hangs under the bus (thrusters, radar)
 * - wing: a mirrored pair, one per side, at mid height - left: single part on the left (RTG)
 * - front: on the bus face, flows in rows            - body: body-mounted solar cells, low on the face
 */
export type Mount = 'top' | 'bottom' | 'wing' | 'left' | 'front' | 'body'

export interface PartDef {
  key: ExteriorKey
  mount: Mount
}

/** Sprites drawn on screen per unit: a wing mount is a left + right pair. */
export function copiesPerUnit(mount: Mount): number {
  return mount === 'wing' ? 2 : 1
}

export const GENERIC_PART: PartDef = { key: 'ext_generic_part', mount: 'front' }

/** Subsystems that show on the outside of the ship. Anything else is internal. */
export const EXTERIOR_SUBSYSTEMS = ['power', 'comms', 'attitude', 'propulsion'] as const satisfies readonly Subsystem[]
export type ExteriorSubsystem = (typeof EXTERIOR_SUBSYSTEMS)[number]

/** Fallback when a subsystem's component id is not in the table below. */
export const SUBSYSTEM_FALLBACK: Record<ExteriorSubsystem, PartDef> = {
  power: { key: 'ext_generic_part', mount: 'body' },
  comms: { key: 'ext_generic_part', mount: 'top' },
  attitude: { key: 'ext_generic_part', mount: 'top' },
  propulsion: { key: 'ext_generic_part', mount: 'bottom' },
}

/** component id -> sprite. `null` = real component with nothing to draw (e.g. no propulsion). */
export const COMPONENT_PARTS: Record<string, PartDef | null> = {
  'pwr-body': { key: 'ext_solar_body', mount: 'body' },
  'pwr-deploy': { key: 'ext_solar_wing_deploy', mount: 'wing' },
  'pwr-array-small': { key: 'ext_solar_wing_small', mount: 'wing' },
  'pwr-array-large': { key: 'ext_solar_wing_large', mount: 'wing' },
  'pwr-rtg': { key: 'ext_rtg', mount: 'left' },

  'com-uhf': { key: 'ext_ant_uhf', mount: 'top' },
  'com-sband': { key: 'ext_ant_sband', mount: 'top' },
  'com-xband': { key: 'ext_ant_xband', mount: 'top' },
  'com-hga': { key: 'ext_ant_hga', mount: 'top' },
  'com-optical': { key: 'ext_ant_optical', mount: 'top' },

  'adcs-mag': { key: 'ext_sun_sensor', mount: 'top' },
  'adcs-cubesat': { key: 'ext_star_tracker', mount: 'top' },
  'adcs-smallsat': { key: 'ext_star_tracker', mount: 'top' },
  'adcs-cmg': { key: 'ext_star_tracker', mount: 'top' },
  'adcs-fine': { key: 'ext_star_tracker', mount: 'top' },

  'prop-none': null,
  'prop-coldgas': { key: 'ext_thruster_cold', mount: 'bottom' },
  'prop-mono': { key: 'ext_thruster_bell', mount: 'bottom' },
  'prop-biprop': { key: 'ext_thruster_bell', mount: 'bottom' },
  'prop-hall': { key: 'ext_thruster_hall', mount: 'bottom' },
}

/** instrument id -> sprite. */
export const INSTRUMENT_PARTS: Record<string, PartDef> = {
  'inst-visible-cam': { key: 'ext_inst_camera', mount: 'front' },
  'inst-multispectral': { key: 'ext_inst_multispectral', mount: 'front' },
  'inst-thermal-ir': { key: 'ext_inst_thermal', mount: 'front' },
  'inst-sar': { key: 'ext_inst_sar', mount: 'bottom' },
  'inst-spectrometer': { key: 'ext_inst_spectrometer', mount: 'front' },
  'inst-magnetometer': { key: 'ext_inst_magnetometer', mount: 'top' },
  'inst-magnetometer-cubesat': { key: 'ext_inst_magnetometer', mount: 'top' },
  'inst-telescope': { key: 'ext_inst_telescope', mount: 'bottom' },
  'inst-laser-alt': { key: 'ext_inst_laser', mount: 'bottom' },
  'inst-particle': { key: 'ext_inst_particle', mount: 'front' },
  'inst-radiometer': { key: 'ext_inst_radiometer', mount: 'front' },
}

/** Bus body sprite per bus class id. */
export const BUS_BODIES: Record<string, ExteriorKey> = {
  'cubesat-1u': 'ext_bus_cubesat-1u',
  'cubesat-2u': 'ext_bus_cubesat-2u',
  'cubesat-3u': 'ext_bus_cubesat-3u',
  'cubesat-6u': 'ext_bus_cubesat-6u',
  'cubesat-12u': 'ext_bus_cubesat-12u',
  smallsat: 'ext_bus_smallsat',
  medium: 'ext_bus_medium',
  large: 'ext_bus_large',
}
export const GENERIC_BODY: ExteriorKey = 'ext_bus_generic'

export function spriteSize(key: ExteriorKey): { w: number; h: number } {
  return EXTERIOR_SPRITES[key]
}

/** Sprite for a component, or undefined when the subsystem has no exterior (battery, computer...). */
export function componentPart(subsystem: Subsystem, id: string): PartDef | undefined {
  if (!(EXTERIOR_SUBSYSTEMS as readonly string[]).includes(subsystem)) return undefined
  const known = Object.hasOwn(COMPONENT_PARTS, id) ? COMPONENT_PARTS[id] : undefined
  if (known === null) return undefined
  return known ?? SUBSYSTEM_FALLBACK[subsystem as ExteriorSubsystem]
}

export function instrumentPart(id: string): PartDef {
  return Object.hasOwn(INSTRUMENT_PARTS, id) ? INSTRUMENT_PARTS[id] : GENERIC_PART
}
