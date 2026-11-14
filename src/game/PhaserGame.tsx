import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { ShipInteriorScene } from './scenes/ShipInteriorScene'

export function PhaserGame() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: 640,
      height: 420,
      pixelArt: true,
      backgroundColor: '#0b0f1a',
      scene: [ShipInteriorScene],
    })
    return () => game.destroy(true)
  }, [])

  return <div ref={host} className="mx-auto w-fit border-4 border-slate-600" />
}
