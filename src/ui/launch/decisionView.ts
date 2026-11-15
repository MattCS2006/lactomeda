// Decision pop-up at the station (FR-13.5, SCRUM-123): which alarm a station answers, and each option's cost and
// consequence as resource chips (icon + sign + text, never colour alone). Pure, unit-tested.
import type { ActiveEvent, EffectKey, Station } from '../../engine/types'
import type { Label } from '../scenarios/scenarioView'

/**
 * Alarms the player can answer at this station: the ones ringing there. If an alarm's station isn't on this ship
 * (small buses merge rooms), the Bridge answers it, so no alarm is ever out of reach.
 */
export function alarmsAtStation(
  active: ActiveEvent[],
  station: Station,
  shipStations: readonly Station[],
): ActiveEvent[] {
  return active.filter(
    (a) => a.event.station === station || (station === 'bridge' && !shipStations.includes(a.event.station)),
  )
}

/** The station where an alarm is answered on this ship. */
export function answerStation(alarm: ActiveEvent, shipStations: readonly Station[]): Station {
  return shipStations.includes(alarm.event.station) ? alarm.event.station : 'bridge'
}

export interface EffectChip {
  key: EffectKey
  good: boolean
  label: Label
}

/** Every effect is good when positive, except risk (and budget is stored as money gained: -2 costs $2M). */
const HIGHER_IS_WORSE: ReadonlySet<EffectKey> = new Set<EffectKey>(['risk'])

const sign = (n: number) => (n > 0 ? '+' : '−')
const round = (n: number) => Math.round(Math.abs(n) * 10) / 10

/** One chip per non-zero effect, in a stable order. */
export function effectChips(effects: Partial<Record<EffectKey, number>>): EffectChip[] {
  const order: EffectKey[] = ['health', 'battery', 'science', 'data', 'propellant', 'budget', 'risk']
  const keys = [...order, ...(Object.keys(effects) as EffectKey[]).filter((k) => !order.includes(k))]
  const chips: EffectChip[] = []
  for (const key of keys) {
    const v = effects[key]
    if (v === undefined || v === 0 || chips.some((c) => c.key === key)) continue
    const good = HIGHER_IS_WORSE.has(key) ? v < 0 : v > 0
    const pct = key === 'health' || key === 'battery' || key === 'risk'
    const value = pct ? `${sign(v)}${round(v * 100)}%` : `${sign(v)}${round(v)}`
    chips.push({ key, good, label: { key: `decision.effect.${key}`, values: { value } } })
  }
  return chips
}
