// Simple first-pass estimate of the 6 resource budgets (FR-6.1). Pure and deterministic.
// A future `computeBudgets` can wrap this. Unknown or missing ids contribute 0 and never throw.
import { makeBudget } from '../budgets'
import {
  MINUTES_PER_DAY,
  PERFECT_RELIABILITY_LIFE_FACTOR,
  RADIATION_FACTOR,
  REF_DISTANCE_DEEP_SPACE_KM,
  REF_DISTANCE_KM,
} from '../constants'
import type { Budgets, Component, GameData, Instrument, MissionDesign, ResourceKey, Subsystem } from '../types'
import { effectivePowerW, isSolar } from './components'
import { wetMassKg } from './mass'

export const RESOURCE_KEYS: readonly ResourceKey[] = ['mass', 'power', 'budget', 'data', 'comms', 'time']

interface InstalledPart {
  component: Component
  units: number // 2 when the subsystem is redundant (main + backup)
  redundant: boolean
}

function installedParts(design: MissionDesign, data: GameData): InstalledPart[] {
  const redundant = new Set<Subsystem>(design.redundant)
  const parts: InstalledPart[] = []
  for (const [subsystem, id] of Object.entries(design.componentIds) as [Subsystem, string | undefined][]) {
    if (!id) continue
    const component = data.components.find((c) => c.id === id)
    if (!component) continue
    const isRedundant = redundant.has(subsystem)
    parts.push({ component, units: isRedundant ? 2 : 1, redundant: isRedundant })
  }
  return parts
}

function chosenInstruments(design: MissionDesign, data: GameData): { instrument: Instrument; duty: number }[] {
  const list: { instrument: Instrument; duty: number }[] = []
  for (const id of design.instrumentIds) {
    const instrument = data.instruments.find((i) => i.id === id)
    if (instrument) list.push({ instrument, duty: design.dutyCycle[id] ?? 1 })
  }
  return list
}

export function estimateBudgets(design: MissionDesign, data: GameData): Budgets {
  const parts = installedParts(design, data)
  const instruments = chosenInstruments(design, data)
  const bus = data.busClasses.find((b) => b.id === design.busClassId)
  const orbit = data.orbits.find((o) => o.id === design.orbitId) ?? null
  const launcher = data.launchers.find((l) => l.id === design.launcherId)
  const network = data.groundNetworks.find((g) => g.id === design.groundNetworkId)
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const durationDays = scenario?.durationDays ?? 0

  // mass (kg)
  const massUsed = wetMassKg(design, data)
  let massAvailable = bus?.maxMassKg ?? 0
  if (launcher && orbit) massAvailable = Math.min(massAvailable, launcher.capacityKg[orbit.regime] ?? 0)

  // power (W, orbit average)
  const eclipse = orbit?.eclipseFraction ?? 0
  const powerUsed =
    parts.reduce((a, p) => a + Math.max(0, p.component.powerW) * p.units, 0) +
    instruments.reduce((a, i) => a + i.instrument.powerW * i.duty, 0)
  const powerAvailable = parts.reduce((a, p) => {
    const generated = -effectivePowerW(p.component, orbit)
    if (generated <= 0) return a
    return a + (isSolar(p.component) ? generated * (1 - eclipse) : generated)
  }, 0)

  // budget (M USD)
  const budgetUsed =
    (bus?.baseCostM ?? 0) +
    parts.reduce((a, p) => a + p.component.costM * p.units, 0) +
    instruments.reduce((a, i) => a + i.instrument.costM, 0) +
    (launcher?.costM ?? 0) +
    (network ? network.costM * (durationDays / 365) : 0)

  // data (Mb/day) and comms (min/day)
  const dataUsed = instruments.reduce((a, i) => a + i.instrument.dataMbPerDay * i.duty, 0)
  const comms = design.componentIds.comms
    ? data.components.find((c) => c.id === design.componentIds.comms)
    : undefined
  let contactMin = 0
  let linkMbPerMin = 0
  if (comms && orbit && network) {
    contactMin = Math.min(MINUTES_PER_DAY, orbit.contactMinPerDay * network.contactMultiplier)
    const d0 = (comms.tags ?? []).includes('deepSpace') ? REF_DISTANCE_DEEP_SPACE_KM : REF_DISTANCE_KM
    const distanceFactor = orbit.distanceKm > 0 ? Math.min(1, (d0 / orbit.distanceKm) ** 2) : 1
    linkMbPerMin = ((comms.dataRateKbps ?? 0) / 1000) * 60 * distanceFactor
  }
  const dataAvailable = linkMbPerMin * contactMin
  const commsUsed = dataUsed <= 0 ? 0 : linkMbPerMin > 0 ? dataUsed / linkMbPerMin : contactMin + 1

  // time (days): median life of a constant-failure-rate system vs the required lifetime
  // radiation (FR-5.2) scales each failure rate: r_eff = r ^ factor, except for radHard parts
  const radiationFactor = orbit ? RADIATION_FACTOR[orbit.radiation] : 1
  let reliability = 1
  for (const p of parts) {
    const factor = (p.component.tags ?? []).includes('radHard') ? 1 : radiationFactor
    const r = p.component.reliability ** factor
    reliability *= p.redundant ? 1 - (1 - r) ** 2 : r
  }
  const medianLifeDays =
    durationDays <= 0
      ? 0
      : reliability >= 1
        ? PERFECT_RELIABILITY_LIFE_FACTOR * durationDays
        : reliability <= 0
          ? 0
          : (Math.LN2 * durationDays) / -Math.log(reliability)

  return {
    mass: makeBudget(massUsed, massAvailable),
    power: makeBudget(powerUsed, powerAvailable),
    budget: makeBudget(budgetUsed, scenario?.budgetM ?? 0),
    data: makeBudget(dataUsed, dataAvailable),
    comms: makeBudget(commsUsed, contactMin),
    time: makeBudget(durationDays, medianLifeDays),
  }
}
