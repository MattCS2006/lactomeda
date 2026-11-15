// Deterministic simulation core (FR-7.8). Every function is pure and returns new objects; nothing is mutated.
// All randomness comes from rng.ts: the same design + seed always gives the same state and the same log.
// Log entries carry only simulation time (tick, day). Text is an English fallback.
//
// Tick order (draws are always consumed in this order):
//   1. data, science and operations cost; FR-3.6 station-keeping burn (propellant)
//   2. alarms whose timer ran out are resolved (an ignored failure alarm switches to the backup, or ends the mission
//      if the subsystem is critical)
//   3. FR-3.5 daily failure rolls: one draw per installed subsystem except structure, in Subsystem order, only for a
//      subsystem with health > 0, no failure alarm and a failure chance above 0 (a perfect part draws nothing)
//   4. random event rolls: one draw per applicable event, in catalog order
//   5. end conditions; then FR-3.6 orbit decay (an orbit with drag, once the propellant that held it has run out)
// A failure is never an instant game over: the subsystem goes offline (health 0) and its failure alarm rings. The
// player can repair it, switch to the backup, enter safe mode or leave it offline. Only an ignored alarm on a critical
// subsystem ends the mission (FR-7.9).
//
// Hooks for later E7 stories (not implemented here): FR-7.1 launch lesson, FR-7.2 speed controls (the UI decides how
// often to call simulateTick), FR-7.3 dashboard (reads SimState), FR-7.4 the event deck (data.events),
// FR-7.6 team votes (resolveEvent), FR-7.7 detailed odds (eventChance), FR-7.10 log export (SimState.log).
import {
  CRITICAL_SUBSYSTEMS,
  DIFFICULTY_EVENT_FACTOR,
  MITIGATED_EVENT_FACTOR,
  NON_REDUNDANT_SUBSYSTEMS,
  REPAIR_BASE_HEALTH,
  SECONDS_PER_TICK,
  SIM_DAYS_PER_TICK,
} from './constants'
import { draw } from './rng'
import { SUBSYSTEMS, selectedComponent } from './rules/components'
import { costBreakdown } from './rules/cost'
import { dataBudget } from './rules/data'
import { availableDeltaVms, orbitHolding, propellantBurned } from './rules/propellant'
import type { OrbitHolding } from './rules/propellant'
import { availableOptions, dailyFailureProbability, designTags } from './rules/redundancy'
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

/** Chance per day that an event fires for this design: base chance x difficulty, halved if mitigated. 0 if it cannot apply. */
export function eventChance(
  event: MissionEvent,
  design: MissionDesign,
  data: GameData,
  state?: Pick<SimState, 'backupsUsed'>,
): number {
  const { requiresSubsystem, mitigatedByTags } = event.trigger
  if (requiresSubsystem && !installedSubsystems(design, data).includes(requiresSubsystem)) return 0
  const tags = new Set(designTags(design, data, state))
  const mitigated = (mitigatedByTags ?? []).some((tag) => tags.has(tag))
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
  let base: SimState = {
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
    backupsUsed: [],
    activeEvents: [],
    log: [],
    rng: roll.counter,
  }

  // FR-3.6: the orbit insertion burn is paid at the start (the rocket equation is additive, so this matches availableDeltaVms)
  const holding = orbitHolding(design, data)
  let loaded = base
  if (holding.ispS !== null && holding.insertionDeltaVms > 0) {
    const burned = propellantBurned(holding.dryMassKg + design.propellantKg, holding.insertionDeltaVms, holding.ispS)
    loaded = { ...base, propellantKg: Math.max(0, design.propellantKg - burned) }
  }
  base = flagOutOfPropellant(loaded, holding)

  if (!launcher || roll.value >= launcher.reliability) {
    const why = launcher ? `Launch failure: the ${launcher.name} did not reach orbit.` : 'Launch failure: no launcher was chosen.'
    return withLog({ ...base, status: 'failed', endReason: 'launchFailure' }, 'failure', why)
  }
  return withLog(base, 'info', `Launch successful on the ${launcher.name}.`)
}

// ─── Propellant and orbit decay (FR-3.6) ────────────────────────────────

const OUT_OF_PROPELLANT = 'Out of propellant'

const outOfPropellantEntry = (state: SimState): SimLogEntry | undefined =>
  state.log.find((l) => l.kind === 'warning' && l.text.startsWith(OUT_OF_PROPELLANT))

/** Logs, once, the moment the propellant that holds the orbit is gone. The orbit decay clock starts on that day. */
function flagOutOfPropellant(state: SimState, holding: OrbitHolding): SimState {
  if (holding.ispS === null || holding.stationKeepingMsPerYear <= 0) return state
  if (state.propellantKg > 0 || outOfPropellantEntry(state)) return state
  return withLog(state, 'warning', `${OUT_OF_PROPELLANT}: the orbit can no longer be held.`)
}

