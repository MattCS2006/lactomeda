// Instrument compatibility (FR-4.2), modelled on NASA's telescope learning game (FR-14.8):
// an instrument is only offered if it measures something the mission needs and can work
// from an orbit the mission can fly. Pure, unit-tested.
//
// PROPOSAL for Dev 1: the same rule could live in engine validate() so a saved or shared
// design with an incompatible instrument is flagged too; this file would then import it.
import type { GameData, Instrument, MissionDesign, Scenario } from '../../engine/types'
import type { Label } from '../scenarios/scenarioView'

export type IncompatibilityCode = 'objective' | 'orbit' | 'chosenOrbit'

export interface Incompatibility {
  code: IncompatibilityCode
  label: Label
}

/** Reasons an instrument can't be used on this mission; empty array = compatible. */
export function incompatibilities(
  instrument: Instrument,
  scenario: Scenario,
  design: Pick<MissionDesign, 'orbitId'>,
  data: Pick<GameData, 'orbits'>,
): Incompatibility[] {
  const out: Incompatibility[] = []
  const orbitName = (id: string) => data.orbits.find((o) => o.id === id)?.name ?? id

  const needed = new Set(scenario.objectives.map((o) => o.id))
  if (!instrument.objectives.some((id) => needed.has(id))) {
    out.push({
      code: 'objective',
      label: {
        key: 'payload.incompatible.objective',
        values: { needs: scenario.objectives.map((o) => o.label).join(' · ') },
      },
    })
  }

  if (design.orbitId) {
    if (!instrument.preferredOrbits.includes(design.orbitId)) {
      out.push({
        code: 'chosenOrbit',
        label: { key: 'payload.incompatible.chosenOrbit', values: { orbit: orbitName(design.orbitId) } },
      })
    }
  } else if (!instrument.preferredOrbits.some((id) => scenario.allowedOrbitIds.includes(id))) {
    out.push({
      code: 'orbit',
      label: {
        key: 'payload.incompatible.orbit',
        values: { orbits: instrument.preferredOrbits.map(orbitName).join(' · ') },
      },
    })
  }
  return out
}

export function isCompatible(
  instrument: Instrument,
  scenario: Scenario,
  design: Pick<MissionDesign, 'orbitId'>,
  data: Pick<GameData, 'orbits'>,
): boolean {
  return incompatibilities(instrument, scenario, design, data).length === 0
}
