// Station tasks (optional mini-missions): kind 'task' events. They appear about 4-6 times per mission, give their
// reward when done, do nothing when skipped, never slow the clock, never escalate and never touch the collaboration score.
import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { SECONDS_PER_TICK, TASK_LOG_DONE, TASK_LOG_SKIPPED } from '../constants'
import { initSim, resolveEvent, runMission, simulateTick } from '../sim'
import type { GameData, MissionDesign, MissionEvent, SimState } from '../types'
import { score } from './score'
import { isTask, taskDeadlineTicks } from './tasks'

const tasks = gameData.events.filter(isTask)
const perfect = (g: GameData): GameData => ({ ...g, components: g.components.map((c) => ({ ...c, reliability: 1 })) })
const noAlarms = (g: GameData): GameData => ({ ...g, events: g.events.filter(isTask) }) // only tasks
const onlyTasks = perfect(noAlarms(gameData))
const calm = perfect({ ...gameData, events: gameData.events.filter((e) => e.id.startsWith('failure-')) })
const ref = (id: string, seed = 'reference'): MissionDesign => ({ ...REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!, seed })

/** How many tasks were offered during a whole mission. */
const offered = (state: SimState): number => state.log.filter((l) => l.kind === 'info' && l.text.startsWith('Task at the ')).length

/** The first tick at which a task is active, with that state. */
function firstTask(design: MissionDesign, data: GameData): SimState {
  let state = initSim(design, data)
  while (state.status === 'running' && !state.activeEvents.some((a) => isTask(a.event))) state = simulateTick(state, design, data)
  expect(state.activeEvents.some((a) => isTask(a.event)), 'a task appeared').toBe(true)
  return state
}

describe('station task catalog', () => {
  it('has one task per station, each with a do-it option and a free skip as the default', () => {
    expect(new Set(tasks.map((t) => t.station))).toEqual(new Set(['science', 'comms', 'power', 'computer', 'navigation', 'engine', 'bridge']))
    expect(tasks).toHaveLength(7)
    for (const t of tasks) {
      expect(t.kind, t.id).toBe('task')
      expect(t.options, t.id).toHaveLength(2)
      expect(t.timerSec, t.id).toBeGreaterThanOrEqual(45)
      expect(t.timerSec, t.id).toBeLessThanOrEqual(60)
      expect(t.defaultOptionId, t.id).toBe('skip')
      expect(t.options.find((o) => o.id === 'skip')!.effects, t.id).toEqual({})
      expect(t.escalateTo, t.id).toBeUndefined()
      const doIt = t.options.find((o) => o.id !== 'skip')!
      expect(Object.keys(doIt.effects).length, t.id).toBeGreaterThan(0)
    }
  })
})

describe('how often tasks appear', () => {
  it('about 4 to 6 tasks per mission on average, on every scenario (8 fixed seeds each)', () => {
    for (const scenario of ['student-cubesat', 'wildfire-eo', 'space-telescope']) {
      const counts = Array.from({ length: 8 }, (_, i) => offered(runMission(ref(scenario, `seed-${i}`), onlyTasks)))
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length
      expect(mean, `${scenario}: ${counts.join(',')}`).toBeGreaterThanOrEqual(3.5)
      expect(mean, `${scenario}: ${counts.join(',')}`).toBeLessThanOrEqual(6.5)
    }
  }, 60_000)

  it('does not depend on the difficulty', () => {
    const count = (difficulty: MissionDesign['difficulty']) =>
      offered(runMission({ ...ref('student-cubesat', 'seed-3'), difficulty }, onlyTasks))
    expect(count('cadet')).toBe(count('flightDirector'))
  })

  it('is deterministic', () => {
    expect(runMission(ref('wildfire-eo', 'x'), onlyTasks)).toEqual(runMission(ref('wildfire-eo', 'x'), onlyTasks))
  })

  it('adding the tasks does not change which alarms ring', () => {
    const alarms = (g: GameData) => runMission(ref('wildfire-eo', 'alarm-seed'), g).log.filter((l) => l.kind === 'event')
    const withoutTasks = perfect({ ...gameData, events: gameData.events.filter((e) => !isTask(e)) })
    expect(alarms(perfect(gameData))).toEqual(alarms(withoutTasks))
    expect(alarms(withoutTasks).length).toBeGreaterThan(0)
  })
})

