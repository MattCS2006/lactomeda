import { describe, expect, it } from 'vitest'
import { gameData } from '../data'
import { REFERENCE_DESIGNS } from '../data/referenceDesigns'
import { alarmConsoles, alarmStation, alarmStations, edgeMarker, flashingRooms, markerTriangle } from './alarmView'
import { generateShipLayout } from './shipLayout'
import type { ActiveEvent, MissionEvent, Station } from '../engine/types'

const event = (station: Station): ActiveEvent => ({
  event: { ...(gameData.events[0] as MissionEvent), id: `e-${station}`, station },
  startedTick: 0,
  deadlineTick: 30,
})

describe('FR-13.4 alarms in the ship: the room flashes and off-screen alarms are marked', () => {
  const design = REFERENCE_DESIGNS.find((d) => d.scenarioId === 'wildfire-eo')!
  const layout = generateShipLayout(design, gameData)
  const stations = layout.consoles.map((c) => c.station)

  it('an alarm flashes the room that holds its station, and only that room', () => {
    const set = alarmStations([event('power')], stations)
    const rooms = flashingRooms(layout.rooms, set)
    expect(rooms).toHaveLength(1)
    expect(layout.rooms.find((r) => r.id === rooms[0])!.stations).toContain('power')
    expect(flashingRooms(layout.rooms, new Set())).toEqual([])
  })

  it('a station missing from this ship is answered (and flashes) at the Bridge', () => {
    const ship: Station[] = ['bridge', 'power']
    expect(alarmStation(event('engine'), ship)).toBe('bridge')
    expect([...alarmStations([event('engine')], ship)]).toEqual(['bridge'])
  })

  it('markers point at the consoles in alarm', () => {
    const set = alarmStations([event('comms')], stations)
    expect(alarmConsoles(layout.consoles, set).map((c) => c.station)).toEqual(['comms'])
  })

  it('no marker for a target on screen; off-screen ones sit on the edge, pointing at it', () => {
    const view = { x: 0, y: 0, width: 640, height: 360 }
    expect(edgeMarker(view, { x: 100, y: 100 })).toBeNull()
    const right = edgeMarker(view, { x: 2000, y: 180 })!
    expect(right.x).toBeCloseTo(640 - 18)
    expect(right.y).toBeCloseTo(180)
    expect(right.angle).toBeCloseTo(0)
    const up = edgeMarker({ ...view, y: 500 }, { x: 320, y: 0 })!
    expect(up.y).toBeCloseTo(18)
    expect(up.angle).toBeCloseTo(-Math.PI / 2)
  })

  it('the marker triangle tip points in the marker direction', () => {
    const [tx, ty] = markerTriangle(100, 100, 0)
    expect(tx).toBeGreaterThan(100)
    expect(ty).toBeCloseTo(100)
  })
})
