// Bus size class rules (FR-3.1, FR-3.5, FR-13.1). Pure and deterministic: nothing is mutated.
// `message` text is an English fallback; the UI translates by `code` via i18next.
import type { BusClass, GameData, MissionDesign, Subsystem, ValidationIssue } from '../types'

export interface BusClassUsage {
  busClass: BusClass
  instrumentsUsed: number
  componentSlotsUsed: number
  massKg: number // components (x2 if redundant) + instruments + propellant
}

export function findBusClass(design: MissionDesign, data: GameData): BusClass | undefined {
  if (design.busClassId === null) return undefined
  return data.busClasses.find((b) => b.id === design.busClassId)
}

export function busClassUsage(design: MissionDesign, data: GameData): BusClassUsage | null {
  const busClass = findBusClass(design, data)
  if (!busClass) return null

  const redundant = new Set<Subsystem>(design.redundant)
  let componentSlotsUsed = 0
  let massKg = 0
  for (const [subsystem, id] of Object.entries(design.componentIds) as [Subsystem, string | undefined][]) {
    if (!id) continue
    const component = data.components.find((c) => c.id === id)
    if (!component) continue
    const units = redundant.has(subsystem) ? 2 : 1 // main + backup
    componentSlotsUsed += units
    massKg += component.massKg * units
  }
  for (const id of design.instrumentIds) {
    massKg += data.instruments.find((i) => i.id === id)?.massKg ?? 0
  }
  massKg += design.propellantKg

  return { busClass, instrumentsUsed: design.instrumentIds.length, componentSlotsUsed, massKg }
}

export function canAddInstrument(design: MissionDesign, data: GameData): boolean {
  const u = busClassUsage(design, data)
  return u !== null && u.instrumentsUsed < u.busClass.instrumentSlots
}

/** True if one more component unit (a backup) still fits in the bus. */
export function canAddRedundancy(design: MissionDesign, data: GameData): boolean {
  const u = busClassUsage(design, data)
  return u !== null && u.componentSlotsUsed < u.busClass.componentSlots
}

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000)

export function validateBusClass(design: MissionDesign, data: GameData): ValidationIssue[] {
  if (design.busClassId === null) {
    return [{ code: 'MISSING_BUS_CLASS', severity: 'error', message: 'Choose a bus size class.' }]
  }
  const u = busClassUsage(design, data)
  if (!u) {
    return [
      {
        code: 'UNKNOWN_BUS_CLASS',
        severity: 'error',
        message: `Bus class "${design.busClassId}" does not exist.`,
      },
    ]
  }

  const { busClass: b } = u
  const issues: ValidationIssue[] = []
  if (u.instrumentsUsed > b.instrumentSlots) {
    issues.push({
      code: 'TOO_MANY_INSTRUMENTS',
      severity: 'error',
      message: `${b.name} holds at most ${b.instrumentSlots} instruments; you have ${u.instrumentsUsed}.`,
    })
  }
  if (u.componentSlotsUsed > b.componentSlots) {
    issues.push({
      code: 'TOO_MANY_COMPONENTS',
      severity: 'error',
      message: `${b.name} has ${b.componentSlots} component slots; you use ${u.componentSlotsUsed} (backups count).`,
    })
  }
  if (u.massKg > b.maxMassKg) {
    issues.push({
      code: 'OVER_BUS_MASS',
      severity: 'error',
      resource: 'mass',
      message: `Payload is ${fmt(u.massKg)} kg; ${b.name} carries at most ${fmt(b.maxMassKg)} kg.`,
    })
  }
  return issues
}
