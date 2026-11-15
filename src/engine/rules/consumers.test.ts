import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import type { GameData, MissionDesign, ResourceKey } from '../types'
import { resourceConsumers, topConsumers } from './consumers'
import { massBreakdown } from './mass'
import { estimateBudgets, RESOURCE_KEYS } from './resources'

const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!
const UNITS: Record<ResourceKey, string> = { mass: 'kg', power: 'W', budget: 'M USD', data: 'Mb/day', comms: 'min/day', time: '%' }
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0)

describe('topConsumers (acceptance: a ranked list with values)', () => {
  it('returns at most 3 ranked entries with a name, value, unit and share, for every resource and reference design', () => {
    for (const d of REFERENCE_DESIGNS) {
      for (const resource of RESOURCE_KEYS) {
        const top = topConsumers(d, resource, gameData)
        expect(top.length, `${d.scenarioId}/${resource}`).toBeLessThanOrEqual(3)
        expect(top.length, `${d.scenarioId}/${resource} has something that uses it`).toBeGreaterThan(0)
        top.forEach((c, i) => {
          expect(c.rank).toBe(i + 1)
          expect(c.name).not.toBe('')
          expect(c.id).not.toBe('')
          expect(c.value).toBeGreaterThan(0)
          expect(c.unit).toBe(UNITS[resource])
          expect(c.share).toBeGreaterThan(0)
          expect(c.share).toBeLessThanOrEqual(1)
          if (i > 0) expect(c.value).toBeLessThanOrEqual(top[i - 1].value)
        })
      }
    }
  })

  it('takes n, and 3 by default', () => {
    const d = ref('wildfire-eo')
    expect(topConsumers(d, 'mass', gameData)).toHaveLength(3)
    expect(topConsumers(d, 'mass', gameData, 1)).toHaveLength(1)
    expect(topConsumers(d, 'mass', gameData, 0)).toEqual([])
    expect(topConsumers(d, 'mass', gameData, 100)).toEqual(resourceConsumers(d, 'mass', gameData))
  })

  it('prints the top 3 of the Wildfire reference design (for the PR)', () => {
    for (const resource of RESOURCE_KEYS) {
      const line = topConsumers(ref('wildfire-eo'), resource, gameData)
        .map((c) => `${c.rank}. ${c.name} ${Math.round(c.value * 100) / 100} ${c.unit} (${Math.round(c.share * 100)}%)`)
        .join(' | ')
      console.info(`${resource}: ${line}`)
    }
  })
})

describe('consumers add up to the budget', () => {
  it('for mass, power, budget, data and comms the values add up to the `used` of the budget', () => {
    for (const d of REFERENCE_DESIGNS) {
      const budgets = estimateBudgets(d, gameData)
      for (const resource of ['mass', 'power', 'budget', 'data', 'comms'] as const) {
        const total = sum(resourceConsumers(d, resource, gameData).map((c) => c.value))
        expect(Math.abs(total - budgets[resource].used), `${d.scenarioId}/${resource}`).toBeLessThan(0.01)
      }
    }
  })

  it('for time, the shares of the parts add up to 1 and the values to 100 %', () => {
    for (const d of REFERENCE_DESIGNS) {
      const all = resourceConsumers(d, 'time', gameData)
      expect(sum(all.map((c) => c.share)), d.scenarioId).toBeCloseTo(1, 9)
      expect(sum(all.map((c) => c.value)), d.scenarioId).toBeCloseTo(100, 9)
      expect(all.every((c) => c.kind === 'component')).toBe(true)
    }
  })

  it('shares add up to 1 for every other resource too', () => {
    for (const resource of ['mass', 'power', 'budget', 'data', 'comms'] as const) {
      expect(sum(resourceConsumers(ref('space-telescope'), resource, gameData).map((c) => c.share)), resource).toBeCloseTo(1, 9)
    }
  })

  it('still adds up with a late design, redundancy and propellant', () => {
    const d: MissionDesign = { ...ref('wildfire-eo'), redundant: ['comms', 'power'], propellantKg: 12, altitudeKm: 600 }
    const tight: GameData = { ...gameData, scenarios: gameData.scenarios.map((s) => ({ ...s, deadlineDays: 300 })) }
    const budgets = estimateBudgets(d, tight)
    for (const resource of ['mass', 'power', 'budget', 'data', 'comms'] as const) {
      expect(Math.abs(sum(resourceConsumers(d, resource, tight).map((c) => c.value)) - budgets[resource].used), resource).toBeLessThan(0.01)
    }
    const kinds = resourceConsumers(d, 'budget', tight).map((c) => c.kind)
    expect(kinds).toContain('lateCost')
    expect(kinds).toEqual(expect.arrayContaining(['busClass', 'component', 'instrument', 'launcher', 'groundNetwork']))
  })
})

