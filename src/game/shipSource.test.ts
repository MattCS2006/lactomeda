import { describe, expect, it } from 'vitest'
import { gameData } from '../data'
import type { MissionDesign } from '../engine/types'
import { stationsForDesign } from './shipLayout'
import { PREVIEW_BUS_ID, isShipReady, previewDesign, resolveShipDesign } from './shipSource'

const data = gameData

const player: MissionDesign = {
  ...previewDesign(data),
  busClassId: 'medium',
  componentIds: { comms: 'com-xband' },
  instrumentIds: [],
  seed: 'player',
}

describe('resolveShipDesign', () => {
  it('uses the player design once it has a bus and a component', () => {
    expect(resolveShipDesign(player, data)).toBe(player)
  })

  it('falls back to the 3U preview with no design, no bus or no components', () => {
    for (const d of [null, { ...player, busClassId: null }, { ...player, componentIds: {} }]) {
      expect(isShipReady(d)).toBe(false)
      const ship = resolveShipDesign(d, data)
      expect(ship.busClassId).toBe(PREVIEW_BUS_ID)
      expect(new Set(stationsForDesign(ship, data))).toEqual(
        new Set(['bridge', 'power', 'comms', 'computer', 'navigation', 'science']),
      )
    }
  })

  it('?ship=<busClassId> previews a full design on that bus, overriding the player design', () => {
    const ship = resolveShipDesign(player, data, '?demo=1&ship=large')
    expect(ship.busClassId).toBe('large')
    expect(stationsForDesign(ship, data)).toHaveLength(7)
  })

  it('ignores an unknown ?ship value', () => {
    expect(resolveShipDesign(player, data, '?ship=deathstar')).toBe(player)
  })
})
