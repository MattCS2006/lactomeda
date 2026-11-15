// FR-4.3 on the Payload screen: extra copies of an instrument, using the engine's science rule.
import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { marginalScience, payloadScience } from '../../engine/rules/science'
import en from '../../i18n/en.json'
import { createDesign, useMissionStore } from '../store/missionStore'
import { copiesOf, nextCopy, payloadTotals } from './payloadView'

const MS = 'inst-multispectral' // science 35
const IR = 'inst-thermal-ir' // science 30
const design = (...instrumentIds: string[]) => ({
  ...createDesign('wildfire-eo', gameData, 'cadet', 's'),
  instrumentIds,
})
const state = () => useMissionStore.getState()

describe('payload science totals use the engine rule (FR-4.3)', () => {
  it('totals science with diminishing returns, other resources in full', () => {
    const d = design(MS, MS, IR)
    const totals = payloadTotals(d, gameData)
    expect(totals.science).toBe(payloadScience(d, gameData))
    expect(totals.science).toBe(35 + 17.5 + 30)
    expect(totals).toMatchObject({
      count: 3,
      massKg: 25 + 25 + 15,
      powerW: 60 + 60 + 40,
    })
  })

  it('the next copy shows marginalScience: full, half, quarter', () => {
    expect(nextCopy(design(), MS, gameData)).toEqual({
      value: 35,
      have: 0,
      pct: 100,
    })
    expect(nextCopy(design(MS), MS, gameData)).toEqual({
      value: marginalScience(design(MS), MS, gameData),
      have: 1,
      pct: 50,
    })
    expect(nextCopy(design(MS, MS), MS, gameData)).toEqual({
      value: 8.75,
      have: 2,
      pct: 25,
    })
    expect(copiesOf(design(MS, IR, MS), MS)).toBe(2)
  })

  it('has the one/other texts for the marginal science line', () => {
    expect(en.payload).toHaveProperty('marginal_one')
    expect(en.payload).toHaveProperty('marginal_other')
  })
})

describe('mission store — instrument copies (FR-4.3)', () => {
  beforeEach(() => {
    useMissionStore.setState({ step: 'brief', design: null })
    state().selectScenario('wildfire-eo', gameData)
  })

  it('"Add another" adds a second copy; clicking the card still removes every copy', () => {
    state().toggleInstrument(MS, gameData)
    state().addInstrument(MS, gameData)
    expect(state().design?.instrumentIds).toEqual([MS, MS])
    state().toggleInstrument(MS, gameData)
    expect(state().design?.instrumentIds).toEqual([])
  })

  it('"Remove one" removes a single copy and keeps the duty cycle while a copy is left', () => {
    useMissionStore.setState({
      design: {
        ...state().design!,
        instrumentIds: [MS, IR, MS],
        dutyCycle: { [MS]: 0.5 },
      },
    })
    state().removeInstrument(MS)
    expect(state().design?.instrumentIds).toEqual([MS, IR])
    expect(state().design?.dutyCycle).toEqual({ [MS]: 0.5 })
    state().removeInstrument(MS)
    expect(state().design?.instrumentIds).toEqual([IR])
    expect(state().design?.dutyCycle).toEqual({})
    state().removeInstrument('inst-sar') // not on board: no change
    expect(state().design?.instrumentIds).toEqual([IR])
  })

  it('each copy uses a bus slot', () => {
    const bus = gameData.busClasses.find((b) => b.instrumentSlots === 2)!
    useMissionStore.setState({
      design: { ...state().design!, busClassId: bus.id },
    })
    state().addInstrument(IR, gameData)
    state().addInstrument(IR, gameData)
    state().addInstrument(IR, gameData)
    expect(state().design?.instrumentIds).toEqual([IR, IR])
  })

  it('copies of incompatible instruments are refused', () => {
    state().addInstrument('inst-telescope', gameData)
    expect(state().design?.instrumentIds).toEqual([])
  })
})
