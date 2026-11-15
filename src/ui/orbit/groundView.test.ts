import { describe, expect, it } from 'vitest'
import { gameData } from '../../data'
import { estimateBudgets } from '../../engine/rules/resources'
import en from '../../i18n/en.json'
import { createDesign } from '../store/missionStore'
import { contactMinutes, groundReasons, kmLabel, toGroundCard } from './groundView'

const network = (id: string) => gameData.groundNetworks.find((g) => g.id === id)!
const orbit = (id: string) => gameData.orbits.find((o) => o.id === id)!
const design = (scenarioId: string, orbitId: string | null) => ({
  ...createDesign(scenarioId, gameData, 'cadet', 's'),
  orbitId,
})

describe('ground station networks (FR-5.6)', () => {
  it('offers university, commercial, NASA Near Space Network and Deep Space Network', () => {
    expect(gameData.groundNetworks.map((g) => g.id)).toEqual(['gn-university', 'gn-commercial', 'gn-nen', 'gn-dsn'])
    for (const g of gameData.groundNetworks) expect(en.ground.catalog, g.id).toHaveProperty(g.id)
  })

  it('acceptance: more/bigger stations raise contacts per day and cost', () => {
    const leo = orbit('leo')
    const near = ['gn-university', 'gn-commercial', 'gn-nen'].map(network)
    for (let i = 1; i < near.length; i++) {
      expect(contactMinutes(leo, near[i])).toBeGreaterThan(contactMinutes(leo, near[i - 1]))
      expect(near[i].costM).toBeGreaterThan(near[i - 1].costM)
    }
    // the DSN is the most expensive and the only one that reaches Mars
    expect(Math.max(...gameData.groundNetworks.map((g) => g.costM))).toBe(network('gn-dsn').costM)
    expect(groundReasons(network('gn-dsn'), orbit('mars'))).toEqual([])
    expect(groundReasons(network('gn-nen'), orbit('mars'))).not.toEqual([])
  })

  it('shows the same contact minutes as the engine comms budget', () => {
    // engine needs a comms part to count contact; take the first one in the catalog
    const comms = gameData.components.find((c) => c.subsystem === 'comms')!
    for (const g of gameData.groundNetworks) {
      const d = { ...design('wildfire-eo', 'sso'), groundNetworkId: g.id, componentIds: { comms: comms.id } }
      expect(toGroundCard(g, d, gameData).contactMinPerDay, g.id).toBe(estimateBudgets(d, gameData).comms.available)
    }
  })

  it('caps contact at a full day', () => {
    expect(contactMinutes(orbit('geo'), network('gn-commercial'))).toBe(1440)
  })

  it('disables networks that cannot reach the orbit, with both distances', () => {
    const reasons = groundReasons(network('gn-university'), orbit('l2'))
    expect(reasons).toEqual([
      {
        key: 'ground.tooFar',
        values: {
          reach: { key: 'units.km', values: { value: '3,000' } },
          distance: { key: 'units.kmMillion', values: { value: '1.5' } },
        },
      },
    ])
    expect(groundReasons(network('gn-university'), null)).toEqual([])
  })

  it('shows cost per year and for the whole mission', () => {
    const card = toGroundCard(network('gn-commercial'), design('wildfire-eo', 'sso'), gameData)
    expect(card.costPerYear).toEqual({ key: 'units.moneyM', values: { value: 1.5 } })
    expect(card.missionYears).toBe(2)
    expect(card.missionCost).toEqual({ key: 'units.moneyM', values: { value: 3 } })
    expect(toGroundCard(network('gn-commercial'), design('wildfire-eo', null), gameData).contactMinPerDay).toBeNull()
  })

  it('formats distances', () => {
    expect(kmLabel(3000)).toEqual({ key: 'units.km', values: { value: '3,000' } })
    expect(kmLabel(2_000_000)).toEqual({ key: 'units.kmMillion', values: { value: '2' } })
    expect(kmLabel(1e10)).toEqual({ key: 'units.kmBillion', values: { value: '10' } })
  })
})
