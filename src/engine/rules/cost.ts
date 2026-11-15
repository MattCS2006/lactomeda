// FR-6.5 cost budget: development + launch + operations x lifetime (M USD). Pure and deterministic.
// Missing or unknown ids contribute 0 and never throw. `message` text is an English fallback; the UI translates by `code`.
import type { GameData, MissionDesign, Subsystem, ValidationIssue } from '../types'

export type CostCategory = 'development' | 'launch' | 'operations'

export interface CostLine {
  category: CostCategory
  itemId: string // busClassId, componentId, instrumentId, launcherId or groundNetworkId
  costM: number
}

export interface CostBreakdown {
  development: { busM: number; componentsM: number; instrumentsM: number; totalM: number }
  launchM: number
  operations: { perYearM: number; years: number; totalM: number }
  totalM: number
  budgetM: number // scenario.budgetM
  remainingM: number // budgetM - totalM (negative = over budget)
  lines: CostLine[] // every item, for drill-down / tooltips
  chart: { category: CostCategory; valueM: number; fraction: number }[] // development, launch, operations; fractions sum to 1 (all 0 if total is 0)
}

export function costBreakdown(design: MissionDesign, data: GameData): CostBreakdown {
  const lines: CostLine[] = []

  // development: bus + components (x2 when the subsystem has a backup) + instruments
  const bus = data.busClasses.find((b) => b.id === design.busClassId)
  const busM = bus?.baseCostM ?? 0
  if (bus) lines.push({ category: 'development', itemId: bus.id, costM: busM })

  const redundant = new Set<Subsystem>(design.redundant)
  let componentsM = 0
  for (const [subsystem, id] of Object.entries(design.componentIds) as [Subsystem, string | undefined][]) {
    if (!id) continue
    const component = data.components.find((c) => c.id === id)
    if (!component) continue
    const costM = component.costM * (redundant.has(subsystem) ? 2 : 1)
    componentsM += costM
    lines.push({ category: 'development', itemId: component.id, costM })
  }

  let instrumentsM = 0
  for (const id of design.instrumentIds) {
    const instrument = data.instruments.find((i) => i.id === id)
    if (!instrument) continue
    instrumentsM += instrument.costM
    lines.push({ category: 'development', itemId: instrument.id, costM: instrument.costM })
  }
  const developmentM = busM + componentsM + instrumentsM

  // launch
  const launcher = data.launchers.find((l) => l.id === design.launcherId)
  const launchM = launcher?.costM ?? 0
  if (launcher) lines.push({ category: 'launch', itemId: launcher.id, costM: launchM })

  // operations: ground network cost per year x planned lifetime in years
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const network = data.groundNetworks.find((g) => g.id === design.groundNetworkId)
  const years = (scenario?.durationDays ?? 0) / 365
  const perYearM = network?.costM ?? 0
  const operationsM = perYearM * years
  if (network) lines.push({ category: 'operations', itemId: network.id, costM: operationsM })

  const totalM = developmentM + launchM + operationsM
  const budgetM = scenario?.budgetM ?? 0
  const values: [CostCategory, number][] = [
    ['development', developmentM],
    ['launch', launchM],
    ['operations', operationsM],
  ]

  return {
    development: { busM, componentsM, instrumentsM, totalM: developmentM },
    launchM,
    operations: { perYearM, years, totalM: operationsM },
    totalM,
    budgetM,
    remainingM: budgetM - totalM,
    lines,
    chart: values.map(([category, valueM]) => ({ category, valueM, fraction: totalM > 0 ? valueM / totalM : 0 })),
  }
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100)

export function validateCost(design: MissionDesign, data: GameData): ValidationIssue[] {
  const c = costBreakdown(design, data)
  if (c.totalM <= c.budgetM) return []
  const biggest = c.chart.reduce((a, b) => (b.valueM > a.valueM ? b : a))
  return [
    {
      code: 'OVER_BUDGET',
      severity: 'error',
      resource: 'budget',
      message: `Over budget by ${fmt(c.totalM - c.budgetM)} M: development ${fmt(c.development.totalM)} M, launch ${fmt(c.launchM)} M, operations ${fmt(c.operations.totalM)} M. The biggest cost is ${biggest.category}.`,
    },
  ]
}
