// Mission design state for the design screens (Dev 2). One MissionDesign object;
// every screen edits it through this store (ERS §3 architecture).
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { gameData } from '../../data'
import { canAddInstrument } from '../../engine/rules/busClass'
import { isComponentAvailable, selectComponent as withComponent } from '../../engine/rules/components'
import { altitudeRange, clampAltitude } from '../orbit/altitudeView'
import { groundReasons } from '../orbit/groundView'
import { launcherReasons, launchersFor } from '../orbit/launcherView'
import { isCompatible } from '../payload/compatibility'
import { SAVE_KEY, SAVE_VERSION, safeStorage, sanitizeDesign } from './persistence'
import type { Difficulty, GameData, MissionDesign, RequirementLevel, Subsystem } from '../../engine/types'

/** Design phases in order (ERS §2). More steps are added as their screens land. */
export const DESIGN_STEPS = ['brief', 'requirements', 'bus', 'payload', 'orbit', 'design'] as const
export type DesignStep = (typeof DESIGN_STEPS)[number]

/** Top-level screen: the landing menu (FR-1.1) or the mission design flow. */
export type Screen = 'landing' | 'design'

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
  screen: Screen
  step: DesignStep
  /** Furthest step the player has moved on to with this design (drives the CML meter, FR-14.3). */
  furthest: DesignStep
  design: MissionDesign | null
  /** Pick (or switch) scenario. Switching resets the design, since targets and budget change. */
  selectScenario: (scenarioId: string, data: Pick<GameData, 'scenarios'>, difficulty?: Difficulty) => void
  /** FR-2.3 — set the target level of one objective. */
  setRequirementLevel: (objectiveId: string, level: RequirementLevel) => void
  /** FR-2.2 — change difficulty. Parts the new level doesn't offer (advanced parts on Cadet) are removed. */
  setDifficulty: (difficulty: Difficulty, data: GameData) => void
  /** FR-3.1 — choose the bus size class. */
  selectBus: (busClassId: string, data: GameData) => void
  /** FR-3.2 — choose the part for one subsystem (engine selectComponent checks it). */
  selectPart: (subsystem: Subsystem, componentId: string, data: GameData) => void
  /** FR-4.1/4.2 — add an instrument, or remove all its copies if it is already on board. */
  toggleInstrument: (instrumentId: string, data: GameData) => void
  /** FR-4.3 — add one more copy. Needs a compatible instrument and, once a bus is chosen, a free slot (each copy uses one). */
  addInstrument: (instrumentId: string, data: GameData) => void
  /** Remove one copy (the last one added). Removing always works. */
  removeInstrument: (instrumentId: string) => void
  /** FR-5.1 — choose an orbit the scenario allows. Clears any altitude override (FR-5.3) and a launcher or ground network that can't reach it. */
  selectOrbit: (orbitId: string, data: GameData) => void
  /** FR-5.3 — set the altitude of a LEO/SSO orbit (clamped to its range); the nominal altitude clears the override. */
  setAltitude: (km: number, data: GameData) => void
  /** FR-5.4 — choose a launcher offered in this scenario that reaches the chosen orbit. */
  selectLauncher: (launcherId: string, data: GameData) => void
  /** FR-5.6 — choose a ground station network that can reach the chosen orbit. */
  selectGroundNetwork: (networkId: string, data: GameData) => void
  /** FR-1.1 — leave the landing menu for the design flow (Play Solo / Continue). */
  openDesign: () => void
  /** Back to the landing menu; the design is kept. */
  openLanding: () => void
  /** Move to a step. Every step after 'brief' needs a chosen scenario. */
  goTo: (step: DesignStep) => void
}

