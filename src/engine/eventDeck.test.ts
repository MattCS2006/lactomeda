// FR-7.4 frequency by difficulty. Kept apart from sim.test.ts: it flies hundreds of whole missions, and the draws of the
// seeded RNG make that slow, so this file runs in parallel with the rest of the suite.
import { describe, expect, it } from 'vitest'
import { gameData } from '../data'
import { REFERENCE_DESIGNS } from '../data/referenceDesigns'
import { runMission } from './sim'
import type { GameData, MissionDesign } from './types'

/**
 * A catalog with perfect parts and launchers, and a budget no mission can spend, so only the event deck is measured.
 * No event escalates (FR-13.4): the count is of random events, not of the worse ones an ignored alarm turns into.
 */
const flat: GameData = {
  ...gameData,
  events: gameData.events.map((e) => ({ ...e, escalateTo: undefined })),
  components: gameData.components.map((c) => ({ ...c, reliability: 1 })),
  launchers: gameData.launchers.map((l) => ({ ...l, reliability: 1 })),
  scenarios: gameData.scenarios.map((s) => ({ ...s, budgetM: 1_000_000 })),
}

// Fixed seeds: the same 100 for the student CubeSat and Wildfire; the Space Telescope (1825 ticks per mission) uses the first 30.
const SEEDS: Record<string, number> = { 'student-cubesat': 100, 'wildfire-eo': 100, 'space-telescope': 30 }
const average = new Map<string, number>()

function eventsPerMission(scenarioId: string, difficulty: MissionDesign['difficulty']): number {
  const key = `${scenarioId}/${difficulty}`
  if (!average.has(key)) {
    const base = REFERENCE_DESIGNS.find((d) => d.scenarioId === scenarioId)!
    const seeds = SEEDS[scenarioId]!
    let total = 0
    for (let i = 0; i < seeds; i++) {
      const state = runMission({ ...base, difficulty, seed: `deck-${i}` }, flat)
      total += state.log.filter((l) => l.kind === 'event').length
    }
    average.set(key, total / seeds)
    console.info(`${key}: ${(total / seeds).toFixed(2)} random events per mission (${seeds} seeds)`)
  }
  return average.get(key)!
}

describe('FR-7.4 events per mission', () => {
  const scenarios = Object.keys(SEEDS)

  it.each(scenarios)(
    '%s: 6 to 10 events per mission on Engineer',
    (id) => {
      expect(eventsPerMission(id, 'engineer')).toBeGreaterThanOrEqual(6)
      expect(eventsPerMission(id, 'engineer')).toBeLessThanOrEqual(10)
    },
    120_000,
  )

  it.each(scenarios)(
    '%s: about half on Cadet and about 1.5x on Flight Director',
    (id) => {
      const engineer = eventsPerMission(id, 'engineer')
      expect(eventsPerMission(id, 'cadet') / engineer).toBeGreaterThan(0.4)
      expect(eventsPerMission(id, 'cadet') / engineer).toBeLessThan(0.6)
      expect(eventsPerMission(id, 'flightDirector') / engineer).toBeGreaterThan(1.3)
      expect(eventsPerMission(id, 'flightDirector') / engineer).toBeLessThan(1.7)
    },
    120_000,
  )

  it('a short and a long mission get a similar number of events (rate scaling by mission length)', () => {
    const counts = scenarios.map((id) => eventsPerMission(id, 'engineer'))
    expect(Math.max(...counts) / Math.min(...counts)).toBeLessThan(1.5)
  }, 120_000)
})
