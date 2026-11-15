import { beforeEach, describe, expect, it } from 'vitest'
import { gameData, presetFor } from '../../data'
import { createDesign, useMissionStore } from './missionStore'

describe('mission store — scenario selection', () => {
  beforeEach(() => useMissionStore.setState({ step: 'brief', design: null }))

  it('creates a baseline design for the chosen scenario', () => {
    const d = createDesign('student-cubesat', gameData, 'cadet', 'seed1')
    expect(d.scenarioId).toBe('student-cubesat')
    expect(d.seed).toBe('seed1')
    expect(Object.values(d.requirementLevels).every((l) => l === 'baseline')).toBe(true)
    expect(Object.keys(d.requirementLevels)).toHaveLength(3)
  })

  it('rejects unknown scenarios', () => {
    expect(() => createDesign('nope', gameData)).toThrow()
  })

  it('stores the selection and only leaves the brief once a scenario is picked', () => {
    const s = useMissionStore.getState()
    s.goTo('requirements')
    expect(useMissionStore.getState().step).toBe('brief')

    s.selectScenario('wildfire-eo', gameData)
    expect(useMissionStore.getState().design?.scenarioId).toBe('wildfire-eo')
    useMissionStore.getState().goTo('requirements')
    expect(useMissionStore.getState().step).toBe('requirements')
  })

  it('keeps the design when the same scenario is picked again, resets it on a switch', () => {
    const s = useMissionStore.getState()
    s.selectScenario('wildfire-eo', gameData)
    const first = useMissionStore.getState().design
    s.selectScenario('wildfire-eo', gameData)
    expect(useMissionStore.getState().design).toBe(first)
    s.selectScenario('space-telescope', gameData)
    expect(useMissionStore.getState().design?.scenarioId).toBe('space-telescope')
  })
})

describe('mission store — requirement levels (FR-2.3)', () => {
  beforeEach(() => useMissionStore.setState({ step: 'brief', design: null }))

  it('stores the chosen level per objective in MissionDesign', () => {
    const s = useMissionStore.getState()
    s.selectScenario('student-cubesat', gameData)
    s.setRequirementLevel('earthImaging', 'goal')
    s.setRequirementLevel('missionLifetime', 'threshold')
    expect(useMissionStore.getState().design?.requirementLevels).toEqual({
      earthImaging: 'goal',
      spaceWeather: 'baseline',
      missionLifetime: 'threshold',
    })
  })

  it('ignores objectives that are not in the scenario', () => {
    const s = useMissionStore.getState()
    s.selectScenario('student-cubesat', gameData)
    const before = useMissionStore.getState().design
    s.setRequirementLevel('fireDetection', 'goal')
    expect(useMissionStore.getState().design).toBe(before)
  })

  it('resets levels to baseline when the scenario changes', () => {
    const s = useMissionStore.getState()
    s.selectScenario('student-cubesat', gameData)
    s.setRequirementLevel('earthImaging', 'goal')
    s.selectScenario('wildfire-eo', gameData)
    const levels = useMissionStore.getState().design?.requirementLevels ?? {}
    expect(Object.values(levels).every((l) => l === 'baseline')).toBe(true)
    expect(Object.keys(levels)).toEqual(['fireDetection', 'burnScar', 'missionLifetime'])
  })
})

describe('mission store — instruments (FR-4.1)', () => {
  beforeEach(() => useMissionStore.setState({ step: 'brief', design: null }))

  it('every compatible instrument is selectable when no bus is chosen yet', () => {
    useMissionStore.getState().selectScenario('student-cubesat', gameData)
    for (const i of gameData.instruments) useMissionStore.getState().toggleInstrument(i.id, gameData)
    expect(useMissionStore.getState().design?.instrumentIds).toEqual([
      'inst-visible-cam',
      'inst-multispectral',
      'inst-magnetometer',
      'inst-particle',
      'inst-magnetometer-cubesat',
    ])
  })

  it('refuses incompatible instruments (FR-4.2) but always lets the player remove one', () => {
    const s = useMissionStore.getState()
    s.selectScenario('wildfire-eo', gameData)
    s.toggleInstrument('inst-telescope', gameData)
    expect(useMissionStore.getState().design?.instrumentIds).toEqual([])
    // e.g. selected before the orbit changed: still removable
    useMissionStore.setState({ design: { ...useMissionStore.getState().design!, instrumentIds: ['inst-telescope'] } })
    useMissionStore.getState().toggleInstrument('inst-telescope', gameData)
    expect(useMissionStore.getState().design?.instrumentIds).toEqual([])
  })

  it('toggles an instrument off again and drops its duty cycle', () => {
    const s = useMissionStore.getState()
    s.selectScenario('student-cubesat', gameData)
    s.toggleInstrument('inst-visible-cam', gameData)
    const d = useMissionStore.getState().design!
    expect(d.instrumentIds).toEqual(['inst-visible-cam'])
    useMissionStore.setState({ design: { ...d, dutyCycle: { 'inst-visible-cam': 0.5 } } })
    useMissionStore.getState().toggleInstrument('inst-visible-cam', gameData)
    expect(useMissionStore.getState().design?.instrumentIds).toEqual([])
    expect(useMissionStore.getState().design?.dutyCycle).toEqual({})
  })

  it('ignores unknown instruments', () => {
    const s = useMissionStore.getState()
    s.selectScenario('student-cubesat', gameData)
    s.toggleInstrument('nope', gameData)
    expect(useMissionStore.getState().design?.instrumentIds).toEqual([])
  })

  it('respects the bus class slots once a bus is chosen', () => {
    const s = useMissionStore.getState()
    s.selectScenario('student-cubesat', gameData)
    const bus = gameData.busClasses.find((b) => b.id === 'cubesat-3u')!
    useMissionStore.setState({ design: { ...useMissionStore.getState().design!, busClassId: bus.id } })
    for (const i of gameData.instruments.filter((x) => x.massKg < 2)) useMissionStore.getState().toggleInstrument(i.id, gameData)
    for (const i of gameData.instruments) useMissionStore.getState().toggleInstrument(i.id, gameData)
    expect(useMissionStore.getState().design!.instrumentIds.length).toBeLessThanOrEqual(bus.instrumentSlots)
  })

  it('payload is a step between requirements and design', () => {
    const s = useMissionStore.getState()
    s.selectScenario('student-cubesat', gameData)
    s.goTo('payload')
    expect(useMissionStore.getState().step).toBe('payload')
  })
})