/** FR-11.1 — the design and current step are auto-saved in the browser; a refresh resumes them. */
export const useMissionStore = create<MissionStore>()(
  persist(
    (set, get) => ({
      screen: 'landing',
      step: 'brief',
      furthest: 'brief',
      design: null,
      selectScenario: (scenarioId, data, difficulty) => {
        const current = get().design
        if (current?.scenarioId === scenarioId) return
        // A new design starts its maturity again
        set({ design: createDesign(scenarioId, data, difficulty ?? current?.difficulty), furthest: 'brief' })
      },
      setRequirementLevel: (objectiveId, level) => {
        const design = get().design
        if (!design || !(objectiveId in design.requirementLevels)) return
        set({ design: { ...design, requirementLevels: { ...design.requirementLevels, [objectiveId]: level } } })
      },
      setDifficulty: (difficulty, data) => {
        const design = get().design
        if (!design || design.difficulty === difficulty) return
        const componentIds = Object.fromEntries(
          Object.entries(design.componentIds).filter(([, id]) => {
            const part = data.components.find((c) => c.id === id)
            return part !== undefined && isComponentAvailable(part, difficulty)
          }),
        ) as MissionDesign['componentIds']
        const redundant = design.redundant.filter((s) => s in componentIds)
        set({ design: { ...design, difficulty, componentIds, redundant } })
      },
      selectBus: (busClassId, data) => {
        const design = get().design
        if (!design || !data.busClasses.some((b) => b.id === busClassId)) return
        set({ design: { ...design, busClassId } })
      },
      selectPart: (subsystem, componentId, data) => {
        const design = get().design
        if (!design) return
        try {
          set({ design: withComponent(design, subsystem, componentId, data) })
        } catch {
          // unknown id or a part from another subsystem: ignore
        }
      },
      toggleInstrument: (instrumentId, data) => {
        const design = get().design
        if (!design) return
        if (!design.instrumentIds.includes(instrumentId)) {
          get().addInstrument(instrumentId, data)
          return
        }
        const dutyCycle = Object.fromEntries(Object.entries(design.dutyCycle).filter(([id]) => id !== instrumentId))
        set({
          design: { ...design, instrumentIds: design.instrumentIds.filter((id) => id !== instrumentId), dutyCycle },
        })
      },
      addInstrument: (instrumentId, data) => {
        const design = get().design
        const instrument = data.instruments.find((i) => i.id === instrumentId)
        if (!design || !instrument) return
        const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
        if (scenario && !isCompatible(instrument, scenario, design, data)) return
        if (design.busClassId && !canAddInstrument(design, data)) return
        set({ design: { ...design, instrumentIds: [...design.instrumentIds, instrumentId] } })
      },
      removeInstrument: (instrumentId) => {
        const design = get().design
        if (!design) return
        const at = design.instrumentIds.lastIndexOf(instrumentId)
        if (at < 0) return
        const instrumentIds = design.instrumentIds.filter((_, i) => i !== at)
        const dutyCycle = instrumentIds.includes(instrumentId)
          ? design.dutyCycle
          : Object.fromEntries(Object.entries(design.dutyCycle).filter(([id]) => id !== instrumentId))
        set({ design: { ...design, instrumentIds, dutyCycle } })
      },
      selectOrbit: (orbitId, data) => {
        const design = get().design
        if (!design) return
        const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
        if (!scenario?.allowedOrbitIds.includes(orbitId) || !data.orbits.some((o) => o.id === orbitId)) return
        if (design.orbitId === orbitId) return
        const launcher = data.launchers.find((l) => l.id === design.launcherId)
        const keepLauncher = launcher && launcherReasons(launcher, { orbitId }, data).length === 0
        const network = data.groundNetworks.find((g) => g.id === design.groundNetworkId)
        const orbit = data.orbits.find((o) => o.id === orbitId) ?? null
        const keepNetwork = network && groundReasons(network, orbit).length === 0
        set({
          design: {
            ...design,
            orbitId,
            altitudeKm: undefined,
            launcherId: keepLauncher ? design.launcherId : null,
            groundNetworkId: keepNetwork ? design.groundNetworkId : null,
          },
        })
      },
      setAltitude: (km, data) => {
        const design = get().design
        const orbit = data.orbits.find((o) => o.id === design?.orbitId)
        const range = altitudeRange(orbit)
        if (!design || !orbit || !range || !Number.isFinite(km)) return
        const value = clampAltitude(km, range)
        set({ design: { ...design, altitudeKm: value === orbit.altitudeKm ? undefined : value } })
      },
      selectLauncher: (launcherId, data) => {
        const design = get().design
        if (!design) return
        const launcher = launchersFor(design.scenarioId, data).find((l) => l.id === launcherId)
        if (!launcher || launcherReasons(launcher, design, data).length > 0) return
        set({ design: { ...design, launcherId } })
      },
      selectGroundNetwork: (networkId, data) => {
        const design = get().design
        const network = data.groundNetworks.find((g) => g.id === networkId)
        if (!design || !network) return
        const orbit = data.orbits.find((o) => o.id === design.orbitId) ?? null
        if (groundReasons(network, orbit).length > 0) return
        set({ design: { ...design, groundNetworkId: networkId } })
      },
      openDesign: () => set({ screen: 'design' }),
      openLanding: () => set({ screen: 'landing' }),
      goTo: (step) => {
        if (step !== 'brief' && !get().design) return
        const { furthest } = get()
        set({ step, furthest: DESIGN_STEPS.indexOf(step) > DESIGN_STEPS.indexOf(furthest) ? step : furthest })
      },
    }),
    {
      name: SAVE_KEY,
      version: SAVE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        screen: state.screen,
        step: state.step,
        furthest: state.furthest,
        design: state.design,
      }),
      // Check what was saved against today's catalog before using it
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<MissionStore, 'screen' | 'step' | 'furthest' | 'design'>>
        const design = sanitizeDesign(saved.design, gameData)
        const valid = (s: unknown): s is DesignStep => DESIGN_STEPS.includes(s as DesignStep)
        const step = design && valid(saved.step) ? saved.step : 'brief'
        const furthest = design && valid(saved.furthest) ? saved.furthest : step
        const screen: Screen = saved.screen === 'design' ? 'design' : 'landing'
        return { ...current, screen, design, step, furthest }
      },
    },
  ),
)
