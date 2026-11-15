// FR-6.8 dependency explainer: which choices consume a resource the most. Every list is built from the same breakdown
// that gives the budget's `used`, so the consumers add up to it (for `time`, the failure-rate shares add up to 1).
// Pure and deterministic: nothing is mutated. Missing ids are left out and never throw.
import type { GameData, MissionDesign, ResourceKey, Subsystem } from '../types'
import { SUBSYSTEMS } from './components'
import { costBreakdown } from './cost'
import { linkBudget } from './link'
import { massBreakdown } from './mass'
import { propellantBreakdown } from './propellant'
import { estimateBudgets, partReliabilities } from './resources'

export interface Consumer {
  rank: number // 1 = biggest
  kind: 'busClass' | 'component' | 'instrument' | 'propellant' | 'contingency' | 'launcher' | 'groundNetwork' | 'lateCost' | 'orbit'
  id: string // the catalog id, or 'propellant' / 'contingency' / 'lateCost'
  name: string
  subsystem?: Subsystem
  value: number // in the resource's unit
  unit: string // 'kg', 'W', 'M USD', 'Mb/day', 'min/day', '%' (days for the orbit entry of `time`)
  share: number // 0..1 of the resource's used total (or of the failure rate for time)
  redundant?: boolean
}

type Draft = Omit<Consumer, 'rank' | 'share'>

const UNIT: Record<ResourceKey, string> = { mass: 'kg', power: 'W', budget: 'M USD', data: 'Mb/day', comms: 'min/day', time: '%' }

/** Installed components in subsystem order, with whether their subsystem has a backup. */
function installed(design: MissionDesign, data: GameData) {
  const redundant = new Set<Subsystem>(design.redundant)
  const out: { component: GameData['components'][number]; subsystem: Subsystem; redundant: boolean }[] = []
  for (const subsystem of SUBSYSTEMS) {
    const id = design.componentIds[subsystem]
    const component = id === undefined ? undefined : data.components.find((c) => c.id === id)
    if (component) out.push({ component, subsystem, redundant: redundant.has(subsystem) })
  }
  return out
}

const withBackup = (name: string, redundant: boolean): string => (redundant ? `${name} (with backup)` : name)

function massConsumers(design: MissionDesign, data: GameData): Draft[] {
  const unit = UNIT.mass
  const drafts: Draft[] = installed(design, data).map(({ component, subsystem, redundant }) => ({
    kind: 'component',
    id: component.id,
    name: withBackup(component.name, redundant),
    subsystem,
    value: component.massKg * (redundant ? 2 : 1),
    unit,
    redundant,
  }))
  for (const id of design.instrumentIds) {
    const instrument = data.instruments.find((i) => i.id === id)
    if (instrument) drafts.push({ kind: 'instrument', id, name: instrument.name, value: instrument.massKg, unit })
  }
  const m = massBreakdown(design, data)
  if (m.propellantKg > 0) drafts.push({ kind: 'propellant', id: 'propellant', name: 'Propellant', value: m.propellantKg, unit })
  if (m.contingencyKg > 0) drafts.push({ kind: 'contingency', id: 'contingency', name: 'Mass contingency', value: m.contingencyKg, unit })
  return drafts
}

function powerConsumers(design: MissionDesign, data: GameData): Draft[] {
  const unit = UNIT.power
  const drafts: Draft[] = []
  // the same load convention as powerBreakdown: only consuming parts, and a backup draws power too
  for (const { component, subsystem, redundant } of installed(design, data)) {
    const value = Math.max(0, component.powerW) * (redundant ? 2 : 1)
    if (value > 0) drafts.push({ kind: 'component', id: component.id, name: withBackup(component.name, redundant), subsystem, value, unit, redundant })
  }
  for (const id of design.instrumentIds) {
    const instrument = data.instruments.find((i) => i.id === id)
    const value = instrument ? instrument.powerW * (design.dutyCycle[id] ?? 1) : 0
    if (instrument && value > 0) drafts.push({ kind: 'instrument', id, name: instrument.name, value, unit })
  }
  return drafts
}

function budgetConsumers(design: MissionDesign, data: GameData): Draft[] {
  const unit = UNIT.budget
  const redundant = new Set<Subsystem>(design.redundant)
  const drafts: Draft[] = []
  for (const line of costBreakdown(design, data).lines) {
    if (line.costM <= 0) continue
    const bus = data.busClasses.find((b) => b.id === line.itemId)
    const component = data.components.find((c) => c.id === line.itemId)
    const instrument = data.instruments.find((i) => i.id === line.itemId)
    const launcher = data.launchers.find((l) => l.id === line.itemId)
    const network = data.groundNetworks.find((g) => g.id === line.itemId)
    if (line.itemId === 'schedule-late') drafts.push({ kind: 'lateCost', id: 'lateCost', name: 'Late schedule cost', value: line.costM, unit })
    else if (line.category === 'development' && bus) drafts.push({ kind: 'busClass', id: bus.id, name: bus.name, value: line.costM, unit })
    else if (line.category === 'development' && component) {
      const isRedundant = redundant.has(component.subsystem) && design.componentIds[component.subsystem] === component.id
      drafts.push({ kind: 'component', id: component.id, name: withBackup(component.name, isRedundant), subsystem: component.subsystem, value: line.costM, unit, redundant: isRedundant })
    } else if (line.category === 'development' && instrument) drafts.push({ kind: 'instrument', id: instrument.id, name: instrument.name, value: line.costM, unit })
    else if (line.category === 'launch' && launcher) drafts.push({ kind: 'launcher', id: launcher.id, name: launcher.name, value: line.costM, unit })
    else if (line.category === 'operations' && network) drafts.push({ kind: 'groundNetwork', id: network.id, name: network.name, value: line.costM, unit })
  }
  return drafts
}

