// Student mode (Cadet): the "background" subsystems are chosen for the player so they can focus on
// power, battery, propulsion and comms. Pure, unit-tested; the store calls it when the bus changes.
import { partFits } from '../../data'
import { isComponentAvailable } from '../../engine/rules/components'
import type { Component, Difficulty, GameData, MissionDesign, Subsystem } from '../../engine/types'

/** Subsystems auto-picked on Cadet (their cards sit in a collapsed "Advanced parts" section). */
export const AUTO_SUBSYSTEMS: readonly Subsystem[] = ['structure', 'thermal', 'computer', 'attitude']

/** Does this part fit the bus class? (partFits.json; a part that is not listed fits every bus.) */
export function fitsBus(component: Component, busClassId: string, fits: Readonly<Record<string, readonly string[]>> = partFits): boolean {
  const buses = fits[component.id]
  return buses === undefined || buses.includes(busClassId)
}

/**
 * The cheapest part at this difficulty that fits the bus (ties: lighter, then id). When the shown catalog has no
 * fitting part (the curated 3-per-subsystem list can leave a gap), the cheapest available part is used instead,
 * so a bus never ends up without a part (the most capable one, i.e. the costliest, since gaps only show up on big buses). undefined only if the difficulty offers no part at all.
 */
export function autoPart(
  subsystem: Subsystem,
  busClassId: string,
  difficulty: Difficulty,
  data: GameData,
  fits: Readonly<Record<string, readonly string[]>> = partFits,
): Component | undefined {
  const cheapest = (a: Component, b: Component) => a.costM - b.costM || a.massKg - b.massKg || a.id.localeCompare(b.id)
  const available = data.components.filter((c) => c.subsystem === subsystem && isComponentAvailable(c, difficulty))
  return available.filter((c) => fitsBus(c, busClassId, fits)).sort(cheapest)[0] ?? available.sort((a, b) => cheapest(b, a))[0]
}

/**
 * A NEW design with the auto subsystems picked for its bus. `onlyMissing` keeps parts already chosen
 * (used when switching to Cadet, so nothing the player picked is thrown away). No bus: unchanged.
 */
export function withAutoParts(design: MissionDesign, data: GameData, onlyMissing = false): MissionDesign {
  const bus = design.busClassId
  if (bus === null) return design
  const componentIds = { ...design.componentIds }
  for (const subsystem of AUTO_SUBSYSTEMS) {
    if (onlyMissing && componentIds[subsystem] !== undefined) continue
    const part = autoPart(subsystem, bus, design.difficulty, data)
    if (part) componentIds[subsystem] = part.id
  }
  return { ...design, componentIds }
}
