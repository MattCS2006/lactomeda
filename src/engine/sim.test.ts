import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gameData } from '../data'
import { REFERENCE_DESIGNS } from '../data/referenceDesigns'
import { SECONDS_PER_TICK } from './constants'
import { draw } from './rng'
import { eventChance, initSim, resolveEvent, runMission, simulateTick } from './sim'
import type { GameData, MissionDesign, MissionEvent } from './types'

const ev = (over: Partial<MissionEvent> & Pick<MissionEvent, 'id' | 'station'>): MissionEvent => ({
  title: `Event ${over.id}`,
  description: 'Test event.',
  timerSec: 10,
  options: [
    { id: 'fix', label: 'Fix it', why: 'Costs money.', effects: { budget: -0.01, science: 1 } },
    { id: 'ignore', label: 'Ignore it', why: 'Raises risk.', effects: { risk: 0.05 } },
  ],
  defaultOptionId: 'ignore',
  trigger: { chancePerDay: 0.1 },
  ...over,
})
const testEvents: MissionEvent[] = [
  ev({ id: 'battery-hot', station: 'power', trigger: { chancePerDay: 0.2, requiresSubsystem: 'battery' } }),
  ev({ id: 'radio-noise', station: 'comms', trigger: { chancePerDay: 0.15, mitigatedByTags: ['radHard'] } }),
  ev({ id: 'valve-stuck', station: 'engine', trigger: { chancePerDay: 0.1, requiresSubsystem: 'propulsion' } }),
]
const withEvents = (events: MissionEvent[]): GameData => ({ ...gameData, events })
const data = withEvents(testEvents)

const student = (over: Partial<MissionDesign> = {}): MissionDesign => ({
  ...REFERENCE_DESIGNS.find((d) => d.scenarioId === 'student-cubesat')!,
  difficulty: 'engineer',
  seed: 'alpha',
  ...over,
})
const logOf = (d: MissionDesign, g: GameData = data, decisions: Parameters<typeof runMission>[2] = []) => runMission(d, g, decisions).log

describe('deterministic simulation (FR-7.8)', () => {
  it('gives an identical final state and event log for the same design and seed', () => {
    const a = runMission(student(), data)
    const b = runMission(student(), data)
    expect(a.status).toBe('success')
    expect(a.log.filter((l) => l.kind === 'event').length).toBeGreaterThan(5)
    expect(b).toEqual(a)
    expect(b.log).toEqual(a.log)
  })

  it('gives an identical log with scripted decisions', () => {
    const decisions = [
      { tick: 5, eventId: 'battery-hot', optionId: 'fix' },
      { tick: 40, eventId: 'radio-noise', optionId: 'fix' },
    ]
    const a = runMission(student(), data, decisions)
    const b = runMission(student(), data, decisions)
    expect(b.log).toEqual(a.log)
    expect(b).toEqual(a)
  })

  it('gives a different log for a different seed', () => {
    const a = logOf(student({ seed: 'alpha' }))
    const b = logOf(student({ seed: 'gamma' }))
    expect(initSim(student({ seed: 'gamma' }), data).status).toBe('running')
    expect(b).not.toEqual(a)
  })

  it('can give a different log when the design changes with the same seed', () => {
    const base = student()
    const radHard = { ...base, componentIds: { ...base.componentIds, computer: 'obc-radhard' } } // radHard halves radio-noise
    expect(logOf(radHard)).not.toEqual(logOf(base))
  })

  it('records only simulation time in the log', () => {
    const state = runMission(student(), data)
    for (const entry of state.log) {
      expect(Number.isInteger(entry.tick)).toBe(true)
      expect(entry.day).toBe(entry.tick)
    }
  })

  it('counts draws in SimState.rng: one for the launch, then one per applicable event per tick', () => {
    let state = initSim(student(), data)
    expect(state.rng).toBe(1)
    state = simulateTick(state, student(), data)
    expect(state.rng).toBe(1 + 3) // three test events apply to the student CubeSat
    expect(draw('alpha', 0).counter).toBe(1)
  })
})

