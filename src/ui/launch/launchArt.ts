// Pixel-art drawing of the launch (FR-9.3) on a small canvas (LAUNCH_W × LAUNCH_H, scaled up with no smoothing).
// Shapes are drawn with whole-pixel rectangles in the Sweetie 16 palette (docs/ART.md); no image assets.
import { PALETTE } from '../../game/palette'
import { SEGMENT_SECONDS, reached, stepAt, type LaunchScript } from './launchTimeline'

export const LAUNCH_W = 160
export const LAUNCH_H = 90

type Ctx = Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect'>

const px = (ctx: Ctx, color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

/** Pseudo-random but stable 0–1 for star positions and flame flicker. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

/** Seconds from liftoff to the end of orbit insertion on a successful launch: the altitude scale for every launch. */
const CLIMB_SECONDS = (
  [
    'liftoff',
    'maxQ',
    'stageSeparation',
    'fairingSeparation',
    'upperStage',
    'payloadSeparation',
    'orbitInsertion',
  ] as const
).reduce((sum, s) => sum + SEGMENT_SECONDS[s], 0)

/** Altitude 0 (pad) → 1 (orbit). A failed launch climbs at the same rate and stops where it failed. */
export function altitudeAt(script: LaunchScript, t: number): number {
  const liftoff = script.steps.find((s) => s.segment === 'liftoff')!
  const anomaly = script.steps.find((s) => s.segment === 'anomaly')
  const until = anomaly ? Math.min(t, anomaly.start) : t
  if (until <= liftoff.start) return 0
  return Math.min(1, (until - liftoff.start) / CLIMB_SECONDS)
}

export function drawLaunch(ctx: Ctx, script: LaunchScript, t: number, reducedMotion = false): void {
  const { step, progress } = stepAt(script, t)
  const alt = altitudeAt(script, t)
  const frame = Math.floor(t * 12)

  // Sky: four bands from blue sky to space, by altitude
  const sky = alt < 0.2 ? PALETTE.info : alt < 0.45 ? PALETTE.visor : alt < 0.7 ? PALETTE.screen : PALETTE.outline
  px(ctx, sky, 0, 0, LAUNCH_W, LAUNCH_H)
  if (alt > 0.35) {
    for (let i = 0; i < 40; i++) {
      const sx = hash(i) * LAUNCH_W
      const sy = (hash(i + 99) * LAUNCH_H + alt * 60) % LAUNCH_H
      px(ctx, i % 5 === 0 ? PALETTE.shine : PALETTE.metalLight, sx, sy, 1, 1)
    }
  }

  // Ground and pad scroll away as the rocket climbs
  const groundY = 74 + alt * 120
  if (groundY < LAUNCH_H) {
    px(ctx, PALETTE.ok, 0, groundY, LAUNCH_W, LAUNCH_H - groundY)
    px(ctx, PALETTE.metal, 68, groundY - 2, 24, 2) // pad
    px(ctx, PALETTE.metalDark, 92, groundY - 46, 3, 44) // tower
  }
  // Earth's curve once in orbit
  if (step.segment === 'orbitInsertion' || (alt > 0.85 && script.success)) {
    for (let x = 0; x < LAUNCH_W; x++) {
      const y = 82 + Math.round(((x - 80) * (x - 80)) / 900)
      px(ctx, PALETTE.teal, x, y, 1, LAUNCH_H - y)
      px(ctx, PALETTE.info, x, y, 1, 1)
    }
  }

  const shake = !reducedMotion && (step.segment === 'maxQ' || step.segment === 'liftoff') ? (frame % 2) - 0.5 : 0
  const cx = 80 + shake
  const base = 72 // bottom of the rocket on screen

  const anomaly = step.segment === 'anomaly'
  if (anomaly && progress > 0.15) {
    drawExplosion(ctx, cx, base - 25, progress, frame, reducedMotion)
    return
  }

  const stage1Gone = reached(script, t, 'stageSeparation') && !(step.segment === 'stageSeparation' && progress < 0.3)
  const fairingOpen = reached(script, t, 'fairingSeparation')
  const payloadOut = reached(script, t, 'payloadSeparation')
  const burning =
    step.segment === 'liftoff' || step.segment === 'maxQ' || step.segment === 'upperStage' || step.segment === 'anomaly'

  // Stage 1 (falls away after separation)
  const s1Drop = stage1Gone ? (step.segment === 'stageSeparation' ? (progress - 0.3) * 40 : 40) : 0
  if (s1Drop < 30) {
    px(ctx, PALETTE.metalLight, cx - 4, base - 22 + s1Drop, 8, 22)
    px(ctx, PALETTE.metal, cx - 7, base - 6 + s1Drop, 3, 6) // fins
    px(ctx, PALETTE.metal, cx + 4, base - 6 + s1Drop, 3, 6)
    if (burning && !stage1Gone) drawFlame(ctx, cx, base, frame, reducedMotion)
  }

  // Stage 2 + fairing (+ payload)
  const upperBase = base - 22 // the camera follows the upper stage
  px(ctx, PALETTE.white, cx - 4, upperBase - 14, 8, 14)
  if (stage1Gone && (step.segment === 'upperStage' || step.segment === 'stageSeparation')) {
    drawFlame(ctx, cx, upperBase, frame, reducedMotion, 0.7)
  }

  const noseBase = upperBase - 14
  if (!fairingOpen) {
    drawNose(ctx, cx, noseBase, 0)
  } else {
    const spread = step.segment === 'fairingSeparation' ? progress * 14 : 14
    if (spread < 14) {
      drawNose(ctx, cx - spread, noseBase + spread, -1)
      drawNose(ctx, cx + spread, noseBase + spread, 1)
    }
    // Spacecraft
    const out = payloadOut ? (step.segment === 'payloadSeparation' ? progress * 12 : 12) : 0
    const sy = noseBase - 6 - out
    px(ctx, PALETTE.warning, cx - 3, sy, 6, 6)
    const panels = step.segment === 'orbitInsertion' ? Math.min(1, progress * 2) : payloadOut ? 0.2 : 0
    if (panels > 0) {
      const w = Math.round(12 * panels)
      px(ctx, PALETTE.visor, cx - 3 - w, sy + 2, w, 2)
      px(ctx, PALETTE.visor, cx + 3, sy + 2, w, 2)
    }
  }
}

function drawNose(ctx: Ctx, cx: number, baseY: number, half: -1 | 0 | 1) {
  for (let i = 0; i < 8; i++) {
    const w = Math.max(1, 8 - i)
    const x = half === 0 ? cx - w / 2 : half < 0 ? cx - w / 2 : cx
    const width = half === 0 ? w : w / 2
    px(ctx, PALETTE.white, x, baseY - i - 1, width, 1)
  }
}

function drawFlame(ctx: Ctx, cx: number, y: number, frame: number, reducedMotion: boolean, scale = 1) {
  const flick = reducedMotion ? 0 : (frame % 3) * 2
  px(ctx, PALETTE.orange, cx - 3, y, 6, (8 + flick) * scale)
  px(ctx, PALETTE.warning, cx - 2, y, 4, (5 + flick / 2) * scale)
}

function drawExplosion(ctx: Ctx, cx: number, cy: number, progress: number, frame: number, reducedMotion: boolean) {
  const r = 4 + progress * 22
  const colors = [PALETTE.warning, PALETTE.orange, PALETTE.alarm, PALETTE.metalLight]
  for (let i = 0; i < 28; i++) {
    const a = hash(i + 7) * Math.PI * 2
    const d = r * (0.3 + hash(i + 31) * 0.7)
    const size = reducedMotion ? 2 : 2 + ((frame + i) % 2)
    px(ctx, colors[i % colors.length]!, cx + Math.cos(a) * d, cy + Math.sin(a) * d, size, size)
  }
}
