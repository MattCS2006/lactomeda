// FR-14.2: every orbit marked `source: "gmat"` must be backed by a committed GMAT output in gmat/output/,
// and its period, eclipse fraction and contact minutes must equal that file's values.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gameData } from './index'

interface GmatOutput {
  periodMin: number
  eclipseFraction: number
  contactMinPerDay: number
}

const gmatOrbits = gameData.orbits.filter((o) => o.source === 'gmat')
const outputPath = (ref: string | undefined): string | null => {
  const match = /gmat\/output\/[\w.-]+\.json/.exec(ref ?? '')
  return match ? resolve(__dirname, '../../', match[0]) : null
}

describe('GMAT-backed orbits (FR-14.2)', () => {
  it('there is at least one GMAT-backed orbit', () => {
    expect(gmatOrbits.length).toBeGreaterThan(0)
  })

  it.each(gmatOrbits.map((o) => [o.id, o] as const))('%s matches its GMAT output file', (_id, orbit) => {
    const path = outputPath(orbit.ref)
    expect(path, `${orbit.id}: ref must name a gmat/output/*.json file`).not.toBeNull()
    expect(existsSync(path as string), `${orbit.id}: ${path} is missing`).toBe(true)
    const gmat = JSON.parse(readFileSync(path as string, 'utf8')) as GmatOutput
    expect(orbit.periodMin).toBe(gmat.periodMin)
    expect(orbit.eclipseFraction).toBe(gmat.eclipseFraction)
    expect(orbit.contactMinPerDay).toBe(gmat.contactMinPerDay)
  })
})
