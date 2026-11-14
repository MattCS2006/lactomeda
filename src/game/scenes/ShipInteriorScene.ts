import Phaser from 'phaser'
import type { Station } from '../../engine/types'
import { bridge } from '../bridge'
import {
  PLAYER_SPEED,
  axesToVelocity,
  facingFromVelocity,
  keysToAxes,
  type Facing,
} from '../movement'

// Placeholder room until the Tiled map arrives (SCRUM-119): floor, walls and station boxes.
// TODO(i18n): move these strings to src/i18n once it exists (Dev 2).
const TEXT = { pressE: 'Press E' } as const

const TILE = 32
export const GAME_WIDTH = 640 // 20 tiles
export const GAME_HEIGHT = 360 // ~11 tiles
const ROOM_W = 30 * TILE // 960
const ROOM_H = 18 * TILE // 576

const STATION_W = 96
const STATION_H = 64
/** How close (px from the station box edge) the player must be to use it. */
const INTERACT_RANGE = 36

const STATIONS = [
  { id: 'bridge', x: 160, y: 96, label: 'Bridge' },
  { id: 'comms', x: 800, y: 96, label: 'Comms' },
  { id: 'power', x: 160, y: 480, label: 'Power' },
  { id: 'science', x: 800, y: 480, label: 'Science Lab' },
  { id: 'navigation', x: 480, y: 288, label: 'Navigation' },
] as const satisfies readonly { id: Station; x: number; y: number; label: string }[]

const SHEET = 'astro-orange'
const JOY_X = 56
const JOY_Y = GAME_HEIGHT - 56
const JOY_RADIUS = 36
const JOY_DEADZONE = 0.2
const USE_BTN_X = GAME_WIDTH - 44
const USE_BTN_Y = GAME_HEIGHT - 52
const USE_BTN_RADIUS = 22
const UI_DEPTH = 10000

const FRAMES_PER_ROW = 3
const ROW = { down: 0, up: 1, side: 2 } as const

