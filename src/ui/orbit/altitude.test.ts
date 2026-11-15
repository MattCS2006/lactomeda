import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import type { MissionDesign } from '../../engine/types'
import en from '../../i18n/en.json'
import { createDesign, useMissionStore } from '../store/missionStore'
import { ALTITUDE_RANGE, altitudeEffects, altitudeRange, clampAltitude, daysLabel } from './altitudeView'

const orbit = (id: string) => gameData.orbits.find((o) => o.id === id)!
const wildfire = (over: Partial<MissionDesign> = {}): MissionDesign => ({
  ...createDesign('wildfire-eo', gameData, 'cadet', 's'),
  instrumentIds: ['inst-multispectral'],
  orbitId: 'leo',
  ...over,
})
const state = () => useMissionStore.getState()

describe('altitude slider (FR-5.3)', () => {
  it('exists for LEO and SSO only, with the ERS ranges', () => {
    expect(altitudeRange(orbit('leo'))).toEqual({ min: 300, max: 1000, step: 10 })
    expect(altitudeRange(orbit('sso'))).toEqual({ min: 500, max: 800, step: 10 })
    expect(altitudeRange(orbit('geo'))).toBeNull()
    expect(altitudeRange(orbit('l2'))).toBeNull()
    // each orbit's normal altitude is inside its range
    for (const o of gameData.orbits) {
      const r = ALTITUDE_RANGE[o.regime]
      if (r) expect(o.altitudeKm, o.id).toBeGreaterThanOrEqual(r.min)
      if (r) expect(o.altitudeKm, o.id).toBeLessThanOrEqual(r.max)
    }
  })

  it('acceptance: lower altitude = better resolution and shorter lifetime (drag)', () => {
    const low = altitudeEffects(wildfire({ altitudeKm: 350 }), gameData)!
    const normal = altitudeEffects(wildfire(), gameData)!
    const high = altitudeEffects(wildfire({ altitudeKm: 800 }), gameData)!
    // resolution in metres: smaller = sharper
    expect(low.resolutions[0].metres).toBeLessThan(normal.resolutions[0].metres)
    expect(normal.resolutions[0].metres).toBeLessThan(high.resolutions[0].metres)
    // drag brings the orbit down sooner when lower
    expect(low.decayDays!).toBeLessThan(normal.decayDays!)
    expect(normal.decayDays!).toBeLessThan(high.decayDays!)
    // and the period gets shorter
    expect(low.periodMin).toBeLessThan(high.periodMin)
  })

  it('compares with the normal altitude of the orbit', () => {
    const fx = altitudeEffects(wildfire({ altitudeKm: 400 }), gameData)!
    expect(fx.nominalKm).toBe(500)
    expect(fx.resolutions[0].metres).toBeLessThan(fx.resolutions[0].nominalMetres)
    expect(fx.decayDays!).toBeLessThan(fx.nominalDecayDays!)
  })

  it('only lists instruments whose resolution depends on altitude', () => {
    const fx = altitudeEffects(
      wildfire({ instrumentIds: ['inst-sar', 'inst-multispectral', 'inst-multispectral'] }),
      gameData,
    )!
    expect(fx.resolutions.map((r) => r.id)).toEqual(['inst-multispectral'])
  })

  it('clamps to the range and the step', () => {
    const r = altitudeRange(orbit('leo'))!
    expect(clampAltitude(123, r)).toBe(300)
    expect(clampAltitude(5000, r)).toBe(1000)
    expect(clampAltitude(456, r)).toBe(460)
  })

  it('formats durations', () => {
    expect(daysLabel(30)).toEqual({ key: 'altitude.days', values: { value: '30' } })
    expect(daysLabel(300)).toEqual({ key: 'altitude.months', values: { value: '10' } })
    expect(daysLabel(1825)).toEqual({ key: 'altitude.years', values: { value: '5' } })
    expect(daysLabel(Infinity)).toEqual({ key: 'altitude.forever' })
    for (const k of ['days', 'months', 'years', 'forever']) expect(en.altitude).toHaveProperty(k)
  })
})

describe('mission store — altitude', () => {
  beforeEach(() => {
    useMissionStore.setState({ screen: 'design', step: 'orbit', furthest: 'orbit', design: null })
    state().selectScenario('wildfire-eo', gameData)
  })

  it('sets the altitude for LEO/SSO, clamped; the normal altitude clears the override', () => {
    state().selectOrbit('leo', gameData)
    state().setAltitude(352, gameData)
    expect(state().design?.altitudeKm).toBe(350)
    state().setAltitude(10, gameData)
    expect(state().design?.altitudeKm).toBe(300)
    state().setAltitude(500, gameData)
    expect(state().design?.altitudeKm).toBeUndefined()
  })

  it('does nothing for orbits without a slider', () => {
    state().selectOrbit('geo', gameData)
    state().setAltitude(400, gameData)
    expect(state().design?.altitudeKm).toBeUndefined()
  })

  it('changing orbit resets the altitude', () => {
    state().selectOrbit('leo', gameData)
    state().setAltitude(400, gameData)
    state().selectOrbit('sso', gameData)
    expect(state().design?.altitudeKm).toBeUndefined()
  })
})