describe('initSim', () => {
  it('starts running with full battery, propellant, health and a launch log entry', () => {
    const state = initSim(student({ propellantKg: 0.5 }), data)
    expect(state).toMatchObject({ tick: 0, day: 0, status: 'running', batteryWh: 40, propellantKg: 0.5, activeEvents: [] })
    expect(state.health.battery).toBe(1)
    expect(state.health.comms).toBe(1)
    expect(state.log).toHaveLength(1)
    expect(state.log[0].text).toContain('Launch successful')
  })

  it('fails the launch right away when the launcher reliability is 0', () => {
    const broken: GameData = { ...data, launchers: data.launchers.map((l) => ({ ...l, reliability: 0 })) }
    const state = initSim(student(), broken)
    expect(state).toMatchObject({ status: 'failed', endReason: 'launchFailure', day: 0 })
    expect(runMission(student(), broken).endReason).toBe('launchFailure')
    expect(simulateTick(state, student(), broken)).toBe(state)
  })

  it('never fails the launch when the reliability is 1', () => {
    const perfect: GameData = { ...data, launchers: data.launchers.map((l) => ({ ...l, reliability: 1 })) }
    for (const seed of ['a', 'b', 'c', 'd', 'e']) expect(initSim(student({ seed }), perfect).status).toBe('running')
  })
})

describe('simulateTick', () => {
  it('ends with lifetimeReached after durationDays ticks for a design with no events', () => {
    for (const d of REFERENCE_DESIGNS) {
      const design = { ...d, seed: 'reference' }
      const days = gameData.scenarios.find((s) => s.id === d.scenarioId)!.durationDays
      const state = runMission(design, gameData)
      expect(initSim(design, gameData).status, `${d.scenarioId} launch`).toBe('running')
      expect(state).toMatchObject({ status: 'success', endReason: 'lifetimeReached', day: days, tick: days })
      expect(state.science).toBeGreaterThan(0)
      expect(state.downlinkedDataMb).toBeGreaterThan(0)
    }
  })

  it('stops with budgetExhausted when the spending passes the scenario budget', () => {
    const tight: GameData = { ...gameData, scenarios: gameData.scenarios.map((s) => ({ ...s, budgetM: 0.1 })) }
    expect(runMission(student(), tight)).toMatchObject({ status: 'failed', endReason: 'budgetExhausted' })
  })

  it('stops with criticalFailure when a subsystem health reaches 0', () => {
    const state = initSim(student(), gameData)
    const broken = simulateTick({ ...state, health: { ...state.health, power: 0 } }, student(), gameData)
    expect(broken).toMatchObject({ status: 'failed', endReason: 'criticalFailure' })
  })

  it('returns a finished mission unchanged', () => {
    const done = runMission(student(), gameData)
    expect(simulateTick(done, student(), gameData)).toBe(done)
  })

  it('times out an ignored event and applies its default option', () => {
    const only = withEvents([ev({ id: 'ignored', station: 'power', timerSec: 2 * SECONDS_PER_TICK, trigger: { chancePerDay: 1 } })])
    const design = student()
    let state = simulateTick(initSim(design, only), design, only) // tick 1: raised, deadline tick 3
    expect(state.activeEvents.map((a) => a.event.id)).toEqual(['ignored'])
    expect(state.activeEvents[0]).toMatchObject({ startedTick: 1, deadlineTick: 3 })
    expect(state.risk).toBe(0)
    state = simulateTick(state, design, only) // tick 2: still waiting
    expect(state.risk).toBe(0)
    state = simulateTick(state, design, only) // tick 3: timed out
    expect(state.risk).toBeCloseTo(0.05, 12)
    expect(state.log.some((l) => l.kind === 'warning' && l.text.includes('timed out'))).toBe(true)
  })

  it('reduces the downlinked data to what the link allows and caps storage', () => {
    const design = student({ componentIds: { ...student().componentIds, comms: 'com-uhf' } }) // 28.8 Mb/day downlink
    const state = simulateTick(initSim(design, gameData), design, gameData)
    expect(state.downlinkedDataMb).toBeCloseTo(28.8, 9)
    expect(state.storedDataMb).toBeCloseTo(2050 - 28.8, 9)
    let later = state
    for (let i = 0; i < 10; i++) later = simulateTick(later, design, gameData)
    expect(later.storedDataMb).toBeLessThanOrEqual(8000)
  })
})

