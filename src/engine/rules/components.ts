// Subsystem component options and selection rules (FR-3.2). Pure and deterministic: nothing is mutated.
// `message` text is an English fallback; the UI translates by `code` via i18next.
import type { Component, GameData, MissionDesign, Orbit, Subsystem, ValidationIssue } from '../types'

export const SUBSYSTEMS: readonly Subsystem[] = [
  'structure',
  'power',
  'battery',
  'computer',
  'attitude',
  'propulsion',
  'thermal',
  'comms',
]

/** Beyond this distance from the Sun (AU) solar panels get a LOW_SOLAR_POWER warning. */
export const LOW_SOLAR_DISTANCE_AU = 1.3

/** Options for one subsystem, lightest first (for the selection screen). */
export function componentOptions(subsystem: Subsystem, data: GameData): Component[] {
  return data.components
    .filter((c) => c.subsystem === subsystem)
    .sort((a, b) => a.massKg - b.massKg || a.id.localeCompare(b.id))
}

export function selectedComponent(design: MissionDesign, subsystem: Subsystem, data: GameData): Component | undefined {
  const id = design.componentIds[subsystem]
  return id === undefined ? undefined : data.components.find((c) => c.id === id)
}

/** Returns a NEW design with `subsystem` set to `componentId`. Throws on an unknown id or a mismatched subsystem. */
export function selectComponent(
  design: MissionDesign,
  subsystem: Subsystem,
  componentId: string,
  data: GameData,
): MissionDesign {
  const component = data.components.find((c) => c.id === componentId)
  if (!component) throw new Error(`Unknown component "${componentId}"`)
  if (component.subsystem !== subsystem) {
    throw new Error(`Component "${componentId}" belongs to "${component.subsystem}", not "${subsystem}"`)
  }
  return { ...design, componentIds: { ...design.componentIds, [subsystem]: componentId } }
}

/** A power-generation component that depends on sunlight (everything but the RTG). */
export function isSolar(component: Component): boolean {
  return component.subsystem === 'power' && !(component.tags ?? []).includes('noSunNeeded')
}

/** Power in W (negative = generates). Solar generation scales with (1 AU / distance)^2 (ERS 7.5); no orbit = 1 AU. */
export function effectivePowerW(component: Component, orbit: Orbit | null): number {
  if (!isSolar(component) || component.powerW >= 0) return component.powerW
  const distanceAU = orbit?.sunDistanceAU ?? 1
  return component.powerW / distanceAU ** 2
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100)

export function validateComponents(design: MissionDesign, data: GameData): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const subsystem of SUBSYSTEMS) {
    const id = design.componentIds[subsystem]
    if (id === undefined) {
      issues.push({
        code: 'MISSING_SUBSYSTEM',
        severity: 'error',
        subsystem,
        message: `Choose a component for the ${subsystem} subsystem.`,
      })
      continue
    }
    const component = data.components.find((c) => c.id === id)
    if (!component) {
      issues.push({
        code: 'UNKNOWN_COMPONENT',
        severity: 'error',
        subsystem,
        message: `Component "${id}" does not exist.`,
      })
    } else if (component.subsystem !== subsystem) {
      issues.push({
        code: 'WRONG_SUBSYSTEM',
        severity: 'error',
        subsystem,
        message: `Component "${id}" is a ${component.subsystem} part and cannot be used for ${subsystem}.`,
      })
    }
  }

  const power = selectedComponent(design, 'power', data)
  const orbit = data.orbits.find((o) => o.id === design.orbitId)
  if (power && power.subsystem === 'power' && isSolar(power) && orbit && orbit.sunDistanceAU > LOW_SOLAR_DISTANCE_AU) {
    const pct = Math.round((1 / orbit.sunDistanceAU ** 2) * 100)
    issues.push({
      code: 'LOW_SOLAR_POWER',
      severity: 'warning',
      resource: 'power',
      subsystem: 'power',
      message: `At ${fmt(orbit.sunDistanceAU)} AU solar panels give only ${pct}% of their Earth output; consider an RTG.`,
    })
  }

  return issues
}
