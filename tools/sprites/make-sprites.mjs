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

// ---------- spacecraft exterior (SCRUM-92, FR-9.1) ----------
// Side-view parts, transparent background, 1 px auto-outline (so art stays 1 px inside the canvas).
// Parts that mount on the sides are drawn for the RIGHT side; the game flips them for the left.
// Sizes are written to src/game/exteriorSprites.generated.ts so the layout code never guesses.
const EXT_DIR = 'exterior'
const exterior = {} // key -> canvas
function part(key, w, h, draw) {
  const cv = canvas(w, h)
  draw(cv, PAL)
  cv.outline()
  exterior[key] = cv
}
// 1 px line (Bresenham)
function line(cv, x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  for (;;) {
    cv.set(x0, y0, c)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x0 += sx }
    if (e2 < dx) { err += dx; y0 += sy }
  }
}
// solar cells: dark blue with lighter grid lines every `step` px
function cells(cv, x, y, w, h, step = 3) {
  cv.rect(x, y, w, h, PAL.B)
  for (let i = 0; i < w; i += step) cv.rect(x + i, y, 1, h, PAL.V)
  for (let j = 0; j < h; j += step) cv.rect(x, y + j, w, 1, PAL.V)
  cv.set(x + 1, y + 1, PAL.c)
}
// parabolic dish seen from the side, opening up
function dish(cv, cx, topY, halfW, depth) {
  for (let dx = -halfW; dx <= halfW; dx++) {
    const y = topY + Math.round(depth * (1 - (dx / halfW) ** 2))
    cv.set(cx + dx, y, PAL.W); cv.set(cx + dx, y + 1, PAL.G)
  }
}

// --- bus bodies ---
function cubesatBody(w, h) {
  return (cv, { W, G, M, D, Y }) => {
    cv.rect(1, 1, w - 2, h - 2, G)
    cv.rect(w - 4, 1, 3, h - 2, M) // shaded side
    for (let y = 17; y < h - 1; y += 16) cv.rect(1, y, w - 2, 1, M) // 1U seams
    cv.rect(1, 1, 2, h - 2, W); cv.rect(3, 1, 1, h - 2, D) // left rail
    cv.rect(w - 3, 1, 2, h - 2, W); cv.rect(w - 4, 1, 1, h - 2, D) // right rail
    cv.rect(1, 1, w - 2, 1, W); cv.rect(1, h - 2, w - 2, 1, D) // end caps
    cv.rect(w - 9, 4, 2, 1, Y) // tiny label
  }
}
function foilBody(w, h, { base, shade, trim }) {
  return (cv, { W, G, D, M }) => {
    cv.rect(1, 1, w - 2, h - 2, base)
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if ((x * 7 + y * 13) % 5 === 0) cv.set(x, y, shade) // crinkled foil
    cv.rect(1, h - 4, w - 2, 3, shade) // lower shadow
    cv.rect(1, 1, w - 2, 1, W) // top highlight
    if (trim) { cv.rect(1, Math.floor(h / 2), w - 2, 2, trim); cv.rect(1, Math.floor(h / 2) + 2, w - 2, 1, D) }
    cv.rect(2, h - 7, 6, 2, G); cv.rect(w - 9, 3, 7, 3, M); cv.rect(w - 8, 4, 5, 1, D) // panels and vents
    for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) cv.set(x, y, D) // bolts
  }
}
part('ext_bus_cubesat-1u', 16, 16, cubesatBody(16, 16))
part('ext_bus_cubesat-2u', 16, 24, cubesatBody(16, 24))
part('ext_bus_cubesat-3u', 16, 32, cubesatBody(16, 32))
part('ext_bus_cubesat-6u', 24, 32, cubesatBody(24, 32))
part('ext_bus_cubesat-12u', 32, 48, cubesatBody(32, 48))
part('ext_bus_smallsat', 40, 40, foilBody(40, 40, { base: PAL.Y, shade: PAL.r }))
part('ext_bus_medium', 52, 52, foilBody(52, 52, { base: PAL.W, shade: PAL.G, trim: PAL.Y }))
part('ext_bus_large', 64, 64, foilBody(64, 64, { base: PAL.Y, shade: PAL.r, trim: PAL.W }))
part('ext_bus_generic', 24, 24, (cv, { M, D }) => { // unknown bus or none chosen yet: dashed frame
  cv.rect(1, 1, 22, 22, D)
  for (let i = 1; i < 23; i += 2) { cv.set(i, 1, M); cv.set(i, 22, M); cv.set(1, i, M); cv.set(22, i, M) }
})

