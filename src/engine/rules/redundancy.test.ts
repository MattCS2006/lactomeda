import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { RADIATION_FACTOR } from '../constants'
import type { Component, MissionDesign } from '../types'
import { validate } from '../validate'
import { SUBSYSTEMS, selectedComponent } from './components'
import { designReview } from './review'
import { estimateBudgets } from './resources'
import {
  availableOptions,
  canMakeRedundant,
  dailyFailureProbability,
  designTags,
  toggleRedundancy,
  validateRedundancy,
} from './redundancy'

const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!
const wildfire = (): MissionDesign => ref('wildfire-eo') // smallsat: plenty of slots
const comp = (id: string): Component => gameData.components.find((c) => c.id === id)!

describe('canMakeRedundant / toggleRedundancy', () => {
  it('adds and removes a backup, returning a new design', () => {
    const d = wildfire()
    const copy = structuredClone(d)
    const on = toggleRedundancy(d, 'comms', gameData)
    expect(on.redundant).toEqual([...d.redundant, 'comms'])
    expect(d).toEqual(copy)
    expect(canMakeRedundant(on, 'comms', gameData)).toEqual({ allowed: true }) // can be switched back off
    expect(toggleRedundancy(on, 'comms', gameData).redundant).toEqual(d.redundant)
  })

  it('refuses structure, a subsystem without a component and a full bus', () => {
    const d = wildfire()
    expect(canMakeRedundant(d, 'structure', gameData)).toEqual({ allowed: false, reason: 'NOT_ALLOWED' })
    expect(() => toggleRedundancy(d, 'structure', gameData)).toThrow()

    const componentIds = { ...d.componentIds }
    delete componentIds.thermal
    const bare = { ...d, componentIds }
    expect(canMakeRedundant(bare, 'thermal', gameData)).toEqual({ allowed: false, reason: 'NO_COMPONENT' })
    expect(() => toggleRedundancy(bare, 'thermal', gameData)).toThrow()

    const cube = ref('student-cubesat') // 3U bus: its slots are already used by the 8 components
    const full = { ...cube, busClassId: 'cubesat-1u' }
    expect(canMakeRedundant(full, 'comms', gameData)).toEqual({ allowed: false, reason: 'NO_SLOT' })
    expect(() => toggleRedundancy(full, 'comms', gameData)).toThrow()
  })

  it('adds mass, cost and reliability (the backup is counted by the existing budgets)', () => {
    const d = wildfire()
    const on = toggleRedundancy(d, 'comms', gameData)
    const a = estimateBudgets(d, gameData)
    const b = estimateBudgets(on, gameData)
    expect(b.mass.used).toBeGreaterThan(a.mass.used)
    expect(b.budget.used).toBeGreaterThan(a.budget.used)
    expect(b.time.available).toBeGreaterThan(a.time.available)
  })
})

describe('designTags', () => {
  it('includes component tags and redundant:<subsystem>, and drops a backup already in use', () => {
    const d = { ...wildfire(), redundant: ['comms' as const] }
    const tags = designTags(d, gameData)
    expect(tags).toContain('redundant:comms')
    for (const t of selectedComponent(d, 'computer', gameData)?.tags ?? []) expect(tags).toContain(t)
    expect(designTags(d, gameData, { backupsUsed: [] })).toContain('redundant:comms')
    expect(designTags(d, gameData, { backupsUsed: ['comms'] })).not.toContain('redundant:comms')
    expect(designTags(wildfire(), gameData)).not.toContain('redundant:comms')
  })
})

describe('availableOptions', () => {
  const event = gameData.events.find((e) => e.id === 'failure-comms')!
  const ids = (d: MissionDesign, state?: { backupsUsed: ['comms'] | [] }) => availableOptions(event, d, gameData, state).map((o) => o.id)

  it('hides the backup option unless the subsystem is redundant with an unused backup', () => {
    expect(ids(wildfire())).toEqual(['repair', 'safeMode', 'abandon'])
    const redundant = { ...wildfire(), redundant: ['comms' as const] }
    expect(ids(redundant)).toEqual(['repair', 'backup', 'safeMode', 'abandon'])
    expect(ids(redundant, { backupsUsed: [] })).toContain('backup')
    expect(ids(redundant, { backupsUsed: ['comms'] })).not.toContain('backup')
  })

  it('offers an option whose tag is on an installed component', () => {
    const tagged = { ...event, options: [{ ...event.options[0], id: 'rad', requiresTag: 'radHard' }] }
    const d = { ...wildfire(), componentIds: { ...wildfire().componentIds, computer: 'obc-radhard' } }
    expect(availableOptions(tagged, d, gameData).map((o) => o.id)).toEqual(['rad'])
    expect(availableOptions(tagged, wildfire(), gameData).map((o) => o.id)).toEqual(['rad']) // wildfire uses obc-radtol, also radHard
    const cube = { ...ref('student-cubesat') } // obc-cubesat is not radHard
    expect(availableOptions(tagged, cube, gameData)).toEqual([])
  })
})

