// Pure helpers for the orbit catalog (FR-5.1). No React, unit-tested in Node.
import type { GameData, MissionDesign, Orbit, Scenario } from '../../engine/types'
import { isCompatible } from '../payload/compatibility'
import { destinationOf, type DestinationKey, type Label } from '../scenarios/scenarioView'

export interface OrbitCard {
  id: string
  name: string
  /** i18n keys orbit.<id>.goodFor / orbit.<id>.tradeoff hold the plain-language text. */
  textKey: string
  body: DestinationKey
  altitude: Label
  period: Label
  eclipse: Label
  contact: Label
  radiation: Orbit['radiation']
  fromGmat: boolean
  allowed: boolean
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** 95 min · 12 h · 180 days */
export function periodLabel(minutes: number): Label {
  if (minutes < 120) return { key: 'orbit.units.min', values: { value: formatInt(minutes) } }
  if (minutes < 2 * 1440) return { key: 'orbit.units.hours', values: { value: formatInt(minutes / 60) } }
  return { key: 'orbit.units.days', values: { value: formatInt(minutes / 1440) } }
}

/** "500 km above Earth", "100 km above the Moon", "1,500,000 km from Earth" */
export function altitudeLabel(orbit: Orbit): Label {
  const body = destinationOf(orbit)
  if (body === 'l2') return { key: 'orbit.units.fromEarth', values: { value: formatInt(orbit.altitudeKm) } }
  return { key: `orbit.units.above.${body}`, values: { value: formatInt(orbit.altitudeKm) } }
}

export function eclipseLabel(fraction: number): Label {
  if (fraction <= 0) return { key: 'orbit.units.alwaysSun' }
  return { key: 'orbit.units.shadow', values: { value: Math.round(fraction * 100) } }
}

export function contactLabel(minPerDay: number): Label {
  if (minPerDay >= 1440) return { key: 'orbit.units.alwaysContact' }
  return { key: 'orbit.units.contact', values: { value: formatInt(minPerDay) } }
}

export function toOrbitCard(orbit: Orbit, scenario: Scenario): OrbitCard {
  return {
    id: orbit.id,
    name: orbit.name,
    textKey: `orbit.catalog.${orbit.id}`,
    body: destinationOf(orbit),
    altitude: altitudeLabel(orbit),
    period: periodLabel(orbit.periodMin),
    eclipse: eclipseLabel(orbit.eclipseFraction),
    contact: contactLabel(orbit.contactMinPerDay),
    radiation: orbit.radiation,
    fromGmat: orbit.source === 'gmat',
    allowed: scenario.allowedOrbitIds.includes(orbit.id),
  }
}

/** Selected instruments that would not work from this orbit (shown as a warning on the card). */
export function instrumentsLostAt(orbitId: string, design: MissionDesign, data: GameData): string[] {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  if (!scenario) return []
  return design.instrumentIds
    .map((id) => data.instruments.find((i) => i.id === id))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .filter((i) => !isCompatible(i, scenario, { orbitId }, data))
    .map((i) => i.name)
}
