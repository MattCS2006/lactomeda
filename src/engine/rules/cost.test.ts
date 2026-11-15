import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import type { GameData, MissionDesign } from '../types'
import { costBreakdown, validateCost } from './cost'
import { estimateBudgets } from './resources'

const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!
const withScenario = (id: string, over: Partial<GameData['scenarios'][number]>): GameData => ({
  ...gameData,
  scenarios: gameData.scenarios.map((s) => (s.id === id ? { ...s, ...over } : s)),
})

// Hand computation (M USD) from the catalog.
const HAND: Record<string, { bus: number; components: number; instruments: number; launch: number; operations: number; budget: number }> = {
  // bus 0.1; parts 0.05 + 0.15 + 0.02 + 0.03 + 0.02 + 0 + 0.01 + 0.1; camera 0.2 + magnetometer 0.1; deployer 0.9; university 0.05/yr x 1 yr
  'student-cubesat': { bus: 0.1, components: 0.38, instruments: 0.3, launch: 0.9, operations: 0.05, budget: 2 },
  // bus 5; parts 3 + 3 + 0.5 + 1 + 2.5 + 0 + 0.5 + 1.5; multispectral 15 + thermal IR 10; rideshare 30; university 0.05/yr x 2 yr
  'wildfire-eo': { bus: 5, components: 12, instruments: 25, launch: 30, operations: 0.1, budget: 120 },
  // bus 200; parts 25 + 20 + 3 + 5 + 30 + 3 + 80 + 15; telescope 500; Falcon 9-like 70; NASA NEN 5/yr x 5 yr
  'space-telescope': { bus: 200, components: 181, instruments: 500, launch: 70, operations: 25, budget: 1000 },
}

describe('costBreakdown against the reference designs', () => {
  it('covers every scenario', () => {
    expect(Object.keys(HAND).sort()).toEqual(REFERENCE_DESIGNS.map((d) => d.scenarioId).sort())
  })

  it.each(Object.entries(HAND))('%s matches the hand computation', (scenarioId, hand) => {
    const c = costBreakdown(ref(scenarioId), gameData)
    const dev = hand.bus + hand.components + hand.instruments
    expect(c.development.busM).toBeCloseTo(hand.bus, 9)
    expect(c.development.componentsM).toBeCloseTo(hand.components, 9)
    expect(c.development.instrumentsM).toBeCloseTo(hand.instruments, 9)
    expect(c.development.totalM).toBeCloseTo(dev, 9)
    expect(c.launchM).toBeCloseTo(hand.launch, 9)
    expect(c.operations.totalM).toBeCloseTo(hand.operations, 9)
    expect(c.totalM).toBeCloseTo(dev + hand.launch + hand.operations, 9)
    expect(c.budgetM).toBe(hand.budget)
    expect(c.remainingM).toBeCloseTo(hand.budget - c.totalM, 9)
    expect(c.remainingM).toBeGreaterThanOrEqual(0)
    expect(validateCost(ref(scenarioId), gameData)).toEqual([])
  })
})

describe('chart data', () => {
  it('has exactly 3 entries in order, matching the breakdown, with fractions that sum to 1', () => {
    const c = costBreakdown(ref('wildfire-eo'), gameData)
    expect(c.chart.map((e) => e.category)).toEqual(['development', 'launch', 'operations'])
    expect(c.chart.map((e) => e.valueM)).toEqual([c.development.totalM, c.launchM, c.operations.totalM])
    expect(c.chart.reduce((a, e) => a + e.fraction, 0)).toBeCloseTo(1, 12)
    expect(c.chart[1].fraction).toBeCloseTo(30 / 72.1, 12)
  })

  it('has all-zero fractions when nothing is chosen', () => {
    const empty: MissionDesign = { ...ref('wildfire-eo'), busClassId: null, componentIds: {}, instrumentIds: [], launcherId: null, groundNetworkId: null }
    const c = costBreakdown(empty, gameData)
    expect(c.totalM).toBe(0)
    expect(c.chart.map((e) => e.fraction)).toEqual([0, 0, 0])
  })
})

