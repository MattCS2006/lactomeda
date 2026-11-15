import { describe, expect, it, vi } from 'vitest'
import { gameData } from '../data'
import { REFERENCE_DESIGNS } from '../data/referenceDesigns'
import {
  ALARM_TICK_MS,
  LAUNCH_PHASE_MS,
  MISSION_MAX_REAL_MS,
  MISSION_TICK_MS,
  SECONDS_PER_TICK,
  SIM_DAYS_PER_TICK,
} from '../engine/constants'
import { initSim, simulateTick } from '../engine/sim'
import type { GameData, MissionDesign, MissionEvent, SimState } from '../engine/types'
import { createDesign, useMissionStore } from '../ui/store/missionStore'
import { useFlightStore } from '../ui/flight/flightStore'
import { attachFlightRecorder } from '../ui/flight/useFlightRecorder'
import { Bridge, type BridgeEvents } from './bridge'
import { createMissionController, type Scheduler } from './missionController'

// ─── Fakes ──────────────────────────────────────────────────────────────

/** A scheduler on virtual time: advance(ms) runs every timer that falls due, in order. */
function fakeScheduler() {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { at: number; every: number | null; fn: () => void }>()
  const scheduler: Scheduler = {
    setInterval: (fn, ms) => (timers.set(nextId, { at: now + ms, every: ms, fn }), nextId++),
    setTimeout: (fn, ms) => (timers.set(nextId, { at: now + ms, every: null, fn }), nextId++),
    clearInterval: (h) => void timers.delete(h as number),
    clearTimeout: (h) => void timers.delete(h as number),
  }
  const advance = (ms: number) => {
    const end = now + ms
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
      if (!due) break
      const [id, t] = due
      now = t.at
      if (t.every === null) timers.delete(id)
      else t.at += t.every
      t.fn()
    }
    now = end
  }
  /** The period of the interval that is running now (undefined if none). */
  const intervalMs = () => [...timers.values()].find((t) => t.every !== null)?.every ?? undefined
  return { scheduler, advance, count: () => timers.size, intervalMs }
}

type Recorded = { [K in keyof BridgeEvents]: { type: K; payload: BridgeEvents[K] } }[keyof BridgeEvents]
const OUT = ['phaseChanged', 'simTick', 'alarmStart', 'alarmEnd', 'missionEnded'] as const

function setup(options: { tickMs?: number; launchMs?: number; alarmTickMs?: number } = {}) {
  const bus = new Bridge()
  const fake = fakeScheduler()
  const events: Recorded[] = []
  for (const type of OUT) bus.on(type, ((payload: never) => events.push({ type, payload } as Recorded)) as never)
  const controller = createMissionController({
    bus,
    scheduler: fake.scheduler,
    tickMs: 100,
    alarmTickMs: 100, // the same as tickMs, so most tests count ticks the same way with or without an alarm
    launchMs: 1000,
    ...options,
  })
  return { bus, fake, events, controller }
}

const types = (events: Recorded[]) => events.map((e) => e.type)
const ofType = <K extends (typeof OUT)[number]>(events: Recorded[], type: K) =>
  events.filter((e) => e.type === type).map((e) => e.payload as BridgeEvents[K])

// ─── Fixtures ───────────────────────────────────────────────────────────

const perfect = (g: GameData): GameData => ({ ...g, components: g.components.map((c) => ({ ...c, reliability: 1 })) })
const alarm = (over: Partial<MissionEvent> = {}): MissionEvent => ({
  id: 'test-alarm',
  station: 'power',
  title: 'Test alarm',
  description: 'Test event.',
  timerSec: 6,
  options: [
    { id: 'fix', label: 'Fix it', why: 'Costs money.', effects: { budget: -1, science: 1 } },
    { id: 'ignore', label: 'Ignore it', why: 'Raises risk.', effects: { risk: 0.05 } },
  ],
  defaultOptionId: 'ignore',
  trigger: { chancePerDay: 1 },
  ...over,
})
const withEvents = (events: MissionEvent[]): GameData => perfect({ ...gameData, events })
const flawless = perfect({ ...gameData, events: [] }) // no random events: a quiet mission
const student = (over: Partial<MissionDesign> = {}): MissionDesign => ({
  ...REFERENCE_DESIGNS.find((d) => d.scenarioId === 'student-cubesat')!,
  difficulty: 'engineer',
  seed: 'alpha',
  ...over,
})
const ticksOf = (design: MissionDesign, data: GameData) =>
  data.scenarios.find((s) => s.id === design.scenarioId)!.durationDays / SIM_DAYS_PER_TICK

