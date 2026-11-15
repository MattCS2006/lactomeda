// FR-5.2: orbit properties are used by the engine, not only displayed. Each test changes ONE property
// on a copy of the orbit and checks that an engine output changes.
import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import type { GameData, MissionDesign, Orbit } from '../types'
import { evaluateObjectives } from './objectives'
import {
  availableDeltaVms,
  batteryCapacityWh,
  eclipseMinutes,
  requiredBatteryWh,
  validateOrbit,
} from './orbit'
import { estimateBudgets } from './resources'
import { cubesatDesign } from './testDesign'

/** Copy of the game data where one orbit has some properties changed. */
const withOrbit = (id: string, patch: Partial<Orbit>): GameData => ({
  ...gameData,
  orbits: gameData.orbits.map((o) => (o.id === id ? { ...o, ...patch } : o)),
})
const codes = (design: MissionDesign, data: GameData) => validateOrbit(design, data).map((i) => i.code)
const leo = () => gameData.orbits.find((o) => o.id === 'leo')!
const withComputer = (computerId: string) => {
  const base = cubesatDesign()
  return cubesatDesign({ componentIds: { ...base.componentIds, computer: computerId } })
}

describe('period', () => {
  it('drives the required battery energy', () => {
    const design = cubesatDesign({ instrumentIds: ['inst-visible-cam'] })
    const short = requiredBatteryWh(design, withOrbit('leo', { periodMin: 90 }))
    const long = requiredBatteryWh(design, withOrbit('leo', { periodMin: 180 }))
    expect(long).toBeCloseTo(short * 2, 9)
    expect(eclipseMinutes(design, { ...leo(), periodMin: 100 })).toBeCloseTo(100 * leo().eclipseFraction, 9)
  })

  it('follows the altitude override (FR-5.3)', () => {
    const design = cubesatDesign({ instrumentIds: ['inst-visible-cam'] })
    const low = requiredBatteryWh({ ...design, altitudeKm: 500 }, gameData)
    const high = requiredBatteryWh({ ...design, altitudeKm: 1200 }, gameData)
    expect(high).toBeGreaterThan(low)
  })

  it('matches E = P x t_eclipse / DoD', () => {
    const design = cubesatDesign()
    const load = estimateBudgets(design, gameData).power.used
    const expected = (load * ((leo().periodMin * leo().eclipseFraction) / 60)) / 0.3
    expect(requiredBatteryWh(design, gameData)).toBeCloseTo(expected, 9)
  })

  it('is 0 without an orbit', () => {
    expect(requiredBatteryWh(cubesatDesign({ orbitId: null }), gameData)).toBe(0)
  })
})

describe('eclipse', () => {
  it('drives the available power and the required battery energy', () => {
    const design = cubesatDesign()
    const sunny = withOrbit('leo', { eclipseFraction: 0.1 })
    const dark = withOrbit('leo', { eclipseFraction: 0.6 })
    expect(estimateBudgets(design, dark).power.available).toBeLessThan(estimateBudgets(design, sunny).power.available)
    expect(requiredBatteryWh(design, dark)).toBeGreaterThan(requiredBatteryWh(design, sunny))
  })
})

describe('revisit (period and altitude)', () => {
  it('a longer period changes the revisit objective', () => {
    const design = cubesatDesign({ scenarioId: 'wildfire-eo', instrumentIds: ['inst-thermal-ir'], orbitId: 'leo' })
    const revisit = (data: GameData) =>
      evaluateObjectives(design, data).find((r) => r.objectiveId === 'fireDetection')!.value!
    expect(revisit(withOrbit('leo', { periodMin: 190 }))).toBeGreaterThan(revisit(gameData))
  })

  it('a higher altitude gives a wider swath and a shorter revisit', () => {
    const base = cubesatDesign({ scenarioId: 'wildfire-eo', instrumentIds: ['inst-thermal-ir'], orbitId: 'sso' })
    const revisit = (altitudeKm: number) =>
      evaluateObjectives({ ...base, altitudeKm }, gameData).find((r) => r.objectiveId === 'fireDetection')!.value!
    expect(revisit(900)).not.toBe(revisit(500))
  })
})

describe('radiation', () => {
  const time = (design: MissionDesign, data: GameData) => estimateBudgets(design, data).time.available

  it('shortens the median life from low to high', () => {
    const design = cubesatDesign()
    const low = time(design, withOrbit('leo', { radiation: 'low' }))
    const medium = time(design, withOrbit('leo', { radiation: 'medium' }))
    const high = time(design, withOrbit('leo', { radiation: 'high' }))
    expect(medium).toBeLessThan(low)
    expect(high).toBeLessThan(medium)
  })

  it('hurts less with a rad-hard computer', () => {
    const lossOf = (design: MissionDesign) =>
      time(design, withOrbit('leo', { radiation: 'high' })) / time(design, withOrbit('leo', { radiation: 'low' }))
    const plain = lossOf(withComputer('obc-cubesat'))
    const hard = lossOf(withComputer('obc-radhard'))
    expect(hard).toBeGreaterThan(plain)
  })

  it('uses r^factor on the reliability, and factor 1 without an orbit', () => {
    const design = cubesatDesign()
    const noOrbit = time({ ...design, orbitId: null }, gameData)
    expect(noOrbit).toBeCloseTo(time(design, withOrbit('leo', { radiation: 'low' })), 9)
  })
})

