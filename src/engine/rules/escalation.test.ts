import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { CRITICAL_SUBSYSTEMS } from '../constants'
import { initSim, resolveEvent, runMission, simulateTick } from '../sim'
import type { GameData, MissionDesign, MissionEvent, SimState, Subsystem } from '../types'
import { DEFAULT_ONLY_EVENT_IDS, escalationChain, escalationRule } from './escalation'
import { availableOptions } from './redundancy'

const perfect = (g: GameData): GameData => ({ ...g, components: g.components.map((c) => ({ ...c, reliability: 1 })) })
const student = (over: Partial<MissionDesign> = {}): MissionDesign => ({
  ...REFERENCE_DESIGNS.find((d) => d.scenarioId === 'student-cubesat')!,
  difficulty: 'engineer',
  seed: 'alpha',
  ...over,
})
const byId = (id: string): MissionEvent => gameData.events.find((e) => e.id === id)!
/** A running state with this alarm ringing and one tick left on its timer. */
const ringing = (event: MissionEvent, data: GameData, design = student()): SimState => {
  const base = initSim(design, data)
  return { ...base, activeEvents: [{ event, startedTick: base.tick, deadlineTick: base.tick + 1 }] }
}
/** The same catalog with every event quiet (chance 0) and perfect parts, so only escalation can start an alarm. */
const quiet = (g: GameData): GameData =>
  perfect({ ...g, events: g.events.map((e) => ({ ...e, trigger: { ...e.trigger, chancePerDay: 0 } })) })

describe('every event has an escalation rule (FR-13.4 acceptance)', () => {
  it('escalates to an existing event, ends the mission, or is explicitly default-only', () => {
    expect(gameData.events.length).toBeGreaterThan(20)
    for (const event of gameData.events) {
      const rule = escalationRule(event, gameData)
      expect(rule, `${event.id} has no escalation rule`).not.toBeNull()
      if (rule!.kind === 'escalatesTo')
        expect(
          gameData.events.some((e) => e.id === rule!.eventId),
          event.id,
        ).toBe(true)
    }
  })

  it('lists no event in DEFAULT_ONLY_EVENT_IDS that does not exist, or that also escalates', () => {
    for (const id of DEFAULT_ONLY_EVENT_IDS) {
      const event = byId(id)
      expect(event, id).toBeDefined()
      expect(event.escalateTo, id).toBeUndefined()
    }
    expect(new Set(DEFAULT_ONLY_EVENT_IDS).size).toBe(DEFAULT_ONLY_EVENT_IDS.length)
  })

  it('has no escalation loops, and a chain is at most 3 events', () => {
    for (const event of gameData.events) {
      const chain = escalationChain(event, gameData)
      expect(new Set([event.id, ...chain.map((e) => e.id)]).size, event.id).toBe(chain.length + 1)
      expect(chain.length, event.id).toBeLessThanOrEqual(3)
      // following escalateTo by hand ends too
      const seen = new Set<string>()
      for (let e: MissionEvent | undefined = event; e; e = e.escalateTo ? byId(e.escalateTo) : undefined) {
        expect(seen.has(e.id), `loop at ${e.id}`).toBe(false)
        seen.add(e.id)
      }
    }
  })

  it('escalation targets only appear through escalation (chance 0) and are complete events like the others', () => {
    for (const event of gameData.events) {
      if (event.escalateTo === undefined) continue
      const worse = byId(event.escalateTo)
      expect(worse.trigger.chancePerDay, worse.id).toBe(0)
      expect(worse.title.length).toBeGreaterThan(0)
      expect(worse.description.length).toBeGreaterThan(0)
      expect(worse.timerSec).toBeGreaterThanOrEqual(30)
      expect(worse.timerSec).toBeLessThanOrEqual(60)
      expect(worse.options.length).toBeGreaterThanOrEqual(2)
      expect(worse.options.length).toBeLessThanOrEqual(3)
      for (const o of worse.options) expect(o.why.length, `${worse.id}/${o.id}`).toBeGreaterThan(0)
      expect(worse.options.map((o) => o.id)).toContain(worse.defaultOptionId)
      expect(worse.options.some((o) => o.requiresTag === undefined)).toBe(true)
    }
  })

  it('a critical failure alarm ends the mission, and the other failure alarms escalate', () => {
    for (const subsystem of ['power', 'battery', 'computer', 'attitude', 'comms'] as Subsystem[]) {
      expect(CRITICAL_SUBSYSTEMS).toContain(subsystem)
      expect(escalationRule(byId(`failure-${subsystem}`), gameData)).toEqual({ kind: 'endsMission' })
    }
    expect(escalationRule(byId('failure-propulsion'), gameData)).toEqual({
      kind: 'escalatesTo',
      eventId: 'propellant-venting',
    })
    expect(escalationRule(byId('failure-thermal'), gameData)).toEqual({
      kind: 'escalatesTo',
      eventId: 'heat-spreading',
    })
  })

  it('a rule that points to a missing event is not a rule', () => {
    expect(escalationRule({ ...byId('software-bug'), escalateTo: 'nope' }, gameData)).toBeNull()
  })
})

