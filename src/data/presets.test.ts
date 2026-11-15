// Starter spacecraft (student mode): every preset must be a working, all-green-or-yellow design a
// 13-year-old can launch as-is and then tweak.
import { describe, expect, it } from 'vitest'
import { isComponentAvailable } from '../engine/rules/components'
import { evaluateObjectives } from '../engine/rules/objectives'
import { RESOURCE_KEYS, estimateBudgets } from '../engine/rules/resources'
import { validate } from '../engine/validate'
import { fullGameData, gameData, partFits, presetFor, presets } from './index'

describe('starter spacecraft (presets.json)', () => {
  it('has exactly one preset per scenario, all on Cadet', () => {
    expect(presets.map((p) => p.scenarioId).sort()).toEqual(gameData.scenarios.map((s) => s.id).sort())
    for (const p of presets) {
      expect(p.difficulty, p.scenarioId).toBe('cadet')
      expect(presetFor(p.scenarioId)).toBe(p)
    }
    expect(presetFor('nope')).toBeUndefined()
  })

  it.each(presets.map((p) => [p.scenarioId, p] as const))('%s only uses parts Cadet can see', (_id, p) => {
    for (const id of Object.values(p.componentIds)) {
      const part = gameData.components.find((c) => c.id === id)
      expect(part, id).toBeDefined()
      expect(isComponentAvailable(part!, 'cadet'), id).toBe(true)
    }
  })

  it.each(presets.map((p) => [p.scenarioId, p] as const))('%s passes validation with no error', (_id, p) => {
    expect(validate(p, gameData).filter((i) => i.severity === 'error')).toEqual([])
  })

  it.each(presets.map((p) => [p.scenarioId, p] as const))('%s has no red budget', (_id, p) => {
    const budgets = estimateBudgets(p, gameData)
    for (const key of RESOURCE_KEYS) expect(budgets[key].status, `${p.scenarioId}: ${key}`).not.toBe('red')
  })

  it.each(presets.map((p) => [p.scenarioId, p] as const))('%s reaches at least threshold on every objective', (_id, p) => {
    for (const r of evaluateObjectives(p, gameData)) expect(r.levelAchieved, `${p.scenarioId}: ${r.objectiveId}`).not.toBeNull()
  })
})

describe('part fits (partFits.json)', () => {
  // partFits describes the whole catalog; the curated gameData only shows some of these parts.
  const busIds = new Set(fullGameData.busClasses.map((b) => b.id))

  it('only names parts and bus classes that exist', () => {
    for (const [partId, buses] of Object.entries(partFits)) {
      expect(fullGameData.components.some((c) => c.id === partId), partId).toBe(true)
      for (const b of buses) expect(busIds.has(b), `${partId} -> ${b}`).toBe(true)
    }
  })
})
