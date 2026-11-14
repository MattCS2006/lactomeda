// Shared contract between Dev 1 (engine), Dev 2 (UI) and Dev 3 (game).
// Change this file only with agreement from all three; see CLAUDE.md.
// v1 — frozen once all three approve the PR.

// ─── Units ──────────────────────────────────────────────────────────────
// mass: kg · power: W · budget: M USD · data: Mb/day · comms: min/day · time: days

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

/** Orbit class used to look up launcher capacity. */
export type OrbitRegime = 'LEO' | 'SSO' | 'GTO' | 'TLI' | 'ESCAPE'

// ─── Catalog data ───────────────────────────────────────────────────────

export interface Component {
  id: string
  subsystem: Subsystem
  name: string
  tier: 'simple' | 'advanced'
  massKg: number
  powerW: number // positive = consumes, negative = generates (in sunlight)
  costM: number // millions of USD
  trl: number // Technology Readiness Level 1-9
  reliability: number // 0-1
  tags?: string[] // e.g. 'radHard', 'redundant'
  // Subsystem-specific stats (only the relevant one is set)
  capacityWh?: number // battery
  dataRateKbps?: number // comms
  deltaVms?: number // propulsion
  storageMb?: number // computer
}

export interface Instrument {
  id: string
  name: string
  massKg: number
  powerW: number
  costM: number
  dataMbPerDay: number
  science: number
  objectives: string[] // Objective ids
  preferredOrbits: string[] // Orbit ids
}

export interface Orbit {
  id: string
  name: string
  regime: OrbitRegime
  altitudeKm: number
  periodMin: number
  eclipseFraction: number // 0-1
  contactMinPerDay: number // from GMAT
  distanceKm: number // typical comms distance
  radiation: 'low' | 'medium' | 'high'
  source: 'gmat' | 'analytic'
}

export interface Launcher {
  id: string
  name: string
  capacityKg: Partial<Record<OrbitRegime, number>>
  costM: number
  reliability: number // 0-1
}

export interface GroundNetwork {
  id: string
  name: string // e.g. 'NASA NEN', 'DSN'
  costM: number
  contactMultiplier: number // scales Orbit.contactMinPerDay
  maxDistanceKm: number
}

export interface Objective {
  id: string
  label: string
  levels: Record<RequirementLevel, number> // science needed per level
}

export interface Scenario {
  id: string
  name: string
  briefing: string
  durationDays: number
  budgetM: number
  objectives: Objective[]
  allowedOrbitIds: string[]
}

export interface GameData {
  components: Component[]
  instruments: Instrument[]
  orbits: Orbit[]
  launchers: Launcher[]
  groundNetworks: GroundNetwork[]
  scenarios: Scenario[]
  events: MissionEvent[]
}

// ─── Player design ──────────────────────────────────────────────────────

export type RequirementLevel = 'threshold' | 'baseline' | 'goal'

export interface MissionDesign {
  scenarioId: string
  difficulty: Difficulty
  requirementLevels: Record<string, RequirementLevel> // key = Objective id
  componentIds: Partial<Record<Subsystem, string>>
  instrumentIds: string[]
  orbitId: string | null
  launcherId: string | null
  groundNetworkId: string | null
  seed: string // same seed + same design = same simulation
}

// ─── Budgets & validation ───────────────────────────────────────────────

export interface ResourceBudget {
  used: number
  available: number
  margin: number // (available - used) / available; 0 if available = 0
  status: 'green' | 'amber' | 'red' // thresholds live in engine/constants.ts
}

export type Budgets = Record<ResourceKey, ResourceBudget>

export interface ValidationIssue {
  code: string // e.g. 'MISSING_SUBSYSTEM', 'OVER_MASS'
  severity: 'error' | 'warning' // errors block launch
  message: string
  resource?: ResourceKey
  subsystem?: Subsystem
}

// ─── Events ─────────────────────────────────────────────────────────────

export type Station = 'bridge' | 'comms' | 'power' | 'science' | 'navigation' | 'engine' | 'computer'

export type EffectKey = ResourceKey | 'science' | 'risk'

export interface EventOption {
  id: string
  label: string
  why: string
  effects: Partial<Record<EffectKey, number>>
}

export interface MissionEvent {
  id: string
  station: Station
  title: string
  description: string
  timerSec: number // engine scales it by difficulty
  options: EventOption[]
  defaultOptionId: string // applied if the timer runs out
}

// ─── Simulation ─────────────────────────────────────────────────────────

export interface SimLogEntry {
  tick: number
  day: number
  kind: 'info' | 'warning' | 'event' | 'decision' | 'failure'
  text: string
}

export interface SimState {
  tick: number
  day: number
  status: 'running' | 'awaitingDecision' | 'success' | 'failed'
  batteryWh: number
  storedDataMb: number
  downlinkedDataMb: number
  science: number
  risk: number // 0-1, accumulated
  health: Partial<Record<Subsystem, number>> // 0-1
  activeEvent: MissionEvent | null
  log: SimLogEntry[]
  rng: number // internal RNG state, do not touch outside engine
}

// ─── Results ────────────────────────────────────────────────────────────

export interface ScoreResult {
  total: number // 0-100
  breakdown: { science: number; budget: number; risk: number; margins: number }
  objectivesMet: Record<string, RequirementLevel | null> // key = Objective id
  grade: 'S' | 'A' | 'B' | 'C' | 'F'
}

export interface ExplanationPoint {
  kind: 'good' | 'bad' | 'tip'
  text: string
  resource?: ResourceKey
  subsystem?: Subsystem
}

export interface Explanation {
  summary: string
  points: ExplanationPoint[]
}

// ─── Engine API (implemented by Dev 1 in src/engine/index.ts) ───────────
// All functions are pure: they never mutate their inputs.

export interface EngineAPI {
  computeBudgets(design: MissionDesign, data: GameData): Budgets
  validate(design: MissionDesign, data: GameData): ValidationIssue[]
  initSim(design: MissionDesign, data: GameData): SimState
  simulateTick(state: SimState, design: MissionDesign, data: GameData): SimState
  resolveEvent(
    state: SimState,
    optionId: string,
    design: MissionDesign,
    data: GameData,
    minigameScore?: number, // 0-1, scales the option's effects; default 1
  ): SimState
  score(state: SimState, design: MissionDesign, data: GameData): ScoreResult
  explain(design: MissionDesign, state: SimState | null, data: GameData): Explanation
}