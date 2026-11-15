// FR-13.4 escalation: what happens when an alarm is ignored until its timer runs out. The default option is always
// applied (sim.ts); then, if the rule says so, the alarm gets worse. Every event in the catalog has exactly one rule:
//   escalatesTo  `escalateTo` names a worse event that rings at once as a new alarm (with its own timer)
//   endsMission  an ignored failure of a critical subsystem with no backup left ends the mission (FR-7.9)
//   defaultOnly  nothing more happens: the default option is the whole consequence (listed in DEFAULT_ONLY_EVENT_IDS)
// Pure and deterministic: nothing is mutated and no random draws are made.
import { CRITICAL_SUBSYSTEMS } from '../constants'
import type { GameData, MissionEvent } from '../types'

export type EscalationRule =
  { kind: 'escalatesTo'; eventId: string } | { kind: 'endsMission' } | { kind: 'defaultOnly' }

/**
 * Events whose escalation is, on purpose, only their default option. Either the event is the last step of a chain
 * (it has nothing worse to become) or ignoring it simply costs the passive option.
 */
export const DEFAULT_ONLY_EVENT_IDS: readonly string[] = [
  // random events (events.json) with nothing worse to become
  'antenna-misaligned',
  'solar-array-degraded',
  'data-storage-full',
  'discovery-opportunity',
  'reaction-wheel-failure',
  'star-tracker-blinded',
  'thruster-leak',
  'software-bug',
  'budget-cut',
  'extended-mission-offer',
  // the last step of each escalation chain (escalationEvents.json)
  'battery-running-flat',
  'contact-lost',
  'instrument-burnout',
  'hull-damage',
  'computer-crash',
  'propellant-venting',
  'heat-spreading',
]

/** The escalation rule of an event, or null if it has none (the catalog test fails then). */
export function escalationRule(event: MissionEvent, data: GameData): EscalationRule | null {
  if (event.kind === 'task') return { kind: 'defaultOnly' } // a station task never escalates: skipping it costs nothing
  if (event.escalateTo !== undefined) {
    return data.events.some((e) => e.id === event.escalateTo)
      ? { kind: 'escalatesTo', eventId: event.escalateTo }
      : null
  }
  const subsystem = event.trigger.requiresSubsystem
  if (event.id.startsWith('failure-') && subsystem !== undefined && CRITICAL_SUBSYSTEMS.includes(subsystem))
    return { kind: 'endsMission' }
  return DEFAULT_ONLY_EVENT_IDS.includes(event.id) ? { kind: 'defaultOnly' } : null
}

/** The events an ignored alarm turns into, one after the other (empty if it does not escalate). Stops if a loop is found. */
export function escalationChain(event: MissionEvent, data: GameData): MissionEvent[] {
  const chain: MissionEvent[] = []
  const seen = new Set<string>([event.id])
  let current = event
  for (;;) {
    const rule = escalationRule(current, data)
    if (rule?.kind !== 'escalatesTo') return chain
    const next = data.events.find((e) => e.id === rule.eventId)
    if (!next || seen.has(next.id)) return chain
    seen.add(next.id)
    chain.push(next)
    current = next
  }
}
