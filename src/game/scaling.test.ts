import { describe, expect, it } from 'vitest'
import { integerZoom } from './scaling'

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
