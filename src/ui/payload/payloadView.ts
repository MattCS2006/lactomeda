// Pure helpers for the Payload screen (FR-4.1). No React, unit-tested in Node.
import { busClassUsage } from '../../engine/rules/busClass'
import { marginalScience, payloadScience } from '../../engine/rules/science'
import type { GameData, Instrument, MissionDesign, Scenario } from '../../engine/types'

export interface InstrumentCard {
  id: string
  name: string
  massKg: number
  powerW: number
  costM: number
  dataMbPerDay: number
  science: number
  /** Labels of this scenario's objectives the instrument helps with. */
  helps: string[]
}

export function toInstrumentCard(instrument: Instrument, scenario: Scenario | undefined): InstrumentCard {
  const helps = (scenario?.objectives ?? []).filter((o) => instrument.objectives.includes(o.id)).map((o) => o.label)
  return {
    id: instrument.id,
    name: instrument.name,
    massKg: instrument.massKg,
    powerW: instrument.powerW,
    costM: instrument.costM,
    dataMbPerDay: instrument.dataMbPerDay,
    science: instrument.science,
    helps,
  }
}

export interface PayloadTotals {
  count: number
  massKg: number
  powerW: number
  costM: number
  dataMbPerDay: number
  science: number
}

/** Sum of the selected instruments. Science uses the engine's diminishing returns for copies (FR-4.3); duty cycle (FR-4.4) is not applied yet. */
export function payloadTotals(design: MissionDesign, data: GameData): PayloadTotals {
  const totals: PayloadTotals = { count: 0, massKg: 0, powerW: 0, costM: 0, dataMbPerDay: 0, science: 0 }
  for (const id of design.instrumentIds) {
    const i = data.instruments.find((x) => x.id === id)
    if (!i) continue
    totals.count++
    totals.massKg += i.massKg
    totals.powerW += i.powerW
    totals.costM += i.costM
    totals.dataMbPerDay += i.dataMbPerDay
  }
  totals.costM = Math.round(totals.costM * 100) / 100
  totals.science = Math.round(payloadScience(design, data) * 100) / 100
  return totals
}

export interface SlotInfo {
  used: number
  /** null while no bus class is chosen: no limit yet. */
  max: number | null
  full: boolean
}

/** Instrument slots from the chosen bus class (engine rule, SCRUM-43). */
export function slotInfo(design: MissionDesign, data: GameData): SlotInfo {
  const usage = busClassUsage(design, data)
  if (!usage) return { used: design.instrumentIds.length, max: null, full: false }
  const max = usage.busClass.instrumentSlots
  return { used: usage.instrumentsUsed, max, full: usage.instrumentsUsed >= max }
}

/** Compact numbers for cards: 120000 -> "120,000", 0.2 -> "0.2". */
export function formatNumber(n: number): string {
  return n >= 1000 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 100) / 100)
}

/** How many copies of an instrument the design carries. */
export function copiesOf(design: Pick<MissionDesign, 'instrumentIds'>, instrumentId: string): number {
  return design.instrumentIds.filter((id) => id === instrumentId).length
}

export interface NextCopy {
  /** Science the next copy would add (engine marginalScience). */
  value: number
  /** Copies already on board. */
  have: number
  /** value as a % of the instrument's full science. */
  pct: number
}

/** What adding one more of this instrument would give (FR-4.3). */
export function nextCopy(design: MissionDesign, instrumentId: string, data: GameData): NextCopy {
  const value = marginalScience(design, instrumentId, data)
  const base = data.instruments.find((i) => i.id === instrumentId)?.science ?? 0
  return { value, have: copiesOf(design, instrumentId), pct: base > 0 ? Math.round((value / base) * 100) : 0 }
}
