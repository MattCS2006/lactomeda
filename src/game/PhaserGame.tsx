import { useEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, ShipInteriorScene } from './scenes/ShipInteriorScene'
import { SHIP_REGISTRY_KEY, resolveShipDesign, type ShipSource } from './shipSource'
import { supabase, testRealtime } from '../net/supabase'
import { gameData } from '../data'
import { useMissionStore } from '../ui/store/missionStore'

export function PhaserGame() {
  const host = useRef<HTMLDivElement>(null)
  const game = useRef<Phaser.Game | null>(null)
  const [online, setOnline] = useState<'checking' | 'online' | 'offline'>('checking')

  // FR-13.1: the ship is built from the player's design (or a preview ship, or ?ship=<busClassId>).
  const design = useMissionStore((s) => s.design)
  const ship = useMemo<ShipSource>(
    () => ({ design: resolveShipDesign(design, gameData, window.location.search), data: gameData }),
    [design],
  )
  const shipRef = useRef(ship)

  // Keep the registry current. The scene reads it when it (re)starts; no live rebuild while inside.
  useEffect(() => {
    shipRef.current = ship
    game.current?.registry.set(SHIP_REGISTRY_KEY, ship)
  }, [ship])

  useEffect(() => {
    const g = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#0b0f1a',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: 'arcade', arcade: { debug: false } },
      // Set before any scene starts, so the first build already uses the design
      callbacks: { preBoot: (booting) => booting.registry.set(SHIP_REGISTRY_KEY, shipRef.current) },
      scene: [ShipInteriorScene],
    })
    game.current = g
    return () => {
      game.current = null
      g.destroy(true)
    }
  }, [])

  // Temporary multiplayer health check (SCRUM-28); replaced by the room UI in SCRUM-82.
  useEffect(() => {
    testRealtime().then((ok) => setOnline(ok ? 'online' : 'offline'))
  }, [])

  return (
    <div>
      {/* Scale.FIT needs a sized parent: 16:9 box that grows up to 2x the game size */}
      <div ref={host} className="mx-auto aspect-video w-full max-w-[1280px] border-4 border-slate-600" />
      <p className="mt-2 text-center text-xs text-slate-400">
        Multiplayer server:{' '}
        {online === 'checking' ? 'checking…' : online === 'online' ? '🟢 connected' : supabase ? '🔴 cannot connect' : '⚪ not configured (solo mode)'}
      </p>
    </div>
  )
}
