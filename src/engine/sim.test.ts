import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gameData } from '../data'
import { REFERENCE_DESIGNS } from '../data/referenceDesigns'
import { REFERENCE_MISSION_DAYS, SECONDS_PER_TICK } from './constants'
import { draw } from './rng'
import { availableOptions } from './rules/redundancy'
import { eventChance, initSim, resolveEvent, runMission, simulateTick } from './sim'
import type { GameData, MissionDesign, MissionEvent, SimState, Subsystem } from './types'

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
/**
 * A copy of the catalog where every component is perfect (reliability 1). FR-3.5 adds daily failure rolls, so a test that
 * expects a whole mission with no failures runs on this copy.
 */
const perfect = (g: GameData): GameData => ({ ...g, components: g.components.map((c) => ({ ...c, reliability: 1 })) })
const flawless = perfect(gameData)
const withEvents = (events: MissionEvent[]): GameData => perfect({ ...gameData, events })
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
      const days = flawless.scenarios.find((s) => s.id === d.scenarioId)!.durationDays
      const state = runMission(design, flawless)
      expect(initSim(design, flawless).status, `${d.scenarioId} launch`).toBe('running')
      expect(state).toMatchObject({ status: 'success', endReason: 'lifetimeReached', day: days, tick: days })
      expect(state.science).toBeGreaterThan(0)
      expect(state.downlinkedDataMb).toBeGreaterThan(0)
    }
  })

  it('stops with budgetExhausted when the spending passes the scenario budget', () => {
    const tight: GameData = { ...flawless, scenarios: flawless.scenarios.map((s) => ({ ...s, budgetM: 0.1 })) }
    expect(runMission(student(), tight)).toMatchObject({ status: 'failed', endReason: 'budgetExhausted' })
  })

  it('returns a finished mission unchanged', () => {
    const done = runMission(student(), flawless)
    expect(simulateTick(done, student(), flawless)).toBe(done)
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
    const state = simulateTick(initSim(design, flawless), design, flawless)
    expect(state.downlinkedDataMb).toBeCloseTo(28.8, 9)
    expect(state.storedDataMb).toBeCloseTo(2050 - 28.8, 9)
    let later = state
    for (let i = 0; i < 10; i++) later = simulateTick(later, design, flawless)
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

// ─── FR-3.5 redundancy and repairable failures ──────────────────────────

describe('failures and redundancy (FR-3.5)', () => {
  const failureEvents = gameData.events.filter((e) => e.id.startsWith('failure-'))
  const FAILURE_TICKS = Math.ceil(60 / SECONDS_PER_TICK) // the failure alarm timer

  /** Perfect catalog and launchers, no random events, and one component with the given reliability. */
  const fixture = (subsystem: Subsystem, reliability: number): GameData => {
    const id = student().componentIds[subsystem]!
    const base = perfect({ ...gameData, events: failureEvents })
    return {
      ...base,
      components: base.components.map((c) => (c.id === id ? { ...c, reliability } : c)),
      launchers: base.launchers.map((l) => ({ ...l, reliability: 1 })),
    }
  }
  const ticks = (state: SimState, design: MissionDesign, g: GameData, n: number): SimState => {
    let next = state
    for (let i = 0; i < n; i++) next = simulateTick(next, design, g)
    return next
  }
  const failed = (subsystem: Subsystem) => (state: SimState) => state.activeEvents.some((a) => a.event.id === `failure-${subsystem}`)

  it('is reflected in the failure odds: a backup cuts critical failures by at least half (200 fixed seeds, all alarms ignored)', { timeout: 60000 }, () => {
    const g = fixture('comms', 0.5)
    const seeds = Array.from({ length: 200 }, (_, i) => `seed-${i}`)
    const critical = (redundant: Subsystem[]): number =>
      seeds.filter((seed) => runMission(student({ seed, redundant }), g).endReason === 'criticalFailure').length
    const without = critical([])
    const withBackup = critical(['comms'])
    console.info(`critical failures out of 200: ${without} without redundancy, ${withBackup} with a comms backup`)
    expect(without).toBeGreaterThan(40)
    expect(withBackup).toBeLessThanOrEqual(without / 2)
    expect(withBackup).toBeLessThan(without)
  })

  it('never ends the mission on the tick a critical subsystem fails: the alarm rings and the mission keeps running', () => {
    const g = fixture('comms', 0) // fails on the first roll
    const design = student()
    const state = simulateTick(initSim(design, g), design, g)
    expect(state.status).toBe('running')
    expect(state.endReason).toBeUndefined()
    expect(state.health.comms).toBe(0)
    expect(state.activeEvents.map((a) => a.event.id)).toEqual(['failure-comms'])
    expect(state.activeEvents[0]).toMatchObject({ startedTick: 1, deadlineTick: 1 + FAILURE_TICKS })
    expect(state.log.map((l) => l.kind)).toEqual(['info', 'failure', 'event'])
  })

  it('does not roll for structure, for a part that never fails, or for a subsystem that is already offline', () => {
    const g = fixture('comms', 1)
    const design = student()
    let state = initSim(design, g)
    state = simulateTick(state, design, g)
    expect(state.rng).toBe(1) // only the launch draw: nothing can fail
    const flaky = fixture('thermal', 0)
    const d = student()
    state = ticks(initSim(d, flaky), d, flaky, 2)
    expect(state.rng).toBe(2) // one draw for the thermal roll on tick 1; it is offline on tick 2
  })

  it('repair restores 0.5 + 0.5 x the mini-game score of health and the mission continues', () => {
    const g = fixture('comms', 0)
    const design = student()
    const raised = simulateTick(initSim(design, g), design, g)
    const full = resolveEvent(raised, 'failure-comms', 'repair', design, g, 1)
    expect(full.health.comms).toBe(1)
    expect(full.activeEvents).toEqual([])
    expect(full.status).toBe('running')
    expect(full.risk).toBeCloseTo(0.02, 12)
    expect(resolveEvent(raised, 'failure-comms', 'repair', design, g, 0.4).health.comms).toBeCloseTo(0.7, 12)
    expect(resolveEvent(raised, 'failure-comms', 'repair', design, g, 0).health.comms).toBeCloseTo(0.5, 12)
    expect(full.log.at(-1)).toMatchObject({ kind: 'decision' })
  })

  it('backup on a redundant subsystem restores health 1 and is used up: a second failure no longer offers it', () => {
    const g = fixture('comms', 0)
    const design = student({ redundant: ['comms'] })
    const event = failureEvents.find((e) => e.id === 'failure-comms')!
    let state = simulateTick(initSim(design, g), design, g)
    expect(availableOptions(event, design, g, state).map((o) => o.id)).toContain('backup')
    state = resolveEvent(state, 'failure-comms', 'backup', design, g)
    expect(state.health.comms).toBe(1)
    expect(state.backupsUsed).toEqual(['comms'])
    expect(state.activeEvents).toEqual([])

    state = simulateTick(state, design, g) // the part fails again
    expect(failed('comms')(state)).toBe(true)
    expect(availableOptions(event, design, g, state).map((o) => o.id)).not.toContain('backup')
    const refused = resolveEvent(state, 'failure-comms', 'backup', design, g)
    expect(refused.health.comms).toBe(0)
    expect(refused.backupsUsed).toEqual(['comms'])
    expect(refused.activeEvents).toHaveLength(1)
    expect(refused.log.at(-1)).toMatchObject({ kind: 'warning' })
  })

  it('refuses the backup option when the subsystem is not redundant', () => {
    const g = fixture('comms', 0)
    const design = student()
    const state = simulateTick(initSim(design, g), design, g)
    const refused = resolveEvent(state, 'failure-comms', 'backup', design, g)
    expect(refused.health.comms).toBe(0)
    expect(refused.backupsUsed).toEqual([])
    expect(refused.activeEvents).toHaveLength(1)
  })

  it('switches to the backup automatically when an alarm on a redundant subsystem is ignored', () => {
    const g = fixture('comms', 0)
    const design = student({ redundant: ['comms'] })
    let state = simulateTick(initSim(design, g), design, g) // tick 1: fails
    state = ticks(state, design, g, FAILURE_TICKS - 1) // the tick before the deadline
    expect(state.status).toBe('running')
    expect(state.backupsUsed).toEqual([])
    state = simulateTick(state, design, g) // the deadline
    expect(state.status).toBe('running')
    expect(state.backupsUsed).toEqual(['comms'])
    expect(state.log.some((l) => l.kind === 'warning' && l.text.includes('backup') && l.text.includes('automatically'))).toBe(true)
    // the part (reliability 0) fails again, and now there is no backup left
    expect(failed('comms')(state)).toBe(true)
    state = ticks(state, design, g, FAILURE_TICKS)
    expect(state).toMatchObject({ status: 'failed', endReason: 'criticalFailure' })
  })

  it('ends the mission with criticalFailure only when the alarm on a critical subsystem times out', () => {
    const g = fixture('comms', 0)
    const design = student()
    let state = simulateTick(initSim(design, g), design, g)
    state = ticks(state, design, g, FAILURE_TICKS - 1)
    expect(state.status).toBe('running')
    state = simulateTick(state, design, g)
    expect(state).toMatchObject({ status: 'failed', endReason: 'criticalFailure', tick: 1 + FAILURE_TICKS })
    expect(state.log.at(-1)).toMatchObject({ kind: 'failure' })
  })

  it('leaves a non-critical subsystem offline when its alarm is ignored, and the mission continues', () => {
    const g = fixture('thermal', 0)
    const design = student()
    let state = simulateTick(initSim(design, g), design, g)
    expect(failed('thermal')(state)).toBe(true)
    state = ticks(state, design, g, FAILURE_TICKS)
    expect(state.status).toBe('running')
    expect(state.health.thermal).toBe(0)
    expect(state.activeEvents).toEqual([])
    const end = runMission(design, g)
    expect(end).toMatchObject({ status: 'success', endReason: 'lifetimeReached' })
    expect(end.health.thermal).toBe(0)
  })

  it('safe mode gives health 0.4 and costs 5 science', () => {
    const g = fixture('comms', 0)
    const design = student()
    const raised = { ...simulateTick(initSim(design, g), design, g) }
    const state = resolveEvent({ ...raised, science: 12 }, 'failure-comms', 'safeMode', design, g)
    expect(state.health.comms).toBeCloseTo(0.4, 12)
    expect(state.science).toBeCloseTo(7, 12)
    expect(state.status).toBe('running')
    expect(state.activeEvents).toEqual([])
  })

  it('leaving it offline on purpose keeps the health at 0', () => {
    const g = fixture('thermal', 0)
    const design = student()
    const state = resolveEvent(simulateTick(initSim(design, g), design, g), 'failure-thermal', 'abandon', design, g)
    expect(state.health.thermal).toBe(0)
    expect(state.activeEvents).toEqual([])
    expect(state.status).toBe('running')
  })

  it('applies a health effect from another event and raises the failure alarm when it reaches 0', () => {
    const storm = ev({
      id: 'storm',
      station: 'computer',
      timerSec: 100,
      options: [{ id: 'hit', label: 'Take the hit', why: 'It damages the computer.', effects: { health: -1 } }],
      defaultOptionId: 'hit',
      trigger: { chancePerDay: 1, requiresSubsystem: 'computer' },
    })
    const g = { ...fixture('comms', 1), events: [...failureEvents, storm] }
    const design = student()
    let state = simulateTick(initSim(design, g), design, g)
    expect(state.activeEvents.map((a) => a.event.id)).toEqual(['storm'])
    state = resolveEvent(state, 'storm', 'hit', design, g)
    expect(state.health.computer).toBe(0)
    expect(state.status).toBe('running')
    expect(state.activeEvents.map((a) => a.event.id)).toContain('failure-computer')
  })

  it('stops halving mitigated event odds once the backup has been used', () => {
    const wheel = ev({ id: 'wheel', station: 'engine', trigger: { chancePerDay: 0.2, mitigatedByTags: ['redundant:attitude'] } })
    const design = student({ redundant: ['attitude'] })
    expect(eventChance(wheel, design, gameData)).toBeCloseTo(0.1, 12)
    expect(eventChance(wheel, design, gameData, { backupsUsed: ['attitude'] })).toBeCloseTo(0.2, 12)
  })

  it('gives the same log for the same design, seed and scripted decisions', () => {
    const g = fixture('comms', 0.01)
    const design = student({ seed: 'alpha', redundant: ['comms'] })
    const decisions = [{ tick: 5, eventId: 'failure-comms', optionId: 'repair' }]
    const a = runMission(design, g, decisions)
    const b = runMission(design, g, decisions)
    expect(a.log.some((l) => l.kind === 'failure')).toBe(true)
    expect(b.log).toEqual(a.log)
    expect(b).toEqual(a)
  })

  it('does not mutate its inputs', () => {
    const g = fixture('comms', 0)
    const design = student({ redundant: ['comms'] })
    const raised = simulateTick(initSim(design, g), design, g)
    const snaps = [JSON.stringify(raised), JSON.stringify(design), JSON.stringify(g)]
    resolveEvent(raised, 'failure-comms', 'backup', design, g)
    resolveEvent(raised, 'failure-comms', 'repair', design, g, 0.5)
    ticks(raised, design, g, FAILURE_TICKS + 2)
    expect([JSON.stringify(raised), JSON.stringify(design), JSON.stringify(g)]).toEqual(snaps)
  })
})

describe('FR-7.4 effect conventions', () => {
  const design = (): MissionDesign => student({ propellantKg: 0.5 })
  /** A running state with known amounts, and one active alarm whose only option has these effects. */
  const resolveWith = (effects: NonNullable<MissionEvent['options'][number]['effects']>, patch: Partial<SimState> = {}, score = 1) => {
    const event = ev({
      id: 'convention',
      station: 'power',
      options: [{ id: 'go', label: 'Go', why: 'Test.', effects }],
      defaultOptionId: 'go',
      trigger: { chancePerDay: 0 },
    })
    const base = initSim(design(), data)
    const state: SimState = {
      ...base,
      batteryWh: 40,
      propellantKg: 0.5,
      storedDataMb: 1000,
      spentM: 1,
      science: 10,
      risk: 0.2,
      ...patch,
      activeEvents: [{ event, startedTick: 0, deadlineTick: 5 }],
    }
    return { before: state, after: resolveEvent(state, 'convention', 'go', design(), data, score) }
  }

  it('budget is M USD: a negative value is money spent', () => {
    const { before, after } = resolveWith({ budget: -1 })
    expect(after.spentM).toBeCloseTo(before.spentM + 1, 12)
  })

  it('science and risk are absolute, and risk stays between 0 and 1', () => {
    const a = resolveWith({ science: -3, risk: 0.1 })
    expect(a.after.science).toBeCloseTo(7, 12)
    expect(a.after.risk).toBeCloseTo(0.3, 12)
    expect(resolveWith({ science: -50 }).after.science).toBe(0)
    expect(resolveWith({ risk: 0.9 }).after.risk).toBe(1)
    expect(resolveWith({ science: 20 }).after.science).toBeCloseTo(30, 12)
  })

  it('propellant, data and battery are fractions of the current amount', () => {
    expect(resolveWith({ propellant: -0.08 }).after.propellantKg).toBeCloseTo(0.5 * 0.92, 12)
    expect(resolveWith({ propellant: -0.08 }, { propellantKg: 80 }).after.propellantKg).toBeCloseTo(80 * 0.92, 12)
    expect(resolveWith({ data: -0.3 }).after.storedDataMb).toBeCloseTo(700, 12)
    expect(resolveWith({ data: -0.3 }, { storedDataMb: 50 }).after.storedDataMb).toBeCloseTo(35, 12)
    expect(resolveWith({ battery: -0.25 }).after.batteryWh).toBeCloseTo(30, 12)
    expect(resolveWith({ battery: -0.25 }, { batteryWh: 20 }).after.batteryWh).toBeCloseTo(15, 12)
  })

  it('fractions never go below 0, and the battery never goes above its capacity', () => {
    expect(resolveWith({ propellant: -2 }).after.propellantKg).toBe(0)
    expect(resolveWith({ data: -1 }).after.storedDataMb).toBe(0)
    expect(resolveWith({ battery: 5 }).after.batteryWh).toBe(40)
  })

  it('negative effects are scaled by the mini-game score, positive ones are not', () => {
    const half = resolveWith({ budget: -2, propellant: -0.1, science: 4 }, {}, 0.5)
    expect(half.after.spentM).toBeCloseTo(half.before.spentM + 1, 12)
    expect(half.after.propellantKg).toBeCloseTo(0.5 * 0.95, 12)
    expect(half.after.science).toBeCloseTo(14, 12)
  })
})

describe('FR-7.4 rate scaling by mission length', () => {
  const event = ev({ id: 'rate', station: 'power', trigger: { chancePerDay: 0.01 } })
  const chance = (scenarioId: string, difficulty: MissionDesign['difficulty'] = 'engineer') => {
    const d = REFERENCE_DESIGNS.find((x) => x.scenarioId === scenarioId)!
    return eventChance(event, { ...d, difficulty }, data)
  }
  const days = (id: string) => gameData.scenarios.find((s) => s.id === id)!.durationDays

  it('multiplies the chance by 365 / durationDays', () => {
    expect(REFERENCE_MISSION_DAYS).toBe(365)
    expect(chance('student-cubesat')).toBeCloseTo(0.01, 12) // 365 days: unchanged
    expect(chance('wildfire-eo')).toBeCloseTo(0.01 * (365 / days('wildfire-eo')), 12)
    expect(chance('space-telescope')).toBeCloseTo(0.01 * (365 / days('space-telescope')), 12)
  })

  it('gives every scenario the same expected number of alarms (chance x days)', () => {
    const expected = (id: string) => chance(id) * days(id)
    expect(expected('wildfire-eo')).toBeCloseTo(expected('student-cubesat'), 9)
    expect(expected('space-telescope')).toBeCloseTo(expected('student-cubesat'), 9)
  })

  it('stacks with the difficulty factor', () => {
    expect(chance('wildfire-eo', 'cadet')).toBeCloseTo(chance('wildfire-eo') * 0.5, 12)
    expect(chance('wildfire-eo', 'flightDirector')).toBeCloseTo(chance('wildfire-eo') * 1.5, 12)
  })
})
