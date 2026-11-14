// Typed event bus between Phaser (Dev 3) and React + engine (Dev 1, Dev 2).
// Contract: add events here first, then implement on both sides.
// v1 — frozen once all three approve the PR.
//
// The engine is pure functions and never emits by itself. The mission
// controller (Dev 1, src/game/missionController.ts) owns the SimState,
// calls the engine and emits the "Engine ->" events below.
import type {
  Budgets,
  Explanation,
  MinigameKind,
  MissionEvent,
  ScoreResult,
  SimState,
  Station,
} from '../engine/types'

export type GamePhase = 'design' | 'launch' | 'flight' | 'debrief'

/** Per-tick snapshot for HUD and rooms. The full log stays in the controller (keeps multiplayer messages small). */
export type SimSnapshot = Omit<SimState, 'log'>

export type BridgeEvents = {
  // ── Phaser -> React ──────────────────────────────────────────────────
  /** Scene finished loading */
  sceneReady: { scene: string }
  /** Player walked into / out of a station's range (show or hide "Press E") */
  stationProximity: { station: Station; near: boolean }
  /** Player pressed E at a station */
  stationInteract: { station: Station }
  /** Repair mini-game finished; score 0-1 */
  minigameDone: { eventId: string; optionId: string; score: number }

  // ── React -> Engine/Phaser ───────────────────────────────────────────
  /** Player picked an option that has a mini-game: Phaser opens it */
  minigameStart: { eventId: string; optionId: string; kind: MinigameKind }
  /** The team chose an option. minigameScore 0-1 scales the option's costs */
  eventResolved: { eventId: string; optionId: string; minigameScore?: number }
  /** Pause or resume the flight simulation */
  simPaused: { paused: boolean }

  // ── Engine (controller) -> React + Phaser ────────────────────────────
  /** Game moved to a new phase */
  phaseChanged: { phase: GamePhase }
  /** Design changed, new budgets ready (design phase HUD) */
  budgetsUpdated: { budgets: Budgets }
  /** One tick simulated; snapshot for HUD and room visuals */
  simTick: { state: SimSnapshot }
  /** An alarm starts in a room (several can ring at once) */
  alarmStart: { event: MissionEvent; deadlineTick: number }
  /** Alarm finished: resolved by the team, timed out (default option applied) or escalated */
  alarmEnd: { eventId: string; optionId: string; reason: 'resolved' | 'timeout' | 'escalated' }
  /** Mission over */
  missionEnded: { status: 'success' | 'failed'; score: ScoreResult; explanation: Explanation }
}

type Handler<T> = (payload: T) => void

export class Bridge {
  private handlers = new Map<keyof BridgeEvents, Set<Handler<never>>>()

  /** Subscribe. Returns an unsubscribe function: call it in useEffect cleanup / scene shutdown. */
  on<K extends keyof BridgeEvents>(type: K, fn: Handler<BridgeEvents[K]>): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(fn as Handler<never>)
    return () => this.handlers.get(type)?.delete(fn as Handler<never>)
  }

  emit<K extends keyof BridgeEvents>(type: K, payload: BridgeEvents[K]): void {
    const set = this.handlers.get(type)
    if (!set) return
    // Copy so handlers that unsubscribe during emit don't affect this loop
    for (const fn of [...set]) {
      try {
        ;(fn as Handler<BridgeEvents[K]>)(payload)
      } catch (err) {
        // One broken listener must not silence the others
        console.error(`[bridge] handler for "${type}" failed`, err)
      }
    }
  }

  /** Remove every listener (tests, full game restart). */
  clear(): void {
    this.handlers.clear()
  }
}

export const bridge = new Bridge()
