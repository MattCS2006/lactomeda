import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { launchOutcome } from '../../engine/rules/launchOutcome'
import en from '../../i18n/en.json'
import { LAUNCH_H, LAUNCH_W, altitudeAt, drawLaunch } from './launchArt'
import { MAX_LAUNCH_SECONDS, countdownAt, launchScript, reached, stepAt, type Segment } from './launchTimeline'
import type { LaunchPhase } from '../../engine/types'

const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en)
const PHASES: LaunchPhase[] = [
  'liftoff',
  'maxQ',
  'stageSeparation',
  'fairingSeparation',
  'upperStage',
  'payloadSeparation',
]

describe('FR-9.3 launch animation — acceptance: ≤ 20 s and skippable', () => {
  it('a successful launch plays countdown → liftoff → … → orbit insertion within 20 s', () => {
    const s = launchScript({ success: true, phase: null })
    expect(s.steps.map((x) => x.segment)).toEqual(['countdown', ...PHASES, 'orbitInsertion'])
    expect(s.total).toBeLessThanOrEqual(MAX_LAUNCH_SECONDS)
    expect(s.success).toBe(true)
  })

  it('plays the engine outcome (FR-7.1): a failure stops at its phase and shows the anomaly', () => {
    for (const phase of PHASES) {
      const s = launchScript({ success: false, phase })
      const segs = s.steps.map((x) => x.segment)
      expect(segs[segs.length - 1]).toBe('anomaly')
      expect(segs[segs.length - 2]).toBe(phase)
      expect(segs).not.toContain('orbitInsertion')
      expect(s.total).toBeLessThanOrEqual(MAX_LAUNCH_SECONDS)
    }
  })

  it('matches launchOutcome for every reference design (deterministic for the same seed)', () => {
    for (const d of REFERENCE_DESIGNS) {
      const o = launchOutcome(d, gameData)
      const s = launchScript(o)
      expect(s.success, d.scenarioId).toBe(o?.success ?? true)
      expect(launchScript(launchOutcome(d, gameData))).toEqual(s)
    }
  })

  it('steps are contiguous; stepAt and reached follow the clock', () => {
    const s = launchScript({ success: true, phase: null })
    for (let i = 1; i < s.steps.length; i++)
      expect(s.steps[i]!.start).toBeCloseTo(s.steps[i - 1]!.start + s.steps[i - 1]!.duration)
    expect(stepAt(s, 0).step.segment).toBe('countdown')
    expect(stepAt(s, 3.1).step.segment).toBe('liftoff')
    expect(stepAt(s, 999).step.segment).toBe('orbitInsertion')
    expect(stepAt(s, 999).progress).toBe(1)
    expect(reached(s, 1, 'stageSeparation')).toBe(false)
    expect(reached(s, s.total, 'stageSeparation')).toBe(true)
  })

  it('countdown 3, 2, 1, then liftoff', () => {
    expect([0, 1.2, 2.5, 3.1].map(countdownAt)).toEqual([3, 2, 1, null])
  })

  it('altitude rises from the pad to orbit', () => {
    const s = launchScript({ success: true, phase: null })
    expect(altitudeAt(s, 0)).toBe(0)
    expect(altitudeAt(s, 8)).toBeGreaterThan(0)
    expect(altitudeAt(s, s.total)).toBe(1)
    // A failure at max Q stays low (blue sky), it doesn't jump to space
    const fail = launchScript({ success: false, phase: 'maxQ' })
    expect(altitudeAt(fail, fail.total)).toBeLessThan(0.4)
  })

  it('draws whole pixels (crisp pixel art) at any time, success or failure', () => {
    for (const outcome of [
      { success: true, phase: null },
      { success: false, phase: 'maxQ' as LaunchPhase },
    ]) {
      const s = launchScript(outcome)
      for (let t = 0; t <= s.total; t += 0.5) {
        const rects: number[][] = []
        drawLaunch({ fillStyle: '', fillRect: (...r: number[]) => rects.push(r) } as never, s, t)
        expect(rects.length).toBeGreaterThan(0)
        for (const [x, y, w, h] of rects) {
          expect(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h)).toBe(true)
        }
        // The first rectangle is the sky, covering the whole canvas
        expect(rects[0]).toEqual([0, 0, LAUNCH_W, LAUNCH_H])
      }
    }
  })

  it('every segment has a caption', () => {
    const segs: Segment[] = ['countdown', ...PHASES, 'orbitInsertion', 'anomaly']
    for (const s of segs) expect(lookup(`launchAnim.segment.${s}`), s).toBeTypeOf('string')
  })
})
