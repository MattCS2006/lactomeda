/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { PALETTE_NUM } from './palette'

// Our own sprites may only use Sweetie 16. The third-party tileset (public/assets/tilesets) is exempt.
const SPRITES_DIR = join(process.cwd(), 'public', 'assets', 'sprites')
const PALETTE_SET = new Set<number>(Object.values(PALETTE_NUM))

function pngFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return pngFiles(full)
    return name.toLowerCase().endsWith('.png') ? [full] : []
  })
}

/** Distinct off-palette colours (as hex) used by visible pixels. Alpha 0 = transparent = ignored. */
function offPalette(file: string): string[] {
  const png = PNG.sync.read(readFileSync(file))
  const found = new Set<string>()
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue
    const rgb = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2]
    if (!PALETTE_SET.has(rgb) || png.data[i + 3] !== 255) {
      found.add(`#${rgb.toString(16).padStart(6, '0')}${png.data[i + 3] !== 255 ? `@a${png.data[i + 3]}` : ''}`)
    }
  }
  return [...found]
}

describe('sprites stay on the Sweetie 16 palette', () => {
  const files = pngFiles(SPRITES_DIR)

  it('finds the sprites, including exterior/', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((f) => f.includes('exterior'))).toBe(true)
  })

  it.each(files.map((f) => [f.slice(SPRITES_DIR.length + 1), f]))('%s', (_name, file) => {
    expect(offPalette(file)).toEqual([])
  })
})
