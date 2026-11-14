// Mission design state for the design screens (Dev 2). One MissionDesign object;
// every screen edits it through this store (ERS §3 architecture).
import { create } from 'zustand'
import type { Difficulty, GameData, MissionDesign } from '../../engine/types'

export type DesignStep = 'brief' | 'design'

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
  startDesign: () => void
  backToBrief: () => void
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  step: 'brief',
  design: null,
  selectScenario: (scenarioId, data, difficulty) => {
    const current = get().design
    if (current?.scenarioId === scenarioId) return
    set({ design: createDesign(scenarioId, data, difficulty ?? current?.difficulty) })
  },
  startDesign: () => {
    if (get().design) set({ step: 'design' })
  },
  backToBrief: () => set({ step: 'brief' }),
}))
