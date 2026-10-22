import { useEffect, useRef } from 'react';
import { TILE } from '@shared/constants.js';

const S = 0.5; // preview pixels per map pixel (16px tiles)

// Stable pseudo-random number per tile, matching the forest scatter in the game.
function rnd(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawMansionTile(ctx, c, tx, ty) {
  const x = tx * TILE;
  const y = ty * TILE;
  if (c === '#') {
    ctx.fillStyle = '#2a2233';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#3a3047';
    ctx.fillRect(x, y, TILE, 6);
    return;
  }
  ctx.fillStyle = (tx + ty) % 2 ? '#2b1f18' : '#30231b';
  ctx.fillRect(x, y, TILE, TILE);
  if (c === 'T') {
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
  } else if (c === 'H') {
    ctx.fillStyle = '#4a2a14';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    circle(ctx, x + TILE / 2 - 4, y + TILE / 2, 2.4, '#c9a227');
    circle(ctx, x + TILE / 2 + 4, y + TILE / 2, 2.4, '#c9a227');
  } else if (c === 'L') {
    circle(ctx, x + TILE / 2, y + TILE / 2, 6, '#fff3c4');
  }
}

function drawForestTile(ctx, c, tx, ty) {
  const x = tx * TILE;
  const y = ty * TILE;
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  ctx.fillStyle = (tx + ty) % 2 ? '#15211a' : '#17251b';
  ctx.fillRect(x, y, TILE, TILE);
  if (c === '#') {
    ctx.fillStyle = '#0a120c';
    ctx.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 3; i++) {
      circle(ctx, x + 6 + rnd(tx + i, ty) * 20, y + 6 + rnd(tx, ty + i) * 20, 11 + rnd(tx * i, ty) * 5, i % 2 ? '#1b3320' : '#203c26');
    }
  } else if (c === 'T') {
    circle(ctx, cx, cy, 14, '#24452b');
    circle(ctx, cx - 3, cy - 3, 8, '#30593a');
  } else if (c === 'H') {
    ctx.fillStyle = '#5b3a1f';
    ctx.fillRect(x + 1, y + 8, TILE - 2, 16);
    circle(ctx, x + TILE - 7, cy, 4.5, '#0d0704');
  } else if (c === 'L') {
    for (let i = 0; i < 5; i++) circle(ctx, x + 4 + rnd(tx + i, ty * 2) * 24, y + 4 + rnd(tx * 2, ty + i) * 24, 2, '#e6ff7a');
  }
}

function drawCircusTile(ctx, c, tx, ty) {
  const x = tx * TILE;
  const y = ty * TILE;
  const inRing = ((tx + 0.5 - 20) / 7.5) ** 2 + ((ty + 0.5 - 15) / 5.5) ** 2 < 1;
  ctx.fillStyle = inRing ? '#4a1219' : (tx + ty) % 2 ? '#3a2b1b' : '#3f2f1e';
  ctx.fillRect(x, y, TILE, TILE);
  if (c === '#') {
    ctx.fillStyle = '#8e1b2a';
    ctx.fillRect(x, y, TILE / 2, TILE);
    ctx.fillStyle = '#cdbd96';
    ctx.fillRect(x + TILE / 2, y, TILE / 2, TILE);
  } else if (c === 'T') {
    if (inRing) circle(ctx, x + TILE / 2, y + TILE / 2, 13, '#2f6fb5');
    else { ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6); }
  } else if (c === 'H') {
    ctx.fillStyle = '#4b2a6b';
    ctx.fillRect(x + 1, y + 3, TILE - 2, TILE - 9);
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(x + 1, y + 3, TILE - 2, 3);
  } else if (c === 'L') {
    ['#ff5a5a', '#ffd54f', '#6ad1ff', '#9dff7a'].forEach((col, i) => circle(ctx, x + 4 + i * 8, y + 11 + i, 3, col));
  }
}

const DRAW_TILE = { mansion: drawMansionTile, forest: drawForestTile, circus: drawCircusTile };
const DARKNESS = { mansion: 'rgba(3, 2, 7, 0.45)', forest: 'rgba(1, 4, 3, 0.6)', circus: 'rgba(6, 2, 4, 0.42)' };
const LAMP_GLOW = { mansion: 'rgba(255, 200, 100, 0.26)', forest: 'rgba(190, 255, 110, 0.22)', circus: 'rgba(255, 120, 200, 0.24)' };

// A lit thumbnail of a map, drawn from its tile grid: dim everywhere,
// with pools of light around the lamps and the survivors' starting spot,
// a red glow where the monster waits and a green one at the exit.
function drawPreview(canvas, map) {
  const W = map.pixelWidth * S;
  const H = map.pixelHeight * S;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.scale(S, S);
  const drawTile = DRAW_TILE[map.id] ?? drawMansionTile;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) drawTile(ctx, map.tiles[ty][tx], tx, ty);
  }
  ctx.restore();

  const spawn = map.survivorSpawns.reduce((a, s) => ({ x: a.x + s.x / map.survivorSpawns.length, y: a.y + s.y / map.survivorSpawns.length }), { x: 0, y: 0 });
  const lights = [...map.flickerLights.map((l) => ({ ...l, r: 5 * TILE })), { ...spawn, r: 4 * TILE }];

  const dark = document.createElement('canvas');
  dark.width = W;
  dark.height = H;
  const d = dark.getContext('2d');
  d.fillStyle = DARKNESS[map.id] ?? DARKNESS.mansion;
  d.fillRect(0, 0, W, H);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const x = l.x * S;
    const y = l.y * S;
    const r = l.r * S;
    const g = d.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0, 0, 0, 1)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    d.fillStyle = g;
    d.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.drawImage(dark, 0, 0);

  ctx.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect((x - r) * S, (y - r) * S, r * 2 * S, r * 2 * S);
  };
  for (const l of map.flickerLights) glow(l.x, l.y, 3 * TILE, LAMP_GLOW[map.id] ?? LAMP_GLOW.mansion);
  glow(map.monsterSpawn.x, map.monsterSpawn.y, 3 * TILE, 'rgba(255, 40, 70, 0.5)');
  glow(map.exit.x, map.exit.y, 3 * TILE, 'rgba(110, 255, 150, 0.55)');
  ctx.globalCompositeOperation = 'source-over';
}

export default function MapPreview({ map, className = '' }) {
  const ref = useRef(null);
  useEffect(() => { drawPreview(ref.current, map); }, [map]);
  return <canvas ref={ref} className={`map-preview ${className}`} aria-hidden="true" />;
}
