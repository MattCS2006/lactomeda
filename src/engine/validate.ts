// Engine validate() (EngineAPI.validate): runs every rule module's validator. Pure and deterministic.
import type { GameData, MissionDesign, ValidationIssue } from './types'
import { validateBusClass } from './rules/busClass'
import { validatePayload } from './rules/compatibility'
import { validateComponents } from './rules/components'
import { validateCost } from './rules/cost'
import { validateData } from './rules/data'
import { validateLaunch } from './rules/launch'
import { validateLink } from './rules/link'
import { validateOrbit } from './rules/orbit'
import { validatePower } from './rules/power'
import { validatePropellant } from './rules/propellant'
import { validateRedundancy } from './rules/redundancy'

/** Every rule validator, in a fixed order. Add new `validate*` functions here. */
export const VALIDATORS: readonly ((design: MissionDesign, data: GameData) => ValidationIssue[])[] = [
  validateBusClass,
  validateComponents,
  validateOrbit,
  validateLaunch,
  validateLink,
  validatePower,
  validateCost,
  validateData,
  validatePayload,
  validateRedundancy,
  validatePropellant,
]

/** All issues from every rule, without exact duplicates (same code + subsystem + resource + message). */
export function validate(design: MissionDesign, data: GameData): ValidationIssue[] {
  const seen = new Set<string>()
  const issues: ValidationIssue[] = []
  for (const rule of VALIDATORS) {
    for (const issue of rule(design, data)) {
      const key = `${issue.code}|${issue.subsystem ?? ''}|${issue.resource ?? ''}|${issue.message}`
      if (seen.has(key)) continue
      seen.add(key)
      issues.push(issue)
    }
  }
  return issues
}
