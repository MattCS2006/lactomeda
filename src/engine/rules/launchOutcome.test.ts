import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { LAUNCH_LESSON_MARGIN_BELOW, LAUNCH_LESSON_RELIABILITY_BELOW } from '../constants'
import { initSim, runMission } from '../sim'
import type { GameData, MissionDesign } from '../types'
import { wetMassKg } from './launch'
import { launchOutcome } from './launchOutcome'

const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!
const student = (over: Partial<MissionDesign> = {}): MissionDesign => ({
  ...ref('student-cubesat'),
  seed: 'alpha',
  ...over,
})
/** A copy of the catalog where the launcher of this design has this reliability. */
const withReliability = (design: MissionDesign, reliability: number, data: GameData = gameData): GameData => ({
  ...data,
  launchers: data.launchers.map((l) => (l.id === design.launcherId ? { ...l, reliability } : l)),
})
const seeds = (n: number): string[] => Array.from({ length: n }, (_, i) => `launch-${i}`)
const outcome = (design: MissionDesign, data: GameData) => launchOutcome(design, data)!

/** The first seed whose launch fails (for catalogs where failure is rare). */
function failingSeed(design: MissionDesign, data: GameData): string {
  const seed = seeds(5000).find((s) => !outcome({ ...design, seed: s }, data).success)
  expect(seed, 'a failing seed').toBeDefined()
  return seed!
}

describe('acceptance: a failure shows its cause and the lesson (FR-7.1)', () => {
  const data = withReliability(student(), 0)

  it('with reliability 0 the launch fails with a phase, a cause and at least one lesson', () => {
    const o = outcome(student(), data)
    expect(o.success).toBe(false)
    expect(o.failureOdds).toBe(1)
    expect(o.phase).not.toBeNull()
    expect(o.failureModeId).not.toBeNull()
    expect(o.cause).toBeTruthy()
    expect(o.lessons.length).toBeGreaterThanOrEqual(1)
    const mode = data.launchFailures!.find((m) => m.id === o.failureModeId)!
    expect(o).toMatchObject({ phase: mode.phase, cause: mode.cause })
    expect(o.lessons[0]).toBe(mode.lesson)
  })

  it('initSim ends with launchFailure and logs the cause and the lesson', () => {
    const o = outcome(student(), data)
    const state = initSim(student(), data)
    expect(state).toMatchObject({ status: 'failed', endReason: 'launchFailure', tick: 0, day: 0 })
    const text = state.log.map((l) => l.text).join('\n')
    expect(text).toContain('did not reach orbit')
    expect(text).toContain(o.cause!)
    for (const lesson of o.lessons) expect(text).toContain(lesson)
    expect(state.log[0]).toMatchObject({ kind: 'failure' })
    expect(runMission(student(), data).endReason).toBe('launchFailure')
  })
})

describe('the roll', () => {
  it('reliability 1 always succeeds, with no cause and no lessons', () => {
    const data = withReliability(student(), 1)
    for (const seed of seeds(200)) {
      const o = outcome(student({ seed }), data)
      expect(o).toMatchObject({
        success: true,
        failureOdds: 0,
        phase: null,
        failureModeId: null,
        cause: null,
        lessons: [],
      })
      expect(initSim(student({ seed }), data).status).toBe('running')
    }
  })

  it('fails about 10% of 1,000 fixed seeds with reliability 0.9, and the failure odds are 1 - reliability', () => {
    const data = withReliability(student(), 0.9)
    const failures = seeds(1000).filter((seed) => !outcome(student({ seed }), data).success).length
    console.info(`reliability 0.9: ${failures} failures in 1000 launches`)
    expect(failures).toBeGreaterThanOrEqual(70)
    expect(failures).toBeLessThanOrEqual(130)
    expect(outcome(student(), data).failureOdds).toBeCloseTo(0.1, 12)
  })

  it('fails exactly when the roll is at or above the reliability, as before', () => {
    const data = withReliability(student(), 0.5)
    for (const seed of seeds(100)) {
      const o = outcome(student({ seed }), data)
      expect(o.success).toBe(o.roll < 0.5)
    }
  })

  it('has no outcome without a launcher or an orbit, and initSim keeps its behaviour then', () => {
    expect(launchOutcome(student({ launcherId: null }), gameData)).toBeNull()
    expect(launchOutcome(student({ launcherId: 'nope' }), gameData)).toBeNull()
    expect(launchOutcome(student({ orbitId: null }), gameData)).toBeNull()
    expect(launchOutcome(student({ orbitId: 'nope' }), gameData)).toBeNull()
    const noLauncher = initSim(student({ launcherId: null }), gameData)
    expect(noLauncher).toMatchObject({ status: 'failed', endReason: 'launchFailure' })
    expect(noLauncher.log[0]!.text).toContain('no launcher was chosen')
    // no orbit: the plain roll against the reliability, as before
    expect(initSim(student({ orbitId: null }), withReliability(student(), 1)).status).toBe('running')
    expect(initSim(student({ orbitId: null }), withReliability(student(), 0)).endReason).toBe('launchFailure')
  })
})