// --- power ---
part('ext_solar_body', 12, 6, (cv) => cells(cv, 1, 1, 10, 4, 3)) // cells glued on the bus face
function wing(w, h, yoke, segs) {
  return (cv, { M, D }) => {
    cv.rect(0, Math.floor(h / 2) - 1, yoke + 1, 2, M) // yoke
    const pw = Math.floor((w - 1 - yoke) / segs)
    for (let i = 0; i < segs; i++) { cv.rect(1 + yoke + i * pw, 1, pw, h - 2, D); cells(cv, 2 + yoke + i * pw, 2, pw - 2, h - 4, 3) }
  }
}
part('ext_solar_wing_deploy', 14, 10, wing(14, 10, 2, 1))
part('ext_solar_wing_small', 26, 12, wing(26, 12, 3, 2))
part('ext_solar_wing_large', 44, 16, wing(44, 16, 4, 3))
part('ext_rtg', 20, 10, (cv, { M, D, G, r, Y }) => {
  cv.rect(0, 4, 4, 2, M) // boom
  cv.rect(3, 2, 14, 6, D); cv.rect(3, 2, 14, 1, G) // cylinder
  for (let x = 5; x < 15; x += 2) { cv.rect(x, 1, 1, 8, M); cv.set(x, 1, G) } // cooling fins
  cv.rect(16, 3, 2, 4, r); cv.set(17, 4, Y) // hot end cap
})

// --- antennas (stand on the bus roof, base at the bottom edge) ---
part('ext_ant_uhf', 3, 14, (cv, { W, R, D }) => { cv.rect(1, 1, 1, 11, W); cv.set(1, 1, R); cv.set(1, 12, D) })
part('ext_ant_sband', 10, 5, (cv, { D, G, c }) => { cv.rect(1, 1, 8, 3, D); cv.rect(2, 1, 6, 1, G); cv.set(4, 2, c); cv.set(5, 2, c) })
part('ext_ant_xband', 14, 12, (cv, { M, D, c }) => {
  dish(cv, 7, 3, 5, 2)
  cv.rect(7, 1, 1, 3, M); cv.set(7, 1, c) // feed
  cv.rect(6, 7, 2, 3, M); cv.rect(5, 10, 4, 1, D) // stub + base
})
part('ext_ant_hga', 22, 16, (cv, { M, D, c }) => {
  dish(cv, 11, 5, 9, 4)
  cv.rect(11, 1, 1, 6, M); cv.set(11, 1, c); cv.set(11, 2, c) // feed
  line(cv, 3, 5, 10, 2, M); line(cv, 19, 5, 12, 2, M) // struts
  cv.rect(10, 11, 2, 3, M); cv.rect(8, 14, 6, 1, D)
})
part('ext_ant_optical', 8, 14, (cv, { G, W, D, M, c, V }) => {
  cv.rect(2, 1, 4, 9, G); cv.rect(2, 1, 1, 9, W) // tube
  cv.rect(2, 1, 4, 1, D); cv.rect(3, 2, 2, 1, c); cv.set(3, 3, V) // aperture
  cv.rect(2, 5, 4, 1, D); cv.rect(3, 10, 2, 1, M); cv.rect(1, 11, 6, 2, D) // gimbal + base
})

