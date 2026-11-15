// What each difficulty changes (FR-2.2), read from the engine's own constants so the picker
// always tells the truth. Pure, unit-tested.
import { DIFFICULTY_EVENT_FACTOR, MASS_CONTINGENCY, TIERS_BY_DIFFICULTY } from '../../engine/constants'
import type { Difficulty } from '../../engine/types'

export const DIFFICULTIES: Difficulty[] = ['cadet', 'engineer', 'flightDirector']

/** FR-1.7: hints are shown on Cadet only (used by the hint system, SCRUM-36). */
export function hintsEnabled(difficulty: Difficulty): boolean {
  return difficulty === 'cadet'
}

export interface DifficultyEffects {
  advancedParts: boolean
  /** Multiplier on how often emergencies happen in flight. */
  eventFactor: number
  /** Extra mass the design must leave free (growth allowance), in %. */
  massMarginPct: number
  /** At the design review, risky designs can launch if the team accepts the risk. */
  canAcceptRisk: boolean
  hints: boolean
}

export function effectsOf(difficulty: Difficulty): DifficultyEffects {
  return {
    advancedParts: TIERS_BY_DIFFICULTY[difficulty].includes('advanced'),
    eventFactor: DIFFICULTY_EVENT_FACTOR[difficulty],
    massMarginPct: Math.round(MASS_CONTINGENCY[difficulty] * 100),
    canAcceptRisk: difficulty !== 'cadet', // engine review: canAcceptRisk = difficulty !== 'cadet'
    hints: hintsEnabled(difficulty),
  }
}
