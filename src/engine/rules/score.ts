// FR-10.1 score out of 1000 with a breakdown. Pure and deterministic: nothing is mutated.
// Missing modules or ids score 0 for that part and never throw.
//
// Science 400 + objectives 250 + efficiency 150 + reliability 100 + collaboration 100.
// `stars` and `outcome` are PROVISIONAL: FR-10.2 will replace them with per-scenario thresholds.
import {
  EFFICIENCY_TARGET_MARGIN,
  LEVEL_WEIGHT,
  MISSED_LEVEL_PENALTY,
  SCIENCE_TARGET_FACTOR,
  SCORE_MAX,
  STAR_THRESHOLDS,
} from '../constants'
import type { GameData, MissionDesign, RequirementLevel, ScoreResult, SimState } from '../types'
import { evaluateObjectives } from './objectives'
import { RESOURCE_KEYS, estimateBudgets } from './resources'
import { scheduleBreakdown } from './schedule'

export type ScoreComponent = 'science' | 'objectives' | 'efficiency' | 'reliability' | 'collaboration'

export interface ScoreComponentDetail {
  component: ScoreComponent
  points: number // rounded to 1 decimal
  max: number // 400, 250, 150, 100, 100
  fraction: number // points / max
  inputs: Record<string, number> // the numbers behind it, for the breakdown tooltip
}

const COMPONENTS: readonly ScoreComponent[] = ['science', 'objectives', 'efficiency', 'reliability', 'collaboration']

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const round1 = (n: number): number => Math.round(n * 10) / 10
const mean = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length)

interface Raw {
  points: number
  inputs: Record<string, number>
}

function scienceRaw(state: SimState, design: MissionDesign, data: GameData): Raw {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  // Best instrument science available for each objective of the scenario.
  const best = (scenario?.objectives ?? []).reduce(
    (sum, o) => sum + Math.max(0, ...data.instruments.filter((i) => i.objectives.includes(o.id)).map((i) => i.science)),
    0,
  )
  const target = SCIENCE_TARGET_FACTOR * best
  const points = target > 0 ? SCORE_MAX.science * Math.min(1, state.science / target) : 0
  return { points, inputs: { science: state.science, target } }
}

function objectivesRaw(state: SimState, design: MissionDesign, data: GameData): Raw {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const results = evaluateObjectives(design, data)
  const completion = scenario && scenario.durationDays > 0 ? Math.min(1, state.day / scenario.durationDays) : 0
  const launched = state.endReason !== 'launchFailure'
  const each = results.length > 0 ? SCORE_MAX.objectives / results.length : 0
  const weights = results.map((r) => {
    if (!launched || r.levelAchieved === null) return 0
    return r.met ? LEVEL_WEIGHT[r.chosenLevel] : LEVEL_WEIGHT[r.levelAchieved] * MISSED_LEVEL_PENALTY
  })
  const points = each * weights.reduce((a, b) => a + b, 0) * completion
  return { points, inputs: { objectives: results.length, weighted: mean(weights), completion } }
}

function efficiencyRaw(design: MissionDesign, data: GameData): Raw {
  const budgets = estimateBudgets(design, data)
  const inputs: Record<string, number> = {}
  const parts = RESOURCE_KEYS.map((key) => {
    const b = budgets[key]
    const part = b.status === 'red' ? 0 : clamp(b.margin / EFFICIENCY_TARGET_MARGIN, 0, 1)
    inputs[key] = part
    return part
  })
  // FR-6.7: every late month of development takes points off the efficiency score
  const schedule = scheduleBreakdown(design, data)
  inputs.lateMonths = schedule.lateMonths
  return { points: Math.max(0, SCORE_MAX.efficiency * mean(parts) - schedule.lateScorePenalty), inputs }
}

function reliabilityRaw(state: SimState): Raw {
  const health = mean(Object.values(state.health).filter((h): h is number => h !== undefined))
  const points = state.endReason === 'launchFailure' ? 0 : SCORE_MAX.reliability * health * (1 - state.risk)
  return { points, inputs: { health, risk: state.risk } }
}

/**
 * Solo collaboration = decision quality: events the player resolved before their deadline / all events that fired.
 * The simulation logs a player decision with kind 'decision' and a timeout with kind 'warning', so they can be told
 * apart. An event still ringing at the end counts as not resolved. Team mode (FR-8.x) will replace this component.
 */
function collaborationRaw(state: SimState): Raw {
  const fired = state.log.filter((l) => l.kind === 'event').length
  const resolved = Math.min(fired, state.log.filter((l) => l.kind === 'decision').length)
  return { points: fired === 0 ? SCORE_MAX.collaboration : SCORE_MAX.collaboration * (resolved / fired), inputs: { fired, resolved } }
}

export function scoreDetails(state: SimState, design: MissionDesign, data: GameData): ScoreComponentDetail[] {
  const raw: Record<ScoreComponent, Raw> = {
    science: scienceRaw(state, design, data),
    objectives: objectivesRaw(state, design, data),
    efficiency: efficiencyRaw(design, data),
    reliability: reliabilityRaw(state),
    collaboration: collaborationRaw(state),
  }
  return COMPONENTS.map((component) => {
    const max = SCORE_MAX[component]
    const points = round1(clamp(raw[component].points, 0, max))
    return { component, points, max, fraction: points / max, inputs: raw[component].inputs }
  })
}

const FAILURE_REASONS = new Set(['launchFailure', 'criticalFailure', 'budgetExhausted'])

/** PROVISIONAL (FR-10.2): failure if the mission broke, full if every objective met its chosen level, partial if any level was reached. */
function provisionalOutcome(state: SimState, design: MissionDesign, data: GameData): ScoreResult['outcome'] {
  if (state.endReason !== undefined && FAILURE_REASONS.has(state.endReason)) return 'failure'
  const results = evaluateObjectives(design, data)
  if (results.length > 0 && results.every((r) => r.met)) return 'fullSuccess'
  if (results.some((r) => r.levelAchieved !== null)) return 'partialSuccess'
  return 'failure'
}

/** PROVISIONAL (FR-10.2): stars from the total; a failure gets at most one. */
function provisionalStars(total: number, outcome: ScoreResult['outcome']): ScoreResult['stars'] {
  const stars = total >= STAR_THRESHOLDS.three ? 3 : total >= STAR_THRESHOLDS.two ? 2 : total >= STAR_THRESHOLDS.one ? 1 : 0
  return (outcome === 'failure' ? Math.min(stars, 1) : stars) as ScoreResult['stars']
}

/** Score out of 1000 with its breakdown (EngineAPI.score). */
export function score(state: SimState, design: MissionDesign, data: GameData): ScoreResult {
  const details = scoreDetails(state, design, data)
  const points = Object.fromEntries(details.map((d) => [d.component, d.points])) as Record<ScoreComponent, number>
  const total = clamp(Math.round(details.reduce((sum, d) => sum + d.points, 0)), 0, 1000)

  const launched = state.endReason !== 'launchFailure'
  const objectivesMet: Record<string, RequirementLevel | null> = {}
  for (const r of evaluateObjectives(design, data)) objectivesMet[r.objectiveId] = launched ? r.levelAchieved : null

  const outcome = provisionalOutcome(state, design, data)
  return { total, breakdown: points, objectivesMet, stars: provisionalStars(total, outcome), outcome }
}
