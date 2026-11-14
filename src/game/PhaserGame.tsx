import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, ShipInteriorScene } from './scenes/ShipInteriorScene'
import { supabase, testRealtime } from '../net/supabase'

export function PhaserGame() {
  const host = useRef<HTMLDivElement>(null)
  const [online, setOnline] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#0b0f1a',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: 'arcade', arcade: { debug: false } },
      scene: [ShipInteriorScene],
    })
    return () => game.destroy(true)
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
