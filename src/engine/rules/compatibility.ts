// FR-4.2 / FR-14.8 instrument compatibility, modelled on NASA's "A Learning Game About Telescopes":
// objective -> wavelength -> instrument. An instrument serves an objective when one of its bands is in the rule's
// bands, its technique is in the rule's techniques and the rule's target is among its targets.
// Pure and deterministic: nothing is mutated. `message` text is an English fallback; the UI translates by `code`.
import type { Band, GameData, Instrument, MissionDesign, ValidationIssue, WavelengthRule } from '../types'

export type IncompatibilityCode = 'NO_MATCHING_OBJECTIVE' | 'WRONG_ORBIT' | 'NO_WAVELENGTH_DATA'

export interface Incompatibility {
  code: IncompatibilityCode
  message: string
}

export interface InstrumentCompatibility {
  instrumentId: string
  compatible: boolean
  servesObjectiveIds: string[] // scenario objectives this instrument can serve
  reasons: Incompatibility[] // empty when compatible
  rules: WavelengthRule[] // rules it matches, for the "why" tooltip and credit
}

const BAND_WORDS: Record<Band, string> = {
  visible: 'visible light',
  nearIR: 'near infrared',
  shortwaveIR: 'shortwave infrared',
  thermalIR: 'thermal infrared',
  microwave: 'microwaves',
  radar: 'radar',
  laser: 'laser light',
  magneticField: 'magnetic fields',
  particles: 'charged particles',
}

const list = (words: string[]): string =>
  words.length <= 1 ? (words[0] ?? 'nothing') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`

const hasWavelengthData = (i: Instrument): boolean =>
  (i.bands?.length ?? 0) > 0 && i.technique !== undefined && (i.targets?.length ?? 0) > 0

/** True when the instrument has a band, a technique and a target the rule accepts. */
export function ruleMatches(rule: WavelengthRule, instrument: Instrument): boolean {
  if (!hasWavelengthData(instrument)) return false
  return (
    (instrument.bands ?? []).some((b) => rule.bands.includes(b)) &&
    rule.techniques.includes(instrument.technique as NonNullable<Instrument['technique']>) &&
    (instrument.targets ?? []).includes(rule.target)
  )
}

/**
 * Every objective id this instrument can serve. Comes from the wavelength rules; an instrument without wavelength
 * data (or a catalog without rules) falls back to its own `objectives` list.
 */
export function derivedObjectives(instrument: Instrument, data: GameData): string[] {
  const rules = data.wavelengthRules ?? []
  if (rules.length === 0 || !hasWavelengthData(instrument)) return instrument.objectives
  return rules.filter((r) => ruleMatches(r, instrument)).map((r) => r.objectiveId)
}

const orbitName = (id: string, data: GameData): string => data.orbits.find((o) => o.id === id)?.name ?? id

export function instrumentCompatibility(instrumentId: string, design: MissionDesign, data: GameData): InstrumentCompatibility {
  const instrument = data.instruments.find((i) => i.id === instrumentId)
  if (!instrument) {
    return {
      instrumentId,
      compatible: false,
      servesObjectiveIds: [],
      reasons: [{ code: 'NO_MATCHING_OBJECTIVE', message: `Unknown instrument "${instrumentId}".` }],
      rules: [],
    }
  }
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const rules = data.wavelengthRules ?? []
  const derived = derivedObjectives(instrument, data)
  const serves = (scenario?.objectives ?? []).map((o) => o.id).filter((id) => derived.includes(id))
  const matched = rules.filter((r) => serves.includes(r.objectiveId) && ruleMatches(r, instrument))
  const reasons: Incompatibility[] = []

  if (serves.length === 0 && scenario) {
    if (!hasWavelengthData(instrument)) {
      reasons.push({
        code: 'NO_WAVELENGTH_DATA',
        message: `${instrument.name} has no wavelength data and is not listed for any objective of this mission.`,
      })
    } else {
      const needed = scenario.objectives.map((o) => rules.find((r) => r.objectiveId === o.id)).find((r) => r !== undefined)
      const sees = list((instrument.bands ?? []).map((b) => BAND_WORDS[b]))
      reasons.push({
        code: 'NO_MATCHING_OBJECTIVE',
        message: `${needed ? `${needed.why} ` : ''}${instrument.name} measures ${sees}, which this mission's objectives do not need.`,
      })
    }
  }

  if (design.orbitId) {
    if (!instrument.preferredOrbits.includes(design.orbitId)) {
      reasons.push({
        code: 'WRONG_ORBIT',
        message: `${instrument.name} cannot work from ${orbitName(design.orbitId, data)}; it works from ${list(instrument.preferredOrbits.map((id) => orbitName(id, data)))}.`,
      })
    }
  } else if (scenario && !instrument.preferredOrbits.some((id) => scenario.allowedOrbitIds.includes(id))) {
    reasons.push({
      code: 'WRONG_ORBIT',
      message: `${instrument.name} works from ${list(instrument.preferredOrbits.map((id) => orbitName(id, data)))}, none of which this mission can use.`,
    })
  }

  return { instrumentId, compatible: reasons.length === 0, servesObjectiveIds: serves, reasons, rules: matched }
}

/** Every catalog instrument, in catalog order. */
export function payloadCompatibility(design: MissionDesign, data: GameData): InstrumentCompatibility[] {
  return data.instruments.map((i) => instrumentCompatibility(i.id, design, data))
}

/** FR-4.2: a warning for each selected instrument that is not compatible. Warnings never block launch. */
export function validatePayload(design: MissionDesign, data: GameData): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  // A mission without an instrument collects no data and no science: the whole flight would show 0 Mb and 0 points.
  if (!design.instrumentIds.some((id) => data.instruments.some((i) => i.id === id))) {
    issues.push({
      code: 'MISSING_INSTRUMENT', // MISSING_* is a hard blocker (constants.ts): this cannot launch, even on risk
      severity: 'error',
      resource: 'data',
      message: 'No instrument chosen: the mission would collect no data and no science. Add at least one instrument.',
    })
  }
  for (const id of design.instrumentIds) {
    const instrument = data.instruments.find((i) => i.id === id)
    if (!instrument) continue // an unknown id has nothing to check
    const result = instrumentCompatibility(id, design, data)
    if (result.compatible) continue
    issues.push({
      code: 'INSTRUMENT_INCOMPATIBLE',
      severity: 'warning',
      message: `${instrument.name}: ${result.reasons.map((r) => r.message).join(' ')}`,
    })
  }
  return issues
}
