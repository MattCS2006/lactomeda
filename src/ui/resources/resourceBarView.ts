// What the persistent resource bar shows (FR-6.1). Numbers come from the engine's
// estimateBudgets(); this file only decides how to present them. Pure, unit-tested.
import { RESOURCE_KEYS, estimateBudgets } from '../../engine/rules/resources'
import type { GameData, MissionDesign, ResourceBudget, ResourceKey } from '../../engine/types'

/** A design choice that a resource needs before its "available" side can be computed. */
export type Need = 'bus' | 'power' | 'comms' | 'orbit' | 'ground' | 'parts'

export const RESOURCE_UNITS: Record<ResourceKey, string> = {
  mass: 'kg',
  power: 'W',
  budget: '$M',
  data: 'Mb/day',
  comms: 'min/day',
  time: 'days',
}

export interface ResourceCell {
  key: ResourceKey
  used: string
  /** null while the resource is still waiting for a choice (see needs). */
  available: string | null
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

function withUnit(key: ResourceKey, n: number): string {
  return key === 'budget' ? `$${formatAmount(n)}M` : `${formatAmount(n)} ${RESOURCE_UNITS[key]}`
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
