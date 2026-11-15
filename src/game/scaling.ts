// Integer scaling (docs/ART.md §1): the game is drawn at a fixed base resolution and shown at a
// whole-number zoom, so every art pixel is the same size on screen (never blurry or uneven).

/** Largest whole zoom (>= 1) at which baseW x baseH fits inside w x h. */
export function integerZoom(w: number, h: number, baseW: number, baseH: number): number {
  const z = Math.floor(Math.min(w / baseW, h / baseH))
  return Number.isFinite(z) ? Math.max(1, z) : 1
}
