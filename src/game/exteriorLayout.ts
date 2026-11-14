// Pure composition of the spacecraft exterior from a design (SCRUM-92, FR-9.1). No Phaser here.
// Coordinates are in sprite pixels, origin = top-left of the whole composition, sprites drawn
// from their top-left corner. Sprites overlap their neighbour by 1 px so outlines merge.
import type { GameData, MissionDesign, Subsystem } from '../engine/types'
import {
  BUS_BODIES,
  EXTERIOR_SUBSYSTEMS,
  GENERIC_BODY,
  componentPart,
  instrumentPart,
  spriteSize,
  type ExteriorKey,
  type Mount,
  type PartDef,
} from './exteriorParts'

export interface ExteriorPart {
  key: ExteriorKey
  x: number
  y: number
  flipX: boolean
}

export interface ExteriorLayout {
  body: { key: ExteriorKey; x: number; y: number }
  parts: ExteriorPart[]
  width: number
  height: number
}

export type ExteriorCatalog = Pick<GameData, 'busClasses'>
export type ExteriorDesign = Pick<MissionDesign, 'busClassId' | 'componentIds' | 'redundant' | 'instrumentIds'>

const GAP = 1 // px between neighbours in a row
const FACE_MARGIN = 2 // px between the bus edge and parts on its face

/** Body sprite: exact bus id, else the closest size by volume, else a dashed placeholder. */
function bodyKey(busClassId: string | null, data: ExteriorCatalog): ExteriorKey {
  if (!busClassId) return GENERIC_BODY
  if (Object.hasOwn(BUS_BODIES, busClassId)) return BUS_BODIES[busClassId]
  const bus = data.busClasses.find((b) => b.id === busClassId)
  if (!bus) return GENERIC_BODY
  return bus.volumeL >= 10000 ? 'ext_bus_large' : bus.volumeL >= 1000 ? 'ext_bus_medium' : 'ext_bus_smallsat'
}

/** Every sprite unit the design asks for, in a fixed order (exterior subsystems, then instruments). */
function chosenParts(design: ExteriorDesign): { def: PartDef; units: number }[] {
  const out: { def: PartDef; units: number }[] = []
  for (const sub of EXTERIOR_SUBSYSTEMS) {
    const id = design.componentIds[sub as Subsystem]
    if (!id) continue
    const def = componentPart(sub, id)
    if (def) out.push({ def, units: design.redundant.includes(sub) ? 2 : 1 })
  }
  for (const id of design.instrumentIds) out.push({ def: instrumentPart(id), units: 1 })
  return out
}

/** Centre a row of widths inside `span` px; returns each item's x offset. */
function rowOffsets(widths: number[], span: number): number[] {
  const total = widths.reduce((a, w) => a + w, 0) + GAP * (widths.length - 1)
  let x = Math.floor((span - total) / 2)
  return widths.map((w) => {
    const at = x
    x += w + GAP
    return at
  })
}

export function composeExterior(design: ExteriorDesign, data: ExteriorCatalog): ExteriorLayout {
  const bodySprite = bodyKey(design.busClassId, data)
  const { w: bw, h: bh } = spriteSize(bodySprite)

  // Expand units into sprite instances grouped by mount.
  const byMount: Record<Mount, ExteriorKey[]> = { top: [], bottom: [], wing: [], left: [], front: [], body: [] }
  for (const { def, units } of chosenParts(design)) for (let i = 0; i < units; i++) byMount[def.mount].push(def.key)

  const parts: ExteriorPart[] = []

  // Roof: centred row, standing on the top edge.
  const place = (keys: ExteriorKey[], at: (k: ExteriorKey) => number) => {
    const xs = rowOffsets(keys.map((k) => spriteSize(k).w), bw)
    keys.forEach((key, i) => parts.push({ key, x: xs[i], y: at(key), flipX: false }))
  }
  place(byMount.top, (k) => -spriteSize(k).h + 1)
  place(byMount.bottom, () => bh - 1)

  // Wings: pairs reaching outwards at mid height; a backup pair continues beyond the first.
  let reachR = bw - 1
  let reachL = 1
  for (const key of byMount.wing) {
    const { w, h } = spriteSize(key)
    const y = Math.floor((bh - h) / 2)
    parts.push({ key, x: reachR, y, flipX: false }, { key, x: reachL - w, y, flipX: true })
    reachR += w - 1
    reachL -= w - 1
  }
  // Single left-hand parts (RTG on a boom), stacked outwards.
  let reachSolo = 1
  for (const key of byMount.left) {
    const { w, h } = spriteSize(key)
    parts.push({ key, x: reachSolo - w, y: Math.floor((bh - h) / 2), flipX: true })
    reachSolo -= w - 1
  }

  // Face: instruments flow in rows from the top; body-mounted cells sit low on the face.
  const inner = Math.max(1, bw - 2 * FACE_MARGIN)
  let rowY = FACE_MARGIN
  for (let i = 0; i < byMount.front.length; ) {
    let rowW = 0
    let n = 0
    let rowH = 0
    while (i + n < byMount.front.length) {
      const { w, h } = spriteSize(byMount.front[i + n])
      if (n > 0 && rowW + GAP + w > inner) break
      rowW += (n > 0 ? GAP : 0) + w
      rowH = Math.max(rowH, h)
      n++
    }
    const row = byMount.front.slice(i, i + n)
    const xs = rowOffsets(row.map((k) => spriteSize(k).w), bw)
    row.forEach((key, j) => parts.push({ key, x: xs[j], y: rowY, flipX: false }))
    rowY += rowH + GAP
    i += n
  }
  let cellY = bh - FACE_MARGIN
  for (const key of byMount.body) {
    const { w, h } = spriteSize(key)
    cellY -= h
    parts.push({ key, x: Math.floor((bw - w) / 2), y: cellY, flipX: false })
    cellY -= GAP
  }

  // Normalise so the bounding box starts at (0, 0).
  const all = [{ x: 0, y: 0, ...spriteSize(bodySprite) }, ...parts.map((p) => ({ x: p.x, y: p.y, ...spriteSize(p.key) }))]
  const minX = Math.min(...all.map((p) => p.x))
  const minY = Math.min(...all.map((p) => p.y))
  const maxX = Math.max(...all.map((p) => p.x + p.w))
  const maxY = Math.max(...all.map((p) => p.y + p.h))
  return {
    body: { key: bodySprite, x: 0 - minX, y: 0 - minY },
    parts: parts.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY })),
    width: maxX - minX,
    height: maxY - minY,
  }
}
