// Design Review + launch (FR-6.9, FR-14.4 UI; step 6, CML 4). The verdicts come from the engine's designReview /
// launchDecision; this file only decides how they look and where the player goes to fix them. Pure, unit-tested.
import { SECONDS_PER_TICK } from '../../engine/constants'
import type { DesignReview, Discipline, Finding, LaunchDecision, Verdict } from '../../engine/rules/review'
import type { DesignStep } from '../store/missionStore'
import type { Label } from '../scenarios/scenarioView'
import type { ActiveEvent } from '../../engine/types'
import type { Speed } from '../../game/missionController'

/** FR-7.2 time controls, in button order (0 = pause). */
export const SPEEDS: Speed[] = [0, 1, 2, 10]

/** Icon + colour + text for a verdict (never colour alone, FR-6.2). */
export const VERDICT_LOOK: Record<Verdict, { icon: string; text: string; border: string }> = {
  go: { icon: '✓', text: 'text-ok', border: 'border-ok' },
  concern: { icon: '!', text: 'text-warning', border: 'border-warning' },
  noGo: { icon: '×', text: 'text-alarm', border: 'border-alarm' },
}

/** The design screen where each discipline is fixed. */
export const DISCIPLINE_STEP: Record<Discipline, DesignStep> = {
  power: 'bus',
  propulsion: 'bus',
  thermal: 'bus',
  structures: 'bus',
  avionics: 'bus',
  comms: 'orbit',
  attitude: 'bus',
  cost: 'payload',
  risk: 'bus',
}

const PAYLOAD_CODES = new Set([
  'MISSING_INSTRUMENT',
  'TOO_MANY_INSTRUMENTS',
  'INSTRUMENT_INCOMPATIBLE',
  'NO_MATCHING_OBJECTIVE',
  'NO_WAVELENGTH_DATA',
])
const ORBIT_CODES = new Set([
  'MISSING_LAUNCHER',
  'UNKNOWN_LAUNCHER',
  'NO_ORBIT',
  'WRONG_ORBIT',
  'MISSING_GROUND_NETWORK',
  'GROUND_NETWORK_OUT_OF_RANGE',
  'DOWNLINK_BOTTLENECK',
  'DATA_LOSS',
  'OVER_CAPACITY',
  'FAIRING_TOO_SMALL',
  'REGIME_NOT_SUPPORTED',
])

/** Where to fix one finding: its code first, then its discipline. */
export function fixStep(finding: Pick<Finding, 'code'>, discipline: Discipline): DesignStep {
  if (PAYLOAD_CODES.has(finding.code)) return 'payload'
  if (ORBIT_CODES.has(finding.code) || finding.code.startsWith('LAUNCH_')) return 'orbit'
  return DISCIPLINE_STEP[discipline]
}

/** Findings worth showing: problems first; an all-clear discipline shows its single ok line. */
export function visibleFindings(findings: Finding[]): Finding[] {
  const problems = findings.filter((f) => f.severity !== 'ok')
  return problems.length > 0 ? problems : findings.slice(0, 1)
}

/** Why the Launch button is (not) available, as a translatable label. */
export function decisionLabel(decision: LaunchDecision): Label {
  return { key: `review.decision.${decision.reason}` }
}

/** The risk checkbox is offered only when risk is the only thing in the way and the difficulty allows it. */
export function showRiskCheckbox(review: DesignReview): boolean {
  const risky = review.riskBlockers.resources.length > 0 || review.riskBlockers.issues.length > 0
  return risky && review.hardBlockers.length === 0 && review.canAcceptRisk
}

/** Totals of the equipment list (MDL master equipment list). */
export function equipmentTotals(review: DesignReview): { massKg: number; powerW: number; costM: number } {
  return review.equipment.reduce(
    (sum, item) => ({
      massKg: sum.massKg + (item.massKg ?? 0),
      powerW: sum.powerW + (item.powerW ?? 0),
      costM: sum.costM + item.costM,
    }),
    { massKg: 0, powerW: 0, costM: 0 },
  )
}

/** Seconds of mission time left on an alarm (the engine counts in ticks of SECONDS_PER_TICK). */
export function alarmSecondsLeft(alarm: Pick<ActiveEvent, 'deadlineTick'>, tick: number): number {
  return Math.max(0, (alarm.deadlineTick - tick) * SECONDS_PER_TICK)
}

/** Round for display: one decimal under 10, whole numbers above. */
export function fmt(n: number): string {
  const v = Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
  return v.toLocaleString('en-US')
}
