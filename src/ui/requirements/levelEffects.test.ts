import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import type { Objective, RequirementLevel } from '../../engine/types'
import en from '../../i18n/en.json'
import {
  LEVEL_SCORE_MULTIPLIER,
  formatMultiplier,
  pressuredResources,
  resourcesFor,
  scorePotential,
  tighteningVsBaseline,
} from './levelEffects'

const scenario = (id: string) => gameData.scenarios.find((s) => s.id === id)!
const objective = (s: string, o: string): Objective => scenario(s).objectives.find((x) => x.id === o)!
const allObjectives = gameData.scenarios.flatMap((s) => s.objectives)

describe('requirement level effects (FR-2.4)', () => {
  it('higher levels always raise the score multiplier', () => {
    expect(LEVEL_SCORE_MULTIPLIER.threshold).toBeLessThan(LEVEL_SCORE_MULTIPLIER.baseline)
    expect(LEVEL_SCORE_MULTIPLIER.baseline).toBeLessThan(LEVEL_SCORE_MULTIPLIER.goal)
  })

  it('score potential is the average of the chosen levels', () => {
    expect(scorePotential({})).toBe(1)
    expect(scorePotential({ a: 'baseline', b: 'baseline' })).toBe(1)
    expect(scorePotential({ a: 'goal', b: 'goal', c: 'goal' })).toBe(1.3)
    expect(scorePotential({ a: 'goal', b: 'baseline', c: 'threshold' })).toBe(1.03)
  })

  it('raising any level never lowers the score potential', () => {
    const order: RequirementLevel[] = ['threshold', 'baseline', 'goal']
    for (let i = 0; i < order.length - 1; i++) {
      expect(scorePotential({ a: order[i + 1], b: 'baseline' })).toBeGreaterThan(scorePotential({ a: order[i], b: 'baseline' }))
    }
  })

  it('goal is stricter and threshold easier than baseline for every objective in the catalog', () => {
    for (const o of allObjectives) {
      expect(tighteningVsBaseline(o, 'goal').direction, o.id).toBe('stricter')
      expect(tighteningVsBaseline(o, 'threshold').direction, o.id).toBe('easier')
      expect(tighteningVsBaseline(o, 'baseline')).toEqual({ direction: 'same', factor: 1 })
    }
  })

  it('computes the factor in the right direction per metric', () => {
    // resolution: 60 m -> 30 m is twice as demanding
    expect(tighteningVsBaseline(objective('student-cubesat', 'earthImaging'), 'goal')).toEqual({ direction: 'stricter', factor: 2 })
    // data: 50 -> 200 Mb/day is 4x more
    expect(tighteningVsBaseline(objective('student-cubesat', 'spaceWeather'), 'goal')).toEqual({ direction: 'stricter', factor: 4 })
    // lifetime: 180 -> 90 days is 2x easier
    expect(tighteningVsBaseline(objective('student-cubesat', 'missionLifetime'), 'threshold')).toEqual({ direction: 'easier', factor: 2 })
  })

  it('lists which resources get harder, only for objectives above baseline', () => {
    const objs = scenario('student-cubesat').objectives
    const base = Object.fromEntries(objs.map((o) => [o.id, 'baseline' as const]))
    expect(pressuredResources(objs, base)).toEqual([])
    expect(pressuredResources(objs, { ...base, spaceWeather: 'goal' })).toEqual(['data', 'comms', 'power'])
    expect(pressuredResources(objs, { ...base, spaceWeather: 'threshold' })).toEqual([])
  })

  it('every metric in the catalog maps to resources that have a name', () => {
    for (const o of allObjectives) {
      const rs = resourcesFor(o.metric)
      expect(rs.length, o.metric).toBeGreaterThan(0)
      for (const r of rs) expect(en.resource).toHaveProperty(r)
    }
  })

  it('formats multipliers', () => {
    expect(formatMultiplier(1)).toBe('1.0')
    expect(formatMultiplier(1.3)).toBe('1.3')
    expect(formatMultiplier(1.03)).toBe('1.03')
  })
})
