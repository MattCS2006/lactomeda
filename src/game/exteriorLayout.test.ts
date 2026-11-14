import { describe, expect, it } from 'vitest'
import { gameData } from '../data'
import type { MissionDesign, Subsystem } from '../engine/types'
import { composeExterior } from './exteriorLayout'
import {
  BUS_BODIES,
  COMPONENT_PARTS,
  INSTRUMENT_PARTS,
  componentPart,
  copiesPerUnit,
  instrumentPart,
  type PartDef,
} from './exteriorParts'
import { EXTERIOR_SPRITES } from './exteriorSprites.generated'
import { exteriorSampleDesign, resolveExteriorDesign } from './exteriorSource'

const design = (over: Partial<MissionDesign> = {}): MissionDesign => ({
  scenarioId: 's',
  difficulty: 'cadet',
  requirementLevels: {},
  busClassId: 'cubesat-3u',
  componentIds: {},
  redundant: [],
  propellantKg: 0,
  instrumentIds: [],
  dutyCycle: {},
  orbitId: null,
  launcherId: null,
  groundNetworkId: null,
  seed: 'x',
  ...over,
})
const count = (keys: string[], key: string) => keys.filter((k) => k === key).length
const keysOf = (d: MissionDesign) => composeExterior(d, gameData).parts.map((p) => p.key)

describe('composeExterior', () => {
  it('empty design is just the body', () => {
    const r = composeExterior(design(), gameData)
    expect(r.parts).toEqual([])
    expect(r.body.key).toBe(BUS_BODIES['cubesat-3u'])
    expect([r.body.x, r.body.y]).toEqual([0, 0])
    expect(r.width).toBe(EXTERIOR_SPRITES[r.body.key].w)
    expect(r.height).toBe(EXTERIOR_SPRITES[r.body.key].h)
  })

  it('bigger bus class gives a bigger body', () => {
    const areas = [...gameData.busClasses]
      .sort((a, b) => a.volumeL - b.volumeL)
      .map((b) => composeExterior(design({ busClassId: b.id }), gameData))
      .map((r) => r.width * r.height)
    areas.slice(1).forEach((a, i) => expect(a).toBeGreaterThan(areas[i]))
  })

  it('every drawable catalog component appears once per unit, twice when redundant', () => {
    let checked = 0
    for (const c of gameData.components) {
      const def = componentPart(c.subsystem, c.id)
      if (!def) continue
      checked++
      const copies = copiesPerUnit(def.mount)
      const one = design({ componentIds: { [c.subsystem]: c.id } })
      expect(count(keysOf(one), def.key), c.id).toBe(copies)
      const two = design({ componentIds: { [c.subsystem]: c.id }, redundant: [c.subsystem] })
      expect(count(keysOf(two), def.key), `${c.id} redundant`).toBe(copies * 2)
    }
    expect(checked).toBeGreaterThan(10)
  })

  it('every catalog instrument appears exactly once', () => {
    for (const i of gameData.instruments) {
      expect(count(keysOf(design({ instrumentIds: [i.id] })), instrumentPart(i.id).key), i.id).toBe(1)
    }
  })

  it('wing pairs are mirrored on both sides of the body', () => {
    const r = composeExterior(design({ componentIds: { power: 'pwr-array-small' } }), gameData)
    const [a, b] = r.parts
    expect(a.flipX).toBe(false)
    expect(b.flipX).toBe(true)
    expect(a.x).toBeGreaterThan(r.body.x)
    expect(b.x).toBeLessThan(r.body.x)
  })

  it('unknown ids and buses never throw and fall back to generic art', () => {
    const d = design({
      busClassId: 'nope',
      componentIds: { power: 'x', comms: 'y', propulsion: 'z', attitude: 'w', battery: 'q' } as Partial<Record<Subsystem, string>>,
      instrumentIds: ['mystery'],
    })
    const r = composeExterior(d, gameData)
    expect(r.body.key).toBe('ext_bus_generic')
    expect(r.parts.map((p) => p.key)).toContain('ext_generic_part')
    expect(r.parts).toHaveLength(5) // power, comms, attitude, propulsion + instrument; battery is internal
    expect(() => composeExterior(design({ busClassId: null }), gameData)).not.toThrow()
    expect(() => composeExterior(design({ busClassId: 'cubesat-1u', instrumentIds: Array(12).fill('inst-sar') }), gameData)).not.toThrow()
  })

  it('stays inside its own bounding box', () => {
    for (const bus of gameData.busClasses) {
      const r = composeExterior(exteriorSampleDesign(bus.id, gameData), gameData)
      for (const p of [r.body, ...r.parts]) {
        const { w, h } = EXTERIOR_SPRITES[p.key]
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.x + w).toBeLessThanOrEqual(r.width)
        expect(p.y + h).toBeLessThanOrEqual(r.height)
      }
    }
  })

  it('same design gives the same result, and does not mutate it', () => {
    const d = exteriorSampleDesign('medium', gameData)
    const snapshot = JSON.stringify(d)
    expect(composeExterior(d, gameData)).toEqual(composeExterior(structuredClone(d), gameData))
    expect(JSON.stringify(d)).toBe(snapshot)
  })
})

describe('exterior mapping', () => {
  it('every mapped sprite exists in the generated sprite list', () => {
    const defs: (PartDef | null)[] = [...Object.values(COMPONENT_PARTS), ...Object.values(INSTRUMENT_PARTS)]
    for (const d of defs) if (d) expect(EXTERIOR_SPRITES).toHaveProperty(d.key)
    for (const k of Object.values(BUS_BODIES)) expect(EXTERIOR_SPRITES).toHaveProperty(k)
  })

  it('covers every bus class, instrument and exterior component in the catalog', () => {
    for (const b of gameData.busClasses) expect(Object.hasOwn(BUS_BODIES, b.id), b.id).toBe(true)
    for (const i of gameData.instruments) expect(Object.hasOwn(INSTRUMENT_PARTS, i.id), i.id).toBe(true)
    for (const c of gameData.components) {
      const exterior = ['power', 'comms', 'attitude', 'propulsion'].includes(c.subsystem)
      if (exterior) expect(Object.hasOwn(COMPONENT_PARTS, c.id), c.id).toBe(true)
    }
  })
})

describe('resolveExteriorDesign', () => {
  it('uses the sample 3U when there is no design', () => {
    expect(resolveExteriorDesign(null, gameData).busClassId).toBe('cubesat-3u')
  })
  it('uses the player design as is, even with no bus yet', () => {
    const d = design({ busClassId: null })
    expect(resolveExteriorDesign(d, gameData)).toBe(d)
  })
  it('?exterior=<bus> gives a full sample, unknown buses are ignored', () => {
    const big = resolveExteriorDesign(null, gameData, '?exterior=large')
    expect(big.busClassId).toBe('large')
    expect(Object.keys(big.componentIds).length).toBeGreaterThan(4)
    expect(resolveExteriorDesign(null, gameData, '?exterior=zzz').busClassId).toBe('cubesat-3u')
  })
})
