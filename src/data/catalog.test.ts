// Catalog health check (SCRUM-25). Fails when the data has broken links,
// impossible values, or a scenario that no design could win.
import { describe, expect, it } from 'vitest'
import { derivedObjectives } from '../engine/rules/compatibility'
import { evaluateObjectives } from '../engine/rules/objectives'
import { RESOURCE_KEYS, estimateBudgets } from '../engine/rules/resources'
import type { Subsystem } from '../engine/types'
import { gameData } from './index'
import { REFERENCE_DESIGNS } from './referenceDesigns'

const { busClasses, components, instruments, orbits, launchers, groundNetworks, scenarios } = gameData
const SUBSYSTEMS: Subsystem[] = ['structure', 'power', 'battery', 'computer', 'attitude', 'propulsion', 'thermal', 'comms']
// Objectives used by instruments for scenarios we plan to add later (Weather GEO, Lunar Orbiter).
const FUTURE_OBJECTIVES = new Set(['surfaceMapping', 'atmosphere'])

const objectiveIds = new Set(scenarios.flatMap((s) => s.objectives.map((o) => o.id)))
const orbitIds = new Set(orbits.map((o) => o.id))

describe('data catalog', () => {
  it('has unique ids in every list', () => {
    for (const list of [busClasses, components, instruments, orbits, launchers, groundNetworks, scenarios]) {
      const ids = list.map((x) => x.id)
      expect(new Set(ids).size, `duplicate id in ${ids.join(', ')}`).toBe(ids.length)
    }
  })

  it('meets the ERS minimum sizes', () => {
    expect(instruments.length).toBeGreaterThanOrEqual(10) // FR-4.1
    expect(launchers.length).toBeGreaterThanOrEqual(6) // FR-5.4
    expect(orbits.length).toBeGreaterThanOrEqual(5) // FR-5.1
    expect(scenarios.length).toBeGreaterThanOrEqual(3) // FR-2.1
    for (const s of SUBSYSTEMS) expect(components.filter((c) => c.subsystem === s).length, s).toBeGreaterThanOrEqual(3) // FR-3.2
  })

  it('only links to things that exist', () => {
    for (const i of instruments) {
      for (const o of i.objectives) expect(objectiveIds.has(o) || FUTURE_OBJECTIVES.has(o), `${i.id} -> objective ${o}`).toBe(true)
      for (const o of i.preferredOrbits) expect(orbitIds.has(o), `${i.id} -> orbit ${o}`).toBe(true)
    }
    for (const s of scenarios) for (const o of s.allowedOrbitIds) expect(orbitIds.has(o), `${s.id} -> orbit ${o}`).toBe(true)
    for (const l of launchers) for (const s of l.onlyScenarioIds ?? []) expect(scenarios.some((x) => x.id === s), `${l.id} -> scenario ${s}`).toBe(true)
  })

  it('has physically sensible values', () => {
    for (const c of components) {
      expect(c.reliability, c.id).toBeGreaterThanOrEqual(0)
      expect(c.reliability, c.id).toBeLessThanOrEqual(1)
      expect(c.trl, c.id).toBeGreaterThanOrEqual(1)
      expect(c.trl, c.id).toBeLessThanOrEqual(9)
      if (c.subsystem === 'power') expect(c.powerW, `${c.id} should generate (negative W)`).toBeLessThan(0)
      if (c.subsystem === 'battery') expect(c.capacityWh, c.id).toBeGreaterThan(0)
    }
    for (const o of orbits) {
      expect(o.eclipseFraction, o.id).toBeGreaterThanOrEqual(0)
      expect(o.eclipseFraction, o.id).toBeLessThan(1)
    }
  })

  it('every scenario can be won by at least one affordable design', () => {
    // Cheapest simple part per subsystem (propulsion optional), cheapest useful instrument,
    // smallest bus and cheapest launcher that can carry it to an allowed orbit.
    for (const s of scenarios) {
      const parts = SUBSYSTEMS.filter((x) => x !== 'propulsion').map(
        (x) => components.filter((c) => c.subsystem === x).sort((a, b) => a.costM - b.costM)[0],
      )
      const useful = instruments
        .filter((i) => i.objectives.some((o) => s.objectives.some((so) => so.id === o)))
        .sort((a, b) => a.costM - b.costM)[0]
      expect(useful, `${s.id}: no instrument serves any objective`).toBeDefined()
      const mass = parts.reduce((a, c) => a + c.massKg, 0) + useful.massKg
      const cost = parts.reduce((a, c) => a + c.costM, 0) + useful.costM
      const bus = busClasses.filter((b) => b.maxMassKg >= mass).sort((a, b) => a.baseCostM - b.baseCostM)[0]
      const cheapest = Math.min(
        ...s.allowedOrbitIds.map((oid) => {
          const regime = orbits.find((o) => o.id === oid)!.regime
          const lv = launchers
            .filter((l) => !l.onlyScenarioIds || l.onlyScenarioIds.includes(s.id))
            .filter((l) => (l.capacityKg[regime] ?? 0) >= mass)
            .sort((a, b) => a.costM - b.costM)[0]
          return lv ? cost + bus.baseCostM + lv.costM : Infinity
        }),
      )
      expect(cheapest, `${s.id}: cheapest design $${cheapest.toFixed(2)}M > budget $${s.budgetM}M`).toBeLessThanOrEqual(s.budgetM)
    }
  })

  it('has a reference design for every scenario', () => {
    expect(REFERENCE_DESIGNS.map((d) => d.scenarioId).sort()).toEqual(scenarios.map((s) => s.id).sort())
  })

  it.each(REFERENCE_DESIGNS.map((d) => [d.scenarioId, d] as const))('%s reference design has no red budget', (_id, design) => {
    const scenario = scenarios.find((s) => s.id === design.scenarioId)!
    const orbit = orbits.find((o) => o.id === design.orbitId)!
    const launcher = launchers.find((l) => l.id === design.launcherId)!

    // The design is legal for the scenario and covers its objectives.
    expect(scenario.allowedOrbitIds, `${scenario.id}: orbit not allowed`).toContain(orbit.id)
    expect(launcher.onlyScenarioIds ?? [scenario.id], `${scenario.id}: launcher not offered`).toContain(scenario.id)
    expect(launcher.capacityKg[orbit.regime] ?? 0, `${scenario.id}: ${launcher.id} cannot reach ${orbit.regime}`).toBeGreaterThan(0)
    const covered = new Set(design.instrumentIds.flatMap((id) => instruments.find((i) => i.id === id)!.objectives))
    for (const o of scenario.objectives) {
      if (o.id === 'missionLifetime') continue // met by reliability, not by an instrument
      expect(covered.has(o.id), `${scenario.id}: no instrument covers ${o.id}`).toBe(true)
    }

    const budgets = estimateBudgets(design, gameData)
    for (const key of RESOURCE_KEYS) {
      const b = budgets[key]
      expect(b.status, `${scenario.id}: ${key} is red (used ${b.used.toFixed(2)} / available ${b.available.toFixed(2)})`).not.toBe('red')
    }
  })

  // FR-4.5: every scenario objective must be reachable — the reference design reaches at least threshold on all of them.
  it.each(REFERENCE_DESIGNS.map((d) => [d.scenarioId, d] as const))('%s reference design reaches every objective', (_id, design) => {
    for (const r of evaluateObjectives(design, gameData)) {
      const shown = r.value === undefined ? 'not measurable' : `${r.value.toFixed(2)} ${r.unit}`
      expect(r.levelAchieved, `${design.scenarioId}: ${r.objectiveId} = ${shown}`).not.toBeNull()
    }
  })
})

