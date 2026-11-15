// Simple first-pass estimate of the 6 resource budgets (FR-6.1). Pure and deterministic.
// A future `computeBudgets` can wrap this. Unknown or missing ids contribute 0 and never throw.
import { makeBudget } from '../budgets'
import { PERFECT_RELIABILITY_LIFE_FACTOR, RADIATION_FACTOR } from '../constants'
import type { Budgets, Component, GameData, MissionDesign, ResourceKey, Subsystem } from '../types'
import { costBreakdown } from './cost'
import { linkBudget } from './link'
import { wetMassKg } from './mass'
import { powerBreakdown } from './power'

export const RESOURCE_KEYS: readonly ResourceKey[] = ['mass', 'power', 'budget', 'data', 'comms', 'time']

interface InstalledPart {
  component: Component
  units: number // 2 when the subsystem is redundant (main + backup)
  redundant: boolean
}

function installedParts(design: MissionDesign, data: GameData): InstalledPart[] {
  const redundant = new Set<Subsystem>(design.redundant)
  const parts: InstalledPart[] = []
  for (const [subsystem, id] of Object.entries(design.componentIds) as [Subsystem, string | undefined][]) {
    if (!id) continue
    const component = data.components.find((c) => c.id === id)
    if (!component) continue
    const isRedundant = redundant.has(subsystem)
    parts.push({ component, units: isRedundant ? 2 : 1, redundant: isRedundant })
  }
  return parts
}

/**
 * Probability that every installed component works (series system, 0-1). Radiation (FR-5.2) scales each failure
 * rate: r_eff = r ^ factor, except for radHard parts. A redundant subsystem works if either unit does.
 */
export function systemReliability(design: MissionDesign, data: GameData): number {
  const orbit = data.orbits.find((o) => o.id === design.orbitId)
  const radiationFactor = orbit ? RADIATION_FACTOR[orbit.radiation] : 1
  let reliability = 1
  for (const p of installedParts(design, data)) {
    const factor = (p.component.tags ?? []).includes('radHard') ? 1 : radiationFactor
    const r = p.component.reliability ** factor
    reliability *= p.redundant ? 1 - (1 - r) ** 2 : r
  }
  return reliability
}

export function estimateBudgets(design: MissionDesign, data: GameData): Budgets {
  const bus = data.busClasses.find((b) => b.id === design.busClassId)
  const orbit = data.orbits.find((o) => o.id === design.orbitId) ?? null
  const launcher = data.launchers.find((l) => l.id === design.launcherId)
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const durationDays = scenario?.durationDays ?? 0

  // mass (kg)
  const massUsed = wetMassKg(design, data)
  let massAvailable = bus?.maxMassKg ?? 0
  if (launcher && orbit) massAvailable = Math.min(massAvailable, launcher.capacityKg[orbit.regime] ?? 0)

  // power (W, orbit average): single source of truth is powerBreakdown (FR-6.4)
  const power = powerBreakdown(design, data)
  const powerUsed = power.loadW
  const powerAvailable = power.orbitAverageGenerationW

  // budget (M USD): single source of truth is costBreakdown (FR-6.5)
  const cost = costBreakdown(design, data)

  // data (Mb/day) and comms (min/day): single source of truth is linkBudget (FR-5.7)
  const link = linkBudget(design, data)
  const dataUsed = link.generatedMbPerDay
  const dataAvailable = link.downlinkMbPerDay
  const contactMin = link.contactMinPerDay
  const commsUsed = Number.isFinite(link.contactMinNeeded) ? link.contactMinNeeded : contactMin + 1

  // time (days): median life of a constant-failure-rate system vs the required lifetime
  const reliability = systemReliability(design, data)
  const medianLifeDays =
    durationDays <= 0
      ? 0
      : reliability >= 1
        ? PERFECT_RELIABILITY_LIFE_FACTOR * durationDays
        : reliability <= 0
          ? 0
          : (Math.LN2 * durationDays) / -Math.log(reliability)

  return {
    mass: makeBudget(massUsed, massAvailable),
    power: makeBudget(powerUsed, powerAvailable),
    budget: makeBudget(cost.totalM, cost.budgetM),
    data: makeBudget(dataUsed, dataAvailable),
    comms: makeBudget(commsUsed, contactMin),
    time: makeBudget(durationDays, medianLifeDays),
  }
}
