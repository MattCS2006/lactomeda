// Alarms in the ship (FR-13.4, SCRUM-122): which rooms flash and where the off-screen markers point. Pure,
// unit-tested; ShipInteriorScene draws them. The station that answers an alarm is its own station, or the Bridge
// when this ship has no such station (small buses merge rooms), the same rule as the decision pop-up.
import type { ActiveEvent, Station } from '../engine/types'
import type { ShipConsole, ShipRoom } from './shipLayout'

/** Red overlay alpha while a room flashes (on/off at the console blink rate). */
export const ROOM_FLASH_ALPHA = 0.28
/** Off-screen markers sit this many px inside the screen edge. */
export const MARKER_MARGIN = 18

/** The station where an alarm is answered on this ship. */
export function alarmStation(alarm: ActiveEvent, shipStations: readonly Station[]): Station {
  return shipStations.includes(alarm.event.station) ? alarm.event.station : 'bridge'
}

/** Stations with at least one active alarm on this ship. */
export function alarmStations(active: ActiveEvent[], shipStations: readonly Station[]): Set<Station> {
  return new Set(active.map((a) => alarmStation(a, shipStations)))
}

/** Ids of the rooms that hold a station in alarm. */
export function flashingRooms(rooms: readonly ShipRoom[], stations: ReadonlySet<Station>): string[] {
  return rooms.filter((r) => r.stations.some((s) => stations.has(s))).map((r) => r.id)
}

/** The consoles a marker should point to. */
export function alarmConsoles(consoles: readonly ShipConsole[], stations: ReadonlySet<Station>): ShipConsole[] {
  return consoles.filter((c) => stations.has(c.station))
}

export interface ViewRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where to draw the marker for a target outside the camera view: on the screen edge, along the line from the
 * view centre to the target. Returns screen coordinates and the angle (radians, 0 = right). Null when on screen.
 */
export function edgeMarker(
  view: ViewRect,
  target: { x: number; y: number },
  margin = MARKER_MARGIN,
): { x: number; y: number; angle: number } | null {
  const inside =
    target.x >= view.x && target.x <= view.x + view.width && target.y >= view.y && target.y <= view.y + view.height
  if (inside) return null
  const cx = view.width / 2
  const cy = view.height / 2
  const dx = target.x - (view.x + cx)
  const dy = target.y - (view.y + cy)
  const angle = Math.atan2(dy, dx)
  // Scale the direction so it touches the inner rectangle (screen minus margin)
  const hx = cx - margin
  const hy = cy - margin
  const scale = Math.min(dx === 0 ? Infinity : hx / Math.abs(dx), dy === 0 ? Infinity : hy / Math.abs(dy))
  return { x: cx + dx * scale, y: cy + dy * scale, angle }
}

/** The three points of a marker triangle pointing at `angle`, centred on (x, y). */
export function markerTriangle(
  x: number,
  y: number,
  angle: number,
  size = 9,
): [number, number, number, number, number, number] {
  const p = (a: number, r: number) => [x + Math.cos(a) * r, y + Math.sin(a) * r] as const
  const tip = p(angle, size)
  const left = p(angle + (Math.PI * 2) / 3, size * 0.8)
  const right = p(angle - (Math.PI * 2) / 3, size * 0.8)
  return [tip[0], tip[1], left[0], left[1], right[0], right[1]]
}
