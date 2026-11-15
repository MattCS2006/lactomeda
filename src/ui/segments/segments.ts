// The four mission segments from NASA's "Design and Develop Science Missions" (FR-14.5):
// launch, space, ground and user. They organise the design navigation (tabs) and the
// mission report (one section each). Pure, unit-tested.
import { estimateBudgets } from '../../engine/rules/resources'
import type { GameData, MissionDesign } from '../../engine/types'
import { contactMinutes } from '../orbit/groundView'
import { costLabel } from '../orbit/launcherView'
import { formatNumber } from '../payload/payloadView'
import type { Label } from '../scenarios/scenarioView'
import { DESIGN_STEPS, type DesignStep } from '../store/missionStore'

export type Segment = 'launch' | 'space' | 'ground' | 'user'
export const SEGMENTS: Segment[] = ['launch', 'space', 'ground', 'user']

/** Where each tab takes the player: a design step, and optionally a section on that screen. */
export const SEGMENT_TARGET: Record<Segment, { step: DesignStep; anchor?: string }> = {
  user: { step: 'requirements' },
  space: { step: 'payload' },
  launch: { step: 'orbit', anchor: 'launcher-heading' },
  ground: { step: 'orbit', anchor: 'ground-heading' },
}

/** The segment a screen belongs to (Phase 5 has three; its orbit part is the space segment). */
export function segmentOfStep(step: DesignStep): Segment | null {
  if (step === 'requirements') return 'user'
  if (step === 'payload' || step === 'orbit' || step === 'design') return 'space'
  return null
}

/** Is a segment fully designed? */
export function segmentDone(segment: Segment, design: MissionDesign, furthest: DesignStep): boolean {
  switch (segment) {
    case 'launch':
      return design.launcherId !== null
    case 'space':
      return design.busClassId !== null && design.instrumentIds.length > 0 && design.orbitId !== null
    case 'ground':
      return design.groundNetworkId !== null
    case 'user':
      return DESIGN_STEPS.indexOf(furthest) > DESIGN_STEPS.indexOf('requirements')
  }
}

/** One line of a report section: a label and its value (both translatable). */
export interface ReportLine {
  label: string // i18n key
  value: Label
}

const notChosen: Label = { key: 'segments.notChosen' }
const raw = (text: string): Label => ({ key: 'segments.raw', values: { text } })

/** The mission report, one section per segment (FR-14.5). */
export function segmentReport(design: MissionDesign, data: GameData): Record<Segment, ReportLine[]> {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const orbit = data.orbits.find((o) => o.id === design.orbitId) ?? null
  const launcher = data.launchers.find((l) => l.id === design.launcherId)
  const network = data.groundNetworks.find((g) => g.id === design.groundNetworkId)
  const bus = data.busClasses.find((b) => b.id === design.busClassId)
  const budgets = estimateBudgets(design, data)

  // "Multispectral imager ×2 · Thermal infrared camera"
  const counts = new Map<string, number>()
  for (const id of design.instrumentIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  const instruments = [...counts]
    .map(([id, n]) => {
      const name = data.instruments.find((i) => i.id === id)?.name ?? id
      return n > 1 ? `${name} ×${n}` : name
    })
    .join(' · ')

  const capacity = launcher && orbit ? launcher.capacityKg[orbit.regime] : undefined

  return {
    launch: [
      { label: 'segments.line.launcher', value: launcher ? raw(launcher.name) : notChosen },
      { label: 'segments.line.launchCost', value: launcher ? costLabel(launcher.costM) : notChosen },
      {
        label: 'segments.line.reliability',
        value: launcher
          ? { key: 'segments.percent', values: { value: Math.round(launcher.reliability * 100) } }
          : notChosen,
      },
      {
        label: 'segments.line.capacity',
        value: capacity !== undefined ? { key: 'units.kg', values: { value: formatNumber(capacity) } } : notChosen,
      },
    ],
    space: [
      { label: 'segments.line.bus', value: bus ? raw(bus.name) : notChosen },
      { label: 'segments.line.instruments', value: instruments ? raw(instruments) : notChosen },
      { label: 'segments.line.orbit', value: orbit ? raw(orbit.name) : notChosen },
      {
        label: 'segments.line.mass',
        value: { key: 'units.kg', values: { value: formatNumber(Math.round(budgets.mass.used * 10) / 10) } },
      },
    ],
    ground: [
      { label: 'segments.line.network', value: network ? raw(network.name) : notChosen },
      {
        label: 'segments.line.contact',
        value:
          network && orbit
            ? { key: 'units.minPerDay', values: { value: formatNumber(Math.round(contactMinutes(orbit, network))) } }
            : notChosen,
      },
      {
        label: 'segments.line.dataPerDay',
        value: { key: 'units.mbPerDay', values: { value: formatNumber(Math.round(budgets.data.used)) } },
      },
    ],
    user: [
      { label: 'segments.line.users', value: { key: `segments.users.${design.scenarioId}` } },
      ...(scenario?.objectives ?? []).map((o) => ({
        label: 'segments.line.objective',
        value: {
          key: 'segments.objectiveValue',
          values: {
            objective: o.label,
            level: { key: `requirements.level.${design.requirementLevels[o.id] ?? 'baseline'}` },
          },
        },
      })),
    ],
  }
}
