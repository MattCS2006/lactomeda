import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import type { Component, Difficulty, MissionDesign, Subsystem } from '../types'
import { validate } from '../validate'
import { previewOptions } from './preview'
import { designReview } from './review'
import {
  SUBSYSTEMS,
  componentOptions,
  effectivePowerW,
  isComponentAvailable,
  isSolar,
  selectComponent,
  selectedComponent,
  validateComponents,
} from './components'

const byId = (id: string): Component => {
  const c = gameData.components.find((x) => x.id === id)
  if (!c) throw new Error(`missing test component ${id}`)
  return c
}
const orbit = (id: string) => {
  const o = gameData.orbits.find((x) => x.id === id)
  if (!o) throw new Error(`missing test orbit ${id}`)
  return o
}

const design = (over: Partial<MissionDesign> = {}): MissionDesign => ({
  scenarioId: 's', difficulty: 'cadet', requirementLevels: {}, busClassId: 'smallsat',
  componentIds: {
    structure: 'str-smallsat', power: 'pwr-array-small', battery: 'bat-1k', computer: 'obc-radtol',
    attitude: 'adcs-smallsat', propulsion: 'prop-mono', thermal: 'thm-heaters', comms: 'com-xband',
  },
  redundant: [], propellantKg: 0, instrumentIds: [], dutyCycle: {},
  orbitId: 'leo', launcherId: null, groundNetworkId: null, seed: 'x', ...over,
})

describe('catalog acceptance (FR-3.2)', () => {
  it.each(SUBSYSTEMS)('%s has at least 3 complete options', (subsystem) => {
    const options = componentOptions(subsystem, gameData)
    expect(options.length).toBeGreaterThanOrEqual(3)
    for (const c of options) {
      expect(Number.isFinite(c.massKg), `${c.id} massKg`).toBe(true)
      expect(Number.isFinite(c.powerW), `${c.id} powerW`).toBe(true)
      expect(Number.isFinite(c.costM), `${c.id} costM`).toBe(true)
      expect(c.reliability, `${c.id} reliability`).toBeGreaterThanOrEqual(0)
      expect(c.reliability, `${c.id} reliability`).toBeLessThanOrEqual(1)
      expect(Number.isInteger(c.trl), `${c.id} trl`).toBe(true)
      expect(c.trl, `${c.id} trl`).toBeGreaterThanOrEqual(1)
      expect(c.trl, `${c.id} trl`).toBeLessThanOrEqual(9)
    }
  })

  it('power offers an RTG plus body-mounted, deployable and large-array solar', () => {
    const power = componentOptions('power', gameData)
    expect(power.some((c) => c.tags?.includes('noSunNeeded'))).toBe(true)
    for (const id of ['pwr-body', 'pwr-deploy', 'pwr-array-large']) {
      expect(power.map((c) => c.id)).toContain(id)
      expect(isSolar(byId(id))).toBe(true)
    }
    expect(byId('pwr-rtg').tags).toContain('noSunNeeded')
    expect(isSolar(byId('pwr-rtg'))).toBe(false)
  })
})

describe('componentOptions / selection', () => {
  it('returns only that subsystem, sorted by mass', () => {
    for (const s of SUBSYSTEMS) {
      const options = componentOptions(s, gameData)
      expect(options.every((c) => c.subsystem === s)).toBe(true)
      const masses = options.map((c) => c.massKg)
      expect(masses).toEqual([...masses].sort((a, b) => a - b))
    }
  })

  it('selectComponent returns a new design and leaves the input unchanged', () => {
    const d = design({ difficulty: 'engineer' }) // the RTG is an advanced part
    const copy = structuredClone(d)
    const next = selectComponent(d, 'power', 'pwr-rtg', gameData)
    expect(next).not.toBe(d)
    expect(next.componentIds).not.toBe(d.componentIds)
    expect(next.componentIds.power).toBe('pwr-rtg')
    expect(d).toEqual(copy)
    expect(selectedComponent(next, 'power', gameData)?.id).toBe('pwr-rtg')
    expect(selectedComponent({ ...d, componentIds: {} }, 'power', gameData)).toBeUndefined()
  })

  it('throws on an unknown id or the wrong subsystem', () => {
    expect(() => selectComponent(design(), 'power', 'nope', gameData)).toThrow()
    expect(() => selectComponent(design(), 'power', 'bat-1k', gameData)).toThrow()
  })
})

