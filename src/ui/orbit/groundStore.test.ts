// Store actions for the ground station choice (FR-5.6). Kept in its own file to avoid merge conflicts.
import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { useMissionStore } from '../store/missionStore'

const state = () => useMissionStore.getState()

describe('mission store — ground stations (FR-5.6)', () => {
  beforeEach(() => {
    useMissionStore.setState({ step: 'brief', design: null })
    state().selectScenario('space-telescope', gameData)
  })

  it('selects a network that reaches the orbit', () => {
    state().selectOrbit('l2', gameData)
    state().selectGroundNetwork('gn-dsn', gameData)
    expect(state().design?.groundNetworkId).toBe('gn-dsn')
  })

  it('refuses networks that cannot reach the orbit, and unknown ids', () => {
    state().selectOrbit('l2', gameData)
    state().selectGroundNetwork('gn-university', gameData)
    state().selectGroundNetwork('nope', gameData)
    expect(state().design?.groundNetworkId).toBeNull()
  })

  it('drops the network when the new orbit is out of its reach, keeps it otherwise', () => {
    state().selectOrbit('leo', gameData)
    state().selectGroundNetwork('gn-university', gameData)
    state().selectOrbit('l2', gameData)
    expect(state().design?.groundNetworkId).toBeNull()

    state().selectOrbit('leo', gameData)
    state().selectGroundNetwork('gn-dsn', gameData)
    state().selectOrbit('l2', gameData)
    expect(state().design?.groundNetworkId).toBe('gn-dsn')
  })
})
