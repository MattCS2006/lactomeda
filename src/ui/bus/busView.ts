// Pure helpers for the Spacecraft Bus screen (FR-3.1, FR-3.2). No React, unit-tested in Node.
// Options and rules come from the engine (src/engine/rules/components.ts, busClass.ts).
import { validateBusClass } from '../../engine/rules/busClass'
import {
  SUBSYSTEMS,
  componentOptions,
  effectivePowerW,
  isSolar,
  validateComponents,
} from '../../engine/rules/components'
import type { BusClass, Component, GameData, MissionDesign, Subsystem, ValidationIssue } from '../../engine/types'
import { moneyLabel, type Label } from '../scenarios/scenarioView'
import { formatNumber } from '../payload/payloadView'

export { SUBSYSTEMS }

export interface BusCard {
  id: string
  name: string
  maxMass: Label
  volume: Label
  cost: Label
  instrumentSlots: number
  componentSlots: number
}

export function toBusCard(bus: BusClass): BusCard {
  return {
    id: bus.id,
    name: bus.name,
    maxMass: { key: 'units.kg', values: { value: formatNumber(bus.maxMassKg) } },
    volume: { key: 'units.litres', values: { value: formatNumber(bus.volumeL) } },
    cost: moneyLabel(bus.baseCostM),
    instrumentSlots: bus.instrumentSlots,
    componentSlots: bus.componentSlots,
  }
}

/** "Uses 8 W" / "Generates 36 W" / "No power" — power in the chosen orbit for solar panels. */
export function powerLabel(component: Component, orbit: GameData['orbits'][number] | null): Label {
  const w = isSolar(component) ? effectivePowerW(component, orbit) : component.powerW
  if (w < 0) return { key: 'bus.power.generates', values: { value: formatNumber(Math.round(-w * 10) / 10) } }
  if (w > 0) return { key: 'bus.power.uses', values: { value: formatNumber(w) } }
  return { key: 'bus.power.none' }
}

/** The stat that makes this part special: battery Wh, radio speed, Δv, storage. */
export function specialLabel(component: Component): Label | null {
  if (component.capacityWh !== undefined)
    return { key: 'bus.special.battery', values: { value: formatNumber(component.capacityWh) } }
  if (component.dataRateKbps !== undefined)
    return { key: 'bus.special.radio', values: { value: rateLabel(component.dataRateKbps) } }
  if (component.deltaVms !== undefined)
    return { key: 'bus.special.deltaV', values: { value: formatNumber(component.deltaVms) } }
  if (component.storageMb !== undefined)
    return { key: 'bus.special.storage', values: { value: storageLabel(component.storageMb) } }
  return null
}

/** 9.6 kbps · 1 Mbps · 100 Mbps · 1 Gbps */
export function rateLabel(kbps: number): Label {
  if (kbps >= 1e6) return { key: 'units.gbps', values: { value: formatNumber(kbps / 1e6) } }
  if (kbps >= 1e3) return { key: 'units.mbps', values: { value: formatNumber(kbps / 1e3) } }
  return { key: 'units.kbps', values: { value: formatNumber(kbps) } }
}

/** 8 GB · 256 GB · 1 TB  (Mb → bytes: 8 Mb = 1 MB) */
export function storageLabel(mb: number): Label {
  const gigabytes = mb / 8 / 1000
  if (gigabytes >= 1000) return { key: 'units.tb', values: { value: formatNumber(gigabytes / 1000) } }
  if (gigabytes >= 1) return { key: 'units.gb', values: { value: formatNumber(gigabytes) } }
  return { key: 'units.mb', values: { value: formatNumber(mb / 8) } }
}

export interface PartCard {
  id: string
  name: string
  advanced: boolean
  mass: Label
  power: Label
  cost: Label
  reliabilityPct: number
  trl: number
  special: Label | null
}

export function toPartCard(component: Component, orbit: GameData['orbits'][number] | null): PartCard {
  return {
    id: component.id,
    name: component.name,
    advanced: component.tier === 'advanced',
    mass: { key: 'units.kg', values: { value: formatNumber(component.massKg) } },
    power: powerLabel(component, orbit),
    cost: moneyLabel(component.costM),
    reliabilityPct: Math.round(component.reliability * 1000) / 10,
    trl: component.trl,
    special: specialLabel(component),
  }
}

/** Options per subsystem, in the engine's order (lightest first). */
export function partOptions(subsystem: Subsystem, design: MissionDesign, data: GameData): PartCard[] {
  const orbit = data.orbits.find((o) => o.id === design.orbitId) ?? null
  return componentOptions(subsystem, data).map((c) => toPartCard(c, orbit))
}

/** Engine findings for this screen (bus limits + subsystem parts), as translatable labels. */
export function busIssues(design: MissionDesign, data: GameData): (ValidationIssue & { label: Label })[] {
  const issues = design.busClassId ? [...validateBusClass(design, data), ...validateComponents(design, data)] : []
  return issues.map((issue) => {
    const label: Label = {
      key: `issues.${issue.code}`,
      values: issue.subsystem ? { subsystem: { key: `subsystem.${issue.subsystem}.name` } } : {},
    }
    return { ...issue, label }
  })
}

/** Bus chosen and a part picked for all 8 subsystems. */
export function busComplete(design: MissionDesign): boolean {
  return design.busClassId !== null && SUBSYSTEMS.every((s) => design.componentIds[s] !== undefined)
}