export class ShipInteriorScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private keys!: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
    up2: Phaser.Input.Keyboard.Key
    down2: Phaser.Input.Keyboard.Key
    left2: Phaser.Input.Keyboard.Key
    right2: Phaser.Input.Keyboard.Key
    use: Phaser.Input.Keyboard.Key
  }
  private facing: Facing = { dir: 'down', flipX: false }
  private nearStation: Station | null = null
  private pressLabel!: Phaser.GameObjects.Text

  // Touch controls
  private joyAxes = { x: 0, y: 0 }
  private joyPointerId: number | null = null
  private joyThumb: Phaser.GameObjects.Arc | null = null
  private usePressed = false

  constructor() {
    super('ShipInteriorScene')
  }

  preload() {
    this.load.spritesheet(SHEET, 'assets/sprites/astronaut_orange.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
  }

  create() {
    this.createAnimations()
    this.buildRoom()

    const solids = this.buildSolids()
    this.player = this.physics.add.sprite(ROOM_W / 2, ROOM_H - 3 * TILE, SHEET, 0)
    // Small body at the feet so the head can overlap walls/consoles a little
    this.player.setSize(12, 10).setOffset(10, 20)
    this.player.setCollideWorldBounds(true)
    this.physics.add.collider(this.player, solids)

    this.pressLabel = this.add
      .text(0, 0, TEXT.pressE, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#f4f4f4',
        backgroundColor: '#1a1c2c',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(UI_DEPTH - 1)
      .setVisible(false)

    const cam = this.cameras.main
    cam.setBounds(0, 0, ROOM_W, ROOM_H)
    cam.startFollow(this.player, true, 0.15, 0.15)
    cam.setDeadzone(48, 32)

    const kb = this.input.keyboard!
    this.keys = {
      up: kb.addKey('W'),
      down: kb.addKey('S'),
      left: kb.addKey('A'),
      right: kb.addKey('D'),
      up2: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down2: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left2: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right2: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      use: kb.addKey('E'),
    }

    if (this.sys.game.device.input.touch) this.createTouchControls()

    this.events.once('shutdown', () => {
      if (this.nearStation) bridge.emit('stationProximity', { station: this.nearStation, near: false })
      this.nearStation = null
    })

    bridge.emit('sceneReady', { scene: 'ShipInteriorScene' })
  }

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body

    // Keyboard and joystick share the same maths; sum the axes, then normalize once.
    const k = keysToAxes({
      up: this.keys.up.isDown || this.keys.up2.isDown,
      down: this.keys.down.isDown || this.keys.down2.isDown,
      left: this.keys.left.isDown || this.keys.left2.isDown,
      right: this.keys.right.isDown || this.keys.right2.isDown,
    })
    const v = axesToVelocity(k.x + this.joyAxes.x, k.y + this.joyAxes.y, PLAYER_SPEED)
    body.setVelocity(v.x, v.y)

    this.facing = facingFromVelocity(v, this.facing)
    const moving = v.x !== 0 || v.y !== 0
    this.player.setFlipX(this.facing.flipX)
    this.player.anims.play(`${moving ? 'walk' : 'idle'}-${this.facing.dir}`, true)
    this.player.setDepth(this.player.y)

    this.updateProximity()

    const usePressed = Phaser.Input.Keyboard.JustDown(this.keys.use) || this.usePressed
    this.usePressed = false
    if (usePressed && this.nearStation) {
      bridge.emit('stationInteract', { station: this.nearStation })
    }
  }

  // ── Animations ───────────────────────────────────────────────────────
  private createAnimations() {
    for (const dir of ['down', 'up', 'side'] as const) {
      const base = ROW[dir] * FRAMES_PER_ROW // idle frame; +1 = left step, +2 = right step
      const walk = `walk-${dir}`
      if (!this.anims.exists(walk)) {
        this.anims.create({
          key: walk,
          frames: [base + 1, base, base + 2, base].map((frame) => ({ key: SHEET, frame })),
          frameRate: 8,
          repeat: -1,
        })
      }
      const idle = `idle-${dir}`
      if (!this.anims.exists(idle)) {
        this.anims.create({ key: idle, frames: [{ key: SHEET, frame: base }], frameRate: 1 })
      }
    }
  }

  // ── Placeholder room ─────────────────────────────────────────────────
  private buildRoom() {
    this.physics.world.setBounds(TILE, TILE, ROOM_W - 2 * TILE, ROOM_H - 2 * TILE)
    this.add.rectangle(ROOM_W / 2, ROOM_H / 2, ROOM_W, ROOM_H, 0x333c57) // floor (grid lines below)
    this.add
      .grid(ROOM_W / 2, ROOM_H / 2, ROOM_W - 2 * TILE, ROOM_H - 2 * TILE, TILE, TILE, 0x1a1c2c, 1, 0x29366f, 0.6)
      .setDepth(0)
  }

  private buildSolids(): Phaser.Physics.Arcade.StaticGroup {
    const solids = this.physics.add.staticGroup()
    const wall = (cx: number, cy: number, w: number, h: number) => {
      solids.add(this.add.rectangle(cx, cy, w, h, 0x566c86).setStrokeStyle(2, 0x94b0c2).setDepth(1))
    }
    wall(ROOM_W / 2, TILE / 2, ROOM_W, TILE) // top
    wall(ROOM_W / 2, ROOM_H - TILE / 2, ROOM_W, TILE) // bottom
    wall(TILE / 2, ROOM_H / 2, TILE, ROOM_H) // left
    wall(ROOM_W - TILE / 2, ROOM_H / 2, TILE, ROOM_H) // right

    for (const s of STATIONS) {
      solids.add(
        this.add
          .rectangle(s.x, s.y, STATION_W, STATION_H, 0x2b3a55)
          .setStrokeStyle(2, 0x8fb3ff)
          .setDepth(1),
      )
      this.add
        .text(s.x, s.y, s.label, { fontFamily: 'monospace', fontSize: '10px', color: '#f4f4f4' })
        .setOrigin(0.5)
        .setDepth(2)
    }
    return solids
  }

  // ── Station proximity ────────────────────────────────────────────────
  private updateProximity() {
    const px = this.player.x
    const py = this.player.y
    let nearest: (typeof STATIONS)[number] | null = null
    let best = INTERACT_RANGE
    for (const s of STATIONS) {
      // Distance from the player point to the station's rectangle (0 when inside)
      const dx = Math.max(Math.abs(px - s.x) - STATION_W / 2, 0)
      const dy = Math.max(Math.abs(py - s.y) - STATION_H / 2, 0)
      const d = Math.hypot(dx, dy)
      if (d <= best) {
        best = d
        nearest = s
      }
    }

    const next = nearest ? nearest.id : null
    if (next !== this.nearStation) {
      if (this.nearStation) bridge.emit('stationProximity', { station: this.nearStation, near: false })
      if (next) bridge.emit('stationProximity', { station: next, near: true })
      this.nearStation = next
    }

    if (nearest) {
      this.pressLabel.setPosition(nearest.x, nearest.y - STATION_H / 2 - 4).setVisible(true)
    } else {
      this.pressLabel.setVisible(false)
    }
  }

  // ── Touch controls (tablets) ─────────────────────────────────────────
  private createTouchControls() {
    this.input.addPointer(2) // joystick + use button at the same time
    const fixed = <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) =>
      o.setScrollFactor(0).setDepth(UI_DEPTH)

    fixed(this.add.circle(JOY_X, JOY_Y, JOY_RADIUS, 0x1a1c2c, 0.5).setStrokeStyle(2, 0x94b0c2))
    this.joyThumb = fixed(this.add.circle(JOY_X, JOY_Y, JOY_RADIUS / 2, 0x94b0c2, 0.8))

    fixed(this.add.circle(USE_BTN_X, USE_BTN_Y, USE_BTN_RADIUS, 0x1a1c2c, 0.5).setStrokeStyle(2, 0x94b0c2))
    fixed(
      this.add
        .text(USE_BTN_X, USE_BTN_Y, 'E', { fontFamily: 'monospace', fontSize: '16px', color: '#f4f4f4' })
        .setOrigin(0.5),
    )

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Math.hypot(p.x - USE_BTN_X, p.y - USE_BTN_Y) <= USE_BTN_RADIUS * 1.3) {
        this.usePressed = true
      } else if (this.joyPointerId === null && Math.hypot(p.x - JOY_X, p.y - JOY_Y) <= JOY_RADIUS * 1.8) {
        this.joyPointerId = p.id
        this.moveJoystick(p)
      }
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id === this.joyPointerId) this.moveJoystick(p)
    })
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointerId) return
      this.joyPointerId = null
      this.joyAxes = { x: 0, y: 0 }
      this.joyThumb?.setPosition(JOY_X, JOY_Y)
    }
    this.input.on('pointerup', release)
    this.input.on('pointerupoutside', release)
  }

  private moveJoystick(p: Phaser.Input.Pointer) {
    let dx = p.x - JOY_X
    let dy = p.y - JOY_Y
    const len = Math.hypot(dx, dy)
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS
      dy = (dy / len) * JOY_RADIUS
    }
    this.joyThumb?.setPosition(JOY_X + dx, JOY_Y + dy)
    const ax = dx / JOY_RADIUS
    const ay = dy / JOY_RADIUS
    this.joyAxes = Math.hypot(ax, ay) < JOY_DEADZONE ? { x: 0, y: 0 } : { x: ax, y: ay }
  }
}
