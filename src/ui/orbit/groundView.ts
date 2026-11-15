// Pure helpers for the ground station network choice (FR-5.6). No React, unit-tested in Node.
// Contact minutes use the same formula as the engine's comms budget (src/engine/rules/resources.ts).
import { MINUTES_PER_DAY } from '../../engine/constants'
import type { GameData, GroundNetwork, MissionDesign, Orbit } from '../../engine/types'
import { moneyLabel, type Label } from '../scenarios/scenarioView'

export interface GroundCard {
  id: string
  name: string
  /** i18n key ground.catalog.<id> holds the plain-language line. */
  textKey: string
  contactMultiplier: number
  /** Minutes of contact per day from the chosen orbit; null until an orbit is chosen. */
  contactMinPerDay: number | null
  /** Contact with a single station from this orbit (the orbit's base value), for comparison. */
  baseContactMinPerDay: number | null
  costPerYear: Label
  /** Whole-mission cost: cost per year × mission years (as the engine's budget counts it). */
  missionCost: Label
  missionYears: number
  reach: Label
  reasons: Label[]
}

/** Minutes of contact per day with this network from this orbit (engine formula). */
export function contactMinutes(orbit: Orbit, network: GroundNetwork): number {
  return Math.min(MINUTES_PER_DAY, orbit.contactMinPerDay * network.contactMultiplier)
}

/** Why the network can't be used from the chosen orbit; empty array = OK. */
export function groundReasons(network: GroundNetwork, orbit: Orbit | null): Label[] {
  if (orbit && orbit.distanceKm > network.maxDistanceKm) {
    return [
      {
        key: 'ground.tooFar',
        values: { reach: kmLabel(network.maxDistanceKm), distance: kmLabel(orbit.distanceKm) },
      },
    ]
  }
  return []
}

/** Distances as labels: 3,000 km · 1.5 million km · 10 billion km */
export function kmLabel(km: number): Label {
  if (km >= 1e9) return { key: 'units.kmBillion', values: { value: Math.round(km / 1e9).toLocaleString('en-US') } }
  if (km >= 1e6) return { key: 'units.kmMillion', values: { value: String(Math.round((km / 1e6) * 10) / 10) } }
  return { key: 'units.km', values: { value: Math.round(km).toLocaleString('en-US') } }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function toGroundCard(
  network: GroundNetwork,
  design: Pick<MissionDesign, 'orbitId' | 'scenarioId'>,
  data: Pick<GameData, 'orbits' | 'scenarios'>,
): GroundCard {
  const orbit = data.orbits.find((o) => o.id === design.orbitId) ?? null
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const years = (scenario?.durationDays ?? 0) / 365
  return {
    id: network.id,
    name: network.name,
    textKey: `ground.catalog.${network.id}`,
    contactMultiplier: network.contactMultiplier,
    contactMinPerDay: orbit ? contactMinutes(orbit, network) : null,
    baseContactMinPerDay: orbit ? orbit.contactMinPerDay : null,
    costPerYear: moneyLabel(network.costM),
    missionCost: moneyLabel(round2(network.costM * years)),
    missionYears: round2(years),
    reach: { key: 'ground.reachValue', values: { value: kmLabel(network.maxDistanceKm) } },
    reasons: groundReasons(network, orbit),
  }
}
