// What a requirement level does to the mission (FR-2.4): higher levels raise the score
// potential and tighten the targets the spacecraft must reach. Pure, unit-tested.
//
// PROPOSAL for Dev 1: score() should use LEVEL_SCORE_MULTIPLIER (or move it to
// src/engine and this file will import it from there), so the numbers the player sees
// before confirming are the numbers that score the mission.
import type { Objective, RequirementLevel, ResourceKey } from '../../engine/types'
import { lowerIsBetter } from './requirementsView'

export const LEVEL_SCORE_MULTIPLIER: Record<RequirementLevel, number> = {
  threshold: 0.8,
  baseline: 1,
  goal: 1.3,
}

/** Resources a stricter target pushes on, by metric (shown as "Pushes on: …"). */
export const METRIC_RESOURCES: Record<string, ResourceKey[]> = {
  resolution: ['mass', 'power', 'budget'], // bigger optics or a lower orbit
  revisit: ['budget', 'time'], // wider coverage, more complex orbit/ops
  dataPerDay: ['data', 'comms', 'power'], // more data to store, downlink and power
  lifetime: ['mass', 'power', 'budget'], // propellant, panel/battery ageing, years of operations
}

export function resourcesFor(metric: string): ResourceKey[] {
  return METRIC_RESOURCES[metric] ?? []
}

/** Average multiplier over all objectives: the score potential of the chosen levels. */
export function scorePotential(levels: Record<string, RequirementLevel>): number {
  const values = Object.values(levels)
  if (values.length === 0) return 1
  const mean = values.reduce((sum, l) => sum + LEVEL_SCORE_MULTIPLIER[l], 0) / values.length
  return Math.round(mean * 100) / 100
}

export interface Tightening {
  direction: 'stricter' | 'easier' | 'same'
  /** How many times stricter/easier than baseline, e.g. 2 = twice as demanding. */
  factor: number
}

/** How a level compares with baseline: "2× stricter", "1.7× easier", "same". */
export function tighteningVsBaseline(objective: Objective, level: RequirementLevel): Tightening {
  const base = objective.levels.baseline
  const value = objective.levels[level]
  if (value === base || base === 0 || value === 0) return { direction: 'same', factor: 1 }
  const ratio = lowerIsBetter(objective.metric) ? base / value : value / base
  const factor = Math.round((ratio >= 1 ? ratio : 1 / ratio) * 10) / 10
  return { direction: ratio > 1 ? 'stricter' : 'easier', factor }
}

/** Resources that will be harder to meet with the chosen levels (any objective above baseline). */
export function pressuredResources(objectives: Objective[], levels: Record<string, RequirementLevel>): ResourceKey[] {
  const out = new Set<ResourceKey>()
  for (const o of objectives) {
    if (tighteningVsBaseline(o, levels[o.id] ?? 'baseline').direction === 'stricter') {
      for (const r of resourcesFor(o.metric)) out.add(r)
    }
  }
  return [...out]
}

/** Number formatting for multipliers: 1 -> "1.0", 1.3 -> "1.3", 1.07 -> "1.07". */
export function formatMultiplier(m: number): string {
  return Number.isInteger(m * 10) ? m.toFixed(1) : m.toFixed(2)
}
