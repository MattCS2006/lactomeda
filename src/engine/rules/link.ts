// FR-5.7 link budget (ERS 7.5): D_down = R_link x t_contact x N_contacts x min(1, (d0 / d)^2).
// Pure and deterministic: nothing is mutated. Missing parts give 0 values and never throw.
// `message` text is an English fallback; the UI translates by `code` via i18next.
import { MINUTES_PER_DAY, REF_DISTANCE_DEEP_SPACE_KM, REF_DISTANCE_KM } from '../constants'
import type { GameData, MissionDesign, ValidationIssue } from '../types'

export interface LinkBudget {
  rateKbps: number // comms component dataRateKbps (0 if none)
  contactMinPerDay: number // min(1440, orbit.contactMinPerDay x network.contactMultiplier); 0 if out of range
  distanceKm: number // orbit.distanceKm (0 if no orbit)
  referenceDistanceKm: number // d0 used (deep-space antennas use the deep-space reference)
  distanceFactor: number // min(1, (d0 / d)^2)
  inRange: boolean // orbit.distanceKm <= network.maxDistanceKm (false without an orbit or a network)
  downlinkMbPerDay: number // rateKbps / 1000 x 60 x contactMinPerDay x distanceFactor
  generatedMbPerDay: number // sum of instrument dataMbPerDay x dutyCycle (default 1)
  deliveredMbPerDay: number // min(generated, downlink)
  marginMbPerDay: number // downlink - generated (negative = bottleneck)
  contactMinNeeded: number // minutes to downlink everything generated; 0 if nothing is generated, Infinity if the link carries nothing
}

export function linkBudget(design: MissionDesign, data: GameData): LinkBudget {
  const comms = design.componentIds.comms ? data.components.find((c) => c.id === design.componentIds.comms) : undefined
  const orbit = data.orbits.find((o) => o.id === design.orbitId)
  const network = data.groundNetworks.find((g) => g.id === design.groundNetworkId)

  const rateKbps = comms?.dataRateKbps ?? 0
  const distanceKm = orbit?.distanceKm ?? 0
  const referenceDistanceKm = (comms?.tags ?? []).includes('deepSpace') ? REF_DISTANCE_DEEP_SPACE_KM : REF_DISTANCE_KM
  const distanceFactor = distanceKm > 0 ? Math.min(1, (referenceDistanceKm / distanceKm) ** 2) : 1
  const inRange = orbit !== undefined && network !== undefined && orbit.distanceKm <= network.maxDistanceKm
  const contactMinPerDay =
    orbit && network && inRange ? Math.min(MINUTES_PER_DAY, orbit.contactMinPerDay * network.contactMultiplier) : 0

  const linkMbPerMin = (rateKbps / 1000) * 60 * distanceFactor
  const downlinkMbPerDay = linkMbPerMin * contactMinPerDay

  let generatedMbPerDay = 0
  for (const id of design.instrumentIds) {
    const instrument = data.instruments.find((i) => i.id === id)
    if (instrument) generatedMbPerDay += instrument.dataMbPerDay * (design.dutyCycle[id] ?? 1)
  }

  return {
    rateKbps,
    contactMinPerDay,
    distanceKm,
    referenceDistanceKm,
    distanceFactor,
    inRange,
    downlinkMbPerDay,
    generatedMbPerDay,
    deliveredMbPerDay: Math.min(generatedMbPerDay, downlinkMbPerDay),
    marginMbPerDay: downlinkMbPerDay - generatedMbPerDay,
    contactMinNeeded: generatedMbPerDay <= 0 ? 0 : linkMbPerMin > 0 ? generatedMbPerDay / linkMbPerMin : Infinity,
  }
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100)

export function validateLink(design: MissionDesign, data: GameData): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!design.componentIds.comms) {
    issues.push({ code: 'NO_COMMS', severity: 'error', subsystem: 'comms', message: 'Choose a comms component.' })
  }
  if (design.groundNetworkId === null) {
    issues.push({ code: 'MISSING_GROUND_NETWORK', severity: 'error', message: 'Choose a ground network.' })
  }

  const orbit = data.orbits.find((o) => o.id === design.orbitId)
  const network = data.groundNetworks.find((g) => g.id === design.groundNetworkId)
  if (orbit && network && orbit.distanceKm > network.maxDistanceKm) {
    issues.push({
      code: 'GROUND_NETWORK_OUT_OF_RANGE',
      severity: 'error',
      resource: 'comms',
      message: `${network.name} reaches ${fmt(network.maxDistanceKm)} km but ${orbit.name} is ${fmt(orbit.distanceKm)} km away. Choose a longer-range network (e.g. the Deep Space Network).`,
    })
  }

  const link = linkBudget(design, data)
  if (link.generatedMbPerDay > link.downlinkMbPerDay) {
    issues.push({
      code: 'DOWNLINK_BOTTLENECK',
      severity: 'warning',
      resource: 'data',
      message: `Generating ${fmt(link.generatedMbPerDay)} Mb/day but can only downlink ${fmt(link.downlinkMbPerDay)} Mb/day.`,
    })
  }
  return issues
}