describe('what each resource lists', () => {
  it('shows a redundant subsystem with its doubled mass and redundant: true', () => {
    const base = ref('wildfire-eo')
    const plain = resourceConsumers(base, 'mass', gameData).find((c) => c.id === 'bat-1k')!
    const doubled = resourceConsumers({ ...base, redundant: ['battery'] }, 'mass', gameData).find((c) => c.id === 'bat-1k')!
    expect(plain.value).toBe(8)
    expect(plain.redundant).toBe(false)
    expect(doubled).toMatchObject({ value: 16, redundant: true, subsystem: 'battery', kind: 'component' })
    expect(doubled.name).toContain('backup')
  })

  it('ranks a heavy instrument first for mass and power', () => {
    const d = { ...ref('student-cubesat'), instrumentIds: ['inst-sar'] }
    const sar = gameData.instruments.find((i) => i.id === 'inst-sar')!
    expect(topConsumers(d, 'mass', gameData)[0]).toMatchObject({ rank: 1, kind: 'instrument', id: 'inst-sar', value: sar.massKg })
    expect(topConsumers(d, 'power', gameData)[0]).toMatchObject({ rank: 1, kind: 'instrument', id: 'inst-sar', value: sar.powerW })
  })

  it('applies the duty cycle to power and data', () => {
    const d = { ...ref('wildfire-eo'), instrumentIds: ['inst-thermal-ir'], dutyCycle: { 'inst-thermal-ir': 0.5 } }
    const i = gameData.instruments.find((x) => x.id === 'inst-thermal-ir')!
    expect(resourceConsumers(d, 'power', gameData).find((c) => c.id === i.id)!.value).toBeCloseTo(i.powerW * 0.5, 9)
    expect(resourceConsumers(d, 'data', gameData)).toEqual([expect.objectContaining({ id: i.id, value: i.dataMbPerDay * 0.5 })])
  })

  it('lists propellant and contingency as mass consumers', () => {
    const d = { ...ref('space-telescope') }
    const m = massBreakdown(d, gameData)
    const all = resourceConsumers(d, 'mass', gameData)
    expect(all.find((c) => c.kind === 'propellant')).toMatchObject({ id: 'propellant', value: m.propellantKg, unit: 'kg' })
    expect(all.find((c) => c.kind === 'contingency')).toMatchObject({ id: 'contingency', value: m.contingencyKg })
    expect(resourceConsumers({ ...d, propellantKg: 0 }, 'mass', gameData).some((c) => c.kind === 'propellant')).toBe(false)
  })

  it('does not list generators as power consumers', () => {
    const power = resourceConsumers(ref('wildfire-eo'), 'power', gameData)
    expect(power.some((c) => c.id === 'pwr-array-small')).toBe(false)
    expect(power.every((c) => c.value > 0)).toBe(true)
  })

  it('splits the contact minutes between instruments in proportion to their data', () => {
    const d = { ...ref('wildfire-eo'), instrumentIds: ['inst-thermal-ir', 'inst-multispectral'] }
    const [a, b] = ['inst-thermal-ir', 'inst-multispectral'].map((id) => resourceConsumers(d, 'comms', gameData).find((c) => c.id === id)!)
    const dataA = gameData.instruments.find((i) => i.id === 'inst-thermal-ir')!.dataMbPerDay
    const dataB = gameData.instruments.find((i) => i.id === 'inst-multispectral')!.dataMbPerDay
    expect(a.value / b.value).toBeCloseTo(dataA / dataB, 9)
    expect(a.unit).toBe('min/day')
  })

  it('has no consumers for data and comms without instruments, and none without any parts', () => {
    const none = { ...ref('wildfire-eo'), instrumentIds: [] }
    expect(resourceConsumers(none, 'data', gameData)).toEqual([])
    expect(resourceConsumers(none, 'comms', gameData)).toEqual([])
    const empty = { ...ref('wildfire-eo'), componentIds: {}, instrumentIds: [], busClassId: null, launcherId: null, groundNetworkId: null }
    for (const resource of ['mass', 'power', 'data', 'comms', 'time'] as const) expect(resourceConsumers(empty, resource, gameData), resource).toEqual([])
  })

  it('shows the biggest failure-rate share for time, and the orbit first when it limits the lifetime', () => {
    const d = ref('student-cubesat')
    const top = topConsumers(d, 'time', gameData)
    expect(top[0].value).toBeGreaterThanOrEqual(top[1].value)

    // perfect parts, LEO, no propellant and a thruster: the orbit decays long before the parts fail
    const perfect: GameData = { ...gameData, components: gameData.components.map((c) => ({ ...c, reliability: 0.999999 })) }
    const leo = { ...d, orbitId: 'leo', altitudeKm: 300, componentIds: { ...d.componentIds, propulsion: 'prop-mono' } }
    const all = resourceConsumers(leo, 'time', perfect)
    expect(all[0]).toMatchObject({ rank: 1, kind: 'orbit', id: 'orbitDecay', unit: 'days' })
    expect(all[0].value).toBeLessThan(365)
    expect(all.slice(1).map((c) => c.rank)).toEqual(all.slice(1).map((_, i) => i + 2))
    expect(sum(all.map((c) => c.share))).toBeCloseTo(1, 9)

    const fueled = resourceConsumers({ ...leo, propellantKg: 0.2 }, 'time', perfect)
    expect(fueled[0]).toMatchObject({ kind: 'propellant', id: 'propellant' })
  })

  it('marks a redundant part in the time list, with a smaller failure share than the same part alone', () => {
    const base = ref('wildfire-eo')
    const plain = resourceConsumers(base, 'time', gameData).find((c) => c.id === 'com-xband')?.value ?? 0
    const backed = resourceConsumers({ ...base, redundant: ['comms'] }, 'time', gameData).find((c) => c.id === 'com-xband')
    expect(backed?.redundant).toBe(true)
    expect(backed?.value ?? 0).toBeLessThan(plain)
  })
})

