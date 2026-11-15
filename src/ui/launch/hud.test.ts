import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { REFERENCE_DESIGNS } from '../../data/referenceDesigns'
import { selectedComponent } from '../../engine/rules/components'
import { initSim, simulateTick } from '../../engine/sim'
import en from '../../i18n/en.json'
import { dataAmount, hudCells, hudDay, hudHealth, healthLevel } from './hudView'
import type { SimSnapshot } from '../../game/bridge'

const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en)
const snap = (s: ReturnType<typeof initSim>): SimSnapshot => {
  const { log: _log, ...rest } = s
  return rest
}
const wildfire = REFERENCE_DESIGNS.find((d) => d.scenarioId === 'wildfire-eo')!
const telescope = REFERENCE_DESIGNS.find((d) => d.scenarioId === 'space-telescope')!

describe('FR-13.11 flight HUD — mission day, time and the live mission state (FR-7.3)', () => {
  it('shows the six FR-7.3 readings, each with a translated text', () => {
    const cells = hudCells(snap(initSim(wildfire, gameData)), wildfire, gameData)
    expect(cells.map((c) => c.id)).toEqual(['battery', 'data', 'propellant', 'health', 'science', 'budget'])
    for (const c of cells) {
      expect(lookup(c.value.key), c.id).toBeTypeOf('string')
      expect(lookup(`hud.label.${c.id}`), c.id).toBeTypeOf('string')
      expect(lookup(`hud.level.${c.level}`), c.id).toBeTypeOf('string')
    }
  })

  it('updates every simulated day: day, data sent home and money spent move as the mission runs', () => {
    let s = initSim(wildfire, gameData)
    const before = hudCells(snap(s), wildfire, gameData)
    for (let i = 0; i < 30; i++) s = simulateTick(s, wildfire, gameData)
    const after = hudCells(snap(s), wildfire, gameData)
    expect(hudDay(snap(s), wildfire, gameData)).toEqual({ day: s.day, total: 730 })
    expect(s.day).toBeGreaterThan(0)
    const data = (cells: typeof before) => cells.find((c) => c.id === 'data')!.value.values!.sent
    expect(data(after)).not.toBe(data(before))
  })

  it('battery is shown against the battery capacity; low battery turns amber then red', () => {
    const s = snap(initSim(wildfire, gameData))
    const cap = selectedComponent(wildfire, 'battery', gameData)!.capacityWh!
    const level = (wh: number) => hudCells({ ...s, batteryWh: wh }, wildfire, gameData)[0]!
    expect(level(cap).fraction).toBe(1)
    expect(level(cap).level).toBe('ok')
    expect(level(cap * 0.2).level).toBe('warning')
    expect(level(cap * 0.05).level).toBe('alarm')
  })

  it('propellant: a ship without thrusters says so; a ship with fuel shows a bar', () => {
    const noFuel = hudCells(snap(initSim(wildfire, gameData)), wildfire, gameData)[2]!
    expect(noFuel.value.key).toBe('hud.value.noPropellant')
    expect(noFuel.fraction).toBeNull()
    const fuel = hudCells(snap(initSim(telescope, gameData)), telescope, gameData)[2]!
    expect(fuel.value.key).toBe('hud.value.propellant')
    expect(fuel.fraction).toBeGreaterThan(0)
    expect(fuel.fraction).toBeLessThanOrEqual(1)
  })

  it('health: every installed part, with the worst one deciding the level', () => {
    const s = snap(initSim(wildfire, gameData))
    const parts = hudHealth(s)
    expect(parts.length).toBeGreaterThan(0)
    expect(parts.every((p) => p.level === 'ok')).toBe(true)
    const broken = { ...s, health: { ...s.health, power: 0 } }
    expect(hudCells(broken, wildfire, gameData)[3]!.level).toBe('alarm')
    expect(healthLevel(0.5)).toBe('warning')
    expect(healthLevel(0.1)).toBe('alarm')
    for (const p of parts) expect(lookup(`subsystem.${p.subsystem}.name`), p.subsystem).toBeTypeOf('string')
  })

  it('budget turns amber near the limit and red over it', () => {
    const s = snap(initSim(wildfire, gameData))
    const budget = (spentM: number) => hudCells({ ...s, spentM }, wildfire, gameData)[5]!.level
    expect(budget(60)).toBe('ok')
    expect(budget(115)).toBe('warning')
    expect(budget(130)).toBe('alarm')
  })

  it('data amounts stay short: Mb, Gb or Tb', () => {
    expect(dataAmount(512)).toEqual({ key: 'hud.unit.mb', values: { value: '512' } })
    expect(dataAmount(2_145_000)).toEqual({ key: 'hud.unit.tb', values: { value: '2.1' } })
    expect(dataAmount(55_000)).toEqual({ key: 'hud.unit.gb', values: { value: '55' } })
  })
})
