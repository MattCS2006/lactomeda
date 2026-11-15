// Team roles (FR-8.2, SCRUM-83): Mission Director, Spacecraft Engineer, Payload Scientist, Flight Ops & Comms.
// With 2–3 players roles merge (ERS §2: Director+Ops, Engineer+Scientist), so every role always has an owner.
// Assignment is computed the same way on every client from the seat order and each player's pick. Pure.

export type RoleId = 'director' | 'engineer' | 'scientist' | 'flightOps'

export const ROLES: readonly RoleId[] = ['director', 'engineer', 'scientist', 'flightOps']

/** A seat at the table: one or more merged roles held by one player. */
export type RoleSlot = readonly RoleId[]

/** The seats for a team size: 4 → one role each; 3 → Director+Ops merged; 2 → Director+Ops, Engineer+Scientist; 1 → all. */
export function roleSlots(players: number): RoleSlot[] {
  if (players >= 4) return ROLES.map((r) => [r])
  if (players === 3) return [['director', 'flightOps'], ['engineer'], ['scientist']]
  if (players === 2)
    return [
      ['director', 'flightOps'],
      ['engineer', 'scientist'],
    ]
  return [[...ROLES]]
}

/** The seat that contains a role. */
export function slotOf(slots: RoleSlot[], role: RoleId): number {
  return slots.findIndex((s) => s.includes(role))
}

export interface RolePick {
  id: string
  /** The role the player asked for (any role of the seat they want). */
  role?: RoleId
}

/**
 * Who holds which seat. Players come in seat order (the room's join order).
 * 1. Explicit picks, in seat order: a free seat goes to whoever asked first.
 * 2. Everyone left gets the first free seat, in seat order.
 * With as many seats as players, every role ends up with an owner (FR-8.2 acceptance).
 */
export function assignRoles(players: RolePick[]): { slots: RoleSlot[]; holder: (string | null)[] } {
  const slots = roleSlots(players.length)
  const holder: (string | null)[] = slots.map(() => null)
  const placed = new Set<string>()
  for (const p of players) {
    if (!p.role) continue
    const s = slotOf(slots, p.role)
    if (s >= 0 && holder[s] === null) {
      holder[s] = p.id
      placed.add(p.id)
    }
  }
  for (const p of players) {
    if (placed.has(p.id)) continue
    const free = holder.indexOf(null)
    if (free < 0) break
    holder[free] = p.id
    placed.add(p.id)
  }
  return { slots, holder }
}

/** The roles one player holds (empty if they have no seat). */
export function rolesOf(playerId: string, players: RolePick[]): RoleId[] {
  const { slots, holder } = assignRoles(players)
  const s = holder.indexOf(playerId)
  return s >= 0 ? [...slots[s]!] : []
}

/** Every role has an owner. */
export function allRolesAssigned(players: RolePick[]): boolean {
  const { holder } = assignRoles(players)
  return players.length > 0 && holder.every((h) => h !== null)
}