describe('doing, skipping and timing out a task', () => {
  const design = ref('student-cubesat', 'seed-1')

  it('doing a task gives its reward and logs it as done', () => {
    const state = firstTask(design, onlyTasks)
    const active = state.activeEvents.find((a) => isTask(a.event))!
    const doIt = active.event.options.find((o) => o.id !== 'skip')!
    const after = resolveEvent(state, active.event.id, doIt.id, design, onlyTasks)
    expect(after.activeEvents.some((a) => a.event.id === active.event.id)).toBe(false)
    expect(after.log.at(-1)).toMatchObject({ kind: 'info' })
    expect(after.log.at(-1)!.text.startsWith(TASK_LOG_DONE)).toBe(true)
    const gain = (doIt.effects.science ?? 0) > 0 || (doIt.effects.battery ?? 0) > 0 || (doIt.effects.risk ?? 0) < 0
    expect(gain).toBe(true)
    if (doIt.effects.science) expect(after.science).toBeCloseTo(state.science + doIt.effects.science, 5)
    if (doIt.effects.battery) expect(after.batteryWh).toBeGreaterThanOrEqual(state.batteryWh)
    if (doIt.effects.risk) expect(after.risk).toBeLessThanOrEqual(state.risk)
  })

  it('skipping a task changes nothing but the list and the log', () => {
    const state = firstTask(design, onlyTasks)
    const active = state.activeEvents.find((a) => isTask(a.event))!
    const after = resolveEvent(state, active.event.id, 'skip', design, onlyTasks)
    expect({ ...after, activeEvents: [], log: [] }).toEqual({ ...state, activeEvents: [], log: [] })
    expect(after.log.at(-1)!.text.startsWith(TASK_LOG_SKIPPED)).toBe(true)
  })

  it('a task that times out is skipped with no penalty, and never escalates', () => {
    // one task only, so nothing else changes the state. The telescope flies long enough (1825 ticks) for a 45 s task to run out.
    const design = ref('space-telescope', 'seed-1')
    const only: MissionEvent = { ...tasks[0]!, timerSec: 45, trigger: { chancePerDay: 100 } } // always offered (the chance is clamped to 1)
    const data = perfect({ ...gameData, events: [only] })
    let state = simulateTick(initSim(design, data), design, data)
    expect(state.activeEvents.map((a) => a.event.id)).toEqual([only.id])
    const deadline = state.activeEvents[0]!.deadlineTick
    const science = state.science
    while (state.status === 'running' && state.tick < deadline - 1) state = simulateTick(state, design, data)
    const lastBeforeTimeout = state
    expect(lastBeforeTimeout.activeEvents).toHaveLength(1)
    const after = simulateTick(state, design, data)
    // gone, replaced by the next offer (chance 1), and logged as skipped
    expect(after.log.some((l) => l.text.startsWith(TASK_LOG_SKIPPED))).toBe(true)
    expect(after.risk).toBe(0)
    expect(after.science).toBeGreaterThanOrEqual(science) // only the normal science of the days
    expect(after.log.some((l) => l.kind === 'warning')).toBe(false)
    expect(after.status).toBe('running')
  })

  it('a task offer lasts its timerSec in real seconds at 1x, not in slow alarm ticks', () => {
    const state = firstTask(design, onlyTasks)
    const active = state.activeEvents.find((a) => isTask(a.event))!
    expect(active.deadlineTick - active.startedTick).toBe(taskDeadlineTicks(active.event))
    expect(taskDeadlineTicks(active.event)).toBeGreaterThan(Math.ceil(active.event.timerSec / SECONDS_PER_TICK))
  })

  it('rewards are capped: the battery never exceeds its capacity and risk never goes below 0', () => {
    const state = firstTask(design, onlyTasks)
    const battery = tasks.find((t) => t.id === 'task-check-battery')!
    const full = { ...state, batteryWh: 1e9, risk: 0, activeEvents: [{ event: battery, startedTick: state.tick, deadlineTick: state.tick + 99 }] }
    const capacity = gameData.components.find((c) => c.id === design.componentIds.battery)!.capacityWh!
    expect(resolveEvent(full, battery.id, 'check-cells', design, onlyTasks).batteryWh).toBeLessThanOrEqual(capacity)
    const update = tasks.find((t) => t.id === 'task-software-update')!
    const safe = { ...full, activeEvents: [{ event: update, startedTick: state.tick, deadlineTick: state.tick + 99 }] }
    expect(resolveEvent(safe, update.id, 'install-update', design, onlyTasks).risk).toBe(0)
  })
})

describe('tasks and the collaboration score', () => {
  it('doing or skipping tasks never changes the collaboration score', () => {
    const design = ref('student-cubesat', 'seed-2')
    const data = calm
    const base = runMission(design, data)
    const withTasks = runMission(design, perfect({ ...gameData, events: [...data.events, ...tasks] }))
    expect(offered(withTasks)).toBeGreaterThan(0)
    expect(score(withTasks, design, gameData).breakdown.collaboration).toBe(score(base, design, gameData).breakdown.collaboration)
    expect(withTasks.log.filter((l) => l.kind === 'event')).toHaveLength(base.log.filter((l) => l.kind === 'event').length)
    expect(withTasks.log.some((l) => l.kind === 'decision' || l.kind === 'warning')).toBe(base.log.some((l) => l.kind === 'decision' || l.kind === 'warning'))
  })
})
