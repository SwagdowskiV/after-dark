import { TILE } from './constants.js';

// Each map is a text grid, one character per 32x32 tile. Edit a grid to redesign that map.
//   #  wall / dense thicket (blocks movement and sight)
//   T  furniture / tree or rock (solid, doesn't block sight; the ghost floats through it)
//   H  hiding spot: wardrobe, or a hollow log in the forest (solid, enter with E)
//   S  survivor spawn     M  monster spawn
//   L  flickering light: ceiling lamp, firefly swarm, or string lights at the circus
//   E  the exit (a door in the outer wall; it unlocks once every coin is collected)
const MANSION_ROWS = [
  '########################################',
  '#H...T..T...H#H..........H#H....TT....H#',
  '#............#..L......L..#............#',
  '#.TT....TT...#............#..T.....T...#',
  '#.................TTTT....#......L.....#',
  '#.TT....TT...#....TTTT....#............#',
  '#......L.....#...............T.....T...#',
  '#H...........#............#...........H#',
  '#............#............#............#',
  '#####..############..###########..######',
  '#H....................................H#',
  '#.........L.............L.....SSSSSS...#',
  '#......................................#',
  '###..##############..##############..###',
  '#TTTT....TTTT#H..........H#TTT.....TTTH#',
  '#............#............#............#',
  '#.TT.....H...#...L....L...#..TT....TT..#',
  '#.TT.........................TT....TT..#',
  '#......L.....#....TTTT....#............#',
  '#............#............#.....L......#',
  '#H.....TTT..H#H..........H#H..........H#',
  '######..##############..######..########',
  '#H....TT....TT....H#H.................H#',
  '#..................#...................#',
  '#..TT..........TT..#...TT.....L....TT..#',
  '#.....M......L.........................#',
  '#..TT..........TT..#...TT..........TT..#',
  '#..................#...................#',
  '#H.......TT.......H#H.......TTT.......H#',
  '#################################E######',
];

// The hard map: open woods where trees don't block sight, few lights and few hiding logs.
const FOREST_ROWS = [
  '########################################',
  '#H...T......###.....T......###....T...H#',
  '#..T....T...###..T......T..###.T.......#',
  '#....T.........................T...T...#',
  '#.T.....L..T....T..####...T......L..T..#',
  '##...T..........T..####.....T..........#',
  '###.....T..###.........T.....###..T...##',
  '###H..T....###..SSSSSS......H###......##',
  '#....T.....###...........T...###.T.....#',
  '#..T....T.........T..T..............T..#',
  '#.....T.....T.L...........T.....L....T.#',
  '#..####...T.....T.....T...####....T....#',
  '#..####.H...T.....###.......####H..T...#',
  '#T......T.......T.###..T..T..........T.#',
  '#...T.....T..T....###.....T.....T......#',
  '#.....T.......T........T......T....T...#',
  '#H.T....###.....T....T....###.....T...H#',
  '#..T....###.T.......L.....###..T.......#',
  '#....T..###H....T....T....###H.....T...#',
  '##.........T.........T............T....#',
  '###..T.......T.###.....T.....T......T.##',
  '#.....T..T.....###...T....T.....T......#',
  '#..T.........T.###H....T......T....T...#',
  '#......T..T...........T....T.......T...#',
  '#.T..........####..T......####...T.....E',
  '#....M..T....####......T..####..L....T.#',
  '#..T.....T...........T...........T.....#',
  '#.....T.....T....T.........T.....T.....#',
  '#H....T....T......H...T...........T...H#',
  '########################################',
];

// The circus: a big top in the middle, striped tents in the corners, food stalls
// and wagons along the midway. The Clown is at home here.
const CIRCUS_ROWS = [
  '########################################',
  '#H.......H.#................#H........H#',
  '#..........#..TT........TT..#..........#',
  '#..TT......#................#....TT....#',
  '#....L...........SSSSSS................#',
  '#..................................L...#',
  '#......T...#.H............H.#..T.......#',
  '#H.........#................#.........H#',
  '#####..#####................#####..#####',
  '#................##..##................#',
  '#........L.....##......##........L.....#',
  '#..TT.........#..........#.........TT..#',
  '#............#H....L......#............#',
  '#.......H...##..T......T..##...H.......#',
  '#H.....................................#',
  '#.....................................H#',
  '#...........##..T......T..##...........#',
  '#..TT........#......L....H#........TT..#',
  '#.............#..........#.............#',
  '#.....L........##......##..............#',
  '#................##..##................#',
  '#####..#####................#####..#####',
  '#H.........#................#.........H#',
  '#.......T..#................#..........#',
  '#..TT......#..TT........TT..#......TT..#',
  '#....M.................................#',
  '#..................L...........T.......#',
  '#..L.......#.H............H.#......L...#',
  '#H.......H.#................#H........H#',
  '###################E####################',
];

