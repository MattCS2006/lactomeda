import { describe, expect, it } from 'vitest'
import { fullGameData as gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { BATTERY_DOD, RTG_DEGRADATION_PER_YEAR, SOLAR_DEGRADATION_PER_YEAR } from '../constants'
import type { GameData, MissionDesign, Subsystem } from '../types'
import { powerBreakdown, validatePower } from './power'
import { estimateBudgets } from './resources'
import { cubesatDesign } from './testDesign'

const codes = (d: MissionDesign, data: GameData = gameData) => validatePower(d, data).map((i) => i.code)
const ref = (id: string): MissionDesign => REFERENCE_DESIGNS.find((d) => d.scenarioId === id)!
const withParts = (d: MissionDesign, parts: Partial<Record<Subsystem, string>>): MissionDesign => ({
  ...d,
  componentIds: { ...d.componentIds, ...parts },
})
const withDuration = (days: number): GameData => ({
  ...gameData,
  scenarios: gameData.scenarios.map((s) => (s.id === 'student-cubesat' ? { ...s, durationDays: days } : s)),
})
const sarPowerW = gameData.instruments.find((i) => i.id === 'inst-sar')!.powerW

// Student CubeSat: SSO (98.8 min period, 35.7% eclipse), 365-day mission.
const student = cubesatDesign({ orbitId: 'sso', instrumentIds: [] })

describe('powerBreakdown', () => {
  it('computes orbit-average generation = sunlit EOL x (1 - eclipse) for solar', () => {
    const d = ref('student-cubesat') // pwr-deploy: 36 W at 1 AU, 1 year -> x 0.97
    const p = powerBreakdown(d, gameData)
    expect(p.solarBolW).toBe(36)
    expect(p.rtgBolW).toBe(0)
    expect(p.solarDegradationFactor).toBeCloseTo((1 - SOLAR_DEGRADATION_PER_YEAR) ** 1, 12)
    expect(p.sunlitGenerationW).toBeCloseTo(36 * 0.97, 9)
    expect(p.sunFraction).toBeCloseTo(1 - 0.357, 9)
    expect(p.orbitAverageGenerationW).toBeCloseTo(36 * 0.97 * (1 - 0.357), 9)
    expect(p.orbitAverageMarginW).toBeCloseTo(p.orbitAverageGenerationW - p.loadW, 9)
  })

  it('does not reduce RTG generation in eclipse', () => {
    const p = powerBreakdown(withParts(ref('student-cubesat'), { power: 'pwr-rtg' }), gameData)
    expect(p.rtgBolW).toBe(110)
    expect(p.rtgDegradationFactor).toBeCloseTo(1 - RTG_DEGRADATION_PER_YEAR, 12)
    expect(p.sunlitGenerationW).toBeCloseTo(110 * 0.96, 9)
    expect(p.orbitAverageGenerationW).toBeCloseTo(110 * 0.96, 9)
  })

  it('degrades more over a longer mission', () => {
    const short = powerBreakdown(ref('student-cubesat'), withDuration(365))
    const long = powerBreakdown(ref('student-cubesat'), withDuration(365 * 5))
    expect(long.solarDegradationFactor).toBeCloseTo(0.97 ** 5, 12)
    expect(long.solarDegradationFactor).toBeLessThan(short.solarDegradationFactor)
    expect(long.sunlitGenerationW).toBeLessThan(short.sunlitGenerationW)
    expect(long.orbitAverageGenerationW).toBeLessThan(short.orbitAverageGenerationW)
  })

  it('gives about 43% of the solar power at Mars compared with LEO (before eclipse)', () => {
    const leo = powerBreakdown({ ...student, orbitId: 'leo' }, gameData)
    const mars = powerBreakdown({ ...student, orbitId: 'mars' }, gameData)
    expect(mars.distanceFactor).toBeCloseTo(1 / 1.52 ** 2, 12)
    expect(mars.sunlitGenerationW / leo.sunlitGenerationW).toBeCloseTo(0.433, 3)
  })

  it('lets the RTG cover part of the eclipse load, shrinking the deficit and the battery', () => {
    const d = { ...student, instrumentIds: ['inst-sar'] }
    const solar = powerBreakdown(withParts(d, { power: 'pwr-array-small' }), gameData)
    const rtg = powerBreakdown(withParts(d, { power: 'pwr-rtg' }), gameData)
    expect(solar.eclipseDeficitW).toBeCloseTo(solar.loadW, 9)
    expect(rtg.eclipseDeficitW).toBeCloseTo(Math.max(0, rtg.loadW - 110 * 0.96), 9)
    expect(rtg.eclipseDeficitW).toBeLessThan(solar.eclipseDeficitW)
    expect(rtg.requiredBatteryWh).toBeLessThan(solar.requiredBatteryWh)
  })

  it('sizes the battery as deficit x eclipse hours / DoD (hand check: wildfire-eo)', () => {
    const p = powerBreakdown(ref('wildfire-eo'), gameData) // SSO: 98.8 min x 0.357 = 35.2716 min of eclipse, no RTG
    const eclipseH = (98.8 * 0.357) / 60
    expect(p.eclipseMinutes).toBeCloseTo(35.2716, 9)
    expect(p.eclipseDeficitW).toBeCloseTo(p.loadW, 9)
    expect(p.eclipseEnergyWh).toBeCloseTo(p.loadW * eclipseH, 9)
    expect(p.requiredBatteryWh).toBeCloseTo((p.loadW * eclipseH) / BATTERY_DOD, 9)
    expect(p.batteryCapacityWh).toBe(1000)
  })

  it('doubles the battery capacity when it is redundant', () => {
    expect(powerBreakdown({ ...student, redundant: ['battery'] }, gameData).batteryCapacityWh).toBe(80)
  })

  it('has no eclipse and does not throw without an orbit', () => {
    const p = powerBreakdown({ ...student, orbitId: null }, gameData)
    expect(p.eclipseMinutes).toBe(0)
    expect(p.requiredBatteryWh).toBe(0)
    expect(p.sunFraction).toBe(1)
    expect(p.distanceFactor).toBe(1)
    expect(() => validatePower({ ...student, orbitId: null }, gameData)).not.toThrow()
  })
})

describe('validatePower', () => {
  it('flags a too-small battery separately when the average power is enough', () => {
    // 600 W array + 40 W thermal IR: plenty of average power, but 40 Wh cannot cover the eclipse.
    const d = withParts({ ...student, instrumentIds: ['inst-thermal-ir'] }, { power: 'pwr-array-small' })
    const p = powerBreakdown(d, gameData)
    expect(p.powerShortfall).toBe(false)
    expect(p.eclipseShortfall).toBe(true)
    const issues = validatePower(d, gameData)
    const issue = issues.find((i) => i.code === 'BATTERY_TOO_SMALL')!
    expect(issue).toMatchObject({ severity: 'error', resource: 'power', subsystem: 'battery' })
    expect(issue.message).toContain('Eclipse shortfall')
    expect(issues.map((i) => i.code)).not.toContain('POWER_SHORTFALL')
    expect(estimateBudgets(d, gameData).power.status).not.toBe('red')
  })

  it('flags a power shortfall separately when the battery is big enough', () => {
    // 7 W body panels + SAR + 10 kWh battery: the battery covers the eclipse but generation is below the load.
    const d = withParts({ ...student, instrumentIds: ['inst-sar'] }, { power: 'pwr-body', battery: 'bat-10k' })
    expect(sarPowerW).toBeGreaterThan(7)
    const issues = validatePower(d, gameData)
    expect(issues.map((i) => i.code)).toContain('POWER_SHORTFALL')
    expect(issues.map((i) => i.code)).not.toContain('BATTERY_TOO_SMALL')
    expect(issues.find((i) => i.code === 'POWER_SHORTFALL')).toMatchObject({ severity: 'error', resource: 'power', subsystem: 'power' })
    expect(estimateBudgets(d, gameData).power.status).toBe('red')
  })

  it('warns when the sunlit surplus cannot recharge the battery', () => {
    const d = withParts({ ...student, instrumentIds: ['inst-sar'] }, { power: 'pwr-body', battery: 'bat-10k' })
    const w = validatePower(d, gameData).find((i) => i.code === 'RECHARGE_SHORTFALL')!
    expect(w).toMatchObject({ severity: 'warning', resource: 'power' })
    expect(powerBreakdown(d, gameData).rechargeShortfall).toBe(true)
    expect(codes(withParts({ ...student, instrumentIds: [] }, { power: 'pwr-array-small' }))).not.toContain('RECHARGE_SHORTFALL')
  })

  it.each(REFERENCE_DESIGNS.map((d) => [d.scenarioId, d] as const))('%s reference design has no power or battery error', (_id, d) => {
    expect(codes(d)).not.toContain('POWER_SHORTFALL')
    expect(codes(d)).not.toContain('BATTERY_TOO_SMALL')
  })
})

describe('single source of truth', () => {
  it('estimateBudgets power matches powerBreakdown (used = load, available = orbit-average generation)', () => {
    for (const d of [...REFERENCE_DESIGNS, student, withParts(student, { power: 'pwr-rtg' })]) {
      const p = powerBreakdown(d, gameData)
      const b = estimateBudgets(d, gameData).power
      expect(b.used).toBe(p.loadW)
      expect(b.available).toBe(p.orbitAverageGenerationW)
    }
  })
})

describe('purity', () => {
  it('does not mutate the design or the data', () => {
    const d = { ...student, instrumentIds: ['inst-sar'], redundant: ['battery' as const] }
    const dSnap = JSON.stringify(d)
    const gSnap = JSON.stringify(gameData)
    powerBreakdown(d, gameData)
    validatePower(d, gameData)
    expect(JSON.stringify(d)).toBe(dSnap)
    expect(JSON.stringify(gameData)).toBe(gSnap)
  })
})
