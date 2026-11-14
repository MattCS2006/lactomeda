// Pure movement maths (no Phaser): easy to unit-test and shared by keyboard and touch input.

/** Walking speed in pixels per second. */
export const PLAYER_SPEED = 120

export interface Vec2 {
  x: number
  y: number
}

export interface DirectionKeys {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

/**
 * Axes (each roughly -1..1, y grows downward) -> velocity in px/s.
 * Vectors longer than 1 are normalized so diagonals are not faster;
 * shorter ones (analog joystick) keep their length for slower walking.
 */
export function axesToVelocity(ax: number, ay: number, speed: number = PLAYER_SPEED): Vec2 {
  const len = Math.hypot(ax, ay)
  if (len === 0) return { x: 0, y: 0 }
  const k = len > 1 ? 1 / len : 1
  // "+ 0" turns -0 into 0
  return { x: ax * k * speed + 0, y: ay * k * speed + 0 }
}

/** Digital axes from pressed directions; opposite keys cancel. */
export function keysToAxes(keys: DirectionKeys): Vec2 {
  return {
    x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
    y: (keys.down ? 1 : 0) - (keys.up ? 1 : 0),
  }
}

/** WASD / arrow state -> velocity in px/s. */
export function inputToVelocity(keys: DirectionKeys, speed: number = PLAYER_SPEED): Vec2 {
  const a = keysToAxes(keys)
  return axesToVelocity(a.x, a.y, speed)
}

export interface Facing {
  /** Which sprite row/animation set to use. */
  dir: 'down' | 'up' | 'side'
  /** True when facing left (side animations are drawn facing right). */
  flipX: boolean
}

/** New facing from a velocity; keeps the previous one when standing still. */
export function facingFromVelocity(v: Vec2, prev: Facing): Facing {
  if (v.x === 0 && v.y === 0) return prev
  // Horizontal wins ties so diagonals show the side view
  if (Math.abs(v.y) > Math.abs(v.x)) {
    return { dir: v.y > 0 ? 'down' : 'up', flipX: prev.flipX }
  }
  return { dir: 'side', flipX: v.x < 0 }
}
