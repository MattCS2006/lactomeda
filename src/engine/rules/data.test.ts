import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import type { GameData, MissionDesign } from '../types'
import { dataBudget, validateData } from './data'

const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!
const codes = (d: MissionDesign, data: GameData = gameData) => validateData(d, data).map((i) => i.code)
const withComputer = (d: MissionDesign, computer: string | null): MissionDesign => {
  const componentIds = { ...d.componentIds }
  if (computer === null) delete componentIds.computer
  else componentIds.computer = computer
  return { ...d, componentIds }
}
const withDuration = (id: string, days: number): GameData => ({
  ...gameData,
  scenarios: gameData.scenarios.map((s) => (s.id === id ? { ...s, durationDays: days } : s)),
})

// Student CubeSat on the 9.6 kbps UHF radio: generated 2050 Mb/day (camera 2000 + magnetometer 50) vs
// downlink 9.6 kbps = 0.576 Mb/min x 50 min/day = 28.8 Mb/day. Storage 8000 Mb (obc-cubesat), 365-day mission.
const lossy = (): MissionDesign => ({ ...ref('student-cubesat'), componentIds: { ...ref('student-cubesat').componentIds, comms: 'com-uhf' } })
const G = 2050
const D = 28.8
const E = G - D
const T = 365

describe('dataBudget', () => {
  it('reports the % of data lost, matching (E x T - S) / (G x T) x 100 by hand', () => {
    const b = dataBudget(lossy(), gameData)
    expect(b.generatedMbPerDay).toBeCloseTo(G, 9)
    expect(b.downlinkMbPerDay).toBeCloseTo(D, 9)
    expect(b.excessMbPerDay).toBeCloseTo(E, 9)
    expect(b.storageMb).toBe(8000)
    expect(b.lostMb).toBeCloseTo(E * T - 8000, 6)
    expect(b.generatedMissionMb).toBeCloseTo(G * T, 6)
    expect(b.lostPercent).toBeGreaterThan(0)
    expect(b.lostPercent).toBeCloseTo(((E * T - 8000) / (G * T)) * 100, 9)
    expect(b.daysUntilStorageFull).toBeCloseTo(8000 / E, 9)
    expect(b.steadyStateLostPercent).toBeCloseTo((E / G) * 100, 9)
    expect(codes(lossy())).toContain('DATA_LOSS')
    const issue = validateData(lossy(), gameData).find((i) => i.code === 'DATA_LOSS')!
    expect(issue).toMatchObject({ severity: 'warning', resource: 'data' })
    expect(issue.message).toContain("of the mission's data will be lost")
    expect(issue.message).toContain('storage fills after 4 days')
  })

  it('loses nothing when generated <= downlink', () => {
    const b = dataBudget(ref('student-cubesat'), gameData)
    expect(b.excessMbPerDay).toBe(0)
    expect(b.lostMb).toBe(0)
    expect(b.lostPercent).toBe(0)
    expect(b.steadyStateLostPercent).toBe(0)
    expect(b.daysUntilStorageFull).toBeNull()
    expect(codes(ref('student-cubesat'))).not.toContain('DATA_LOSS')
  })

  it('loses less with more storage, and nothing once storage holds E x T', () => {
    const small = dataBudget(lossy(), gameData)
    const big = dataBudget(withComputer(lossy(), 'obc-radtol'), gameData) // 256000 Mb
    expect(big.lostPercent).toBeLessThan(small.lostPercent)
    expect(big.daysUntilStorageFull!).toBeGreaterThan(small.daysUntilStorageFull!)
    const huge = dataBudget(withComputer(lossy(), 'obc-radhard'), gameData) // 1,000,000 Mb >= E x T = 737,738 Mb
    expect(huge.storageMb).toBeGreaterThanOrEqual(E * T)
    expect(huge.lostMb).toBe(0)
    expect(huge.lostPercent).toBe(0)
    expect(codes(withComputer(lossy(), 'obc-radhard'))).not.toContain('DATA_LOSS')
  })

  it('loses a higher % on a longer mission with the same G, D and S', () => {
    const base = dataBudget(lossy(), gameData)
    const long = dataBudget(lossy(), withDuration('student-cubesat', 3 * 365))
    expect(long.missionDays).toBe(3 * 365)
    expect(long.lostPercent).toBeGreaterThan(base.lostPercent)
    expect(long.lostPercent).toBeCloseTo(((E * 3 * T - 8000) / (G * 3 * T)) * 100, 9)
    expect(long.lostPercent).toBeLessThanOrEqual(long.steadyStateLostPercent)
  })

  it('warns when storage cannot hold one day of data between ground passes', () => {
    // Wildfire EO: 55000 Mb/day, the SSO contact is only 50 min/day (university network), so ~53 GB on board.
    const small = withComputer(ref('wildfire-eo'), 'obc-cubesat') // 8000 Mb
    const b = dataBudget(small, gameData)
    expect(b.bufferNeededMb).toBeCloseTo(55000 * (1 - 50 / 1440), 6)
    expect(b.storageMb).toBeLessThan(b.bufferNeededMb)
    const issue = validateData(small, gameData).find((i) => i.code === 'STORAGE_TOO_SMALL')!
    expect(issue).toMatchObject({ severity: 'warning', resource: 'data', subsystem: 'computer' })
    expect(codes(ref('wildfire-eo'))).not.toContain('STORAGE_TOO_SMALL')
  })

  it('does not double the storage for a redundant computer', () => {
    expect(dataBudget({ ...lossy(), redundant: ['computer'] }, gameData).storageMb).toBe(8000)
  })

  it.each(REFERENCE_DESIGNS.map((d) => [d.scenarioId, d] as const))('%s reference design loses no data', (_id, d) => {
    const b = dataBudget(d, gameData)
    expect(b.lostPercent).toBe(0)
    expect(codes(d)).toEqual([])
  })

  it('has zero storage without a computer and does not throw with missing parts', () => {
    const noComputer = withComputer(lossy(), null)
    const b = dataBudget(noComputer, gameData)
    expect(b.storageMb).toBe(0)
    expect(b.lostMb).toBeCloseTo(E * T, 6)
    expect(b.lostPercent).toBeCloseTo((E / G) * 100, 9)
    expect(b.daysUntilStorageFull).toBe(0)
    const bare: MissionDesign = { ...lossy(), componentIds: {}, orbitId: null, groundNetworkId: null, instrumentIds: [] }
    expect(dataBudget(bare, gameData)).toMatchObject({ generatedMbPerDay: 0, downlinkMbPerDay: 0, lostPercent: 0, daysUntilStorageFull: null })
    expect(() => validateData(bare, gameData)).not.toThrow()
  })

  it('does not mutate the design or the data', () => {
    const d = { ...lossy(), redundant: ['computer' as const] }
    const dSnap = JSON.stringify(d)
    const gSnap = JSON.stringify(gameData)
    dataBudget(d, gameData)
    validateData(d, gameData)
    expect(JSON.stringify(d)).toBe(dSnap)
    expect(JSON.stringify(gameData)).toBe(gSnap)
  })
})
