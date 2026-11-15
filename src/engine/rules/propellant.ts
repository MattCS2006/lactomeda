// FR-3.6 propellant: the amount of propellant sets the delta-v (rocket equation), which pays for the orbit insertion
// first and then for station-keeping; when it runs out, an orbit with atmospheric drag decays. The lifetime estimate
// is the shorter of that and the reliability lifetime. Pure and deterministic: nothing is mutated.
// `message` text is an English fallback; the UI translates by `code` via i18next.
import { DRAG_SCALE_HEIGHT_KM, G0 } from '../constants'
import type { GameData, MissionDesign, Orbit, ValidationIssue } from '../types'
import { selectedComponent } from './components'
import { massBreakdown } from './mass'
import { effectiveAltitudeKm } from './objectives'
import { reliabilityLifetimeDays } from './resources'

export interface PropellantBreakdown {
  propellantKg: number
  ispS: number | null
  dryMassKg: number // dry mass + contingency: the mass the propellant pushes
  availableDeltaVms: number
  insertionDeltaVms: number
  remainingDeltaVms: number // after the insertion
  stationKeepingMsPerYear: number // after altitude scaling
  stationKeepingDays: number // Infinity if no station-keeping is needed
  decayLifetimeDays: number | null // after altitude scaling; null = no decay
  orbitLifetimeDays: number // Infinity if no decay
  reliabilityLifetimeDays: number
  lifetimeDays: number // min of the two
  limitedBy: 'reliability' | 'propellant' | 'orbitDecay'
  propellantNeededKg: number // propellant for insertion + station-keeping over scenario.durationDays
}

/** The orbit-holding numbers the breakdown and the simulation both use. */
export interface OrbitHolding {
  ispS: number | null
  dryMassKg: number
  insertionDeltaVms: number
  stationKeepingMsPerYear: number
  decayLifetimeDays: number | null
}

const fmt = (n: number): string => String(Math.round(n * 10) / 10)

/** Dry mass plus its contingency: the mass the propellant has to push (propellant itself carries no contingency). */
function pushedMassKg(design: MissionDesign, data: GameData): number {
  const m = massBreakdown(design, data)
  return m.dryMassKg + m.contingencyKg
}

/** Station-keeping and decay for this design's orbit; the altitude override of LEO/SSO scales both (drag grows as altitude drops). */
export function orbitHolding(design: MissionDesign, data: GameData): OrbitHolding {
  const orbit: Orbit | undefined = data.orbits.find((o) => o.id === design.orbitId)
  const ispS = selectedComponent(design, 'propulsion', data)?.ispS ?? null
  const dryMassKg = pushedMassKg(design, data)
  if (!orbit) return { ispS, dryMassKg, insertionDeltaVms: 0, stationKeepingMsPerYear: 0, decayLifetimeDays: null }
  const overridden = design.altitudeKm !== undefined && (orbit.regime === 'LEO' || orbit.regime === 'SSO')
  const factor = overridden ? Math.exp((orbit.altitudeKm - effectiveAltitudeKm(design, orbit)) / DRAG_SCALE_HEIGHT_KM) : 1
  return {
    ispS,
    dryMassKg,
    insertionDeltaVms: orbit.insertionDeltaVms,
    stationKeepingMsPerYear: orbit.stationKeepingMsPerYear * factor,
    decayLifetimeDays: orbit.decayLifetimeDays === undefined ? null : orbit.decayLifetimeDays / factor,
  }
}

/**
 * Delta-v the spacecraft can provide (m/s): the rocket equation Isp x g0 x ln((dry + propellant) / dry). A propulsion
 * part with no Isp falls back to its fixed `deltaVms`; no propulsion gives 0.
 */
export function availableDeltaVms(design: MissionDesign, data: GameData): number {
  const propulsion = selectedComponent(design, 'propulsion', data)
  if (!propulsion) return 0
  if (propulsion.ispS === undefined) return propulsion.deltaVms ?? 0
  const dry = pushedMassKg(design, data)
  if (dry <= 0 || design.propellantKg <= 0) return 0
  return propulsion.ispS * G0 * Math.log((dry + design.propellantKg) / dry)
}

/** Propellant (kg) a given delta-v costs for a spacecraft of this mass: m x (exp(dv / (Isp x g0)) - 1). */
export function propellantForDeltaV(massKg: number, deltaVms: number, ispS: number): number {
  return massKg * (Math.exp(deltaVms / (ispS * G0)) - 1)
}

/** Propellant (kg) a burn of `deltaVms` uses when the spacecraft weighs `massKg` before it: m x (1 - exp(-dv / (Isp x g0))). */
export function propellantBurned(massKg: number, deltaVms: number, ispS: number): number {
  return massKg * (1 - Math.exp(-deltaVms / (ispS * G0)))
}

export function propellantBreakdown(design: MissionDesign, data: GameData): PropellantBreakdown {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const durationDays = scenario?.durationDays ?? 0
  const holding = orbitHolding(design, data)
  const available = availableDeltaVms(design, data)
  const remaining = Math.max(0, available - holding.insertionDeltaVms)

  const stationKeepingDays =
    holding.stationKeepingMsPerYear > 0 ? (remaining / holding.stationKeepingMsPerYear) * 365 : Infinity
  const orbitLifetimeDays = holding.decayLifetimeDays === null ? Infinity : holding.decayLifetimeDays + stationKeepingDays
  const reliabilityDays = reliabilityLifetimeDays(design, data)
  const lifetimeDays = Math.min(reliabilityDays, orbitLifetimeDays)

  const limitedBy: PropellantBreakdown['limitedBy'] =
    reliabilityDays <= orbitLifetimeDays ? 'reliability' : stationKeepingDays > 0 ? 'propellant' : 'orbitDecay'

  const neededDeltaV = holding.insertionDeltaVms + (holding.stationKeepingMsPerYear * durationDays) / 365
  const propellantNeededKg = holding.ispS === null ? 0 : propellantForDeltaV(holding.dryMassKg, neededDeltaV, holding.ispS)

  return {
    propellantKg: design.propellantKg,
    ispS: holding.ispS,
    dryMassKg: holding.dryMassKg,
    availableDeltaVms: available,
    insertionDeltaVms: holding.insertionDeltaVms,
    remainingDeltaVms: remaining,
    stationKeepingMsPerYear: holding.stationKeepingMsPerYear,
    stationKeepingDays,
    decayLifetimeDays: holding.decayLifetimeDays,
    orbitLifetimeDays,
    reliabilityLifetimeDays: reliabilityDays,
    lifetimeDays,
    limitedBy,
    propellantNeededKg,
  }
}

/** FR-3.6: warn when the lifetime estimate is shorter than the mission. */
export function validatePropellant(design: MissionDesign, data: GameData): ValidationIssue[] {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  if (!scenario || scenario.durationDays <= 0) return []
  const b = propellantBreakdown(design, data)
  if (b.lifetimeDays >= scenario.durationDays) return []
  const cause = {
    reliability: 'the parts are not reliable enough for the whole mission; add backups or choose more reliable parts.',
    propellant: 'the propellant runs out and the orbit decays; add propellant or choose a higher orbit.',
    orbitDecay: 'the orbit decays and there is no propellant to hold it; add propellant or choose a higher orbit.',
  }[b.limitedBy]
  return [
    {
      code: 'LIFETIME_SHORTER_THAN_MISSION',
      severity: 'warning',
      resource: 'time',
      message: `The spacecraft lasts about ${fmt(b.lifetimeDays)} days but the mission needs ${fmt(scenario.durationDays)}: ${cause}`,
    },
  ]
}
