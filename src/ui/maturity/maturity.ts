// JPL Concept Maturity Levels (FR-14.3): which CML each design phase belongs to, and how far
// the current concept has matured. Pure, unit-tested. CML names follow JPL's CML scale.
import { designReview, launchDecision } from '../../engine/rules/review'
import type { GameData, MissionDesign } from '../../engine/types'
import { busComplete } from '../bus/busView'
import type { Label } from '../scenarios/scenarioView'
import { DESIGN_STEPS, type DesignStep } from '../store/missionStore'

export type CmlLevel = 1 | 2 | 3 | 4
export const CML_LEVELS: CmlLevel[] = [1, 2, 3, 4]

/** The CML a design screen works on: Brief = 1, Requirements = 2, Bus/Payload/Orbit = 3, Review = 4. */
export const STEP_CML: Record<DesignStep, CmlLevel> = {
  brief: 1,
  requirements: 2,
  bus: 3,
  payload: 3,
  orbit: 3,
  design: 4, // Design Review (FR-6.9): CML 4 point design
}

/** What has to be done to complete a CML. CML 3 has several parts, shown as a checklist. */
export type MaturityItem = 'scenario' | 'requirements' | 'bus' | 'payload' | 'orbitLaunch' | 'review'
export const CML_ITEMS: Record<CmlLevel, MaturityItem[]> = {
  1: ['scenario'],
  2: ['requirements'],
  3: ['bus', 'payload', 'orbitLaunch'],
  4: ['review'],
}

function passed(step: DesignStep, furthest: DesignStep): boolean {
  return DESIGN_STEPS.indexOf(furthest) > DESIGN_STEPS.indexOf(step)
}

/** Is one item done? `furthest` is the furthest step the player has moved on to. */
export function itemDone(item: MaturityItem, design: MissionDesign, furthest: DesignStep, data: GameData): boolean {
  switch (item) {
    case 'scenario':
      return true // a design exists only once a scenario is picked
    case 'requirements':
      return passed('requirements', furthest)
    case 'bus':
      return busComplete(design)
    case 'payload':
      return design.instrumentIds.length > 0
    case 'orbitLaunch':
      return design.orbitId !== null && design.launcherId !== null && design.groundNetworkId !== null
    case 'review':
      // The engine's design review (FR-6.9) allows launch without accepting any risk
      return launchDecision(designReview(design, data), false).allowed
  }
}

export interface CmlStatus {
  level: CmlLevel
  done: boolean
  items: { item: MaturityItem; done: boolean }[]
}

export interface Maturity {
  /** Highest CML whose level and all levels below are complete (0 = none yet). */
  reached: 0 | CmlLevel
  levels: CmlStatus[]
}

export function maturity(design: MissionDesign | null, furthest: DesignStep, data: GameData): Maturity {
  if (!design) {
    return {
      reached: 0,
      levels: CML_LEVELS.map((level) => ({
        level,
        done: false,
        items: CML_ITEMS[level].map((item) => ({ item, done: false })),
      })),
    }
  }
  const levels = CML_LEVELS.map((level) => {
    const items = CML_ITEMS[level].map((item) => ({ item, done: itemDone(item, design, furthest, data) }))
    return { level, done: items.every((i) => i.done), items }
  })
  let reached: 0 | CmlLevel = 0
  for (const l of levels) {
    if (!l.done) break
    reached = l.level
  }
  return { reached, levels }
}

/** Sentence for the debrief (FR-14.3): "Your concept reached CML 2: Initial feasibility." */
export function debriefCmlLabel(reached: 0 | CmlLevel): Label {
  if (reached === 0) return { key: 'cml.debriefNone' }
  return { key: 'cml.debrief', values: { level: reached, name: { key: `cml.name.${reached}` } } }
}
