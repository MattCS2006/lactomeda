import { describe, expect, it } from 'vitest'
import { fullGameData as gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { DRAG_SCALE_HEIGHT_KM, G0 } from '../constants'
import { initSim, runMission, simulateTick } from '../sim'
import type { GameData, MissionDesign } from '../types'
import { validate } from '../validate'
import { massBreakdown } from './mass'
import { validateOrbit } from './orbit'
import { availableDeltaVms, propellantBreakdown, propellantBurned, propellantForDeltaV, validatePropellant } from './propellant'
import { estimateBudgets } from './resources'

const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!

/** Perfect parts and launcher, a big budget and no random events: only propellant and orbit decay can end a mission. */
const perfect: GameData = {
  ...gameData,
  events: [],
  scenarios: gameData.scenarios.map((s) => ({ ...s, budgetM: 1000 })),
  components: gameData.components.map((c) => ({ ...c, reliability: 1 })),
  launchers: gameData.launchers.map((l) => ({ ...l, reliability: 1 })),
}

/** The Student CubeSat in LEO with a hydrazine thruster (Isp 220 s). */
const leo = (over: Partial<MissionDesign> = {}): MissionDesign => ({
  ...ref('student-cubesat'),
  orbitId: 'leo',
  componentIds: { ...ref('student-cubesat').componentIds, propulsion: 'prop-mono' },
  ...over,
})
const dryOf = (d: MissionDesign, data: GameData = gameData): number => {
  const m = massBreakdown(d, data)
  return m.dryMassKg + m.contingencyKg
}
const withOrbit = (id: string, patch: Partial<GameData['orbits'][number]>): GameData => ({
  ...gameData,
  orbits: gameData.orbits.map((o) => (o.id === id ? { ...o, ...patch } : o)),
})

describe('availableDeltaVms (rocket equation)', () => {
  it('matches Isp x g0 x ln((dry + propellant) / dry) by hand', () => {
    const d = leo({ propellantKg: 12 })
    const dry = dryOf(d)
    expect(availableDeltaVms(d, gameData)).toBeCloseTo(220 * G0 * Math.log((dry + 12) / dry), 9)
    expect(availableDeltaVms(d, gameData)).toBeGreaterThan(0)
  })

  it('grows with the propellant and with the Isp, and is 0 without propellant or without propulsion', () => {
    const base = availableDeltaVms(leo({ propellantKg: 5 }), gameData)
    expect(availableDeltaVms(leo({ propellantKg: 10 }), gameData)).toBeGreaterThan(base)
    const isp = (id: string) => ({ ...leo({ propellantKg: 5 }), componentIds: { ...leo().componentIds, propulsion: id } })
    // same propellant on a lighter or heavier part changes the dry mass too, so compare through the same part with a higher Isp
    const higher: GameData = { ...gameData, components: gameData.components.map((c) => (c.id === 'prop-mono' ? { ...c, ispS: 440 } : c)) }
    expect(availableDeltaVms(leo({ propellantKg: 5 }), higher)).toBeCloseTo(2 * base, 9)
    expect(availableDeltaVms(leo({ propellantKg: 0 }), gameData)).toBe(0)
    expect(availableDeltaVms(isp('prop-none'), gameData)).toBe(0)
    expect(availableDeltaVms({ ...leo(), componentIds: {} }, gameData)).toBe(0)
  })

  it('falls back to the fixed delta-v of a propulsion part with no Isp', () => {
    const fixed: GameData = { ...gameData, components: gameData.components.map((c) => (c.id === 'prop-mono' ? { ...c, ispS: undefined } : c)) }
    expect(availableDeltaVms(leo({ propellantKg: 0 }), fixed)).toBe(200)
    expect(propellantBreakdown(leo(), fixed).ispS).toBeNull()
  })

  it('propellantForDeltaV and propellantBurned are the inverse of the rocket equation', () => {
    const dry = 100
    const needed = propellantForDeltaV(dry, 150, 220)
    expect(220 * G0 * Math.log((dry + needed) / dry)).toBeCloseTo(150, 9)
    expect(propellantBurned(dry + needed, 150, 220)).toBeCloseTo(needed, 9)
  })
})

describe('insertion, station-keeping and decay', () => {
  it('subtracts the insertion delta-v first', () => {
    const data = withOrbit('leo', { insertionDeltaVms: 100 })
    const d = leo()
    const dry = dryOf(d)
    const burn = (dv: number) => propellantForDeltaV(dry, dv, 220)

    const short = propellantBreakdown({ ...d, propellantKg: burn(80) }, data)
    expect(short.insertionDeltaVms).toBe(100)
    expect(short.remainingDeltaVms).toBe(0)
    expect(validateOrbit({ ...d, propellantKg: burn(80) }, data).map((i) => i.code)).toContain('INSUFFICIENT_DELTA_V')

    const enough = propellantBreakdown({ ...d, propellantKg: burn(150) }, data)
    expect(enough.availableDeltaVms).toBeCloseTo(150, 6)
    expect(enough.remainingDeltaVms).toBeCloseTo(50, 6)
    expect(validateOrbit({ ...d, propellantKg: burn(150) }, data).map((i) => i.code)).not.toContain('INSUFFICIENT_DELTA_V')
  })

  it('turns the remaining delta-v into station-keeping days and adds them to the decay lifetime', () => {
    const d = leo()
    const dry = dryOf(d)
    const b = propellantBreakdown({ ...d, propellantKg: propellantForDeltaV(dry, 20, 220) }, gameData) // 10 m/s per year in LEO
    expect(b.stationKeepingMsPerYear).toBe(10)
    expect(b.stationKeepingDays).toBeCloseTo((20 / 10) * 365, 6)
    expect(b.decayLifetimeDays).toBe(1825)
    expect(b.orbitLifetimeDays).toBeCloseTo(1825 + 730, 6)
  })

  it('needs more station-keeping and decays sooner at a lower altitude (LEO override, 400 vs 500 km)', () => {
    const nominal = propellantBreakdown(leo({ propellantKg: 3 }), gameData)
    const low = propellantBreakdown(leo({ propellantKg: 3, altitudeKm: 400 }), gameData)
    const factor = Math.exp((500 - 400) / DRAG_SCALE_HEIGHT_KM)
    expect(low.stationKeepingMsPerYear).toBeCloseTo(nominal.stationKeepingMsPerYear * factor, 9)
    expect(low.decayLifetimeDays!).toBeCloseTo(nominal.decayLifetimeDays! / factor, 9)
    expect(low.stationKeepingMsPerYear).toBeGreaterThan(nominal.stationKeepingMsPerYear)
    expect(low.decayLifetimeDays!).toBeLessThan(nominal.decayLifetimeDays!)
    expect(low.orbitLifetimeDays).toBeLessThan(nominal.orbitLifetimeDays)
  })

  it('does not scale an orbit that is not LEO or SSO by the altitude override', () => {
    const lunar = propellantBreakdown({ ...leo({ propellantKg: 3, altitudeKm: 400 }), orbitId: 'lunar' }, gameData)
    expect(lunar.stationKeepingMsPerYear).toBe(60)
    expect(lunar.decayLifetimeDays).toBe(180)
  })

  it('with no propulsion in LEO, the orbit lasts exactly its decay lifetime', () => {
    const d = leo({ componentIds: { ...leo().componentIds, propulsion: 'prop-none' } })
    const b = propellantBreakdown(d, perfect)
    expect(b.availableDeltaVms).toBe(0)
    expect(b.stationKeepingDays).toBe(0)
    expect(b.orbitLifetimeDays).toBe(b.decayLifetimeDays)
    expect(b.limitedBy).toBe('orbitDecay')
  })

  it('has no orbit limit in an orbit without decay (L2): infinite orbit life, limited by reliability', () => {
    const b = propellantBreakdown(ref('space-telescope'), gameData)
    expect(b.decayLifetimeDays).toBeNull()
    expect(b.orbitLifetimeDays).toBe(Infinity)
    expect(b.lifetimeDays).toBe(b.reliabilityLifetimeDays)
    expect(b.limitedBy).toBe('reliability')
  })

  it('reports who limits the lifetime', () => {
    const d = leo({ propellantKg: 0 })
    expect(propellantBreakdown(d, perfect).limitedBy).toBe('orbitDecay') // 1825 days of drag, no propellant
    const fueled = propellantBreakdown({ ...d, propellantKg: propellantForDeltaV(dryOf(d), 5, 220) }, perfect)
    expect(fueled.limitedBy).toBe('propellant') // propellant extends the 1825 days, parts would last 3650
    expect(fueled.lifetimeDays).toBe(fueled.orbitLifetimeDays)
    const lots = propellantBreakdown({ ...d, propellantKg: propellantForDeltaV(dryOf(d), 100, 220) }, perfect)
    expect(lots.limitedBy).toBe('reliability') // enough propellant that the parts are the limit
    expect(lots.lifetimeDays).toBe(lots.reliabilityLifetimeDays)
  })

  it('reports the propellant the mission needs: insertion plus station-keeping over the mission', () => {
    const b = propellantBreakdown(ref('space-telescope'), gameData)
    const dv = 60 + 4 * (1825 / 365)
    expect(b.propellantNeededKg).toBeCloseTo(propellantForDeltaV(b.dryMassKg, dv, 220), 9)
    expect(b.propellantKg).toBeGreaterThanOrEqual(b.propellantNeededKg) // the reference design carries enough
  })
})

describe('lifetime estimate (acceptance)', () => {
  it('updates when the propellant changes: more propellant, longer life, and the time budget follows', () => {
    const lives = [0, 0.1, 0.2, 0.4].map((kg) => {
      const d = leo({ propellantKg: kg })
      const b = propellantBreakdown(d, perfect)
      expect(estimateBudgets(d, perfect).time.available).toBe(b.lifetimeDays)
      return b.lifetimeDays
    })
    for (let i = 1; i < lives.length; i++) expect(lives[i]).toBeGreaterThan(lives[i - 1])
    expect(estimateBudgets(leo({ propellantKg: 0.1 }), perfect).time.available).not.toBe(
      estimateBudgets(leo({ propellantKg: 0.3 }), perfect).time.available,
    )
  })

  it('makes time.available the minimum of the reliability life and the orbit life', () => {
    for (const d of REFERENCE_DESIGNS) {
      const b = propellantBreakdown(d, gameData)
      expect(b.lifetimeDays).toBe(Math.min(b.reliabilityLifetimeDays, b.orbitLifetimeDays))
      expect(estimateBudgets(d, gameData).time.available).toBe(b.lifetimeDays)
    }
  })
})

describe('validatePropellant', () => {
  it('warns LIFETIME_SHORTER_THAN_MISSION when the spacecraft will not last the mission, and names the cause', () => {
    const low = leo({ propellantKg: 0, altitudeKm: 300 }) // 1825 / e^(200/70) = ~105 days of drag
    const issues = validatePropellant(low, perfect)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'LIFETIME_SHORTER_THAN_MISSION', severity: 'warning', resource: 'time' })
    expect(issues[0].message).toContain('propellant')
    expect(validate(low, perfect).map((i) => i.code)).toContain('LIFETIME_SHORTER_THAN_MISSION')
    expect(propellantBreakdown(low, perfect).lifetimeDays).toBeLessThan(365)

    const weak = validatePropellant(leo(), { ...perfect, components: perfect.components.map((c) => ({ ...c, reliability: 0.5 })) })
    expect(weak[0].message).toContain('reliable')
  })

  it('does not warn when the lifetime covers the mission, and never blocks the launch', () => {
    for (const d of REFERENCE_DESIGNS) expect(validatePropellant(d, gameData), d.scenarioId).toEqual([])
  })
})

