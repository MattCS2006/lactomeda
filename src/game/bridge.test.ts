import { describe, expect, it, vi } from 'vitest'
import { Bridge } from './bridge'

describe('bridge', () => {
  it('delivers a payload to every listener', () => {
    const b = new Bridge()
    const a = vi.fn()
    const c = vi.fn()
    b.on('stationInteract', a)
    b.on('stationInteract', c)
    b.emit('stationInteract', { station: 'power' })
    expect(a).toHaveBeenCalledWith({ station: 'power' })
    expect(c).toHaveBeenCalledWith({ station: 'power' })
  })

  it('stops delivering after unsubscribe', () => {
    const b = new Bridge()
    const fn = vi.fn()
    const off = b.on('simPaused', fn)
    off()
    b.emit('simPaused', { paused: true })
    expect(fn).not.toHaveBeenCalled()
  })

  it('keeps calling other listeners when one throws', () => {
    const b = new Bridge()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ok = vi.fn()
    b.on('phaseChanged', () => {
      throw new Error('boom')
    })
    b.on('phaseChanged', ok)
    b.emit('phaseChanged', { phase: 'flight' })
    expect(ok).toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('lets a listener unsubscribe itself during emit', () => {
    const b = new Bridge()
    const second = vi.fn()
    const off = b.on('sceneReady', () => off())
    b.on('sceneReady', second)
    b.emit('sceneReady', { scene: 'test' })
    b.emit('sceneReady', { scene: 'test' })
    expect(second).toHaveBeenCalledTimes(2)
  })

  it('clear() removes every listener', () => {
    const b = new Bridge()
    const fn = vi.fn()
    b.on('alarmEnd', fn)
    b.clear()
    b.emit('alarmEnd', { eventId: 'x', optionId: 'y', reason: 'timeout' })
    expect(fn).not.toHaveBeenCalled()
  })
})
