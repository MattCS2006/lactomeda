// Science value computed against the chosen requirements (FR-4.5): resolution, revisit, coverage,
// data and lifetime. Pure and deterministic; unknown or missing inputs give `undefined`, never throw.
import {
  EARTH_CIRCUMFERENCE_KM,
  EARTH_MU_KM3_S2,
  EARTH_RADIUS_KM,
  GEO_REVISIT_H,
  MINUTES_PER_DAY,
  NON_EARTH_ORBIT_IDS,
  SCORE_AT_BASELINE,
  SCORE_AT_GOAL,
  SCORE_AT_THRESHOLD,
  URAD_PER_ARCSEC,
} from '../constants'
import type { GameData, Instrument, MissionDesign, Objective, Orbit, RequirementLevel } from '../types'
import { estimateBudgets } from './resources'
import { payloadScience } from './science'

export type MetricDirection = 'lower' | 'higher'
type Levels = Record<RequirementLevel, number>

// ─── Geometry ───────────────────────────────────────────────────────────

const isAltitudeOverridden = (design: MissionDesign, orbit: Orbit): boolean =>
  design.altitudeKm !== undefined && (orbit.regime === 'LEO' || orbit.regime === 'SSO')

/** FR-5.3: the player's altitude applies to LEO/SSO only. */
export function effectiveAltitudeKm(design: MissionDesign, orbit: Orbit): number {
  return isAltitudeOverridden(design, orbit) ? (design.altitudeKm as number) : orbit.altitudeKm
}

export function effectivePeriodMin(design: MissionDesign, orbit: Orbit): number {
  if (!isAltitudeOverridden(design, orbit)) return orbit.periodMin
  const a = EARTH_RADIUS_KM + effectiveAltitudeKm(design, orbit)
  return (2 * Math.PI * Math.sqrt(a ** 3 / EARTH_MU_KM3_S2)) / 60
}

export function groundResolutionM(instrument: Instrument, altitudeKm: number): number | undefined {
  if (instrument.resolutionM !== undefined) return instrument.resolutionM
  if (instrument.ifovUrad !== undefined) return (altitudeKm * instrument.ifovUrad) / 1000
  return undefined
}

export function angularResolutionArcsec(instrument: Instrument): number | undefined {
  return instrument.ifovUrad === undefined ? undefined : instrument.ifovUrad / URAD_PER_ARCSEC
}

export function swathKm(instrument: Instrument, altitudeKm: number): number | undefined {
  // Wide scanners (e.g. VIIRS) give a fixed swath: the flat-Earth formula below breaks at very wide angles.
  if (instrument.swathKm !== undefined) return instrument.swathKm
  if (instrument.fovDeg === undefined) return undefined
  return 2 * altitudeKm * Math.tan((instrument.fovDeg * Math.PI) / 360)
}

const isEarthCentred = (orbit: Orbit): boolean => !NON_EARTH_ORBIT_IDS.includes(orbit.id)

const orbitsPerDay = (design: MissionDesign, orbit: Orbit): number =>
  MINUTES_PER_DAY / effectivePeriodMin(design, orbit)

export function revisitHours(instrument: Instrument, design: MissionDesign, orbit: Orbit): number | undefined {
  if (orbit.id === 'geo') return GEO_REVISIT_H
  if (!isEarthCentred(orbit)) return undefined
  const swath = swathKm(instrument, effectiveAltitudeKm(design, orbit))
  if (swath === undefined || swath <= 0) return undefined
  return (24 * EARTH_CIRCUMFERENCE_KM) / (swath * orbitsPerDay(design, orbit))
}

export function coverageFractionPerDay(instrument: Instrument, design: MissionDesign, orbit: Orbit): number | undefined {
  if (!isEarthCentred(orbit)) return undefined
  const swath = swathKm(instrument, effectiveAltitudeKm(design, orbit))
  if (swath === undefined) return undefined
  return Math.min(1, (swath * orbitsPerDay(design, orbit)) / EARTH_CIRCUMFERENCE_KM)
}

// ─── Metrics ────────────────────────────────────────────────────────────

export function metricDirection(metric: string): MetricDirection {
  return metric === 'resolution' || metric === 'revisit' ? 'lower' : 'higher'
}

const best = (values: (number | undefined)[], direction: MetricDirection): number | undefined => {
  const defined = values.filter((v): v is number => v !== undefined)
  if (defined.length === 0) return undefined
  return direction === 'lower' ? Math.min(...defined) : Math.max(...defined)
}

