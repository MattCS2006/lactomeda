// Station tasks in the ship and the controller: calm marker (not the red alarm), no clock slow-down, same pop-up.
import { describe, expect, it } from 'vitest'
import { gameData } from '../data'
import { REFERENCE_DESIGNS } from '../data/referenceDesigns'
import { isTask } from '../engine/rules/tasks'
import type { ActiveEvent, GameData, MissionEvent } from '../engine/types'
import { alarmsAtStation } from '../ui/launch/decisionView'
import { alarmSecondsLeft } from '../ui/launch/reviewView'
import { MISSION_TICK_MS, SECONDS_PER_TICK } from '../engine/constants'
import { alarmStations, taskStations } from './alarmView'
import { Bridge, type BridgeEvents } from './bridge'
import { createMissionController, type Scheduler } from './missionController'
import { stationStatus } from './stationStatus'
import type { SimSnapshot } from './bridge'

const task = gameData.events.find(isTask)!
const alarm = gameData.events.find((e) => e.id === 'failure-comms') ?? gameData.events.find((e) => !isTask(e))!
const active = (event: MissionEvent, deadlineTick = 100): ActiveEvent => ({ event, startedTick: 0, deadlineTick })

describe('task marker vs alarm', () => {
  const ship = ['bridge', 'science', 'comms', 'power', 'computer', 'navigation', 'engine'] as const

  it('a task is not an alarm: no red flash, no off-screen alarm arrow, the station stays calm', () => {
    expect(alarmStations([active(task)], ship).size).toBe(0)
    expect([...taskStations([active(task)], ship)]).toEqual([task.station])
  })

  it('a station with both gets the alarm only', () => {
    const sameStation = { ...task, station: alarm.station }
    expect([...alarmStations([active(alarm), active(sameStation)], ship)]).toEqual([alarm.station])
    expect(taskStations([active(alarm), active(sameStation)], ship).size).toBe(0)
  })

  it('a task whose station is not on this ship is answered at the bridge', () => {
    expect([...taskStations([active(task)], ['bridge'])]).toEqual(['bridge'])
  })

  it('the station panel does not go red for a task', () => {
    const snap = { activeEvents: [active(task)], health: {}, batteryWh: 1, propellantKg: 0, day: 1, spentM: 0, risk: 0, storedDataMb: 0, downlinkedDataMb: 0, science: 0 } as unknown as SimSnapshot
    expect(stationStatus(task.station, snap).state).not.toBe('alarm')
    const withAlarm = { ...snap, activeEvents: [active({ ...task, kind: 'alarm' })] } as SimSnapshot
    expect(stationStatus(task.station, withAlarm).state).toBe('alarm')
  })
})

describe('the pop-up for a task', () => {
  it('opens at the task station, with a real alarm listed before a task', () => {
    const sameStation = { ...alarm, station: task.station }
    const list = alarmsAtStation([active(task), active(sameStation)], task.station, [task.station])
    expect(list.map((a) => a.event.id)).toEqual([sameStation.id, task.id])
  })

  it('counts its seconds in normal ticks, an alarm in slow ones', () => {
    expect(alarmSecondsLeft(active(task, 100), 0)).toBe(Math.ceil((100 * MISSION_TICK_MS) / 1000))
    expect(alarmSecondsLeft(active(alarm, 100), 0)).toBe(100 * SECONDS_PER_TICK)
  })
})

// ─── The clock ─────────────────────────────────────────────────────────

function fakeClock() {
  const intervals: { ms: number; fn: () => void; live: boolean }[] = []
  const scheduler: Scheduler = {
    setInterval: (fn, ms) => (intervals.push({ ms, fn, live: true }), intervals.length - 1),
    clearInterval: (h) => void (intervals[h as number]!.live = false),
    setTimeout: (fn) => (fn(), 0),
    clearTimeout: () => undefined,
  }
  const current = () => intervals.filter((i) => i.live).at(-1)!
  return { scheduler, current }
}

function fly(events: MissionEvent[]) {
  const data: GameData = {
    ...gameData,
    components: gameData.components.map((c) => ({ ...c, reliability: 1 })),
    events,
  }
  const clock = fakeClock()
  const bus = new Bridge()
  const started: BridgeEvents['alarmStart'][] = []
  bus.on('alarmStart', (p) => started.push(p))
  const controller = createMissionController({ bus, scheduler: clock.scheduler, tickMs: 90, alarmTickMs: 2000 })
  controller.start(REFERENCE_DESIGNS[2]!, data) // the telescope: a long mission
  return { clock, started, controller }
}

describe('the mission clock', () => {
  const always = (e: MissionEvent): MissionEvent => ({ ...e, trigger: { ...e.trigger, chancePerDay: 100 }, timerSec: 60 })

  it('an optional task never slows the clock', () => {
    const { clock, started } = fly([always(task)])
    clock.current().fn() // first tick of the flight: the task is offered
    expect(started.map((s) => s.event.id)).toEqual([task.id])
    expect(started[0]!.event.kind).toBe('task')
    expect(clock.current().ms).toBe(90) // still the normal tick, not the slow alarm tick
  })

  it('a real alarm still slows it', () => {
    const { clock, started } = fly([always(alarm)])
    clock.current().fn()
    expect(started).toHaveLength(1)
    expect(clock.current().ms).toBe(2000)
  })

  it('a task together with an alarm: the alarm decides', () => {
    const { clock } = fly([always(task), always(alarm)])
    clock.current().fn()
    expect(clock.current().ms).toBe(2000)
  })
})
