import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { makeBudget } from '../budgets'
import type { GameData } from '../types'
import { cubesatDesign } from './testDesign'
import { RESOURCE_KEYS, estimateBudgets } from './resources'

describe('makeBudget', () => {
  it('has margin 0 when nothing is available, and is red if something is used', () => {
    expect(makeBudget(0, 0)).toMatchObject({ margin: 0, status: 'amber' })
    expect(makeBudget(1, 0)).toMatchObject({ margin: 0, status: 'red' })
  })
})

describe('estimateBudgets', () => {
  it('returns all 6 resources', () => {
    const b = estimateBudgets(cubesatDesign(), gameData)
    expect(Object.keys(b).sort()).toEqual([...RESOURCE_KEYS].sort())
  })

  it('sums mass, doubles redundant parts, and caps availability by the launcher', () => {
    const base = estimateBudgets(cubesatDesign(), gameData)
    const redundant = estimateBudgets(cubesatDesign({ redundant: ['battery'] }), gameData)
    expect(redundant.mass.used - base.mass.used).toBeCloseTo(0.33, 6) // 0.3 kg battery + 10% cadet contingency
    expect(base.mass.available).toBe(6) // bus 6 kg, launcher 24 kg
    const capped = estimateBudgets(cubesatDesign({ busClassId: 'cubesat-12u', launcherId: 'lv-cubesat' }), gameData)
    expect(capped.mass.available).toBe(6) // launcher 6 kg < bus 24 kg
    const noRegime = estimateBudgets(cubesatDesign({ orbitId: 'mars' }), gameData)
    expect(noRegime.mass.available).toBe(0)
  })

  it('has less solar power at Mars than in LEO, and the RTG ignores distance and eclipse', () => {
    const leo = estimateBudgets(cubesatDesign(), gameData).power.available
    const mars = estimateBudgets(cubesatDesign({ orbitId: 'mars' }), gameData).power.available
    expect(mars).toBeLessThan(leo)
    const rtg = (orbitId: string) =>
      estimateBudgets(
        cubesatDesign({ orbitId, componentIds: { ...cubesatDesign().componentIds, power: 'pwr-rtg' } }),
        gameData,
      ).power.available
    // 110 W at beginning of life, minus 4%/year over the 365-day scenario (FR-6.4)
    expect(rtg('mars')).toBeCloseTo(110 * 0.96, 9)
    expect(rtg('leo')).toBeCloseTo(110 * 0.96, 9)
  })

  it('gives a deepSpace antenna more downlink than a plain one with the same rate', () => {
    const hga = gameData.components.find((c) => c.id === 'com-hga')!
    const data: GameData = { ...gameData, components: [...gameData.components, { ...hga, id: 'com-hga-plain', tags: [] }] }
    const withComms = (id: string) =>
      estimateBudgets(cubesatDesign({ orbitId: 'l2', groundNetworkId: 'gn-dsn', componentIds: { ...cubesatDesign().componentIds, comms: id } }), data)
    expect(withComms('com-hga').data.available).toBeGreaterThan(withComms('com-hga-plain').data.available)
  })

  it('is red on comms when there is data but no link', () => {
    const b = estimateBudgets(cubesatDesign({ instrumentIds: ['inst-visible-cam'], groundNetworkId: null }), gameData)
    expect(b.data.available).toBe(0)
    expect(b.comms.status).toBe('red')
    expect(estimateBudgets(cubesatDesign(), gameData).comms.used).toBe(0)
  })

  it('adds ground network cost per year of mission', () => {
    const without = estimateBudgets(cubesatDesign({ groundNetworkId: null }), gameData).budget.used
    const withNet = estimateBudgets(cubesatDesign(), gameData).budget.used
    expect(withNet - without).toBeCloseTo(0.05, 9) // gn-university 0.05 M/yr x 365 d
    expect(estimateBudgets(cubesatDesign(), gameData).budget.available).toBe(2)
  })

  it('maps lifetime to time: required days vs median life, and redundancy raises it', () => {
    const b = estimateBudgets(cubesatDesign(), gameData)
    expect(b.time.used).toBe(365)
    const redundant = estimateBudgets(cubesatDesign({ redundant: ['battery', 'comms'] }), gameData)
    expect(redundant.time.available).toBeGreaterThan(b.time.available)
  })

  it('never throws on unknown ids', () => {
    const d = cubesatDesign({ busClassId: 'x', scenarioId: 'x', orbitId: 'x', launcherId: 'x', groundNetworkId: 'x', instrumentIds: ['x'], componentIds: { power: 'x' } })
    expect(() => estimateBudgets(d, gameData)).not.toThrow()
  })
})
