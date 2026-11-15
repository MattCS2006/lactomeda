import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { RESOURCE_KEYS, estimateBudgets } from '../../engine/rules/resources'
import type { MissionDesign } from '../../engine/types'
import en from '../../i18n/en.json'
import { createDesign } from '../store/missionStore'
import { formatAmount, needsFor, resourceCells } from './resourceBarView'

const first = (subsystem: string) => gameData.components.find((c) => c.subsystem === subsystem)!.id
const fresh = (): MissionDesign => createDesign('student-cubesat', gameData, 'cadet', 's')
/** A CubeSat with every choice made, so every resource has an "available" side. */
const complete = (): MissionDesign => ({
  ...fresh(),
  busClassId: 'cubesat-3u',
  componentIds: Object.fromEntries(
    ['structure', 'power', 'battery', 'computer', 'attitude', 'propulsion', 'thermal', 'comms'].map((s) => [
      s,
      first(s),
    ]),
  ),
  instrumentIds: ['inst-visible-cam'],
  orbitId: 'leo',
  launcherId: 'lv-cubesat',
  groundNetworkId: 'gn-university',
})

describe('persistent resource bar (FR-6.1)', () => {
  it('shows the 6 resources in order: Mass, Power, Budget, Data, Comms, Time', () => {
    expect(resourceCells(fresh(), gameData).map((c) => c.key)).toEqual([
      'mass',
      'power',
      'budget',
      'data',
      'comms',
      'time',
    ])
    for (const k of RESOURCE_KEYS) expect(en.resource).toHaveProperty(k)
  })

  it('each resource shows used / available and margin % once its choices are made', () => {
    const d = complete()
    const budgets = estimateBudgets(d, gameData)
    for (const cell of resourceCells(d, gameData)) {
      expect(cell.needs, cell.key).toEqual([])
      expect(cell.available, cell.key).not.toBeNull()
      expect(cell.marginPct, cell.key).toBe(Math.round(budgets[cell.key].margin * 100))
      expect(cell.status, cell.key).toBe(budgets[cell.key].status)
    }
  })

  it('uses the engine numbers', () => {
    const d = complete()
    const budget = resourceCells(d, gameData).find((c) => c.key === 'budget')!
    const b = estimateBudgets(d, gameData).budget
    expect(budget.used).toBe(`$${formatAmount(b.used)}M`)
    expect(budget.available).toBe(`$${formatAmount(b.available)}M`)
  })

  it('a fresh design is not shown as red: missing capacities are pending with what they need', () => {
    const cells = Object.fromEntries(resourceCells(fresh(), gameData).map((c) => [c.key, c]))
    expect(cells.mass).toMatchObject({ available: null, marginPct: null, status: null, needs: ['bus'] })
    expect(cells.power.needs).toEqual(['power'])
    expect(cells.data.needs).toEqual(['comms', 'orbit', 'ground'])
    expect(cells.comms.needs).toEqual(['comms', 'orbit', 'ground'])
    expect(cells.time.needs).toEqual(['parts'])
    // the scenario budget is known from the start
    expect(cells.budget.needs).toEqual([])
    expect(cells.budget.available).toBe('$2M')
    for (const c of Object.values(cells)) for (const n of c.needs) expect(en.resources.need).toHaveProperty(n)
  })

  it('updates when the design changes', () => {
    const d = complete()
    const before = resourceCells(d, gameData).find((c) => c.key === 'mass')!.used
    const after = resourceCells({ ...d, instrumentIds: [...d.instrumentIds, 'inst-magnetometer'] }, gameData).find(
      (c) => c.key === 'mass',
    )!.used
    expect(after).not.toBe(before)
  })

  it('needsFor reacts to each choice', () => {
    expect(needsFor('data', { ...fresh(), orbitId: 'leo', groundNetworkId: 'gn-university' })).toEqual(['comms'])
    expect(needsFor('mass', { ...fresh(), busClassId: 'cubesat-3u' })).toEqual([])
  })

  it('formats amounts', () => {
    expect(formatAmount(1234.4)).toBe('1,234')
    expect(formatAmount(56.78)).toBe('56.8')
    expect(formatAmount(0.254)).toBe('0.25')
    expect(formatAmount(Infinity)).toBe('—')
  })
})
