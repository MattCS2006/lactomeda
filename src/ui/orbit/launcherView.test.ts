import { describe, expect, it } from 'vitest'
import { fullGameData as gameData } from '../../data'
import en from '../../i18n/en.json'
import { costLabel, launcherReasons, launchersFor, regimeOf, REGIMES, toLauncherCard } from './launcherView'

const launcher = (id: string) => gameData.launchers.find((l) => l.id === id)!

describe('launcher catalog (FR-5.4)', () => {
  it('has at least 6 launchers, including rideshare and a CubeSat deployer', () => {
    expect(gameData.launchers.length).toBeGreaterThanOrEqual(6)
    expect(gameData.launchers.some((l) => /rideshare/i.test(l.name))).toBe(true)
    expect(gameData.launchers.some((l) => /cubesat deployer/i.test(l.name))).toBe(true)
  })

  it('every launcher card has capacity, cost and reliability', () => {
    for (const l of gameData.launchers) {
      const card = toLauncherCard(l, { orbitId: null }, gameData)
      expect(card.capacities.length, l.id).toBeGreaterThan(0)
      expect(card.reliabilityPct + card.failurePct, l.id).toBe(100)
    }
    for (const r of REGIMES) expect(en.launcher.regime).toHaveProperty(r)
  })

  it('offers scenario-only launchers (NASA CSLI) just in their scenario', () => {
    expect(launchersFor('student-cubesat', gameData).map((l) => l.id)).toContain('lv-csli')
    expect(launchersFor('wildfire-eo', gameData).map((l) => l.id)).not.toContain('lv-csli')
  })

  it('6+ launchers are selectable for a low Earth orbit mission', () => {
    const ok = launchersFor('student-cubesat', gameData).filter((l) => launcherReasons(l, { orbitId: 'leo' }, gameData).length === 0)
    expect(ok.length).toBeGreaterThanOrEqual(6)
  })

  it('disables launchers that cannot reach the chosen orbit, with the reason', () => {
    expect(regimeOf('l2', gameData)).toBe('TLI')
    const reasons = launcherReasons(launcher('lv-small'), { orbitId: 'l2' }, gameData)
    expect(reasons).toEqual([{ key: 'launcher.cantReach', values: { orbit: 'Sun-Earth L2' } }])
    expect(launcherReasons(launcher('lv-medium'), { orbitId: 'l2' }, gameData)).toEqual([])
    expect(launcherReasons(launcher('lv-small'), { orbitId: null }, gameData)).toEqual([])
  })

  it('highlights the capacity for the chosen orbit', () => {
    const card = toLauncherCard(launcher('lv-medium'), { orbitId: 'sso' }, gameData)
    expect(card.capacities.find((c) => c.current)).toEqual({ regime: 'SSO', kg: 12000, current: true })
  })

  it('formats costs', () => {
    expect(costLabel(0)).toEqual({ key: 'launcher.free' })
    expect(costLabel(70)).toEqual({ key: 'units.moneyM', values: { value: 70 } })
    expect(costLabel(2000)).toEqual({ key: 'units.moneyB', values: { value: 2 } })
  })
})
