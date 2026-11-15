// Altitude slider for LEO/SSO (FR-5.3): the range, and what the chosen altitude does to the
// mission, computed by the engine (resolution: objectives.ts; drag and lifetime: propellant.ts).
// Pure, unit-tested.
import { effectiveAltitudeKm, effectivePeriodMin, groundResolutionM } from '../../engine/rules/objectives'
import { orbitHolding, propellantBreakdown } from '../../engine/rules/propellant'
import type { GameData, MissionDesign, Orbit, OrbitRegime } from '../../engine/types'

export interface AltitudeRange {
  min: number
  max: number
  step: number
}

/** ERS §7.3: LEO 300–1,000 km, Sun-synchronous 500–800 km. Other regimes have no slider. */
export const ALTITUDE_RANGE: Partial<Record<OrbitRegime, AltitudeRange>> = {
  LEO: { min: 300, max: 1000, step: 10 },
  SSO: { min: 500, max: 800, step: 10 },
}

export function altitudeRange(orbit: Pick<Orbit, 'regime'> | null | undefined): AltitudeRange | null {
  return (orbit && ALTITUDE_RANGE[orbit.regime]) ?? null
}

/** Keep a value inside the orbit's range, on the slider's step. */
export function clampAltitude(km: number, range: AltitudeRange): number {
  const stepped = Math.round(km / range.step) * range.step
  return Math.min(range.max, Math.max(range.min, stepped))
}

export interface AltitudeEffects {
  altitudeKm: number
  nominalKm: number
  periodMin: number
  /** Ground resolution (m) of each chosen instrument whose resolution depends on altitude. */
  resolutions: { id: string; name: string; metres: number; nominalMetres: number }[]
  /** Days until drag brings the orbit down with no thrusting (null = no decay). */
  decayDays: number | null
  nominalDecayDays: number | null
  /** Mission lifetime estimate and what limits it (engine propellantBreakdown). */
  lifetimeDays: number
  limitedBy: 'reliability' | 'propellant' | 'orbitDecay'
}

export function altitudeEffects(design: MissionDesign, data: GameData): AltitudeEffects | null {
  const orbit = data.orbits.find((o) => o.id === design.orbitId)
  if (!orbit || !altitudeRange(orbit)) return null
  const nominal: MissionDesign = { ...design, altitudeKm: undefined }
  const altitudeKm = effectiveAltitudeKm(design, orbit)

  const seen = new Set<string>()
  const resolutions: AltitudeEffects['resolutions'] = []
  for (const id of design.instrumentIds) {
    const inst = data.instruments.find((i) => i.id === id)
    // only instruments whose resolution scales with altitude (an IFOV, not a fixed resolution)
    if (!inst || seen.has(id) || inst.ifovUrad === undefined || inst.resolutionM !== undefined) continue
    seen.add(id)
    resolutions.push({
      id,
      name: inst.name,
      metres: groundResolutionM(inst, altitudeKm) ?? 0,
      nominalMetres: groundResolutionM(inst, orbit.altitudeKm) ?? 0,
    })
  }

  const breakdown = propellantBreakdown(design, data)
  return {
    altitudeKm,
    nominalKm: orbit.altitudeKm,
    periodMin: effectivePeriodMin(design, orbit),
    resolutions,
    decayDays: orbitHolding(design, data).decayLifetimeDays,
    nominalDecayDays: orbitHolding(nominal, data).decayLifetimeDays,
    lifetimeDays: breakdown.lifetimeDays,
    limitedBy: breakdown.limitedBy,
  }
}

/** Days as a readable duration: 45 days · 7 months · 4.8 years. */
export function daysLabel(days: number): { key: string; values?: Record<string, string> } {
  if (!Number.isFinite(days)) return { key: 'altitude.forever' }
  if (days < 60) return { key: 'altitude.days', values: { value: String(Math.round(days)) } }
  if (days < 730) return { key: 'altitude.months', values: { value: String(Math.round(days / 30)) } }
  return { key: 'altitude.years', values: { value: String(Math.round((days / 365) * 10) / 10) } }
}
