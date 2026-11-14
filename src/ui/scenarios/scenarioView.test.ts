import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import en from '../../i18n/en.json'
import { durationLabel, moneyLabel, recommendedDifficulty, toScenarioCard } from './scenarioView'

const cards = gameData.scenarios.map((s) => toScenarioCard(s, gameData))
const byId = Object.fromEntries(cards.map((c) => [c.id, c]))

/** Resolve 'a.b' against en.json so tests fail if a key is missing. */
function keyExists(key: string): boolean {
  let node: unknown = en
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string'
}

describe('scenario picker cards (FR-2.1)', () => {
  it('shows the 3 MVP scenarios from scenarios.json', () => {
    expect(cards.map((c) => c.id)).toEqual(expect.arrayContaining(['student-cubesat', 'wildfire-eo', 'space-telescope']))
  })

  it('every card has objective, destination, budget, deadline and difficulty', () => {
    for (const c of cards) {
      expect(c.objectives.length, c.id).toBeGreaterThan(0)
      expect(c.orbitNames.length, c.id).toBeGreaterThan(0)
      for (const key of [
        `destination.${c.destination}`,
        `difficulty.${c.difficulty}`,
        c.budget.key,
        c.deadline.key,
        c.duration.key,
      ]) {
        expect(keyExists(key), `${c.id}: missing i18n key ${key}`).toBe(true)
      }
    }
  })

  it('derives the destination from the main orbit', () => {
    expect(byId['student-cubesat'].destination).toBe('earth')
    expect(byId['space-telescope'].destination).toBe('l2')
  })

  it('formats money and durations readably', () => {
    expect(moneyLabel(2)).toEqual({ key: 'units.moneyM', values: { value: 2 } })
    expect(moneyLabel(1000)).toEqual({ key: 'units.moneyB', values: { value: 1 } })
    expect(moneyLabel(1500)).toEqual({ key: 'units.moneyB', values: { value: '1.5' } })
    expect(durationLabel(540)).toEqual({ key: 'units.months', values: { count: 18 } })
    expect(durationLabel(1460)).toEqual({ key: 'units.years', values: { count: 4 } })
    expect(durationLabel(45)).toEqual({ key: 'units.days', values: { count: 45 } })
  })

  it('recommends harder difficulty for bigger missions', () => {
    expect(recommendedDifficulty(2)).toBe('cadet')
    expect(recommendedDifficulty(120)).toBe('engineer')
    expect(recommendedDifficulty(1000)).toBe('flightDirector')
  })
})
