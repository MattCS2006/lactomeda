import Phaser from 'phaser'
import type { Station } from '../../engine/types'
import { bridge, type SimSnapshot } from '../bridge'
import { startDemoSim } from '../demoSim'
import { gameData } from '../../data'
import { generateShipLayout, CONSOLE_TILES, type ShipLayout } from '../shipLayout'
import { SHIP_REGISTRY_KEY, resolveShipDesign, type ShipSource } from '../shipSource'
import { SHIP_STATIONS, STATION_NAMES } from '../stations'
import { TILESET_KEY, TILESET_PATH, TILE_SIZE } from '../tiles'
import { stationStatus, type StationState } from '../stationStatus'
import {
  PLAYER_SPEED,
  axesToVelocity,
  facingFromVelocity,
  keysToAxes,
  type Facing,
} from '../movement'

// Ship interior generated from the player's design (SCRUM-119, FR-13.1): see shipLayout.ts.
// TODO(i18n): move these strings to src/i18n once it exists (Dev 2).
const TEXT = { pressE: 'Press E' } as const

const TILE = TILE_SIZE
export const GAME_WIDTH = 640 // 20 tiles
export const GAME_HEIGHT = 360 // ~11 tiles

// Consoles are 32x32 sprites drawn at 2x (integer scale, stays crisp) = CONSOLE_TILES x CONSOLE_TILES tiles.
const CONSOLE_SCALE = 2
const STATION_W = 32 * CONSOLE_SCALE
const STATION_H = 32 * CONSOLE_SCALE
/** How close (px from the station box edge) the player must be to use it. */
const INTERACT_RANGE = 36
const BLINK_MS = 250 // toggle every 250 ms = 2 Hz blink

/** A console placed in the world: station id and sprite centre in px. */
interface ConsoleSpot {
  id: Station
  x: number
  y: number
}

const ROOM_LABEL_STYLE = {
  fontFamily: 'monospace',
  fontSize: '10px',
  color: '#94b0c2',
  backgroundColor: '#1a1c2c',
  padding: { x: 3, y: 1 },
} as const

const consoleKey = (id: Station) => `console_${id}`
const CONSOLE_ALARM = 'console_alarm'
const CONSOLE_OFF = 'console_off'

// Label look per state (Sweetie 16, see docs/ART.md). Text prefix keeps it readable without colour.
const LABEL_STYLE: Record<StationState, { color: string; bg: string; prefix: string }> = {
  ok: { color: '#f4f4f4', bg: '#1a1c2c', prefix: '' },
  warning: { color: '#ffcd75', bg: '#1a1c2c', prefix: '* ' },
  alarm: { color: '#f4f4f4', bg: '#b13e53', prefix: '! ' },
  off: { color: '#94b0c2', bg: '#1a1c2c', prefix: 'x ' },
}

// Status panel (camera-fixed). docs/ART.md §7: dark metal fill, 2 px light border, dark outline.
const PANEL_W = 250
const PANEL_PAD = 8
const PANEL_TOP = 12
const PANEL_ROW_H = 14
const PANEL_HEADER_H = 26
const PANEL_FONT = { fontFamily: 'monospace', fontSize: '11px' } as const

