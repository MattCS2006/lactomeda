import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import type { MissionDesign } from '../../engine/types'
import en from '../../i18n/en.json'
import { componentOptions, SUBSYSTEMS } from '../../engine/rules/components'
import { createDesign, useMissionStore } from '../store/missionStore'
import { CML_ITEMS, CML_LEVELS, STEP_CML, debriefCmlLabel, maturity } from './maturity'

const fresh = (): MissionDesign => createDesign('wildfire-eo', gameData, 'cadet', 's')
/** A complete bus: smallsat + the lightest part for each subsystem. */
const bus = {
  busClassId: 'smallsat',
  componentIds: Object.fromEntries(SUBSYSTEMS.map((s) => [s, componentOptions(s, gameData)[0].id])),
}
const withPayloadOrbit = (): MissionDesign => ({
  ...fresh(),
  instrumentIds: ['inst-multispectral'],
  orbitId: 'sso',
  launcherId: 'lv-medium',
  groundNetworkId: 'gn-commercial',
})
const text = (key: string) =>
  key
    .split('.')
    .reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), en)

describe('JPL Concept Maturity Levels (FR-14.3)', () => {
  it('labels phases: Brief = CML 1, Requirements = CML 2, Payload/Orbit = CML 3', () => {
    expect(STEP_CML).toMatchObject({ brief: 1, requirements: 2, bus: 3, payload: 3, orbit: 3 })
    expect(en.phase.brief).toContain('CML 1')
    expect(en.phase.requirements).toContain('CML 2')
    expect(en.phase.payload).toContain('CML 3')
    expect(en.phase.orbit).toContain('CML 3')
  })

  it('every level and item has a name', () => {
    for (const level of CML_LEVELS) {
      expect(typeof text(`cml.name.${level}`)).toBe('string')
      for (const item of CML_ITEMS[level]) expect(typeof text(`cml.item.${item}`), item).toBe('string')
    }
  })

  it('acceptance: the meter rises as each phase completes', () => {
    expect(maturity(null, 'brief', gameData).reached).toBe(0)
    // scenario picked → CML 1
    expect(maturity(fresh(), 'brief', gameData).reached).toBe(1)
    // requirements confirmed (moved on past them) → CML 2
    expect(maturity(fresh(), 'payload', gameData).reached).toBe(2)
    // payload + orbit/launch done but no bus yet → CML 3 shows 2 of 3, still CML 2
    const m = maturity(withPayloadOrbit(), 'orbit', gameData)
    expect(m.reached).toBe(2)
    expect(m.levels[2].items).toEqual([
      { item: 'bus', done: false },
      { item: 'payload', done: true },
      { item: 'orbitLaunch', done: true },
    ])
    // a bus size alone is not enough: every subsystem needs a part
    expect(maturity({ ...withPayloadOrbit(), busClassId: 'smallsat' }, 'orbit', gameData).reached).toBe(2)
    // bus + all subsystems → CML 3
    expect(maturity({ ...withPayloadOrbit(), ...bus }, 'orbit', gameData).reached).toBeGreaterThanOrEqual(3)
  })

  it('a level only counts when every level below is done', () => {
    // CML 3 items done but requirements never confirmed → still CML 1
    expect(maturity({ ...withPayloadOrbit(), ...bus }, 'brief', gameData).reached).toBe(1)
  })

  it('CML 4 needs the engine design review to allow launch', () => {
    expect(maturity(withPayloadOrbit(), 'design', gameData).levels[3].done).toBe(false)
  })

  it('the debrief reports the CML reached', () => {
    expect(debriefCmlLabel(2)).toEqual({ key: 'cml.debrief', values: { level: 2, name: { key: 'cml.name.2' } } })
    expect(debriefCmlLabel(0)).toEqual({ key: 'cml.debriefNone' })
  })
})

describe('mission store — furthest step', () => {
  const state = () => useMissionStore.getState()
  beforeEach(() => useMissionStore.setState({ step: 'brief', furthest: 'brief', design: null }))

  it('remembers the furthest step, even after going back', () => {
    state().selectScenario('wildfire-eo', gameData)
    state().goTo('requirements')
    state().goTo('payload')
    state().goTo('requirements')
    expect(state()).toMatchObject({ step: 'requirements', furthest: 'payload' })
  })

  it('a new scenario starts its maturity again', () => {
    state().selectScenario('wildfire-eo', gameData)
    state().goTo('payload')
    state().selectScenario('student-cubesat', gameData)
    expect(state().furthest).toBe('brief')
  })
})
