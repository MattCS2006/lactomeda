import { describe, expect, it } from 'vitest'
import { makeBudget, solarPowerW } from './budgets'

describe('makeBudget', () => {
  it('is green with a 20% margin or more', () => {
    expect(makeBudget(80, 100).status).toBe('green')
  })
  it('is amber between 0 and 20%', () => {
    expect(makeBudget(90, 100).status).toBe('amber')
  })
  it('is red when over budget', () => {
    expect(makeBudget(110, 100).status).toBe('red')
  })
})

describe('solarPowerW', () => {
  it('drops to about 43% at Mars distance', () => {
    const earth = solarPowerW({ areaM2: 1, efficiency: 0.28, distanceAU: 1, eclipseFraction: 0 })
    const mars = solarPowerW({ areaM2: 1, efficiency: 0.28, distanceAU: 1.524, eclipseFraction: 0 })
    expect(mars / earth).toBeCloseTo(0.43, 2)
  })
})
