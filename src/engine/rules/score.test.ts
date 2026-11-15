import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { SCORE_MAX } from '../constants'
import { initSim, resolveEvent, runMission, simulateTick } from '../sim'
import type { GameData, MissionDesign, MissionEvent } from '../types'
import { score, scoreDetails } from './score'

const ref = (id: string): MissionDesign => ({ ...REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!, seed: 'reference' })
const fly = (d: MissionDesign, data: GameData = gameData) => runMission(d, data)
const points = (d: MissionDesign, data: GameData = gameData) =>
  Object.fromEntries(scoreDetails(fly(d, data), d, data).map((x) => [x.component, x.points]))

const alarm = (timerSec: number): MissionEvent => ({
  id: 'alarm',
  station: 'power',
  title: 'Test alarm',
  description: 'Test event.',
  timerSec,
  options: [{ id: 'fix', label: 'Fix it', why: 'Fixes it.', effects: {} }],
  defaultOptionId: 'fix',
  trigger: { chancePerDay: 1 },
})
const withEvents = (events: MissionEvent[]): GameData => ({ ...gameData, events })

describe('scoreDetails', () => {
  it('returns the 5 components with their maximum points, agreeing with score().breakdown', () => {
    for (const d of REFERENCE_DESIGNS.map((x) => ref(x.scenarioId))) {
      const state = fly(d)
      const details = scoreDetails(state, d, gameData)
      expect(details.map((x) => x.component)).toEqual(['science', 'objectives', 'efficiency', 'reliability', 'collaboration'])
      expect(details.map((x) => x.max)).toEqual([400, 250, 150, 100, 100])
      expect(SCORE_MAX.science + SCORE_MAX.objectives + SCORE_MAX.efficiency + SCORE_MAX.reliability + SCORE_MAX.collaboration).toBe(1000)

      const result = score(state, d, gameData)
      for (const x of details) {
        expect(result.breakdown[x.component]).toBe(x.points)
        expect(x.points).toBeGreaterThanOrEqual(0)
        expect(x.points).toBeLessThanOrEqual(x.max)
        expect(x.fraction).toBeCloseTo(x.points / x.max, 12)
        expect(Object.keys(x.inputs).length).toBeGreaterThan(0)
      }
      const sum = details.reduce((a, x) => a + x.points, 0)
      expect(result.total).toBe(Math.round(sum))
      expect(result.total).toBeGreaterThan(0)
      expect(result.total).toBeLessThanOrEqual(1000)
    }
  })

  it('matches the hand computation for the student CubeSat', () => {
    const d = ref('student-cubesat')
    const state = fly(d)
    expect(state).toMatchObject({ status: 'success', endReason: 'lifetimeReached', day: 365 })
    const p = points(d)
    // science: payload 20 vs target 0.5 x (earthImaging best 35 + spaceWeather best 20 + lifetime 0) = 27.5
    expect(p.science).toBeCloseTo(Math.round(400 * (state.science / 27.5) * 10) / 10, 1)
    // objectives: 3 objectives all met at the threshold level (weight 0.6) over the full mission: 250 x 0.6
    expect(p.objectives).toBe(150)
    // efficiency: only the budget margin (13.5%) is under the 20% target: 150 x (5 + 0.675) / 6
    expect(p.efficiency).toBeCloseTo(141.9, 1)
    expect(p.reliability).toBe(100)
    expect(p.collaboration).toBe(100)
  })

  it('reports each reference design flown to the end', () => {
    for (const d of REFERENCE_DESIGNS.map((x) => ref(x.scenarioId))) {
      const result = score(fly(d), d, gameData)
      expect(result.outcome).toBe('fullSuccess')
      expect(result.total).toBeGreaterThanOrEqual(700)
    }
  })
})

describe('objectives (FR-2.4)', () => {
  it('gives more points for a higher chosen level that is reached', () => {
    const base = ref('space-telescope')
    const goal = { ...base, requirementLevels: { deepSky: 'goal' as const } }
    expect(points(goal).objectives).toBeGreaterThan(points(base).objectives)
    // deepSky goes from weight 0.6 to 1.0: +250/3 x 0.4
    expect(points(goal).objectives - points(base).objectives).toBeCloseTo((250 / 3) * 0.4, 1)
  })

  it('penalises an objective missed at the chosen level but reached at a lower one', () => {
    const base = ref('student-cubesat')
    const missed = { ...base, requirementLevels: { earthImaging: 'goal' as const } } // only baseline is reached
    // weights: earthImaging 0.8 x 0.5 = 0.4, the other two 0.6 each
    expect(points(missed).objectives).toBeCloseTo((250 / 3) * (0.4 + 0.6 + 0.6), 1)
    expect(score(fly(missed), missed, gameData).objectivesMet.earthImaging).toBe('baseline')
    expect(score(fly(missed), missed, gameData).outcome).toBe('partialSuccess')
  })

  it('scores fewer objective points when the mission ends early', () => {
    const d = ref('student-cubesat')
    const tight: GameData = { ...gameData, scenarios: gameData.scenarios.map((s) => ({ ...s, budgetM: 1.69 })) } // 1.68 M is spent before launch, so the 0.05 M/yr operations run it out after ~73 days
    const early = fly(d, tight)
    expect(early.endReason).toBe('budgetExhausted')
    expect(early.day).toBeLessThan(365)
    const result = score(early, d, tight)
    expect(points(d, tight).objectives).toBeLessThan(points(d).objectives)
    expect(result.outcome).toBe('failure')
    expect(result.stars).toBeLessThanOrEqual(1)
  })
})