// FR-14.8: objective -> wavelength -> instrument rules
describe('wavelength rules (FR-14.8)', () => {
  const rules = gameData.wavelengthRules ?? []

  it('gives every instrument bands, a technique and targets', () => {
    for (const i of instruments) {
      expect(i.bands?.length ?? 0, `${i.id} bands`).toBeGreaterThan(0)
      expect(i.technique, `${i.id} technique`).toBeDefined()
      expect(i.targets?.length ?? 0, `${i.id} targets`).toBeGreaterThan(0)
    }
  })

  it('has rules only for objectives that exist, and one for every instrument-driven objective', () => {
    for (const r of rules) {
      expect(objectiveIds.has(r.objectiveId) || FUTURE_OBJECTIVES.has(r.objectiveId), `rule -> objective ${r.objectiveId}`).toBe(true)
      expect(r.source, `${r.objectiveId} source`).not.toBe('')
      expect(r.why, `${r.objectiveId} why`).not.toBe('')
    }
    expect(new Set(rules.map((r) => r.objectiveId)).size).toBe(rules.length)
    for (const id of objectiveIds) {
      if (id !== 'missionLifetime') expect(rules.some((r) => r.objectiveId === id), `objective ${id} has no rule`).toBe(true)
    }
  })

  it('derives, for every instrument, the same objectives as its objectives list', () => {
    for (const i of instruments) expect([...derivedObjectives(i, gameData)].sort(), i.id).toEqual([...i.objectives].sort())
  })
})
