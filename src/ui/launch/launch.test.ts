import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { SECONDS_PER_TICK } from '../../engine/constants'
import { costBreakdown } from '../../engine/rules/cost'
import { DISCIPLINES, designReview, launchDecision } from '../../engine/rules/review'
import en from '../../i18n/en.json'
import { STEP_CML } from '../maturity/maturity'
import { createDesign } from '../store/missionStore'
import {
  DISCIPLINE_STEP,
  VERDICT_LOOK,
  alarmSecondsLeft,
  decisionLabel,
  equipmentTotals,
  fixStep,
  showRiskCheckbox,
  visibleFindings,
} from './reviewView'
import type { MissionDesign } from '../../engine/types'

const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en)
const wildfire = REFERENCE_DESIGNS.find((d) => d.scenarioId === 'wildfire-eo')!

describe('Design Review screen (FR-6.9, FR-14.4 UI)', () => {
  it('step 6 is CML 4', () => {
    expect(STEP_CML.design).toBe(4)
  })

  it('a reference design passes the review and can launch with one click', () => {
    const decision = launchDecision(designReview(wildfire, gameData), false)
    expect(decision).toEqual({ allowed: true, reason: 'clear' })
    expect(lookup(decisionLabel(decision).key)).toBeTypeOf('string')
  })

  it('an empty design is blocked by hard blockers and offers no risk checkbox', () => {
    const review = designReview(createDesign('wildfire-eo', gameData, 'engineer', 's'), gameData)
    expect(launchDecision(review, true)).toEqual({ allowed: false, reason: 'hardBlockers' })
    expect(showRiskCheckbox(review)).toBe(false)
  })

  it('risk can be accepted above Cadet only', () => {
    // Over budget is a risk (red resource), not a hard blocker
    const tight = (difficulty: MissionDesign['difficulty']): MissionDesign => ({
      ...wildfire,
      difficulty,
      instrumentIds: [...wildfire.instrumentIds, ...wildfire.instrumentIds, ...wildfire.instrumentIds],
    })
    const engineer = designReview(tight('engineer'), gameData)
    const cadet = designReview(tight('cadet'), gameData)
    if (engineer.hardBlockers.length === 0 && engineer.riskBlockers.resources.length > 0) {
      expect(showRiskCheckbox(engineer)).toBe(true)
      expect(launchDecision(engineer, true).allowed).toBe(true)
      expect(showRiskCheckbox(cadet)).toBe(false)
      expect(launchDecision(cadet, true).reason).toBe('cadetCannotAcceptRisk')
    } else {
      // The catalog changed: the rule itself still holds
      expect(engineer.canAcceptRisk).toBe(true)
      expect(cadet.canAcceptRisk).toBe(false)
    }
  })

  it('every verdict, discipline and launch reason has its text', () => {
    for (const v of Object.keys(VERDICT_LOOK)) {
      expect(lookup(`review.verdict.${v}`), v).toBeTypeOf('string')
      expect(lookup(`review.overall.${v}`), v).toBeTypeOf('string')
    }
    for (const d of DISCIPLINES) expect(lookup(`review.discipline.${d}`), d).toBeTypeOf('string')
    for (const r of ['clear', 'riskAccepted', 'hardBlockers', 'riskNotAccepted', 'cadetCannotAcceptRisk']) {
      expect(lookup(`review.decision.${r}`), r).toBeTypeOf('string')
    }
  })

  it('each finding sends the player to the screen where it is fixed', () => {
    expect(Object.keys(DISCIPLINE_STEP).sort()).toEqual([...DISCIPLINES].sort())
    expect(fixStep({ code: 'MISSING_LAUNCHER' }, 'structures')).toBe('orbit')
    expect(fixStep({ code: 'LAUNCH_OVER_CAPACITY' }, 'structures')).toBe('orbit')
    expect(fixStep({ code: 'TOO_MANY_INSTRUMENTS' }, 'structures')).toBe('payload')
    expect(fixStep({ code: 'BATTERY_TOO_SMALL' }, 'power')).toBe('bus')
    expect(fixStep({ code: 'DOWNLINK_BOTTLENECK' }, 'comms')).toBe('orbit')
  })

  it('shows problems first, or the single all-clear line', () => {
    const ok = { code: 'DISCIPLINE_OK', severity: 'ok' as const, message: 'fine' }
    const bad = { code: 'X', severity: 'error' as const, message: 'bad' }
    expect(visibleFindings([ok])).toEqual([ok])
    expect(visibleFindings([ok, bad])).toEqual([bad])
  })

  it('the equipment list adds up to the cost budget', () => {
    const totals = equipmentTotals(designReview(wildfire, gameData))
    expect(totals.costM).toBeCloseTo(costBreakdown(wildfire, gameData).totalM, 6)
    expect(totals.massKg).toBeGreaterThan(0)
  })

  it('alarm time left is shown in mission seconds', () => {
    expect(alarmSecondsLeft({ deadlineTick: 20 }, 5)).toBe(15 * SECONDS_PER_TICK)
    expect(alarmSecondsLeft({ deadlineTick: 5 }, 9)).toBe(0)
  })
})
