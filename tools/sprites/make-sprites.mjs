// Lactomeda sprite generator — run with `npm run sprites`.
// Draws original 32x32 pixel-art sprites with code (no drawing skills needed) and
// writes PNGs to public/assets/sprites/. Edit shapes, colours or icon maps below,
// re-run, and the game picks up the new images. See docs/ART.md.
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const OUT = 'public/assets/sprites'
const T = 32 // tile size

// Sweetie 16 palette (see docs/ART.md for what each colour means)
const PAL = {
  K: '#1a1c2c', // outline / darkest
  P: '#5d275d', // purple
  R: '#b13e53', // red  (alarm, critical)
  r: '#ef7d57', // orange
  Y: '#ffcd75', // yellow (warning)
  n: '#a7f070', // light green
  N: '#38b764', // green (OK)
  T: '#257179', // teal
  B: '#29366f', // screen blue
  V: '#3b5dc9', // visor blue
  C: '#41a6f6', // cyan
  c: '#73eff7', // light cyan (shine)
  W: '#f4f4f4', // white (suit)
  G: '#94b0c2', // light grey (suit shade)
  M: '#566c86', // metal
  D: '#333c57', // dark metal
}
const TEAM = { orange: '#ef7d57', green: '#38b764', cyan: '#41a6f6', yellow: '#ffcd75' }

// ---------- tiny canvas ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function canvas(w, h) {
  const px = Array.from({ length: h }, () => Array(w).fill(null))
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < w && y < h) px[y][x] = c
  }
  return {
    w, h, px, set,
    rect(x, y, rw, rh, c) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) set(x + i, y + j, c) },
    circle(cx, cy, rad, c, shade) {
      for (let y = -rad; y <= rad; y++)
        for (let x = -rad; x <= rad; x++)
          if (x * x + y * y <= rad * rad + rad) set(cx + x, cy + y, shade && x + y > rad * 0.5 && x * x + y * y > (rad - 3) * (rad - 3) ? shade : c)
    },
    map(x0, y0, rows, bg) {
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch !== '.') set(x0 + x, y0 + y, PAL[ch])
        else if (bg) set(x0 + x, y0 + y, PAL[bg])
      }))
    },
    outline(c = PAL.K) {
      const add = []
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (px[y][x]) continue
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => px[y + dy]?.[x + dx] && px[y + dy][x + dx] !== c)
        if (near) add.push([x, y])
      }
      add.forEach(([x, y]) => set(x, y, c))
    },
  }
}
function save(name, cv) {
  const png = new PNG({ width: cv.w, height: cv.h })
  cv.px.forEach((row, y) => row.forEach((c, x) => {
    const i = (y * cv.w + x) * 4
    if (c) { const [r, g, b] = hex(c); png.data.set([r, g, b, 255], i) } else png.data.set([0, 0, 0, 0], i)
  }))
  fs.writeFileSync(path.join(OUT, name), PNG.sync.write(png))
}
function blit(dst, src, ox, oy) {
  src.px.forEach((row, y) => row.forEach((c, x) => { if (c) dst.set(ox + x, oy + y, c) }))
}

// ---------- astronaut ----------
// facing: 'down' | 'up' | 'side' (side faces right; Phaser flips it for left)
// step: 0 idle, 1 left foot forward, 2 right foot forward
function astronaut(facing, step, team) {
  const cv = canvas(T, T)
  const { W, G, V, c, M, D, Y } = PAL
  const bob = step === 0 ? 0 : 1 // body dips 1px while walking
  // legs + boots
  const legL = step === 1 ? -1 : 0, legR = step === 2 ? -1 : 0
  if (facing === 'side') {
    cv.rect(13, 26 + legL, 4, 3, W); cv.rect(13, 29 + legL, 5, 2, D)
    cv.rect(17, 26 + legR, 4, 3, G); cv.rect(17, 29 + legR, 5, 2, D)
  } else {
    cv.rect(11, 26 + legL, 4, 3, W); cv.rect(11, 29 + legL, 4, 2, D)
    cv.rect(17, 26 + legR, 4, 3, W); cv.rect(17, 29 + legR, 4, 2, D)
  }
  // body
  const by = 16 + bob
  if (facing === 'side') {
    cv.rect(9, by + 2, 4, 8, M); cv.rect(10, by + 3, 2, 2, D) // backpack
    cv.rect(13, by, 9, 10, W); cv.rect(13, by + 2, 9, 2, team)
    cv.rect(16, by + 3, 4, 7, G) // arm in front
  } else {
    cv.rect(10, by, 12, 10, W)
    cv.rect(10, by, 1, 10, G); cv.rect(21, by, 1, 10, G)
    cv.rect(7, by + 1, 3, 7, W); cv.rect(22, by + 1, 3, 7, W) // arms
    cv.rect(7, by + 7, 3, 2, G); cv.rect(22, by + 7, 3, 2, G) // gloves
    if (facing === 'down') {
      cv.rect(10, by + 2, 12, 2, team); cv.rect(15, by + 5, 2, 2, Y) // chest band + badge
    } else {
      cv.rect(11, by + 1, 10, 7, M); cv.rect(13, by + 3, 6, 2, D); cv.rect(14, by + 6, 1, 1, team); cv.rect(17, by + 6, 1, 1, team)
    }
  }
  // helmet
  const hx = facing === 'side' ? 17 : 16
  cv.circle(hx, 9 + bob, 8, W, G)
  if (facing === 'down') {
    cv.rect(11, 6 + bob, 11, 6, V); cv.set(11, 6 + bob, W); cv.set(21, 6 + bob, W); cv.set(11, 11 + bob, W); cv.set(21, 11 + bob, W)
    cv.rect(13, 7 + bob, 2, 1, c); cv.set(13, 8 + bob, c)
  } else if (facing === 'side') {
    cv.rect(18, 6 + bob, 7, 6, V); cv.set(24, 6 + bob, W); cv.set(24, 11 + bob, W)
    cv.rect(20, 7 + bob, 2, 1, c)
  }
  cv.set(hx + (facing === 'side' ? -5 : 5), 1 + bob, M); cv.set(hx + (facing === 'side' ? -5 : 5), 2 + bob, M) // antenna
  cv.outline()
  return cv
}

