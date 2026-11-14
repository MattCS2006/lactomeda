import { useEffect, useState } from 'react'
import { PhaserGame } from './game/PhaserGame'
import { bridge } from './game/bridge'

export default function App() {
  const [lastStation, setLastStation] = useState<string | null>(null)

  useEffect(() => bridge.on('stationInteract', ({ station }) => setLastStation(station)), [])

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <h1 className="mb-2 text-center text-2xl font-bold">Lactomeda — Mission Control</h1>
      <p className="mb-4 text-center text-sm text-slate-400">
        Walk with WASD, press E at a station.
      </p>
      <PhaserGame />
      <p className="mt-4 text-center">
        {lastStation ? `Interacted with: ${lastStation}` : 'No station used yet'}
      </p>
    </main>
  )
}
