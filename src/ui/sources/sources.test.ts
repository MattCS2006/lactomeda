import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/en.json'
import { NASA_SOURCES, sourceKeys } from './sourcesView'

const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en)

describe('FR-14.1 NASA Sources — acceptance: all resources in ERS §9 listed with links', () => {
  it('lists the nine resources of ERS §9, each once', () => {
    expect(NASA_SOURCES).toHaveLength(9)
    expect(new Set(NASA_SOURCES.map((s) => s.id)).size).toBe(9)
  })

  it('every resource has a secure, valid, unique link', () => {
    for (const s of NASA_SOURCES) {
      const url = new URL(s.url)
      expect(url.protocol, s.id).toBe('https:')
    }
    expect(new Set(NASA_SOURCES.map((s) => s.url)).size).toBe(NASA_SOURCES.length)
  })

  it('every resource says what it is, how the game uses it and where players see it', () => {
    for (const s of NASA_SOURCES) {
      for (const key of Object.values(sourceKeys(s.id))) {
        const text = lookup(key)
        expect(typeof text, key).toBe('string')
        expect((text as string).length, key).toBeGreaterThan(3)
      }
      expect(s.req).toMatch(/^FR-\d+\.\d+$/)
    }
  })

  it('REFERENCES.md (FR-14.9, Space Apps References field) carries the same links', () => {
    const refs = readFileSync(new URL('../../../REFERENCES.md', import.meta.url), 'utf8')
    for (const s of NASA_SOURCES) expect(refs, s.id).toContain(s.url)
  })
})
