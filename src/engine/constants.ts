// Tunable numbers for the engine. These are game balance values, not measured data:
// change them here, never inline in the rules.

/** Budget status: margin >= GREEN is green, margin >= 0 is amber, below 0 is red. */
export const STATUS_GREEN_MARGIN = 0.2

/** Downlink reference distances (km): beyond them the link rate falls as (d0 / d)^2 (ERS 7.5). */
export const REF_DISTANCE_KM = 2000
export const REF_DISTANCE_DEEP_SPACE_KM = 4e8 // used when the comms component has the `deepSpace` tag

export const MINUTES_PER_DAY = 1440

/** Median life used when the system has reliability 1, as a multiple of the required lifetime. */
export const PERFECT_RELIABILITY_LIFE_FACTOR = 10

/** FR-4.3 (game balance, must stay <= 0.5): each extra copy of the same instrument gives this fraction of the previous copy's science. */
export const DUPLICATE_SCIENCE_FACTOR = 0.5

// ─── FR-4.5 objective evaluation ────────────────────────────────────────

/** Physical constants for the imaging geometry (Earth only). */
export const EARTH_MU_KM3_S2 = 398600
export const EARTH_RADIUS_KM = 6378
export const EARTH_CIRCUMFERENCE_KM = 40075
export const URAD_PER_ARCSEC = 4.8481

/** Orbits that are not Earth-centred: Earth revisit and coverage do not apply there. */
export const NON_EARTH_ORBIT_IDS: readonly string[] = ['l2', 'lunar', 'mars']

/** Game balance: a geostationary imager sees the same disc all the time; revisit in hours. */
export const GEO_REVISIT_H = 0.25

/** Game balance: objective score at each requirement level (linear in between, 1 at goal or better). */
export const SCORE_AT_THRESHOLD = 0.5
export const SCORE_AT_BASELINE = 0.75
export const SCORE_AT_GOAL = 1

// ─── FR-5.2 orbit properties ────────────────────────────────────────────

/** ERS 7.5: depth of discharge the battery is sized for (E_battery >= P_load x t_eclipse / DoD). */
export const BATTERY_DOD = 0.3

/** Game balance: radiation scales every component's failure rate; a component's reliability r becomes r^factor. radHard parts ignore it. */
export const RADIATION_FACTOR: Record<'low' | 'medium' | 'high', number> = { low: 1, medium: 1.5, high: 2.5 }

// ─── FR-6.3 mass budget ─────────────────────────────────────────────────

/** FR-6.3 (game balance, must stay within 0.10-0.20): mass growth allowance on the dry mass, by difficulty (FR-2.2). */
export const MASS_CONTINGENCY: Record<'cadet' | 'engineer' | 'flightDirector', number> = {
  cadet: 0.1,
  engineer: 0.15,
  flightDirector: 0.2,
}

// ─── FR-6.4 power budget ────────────────────────────────────────────────

/** Game balance: yearly loss of solar-array output (radiation, thermal cycling). ERS 7.5 term (1 - d)^years. */
export const SOLAR_DEGRADATION_PER_YEAR = 0.03

/** Game balance: yearly loss of RTG output (plutonium decay and thermocouple ageing). */
export const RTG_DEGRADATION_PER_YEAR = 0.04
