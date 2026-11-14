import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { DUPLICATE_SCIENCE_FACTOR } from '../constants'
import { instrumentScienceBreakdown, marginalScience, payloadScience } from './science'
import { cubesatDesign } from './testDesign'

const MS = 'inst-multispectral' // science 35
const IR = 'inst-thermal-ir' // science 30
const design = (...instrumentIds: string[]) => cubesatDesign({ instrumentIds })

describe('FR-4.3 duplicate instruments', () => {
  it('acceptance: second identical instrument gives <= 50% of the first', () => {
    const [first, second] = instrumentScienceBreakdown(design(MS, MS), gameData)
    expect(first.value).toBe(35)
    expect(second.value).toBe(17.5)
    expect(second.value).toBeLessThanOrEqual(first.value * 0.5)
    expect(second.copy).toBe(2)
    expect(payloadScience(design(MS, MS), gameData)).toBe(52.5)
  })

  it('three copies give 35 + 17.5 + 8.75', () => {
    const values = instrumentScienceBreakdown(design(MS, MS, MS), gameData).map((e) => e.value)
    expect(values).toEqual([35, 17.5, 8.75])
    expect(payloadScience(design(MS, MS, MS), gameData)).toBe(61.25)
  })

  it('different instruments each give full value', () => {
    expect(payloadScience(design(MS, IR), gameData)).toBe(65)
  })

  it('order does not change the total', () => {
    expect(payloadScience(design(MS, IR, MS), gameData)).toBe(payloadScience(design(MS, MS, IR), gameData))
  })

  it('marginalScience: full, half, quarter', () => {
    expect(marginalScience(design(), MS, gameData)).toBe(35)
    expect(marginalScience(design(MS), MS, gameData)).toBe(17.5)
    expect(marginalScience(design(MS, MS), MS, gameData)).toBe(8.75)
    expect(marginalScience(design(MS), IR, gameData)).toBe(30)
  })

  it('unknown id contributes 0 and does not throw', () => {
    const d = design('nope', MS)
    expect(() => payloadScience(d, gameData)).not.toThrow()
    expect(payloadScience(d, gameData)).toBe(35)
    expect(marginalScience(d, 'nope', gameData)).toBe(0)
  })

  it('does not mutate its inputs', () => {
    const d = design(MS, MS, IR)
    const snapshot = JSON.stringify([d, gameData])
    instrumentScienceBreakdown(d, gameData)
    payloadScience(d, gameData)
    marginalScience(d, MS, gameData)
    expect(JSON.stringify([d, gameData])).toBe(snapshot)
  })

  it('DUPLICATE_SCIENCE_FACTOR is <= 0.5', () => {
    expect(DUPLICATE_SCIENCE_FACTOR).toBeLessThanOrEqual(0.5)
  })
})
