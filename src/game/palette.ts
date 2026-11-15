// Sweetie 16 palette (GrafxKid) — the ONLY colours the game may use. See docs/ART.md §2.
// Names match the --color-<name> tokens in src/index.css (kebab-case there: metal-dark, ok-light…).

/** '#rrggbb' strings, for CSS and Phaser text styles. */
export const PALETTE = {
  outline: '#1a1c2c', // K — outlines, darkest shadows, backgrounds
  metalDark: '#333c57', // D — dark metal, bezels, panels
  metal: '#566c86', // M — metal, desks
  metalLight: '#94b0c2', // G — light metal, borders, secondary text
  white: '#f4f4f4', // W — suit, text on screens
  screen: '#29366f', // B — screens (normal)
  visor: '#3b5dc9', // V — helmet visor
  info: '#41a6f6', // C — info, comms, cyan
  shine: '#73eff7', // c — shine / highlights
  ok: '#38b764', // N — OK / green status
  okLight: '#a7f070', // n — charts, energy
  warning: '#ffcd75', // Y — warning / amber status
  orange: '#ef7d57', // r — fire, orange player
  alarm: '#b13e53', // R — alarm / red status
  teal: '#257179', // T — spare
  purple: '#5d275d', // P — spare
} as const

export type PaletteName = keyof typeof PALETTE

const toNumber = (hex: string) => parseInt(hex.slice(1), 16)

/** 0xrrggbb numbers, for Phaser fills, strokes and tints. */
export const PALETTE_NUM = Object.fromEntries(
  Object.entries(PALETTE).map(([name, hex]) => [name, toNumber(hex)]),
) as { readonly [K in PaletteName]: number }

/** Status colours always mean the same thing (docs/ART.md §2). Pair them with an icon or text. */
export const STATUS = {
  ok: PALETTE.ok,
  warning: PALETTE.warning,
  alarm: PALETTE.alarm,
  off: PALETTE.metalLight,
} as const

export const STATUS_NUM = {
  ok: PALETTE_NUM.ok,
  warning: PALETTE_NUM.warning,
  alarm: PALETTE_NUM.alarm,
  off: PALETTE_NUM.metalLight,
} as const

/** Every palette colour as a lower-case '#rrggbb' (used by the style tests). */
export const PALETTE_HEX_LIST: readonly string[] = Object.values(PALETTE)