/** Burns one tick of station-keeping propellant (rocket equation at the current mass). */
function stationKeep(state: SimState, holding: OrbitHolding): SimState {
  if (holding.ispS === null || holding.stationKeepingMsPerYear <= 0 || state.propellantKg <= 0) return flagOutOfPropellant(state, holding)
  const deltaV = (holding.stationKeepingMsPerYear * SIM_DAYS_PER_TICK) / 365
  const burned = propellantBurned(holding.dryMassKg + state.propellantKg, deltaV, holding.ispS)
  return flagOutOfPropellant({ ...state, propellantKg: Math.max(0, state.propellantKg - burned) }, holding)
}

/**
 * An orbit with drag decays once nothing holds it: the clock starts the day the propellant ran out (day 0 if there was
 * none), or, for a fixed-delta-v propulsion with no Isp, when its delta-v has been spent on the insertion and station-keeping.
 * When the decay time has passed the mission ends with `lifetimeReached`.
 */
function orbitDecay(state: SimState, design: MissionDesign, data: GameData): SimState {
  if (state.status !== 'running') return state
  const holding = orbitHolding(design, data)
  if (holding.decayLifetimeDays === null || holding.stationKeepingMsPerYear <= 0) return state
  const holdsUntilDay =
    holding.ispS === null
      ? (Math.max(0, availableDeltaVms(design, data) - holding.insertionDeltaVms) / holding.stationKeepingMsPerYear) * 365
      : outOfPropellantEntry(state)?.day
  if (holdsUntilDay === undefined || state.day < holdsUntilDay + holding.decayLifetimeDays) return state
  return withLog({ ...state, status: 'success', endReason: 'lifetimeReached' }, 'info', `Orbit decayed after ${state.day} days.`)
}

// ─── Failures (FR-3.5) ──────────────────────────────────────────────────

const FAILURE_PREFIX = 'failure-'

/** The subsystem a failure alarm (`failure-<subsystem>`) is about; undefined for any other event. */
const failureSubsystem = (event: MissionEvent): Subsystem | undefined =>
  event.id.startsWith(FAILURE_PREFIX) ? event.trigger.requiresSubsystem : undefined

const isCritical = (subsystem: Subsystem): boolean => CRITICAL_SUBSYSTEMS.includes(subsystem)

const backupIsFree = (state: SimState, design: MissionDesign, subsystem: Subsystem): boolean =>
  design.redundant.includes(subsystem) && !(state.backupsUsed ?? []).includes(subsystem)

function criticalFailure(state: SimState, why: string): SimState {
  return withLog({ ...state, status: 'failed', endReason: 'criticalFailure' }, 'failure', why)
}

function startAlarm(state: SimState, event: MissionEvent): SimState {
  const raised: ActiveEvent = {
    event,
    startedTick: state.tick,
    deadlineTick: state.tick + Math.ceil(event.timerSec / SECONDS_PER_TICK),
  }
  return withLog({ ...state, activeEvents: [...state.activeEvents, raised] }, 'event', `Alarm at the ${event.station} station: ${event.title}.`)
}

/**
 * A subsystem went offline: health 0 and its failure alarm starts. The mission keeps running. If the catalog has no
 * `failure-<subsystem>` event there is nothing to repair with, so a critical subsystem then ends the mission.
 */
function raiseFailure(state: SimState, subsystem: Subsystem, data: GameData): SimState {
  const next = withLog({ ...state, health: { ...state.health, [subsystem]: 0 } }, 'failure', `The ${subsystem} subsystem has failed.`)
  const event = data.events.find((e) => e.id === `${FAILURE_PREFIX}${subsystem}`)
  if (!event) return isCritical(subsystem) ? criticalFailure(next, `Critical failure: the ${subsystem} subsystem is lost.`) : next
  if (next.activeEvents.some((a) => a.event.id === event.id)) return next
  return startAlarm(next, event)
}

// ─── Effects and decisions ──────────────────────────────────────────────

/**
 * Adds the effect of an option to the state. Negative effects are scaled by the mini-game score. `health` applies to
 * the event's `trigger.requiresSubsystem`; a subsystem whose health reaches 0 is returned in `failed`.
 */