describe('simulation', () => {
  const lowLeo = (over: Partial<MissionDesign> = {}): MissionDesign => leo({ altitudeKm: 300, seed: 'alpha', ...over })

  it('burns station-keeping propellant every day, following the rocket equation', () => {
    const d = lowLeo({ propellantKg: 8 })
    let state = initSim(d, perfect)
    expect(state.propellantKg).toBe(8) // LEO needs no insertion burn
    const holding = propellantBreakdown(d, perfect)
    let expected = 8
    for (let i = 0; i < 5; i++) {
      const before = state.propellantKg
      state = simulateTick(state, d, perfect)
      expect(state.propellantKg).toBeLessThan(before)
      expected -= propellantBurned(holding.dryMassKg + expected, holding.stationKeepingMsPerYear / 365, 220)
      expect(state.propellantKg).toBeCloseTo(expected, 9)
    }
  })

  it('pays the insertion burn at the start', () => {
    const data = withOrbit('leo', { insertionDeltaVms: 100 })
    const d = leo({ propellantKg: propellantForDeltaV(dryOf(leo()), 150, 220) })
    const state = initSim(d, { ...data, launchers: perfect.launchers })
    const left = propellantBurned(dryOf(d) + d.propellantKg, 100, 220)
    expect(state.propellantKg).toBeCloseTo(d.propellantKg - left, 9)
    // what is left holds exactly the remaining 50 m/s
    expect(220 * G0 * Math.log((dryOf(d) + state.propellantKg) / dryOf(d))).toBeCloseTo(50, 6)
  })

  it('ends the mission with "Orbit decayed" after the decay time once the propellant runs out', () => {
    const d = lowLeo({ propellantKg: 0.3 })
    const decay = propellantBreakdown(d, perfect).decayLifetimeDays!
    const end = runMission(d, perfect)
    const ranOut = end.log.find((l) => l.text.startsWith('Out of propellant'))!
    expect(ranOut.kind).toBe('warning')
    expect(ranOut.day).toBeGreaterThan(0)
    expect(end).toMatchObject({ status: 'success', endReason: 'lifetimeReached', propellantKg: 0 })
    expect(end.day).toBe(Math.ceil(ranOut.day + decay))
    expect(end.day).toBeLessThan(365)
    expect(end.log.at(-1)!.text).toContain('Orbit decayed')
  })

  it('starts the decay on day 0 with no propellant', () => {
    const d = lowLeo({ propellantKg: 0 })
    const decay = propellantBreakdown(d, perfect).decayLifetimeDays!
    const end = runMission(d, perfect)
    expect(end.log[0]).toMatchObject({ day: 0, kind: 'warning' })
    expect(end.day).toBe(Math.ceil(decay))
    expect(end.log.at(-1)!.text).toContain('Orbit decayed')
    const noThruster = lowLeo({ componentIds: { ...leo().componentIds, propulsion: 'prop-none' } })
    expect(runMission(noThruster, perfect).day).toBe(Math.ceil(decay)) // a part with no Isp decays on the same schedule
  })

  it('does not end a mission early when there is enough propellant, nor in an orbit that does not decay', () => {
    const d = lowLeo({ propellantKg: 20 })
    expect(runMission(d, perfect)).toMatchObject({ status: 'success', day: 365 })
    expect(runMission({ ...ref('space-telescope'), seed: 'alpha' }, perfect)).toMatchObject({ status: 'success', day: 1825 })
  })

  it('gives the same log for the same design and seed', () => {
    const d = lowLeo({ propellantKg: 0.3 })
    expect(runMission(d, perfect).log).toEqual(runMission(d, perfect).log)
  })
})

describe('reference designs', () => {
  it('have enough delta-v for their orbit and last the whole mission', () => {
    for (const d of REFERENCE_DESIGNS) {
      const b = propellantBreakdown(d, gameData)
      const duration = gameData.scenarios.find((s) => s.id === d.scenarioId)!.durationDays
      expect(b.availableDeltaVms, d.scenarioId).toBeGreaterThanOrEqual(b.insertionDeltaVms)
      expect(b.lifetimeDays, d.scenarioId).toBeGreaterThanOrEqual(duration)
    }
  })
})

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const d = leo({ propellantKg: 3, altitudeKm: 400 })
    const snaps = [JSON.stringify(d), JSON.stringify(gameData)]
    propellantBreakdown(d, gameData)
    validatePropellant(d, gameData)
    availableDeltaVms(d, gameData)
    runMission({ ...d, seed: 'alpha' }, perfect)
    expect([JSON.stringify(d), JSON.stringify(gameData)]).toEqual(snaps)
  })
})
