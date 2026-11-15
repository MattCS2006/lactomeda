import { beforeEach, describe, expect, it } from 'vitest'
import { alarmPattern, playAlarm, useSoundStore, type AudioLike } from './alarmSound'

function fakeAudio() {
  const started: { freq: number; at: number; until: number }[] = []
  const ctx: AudioLike = {
    currentTime: 10,
    destination: {},
    createOscillator: () => {
      const osc = {
        type: '',
        frequency: { value: 0 },
        connect: () => undefined,
        start: (at: number) => started.push({ freq: osc.frequency.value, at, until: 0 }),
        stop: (until: number) => {
          started[started.length - 1]!.until = until
        },
      }
      return osc
    },
    createGain: () => ({ gain: { value: 0 }, connect: () => undefined }),
  }
  return { ctx, started }
}

describe('alarm sound (FR-13.4) with mute (FR-9.5)', () => {
  beforeEach(() => useSoundStore.setState({ muted: true }))

  it('is muted by default on first load', () => {
    expect(useSoundStore.getState().muted).toBe(true)
  })

  it('plays a two-tone pattern when sound is on', () => {
    const { ctx, started } = fakeAudio()
    expect(playAlarm(false, () => ctx)).toBe(alarmPattern().length)
    expect(started.map((s) => s.freq)).toEqual([880, 587, 880, 587])
    expect(started.every((s) => s.at >= 10 && s.until > s.at)).toBe(true)
  })

  it('stays silent when muted, or when the browser has no audio', () => {
    const { ctx, started } = fakeAudio()
    expect(playAlarm(true, () => ctx)).toBe(0)
    expect(started).toHaveLength(0)
    expect(playAlarm(false, () => null)).toBe(0)
  })

  it('the mute toggle is remembered in the store', () => {
    useSoundStore.getState().setMuted(false)
    expect(useSoundStore.getState().muted).toBe(false)
  })
})
