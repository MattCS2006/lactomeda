import { describe, expect, it } from 'vitest'
import { fullGameData as gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { DEV_BASE_DAYS, LATE_COST_FRACTION_PER_MONTH, LATE_SCORE_PENALTY_PER_MONTH } from '../constants'
import { initSim } from '../sim'
import type { GameData, MissionDesign } from '../types'
import { validate } from '../validate'
import { baseDevelopmentCostM, costBreakdown } from './cost'
import { estimateBudgets } from './resources'
import { designReview } from './review'
import { scoreDetails } from './score'
import { scheduleBreakdown, trlDelayMonths, validateSchedule } from './schedule'

const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!
const wildfire = (): MissionDesign => ref('wildfire-eo')
const withComponent = (d: MissionDesign, subsystem: keyof MissionDesign['componentIds'], id: string): MissionDesign => ({
  ...d,
  componentIds: { ...d.componentIds, [subsystem]: id },
})
const withDeadline = (days: number): GameData => ({
  ...gameData,
  scenarios: gameData.scenarios.map((s) => ({ ...s, deadlineDays: days })),
})
const efficiency = (d: MissionDesign, data: GameData) =>
  scoreDetails(initSim(d, data), d, data).find((x) => x.component === 'efficiency')!

describe('trlDelayMonths', () => {
  it('follows the table: 9 adds nothing, then 1, 3, 6, 9 and 12 months', () => {
    expect([9, 8, 7, 6, 5, 4, 3, 1].map(trlDelayMonths)).toEqual([0, 1, 3, 6, 9, 12, 12, 12])
  })
})

describe('scheduleBreakdown', () => {
  it('is the base time of the bus when every part is mature and there is nothing complex', () => {
    const d = { ...wildfire(), instrumentIds: [], redundant: [] }
    const s = scheduleBreakdown(d, gameData)
    expect(s).toMatchObject({ baseDays: 540, trlDelayDays: 0, integrationDays: 0, complexityDays: 0, devDays: 540, criticalPartId: null })
    expect(s.marginDays).toBe(s.deadlineDays - 540)
  })

  it('low-TRL parts add months: swapping bat-1k (TRL 9) for bat-adv (TRL 5) adds 9 months and makes it the critical part', () => {
    const before = scheduleBreakdown(wildfire(), gameData)
    const after = scheduleBreakdown(withComponent(wildfire(), 'battery', 'bat-adv'), gameData)
    expect(after.devDays - before.devDays).toBe(9 * 30)
    expect(after.criticalPartId).toBe('bat-adv')
    expect(after.trlDelayDays).toBe(270)
    expect(after.parts.find((p) => p.id === 'bat-adv')).toMatchObject({ kind: 'component', trl: 5, delayDays: 270 })
  })

  it('develops parts in parallel: two TRL 6 parts add one 6-month delay plus integration, not 12 months', () => {
    const base = scheduleBreakdown(wildfire(), gameData)
    const d = withComponent(withComponent(wildfire(), 'attitude', 'adcs-fine'), 'thermal', 'thm-cryo')
    const s = scheduleBreakdown(d, gameData)
    expect(s.trlDelayDays).toBe(180)
    expect(s.integrationDays).toBe(20)
    expect(s.devDays - base.devDays).toBe(180 + 20)
    expect(s.criticalPartId).toBe('adcs-fine') // the first of equally slow parts
    // a third immature part adds another 20 days and no extra delay
    const three = scheduleBreakdown(withComponent(d, 'computer', 'obc-edge'), gameData) // TRL 5: now the slowest
    expect(three.trlDelayDays).toBe(270)
    expect(three.criticalPartId).toBe('obc-edge')
    expect(three.integrationDays).toBe(40)
  })

  it('adds complexity days for each instrument and each redundant subsystem', () => {
    const base = { ...wildfire(), instrumentIds: ['inst-thermal-ir'], redundant: [] }
    const b0 = scheduleBreakdown(base, gameData)
    expect(b0.complexityDays).toBe(30)
    expect(scheduleBreakdown({ ...base, instrumentIds: ['inst-thermal-ir', 'inst-multispectral'] }, gameData).complexityDays).toBe(60)
    const redundant = scheduleBreakdown({ ...base, redundant: ['comms', 'power'] }, gameData)
    expect(redundant.complexityDays).toBe(30 + 2 * 15)
    expect(redundant.devDays - b0.devDays).toBe(30)
  })

  it('takes longer on a bigger bus class', () => {
    const days = (bus: string) => scheduleBreakdown({ ...wildfire(), busClassId: bus }, gameData).baseDays
    expect(['cubesat-1u', 'cubesat-2u', 'cubesat-3u', 'cubesat-6u', 'cubesat-12u', 'smallsat', 'medium', 'large'].map(days)).toEqual([
      240, 270, 300, 330, 365, 540, 900, 1460,
    ])
    expect(days('large')).toBeGreaterThan(days('smallsat'))
  })

  it('uses the smallsat time for an unknown or missing bus, and never throws on missing ids', () => {
    expect(scheduleBreakdown({ ...wildfire(), busClassId: null }, gameData).baseDays).toBe(DEV_BASE_DAYS.smallsat)
    expect(scheduleBreakdown({ ...wildfire(), busClassId: 'nope' }, gameData).baseDays).toBe(DEV_BASE_DAYS.smallsat)
    const broken = { ...wildfire(), componentIds: { power: 'nope' }, instrumentIds: ['nope'], redundant: ['comms' as const] }
    const s = scheduleBreakdown(broken, gameData)
    expect(s.parts).toEqual([])
    expect(s.complexityDays).toBe(0) // there is no comms component to back up
    expect(scheduleBreakdown({ ...wildfire(), scenarioId: 'nope' }, gameData)).toMatchObject({ deadlineDays: 0, lateDays: 0, lateCostM: 0 })
  })

  it('counts an instrument as TRL 9 unless it has its own TRL', () => {
    const immature: GameData = {
      ...gameData,
      instruments: gameData.instruments.map((i) => (i.id === 'inst-thermal-ir' ? ({ ...i, trl: 6 } as typeof i) : i)),
    }
    const d = { ...wildfire(), instrumentIds: ['inst-thermal-ir'] }
    expect(scheduleBreakdown(d, gameData).trlDelayDays).toBe(0)
    const s = scheduleBreakdown(d, immature)
    expect(s.trlDelayDays).toBe(180)
    expect(s.criticalPartId).toBe('inst-thermal-ir')
  })
})

describe('reference designs', () => {
  it('are all on time', () => {
    for (const d of REFERENCE_DESIGNS) {
      const s = scheduleBreakdown(d, gameData)
      console.info(`${d.scenarioId}: ${s.devDays} days of ${s.deadlineDays} (margin ${s.marginDays}), critical part ${s.criticalPartId}`)
      expect(s.lateDays, d.scenarioId).toBe(0)
      expect(s.marginDays, d.scenarioId).toBeGreaterThan(0)
      expect(validateSchedule(d, gameData)).toEqual([])
    }
  })
})

describe('late = penalty', () => {
  const design = ref('student-cubesat') // 360 days of work
  const tight = withDeadline(330) // one month late

  it('counts the late days and months', () => {
    const s = scheduleBreakdown(design, tight)
    expect(s.devDays).toBe(360)
    expect(s).toMatchObject({ deadlineDays: 330, marginDays: -30, lateDays: 30, lateMonths: 1 })
    expect(s.lateCostM).toBeCloseTo(baseDevelopmentCostM(design, tight) * LATE_COST_FRACTION_PER_MONTH * 1, 12)
    expect(s.lateScorePenalty).toBe(LATE_SCORE_PENALTY_PER_MONTH)
    expect(scheduleBreakdown(design, gameData).lateCostM).toBe(0)
  })

  it('costs money: a late design has its own cost line, included in development and the total', () => {
    const late = costBreakdown(design, tight)
    const onTime = costBreakdown(design, gameData)
    const s = scheduleBreakdown(design, tight)
    expect(s.lateCostM).toBeGreaterThan(0)
    expect(late.development.lateM).toBe(s.lateCostM)
    expect(late.lines.find((l) => l.itemId === 'schedule-late')).toEqual({ category: 'development', itemId: 'schedule-late', costM: s.lateCostM })
    expect(late.development.totalM).toBeCloseTo(onTime.development.totalM + s.lateCostM, 12)
    expect(late.totalM).toBeCloseTo(onTime.totalM + s.lateCostM, 12)
    expect(late.lines.reduce((sum, l) => sum + l.costM, 0)).toBeCloseTo(late.totalM, 12)
    expect(late.chart.map((c) => c.category)).toEqual(['development', 'launch', 'operations'])
    expect(onTime.development.lateM).toBe(0)
    expect(onTime.lines.some((l) => l.itemId === 'schedule-late')).toBe(false)
  })

  it('takes points off the efficiency score, never below 0', () => {
    const late = efficiency(design, tight)
    const onTime = efficiency(design, gameData)
    expect(late.inputs.lateMonths).toBe(1)
    expect(onTime.inputs.lateMonths).toBe(0)
    expect(late.points).toBeLessThan(onTime.points)
    const veryLate = efficiency({ ...design, busClassId: 'large' }, withDeadline(0)) // 50 months late: 500 points of penalty
    expect(veryLate.points).toBe(0)
    expect(veryLate.inputs.lateMonths).toBeGreaterThan(15)
  })

  it('warns SCHEDULE_LATE, naming the slowest part, and never blocks launch', () => {
    const slow = withComponent(design, 'battery', 'bat-adv')
    const issues = validateSchedule(slow, withDeadline(400))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'SCHEDULE_LATE', severity: 'warning' })
    expect(issues[0].message).toMatch(/months late/)
    expect(issues[0].message).toContain('Slowest part: ')
    expect(issues[0].message).toContain('(TRL 5)')
    expect(validate(slow, withDeadline(400)).map((i) => i.code)).toContain('SCHEDULE_LATE')
    expect(validateSchedule(design, tight)[0].message).not.toContain('Slowest part') // every part is mature: only the base time and complexity are late

    const review = designReview(design, tight)
    expect(review.disciplines.find((x) => x.discipline === 'risk')!.findings.map((f) => f.code)).toContain('SCHEDULE_LATE')
    expect(review.hardBlockers.map((i) => i.code)).not.toContain('SCHEDULE_LATE')
  })

  it('leaves the time resource (the mission lifetime) alone', () => {
    const late = estimateBudgets(design, tight)
    const onTime = estimateBudgets(design, gameData)
    expect(late.time).toEqual(onTime.time)
    expect(late.time.used).toBe(gameData.scenarios.find((s) => s.id === design.scenarioId)!.durationDays)
  })
})

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const d = withComponent(wildfire(), 'battery', 'bat-adv')
    const snaps = [JSON.stringify(d), JSON.stringify(gameData)]
    scheduleBreakdown(d, gameData)
    validateSchedule(d, withDeadline(100))
    costBreakdown(d, withDeadline(100))
    expect([JSON.stringify(d), JSON.stringify(gameData)]).toEqual(snaps)
  })
})
