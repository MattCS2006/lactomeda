import { describe, expect, it } from 'vitest'
import {
  PLAYER_SPEED,
  axesToVelocity,
  facingFromVelocity,
  inputToVelocity,
  type DirectionKeys,
} from './movement'

const none: DirectionKeys = { up: false, down: false, left: false, right: false }

describe('inputToVelocity', () => {
  it('is zero with no input', () => {
    expect(inputToVelocity(none)).toEqual({ x: 0, y: 0 })
  })

  it('moves at full speed in a single direction', () => {
    expect(inputToVelocity({ ...none, right: true })).toEqual({ x: PLAYER_SPEED, y: 0 })
    expect(inputToVelocity({ ...none, left: true })).toEqual({ x: -PLAYER_SPEED, y: 0 })
    expect(inputToVelocity({ ...none, down: true })).toEqual({ x: 0, y: PLAYER_SPEED })
    expect(inputToVelocity({ ...none, up: true })).toEqual({ x: 0, y: -PLAYER_SPEED })
  })

  it('normalizes diagonals so they are not faster', () => {
    const v = inputToVelocity({ ...none, up: true, right: true })
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(PLAYER_SPEED)
    expect(v.x).toBeGreaterThan(0)
    expect(v.y).toBeLessThan(0)
  })

  it('cancels opposite keys', () => {
    expect(inputToVelocity({ ...none, left: true, right: true })).toEqual({ x: 0, y: 0 })
    expect(inputToVelocity({ ...none, up: true, down: true })).toEqual({ x: 0, y: 0 })
    expect(inputToVelocity({ up: true, down: true, left: false, right: true })).toEqual({
      x: PLAYER_SPEED,
      y: 0,
    })
  })

  it('honours a custom speed', () => {
    expect(inputToVelocity({ ...none, right: true }, 60)).toEqual({ x: 60, y: 0 })
  })
})

describe('axesToVelocity', () => {
  it('keeps short analog vectors slower than full speed', () => {
    expect(axesToVelocity(0.5, 0)).toEqual({ x: PLAYER_SPEED / 2, y: 0 })
  })

  it('clamps long vectors to full speed', () => {
    const v = axesToVelocity(3, 4)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(PLAYER_SPEED)
  })
})

describe('facingFromVelocity', () => {
  const start = { dir: 'down', flipX: false } as const

  it('keeps the last facing when stopped', () => {
    const left = { dir: 'side', flipX: true } as const
    expect(facingFromVelocity({ x: 0, y: 0 }, left)).toBe(left)
  })

  it('picks the side view and flips for left', () => {
    expect(facingFromVelocity({ x: 120, y: 0 }, start)).toEqual({ dir: 'side', flipX: false })
    expect(facingFromVelocity({ x: -120, y: 0 }, start)).toEqual({ dir: 'side', flipX: true })
  })

  it('picks up and down for vertical movement', () => {
    expect(facingFromVelocity({ x: 0, y: -120 }, start).dir).toBe('up')
    expect(facingFromVelocity({ x: 0, y: 120 }, start).dir).toBe('down')
  })

  it('shows the side view on a pure diagonal', () => {
    expect(facingFromVelocity({ x: -85, y: 85 }, start)).toEqual({ dir: 'side', flipX: true })
  })
})
