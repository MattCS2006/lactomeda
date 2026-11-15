// Station tasks (optional mini-missions): an event with `kind: 'task'`. Pure helpers shared by the sim, the explanation,
// the mission controller and the UI. A task never slows the clock, never escalates and costs nothing to skip.
import { MISSION_TICK_MS } from '../constants'
import type { MissionEvent } from '../types'

export const isTask = (event: Pick<MissionEvent, 'kind'>): boolean => event.kind === 'task'

/**
 * Ticks a task stays on offer. The clock does not slow down for a task, so its `timerSec` is real seconds at 1x
 * (an alarm, by contrast, counts in slow ticks). At 2x or 10x it runs out sooner, like everything else.
 */
export function taskDeadlineTicks(event: Pick<MissionEvent, 'timerSec'>): number {
  return Math.ceil((event.timerSec * 1000) / MISSION_TICK_MS)
}
