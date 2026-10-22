import { isSolidTile } from '../../shared/map.js';
import * as C from '../../shared/constants.js';

// Bot survivors that play roughly like people. Used for lobby bots (so you can test
// as the monster) and by tools/balance.js. They only react to a monster once it's
// near the edge of their flashlight, flee toward places they can reach first and
// hide when cornered. Otherwise they head for the exit once it's open, free trapped
// friends, or collect coins. How sharp they are comes from BOT_SKILLS (the host's
// "Bot skill" setting). They steer through the same handleInput/handleAction calls
// a real player's socket uses.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tileOf = (p) => ({ tx: Math.floor(p.x / C.TILE), ty: Math.floor(p.y / C.TILE) });
const keyOf = (p, W) => tileOf(p).ty * W + tileOf(p).tx;
const center = (k, W) => ({ x: (k % W) * C.TILE + C.TILE / 2, y: Math.floor(k / W) * C.TILE + C.TILE / 2 });
const STOP = { up: false, down: false, left: false, right: false, sprint: false };

// Tile distances from `from` to every reachable tile, plus the previous tile on each shortest path.
function bfs(map, from, ghost = false) {
  const W = map.width;
  const start = from.ty * W + from.tx;
  const d = new Map([[start, 0]]);
  const prev = new Map();
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const tx = cur % W;
    const ty = Math.floor(cur / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (ty + dy) * W + tx + dx;
      if (isSolidTile(map, tx + dx, ty + dy, ghost) || d.has(k)) continue;
      d.set(k, d.get(cur) + 1);
      prev.set(k, cur);
      queue.push(k);
    }
  }
  return { d, prev, start };
}

function pathTo(search, goal, W) {
  const path = [];
  for (let k = goal; k !== undefined && k !== search.start; k = search.prev.get(k)) path.push(center(k, W));
  return path.reverse();
}

function steerInput(p, wp, sprint) {
  const dx = wp.x - p.x;
  const dy = wp.y - p.y;
  return { right: dx > 4, left: dx < -4, down: dy > 4, up: dy < -4, sprint };
}

// What to do when no monster is in sight: get out, free a friend, or grab coins.
function chooseGoal(room, p, skill, nearest) {
  if (room.exitOpen) return { kind: 'exit', at: room.map.exitApproach, sprint: true };
  const trapped = room.survivors().filter((t) => t.trapped);
  const friend = trapped.sort((a, b) => dist(p, a) - dist(p, b))[0];
  if (friend && dist(p, friend) < 18 * C.TILE) return { kind: `rescue-${friend.id}`, at: friend, friend };
  return { kind: 'coins', avoid: skill.careful ? nearest : null };
}

function routeFor(room, p, goal) {
  const map = room.map;
  const W = map.width;
  const mine = bfs(map, tileOf(p));
  if (goal.kind !== 'coins') return pathTo(mine, keyOf(goal.at, W), W);
  const coins = room.coins
    .filter((c) => p.knownCoins.has(c.id))
    .map((c) => ({ c, k: keyOf(c, W) }))
    .filter(({ c, k }) => mine.d.has(k) && !(goal.avoid && dist(c, goal.avoid) < 6 * C.TILE))
    .sort((a, b) => mine.d.get(a.k) - mine.d.get(b.k));
  p.exploring = !coins.length;
  if (coins.length) return pathTo(mine, coins[Math.floor(Math.random() * Math.min(2, coins.length))].k, W);
  // Nothing in sight: explore somewhere a fair walk away.
  const far = [...mine.d.keys()].filter((k) => mine.d.get(k) > 8);
  return pathTo(mine, far[Math.floor(Math.random() * far.length)], W).slice(0, 12);
}

export function botTick(room, p, now) {
  if (!p.alive) return;
  const skill = C.BOT_SKILLS[room.settings.botSkill] ?? C.BOT_SKILLS.normal;
  const map = room.map;
  const W = map.width;
  let m = room.monsters[0];
  for (const other of room.monsters) if (dist(p, other) < dist(p, m)) m = other;
  const d = dist(p, m);

  // Spotting a monster takes a moment (less for sharper bots).
  const inView = d < room.rules.survivorLight * skill.notice;
  if (!inView) { p.noticedAt = null; p.hideRoll = null; } else p.noticedAt ??= now;
  const sees = inView && now - p.noticedAt >= skill.reactionMs;

  if (p.hiddenSpot !== null) {
    // Peek out once things have been quiet for a few seconds.
    if (d > 400 && now > p.hideUntil - room.rules.hideLimitMs + 3000) room.handleAction(p.id, 'interact', now);
    return;
  }
  if (sees) {
    p.route = null;
    p.hideRoll ??= Math.random() < skill.hideChance;
    const spot = room.nearestSpot(p, C.INTERACT_RADIUS, (s) => !room.spotOccupant(s.id));
    if (p.hideRoll && spot && d < 120 && now >= p.hideCooldownUntil) { room.handleAction(p.id, 'interact', now); return; }
    if (!p.flee || now > p.replanAt) {
      // Somewhere we reach well before the monster, as far from it as possible.
      const mine = bfs(map, tileOf(p));
      const theirs = bfs(map, tileOf(m), m.type === 'ghost');
      let best = null;
      let bestScore = -Infinity;
      for (const [k, myD] of mine.d) {
        const theirD = theirs.d.get(k) ?? 99;
        if (myD > skill.fleeDepth || myD * 1.2 >= theirD) continue;
        const score = theirD - myD * 0.3;
        if (score > bestScore) { bestScore = score; best = k; }
      }
      p.flee = best !== null ? pathTo(mine, best, W) : [];
      p.replanAt = now + skill.replanMs;
    }
    while (p.flee.length && dist(p, p.flee[0]) < 6) p.flee.shift();
    const wp = p.flee[0] ?? { x: p.x + (p.x - m.x), y: p.y + (p.y - m.y) };
    room.handleInput(p.id, steerInput(p, wp, true));
    return;
  }
  p.flee = null;

  // Like a person in the dark, a bot only knows about coins it has been near.
  p.knownCoins ??= new Set();
  for (const c of room.coins) {
    if (!p.knownCoins.has(c.id) && (dist(p, c) < room.rules.survivorLight || room.coins.length <= C.LAST_COINS_REVEALED)) {
      p.knownCoins.add(c.id);
      if (p.exploring) p.route = null; // spotted one: go get it
    }
  }

  const goal = chooseGoal(room, p, skill, m);
  if (goal.friend && dist(p, goal.friend) <= C.RESCUE_RADIUS - 12) {
    room.handleInput(p.id, STOP); // stand by them until they're free
    return;
  }
  if (!p.route || !p.route.length || now > p.routeUntil || p.goalKind !== goal.kind) {
    p.route = routeFor(room, p, goal);
    p.goalKind = goal.kind;
    p.routeUntil = now + 8000;
  }
  while (p.route.length && dist(p, p.route[0]) < 6) p.route.shift();
  const wp = p.route[0] ?? goal.at;
  if (wp) room.handleInput(p.id, steerInput(p, wp, !!goal.sprint));
}

// Bots keep their plans on the player object; clear them between rounds.
export function resetBot(p) {
  Object.assign(p, { flee: null, route: null, replanAt: 0, routeUntil: 0, goalKind: null, noticedAt: null, hideRoll: null, knownCoins: null, exploring: false });
}
