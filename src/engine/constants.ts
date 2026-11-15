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
