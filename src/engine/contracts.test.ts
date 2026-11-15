// Contract smoke test: builds realistic sample data with the shared types and runs it
// through a tiny fake engine. If someone changes types.ts in a breaking way, this file
// stops compiling (npm run build) or a test fails — before the other two devs notice.
import { describe, expect, it } from 'vitest'
import type {
  EngineAPI,
  GameData,
  MissionDesign,
  MissionEvent,
  ScoreResult,
  SimState,
} from './types'

const batteryFailure: MissionEvent = {
  id: 'battery-cell-failing',
  station: 'power',
  title: 'Battery cell failing',
  description: 'One battery cell is overheating.',
  timerSec: 30,
  defaultOptionId: 'isolate',
  trigger: { chancePerDay: 0.01, requiresSubsystem: 'battery' },
  options: [
    { id: 'repair', label: 'Repair it', why: 'Costs money and a day offline.', effects: { budget: -2, time: -1 }, minigame: 'rewire' },
    { id: 'isolate', label: 'Isolate the cell', why: 'Instruments switch off in eclipse.', effects: { battery: -0.25 } },
    { id: 'backup', label: 'Switch to backup', why: 'Only if you bought redundancy.', effects: {}, requiresTag: 'redundant:battery' },
  ],
}

const data: GameData = {
  busClasses: [{ id: 'cubesat-3u', name: '3U CubeSat', volumeL: 3, maxMassKg: 4, baseCostM: 0.5, componentSlots: 9, instrumentSlots: 1, roomCount: 3 }],
  components: [
    { id: 'bat-li-20', subsystem: 'battery', name: 'Li-ion 20 Wh', tier: 'simple', massKg: 0.3, powerW: 0, costM: 0.05, trl: 9, reliability: 0.97, capacityWh: 20 },
  ],
  instruments: [
    { id: 'cam-vis', name: 'Visible camera', massKg: 1, powerW: 5, costM: 0.2, dataMbPerDay: 2000, science: 10, objectives: ['fire-detect'], preferredOrbits: ['sso-600'] },
  ],
  orbits: [
    { id: 'sso-600', name: 'Sun-synchronous 600 km', regime: 'SSO', altitudeKm: 600, periodMin: 96.7, eclipseFraction: 0.35, contactMinPerDay: 40, distanceKm: 1500, sunDistanceAU: 1, radiation: 'low', insertionDeltaVms: 0, source: 'analytic' },
  ],
  launchers: [{ id: 'rideshare', name: 'Rideshare', capacityKg: { SSO: 500 }, costM: 0.3, reliability: 0.97, fairingVolumeL: 420 }],
  groundNetworks: [{ id: 'uni', name: 'University station', costM: 0.1, contactMultiplier: 1, maxDistanceKm: 3000 }],
  scenarios: [
    {
      id: 'student-cubesat',
      name: 'Student CubeSat',
      briefing: 'Detect wildfires in Central America.',
      durationDays: 365,
      deadlineDays: 540,
      budgetM: 2,
      allowedOrbitIds: ['sso-600'],
      realMissionIds: ['example-cubesat'],
      objectives: [{ id: 'fire-detect', label: 'Fire detection', metric: 'revisit', unit: 'h', levels: { threshold: 48, baseline: 24, goal: 12 } }],
    },
  ],
  events: [batteryFailure],
}

const design: MissionDesign = {
  scenarioId: 'student-cubesat',
  difficulty: 'cadet',
  requirementLevels: { 'fire-detect': 'baseline' },
  busClassId: 'cubesat-3u',
  componentIds: { battery: 'bat-li-20' },
  redundant: ['battery'],
  propellantKg: 0,
  instrumentIds: ['cam-vis'],
  dutyCycle: { 'cam-vis': 1 },
  orbitId: 'sso-600',
  launcherId: 'rideshare',
  groundNetworkId: 'uni',
  seed: 'demo-seed',
}

// Minimal fake engine: proves every EngineAPI signature is usable with the types above.
const fakeEngine: EngineAPI = {
  computeBudgets: () => {
    const ok = { used: 1, available: 2, margin: 0.5, status: 'green' as const }
    return { mass: ok, power: ok, budget: ok, data: ok, comms: ok, time: ok }
  },
  validate: () => [],
  initSim: (): SimState => ({
    tick: 0, day: 0, status: 'running', batteryWh: 20, propellantKg: 0, spentM: 0,
    storedDataMb: 0, downlinkedDataMb: 0, science: 0, risk: 0, health: { battery: 1 },
    activeEvents: [], log: [], rng: 42,
  }),
  simulateTick: (s, _d, gd) =>
    s.tick === 2
      ? { ...s, tick: s.tick + 1, activeEvents: [...s.activeEvents, { event: gd.events[0], startedTick: s.tick, deadlineTick: s.tick + 30 }] }
      : { ...s, tick: s.tick + 1 },
  resolveEvent: (s, eventId) => ({ ...s, activeEvents: s.activeEvents.filter((a) => a.event.id !== eventId) }),
  score: (): ScoreResult => ({
    total: 720,
    breakdown: { science: 300, objectives: 200, efficiency: 100, reliability: 70, collaboration: 50 },
    objectivesMet: { 'fire-detect': 'baseline' },
    stars: 2,
    outcome: 'fullSuccess',
  }),
  explain: () => ({ summary: 'ok', points: [{ kind: 'good', text: 'Battery covered eclipse', decision: 'battery: Li-ion 20 Wh', value: 100, unit: '%' }] }),
}

describe('shared contracts v1', () => {
  it('sample design references existing catalog ids', () => {
    expect(data.busClasses.some((b) => b.id === design.busClassId)).toBe(true)
    expect(data.orbits.some((o) => o.id === design.orbitId)).toBe(true)
    expect(design.instrumentIds.every((id) => data.instruments.some((i) => i.id === id))).toBe(true)
  })

  it('every event default option exists', () => {
    for (const ev of data.events) expect(ev.options.some((o) => o.id === ev.defaultOptionId)).toBe(true)
  })

  it('supports several alarms at once and resolving one of them', () => {
    let s = fakeEngine.initSim(design, data)
    for (let i = 0; i < 3; i++) s = fakeEngine.simulateTick(s, design, data)
    s = { ...s, activeEvents: [...s.activeEvents, { event: { ...batteryFailure, id: 'second-alarm' }, startedTick: 3, deadlineTick: 33 }] }
    expect(s.activeEvents).toHaveLength(2)
    s = fakeEngine.resolveEvent(s, 'battery-cell-failing', 'isolate', design, data)
    expect(s.activeEvents.map((a) => a.event.id)).toEqual(['second-alarm'])
    expect(s.status).toBe('running')
  })

  it('score uses the 1000-point ERS breakdown', () => {
    const r = fakeEngine.score(fakeEngine.initSim(design, data), design, data)
    const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0)
    expect(sum).toBe(r.total)
    expect(r.total).toBeLessThanOrEqual(1000)
  })
})
