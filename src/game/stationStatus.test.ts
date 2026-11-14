import { describe, expect, it } from 'vitest'
import type { MissionEvent, Station } from '../engine/types'
import type { SimSnapshot } from './bridge'
import { stationStatus } from './stationStatus'

function snap(over: Partial<SimSnapshot> = {}): SimSnapshot {
  return {
    tick: 10,
    day: 3,
    status: 'running',
    batteryWh: 80,
    propellantKg: 1.5,
    spentM: 12.34,
    storedDataMb: 200,
    downlinkedDataMb: 50,
    science: 7,
    risk: 0.12,
    health: { power: 1, battery: 1, comms: 1, attitude: 1, propulsion: 1 },
    activeEvents: [],
    rng: 1,
    ...over,
  }
}

function alarmAt(station: Station): SimSnapshot['activeEvents'] {
  const event: MissionEvent = {
    id: 'e1',
    station,
    title: 't',
    description: 'd',
    timerSec: 30,
    options: [],
    defaultOptionId: 'x',
    trigger: { chancePerDay: 0.1 },
  }
  return [{ event, startedTick: 1, deadlineTick: 9 }]
}

const CAP = { batteryCapacityWh: 100 }

describe('stationStatus', () => {
  it('null snapshot: ok with a single waiting line', () => {
    const s = stationStatus('power', null)
    expect(s.state).toBe('ok')
    expect(s.lines).toEqual([{ label: 'Waiting for telemetry…', value: '' }])
  })

  it('ok when everything is healthy', () => {
    for (const st of ['bridge', 'comms', 'power', 'science', 'navigation'] as const) {
      expect(stationStatus(st, snap(), CAP).state).toBe('ok')
    }
  })

  it('alarm when an active event targets the station, and only that station', () => {
    const s = snap({ activeEvents: alarmAt('comms') })
    expect(stationStatus('comms', s).state).toBe('alarm')
    expect(stationStatus('power', s).state).toBe('ok')
  })

  it('alarm wins over off', () => {
    const s = snap({ health: { comms: 0.05 }, activeEvents: alarmAt('comms') })
    expect(stationStatus('comms', s).state).toBe('alarm')
  })

  it('off when a mapped subsystem health < 0.2', () => {
    expect(stationStatus('comms', snap({ health: { comms: 0.1 } })).state).toBe('off')
    expect(stationStatus('navigation', snap({ health: { attitude: 1, propulsion: 0.19 } })).state).toBe('off')
  })

  it('warning when health < 0.6', () => {
    expect(stationStatus('power', snap({ health: { power: 0.5, battery: 1 } })).state).toBe('warning')
    expect(stationStatus('power', snap({ health: { power: 0.6, battery: 1 } })).state).toBe('ok')
  })

  it('warning when battery < 25% (needs capacity)', () => {
    expect(stationStatus('power', snap({ batteryWh: 20 }), CAP).state).toBe('warning')
    expect(stationStatus('power', snap({ batteryWh: 25 }), CAP).state).toBe('ok')
    expect(stationStatus('power', snap({ batteryWh: 20 })).state).toBe('ok') // unknown capacity
    expect(stationStatus('comms', snap({ batteryWh: 5 }), CAP).state).toBe('ok') // not a power station
  })

  it('science has no mapped subsystems, so it never goes off or warns on health', () => {
    expect(stationStatus('science', snap({ health: { power: 0, comms: 0 } })).state).toBe('ok')
  })

  it('bridge warns on any bad subsystem but never goes off', () => {
    expect(stationStatus('bridge', snap({ health: { comms: 0.5 } })).state).toBe('warning')
    expect(stationStatus('bridge', snap({ health: { comms: 0, structure: 0 } })).state).toBe('warning')
  })

  it('ignores subsystems without a health value', () => {
    expect(stationStatus('comms', snap({ health: {} })).state).toBe('ok')
  })

  it('shows station-relevant lines', () => {
    const power = stationStatus('power', snap(), CAP).lines
    expect(power[0]).toEqual({ label: 'Battery', value: '80 Wh (80%)' })
    expect(power.map((l) => l.label)).toContain('Power health')

    expect(stationStatus('power', snap()).lines[0]?.value).toBe('80 Wh')

    expect(stationStatus('comms', snap()).lines).toEqual(
      expect.arrayContaining([
        { label: 'Data stored', value: '200 Mb' },
        { label: 'Downlinked', value: '50 Mb' },
      ]),
    )
    expect(stationStatus('science', snap()).lines).toEqual([
      { label: 'Science', value: '7.0' },
      { label: 'Data stored', value: '200 Mb' },
    ])
    expect(stationStatus('navigation', snap()).lines).toContainEqual({ label: 'Propellant', value: '1.5 kg' })
    expect(stationStatus('bridge', snap({ activeEvents: alarmAt('power') })).lines).toEqual([
      { label: 'Mission day', value: '3' },
      { label: 'Spent', value: '$12.3 M' },
      { label: 'Risk', value: '12%' },
      { label: 'Active alarms', value: '1' },
    ])
  })
})
