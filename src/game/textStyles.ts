// Pixel font for everything Phaser draws (docs/ART.md §7). "Press Start 2P" is designed on an 8 px
// grid, so sizes are multiples of 8: 8 = small labels (only where unavoidable), 16 = normal, 24 = titles.
// Text is rendered at the game's base resolution (resolution 1) and then zoomed by a whole number
// like every other sprite, so each font pixel stays a sharp square.
import type Phaser from 'phaser'
import { PALETTE } from './palette'

export const PIXEL_FONT = '"Press Start 2P"'
export const FONT_FALLBACK = 'monospace'
export const FONT_FAMILY = `${PIXEL_FONT}, ${FONT_FALLBACK}`

export const FONT_SIZE = { small: 8, normal: 16, title: 24 } as const
export type FontSize = (typeof FONT_SIZE)[keyof typeof FONT_SIZE]

/** Phaser text style base: pixel font, given size, crisp resolution. */
export function textStyle(
  size: FontSize,
  color: string = PALETTE.white,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color, resolution: 1, ...extra }
}

/** Small label on a dark chip (room names, console names, "Press E"). */
export function labelStyle(color: string = PALETTE.metalLight, backgroundColor: string = PALETTE.outline) {
  return textStyle(FONT_SIZE.small, color, { backgroundColor, padding: { x: 3, y: 2 } })
}

const FONT_TIMEOUT_MS = 1500

/**
 * Wait for the pixel font before Phaser creates any text (canvas text is drawn once, so a late font
 * would stay in the fallback). Never rejects: after a timeout (offline, blocked) the game starts anyway.
 */
export async function loadPixelFont(timeoutMs = FONT_TIMEOUT_MS): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const load = Promise.all([
    document.fonts.load(`${FONT_SIZE.normal}px ${PIXEL_FONT}`),
    document.fonts.load(`${FONT_SIZE.small}px ${PIXEL_FONT}`),
  ]).then(
    () => undefined,
    () => undefined,
  )
  await Promise.race([load, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))])
}
