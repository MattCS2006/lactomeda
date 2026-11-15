import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { MASS_CONTINGENCY } from '../constants'
import type { Difficulty, MissionDesign } from '../types'
import { checkLauncher } from './launch'
import { massBreakdown, massContingency, wetMassKg } from './mass'
import { estimateBudgets } from './resources'

const DIFFICULTIES: Difficulty[] = ['cadet', 'engineer', 'flightDirector']
const FRACTION: Record<Difficulty, number> = { cadet: 0.1, engineer: 0.15, flightDirector: 0.2 }
const ref = (scenarioId: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === scenarioId)!

// Hand computation from the catalog masses (kg). Propellant is 0 in every reference design.
const HAND: Record<string, { componentsKg: number; instrumentsKg: number; busMaxKg: number; launcherKg: number }> = {
  // str-3u 0.6 + pwr-deploy 1 + bat-40 0.3 + obc-cubesat 0.1 + adcs-mag 0.2 + prop-none 0 + thm-passive 0.1 + com-sband 0.3
  // instruments: visible-cam 1 + magnetometer-cubesat 0.2
  'student-cubesat': { componentsKg: 2.6, instrumentsKg: 1.2, busMaxKg: 6, launcherKg: 6 },
  // str-smallsat 40 + pwr-array-small 15 + bat-1k 8 + obc-radtol 2 + adcs-smallsat 20 + 0 + thm-heaters 5 + com-xband 3
  // instruments: multispectral 25 + thermal-ir 15
  'wildfire-eo': { componentsKg: 93, instrumentsKg: 40, busMaxKg: 180, launcherKg: 500 },
  // str-large 600 + pwr-array-large 120 + bat-10k 70 + obc-radhard 5 + adcs-fine 60 + prop-mono 30 + thm-cryo 300 + com-hga 40
  // instruments: telescope 700
  'space-telescope': { componentsKg: 1225, instrumentsKg: 700, busMaxKg: 6500, launcherKg: 2500 },
}

describe('massContingency', () => {
  it('is 10% for cadet, 15% for engineer and 20% for flight director, always within 10-20%', () => {
    expect(massContingency('cadet')).toBe(0.1)
    expect(massContingency('engineer')).toBe(0.15)
    expect(massContingency('flightDirector')).toBe(0.2)
    for (const value of Object.values(MASS_CONTINGENCY)) {
      expect(value).toBeGreaterThanOrEqual(0.1)
      expect(value).toBeLessThanOrEqual(0.2)
    }
  })
})

describe('massBreakdown against the reference designs', () => {
  it('covers every scenario', () => {
    expect(Object.keys(HAND).sort()).toEqual(REFERENCE_DESIGNS.map((d) => d.scenarioId).sort())
  })

  describe.each(Object.entries(HAND))('%s', (scenarioId, hand) => {
    it.each(DIFFICULTIES)('matches the hand computation on %s and fits its bus and launcher', (difficulty) => {
      const design = { ...ref(scenarioId), difficulty }
      const b = massBreakdown(design, gameData)
      const dry = hand.componentsKg + hand.instrumentsKg
      expect(b.componentsKg).toBeCloseTo(hand.componentsKg, 9)
      expect(b.instrumentsKg).toBeCloseTo(hand.instrumentsKg, 9)
      expect(b.dryMassKg).toBeCloseTo(dry, 9)
      expect(b.contingencyFraction).toBe(FRACTION[difficulty])
      expect(b.contingencyKg).toBeCloseTo(dry * FRACTION[difficulty], 9)
      expect(b.propellantKg).toBe(0)
      expect(b.totalMassKg).toBeCloseTo(dry * (1 + FRACTION[difficulty]), 9)
      expect(wetMassKg(design, gameData)).toBe(b.totalMassKg)
      // the reference design must stay winnable at every difficulty
      expect(b.totalMassKg).toBeLessThanOrEqual(hand.busMaxKg)
      expect(b.totalMassKg).toBeLessThanOrEqual(hand.launcherKg)
    })
  })
})

describe('massBreakdown rules', () => {
  const base = (over: Partial<MissionDesign> = {}): MissionDesign => ({ ...ref('wildfire-eo'), ...over })

  it('applies the contingency to dry mass only: propellant adds exactly its own mass', () => {
    for (const difficulty of DIFFICULTIES) {
      const dry = massBreakdown(base({ difficulty }), gameData)
      const fueled = massBreakdown(base({ difficulty, propellantKg: 7.5 }), gameData)
      expect(fueled.totalMassKg - dry.totalMassKg).toBeCloseTo(7.5, 9)
      expect(fueled.contingencyKg).toBe(dry.contingencyKg)
      expect(fueled.propellantKg).toBe(7.5)
    }
  })

  it('counts redundant subsystems twice in componentsKg', () => {
    const plain = massBreakdown(base(), gameData)
    const redundant = massBreakdown(base({ redundant: ['battery'] }), gameData)
    expect(redundant.componentsKg - plain.componentsKg).toBeCloseTo(8, 9) // bat-1k is 8 kg
    expect(redundant.instrumentsKg).toBe(plain.instrumentsKg)
  })

  it('weighs more on Flight Director than on Cadet', () => {
    const cadet = wetMassKg(base({ difficulty: 'cadet' }), gameData)
    const engineer = wetMassKg(base({ difficulty: 'engineer' }), gameData)
    const director = wetMassKg(base({ difficulty: 'flightDirector' }), gameData)
    expect(director).toBeGreaterThan(engineer)
    expect(engineer).toBeGreaterThan(cadet)
  })

  it('ignores unknown ids without throwing', () => {
    const d = base({ instrumentIds: ['nope'], componentIds: { structure: 'nope' } })
    expect(massBreakdown(d, gameData)).toMatchObject({ componentsKg: 0, instrumentsKg: 0, totalMassKg: 0 })
  })

  it('estimateBudgets mass.used equals totalMassKg', () => {
    for (const d of REFERENCE_DESIGNS) {
      for (const difficulty of DIFFICULTIES) {
        const design = { ...d, difficulty }
        expect(estimateBudgets(design, gameData).mass.used).toBe(massBreakdown(design, gameData).totalMassKg)
      }
    }
  })

  it('fits a launcher on Cadet but is OVER_CAPACITY on Flight Director', () => {
    // Student CubeSat with backup power and battery: dry 5.1 kg -> 5.61 kg on Cadet, 6.12 kg on Flight Director; dispenser takes 6 kg to SSO.
    const student = (difficulty: Difficulty): MissionDesign => ({ ...ref('student-cubesat'), redundant: ['power', 'battery'], difficulty })
    const cadet = checkLauncher(student('cadet'), 'lv-cubesat', gameData)
    expect(cadet.compatible).toBe(true)
    expect(cadet.wetMassKg).toBeCloseTo(5.61, 9)
    const director = checkLauncher(student('flightDirector'), 'lv-cubesat', gameData)
    expect(director.compatible).toBe(false)
    expect(director.issues.map((i) => i.code)).toEqual(['OVER_CAPACITY'])
    expect(director.massShortfallKg).toBeCloseTo(0.12, 9)
  })

  it('does not mutate the design or the data', () => {
    const d = base({ redundant: ['battery'], propellantKg: 2 })
    const dSnap = JSON.stringify(d)
    const gSnap = JSON.stringify(gameData)
    massBreakdown(d, gameData)
    wetMassKg(d, gameData)
    expect(JSON.stringify(d)).toBe(dSnap)
    expect(JSON.stringify(gameData)).toBe(gSnap)
  })
})
