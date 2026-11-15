import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { makeBudget } from '../../engine/budgets'
import type { MissionDesign } from '../../engine/types'
import en from '../../i18n/en.json'
import { createDesign } from '../store/missionStore'
import { resourceCells } from './resourceBarView'
import { STATUS_LOOK, lookFor } from './statusView'

const text = (key: string) =>
  key
    .split('.')
    .reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), en)

describe('resource states (FR-6.2)', () => {
  it('uses the ERS thresholds: green ≥ 20% margin, amber 0–20%, red below 0', () => {
    expect(makeBudget(75, 100).status).toBe('green') // 25%
    expect(makeBudget(80, 100).status).toBe('green') // exactly 20%
    expect(makeBudget(90, 100).status).toBe('amber') // 10%
    expect(makeBudget(100, 100).status).toBe('amber') // 0%
    expect(makeBudget(105, 100).status).toBe('red') // −5%
  })

  it('never shows a state by colour alone: each has its own icon and text', () => {
    const looks = Object.values(STATUS_LOOK)
    expect(new Set(looks.map((l) => l.icon)).size).toBe(looks.length)
    for (const l of looks) expect(typeof text(l.textKey), l.textKey).toBe('string')
    expect(new Set(looks.map((l) => text(l.textKey))).size).toBe(looks.length)
  })

  it('pending resources get the neutral look, not red', () => {
    expect(lookFor(null)).toBe(STATUS_LOOK.pending)
    const fresh = createDesign('student-cubesat', gameData, 'cadet', 's')
    const mass = resourceCells(fresh, gameData).find((c) => c.key === 'mass')!
    expect(lookFor(mass.status)).toBe(STATUS_LOOK.pending)
  })

  it('states change instantly on an edit: the budget goes green → red when the design costs too much', () => {
    const base: MissionDesign = { ...createDesign('student-cubesat', gameData, 'cadet', 's') }
    const budgetOf = (d: MissionDesign) => resourceCells(d, gameData).find((c) => c.key === 'budget')!
    expect(budgetOf(base).status).toBe('green')
    // the $70M medium launcher blows the $2M student budget
    const over = { ...base, orbitId: 'leo', launcherId: 'lv-medium' }
    expect(budgetOf(over).status).toBe('red')
    expect(lookFor(budgetOf(over).status).icon).toBe('✕')
  })
})
