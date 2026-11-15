// Mission controller (SCRUM-73/74): runs the pure engine on a clock and talks to the rest of the game through the
// bridge. The engine never emits by itself; this is the only place that owns the SimState while a mission flies.
// Determinism (FR-7.8): the engine is seeded and the clock only decides WHEN a tick runs, never what it computes.
// No UI text here: the log text stays in the engine.
import { ALARM_TICK_MS, LAUNCH_PHASE_MS, MISSION_TICK_MS } from '../engine/constants'
import { explain } from '../engine/rules/explain'
import { score } from '../engine/rules/score'
import { initSim, resolveEvent, simulateTick } from '../engine/sim'
import type { GameData, MissionDesign, SimState } from '../engine/types'
import { bridge, type Bridge, type SimSnapshot } from './bridge'

/** 0 = paused */
export type Speed = 0 | 1 | 2 | 10

/** The clock the controller uses. Tests inject a fake one. */
export interface Scheduler {
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface MissionControllerOptions {
  bus?: Bridge // default: the bridge singleton
  scheduler?: Scheduler // default: the global timers
  tickMs?: number // real ms per engine tick at 1x while no alarm rings
  alarmTickMs?: number // real ms per engine tick at 1x while an alarm rings (default: an alarm lasts its real timerSec)
  launchMs?: number // how long the 'launch' phase lasts before 'flight'
}

export interface MissionController {
  start(design: MissionDesign, data: GameData): void
  setSpeed(speed: Speed): void
  getSpeed(): Speed
  getState(): SimState | null
  /** Stops timers and unsubscribes. Safe to call twice. */
  stop(): void
}

const defaultScheduler: Scheduler = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** The state without its log (the log stays in the controller). */
function snapshot(state: SimState): SimSnapshot {
  const { log: _log, ...rest } = state
  return rest
}

export function createMissionController(options: MissionControllerOptions = {}): MissionController {
  const bus = options.bus ?? bridge
  const clock = options.scheduler ?? defaultScheduler
  const tickMs = options.tickMs ?? MISSION_TICK_MS
  const alarmTickMs = options.alarmTickMs ?? ALARM_TICK_MS
  const launchMs = options.launchMs ?? LAUNCH_PHASE_MS

  let design: MissionDesign | null = null
  let data: GameData | null = null
  let state: SimState | null = null
  let speed: Speed = 1
  let speedBeforePause: Exclude<Speed, 0> = 1
  let flying = false // true between 'flight' and the end
  let ended = false
  let clockHandle: unknown = null
  let clockSlow = false // the running interval was set for an alarm
  let launchHandle: unknown = null
  let offs: (() => void)[] = []

  function stopTimers(): void {
    if (clockHandle !== null) clock.clearInterval(clockHandle)
    if (launchHandle !== null) clock.clearTimeout(launchHandle)
    clockHandle = null
    launchHandle = null
  }

  function unsubscribe(): void {
    for (const off of offs) off()
    offs = []
  }

  /** (Re)starts the tick timer for the current speed. */
  function restartClock(): void {
    if (clockHandle !== null) clock.clearInterval(clockHandle)
    clockHandle = null
    if (!flying || ended || speed === 0) return
    clockSlow = (state?.activeEvents.length ?? 0) > 0 // while an alarm rings the clock slows down (it never pauses)
    clockHandle = clock.setInterval(tick, (clockSlow ? alarmTickMs : tickMs) / speed)
  }

  /** Switches the interval when the last alarm ended or the first one started. Speed 0 keeps the clock stopped. */
  function syncClock(): void {
    if (clockHandle !== null && (state?.activeEvents.length ?? 0) > 0 !== clockSlow) restartClock()
  }

  /** An alarm is identified by its event and the tick it started, so one that ends and rings again in the same tick still shows up. */
  const alarmKey = (a: SimState['activeEvents'][number]): string => `${a.event.id}@${a.startedTick}`

  /**
   * Emits what changed in the alarm list between two states. A removed alarm is a timeout during a tick and a decision
   * otherwise. A timed-out alarm whose `escalateTo` event started in the same tick (FR-13.4) ends as 'escalated', and
   * the alarmStart of the worse event follows.
   */
  function emitAlarms(before: SimState, after: SimState, removed: 'timeout' | 'resolved'): void {
    const stillActive = new Set(after.activeEvents.map(alarmKey))
    for (const a of before.activeEvents) {
      if (!stillActive.has(alarmKey(a))) {
        const escalated =
          removed === 'timeout' &&
          a.event.escalateTo !== undefined &&
          after.activeEvents.some((n) => n.event.id === a.event.escalateTo && n.startedTick === after.tick)
        bus.emit('alarmEnd', {
          eventId: a.event.id,
          optionId: a.event.defaultOptionId,
          reason: escalated ? 'escalated' : removed,
        })
      }
    }
    const wasActive = new Set(before.activeEvents.map(alarmKey))
    for (const a of after.activeEvents) {
      if (!wasActive.has(alarmKey(a))) bus.emit('alarmStart', { event: a.event, deadlineTick: a.deadlineTick })
    }
  }

  function finish(): void {
    if (ended || !state || !design || !data) return
    ended = true
    stopTimers()
    unsubscribe()
    bus.emit('missionEnded', {
      status: state.status === 'success' ? 'success' : 'failed',
      score: score(state, design, data),
      explanation: explain(design, state, data),
    })
    bus.emit('phaseChanged', { phase: 'debrief' })
  }

  function tick(): void {
    if (!flying || ended || !state || !design || !data) return
    const before = state
    state = simulateTick(state, design, data)
    emitAlarms(before, state, 'timeout')
    bus.emit('simTick', { state: snapshot(state) })
    if (state.status !== 'running') finish()
    else syncClock()
  }

  /** The player (or a mini-game) picked an option. */
  function decide(eventId: string, optionId: string, minigameScore?: number): void {
    if (!flying || ended || !state || !design || !data) return
    const before = state
    state = resolveEvent(state, eventId, optionId, design, data, minigameScore)
    // The engine names the removed alarm's option itself; report the one the player chose
    const chosen = before.activeEvents.find((a) => a.event.id === eventId)
    const resolved = chosen && !state.activeEvents.some((a) => a.event.id === eventId)
    if (resolved) bus.emit('alarmEnd', { eventId, optionId, reason: 'resolved' })
    emitAlarms(
      { ...before, activeEvents: before.activeEvents.filter((a) => a.event.id !== eventId) },
      state,
      'resolved',
    )
    bus.emit('simTick', { state: snapshot(state) })
    if (state.status !== 'running') finish()
    else syncClock()
  }

  function setSpeed(next: Speed): void {
    speed = next
    if (next !== 0) speedBeforePause = next
    restartClock()
  }

  function beginFlight(): void {
    launchHandle = null
    if (ended || !state) return
    flying = true
    bus.emit('phaseChanged', { phase: 'flight' })
    bus.emit('simTick', { state: snapshot(state) })
    restartClock()
  }

  function stop(): void {
    stopTimers()
    unsubscribe()
    flying = false
    ended = true // a stopped mission never emits again
  }

  function start(nextDesign: MissionDesign, nextData: GameData): void {
    stop()
    design = structuredClone(nextDesign) // later edits to the design store must not reach the flight
    data = nextData
    ended = false
    flying = false
    speed = 1
    speedBeforePause = 1

    bus.emit('phaseChanged', { phase: 'launch' })
    state = initSim(design, data)
    if (state.status !== 'running') {
      // launch failure: there is no flight
      finish()
      return
    }
    offs = [
      bus.on('eventResolved', (p) => decide(p.eventId, p.optionId, p.minigameScore)),
      bus.on('minigameDone', (p) => decide(p.eventId, p.optionId, p.score)),
      bus.on('simPaused', ({ paused }) => setSpeed(paused ? 0 : speedBeforePause)),
    ]
    launchHandle = clock.setTimeout(beginFlight, launchMs)
  }

  return {
    start,
    setSpeed,
    getSpeed: () => speed,
    getState: () => state,
    stop,
  }
}

// ─── Singleton helpers for the UI ───────────────────────────────────────

let current: MissionController | null = null

/** Starts a mission on the bridge singleton, replacing any run in progress. */
export function startMission(design: MissionDesign, data: GameData): MissionController {
  current?.stop()
  current = createMissionController()
  current.start(design, data)
  return current
}

export function stopMission(): void {
  current?.stop()
  current = null
}

export function getMissionController(): MissionController | null {
  return current
}
