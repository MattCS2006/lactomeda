import { describe, expect, it } from 'vitest'
import { fullGameData as gameData } from '../data'
import { REFERENCE_DESIGNS } from '../data/referenceDesigns'
import { VALIDATORS, validate } from './validate'
import type { MissionDesign } from './types'

const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!
// An over-budget wildfire design with no ground network, a battery too small and a missing thermal part.
const broken = (): MissionDesign => {
  const d = ref('wildfire-eo')
  const componentIds = { ...d.componentIds, battery: 'bat-40' }
  delete componentIds.thermal
  return { ...d, componentIds, launcherId: 'lv-heavy', groundNetworkId: null }
}

describe('validate', () => {
  it('runs twelve rule validators', () => {
    expect(VALIDATORS).toHaveLength(12)
  })

  it('returns the union of every rule without duplicates', () => {
    const d = broken()
    const all = VALIDATORS.flatMap((rule) => rule(d, gameData))
    const result = validate(d, gameData)
    const key = (i: { code: string; subsystem?: string; resource?: string }) => `${i.code}|${i.subsystem ?? ''}|${i.resource ?? ''}`
    const unique = new Set(all.map(key))
    expect(result.map(key).sort()).toEqual([...unique].sort())
    expect(new Set(result.map(key)).size).toBe(result.length)
    const codes = result.map((i) => i.code)
    for (const code of ['MISSING_SUBSYSTEM', 'MISSING_GROUND_NETWORK', 'OVER_BUDGET', 'BATTERY_TOO_SMALL']) expect(codes).toContain(code)
  })

  it.each(REFERENCE_DESIGNS.map((d) => [d.scenarioId, d] as const))('%s reference design has no error issues', (_id, d) => {
    expect(validate(d, gameData).filter((i) => i.severity === 'error')).toEqual([])
  })
})
