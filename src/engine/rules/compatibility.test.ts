import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import type { GameData, MissionDesign } from '../types'
import { validate } from '../validate'
import {
  derivedObjectives,
  instrumentCompatibility,
  payloadCompatibility,
  ruleMatches,
  validatePayload,
} from './compatibility'
import { disciplineOf } from './review'
import { evaluateObjectives } from './objectives'

const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!
const rule = (id: string) => gameData.wavelengthRules!.find((r) => r.objectiveId === id)!
const inst = (id: string) => gameData.instruments.find((i) => i.id === id)!
const check = (id: string, d: MissionDesign, data: GameData = gameData) => instrumentCompatibility(id, d, data)

describe('ruleMatches / derivedObjectives', () => {
  it('needs a band, a technique and a target to all match', () => {
    expect(ruleMatches(rule('fireDetection'), inst('inst-thermal-ir'))).toBe(true)
    expect(ruleMatches(rule('fireDetection'), inst('inst-visible-cam'))).toBe(false) // wrong band
    expect(ruleMatches(rule('deepSky'), inst('inst-spectrometer'))).toBe(false) // wrong technique
    expect(ruleMatches(rule('burnScar'), inst('inst-telescope'))).toBe(false) // wrong target
  })

  it('is false for an instrument with no wavelength data', () => {
    const { bands, technique, targets, ...bare } = inst('inst-thermal-ir')
    void bands, technique, targets
    expect(ruleMatches(rule('fireDetection'), bare)).toBe(false)
  })

  it('falls back to the objectives list without wavelength data or rules', () => {
    const { bands, technique, targets, ...bare } = inst('inst-thermal-ir')
    void bands, technique, targets
    expect(derivedObjectives(bare, gameData)).toEqual(['fireDetection'])
    expect(derivedObjectives(inst('inst-thermal-ir'), { ...gameData, wavelengthRules: undefined })).toEqual(['fireDetection'])
  })

  it('derives, for every instrument, the same objectives as its objectives list', () => {
    for (const i of gameData.instruments) {
      expect([...derivedObjectives(i, gameData)].sort(), i.id).toEqual([...i.objectives].sort())
    }
  })
})

describe('instrumentCompatibility', () => {
  it('Wildfire: the visible camera is incompatible, with a reason about infrared (rules drive FR-4.2)', () => {
    const r = check('inst-visible-cam', ref('wildfire-eo'))
    expect(r.compatible).toBe(false)
    expect(r.servesObjectiveIds).toEqual([])
    expect(r.reasons[0].code).toBe('NO_MATCHING_OBJECTIVE')
    expect(r.reasons[0].message).toMatch(/infrared/i)
    expect(r.reasons[0].message).toMatch(/visible light/i)
  })

  it('Wildfire: the thermal camera is compatible and serves fireDetection', () => {
    const r = check('inst-thermal-ir', ref('wildfire-eo'))
    expect(r).toMatchObject({ compatible: true, servesObjectiveIds: ['fireDetection'], reasons: [] })
  })

  it('Space Telescope: the telescope serves deepSky and exoplanetSpectra; the multispectral imager does not fit', () => {
    const d = ref('space-telescope')
    expect(check('inst-telescope', d)).toMatchObject({ compatible: true, servesObjectiveIds: ['deepSky', 'exoplanetSpectra'] })
    const m = check('inst-multispectral', d)
    expect(m.compatible).toBe(false)
    expect(m.reasons.map((x) => x.code)).toContain('NO_MATCHING_OBJECTIVE')
  })

  it('Student CubeSat: the visible camera and the CubeSat magnetometer are compatible', () => {
    const d = ref('student-cubesat')
    expect(check('inst-visible-cam', d).compatible).toBe(true)
    expect(check('inst-magnetometer-cubesat', d).compatible).toBe(true)
  })

  it('flags an orbit the instrument cannot work from', () => {
    const d = { ...ref('space-telescope'), orbitId: 'leo' }
    const r = check('inst-telescope', d)
    expect(r.compatible).toBe(false)
    expect(r.reasons.map((x) => x.code)).toEqual(['WRONG_ORBIT'])
    expect(r.reasons[0].message).toContain(gameData.orbits.find((o) => o.id === 'leo')!.name)
    expect(r.reasons[0].message).toContain(gameData.orbits.find((o) => o.id === 'l2')!.name)
  })

  it('checks the scenario orbits when no orbit is chosen yet', () => {
    const d = { ...ref('student-cubesat'), orbitId: null }
    expect(check('inst-visible-cam', d).compatible).toBe(true)
    expect(check('inst-telescope', d).reasons.map((x) => x.code)).toContain('WRONG_ORBIT') // only works from L2
  })

  it('reports NO_WAVELENGTH_DATA for an instrument with no data that serves nothing', () => {
    const bare = { ...inst('inst-visible-cam'), id: 'inst-bare', bands: undefined, technique: undefined, targets: undefined, objectives: [] }
    const data = { ...gameData, instruments: [...gameData.instruments, bare] }
    expect(check('inst-bare', ref('student-cubesat'), data).reasons.map((x) => x.code)).toEqual(['NO_WAVELENGTH_DATA'])
  })

  it('uses the objectives list for an instrument with no wavelength data', () => {
    const bare = { ...inst('inst-visible-cam'), id: 'inst-bare', bands: undefined, technique: undefined, targets: undefined }
    const data = { ...gameData, instruments: [...gameData.instruments, bare] }
    expect(check('inst-bare', ref('student-cubesat'), data)).toMatchObject({ compatible: true, servesObjectiveIds: ['earthImaging'] })
  })

  it('does not throw for an unknown instrument', () => {
    expect(check('nope', ref('student-cubesat'))).toMatchObject({ compatible: false, servesObjectiveIds: [] })
  })
})

