// Integer scaling (docs/ART.md §1): the game is drawn at a fixed base resolution and shown at a
// whole-number zoom, so every art pixel is the same size on screen (never blurry or uneven).

/** Largest whole zoom (>= 1) at which baseW x baseH fits inside w x h. */
export function integerZoom(w: number, h: number, baseW: number, baseH: number): number {
  const z = Math.floor(Math.min(w / baseW, h / baseH))
  return Number.isFinite(z) ? Math.max(1, z) : 1
}

/**
 * Zoom that fills w x h with the base resolution (flight map). A whole number whenever that wastes little space (the
 * pixels stay perfectly even); otherwise the exact fit, so the map is as big as the area allows and never cut off.
 * Below 1 it shrinks instead of overflowing.
 */
export function fitZoom(w: number, h: number, baseW: number, baseH: number): number {
  const fit = Math.min(w / baseW, h / baseH)
  if (!Number.isFinite(fit) || fit <= 0) return 1
  const whole = Math.floor(fit)
  if (whole >= 1 && whole >= fit * FIT_WHOLE_RATIO) return whole
  return Math.max(0.25, Math.floor(fit * 100) / 100)
}

/** A whole zoom is used if it fills at least this share of what an exact fit would. */
const FIT_WHOLE_RATIO = 0.85