interface StationView {
  sprite: Phaser.Physics.Arcade.Sprite
  label: Phaser.GameObjects.Text
  state: StationState
}

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
    close: Phaser.Input.Keyboard.Key
  }
  private facing: Facing = { dir: 'down', flipX: false }
  private nearStation: Station | null = null
  private pressLabel!: Phaser.GameObjects.Text

  // Ship built from the design, stations and live telemetry
  private layout!: ShipLayout
  private consoles: ConsoleSpot[] = []
  private views = new Map<Station, StationView>()
  private snapshot: SimSnapshot | null = null
  /** Highest battery level seen; SimSnapshot has no capacity, so this stands in for it. */
  private batteryCapacityWh = 0
  private blinkOn = false

  // Status panel
  private panel!: Phaser.GameObjects.Container
  private panelFrame!: Phaser.GameObjects.Graphics
  private panelTitle!: Phaser.GameObjects.Text
  private panelLabels!: Phaser.GameObjects.Text
  private panelValues!: Phaser.GameObjects.Text
  private panelStation: Station | null = null

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
    for (const id of SHIP_STATIONS) this.load.image(consoleKey(id), `assets/sprites/${consoleKey(id)}.png`)
    this.load.image(TILESET_KEY, TILESET_PATH)
    this.load.image(CONSOLE_ALARM, `assets/sprites/${CONSOLE_ALARM}.png`)
    this.load.image(CONSOLE_OFF, `assets/sprites/${CONSOLE_OFF}.png`)
  }

  create() {
    this.createAnimations()

    // Rebuilt every time the scene (re)starts, from the design PhaserGame put in the registry.
    this.layout = generateShipLayout(...this.shipSource())
    const walls = this.buildShip(this.layout)
    const worldW = this.layout.widthTiles * TILE
    const worldH = this.layout.heightTiles * TILE
    this.physics.world.setBounds(0, 0, worldW, worldH)

    const solids = this.physics.add.staticGroup()
    const { tileX, tileY } = this.layout.spawn
    this.player = this.physics.add.sprite((tileX + 0.5) * TILE, (tileY + 0.5) * TILE, SHEET, 0)
    // Small body at the feet so the head can overlap walls/consoles a little
    this.player.setSize(12, 10).setOffset(10, 20)
    this.player.setCollideWorldBounds(true)
    this.physics.add.collider(this.player, walls)
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
    cam.setBounds(0, 0, worldW, worldH)
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
      close: kb.addKey('ESC'),
    }

    if (this.sys.game.device.input.touch) this.createTouchControls()

    // Reset per-run state (the scene instance is reused on restart)
    this.views.clear()
    this.snapshot = null
    this.batteryCapacityWh = 0
    this.panelStation = null
    this.createStationViews(solids)
    this.createPanel()

    const offTick = bridge.on('simTick', ({ state }) => this.onSimTick(state))
    const blink = this.time.addEvent({ delay: BLINK_MS, loop: true, callback: () => this.onBlink() })
    // No-op unless the URL has ?demo=1; demo alarms only ring at stations this ship has. Delete with demoSim.ts
    const stopDemo = startDemoSim(this.consoles.map((c) => c.id))

    this.events.once('shutdown', () => {
      offTick()
      stopDemo()
      blink.remove()
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
    if (Phaser.Input.Keyboard.JustDown(this.keys.close)) this.closePanel()
    if (usePressed && this.nearStation) {
      const id = this.nearStation
      if (this.panelStation === id) {
        this.closePanel()
      } else {
        this.openPanel(id)
        bridge.emit('stationInteract', { station: id })
      }
    }
  }

  // ── Ship ─────────────────────────────────────────────────────────────
  /** Design + catalog from the registry; falls back to the preview ship (and ?ship=) if PhaserGame set none. */
  private shipSource(): [ShipSource['design'], ShipSource['data']] {
    const src = this.registry.get(SHIP_REGISTRY_KEY) as ShipSource | undefined
    if (src) return [src.design, src.data]
    const search = typeof window === 'undefined' ? '' : window.location.search
    return [resolveShipDesign(null, gameData, search), gameData]
  }

  /** Tilemap from the layout, wall collisions from layout.collides, room name signs. Returns the wall layer. */
  private buildShip(layout: ShipLayout): Phaser.Tilemaps.TilemapLayer {
    const map = this.make.tilemap({ data: layout.tiles, tileWidth: TILE, tileHeight: TILE })
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE, 0, 0)
    if (!tileset) throw new Error(`Tileset ${TILESET_KEY} is not loaded`)
    const layer = map.createLayer(0, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer
    layer.setDepth(0)
    layer.forEachTile((t: Phaser.Tilemaps.Tile) => {
      if (layout.collides[t.y]?.[t.x]) t.setCollision(true, true, true, true, false)
    })
    layer.calculateFacesWithin(0, 0, map.width, map.height)

    // Room names on the wall above each room's top-left corner
    for (const room of layout.rooms) {
      this.add.text(room.x * TILE + 4, (room.y - 2) * TILE + 4, room.name, ROOM_LABEL_STYLE).setDepth(1)
    }

    // Console centres: the sprite covers CONSOLE_TILES x CONSOLE_TILES tiles from (tileX, tileY)
    this.consoles = layout.consoles.map((c) => ({
      id: c.station,
      x: (c.tileX + CONSOLE_TILES / 2) * TILE,
      y: (c.tileY + CONSOLE_TILES / 2) * TILE,
    }))
    return layer
  }

  // ── Station consoles ─────────────────────────────────────────────────
  private createStationViews(solids: Phaser.Physics.Arcade.StaticGroup) {
    for (const s of this.consoles) {
      const sprite = solids.create(s.x, s.y, consoleKey(s.id)) as Phaser.Physics.Arcade.Sprite
      sprite.setScale(CONSOLE_SCALE).setDepth(s.y).refreshBody()
      const label = this.add
        .text(s.x, s.y + STATION_H / 2 + 2, STATION_NAMES[s.id], {
          fontFamily: 'monospace',
          fontSize: '10px',
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5, 0)
        .setDepth(UI_DEPTH - 2)
      this.views.set(s.id, { sprite, label, state: 'ok' })
    }
    this.refreshStations()
  }

  private onSimTick(state: SimSnapshot) {
    this.snapshot = state
    this.batteryCapacityWh = Math.max(this.batteryCapacityWh, state.batteryWh)
    this.refreshStations()
    this.refreshPanel()
  }

  private statusFor(id: Station) {
    return stationStatus(id, this.snapshot, { batteryCapacityWh: this.batteryCapacityWh || undefined })
  }

  private refreshStations() {
    for (const [id, view] of this.views) {
      view.state = this.statusFor(id).state
      const style = LABEL_STYLE[view.state]
      view.label
        .setText(style.prefix + STATION_NAMES[id])
        .setColor(style.color)
        .setBackgroundColor(style.bg)
      this.applyConsoleTexture(id, view)
    }
  }

  private applyConsoleTexture(id: Station, view: StationView) {
    const key =
      view.state === 'alarm' && this.blinkOn ? CONSOLE_ALARM : view.state === 'off' ? CONSOLE_OFF : consoleKey(id)
    if (view.sprite.texture.key !== key) view.sprite.setTexture(key)
  }

  /** 2 Hz blink for consoles in alarm. */
  private onBlink() {
    this.blinkOn = !this.blinkOn
    for (const [id, view] of this.views) if (view.state === 'alarm') this.applyConsoleTexture(id, view)
  }

  // ── Status panel ─────────────────────────────────────────────────────
  private createPanel() {
    this.panelFrame = this.add.graphics()
    this.panelTitle = this.add.text(PANEL_PAD, PANEL_PAD, '', { ...PANEL_FONT, fontSize: '12px', color: '#ffcd75' })
    this.panelLabels = this.add.text(PANEL_PAD, PANEL_HEADER_H, '', {
      ...PANEL_FONT,
      color: '#94b0c2',
      lineSpacing: PANEL_ROW_H - 11,
    })
    this.panelValues = this.add
      .text(PANEL_W - PANEL_PAD, PANEL_HEADER_H, '', {
        ...PANEL_FONT,
        color: '#f4f4f4',
        align: 'right',
        lineSpacing: PANEL_ROW_H - 11,
      })
      .setOrigin(1, 0)
    this.panel = this.add
      .container((GAME_WIDTH - PANEL_W) / 2, PANEL_TOP, [this.panelFrame, this.panelTitle, this.panelLabels, this.panelValues])
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 1)
      .setVisible(false)
  }

  private openPanel(id: Station) {
    this.panelStation = id
    this.panel.setVisible(true)
    this.refreshPanel()
  }

  private closePanel() {
    this.panelStation = null
    this.panel.setVisible(false)
  }

  private refreshPanel() {
    const id = this.panelStation
    if (!id) return
    const status = this.statusFor(id)
    const style = LABEL_STYLE[status.state]
    this.panelTitle.setText(`${STATION_NAMES[id]}  [${status.state.toUpperCase()}]`).setColor(style.color === '#f4f4f4' ? '#ffcd75' : style.color)
    this.panelLabels.setText(status.lines.map((l) => l.label).join('\n'))
    this.panelValues.setText(status.lines.map((l) => l.value).join('\n'))

    const h = PANEL_HEADER_H + status.lines.length * PANEL_ROW_H + PANEL_PAD
    const g = this.panelFrame
    g.clear()
    g.fillStyle(0x1a1c2c).fillRect(-1, -1, PANEL_W + 2, h + 2) // outer outline (K)
    g.fillStyle(0x94b0c2).fillRect(0, 0, PANEL_W, h) // 2 px border (G)
    g.fillStyle(0x333c57).fillRect(2, 2, PANEL_W - 4, h - 4) // dark metal (D)
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

  // ── Station proximity ────────────────────────────────────────────────
  private updateProximity() {
    const px = this.player.x
    const py = this.player.y
    let nearest: ConsoleSpot | null = null
    let best = INTERACT_RANGE
    for (const s of this.consoles) {
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
    // Walked out of range (or to another console): close the panel
    if (this.panelStation && this.panelStation !== next) this.closePanel()

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
