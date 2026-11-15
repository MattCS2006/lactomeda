// Language choice: English / Español. Remembered in localStorage (which can throw, so every access is wrapped).
export const LANGUAGES = ['en', 'es'] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'en'
export const LANGUAGE_KEY = 'lactomeda.language'

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/** The remembered language, or English when nothing is saved or storage is unavailable. */
export function savedLanguage(): Language {
  try {
    const value = globalThis.localStorage?.getItem(LANGUAGE_KEY)
    return isLanguage(value) ? value : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function saveLanguage(language: Language): void {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_KEY, language)
  } catch {
    // private mode, blocked storage… the choice just won't be remembered
  }
}
