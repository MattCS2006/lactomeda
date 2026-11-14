// Shared contract between Dev 1 (engine), Dev 2 (UI) and Dev 3 (game).
// Change this file only with agreement from all three; see CLAUDE.md.

export type ResourceKey = 'mass' | 'power' | 'budget' | 'data' | 'comms' | 'time'

export type Subsystem =
  | 'structure'
  | 'power'
  | 'battery'
  | 'computer'
  | 'attitude'
  | 'propulsion'
  | 'thermal'
  | 'comms'

export type Difficulty = 'cadet' | 'engineer' | 'flightDirector'

export interface Component {
  id: string
  subsystem: Subsystem
  name: string
  tier: 'simple' | 'advanced'
  massKg: number
  powerW: number // positive = consumes, negative = generates
  costM: number // millions of USD
  trl: number // Technology Readiness Level 1-9
  reliability: number // 0-1
  tags?: string[] // e.g. 'radHard', 'redundant'
}

export interface Instrument {
  id: string
  name: string
  massKg: number
  powerW: number
  costM: number
  dataMbPerDay: number
  science: number
  objectives: string[]
  preferredOrbits: string[]
}

export interface Orbit {
  id: string
  name: string
  altitudeKm: number
  periodMin: number
  eclipseFraction: number
  contactMinPerDay: number // from GMAT
  distanceKm: number // typical comms distance
  radiation: 'low' | 'medium' | 'high'
  source: 'gmat' | 'analytic'
}

export interface Launcher {
  id: string
  name: string
  capacityKg: Partial<Record<'LEO' | 'SSO' | 'GTO' | 'TLI' | 'ESCAPE', number>>
  costM: number
  reliability: number
}

export interface MissionDesign {
  scenarioId: string
  difficulty: Difficulty
  requirementLevels: Record<string, 'threshold' | 'baseline' | 'goal'>
  componentIds: Partial<Record<Subsystem, string>>
  instrumentIds: string[]
  orbitId: string | null
  launcherId: string | null
  groundNetworkId: string | null
  seed: string
}

export interface ResourceBudget {
  used: number
  available: number
  margin: number // (available - used) / available
  status: 'green' | 'amber' | 'red'
}

export type Budgets = Record<ResourceKey, ResourceBudget>

export interface EventOption {
  id: string
  label: string
  why: string
  effects: Partial<Record<ResourceKey | 'science' | 'risk', number>>
}

export interface MissionEvent {
  id: string
  station: 'bridge' | 'comms' | 'power' | 'science' | 'navigation' | 'engine' | 'computer'
  title: string
  description: string
  timerSec: number
  options: EventOption[]
}