describe('dailyFailureProbability', () => {
  const d = wildfire()
  const orbit = gameData.orbits.find((o) => o.id === d.orbitId)!
  const days = gameData.scenarios.find((s) => s.id === d.scenarioId)!.durationDays

  it('follows 1 - exp(-lambda) with lambda = -ln(r_eff) / durationDays', () => {
    const c = comp('com-xband') // not radHard
    const r = c.reliability ** RADIATION_FACTOR[orbit.radiation]
    const p = dailyFailureProbability(c, d, gameData)
    expect(p).toBeCloseTo(1 - Math.exp(Math.log(r) / days), 12)
    // over the whole mission the chance of at least one failure is 1 - r_eff
    expect(1 - (1 - p) ** days).toBeCloseTo(1 - r, 9)
  })

  it('is higher with high radiation and ignores radiation for radHard parts', () => {
    const c = comp('com-xband')
    const high = gameData.orbits.find((o) => o.radiation === 'high')!
    const low = gameData.orbits.find((o) => o.radiation === 'low')!
    expect(dailyFailureProbability(c, { ...d, orbitId: high.id }, gameData)).toBeGreaterThan(
      dailyFailureProbability(c, { ...d, orbitId: low.id }, gameData),
    )
    const hard = comp('obc-radhard')
    expect(dailyFailureProbability(hard, { ...d, orbitId: high.id }, gameData)).toBe(
      dailyFailureProbability(hard, { ...d, orbitId: low.id }, gameData),
    )
  })

  it('is 0 for a perfect part and 1 for a part that cannot work', () => {
    expect(dailyFailureProbability({ ...comp('com-xband'), reliability: 1 }, d, gameData)).toBe(0)
    expect(dailyFailureProbability({ ...comp('com-xband'), reliability: 0 }, d, gameData)).toBe(1)
  })
})

describe('validateRedundancy', () => {
  it('flags a backup for structure or for a subsystem with no component, in validate() and the review', () => {
    const d = wildfire()
    const bad = { ...d, redundant: ['structure' as const] }
    const issues = validateRedundancy(bad, gameData)
    expect(issues).toEqual([expect.objectContaining({ code: 'REDUNDANCY_NOT_ALLOWED', severity: 'error', subsystem: 'structure' })])
    expect(validate(bad, gameData).map((i) => i.code)).toContain('REDUNDANCY_NOT_ALLOWED')
    expect(designReview(bad, gameData).disciplines.find((x) => x.discipline === 'structures')!.findings.map((f) => f.code)).toContain(
      'REDUNDANCY_NOT_ALLOWED',
    )

    const componentIds = { ...d.componentIds }
    delete componentIds.thermal
    expect(validateRedundancy({ ...d, componentIds, redundant: ['thermal'] }, gameData)).toHaveLength(1)
  })

  it('has no issue for every other subsystem or for the reference designs', () => {
    for (const d of REFERENCE_DESIGNS) expect(validateRedundancy(d, gameData)).toEqual([])
    for (const s of SUBSYSTEMS.filter((x) => x !== 'structure')) {
      expect(validateRedundancy({ ...wildfire(), redundant: [s] }, gameData), s).toEqual([])
    }
  })
})

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const d = { ...wildfire(), redundant: ['comms' as const] }
    const snaps = [JSON.stringify(d), JSON.stringify(gameData)]
    canMakeRedundant(d, 'power', gameData)
    toggleRedundancy(d, 'power', gameData)
    designTags(d, gameData, { backupsUsed: ['comms'] })
    availableOptions(gameData.events[0], d, gameData)
    dailyFailureProbability(comp('com-xband'), d, gameData)
    validateRedundancy(d, gameData)
    expect([JSON.stringify(d), JSON.stringify(gameData)]).toEqual(snaps)
  })
})
