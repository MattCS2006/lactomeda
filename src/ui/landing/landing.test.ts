import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import en from '../../i18n/en.json'
import { useMissionStore } from '../store/missionStore'
import { COMING_SOON, HOW_TO_PLAY_STEPS, MENU_ENTRIES, isAvailable } from './landingView'

const state = () => useMissionStore.getState()

describe('landing screen (FR-1.1)', () => {
  it('offers the 5 entries of the ERS, in order, each with a name and a hint', () => {
    expect(MENU_ENTRIES).toEqual(['solo', 'createRoom', 'joinRoom', 'sandbox', 'howToPlay'])
    for (const e of MENU_ENTRIES) {
      expect(en.landing.entry, e).toHaveProperty(e)
      expect(en.landing.hint, e).toHaveProperty(e)
    }
  })

  it('Play Solo and How to Play work today; unbuilt modes are marked "Soon" with a reason', () => {
    expect(isAvailable('solo')).toBe(true)
    expect(isAvailable('howToPlay')).toBe(true)
    for (const e of COMING_SOON) expect(MENU_ENTRIES).toContain(e)
    expect(en.landing.soon).toBeTruthy()
    expect(en.landing.soonReason).toBeTruthy()
  })

  it('How to Play has a text for every step', () => {
    for (const s of HOW_TO_PLAY_STEPS) expect(en.landing.howTo, s).toHaveProperty(s)
  })
})

describe('mission store — landing ↔ design', () => {
  beforeEach(() => useMissionStore.setState({ screen: 'landing', step: 'brief', furthest: 'brief', design: null }))

  it('the game opens on the landing screen', () => {
    expect(state().screen).toBe('landing')
  })

  it('Play Solo opens the design flow; Menu goes back and keeps the design', () => {
    state().openDesign()
    expect(state().screen).toBe('design')
    state().selectScenario('wildfire-eo', gameData)
    state().openLanding()
    expect(state().screen).toBe('landing')
    expect(state().design?.scenarioId).toBe('wildfire-eo') // "Continue mission" can resume it
  })
})
