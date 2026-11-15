/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PALETTE, PALETTE_HEX_LIST, PALETTE_NUM, STATUS } from './palette'

const GAME_DIR = fileURLToPath(new URL('.', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    const isSource = /\.tsx?$/.test(name)
    const skip = /\.test\.tsx?$/.test(name) || /\.generated\.ts$/.test(name)
    return isSource && !skip ? [full] : []
  })
}

describe('palette', () => {
  it('has 16 distinct colours with matching string and number forms', () => {
    expect(Object.keys(PALETTE)).toHaveLength(16)
    expect(new Set(PALETTE_HEX_LIST).size).toBe(16)
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(PALETTE_NUM[name as keyof typeof PALETTE_NUM]).toBe(parseInt(hex.slice(1), 16))
    }
  })

  it('status colours come from the palette', () => {
    for (const hex of Object.values(STATUS)) expect(PALETTE_HEX_LIST).toContain(hex)
  })
})

describe('no off-palette colours in src/game', () => {
  const allowed = new Set([...PALETTE_HEX_LIST, ...Object.values(PALETTE_NUM).map((n) => n.toString(16).padStart(6, '0'))])

  it('finds source files to scan', () => {
    expect(sourceFiles(GAME_DIR).length).toBeGreaterThan(5)
  })

  it('every hex colour literal is a palette colour', () => {
    const bad: string[] = []
    for (const file of sourceFiles(GAME_DIR)) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      lines.forEach((line, i) => {
        // '#rrggbb' / '#rgb' strings and 0xrrggbb numbers (8+ digit hex literals are not colours)
        for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b|\b0x[0-9a-fA-F]{6}\b/g)) {
          const token = m[0].toLowerCase()
          const key = token.startsWith('#') ? token : token.slice(2)
          if (!allowed.has(key)) bad.push(`${file}:${i + 1} ${m[0]}`)
        }
      })
    }
    expect(bad, `Colours outside the Sweetie 16 palette (use src/game/palette.ts):\n${bad.join('\n')}`).toEqual([])
  })
})
