import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { applyChange, previewChange, previewOptions } from './preview'
import { RESOURCE_KEYS } from './resources'
import { componentOptions } from './components'
import { cubesatDesign } from './testDesign'

const swap = (subsystem: 'battery' | 'power', componentId: string) =>
  ({ kind: 'component', subsystem, componentId }) as const

describe('previewChange', () => {
  it('returns all 6 resources with before, after and deltas', () => {
    const p = previewChange(cubesatDesign(), swap('battery', 'bat-1k'), gameData)
    expect(Object.keys(p).sort()).toEqual([...RESOURCE_KEYS].sort())
    for (const key of RESOURCE_KEYS) {
      expect(p[key].before).toBeDefined()
      expect(p[key].after).toBeDefined()
      expect(p[key].usedDelta).toBeCloseTo(p[key].after.used - p[key].before.used, 9)
      expect(p[key].availableDelta).toBeCloseTo(p[key].after.available - p[key].before.available, 9)
      expect(p[key].marginDelta).toBeCloseTo(p[key].after.margin - p[key].before.margin, 9)
    }
  })

  it('bat-40 -> bat-1k adds 8.47 kg (7.7 kg + 10% contingency) and 0.48 M USD', () => {
    const p = previewChange(cubesatDesign(), swap('battery', 'bat-1k'), gameData)
    expect(p.mass.usedDelta).toBeCloseTo(8.47, 6)
    expect(p.budget.usedDelta).toBeCloseTo(0.48, 6)
  })

  it('body-mounted -> deployable panels raises available power', () => {
    const p = previewChange(cubesatDesign(), swap('power', 'pwr-deploy'), gameData)
    expect(p.power.availableDelta).toBeGreaterThan(0)
  })

  it('adding the visible camera raises data by 2000 and power by 5', () => {
    const p = previewChange(cubesatDesign(), { kind: 'addInstrument', instrumentId: 'inst-visible-cam' }, gameData)
    expect(p.data.usedDelta).toBe(2000)
    expect(p.power.usedDelta).toBe(5)
  })

  it('a less reliable part lowers available lifetime', () => {
    const p = previewChange(cubesatDesign(), swap('battery', 'bat-adv'), gameData)
    expect(p.time.availableDelta).toBeLessThan(0)
  })

  it('changing the bus class changes mass and cost availability', () => {
    const p = previewChange(cubesatDesign(), { kind: 'busClass', busClassId: 'cubesat-12u' }, gameData)
    expect(p.mass.availableDelta).toBeGreaterThan(0) // 6 -> 24 kg, launcher allows 24
    expect(p.budget.usedDelta).toBeCloseTo(0.3, 6)
  })
})

describe('applyChange', () => {
  it('returns a new design and never mutates the input', () => {
    const d = cubesatDesign({ instrumentIds: ['inst-visible-cam'] })
    const copy = structuredClone(d)
    const changes = [
      swap('battery', 'bat-1k'),
      { kind: 'component', subsystem: 'battery', componentId: null },
      { kind: 'busClass', busClassId: 'smallsat' },
      { kind: 'addInstrument', instrumentId: 'inst-magnetometer' },
      { kind: 'removeInstrument', instrumentId: 'inst-visible-cam' },
    ] as const
    for (const c of changes) {
      const next = applyChange(d, c)
      expect(next).not.toBe(d)
      expect(d).toEqual(copy)
    }
    previewChange(d, swap('battery', 'bat-1k'), gameData)
    expect(d).toEqual(copy)
  })

  it('removes a component, adds duplicates, and removes one occurrence', () => {
    const d = cubesatDesign({ instrumentIds: ['inst-visible-cam'] })
    expect('battery' in applyChange(d, { kind: 'component', subsystem: 'battery', componentId: null }).componentIds).toBe(false)
    const two = applyChange(d, { kind: 'addInstrument', instrumentId: 'inst-visible-cam' })
    expect(two.instrumentIds).toEqual(['inst-visible-cam', 'inst-visible-cam'])
    expect(applyChange(two, { kind: 'removeInstrument', instrumentId: 'inst-visible-cam' }).instrumentIds).toEqual(['inst-visible-cam'])
    expect(applyChange(d, { kind: 'removeInstrument', instrumentId: 'nope' }).instrumentIds).toEqual(['inst-visible-cam'])
  })
})

describe('previewOptions', () => {
  it('returns one preview per battery option', () => {
    const p = previewOptions(cubesatDesign(), 'battery', gameData)
    const ids = componentOptions('battery', gameData, 'cadet').map((c) => c.id)
    expect(Object.keys(p).sort()).toEqual([...ids].sort())
    expect(p['bat-40'].mass.usedDelta).toBe(0) // the current choice changes nothing
    expect(Object.keys(p['bat-1k']).sort()).toEqual([...RESOURCE_KEYS].sort())
  })
})
