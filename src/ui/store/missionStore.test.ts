import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '../../data'
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
