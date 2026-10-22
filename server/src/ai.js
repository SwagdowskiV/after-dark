import { hasLineOfSight, isSolidTile } from '../../shared/map.js';
import * as C from '../../shared/constants.js';

// The AI monster runs on the server, so it hunts the same way for everyone.
// Priorities each tick:
//   1. chase a survivor it can see
//   2. search a hiding spot it saw someone dive into (or that Lights On revealed)
//   3. go to where it last saw someone
//   4. investigate the latest sprinting noise
//   5. wander (guarding the open exit and checking on trapped survivors now and then),
//      occasionally flipping the lights on
// With several AI monsters, each runs this on its own.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tileOf = (p) => ({ tx: Math.floor(p.x / C.TILE), ty: Math.floor(p.y / C.TILE) });
const center = (tx, ty) => ({ x: tx * C.TILE + C.TILE / 2, y: ty * C.TILE + C.TILE / 2 });

export function createAIState() {
  return {
    path: [], goalKey: null, repathAt: 0,
    lastSeen: null, chasingId: null, searchSpotId: null, spottedId: null, spottedAt: 0,
    noiseHandledAt: 0, wander: null, wanderUntil: 0,
    stuckCheckAt: 0, stuckPos: null, nextLightsTry: 0,
  };
}

// Breadth-first search over walkable tiles. The goal tile may itself be solid
// a wardrobe), in which case standing next to it counts as arriving.
// The ghost can route straight through furniture and trees.
function findPath(map, from, to, ghost) {
  const W = map.width;
  const start = from.ty * W + from.tx;
  const goalSolid = isSolidTile(map, to.tx, to.ty, ghost);
  const isGoal = (tx, ty) => (goalSolid
    ? Math.abs(tx - to.tx) + Math.abs(ty - to.ty) === 1
    : tx === to.tx && ty === to.ty);
  const prev = new Map([[start, -1]]);
  const queue = [start];
  let found = -1;
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const tx = cur % W;
    const ty = Math.floor(cur / W);
    if (isGoal(tx, ty)) { found = cur; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      const key = ny * W + nx;
      if (isSolidTile(map, nx, ny, ghost) || prev.has(key)) continue;
      prev.set(key, cur);
      queue.push(key);
    }
  }
  if (found < 0) return [];
  const path = [];
  for (let k = found; k !== start; k = prev.get(k)) path.push(center(k % W, Math.floor(k / W)));
  return path.reverse();
}

function steer(m, x, y) {
  const dx = x - m.x;
  const dy = y - m.y;
  const len = Math.hypot(dx, dy);
  m.moveX = len > 2 ? dx / len : 0;
  m.moveY = len > 2 ? dy / len : 0;
}

function goTo(room, m, ai, x, y, now) {
  const ghost = m.type === 'ghost';
  const goal = tileOf({ x, y });
  const key = `${goal.tx},${goal.ty}`;
  if (key !== ai.goalKey || now >= ai.repathAt) {
    ai.path = findPath(room.map, tileOf(m), goal, ghost);
    ai.goalKey = key;
    ai.repathAt = now + 400;
  }
  while (ai.path.length && dist(m, ai.path[0]) < 6) ai.path.shift();
  if (ai.path.length) steer(m, ai.path[0].x, ai.path[0].y);
  else if (!isSolidTile(room.map, goal.tx, goal.ty, ghost)) steer(m, x, y);
  else { m.moveX = 0; m.moveY = 0; }
}

function randomWanderPoint(map) {
  return map.floorTiles[Math.floor(Math.random() * map.floorTiles.length)];
}

// Once the exit is open it's worth guarding; trapped survivors draw rescuers.
function patrolPoint(room) {
  const roll = Math.random();
  if (room.exitOpen && roll < 0.45) return room.map.exitApproach;
  const trapped = room.survivors().filter((p) => p.trapped);
  if (trapped.length && roll < 0.65) {
    const t = trapped[Math.floor(Math.random() * trapped.length)];
    return { x: t.x, y: t.y };
  }
  return randomWanderPoint(room.map);
}

