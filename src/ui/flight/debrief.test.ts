import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { SCORE_MAX } from '../../engine/constants'
import en from '../../i18n/en.json'
import { POINT_ICON, SCORE_PARTS, launchFailure, scoreRows, topPoints } from './debriefView'
import type { ExplanationPoint, ScoreResult } from '../../engine/types'

const score = (over: Partial<ScoreResult> = {}): ScoreResult => ({
  total: 700,
  breakdown: { science: 300, objectives: 200, efficiency: 100, reliability: 60, collaboration: 40 },
  objectivesMet: {},
  stars: 2,
  outcome: 'partialSuccess',
  ...over,
})

describe('debrief view', () => {
  it('shows the 5 score parts, in order, with their maximum and a bar fraction', () => {
    const rows = scoreRows(score())
    expect(rows.map((r) => r.part)).toEqual([...SCORE_PARTS])
    expect(rows.map((r) => r.max)).toEqual(SCORE_PARTS.map((p) => SCORE_MAX[p]))
    expect(rows[0]).toMatchObject({ points: 300, max: 400, fraction: 0.75 })
    expect(rows.reduce((sum, r) => sum + r.points, 0)).toBe(700)
  })

  it('shows the top 3 points, each kind with its own icon', () => {
    const points: ExplanationPoint[] = ['bad', 'tip', 'good', 'good', 'bad'].map((kind) => ({ kind, text: kind }) as ExplanationPoint)
    expect(topPoints({ summary: 's', points })).toHaveLength(3)
    expect(topPoints({ summary: 's', points }).map((p) => p.kind)).toEqual(['bad', 'tip', 'good'])
    expect(new Set(Object.values(POINT_ICON)).size).toBe(3)
  })

  it('explains a failed launch (cause and lesson) and nothing else', () => {
    const design = { ...REFERENCE_DESIGNS[0]! }
    const unlucky = { ...gameData, launchers: gameData.launchers.map((l) => ({ ...l, reliability: 0 })) }
    const failure = launchFailure(design, unlucky, score({ outcome: 'failure' }))
    expect(failure?.cause).toBeTruthy()
    expect(failure?.lessons.length).toBeGreaterThan(0)
    expect(launchFailure(design, gameData, score())).toBeNull() // not a failure
    expect(launchFailure(null, gameData, score({ outcome: 'failure' }))).toBeNull()
  })

  it('has a translation for every score part and point kind', () => {
    for (const part of SCORE_PARTS) expect(en.demoFixes.debrief.part[part], part).toBeTruthy()
    for (const kind of ['good', 'bad', 'tip'] as const) expect(en.demoFixes.debrief.kind[kind], kind).toBeTruthy()
  })
})