describe('distance', () => {
  it('drives the available data', () => {
    const design = cubesatDesign({ instrumentIds: ['inst-visible-cam'] })
    const near = estimateBudgets(design, withOrbit('leo', { distanceKm: 1500 })).data.available
    const far = estimateBudgets(design, withOrbit('leo', { distanceKm: 6000 })).data.available
    expect(far).toBeLessThan(near)
  })
})

describe('insertion delta-v', () => {
  const needing = (dv: number) => withOrbit('leo', { insertionDeltaVms: dv })
  const withProp = (propulsion: string) =>
    cubesatDesign({ componentIds: { ...cubesatDesign().componentIds, propulsion } })

  it('reads the available delta-v from the propulsion', () => {
    expect(availableDeltaVms(withProp('prop-none'), gameData)).toBe(0)
    expect(availableDeltaVms(withProp('prop-mono'), gameData)).toBe(200)
    expect(availableDeltaVms(cubesatDesign({ componentIds: {} }), gameData)).toBe(0)
  })

  it('INSUFFICIENT_DELTA_V appears when the orbit needs more than the propulsion gives, and disappears with enough', () => {
    expect(codes(withProp('prop-mono'), needing(300))).toContain('INSUFFICIENT_DELTA_V')
    expect(codes(withProp('prop-biprop'), needing(300))).not.toContain('INSUFFICIENT_DELTA_V')
    expect(codes(withProp('prop-mono'), needing(200))).not.toContain('INSUFFICIENT_DELTA_V')
    expect(codes(withProp('prop-none'), gameData)).not.toContain('INSUFFICIENT_DELTA_V') // LEO needs 0
  })

  it('the issue is an error on propulsion that quotes both numbers', () => {
    const issue = validateOrbit(withProp('prop-mono'), needing(300)).find((i) => i.code === 'INSUFFICIENT_DELTA_V')!
    expect(issue.severity).toBe('error')
    expect(issue.subsystem).toBe('propulsion')
    expect(issue.message).toContain('300')
    expect(issue.message).toContain('200')
  })
})

describe('validateOrbit', () => {
  it('BATTERY_TOO_SMALL for a big load with bat-40', () => {
    const design = cubesatDesign({ instrumentIds: ['inst-sar'] })
    const issue = validateOrbit(design, gameData).find((i) => i.code === 'BATTERY_TOO_SMALL')!
    expect(issue.severity).toBe('error')
    expect(issue.resource).toBe('power')
    expect(issue.subsystem).toBe('battery')
    expect(issue.message).toContain('40')
    expect(issue.message).toContain(String(Math.round(requiredBatteryWh(design, gameData) * 10) / 10))
  })

  it('a bigger battery clears it and redundancy doubles the capacity', () => {
    const base = cubesatDesign({ instrumentIds: ['inst-visible-cam'] })
    const big = { ...base, componentIds: { ...base.componentIds, battery: 'bat-10k' } }
    expect(codes(big, gameData)).not.toContain('BATTERY_TOO_SMALL')
    expect(batteryCapacityWh({ ...base, redundant: ['battery'] }, gameData)).toBe(80)
  })

  it('HIGH_RADIATION for a non-rad-hard computer in meo, not for a rad-hard one or in LEO', () => {
    const meo = (id: string) => ({ ...withComputer(id), orbitId: 'meo' })
    const issue = validateOrbit(meo('obc-cubesat'), gameData).find((i) => i.code === 'HIGH_RADIATION')!
    expect(issue.severity).toBe('warning')
    expect(issue.subsystem).toBe('computer')
    expect(codes(meo('obc-radhard'), gameData)).not.toContain('HIGH_RADIATION')
    expect(codes(withComputer('obc-cubesat'), gameData)).not.toContain('HIGH_RADIATION')
  })

  it('returns nothing without an orbit and does not throw on unknown ids', () => {
    expect(validateOrbit(cubesatDesign({ orbitId: null }), gameData)).toEqual([])
    expect(() => validateOrbit(cubesatDesign({ orbitId: 'nope', componentIds: { battery: 'nope' } }), gameData)).not.toThrow()
  })
})

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const design = cubesatDesign({ instrumentIds: ['inst-sar'], redundant: ['battery'] })
    const snapshot = JSON.stringify([design, gameData])
    requiredBatteryWh(design, gameData)
    batteryCapacityWh(design, gameData)
    availableDeltaVms(design, gameData)
    validateOrbit(design, gameData)
    expect(JSON.stringify([design, gameData])).toBe(snapshot)
  })
})
