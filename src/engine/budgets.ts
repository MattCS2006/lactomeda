import type { ResourceBudget } from './types'

/** Margin = (available - used) / available. Green >= 20%, amber 0-20%, red < 0. */
export function makeBudget(used: number, available: number): ResourceBudget {
  const margin = available > 0 ? (available - used) / available : -1
  const status = margin >= 0.2 ? 'green' : margin >= 0 ? 'amber' : 'red'
  return { used, available, margin, status }
}

/** Solar power generated in sunlight, in watts (simplified; see ERS 7.5). */
export function solarPowerW(params: {
  areaM2: number
  efficiency: number
  distanceAU: number
  eclipseFraction: number
  degradationPerYear?: number
  years?: number
}): number {
  const S = 1361 / params.distanceAU ** 2
  const aging = (1 - (params.degradationPerYear ?? 0.02)) ** (params.years ?? 0)
  return S * params.areaM2 * params.efficiency * aging * (1 - params.eclipseFraction)
}
