import Phaser from 'phaser'
import { composeExterior, type ExteriorLayout } from '../exteriorLayout'
import { EXTERIOR_REGISTRY_KEY, type ExteriorSource } from '../exteriorSource'
import { EXTERIOR_SPRITES } from '../exteriorSprites.generated'
import { PALETTE, PALETTE_NUM } from '../palette'

// Spacecraft exterior on a dark starfield (SCRUM-92, FR-9.1). It re-composes whenever ShipPreview
// updates the registry entry, so picking a part redraws the ship without restarting the game.

const SPRITE_DIR = 'assets/sprites/exterior'
const BG = PALETTE.outline
const PADDING = 16 // px kept free around the ship (screen px)
const BOB_MS = 700 // idle bob: 1 art px up/down, stepped so sprites stay on the pixel grid
const STAR_COUNT = 70
const STAR_COLORS = [PALETTE_NUM.white, PALETTE_NUM.metalLight, PALETTE_NUM.metal, PALETTE_NUM.shine]

/** Largest whole-number scale that fits the layout inside the canvas (never below 1). */
export function fitScale(layout: Pick<ExteriorLayout, 'width' | 'height'>, canvasW: number, canvasH: number): number {
  const s = Math.floor(Math.min((canvasW - PADDING) / layout.width, (canvasH - PADDING) / layout.height))
  return Math.max(1, s)
}

export class ShipBuildScene extends Phaser.Scene {
  private ship?: Phaser.GameObjects.Container
  private bobEvent?: Phaser.Time.TimerEvent
  private onChange = () => this.rebuild()

  constructor() {
    super('ShipBuildScene')
  }

  preload() {
    for (const key of Object.keys(EXTERIOR_SPRITES)) this.load.image(key, `${SPRITE_DIR}/${key}.png`)
  }

  create() {
    this.cameras.main.setBackgroundColor(BG)
    this.drawStars()
    this.rebuild()
    // 'setdata' = first value, 'changedata' = every later one
    this.registry.events.on(`changedata-${EXTERIOR_REGISTRY_KEY}`, this.onChange)
    this.events.once('shutdown', () => this.registry.events.off(`changedata-${EXTERIOR_REGISTRY_KEY}`, this.onChange))
  }

  /** Deterministic starfield (fixed seed, no Math.random) so the backdrop never jumps between redraws. */
  private drawStars() {
    const { width, height } = this.scale
    const g = this.add.graphics()
    let seed = 92
    const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000
    for (let i = 0; i < STAR_COUNT; i++) {
      g.fillStyle(STAR_COLORS[Math.floor(next() * STAR_COLORS.length)], 1)
      const size = next() < 0.15 ? 2 : 1
      g.fillRect(Math.floor(next() * width), Math.floor(next() * height), size, size)
    }
  }

  /** Throw away the old sprites and draw the current composition, centred, integer-scaled. */
  private rebuild() {
    this.bobEvent?.remove(false)
    this.ship?.destroy()

    // ShipPreview sets this before the scene starts; nothing to draw without it
    const src = this.registry.get(EXTERIOR_REGISTRY_KEY) as ExteriorSource | undefined
    if (!src) return
    const { design, data } = src
    const layout = composeExterior(design, data)
    const scale = fitScale(layout, this.scale.width, this.scale.height)
    const x0 = Math.floor((this.scale.width - layout.width * scale) / 2)
    const y0 = Math.floor((this.scale.height - layout.height * scale) / 2)

    const container = this.add.container(x0, y0)
    const draw = (key: string, x: number, y: number, flipX: boolean) => {
      container.add(this.add.image(x * scale, y * scale, key).setOrigin(0, 0).setScale(scale).setFlipX(flipX))
    }
    draw(layout.body.key, layout.body.x, layout.body.y, false)
    for (const p of layout.parts) draw(p.key, p.x, p.y, p.flipX)
    this.ship = container

    let up = false
    this.bobEvent = this.time.addEvent({
      delay: BOB_MS,
      loop: true,
      callback: () => {
        up = !up
        container.y = y0 - (up ? scale : 0)
      },
    })
  }
}
