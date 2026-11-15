import { describe, expect, it } from 'vitest'
import { fullGameData as gameData } from '../../data'
import type { MissionDesign } from '../types'
import { busClassUsage } from './busClass'
import { checkLauncher, launcherCompatibility, validateLaunch, wetMassKg } from './launch'
import { estimateBudgets } from './resources'
import { cubesatDesign } from './testDesign'

const sso = (over: Partial<MissionDesign> = {}) => cubesatDesign({ orbitId: 'sso', launcherId: 'lv-small', ...over })
const baseMass = wetMassKg(sso(), gameData)

describe('wetMassKg', () => {
  it('counts redundant subsystems twice and adds propellant', () => {
    const battery = gameData.components.find((c) => c.id === 'bat-40')!
    expect(wetMassKg(sso({ redundant: ['battery'] }), gameData) - baseMass).toBeCloseTo(battery.massKg * 1.1, 9) // dry mass + 10% cadet contingency
    expect(wetMassKg(sso({ propellantKg: 1.5 }), gameData) - baseMass).toBeCloseTo(1.5, 9)
  })

  it('is the single mass definition used by the bus class and the budgets', () => {
    const d = sso({ redundant: ['battery'], propellantKg: 0.5, instrumentIds: ['inst-visible-cam'] })
    expect(busClassUsage(d, gameData)!.massKg).toBe(wetMassKg(d, gameData))
    expect(estimateBudgets(d, gameData).mass.used).toBe(wetMassKg(d, gameData))
  })
})

describe('checkLauncher', () => {
  it('flags a design heavier than the capacity, with the exact shortfall in kg', () => {
    const d = sso({ propellantKg: 200 - baseMass + 212 }) // 412 kg total vs 200 kg
    const r = checkLauncher(d, 'lv-small', gameData)
    expect(r.compatible).toBe(false)
    expect(r.capacityKg).toBe(200)
    expect(r.wetMassKg).toBeCloseTo(412, 9)
    expect(r.massShortfallKg).toBeCloseTo(212, 9)
    const issue = r.issues.find((i) => i.code === 'OVER_CAPACITY')!
    expect(issue.message).toContain('212 kg')
    expect(issue.message).toContain('200 kg')
  })

  it('flags a launcher that cannot reach the orbit regime', () => {
    const r = checkLauncher(cubesatDesign({ orbitId: 'geo' }), 'lv-cubesat', gameData)
    expect(r.compatible).toBe(false)
    expect(r.issues.map((i) => i.code)).toContain('REGIME_NOT_SUPPORTED')
    expect(r.capacityKg).toBe(0)
    expect(r.massShortfallKg).toBe(r.wetMassKg)
  })

  it('flags a large bus on a small launcher as not fitting the fairing', () => {
    const r = checkLauncher(sso({ busClassId: 'large' }), 'lv-small', gameData)
    expect(r.issues.map((i) => i.code)).toContain('FAIRING_TOO_SMALL')
    expect(r.busVolumeL).toBe(30000)
    expect(r.fairingVolumeL).toBe(2300)
    expect(r.volumeShortfallL).toBe(27700)
    expect(r.issues.find((i) => i.code === 'FAIRING_TOO_SMALL')!.message).toMatch(/30000 L.*2300 L/)
  })

  it('reports several issues at once', () => {
    const r = checkLauncher(sso({ busClassId: 'large', propellantKg: 1000 }), 'lv-small', gameData)
    expect(r.issues.map((i) => i.code).sort()).toEqual(['FAIRING_TOO_SMALL', 'OVER_CAPACITY'])
  })

  it('accepts a light 3U CubeSat in SSO on the CubeSat dispenser', () => {
    const r = checkLauncher(sso({ launcherId: 'lv-cubesat' }), 'lv-cubesat', gameData)
    expect(r.issues).toEqual([])
    expect(r.compatible).toBe(true)
    expect(r.massShortfallKg).toBe(0)
    expect(r.volumeShortfallL).toBe(0)
  })

  it('reports NO_ORBIT without throwing, and a null bus volume without a bus class', () => {
    const r = checkLauncher(cubesatDesign({ orbitId: null, busClassId: null }), 'lv-small', gameData)
    expect(r.compatible).toBe(false)
    expect(r.issues.map((i) => i.code)).toEqual(['NO_ORBIT'])
    expect(r.busVolumeL).toBeNull()
    expect(r.volumeShortfallL).toBe(0)
  })

  it('throws on an unknown launcher id', () => {
    expect(() => checkLauncher(sso(), 'nope', gameData)).toThrow()
  })
})

describe('launcherCompatibility', () => {
  it('returns one entry per launcher in catalog order and flags exactly the incompatible ones', () => {
    const d = sso({ propellantKg: 300 }) // ~300 kg: too heavy for the dispensers and the 200 kg Electron
    const list = launcherCompatibility(d, gameData)
    expect(list.map((r) => r.launcherId)).toEqual(gameData.launchers.map((l) => l.id))
    const expected = gameData.launchers.filter((l) => wetMassKg(d, gameData) > (l.capacityKg.SSO ?? 0) || l.fairingVolumeL < 3 || l.capacityKg.SSO === undefined)
    expect(list.filter((r) => !r.compatible).map((r) => r.launcherId).sort()).toEqual(expected.map((l) => l.id).sort())
    expect(list.find((r) => r.launcherId === 'lv-rideshare')!.compatible).toBe(true)
    expect(list.find((r) => r.launcherId === 'lv-small')!.compatible).toBe(false)
  })
})

describe('validateLaunch', () => {
  it('asks for a launcher when none is chosen', () => {
    expect(validateLaunch(sso({ launcherId: null }), gameData)).toEqual([
      expect.objectContaining({ code: 'MISSING_LAUNCHER', severity: 'error' }),
    ])
  })

  it('reports an unknown launcher id', () => {
    expect(validateLaunch(sso({ launcherId: 'nope' }), gameData)[0]).toMatchObject({ code: 'UNKNOWN_LAUNCHER', severity: 'error' })
  })

  it('maps the incompatibilities to LAUNCH_* errors', () => {
    const issues = validateLaunch(sso({ busClassId: 'large', propellantKg: 1000 }), gameData)
    expect(issues.map((i) => i.code).sort()).toEqual(['LAUNCH_FAIRING_TOO_SMALL', 'LAUNCH_OVER_CAPACITY'])
    expect(issues.every((i) => i.severity === 'error')).toBe(true)
    expect(issues.find((i) => i.code === 'LAUNCH_OVER_CAPACITY')!.resource).toBe('mass')
    expect(validateLaunch(cubesatDesign({ orbitId: 'geo', launcherId: 'lv-cubesat' }), gameData).map((i) => i.code)).toContain('LAUNCH_REGIME_UNSUPPORTED')
  })

  it('reports LAUNCH_NO_ORBIT without throwing, and nothing when compatible', () => {
    expect(validateLaunch(cubesatDesign({ orbitId: null }), gameData).map((i) => i.code)).toEqual(['LAUNCH_NO_ORBIT'])
    expect(validateLaunch(sso({ launcherId: 'lv-cubesat' }), gameData)).toEqual([])
  })
})

describe('purity', () => {
  it('does not mutate the design or the data', () => {
    const d = sso({ redundant: ['battery'], instrumentIds: ['inst-visible-cam'] })
    const dSnap = JSON.stringify(d)
    const gSnap = JSON.stringify(gameData)
    launcherCompatibility(d, gameData)
    validateLaunch(d, gameData)
    expect(JSON.stringify(d)).toBe(dSnap)
    expect(JSON.stringify(gameData)).toBe(gSnap)
  })
})
