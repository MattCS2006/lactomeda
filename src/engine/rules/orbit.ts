// Orbit properties that drive the engine (FR-5.2): period and eclipse -> battery size, radiation -> lifetime
// (see resources.ts) and rad-hard parts, insertion delta-v -> propulsion. Pure and deterministic.
// `message` text is an English fallback; the UI translates by `code` via i18next.
import { BATTERY_DOD } from '../constants'
import type { GameData, MissionDesign, Orbit, ValidationIssue } from '../types'
import { effectivePeriodMin } from './objectives'
import { estimateBudgets } from './resources'
import { selectedComponent } from './components'

const fmt = (n: number): string => String(Math.round(n * 10) / 10)

const orbitOf = (design: MissionDesign, data: GameData): Orbit | undefined =>
  data.orbits.find((o) => o.id === design.orbitId)

/** Minutes in eclipse per orbit: the (possibly altitude-adjusted) period times the eclipse fraction. */
export function eclipseMinutes(design: MissionDesign, orbit: Orbit): number {
  return effectivePeriodMin(design, orbit) * orbit.eclipseFraction
}

/** Wh the battery must hold to carry the load through one eclipse: P_load x t_eclipse / DoD (ERS 7.5). 0 without an orbit. */
export function requiredBatteryWh(design: MissionDesign, data: GameData): number {
  const orbit = orbitOf(design, data)
  if (!orbit) return 0
  const loadW = estimateBudgets(design, data).power.used
  return (loadW * (eclipseMinutes(design, orbit) / 60)) / BATTERY_DOD
}

/** Capacity of the selected battery; a redundant battery counts twice. 0 if none is selected. */
export function batteryCapacityWh(design: MissionDesign, data: GameData): number {
  const battery = selectedComponent(design, 'battery', data)
  if (!battery) return 0
  return (battery.capacityWh ?? 0) * (design.redundant.includes('battery') ? 2 : 1)
}

/** Delta-v of the selected propulsion (m/s); 0 if none. */
export function availableDeltaVms(design: MissionDesign, data: GameData): number {
  return selectedComponent(design, 'propulsion', data)?.deltaVms ?? 0
}

export function validateOrbit(design: MissionDesign, data: GameData): ValidationIssue[] {
  const orbit = orbitOf(design, data)
  if (!orbit) return []
  const issues: ValidationIssue[] = []

  if (selectedComponent(design, 'battery', data)) {
    const required = requiredBatteryWh(design, data)
    const capacity = batteryCapacityWh(design, data)
    if (capacity < required) {
      issues.push({
        code: 'BATTERY_TOO_SMALL',
        severity: 'error',
        message: `The battery holds ${fmt(capacity)} Wh but the ${fmt(eclipseMinutes(design, orbit))} min eclipse needs ${fmt(required)} Wh.`,
        resource: 'power',
        subsystem: 'battery',
      })
    }
  }

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
