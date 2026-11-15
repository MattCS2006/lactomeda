// What the landing screen offers (FR-1.1). Pure, unit-tested.
export type MenuEntry = 'solo' | 'createRoom' | 'joinRoom' | 'sandbox' | 'howToPlay'

/** The five entries from the ERS, in order. */
export const MENU_ENTRIES: MenuEntry[] = ['solo', 'createRoom', 'joinRoom', 'sandbox', 'howToPlay']

/**
 * Entries whose feature is not in the game yet: shown (FR-1.1 asks for all five) but disabled
 * with a reason, never a button that silently does nothing. Remove an id when its feature lands:
 * sandbox (FR-2.6).
 */
export const COMING_SOON: ReadonlySet<MenuEntry> = new Set<MenuEntry>(['sandbox'])

/** Team rooms (FR-8.1) need the multiplayer server. */
export const NEEDS_SERVER: ReadonlySet<MenuEntry> = new Set<MenuEntry>(['createRoom', 'joinRoom'])

export function isAvailable(entry: MenuEntry, serverOnline = true): boolean {
  if (COMING_SOON.has(entry)) return false
  return serverOnline || !NEEDS_SERVER.has(entry)
}

/** Why an entry is disabled (translation key), or null when it can be used. */
export function unavailableReason(entry: MenuEntry, serverOnline = true): string | null {
  if (COMING_SOON.has(entry)) return 'landing.soonReason'
  if (!serverOnline && NEEDS_SERVER.has(entry)) return 'landing.offlineReason'
  return null
}

/** Sections of the "How to play" panel, in reading order. */
export const HOW_TO_PLAY_STEPS = ['design', 'resources', 'maturity', 'flight', 'debrief'] as const
