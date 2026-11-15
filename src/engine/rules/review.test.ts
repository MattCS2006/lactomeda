import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import type { Difficulty, MissionDesign, ResourceKey } from '../types'
import { costBreakdown } from './cost'
import { DISCIPLINES, designReview, disciplineOf, launchDecision } from './review'
import { RESOURCE_KEYS, estimateBudgets } from './resources'

const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!
const at = (d: MissionDesign, difficulty: Difficulty): MissionDesign => ({ ...d, difficulty })
const codes = (d: MissionDesign) => designReview(d, gameData).disciplines.flatMap((x) => x.findings.map((f) => f.code))
const disciplineCodes = (d: MissionDesign, discipline: string) =>
  designReview(d, gameData).disciplines.find((x) => x.discipline === discipline)!.findings.map((f) => f.code)

// Over budget: wildfire EO on a heavy launcher (162.1 M vs 120 M). Hardware and the orbit are fine.
const overBudget = (): MissionDesign => ({ ...ref('wildfire-eo'), launcherId: 'lv-heavy' })
// Hard blockers: a subsystem is missing, or the launcher cannot reach the orbit.
const missingSubsystem = (): MissionDesign => {
  const d = ref('wildfire-eo')
  const componentIds = { ...d.componentIds }
  delete componentIds.thermal
  return { ...d, componentIds }
}
const unreachable = (): MissionDesign => ({ ...ref('student-cubesat'), orbitId: 'geo' })

describe('launchDecision', () => {
  it('blocks a red resource, allows accepted risk on Engineer and Flight Director, never on Cadet', () => {
    const review = designReview(at(overBudget(), 'cadet'), gameData)
    expect(review.riskBlockers.resources).toContain('budget')
    expect(review.hardBlockers).toEqual([])

    expect(launchDecision(review, false)).toEqual({ allowed: false, reason: 'cadetCannotAcceptRisk' })
    expect(launchDecision(review, true)).toEqual({ allowed: false, reason: 'cadetCannotAcceptRisk' })
    expect(review.canAcceptRisk).toBe(false)

    for (const difficulty of ['engineer', 'flightDirector'] as const) {
      const r = designReview(at(overBudget(), difficulty), gameData)
      expect(r.canAcceptRisk).toBe(true)
      expect(launchDecision(r, false)).toEqual({ allowed: false, reason: 'riskNotAccepted' })
      expect(launchDecision(r, true)).toEqual({ allowed: true, reason: 'riskAccepted' })
    }
  })

  it('lists an OVER_BUDGET error among the risk blockers', () => {
    const review = designReview(at(overBudget(), 'engineer'), gameData)
    expect(review.riskBlockers.issues.map((i) => i.code)).toContain('OVER_BUDGET')
  })

  it.each([
    ['a missing subsystem', missingSubsystem(), 'MISSING_SUBSYSTEM'],
    ['a launcher that cannot reach the orbit', unreachable(), 'LAUNCH_REGIME_UNSUPPORTED'],
  ])('is blocked by %s even with risk accepted on Flight Director', (_name, design, code) => {
    const review = designReview(at(design, 'flightDirector'), gameData)
    expect(review.hardBlockers.map((i) => i.code)).toContain(code)
    expect(launchDecision(review, true)).toEqual({ allowed: false, reason: 'hardBlockers' })
    expect(launchDecision(review, false)).toEqual({ allowed: false, reason: 'hardBlockers' })
  })

  it('treats no ground network, no comms, an unknown id and a wrong subsystem as hard blockers', () => {
    const base = ref('wildfire-eo')
    const noNet = designReview({ ...base, groundNetworkId: null }, gameData)
    expect(noNet.hardBlockers.map((i) => i.code)).toContain('MISSING_GROUND_NETWORK')
    const noComms = designReview({ ...base, componentIds: { ...base.componentIds, comms: undefined } }, gameData)
    expect(noComms.hardBlockers.map((i) => i.code)).toContain('NO_COMMS')
    const wrong = designReview({ ...base, componentIds: { ...base.componentIds, thermal: 'bat-1k' } }, gameData)
    expect(wrong.hardBlockers.map((i) => i.code)).toContain('WRONG_SUBSYSTEM')
    const unknown = designReview({ ...base, launcherId: 'nope' }, gameData)
    expect(unknown.hardBlockers.map((i) => i.code)).toContain('UNKNOWN_LAUNCHER')
  })

  it('never blocks launch for warnings', () => {
    // Wildfire EO with a small computer: STORAGE_TOO_SMALL is a warning and no resource is red.
    const wildfire = ref('wildfire-eo')
    const d: MissionDesign = { ...wildfire, componentIds: { ...wildfire.componentIds, computer: 'obc-cubesat' } }
    const review = designReview(d, gameData)
    const found = review.disciplines.flatMap((x) => x.findings)
    expect(found.some((f) => f.severity === 'warning')).toBe(true)
    expect(review.riskBlockers.issues).toEqual([])
    expect(launchDecision(review, false)).toEqual({ allowed: true, reason: 'clear' })
  })
})

