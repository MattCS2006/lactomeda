// FR-6.7 schedule budget: development time from the bus class, the TRL of the parts and the complexity, against the
// scenario deadline. A late design pays for it (cost, score, warning). This is NOT the `time` resource, which stays
// the mission lifetime. Pure and deterministic: nothing is mutated. Missing ids contribute nothing and never throw.
// `message` text is an English fallback; the UI translates by `code`.
import {
  DAYS_PER_INSTRUMENT,
  DAYS_PER_MONTH,
  DAYS_PER_REDUNDANT_SUBSYSTEM,
  DEV_BASE_DAYS,
  INTEGRATION_DAYS_PER_IMMATURE_PART,
  LATE_COST_FRACTION_PER_MONTH,
  LATE_SCORE_PENALTY_PER_MONTH,
  TRL_DELAY_MONTHS,
  TRL_DELAY_MONTHS_LOW,
} from '../constants'
import type { GameData, Instrument, MissionDesign, ValidationIssue } from '../types'
import { SUBSYSTEMS } from './components'
import { baseDevelopmentCostM } from './cost'

export interface SchedulePart {
  id: string
  kind: 'component' | 'instrument'
  trl: number
  delayDays: number
}

export interface ScheduleBreakdown {
  baseDays: number
  parts: SchedulePart[]
  criticalPartId: string | null // the slowest part; null if every part is mature
  trlDelayDays: number
  integrationDays: number
  complexityDays: number
  devDays: number
  deadlineDays: number
  marginDays: number // deadline - devDays (negative = late)
  lateDays: number
  lateMonths: number
  lateCostM: number
  lateScorePenalty: number // points taken off the efficiency score
}

const MATURE_TRL = 9
const fmt = (n: number): string => String(Math.round(n * 10) / 10)

/** Months a part of this TRL adds to the schedule. */
export function trlDelayMonths(trl: number): number {
  const level = Math.round(trl)
  if (level >= MATURE_TRL) return 0
  return TRL_DELAY_MONTHS[level] ?? TRL_DELAY_MONTHS_LOW
}

/** Instruments have no TRL in the catalog: they count as TRL 9 unless one is given. */
const instrumentTrl = (instrument: Instrument): number => (instrument as Instrument & { trl?: number }).trl ?? MATURE_TRL

export function scheduleBreakdown(design: MissionDesign, data: GameData): ScheduleBreakdown {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const baseDays = (design.busClassId === null ? undefined : DEV_BASE_DAYS[design.busClassId]) ?? DEV_BASE_DAYS.smallsat

  // installed parts in a fixed order: components by subsystem, then instruments in the order chosen
  const parts: SchedulePart[] = []
  for (const subsystem of SUBSYSTEMS) {
    const id = design.componentIds[subsystem]
    const component = id === undefined ? undefined : data.components.find((c) => c.id === id)
    if (component) parts.push({ id: component.id, kind: 'component', trl: component.trl, delayDays: trlDelayMonths(component.trl) * DAYS_PER_MONTH })
  }
  for (const id of design.instrumentIds) {
    const instrument = data.instruments.find((i) => i.id === id)
    if (instrument) {
      const trl = instrumentTrl(instrument)
      parts.push({ id: instrument.id, kind: 'instrument', trl, delayDays: trlDelayMonths(trl) * DAYS_PER_MONTH })
    }
  }

  // parts are developed in parallel: the slowest one is the critical path, every other immature part adds integration work
  const trlDelayDays = Math.max(0, ...parts.map((p) => p.delayDays))
  const critical = trlDelayDays > 0 ? parts.find((p) => p.delayDays === trlDelayDays) : undefined
  const otherImmature = parts.filter((p) => p.trl < MATURE_TRL && p !== critical).length
  const integrationDays = otherImmature * INTEGRATION_DAYS_PER_IMMATURE_PART

  const redundant = design.redundant.filter((s) => design.componentIds[s] !== undefined).length
  const complexityDays = parts.filter((p) => p.kind === 'instrument').length * DAYS_PER_INSTRUMENT + redundant * DAYS_PER_REDUNDANT_SUBSYSTEM

  const devDays = baseDays + trlDelayDays + integrationDays + complexityDays
  const deadlineDays = scenario?.deadlineDays ?? 0
  const lateDays = scenario ? Math.max(0, devDays - deadlineDays) : 0
  const lateMonths = lateDays / DAYS_PER_MONTH
  return {
    baseDays,
    parts,
    criticalPartId: critical?.id ?? null,
    trlDelayDays,
    integrationDays,
    complexityDays,
    devDays,
    deadlineDays,
    marginDays: deadlineDays - devDays,
    lateDays,
    lateMonths,
    lateCostM: baseDevelopmentCostM(design, data) * LATE_COST_FRACTION_PER_MONTH * lateMonths,
    lateScorePenalty: LATE_SCORE_PENALTY_PER_MONTH * lateMonths,
  }
}

/** FR-6.7: `SCHEDULE_LATE` (warning) when development takes longer than the deadline. Never blocks launch. */
export function validateSchedule(design: MissionDesign, data: GameData): ValidationIssue[] {
  const s = scheduleBreakdown(design, data)
  if (s.lateDays <= 0) return []
  const slowest = s.parts.find((p) => p.id === s.criticalPartId)
  const name = slowest
    ? (slowest.kind === 'component' ? data.components : data.instruments).find((x) => x.id === slowest.id)?.name ?? slowest.id
    : undefined
  const slow = slowest && name ? ` Slowest part: ${name} (TRL ${slowest.trl}).` : ''
  return [
    {
      code: 'SCHEDULE_LATE',
      severity: 'warning',
      message: `Development takes ${fmt(s.devDays / DAYS_PER_MONTH)} months but the deadline is ${fmt(s.deadlineDays / DAYS_PER_MONTH)} months (${fmt(s.lateMonths)} months late).${slow}`,
    },
  ]
}
