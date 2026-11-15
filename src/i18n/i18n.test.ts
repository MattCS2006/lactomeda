// FR-12.1 — all UI text is externalized (English default), checked on every `npm test`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './en.json'
import i18n from './index'
import { translateLabel } from '../ui/scenarios/scenarioView'

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path, ext)
    return ext.test(path) && !path.includes('.test.') ? [path] : []
  })
}

const components = [...files('src/ui', /\.tsx$/), 'src/App.tsx']
const sources = [...files('src/ui', /\.tsx?$/), 'src/App.tsx']
const lines = components.flatMap((file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((text, i) => ({ where: `${file}:${i + 1}`, text })),
)

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), en)
}

describe('i18n setup (FR-12.1)', () => {
  it('English is the default language and en.json is loaded', () => {
    expect(i18n.language).toBe('en')
    expect(i18n.t('app.title')).toBe(en.app.title)
  })

  it('no hard-coded words between JSX tags', () => {
    // text such as  <p>Some words</p>,  ▶ Next</button>  or a phrase alone on a JSX line
    const inline = /^[^<{]*>[^<>{}=]*[A-Za-z]{2,}[^<>{}]*<\//
    const phrase = /^\s*[A-Z][a-z]+( [A-Za-z]+)+[.!?]?\s*$/
    const bad = lines.filter((l) => inline.test(l.text.trim()) || phrase.test(l.text))
    expect(bad.map((l) => `${l.where}  ${l.text.trim()}`)).toEqual([])
  })

  it('no hard-coded words in user-facing attributes', () => {
    const bad = lines.filter((l) => /\b(title|aria-label|placeholder|alt)="[^"]*[A-Za-z]{2,}/.test(l.text))
    expect(bad.map((l) => `${l.where}  ${l.text.trim()}`)).toEqual([])
  })

  it('no units glued to numbers in code (they live in units.* so they can be translated)', () => {
    const bad = lines.filter((l) => /\}\s?(kg|W|Mb\/d(ay)?|min\/day|km|days)\b|`\$\$\{/.test(l.text))
    expect(bad.map((l) => `${l.where}  ${l.text.trim()}`)).toEqual([])
  })

  it('every literal key used with t(...) exists in en.json', () => {
    const missing: string[] = []
    for (const file of sources) {
      const code = readFileSync(file, 'utf8')
      for (const m of code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        const key = m[1]
        // i18next plurals: key_one / key_other
        if (lookup(key) === undefined && lookup(`${key}_one`) === undefined) missing.push(`${file}: ${key}`)
      }
      for (const m of code.matchAll(/\bkey: '([a-zA-Z0-9_.]+)'/g)) {
        if (lookup(m[1]) === undefined) missing.push(`${file}: ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('translates nested labels (a distance inside a sentence)', () => {
    const text = translateLabel(i18n.t, {
      key: 'ground.tooFar',
      values: {
        reach: { key: 'units.km', values: { value: '3,000' } },
        distance: { key: 'units.kmMillion', values: { value: '1.5' } },
      },
    })
    expect(text).toBe('Too far: reaches up to 3,000 km, your orbit is 1.5 million km away.')
  })
})
