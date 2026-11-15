// Language selector (Task B): the choice is applied, remembered, survives a broken localStorage,
// and a key missing in Spanish falls back to English.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from './en.json'
import i18n, { setLanguage } from './index'
import { LANGUAGE_KEY, savedLanguage } from './language'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('language selector', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
  afterEach(async () => {
    vi.unstubAllGlobals()
    await i18n.changeLanguage('en')
  })

  it('defaults to English when nothing is saved or the value is unknown', () => {
    expect(savedLanguage()).toBe('en')
    localStorage.setItem(LANGUAGE_KEY, 'fr')
    expect(savedLanguage()).toBe('en')
  })

  it('changes the language and remembers it', async () => {
    await setLanguage('es')
    expect(i18n.language).toBe('es')
    expect(i18n.t('languageSelector.es')).toBe('Español')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('es')
    expect(savedLanguage()).toBe('es')
    await setLanguage('en')
    expect(savedLanguage()).toBe('en')
  })

  it('still works when localStorage throws', async () => {
    vi.stubGlobal('localStorage', throwing)
    expect(savedLanguage()).toBe('en')
    await expect(setLanguage('es')).resolves.toBeDefined()
    expect(i18n.language).toBe('es')
  })

  it('falls back to English for a key missing in Spanish', async () => {
    i18n.addResourceBundle('es', 'translation', {}, true)
    const bundle = i18n.getResourceBundle('es', 'translation') as Record<string, unknown>
    const probe = 'common'
    const saved = bundle[probe]
    delete bundle[probe]
    await setLanguage('es')
    expect(i18n.t('common.back')).toBe(en.common.back) // never blank, never the key
    bundle[probe] = saved
  })
})
