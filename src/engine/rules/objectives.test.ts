import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import type { MissionDesign, Objective } from '../types'
import {
  angularResolutionArcsec,
  effectiveAltitudeKm,
  effectivePeriodMin,
  evaluateObjectives,
  groundResolutionM,
  levelAchieved,
  metricDirection,
  objectiveScore,
  objectiveValue,
  revisitHours,
  scienceValue,
  swathKm,
} from './objectives'
import { estimateBudgets } from './resources'
import { cubesatDesign } from './testDesign'

const instrument = (id: string) => gameData.instruments.find((i) => i.id === id)!
const orbit = (id: string) => gameData.orbits.find((o) => o.id === id)!
const objective = (scenarioId: string, id: string): Objective =>
  gameData.scenarios.find((s) => s.id === scenarioId)!.objectives.find((o) => o.id === id)!
const value = (scenarioId: string, id: string, design: MissionDesign) =>
  objectiveValue(objective(scenarioId, id), design, gameData)
const result = (design: MissionDesign, id: string) =>
  evaluateObjectives(design, gameData).find((r) => r.objectiveId === id)!

const wildfire = (over: Partial<MissionDesign> = {}) =>
  cubesatDesign({ scenarioId: 'wildfire-eo', ...over })
const telescope = (over: Partial<MissionDesign> = {}) =>
  cubesatDesign({ scenarioId: 'space-telescope', instrumentIds: ['inst-telescope'], orbitId: 'l2', ...over })

describe('acceptance: altitude changes the resolution score', () => {
  const at = (altitudeKm: number) =>
    cubesatDesign({ instrumentIds: ['inst-visible-cam'], orbitId: 'sso', altitudeKm })

  it('500 km gives finer resolution and a higher score than 700 km', () => {
    const high = result(at(700), 'earthImaging')
    const low = result(at(500), 'earthImaging')
    expect(high.value).toBeCloseTo(42, 6)
    expect(low.value).toBeCloseTo(30, 6)
    expect(low.value!).toBeLessThan(high.value!)
    expect(low.score).toBeGreaterThan(high.score)
  })
})

describe('geometry', () => {
  it('altitude override applies to LEO/SSO only', () => {
    const d = cubesatDesign({ altitudeKm: 600 })
    expect(effectiveAltitudeKm(d, orbit('sso'))).toBe(600)
    expect(effectiveAltitudeKm(d, orbit('leo'))).toBe(600)
    expect(effectiveAltitudeKm(d, orbit('geo'))).toBe(35786)
    expect(effectiveAltitudeKm(cubesatDesign(), orbit('sso'))).toBe(700)
  })

  it('period is recomputed from the overridden altitude', () => {
    expect(effectivePeriodMin(cubesatDesign(), orbit('sso'))).toBe(98.8)
    expect(effectivePeriodMin(cubesatDesign({ altitudeKm: 500 }), orbit('sso'))).toBeCloseTo(94.6, 0)
    expect(effectivePeriodMin(cubesatDesign({ altitudeKm: 800 }), orbit('sso'))).toBeGreaterThan(98.8)
  })

  it('multispectral at 705 km is ~30 m with a ~185 km swath', () => {
    expect(groundResolutionM(instrument('inst-multispectral'), 705)).toBeCloseTo(30, 0)
    expect(swathKm(instrument('inst-multispectral'), 705)).toBeCloseTo(185.6, 0)
  })

  it('SAR resolution does not depend on altitude', () => {
    expect(groundResolutionM(instrument('inst-sar'), 500)).toBe(10)
    expect(groundResolutionM(instrument('inst-sar'), 900)).toBe(10)
  })

  it('instruments without geometry return undefined', () => {
    expect(groundResolutionM(instrument('inst-spectrometer'), 500)).toBeUndefined()
    expect(angularResolutionArcsec(instrument('inst-spectrometer'))).toBeUndefined()
    expect(swathKm(instrument('inst-spectrometer'), 500)).toBeUndefined()
  })

  it('telescope at L2 is ~0.1 arcsec and independent of altitude', () => {
    expect(angularResolutionArcsec(instrument('inst-telescope'))).toBeCloseTo(0.099, 3)
    const a = value('space-telescope', 'deepSky', telescope())
    const b = value('space-telescope', 'deepSky', telescope({ altitudeKm: 300 }))
    expect(a).toBeCloseTo(0.1, 1)
    expect(b).toBe(a)
  })

  it('thermal-IR at 705 km SSO revisits in ~14-16 days (Landsat-like)', () => {
    const d = wildfire({ orbitId: 'sso', altitudeKm: 705, instrumentIds: ['inst-thermal-ir'] })
    const hours = revisitHours(instrument('inst-thermal-ir'), d, orbit('sso'))!
    expect(hours / 24).toBeGreaterThan(14)
    expect(hours / 24).toBeLessThan(16)
  })

  it('geostationary revisit is 0.25 h; non-Earth orbits and swath-less instruments are undefined', () => {
    const d = wildfire({ orbitId: 'geo' })
    expect(revisitHours(instrument('inst-thermal-ir'), d, orbit('geo'))).toBe(0.25)
    expect(revisitHours(instrument('inst-thermal-ir'), d, orbit('l2'))).toBeUndefined()
    expect(revisitHours(instrument('inst-spectrometer'), d, orbit('sso'))).toBeUndefined()
  })
})