describe('payloadCompatibility', () => {
  it('returns one entry per instrument in catalog order, and every compatible one carries a credited rule', () => {
    for (const d of REFERENCE_DESIGNS) {
      const all = payloadCompatibility(d, gameData)
      expect(all.map((x) => x.instrumentId)).toEqual(gameData.instruments.map((i) => i.id))
      for (const x of all.filter((c) => c.compatible)) {
        expect(x.rules.length, x.instrumentId).toBeGreaterThan(0)
        for (const r of x.rules) {
          expect(r.source).not.toBe('')
          expect(x.servesObjectiveIds).toContain(r.objectiveId)
        }
      }
    }
  })
})

describe('validatePayload', () => {
  it('warns for each selected incompatible instrument, and warnings never block', () => {
    const d = { ...ref('wildfire-eo'), instrumentIds: ['inst-visible-cam', 'inst-thermal-ir', 'inst-telescope'] }
    const issues = validatePayload(d, gameData)
    expect(issues).toHaveLength(2)
    expect(issues.every((i) => i.code === 'INSTRUMENT_INCOMPATIBLE' && i.severity === 'warning')).toBe(true)
    expect(issues[0].message).toContain('Visible camera')
    // both survive validate() de-duplication
    expect(validate(d, gameData).filter((i) => i.code === 'INSTRUMENT_INCOMPATIBLE')).toHaveLength(2)
  })

  it('gives no INSTRUMENT_INCOMPATIBLE for the reference designs', () => {
    for (const d of REFERENCE_DESIGNS) {
      expect(validatePayload(d, gameData), d.scenarioId).toEqual([])
      expect(validate(d, gameData).map((i) => i.code)).not.toContain('INSTRUMENT_INCOMPATIBLE')
    }
  })

  it('lands in the risk discipline of the design review', () => {
    expect(disciplineOf({ code: 'INSTRUMENT_INCOMPATIBLE' })).toBe('risk')
  })
})

describe('objectives use the wavelength rules', () => {
  it('give the reference designs the same results as the objectives list does', () => {
    const listOnly: GameData = { ...gameData, wavelengthRules: undefined }
    for (const d of REFERENCE_DESIGNS) {
      expect(evaluateObjectives(d, gameData), d.scenarioId).toEqual(evaluateObjectives(d, listOnly))
    }
  })

  it('stop an instrument counting for an objective its bands cannot serve', () => {
    // visible camera on the Wildfire mission: it is not listed for fireDetection or burnScar either
    const d = { ...ref('wildfire-eo'), instrumentIds: ['inst-visible-cam'] }
    expect(evaluateObjectives(d, gameData).filter((r) => r.objectiveId !== 'missionLifetime').every((r) => r.value === undefined)).toBe(true)
  })
})

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const d = { ...ref('wildfire-eo'), instrumentIds: ['inst-visible-cam'] }
    const snaps = [JSON.stringify(d), JSON.stringify(gameData)]
    payloadCompatibility(d, gameData)
    validatePayload(d, gameData)
    derivedObjectives(inst('inst-telescope'), gameData)
    expect([JSON.stringify(d), JSON.stringify(gameData)]).toEqual(snaps)
  })
})
