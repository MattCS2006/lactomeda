import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { Bridge } from '../../game/bridge'
import { createDesign, useMissionStore } from '../store/missionStore'
import { designChanges, restoredDesign, type FlightRecord } from './flightRecord'
import { FLY_AGAIN_STEP, useFlightStore } from './flightStore'
import { resultLabel, starsIcon } from './resultView'
import { attachFlightRecorder } from './useFlightRecorder'
import type { MissionDesign, ScoreResult } from '../../engine/types'

/** A Wildfire design with a bus, every part, one instrument, an orbit, a launcher and a network. */
function builtDesign(): MissionDesign {
  const s = useMissionStore.getState()
  s.selectScenario('wildfire-eo', gameData)
  const store = () => useMissionStore.getState()
  store().selectBus(gameData.busClasses[1]!.id, gameData)
  const scenario = gameData.scenarios.find((x) => x.id === 'wildfire-eo')!
  store().selectOrbit(scenario.allowedOrbitIds[0]!, gameData)
  const instrument = gameData.instruments.find((i) => {
    store().addInstrument(i.id, gameData)
    return store().design!.instrumentIds.includes(i.id)
  })
  expect(instrument).toBeDefined()
  const battery = gameData.components.find((c) => c.subsystem === 'battery')!
  store().selectPart('battery', battery.id, gameData)
  return store().design!
}

const score: ScoreResult = {
  total: 640,
  breakdown: { science: 300, objectives: 150, efficiency: 90, reliability: 60, collaboration: 40 },
  objectivesMet: {},
  stars: 2,
  outcome: 'partialSuccess',
}

beforeEach(() => {
  useMissionStore.setState({ screen: 'design', step: 'brief', furthest: 'brief', design: null })
  useFlightStore.setState({ phase: 'design', lastFlight: null })
})

describe('FR-10.6 fly again — acceptance: design restored with one click', () => {
  it('restores the exact flown design on the spacecraft screen, with every tab open', () => {
    const flown = builtDesign()
    useFlightStore.getState().recordLaunch(flown)
    // The player wanders off: new scenario, back to the menu
    useMissionStore.getState().selectScenario('space-telescope', gameData)
    useMissionStore.setState({ screen: 'landing', step: 'brief' })
    useFlightStore.setState({ phase: 'debrief' })

    expect(useFlightStore.getState().flyAgain(gameData)).toBe(true)
    const state = useMissionStore.getState()
    expect(state.design).toEqual(flown)
    expect(state.screen).toBe('design')
    expect(state.step).toBe(FLY_AGAIN_STEP)
    expect(state.furthest).toBe('design')
    expect(useFlightStore.getState().phase).toBe('design')
  })

  it('keeps the seed by default (same events), draws a new one on request', () => {
    const flown = builtDesign()
    useFlightStore.getState().recordLaunch(flown)
    useFlightStore.getState().flyAgain(gameData)
    expect(useMissionStore.getState().design!.seed).toBe(flown.seed)

    const record: FlightRecord = { design: flown, result: null }
    expect(restoredDesign(record, gameData, () => 'fresh', { newEvents: true })!.seed).toBe('fresh')
  })

  it('the flown copy is not changed by later edits, so it can be restored again and again', () => {
    const flown = builtDesign()
    useFlightStore.getState().recordLaunch(flown)
    const bigger = gameData.busClasses.find((b) => b.id !== flown.busClassId)!
    useMissionStore.getState().selectBus(bigger.id, gameData)
    expect(useFlightStore.getState().lastFlight!.design.busClassId).toBe(flown.busClassId)
    useFlightStore.getState().flyAgain(gameData)
    expect(useMissionStore.getState().design!.busClassId).toBe(flown.busClassId)
  })

  it('does nothing when no flight was recorded', () => {
    expect(useFlightStore.getState().flyAgain(gameData)).toBe(false)
    expect(useMissionStore.getState().design).toBeNull()
  })

  it('drops parts the catalog no longer has', () => {
    const flown = { ...builtDesign(), instrumentIds: ['gone-instrument'] }
    const design = restoredDesign({ design: flown, result: null }, gameData, () => 'x')!
    expect(design.instrumentIds).toEqual([])
  })
})

