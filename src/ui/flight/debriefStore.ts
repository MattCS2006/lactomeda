// The result of the flight that just ended (score parts + explanation), kept for the debrief screen.
// Not saved: a refresh goes back to the design, like the flight phase.
import { create } from 'zustand'
import type { Explanation, ScoreResult } from '../../engine/types'

export interface Debrief {
  status: 'success' | 'failed'
  score: ScoreResult
  explanation: Explanation
}

interface DebriefStore {
  debrief: Debrief | null
  setDebrief: (debrief: Debrief | null) => void
}

export const useDebriefStore = create<DebriefStore>()((set) => ({
  debrief: null,
  setDebrief: (debrief) => set({ debrief }),
}))
