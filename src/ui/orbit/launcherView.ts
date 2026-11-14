// Pure helpers for the launcher catalog (FR-5.4). No React, unit-tested in Node.
import type { GameData, Launcher, MissionDesign, OrbitRegime } from '../../engine/types'
import type { Label } from '../scenarios/scenarioView'

/** Display order of orbit regimes on a launcher card. */
export const REGIMES: OrbitRegime[] = ['LEO', 'SSO', 'GTO', 'TLI', 'ESCAPE']

export interface CapacityRow {
  regime: OrbitRegime
  kg: number
  /** The regime of the orbit the player chose. */
  current: boolean
}

export interface LauncherCard {
  id: string
  name: string
  capacities: CapacityRow[]
  cost: Label
  reliabilityPct: number
  failurePct: number
  /** Why it can't be picked; empty = selectable. */
  reasons: Label[]
}

/** Launchers offered in this scenario (some, like NASA CSLI, are scenario-only). */
export function launchersFor(scenarioId: string, data: Pick<GameData, 'launchers'>): Launcher[] {
  return data.launchers.filter((l) => !l.onlyScenarioIds || l.onlyScenarioIds.includes(scenarioId))
}

export function regimeOf(orbitId: string | null, data: Pick<GameData, 'orbits'>): OrbitRegime | null {
  if (!orbitId) return null
  return data.orbits.find((o) => o.id === orbitId)?.regime ?? null
}

/** Why a launcher can't be used with the current design; empty array = OK. */
export function launcherReasons(
  launcher: Launcher,
  design: Pick<MissionDesign, 'orbitId'>,
  data: Pick<GameData, 'orbits'>,
): Label[] {
  const regime = regimeOf(design.orbitId, data)
  if (regime && !(launcher.capacityKg[regime] && launcher.capacityKg[regime]! > 0)) {
    const orbitName = data.orbits.find((o) => o.id === design.orbitId)?.name ?? ''
    return [{ key: 'launcher.cantReach', values: { orbit: orbitName } }]
  }
  return []
}

export function costLabel(costM: number): Label {
  if (costM === 0) return { key: 'launcher.free' }
  if (costM >= 1000) return { key: 'units.moneyB', values: { value: Number.isInteger(costM / 1000) ? costM / 1000 : (costM / 1000).toFixed(1) } }
  return { key: 'units.moneyM', values: { value: costM } }
}

export function toLauncherCard(
  launcher: Launcher,
  design: Pick<MissionDesign, 'orbitId'>,
  data: Pick<GameData, 'orbits'>,
): LauncherCard {
  const current = regimeOf(design.orbitId, data)
  return {
    id: launcher.id,
    name: launcher.name,
    capacities: REGIMES.filter((r) => (launcher.capacityKg[r] ?? 0) > 0).map((r) => ({
      regime: r,
      kg: launcher.capacityKg[r]!,
      current: r === current,
    })),
    cost: costLabel(launcher.costM),
    reliabilityPct: Math.round(launcher.reliability * 100),
    failurePct: Math.round((1 - launcher.reliability) * 100),
    reasons: launcherReasons(launcher, design, data),
  }
}
