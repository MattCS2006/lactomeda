// Single definition of spacecraft wet mass (FR-5.5, FR-6.1). Pure and deterministic.
// Unknown or missing ids contribute 0 and never throw.
import type { GameData, MissionDesign, Subsystem } from '../types'

/** Wet mass in kg: components (x2 if the subsystem has a backup) + instruments + propellant. */
export function wetMassKg(design: MissionDesign, data: GameData): number {
  const redundant = new Set<Subsystem>(design.redundant)
  let massKg = 0
  for (const [subsystem, id] of Object.entries(design.componentIds) as [Subsystem, string | undefined][]) {
    if (!id) continue
    const component = data.components.find((c) => c.id === id)
    if (!component) continue
    massKg += component.massKg * (redundant.has(subsystem) ? 2 : 1)
  }
  for (const id of design.instrumentIds) {
    massKg += data.instruments.find((i) => i.id === id)?.massKg ?? 0
  }
  return massKg + design.propellantKg
}
