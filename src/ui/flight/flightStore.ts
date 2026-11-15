// Last flight + "Fly again" (FR-10.6). Kept apart from the design store so it never conflicts with it;
// saved in the browser under its own key, so a refresh on the debrief still lets the player fly again.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { gameData } from '../../data'
import { safeStorage, sanitizeDesign } from '../store/persistence'
import { newSeed, useMissionStore } from '../store/missionStore'
import { restoredDesign, type FlightRecord, type FlyAgainOptions } from './flightRecord'
import type { GamePhase } from '../../game/bridge'
import type { GameData, MissionDesign, ScoreResult } from '../../engine/types'

export const FLIGHT_SAVE_KEY = 'lactomeda.lastFlight'

/** Where "Fly again" lands: the spacecraft (ERS §2: "the debrief sends the team back to the spacecraft"). */
export const FLY_AGAIN_STEP = 'bus' as const

interface FlightStore {
  /** Current game phase, as announced on the bridge (not saved: a refresh goes back to the design). */
  phase: GamePhase
  lastFlight: FlightRecord | null
  setPhase: (phase: GamePhase) => void
  /** Called at launch: keep a copy of the design exactly as it flies. */
  recordLaunch: (design: MissionDesign) => void
  /** Called when the mission ends: attach the result to the last flight. */
  recordResult: (score: Pick<ScoreResult, 'total' | 'stars' | 'outcome'>) => void
  /** One click: the flown design comes back on the spacecraft screen. Returns false if there is nothing to restore. */
  flyAgain: (data: GameData, options?: FlyAgainOptions) => boolean
}

export const useFlightStore = create<FlightStore>()(
  persist(
    (set, get) => ({
      phase: 'design',
      lastFlight: null,
      setPhase: (phase) => set({ phase }),
      recordLaunch: (design) => set({ lastFlight: { design: structuredClone(design), result: null } }),
      recordResult: ({ total, stars, outcome }) => {
        const lastFlight = get().lastFlight
        if (lastFlight) set({ lastFlight: { ...lastFlight, result: { total, stars, outcome } } })
      },
      flyAgain: (data, options) => {
        const record = get().lastFlight
        const design = record && restoredDesign(record, data, newSeed, options)
        if (!design) return false
        // Every phase was already reached by this design, so all the design tabs stay open
        useMissionStore.setState({ design, screen: 'design', step: FLY_AGAIN_STEP, furthest: 'design' })
        set({ phase: 'design' })
        return true
      },
    }),
    {
      name: FLIGHT_SAVE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ lastFlight: state.lastFlight }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<FlightStore, 'lastFlight'>>
        const design = sanitizeDesign(saved.lastFlight?.design, gameData)
        const result = saved.lastFlight?.result ?? null
        return { ...current, lastFlight: design ? { design, result } : null }
      },
    },
  ),
)