function applyEffects(
  state: SimState,
  effects: Partial<Record<EffectKey, number>>,
  score: number,
  design: MissionDesign,
  data: GameData,
  event: MissionEvent,
): { state: SimState; failed: Subsystem[] } {
  const batteryCapacityWh = selectedComponent(design, 'battery', data)?.capacityWh ?? 0
  const failed: Subsystem[] = []
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
      case 'health': {
        const subsystem = event.trigger.requiresSubsystem
        const before = subsystem ? next.health[subsystem] : undefined
        if (!subsystem || before === undefined) break
        const after = clamp(before + value, 0, 1)
        next = { ...next, health: { ...next.health, [subsystem]: after } }
        if (before > 0 && after <= 0) failed.push(subsystem)
        break
      }
      default:
        break // mass, power, comms and time have no running state yet
    }
  }
  return { state: next, failed }
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
  const subsystem = failureSubsystem(event)
  let next: SimState = { ...state, activeEvents: state.activeEvents.filter((a) => a.event.id !== event.id) }

  // A repair restores 0.5 + 0.5 x the mini-game score of health (FR-3.5).
  const effects =
    subsystem && option.id === 'repair'
      ? { ...option.effects, health: REPAIR_BASE_HEALTH + (1 - REPAIR_BASE_HEALTH) * clamp(score, 0, 1) }
      : option.effects
  const applied = applyEffects(next, effects, score, design, data, event)
  next = applied.state
  if (subsystem && option.id === 'backup') next = { ...next, backupsUsed: [...(next.backupsUsed ?? []), subsystem] }

  const text =
    how === 'timeout'
      ? `"${event.title}" timed out: "${option.label}" was applied automatically.`
      : `Decision on "${event.title}": ${option.label}.`
  next = withLog(next, how === 'timeout' ? 'warning' : 'decision', text)
  for (const failedSubsystem of applied.failed) next = raiseFailure(next, failedSubsystem, data)
  return next
}

/** Resolves an active alarm with one option (FR-7.4, FR-7.6). An unknown or inactive event, an unknown option or one the design cannot take leaves the state unchanged apart from a warning. */
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
  const option = active.event.options.find((o) => o.id === optionId)
  if (option && !availableOptions(active.event, design, data, state).some((o) => o.id === optionId)) {
    return withLog(state, 'warning', `Option "${option.label}" is not available for "${active.event.title}".`)
  }
  return resolve(state, active.event, optionId, minigameScore, design, data, 'decision')
}

/** An alarm whose timer ran out. A failure alarm switches to a free backup, else the subsystem stays offline (and a critical one ends the mission). */
function timeOut(state: SimState, active: ActiveEvent, design: MissionDesign, data: GameData): SimState {
  const { event } = active
  const subsystem = failureSubsystem(event)
  if (!subsystem) return resolve(state, event, event.defaultOptionId, 1, design, data, 'timeout')

  const next: SimState = { ...state, activeEvents: state.activeEvents.filter((a) => a.event.id !== event.id) }
  if (backupIsFree(state, design, subsystem)) {
    return withLog(
      { ...next, health: { ...next.health, [subsystem]: 1 }, backupsUsed: [...(next.backupsUsed ?? []), subsystem] },
      'warning',
      `"${event.title}" timed out: the ship switched to the backup ${subsystem} unit automatically.`,
    )
  }
  if (isCritical(subsystem)) {
    return criticalFailure(
      withLog(next, 'warning', `"${event.title}" timed out: the ${subsystem} was left offline.`),
      `Critical failure: the ${subsystem} subsystem is lost.`,
    )
  }
  return withLog(next, 'warning', `"${event.title}" timed out: the ${subsystem} stays offline.`)
}

function endCondition(state: SimState, design: MissionDesign, data: GameData): SimState {
  if (state.status !== 'running') return state
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
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

  // FR-3.6 station-keeping: burn the propellant that holds the orbit
  next = stationKeep(next, orbitHolding(design, data))

  // alarms whose timer ran out
  for (const active of next.activeEvents) {
    if (next.status !== 'running') break
    if (next.tick >= active.deadlineTick) next = timeOut(next, active, design, data)
  }
  if (next.status !== 'running') return next

  // FR-3.5 daily failure rolls: one draw per installed subsystem that can fail, in Subsystem order
  for (const subsystem of SUBSYSTEMS) {
    if (NON_REDUNDANT_SUBSYSTEMS.includes(subsystem)) continue // structure has no failure rolls
    const component = selectedComponent(design, subsystem, data)
    const health = next.health[subsystem]
    if (!component || health === undefined || health <= 0) continue
    if (next.activeEvents.some((a) => failureSubsystem(a.event) === subsystem)) continue
    const daily = dailyFailureProbability(component, design, data)
    const chance = 1 - (1 - daily) ** SIM_DAYS_PER_TICK
    if (chance <= 0) continue
    const roll = draw(design.seed, next.rng)
    next = { ...next, rng: roll.counter }
    if (roll.value < chance) {
      next = raiseFailure(next, subsystem, data)
      if (next.status !== 'running') return next
    }
  }

  // new alarms: one draw per applicable event, always in catalog order
  for (const event of data.events) {
    const chance = eventChance(event, design, data, next)
    if (chance <= 0 || next.activeEvents.some((a) => a.event.id === event.id)) continue
    const roll = draw(design.seed, next.rng)
    next = { ...next, rng: roll.counter }
    if (roll.value >= chance) continue
    next = startAlarm(next, event)
  }

  return orbitDecay(endCondition(next, design, data), design, data)
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
