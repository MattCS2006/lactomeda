// How a flight result is written on screen: score, stars (icon + text) and outcome.
import type { Label } from '../scenarios/scenarioView'
import type { FlightRecord } from './flightRecord'

export function starsIcon(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars)
}

export function resultLabel(result: NonNullable<FlightRecord['result']>): Label {
  return {
    key: 'flight.result',
    values: { total: result.total, stars: result.stars, outcome: { key: `flight.outcome.${result.outcome}` } },
  }
}
