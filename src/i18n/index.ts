// i18next setup (FR-12.1). English is the default and the fallback: a key missing in Spanish shows the English text.
// Import this file once (App.tsx does) before any component calls useTranslation().
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import es from './es.json'
import { saveLanguage, savedLanguage, type Language } from './language'

export const resources = { en: { translation: en }, es: { translation: es } } as const

void i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
})

/** Switches the language and remembers it for the next visit. */
export function setLanguage(language: Language): Promise<unknown> {
  saveLanguage(language)
  if (typeof document !== 'undefined') document.documentElement.lang = language
  return i18n.changeLanguage(language)
}

export default i18n
