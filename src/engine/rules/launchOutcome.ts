// FR-7.1 launch outcome: the launch fails with probability 1 - launcher reliability. A failure also says WHERE it failed
// and WHY (a failure mode from the catalog) and what engineers learned (the lesson). The engine decides; the launch
// animation (FR-9.3) and the failure screen only show it.
// Pure and deterministic: the same design and seed always give the same outcome, so the UI, the animation and the
// mission controller can call this before or after `initSim` and get the same answer. Nothing is mutated.
// Draws: draw 0 is the roll (failure if value >= reliability, as before); draw 1 picks the failure mode, only on failure.
import { LAUNCH_LESSON_MARGIN_BELOW, LAUNCH_LESSON_RELIABILITY_BELOW } from '../constants'
import { draw } from '../rng'
import type { GameData, LaunchFailureMode, LaunchPhase, MissionDesign } from '../types'
import { checkLauncher } from './launch'

export interface LaunchOutcome {
  success: boolean
  failureOdds: number // 1 - launcher reliability
  roll: number // the draw value
  phase: LaunchPhase | null // where it failed; null on success
  failureModeId: string | null
  cause: string | null
  lessons: string[] // failure mode lesson + contextual lessons; empty on success
}

const pct = (n: number): string => String(Math.round(n * 1000) / 10)

/** One failure mode, picked by weight with one draw (draw 1). The catalog order is the tie-break. */
function pickFailureMode(modes: LaunchFailureMode[], seed: string): LaunchFailureMode | undefined {
  const usable = modes.filter((m) => m.weight > 0)
  const total = usable.reduce((sum, m) => sum + m.weight, 0)
  if (usable.length === 0 || total <= 0) return undefined
  const target = draw(seed, 1).value * total
  let acc = 0
  for (const mode of usable) {
    acc += mode.weight
    if (target < acc) return mode
  }
  return usable[usable.length - 1]
}

/**
 * The launch outcome for this design (FR-7.1), or null when there is nothing to launch with: no launcher chosen, or no orbit.
 * `initSim` uses this as its single source.
 */
export function launchOutcome(design: MissionDesign, data: GameData): LaunchOutcome | null {
  const launcher = data.launchers.find((l) => l.id === design.launcherId)
  const orbit = data.orbits.find((o) => o.id === design.orbitId)
  if (!launcher || !orbit) return null

  const rolled = draw(design.seed, 0)
  const failureOdds = 1 - launcher.reliability
  if (rolled.value < launcher.reliability) {
    return {
      success: true,
      failureOdds,
      roll: rolled.value,
      phase: null,
      failureModeId: null,
      cause: null,
      lessons: [],
    }
  }

  const mode = pickFailureMode(data.launchFailures ?? [], design.seed)
  const lessons: string[] = mode ? [mode.lesson] : []
  if (launcher.reliability < LAUNCH_LESSON_RELIABILITY_BELOW) {
    lessons.push(
      `This launcher succeeds ${pct(launcher.reliability)}% of the time, so about ${pct(failureOdds)} in 100 launches fail. More reliable launchers usually cost more.`,
    )
  }
  const fit = checkLauncher(design, launcher.id, data)
  if (fit.capacityKg > 0 && 1 - fit.wetMassKg / fit.capacityKg < LAUNCH_LESSON_MARGIN_BELOW) {
    lessons.push(
      `Your spacecraft used ${Math.round((fit.wetMassKg / fit.capacityKg) * 100)}% of the launcher's capacity, leaving almost no margin.`,
    )
  }
  return {
    success: false,
    failureOdds,
    roll: rolled.value,
    phase: mode?.phase ?? null,
    failureModeId: mode?.id ?? null,
    cause: mode?.cause ?? null,
    lessons,
  }
}
