// Tile indices in the "Sci-fi Interior tiles" sheet (Buch, OpenGameArt, CC0; see docs/ART.md §5).
// Sheet: 32x32 tiles, 14 columns x 6 rows, 0-based index = row * 14 + col.
// docs/tileset-grid.png shows every index. Pure data: no Phaser imports.

export const TILE_SIZE = 32
export const TILESET_KEY = 'scifi-tiles'
export const TILESET_PATH = 'assets/tilesets/scifitiles-sheet.png'
export const TILESET_COLUMNS = 14

export const TILES = {
  /** Plain floor (centre of the blue-bordered floor panel). */
  FLOOR: 20,
  /** Blue/orange hazard stripes: doorways and corridors. */
  DOORWAY: 4,
  /** Dark wall top / space outside the ship. */
  VOID: 17,
  /** Upper wall-face row (dark ceiling edge over light metal), two pipe variants. */
  WALL_TOP_A: 28,
  WALL_TOP_B: 29,
  /** Lower wall-face row (light metal over the blue base). */
  WALL_FACE: 42,
  /** Lower wall-face row with a computer panel and pipes (decor). */
  WALL_FACE_PIPES: 43,
  /** Lower wall-face row with server lights and a screen (decor). */
  WALL_FACE_SCREENS: 44,
  /** Floor hatch and closed door, blue. Not placed yet; kept for later decor. */
  HATCH_BLUE: 2,
  DOOR_BLUE: 3,
} as const

// Not used: 30 (wall top) has a transparent top half; 16 (dark) has a purple strip on its top edge.

/** Tiles the player cannot walk through. */
export const COLLIDING_TILES: ReadonlySet<number> = new Set([
  TILES.VOID,
  TILES.WALL_TOP_A,
  TILES.WALL_TOP_B,
  TILES.WALL_FACE,
  TILES.WALL_FACE_PIPES,
  TILES.WALL_FACE_SCREENS,
  TILES.DOOR_BLUE,
])

/** Tiles the player can walk on. */
export const WALKABLE_TILES: ReadonlySet<number> = new Set([TILES.FLOOR, TILES.DOORWAY, TILES.HATCH_BLUE])
