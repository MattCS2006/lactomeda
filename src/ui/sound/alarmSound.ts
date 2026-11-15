// Alarm sound (FR-13.4) with a mute toggle (FR-9.5: muted by default on first load). The sound is synthesised
// with the Web Audio API (square-wave "chiptune" beeps), so there is no audio file to license or load.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { safeStorage } from '../store/persistence'

export const SOUND_SAVE_KEY = 'lactomeda.sound'

interface SoundStore {
  muted: boolean
  setMuted: (muted: boolean) => void
}

export const useSoundStore = create<SoundStore>()(
  persist(
    (set) => ({
      muted: true,
      setMuted: (muted) => set({ muted }),
    }),
    { name: SOUND_SAVE_KEY, version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
)

export interface Note {
  freq: number // Hz
  start: number // s from now
  duration: number // s
}

/** Two-tone alarm, played twice: high-low, high-low. */
export function alarmPattern(): Note[] {
  const beep = 0.14
  const notes: Note[] = []
  for (let r = 0; r < 2; r++) {
    notes.push({ freq: 880, start: r * 0.6, duration: beep })
    notes.push({ freq: 587, start: r * 0.6 + 0.2, duration: beep })
  }
  return notes
}

/** The part of AudioContext we use (tests pass a fake). */
export interface AudioLike {
  currentTime: number
  destination: unknown
  state?: string
  resume?: () => Promise<void>
  createOscillator(): {
    type: string
    frequency: { value: number }
    connect(node: unknown): unknown
    start(when: number): void
    stop(when: number): void
  }
  createGain(): {
    gain: {
      value: number
      setValueAtTime?(v: number, t: number): void
      linearRampToValueAtTime?(v: number, t: number): void
    }
    connect(node: unknown): unknown
  }
}

let shared: AudioLike | null = null
function defaultContext(): AudioLike | null {
  if (shared) return shared
  const Ctor = (globalThis as { AudioContext?: new () => AudioLike }).AudioContext
  if (!Ctor) return null
  try {
    shared = new Ctor()
  } catch {
    shared = null
  }
  return shared
}

/** Plays the alarm unless muted. Returns how many notes were scheduled (0 when silent). */
export function playAlarm(
  muted = useSoundStore.getState().muted,
  context: () => AudioLike | null = defaultContext,
  volume = 0.06,
): number {
  if (muted) return 0
  const ctx = context()
  if (!ctx) return 0
  if (ctx.state === 'suspended') void ctx.resume?.()
  const notes = alarmPattern()
  for (const n of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = n.freq
    gain.gain.value = volume
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime + n.start)
    osc.stop(ctx.currentTime + n.start + n.duration)
  }
  return notes.length
}

/** Called from the mute toggle (a user gesture), so browsers allow audio afterwards. */
export function unlockAudio(context: () => AudioLike | null = defaultContext): void {
  const ctx = context()
  if (ctx?.state === 'suspended') void ctx.resume?.()
}
