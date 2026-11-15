// Payload science with diminishing returns for duplicate instruments (FR-4.3).
// Pure and deterministic. Only science diminishes: mass, power, cost and data count in full.
import { DUPLICATE_SCIENCE_FACTOR } from '../constants'
import type { GameData, MissionDesign } from '../types'

export interface InstrumentScience {
  instrumentId: string
  copy: number // 1 for the first occurrence of this id, 2 for the second, ...
  base: number // Instrument.science (0 for unknown ids)
  value: number // base * DUPLICATE_SCIENCE_FACTOR^(copy - 1)
}

const copyValue = (base: number, copy: number): number => base * DUPLICATE_SCIENCE_FACTOR ** (copy - 1)

const baseScience = (instrumentId: string, data: GameData): number =>
  data.instruments.find((i) => i.id === instrumentId)?.science ?? 0

/** One entry per design.instrumentIds entry, in order. Unknown ids contribute 0. */
export function instrumentScienceBreakdown(design: MissionDesign, data: GameData): InstrumentScience[] {
  const seen = new Map<string, number>()
  return design.instrumentIds.map((instrumentId) => {
    const copy = (seen.get(instrumentId) ?? 0) + 1
    seen.set(instrumentId, copy)
    const base = baseScience(instrumentId, data)
    return { instrumentId, copy, base, value: copyValue(base, copy) }
  })
}

/** Total payload science with diminishing returns. */
export function payloadScience(design: MissionDesign, data: GameData): number {
  return instrumentScienceBreakdown(design, data).reduce((sum, entry) => sum + entry.value, 0)
}

/** Science that adding one more of this instrument would give right now (for previews). */
export function marginalScience(design: MissionDesign, instrumentId: string, data: GameData): number {
  const copy = design.instrumentIds.filter((id) => id === instrumentId).length + 1
  return copyValue(baseScience(instrumentId, data), copy)
}
