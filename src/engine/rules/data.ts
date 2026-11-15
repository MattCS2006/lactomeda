// FR-6.6 data budget: data generated vs downlinked vs onboard storage. Pure and deterministic: nothing is mutated.
// `message` text is an English fallback; the UI translates by `code` via i18next.
//
// Backlog model: G = generated Mb/day, D = downlink Mb/day (both from linkBudget), S = storage (Mb), T = mission days.
// If G <= D nothing is lost. Otherwise the daily excess E = G - D fills the storage in S / E days and, once it is
// full, the excess is lost: lostMb = max(0, E x T - S).
// Storage comes from the selected computer. A redundant computer does NOT add storage: the backup is a spare
// that does not share the recorder, so only one unit's storage counts.
import { MINUTES_PER_DAY } from '../constants'
import type { GameData, MissionDesign, ValidationIssue } from '../types'
import { selectedComponent } from './components'
import { linkBudget } from './link'

export interface DataBudget {
  generatedMbPerDay: number
  downlinkMbPerDay: number
  deliveredMbPerDay: number
  storageMb: number
  excessMbPerDay: number // max(0, G - D)
  daysUntilStorageFull: number | null // null if there is no excess
  missionDays: number
  generatedMissionMb: number // G x T
  lostMb: number
  lostPercent: number // 0..100, the value the UI shows
  steadyStateLostPercent: number // 0..100, once storage is full
  bufferNeededMb: number // data held on board between ground passes: G x (1 - contact / 1440)
}

export function dataBudget(design: MissionDesign, data: GameData): DataBudget {
  const link = linkBudget(design, data)
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const missionDays = scenario?.durationDays ?? 0
  const storageMb = selectedComponent(design, 'computer', data)?.storageMb ?? 0

  const G = link.generatedMbPerDay
  const D = link.downlinkMbPerDay
  const excessMbPerDay = Math.max(0, G - D)
  const generatedMissionMb = G * missionDays
  const lostMb = Math.max(0, excessMbPerDay * missionDays - storageMb)

  return {
    generatedMbPerDay: G,
    downlinkMbPerDay: D,
    deliveredMbPerDay: link.deliveredMbPerDay,
    storageMb,
    excessMbPerDay,
    daysUntilStorageFull: excessMbPerDay > 0 ? storageMb / excessMbPerDay : null,
    missionDays,
    generatedMissionMb,
    lostMb,
    lostPercent: generatedMissionMb > 0 ? (lostMb / generatedMissionMb) * 100 : 0,
    steadyStateLostPercent: G > 0 && excessMbPerDay > 0 ? (excessMbPerDay / G) * 100 : 0,
    bufferNeededMb: G * (1 - link.contactMinPerDay / MINUTES_PER_DAY),
  }
}

const fmt = (n: number): string => String(Math.round(n * 10) / 10)

export function validateData(design: MissionDesign, data: GameData): ValidationIssue[] {
  const b = dataBudget(design, data)
  const issues: ValidationIssue[] = []

  if (b.lostPercent > 0) {
    issues.push({
      code: 'DATA_LOSS',
      severity: 'warning',
      resource: 'data',
      message: `${fmt(b.lostPercent)}% of the mission's data will be lost: storage fills after ${fmt(b.daysUntilStorageFull ?? 0)} days.`,
    })
  }
  if (b.storageMb < b.bufferNeededMb) {
    issues.push({
      code: 'STORAGE_TOO_SMALL',
      severity: 'warning',
      resource: 'data',
      subsystem: 'computer',
      message: `Storage holds ${fmt(b.storageMb)} Mb but one day of data between ground passes is ${fmt(b.bufferNeededMb)} Mb.`,
    })
  }
  return issues
}