describe('eventChance', () => {
  it('scales with difficulty and halves when a mitigating tag is present', () => {
    const radio = testEvents[1]
    const base = student()
    expect(eventChance(radio, { ...base, difficulty: 'cadet' }, data)).toBeCloseTo(0.15 * 0.5, 12)
    expect(eventChance(radio, { ...base, difficulty: 'engineer' }, data)).toBeCloseTo(0.15, 12)
    expect(eventChance(radio, { ...base, difficulty: 'flightDirector' }, data)).toBeCloseTo(0.15 * 1.5, 12)
    const radHard = { ...base, componentIds: { ...base.componentIds, computer: 'obc-radhard' } }
    expect(eventChance(radio, radHard, data)).toBeCloseTo(0.15 / 2, 12)
  })

  it('halves the chance for a redundant:<subsystem> tag', () => {
    const attitude = ev({ id: 'wheel', station: 'engine', trigger: { chancePerDay: 0.2, mitigatedByTags: ['redundant:attitude'] } })
    expect(eventChance(attitude, student(), data)).toBeCloseTo(0.2, 12)
    expect(eventChance(attitude, student({ redundant: ['attitude'] }), data)).toBeCloseTo(0.1, 12)
  })

  it('is 0 when the required subsystem is not installed', () => {
    const d = student()
    const componentIds = { ...d.componentIds }
    delete componentIds.propulsion
    expect(eventChance(testEvents[2], { ...d, componentIds }, data)).toBe(0)
    expect(eventChance(testEvents[2], d, data)).toBeGreaterThan(0)
  })
})

describe('resolveEvent', () => {
  const raised = () => {
    const only = withEvents([ev({ id: 'e', station: 'power', timerSec: 100, trigger: { chancePerDay: 1 } })])
    const design = student()
    return { only, design, state: simulateTick(initSim(design, only), design, only) }
  }

  it('applies the option effects, removes the event and logs the decision', () => {
    const { only, design, state } = raised()
    const next = resolveEvent(state, 'e', 'fix', design, only)
    expect(next.activeEvents).toEqual([])
    expect(next.science).toBeCloseTo(state.science + 1, 12)
    expect(next.spentM).toBeCloseTo(state.spentM + 0.01, 12)
    expect(next.log.at(-1)).toMatchObject({ kind: 'decision' })
  })

  it('scales negative effects by the mini-game score and leaves positive ones alone', () => {
    const { only, design, state } = raised()
    const full = resolveEvent(state, 'e', 'fix', design, only, 1)
    const half = resolveEvent(state, 'e', 'fix', design, only, 0.5)
    expect(half.spentM - state.spentM).toBeCloseTo((full.spentM - state.spentM) / 2, 12)
    expect(half.science).toBe(full.science)
  })

  it('returns the state with a warning, without throwing, for an unknown event or option', () => {
    const { only, design, state } = raised()
    const noEvent = resolveEvent(state, 'nope', 'fix', design, only)
    expect(noEvent.activeEvents).toEqual(state.activeEvents)
    expect(noEvent.log.at(-1)).toMatchObject({ kind: 'warning' })
    const noOption = resolveEvent(state, 'e', 'nope', design, only)
    expect(noOption.activeEvents).toEqual(state.activeEvents)
    expect(noOption.log.at(-1)).toMatchObject({ kind: 'warning' })
  })
})

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const design = student()
    const init = initSim(design, data)
    let state = init
    for (let i = 0; i < 30; i++) state = simulateTick(state, design, data)
    const stateSnap = JSON.stringify(state)
    const designSnap = JSON.stringify(design)
    const dataSnap = JSON.stringify(data)
    simulateTick(state, design, data)
    if (state.activeEvents.length > 0) resolveEvent(state, state.activeEvents[0].event.id, 'fix', design, data)
    resolveEvent(state, 'nope', 'fix', design, data)
    expect(JSON.stringify(state)).toBe(stateSnap)
    expect(JSON.stringify(design)).toBe(designSnap)
    expect(JSON.stringify(data)).toBe(dataSnap)
    expect(init.log).toHaveLength(1)
  })
})

describe('static guard', () => {
  const FORBIDDEN = ['Math' + '.random', 'Date' + '.now', 'new ' + 'Date(', 'performance' + '.now']
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return sources(path)
      return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
    })

  it('keeps wall-clock time and unseeded randomness out of src/engine', () => {
    const files = sources(__dirname)
    expect(files.length).toBeGreaterThan(10)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const word of FORBIDDEN) expect(text.includes(word), `${file} uses ${word}`).toBe(false)
    }
  })
})