/** Instruments with the data they generate per day (duty cycle applied), as in linkBudget. */
function instrumentData(design: MissionDesign, data: GameData): { id: string; name: string; mbPerDay: number }[] {
  const out: { id: string; name: string; mbPerDay: number }[] = []
  for (const id of design.instrumentIds) {
    const instrument = data.instruments.find((i) => i.id === id)
    if (instrument) out.push({ id, name: instrument.name, mbPerDay: instrument.dataMbPerDay * (design.dutyCycle[id] ?? 1) })
  }
  return out
}

function dataConsumers(design: MissionDesign, data: GameData): Draft[] {
  return instrumentData(design, data)
    .filter((i) => i.mbPerDay > 0)
    .map((i) => ({ kind: 'instrument', id: i.id, name: i.name, value: i.mbPerDay, unit: UNIT.data }))
}

/** Each instrument's share of the contact minutes the downlink needs, in proportion to the data it generates. */
function commsConsumers(design: MissionDesign, data: GameData): Draft[] {
  const used = estimateBudgets(design, data).comms.used // contactMinNeeded, or the contact minutes + 1 when the link carries nothing
  const instruments = instrumentData(design, data).filter((i) => i.mbPerDay > 0)
  const generated = linkBudget(design, data).generatedMbPerDay
  if (generated <= 0 || used <= 0) return []
  return instruments.map((i) => ({ kind: 'instrument', id: i.id, name: i.name, value: (used * i.mbPerDay) / generated, unit: UNIT.comms }))
}

/** What shortens the lifetime: each part's share of the failure rate (-ln of its reliability), and the orbit when it is the limit. */
function timeConsumers(design: MissionDesign, data: GameData): Draft[] {
  const parts = partReliabilities(design, data)
  const rates = parts.map((p) => (p.reliability <= 0 ? Infinity : -Math.log(p.reliability)))
  const dead = rates.filter((r) => r === Infinity).length
  const total = dead > 0 ? dead : rates.reduce((a, b) => a + b, 0) // a part that cannot work takes the whole failure rate
  const drafts: Draft[] = []
  parts.forEach((p, i) => {
    const part = dead > 0 ? (rates[i] === Infinity ? 1 : 0) : rates[i]
    if (part <= 0 || total <= 0) return
    drafts.push({
      kind: 'component',
      id: p.component.id,
      name: withBackup(p.component.name, p.redundant),
      subsystem: p.subsystem,
      value: (part / total) * 100,
      unit: UNIT.time,
      redundant: p.redundant,
    })
  })
  return drafts
}

/** Every consumer of a resource, ranked by value (largest first); ties are broken by id. */
export function resourceConsumers(design: MissionDesign, resource: ResourceKey, data: GameData): Consumer[] {
  const drafts = {
    mass: massConsumers,
    power: powerConsumers,
    budget: budgetConsumers,
    data: dataConsumers,
    comms: commsConsumers,
    time: timeConsumers,
  }[resource](design, data)
  const total = drafts.reduce((sum, d) => sum + d.value, 0)
  const ranked = [...drafts]
    .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((d, i): Consumer => ({ ...d, rank: i + 1, share: total > 0 ? d.value / total : 0 }))

  // The orbit limits the lifetime when it runs out before the parts do: it is the biggest reason, so it goes first.
  if (resource === 'time') {
    const life = propellantBreakdown(design, data)
    if (life.limitedBy !== 'reliability') {
      const orbit: Consumer = {
        rank: 1,
        kind: life.limitedBy === 'propellant' ? 'propellant' : 'orbit',
        id: life.limitedBy === 'propellant' ? 'propellant' : 'orbitDecay',
        name: life.limitedBy === 'propellant' ? 'Propellant (the orbit decays when it runs out)' : 'Orbit decay (nothing holds the orbit)',
        value: life.orbitLifetimeDays, // the lifetime in days it allows
        unit: 'days',
        share: 0, // the shares of the parts add up to 1 on their own
      }
      return [orbit, ...ranked.map((c) => ({ ...c, rank: c.rank + 1 }))]
    }
  }
  return ranked
}

/** The `n` biggest consumers of a resource (default 3). */
export function topConsumers(design: MissionDesign, resource: ResourceKey, data: GameData, n = 3): Consumer[] {
  return resourceConsumers(design, resource, data).slice(0, Math.max(0, n))
}
