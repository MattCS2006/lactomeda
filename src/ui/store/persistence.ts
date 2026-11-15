// Auto-save of the current design (FR-11.1): what is stored, where, and how a saved design is
// checked against the current catalog when the page loads. Pure helpers, unit-tested.
import type { StateStorage } from 'zustand/middleware'
import type { GameData, MissionDesign, RequirementLevel } from '../../engine/types'

export const SAVE_KEY = 'lactomeda.design'
export const SAVE_VERSION = 1

const LEVELS: RequirementLevel[] = ['threshold', 'baseline', 'goal']

/**
 * localStorage that never throws (private mode, blocked storage, quota, Node tests).
 * If storage is unavailable the game still works, it just doesn't remember.
 */
export const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return globalThis.localStorage?.getItem(name) ?? null
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      globalThis.localStorage?.setItem(name, value)
    } catch {
      // ignore: nothing to save to
    }
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage?.removeItem(name)
    } catch {
      // ignore
    }
  },
}

/**
 * Make a saved design safe to use with today's catalog: unknown scenario → discard;
 * unknown parts, instruments, orbit, launcher or network → dropped; missing requirement
 * levels → baseline. Returns null when nothing usable is left.
 */
export function sanitizeDesign(saved: unknown, data: GameData): MissionDesign | null {
  if (!saved || typeof saved !== 'object') return null
  const d = saved as Partial<MissionDesign>
  const scenario = data.scenarios.find((s) => s.id === d.scenarioId)
  if (!scenario) return null

  const has = <T extends { id: string }>(list: T[], id: unknown): id is string =>
    typeof id === 'string' && list.some((x) => x.id === id)
  const savedLevels = (d.requirementLevels ?? {}) as Record<string, unknown>
  const requirementLevels = Object.fromEntries(
    scenario.objectives.map((o) => {
      const level = savedLevels[o.id]
      return [o.id, LEVELS.includes(level as RequirementLevel) ? (level as RequirementLevel) : 'baseline']
    }),
  )
  const componentIds = Object.fromEntries(
    Object.entries(d.componentIds ?? {}).filter(([, id]) => has(data.components, id)),
  ) as MissionDesign['componentIds']
  const instrumentIds = Array.isArray(d.instrumentIds) ? d.instrumentIds.filter((id) => has(data.instruments, id)) : []
  const dutyCycle = Object.fromEntries(
    Object.entries(d.dutyCycle ?? {}).filter(
      ([id, v]) => instrumentIds.includes(id) && typeof v === 'number' && v >= 0 && v <= 1,
    ),
  )
  const orbitId = has(data.orbits, d.orbitId) && scenario.allowedOrbitIds.includes(d.orbitId) ? d.orbitId : null

  return {
    scenarioId: scenario.id,
    difficulty: d.difficulty === 'engineer' || d.difficulty === 'flightDirector' ? d.difficulty : 'cadet',
    ...(typeof d.missionName === 'string' ? { missionName: d.missionName } : {}),
    requirementLevels,
    busClassId: has(data.busClasses, d.busClassId) ? d.busClassId : null,
    componentIds,
    redundant: Array.isArray(d.redundant) ? d.redundant.filter((s) => s in componentIds) : [],
    propellantKg: typeof d.propellantKg === 'number' && d.propellantKg >= 0 ? d.propellantKg : 0,
    instrumentIds,
    dutyCycle,
    orbitId,
    ...(orbitId && typeof d.altitudeKm === 'number' ? { altitudeKm: d.altitudeKm } : {}),
    launcherId: has(data.launchers, d.launcherId) ? d.launcherId : null,
    groundNetworkId: has(data.groundNetworks, d.groundNetworkId) ? d.groundNetworkId : null,
    seed: typeof d.seed === 'string' && d.seed ? d.seed : 'restored',
  }
}