describe('the cause', () => {
  const data = withReliability(student(), 0)

  it('follows the weights over fixed seeds: fairing-stuck appears and no-separation is the rarest', () => {
    const n = 2200
    const by: Record<string, number> = {}
    for (const seed of seeds(n)) {
      const id = outcome(student({ seed }), data).failureModeId!
      by[id] = (by[id] ?? 0) + 1
    }
    const modes = data.launchFailures!
    const total = modes.reduce((sum, m) => sum + m.weight, 0)
    console.info(`failure modes over ${n} failures: ${JSON.stringify(by)}`)
    expect(by['fairing-stuck']).toBeGreaterThan(0)
    for (const m of modes) {
      expect(by[m.id] ?? 0, m.id).toBeGreaterThan(0)
      expect((by[m.id] ?? 0) / n, m.id).toBeCloseTo(m.weight / total, 1) // within 0.05
    }
    expect(Object.entries(by).sort((a, b) => a[1] - b[1])[0]![0]).toBe('no-separation')
  })

  it('never picks a mode with weight 0', () => {
    const only: GameData = {
      ...data,
      launchFailures: [
        { ...data.launchFailures![0]!, id: 'never', weight: 0 },
        { ...data.launchFailures![1]!, id: 'always', weight: 5 },
      ],
    }
    for (const seed of seeds(100)) expect(outcome(student({ seed }), only).failureModeId).toBe('always')
  })

  it('still fails, without a cause, when the catalog has no failure modes', () => {
    for (const launchFailures of [undefined, []]) {
      const catalog = { ...data, launchFailures }
      const o = outcome(student(), catalog)
      expect(o).toMatchObject({ success: false, phase: null, failureModeId: null, cause: null })
      expect(o.lessons).toHaveLength(1) // only the contextual low-reliability lesson
      expect(initSim(student(), catalog).endReason).toBe('launchFailure')
    }
  })

  it('catalog: every failure mode has a phase, a cause, a lesson and a positive weight', () => {
    for (const m of gameData.launchFailures!) {
      expect(m.phase, m.id).toBeTruthy()
      expect(m.cause.length, m.id).toBeGreaterThan(0)
      expect(m.lesson.length, m.id).toBeGreaterThan(0)
      expect(m.weight, m.id).toBeGreaterThan(0)
    }
  })
})

describe('contextual lessons', () => {
  const design = student()
  const launcher = gameData.launchers.find((l) => l.id === design.launcherId)!
  const wet = wetMassKg(design, gameData)
  const regime = gameData.orbits.find((o) => o.id === design.orbitId)!.regime
  const lessonsOf = (data: GameData) => outcome({ ...design, seed: failingSeed(design, data) }, data).lessons
  const lowReliability = (l: string) => l.startsWith('This launcher succeeds')
  const noMargin = (l: string) => l.includes("of the launcher's capacity")
  /** A catalog where the launcher has this reliability and this capacity for the orbit's regime. */
  const custom = (reliability: number, capacityKg: number): GameData => ({
    ...gameData,
    launchers: gameData.launchers.map((l) =>
      l.id === launcher.id ? { ...l, reliability, capacityKg: { ...l.capacityKg, [regime]: capacityKg } } : l,
    ),
  })

  it('a launcher below 0.97 adds the reliability lesson, with its numbers', () => {
    expect(LAUNCH_LESSON_RELIABILITY_BELOW).toBe(0.97)
    const lessons = lessonsOf(custom(0.9, wet * 10))
    expect(lessons.find(lowReliability)).toBe(
      'This launcher succeeds 90% of the time, so about 10 in 100 launches fail. More reliable launchers usually cost more.',
    )
    expect(lessons.some(noMargin)).toBe(false)
  })

  it('a launcher at 0.97 or better does not', () => {
    for (const reliability of [0.97, 0.98, 0.99]) {
      expect(lessonsOf(custom(reliability, wet * 10)).some(lowReliability), String(reliability)).toBe(false)
    }
  })

  it('less than 10% mass margin adds the margin lesson, with the percent used', () => {
    expect(LAUNCH_LESSON_MARGIN_BELOW).toBe(0.1)
    const lessons = lessonsOf(custom(0.98, wet / 0.95))
    expect(lessons.find(noMargin)).toBe(
      "Your spacecraft used 95% of the launcher's capacity, leaving almost no margin.",
    )
    expect(lessons.some(lowReliability)).toBe(false)
  })

  it('a margin of 10% or more does not', () => {
    expect(lessonsOf(custom(0.98, wet / 0.9 + 0.001)).some(noMargin)).toBe(false)
    expect(lessonsOf(custom(0.98, wet * 3)).some(noMargin)).toBe(false)
  })

  it('both contextual lessons come after the failure mode lesson, reliability first', () => {
    const data = custom(0.9, wet / 0.95)
    const o = outcome({ ...design, seed: failingSeed(design, data) }, data)
    expect(o.lessons).toHaveLength(3)
    expect(o.lessons[0]).toBe(data.launchFailures!.find((m) => m.id === o.failureModeId)!.lesson)
    expect(lowReliability(o.lessons[1]!)).toBe(true)
    expect(noMargin(o.lessons[2]!)).toBe(true)
  })
})