describe('costBreakdown rules', () => {
  it('scales operations with the mission lifetime', () => {
    const d = ref('space-telescope')
    const base = costBreakdown(d, gameData)
    const doubled = costBreakdown(d, withScenario('space-telescope', { durationDays: 2 * 1825 }))
    expect(doubled.operations.years).toBeCloseTo(2 * base.operations.years, 12)
    expect(doubled.operations.totalM).toBeCloseTo(2 * base.operations.totalM, 9)
    expect(doubled.development.totalM).toBe(base.development.totalM)
    expect(doubled.launchM).toBe(base.launchM)
  })

  it('doubles the component cost of a redundant subsystem', () => {
    const d = ref('wildfire-eo')
    const base = costBreakdown(d, gameData)
    const redundant = costBreakdown({ ...d, redundant: ['battery'] }, gameData)
    expect(redundant.development.componentsM - base.development.componentsM).toBeCloseTo(0.5, 9) // bat-1k costs 0.5
  })

  it('has lines that add up to the total', () => {
    for (const d of REFERENCE_DESIGNS) {
      const c = costBreakdown({ ...d, redundant: ['battery'] }, gameData)
      expect(c.lines.reduce((a, l) => a + l.costM, 0)).toBeCloseTo(c.totalM, 9)
      expect(c.lines.some((l) => l.itemId === d.launcherId && l.category === 'launch')).toBe(true)
      expect(c.lines.some((l) => l.itemId === d.groundNetworkId && l.category === 'operations')).toBe(true)
    }
  })

  it('contributes 0 for a missing launcher, network, bus or unknown ids, without throwing', () => {
    const d = { ...ref('student-cubesat'), launcherId: null, groundNetworkId: 'nope', busClassId: null, instrumentIds: ['nope'] }
    const c = costBreakdown(d, gameData)
    expect(c.launchM).toBe(0)
    expect(c.operations.totalM).toBe(0)
    expect(c.development.busM).toBe(0)
    expect(c.development.instrumentsM).toBe(0)
    expect(c.totalM).toBeCloseTo(0.38, 9)
  })

  it('matches estimateBudgets budget used and available', () => {
    for (const d of REFERENCE_DESIGNS) {
      const c = costBreakdown(d, gameData)
      const b = estimateBudgets(d, gameData).budget
      expect(b.used).toBe(c.totalM)
      expect(b.available).toBe(c.budgetM)
    }
  })
})

describe('validateCost', () => {
  it('flags OVER_BUDGET with the excess and the biggest category', () => {
    const d = { ...ref('wildfire-eo'), launcherId: 'lv-heavy' } // launch 120 M pushes the total to 162.1 M vs 120 M
    const issues = validateCost(d, gameData)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'OVER_BUDGET', severity: 'error', resource: 'budget' })
    expect(issues[0].message).toContain('42.1 M')
    expect(issues[0].message).toContain('development 42 M, launch 120 M, operations 0.1 M')
    expect(issues[0].message).toContain('biggest cost is launch')
  })

  it('has no issue when within budget (exactly on budget included)', () => {
    expect(validateCost(ref('student-cubesat'), gameData)).toEqual([])
    const exact = withScenario('student-cubesat', { budgetM: costBreakdown(ref('student-cubesat'), gameData).totalM })
    expect(validateCost(ref('student-cubesat'), exact)).toEqual([])
  })
})

describe('purity', () => {
  it('does not mutate the design or the data', () => {
    const d = { ...ref('wildfire-eo'), redundant: ['battery' as const] }
    const dSnap = JSON.stringify(d)
    const gSnap = JSON.stringify(gameData)
    costBreakdown(d, gameData)
    validateCost(d, gameData)
    expect(JSON.stringify(d)).toBe(dSnap)
    expect(JSON.stringify(gameData)).toBe(gSnap)
  })
})
