// Catalog health check (SCRUM-25). Fails when the data has broken links,
// impossible values, or a scenario that no design could win.
import { describe, expect, it } from 'vitest'
import { derivedObjectives } from '../engine/rules/compatibility'
import { evaluateObjectives } from '../engine/rules/objectives'
import { RESOURCE_KEYS, estimateBudgets } from '../engine/rules/resources'
import type { MissionEvent, Station, Subsystem } from '../engine/types'
import eventsJson from './events.json'
import curated from './curated.json'
import { fullGameData as gameData, gameData as curatedData, presets } from './index'
import busClassesJson from './busClasses.json'
import componentsJson from './components.json'
import instrumentsJson from './instruments.json'
import launchersJson from './launchers.json'
import groundJson from './groundNetworks.json'
import orbitsJson from './orbits.json'
import scenariosJson from './scenarios.json'
import { designReview } from '../engine/rules/review'
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

  // The starter spacecraft (presets.json) are the reference designs: one provably winnable design per scenario.
  it('has a reference design (starter spacecraft) for every scenario', () => {
    expect(presets.map((d) => d.scenarioId).sort()).toEqual(scenarios.map((s) => s.id).sort())
  })

  it.each(presets.map((d) => [d.scenarioId, d] as const))('%s reference design has no red budget', (_id, design) => {
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
  it.each(presets.map((d) => [d.scenarioId, d] as const))('%s reference design reaches every objective', (_id, design) => {
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

// FR-3.4: an advanced part trades risk for performance
describe('simple vs advanced components (FR-3.4)', () => {
  const performance = (c: (typeof components)[number]): number => {
    switch (c.subsystem) {
      case 'battery':
        return (c.capacityWh ?? 0) / c.massKg
      case 'propulsion':
        return c.deltaVms ?? 0
      case 'comms':
        return c.dataRateKbps ?? 0
      case 'computer':
        return c.storageMb ?? 0
      case 'power':
        return -c.powerW / c.massKg
      case 'structure':
        return -c.massKg
      default:
        return 0
    }
  }

  it('has at least 3 simple options per subsystem, so Cadet always has a choice', () => {
    for (const s of SUBSYSTEMS) {
      expect(components.filter((c) => c.subsystem === s && c.tier === 'simple').length, s).toBeGreaterThanOrEqual(3)
    }
  })

  it('makes every advanced part higher performance, lower TRL and higher cost or risk', () => {
    for (const a of components.filter((c) => c.tier === 'advanced')) {
      const simple = components.filter((c) => c.subsystem === a.subsystem && c.tier === 'simple')
      const simpleTags = new Set(simple.flatMap((c) => c.tags ?? []))
      const newTag = (a.tags ?? []).some((t) => !simpleTags.has(t))
      // Parts that work without sunlight (the RTG) are advanced by capability: higher cost, no lower-TRL requirement.
      const capability = (a.tags ?? []).includes('noSunNeeded')

      expect(newTag || simple.some((c) => performance(a) > performance(c)), `${a.id}: not better than any simple option`).toBe(true)
      expect(
        a.costM > Math.min(...simple.map((c) => c.costM)) || a.reliability < Math.max(...simple.map((c) => c.reliability)),
        `${a.id}: not costlier or riskier`,
      ).toBe(true)
      if (capability) expect(a.costM, `${a.id}: a capability part should cost more`).toBeGreaterThan(Math.max(...simple.map((c) => c.costM)))
      else expect(a.trl, `${a.id}: TRL`).toBeLessThan(Math.max(...simple.map((c) => c.trl)))
    }
  })
})

// FR-3.5: repairable failures, one alarm per subsystem
describe('failure events (FR-3.5)', () => {
  const failing = SUBSYSTEMS.filter((s) => s !== 'structure')

  it('has exactly one failure-<subsystem> event per subsystem except structure, with the 4 options', () => {
    expect(gameData.events.filter((e) => e.id.startsWith('failure-')).map((e) => e.id).sort()).toEqual(
      failing.map((s) => `failure-${s}`).sort(),
    )
    for (const s of failing) {
      const event = gameData.events.find((e) => e.id === `failure-${s}`)!
      expect(event.options.map((o) => o.id), s).toEqual(['repair', 'backup', 'safeMode', 'abandon'])
      expect(event.trigger, s).toEqual({ chancePerDay: 0, requiresSubsystem: s })
      expect(event.defaultOptionId, s).toBe('abandon')
      expect(event.timerSec, s).toBe(60)
      expect(event.options.find((o) => o.id === 'repair')!.minigame, s).toBeDefined()
    }
  })

  it('only gates options with the redundant:<subsystem> tag', () => {
    for (const event of gameData.events.filter((x) => x.id.startsWith('failure-'))) {
      for (const o of event.options) {
        if (o.requiresTag !== undefined) expect(o.requiresTag, `${event.id}/${o.id}`).toBe(`redundant:${event.trigger.requiresSubsystem}`)
      }
    }
  })

  it('never rolls a failure event at random (chancePerDay 0)', () => {
    for (const e of gameData.events.filter((x) => x.id.startsWith('failure-'))) expect(e.trigger.chancePerDay, e.id).toBe(0)
  })
})

// FR-7.4 event deck
describe('event deck (FR-7.4)', () => {
  const deck = eventsJson as unknown as MissionEvent[]
  const STATIONS: Station[] = ['bridge', 'comms', 'power', 'science', 'navigation', 'engine', 'computer']
  const KEYS = ['budget', 'science', 'risk', 'health', 'propellant', 'battery', 'data']

  it('has at least 15 events, each with a station, a timer of 30-60 s, 2-3 options, a valid default and a chance above 0', () => {
    expect(deck.length).toBeGreaterThanOrEqual(15)
    expect(new Set(deck.map((e) => e.id)).size).toBe(deck.length)
    for (const e of deck) {
      expect(STATIONS, `${e.id} station`).toContain(e.station)
      expect(e.title.length, `${e.id} title`).toBeGreaterThan(0)
      expect(e.description.length, `${e.id} description`).toBeGreaterThan(0)
      expect(e.timerSec, `${e.id} timerSec`).toBeGreaterThanOrEqual(30)
      expect(e.timerSec, `${e.id} timerSec`).toBeLessThanOrEqual(60)
      expect(e.options.length, `${e.id} options`).toBeGreaterThanOrEqual(2)
      expect(e.options.length, `${e.id} options`).toBeLessThanOrEqual(3)
      for (const o of e.options) {
        expect(o.label.length, `${e.id}/${o.id} label`).toBeGreaterThan(0)
        expect(o.why.length, `${e.id}/${o.id} why`).toBeGreaterThan(0)
        expect(o.effects, `${e.id}/${o.id} effects`).toBeDefined()
      }
      expect(new Set(e.options.map((o) => o.id)).size, `${e.id} option ids`).toBe(e.options.length)
      expect(e.options.map((o) => o.id), `${e.id} default`).toContain(e.defaultOptionId)
      expect(e.trigger.chancePerDay, `${e.id} chancePerDay`).toBeGreaterThan(0)
    }
  })

  it('gives every ship station at least one event', () => {
    for (const station of STATIONS) expect(deck.some((e) => e.station === station), station).toBe(true)
  })

  it('only uses the effect keys of the conventions, with sensible sizes for the fractions', () => {
    for (const e of deck) {
      for (const o of e.options) {
        for (const [key, value] of Object.entries(o.effects)) {
          expect(KEYS, `${e.id}/${o.id} ${key}`).toContain(key)
          if (key === 'propellant' || key === 'battery' || key === 'data') expect(Math.abs(value), `${e.id}/${o.id} ${key}`).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('leaves at least one option that needs no tag, so any design can answer', () => {
    for (const e of deck) expect(e.options.some((o) => o.requiresTag === undefined), e.id).toBe(true)
  })

  it('only gates options by the thruster tag or a redundant:<subsystem> tag of the event subsystem', () => {
    for (const e of deck) {
      for (const o of e.options) {
        if (o.requiresTag === undefined) continue
        expect(['thruster', `redundant:${e.trigger.requiresSubsystem}`], `${e.id}/${o.id}`).toContain(o.requiresTag)
      }
    }
  })

  it('puts the random events first in the catalog, then the failure alarms, with no repeated id', () => {
    expect(gameData.events.slice(0, deck.length).map((e) => e.id)).toEqual(deck.map((e) => e.id))
    expect(new Set(gameData.events.map((e) => e.id)).size).toBe(gameData.events.length)
    expect(gameData.events.filter((e) => e.id.startsWith('failure-')).length).toBeGreaterThan(0)
  })
})

// FR-3.6: propellant drives delta-v and station-keeping
describe('propellant data (FR-3.6)', () => {
  it('gives every propulsion part except prop-none a specific impulse', () => {
    for (const c of components.filter((x) => x.subsystem === 'propulsion' && x.id !== 'prop-none')) {
      expect(c.ispS, `${c.id} ispS`).toBeGreaterThan(0)
    }
    expect(components.find((c) => c.id === 'prop-none')!.ispS).toBeUndefined()
  })

  it('gives every orbit a station-keeping delta-v per year, and a sensible decay lifetime where there is one', () => {
    for (const o of orbits) {
      expect(o.stationKeepingMsPerYear, `${o.id} stationKeepingMsPerYear`).toBeGreaterThanOrEqual(0)
      if (o.decayLifetimeDays !== undefined) expect(o.decayLifetimeDays, `${o.id} decayLifetimeDays`).toBeGreaterThan(0)
    }
  })

  it('gives every launch failure mode a phase, a cause, a lesson and a positive weight (FR-7.1)', () => {
    const modes = gameData.launchFailures ?? []
    expect(modes.length).toBeGreaterThanOrEqual(6)
    expect(new Set(modes.map((m) => m.id)).size).toBe(modes.length)
    const phases = ['liftoff', 'maxQ', 'stageSeparation', 'fairingSeparation', 'upperStage', 'payloadSeparation']
    for (const m of modes) {
      expect(phases, `${m.id} phase`).toContain(m.phase)
      expect(m.cause.length, `${m.id} cause`).toBeGreaterThan(0)
      expect(m.lesson.length, `${m.id} lesson`).toBeGreaterThan(0)
      expect(m.weight, `${m.id} weight`).toBeGreaterThan(0)
      expect(m.ref, `${m.id} ref`).toBeTruthy()
    }
  })

  it('tags every real propulsion component "thruster", and prop-none does not have it (FR-7.4)', () => {
    for (const c of components.filter((x) => x.subsystem === 'propulsion')) {
      expect((c.tags ?? []).includes('thruster'), c.id).toBe(c.id !== 'prop-none')
    }
  })

})

// Students make fewer, clearer choices: gameData (what the app shows) is the catalog filtered by curated.json.
describe('curated catalog (max 3 options per category)', () => {
  const cur = curatedData
  const ids = (list: { id: string }[]) => list.map((x) => x.id)

  it('keeps the full catalog complete', () => {
    expect(ids(gameData.busClasses)).toEqual(ids(busClassesJson))
    expect(ids(gameData.components)).toEqual(ids(componentsJson))
    expect(ids(gameData.instruments)).toEqual(ids(instrumentsJson))
    expect(ids(gameData.launchers)).toEqual(ids(launchersJson))
    expect(ids(gameData.groundNetworks)).toEqual(ids(groundJson))
    expect(ids(gameData.orbits)).toEqual(ids(orbitsJson))
    expect(gameData.scenarios).toEqual(scenariosJson)
  })

  it('has exactly 3 bus sizes, launchers and ground networks', () => {
    expect(cur.busClasses).toHaveLength(3)
    // Scenario-only launchers (NASA CubeSat Launch Initiative) are extra: 3 general rockets for everyone.
    expect(cur.launchers.filter((l) => !l.onlyScenarioIds)).toHaveLength(3)
    expect(cur.launchers.map((l) => l.id)).toContain('lv-csli') // NASA resource (CubeSat 101) stays visible
    expect(cur.groundNetworks).toHaveLength(3)
  })

  it('has exactly 3 parts per subsystem, at most one of them advanced', () => {
    for (const s of SUBSYSTEMS) {
      const parts = cur.components.filter((c) => c.subsystem === s)
      expect(parts, s).toHaveLength(3)
      expect(parts.filter((c) => c.tier === 'advanced').length, `${s} advanced`).toBeLessThanOrEqual(1)
      expect(parts.filter((c) => c.tier === 'simple').length, `${s} simple (Cadet)`).toBeGreaterThanOrEqual(2)
    }
    expect(cur.components).toHaveLength(24)
  })

  it('lists only ids that exist in the catalog', () => {
    const has = (list: { id: string }[], want: string[]) => want.filter((id) => !list.some((x) => x.id === id))
    expect(has(gameData.busClasses, curated.busClasses)).toEqual([])
    expect(has(gameData.components, Object.values(curated.components).flat())).toEqual([])
    expect(has(gameData.launchers, curated.launchers)).toEqual([])
    expect(has(gameData.groundNetworks, curated.groundNetworks)).toEqual([])
    expect(has(gameData.orbits, curated.orbits)).toEqual([])
    expect(has(gameData.instruments, curated.instruments)).toEqual([])
    expect(Object.keys(curated.components).sort()).toEqual([...SUBSYSTEMS].sort())
  })

  it('allows at most 3 orbits and 3 compatible instruments per scenario', () => {
    for (const s of cur.scenarios) {
      expect(s.allowedOrbitIds.length, `${s.id} orbits`).toBeGreaterThan(0)
      expect(s.allowedOrbitIds.length, `${s.id} orbits`).toBeLessThanOrEqual(3)
      for (const o of s.allowedOrbitIds) expect(cur.orbits.some((x) => x.id === o), `${s.id} -> ${o}`).toBe(true)
      const wanted = new Set(s.objectives.map((o) => o.id))
      const useful = cur.instruments.filter((i) => i.objectives.some((o) => wanted.has(o)))
      expect(useful.length, `${s.id} instruments`).toBeGreaterThan(0)
      expect(useful.length, `${s.id} instruments`).toBeLessThanOrEqual(3)
    }
  })

  it('has no unused orbits or instruments', () => {
    const usedOrbits = new Set(cur.scenarios.flatMap((s) => s.allowedOrbitIds))
    expect(ids(cur.orbits).sort()).toEqual([...usedOrbits].sort())
    const wanted = new Set(cur.scenarios.flatMap((s) => s.objectives.map((o) => o.id)))
    for (const i of cur.instruments) expect(i.objectives.some((o) => wanted.has(o)), i.id).toBe(true)
  })

  it('keeps events, rules and failure modes unchanged', () => {
    expect(cur.events).toBe(gameData.events)
    expect(cur.wavelengthRules).toBe(gameData.wavelengthRules)
    expect(cur.launchFailures).toBe(gameData.launchFailures)
  })

  it.each(REFERENCE_DESIGNS.map((d) => [d.scenarioId, d] as const))('%s reference design only uses curated ids', (_id, d) => {
    const has = (list: { id: string }[], id: string) => list.some((x) => x.id === id)
    expect(has(cur.busClasses, String(d.busClassId)), String(d.busClassId)).toBe(true)
    for (const id of Object.values(d.componentIds)) expect(has(cur.components, String(id)), String(id)).toBe(true)
    for (const id of d.instrumentIds) expect(has(cur.instruments, id), id).toBe(true)
    expect(has(cur.orbits, String(d.orbitId)), String(d.orbitId)).toBe(true)
    expect(has(cur.launchers, String(d.launcherId)), String(d.launcherId)).toBe(true)
    expect(has(cur.groundNetworks, String(d.groundNetworkId)), String(d.groundNetworkId)).toBe(true)
  })

  it.each(REFERENCE_DESIGNS.map((d) => [d.scenarioId, d] as const))('%s reference design still wins with the curated catalog', (_id, design) => {
    const scenario = cur.scenarios.find((s) => s.id === design.scenarioId)!
    expect(scenario.allowedOrbitIds, `${scenario.id}: orbit not allowed`).toContain(design.orbitId)
    const budgets = estimateBudgets(design, cur)
    for (const key of RESOURCE_KEYS) expect(budgets[key].status, `${scenario.id}: ${key} is red`).not.toBe('red')
    expect(designReview(design, cur).hardBlockers, `${scenario.id}: hard blockers`).toEqual([])
    for (const r of evaluateObjectives(design, cur)) expect(r.levelAchieved, `${scenario.id}: ${r.objectiveId}`).not.toBeNull()
  })
})

// Station tasks: optional mini-missions that earn points (kind 'task')
describe('station tasks (kind "task")', () => {
  const tasks = gameData.events.filter((e) => e.kind === 'task')

  it('has a task for every station, all in plain language', () => {
    expect(new Set(tasks.map((t) => t.station)).size).toBe(7)
    for (const t of tasks) {
      expect(t.title.length, t.id).toBeGreaterThan(5)
      expect(t.description.length, t.id).toBeGreaterThan(20)
    }
  })

  it('every task is kind "task" with a station, 2 options and a no-effect default (skip)', () => {
    for (const t of tasks) {
      expect(t.kind, t.id).toBe('task')
      expect(t.station, t.id).toBeTruthy()
      expect(t.options, t.id).toHaveLength(2)
      const def = t.options.find((o) => o.id === t.defaultOptionId)
      expect(def, `${t.id}: default option exists`).toBeDefined()
      expect(def!.effects, `${t.id}: skipping has no effect`).toEqual({})
      expect(t.timerSec, t.id).toBeGreaterThanOrEqual(45)
      expect(t.timerSec, t.id).toBeLessThanOrEqual(60)
    }
  })

  it('no other event is a task, and every alarm keeps its kind absent or "alarm"', () => {
    for (const e of gameData.events.filter((x) => x.kind !== 'task')) expect(e.kind ?? 'alarm', e.id).toBe('alarm')
  })
})