describe('mission store — orbit (FR-5.1)', () => {
  beforeEach(() => useMissionStore.setState({ step: 'brief', design: null }))

  it('selects an orbit the scenario allows', () => {
    const s = useMissionStore.getState()
    s.selectScenario('wildfire-eo', gameData)
    s.selectOrbit('sso', gameData)
    expect(useMissionStore.getState().design?.orbitId).toBe('sso')
  })

  it('refuses orbits outside the scenario or unknown ids', () => {
    const s = useMissionStore.getState()
    s.selectScenario('student-cubesat', gameData)
    s.selectOrbit('l2', gameData)
    s.selectOrbit('nope', gameData)
    expect(useMissionStore.getState().design?.orbitId).toBeNull()
  })

  it('clears the altitude override when the orbit changes', () => {
    const s = useMissionStore.getState()
    s.selectScenario('wildfire-eo', gameData)
    s.selectOrbit('leo', gameData)
    useMissionStore.setState({ design: { ...useMissionStore.getState().design!, altitudeKm: 400 } })
    useMissionStore.getState().selectOrbit('sso', gameData)
    expect(useMissionStore.getState().design?.altitudeKm).toBeUndefined()
  })

  it('orbit is a step after payload', () => {
    const s = useMissionStore.getState()
    s.selectScenario('wildfire-eo', gameData)
    s.goTo('orbit')
    expect(useMissionStore.getState().step).toBe('orbit')
  })
})

describe('mission store — launcher (FR-5.4)', () => {
  beforeEach(() => useMissionStore.setState({ step: 'brief', design: null }))

  it('selects a launcher that reaches the chosen orbit', () => {
    const s = useMissionStore.getState()
    s.selectScenario('wildfire-eo', gameData)
    s.selectOrbit('sso', gameData)
    s.selectLauncher('lv-medium', gameData)
    expect(useMissionStore.getState().design?.launcherId).toBe('lv-medium')
  })

  it('refuses launchers that cannot reach the orbit or are not offered in the scenario', () => {
    const s = useMissionStore.getState()
    s.selectScenario('space-telescope', gameData)
    s.selectOrbit('l2', gameData)
    s.selectLauncher('lv-small', gameData)
    s.selectLauncher('lv-csli', gameData)
    expect(useMissionStore.getState().design?.launcherId).toBeNull()
  })

  it('drops the launcher when the new orbit is out of its reach, keeps it otherwise', () => {
    const s = useMissionStore.getState()
    s.selectScenario('space-telescope', gameData)
    s.selectOrbit('leo', gameData)
    s.selectLauncher('lv-small', gameData)
    useMissionStore.getState().selectOrbit('l2', gameData)
    expect(useMissionStore.getState().design?.launcherId).toBeNull()

    useMissionStore.getState().selectOrbit('leo', gameData)
    useMissionStore.getState().selectLauncher('lv-medium', gameData)
    useMissionStore.getState().selectOrbit('l2', gameData)
    expect(useMissionStore.getState().design?.launcherId).toBe('lv-medium')
  })
})