/** A seed whose launch fails and one whose launch works, for this design. */
function launchSeeds(design: MissionDesign, data: GameData) {
  let failing: string | undefined
  let working: string | undefined
  for (let i = 0; i < 500 && !(failing && working); i++) {
    const seed = `s${i}`
    if (initSim({ ...design, seed }, data).status === 'failed') failing ??= seed
    else working ??= seed
  }
  return { failing: failing!, working: working! }
}

/** Plays a whole mission with the fake clock and returns everything emitted. */
function playToEnd(design: MissionDesign, data: GameData, speed: 1 | 2 | 10 = 1) {
  const s = setup()
  s.controller.start(design, data)
  s.fake.advance(1000) // launch
  s.controller.setSpeed(speed)
  s.fake.advance(100 * ticksOf(design, data) + 1000)
  return s
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('phases', () => {
  it('emits launch, flight, simTicks, missionEnded and debrief in order, the last two once', () => {
    const { events } = playToEnd(student(), flawless, 10)
    const t = types(events)
    expect(t[0]).toBe('phaseChanged')
    expect(ofType(events, 'phaseChanged').map((p) => p.phase)).toEqual(['launch', 'flight', 'debrief'])
    expect(t.indexOf('simTick')).toBeGreaterThan(t.indexOf('phaseChanged'))
    expect(t.filter((x) => x === 'missionEnded')).toHaveLength(1)
    // missionEnded comes right before the debrief phase, and nothing is emitted after it
    expect(t.slice(-2)).toEqual(['missionEnded', 'phaseChanged'])
    const ended = ofType(events, 'missionEnded')[0]!
    expect(ended.status).toBe('success')
    expect(ended.score.total).toBeGreaterThan(0)
    expect(ended.explanation).toEqual({ summary: '', points: [] }) // TODO SCRUM-100
  })

  it('sends one simTick with the initial state when the flight starts, then one per tick', () => {
    const s = setup()
    s.controller.start(student(), flawless)
    expect(ofType(s.events, 'phaseChanged').map((p) => p.phase)).toEqual(['launch'])
    s.fake.advance(999)
    expect(ofType(s.events, 'simTick')).toHaveLength(0) // still on the launch pad
    s.fake.advance(1)
    expect(ofType(s.events, 'simTick')).toHaveLength(1)
    expect(ofType(s.events, 'simTick')[0]!.state.tick).toBe(0)
    s.fake.advance(300)
    expect(ofType(s.events, 'simTick').map((p) => p.state.tick)).toEqual([0, 1, 2, 3])
  })

  it('a failed launch ends at once with launchFailure and never flies', () => {
    const design = student()
    const { failing } = launchSeeds(design, flawless)
    const s = setup()
    s.controller.start({ ...design, seed: failing }, flawless)
    expect(types(s.events)).toEqual(['phaseChanged', 'missionEnded', 'phaseChanged'])
    expect(ofType(s.events, 'phaseChanged').map((p) => p.phase)).toEqual(['launch', 'debrief'])
    expect(ofType(s.events, 'missionEnded')[0]!.status).toBe('failed')
    expect(s.controller.getState()!.endReason).toBe('launchFailure')
    s.fake.advance(1_000_000)
    expect(types(s.events)).toHaveLength(3) // no flight ticks later
    expect(s.fake.count()).toBe(0)
  })
})

describe('simTick', () => {
  it('has no log and otherwise equals the engine state, tick by tick', () => {
    const design = student()
    const s = setup()
    s.controller.start(design, flawless)
    s.fake.advance(1000 + 100 * 5)
    let expected: SimState = initSim(design, flawless)
    const ticks = ofType(s.events, 'simTick')
    expect(ticks).toHaveLength(6)
    ticks.forEach((payload, i) => {
      if (i > 0) expected = simulateTick(expected, design, flawless)
      const { log, ...rest } = expected
      expect(log.length).toBeGreaterThan(0)
      expect(payload.state).toEqual(rest)
      expect('log' in payload.state).toBe(false)
    })
  })
})

describe('alarms', () => {
  const data = withEvents([alarm()])
  const design = student()

  it('emits alarmStart when an alarm appears, with its deadline', () => {
    const s = setup()
    s.controller.start(design, data)
    s.fake.advance(1000 + 100)
    const [start] = ofType(s.events, 'alarmStart')
    expect(start!.event.id).toBe('test-alarm')
    expect(start!.deadlineTick).toBe(s.controller.getState()!.activeEvents[0]!.deadlineTick)
  })

  it('emits alarmEnd resolved after eventResolved, then a fresh simTick', () => {
    const s = setup()
    s.controller.start(design, data)
    s.fake.advance(1000 + 100)
    const before = ofType(s.events, 'simTick').length
    s.bus.emit('eventResolved', { eventId: 'test-alarm', optionId: 'fix' })
    expect(ofType(s.events, 'alarmEnd')).toEqual([{ eventId: 'test-alarm', optionId: 'fix', reason: 'resolved' }])
    expect(ofType(s.events, 'simTick')).toHaveLength(before + 1)
    expect(s.controller.getState()!.activeEvents).toHaveLength(0)
    expect(s.controller.getState()!.log.some((l) => l.kind === 'decision')).toBe(true)
  })

  it('emits alarmEnd timeout with the default option when the timer runs out', () => {
    const s = setup()
    s.controller.start(design, data)
    s.fake.advance(1000 + 100)
    s.fake.advance(100 * 3) // timerSec 6 = 3 ticks
    const [end] = ofType(s.events, 'alarmEnd')
    expect(end).toEqual({ eventId: 'test-alarm', optionId: 'ignore', reason: 'timeout' })
    expect(types(s.events).indexOf('alarmEnd')).toBeGreaterThan(types(s.events).indexOf('alarmStart'))
  })

  it('minigameDone passes its score to resolveEvent as minigameScore', () => {
    const repair = alarm({
      options: [{ id: 'fix', label: 'Fix it', why: 'x', effects: { risk: 0.4 } }, ...alarm().options.slice(1)],
      timerSec: 100,
    })
    const half = setup()
    half.controller.start(design, withEvents([repair]))
    half.fake.advance(1100)
    half.bus.emit('minigameDone', { eventId: 'test-alarm', optionId: 'fix', score: 0.5 })
    const full = setup()
    full.controller.start(design, withEvents([repair]))
    full.fake.advance(1100)
    full.bus.emit('eventResolved', { eventId: 'test-alarm', optionId: 'fix', minigameScore: 1 })
    // a positive effect is not scaled by the score, so compare with a negative one
    expect(half.controller.getState()!.activeEvents).toHaveLength(0)
    expect(ofType(half.events, 'alarmEnd')[0]!.reason).toBe('resolved')

    const costly = alarm({
      options: [{ id: 'fix', label: 'Fix it', why: 'x', effects: { budget: -10 } }, ...alarm().options.slice(1)],
      timerSec: 100,
    })
    const spent = (score: number) => {
      const s = setup()
      s.controller.start(design, withEvents([costly]))
      s.fake.advance(1100)
      const before = s.controller.getState()!.spentM
      s.bus.emit('minigameDone', { eventId: 'test-alarm', optionId: 'fix', score })
      return s.controller.getState()!.spentM - before
    }
    expect(spent(1)).toBeCloseTo(10)
    expect(spent(0.5)).toBeCloseTo(5)
    expect(spent(0)).toBeCloseTo(0)
  })

  it('ignores decisions for alarms that are not ringing and before the flight', () => {
    const s = setup()
    s.controller.start(design, data)
    s.bus.emit('eventResolved', { eventId: 'test-alarm', optionId: 'fix' }) // still launching
    expect(ofType(s.events, 'alarmEnd')).toHaveLength(0)
    s.fake.advance(1000 + 100)
    s.bus.emit('eventResolved', { eventId: 'nope', optionId: 'fix' })
    expect(ofType(s.events, 'alarmEnd')).toHaveLength(0)
  })
})

describe('speed and pause', () => {
  const ticksAfter = (s: ReturnType<typeof setup>) => ofType(s.events, 'simTick').length

  it('setSpeed(0) and simPaused stop the ticks; resuming brings back the speed before the pause', () => {
    const s = setup()
    s.controller.start(student(), flawless)
    s.fake.advance(1000)
    s.controller.setSpeed(2)
    s.fake.advance(100)
    expect(ticksAfter(s)).toBe(1 + 2)
    s.controller.setSpeed(0)
    const n = ticksAfter(s)
    s.fake.advance(10_000)
    expect(ticksAfter(s)).toBe(n)
    expect(s.controller.getSpeed()).toBe(0)
    s.controller.setSpeed(1)
    s.fake.advance(100)
    expect(ticksAfter(s)).toBe(n + 1)

    s.controller.setSpeed(10)
    s.bus.emit('simPaused', { paused: true })
    expect(s.controller.getSpeed()).toBe(0)
    const m = ticksAfter(s)
    s.fake.advance(10_000)
    expect(ticksAfter(s)).toBe(m)
    s.bus.emit('simPaused', { paused: false })
    expect(s.controller.getSpeed()).toBe(10)
    s.fake.advance(100)
    expect(ticksAfter(s)).toBe(m + 10)
  })

  it('2x and 10x tick faster in real time', () => {
    const count = (speed: 1 | 2 | 10) => {
      const s = setup()
      s.controller.start(student(), flawless)
      s.fake.advance(1000)
      s.controller.setSpeed(speed)
      s.fake.advance(1000)
      return ticksAfter(s) - 1
    }
    expect([count(1), count(2), count(10)]).toEqual([10, 20, 100])
  })

  it('does not tick on a launch-pad pause: speed set before the flight is kept', () => {
    const s = setup()
    s.controller.start(student(), flawless)
    s.controller.setSpeed(0)
    s.fake.advance(5000)
    expect(ticksAfter(s)).toBe(1) // only the initial state, then nothing
    s.controller.setSpeed(1)
    s.fake.advance(200)
    expect(ticksAfter(s)).toBe(3)
  })

  it('gives the same final state and the same event sequence at 1x and 10x', () => {
    const data = withEvents([alarm({ trigger: { chancePerDay: 0.05 } })])
    const slow = playToEnd(student(), data, 1)
    const fast = playToEnd(student(), data, 10)
    expect(ofType(slow.events, 'alarmStart').length).toBeGreaterThan(0) // the test would be empty otherwise
    expect(slow.events).toEqual(fast.events)
    expect(slow.controller.getState()).toEqual(fast.controller.getState())
  })
})

describe('stop and restart', () => {
  it('stop() removes the timers and every bridge listener, and is safe twice', () => {
    const bus = new Bridge()
    const fake = fakeScheduler()
    const controller = createMissionController({ bus, scheduler: fake.scheduler, tickMs: 100, launchMs: 1000 })
    const seen: string[] = []
    bus.on('simTick', () => seen.push('tick'))
    const on = vi.spyOn(bus, 'on')
    controller.start(student(), withEvents([alarm()]))
    fake.advance(1000 + 300)
    expect(on).toHaveBeenCalledTimes(3) // eventResolved, minigameDone, simPaused
    const ticks = seen.length
    controller.stop()
    controller.stop()
    expect(fake.count()).toBe(0)
    fake.advance(100_000)
    expect(seen).toHaveLength(ticks)
    bus.emit('eventResolved', { eventId: 'test-alarm', optionId: 'fix' }) // nobody listens any more
    expect(seen).toHaveLength(ticks)
    expect(controller.getState()!.activeEvents.length).toBeGreaterThan(0) // untouched
  })

  it('stop() before the flight starts cancels the launch timer', () => {
    const s = setup()
    s.controller.start(student(), flawless)
    s.controller.stop()
    expect(s.fake.count()).toBe(0)
    s.fake.advance(10_000)
    expect(ofType(s.events, 'phaseChanged').map((p) => p.phase)).toEqual(['launch'])
  })

  it('start() twice leaves one clock running and the first run silent', () => {
    const s = setup()
    s.controller.start(student(), flawless)
    s.fake.advance(1000 + 100)
    s.controller.start(student({ seed: launchSeeds(student(), flawless).working }), flawless)
    s.events.length = 0
    s.fake.advance(1000)
    expect(ofType(s.events, 'phaseChanged').map((p) => p.phase)).toEqual(['flight'])
    expect(s.fake.count()).toBe(1) // one interval
    s.events.length = 0
    s.fake.advance(1000)
    expect(ofType(s.events, 'simTick')).toHaveLength(10) // not 20
  })

  it('copies the design at start: later edits do not reach the flight', () => {
    const design = student()
    const s = setup()
    s.controller.start(design, flawless)
    const snap = JSON.stringify(design)
    design.launcherId = 'nope'
    design.seed = 'changed'
    design.instrumentIds.push('nope')
    s.fake.advance(1000 + 100 * 20)
    const clean = student()
    let expected = initSim(clean, flawless)
    for (let i = 0; i < 20; i++) expected = simulateTick(expected, clean, flawless)
    expect(s.controller.getState()).toEqual(expected)
    expect(snap).not.toEqual(JSON.stringify(design))
  })
})

describe('timing (FR-7.2)', () => {
  it('a full mission of the longest scenario plays in 3 minutes or less at 1x when no alarm rings (alarm time is player time)', () => {
    const longest = Math.max(...gameData.scenarios.map((s) => s.durationDays / SIM_DAYS_PER_TICK))
    expect((longest + 1) * MISSION_TICK_MS).toBeLessThanOrEqual(MISSION_MAX_REAL_MS)
    expect(LAUNCH_PHASE_MS).toBeLessThanOrEqual(20_000) // FR-9.3
  })

  it('a quiet run takes exactly its ticks x MISSION_TICK_MS of real time with the default clock', () => {
    const design = student()
    const s = setup({ tickMs: MISSION_TICK_MS, alarmTickMs: ALARM_TICK_MS, launchMs: 0 })
    s.controller.start(design, flawless)
    s.fake.advance(0)
    const total = ticksOf(design, flawless)
    s.fake.advance(total * MISSION_TICK_MS - 1)
    expect(ofType(s.events, 'missionEnded')).toHaveLength(0)
    s.fake.advance(1)
    expect(ofType(s.events, 'missionEnded')).toHaveLength(1)
    expect(ALARM_TICK_MS).toBe(SECONDS_PER_TICK * 1000)
  })

  it('uses the defaults when no options are given', () => {
    const bus = new Bridge()
    const fake = fakeScheduler()
    const controller = createMissionController({ bus, scheduler: fake.scheduler })
    const phases: string[] = []
    bus.on('phaseChanged', ({ phase }) => phases.push(phase))
    controller.start(student(), flawless)
    fake.advance(LAUNCH_PHASE_MS - 1)
    expect(phases).toEqual(['launch'])
    fake.advance(1)
    expect(phases).toEqual(['launch', 'flight'])
    controller.stop()
  })
})

describe('alarm time (the clock slows down, never pauses)', () => {
  const design = student()
  const slow = { tickMs: 100, alarmTickMs: 400 }

  it('runs the interval at alarmTickMs / speed while an alarm rings, and pause still wins', () => {
    const s = setup(slow)
    s.controller.start(design, withEvents([alarm({ timerSec: 100 })]))
    s.fake.advance(1000)
    expect(s.fake.intervalMs()).toBe(100) // quiet at the start
    s.fake.advance(100)
    expect(s.controller.getState()!.activeEvents).toHaveLength(1)
    expect(s.fake.intervalMs()).toBe(400)
    s.controller.setSpeed(2) // changing speed during an alarm applies the same division
    expect(s.fake.intervalMs()).toBe(200)
    s.controller.setSpeed(10)
    expect(s.fake.intervalMs()).toBe(40)
    s.controller.setSpeed(0)
    expect(s.fake.intervalMs()).toBeUndefined()
    s.bus.emit('simPaused', { paused: false })
    expect(s.fake.intervalMs()).toBe(40)
  })

  it('goes back to tickMs / speed when the last alarm ends, resolved or timed out', () => {
    const run = (how: 'resolved' | 'timeout') => {
      const s = setup(slow)
      const catalog = withEvents([alarm({ timerSec: 8 })])
      s.controller.start(design, catalog)
      s.fake.advance(1000 + 100)
      expect(s.controller.getState()!.activeEvents).toHaveLength(1)
      expect(s.fake.intervalMs()).toBe(400)
      catalog.events = [] // nothing rings again after this one
      s.controller.setSpeed(2)
      expect(s.fake.intervalMs()).toBe(200)
      if (how === 'resolved') s.bus.emit('eventResolved', { eventId: 'test-alarm', optionId: 'fix' })
      else s.fake.advance(200 * 4)
      expect(ofType(s.events, 'alarmEnd').at(-1)!.reason).toBe(how)
      expect(s.controller.getState()!.activeEvents).toHaveLength(0)
      expect(s.fake.intervalMs()).toBe(50) // tickMs / speed again
    }
    run('resolved')
    run('timeout')
  })

  it('a 30 s alarm lasts about 30 s of real time at 1x with the default alarm tick', () => {
    const s = setup({ tickMs: MISSION_TICK_MS, alarmTickMs: ALARM_TICK_MS, launchMs: 0 })
    s.controller.start(design, withEvents([alarm({ timerSec: 30 })]))
    s.fake.advance(MISSION_TICK_MS) // the first tick: the alarm starts
    const [start] = ofType(s.events, 'alarmStart')
    expect(start).toBeDefined()
    expect(start!.deadlineTick - s.controller.getState()!.tick).toBe(30 / SECONDS_PER_TICK)
    expect(ofType(s.events, 'alarmEnd')).toHaveLength(0)
    s.fake.advance(30_000 - ALARM_TICK_MS) // one tick short of 30 s
    expect(ofType(s.events, 'alarmEnd')).toHaveLength(0)
    s.fake.advance(ALARM_TICK_MS)
    expect(ofType(s.events, 'alarmEnd')[0]).toMatchObject({ reason: 'timeout' })
  })

  it('does not change the result: same final state and events at any speed, with or without the slow alarm clock', () => {
    const data = withEvents([alarm({ trigger: { chancePerDay: 0.05 } })])
    const run = (speed: 1 | 2 | 10, alarmTickMs: number) => {
      const s = setup({ alarmTickMs })
      s.controller.start(design, data)
      s.fake.advance(1000)
      s.controller.setSpeed(speed)
      s.fake.advance(400 * ticksOf(design, data) * 2)
      return s
    }
    const a = run(1, 100)
    const b = run(10, 400)
    expect(ofType(a.events, 'alarmStart').length).toBeGreaterThan(0)
    expect(a.events).toEqual(b.events)
    expect(a.controller.getState()).toEqual(b.controller.getState())
  })
})

describe('integration with the flight record (Fly again)', () => {
  it('records the design at launch and the result at the end', () => {
    const design = createDesign('student-cubesat', gameData, 'engineer')
    const flown = { ...student(), seed: 'alpha' }
    useMissionStore.setState({ design: flown })
    useFlightStore.setState({ phase: 'design', lastFlight: null })
    const s = setup()
    const detach = attachFlightRecorder(s.bus)
    s.controller.start(flown, flawless)
    expect(useFlightStore.getState().phase).toBe('launch')
    expect(useFlightStore.getState().lastFlight!.design).toEqual(flown)
    expect(useFlightStore.getState().lastFlight!.result).toBeNull()
    s.fake.advance(1000)
    expect(useFlightStore.getState().phase).toBe('flight')
    s.controller.setSpeed(10)
    s.fake.advance(100 * ticksOf(flown, flawless) + 1000)
    const record = useFlightStore.getState().lastFlight!
    const ended = ofType(s.events, 'missionEnded')[0]!
    expect(record.design).toEqual(flown)
    expect(record.result).toEqual({ total: ended.score.total, stars: ended.score.stars, outcome: ended.score.outcome })
    expect(useFlightStore.getState().phase).toBe('debrief')
    expect(design.scenarioId).toBe('student-cubesat')
    detach()
  })
})
