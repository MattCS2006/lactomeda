// Pure helpers for the Requirements step (FR-2.3). No React, unit-tested in Node.
import type { Objective, RequirementLevel } from '../../engine/types'

export const LEVELS: RequirementLevel[] = ['threshold', 'baseline', 'goal']

/** Metrics where a smaller number is better (sharper images, faster revisit). */
const LOWER_IS_BETTER = new Set(['resolution', 'revisit'])

export function lowerIsBetter(metric: string): boolean {
  return LOWER_IS_BETTER.has(metric)
}

/** A translatable target: i18n key + values, e.g. "max 30 m" or "min 200 Mb/day". */
export interface Target {
  key: 'requirements.atMost' | 'requirements.atLeast'
  values: { value: string; unit: string }
}

/** What the player commits to at a level. */
export function targetFor(objective: Objective, level: RequirementLevel): Target {
  const v = objective.levels[level]
  return {
    key: lowerIsBetter(objective.metric) ? 'requirements.atMost' : 'requirements.atLeast',
    values: { value: v >= 10000 ? v.toLocaleString('en-US') : String(v), unit: objective.unit },
  }
}

/** Objectives whose levels get harder from threshold to goal — a data sanity check. */
export function levelsAreOrdered(objective: Objective): boolean {
  const [a, b, c] = LEVELS.map((l) => objective.levels[l])
  return lowerIsBetter(objective.metric) ? a >= b && b >= c : a <= b && b <= c
}