describe('objectiveScore', () => {
  const lower = { threshold: 100, baseline: 60, goal: 30 }
  const higher = { threshold: 20, baseline: 50, goal: 200 }

  it('lower is better: 0.5 / 0.75 / 1, linear between, 1 beyond goal', () => {
    expect(objectiveScore(100, lower, 'lower')).toBe(0.5)
    expect(objectiveScore(60, lower, 'lower')).toBe(0.75)
    expect(objectiveScore(30, lower, 'lower')).toBe(1)
    expect(objectiveScore(10, lower, 'lower')).toBe(1)
    expect(objectiveScore(80, lower, 'lower')).toBeCloseTo(0.625, 9)
    expect(objectiveScore(45, lower, 'lower')).toBeCloseTo(0.875, 9)
  })

  it('higher is better: 0.5 / 0.75 / 1, linear between, 1 beyond goal', () => {
    expect(objectiveScore(20, higher, 'higher')).toBe(0.5)
    expect(objectiveScore(50, higher, 'higher')).toBe(0.75)
    expect(objectiveScore(200, higher, 'higher')).toBe(1)
    expect(objectiveScore(500, higher, 'higher')).toBe(1)
    expect(objectiveScore(35, higher, 'higher')).toBeCloseTo(0.625, 9)
  })

  it('worse than threshold is below 0.5 and still monotonic', () => {
    expect(objectiveScore(200, lower, 'lower')).toBeCloseTo(0.25, 9)
    expect(objectiveScore(400, lower, 'lower')).toBeLessThan(objectiveScore(200, lower, 'lower'))
    expect(objectiveScore(10, higher, 'higher')).toBeCloseTo(0.25, 9)
    expect(objectiveScore(0, higher, 'higher')).toBe(0)
  })

  it('is monotonic across the whole range', () => {
    let previous = -1
    for (let v = 400; v >= 5; v -= 5) {
      const s = objectiveScore(v, lower, 'lower')
      expect(s).toBeGreaterThanOrEqual(previous)
      previous = s
    }
  })

  it('undefined scores 0; levelAchieved returns the best level reached', () => {
    expect(objectiveScore(undefined, lower, 'lower')).toBe(0)
    expect(levelAchieved(undefined, lower, 'lower')).toBeNull()
    expect(levelAchieved(150, lower, 'lower')).toBeNull()
    expect(levelAchieved(80, lower, 'lower')).toBe('threshold')
    expect(levelAchieved(60, lower, 'lower')).toBe('baseline')
    expect(levelAchieved(30, lower, 'lower')).toBe('goal')
    expect(levelAchieved(60, higher, 'higher')).toBe('baseline')
  })

  it('metric directions', () => {
    expect(metricDirection('resolution')).toBe('lower')
    expect(metricDirection('revisit')).toBe('lower')
    for (const m of ['dataPerDay', 'lifetime', 'coverage']) expect(metricDirection(m)).toBe('higher')
  })
})

