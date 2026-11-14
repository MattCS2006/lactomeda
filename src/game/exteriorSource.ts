// Which design the exterior preview draws (SCRUM-92). Pure: the URL query string is passed in.
// - ?exterior=<busClassId> -> full sample on that bus: every subsystem, instruments up to the bus slots,
//   backup comms (testing and demo)
// - player design (any bus state, even none yet) -> that design, so every pick shows up instantly
// - no design at all -> the sample 3U CubeSat the interior preview uses
import type { MissionDesign } from '../engine/types'
import { fullSampleDesign, previewDesign, type ShipCatalog } from './shipSource'

/** Phaser registry key holding an ExteriorSource (set by ShipPreview, read by ShipBuildScene). */
export const EXTERIOR_REGISTRY_KEY = 'exterior'

export interface ExteriorSource {
  design: MissionDesign
  data: ShipCatalog
}

export function exteriorSampleDesign(busClassId: string, data: ShipCatalog): MissionDesign {
  const base = fullSampleDesign(busClassId, data)
  const slots = data.busClasses.find((b) => b.id === busClassId)?.instrumentSlots ?? 1
  return {
    ...base,
    instrumentIds: data.instruments.slice(0, Math.max(1, slots)).map((i) => i.id),
    redundant: base.componentIds.comms ? ['comms'] : [],
  }
}

export function resolveExteriorDesign(design: MissionDesign | null, data: ShipCatalog, search = ''): MissionDesign {
  const param = new URLSearchParams(search).get('exterior')
  if (param && data.busClasses.some((b) => b.id === param)) return exteriorSampleDesign(param, data)
  return design ?? previewDesign(data)
}
