// Pure helpers that turn a Scenario from scenarios.json into what a picker card shows (FR-2.1).
// No React here, so it is unit-tested in Node.
import type { Difficulty, GameData, Orbit, Scenario } from '../../engine/types'

export type DestinationKey = 'earth' | 'l2' | 'moon' | 'mars'

/** A translatable label: an i18n key plus its interpolation values. */
export interface Label {
  key: string
  values?: Record<string, string | number>
}

export interface ScenarioCard {
  id: string
  name: string
  briefing: string
  objectives: string[]
  destination: DestinationKey
  orbitNames: string[]
  budget: Label
  deadline: Label
  duration: Label
  difficulty: Difficulty
}

/** Where the mission goes, from its first allowed orbit (the scenario's main target). */
export function destinationOf(orbit: Orbit | undefined): DestinationKey {
  if (!orbit) return 'earth'
  if (orbit.id === 'l2') return 'l2'
  if (orbit.id === 'lunar') return 'moon'
  if (orbit.id === 'mars' || orbit.regime === 'ESCAPE') return 'mars'
  return 'earth'
}

/** $2M, $120M, $1B — budgets are stored in millions of USD. */
export function moneyLabel(millions: number): Label {
  if (millions >= 1000) {
    const b = millions / 1000
    return { key: 'units.moneyB', values: { value: Number.isInteger(b) ? b : b.toFixed(1) } }
  }
  return { key: 'units.moneyM', values: { value: millions } }
}

/** Days -> the most readable unit: 540 -> 18 months, 1460 -> 4 years, 90 -> 90 days. */
export function durationLabel(days: number): Label {
  if (days >= 730 && days % 365 === 0) return { key: 'units.years', values: { count: days / 365 } }
  if (days >= 60) return { key: 'units.months', values: { count: Math.round(days / 30) } }
  return { key: 'units.days', values: { count: days } }
}

/**
 * Suggested difficulty from the size of the mission: small budgets are beginner-friendly,
 * flagship budgets have the most parts and the tightest trade-offs. Players can still pick
 * any difficulty (FR-2.2).
 */
export function recommendedDifficulty(budgetM: number): Difficulty {
  if (budgetM <= 10) return 'cadet'
  if (budgetM <= 300) return 'engineer'
  return 'flightDirector'
}

export function toScenarioCard(scenario: Scenario, data: Pick<GameData, 'orbits'>): ScenarioCard {
  const orbitById = new Map(data.orbits.map((o) => [o.id, o]))
  const allowed = scenario.allowedOrbitIds.map((id) => orbitById.get(id)).filter((o): o is Orbit => !!o)
  return {
    id: scenario.id,
    name: scenario.name,
    briefing: scenario.briefing,
    objectives: scenario.objectives.map((o) => o.label),
    destination: destinationOf(allowed[0]),
    orbitNames: allowed.map((o) => o.name),
    budget: moneyLabel(scenario.budgetM),
    deadline: durationLabel(scenario.deadlineDays),
    duration: durationLabel(scenario.durationDays),
    difficulty: recommendedDifficulty(scenario.budgetM),
  }
}
