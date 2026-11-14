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
