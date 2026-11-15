// Deterministic simulation core (FR-7.8). Every function is pure and returns new objects; nothing is mutated.
// All randomness comes from rng.ts: the same design + seed always gives the same state and the same log.
// Log entries carry only simulation time (tick, day). Text is an English fallback.
//
// Hooks for later E7 stories (not implemented here): FR-7.1 launch lesson, FR-7.2 speed controls (the UI decides how
// often to call simulateTick), FR-7.3 dashboard (reads SimState), FR-7.4 the event deck (data.events),
// FR-7.6 team votes (resolveEvent), FR-7.7 detailed odds (eventChance), FR-7.10 log export (SimState.log).
import {
  DIFFICULTY_EVENT_FACTOR,
  MITIGATED_EVENT_FACTOR,
  SECONDS_PER_TICK,
  SIM_DAYS_PER_TICK,
} from './constants'
import { draw } from './rng'
import { selectedComponent } from './rules/components'
import { costBreakdown } from './rules/cost'
import { dataBudget } from './rules/data'
import { payloadScience } from './rules/science'
import type {
  ActiveEvent,
  EffectKey,
  GameData,
  MissionDesign,
  MissionEvent,
  SimLogEntry,
  SimState,
  Subsystem,
} from './types'

export interface ScriptedDecision {
  tick: number // applied after this many ticks have run, before the next one
  eventId: string
  optionId: string
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fmt = (n: number): string => String(Math.round(n * 100) / 100)

function withLog(state: SimState, kind: SimLogEntry['kind'], text: string): SimState {
  return { ...state, log: [...state.log, { tick: state.tick, day: state.day, kind, text }] }
}

function installedSubsystems(design: MissionDesign, data: GameData): Subsystem[] {
  return (Object.entries(design.componentIds) as [Subsystem, string | undefined][])
    .filter(([, id]) => id !== undefined && data.components.some((c) => c.id === id))
    .map(([subsystem]) => subsystem)
}

/** Tags the design has: tags of installed components, plus `redundant:<subsystem>` for each backed-up subsystem. */
export function designTags(design: MissionDesign, data: GameData): Set<string> {
  const tags = new Set<string>()
  for (const subsystem of installedSubsystems(design, data)) {
    for (const tag of selectedComponent(design, subsystem, data)?.tags ?? []) tags.add(tag)
  }
  for (const subsystem of design.redundant) tags.add(`redundant:${subsystem}`)
  return tags
}

/** Chance per day that an event fires for this design: base chance x difficulty, halved if mitigated. 0 if it cannot apply. */
export function eventChance(event: MissionEvent, design: MissionDesign, data: GameData): number {
  const { requiresSubsystem, mitigatedByTags } = event.trigger
  if (requiresSubsystem && !installedSubsystems(design, data).includes(requiresSubsystem)) return 0
  const mitigated = (mitigatedByTags ?? []).some((tag) => designTags(design, data).has(tag))
  const chance = event.trigger.chancePerDay * DIFFICULTY_EVENT_FACTOR[design.difficulty] * (mitigated ? MITIGATED_EVENT_FACTOR : 1)
  return clamp(chance, 0, 1)
}

/** Rolls the launch (FR-7.1) with one draw. A failed launch returns a finished state with endReason 'launchFailure'. */
export function initSim(design: MissionDesign, data: GameData): SimState {
  const launcher = data.launchers.find((l) => l.id === design.launcherId)
  const roll = draw(design.seed, 0)
  const health: Partial<Record<Subsystem, number>> = {}
  for (const subsystem of installedSubsystems(design, data)) health[subsystem] = 1

  // Development and launch are paid before liftoff; operations are added every tick.
  const cost = costBreakdown(design, data)
  const base: SimState = {
    tick: 0,
    day: 0,
    status: 'running',
    batteryWh: selectedComponent(design, 'battery', data)?.capacityWh ?? 0,
    propellantKg: design.propellantKg,
    spentM: cost.development.totalM + cost.launchM,
    storedDataMb: 0,
    downlinkedDataMb: 0,
    science: 0,
    risk: 0,
    health,
    activeEvents: [],
    log: [],
    rng: roll.counter,
  }

  if (!launcher || roll.value >= launcher.reliability) {
    const why = launcher ? `Launch failure: the ${launcher.name} did not reach orbit.` : 'Launch failure: no launcher was chosen.'
    return withLog({ ...base, status: 'failed', endReason: 'launchFailure' }, 'failure', why)
  }
  return withLog(base, 'info', `Launch successful on the ${launcher.name}.`)
}

/** Adds the effect of an option to the state. Negative effects are scaled by the mini-game score. */
function applyEffects(state: SimState, effects: Partial<Record<EffectKey, number>>, score: number, design: MissionDesign, data: GameData): SimState {
  const batteryCapacityWh = selectedComponent(design, 'battery', data)?.capacityWh ?? 0
  let next = state
  for (const [key, raw] of Object.entries(effects) as [EffectKey, number][]) {
    const value = raw < 0 ? raw * score : raw
    switch (key) {
      case 'budget':
        next = { ...next, spentM: Math.max(0, next.spentM - value) } // -2 costs 2 M
        break
      case 'science':
        next = { ...next, science: Math.max(0, next.science + value) }
        break
      case 'risk':
        next = { ...next, risk: clamp(next.risk + value, 0, 1) }
        break
      case 'propellant':
        next = { ...next, propellantKg: Math.max(0, next.propellantKg + value) }
        break
      case 'battery': // a fraction of the battery capacity
        next = { ...next, batteryWh: clamp(next.batteryWh + value * batteryCapacityWh, 0, batteryCapacityWh) }
        break
      case 'data':
        next = { ...next, storedDataMb: Math.max(0, next.storedDataMb + value) }
        break
      default:
        break // mass, power, comms and time have no running state yet
    }
  }
  return next
}

function resolve(
  state: SimState,
  event: MissionEvent,
  optionId: string,
  score: number,
  design: MissionDesign,
  data: GameData,
  how: 'decision' | 'timeout',
): SimState {
  const option = event.options.find((o) => o.id === optionId)
  if (!option) return withLog(state, 'warning', `Event "${event.title}" has no option "${optionId}".`)
  let next: SimState = { ...state, activeEvents: state.activeEvents.filter((a) => a.event.id !== event.id) }
  next = applyEffects(next, option.effects, score, design, data)
  const text =
    how === 'timeout'
      ? `"${event.title}" timed out: "${option.label}" was applied automatically.`
      : `Decision on "${event.title}": ${option.label}.`
  return withLog(next, how === 'timeout' ? 'warning' : 'decision', text)
}

/** Resolves an active alarm with one option (FR-7.4, FR-7.6). An unknown or inactive event or option leaves the state unchanged apart from a warning. */
export function resolveEvent(
  state: SimState,
  eventId: string,
  optionId: string,
  design: MissionDesign,
  data: GameData,
  minigameScore = 1,
): SimState {
  const active = state.activeEvents.find((a) => a.event.id === eventId)
  if (!active) return withLog(state, 'warning', `Event "${eventId}" is not active.`)
  return resolve(state, active.event, optionId, minigameScore, design, data, 'decision')
}

function endCondition(state: SimState, design: MissionDesign, data: GameData): SimState {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const dead = (Object.entries(state.health) as [Subsystem, number][]).find(([, h]) => h <= 0)
  if (dead) {
    return withLog({ ...state, status: 'failed', endReason: 'criticalFailure' }, 'failure', `Critical failure: the ${dead[0]} subsystem is lost.`)
  }
  if (scenario && state.spentM > scenario.budgetM) {
    return withLog(
      { ...state, status: 'failed', endReason: 'budgetExhausted' },
      'failure',
      `Budget exhausted: ${fmt(state.spentM)} M spent of ${fmt(scenario.budgetM)} M.`,
    )
  }
  if (!scenario || state.day >= scenario.durationDays) {
    return withLog({ ...state, status: 'success', endReason: 'lifetimeReached' }, 'info', `Mission lifetime reached after ${state.day} days.`)
  }
  return state
}

/** Advances the mission by one tick. A finished mission is returned unchanged. */
export function simulateTick(state: SimState, design: MissionDesign, data: GameData): SimState {
  if (state.status !== 'running') return state
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const network = data.groundNetworks.find((g) => g.id === design.groundNetworkId)

  let next: SimState = { ...state, tick: state.tick + 1, day: state.day + SIM_DAYS_PER_TICK }

  // data: generate, downlink what the link allows, keep what fits in storage
  const budget = dataBudget(design, data)
  const stored = next.storedDataMb + budget.generatedMbPerDay * SIM_DAYS_PER_TICK
  const downlinked = Math.min(stored, budget.downlinkMbPerDay * SIM_DAYS_PER_TICK)
  next = {
    ...next,
    storedDataMb: Math.min(stored - downlinked, budget.storageMb),
    downlinkedDataMb: next.downlinkedDataMb + downlinked,
  }

  // science and operations cost, spread evenly over the planned lifetime
  const durationDays = scenario?.durationDays ?? 0
  if (durationDays > 0) next = { ...next, science: next.science + (payloadScience(design, data) * SIM_DAYS_PER_TICK) / durationDays }
  next = { ...next, spentM: next.spentM + ((network?.costM ?? 0) * SIM_DAYS_PER_TICK) / 365 }

  // alarms whose timer ran out are resolved with their default option
  for (const active of next.activeEvents) {
    if (next.tick >= active.deadlineTick) {
      next = resolve(next, active.event, active.event.defaultOptionId, 1, design, data, 'timeout')
    }
  }

  // new alarms: one draw per applicable event, always in catalog order
  for (const event of data.events) {
    const chance = eventChance(event, design, data)
    if (chance <= 0 || next.activeEvents.some((a) => a.event.id === event.id)) continue
    const roll = draw(design.seed, next.rng)
    next = { ...next, rng: roll.counter }
    if (roll.value >= chance) continue
    const raised: ActiveEvent = {
      event,
      startedTick: next.tick,
      deadlineTick: next.tick + Math.ceil(event.timerSec / SECONDS_PER_TICK),
    }
    next = withLog({ ...next, activeEvents: [...next.activeEvents, raised] }, 'event', `Alarm at the ${event.station} station: ${event.title}.`)
  }

  return endCondition(next, design, data)
}

/** Runs a whole mission, applying scripted decisions at their tick. Used for replays and tests. */
export function runMission(design: MissionDesign, data: GameData, decisions: ScriptedDecision[] = []): SimState {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const maxTicks = Math.ceil((scenario?.durationDays ?? 0) / SIM_DAYS_PER_TICK) + 1
  let state = initSim(design, data)
  while (state.status === 'running' && state.tick < maxTicks) {
    for (const d of decisions.filter((x) => x.tick === state.tick)) {
      state = resolveEvent(state, d.eventId, d.optionId, design, data)
    }
    state = simulateTick(state, design, data)
  }
  return state
}
