// Mission design state for the design screens (Dev 2). One MissionDesign object;
// every screen edits it through this store (ERS §3 architecture).
import { create } from 'zustand'
import { canAddInstrument } from '../../engine/rules/busClass'
import { isCompatible } from '../payload/compatibility'
import type { Difficulty, GameData, MissionDesign, RequirementLevel } from '../../engine/types'

/** Design phases in order (ERS §2). More steps are added as their screens land. */
export const DESIGN_STEPS = ['brief', 'requirements', 'payload', 'design'] as const
export type DesignStep = (typeof DESIGN_STEPS)[number]

export function newSeed(): string {
  // Only picks the seed; the engine itself never uses Math.random.
  return Math.random().toString(36).slice(2, 10)
}

/** A fresh design for a scenario: baseline targets, nothing chosen yet. */
export function createDesign(
  scenarioId: string,
  data: Pick<GameData, 'scenarios'>,
  difficulty: Difficulty = 'cadet',
  seed: string = newSeed(),
): MissionDesign {
  const scenario = data.scenarios.find((s) => s.id === scenarioId)
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`)
  return {
    scenarioId,
    difficulty,
    requirementLevels: Object.fromEntries(scenario.objectives.map((o) => [o.id, 'baseline' as const])),
    busClassId: null,
    componentIds: {},
    redundant: [],
    propellantKg: 0,
    instrumentIds: [],
    dutyCycle: {},
    orbitId: null,
    launcherId: null,
    groundNetworkId: null,
    seed,
  }
}

interface MissionStore {
  step: DesignStep
  design: MissionDesign | null
  /** Pick (or switch) scenario. Switching resets the design, since targets and budget change. */
  selectScenario: (scenarioId: string, data: Pick<GameData, 'scenarios'>, difficulty?: Difficulty) => void
  /** FR-2.3 — set the target level of one objective. */
  setRequirementLevel: (objectiveId: string, level: RequirementLevel) => void
  /** FR-4.1/4.2 — add or remove an instrument. Adding needs a compatible instrument and, once a bus is chosen, a free slot. Removing always works. */
  toggleInstrument: (instrumentId: string, data: GameData) => void
  /** Move to a step. Every step after 'brief' needs a chosen scenario. */
  goTo: (step: DesignStep) => void
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  step: 'brief',
  design: null,
  selectScenario: (scenarioId, data, difficulty) => {
    const current = get().design
    if (current?.scenarioId === scenarioId) return
    set({ design: createDesign(scenarioId, data, difficulty ?? current?.difficulty) })
  },
  setRequirementLevel: (objectiveId, level) => {
    const design = get().design
    if (!design || !(objectiveId in design.requirementLevels)) return
    set({ design: { ...design, requirementLevels: { ...design.requirementLevels, [objectiveId]: level } } })
  },
  toggleInstrument: (instrumentId, data) => {
    const design = get().design
    if (!design || !data.instruments.some((i) => i.id === instrumentId)) return
    if (design.instrumentIds.includes(instrumentId)) {
      const dutyCycle = Object.fromEntries(Object.entries(design.dutyCycle).filter(([id]) => id !== instrumentId))
      set({ design: { ...design, instrumentIds: design.instrumentIds.filter((id) => id !== instrumentId), dutyCycle } })
      return
    }
    const instrument = data.instruments.find((i) => i.id === instrumentId)!
    const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
    if (scenario && !isCompatible(instrument, scenario, design, data)) return
    if (design.busClassId && !canAddInstrument(design, data)) return
    set({ design: { ...design, instrumentIds: [...design.instrumentIds, instrumentId] } })
  },
  goTo: (step) => {
    if (step !== 'brief' && !get().design) return
    set({ step })
  },
}))
