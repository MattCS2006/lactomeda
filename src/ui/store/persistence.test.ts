// FR-11.1 — refreshing the page does not lose progress.
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import type { MissionDesign } from '../../engine/types'
import { createDesign, useMissionStore } from './missionStore'
import { SAVE_KEY, safeStorage, sanitizeDesign } from './persistence'

// In-memory localStorage for Node (the browser has a real one)
const memory = new Map<string, string>()
const fakeLocalStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
}
const g = globalThis as { localStorage?: unknown }
const original = g.localStorage
g.localStorage = fakeLocalStorage
afterAll(() => {
  g.localStorage = original
})

const state = () => useMissionStore.getState()
/** What a page refresh does: forget the in-memory state, then load it back from storage. */
async function refresh() {
  useMissionStore.setState({ step: 'brief', design: null }, false)
  memory.set(SAVE_KEY, memory.get(SAVE_KEY) ?? '') // keep what was saved before the reset
  await useMissionStore.persist.rehydrate()
}

describe('auto-save (FR-11.1)', () => {
  beforeEach(() => {
    memory.clear()
    useMissionStore.setState({ step: 'brief', design: null })
  })

  it('acceptance: a refresh keeps the design and the current step', async () => {
    state().selectScenario('wildfire-eo', gameData)
    state().setRequirementLevel('burnScar', 'goal')
    state().toggleInstrument('inst-multispectral', gameData)
    state().goTo('payload')
    const before = state().design

    const saved = memory.get(SAVE_KEY)!
    useMissionStore.setState({ step: 'brief', design: null })
    memory.set(SAVE_KEY, saved) // the reset above must not count as the player's last action
    await useMissionStore.persist.rehydrate()

    expect(state().step).toBe('payload')
    expect(state().design).toEqual(before)
  })

  it('saves on every edit, and only the design + step (no functions)', () => {
    state().selectScenario('student-cubesat', gameData)
    const saved = JSON.parse(memory.get(SAVE_KEY)!)
    expect(Object.keys(saved.state).sort()).toEqual(['design', 'step'])
    expect(saved.state.design.scenarioId).toBe('student-cubesat')
    state().toggleInstrument('inst-visible-cam', gameData)
    expect(JSON.parse(memory.get(SAVE_KEY)!).state.design.instrumentIds).toEqual(['inst-visible-cam'])
  })

  it('a corrupt or outdated save starts fresh instead of breaking the app', async () => {
    memory.set(SAVE_KEY, '{not json')
    await useMissionStore.persist.rehydrate()
    expect(state().design).toBeNull()

    memory.set(SAVE_KEY, JSON.stringify({ state: { step: 'orbit', design: { scenarioId: 'deleted' } }, version: 1 }))
    await refresh()
    expect(state()).toMatchObject({ step: 'brief', design: null })
  })
})

describe('sanitizeDesign — saved design vs today’s catalog', () => {
  const good = (): MissionDesign => ({
    ...createDesign('wildfire-eo', gameData, 'engineer', 'abc'),
    requirementLevels: { fireDetection: 'goal', burnScar: 'threshold', missionLifetime: 'baseline' },
    instrumentIds: ['inst-multispectral', 'inst-multispectral'],
    dutyCycle: { 'inst-multispectral': 0.5 },
    orbitId: 'sso',
    launcherId: 'lv-medium',
    groundNetworkId: 'gn-commercial',
  })

  it('keeps a valid design as it is', () => {
    expect(sanitizeDesign(good(), gameData)).toEqual(good())
  })

  it('drops ids that no longer exist and repairs bad values', () => {
    const d = sanitizeDesign(
      {
        ...good(),
        instrumentIds: ['inst-multispectral', 'inst-removed'],
        dutyCycle: { 'inst-multispectral': 7, 'inst-removed': 0.5 },
        requirementLevels: { fireDetection: 'impossible' },
        launcherId: 'lv-gone',
        orbitId: 'mars', // not allowed in Wildfire
        difficulty: 'godmode',
      },
      gameData,
    )!
    expect(d.instrumentIds).toEqual(['inst-multispectral'])
    expect(d.dutyCycle).toEqual({})
    expect(d.requirementLevels).toEqual({
      fireDetection: 'baseline',
      burnScar: 'baseline',
      missionLifetime: 'baseline',
    })
    expect(d.launcherId).toBeNull()
    expect(d.orbitId).toBeNull()
    expect(d.difficulty).toBe('cadet')
  })

  it('returns null for an unknown scenario or garbage', () => {
    expect(sanitizeDesign({ ...good(), scenarioId: 'nope' }, gameData)).toBeNull()
    expect(sanitizeDesign('hello', gameData)).toBeNull()
    expect(sanitizeDesign(null, gameData)).toBeNull()
  })
})

describe('safeStorage', () => {
  it('never throws when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceeded')
      },
      removeItem: () => {
        throw new Error('SecurityError')
      },
    }
    g.localStorage = blocked
    expect(safeStorage.getItem('x')).toBeNull()
    expect(() => safeStorage.setItem('x', '1')).not.toThrow()
    expect(() => safeStorage.removeItem('x')).not.toThrow()
    g.localStorage = fakeLocalStorage
  })
})
