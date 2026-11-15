import type { Station } from '../engine/types'
import type { SimSnapshot } from './bridge'
import { STATION_SUBSYSTEMS } from './stations'

export type StationState = 'ok' | 'warning' | 'alarm' | 'off'

export interface StatusLine {
  label: string
  value: string
}

export interface StationStatus {
  state: StationState
  lines: StatusLine[]
}

export interface StatusOptions {
  /** Full battery capacity. SimSnapshot has none, so the % and the low-battery warning need it. */
  batteryCapacityWh?: number
}

export const OFF_HEALTH = 0.2
export const WARNING_HEALTH = 0.6
export const LOW_BATTERY_FRACTION = 0.25

// TODO(i18n): move these strings to src/i18n once it exists (Dev 2).
const pct = (fraction: number) => `${Math.round(fraction * 100)}%`
const n = (value: number, digits = 0) => value.toFixed(digits)

function stationState(station: Station, snap: SimSnapshot, opts: StatusOptions): StationState {
  // Optional station tasks are calm: they never turn a station red
  if (snap.activeEvents.some((a) => a.event.station === station && a.event.kind !== 'task')) return 'alarm'

  const healths = STATION_SUBSYSTEMS[station]
    .map((sub) => snap.health[sub])
    .filter((h): h is number => h !== undefined)

  // The bridge watches everything, so one dead subsystem must not black it out.
  if (station !== 'bridge' && healths.some((h) => h < OFF_HEALTH)) return 'off'

  if (healths.some((h) => h < WARNING_HEALTH)) return 'warning'

  const cap = opts.batteryCapacityWh
  if (cap && cap > 0 && STATION_SUBSYSTEMS[station].includes('battery') && snap.batteryWh / cap < LOW_BATTERY_FRACTION) {
    return 'warning'
  }
  return 'ok'
}

function healthLine(snap: SimSnapshot, sub: keyof SimSnapshot['health'], label: string): StatusLine[] {
  const h = snap.health[sub]
  return h === undefined ? [] : [{ label, value: pct(h) }]
}

function stationLines(station: Station, snap: SimSnapshot, opts: StatusOptions): StatusLine[] {
  switch (station) {
    case 'power': {
      const cap = opts.batteryCapacityWh
      const battery = cap && cap > 0 ? `${n(snap.batteryWh)} Wh (${pct(snap.batteryWh / cap)})` : `${n(snap.batteryWh)} Wh`
      return [
        { label: 'Battery', value: battery },
        ...healthLine(snap, 'power', 'Power health'),
        ...healthLine(snap, 'battery', 'Battery health'),
      ]
    }
    case 'comms':
      return [
        { label: 'Data stored', value: `${n(snap.storedDataMb)} Mb` },
        { label: 'Downlinked', value: `${n(snap.downlinkedDataMb)} Mb` },
        ...healthLine(snap, 'comms', 'Comms health'),
      ]
    case 'science':
      return [
        { label: 'Science', value: n(snap.science, 1) },
        { label: 'Data stored', value: `${n(snap.storedDataMb)} Mb` },
      ]
    case 'navigation':
      return [
        ...healthLine(snap, 'attitude', 'Attitude health'),
        ...healthLine(snap, 'propulsion', 'Propulsion health'),
        { label: 'Propellant', value: `${n(snap.propellantKg, 1)} kg` },
      ]
    case 'bridge':
      return [
        { label: 'Mission day', value: n(snap.day) },
        { label: 'Spent', value: `$${n(snap.spentM, 1)} M` },
        { label: 'Risk', value: pct(snap.risk) },
        { label: 'Active alarms', value: String(snap.activeEvents.filter((a) => a.event.kind !== 'task').length) },
      ]
    case 'engine':
      return [...healthLine(snap, 'propulsion', 'Propulsion health'), { label: 'Propellant', value: `${n(snap.propellantKg, 1)} kg` }]
    case 'computer':
      return [...healthLine(snap, 'computer', 'Computer health'), { label: 'Data stored', value: `${n(snap.storedDataMb)} Mb` }]
  }
}

/** Pure: same station + snapshot always gives the same result. */
export function stationStatus(station: Station, snapshot: SimSnapshot | null, opts: StatusOptions = {}): StationStatus {
  if (!snapshot) return { state: 'ok', lines: [{ label: 'Waiting for telemetry…', value: '' }] }
  return { state: stationState(station, snapshot, opts), lines: stationLines(station, snapshot, opts) }
}
