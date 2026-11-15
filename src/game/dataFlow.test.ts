// Demo fix: data and science must grow during a real flight (the HUD showed "0 Mb · 0 points").
// Every reference design and starter spacecraft is flown through the real mission controller on virtual time.
// Root cause: a design with NO instrument could pass the review and launch (nothing validated it), so it generated
// no data and no science all flight. validatePayload now reports MISSING_INSTRUMENT, a hard blocker.
import { describe, expect, it } from 'vitest'
import { gameData, presets } from '../data'
import { REFERENCE_DESIGNS } from '../data/referenceDesigns'
import { designReview, launchDecision } from '../engine/rules/review'
import { validate } from '../engine/validate'
import type { MissionDesign } from '../engine/types'
import { Bridge } from './bridge'
import { createMissionController, type Scheduler } from './missionController'

/** Flies a design for `ticks` ticks and returns the last simTick snapshot. */
function fly(design: MissionDesign, ticks: number) {
  const bus = new Bridge()
  const snapshots: { storedDataMb: number; downlinkedDataMb: number; science: number; day: number }[] = []
  bus.on('simTick', ({ state }) => snapshots.push(state))
  const intervals: (() => void)[] = []
  const scheduler: Scheduler = {
    setInterval: (fn) => (intervals.push(fn), intervals.length),
    clearInterval: () => undefined,
    setTimeout: (fn) => (fn(), 0), // the launch phase ends at once
    clearTimeout: () => undefined,
  }
  const controller = createMissionController({ bus, scheduler })
  controller.start(design, gameData)
  const tick = intervals[intervals.length - 1]!
  for (let i = 0; i < ticks; i++) tick()
  controller.stop()
  return snapshots
}

describe('data and science grow during a flight', () => {
  it.each([...REFERENCE_DESIGNS, ...presets].map((d) => [`${d.scenarioId} (${d.difficulty})`, d] as const))(
    '%s: data is sent home and science grows',
    (_name, design) => {
      const snaps = fly(design, 60)
      const last = snaps[snaps.length - 1]!
      expect(last.day).toBeGreaterThan(0)
      expect(last.downlinkedDataMb).toBeGreaterThan(0)
      expect(last.science).toBeGreaterThan(0)
      // and it keeps growing
      expect(last.downlinkedDataMb).toBeGreaterThan(snaps[10]!.downlinkedDataMb)
      expect(last.science).toBeGreaterThan(snaps[10]!.science)
    },
  )
})

describe('a design without instruments cannot launch', () => {
  const empty: MissionDesign = { ...REFERENCE_DESIGNS[0]!, instrumentIds: [] }

  it('reports MISSING_INSTRUMENT as an error', () => {
    expect(validate(empty, gameData).map((i) => i.code)).toContain('MISSING_INSTRUMENT')
    expect(validate(REFERENCE_DESIGNS[0]!, gameData).map((i) => i.code)).not.toContain('MISSING_INSTRUMENT')
  })

  it('is a hard blocker the player cannot accept as a risk', () => {
    for (const difficulty of ['cadet', 'engineer', 'flightDirector'] as const) {
      const review = designReview({ ...empty, difficulty }, gameData)
      expect(review.hardBlockers.map((i) => i.code), difficulty).toContain('MISSING_INSTRUMENT')
      expect(launchDecision(review, true).allowed, difficulty).toBe(false)
    }
  })
})
