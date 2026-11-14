// Typed event bus between Phaser (Dev 3) and React + engine (Dev 1, Dev 2).
// Contract: add events here first, then implement on both sides.
import type { MissionEvent, EventOption } from '../engine/types'

export type BridgeEvents = {
  /** Phaser -> React: player pressed E at a station */
  stationInteract: { station: MissionEvent['station'] }
  /** Engine -> Phaser: an alarm starts in a room */
  alarmStart: { event: MissionEvent }
  /** React -> Engine/Phaser: the team chose an option */
  eventResolved: { eventId: string; option: EventOption; minigameScore?: number }
  /** Phaser -> React: scene finished loading */
  sceneReady: { scene: string }
}

type Handler<T> = (payload: T) => void

class Bridge {
  private handlers = new Map<keyof BridgeEvents, Set<Handler<never>>>()

  on<K extends keyof BridgeEvents>(type: K, fn: Handler<BridgeEvents[K]>): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(fn as Handler<never>)
    return () => this.handlers.get(type)?.delete(fn as Handler<never>)
  }

  emit<K extends keyof BridgeEvents>(type: K, payload: BridgeEvents[K]): void {
    this.handlers.get(type)?.forEach((fn) => (fn as Handler<BridgeEvents[K]>)(payload))
  }
}

export const bridge = new Bridge()
