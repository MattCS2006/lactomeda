import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { DIFFICULTY_EVENT_FACTOR, MASS_CONTINGENCY } from '../../engine/constants'
import en from '../../i18n/en.json'
import { partOptions } from '../bus/busView'
import { createDesign, useMissionStore } from '../store/missionStore'
import { DIFFICULTIES, effectsOf, hintsEnabled } from './difficultyView'

const state = () => useMissionStore.getState()

describe('difficulty selection (FR-2.2)', () => {
  it('offers Cadet, Engineer and Flight Director, each with a name and a description', () => {
    expect(DIFFICULTIES).toEqual(['cadet', 'engineer', 'flightDirector'])
    for (const d of DIFFICULTIES) {
      expect(en.difficulty, d).toHaveProperty(d)
      expect(en.difficultyPicker.who, d).toHaveProperty(d)
    }
  })

  it('acceptance: changes available parts, event frequency and hints (from the engine constants)', () => {
    expect(effectsOf('cadet')).toEqual({
      advancedParts: false,
      eventFactor: DIFFICULTY_EVENT_FACTOR.cadet,
      massMarginPct: MASS_CONTINGENCY.cadet * 100,
      canAcceptRisk: false,
      hints: true,
    })
    expect(effectsOf('engineer').advancedParts).toBe(true)
    // harder = more emergencies and a bigger mass margin
    expect(effectsOf('flightDirector').eventFactor).toBeGreaterThan(effectsOf('engineer').eventFactor)
    expect(effectsOf('engineer').eventFactor).toBeGreaterThan(effectsOf('cadet').eventFactor)
    expect(effectsOf('flightDirector').massMarginPct).toBeGreaterThan(effectsOf('cadet').massMarginPct)
    expect(hintsEnabled('cadet')).toBe(true)
    expect(hintsEnabled('engineer')).toBe(false)
  })

  it('the bus screen hides advanced parts on Cadet and shows them on Engineer', () => {
    const cadet = createDesign('wildfire-eo', gameData, 'cadet', 's')
    const engineer = { ...cadet, difficulty: 'engineer' as const }
    const ids = (d: typeof cadet) => partOptions('power', d, gameData).map((p) => p.id)
    expect(ids(cadet)).not.toContain('pwr-rtg')
    expect(ids(engineer)).toContain('pwr-rtg')
    expect(partOptions('power', cadet, gameData).every((p) => !p.advanced)).toBe(true)
  })
})

describe('mission store — difficulty', () => {
  beforeEach(() => {
    useMissionStore.setState({ screen: 'design', step: 'brief', furthest: 'brief', design: null })
    state().selectScenario('wildfire-eo', gameData)
  })

  it('a new mission starts on Cadet; the choice is stored in the design', () => {
    expect(state().design?.difficulty).toBe('cadet')
    state().setDifficulty('flightDirector', gameData)
    expect(state().design?.difficulty).toBe('flightDirector')
  })

  it('switching to Cadet removes advanced parts it does not offer, keeps the rest', () => {
    state().setDifficulty('engineer', gameData)
    state().selectPart('power', 'pwr-rtg', gameData) // advanced
    state().selectPart('comms', 'com-sband', gameData) // simple
    expect(state().design?.componentIds).toEqual({ power: 'pwr-rtg', comms: 'com-sband' })
    state().setDifficulty('cadet', gameData)
    expect(state().design?.componentIds).toEqual({ comms: 'com-sband' })
  })

  it('the difficulty is kept when switching scenario', () => {
    state().setDifficulty('engineer', gameData)
    state().selectScenario('space-telescope', gameData)
    expect(state().design?.difficulty).toBe('engineer')
  })
})
