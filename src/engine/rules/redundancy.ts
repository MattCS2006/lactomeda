// FR-3.5 redundancy: a backup unit per subsystem. It adds mass, cost, power load and a bus slot (mass.ts, cost.ts,
// power.ts and busClass.ts already count it twice), and it is a spare the ship can switch to when the main unit fails
// (see sim.ts). Pure and deterministic: nothing is mutated. `message` text is an English fallback.
import { NON_REDUNDANT_SUBSYSTEMS, RADIATION_FACTOR } from '../constants'
import type { Component, EventOption, GameData, MissionDesign, MissionEvent, SimState, Subsystem, ValidationIssue } from '../types'
import { canAddRedundancy } from './busClass'
import { SUBSYSTEMS, selectedComponent } from './components'

export type RedundancyBlock = 'NO_COMPONENT' | 'NOT_ALLOWED' | 'NO_SLOT'

/** Can this subsystem get a backup unit? A subsystem that already has one can always be toggled back off. */
export function canMakeRedundant(
  design: MissionDesign,
  subsystem: Subsystem,
  data: GameData,
): { allowed: boolean; reason?: RedundancyBlock } {
  if (NON_REDUNDANT_SUBSYSTEMS.includes(subsystem)) return { allowed: false, reason: 'NOT_ALLOWED' }
  if (!selectedComponent(design, subsystem, data)) return { allowed: false, reason: 'NO_COMPONENT' }
  if (design.redundant.includes(subsystem)) return { allowed: true }
  return canAddRedundancy(design, data) ? { allowed: true } : { allowed: false, reason: 'NO_SLOT' }
}

/** Returns a NEW design with the backup added or removed. Throws if adding is not allowed. */
export function toggleRedundancy(design: MissionDesign, subsystem: Subsystem, data: GameData): MissionDesign {
  if (design.redundant.includes(subsystem)) {
    return { ...design, redundant: design.redundant.filter((s) => s !== subsystem) }
  }
  const check = canMakeRedundant(design, subsystem, data)
  if (!check.allowed) throw new Error(`Cannot add a backup for "${subsystem}": ${check.reason}`)
  return { ...design, redundant: [...design.redundant, subsystem] }
}

/**
 * Tags the design has: tags of the installed components, plus `redundant:<subsystem>` for each subsystem with a
 * backup. With a simulation state, a backup already in use no longer counts.
 */
export function designTags(design: MissionDesign, data: GameData, state?: Pick<SimState, 'backupsUsed'>): string[] {
  const tags = new Set<string>()
  for (const subsystem of SUBSYSTEMS) {
    for (const tag of selectedComponent(design, subsystem, data)?.tags ?? []) tags.add(tag)
  }
  const used = new Set<Subsystem>(state?.backupsUsed ?? [])
  for (const subsystem of design.redundant) if (!used.has(subsystem)) tags.add(`redundant:${subsystem}`)
  return [...tags]
}

/** The options of an event the design can actually take: an option with `requiresTag` needs that tag. */
export function availableOptions(
  event: MissionEvent,
  design: MissionDesign,
  data: GameData,
  state?: Pick<SimState, 'backupsUsed'>,
): EventOption[] {
  const tags = new Set(designTags(design, data, state))
  return event.options.filter((o) => o.requiresTag === undefined || tags.has(o.requiresTag))
}

/**
 * Chance that one unit of this component fails on a given day: 1 - exp(-lambda), lambda = -ln(r_eff) / durationDays.
 * r_eff = r ^ radiation factor, except for radHard parts (the same rule as the time budget). Constant over the mission.
 */
export function dailyFailureProbability(component: Component, design: MissionDesign, data: GameData): number {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const durationDays = scenario?.durationDays ?? 0
  if (durationDays <= 0) return 0
  const orbit = data.orbits.find((o) => o.id === design.orbitId)
  const factor = (component.tags ?? []).includes('radHard') || !orbit ? 1 : RADIATION_FACTOR[orbit.radiation]
  const r = component.reliability ** factor
  if (r >= 1) return 0
  if (r <= 0) return 1
  return 1 - Math.exp(Math.log(r) / durationDays)
}

export function validateRedundancy(design: MissionDesign, data: GameData): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const subsystem of design.redundant) {
    const reason = NON_REDUNDANT_SUBSYSTEMS.includes(subsystem)
      ? `the ${subsystem} cannot have a backup unit.`
      : !selectedComponent(design, subsystem, data)
        ? `there is no ${subsystem} component to back up.`
        : undefined
    if (reason) {
      issues.push({ code: 'REDUNDANCY_NOT_ALLOWED', severity: 'error', subsystem, message: `Backup for ${subsystem}: ${reason}` })
    }
  }
  return issues
}
