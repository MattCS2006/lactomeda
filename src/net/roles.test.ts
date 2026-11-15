import { describe, expect, it } from 'vitest'
import { ROLES, allRolesAssigned, assignRoles, roleSlots, rolesOf, type RolePick } from './roles'

const pl = (...ids: string[]): RolePick[] => ids.map((id) => ({ id }))

describe('FR-8.2 roles — acceptance: every role assigned before design starts', () => {
  it('4 players: one role each', () => {
    expect(roleSlots(4)).toEqual([['director'], ['engineer'], ['scientist'], ['flightOps']])
  })

  it('2–3 players: roles merge (Director+Ops, Engineer+Scientist); 1 player holds all', () => {
    expect(roleSlots(3)).toEqual([['director', 'flightOps'], ['engineer'], ['scientist']])
    expect(roleSlots(2)).toEqual([
      ['director', 'flightOps'],
      ['engineer', 'scientist'],
    ])
    expect(roleSlots(1)).toEqual([[...ROLES]])
  })

  it('every role is covered by exactly one seat for any team size', () => {
    for (let n = 1; n <= 4; n++) {
      const covered = roleSlots(n).flat()
      expect([...covered].sort(), `${n} players`).toEqual([...ROLES].sort())
    }
  })

  it('every player gets a seat automatically, so every role has an owner', () => {
    for (let n = 1; n <= 4; n++) {
      const players = pl(...['a', 'b', 'c', 'd'].slice(0, n))
      expect(allRolesAssigned(players), `${n} players`).toBe(true)
    }
    expect(allRolesAssigned([])).toBe(false)
  })

  it('a pick takes that seat; the first to ask (seat order) wins a conflict; others fill free seats', () => {
    const players: RolePick[] = [
      { id: 'a', role: 'scientist' },
      { id: 'b', role: 'scientist' },
      { id: 'c' },
      { id: 'd', role: 'director' },
    ]
    const { holder } = assignRoles(players)
    expect(holder).toEqual(['d', 'b', 'a', 'c']) // director=d, engineer=b, scientist=a, flightOps=c
    expect(rolesOf('a', players)).toEqual(['scientist'])
  })

  it('picking any role of a merged seat takes the whole seat', () => {
    const players: RolePick[] = [{ id: 'a' }, { id: 'b', role: 'flightOps' }]
    expect(rolesOf('b', players)).toEqual(['director', 'flightOps'])
    expect(rolesOf('a', players)).toEqual(['engineer', 'scientist'])
    expect(rolesOf('nobody', players)).toEqual([])
  })
})