// --- instruments ---
part('ext_inst_camera', 8, 8, (cv, { M, D, V, c }) => { cv.rect(1, 1, 6, 6, M); cv.rect(2, 2, 4, 4, D); cv.rect(3, 3, 2, 2, V); cv.set(3, 3, c) })
part('ext_inst_multispectral', 10, 8, (cv, { D, C, n, R, W }) => {
  cv.rect(1, 1, 8, 6, D)
  ;[[2, C], [4, n], [6, R]].forEach(([x, col]) => { cv.rect(x, 2, 2, 4, col); cv.set(x, 2, W) })
})
part('ext_inst_thermal', 8, 8, (cv, { M, r, Y, D }) => { cv.rect(1, 1, 6, 6, M); cv.rect(2, 2, 4, 4, r); cv.rect(3, 3, 2, 2, Y); cv.rect(1, 6, 6, 1, D) })
part('ext_inst_sar', 22, 8, (cv, { M, D, G, c }) => {
  cv.rect(10, 1, 2, 2, M) // stub
  cv.rect(1, 3, 20, 4, D); cv.rect(1, 3, 20, 1, G)
  for (let x = 2; x < 20; x += 3) cv.set(x, 5, c) // radiating slots
})
part('ext_inst_spectrometer', 8, 10, (cv, { D, c, R, r, Y, N }) => {
  cv.rect(1, 1, 6, 8, D); cv.rect(2, 2, 4, 1, c)
  ;[R, r, Y, N].forEach((col, i) => cv.rect(2, 4 + i, 4, 1, col)) // dispersed spectrum
})
part('ext_inst_magnetometer', 18, 6, (cv, { D, M, Y }) => { cv.rect(1, 3, 3, 2, D); cv.rect(3, 3, 12, 1, M); cv.rect(15, 2, 2, 3, Y) }) // boom + sensor
part('ext_inst_telescope', 12, 20, (cv, { D, M, W, G, V, c }) => {
  cv.rect(2, 1, 8, 2, M) // mount
  cv.rect(2, 3, 8, 14, W); cv.rect(8, 3, 2, 14, G) // tube
  cv.rect(2, 7, 8, 1, D); cv.rect(2, 12, 8, 1, D) // rings
  cv.rect(2, 16, 8, 2, D); cv.rect(3, 17, 6, 1, V); cv.set(4, 17, c) // aperture
})
part('ext_inst_laser', 8, 10, (cv, { D, M, R }) => { cv.rect(1, 1, 6, 5, D); cv.rect(2, 6, 4, 2, M); cv.rect(3, 8, 2, 1, R) })
part('ext_inst_particle', 8, 8, (cv, { D, G, n }) => { cv.rect(1, 1, 6, 6, D); for (const y of [2, 4]) cv.rect(2, y, 4, 1, G); cv.set(3, 6, n); cv.set(4, 6, n) })
part('ext_inst_radiometer', 10, 8, (cv, { M, D, c }) => { cv.rect(1, 2, 8, 5, M); cv.rect(7, 1, 2, 7, D); cv.set(8, 4, c) })

// --- propulsion and attitude ---
function nozzle(cv, cx, y0, y1, w0, w1, col, hi) {
  for (let y = y0; y <= y1; y++) {
    const w = Math.round(w0 + ((w1 - w0) * (y - y0)) / (y1 - y0))
    cv.rect(cx - Math.floor(w / 2), y, w, 1, col); cv.set(cx - Math.floor(w / 2), y, hi)
  }
}
part('ext_thruster_cold', 8, 7, (cv, { G, W, D }) => { cv.rect(2, 1, 4, 1, D); nozzle(cv, 4, 2, 5, 2, 4, G, W) })
part('ext_thruster_bell', 12, 12, (cv, { D, M, G, K }) => { cv.rect(3, 1, 6, 3, D); nozzle(cv, 6, 4, 9, 4, 10, M, G); cv.rect(3, 9, 6, 1, K) })
part('ext_thruster_hall', 12, 9, (cv, { D, M, c, C }) => {
  cv.rect(2, 1, 8, 3, D); cv.rect(1, 4, 10, 2, M)
  cv.rect(2, 6, 8, 1, C); cv.rect(4, 6, 4, 1, c) // ion glow ring
})
part('ext_star_tracker', 8, 8, (cv, { D, M, V, c }) => { cv.rect(2, 1, 4, 5, D); cv.rect(3, 1, 2, 1, V); cv.set(3, 1, c); cv.rect(1, 5, 6, 2, M) })
part('ext_sun_sensor', 5, 4, (cv, { Y, W }) => { cv.rect(1, 1, 3, 2, Y); cv.set(2, 1, W) })
part('ext_generic_part', 8, 8, (cv, { P, D, W }) => { cv.rect(1, 1, 6, 6, P); cv.rect(2, 2, 4, 4, D); cv.set(4, 3, W); cv.set(4, 5, W) }) // fallback for unknown ids

fs.mkdirSync(path.join(OUT, EXT_DIR), { recursive: true })
for (const [key, cv] of Object.entries(exterior)) save(`${EXT_DIR}/${key}.png`, cv)
const sizeLines = Object.entries(exterior).map(([k, cv]) => `  '${k}': { w: ${cv.w}, h: ${cv.h} },`)
fs.writeFileSync(
  'src/game/exteriorSprites.generated.ts',
  `// GENERATED by tools/sprites/make-sprites.mjs (npm run sprites). Do not edit by hand.\n` +
    `/** Every exterior sprite (public/assets/sprites/exterior/<key>.png) and its size in px. */\n` +
    `export const EXTERIOR_SPRITES = {\n${sizeLines.join('\n')}\n} as const\n`,
)

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

console.log(`Wrote ${Object.keys(TEAM).length} astronaut sheets and ${Object.keys(ICONS).length} consoles and ${Object.keys(exterior).length} exterior parts to ${OUT}`)
