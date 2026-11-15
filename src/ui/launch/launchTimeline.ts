// Launch animation script (FR-9.3, SCRUM-94): countdown, liftoff, max Q, stage separation, fairing separation,
// upper-stage burn, spacecraft separation and orbit insertion. It plays the engine's launch outcome (FR-7.1): a
// failed launch stops at the phase where it failed and shows the anomaly. Pure, unit-tested.
import type { LaunchOutcome } from '../../engine/rules/launchOutcome'
import type { LaunchPhase } from '../../engine/types'

export type Segment = 'countdown' | LaunchPhase | 'orbitInsertion' | 'anomaly'

/** Seconds per segment. A full successful launch lasts 17 s (FR-9.3: ≤ 20 s). */
export const SEGMENT_SECONDS: Record<Segment, number> = {
  countdown: 3,
  liftoff: 2.5,
  maxQ: 2,
  stageSeparation: 2,
  fairingSeparation: 1.5,
  upperStage: 2,
  payloadSeparation: 1.5,
  orbitInsertion: 2.5,
  anomaly: 3,
}

export const MAX_LAUNCH_SECONDS = 20

const FLIGHT_ORDER: LaunchPhase[] = [
  'liftoff',
  'maxQ',
  'stageSeparation',
  'fairingSeparation',
  'upperStage',
  'payloadSeparation',
]

export interface ScriptStep {
  segment: Segment
  start: number
  duration: number
}

export interface LaunchScript {
  steps: ScriptStep[]
  total: number
  success: boolean
  /** Phase where the launch failed, or null. */
  failedAt: LaunchPhase | null
}

/** The script for an outcome. Without an outcome (no orbit/launcher) it plays a successful launch. */
export function launchScript(outcome: Pick<LaunchOutcome, 'success' | 'phase'> | null): LaunchScript {
  const success = outcome?.success ?? true
  const failedAt = success ? null : (outcome?.phase ?? 'liftoff')
  const segments: Segment[] = ['countdown']
  for (const phase of FLIGHT_ORDER) {
    segments.push(phase)
    if (phase === failedAt) break
  }
  segments.push(success ? 'orbitInsertion' : 'anomaly')

  let t = 0
  const steps = segments.map((segment) => {
    const step = { segment, start: t, duration: SEGMENT_SECONDS[segment] }
    t += step.duration
    return step
  })
  return { steps, total: t, success, failedAt }
}

/** The step playing at time t (seconds), and how far into it (0–1). Past the end: the last step, at 1. */
export function stepAt(script: LaunchScript, t: number): { step: ScriptStep; progress: number } {
  const step = script.steps.find((s) => t < s.start + s.duration) ?? script.steps[script.steps.length - 1]!
  return { step, progress: Math.min(1, Math.max(0, (t - step.start) / step.duration)) }
}

/** Has the script reached this segment yet? */
export function reached(script: LaunchScript, t: number, segment: Segment): boolean {
  const s = script.steps.find((x) => x.segment === segment)
  return s !== undefined && t >= s.start
}

/** Countdown number at time t (3, 2, 1), or null after liftoff. */
export function countdownAt(t: number): number | null {
  if (t >= SEGMENT_SECONDS.countdown) return null
  return Math.ceil(SEGMENT_SECONDS.countdown - t)
}
