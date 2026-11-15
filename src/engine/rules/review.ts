// FR-6.9 / FR-14.4 design review gate: per-resource verdicts, one finding set per MDL discipline, an equipment
// list, and the launch decision. Pure and deterministic: nothing is mutated.
// `message` text is an English fallback; the UI translates by `code` via i18next.
import { HARD_BLOCKER_CODES, HARD_BLOCKER_PREFIXES } from '../constants'
import type {
  GameData,
  MissionDesign,
  ResourceBudget,
  ResourceKey,
  Subsystem,
  ValidationIssue,
} from '../types'
import { validate } from '../validate'
import { findBusClass } from './busClass'
import { costBreakdown } from './cost'
import { dataBudget } from './data'
import { linkBudget } from './link'
import { massBreakdown } from './mass'
import { availableDeltaVms } from './orbit'
import { powerBreakdown } from './power'
import { RESOURCE_KEYS, estimateBudgets, systemReliability } from './resources'
import { selectedComponent } from './components'

export type Verdict = 'go' | 'concern' | 'noGo'
export type Discipline =
  | 'power'
  | 'propulsion'
  | 'thermal'
  | 'structures'
  | 'avionics'
  | 'comms'
  | 'attitude'
  | 'cost'
  | 'risk'

export const DISCIPLINES: readonly Discipline[] = [
  'power',
  'propulsion',
  'thermal',
  'structures',
  'avionics',
  'comms',
  'attitude',
  'cost',
  'risk',
]

export interface Finding {
  code: string
  severity: 'ok' | 'warning' | 'error'
  message: string
  subsystem?: Subsystem
  resource?: ResourceKey
}
export interface DisciplineReview {
  discipline: Discipline
  verdict: Verdict // the worst finding
  findings: Finding[]
}
export interface ResourceReview {
  resource: ResourceKey
  budget: ResourceBudget
  verdict: Verdict
}
/**
 * One line of the equipment list. `massKg`, `powerW` and `costM` are what the item adds to the spacecraft, so a
 * redundant component counts twice, and the ground network is its cost over the mission. `costM` sums to the cost total.
 */
export interface EquipmentItem {
  kind: 'busClass' | 'component' | 'instrument' | 'launcher' | 'groundNetwork'
  id: string
  name: string
  subsystem?: Subsystem
  massKg?: number
  powerW?: number
  costM: number
  trl?: number
  redundant?: boolean
}

export interface DesignReview {
  resources: ResourceReview[] // all 6, in ResourceKey order
  disciplines: DisciplineReview[] // all 9, in DISCIPLINES order
  equipment: EquipmentItem[]
  hardBlockers: ValidationIssue[]
  riskBlockers: { resources: ResourceKey[]; issues: ValidationIssue[] }
  canAcceptRisk: boolean // difficulty !== 'cadet'
  overallVerdict: Verdict
}

export interface LaunchDecision {
  allowed: boolean
  reason: 'clear' | 'riskAccepted' | 'hardBlockers' | 'riskNotAccepted' | 'cadetCannotAcceptRisk'
}

const VERDICT_RANK: Record<Verdict, number> = { go: 0, concern: 1, noGo: 2 }
const worst = (verdicts: Verdict[]): Verdict => verdicts.reduce<Verdict>((a, v) => (VERDICT_RANK[v] > VERDICT_RANK[a] ? v : a), 'go')

const BUDGET_VERDICT: Record<ResourceBudget['status'], Verdict> = { green: 'go', amber: 'concern', red: 'noGo' }
const FINDING_VERDICT: Record<Finding['severity'], Verdict> = { ok: 'go', warning: 'concern', error: 'noGo' }

const STRUCTURE_CODES = new Set([
  'TOO_MANY_COMPONENTS',
  'TOO_MANY_INSTRUMENTS',
  'OVER_BUS_MASS',
  'MISSING_BUS_CLASS',
  'UNKNOWN_BUS_CLASS',
  'MISSING_LAUNCHER',
  'UNKNOWN_LAUNCHER',
])
const AVIONICS_CODES = new Set(['STORAGE_TOO_SMALL', 'HIGH_RADIATION'])
const COMMS_CODES = new Set([
  'NO_COMMS',
  'MISSING_GROUND_NETWORK',
  'GROUND_NETWORK_OUT_OF_RANGE',
  'DOWNLINK_BOTTLENECK',
  'DATA_LOSS',
])