describe('mission store — student mode (Cadet)', () => {
  const state = () => useMissionStore.getState()
  beforeEach(() => {
    useMissionStore.setState({ screen: 'design', step: 'brief', furthest: 'brief', design: null })
  })

  it('a new mission defaults to Cadet with baseline targets', () => {
    state().selectScenario('wildfire-eo', gameData)
    expect(state().design?.difficulty).toBe('cadet')
    expect(Object.values(state().design!.requirementLevels).every((l) => l === 'baseline')).toBe(true)
  })

  it('"Use recommended targets" puts every objective back to baseline', () => {
    state().selectScenario('wildfire-eo', gameData)
    const [first, second] = Object.keys(state().design!.requirementLevels)
    state().setRequirementLevel(first!, 'goal')
    state().setRequirementLevel(second!, 'threshold')
    state().applyRecommendedTargets()
    expect(Object.values(state().design!.requirementLevels).every((l) => l === 'baseline')).toBe(true)
  })

  it('loads the starter spacecraft, keeps scenario, difficulty, targets and seed, and jumps to the Bus step', () => {
    state().selectScenario('space-telescope', gameData, 'engineer')
    const before = state().design!
    const objective = Object.keys(before.requirementLevels)[0]!
    state().setRequirementLevel(objective, 'goal')
    state().loadPreset(gameData)

    const d = state().design!
    const preset = presetFor('space-telescope')!
    expect(d).toMatchObject({
      scenarioId: 'space-telescope',
      difficulty: 'engineer',
      seed: before.seed,
      busClassId: preset.busClassId,
      componentIds: preset.componentIds,
      instrumentIds: preset.instrumentIds,
      orbitId: preset.orbitId,
      launcherId: preset.launcherId,
      groundNetworkId: preset.groundNetworkId,
      propellantKg: preset.propellantKg,
    })
    expect(d.requirementLevels[objective]).toBe('goal')
    expect(state().step).toBe('bus')
    expect(state().furthest).toBe('bus')
  })

  it('editing a loaded preset never changes the catalog preset', () => {
    state().selectScenario('student-cubesat', gameData)
    state().loadPreset(gameData)
    const snapshot = JSON.stringify(presetFor('student-cubesat'))
    state().selectPart('comms', 'com-uhf', gameData)
    state().removeInstrument('inst-visible-cam')
    expect(JSON.stringify(presetFor('student-cubesat'))).toBe(snapshot)
  })

  it('loadPreset does nothing without a design', () => {
    state().loadPreset(gameData)
    expect(state().design).toBeNull()
    expect(state().step).toBe('brief')
  })

  it('on Cadet, picking a bus auto-picks structure, thermal, computer and attitude to fit it', () => {
    state().selectScenario('wildfire-eo', gameData)
    state().selectBus('smallsat', gameData)
    expect(state().design!.componentIds).toEqual({
      structure: 'str-smallsat',
      thermal: 'thm-heaters',
      computer: 'obc-radtol',
      attitude: 'adcs-smallsat',
    })
  })

  it('on Cadet, changing the bus re-picks the auto parts and leaves the player-chosen ones alone', () => {
    state().selectScenario('student-cubesat', gameData)
    state().selectBus('cubesat-3u', gameData)
    state().selectPart('comms', 'com-sband', gameData)
    expect(state().design!.componentIds).toMatchObject({ structure: 'str-3u', computer: 'obc-cubesat' })

    state().selectBus('large', gameData)
    expect(state().design!.componentIds).toEqual({
      structure: 'str-large',
      thermal: 'thm-radiators',
      computer: 'obc-radhard',
      attitude: 'adcs-cmg',
      comms: 'com-sband',
    })
  })

  it('on Cadet, re-selecting the same bus keeps a part the player changed under advanced parts', () => {
    state().selectScenario('student-cubesat', gameData)
    state().selectBus('cubesat-3u', gameData)
    state().selectPart('attitude', 'adcs-cubesat', gameData)
    state().selectBus('cubesat-3u', gameData)
    expect(state().design!.componentIds.attitude).toBe('adcs-cubesat')
  })

  it('Engineer and Flight Director keep the full choice: nothing is auto-picked', () => {
    for (const difficulty of ['engineer', 'flightDirector'] as const) {
      useMissionStore.setState({ design: null })
      state().selectScenario('wildfire-eo', gameData, difficulty)
      state().selectBus('smallsat', gameData)
      expect(state().design!.componentIds, difficulty).toEqual({})
    }
  })

  it('switching to Cadet fills the empty auto subsystems but keeps parts already chosen', () => {
    state().selectScenario('wildfire-eo', gameData, 'engineer')
    state().selectBus('smallsat', gameData)
    state().selectPart('thermal', 'thm-cryo', gameData) // advanced: dropped on Cadet, then auto-picked
    state().selectPart('computer', 'obc-radhard', gameData) // simple: kept
    state().setDifficulty('cadet', gameData)
    expect(state().design!.componentIds).toEqual({
      structure: 'str-smallsat',
      thermal: 'thm-heaters',
      computer: 'obc-radhard',
      attitude: 'adcs-smallsat',
    })
  })
})
