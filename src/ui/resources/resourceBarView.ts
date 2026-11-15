// What the persistent resource bar shows (FR-6.1). Numbers come from the engine's
// estimateBudgets(); this file only decides how to present them. Pure, unit-tested.
import { RESOURCE_KEYS, estimateBudgets } from '../../engine/rules/resources'
import type { GameData, MissionDesign, ResourceBudget, ResourceKey } from '../../engine/types'
import type { Label } from '../scenarios/scenarioView'

/** A design choice that a resource needs before its "available" side can be computed. */
export type Need = 'bus' | 'power' | 'comms' | 'orbit' | 'ground' | 'parts'

/** i18n unit template per resource (all take {{value}}; time takes {{count}}). */
export const RESOURCE_UNIT_KEYS: Record<ResourceKey, string> = {
  mass: 'units.kg',
  power: 'units.watts',
  budget: 'units.moneyM',
  data: 'units.mbPerDay',
  comms: 'units.minPerDay',
  time: 'units.days',
}

export interface ResourceCell {
  key: ResourceKey
  used: Label
  /** null while the resource is still waiting for a choice (see needs). */
  available: Label | null
  /** Margin in whole % ((available − used) / available); null while pending. */
  marginPct: number | null
  /** Engine status; null while pending (shown neutral, not as a false red). */
  status: ResourceBudget['status'] | null
  needs: Need[]
}

/** Choices still missing before each resource's capacity is known. */
export function needsFor(key: ResourceKey, design: MissionDesign): Need[] {
  const parts = Object.values(design.componentIds).some(Boolean)
  switch (key) {
    case 'mass':
      return design.busClassId ? [] : ['bus']
    case 'power':
      return design.componentIds.power ? [] : ['power']
    case 'data':
    case 'comms': {
      const out: Need[] = []
      if (!design.componentIds.comms) out.push('comms')
      if (!design.orbitId) out.push('orbit')
      if (!design.groundNetworkId) out.push('ground')
      return out
    }
    case 'time':
      return parts ? [] : ['parts']
    case 'budget':
      return []
  }
}

/** Readable numbers: 1,234 · 56.7 · 0.25 */
export function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 100) return Math.round(n).toLocaleString('en-US')
  if (abs >= 10) return String(Math.round(n * 10) / 10)
  return String(Math.round(n * 100) / 100)
}

function withUnit(key: ResourceKey, n: number): Label {
  const amount = formatAmount(n)
  return { key: RESOURCE_UNIT_KEYS[key], values: key === 'time' ? { count: amount } : { value: amount } }
}

export function resourceCells(design: MissionDesign, data: GameData): ResourceCell[] {
  const budgets = estimateBudgets(design, data)
  return RESOURCE_KEYS.map((key) => {
    const b = budgets[key]
    const needs = needsFor(key, design)
    const pending = needs.length > 0
    return {
      key,
      used: withUnit(key, b.used),
      available: pending ? null : withUnit(key, b.available),
      marginPct: pending ? null : Math.round(b.margin * 100),
      status: pending ? null : b.status,
      needs,
    }
  })
}
