import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { availableOptions } from '../../engine/rules/redundancy'
import en from '../../i18n/en.json'
import { alarmsAtStation, answerStation, effectChips } from './decisionView'
import type { ActiveEvent, EffectKey, MissionEvent, Station } from '../../engine/types'

const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en)
const events = gameData.events as MissionEvent[]
const alarm = (station: Station, id = `e-${station}`): ActiveEvent => ({
  event: { ...events[0]!, id, station },
  startedTick: 0,
  deadlineTick: 30,
})

describe('FR-13.5 decision pop-up — acceptance: every event in the deck has this content', () => {
  it('every event has a plain-language problem and options with a label, a why and costs', () => {
    expect(events.length).toBeGreaterThan(0)
    for (const e of events) {
      expect(e.title.length, e.id).toBeGreaterThan(3)
      expect(e.description.length, e.id).toBeGreaterThan(10)
      expect(
        e.options.some((o) => o.id === e.defaultOptionId),
        e.id,
      ).toBe(true)
      for (const o of e.options) {
        expect(o.label.length, `${e.id}/${o.id}`).toBeGreaterThan(1)
        expect(o.why.length, `${e.id}/${o.id}`).toBeGreaterThan(10)
      }
    }
  })

  it('a reference ship is offered 2–4 options for every event (2–3, plus a backup when the design has one)', () => {
    for (const design of REFERENCE_DESIGNS) {
      for (const e of events) {
        const n = availableOptions(e, design, gameData).length
        expect(n, `${design.scenarioId}/${e.id}`).toBeGreaterThanOrEqual(2)
        expect(n, `${design.scenarioId}/${e.id}`).toBeLessThanOrEqual(4)
      }
    }
  })

  it('every effect in the deck and every station has its text', () => {
    const keys = new Set(events.flatMap((e) => e.options.flatMap((o) => Object.keys(o.effects))))
    for (const k of keys) expect(lookup(`decision.effect.${k}`), k).toBeTypeOf('string')
    for (const s of ['bridge', 'comms', 'power', 'science', 'navigation', 'engine', 'computer']) {
      expect(lookup(`station.${s}`), s).toBeTypeOf('string')
    }
  })
})

describe('which station answers an alarm', () => {
  const ship: Station[] = ['bridge', 'power', 'comms']

  it('the alarm opens at its own station, not at others', () => {
    const active = [alarm('power'), alarm('comms')]
    expect(alarmsAtStation(active, 'power', ship).map((a) => a.event.station)).toEqual(['power'])
    expect(alarmsAtStation(active, 'bridge', ship)).toEqual([])
  })

  it('an alarm whose station is not on this ship is answered at the Bridge', () => {
    const engine = alarm('engine')
    expect(answerStation(engine, ship)).toBe('bridge')
    expect(alarmsAtStation([engine], 'bridge', ship)).toEqual([engine])
    expect(answerStation(alarm('power'), ship)).toBe('power')
  })
})

describe('costs and consequences as resource chips', () => {
  it('positive is good except risk; percentages for health, battery and risk', () => {
    const chips = effectChips({ health: 1, risk: 0.02, science: -5 })
    expect(chips.map((c) => [c.key, c.good])).toEqual([
      ['health', true],
      ['science', false],
      ['risk', false],
    ])
    expect(chips[0]!.label).toEqual({ key: 'decision.effect.health', values: { value: '+100%' } })
    expect(chips[2]!.label.values!.value).toBe('+2%')
    expect(chips[1]!.label.values!.value).toBe('−5')
  })

  it('budget -2 costs money (bad); zero effects are hidden; no effects gives no chips', () => {
    expect(effectChips({ budget: -2 } as Partial<Record<EffectKey, number>>)[0]!.good).toBe(false)
    expect(effectChips({ science: 0 })).toEqual([])
    expect(effectChips({})).toEqual([])
  })
})
