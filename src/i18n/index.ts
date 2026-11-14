// i18next setup (FR-12.1). English is the default; Spanish arrives with SCRUM-112.
// Import this file once (App.tsx does) before any component calls useTranslation().
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

export const resources = { en: { translation: en } } as const

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
})

export default i18n
