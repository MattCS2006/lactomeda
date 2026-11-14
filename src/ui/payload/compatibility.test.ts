import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import en from '../../i18n/en.json'
import { incompatibilities, isCompatible } from './compatibility'

const scenario = (id: string) => gameData.scenarios.find((s) => s.id === id)!
const inst = (id: string) => gameData.instruments.find((i) => i.id === id)!
const noOrbit = { orbitId: null }
const compatibleIds = (sid: string) =>
  gameData.instruments.filter((i) => isCompatible(i, scenario(sid), noOrbit, gameData)).map((i) => i.id)

describe('instrument compatibility (FR-4.2)', () => {
  it('every scenario keeps at least 2 compatible instruments (no single right answer)', () => {
    for (const s of gameData.scenarios) expect(compatibleIds(s.id).length, s.id).toBeGreaterThanOrEqual(2)
  })

  it('offers the expected instruments per MVP scenario', () => {
    expect(compatibleIds('student-cubesat')).toEqual(['inst-visible-cam', 'inst-multispectral', 'inst-magnetometer', 'inst-particle'])
    expect(compatibleIds('wildfire-eo')).toEqual(['inst-multispectral', 'inst-thermal-ir', 'inst-sar', 'inst-laser-alt'])
    expect(compatibleIds('space-telescope')).toEqual(['inst-spectrometer', 'inst-telescope'])
  })

  it('explains an objective mismatch, naming what the mission needs', () => {
    const reasons = incompatibilities(inst('inst-visible-cam'), scenario('wildfire-eo'), noOrbit, gameData)
    expect(reasons.map((r) => r.code)).toEqual(['objective'])
    expect(reasons[0].label.values?.needs).toContain('Detect active fires quickly')
  })

  it('explains an orbit mismatch with the orbit names', () => {
    const reasons = incompatibilities(inst('inst-telescope'), scenario('student-cubesat'), noOrbit, gameData)
    expect(reasons.map((r) => r.code)).toEqual(['objective', 'orbit'])
    expect(reasons[1].label.values?.orbits).toBe('Sun-Earth L2')
  })

  it('uses the chosen orbit once there is one', () => {
    const thermal = inst('inst-thermal-ir') // works from SSO, LEO, GEO
    const wildfire = scenario('wildfire-eo')
    expect(isCompatible(thermal, wildfire, { orbitId: 'geo' }, gameData)).toBe(true)
    const sar = inst('inst-sar') // SSO, LEO only
    const reasons = incompatibilities(sar, wildfire, { orbitId: 'geo' }, gameData)
    expect(reasons.map((r) => r.code)).toEqual(['chosenOrbit'])
    expect(reasons[0].label.values?.orbit).toBe('Geostationary')
  })

  it('every reason has an i18n text', () => {
    for (const code of ['objective', 'orbit', 'chosenOrbit']) expect(en.payload.incompatible).toHaveProperty(code)
  })
})