/** The discipline an issue belongs to: each issue goes to exactly one, first match wins (FR-14.4). */
export function disciplineOf(issue: Pick<ValidationIssue, 'code' | 'subsystem' | 'resource'>): Discipline {
  const { code, subsystem, resource } = issue
  if (subsystem === 'power' || subsystem === 'battery' || resource === 'power') return 'power'
  if (subsystem === 'propulsion') return 'propulsion'
  if (subsystem === 'thermal') return 'thermal'
  if (subsystem === 'structure' || resource === 'mass' || STRUCTURE_CODES.has(code) || code.startsWith('LAUNCH_')) {
    return 'structures'
  }
  if (subsystem === 'computer' || AVIONICS_CODES.has(code)) return 'avionics'
  if (subsystem === 'comms' || resource === 'data' || resource === 'comms' || COMMS_CODES.has(code)) return 'comms'
  if (subsystem === 'attitude') return 'attitude'
  if (resource === 'budget') return 'cost'
  return 'risk'
}

const RESOURCE_DISCIPLINE: Record<ResourceKey, Discipline> = {
  mass: 'structures',
  power: 'power',
  budget: 'cost',
  data: 'comms',
  comms: 'comms',
  time: 'risk',
}

export function isHardBlocker(issue: ValidationIssue): boolean {
  return (
    issue.severity === 'error' &&
    (HARD_BLOCKER_CODES.includes(issue.code) || HARD_BLOCKER_PREFIXES.some((p) => issue.code.startsWith(p)))
  )
}

const num = (n: number): string => String(Math.round(n * 10) / 10)
const pct = (n: number): string => `${Math.round(n * 100)}%`

function okFinding(discipline: Discipline, design: MissionDesign, data: GameData, budgets: ReturnType<typeof estimateBudgets>): Finding {
  const part = (s: Subsystem): string => selectedComponent(design, s, data)?.name ?? 'none'
  const message = ((): string => {
    switch (discipline) {
      case 'power': {
        const p = powerBreakdown(design, data)
        return `Power: generation covers the load with ${pct(budgets.power.margin)} margin (${num(p.orbitAverageGenerationW)} W vs ${num(p.loadW)} W).`
      }
      case 'propulsion': {
        const orbit = data.orbits.find((o) => o.id === design.orbitId)
        return `Propulsion: ${num(availableDeltaVms(design, data))} m/s of delta-v for the ${num(orbit?.insertionDeltaVms ?? 0)} m/s needed.`
      }
      case 'thermal':
        return `Thermal: ${part('thermal')} selected, no thermal issues found.`
      case 'structures': {
        const m = massBreakdown(design, data)
        return `Structures: ${num(m.totalMassKg)} kg including ${pct(m.contingencyFraction)} contingency, with ${pct(budgets.mass.margin)} mass margin.`
      }
      case 'avionics':
        return `Avionics: ${part('computer')} stores ${num(dataBudget(design, data).storageMb)} Mb.`
      case 'comms': {
        const l = linkBudget(design, data)
        return `Comms: ${num(l.downlinkMbPerDay)} Mb/day of downlink for ${num(l.generatedMbPerDay)} Mb/day generated.`
      }
      case 'attitude':
        return `Attitude control: ${part('attitude')} selected, no pointing issues found.`
      case 'cost': {
        const c = costBreakdown(design, data)
        return `Cost: ${num(c.totalM)} M of the ${num(c.budgetM)} M budget (${pct(budgets.budget.margin)} margin).`
      }
      case 'risk':
        return 'Risk: no open risks.'
    }
  })()
  return { code: 'DISCIPLINE_OK', severity: 'ok', message }
}

function riskSummary(design: MissionDesign, data: GameData): Finding {
  const launcher = data.launchers.find((l) => l.id === design.launcherId)
  const system = systemReliability(design, data)
  return {
    code: 'RISK_SUMMARY',
    severity: 'ok',
    message: `System reliability ${num(system * 100)}%, launcher reliability ${launcher ? num(launcher.reliability * 100) : 'unknown'}%.`,
  }
}

