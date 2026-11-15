import { describe, expect, it } from 'vitest'
import { fullGameData as gameData } from '../../data'
import en from '../../i18n/en.json'
import { TOOLTIP_MAX_WORDS, tooltipIds, wordCount } from './tooltips'

const items = en.tooltip.items as Record<string, string>

describe('plain-language tooltips (FR-1.3)', () => {
  it('acceptance: 100% of resources and catalog items have a tooltip', () => {
    const missing = tooltipIds(gameData).filter((id) => typeof items[id] !== 'string' || items[id].trim() === '')
    expect(missing).toEqual([])
  })

  it('acceptance: every tooltip is 40 words or fewer', () => {
    const long = Object.entries(items)
      .filter(([, text]) => wordCount(text) > TOOLTIP_MAX_WORDS)
      .map(([id, text]) => `${id}: ${wordCount(text)} words`)
    expect(long).toEqual([])
  })

  it('has no leftover tooltips for items that are no longer in the catalog', () => {
    const ids = new Set(tooltipIds(gameData))
    expect(Object.keys(items).filter((id) => !ids.has(id))).toEqual([])
  })

  it('counts words', () => {
    expect(wordCount('  A small   camera. ')).toBe(3)
  })
})
