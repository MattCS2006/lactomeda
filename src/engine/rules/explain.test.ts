import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { TASK_LOG_DONE } from '../constants'
import { initSim, runMission } from '../sim'
import type { GameData, MissionDesign, SimState } from '../types'
import { explain } from './explain'

const ref = (id: string): MissionDesign => ({ ...REFERENCE_DESIGNS.find((d) => d.scenarioId === id)! })
const perfect = (g: GameData): GameData => ({ ...g, components: g.components.map((c) => ({ ...c, reliability: 1 })) })
const quiet = (g: GameData): GameData => ({ ...g, events: g.events.filter((e) => e.id.startsWith('failure-')) })
const calm = perfect(quiet(gameData))

const ended = (state: SimState, over: Partial<SimState>): SimState => ({ ...state, status: 'failed', ...over })

describe('explain (FR-10.3)', () => {
  it('a success: summary, at least one point, good points first, numbers attached', () => {
    const design = ref('student-cubesat')
    const state = runMission(design, calm)
    const e = explain(design, state, calm)
    expect(state.status).toBe('success')
    expect(e.summary).not.toBe('')
    expect(e.points.length).toBeGreaterThanOrEqual(1)
    expect(e.points[0]!.kind).toBe('good')
    expect(e.points.some((p) => p.value !== undefined && p.unit !== undefined)).toBe(true)
  })

  it('a launch failure: the cause is the top problem, followed by a tip with the lesson', () => {
    const design = ref('student-cubesat')
    const unlucky: GameData = { ...gameData, launchers: gameData.launchers.map((l) => ({ ...l, reliability: 0 })) }
    const state = initSim(design, unlucky)
    expect(state.endReason).toBe('launchFailure')
    const e = explain(design, state, unlucky)
    expect(e.summary).toMatch(/launch failed/i)
    expect(e.points[0]!.kind).toBe('bad')
    expect(e.points[0]!.text).toMatch(/launch failed/i)
    expect(e.points[1]!.kind).toBe('tip')
    expect(e.points[1]!.text.length).toBeGreaterThan(10)
    // a failed launch never blames the objectives
    expect(e.points.some((p) => /Goal missed/.test(p.text))).toBe(false)
  })

  it('a critical failure: names the lost subsystem and suggests a backup', () => {
    const design = ref('student-cubesat')
    const base = initSim(design, calm)
    const state = ended(base, {
      endReason: 'criticalFailure',
      day: 40,
      log: [...base.log, { tick: 40, day: 40, kind: 'failure', text: 'Critical failure: the power subsystem is lost.' }],
    })
    const e = explain(design, state, calm)
    expect(e.points[0]!.kind).toBe('bad')
    expect(e.points[0]!.subsystem).toBe('power')
    expect(e.points[0]!.text).toMatch(/power system/)
    expect(e.points[1]!.kind).toBe('tip')
    expect(e.points[1]!.text).toMatch(/backup/i)
    expect(explain({ ...design, redundant: ['power'] }, state, calm).points[1]!.text).not.toMatch(/^Add a backup/)
  })

  it('budget exhausted: the money problem comes first', () => {
    const design = ref('student-cubesat')
    const state = ended(initSim(design, calm), { endReason: 'budgetExhausted', spentM: 99 })
    const e = explain(design, state, calm)
    expect(e.points[0]).toMatchObject({ kind: 'bad', resource: 'budget', value: 99, unit: '$M' })
  })

  it('an orbit that sank early is reported with a fuel tip', () => {
    const design = ref('student-cubesat')
    const state = ended(initSim(design, calm), { status: 'success', endReason: 'lifetimeReached', day: 100 })
    const e = explain(design, state, calm)
    expect(e.points[0]!.text).toMatch(/sank back/)
    expect(e.points[1]!.kind).toBe('tip')
  })

  it('a design with no instrument: the top problem is the missed goals, with a tip', () => {
    const design = { ...ref('student-cubesat'), instrumentIds: [] }
    const state = runMission(design, calm)
    const e = explain(design, state, calm)
    expect(e.points[0]!.kind).toBe('bad')
    expect(e.points[0]!.text).toMatch(/Goal missed/)
    expect(e.points[1]!.kind).toBe('tip')
  })

  it('counts finished tasks as good points and ignores skipped ones', () => {
    const design = ref('student-cubesat')
    const base = runMission(design, calm)
    const done = { ...base, log: [...base.log, { tick: 3, day: 3, kind: 'info' as const, text: `${TASK_LOG_DONE}Calibrate the antenna.` }] }
    expect(explain(design, done, calm).points.some((p) => /optional task/.test(p.text))).toBe(true)
    expect(explain(design, base, calm).points.some((p) => /optional task/.test(p.text))).toBe(false)
  })

  it('is deterministic and never mutates its inputs', () => {
    const design = ref('wildfire-eo')
    const state = runMission(design, calm)
    const before = JSON.stringify([design, state])
    expect(explain(design, state, calm)).toEqual(explain(design, state, calm))
    expect(JSON.stringify([design, state])).toBe(before)
  })

  it('works before flying (no state)', () => {
    const e = explain(ref('space-telescope'), null, gameData)
    expect(e.summary).not.toBe('')
    expect(e.points.length).toBeGreaterThanOrEqual(1)
  })
})
