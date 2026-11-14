import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import en from '../../i18n/en.json'
import { LEVELS, levelsAreOrdered, lowerIsBetter, targetFor } from './requirementsView'

const objectives = gameData.scenarios.flatMap((s) => s.objectives.map((o) => ({ scenario: s.id, o })))

describe('requirements step (FR-2.3)', () => {
  it('every scenario has 3–5 requirements', () => {
    for (const s of gameData.scenarios) {
      expect(s.objectives.length, s.id).toBeGreaterThanOrEqual(3)
      expect(s.objectives.length, s.id).toBeLessThanOrEqual(5)
    }
  })

  it('every objective has all three levels and they get harder from threshold to goal', () => {
    for (const { scenario, o } of objectives) {
      for (const l of LEVELS) expect(typeof o.levels[l], `${scenario}/${o.id}/${l}`).toBe('number')
      expect(levelsAreOrdered(o), `${scenario}/${o.id}`).toBe(true)
    }
  })

  it('every metric has a plain-language name', () => {
    for (const { o } of objectives) expect(en.metric, o.metric).toHaveProperty(o.metric)
  })

  it('shows the right comparator per metric', () => {
    expect(lowerIsBetter('resolution')).toBe(true)
    expect(lowerIsBetter('revisit')).toBe(true)
    expect(lowerIsBetter('dataPerDay')).toBe(false)
    expect(lowerIsBetter('lifetime')).toBe(false)
    const cubesat = gameData.scenarios.find((s) => s.id === 'student-cubesat')!
    const imaging = cubesat.objectives.find((o) => o.id === 'earthImaging')!
    expect(targetFor(imaging, 'goal')).toEqual({ key: 'requirements.atMost', values: { value: '30', unit: 'm' } })
    const telescope = gameData.scenarios.find((s) => s.id === 'space-telescope')!
    const spectra = telescope.objectives.find((o) => o.id === 'exoplanetSpectra')!
    expect(targetFor(spectra, 'goal')).toEqual({ key: 'requirements.atLeast', values: { value: '30,000', unit: 'Mb/day' } })
    expect(en.requirements).toHaveProperty('atMost')
    expect(en.requirements).toHaveProperty('atLeast')
  })
})