describe('effectivePowerW', () => {
  it('gives a solar panel ~43% of its Earth output at Mars', () => {
    const panel = byId('pwr-array-small')
    const earth = effectivePowerW(panel, orbit('leo'))
    const mars = effectivePowerW(panel, orbit('mars'))
    expect(mars / earth).toBeCloseTo(0.43, 2)
    expect(effectivePowerW(panel, null)).toBe(panel.powerW)
  })

  it('leaves the RTG and consumers unchanged', () => {
    const rtg = byId('pwr-rtg')
    expect(effectivePowerW(rtg, orbit('leo'))).toBe(rtg.powerW)
    expect(effectivePowerW(rtg, orbit('mars'))).toBe(rtg.powerW)
    const radio = byId('com-xband')
    expect(effectivePowerW(radio, orbit('mars'))).toBe(radio.powerW)
  })
})

describe('validateComponents', () => {
  it('passes a complete valid design', () => {
    expect(validateComponents(design(), gameData)).toEqual([])
  })

  it.each(SUBSYSTEMS)('reports MISSING_SUBSYSTEM when %s is empty', (s: Subsystem) => {
    const d = design()
    const { [s]: _removed, ...rest } = d.componentIds
    const issues = validateComponents({ ...d, componentIds: rest }, gameData)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'MISSING_SUBSYSTEM', severity: 'error', subsystem: s })
  })

  it('reports UNKNOWN_COMPONENT and WRONG_SUBSYSTEM', () => {
    const d = design()
    const unknown = validateComponents({ ...d, componentIds: { ...d.componentIds, battery: 'nope' } }, gameData)
    expect(unknown.map((i) => i.code)).toEqual(['UNKNOWN_COMPONENT'])
    const wrong = validateComponents({ ...d, componentIds: { ...d.componentIds, battery: 'pwr-rtg' } }, gameData)
    expect(wrong.map((i) => i.code)).toEqual(['WRONG_SUBSYSTEM'])
    expect(wrong[0].severity).toBe('error')
  })

  it('warns about solar power at Mars but not for the RTG', () => {
    const solar = validateComponents(design({ orbitId: 'mars' }), gameData)
    expect(solar).toHaveLength(1)
    expect(solar[0]).toMatchObject({ code: 'LOW_SOLAR_POWER', severity: 'warning', resource: 'power', subsystem: 'power' })
    expect(solar[0].message).toContain('RTG')

    const d = design({ orbitId: 'mars', difficulty: 'engineer' })
    const rtg = selectComponent(d, 'power', 'pwr-rtg', gameData)
    expect(validateComponents(rtg, gameData)).toEqual([])
  })

  it('does not warn near Earth, at L2, or with no orbit', () => {
    expect(validateComponents(design({ orbitId: 'l2' }), gameData)).toEqual([])
    expect(validateComponents(design({ orbitId: null }), gameData)).toEqual([])
  })

  it('does not mutate the design', () => {
    const d = design({ orbitId: 'mars' })
    const copy = structuredClone(d)
    validateComponents(d, gameData)
    expect(d).toEqual(copy)
  })
})

// ─── FR-3.4 simple vs advanced by difficulty ────────────────────────────

