import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { createDesign } from '../store/missionStore'
import { formatNumber, payloadTotals, slotInfo, toInstrumentCard } from './payloadView'

const cubesat = gameData.scenarios.find((s) => s.id === 'student-cubesat')!
const wildfire = gameData.scenarios.find((s) => s.id === 'wildfire-eo')!

describe('instrument catalog screen (FR-4.1)', () => {
  it('has at least the 10 ERS instruments, each with mass, power, cost, data and science', () => {
    const types = ['camera', 'multispectral', 'thermal', 'radar', 'spectrometer', 'magnetometer', 'telescope', 'radiometer', 'particle', 'altimeter']
    expect(gameData.instruments.length).toBeGreaterThanOrEqual(10)
    for (const type of types) {
      expect(gameData.instruments.some((i) => i.name.toLowerCase().includes(type)), type).toBe(true)
    }
    for (const i of gameData.instruments) {
      const card = toInstrumentCard(i, cubesat)
      for (const v of [card.massKg, card.powerW, card.costM, card.dataMbPerDay, card.science]) {
        expect(Number.isFinite(v) && v > 0, `${i.id}`).toBe(true)
      }
    }
  })

  it('lists which of the scenario objectives an instrument helps', () => {
    const multispectral = gameData.instruments.find((i) => i.id === 'inst-multispectral')!
    expect(toInstrumentCard(multispectral, cubesat).helps).toEqual(['Take images of Earth'])
    expect(toInstrumentCard(multispectral, wildfire).helps).toEqual(['Detect active fires quickly', 'Map burn scars in detail'])
    const telescope = gameData.instruments.find((i) => i.id === 'inst-telescope')!
    expect(toInstrumentCard(telescope, wildfire).helps).toEqual([])
  })

  it('sums the selected instruments', () => {
    const d = { ...createDesign('student-cubesat', gameData, 'cadet', 's'), instrumentIds: ['inst-visible-cam', 'inst-magnetometer'] }
    expect(payloadTotals(d, gameData)).toEqual({ count: 2, massKg: 4, powerW: 8, costM: 2.2, dataMbPerDay: 2050, science: 25 })
    expect(payloadTotals(createDesign('student-cubesat', gameData), gameData).count).toBe(0)
  })

  it('has no slot limit until a bus is chosen, then uses the bus class slots', () => {
    const d = createDesign('student-cubesat', gameData, 'cadet', 's')
    expect(slotInfo(d, gameData)).toEqual({ used: 0, max: null, full: false })
    const bus = gameData.busClasses.find((b) => b.id === 'cubesat-3u')!
    const ids = gameData.instruments.slice(0, bus.instrumentSlots).map((i) => i.id)
    expect(slotInfo({ ...d, busClassId: bus.id, instrumentIds: ids }, gameData)).toEqual({
      used: bus.instrumentSlots,
      max: bus.instrumentSlots,
      full: true,
    })
  })

  it('formats numbers for cards', () => {
    expect(formatNumber(120000)).toBe('120,000')
    expect(formatNumber(0.2)).toBe('0.2')
    expect(formatNumber(2.2000000000000002)).toBe('2.2')
  })
})
