import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import type { MissionDesign } from '../../engine/types'
import en from '../../i18n/en.json'
import { componentOptions, SUBSYSTEMS } from '../../engine/rules/components'
import { createDesign } from '../store/missionStore'
import { SEGMENTS, SEGMENT_TARGET, segmentDone, segmentOfStep, segmentReport } from './segments'

const text = (key: string) =>
  key
    .split('.')
    .reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), en)

const fresh = (): MissionDesign => createDesign('wildfire-eo', gameData, 'cadet', 's')
const full = (): MissionDesign => ({
  ...fresh(),
  busClassId: 'smallsat',
  componentIds: Object.fromEntries(SUBSYSTEMS.map((s) => [s, componentOptions(s, gameData)[0].id])),
  instrumentIds: ['inst-multispectral', 'inst-multispectral', 'inst-thermal-ir'],
  orbitId: 'sso',
  launcherId: 'lv-medium',
  groundNetworkId: 'gn-commercial',
  requirementLevels: { fireDetection: 'goal', burnScar: 'baseline', missionLifetime: 'threshold' },
})

describe('mission segments (FR-14.5)', () => {
  it('has the four NASA segments, each with a tab name', () => {
    expect(SEGMENTS).toEqual(['launch', 'space', 'ground', 'user'])
    for (const s of SEGMENTS) expect(typeof text(`segments.name.${s}`), s).toBe('string')
  })

  it('acceptance: each segment has its own tab target and its own report section', () => {
    const report = segmentReport(full(), gameData)
    for (const s of SEGMENTS) {
      expect(SEGMENT_TARGET[s].step, s).toBeTruthy()
      expect(report[s].length, s).toBeGreaterThan(0)
      for (const line of report[s]) expect(typeof text(line.label), line.label).toBe('string')
    }
    // Launch and Ground tabs jump to their section on the Phase 5 screen
    expect(SEGMENT_TARGET.launch).toEqual({ step: 'orbit', anchor: 'launcher-heading' })
    expect(SEGMENT_TARGET.ground).toEqual({ step: 'orbit', anchor: 'ground-heading' })
  })

  it('maps screens to segments', () => {
    expect(segmentOfStep('brief')).toBeNull()
    expect(segmentOfStep('requirements')).toBe('user')
    expect(segmentOfStep('payload')).toBe('space')
    expect(segmentOfStep('bus')).toBe('space')
  })

  it('marks segments done as the design fills in', () => {
    const d = fresh()
    for (const s of SEGMENTS) expect(segmentDone(s, d, 'brief'), s).toBe(false)
    expect(segmentDone('user', d, 'payload')).toBe(true)
    const f = full()
    expect(segmentDone('launch', f, 'orbit')).toBe(true)
    expect(segmentDone('space', f, 'orbit')).toBe(true)
    expect(segmentDone('ground', f, 'orbit')).toBe(true)
    expect(segmentDone('space', { ...f, busClassId: null }, 'orbit')).toBe(false)
  })

  it('the report describes the design in each segment', () => {
    const r = segmentReport(full(), gameData)
    const value = (seg: keyof typeof r, label: string) => r[seg].find((l) => l.label === label)!.value
    expect(value('launch', 'segments.line.launcher').values?.text).toMatch(/Medium launcher/)
    expect(value('space', 'segments.line.instruments').values?.text).toBe(
      'Multispectral imager ×2 · Thermal infrared camera',
    )
    expect(value('ground', 'segments.line.network').values?.text).toBe('Commercial ground network')
    // the user segment says who uses the data and lists each objective with its level
    expect(value('user', 'segments.line.users')).toEqual({ key: 'segments.users.wildfire-eo' })
    expect(r.user.filter((l) => l.label === 'segments.line.objective')).toHaveLength(3)
  })

  it('missing choices read "Not chosen yet"', () => {
    const r = segmentReport(fresh(), gameData)
    expect(r.launch[0].value).toEqual({ key: 'segments.notChosen' })
    expect(r.space[0].value).toEqual({ key: 'segments.notChosen' })
  })

  it('every scenario says who uses its data', () => {
    for (const s of gameData.scenarios) expect(typeof text(`segments.users.${s.id}`), s.id).toBe('string')
  })
})
