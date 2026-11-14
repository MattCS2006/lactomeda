// Preview deltas (FR-3.3): what a design change would do to the 6 resources, before the player commits.
// Pure and deterministic. Rounding is the UI's job.
import type { GameData, MissionDesign, ResourceBudget, ResourceKey, Subsystem } from '../types'
import { componentOptions } from './components'
import { RESOURCE_KEYS, estimateBudgets } from './resources'

export type DesignChange =
  | { kind: 'component'; subsystem: Subsystem; componentId: string | null } // null = remove
  | { kind: 'busClass'; busClassId: string }
  | { kind: 'addInstrument'; instrumentId: string }
  | { kind: 'removeInstrument'; instrumentId: string }

export interface ResourcePreview {
  before: ResourceBudget
  after: ResourceBudget
  usedDelta: number // after.used - before.used
  availableDelta: number // after.available - before.available
  marginDelta: number // after.margin - before.margin
}

/** Returns a NEW design with the change applied; the input is never mutated. */
export function applyChange(design: MissionDesign, change: DesignChange): MissionDesign {
  switch (change.kind) {
    case 'component': {
      const componentIds = { ...design.componentIds }
      if (change.componentId === null) delete componentIds[change.subsystem]
      else componentIds[change.subsystem] = change.componentId
      return { ...design, componentIds }
    }
    case 'busClass':
      return { ...design, busClassId: change.busClassId }
    case 'addInstrument':
      return { ...design, instrumentIds: [...design.instrumentIds, change.instrumentId] }
    case 'removeInstrument': {
      const index = design.instrumentIds.indexOf(change.instrumentId)
      const instrumentIds =
        index < 0 ? [...design.instrumentIds] : design.instrumentIds.filter((_, i) => i !== index)
      return { ...design, instrumentIds }
    }
  }
}

export function previewChange(
  design: MissionDesign,
  change: DesignChange,
  data: GameData,
): Record<ResourceKey, ResourcePreview> {
  const before = estimateBudgets(design, data)
  const after = estimateBudgets(applyChange(design, change), data)
  const preview = {} as Record<ResourceKey, ResourcePreview>
  for (const key of RESOURCE_KEYS) {
    preview[key] = {
      before: before[key],
      after: after[key],
      usedDelta: after[key].used - before[key].used,
      availableDelta: after[key].available - before[key].available,
      marginDelta: after[key].margin - before[key].margin,
    }
  }
  return preview
}

/** Preview of every option of one subsystem (componentId -> preview), for the whole option list. */
export function previewOptions(
  design: MissionDesign,
  subsystem: Subsystem,
  data: GameData,
): Record<string, Record<ResourceKey, ResourcePreview>> {
  const result: Record<string, Record<ResourceKey, ResourcePreview>> = {}
  for (const option of componentOptions(subsystem, data)) {
    result[option.id] = previewChange(design, { kind: 'component', subsystem, componentId: option.id }, data)
  }
  return result
}