describe('single source of truth', () => {
  it('is identical when called twice and matches what initSim did, for failures and successes', () => {
    const data = withReliability(student(), 0.5)
    let failures = 0
    for (const seed of seeds(60)) {
      const d = student({ seed })
      const a = outcome(d, data)
      expect(outcome(d, data)).toEqual(a)
      const state = initSim(d, data)
      expect(state.status === 'failed').toBe(!a.success)
      if (!a.success) {
        failures++
        const text = state.log.map((l) => l.text).join('\n')
        expect(text).toContain(a.cause!)
        const lessons = state.log
          .filter((l) => l.text.startsWith('Lesson: '))
          .map((l) => l.text.slice('Lesson: '.length))
        expect(lessons).toEqual(a.lessons)
      } else {
        expect(state.log[0]!.text).toContain('Launch successful')
      }
    }
    expect(failures).toBeGreaterThan(10)
  })

  it('gives the same answer after the mission has flown', () => {
    const d = student()
    const before = launchOutcome(d, gameData)
    runMission(d, gameData)
    expect(launchOutcome(d, gameData)).toEqual(before)
  })
})

describe('successful launches consume the same draws as before (replays are unchanged)', () => {
  const hash = (s: string) => {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
    return h
  }
  // Recorded with the engine on main before SCRUM-72: [scenario, seed, ticks, rng counter, spent M, log entries, log hash]
  const golden: [string, string, number, number, number, number, number][] = [
    ['student-cubesat', 'alpha', 365, 2191, 1.73, 2, 4110089562],
    ['student-cubesat', 'gamma', 365, 2191, 1.73, 2, 4110089562],
    ['wildfire-eo', 'alpha', 730, 4381, 72.1, 2, 1785929610],
    ['wildfire-eo', 'gamma', 730, 4381, 72.1, 2, 1785929610],
    ['space-telescope', 'alpha', 1825, 12776, 976, 2, 3449170087],
    ['space-telescope', 'gamma', 1825, 12776, 976, 2, 3449170087],
  ]
  it.each(golden)(
    '%s with seed %s plays exactly as before',
    (scenario, seed, tick, rng, spentM, logLength, logHash) => {
      const state = runMission({ ...ref(scenario), seed }, gameData)
      expect(state).toMatchObject({ status: 'success', endReason: 'lifetimeReached', tick, rng })
      expect(Math.round(state.spentM * 1e6) / 1e6).toBe(spentM)
      expect(state.log).toHaveLength(logLength)
      expect(hash(JSON.stringify(state.log))).toBe(logHash)
    },
  )

  it('a successful launch uses one draw: the mission starts at rng counter 1', () => {
    const state = initSim(student(), gameData)
    expect(state.status).toBe('running')
    expect(state.rng).toBe(1)
  })
})

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const data = withReliability(student(), 0)
    const d = student()
    const snaps = [JSON.stringify(d), JSON.stringify(data)]
    launchOutcome(d, data)
    initSim(d, data)
    expect([JSON.stringify(d), JSON.stringify(data)]).toEqual(snaps)
  })
})
