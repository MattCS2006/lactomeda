import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import type { Component, GameData, Instrument, MissionDesign, Subsystem } from '../types'
import { busClassUsage, canAddInstrument, canAddRedundancy, validateBusClass } from './busClass'

const SUBSYSTEMS: Subsystem[] = ['structure', 'power', 'battery', 'computer', 'attitude', 'propulsion', 'thermal', 'comms']

// Synthetic light parts so the tests do not depend on catalog balance.
const parts: Component[] = SUBSYSTEMS.map((s) => ({
  id: `t-${s}`, subsystem: s, name: s, tier: 'simple', massKg: 0.5, powerW: 1, costM: 0.01, trl: 9, reliability: 0.95,
}))
const inst = (id: string, massKg: number): Instrument => ({
  id, name: id, massKg, powerW: 1, costM: 0.1, dataMbPerDay: 1, science: 1, objectives: [], preferredOrbits: [],
})
const data: GameData = {
  ...gameData,
  components: parts,
  instruments: [inst('i-light-a', 0.2), inst('i-light-b', 0.2), inst('i-light-c', 0.2), inst('i-heavy', 25)],
}

const design = (over: Partial<MissionDesign> = {}): MissionDesign => ({
  scenarioId: 's', difficulty: 'cadet', requirementLevels: {}, busClassId: 'cubesat-3u',
  componentIds: Object.fromEntries(SUBSYSTEMS.map((s) => [s, `t-${s}`])),
  redundant: [], propellantKg: 0, instrumentIds: ['i-light-a'], dutyCycle: {},
  orbitId: null, launcherId: null, groundNetworkId: null, seed: 'x', ...over,
})

describe('validateBusClass', () => {
  it('passes a light 3U CubeSat', () => {
    expect(validateBusClass(design(), data)).toEqual([])
  })

  it('rejects 3 instruments in a 3U, and canAddInstrument is false at 2/2', () => {
    const three = design({ instrumentIds: ['i-light-a', 'i-light-b', 'i-light-c'] })
    expect(validateBusClass(three, data).map((i) => i.code)).toEqual(['TOO_MANY_INSTRUMENTS'])
    expect(canAddInstrument(design({ instrumentIds: ['i-light-a'] }), data)).toBe(true)
    expect(canAddInstrument(design({ instrumentIds: ['i-light-a', 'i-light-b'] }), data)).toBe(false)
  })

  it('fits 1 redundant subsystem in a 3U (9/9) but not 2', () => {
    const one = design({ redundant: ['power'] })
    expect(validateBusClass(one, data)).toEqual([])
    expect(busClassUsage(one, data)?.componentSlotsUsed).toBe(9)
    expect(canAddRedundancy(one, data)).toBe(false)
    expect(canAddRedundancy(design(), data)).toBe(true)

    const two = design({ redundant: ['power', 'comms'] })
    expect(validateBusClass(two, data).map((i) => i.code)).toEqual(['TOO_MANY_COMPONENTS'])
  })

  it('flags a 25 kg instrument in a 3U as OVER_BUS_MASS, but passes in a smallsat', () => {
    const heavy = design({ instrumentIds: ['i-heavy'] })
    const issues = validateBusClass(heavy, data)
    expect(issues.map((i) => i.code)).toEqual(['OVER_BUS_MASS'])
    expect(issues[0].resource).toBe('mass')
    expect(issues[0].severity).toBe('error')
    expect(validateBusClass({ ...heavy, busClassId: 'smallsat' }, data)).toEqual([])
  })

  it('counts redundant mass twice and includes propellant', () => {
    const u = busClassUsage(design({ redundant: ['power'], propellantKg: 1 }), data)!
    // 7 x 0.5 + 2 x 0.5 (power doubled) + 0.2 instrument + 1 propellant = 5.7
    expect(u.massKg).toBeCloseTo(5.7, 6)
  })

  it('returns exactly one error for a null or unknown bus id', () => {
    expect(validateBusClass(design({ busClassId: null }), data).map((i) => i.code)).toEqual(['MISSING_BUS_CLASS'])
    expect(validateBusClass(design({ busClassId: 'nope' }), data).map((i) => i.code)).toEqual(['UNKNOWN_BUS_CLASS'])
    expect(busClassUsage(design({ busClassId: 'nope' }), data)).toBeNull()
    expect(canAddInstrument(design({ busClassId: null }), data)).toBe(false)
  })

  it('does not mutate the design', () => {
    const d = design({ redundant: ['power'] })
    const copy = structuredClone(d)
    validateBusClass(d, data)
    expect(d).toEqual(copy)
  })
})

describe('bus class catalog', () => {
  it('covers 1U to Large with at least 8 component slots each', () => {
    const ids = gameData.busClasses.map((b) => b.id)
    expect(ids).toEqual(['cubesat-1u', 'cubesat-2u', 'cubesat-3u', 'cubesat-6u', 'cubesat-12u', 'smallsat', 'medium', 'large'])
    for (const b of gameData.busClasses) expect(b.componentSlots).toBeGreaterThanOrEqual(8)
  })
})