function equipmentList(design: MissionDesign, data: GameData): EquipmentItem[] {
  const items: EquipmentItem[] = []
  const bus = findBusClass(design, data)
  if (bus) items.push({ kind: 'busClass', id: bus.id, name: bus.name, costM: bus.baseCostM })

  const redundant = new Set<Subsystem>(design.redundant)
  for (const [subsystem, id] of Object.entries(design.componentIds) as [Subsystem, string | undefined][]) {
    const component = id ? data.components.find((c) => c.id === id) : undefined
    if (!component) continue
    const units = redundant.has(subsystem) ? 2 : 1
    items.push({
      kind: 'component',
      id: component.id,
      name: component.name,
      subsystem,
      massKg: component.massKg * units,
      powerW: component.powerW * units,
      costM: component.costM * units,
      trl: component.trl,
      redundant: units === 2,
    })
  }
  for (const id of design.instrumentIds) {
    const instrument = data.instruments.find((i) => i.id === id)
    if (instrument) {
      items.push({ kind: 'instrument', id: instrument.id, name: instrument.name, massKg: instrument.massKg, powerW: instrument.powerW, costM: instrument.costM })
    }
  }
  const cost = costBreakdown(design, data)
  const launcher = data.launchers.find((l) => l.id === design.launcherId)
  if (launcher) items.push({ kind: 'launcher', id: launcher.id, name: launcher.name, costM: cost.launchM })
  const network = data.groundNetworks.find((g) => g.id === design.groundNetworkId)
  if (network) items.push({ kind: 'groundNetwork', id: network.id, name: network.name, costM: cost.operations.totalM })
  return items
}

export function designReview(design: MissionDesign, data: GameData): DesignReview {
  const budgets = estimateBudgets(design, data)
  const issues = validate(design, data)

  const resources: ResourceReview[] = RESOURCE_KEYS.map((resource) => ({
    resource,
    budget: budgets[resource],
    verdict: BUDGET_VERDICT[budgets[resource].status],
  }))

  // Findings per discipline: every issue lands in exactly one discipline.
  const byDiscipline = new Map<Discipline, Finding[]>(DISCIPLINES.map((d) => [d, []]))
  for (const issue of issues) {
    byDiscipline.get(disciplineOf(issue))!.push({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      ...(issue.subsystem ? { subsystem: issue.subsystem } : {}),
      ...(issue.resource ? { resource: issue.resource } : {}),
    })
  }
  // A red resource with no error already explaining it (e.g. the time budget) still gets a finding.
  for (const r of resources) {
    if (r.verdict !== 'noGo') continue
    const findings = byDiscipline.get(RESOURCE_DISCIPLINE[r.resource])!
    if (findings.some((f) => f.severity === 'error' && f.resource === r.resource)) continue
    findings.push({
      code: 'RESOURCE_RED',
      severity: 'error',
      resource: r.resource,
      message: `The ${r.resource} budget is over its limit: ${num(r.budget.used)} used of ${num(r.budget.available)} available.`,
    })
  }

  const disciplines: DisciplineReview[] = DISCIPLINES.map((discipline) => {
    const findings = byDiscipline.get(discipline)!
    if (discipline === 'risk') findings.unshift(riskSummary(design, data))
    else if (findings.length === 0) findings.push(okFinding(discipline, design, data, budgets))
    return { discipline, verdict: worst(findings.map((f) => FINDING_VERDICT[f.severity])), findings }
  })

  const hardBlockers = issues.filter(isHardBlocker)
  const riskIssues = issues.filter((i) => i.severity === 'error' && !isHardBlocker(i))
  const redResources = resources.filter((r) => r.verdict === 'noGo').map((r) => r.resource)

  return {
    resources,
    disciplines,
    equipment: equipmentList(design, data),
    hardBlockers,
    riskBlockers: { resources: redResources, issues: riskIssues },
    canAcceptRisk: design.difficulty !== 'cadet',
    overallVerdict: worst([...resources.map((r) => r.verdict), ...disciplines.map((d) => d.verdict)]),
  }
}

/** FR-6.9: launch is blocked while any hard blocker or red remains; risk can be accepted on Engineer and Flight Director only. */
export function launchDecision(review: DesignReview, riskAccepted: boolean): LaunchDecision {
  if (review.hardBlockers.length > 0) return { allowed: false, reason: 'hardBlockers' }
  if (review.riskBlockers.resources.length === 0 && review.riskBlockers.issues.length === 0) {
    return { allowed: true, reason: 'clear' }
  }
  if (!review.canAcceptRisk) return { allowed: false, reason: 'cadetCannotAcceptRisk' }
  return riskAccepted ? { allowed: true, reason: 'riskAccepted' } : { allowed: false, reason: 'riskNotAccepted' }
}
