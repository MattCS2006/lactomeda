import { describe, expect, it } from 'vitest'
import { fullGameData, gameData, presets } from '../../data'
import type { Component } from '../../engine/types'
import { AUTO_SUBSYSTEMS, autoPart, fitsBus, withAutoParts } from './autoPick'

describe('Cadet auto-pick', () => {
  it('picks the cheapest Cadet part that fits the bus', () => {
    expect(autoPart('structure', 'cubesat-3u', 'cadet', fullGameData)?.id).toBe('str-3u')
    expect(autoPart('structure', 'cubesat-12u', 'cadet', fullGameData)?.id).toBe('str-12u')
    expect(autoPart('attitude', 'large', 'cadet', fullGameData)?.id).toBe('adcs-cmg')
    // never an advanced part on Cadet
    expect(autoPart('thermal', 'large', 'cadet', fullGameData)?.id).toBe('thm-radiators')
  })

  it('a part missing from partFits fits every bus', () => {
    const part = { id: 'x', subsystem: 'thermal' } as Component
    expect(fitsBus(part, 'large', {})).toBe(true)
    expect(fitsBus(part, 'large', { x: ['smallsat'] })).toBe(false)
  })

  it('gives every bus class a Cadet part for every auto-picked subsystem', () => {
    for (const bus of gameData.busClasses) {
      for (const s of AUTO_SUBSYSTEMS) expect(autoPart(s, bus.id, 'cadet', gameData), `${bus.id} ${s}`).toBeDefined()
    }
  })

  it.each(presets.map((p) => [p.scenarioId, p] as const))(
    '%s preset uses exactly the auto-picked parts, so changing the bus away and back restores it',
    (_id, p) => {
      for (const s of AUTO_SUBSYSTEMS) expect(autoPart(s, p.busClassId!, 'cadet', gameData)?.id, s).toBe(p.componentIds[s])
    },
  )

  it('without a bus the design is unchanged; it never mutates its input', () => {
    const d = { ...presets[0]!, busClassId: null }
    expect(withAutoParts(d, gameData)).toBe(d)
    const snap = JSON.stringify(presets[0])
    withAutoParts({ ...presets[0]!, busClassId: 'large' }, gameData)
    expect(JSON.stringify(presets[0])).toBe(snap)
  })
})