describe('determinism', () => {
  it('breaks ties by id, always in the same order', () => {
    const d: MissionDesign = { ...ref('wildfire-eo'), instrumentIds: ['inst-thermal-ir', 'inst-thermal-ir', 'inst-visible-cam'] }
    const twin: GameData = {
      ...gameData,
      instruments: gameData.instruments.map((i) => (i.id === 'inst-visible-cam' ? { ...i, dataMbPerDay: 15000, massKg: 15, powerW: 40, costM: 10 } : i)),
    }
    for (const resource of ['mass', 'power', 'data', 'budget'] as const) {
      const a = resourceConsumers(d, resource, twin)
      expect(resourceConsumers(d, resource, twin)).toEqual(a)
      const equal = a.filter((c) => c.value === a[0].value)
      expect(equal.map((c) => c.id)).toEqual([...equal.map((c) => c.id)].sort())
    }
    // duplicate instruments are separate entries
    expect(resourceConsumers(d, 'data', twin).filter((c) => c.id === 'inst-thermal-ir')).toHaveLength(2)
  })
})

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const d = { ...ref('wildfire-eo'), redundant: ['comms' as const] }
    const snaps = [JSON.stringify(d), JSON.stringify(gameData)]
    for (const resource of RESOURCE_KEYS) {
      resourceConsumers(d, resource, gameData)
      topConsumers(d, resource, gameData)
    }
    expect([JSON.stringify(d), JSON.stringify(gameData)]).toEqual(snaps)
  })
})
