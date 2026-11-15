// "Fly again" (FR-10.6): the design that flew is kept, so the player can change one thing and re-fly.
// Pure helpers, unit-tested: what a flight record holds, how the flown design comes back, and what
// changed since that flight (shown on the design screens to support "change one thing").
import { sanitizeDesign } from '../store/persistence'
import type { Label } from '../scenarios/scenarioView'
import type { GameData, MissionDesign, ScoreResult, Subsystem } from '../../engine/types'

/** The last flight: the design exactly as it flew, and its result once the mission ended. */
export interface FlightRecord {
  design: MissionDesign
  result: Pick<ScoreResult, 'total' | 'stars' | 'outcome'> | null
}

export interface FlyAgainOptions {
  /** false (default): same seed, so the only difference in the next flight is what the player changed (FR-7.8). */
  newEvents?: boolean
}

/** The flown design, checked against today's catalog, with the same seed unless new events are asked for. */
export function restoredDesign(
  record: FlightRecord,
  data: GameData,
  seed: () => string,
  options: FlyAgainOptions = {},
): MissionDesign | null {
  const design = sanitizeDesign(structuredClone(record.design), data)
  if (!design) return null
  return options.newEvents ? { ...design, seed: seed() } : design
}

const none: Label = { key: 'flight.none' }

function nameOf(list: { id: string; name: string }[], id: string | null | undefined): Label | string {
  if (!id) return none
  return list.find((x) => x.id === id)?.name ?? id
}

function counts(ids: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1)
  return m
}

/** Every difference between the flown design and the current one, as labels ("Battery: A → B"). */
export function designChanges(flown: MissionDesign, current: MissionDesign, data: GameData): Label[] {
  const changes: Label[] = []
  const swap = (what: Label | string, from: Label | string, to: Label | string) =>
    changes.push({ key: 'flight.change.swap', values: { what, from, to } })

  if (flown.scenarioId !== current.scenarioId) return [{ key: 'flight.change.scenario' }]

  if (flown.difficulty !== current.difficulty) {
    swap(
      { key: 'flight.what.difficulty' },
      { key: `difficulty.${flown.difficulty}` },
      {
        key: `difficulty.${current.difficulty}`,
      },
    )
  }
  const scenario = data.scenarios.find((s) => s.id === current.scenarioId)
  for (const objective of scenario?.objectives ?? []) {
    const a = flown.requirementLevels[objective.id]
    const b = current.requirementLevels[objective.id]
    if (a !== b)
      swap(
        objective.label,
        { key: `requirements.level.${a}` },
        {
          key: `requirements.level.${b}`,
        },
      )
  }
  if (flown.busClassId !== current.busClassId) {
    swap(
      { key: 'flight.what.bus' },
      nameOf(data.busClasses, flown.busClassId),
      nameOf(data.busClasses, current.busClassId),
    )
  }
  const subsystems = new Set([
    ...Object.keys(flown.componentIds),
    ...Object.keys(current.componentIds),
  ]) as Set<Subsystem>
  for (const s of subsystems) {
    if (flown.componentIds[s] !== current.componentIds[s]) {
      swap(
        { key: `subsystem.${s}.name` },
        nameOf(data.components, flown.componentIds[s]),
        nameOf(data.components, current.componentIds[s]),
      )
    }
  }
  if (flown.propellantKg !== current.propellantKg) {
    const kg = (value: number) => ({ key: 'units.kg', values: { value } })
    swap({ key: 'flight.what.propellant' }, kg(flown.propellantKg), kg(current.propellantKg))
  }
  const before = counts(flown.instrumentIds)
  const after = counts(current.instrumentIds)
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const diff = (after.get(id) ?? 0) - (before.get(id) ?? 0)
    if (diff === 0) continue
    const name = nameOf(data.instruments, id)
    changes.push({
      key: diff > 0 ? 'flight.change.added' : 'flight.change.removed',
      values: { name, count: Math.abs(diff) },
    })
  }
  if (flown.orbitId !== current.orbitId) {
    swap({ key: 'flight.what.orbit' }, nameOf(data.orbits, flown.orbitId), nameOf(data.orbits, current.orbitId))
  } else if (flown.altitudeKm !== current.altitudeKm) {
    const nominal = data.orbits.find((o) => o.id === current.orbitId)?.altitudeKm
    const km = (v: number | undefined) => ({
      key: 'units.km',
      values: { value: (v ?? nominal ?? 0).toLocaleString('en-US') },
    })
    swap({ key: 'flight.what.altitude' }, km(flown.altitudeKm), km(current.altitudeKm))
  }
  if (flown.launcherId !== current.launcherId) {
    swap(
      { key: 'flight.what.launcher' },
      nameOf(data.launchers, flown.launcherId),
      nameOf(data.launchers, current.launcherId),
    )
  }
  if (flown.groundNetworkId !== current.groundNetworkId) {
    swap(
      { key: 'flight.what.ground' },
      nameOf(data.groundNetworks, flown.groundNetworkId),
      nameOf(data.groundNetworks, current.groundNetworkId),
    )
  }
  if (flown.seed !== current.seed) changes.push({ key: 'flight.change.events' })
  return changes
}