// ---------- consoles ----------
// 12x10 icons drawn on the 20x12 screen; '.' = screen background
const ICONS = {
  bridge: ['............', '.....WW.....', '.....WW.....', '..WWWWWWWW..', '...WWWWWW...', '....WWWW....', '...WW..WW...', '..W......W..', '............', 'YYYYYYYYYYYY'],
  comms: ['.........C..', '........C.C.', '..WWW...C...', '.WGGGW......', '.WGGGGW.....', '..WGGGW.....', '...WWGW.....', '....GG......', '...GGGG.....', '............'],
  power: ['............', 'GGGGGGGGGG..', 'GnnnnnNN.GG.', 'GnnnnnNN.GG.', 'GnnnnnNN.GG.', 'GnnnnnNN.GG.', 'GGGGGGGGGG..', '............', '..YY.YYYY...', '............'],
  science: ['............', '..n.........', '.n.n....n...', 'n...n..n.n..', '.....nn...n.', '...........n', '............', 'YYYY.YY.YYY.', '............', 'YY.YYYY.YY..'],
  navigation: ['............', '.....CC.....', '...C.CC.C...', '..C......C..', '.CC..YY..CC.', '.CC..YY..CC.', '..C......C..', '...C.CC.C...', '.....CC.....', '............'],
  engine: ['............', '......Y.....', '.....YY.....', '.....YrY....', '....YrrY....', '....YrRrY...', '...YrRRrY...', '...YrRRrY...', '....YrrY....', '............'],
  computer: ['............', '..G.G.G.G...', '.GGGGGGGGG..', 'GGCCCCCCCGG.', '.GCWWWWWCG..', 'GGCWCCCWCGG.', '.GCCCCCCCG..', '..GGGGGGG...', '..G.G.G.G...', '............'],
  alarm: ['............', '.....YY.....', '.....YY.....', '.....YY.....', '.....YY.....', '............', '.....YY.....', '............', '............', '............'],
  off: Array(10).fill('............'),
}
function consoleTile(icon, screenBg) {
  const cv = canvas(T, T)
  const { D, M, G, Y, N, R, C } = PAL
  cv.rect(4, 1, 24, 17, D) // monitor bezel
  cv.rect(6, 3, 20, 13, PAL[screenBg]) // screen
  cv.map(10, 4, ICONS[icon], screenBg)
  cv.rect(14, 18, 4, 2, D) // stand
  cv.rect(1, 20, 30, 10, M) // desk
  cv.rect(1, 20, 30, 1, G); cv.rect(1, 28, 30, 2, D)
  ;[[4, Y], [7, N], [10, R], [13, C]].forEach(([x, col]) => cv.rect(x, 23, 2, 2, col)) // buttons
  cv.rect(17, 22, 11, 4, D)
  for (let x = 18; x < 27; x += 2) { cv.set(x, 23, G); cv.set(x + 1, 24, G) } // keyboard
  cv.outline()
  return cv
}

// ---------- build ----------
fs.mkdirSync(OUT, { recursive: true })
const sheets = {}
for (const [name, team] of Object.entries(TEAM)) {
  // spritesheet: rows = down, up, side; columns = idle, step L, step R  (96x96)
  const sheet = canvas(T * 3, T * 3)
  ;['down', 'up', 'side'].forEach((f, row) => [0, 1, 2].forEach((s) => blit(sheet, astronaut(f, s, team), s * T, row * T)))
  save(`astronaut_${name}.png`, sheet)
  sheets[name] = sheet
}
const consoles = {}
for (const icon of Object.keys(ICONS)) {
  const bg = icon === 'alarm' ? 'R' : icon === 'off' ? 'K' : 'B'
  consoles[icon] = consoleTile(icon, bg)
  save(`console_${icon}.png`, consoles[icon])
}

// preview sheet for docs (scaled 4x)
const S = 4, gap = 8
const items = [sheets.orange, sheets.green, ...Object.values(consoles)]
const pw = items.reduce((a, it) => a + it.w + gap, gap), ph = T * 3 + 2 * gap
const preview = canvas(pw, ph)
preview.rect(0, 0, pw, ph, '#0b0f1a')
let x = gap
for (const it of items) { blit(preview, it, x, gap); x += it.w + gap }
const big = canvas(pw * S, ph * S)
preview.px.forEach((row, y) => row.forEach((c, x2) => big.rect(x2 * S, y * S, S, S, c)))
fs.mkdirSync('docs', { recursive: true })
const png = new PNG({ width: big.w, height: big.h })
big.px.forEach((row, y) => row.forEach((c, x2) => { const [r, g, b] = hex(c || '#0b0f1a'); png.data.set([r, g, b, 255], (y * big.w + x2) * 4) }))
fs.writeFileSync('docs/art-preview.png', PNG.sync.write(png))

console.log(`Wrote ${Object.keys(TEAM).length} astronaut sheets and ${Object.keys(ICONS).length} consoles to ${OUT}`)
