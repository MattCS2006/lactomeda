// Single definition of spacecraft mass (FR-5.5, FR-6.1, FR-6.3). Pure and deterministic.
// Unknown or missing ids contribute 0 and never throw.
import { MASS_CONTINGENCY } from '../constants'
import type { Difficulty, GameData, MissionDesign, Subsystem } from '../types'

export interface MassBreakdown {
  componentsKg: number // x2 for redundant subsystems
  instrumentsKg: number
  dryMassKg: number // components + instruments
  contingencyFraction: number
  contingencyKg: number // dry x fraction
  propellantKg: number
  totalMassKg: number // dry + contingency + propellant
}

export function massContingency(difficulty: Difficulty): number {
  return MASS_CONTINGENCY[difficulty]
}

/**
 * FR-6.3 mass budget. The contingency (mass growth allowance) applies to the dry mass only:
 * propellant is loaded to a known quantity, so it carries no growth allowance (standard practice).
 */
export function massBreakdown(design: MissionDesign, data: GameData): MassBreakdown {
  const redundant = new Set<Subsystem>(design.redundant)
  let componentsKg = 0
  for (const [subsystem, id] of Object.entries(design.componentIds) as [Subsystem, string | undefined][]) {
    if (!id) continue
    const component = data.components.find((c) => c.id === id)
    if (!component) continue
    componentsKg += component.massKg * (redundant.has(subsystem) ? 2 : 1)
  }
  let instrumentsKg = 0
  for (const id of design.instrumentIds) {
    instrumentsKg += data.instruments.find((i) => i.id === id)?.massKg ?? 0
  }
  const dryMassKg = componentsKg + instrumentsKg
  const contingencyFraction = massContingency(design.difficulty)
  const contingencyKg = dryMassKg * contingencyFraction
  return {
    componentsKg,
    instrumentsKg,
    dryMassKg,
    contingencyFraction,
    contingencyKg,
    propellantKg: design.propellantKg,
    totalMassKg: dryMassKg + contingencyKg + design.propellantKg,
  }
}

/** Total spacecraft mass in kg (dry + contingency + propellant): the one number every mass check uses. */
export function wetMassKg(design: MissionDesign, data: GameData): number {
  return massBreakdown(design, data).totalMassKg
}
