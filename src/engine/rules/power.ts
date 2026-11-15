// FR-6.4 power budget incl. eclipse and battery sizing (ERS 7.5). Pure and deterministic: nothing is mutated.
// `message` text is an English fallback; the UI translates by `code` via i18next.
//
// ERS 7.5: P_gen = S x A x eta x (1 - d)^years x (1 - f_eclipse), E_battery >= P_load x t_eclipse / DoD.
// In the catalog a solar component's negative `powerW` already equals S x A x eta at 1 AU, beginning of life,
// so panel area and efficiency are folded into it: they are not separate fields.
//
// Load convention (unchanged from the first-pass estimate): every installed unit draws its power, so a redundant
// subsystem (main + backup) counts twice. Generation is NOT doubled by redundancy: a backup panel is a spare.
import { BATTERY_DOD, RTG_DEGRADATION_PER_YEAR, SOLAR_DEGRADATION_PER_YEAR } from '../constants'
import type { GameData, MissionDesign, Orbit, Subsystem, ValidationIssue } from '../types'
import { effectivePowerW, isSolar, selectedComponent } from './components'
import { effectivePeriodMin } from './objectives'

export interface PowerBreakdown {
  loadW: number
  solarBolW: number // solar generation at 1 AU, beginning of life
  rtgBolW: number
  distanceFactor: number // (1 AU / distance)^2
  solarDegradationFactor: number
  rtgDegradationFactor: number
  sunlitGenerationW: number // EOL, at distance
  sunFraction: number // 1 - eclipseFraction
  orbitAverageGenerationW: number
  orbitAverageMarginW: number // orbitAverageGeneration - load
  eclipseMinutes: number
  eclipseDeficitW: number
  eclipseEnergyWh: number
  requiredBatteryWh: number
  batteryCapacityWh: number
  rechargeEnergyWh: number // sunlit surplus per orbit
  powerShortfall: boolean // orbit-average generation < load
  eclipseShortfall: boolean // battery capacity < required
  rechargeShortfall: boolean // recharge energy < eclipse energy
}

/** Minutes in eclipse per orbit: the (possibly altitude-adjusted) period times the eclipse fraction. */
export function eclipseMinutes(design: MissionDesign, orbit: Orbit): number {
  return effectivePeriodMin(design, orbit) * orbit.eclipseFraction
}

export function powerBreakdown(design: MissionDesign, data: GameData): PowerBreakdown {
  const orbit = data.orbits.find((o) => o.id === design.orbitId) ?? null
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const years = (scenario?.durationDays ?? 0) / 365
  const redundant = new Set<Subsystem>(design.redundant)

  let loadW = 0
  let solarBolW = 0
  let solarAtDistanceBolW = 0
  let rtgBolW = 0
  for (const [subsystem, id] of Object.entries(design.componentIds) as [Subsystem, string | undefined][]) {
    if (!id) continue
    const component = data.components.find((c) => c.id === id)
    if (!component) continue
    loadW += Math.max(0, component.powerW) * (redundant.has(subsystem) ? 2 : 1)
    const generated = -component.powerW
    if (generated <= 0) continue
    if (isSolar(component)) {
      solarBolW += generated
      solarAtDistanceBolW += -effectivePowerW(component, orbit)
    } else {
      rtgBolW += generated
    }
  }
  for (const id of design.instrumentIds) {
    const instrument = data.instruments.find((i) => i.id === id)
    if (instrument) loadW += instrument.powerW * (design.dutyCycle[id] ?? 1)
  }

  const distanceAU = orbit?.sunDistanceAU ?? 1
  const distanceFactor = 1 / distanceAU ** 2
  const solarDegradationFactor = (1 - SOLAR_DEGRADATION_PER_YEAR) ** years
  const rtgDegradationFactor = (1 - RTG_DEGRADATION_PER_YEAR) ** years
  const solarEolW = solarAtDistanceBolW * solarDegradationFactor
  const rtgEolW = rtgBolW * rtgDegradationFactor
  const sunlitGenerationW = solarEolW + rtgEolW
  const sunFraction = 1 - (orbit?.eclipseFraction ?? 0)
  const orbitAverageGenerationW = solarEolW * sunFraction + rtgEolW

  const eclipseMin = orbit ? eclipseMinutes(design, orbit) : 0
  const eclipseDeficitW = Math.max(0, loadW - rtgEolW) // the RTG keeps running in eclipse
  const eclipseEnergyWh = eclipseDeficitW * (eclipseMin / 60)
  const requiredBatteryWh = eclipseEnergyWh / BATTERY_DOD
  const battery = selectedComponent(design, 'battery', data)
  const batteryCapacityWh = (battery?.capacityWh ?? 0) * (redundant.has('battery') ? 2 : 1)
  const sunlitHours = orbit ? (effectivePeriodMin(design, orbit) - eclipseMin) / 60 : 0
  const rechargeEnergyWh = Math.max(0, sunlitGenerationW - loadW) * sunlitHours

  return {
    loadW,
    solarBolW,
    rtgBolW,
    distanceFactor,
    solarDegradationFactor,
    rtgDegradationFactor,
    sunlitGenerationW,
    sunFraction,
    orbitAverageGenerationW,
    orbitAverageMarginW: orbitAverageGenerationW - loadW,
    eclipseMinutes: eclipseMin,
    eclipseDeficitW,
    eclipseEnergyWh,
    requiredBatteryWh,
    batteryCapacityWh,
    rechargeEnergyWh,
    powerShortfall: orbitAverageGenerationW < loadW,
    eclipseShortfall: batteryCapacityWh < requiredBatteryWh,
    rechargeShortfall: rechargeEnergyWh < eclipseEnergyWh,
  }
}

const fmt = (n: number): string => String(Math.round(n * 10) / 10)

/** Three separate issues: average power, eclipse (battery) and recharge. */
export function validatePower(design: MissionDesign, data: GameData): ValidationIssue[] {
  const p = powerBreakdown(design, data)
  const issues: ValidationIssue[] = []

  if (p.powerShortfall) {
    issues.push({
      code: 'POWER_SHORTFALL',
      severity: 'error',
      resource: 'power',
      subsystem: 'power',
      message: `The spacecraft needs ${fmt(p.loadW)} W but generates only ${fmt(p.orbitAverageGenerationW)} W on orbit average.`,
    })
  }
  const hasOrbit = data.orbits.some((o) => o.id === design.orbitId)
  if (hasOrbit && selectedComponent(design, 'battery', data) && p.eclipseShortfall) {
    issues.push({
      code: 'BATTERY_TOO_SMALL',
      severity: 'error',
      resource: 'power',
      subsystem: 'battery',
      message: `Eclipse shortfall: the battery has ${fmt(p.batteryCapacityWh)} Wh but needs ${fmt(p.requiredBatteryWh)} Wh to cover ${fmt(p.eclipseMinutes)} min of eclipse.`,
    })
  }
  if (p.rechargeShortfall) {
    issues.push({
      code: 'RECHARGE_SHORTFALL',
      severity: 'warning',
      resource: 'power',
      message: `Only ${fmt(p.rechargeEnergyWh)} Wh of sunlit surplus per orbit to recharge the ${fmt(p.eclipseEnergyWh)} Wh used in eclipse.`,
    })
  }
  return issues
}