describe('launch failure', () => {
  it('scores no reliability and no objectives, and is a failure', () => {
    const broken: GameData = { ...gameData, launchers: gameData.launchers.map((l) => ({ ...l, reliability: 0 })) }
    const d = ref('student-cubesat')
    const state = fly(d, broken)
    expect(state.endReason).toBe('launchFailure')
    const result = score(state, d, broken)
    expect(result.breakdown.reliability).toBe(0)
    expect(result.breakdown.objectives).toBe(0)
    expect(result.breakdown.science).toBe(0)
    expect(result.outcome).toBe('failure')
    expect(result.stars).toBeLessThanOrEqual(1)
    expect(Object.values(result.objectivesMet).every((v) => v === null)).toBe(true)
    expect(Object.keys(result.objectivesMet)).toHaveLength(3)
  })
})

describe('efficiency', () => {
  it('drops when a resource goes red', () => {
    const d = ref('wildfire-eo')
    const over = { ...d, launcherId: 'lv-heavy' } // over budget: the cost budget turns red
    expect(points(over).efficiency).toBeLessThan(points(d).efficiency)
    const detail = scoreDetails(fly(over), over, gameData).find((x) => x.component === 'efficiency')!
    expect(detail.inputs.budget).toBe(0)
  })
})

describe('collaboration (solo: decision quality)', () => {
  const design = ref('student-cubesat')

  it('is 100 when no event fired', () => {
    expect(points(design).collaboration).toBe(100)
  })

  it('is 100 when every event that fired was resolved in time', () => {
    const data = withEvents([alarm(100)])
    let state = simulateTick(initSim(design, data), design, data)
    state = resolveEvent(state, 'alarm', 'fix', design, data)
    expect(state.activeEvents).toEqual([])
    const detail = scoreDetails(state, design, data).find((x) => x.component === 'collaboration')!
    expect(detail.inputs).toEqual({ fired: 1, resolved: 1 })
    expect(detail.points).toBe(100)
  })

  it('is 0 when every event that fired timed out', () => {
    const data = withEvents([alarm(4)]) // 2 ticks to answer
    let state = initSim(design, data)
    for (let i = 0; i < 3; i++) state = simulateTick(state, design, data)
    expect(state.log.some((l) => l.text.includes('timed out'))).toBe(true)
    const detail = scoreDetails(state, design, data).find((x) => x.component === 'collaboration')!
    expect(detail.inputs.resolved).toBe(0)
    expect(detail.inputs.fired).toBeGreaterThan(0)
    expect(detail.points).toBe(0)
  })

  it('is the share of events resolved in time', () => {
    const data = withEvents([alarm(100)])
    let state = initSim(design, data)
    state = simulateTick(state, design, data)
    state = resolveEvent(state, 'alarm', 'fix', design, data)
    state = simulateTick(state, design, data) // a second alarm fires and stays unanswered
    const detail = scoreDetails(state, design, data).find((x) => x.component === 'collaboration')!
    expect(detail.inputs).toEqual({ fired: 2, resolved: 1 })
    expect(detail.points).toBe(50)
  })

  it('does not count a warning about an unknown event as a decision', () => {
    const data = withEvents([alarm(100)])
    let state = simulateTick(initSim(design, data), design, data)
    state = resolveEvent(state, 'nope', 'fix', design, data)
    expect(scoreDetails(state, design, data).find((x) => x.component === 'collaboration')!.inputs.resolved).toBe(0)
  })
})

describe('determinism and purity', () => {
  it('gives an identical ScoreResult for the same design and seed', () => {
    const d = ref('wildfire-eo')
    expect(score(fly(d), d, gameData)).toEqual(score(fly(d), d, gameData))
  })

  it('does not mutate its inputs', () => {
    const d = ref('wildfire-eo')
    const state = fly(d)
    const snaps = [JSON.stringify(state), JSON.stringify(d), JSON.stringify(gameData)]
    score(state, d, gameData)
    scoreDetails(state, d, gameData)
    expect([JSON.stringify(state), JSON.stringify(d), JSON.stringify(gameData)]).toEqual(snaps)
  })
})