/** Measured value of one objective for this design, or undefined when it cannot be measured. */
export function objectiveValue(objective: Objective, design: MissionDesign, data: GameData): number | undefined {
  if (objective.metric === 'lifetime') return estimateBudgets(design, data).time.available

  const orbit = data.orbits.find((o) => o.id === design.orbitId)
  if (!orbit) return undefined
  const serving = design.instrumentIds
    .map((id) => data.instruments.find((i) => i.id === id))
    .filter((i): i is Instrument => i !== undefined && i.objectives.includes(objective.id))
  if (serving.length === 0) return undefined

  const altitude = effectiveAltitudeKm(design, orbit)
  switch (objective.metric) {
    case 'resolution':
      return objective.unit === 'arcsec'
        ? best(serving.map(angularResolutionArcsec), 'lower')
        : best(serving.map((i) => groundResolutionM(i, altitude)), 'lower')
    case 'revisit':
      return best(serving.map((i) => revisitHours(i, design, orbit)), 'lower')
    case 'coverage':
      return best(serving.map((i) => coverageFractionPerDay(i, design, orbit)), 'higher')
    case 'dataPerDay': {
      const { data: budget } = estimateBudgets(design, data)
      const generated = serving.reduce((sum, i) => sum + i.dataMbPerDay, 0)
      const delivered = budget.used > 0 ? Math.min(1, budget.available / budget.used) : 1
      return generated * delivered
    }
    default:
      return undefined
  }
}

// ─── Score ──────────────────────────────────────────────────────────────

const LEVEL_RANK: Record<RequirementLevel, number> = { threshold: 1, baseline: 2, goal: 3 }
const reaches = (value: number, target: number, direction: MetricDirection): boolean =>
  direction === 'lower' ? value <= target : value >= target

export function levelAchieved(value: number | undefined, levels: Levels, direction: MetricDirection): RequirementLevel | null {
  if (value === undefined) return null
  if (reaches(value, levels.goal, direction)) return 'goal'
  if (reaches(value, levels.baseline, direction)) return 'baseline'
  if (reaches(value, levels.threshold, direction)) return 'threshold'
  return null
}

/** 0..1, continuous and monotonic: 0.5 at threshold, 0.75 at baseline, 1 at goal or better. */
export function objectiveScore(value: number | undefined, levels: Levels, direction: MetricDirection): number {
  if (value === undefined) return 0
  const lerp = (from: number, to: number, s0: number, s1: number): number =>
    from === to ? s1 : s0 + ((s1 - s0) * (value - from)) / (to - from)
  if (reaches(value, levels.goal, direction)) return SCORE_AT_GOAL
  if (reaches(value, levels.baseline, direction)) return lerp(levels.baseline, levels.goal, SCORE_AT_BASELINE, SCORE_AT_GOAL)
  if (reaches(value, levels.threshold, direction)) return lerp(levels.threshold, levels.baseline, SCORE_AT_THRESHOLD, SCORE_AT_BASELINE)
  if (direction === 'lower') return value > 0 ? SCORE_AT_THRESHOLD * (levels.threshold / value) : 0
  return levels.threshold > 0 ? Math.max(0, SCORE_AT_THRESHOLD * (value / levels.threshold)) : 0
}

// ─── Public API ─────────────────────────────────────────────────────────

export interface ObjectiveResult {
  objectiveId: string
  metric: string
  unit: string
  value: number | undefined
  score: number // 0..1
  levelAchieved: RequirementLevel | null
  chosenLevel: RequirementLevel // design.requirementLevels[id] ?? 'threshold'
  met: boolean // levelAchieved is at or above chosenLevel
}

/** One result per scenario objective, in order. */
export function evaluateObjectives(design: MissionDesign, data: GameData): ObjectiveResult[] {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  if (!scenario) return []
  return scenario.objectives.map((objective) => {
    const direction = metricDirection(objective.metric)
    const value = objectiveValue(objective, design, data)
    const achieved = levelAchieved(value, objective.levels, direction)
    const chosenLevel = design.requirementLevels[objective.id] ?? 'threshold'
    return {
      objectiveId: objective.id,
      metric: objective.metric,
      unit: objective.unit,
      value,
      score: objectiveScore(value, objective.levels, direction),
      levelAchieved: achieved,
      chosenLevel,
      met: achieved !== null && LEVEL_RANK[achieved] >= LEVEL_RANK[chosenLevel],
    }
  })
}

/** payloadScience × mean objective score; 0 if the scenario has no objectives. */
export function scienceValue(design: MissionDesign, data: GameData): number {
  const results = evaluateObjectives(design, data)
  if (results.length === 0) return 0
  const mean = results.reduce((sum, r) => sum + r.score, 0) / results.length
  return payloadScience(design, data) * mean
}
