// What the debrief shows (Part 2 of the demo fixes): the score parts, the top 3 reasons and the launch failure.
// Pure and unit-tested; the texts themselves come from i18n (demoFixes.debrief) or, for the reasons, from the engine's explain().
import { SCORE_MAX } from '../../engine/constants'
import { launchOutcome, type LaunchOutcome } from '../../engine/rules/launchOutcome'
import type { Explanation, ExplanationPoint, GameData, MissionDesign, ScoreResult } from '../../engine/types'

export type ScorePart = keyof ScoreResult['breakdown']

export const SCORE_PARTS: readonly ScorePart[] = ['science', 'objectives', 'efficiency', 'reliability', 'collaboration']

export interface ScoreRow {
  part: ScorePart
  points: number
  max: number
  fraction: number // 0..1, for the bar
}

/** The five parts of the score out of 1000, in display order. */
export function scoreRows(score: Pick<ScoreResult, 'breakdown'>): ScoreRow[] {
  return SCORE_PARTS.map((part) => {
    const points = Math.round(score.breakdown[part])
    const max = SCORE_MAX[part]
    return { part, points, max, fraction: max > 0 ? Math.min(1, points / max) : 0 }
  })
}

export const POINT_ICON: Record<ExplanationPoint['kind'], string> = { good: '✓', bad: '✗', tip: '💡' }

/** The 3 points the debrief shows (the engine sorts them by importance). */
export function topPoints(explanation: Explanation, count = 3): ExplanationPoint[] {
  return explanation.points.slice(0, count)
}

/** Why the launch failed and what to learn from it, or null when the launch worked (or there is no design). */
export function launchFailure(design: MissionDesign | null, data: GameData, score: Pick<ScoreResult, 'outcome'> | null): LaunchOutcome | null {
  if (!design || score?.outcome !== 'failure') return null
  const outcome = launchOutcome(design, data)
  return outcome && !outcome.success ? outcome : null
}