describe('component tiers by difficulty (FR-3.4)', () => {
  it('hides advanced parts on Cadet for every subsystem, and keeps at least 3 options', () => {
    for (const s of SUBSYSTEMS) {
      const options = componentOptions(s, gameData, 'cadet')
      expect(options.some((c) => c.tier === 'advanced'), s).toBe(false)
      expect(options.length, s).toBeGreaterThanOrEqual(3)
    }
  })

  it('shows advanced parts on Engineer and Flight Director', () => {
    for (const difficulty of ['engineer', 'flightDirector'] as const) {
      for (const s of SUBSYSTEMS) {
        const advanced = gameData.components.filter((c) => c.subsystem === s && c.tier === 'advanced')
        expect(advanced.length).toBeGreaterThan(0)
        const ids = componentOptions(s, gameData, difficulty).map((c) => c.id)
        for (const a of advanced) expect(ids, `${difficulty}/${a.id}`).toContain(a.id)
      }
    }
  })

  it('keeps componentOptions without a difficulty exactly as before (everything, lightest first)', () => {
    for (const s of SUBSYSTEMS) {
      const all = gameData.components.filter((c) => c.subsystem === s)
      const options = componentOptions(s, gameData)
      expect(options).toHaveLength(all.length)
      expect(options.map((c) => c.massKg)).toEqual(options.map((c) => c.massKg).sort((a, b) => a - b))
      expect(componentOptions(s, gameData, 'engineer')).toEqual(options)
    }
  })

  it('isComponentAvailable follows TIERS_BY_DIFFICULTY', () => {
    for (const c of gameData.components) {
      expect(isComponentAvailable(c, 'cadet'), c.id).toBe(c.tier === 'simple')
      expect(isComponentAvailable(c, 'engineer'), c.id).toBe(true)
      expect(isComponentAvailable(c, 'flightDirector'), c.id).toBe(true)
    }
  })

  it('selectComponent throws for an advanced part on Cadet and works on Engineer', () => {
    expect(() => selectComponent(design({ difficulty: 'cadet' }), 'power', 'pwr-rtg', gameData)).toThrow(/not available on cadet/)
    expect(selectComponent(design({ difficulty: 'engineer' }), 'power', 'pwr-rtg', gameData).componentIds.power).toBe('pwr-rtg')
    expect(selectComponent(design({ difficulty: 'cadet' }), 'power', 'pwr-body', gameData).componentIds.power).toBe('pwr-body')
  })

  it('validateComponents reports COMPONENT_NOT_AVAILABLE on Cadet only, as a hard blocker', () => {
    const withRtg = (difficulty: Difficulty): MissionDesign => ({
      ...design({ difficulty, orbitId: 'mars' }),
      componentIds: { ...design().componentIds, power: 'pwr-rtg' },
    })
    const issues = validateComponents(withRtg('cadet'), gameData)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'COMPONENT_NOT_AVAILABLE', severity: 'error', subsystem: 'power' })
    expect(issues[0].message).toContain(byId('pwr-rtg').name)
    expect(issues[0].message).toContain('cadet')
    expect(validateComponents(withRtg('engineer'), gameData)).toEqual([])
    expect(validate(withRtg('cadet'), gameData).some((i) => i.code === 'COMPONENT_NOT_AVAILABLE')).toBe(true)

    const review = designReview(withRtg('cadet'), gameData)
    expect(review.hardBlockers.map((i) => i.code)).toContain('COMPONENT_NOT_AVAILABLE')
    expect(review.disciplines.find((d) => d.discipline === 'power')!.findings.map((f) => f.code)).toContain('COMPONENT_NOT_AVAILABLE')
  })

  it('previewOptions only previews options available at the design difficulty', () => {
    const cadet = previewOptions(design({ difficulty: 'cadet' }), 'power', gameData)
    expect(Object.keys(cadet)).not.toContain('pwr-rtg')
    expect(Object.keys(cadet).sort()).toEqual(componentOptions('power', gameData, 'cadet').map((c) => c.id).sort())
    expect(Object.keys(previewOptions(design({ difficulty: 'engineer' }), 'power', gameData))).toContain('pwr-rtg')
  })

  it('reference designs never use a part their difficulty hides', () => {
    expect(REFERENCE_DESIGNS.map((d) => [d.scenarioId, d.difficulty])).toEqual([
      ['student-cubesat', 'cadet'],
      ['wildfire-eo', 'cadet'],
      ['space-telescope', 'engineer'],
    ])
    for (const d of REFERENCE_DESIGNS) {
      expect(validateComponents(d, gameData).filter((i) => i.code === 'COMPONENT_NOT_AVAILABLE'), d.scenarioId).toEqual([])
      expect(designReview(d, gameData).hardBlockers, d.scenarioId).toEqual([])
    }
  })

  it('does not mutate its inputs', () => {
    const d = design({ difficulty: 'cadet' })
    const snaps = [JSON.stringify(d), JSON.stringify(gameData)]
    componentOptions('power', gameData, 'cadet')
    previewOptions(d, 'power', gameData)
    validateComponents(d, gameData)
    expect([JSON.stringify(d), JSON.stringify(gameData)]).toEqual(snaps)
  })
})
