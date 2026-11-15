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

export type RequirementLevel = 'threshold' | 'baseline' | 'goal'

// ─── Catalog data ───────────────────────────────────────────────────────

export interface BusClass {
  id: string // e.g. 'cubesat-3u', 'smallsat', 'large'
  name: string
  volumeL: number // internal volume in litres (1U = 1 L)
  maxMassKg: number
  baseCostM: number
  componentSlots: number // component units that fit, redundant backups included (FR-3.5)
  instrumentSlots: number // max instruments
  roomCount: number // ship interior size (FR-13.1)
  ref?: string // source note for REFERENCES.md
}

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
  tags?: string[] // e.g. 'radHard'
  // Subsystem-specific stats (only the relevant one is set)
  capacityWh?: number // battery
  dataRateKbps?: number // comms
  deltaVms?: number // propulsion
  storageMb?: number // computer
  ref?: string // source note for REFERENCES.md
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
  ifovUrad?: number // instantaneous field of view (µrad): ground resolution = altitude × IFOV; angular resolution for telescopes
  fovDeg?: number // full field of view (deg): swath width = 2 × altitude × tan(fov / 2)
  resolutionM?: number // altitude-independent ground resolution (m), e.g. SAR
  swathKm?: number // fixed swath width (km) for wide cross-track scanners; overrides fovDeg
  ref?: string // source note for REFERENCES.md
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
  sunDistanceAU: number // 1 near Earth, ~1.52 at Mars (solar power)
  radiation: 'low' | 'medium' | 'high'
  source: 'gmat' | 'analytic'
  ref?: string // source note for REFERENCES.md
}

export interface Launcher {
  id: string
  name: string
  capacityKg: Partial<Record<OrbitRegime, number>>
  costM: number
  reliability: number // 0-1
  onlyScenarioIds?: string[] // if set, only offered in these scenarios (e.g. NASA CSLI for student CubeSats)
  ref?: string // source note for REFERENCES.md
}

export interface GroundNetwork {
  id: string
  name: string // e.g. 'NASA NEN', 'DSN'
  costM: number
  contactMultiplier: number // scales Orbit.contactMinPerDay
  maxDistanceKm: number
  ref?: string // source note for REFERENCES.md
}

export interface Objective {
  id: string
  label: string
  metric: string // e.g. 'resolution', 'revisit', 'dataPerDay'
  unit: string // e.g. 'm', 'h', 'Mb/day'
  levels: Record<RequirementLevel, number> // target value per level
}

export interface Scenario {
  id: string
  name: string
  briefing: string
  durationDays: number
  deadlineDays: number // development schedule limit (FR-6.7)
  budgetM: number
  objectives: Objective[]
  allowedOrbitIds: string[]
  realMissionIds: string[] // candidates for "most similar NASA mission" (FR-10.4)
  ref?: string // source note for REFERENCES.md
}

export interface GameData {
  busClasses: BusClass[]
  components: Component[]
  instruments: Instrument[]
  orbits: Orbit[]
  launchers: Launcher[]
  groundNetworks: GroundNetwork[]
  scenarios: Scenario[]
  events: MissionEvent[]
}

// ─── Player design ──────────────────────────────────────────────────────

