import { describe, expect, it } from 'vitest'
import en from '../../i18n/en.json'
import { isAvailable, unavailableReason } from '../landing/landingView'

const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en)

describe('team rooms in the menu (FR-8.1)', () => {
  it('Create Team Room and Join Room are available when the multiplayer server is', () => {
    expect(isAvailable('createRoom', true)).toBe(true)
    expect(isAvailable('joinRoom', true)).toBe(true)
    expect(unavailableReason('createRoom', true)).toBeNull()
  })

  it('without the server they are disabled with a reason; Play Solo still works', () => {
    expect(unavailableReason('joinRoom', false)).toBe('landing.offlineReason')
    expect(isAvailable('solo', false)).toBe(true)
    expect(lookup('landing.offlineReason')).toBeTypeOf('string')
    expect(lookup('landing.offline')).toBeTypeOf('string')
  })

  it('every room status has a message for the player, including the 5th-player rejection', () => {
    for (const s of ['connecting', 'full', 'notFound', 'error', 'offline']) {
      expect(lookup(`rooms.status.${s}`), s).toBeTypeOf('string')
    }
    expect(lookup('rooms.status.full')).toMatch(/full/i)
  })
})
