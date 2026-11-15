// FR-5.5 launch compatibility: wet mass <= launcher capacity for the orbit's regime, and the bus fits the fairing.
// Pure and deterministic: nothing is mutated. `message` text is an English fallback; the UI translates by `code`.
import type { GameData, Launcher, MissionDesign, ValidationIssue } from '../types'
import { findBusClass } from './busClass'
import { wetMassKg } from './mass'

export { wetMassKg }

export type LaunchIssueCode = 'NO_ORBIT' | 'REGIME_NOT_SUPPORTED' | 'OVER_CAPACITY' | 'FAIRING_TOO_SMALL'

export interface LaunchIssue {
  code: LaunchIssueCode
  message: string
}

export interface LauncherCompatibility {
  launcherId: string
  compatible: boolean
  issues: LaunchIssue[]
  wetMassKg: number
  capacityKg: number // for the chosen orbit's regime; 0 if not supported
  massShortfallKg: number // max(0, wetMassKg - capacityKg)
  busVolumeL: number | null // null if no bus class
  fairingVolumeL: number
  volumeShortfallL: number // max(0, busVolumeL - fairingVolumeL)
}

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000)

function check(design: MissionDesign, launcher: Launcher, data: GameData): LauncherCompatibility {
  const wet = wetMassKg(design, data)
  const orbit = data.orbits.find((o) => o.id === design.orbitId)
  const bus = findBusClass(design, data)
  const issues: LaunchIssue[] = []

  let capacityKg = 0
  let massShortfallKg = 0
  if (!orbit) {
    issues.push({ code: 'NO_ORBIT', message: 'Choose an orbit before checking the launcher.' })
  } else {
    const capacity = launcher.capacityKg[orbit.regime]
    if (capacity === undefined) {
      massShortfallKg = wet
      issues.push({
        code: 'REGIME_NOT_SUPPORTED',
        message: `${launcher.name} cannot reach ${orbit.regime} (${orbit.name}).`,
      })
    } else {
      capacityKg = capacity
      massShortfallKg = Math.max(0, wet - capacity)
      if (massShortfallKg > 0) {
        issues.push({
          code: 'OVER_CAPACITY',
          message: `Too heavy for ${launcher.name} to ${orbit.regime}: ${fmt(wet)} kg vs ${fmt(capacity)} kg capacity (${fmt(massShortfallKg)} kg short).`,
        })
      }
    }
  }

  const busVolumeL = bus ? bus.volumeL : null
  const volumeShortfallL = busVolumeL === null ? 0 : Math.max(0, busVolumeL - launcher.fairingVolumeL)
  if (volumeShortfallL > 0) {
    issues.push({
      code: 'FAIRING_TOO_SMALL',
      message: `${bus!.name} (${fmt(busVolumeL!)} L) does not fit the ${launcher.name} fairing (${fmt(launcher.fairingVolumeL)} L, ${fmt(volumeShortfallL)} L short).`,
    })
  }

  return {
    launcherId: launcher.id,
    compatible: issues.length === 0,
    issues,
    wetMassKg: wet,
    capacityKg,
    massShortfallKg,
    busVolumeL,
    fairingVolumeL: launcher.fairingVolumeL,
    volumeShortfallL,
  }
}

/** Checks one launcher against the design. Throws on an unknown launcher id. */
export function checkLauncher(design: MissionDesign, launcherId: string, data: GameData): LauncherCompatibility {
  const launcher = data.launchers.find((l) => l.id === launcherId)
  if (!launcher) throw new Error(`Unknown launcher "${launcherId}"`)
  return check(design, launcher, data)
}

/** Every launcher, in catalog order (for the launcher list in the UI). */
export function launcherCompatibility(design: MissionDesign, data: GameData): LauncherCompatibility[] {
  return data.launchers.map((l) => check(design, l, data))
}

const ISSUE_MAP: Record<LaunchIssueCode, Pick<ValidationIssue, 'code' | 'resource'>> = {
  NO_ORBIT: { code: 'LAUNCH_NO_ORBIT' },
  REGIME_NOT_SUPPORTED: { code: 'LAUNCH_REGIME_UNSUPPORTED' },
  OVER_CAPACITY: { code: 'LAUNCH_OVER_CAPACITY', resource: 'mass' },
  FAIRING_TOO_SMALL: { code: 'LAUNCH_FAIRING_TOO_SMALL' },
}

/** Validation errors for the chosen launcher (design.launcherId). */
export function validateLaunch(design: MissionDesign, data: GameData): ValidationIssue[] {
  if (design.launcherId === null) {
    return [{ code: 'MISSING_LAUNCHER', severity: 'error', message: 'Choose a launcher.' }]
  }
  if (!data.launchers.some((l) => l.id === design.launcherId)) {
    return [{ code: 'UNKNOWN_LAUNCHER', severity: 'error', message: `Launcher "${design.launcherId}" does not exist.` }]
  }
  return checkLauncher(design, design.launcherId, data).issues.map((i) => ({
    ...ISSUE_MAP[i.code],
    severity: 'error',
    message: i.message,
  }))
}