export interface MissionDesign {
  scenarioId: string
  difficulty: Difficulty
  missionName?: string // FR-2.5
  requirementLevels: Record<string, RequirementLevel> // key = Objective id
  busClassId: string | null // FR-3.1
  componentIds: Partial<Record<Subsystem, string>>
  redundant: Subsystem[] // FR-3.5 — subsystems with a backup unit
  propellantKg: number // FR-3.6
  instrumentIds: string[]
  dutyCycle: Record<string, number> // FR-4.4 — instrumentId -> 0..1 (default 1)
  orbitId: string | null
  altitudeKm?: number // FR-5.3 — override for LEO/SSO
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

export type EffectKey = ResourceKey | 'science' | 'risk' | 'propellant' | 'battery'

export type MinigameKind = 'rewire' | 'alignDish' | 'reboot' | 'balanceWheels'

export interface EventOption {
  id: string
  label: string
  why: string // one plain-language sentence shown in the pop-up
  effects: Partial<Record<EffectKey, number>>
  requiresTag?: string // only offered if the design has it, e.g. 'redundant:attitude'
  minigame?: MinigameKind // optional repair mini-game that scales the cost
}

export interface MissionEvent {
  id: string
  station: Station
  title: string
  description: string
  timerSec: number // engine scales it by difficulty
  options: EventOption[]
  defaultOptionId: string // applied if the timer runs out
  trigger: {
    chancePerDay: number // base odds, scaled by difficulty
    requiresSubsystem?: Subsystem // e.g. engine events need propulsion (FR-13.1)
    mitigatedByTags?: string[] // e.g. ['radHard'] halves the odds (FR-7.7)
  }
  escalateTo?: string // event id raised if ignored (FR-13.4)
}

/** An alarm currently ringing; several can be active at once (FR-13.8). */
export interface ActiveEvent {
  event: MissionEvent
  startedTick: number
  deadlineTick: number
}

// ─── Simulation ─────────────────────────────────────────────────────────

export type EndReason =
  | 'launchFailure'
  | 'lifetimeReached'
  | 'criticalFailure'
  | 'budgetExhausted'
  | 'objectivesMet'

export interface SimLogEntry {
  tick: number
  day: number
  kind: 'info' | 'warning' | 'event' | 'decision' | 'failure'
  text: string
}

export interface SimState {
  tick: number
  day: number
  status: 'running' | 'success' | 'failed' // the sim keeps running while alarms ring
  endReason?: EndReason // set when status is not 'running' (FR-7.9)
  batteryWh: number
  propellantKg: number
  spentM: number // money spent so far
  storedDataMb: number
  downlinkedDataMb: number
  science: number
  risk: number // 0-1, accumulated
  health: Partial<Record<Subsystem, number>> // 0-1
  activeEvents: ActiveEvent[]
  log: SimLogEntry[]
  rng: number // internal RNG state, do not touch outside engine
}

// ─── Results ────────────────────────────────────────────────────────────

export interface ScoreResult {
  total: number // 0-1000 (FR-10.1)
  breakdown: {
    science: number // max 400
    objectives: number // max 250
    efficiency: number // max 150
    reliability: number // max 100
    collaboration: number // max 100 — solo: decision quality
  }
  objectivesMet: Record<string, RequirementLevel | null> // key = Objective id
  stars: 0 | 1 | 2 | 3 // FR-10.2
  outcome: 'fullSuccess' | 'partialSuccess' | 'failure'
}

export interface ExplanationPoint {
  kind: 'good' | 'bad' | 'tip'
  text: string
  decision?: string // the design choice behind it, e.g. 'battery: Li-ion 20 Wh'
  value?: number // the number that proves it (FR-10.3)
  unit?: string
  resource?: ResourceKey
  subsystem?: Subsystem
}

export interface Explanation {
  summary: string
  points: ExplanationPoint[] // top 3 shown in the debrief
}

// ─── Engine API (implemented by Dev 1 in src/engine/index.ts) ───────────
// All functions are pure: they never mutate their inputs.

export interface EngineAPI {
  computeBudgets(design: MissionDesign, data: GameData): Budgets
  validate(design: MissionDesign, data: GameData): ValidationIssue[]
  /** Rolls the launch (FR-7.1). A failed launch returns a finished state with endReason 'launchFailure'. */
  initSim(design: MissionDesign, data: GameData): SimState
  simulateTick(state: SimState, design: MissionDesign, data: GameData): SimState
  resolveEvent(
    state: SimState,
    eventId: string,
    optionId: string,
    design: MissionDesign,
    data: GameData,
    minigameScore?: number, // 0-1, scales the option's costs; default 1
  ): SimState
  score(state: SimState, design: MissionDesign, data: GameData): ScoreResult
  explain(design: MissionDesign, state: SimState | null, data: GameData): Explanation
}
