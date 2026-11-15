// UI style rules from docs/ART.md ("UI rules", SCRUM-93), checked on every `npm test`:
// palette tokens instead of raw hex, pixel font from the token, and text no smaller than 10 px
// (8 px allowed only on the tiny status badges).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return tsxFiles(path)
    return path.endsWith('.tsx') ? [path] : []
  })
}

const files = [...tsxFiles('src/ui'), 'src/App.tsx']
const lines = files.flatMap((file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((text, i) => ({ where: `${file}:${i + 1}`, text })),
)

describe('UI style (docs/ART.md UI rules)', () => {
  it('scans the UI files', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('uses palette tokens, never raw hex colours', () => {
    const bad = lines.filter((l) => /#[0-9a-fA-F]{6}\b/.test(l.text)).map((l) => l.where)
    expect(bad).toEqual([])
  })

  it('uses the font-pixel token', () => {
    expect(lines.filter((l) => l.text.includes('Press_Start_2P')).map((l) => l.where)).toEqual([])
  })

  it('keeps text at 10 px or more, except tiny badges', () => {
    const bad = lines
      .filter(
        (l) => /text-\[(\d)px\]/.test(l.text) && !l.text.includes('shrink-0 border px-2 py-1 text-[8px] uppercase'),
      )
      .map((l) => l.where)
    expect(bad).toEqual([])
  })
})
