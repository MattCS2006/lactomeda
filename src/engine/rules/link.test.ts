import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REF_DISTANCE_DEEP_SPACE_KM, REF_DISTANCE_KM } from '../constants'
import type { MissionDesign } from '../types'
import { linkBudget, validateLink } from './link'
import { estimateBudgets } from './resources'
import { cubesatDesign } from './testDesign'

// 3U CubeSat, S-band (1000 kbps), SSO (2000 km, 50 min/day), university network (x1), visible camera (2000 Mb/day)
const design = (over: Partial<MissionDesign> = {}, comms: string | null = 'com-sband'): MissionDesign => {
  const d = cubesatDesign({
    orbitId: 'sso',
    groundNetworkId: 'gn-university',
    instrumentIds: ['inst-visible-cam'],
    ...over,
  })
  const componentIds = { ...d.componentIds }
  if (comms === null) delete componentIds.comms
  else componentIds.comms = comms
  return { ...d, componentIds }
}
const withMultiplier = (id: string, multiplier: number) => ({
  ...gameData,
  groundNetworks: gameData.groundNetworks.map((g) => (g.id === id ? { ...g, contactMultiplier: multiplier } : g)),
})

describe('linkBudget', () => {
  it('gives downlink and generated data in Mb/day that match the formula by hand', () => {
    const b = linkBudget(design(), gameData)
    // 1000 kbps = 1 Mb/s = 60 Mb/min; x 50 min x factor min(1, (2000/2000)^2) = 1
    expect(b.rateKbps).toBe(1000)
    expect(b.contactMinPerDay).toBe(50)
    expect(b.distanceKm).toBe(2000)
    expect(b.referenceDistanceKm).toBe(REF_DISTANCE_KM)
    expect(b.distanceFactor).toBe(1)
    expect(b.inRange).toBe(true)
    expect(b.downlinkMbPerDay).toBe(3000)
    expect(b.generatedMbPerDay).toBe(2000)
    expect(b.deliveredMbPerDay).toBe(2000)
    expect(b.marginMbPerDay).toBe(1000)
    expect(b.contactMinNeeded).toBeCloseTo(2000 / 60, 9)
  })

  it('doubles the downlink when the contact multiplier doubles, up to the 1440 min cap', () => {
    const one = linkBudget(design(), withMultiplier('gn-university', 1))
    const two = linkBudget(design(), withMultiplier('gn-university', 2))
    expect(two.downlinkMbPerDay).toBeCloseTo(2 * one.downlinkMbPerDay, 9)
    const capped = linkBudget(design(), withMultiplier('gn-university', 1000))
    expect(capped.contactMinPerDay).toBe(1440)
    expect(capped.downlinkMbPerDay).toBe(60 * 1440)
  })

  it('lowers the distance factor and the downlink for a farther orbit', () => {
    const near = linkBudget(design({ groundNetworkId: 'gn-commercial' }), gameData)
    const far = linkBudget(design({ orbitId: 'meo', groundNetworkId: 'gn-commercial' }), gameData)
    expect(far.distanceFactor).toBeCloseTo((REF_DISTANCE_KM / 25000) ** 2, 12)
    expect(far.distanceFactor).toBeLessThan(near.distanceFactor)
    expect(far.downlinkMbPerDay).toBeLessThan(near.downlinkMbPerDay)
    expect(far.downlinkMbPerDay).toBeCloseTo(60 * 300 * 4 * far.distanceFactor, 9) // meo 300 min x commercial x4
  })

  it('uses the deep-space reference distance for a deepSpace antenna', () => {
    const s = linkBudget(design({ orbitId: 'l2', groundNetworkId: 'gn-nen' }), gameData)
    const hga = linkBudget(design({ orbitId: 'l2', groundNetworkId: 'gn-nen' }, 'com-hga'), gameData)
    expect(s.referenceDistanceKm).toBe(REF_DISTANCE_KM)
    expect(hga.referenceDistanceKm).toBe(REF_DISTANCE_DEEP_SPACE_KM)
    expect(hga.distanceFactor).toBe(1) // 1.5 million km is inside 400 million km
    expect(s.distanceFactor).toBeCloseTo((REF_DISTANCE_KM / 1.5e6) ** 2, 15)
  })

  it('is out of range for the university network at l2 or mars, and in range for the DSN', () => {
    for (const orbitId of ['l2', 'mars']) {
      const b = linkBudget(design({ orbitId }), gameData)
      expect(b.inRange).toBe(false)
      expect(b.downlinkMbPerDay).toBe(0)
      expect(b.contactMinPerDay).toBe(0)
      expect(validateLink(design({ orbitId }), gameData).map((i) => i.code)).toContain('GROUND_NETWORK_OUT_OF_RANGE')
      const dsn = design({ orbitId, groundNetworkId: 'gn-dsn' })
      expect(linkBudget(dsn, gameData).inRange).toBe(true)
      expect(validateLink(dsn, gameData).map((i) => i.code)).not.toContain('GROUND_NETWORK_OUT_OF_RANGE')
    }
    const issue = validateLink(design({ orbitId: 'mars' }), gameData).find((i) => i.code === 'GROUND_NETWORK_OUT_OF_RANGE')!
    expect(issue).toMatchObject({ severity: 'error', resource: 'comms' })
    expect(issue.message).toContain('3000')
    expect(issue.message).toContain('225000000')
  })

  it('warns about a bottleneck when more is generated than can be downlinked', () => {
    const d = design({}, 'com-uhf') // 9.6 kbps -> 28.8 Mb/day
    const b = linkBudget(d, gameData)
    expect(b.downlinkMbPerDay).toBeCloseTo(28.8, 9)
    expect(b.deliveredMbPerDay).toBeCloseTo(28.8, 9)
    expect(b.marginMbPerDay).toBeCloseTo(28.8 - 2000, 9)
    const w = validateLink(d, gameData).find((i) => i.code === 'DOWNLINK_BOTTLENECK')!
    expect(w).toMatchObject({ severity: 'warning', resource: 'data' })
    expect(w.message).toBe('Generating 2000 Mb/day but can only downlink 28.8 Mb/day.')
    expect(validateLink(design(), gameData)).toEqual([])
  })

  it('halves the generated data at a 0.5 duty cycle', () => {
    expect(linkBudget(design({ dutyCycle: { 'inst-visible-cam': 0.5 } }), gameData).generatedMbPerDay).toBe(1000)
  })

  it('reports missing comms, network or orbit without throwing', () => {
    const noComms = design({}, null)
    expect(linkBudget(noComms, gameData)).toMatchObject({ rateKbps: 0, downlinkMbPerDay: 0, contactMinNeeded: Infinity })
    expect(validateLink(noComms, gameData)).toContainEqual(expect.objectContaining({ code: 'NO_COMMS', severity: 'error', subsystem: 'comms' }))

    const noNet = design({ groundNetworkId: null })
    expect(linkBudget(noNet, gameData)).toMatchObject({ contactMinPerDay: 0, downlinkMbPerDay: 0, inRange: false })
    expect(validateLink(noNet, gameData).map((i) => i.code)).toContain('MISSING_GROUND_NETWORK')

    const noOrbit = design({ orbitId: null })
    expect(linkBudget(noOrbit, gameData)).toMatchObject({ distanceKm: 0, downlinkMbPerDay: 0 })
    expect(() => validateLink(noOrbit, gameData)).not.toThrow()
  })
})

describe('single source of truth', () => {
  it('estimateBudgets data and comms come from linkBudget', () => {
    for (const d of [design(), design({ orbitId: 'meo', groundNetworkId: 'gn-commercial' }), design({ orbitId: 'mars' })]) {
      const link = linkBudget(d, gameData)
      const budgets = estimateBudgets(d, gameData)
      expect(budgets.data.available).toBe(link.downlinkMbPerDay)
      expect(budgets.data.used).toBe(link.generatedMbPerDay)
      expect(budgets.comms.available).toBe(link.contactMinPerDay)
    }
  })
})

describe('purity', () => {
  it('does not mutate the design or the data', () => {
    const d = design({ dutyCycle: { 'inst-visible-cam': 0.5 } })
    const dSnap = JSON.stringify(d)
    const gSnap = JSON.stringify(gameData)
    linkBudget(d, gameData)
    validateLink(d, gameData)
    expect(JSON.stringify(d)).toBe(dSnap)
    expect(JSON.stringify(gameData)).toBe(gSnap)
  })
})
