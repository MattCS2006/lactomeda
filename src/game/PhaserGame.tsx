import { useEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, ShipInteriorScene } from './scenes/ShipInteriorScene'
import { SHIP_REGISTRY_KEY, resolveShipDesign, type ShipSource } from './shipSource'
import { supabase, testRealtime } from '../net/supabase'
import { gameData } from '../data'
import { useMissionStore } from '../ui/store/missionStore'
import { PALETTE } from './palette'
import { fitZoom } from './scaling'
import { loadPixelFont } from './textStyles'

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
    const parent = host.current!
    const zoomFor = () => fitZoom(parent.clientWidth, parent.clientHeight, GAME_WIDTH, GAME_HEIGHT)
    let cancelled = false
    let observer: ResizeObserver | null = null

    // Wait for the pixel font so the first Text objects are drawn with it (falls back after a timeout).
    void loadPixelFont().then(() => {
      if (cancelled) return
      const g = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        pixelArt: true,
        roundPixels: true,
        backgroundColor: PALETTE.outline,
        // Fixed 640x360 art resolution, zoomed to fill the area: a whole number when possible (docs/ART.md §1)
        scale: { mode: Phaser.Scale.NONE, zoom: zoomFor(), autoCenter: Phaser.Scale.CENTER_BOTH },
        physics: { default: 'arcade', arcade: { debug: false } },
        // Set before any scene starts, so the first build already uses the design
        callbacks: { preBoot: (booting) => booting.registry.set(SHIP_REGISTRY_KEY, shipRef.current) },
        scene: [ShipInteriorScene],
      })
      game.current = g
      observer = new ResizeObserver(() => {
        const zoom = zoomFor()
        if (g.scale.zoom !== zoom) g.scale.setZoom(zoom)
      })
      observer.observe(parent)
    })

    return () => {
      cancelled = true
      observer?.disconnect()
      game.current?.destroy(true)
      game.current = null
    }
  }, [])

  // Temporary multiplayer health check (SCRUM-28); replaced by the room UI in SCRUM-82.
  useEffect(() => {
    testRealtime().then((ok) => setOnline(ok ? 'online' : 'offline'))
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The zoom is computed from this box: it fills whatever room the flight page leaves (no page scroll) */}
      <div ref={host} className="min-h-0 w-full flex-1 overflow-hidden border-4 border-slate-600" />
      <p className="mt-1 shrink-0 text-center text-xs text-slate-400">
        Multiplayer server:{' '}
        {online === 'checking' ? 'checking…' : online === 'online' ? '🟢 connected' : supabase ? '🔴 cannot connect' : '⚪ not configured (solo mode)'}
      </p>
    </div>
  )
}
