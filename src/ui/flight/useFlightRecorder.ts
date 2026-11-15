// Listens to the bridge (read-only) and records each flight for "Fly again" (FR-10.6).
// The mission controller (Dev 1) announces the phases; nothing here drives the simulation.
import { useEffect } from 'react'
import { bridge, type Bridge } from '../../game/bridge'
import { useMissionStore } from '../store/missionStore'
import { useFlightStore } from './flightStore'

/** Subscribe the flight record to the bridge. Returns the unsubscribe function. */
export function attachFlightRecorder(bus: Bridge = bridge): () => void {
  let recorded = false
  const offPhase = bus.on('phaseChanged', ({ phase }) => {
    const flight = useFlightStore.getState()
    flight.setPhase(phase)
    if (phase === 'design') recorded = false
    // The first of launch / flight after the design phase is the moment the design flies
    if ((phase === 'launch' || phase === 'flight') && !recorded) {
      const design = useMissionStore.getState().design
      if (design) flight.recordLaunch(design)
      recorded = true
    }
  })
  const offEnd = bus.on('missionEnded', ({ score }) => {
    const flight = useFlightStore.getState()
    flight.recordResult(score)
    flight.setPhase('debrief')
    recorded = false
  })
  return () => {
    offPhase()
    offEnd()
  }
}

export function useFlightRecorder(): void {
  useEffect(() => {
    // Dev server only: lets the team fake phases from the browser console until the mission controller lands,
    // e.g. lactomedaBridge.emit('phaseChanged', { phase: 'launch' })
    if (import.meta.env.DEV) Object.assign(globalThis, { lactomedaBridge: bridge })
    return attachFlightRecorder()
  }, [])
}
