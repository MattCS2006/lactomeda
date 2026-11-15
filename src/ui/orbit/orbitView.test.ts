import { describe, expect, it } from 'vitest'
import { fullGameData as gameData } from '../../data'
import en from '../../i18n/en.json'
import { createDesign } from '../store/missionStore'
import { altitudeLabel, contactLabel, eclipseLabel, instrumentsLostAt, periodLabel, toOrbitCard } from './orbitView'

const scenario = (id: string) => gameData.scenarios.find((s) => s.id === id)!
const orbit = (id: string) => gameData.orbits.find((o) => o.id === id)!

/** Resolve 'a.b.c' in en.json. */
function text(key: string): unknown {
  return key.split('.').reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), en)
}

describe('orbit catalog (FR-5.1)', () => {
  it('has at least 5 orbits, including the 8 from the ERS', () => {
    expect(gameData.orbits.length).toBeGreaterThanOrEqual(5)
    expect(gameData.orbits.map((o) => o.id)).toEqual(
      expect.arrayContaining(['leo', 'sso', 'meo', 'geo', 'molniya', 'l2', 'lunar', 'mars']),
    )
  })

  it('every orbit has a plain-language card: good for + trade-off', () => {
    for (const o of gameData.orbits) {
      const card = toOrbitCard(o, scenario('student-cubesat'))
      expect(typeof text(`${card.textKey}.goodFor`), o.id).toBe('string')
      expect(typeof text(`${card.textKey}.tradeoff`), o.id).toBe('string')
      for (const l of [card.altitude, card.period, card.eclipse, card.contact]) {
        expect(typeof text(l.key), `${o.id}: ${l.key}`).toBe('string')
      }
    }
  })

  it('marks only the scenario orbits as allowed', () => {
    const cubesat = scenario('student-cubesat')
    const allowed = gameData.orbits.filter((o) => toOrbitCard(o, cubesat).allowed).map((o) => o.id)
    expect(allowed.sort()).toEqual([...cubesat.allowedOrbitIds].sort())
  })

  it('credits NASA GMAT where the numbers came from it', () => {
    expect(toOrbitCard(orbit('leo'), scenario('student-cubesat')).fromGmat).toBe(true)
    expect(toOrbitCard(orbit('geo'), scenario('student-cubesat')).fromGmat).toBe(false)
  })

  it('writes numbers in readable units', () => {
    expect(periodLabel(94.62)).toEqual({ key: 'orbit.units.min', values: { value: '95' } })
    expect(periodLabel(1436.1)).toEqual({ key: 'orbit.units.hours', values: { value: '24' } })
    expect(periodLabel(259200)).toEqual({ key: 'orbit.units.days', values: { value: '180' } })
    expect(altitudeLabel(orbit('leo'))).toEqual({ key: 'orbit.units.above.earth', values: { value: '500' } })
    expect(altitudeLabel(orbit('lunar'))).toEqual({ key: 'orbit.units.above.moon', values: { value: '100' } })
    expect(altitudeLabel(orbit('l2'))).toEqual({ key: 'orbit.units.fromEarth', values: { value: '1,500,000' } })
    expect(eclipseLabel(0.368)).toEqual({ key: 'orbit.units.shadow', values: { value: 37 } })
    expect(eclipseLabel(0)).toEqual({ key: 'orbit.units.alwaysSun' })
    expect(contactLabel(18.2)).toEqual({ key: 'orbit.units.contact', values: { value: '18' } })
    expect(contactLabel(1440)).toEqual({ key: 'orbit.units.alwaysContact' })
  })

  it('warns which selected instruments would stop working from an orbit', () => {
    const d = { ...createDesign('wildfire-eo', gameData, 'cadet', 's'), instrumentIds: ['inst-thermal-ir', 'inst-sar'] }
    expect(instrumentsLostAt('geo', d, gameData)).toEqual(['Synthetic aperture radar'])
    expect(instrumentsLostAt('sso', d, gameData)).toEqual([])
  })
})
