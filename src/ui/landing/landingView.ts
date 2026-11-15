// What the landing screen offers (FR-1.1). Pure, unit-tested.
export type MenuEntry = 'solo' | 'createRoom' | 'joinRoom' | 'sandbox' | 'howToPlay'

/** The five entries from the ERS, in order. */
export const MENU_ENTRIES: MenuEntry[] = ['solo', 'createRoom', 'joinRoom', 'sandbox', 'howToPlay']

/**
 * Entries whose feature is not in the game yet: shown (FR-1.1 asks for all five) but disabled
 * with a reason, never a button that silently does nothing. Remove an id when its feature lands:
 * team rooms (FR-8.1, Dev 3), sandbox (FR-2.6).
 */
export const COMING_SOON: ReadonlySet<MenuEntry> = new Set<MenuEntry>(['createRoom', 'joinRoom', 'sandbox'])

export function isAvailable(entry: MenuEntry): boolean {
  return !COMING_SOON.has(entry)
}

/** Sections of the "How to play" panel, in reading order. */
export const HOW_TO_PLAY_STEPS = ['design', 'resources', 'maturity', 'flight', 'debrief'] as const