describe('ignoring an alarm', () => {
  const chains: [string, string][] = [
    ['battery-cell-failing', 'battery-running-flat'],
    ['ground-station-outage', 'contact-lost'],
    ['instrument-overheating', 'instrument-burnout'],
    ['debris-collision', 'hull-damage'],
    ['solar-storm-bitflip', 'computer-crash'],
  ]

  it.each(chains)('%s ignored raises %s as a new alarm with its own deadline', (id, worseId) => {
    const data = quiet(gameData)
    const before = ringing(byId(id), data)
    const after = simulateTick(before, student(), data)
    expect(after.activeEvents.map((a) => a.event.id)).toEqual([worseId])
    const worse = byId(worseId)
    expect(after.activeEvents[0]).toMatchObject({
      startedTick: after.tick,
      deadlineTick: after.tick + Math.ceil(worse.timerSec / 2),
    })
    // the default option of the ignored alarm was applied first, then the log says it got worse
    const text = after.log.map((l) => l.text)
    expect(text.some((t) => t.includes('was applied automatically'))).toBe(true)
    expect(text.some((t) => t.includes('was ignored and got worse') && t.includes(worse.title))).toBe(true)
  })

  it.each(chains)('%s answered in time does not raise %s', (id, worseId) => {
    const data = quiet(gameData)
    const design = student()
    const before = ringing(byId(id), data, design)
    const option = availableOptions(byId(id), design, data)[0]!
    const answered = resolveEvent(before, id, option.id, design, data)
    expect(answered.activeEvents).toEqual([])
    const later = simulateTick(answered, design, data)
    expect(later.activeEvents).toEqual([])
    expect(later.log.some((l) => l.text.includes(byId(worseId).title))).toBe(false)
  })

  it('the worse event is the end of the chain: ignoring it raises nothing more', () => {
    const data = quiet(gameData)
    const design = student()
    let state = simulateTick(ringing(byId('debris-collision'), data, design), design, data)
    expect(state.activeEvents[0]!.event.id).toBe('hull-damage')
    state = { ...state, activeEvents: state.activeEvents.map((a) => ({ ...a, deadlineTick: state.tick + 1 })) }
    state = simulateTick(state, design, data)
    expect(state.activeEvents).toEqual([])
    expect(state.status).toBe('running')
  })

  it('does not raise the worse event twice if it is already ringing', () => {
    const data = quiet(gameData)
    const design = student()
    const base = ringing(byId('debris-collision'), data, design)
    const worse = byId('hull-damage')
    const both: SimState = {
      ...base,
      activeEvents: [...base.activeEvents, { event: worse, startedTick: 0, deadlineTick: 99 }],
    }
    const after = simulateTick(both, design, data)
    expect(after.activeEvents.filter((a) => a.event.id === 'hull-damage')).toHaveLength(1)
  })

  it('applies the default effects of the worse event too, when that one is ignored', () => {
    const data = quiet(gameData)
    const design = student()
    let state = simulateTick(ringing(byId('ground-station-outage'), data, design), design, data)
    expect(state.activeEvents[0]!.event.id).toBe('contact-lost')
    state = {
      ...state,
      storedDataMb: 1000,
      activeEvents: state.activeEvents.map((a) => ({ ...a, deadlineTick: state.tick + 1 })),
    }
    const after = simulateTick(state, design, data)
    expect(after.storedDataMb).toBeLessThan(600) // wait-for-pass: half of the stored data is gone
  })
})

