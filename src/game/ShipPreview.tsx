// Live pixel-art spacecraft exterior (SCRUM-92, FR-9.1). Redraws instantly as parts are chosen.
//
// Usage in a design screen (Celeste):
//   import { ShipPreview } from '../../game/ShipPreview'
//   <ShipPreview />                          // 320x200, follows the design in useMissionStore
//   <ShipPreview width={480} height={300} /> // any size; the ship scales by whole numbers to fit
//
// - No design yet -> shows a sample 3U CubeSat.
// - Add ?exterior=<busClassId> (e.g. ?exterior=large) to the page URL to preview a fully loaded
//   ship on any bus class (testing/demo).
// - It owns its own small Phaser game and destroys it on unmount; no props needed for data.
import { useEffect, useMemo, useRef } from 'react'
import Phaser from 'phaser'
import { gameData } from '../data'
import { useMissionStore } from '../ui/store/missionStore'
import { EXTERIOR_REGISTRY_KEY, resolveExteriorDesign, type ExteriorSource } from './exteriorSource'
import { ShipBuildScene } from './scenes/ShipBuildScene'
import { PALETTE } from './palette'
import { integerZoom } from './scaling'

// Art resolution of the preview; bigger boxes show it at a whole-number zoom (same pixel size as the game).
const BASE_W = 320
const BASE_H = 200

interface ShipPreviewProps {
  width?: number
  height?: number
}

export function ShipPreview({ width = 320, height = 200 }: ShipPreviewProps) {
  const host = useRef<HTMLDivElement>(null)
  const game = useRef<Phaser.Game | null>(null)
  const design = useMissionStore((s) => s.design)

  const source = useMemo<ExteriorSource>(
    () => ({ design: resolveExteriorDesign(design, gameData, window.location.search), data: gameData }),
    [design],
  )
  const sourceRef = useRef(source)

  // Push every change into the running scene (it re-composes, no restart).
  useEffect(() => {
    sourceRef.current = source
    game.current?.registry.set(EXTERIOR_REGISTRY_KEY, source)
  }, [source])

  useEffect(() => {
    // Whole-number zoom for the box; the game itself is drawn at (box size / zoom) so art pixels stay square.
    const zoom = integerZoom(width, height, BASE_W, BASE_H)
    const g = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: Math.floor(width / zoom),
      height: Math.floor(height / zoom),
      pixelArt: true,
      roundPixels: true,
      backgroundColor: PALETTE.outline,
      scale: { mode: Phaser.Scale.NONE, zoom, autoCenter: Phaser.Scale.CENTER_BOTH },
      // Set before the scene starts so its first draw already has the design
      callbacks: { preBoot: (booting) => booting.registry.set(EXTERIOR_REGISTRY_KEY, sourceRef.current) },
      scene: [ShipBuildScene],
    })
    game.current = g
    return () => {
      game.current = null
      g.destroy(true)
    }
  }, [width, height])

  return <div ref={host} style={{ width, height, imageRendering: 'pixelated' }} />
}
