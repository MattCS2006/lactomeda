// DEMO TELEMETRY — delete this file (and its one call in ShipInteriorScene) once Jason's engine
// emits real 'simTick' / 'alarmStart' / 'alarmEnd'. Runs ONLY when the URL has ?demo=1.
import type { ActiveEvent, MissionEvent, Station, Subsystem } from '../engine/types'
import { bridge, type SimSnapshot } from './bridge'
import { SHIP_STATIONS, STATION_NAMES } from './stations'

export const DEMO_BATTERY_CAPACITY_WH = 100

const TICK_MS = 500
const ORBIT_TICKS = 60 // ~95-min orbit compressed to 30 s
const SUNLIT_TICKS = 38 // rest of the orbit is eclipse
const CONTACT_FROM = 40 // ground contact window inside the orbit
const CONTACT_TO = 50
const ALARM_EVERY_MS = 20_000
const ALARM_LASTS_MS = 10_000
const TICKS_PER_DAY = 10

export function isDemoEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('demo') === '1'
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function demoEvent(station: Station): MissionEvent {
  return {
    id: `demo-${station}`,
    station,
    title: `${STATION_NAMES[station]} fault (demo)`,
    description: 'Demo alarm.',
    timerSec: 10,
    options: [{ id: 'fix', label: 'Fix it', why: 'Demo option.', effects: {} }],
    defaultOptionId: 'fix',
    trigger: { chancePerDay: 0 },
  }
}

/**
 * Starts the demo feed. Returns a stop function. Does nothing (and returns a no-op) without ?demo=1.
 * Alarms only ring at `stations` (the consoles the current ship has).
 */
export function startDemoSim(stations: readonly Station[] = SHIP_STATIONS): () => void {
  if (!isDemoEnabled() || stations.length === 0) return () => {}

  const rng = mulberry32(2026)
  const decay: Partial<Record<Subsystem, number>> = {
    power: 0.0009,
    battery: 0.0012,
    comms: 0.0016,
    attitude: 0.0007,
    propulsion: 0.001,
    structure: 0.0004,
    computer: 0.0011, // so the Computer Core console changes too
  }
  const health: Partial<Record<Subsystem, number>> = { power: 1, battery: 1, comms: 1, attitude: 1, propulsion: 1, structure: 1, computer: 1 }

  let tick = 0
  let batteryWh = DEMO_BATTERY_CAPACITY_WH
  let stored = 0
  let downlinked = 0
  let science = 0
  let propellant = 2
  let active: ActiveEvent[] = []
  const timers: ReturnType<typeof setTimeout>[] = []

  const step = () => {
    tick++
    const phase = tick % ORBIT_TICKS
    batteryWh = Math.min(DEMO_BATTERY_CAPACITY_WH, Math.max(0, batteryWh + (phase < SUNLIT_TICKS ? 2 : -2.6)))
    if (phase >= CONTACT_FROM && phase < CONTACT_TO) {
      const sent = Math.min(stored, 25)
      stored -= sent
      downlinked += sent
    } else {
      stored += 4
      science += 0.05
    }
    propellant = Math.max(0, propellant - 0.001)

    for (const sub of Object.keys(decay) as Subsystem[]) {
      const next = (health[sub] ?? 1) - (decay[sub] ?? 0) * (0.5 + rng())
      health[sub] = next < 0.05 ? 1 : next // "repaired" so the demo keeps cycling
    }

    const state: SimSnapshot = {
      tick,
      day: Math.floor(tick / TICKS_PER_DAY) + 1,
      status: 'running',
      batteryWh,
      propellantKg: propellant,
      spentM: 5 + tick * 0.02,
      storedDataMb: stored,
      downlinkedDataMb: downlinked,
      science,
      risk: Math.min(1, 0.05 + tick * 0.0003),
      health: { ...health },
      activeEvents: active,
      rng: 0,
    }
    bridge.emit('simTick', { state })
  }

  const raiseAlarm = () => {
    const station = stations[Math.floor(rng() * stations.length)]!
    const event = demoEvent(station)
    const deadlineTick = tick + ALARM_LASTS_MS / TICK_MS
    active = [...active, { event, startedTick: tick, deadlineTick }]
    bridge.emit('alarmStart', { event, deadlineTick })
    timers.push(
      setTimeout(() => {
        active = active.filter((a) => a.event !== event)
        bridge.emit('alarmEnd', { eventId: event.id, optionId: event.defaultOptionId, reason: 'timeout' })
        step() // refresh visuals right away instead of waiting for the next tick
      }, ALARM_LASTS_MS),
    )
    step()
  }

  step()
  const tickTimer = setInterval(step, TICK_MS)
  const alarmTimer = setInterval(raiseAlarm, ALARM_EVERY_MS)

  return () => {
    clearInterval(tickTimer)
    clearInterval(alarmTimer)
    timers.forEach(clearTimeout)
  }
}
