// Flight HUD (FR-13.11 / FR-7.3, SCRUM-129): mission day and the live mission state from the controller's simTick —
// battery, data stored vs sent home, propellant, subsystem health, science and budget spent. Pure, unit-tested.
import { selectedComponent } from '../../engine/rules/components'
import { dataBudget } from '../../engine/rules/data'
import { LOW_BATTERY_FRACTION, OFF_HEALTH, WARNING_HEALTH } from '../../game/stationStatus'
import type { SimSnapshot } from '../../game/bridge'
import type { GameData, MissionDesign, Subsystem } from '../../engine/types'
import type { Label } from '../scenarios/scenarioView'

export type HudLevel = 'ok' | 'warning' | 'alarm'
export type HudKey = 'battery' | 'data' | 'propellant' | 'health' | 'science' | 'budget'

export interface HudCell {
  id: HudKey
  level: HudLevel
  /** 0–1 for the bar, or null when a bar makes no sense (science). */
  fraction: number | null
  value: Label
}

export interface HudHealth {
  subsystem: Subsystem
  health: number
  level: HudLevel
}

/** Below this battery fraction the HUD turns red (amber below LOW_BATTERY_FRACTION). */
export const CRITICAL_BATTERY_FRACTION = 0.1
/** Storage fuller than this turns amber; full storage means data is being lost (red). */
export const STORAGE_WARNING_FRACTION = 0.75
/** Budget spent above this fraction turns amber; above 1 it is red. */
export const BUDGET_WARNING_FRACTION = 0.9

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const round = (n: number) => Math.round(n).toLocaleString('en-US')
const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US')

/** Data amounts in megabits, shown as Mb, Gb or Tb so they stay short. */
export function dataAmount(mb: number): Label {
  if (mb >= 1e6) return { key: 'hud.unit.tb', values: { value: oneDecimal(mb / 1e6) } }
  if (mb >= 1e3) return { key: 'hud.unit.gb', values: { value: oneDecimal(mb / 1e3) } }
  return { key: 'hud.unit.mb', values: { value: round(mb) } }
}

export function healthLevel(health: number): HudLevel {
  if (health < OFF_HEALTH) return 'alarm'
  if (health < WARNING_HEALTH) return 'warning'
  return 'ok'
}

const WORST: Record<HudLevel, number> = { ok: 0, warning: 1, alarm: 2 }
const worst = (levels: HudLevel[]): HudLevel => levels.reduce<HudLevel>((a, l) => (WORST[l] > WORST[a] ? l : a), 'ok')

/** Health of every installed subsystem, in the snapshot's order. */
export function hudHealth(state: SimSnapshot): HudHealth[] {
  return (Object.entries(state.health) as [Subsystem, number][]).map(([subsystem, health]) => ({
    subsystem,
    health,
    level: healthLevel(health),
  }))
}

/** Mission day out of the scenario's mission length. */
export function hudDay(state: SimSnapshot, design: MissionDesign, data: GameData): { day: number; total: number } {
  const total = data.scenarios.find((s) => s.id === design.scenarioId)?.durationDays ?? 0
  return { day: state.day, total }
}

/** The six live readings of FR-7.3, in display order. */
export function hudCells(state: SimSnapshot, design: MissionDesign, data: GameData): HudCell[] {
  const capacityWh = selectedComponent(design, 'battery', data)?.capacityWh ?? 0
  const battery = capacityWh > 0 ? state.batteryWh / capacityWh : 0
  const storageMb = dataBudget(design, data).storageMb
  const stored = storageMb > 0 ? state.storedDataMb / storageMb : 0
  const budgetM = data.scenarios.find((s) => s.id === design.scenarioId)?.budgetM ?? 0
  const spent = budgetM > 0 ? state.spentM / budgetM : 0
  const health = hudHealth(state)

  return [
    {
      id: 'battery',
      level: battery < CRITICAL_BATTERY_FRACTION ? 'alarm' : battery < LOW_BATTERY_FRACTION ? 'warning' : 'ok',
      fraction: clamp01(battery),
      value: { key: 'hud.value.battery', values: { pct: round(battery * 100), wh: round(state.batteryWh) } },
    },
    {
      id: 'data',
      level: stored >= 1 ? 'alarm' : stored > STORAGE_WARNING_FRACTION ? 'warning' : 'ok',
      fraction: clamp01(stored),
      value: {
        key: 'hud.value.data',
        values: { stored: dataAmount(state.storedDataMb), sent: dataAmount(state.downlinkedDataMb) },
      },
    },
    design.propellantKg > 0
      ? {
          id: 'propellant',
          level: state.propellantKg <= 0 ? 'alarm' : state.propellantKg / design.propellantKg < 0.2 ? 'warning' : 'ok',
          fraction: clamp01(state.propellantKg / design.propellantKg),
          value: { key: 'hud.value.propellant', values: { kg: oneDecimal(state.propellantKg) } },
        }
      : { id: 'propellant', level: 'ok', fraction: null, value: { key: 'hud.value.noPropellant' } },
    {
      id: 'health',
      level: worst(health.map((h) => h.level)),
      fraction: health.length ? Math.min(...health.map((h) => h.health)) : null,
      value: {
        key: 'hud.value.health',
        values: { ok: health.filter((h) => h.level === 'ok').length, total: health.length },
      },
    },
    {
      id: 'science',
      level: 'ok',
      fraction: null,
      value: { key: 'hud.value.science', values: { points: round(state.science) } },
    },
    {
      id: 'budget',
      level: spent > 1 ? 'alarm' : spent > BUDGET_WARNING_FRACTION ? 'warning' : 'ok',
      fraction: clamp01(spent),
      value: { key: 'hud.value.budget', values: { spent: oneDecimal(state.spentM), total: oneDecimal(budgetM) } },
    },
  ]
}