describe('recording flights from the bridge', () => {
  it('records the design at launch and the result when the mission ends', () => {
    const bus = new Bridge()
    const off = attachFlightRecorder(bus)
    const flown = builtDesign()
    bus.emit('phaseChanged', { phase: 'launch' })
    bus.emit('phaseChanged', { phase: 'flight' })
    // A change during flight (shouldn't happen, but) must not replace the launch copy
    useMissionStore.getState().selectBus(gameData.busClasses[0]!.id, gameData)
    bus.emit('phaseChanged', { phase: 'flight' })
    bus.emit('missionEnded', { status: 'success', score, explanation: { summary: '', points: [] } })

    const { lastFlight, phase } = useFlightStore.getState()
    expect(lastFlight!.design).toEqual(flown)
    expect(lastFlight!.result).toEqual({ total: 640, stars: 2, outcome: 'partialSuccess' })
    expect(phase).toBe('debrief')
    off()
  })

  it('a new flight replaces the last one and starts with no result', () => {
    const bus = new Bridge()
    const off = attachFlightRecorder(bus)
    builtDesign()
    bus.emit('phaseChanged', { phase: 'launch' })
    bus.emit('missionEnded', { status: 'failed', score, explanation: { summary: '', points: [] } })
    useFlightStore.getState().flyAgain(gameData)
    useMissionStore.getState().selectBus(gameData.busClasses[0]!.id, gameData)
    bus.emit('phaseChanged', { phase: 'design' })
    bus.emit('phaseChanged', { phase: 'launch' })
    const { lastFlight } = useFlightStore.getState()
    expect(lastFlight!.design.busClassId).toBe(gameData.busClasses[0]!.id)
    expect(lastFlight!.result).toBeNull()
    off()
  })
})

describe('changes since the last flight', () => {
  it('no changes right after fly again', () => {
    const flown = builtDesign()
    expect(designChanges(flown, structuredClone(flown), gameData)).toEqual([])
  })

  it('names one changed part with its old and new value', () => {
    const flown = builtDesign()
    const other = gameData.components.find((c) => c.subsystem === 'battery' && c.id !== flown.componentIds.battery)!
    const current = { ...flown, componentIds: { ...flown.componentIds, battery: other.id } }
    const [change, ...rest] = designChanges(flown, current, gameData)
    expect(rest).toHaveLength(0)
    expect(change!.key).toBe('flight.change.swap')
    expect(change!.values!.what).toEqual({ key: 'subsystem.battery.name' })
    expect(change!.values!.to).toBe(other.name)
  })

  it('lists added / removed instrument copies, altitude, launcher and new events', () => {
    const flown = builtDesign()
    const id = flown.instrumentIds[0]!
    const current: MissionDesign = {
      ...flown,
      instrumentIds: [...flown.instrumentIds, id],
      altitudeKm: 350,
      launcherId:
        gameData.launchers[0]!.id === flown.launcherId ? gameData.launchers[1]!.id : gameData.launchers[0]!.id,
      seed: 'other',
    }
    const keys = designChanges(flown, current, gameData).map((c) => c.key)
    expect(keys).toContain('flight.change.added')
    expect(keys).toContain('flight.change.events')
    expect(keys.filter((k) => k === 'flight.change.swap')).toHaveLength(2) // altitude + launcher
    expect(designChanges(current, flown, gameData).map((c) => c.key)).toContain('flight.change.removed')
  })

  it('a requirement level change uses the objective label', () => {
    const flown = builtDesign()
    const [objectiveId] = Object.keys(flown.requirementLevels)
    const current = { ...flown, requirementLevels: { ...flown.requirementLevels, [objectiveId!]: 'goal' as const } }
    const [change] = designChanges(flown, current, gameData)
    const objective = gameData.scenarios.find((s) => s.id === 'wildfire-eo')!.objectives[0]!
    expect(change!.values!.what).toBe(objective.label)
  })

  it('another scenario is reported as one change', () => {
    const flown = builtDesign()
    const other = createDesign('space-telescope', gameData)
    expect(designChanges(flown, other, gameData)).toEqual([{ key: 'flight.change.scenario' }])
  })
})

describe('result text', () => {
  it('stars as icons plus text, outcome translated', () => {
    expect(starsIcon(2)).toBe('★★☆')
    expect(resultLabel({ total: 640, stars: 2, outcome: 'partialSuccess' })).toEqual({
      key: 'flight.result',
      values: { total: 640, stars: 2, outcome: { key: 'flight.outcome.partialSuccess' } },
    })
  })
})