describe('reference designs', () => {
  it.each(REFERENCE_DESIGNS.map((d) => [d.scenarioId, d] as const))('%s is clear to launch', (_id, d) => {
    const review = designReview(d, gameData)
    expect(review.hardBlockers).toEqual([])
    expect(review.riskBlockers).toEqual({ resources: [], issues: [] })
    expect(review.resources.every((r) => r.verdict === 'go' || r.verdict === 'concern')).toBe(true)
    expect(launchDecision(review, false)).toEqual({ allowed: true, reason: 'clear' })
    expect(review.overallVerdict).not.toBe('noGo')
  })
})

describe('resources', () => {
  it('has all 6 in order with verdicts matching the budget status', () => {
    const design = overBudget()
    const review = designReview(design, gameData)
    const budgets = estimateBudgets(design, gameData)
    expect(review.resources.map((r) => r.resource)).toEqual([...RESOURCE_KEYS])
    const expected = { green: 'go', amber: 'concern', red: 'noGo' } as const
    for (const r of review.resources) {
      expect(r.budget).toEqual(budgets[r.resource])
      expect(r.verdict).toBe(expected[budgets[r.resource].status])
    }
    expect(review.resources.find((r) => r.resource === 'budget')!.verdict).toBe('noGo')
  })
})

describe('disciplines', () => {
  it('has all 9 in order, each with at least one finding, and the risk summary', () => {
    for (const d of [...REFERENCE_DESIGNS, overBudget(), missingSubsystem()]) {
      const review = designReview(d, gameData)
      expect(review.disciplines.map((x) => x.discipline)).toEqual([...DISCIPLINES])
      for (const x of review.disciplines) expect(x.findings.length, x.discipline).toBeGreaterThanOrEqual(1)
      expect(review.disciplines.find((x) => x.discipline === 'risk')!.findings.map((f) => f.code)).toContain('RISK_SUMMARY')
    }
  })

  it('adds a positive DISCIPLINE_OK finding with numbers to a clean discipline', () => {
    const review = designReview(ref('wildfire-eo'), gameData)
    const power = review.disciplines.find((x) => x.discipline === 'power')!
    expect(power.verdict).toBe('go')
    expect(power.findings).toEqual([expect.objectContaining({ code: 'DISCIPLINE_OK', severity: 'ok' })])
    expect(power.findings[0].message).toBe('Power: generation covers the load with 45% margin (363 W vs 200 W).')
    const risk = review.disciplines.find((x) => x.discipline === 'risk')!.findings.find((f) => f.code === 'RISK_SUMMARY')!
    expect(risk.message).toBe('System reliability 89%, launcher reliability 97%.')
  })

  it('takes the worst finding as the discipline verdict', () => {
    const review = designReview(overBudget(), gameData)
    expect(review.disciplines.find((x) => x.discipline === 'cost')!.verdict).toBe('noGo')
    expect(review.disciplines.find((x) => x.discipline === 'power')!.verdict).toBe('go')
    expect(review.overallVerdict).toBe('noGo')
  })

  it('puts each issue in the expected discipline', () => {
    const student = ref('student-cubesat')
    const battery = designReview({ ...student, instrumentIds: ['inst-thermal-ir'], componentIds: { ...student.componentIds, power: 'pwr-array-small' } }, gameData)
    expect(battery.disciplines.find((x) => x.discipline === 'power')!.findings.map((f) => f.code)).toContain('BATTERY_TOO_SMALL')

    expect(disciplineCodes({ ...student, orbitId: 'mars' }, 'propulsion')).toContain('INSUFFICIENT_DELTA_V')
    expect(disciplineCodes(overBudget(), 'cost')).toContain('OVER_BUDGET')
    const lossy: MissionDesign = { ...student, componentIds: { ...student.componentIds, comms: 'com-uhf' } }
    expect(disciplineCodes(lossy, 'comms')).toContain('DATA_LOSS')
    expect(disciplineCodes(lossy, 'comms')).toContain('DOWNLINK_BOTTLENECK')
    expect(disciplineCodes(missingSubsystem(), 'thermal')).toContain('MISSING_SUBSYSTEM')
    expect(disciplineCodes(unreachable(), 'structures')).toContain('LAUNCH_REGIME_UNSUPPORTED')
    const wildfire = ref('wildfire-eo')
    expect(disciplineCodes({ ...wildfire, componentIds: { ...wildfire.componentIds, computer: 'obc-cubesat' } }, 'avionics')).toContain('STORAGE_TOO_SMALL')
    expect(disciplineCodes({ ...wildfire, groundNetworkId: null }, 'comms')).toContain('MISSING_GROUND_NETWORK')
    expect(disciplineCodes({ ...wildfire, componentIds: { ...wildfire.componentIds, attitude: undefined } }, 'attitude')).toContain('MISSING_SUBSYSTEM')
  })

  it('maps each issue to exactly one discipline, first match winning', () => {
    expect(disciplineOf({ code: 'STORAGE_TOO_SMALL', subsystem: 'computer', resource: 'data' })).toBe('avionics')
    expect(disciplineOf({ code: 'POWER_SHORTFALL', subsystem: 'power', resource: 'power' })).toBe('power')
    expect(disciplineOf({ code: 'LAUNCH_OVER_CAPACITY', resource: 'mass' })).toBe('structures')
    expect(disciplineOf({ code: 'SOMETHING_NEW' })).toBe('risk')
    // every issue of a broken design appears exactly once across the disciplines
    const d = { ...missingSubsystem(), launcherId: 'lv-heavy', groundNetworkId: null }
    const review = designReview(d, gameData)
    const real = review.disciplines.flatMap((x) => x.findings).filter((f) => f.severity !== 'ok')
    const keys = real.map((f) => `${f.code}|${f.subsystem ?? ''}|${f.resource ?? ''}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('reports a red resource that has no explaining issue, such as time', () => {
    const d = ref('student-cubesat')
    // Unreliable parts (0.5 each) make the median life shorter than the mission: the time budget goes red, with no issue.
    const short: typeof gameData = { ...gameData, components: gameData.components.map((c) => ({ ...c, reliability: 0.5 })) }
    const review = designReview(d, short)
    expect(review.resources.find((r) => r.resource === 'time')!.verdict).toBe('noGo')
    expect(review.disciplines.find((x) => x.discipline === 'risk')!.findings.map((f) => f.code)).toContain('RESOURCE_RED')
    expect(review.riskBlockers.resources).toContain('time' satisfies ResourceKey)
  })
})

describe('equipment', () => {
  it('lists the bus, every component, every instrument, the launcher and the network with their numbers', () => {
    const d: MissionDesign = { ...ref('wildfire-eo'), redundant: ['battery'] }
    const review = designReview(d, gameData)
    const eq = review.equipment
    expect(eq.map((e) => e.kind).filter((k) => k === 'busClass')).toHaveLength(1)
    expect(eq.filter((e) => e.kind === 'component')).toHaveLength(Object.keys(d.componentIds).length)
    expect(eq.filter((e) => e.kind === 'instrument').map((e) => e.id)).toEqual(d.instrumentIds)
    expect(eq.find((e) => e.kind === 'launcher')!.id).toBe('lv-rideshare')
    expect(eq.find((e) => e.kind === 'groundNetwork')!.id).toBe('gn-university')

    const battery = eq.find((e) => e.id === 'bat-1k')!
    expect(battery).toMatchObject({ subsystem: 'battery', redundant: true, massKg: 16, costM: 1, trl: 9 })
    const computer = eq.find((e) => e.subsystem === 'computer')!
    expect(computer.redundant).toBe(false)
    expect(computer.massKg).toBe(2)
    expect(computer.trl).toBeGreaterThanOrEqual(1)
    const camera = eq.find((e) => e.id === 'inst-multispectral')!
    expect(camera).toMatchObject({ massKg: 25, costM: 15 })
    expect(camera.powerW).toBeGreaterThan(0)
  })

  it('has costs that add up to the cost total', () => {
    for (const d of [...REFERENCE_DESIGNS, { ...ref('wildfire-eo'), redundant: ['battery' as const] }]) {
      const total = designReview(d, gameData).equipment.reduce((a, e) => a + e.costM, 0)
      expect(total).toBeCloseTo(costBreakdown(d, gameData).totalM, 9)
    }
  })
})

describe('purity', () => {
  it('does not mutate the design or the data', () => {
    const d = { ...overBudget(), redundant: ['battery' as const] }
    const dSnap = JSON.stringify(d)
    const gSnap = JSON.stringify(gameData)
    const review = designReview(d, gameData)
    launchDecision(review, true)
    expect(JSON.stringify(d)).toBe(dSnap)
    expect(JSON.stringify(gameData)).toBe(gSnap)
    expect(codes(d).length).toBeGreaterThan(0)
  })
})
