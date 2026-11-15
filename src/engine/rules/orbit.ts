// Orbit properties that drive the engine (FR-5.2): period and eclipse -> battery size, radiation -> lifetime
// (see resources.ts) and rad-hard parts, insertion delta-v -> propulsion. Pure and deterministic.
// `message` text is an English fallback; the UI translates by `code` via i18next.
import type { GameData, MissionDesign, Orbit, ValidationIssue } from '../types'
import { eclipseMinutes, powerBreakdown } from './power'
import { selectedComponent } from './components'
import { availableDeltaVms } from './propellant'

const fmt = (n: number): string => String(Math.round(n * 10) / 10)

const orbitOf = (design: MissionDesign, data: GameData): Orbit | undefined =>
  data.orbits.find((o) => o.id === design.orbitId)

export { availableDeltaVms, eclipseMinutes }

/** Wh the battery must hold to carry the eclipse load: P_load x t_eclipse / DoD (ERS 7.5). 0 without an orbit. */
export function requiredBatteryWh(design: MissionDesign, data: GameData): number {
  return powerBreakdown(design, data).requiredBatteryWh
}

/** Capacity of the selected battery; a redundant battery counts twice. 0 if none is selected. */
export function batteryCapacityWh(design: MissionDesign, data: GameData): number {
  return powerBreakdown(design, data).batteryCapacityWh
}

export function validateOrbit(design: MissionDesign, data: GameData): ValidationIssue[] {
  const orbit = orbitOf(design, data)
  if (!orbit) return []
  const issues: ValidationIssue[] = []

  const deltaV = availableDeltaVms(design, data)
  if (deltaV < orbit.insertionDeltaVms) {
    issues.push({
      code: 'INSUFFICIENT_DELTA_V',
      severity: 'error',
      message: `${orbit.name} needs ${fmt(orbit.insertionDeltaVms)} m/s of delta-v but the propulsion gives ${fmt(deltaV)} m/s.`,
      subsystem: 'propulsion',
    })
  }

  const computer = selectedComponent(design, 'computer', data)
  if (orbit.radiation === 'high' && computer && !(computer.tags ?? []).includes('radHard')) {
    issues.push({
      code: 'HIGH_RADIATION',
      severity: 'warning',
      message: `${orbit.name} has high radiation and ${computer.name} is not rad-hard.`,
      subsystem: 'computer',
    })
  }

  return issues
}