export function updateAI(room, m, dt, now) {
  const ai = m.ai;
  const lightsOn = now < room.lightsOnUntil;
  const alive = room.survivors().filter((p) => p.alive);

  // Someone we were chasing ducked into a hiding spot: stop chasing them. We only go
  // and open a spot if we watched someone dive into it right in front of us.
  if (ai.chasingId && room.players.get(ai.chasingId)?.hiddenSpot != null) ai.chasingId = null;
  if (ai.searchSpotId === null) {
    const exposed = alive.find((p) => p.hiddenSpot !== null && p.spottedHiding);
    if (exposed) ai.searchSpotId = exposed.hiddenSpot;
  }

  // Who can we see right now?
  const sight = lightsOn ? 520 : room.rules.aiSight;
  let target = null;
  let best = Infinity;
  for (const p of alive) {
    if (p.hiddenSpot !== null) continue;
    const d = dist(p, m);
    if (d <= sight && d < best && hasLineOfSight(room.map, m.x, m.y, p.x, p.y)) { target = p; best = d; }
  }

  // Reaction time: someone new has to stay in view for a moment before the chase starts
  // (unless they're right on top of us), which gives survivors a chance to back away.
  if (!target) ai.spottedId = null;
  else {
    if (ai.spottedId !== target.id) { ai.spottedId = target.id; ai.spottedAt = now; }
    if (ai.chasingId !== target.id && best > 90 && now - ai.spottedAt < C.AI_REACTION_MS) target = null;
  }

  if (target) {
    ai.chasingId = target.id;
    ai.lastSeen = { x: target.x, y: target.y, at: now };
    if (best < 90) steer(m, target.x, target.y);
    else goTo(room, m, ai, target.x, target.y, now);
    if (best < 220) room.usePower(m, 'blackout', now);
  } else if (ai.searchSpotId !== null) {
    const spot = room.map.hidingSpots[ai.searchSpotId];
    if (dist(m, spot) <= C.INTERACT_RADIUS) {
      room.monsterSearch(m, now);
      ai.searchSpotId = null;
      m.moveX = 0;
      m.moveY = 0;
    } else {
      goTo(room, m, ai, spot.x, spot.y, now);
    }
  } else if (ai.lastSeen && now - ai.lastSeen.at < C.AI_MEMORY_MS) {
    goTo(room, m, ai, ai.lastSeen.x, ai.lastSeen.y, now);
    if (dist(m, ai.lastSeen) < 20) ai.lastSeen = null;
  } else if (room.lastNoise && now - room.lastNoise.at < 4000 && ai.noiseHandledAt !== room.lastNoise.at) {
    goTo(room, m, ai, room.lastNoise.x, room.lastNoise.y, now);
    if (dist(m, room.lastNoise) < 24) ai.noiseHandledAt = room.lastNoise.at;
  } else {
    if (!ai.wander || dist(m, ai.wander) < 20 || now > ai.wanderUntil) {
      ai.wander = patrolPoint(room);
      ai.wanderUntil = now + 9000;
    }
    goTo(room, m, ai, ai.wander.x, ai.wander.y, now);
    if (now >= ai.nextLightsTry) {
      ai.nextLightsTry = now + 4000;
      if (Math.random() < 0.35) room.usePower(m, 'lightsOn', now);
    }
  }

  // Unstick: if we've barely moved in a second, drop the plan and pick a new spot.
  if (now >= ai.stuckCheckAt) {
    if (ai.stuckPos && dist(m, ai.stuckPos) < 4 && (m.moveX || m.moveY)) {
      ai.path = [];
      ai.repathAt = 0;
      ai.wander = randomWanderPoint(room.map);
      ai.lastSeen = null;
    }
    ai.stuckPos = { x: m.x, y: m.y };
    ai.stuckCheckAt = now + 1000;
  }
}