describe('evaluateObjectives', () => {
  it('returns one result per scenario objective, in order', () => {
    const d = cubesatDesign({ instrumentIds: ['inst-visible-cam'], orbitId: 'sso' })
    const scenario = gameData.scenarios.find((s) => s.id === d.scenarioId)!
    expect(evaluateObjectives(d, gameData).map((r) => r.objectiveId)).toEqual(scenario.objectives.map((o) => o.id))
  })

  it('met respects the chosen level', () => {
    // 42 m sits between baseline (60) and goal (30): meets threshold and baseline, not goal.
    const base = { instrumentIds: ['inst-visible-cam'], orbitId: 'sso' }
    const at = (level: 'threshold' | 'baseline' | 'goal') =>
      result(cubesatDesign({ ...base, requirementLevels: { earthImaging: level } }), 'earthImaging')
    expect(at('threshold').levelAchieved).toBe('baseline')
    expect(at('threshold').met).toBe(true)
    expect(at('baseline').met).toBe(true)
    expect(at('goal').met).toBe(false)
    expect(at('goal').chosenLevel).toBe('goal')
    expect(result(cubesatDesign(base), 'earthImaging').chosenLevel).toBe('threshold')
  })

  it('dataPerDay is delivered data, capped by the downlink', () => {
    const d = cubesatDesign({ instrumentIds: ['inst-visible-cam', 'inst-magnetometer-cubesat'], orbitId: 'sso' })
    const { data } = estimateBudgets(d, gameData)
    const factor = Math.min(1, data.available / data.used)
    expect(factor).toBeLessThan(1) // the UHF link cannot carry the camera's data
    expect(value('student-cubesat', 'spaceWeather', d)).toBeCloseTo(50 * factor, 9)
    expect(value('student-cubesat', 'spaceWeather', d)!).toBeLessThan(50)
  })

  it('dataPerDay is the full generated rate when the link has room', () => {
    const d = cubesatDesign({
      instrumentIds: ['inst-magnetometer-cubesat'],
      orbitId: 'sso',
      componentIds: { ...cubesatDesign().componentIds, comms: 'com-sband' },
    })
    const { data } = estimateBudgets(d, gameData)
    expect(data.available).toBeGreaterThan(data.used)
    expect(value('student-cubesat', 'spaceWeather', d)).toBe(50)
  })

  it('lifetime comes from estimateBudgets and needs no instrument', () => {
    const d = cubesatDesign({ orbitId: null })
    expect(value('student-cubesat', 'missionLifetime', d)).toBe(estimateBudgets(d, gameData).time.available)
    expect(result(d, 'missionLifetime').score).toBeGreaterThan(0)
  })

  it('missing orbit or no serving instrument gives undefined, score 0, no throw', () => {
    const noOrbit = cubesatDesign({ instrumentIds: ['inst-visible-cam'], orbitId: null })
    const noInstrument = cubesatDesign({ instrumentIds: ['inst-magnetometer-cubesat'], orbitId: 'sso' })
    for (const d of [noOrbit, noInstrument]) {
      expect(() => evaluateObjectives(d, gameData)).not.toThrow()
      const r = result(d, 'earthImaging')
      expect(r.value).toBeUndefined()
      expect(r.score).toBe(0)
      expect(r.levelAchieved).toBeNull()
      expect(r.met).toBe(false)
    }
    expect(evaluateObjectives(cubesatDesign({ scenarioId: 'nope' }), gameData)).toEqual([])
    expect(() => evaluateObjectives(cubesatDesign({ instrumentIds: ['nope'], orbitId: 'nope' }), gameData)).not.toThrow()
  })

  it('revisit and resolution use the best serving instrument', () => {
    const d = wildfire({ orbitId: 'sso', instrumentIds: ['inst-multispectral', 'inst-sar'] })
    expect(value('wildfire-eo', 'burnScar', d)).toBe(10) // SAR beats 29.75 m
  })
})

describe('scienceValue', () => {
  it('is payload science times the mean objective score', () => {
    const d = cubesatDesign({ instrumentIds: ['inst-visible-cam'], orbitId: 'sso' })
    const scores = evaluateObjectives(d, gameData).map((r) => r.score)
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length
    expect(scienceValue(d, gameData)).toBeCloseTo(10 * mean, 9)
  })

  it('is 0 for an unknown scenario', () => {
    expect(scienceValue(cubesatDesign({ scenarioId: 'nope' }), gameData)).toBe(0)
  })

  it('improves when the altitude gets lower', () => {
    const at = (altitudeKm: number) =>
      scienceValue(cubesatDesign({ instrumentIds: ['inst-visible-cam'], orbitId: 'sso', altitudeKm }), gameData)
    expect(at(500)).toBeGreaterThan(at(700))
  })
})

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const d = cubesatDesign({ instrumentIds: ['inst-visible-cam', 'inst-magnetometer-cubesat'], orbitId: 'sso', altitudeKm: 600 })
    const snapshot = JSON.stringify([d, gameData])
    evaluateObjectives(d, gameData)
    scienceValue(d, gameData)
    expect(JSON.stringify([d, gameData])).toBe(snapshot)
  })
})
