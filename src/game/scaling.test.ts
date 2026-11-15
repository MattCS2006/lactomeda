import { describe, expect, it } from 'vitest'
import { fitZoom, integerZoom } from './scaling'

describe('integerZoom', () => {
  it('returns the exact zoom when the parent is a whole multiple', () => {
    expect(integerZoom(640, 360, 640, 360)).toBe(1)
    expect(integerZoom(1280, 720, 640, 360)).toBe(2)
    expect(integerZoom(1920, 1080, 640, 360)).toBe(3)
  })

  it('stays on the lower step just below the next one', () => {
    expect(integerZoom(1279, 720, 640, 360)).toBe(1)
    expect(integerZoom(1280, 719, 640, 360)).toBe(1)
    expect(integerZoom(1919, 1080, 640, 360)).toBe(2)
  })

  it('is limited by the tighter axis', () => {
    expect(integerZoom(3000, 400, 640, 360)).toBe(1)
    expect(integerZoom(700, 2000, 640, 360)).toBe(1)
    expect(integerZoom(2560, 1440, 640, 360)).toBe(4)
  })

  it('never goes below 1, even for tiny or empty parents', () => {
    expect(integerZoom(100, 50, 640, 360)).toBe(1)
    expect(integerZoom(0, 0, 640, 360)).toBe(1)
  })

  it('works for other base sizes (ship preview)', () => {
    expect(integerZoom(640, 400, 320, 200)).toBe(2)
    expect(integerZoom(639, 400, 320, 200)).toBe(1)
  })
})

describe('fitZoom (flight map fills the area)', () => {
  it('uses a whole zoom when it wastes little space', () => {
    expect(fitZoom(1280, 720, 640, 360)).toBe(2)
    expect(fitZoom(1920, 1080, 640, 360)).toBe(3)
    expect(fitZoom(1300, 740, 640, 360)).toBe(2)
  })

  it('uses the exact fit when a whole zoom would leave a lot unused (1366x768 minus the HUD)', () => {
    expect(fitZoom(1318, 520, 640, 360)).toBe(1.44) // height is the limit: 520 / 360
    expect(fitZoom(960, 540, 640, 360)).toBe(1.5)
    expect(fitZoom(2200, 1000, 640, 360)).toBe(2.77)
  })

  it('never overflows: it shrinks below 1 in a small area, and survives bad sizes', () => {
    expect(fitZoom(480, 270, 640, 360)).toBe(0.75)
    expect(fitZoom(0, 0, 640, 360)).toBe(1)
    expect(fitZoom(Number.NaN, 100, 640, 360)).toBe(1)
  })

  it('the map always fits inside the area', () => {
    for (const [w, h] of [[1366, 560], [1920, 900], [800, 600], [2560, 1300]] as const) {
      const z = fitZoom(w, h, 640, 360)
      expect(640 * z).toBeLessThanOrEqual(w)
      expect(360 * z).toBeLessThanOrEqual(h)
    }
  })
})