describe('failure alarms that escalate', () => {
  const data = quiet(gameData)
  const design = (over: Partial<MissionDesign> = {}) =>
    student({
      componentIds: { ...student().componentIds, propulsion: 'prop-coldgas', thermal: 'thm-passive' },
      ...over,
    })
  const failed = (subsystem: Subsystem, d: MissionDesign): SimState => {
    const base = initSim(d, data)
    const event = byId(`failure-${subsystem}`)
    return {
      ...base,
      health: { ...base.health, [subsystem]: 0 },
      activeEvents: [{ event, startedTick: 0, deadlineTick: 1 }],
    }
  }

  it('an ignored propulsion failure leaves it offline and raises propellant venting', () => {
    const d = design()
    const after = simulateTick(failed('propulsion', d), d, data)
    expect(after.health.propulsion).toBe(0)
    expect(after.activeEvents.map((a) => a.event.id)).toEqual(['propellant-venting'])
    expect(after.status).toBe('running')
  })

  it('an ignored thermal failure raises heat spreading', () => {
    const d = design()
    expect(simulateTick(failed('thermal', d), d, data).activeEvents.map((a) => a.event.id)).toEqual(['heat-spreading'])
  })

  it('a backup that takes over fixes the problem, so there is no escalation', () => {
    const d = design({ redundant: ['propulsion'] })
    const after = simulateTick(failed('propulsion', d), d, data)
    expect(after.health.propulsion).toBe(1)
    expect(after.activeEvents).toEqual([])
  })

  it('an ignored critical failure still ends the mission, with no escalation event', () => {
    for (const subsystem of ['power', 'battery', 'computer', 'attitude', 'comms'] as Subsystem[]) {
      const d = design()
      const after = simulateTick(failed(subsystem, d), d, data)
      expect(after, subsystem).toMatchObject({ status: 'failed', endReason: 'criticalFailure' })
      expect(after.activeEvents, subsystem).toEqual([])
    }
  })
})

describe('determinism and purity', () => {
  it('gives the same log and state with escalation for the same design and seed, and another log for another seed', () => {
    // four times the chances, so alarms are often ignored and escalate
    const events = gameData.events.map((e) => ({
      ...e,
      trigger: { ...e.trigger, chancePerDay: e.trigger.chancePerDay * 4 },
    }))
    const data = perfect({ ...gameData, events })
    const design = student({ seed: 'esc-1' })
    const a = runMission(design, data)
    const b = runMission(design, data)
    expect(a.log.some((l) => l.text.includes('was ignored and got worse'))).toBe(true)
    expect(b.log).toEqual(a.log)
    expect(b).toEqual(a)
    expect(runMission({ ...design, seed: 'esc-2' }, data).log).not.toEqual(a.log)
  })

  it('draws no random numbers to escalate', () => {
    const data = quiet(gameData)
    const design = student()
    const before = ringing(byId('debris-collision'), data, design)
    expect(simulateTick(before, design, data).rng).toBe(before.rng) // a quiet catalog rolls nothing, and escalation draws nothing
  })

  it('does not mutate its inputs', () => {
    const data = quiet(gameData)
    const design = student()
    const state = ringing(byId('debris-collision'), data, design)
    const snaps = [JSON.stringify(state), JSON.stringify(design), JSON.stringify(data)]
    simulateTick(state, design, data)
    escalationChain(byId('failure-propulsion'), data)
    expect([JSON.stringify(state), JSON.stringify(design), JSON.stringify(data)]).toEqual(snaps)
  })
})
