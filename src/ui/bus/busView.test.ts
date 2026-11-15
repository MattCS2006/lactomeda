import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { componentOptions } from '../../engine/rules/components'
import type { MissionDesign } from '../../engine/types'
import en from '../../i18n/en.json'
import { createDesign, useMissionStore } from '../store/missionStore'
import {
  SUBSYSTEMS,
  busComplete,
  busIssues,
  partOptions,
  powerLabel,
  rateLabel,
  storageLabel,
  toBusCard,
} from './busView'

const text = (key: string) =>
  key
    .split('.')
    .reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), en)
const part = (id: string) => gameData.components.find((c) => c.id === id)!
const orbit = (id: string) => gameData.orbits.find((o) => o.id === id)!
const fresh = (): MissionDesign => createDesign('student-cubesat', gameData, 'cadet', 's')
const allLightest = (d: MissionDesign): MissionDesign => ({
  ...d,
  componentIds: Object.fromEntries(SUBSYSTEMS.map((s) => [s, componentOptions(s, gameData)[0].id])),
})

describe('bus screen (FR-3.1, FR-3.2)', () => {
  it('offers every bus class with mass limit, cost and slots', () => {
    expect(gameData.busClasses.length).toBeGreaterThanOrEqual(6)
    const card = toBusCard(gameData.busClasses.find((b) => b.id === 'cubesat-3u')!)
    expect(card).toMatchObject({ instrumentSlots: 2, componentSlots: 9 })
    expect(card.maxMass).toEqual({ key: 'units.kg', values: { value: '6' } })
  })

  it('acceptance: ≥ 3 options per subsystem, each with mass, power, cost, reliability and TRL', () => {
    for (const s of SUBSYSTEMS) {
      const options = partOptions(s, fresh(), gameData)
      expect(options.length, s).toBeGreaterThanOrEqual(3)
      for (const p of options) {
        expect(p.mass.key, p.id).toBe('units.kg')
        expect(p.power.key, p.id).toMatch(/^bus\.power\./)
        expect(p.cost.key, p.id).toMatch(/^units\.money/)
        expect(p.reliabilityPct, p.id).toBeGreaterThan(0)
        expect(p.trl, p.id).toBeGreaterThanOrEqual(1)
      }
      expect(typeof text(`subsystem.${s}.name`), s).toBe('string')
      expect(typeof text(`subsystem.${s}.what`), s).toBe('string')
    }
  })

  it('solar panels show what they make in the chosen orbit (less at Mars), the RTG does not change', () => {
    expect(powerLabel(part('pwr-deploy'), null)).toEqual({ key: 'bus.power.generates', values: { value: '36' } })
    expect(powerLabel(part('pwr-deploy'), orbit('mars'))).toEqual({
      key: 'bus.power.generates',
      values: { value: '15.6' },
    })
    expect(powerLabel(part('pwr-rtg'), orbit('mars'))).toEqual({ key: 'bus.power.generates', values: { value: '110' } })
    expect(powerLabel(part('com-sband'), null)).toEqual({ key: 'bus.power.uses', values: { value: '8' } })
    expect(powerLabel(part('str-3u'), null)).toEqual({ key: 'bus.power.none' })
  })

  it('shows each part’s special stat in readable units', () => {
    expect(rateLabel(9.6)).toEqual({ key: 'units.kbps', values: { value: '9.6' } })
    expect(rateLabel(100000)).toEqual({ key: 'units.mbps', values: { value: '100' } })
    expect(rateLabel(1000000)).toEqual({ key: 'units.gbps', values: { value: '1' } })
    expect(storageLabel(8000)).toEqual({ key: 'units.gb', values: { value: '1' } })
    expect(storageLabel(1000000)).toEqual({ key: 'units.gb', values: { value: '125' } })
  })

  it('translates every engine check this screen can show', () => {
    const d = {
      ...allLightest(fresh()),
      busClassId: 'cubesat-1u',
      instrumentIds: ['inst-multispectral', 'inst-visible-cam'],
    }
    const issues = busIssues(d, gameData)
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(['TOO_MANY_INSTRUMENTS', 'OVER_BUS_MASS']))
    for (const i of issues) expect(typeof text(i.label.key), i.code).toBe('string')
    for (const code of ['MISSING_SUBSYSTEM', 'UNKNOWN_COMPONENT', 'WRONG_SUBSYSTEM', 'LOW_SOLAR_POWER'])
      expect(typeof text(`issues.${code}`), code).toBe('string')
  })

  it('is complete with a bus and a part for all 8 subsystems', () => {
    expect(busComplete(fresh())).toBe(false)
    expect(busComplete({ ...fresh(), busClassId: 'cubesat-3u' })).toBe(false)
    expect(busComplete({ ...allLightest(fresh()), busClassId: 'cubesat-3u' })).toBe(true)
  })
})

describe('mission store — bus and parts', () => {
  const state = () => useMissionStore.getState()
  beforeEach(() => {
    useMissionStore.setState({ step: 'brief', furthest: 'brief', design: null })
    state().selectScenario('student-cubesat', gameData)
  })

  it('selects a bus class and a part per subsystem', () => {
    state().selectBus('cubesat-3u', gameData)
    state().selectPart('comms', 'com-sband', gameData)
    expect(state().design).toMatchObject({ busClassId: 'cubesat-3u', componentIds: { comms: 'com-sband' } })
  })

  it('ignores unknown buses, unknown parts and parts from another subsystem', () => {
    state().selectBus('nope', gameData)
    state().selectPart('comms', 'nope', gameData)
    state().selectPart('comms', 'bat-40', gameData)
    expect(state().design).toMatchObject({ busClassId: null, componentIds: {} })
  })

  it('the bus is a step between requirements and payload', () => {
    state().goTo('bus')
    expect(state().step).toBe('bus')
  })
})
