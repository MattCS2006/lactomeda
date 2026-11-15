// Tooltip texts live in en.json under tooltip.items.<catalog id> (FR-1.3), so they can be
// translated (FR-12.2). Pure helpers, unit-tested.
import type { GameData } from '../../engine/types'
import { RESOURCE_KEYS } from '../../engine/rules/resources'

export const TOOLTIP_MAX_WORDS = 40

export function tooltipKey(id: string): string {
  return `tooltip.items.${id}`
}

/** Every id that must have a tooltip: the 6 resources and every catalog item the player can pick. */
export function tooltipIds(data: GameData): string[] {
  return [
    ...RESOURCE_KEYS,
    ...data.busClasses.map((x) => x.id),
    ...data.components.map((x) => x.id),
    ...data.instruments.map((x) => x.id),
    ...data.orbits.map((x) => x.id),
    ...data.launchers.map((x) => x.id),
    ...data.groundNetworks.map((x) => x.id),
  ]
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