const SOLID = new Set(['#', 'T', 'H', 'E']);
const GHOST_SOLID = new Set(['#', 'H', 'E']);

function buildMap(id, rows) {
  const height = rows.length;
  const width = rows[0].length;
  const tiles = rows.map((r) => r.split(''));
  const map = {
    id, width, height, tiles,
    pixelWidth: width * TILE,
    pixelHeight: height * TILE,
    hidingSpots: [], survivorSpawns: [], flickerLights: [], floorTiles: [],
    monsterSpawn: null, exit: null, exitApproach: null,
  };
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const c = tiles[ty][tx];
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      if (c === 'H') map.hidingSpots.push({ id: map.hidingSpots.length, tx, ty, x, y });
      if (c === 'S') map.survivorSpawns.push({ x, y });
      if (c === 'M') map.monsterSpawn = { x, y };
      if (c === 'L') map.flickerLights.push({ x, y });
      if (c === 'E') map.exit = { tx, ty, x, y };
      if (!SOLID.has(c)) map.floorTiles.push({ tx, ty, x, y });
    }
  }
  // The floor tile just inside the exit door, where survivors (and bots) head to get out.
  const { tx, ty } = map.exit;
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    if (!SOLID.has(tiles[ty + dy]?.[tx + dx] ?? '#')) {
      map.exitApproach = { tx: tx + dx, ty: ty + dy, x: (tx + dx) * TILE + TILE / 2, y: (ty + dy) * TILE + TILE / 2 };
      break;
    }
  }
  return map;
}

export const MAPS = {
  mansion: buildMap('mansion', MANSION_ROWS),
  forest: buildMap('forest', FOREST_ROWS),
  circus: buildMap('circus', CIRCUS_ROWS),
};
export const MAP_IDS = Object.keys(MAPS);

// `ghost` lets the ghost monster pass through furniture and trees.
export function isSolidTile(map, tx, ty, ghost = false) {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  return (ghost ? GHOST_SOLID : SOLID).has(map.tiles[ty][tx]);
}

export function isWallTile(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  return map.tiles[ty][tx] === '#' || map.tiles[ty][tx] === 'E';
}

// Does a circle at (x, y) overlap any solid tile?
export function circleHitsSolid(map, x, y, r, ghost = false) {
  const minTx = Math.floor((x - r) / TILE);
  const maxTx = Math.floor((x + r) / TILE);
  const minTy = Math.floor((y - r) / TILE);
  const maxTy = Math.floor((y + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isSolidTile(map, tx, ty, ghost)) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
  }
  return false;
}

// Move one axis at a time so entities slide along walls instead of sticking.
export function moveCircle(map, entity, dx, dy, r, ghost = false) {
  if (dx && !circleHitsSolid(map, entity.x + dx, entity.y, r, ghost)) entity.x += dx;
  if (dy && !circleHitsSolid(map, entity.x, entity.y + dy, r, ghost)) entity.y += dy;
}

// Walls block sight; furniture and trees do not.
export function hasLineOfSight(map, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(d / 8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWallTile(map, Math.floor((x1 + (x2 - x1) * t) / TILE), Math.floor((y1 + (y2 - y1) * t) / TILE))) return false;
  }
  return true;
}

function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// Deterministic flicker so every player sees the same light at the same moment
// (time is the server clock). Each light bursts on and off for ~1.4s every few seconds.
export function flickerOn(index, timeMs) {
  const cycle = 5200 + index * 730;
  const phase = (timeMs + index * 1337) % cycle;
  if (phase > 1400) return false;
  return hash(Math.floor(timeMs / 90) + index * 31) > 0.35;
}
