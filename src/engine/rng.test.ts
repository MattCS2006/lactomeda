import { describe, expect, it } from 'vitest'
import { draw, drawInt } from './rng'

const sequence = (seed: string, n: number): number[] => {
  const out: number[] = []
  let counter = 0
  for (let i = 0; i < n; i++) {
    const d = draw(seed, counter)
    out.push(d.value)
    counter = d.counter
  }
  return out
}

describe('draw', () => {
  it('gives the same value for the same seed and counter, and advances the counter by one', () => {
    expect(draw('abc', 7)).toEqual(draw('abc', 7))
    expect(draw('abc', 7).counter).toBe(8)
  })

  it('gives different sequences for different seeds, and different values for different counters', () => {
    expect(sequence('abc', 20)).not.toEqual(sequence('abd', 20))
    expect(new Set(sequence('abc', 50)).size).toBe(50)
  })

  it('stays in [0, 1)', () => {
    for (const v of sequence('range', 500)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('does not depend on earlier calls (no hidden state)', () => {
    const first = draw('s', 3).value
    draw('s', 0)
    draw('other', 3)
    expect(draw('s', 3).value).toBe(first)
  })
})

describe('drawInt', () => {
  it('is an integer in [0, max) and uses the same draw as draw()', () => {
    for (let c = 0; c < 200; c++) {
      const r = drawInt('ints', c, 6)
      expect(Number.isInteger(r.value)).toBe(true)
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThan(6)
      expect(r.value).toBe(Math.floor(draw('ints', c).value * 6))
      expect(r.counter).toBe(c + 1)
    }
  })

  it('covers every value of a small range and returns 0 for a non-positive max', () => {
    const seen = new Set<number>()
    for (let c = 0; c < 200; c++) seen.add(drawInt('cover', c, 4).value)
    expect([...seen].sort()).toEqual([0, 1, 2, 3])
    expect(drawInt('x', 0, 0).value).toBe(0)
  })
})
