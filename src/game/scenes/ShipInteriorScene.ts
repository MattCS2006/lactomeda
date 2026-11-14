import Phaser from 'phaser'
import { bridge } from '../bridge'

// Placeholder scene (Dev 3): grey rooms + a square avatar until the tileset lands.
const STATIONS = [
  { id: 'bridge', x: 160, y: 120, label: 'Bridge' },
  { id: 'comms', x: 480, y: 120, label: 'Comms' },
  { id: 'power', x: 160, y: 300, label: 'Power' },
  { id: 'science', x: 480, y: 300, label: 'Science Lab' },
  { id: 'navigation', x: 320, y: 210, label: 'Navigation' },
] as const

export class ShipInteriorScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'use', Phaser.Input.Keyboard.Key>

  constructor() {
    super('ShipInteriorScene')
  }

  create() {
    for (const s of STATIONS) {
      this.add.rectangle(s.x, s.y, 120, 80, 0x2b3a55).setStrokeStyle(2, 0x8fb3ff)
      this.add.text(s.x, s.y - 52, s.label, { fontFamily: 'monospace', fontSize: '12px' }).setOrigin(0.5)
    }
    this.player = this.add.rectangle(320, 380, 14, 14, 0xffd23f)
    const kb = this.input.keyboard!
    this.keys = {
      up: kb.addKey('W'),
      down: kb.addKey('S'),
      left: kb.addKey('A'),
      right: kb.addKey('D'),
      use: kb.addKey('E'),
    }
    bridge.emit('sceneReady', { scene: 'ShipInteriorScene' })
  }

  update(_t: number, dt: number) {
    const v = 0.15 * dt
    if (this.keys.up.isDown) this.player.y -= v
    if (this.keys.down.isDown) this.player.y += v
    if (this.keys.left.isDown) this.player.x -= v
    if (this.keys.right.isDown) this.player.x += v

    if (Phaser.Input.Keyboard.JustDown(this.keys.use)) {
      const near = STATIONS.find(
        (s) => Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y) < 70,
      )
      if (near) bridge.emit('stationInteract', { station: near.id })
    }
  }
}
