import { MAPS, MAP_IDS, moveCircle, hasLineOfSight, isSolidTile } from '../../shared/map.js';
import * as C from '../../shared/constants.js';
import { createAIState, updateAI } from './ai.js';
import { botTick, resetBot } from './bots.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const MAP_CHOICES = [...MAP_IDS, C.RANDOM_MAP];
const STATUS_RANK = { escaped: 0, left: 1, caught: 2 };

// One Room = one lobby + its rounds. The server is the referee: it alone decides
// movement, coin pickups, catches, cooldowns and who wins.
export class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map(); // id -> player (socket id, or bot-N for bots)
    this.hostId = null;
    this.botSeq = 0;
    this.settings = {
      monsterMode: 'ai', monsterType: 'clown', monsterCount: 1, powers: true,
      difficulty: 'normal', botSkill: 'normal', mapPick: 'host', mapId: 'mansion',
    };
    this.useMap('mansion');
    this.phase = 'lobby'; // lobby | countdown | playing | results
    this.countdownEnd = 0;
    this.resetRoundState();
  }

  resetRoundState() {
    this.coins = [];
    this.coinsTotal = 0;
    this.monsters = [];
    this.startedAt = 0;
    this.frozenUntil = 0;
    this.endsAt = 0;
    this.lightsOnUntil = 0;
    this.blackoutStart = 0;
    this.blackoutUntil = 0;
    this.lastNoise = null;
    this.results = null;
  }

  useMap(mapId) {
    this.map = MAPS[mapId];
    this.rules = C.MAP_RULES[mapId];
  }

  // ---------- lobby ----------

  humans() { return [...this.players.values()].filter((p) => !p.isBot); }

  // Bots alone don't keep a room open.
  get isEmpty() { return this.humans().length === 0; }

  // A human can join if there's a free seat, or a bot to give up its seat.
  hasSeatForHuman() {
    if (this.players.size < C.MAX_PLAYERS) return true;
    const bot = [...this.players.values()].findLast((p) => p.isBot);
    if (!bot) return false;
    this.players.delete(bot.id);
    return true;
  }

  addPlayer(socket, { name, color, skin }) {
    const p = { id: socket.id, name, color, skin, ready: false, wantsMonster: false, mapVote: null, role: 'survivor' };
    this.players.set(socket.id, p);
    if (!this.hostId) this.hostId = socket.id;
    socket.join(this.code);
    this.evaluateStart();
    this.broadcastLobby();
    return p;
  }

  addBot(id) {
    if (id !== this.hostId || this.phase !== 'lobby' || this.players.size >= C.MAX_PLAYERS) return;
    const taken = [...this.players.values()];
    const name = C.BOT_NAMES.find((n) => !taken.some((p) => p.name === n)) ?? `Bot ${this.botSeq + 1}`;
    const color = C.SURVIVOR_COLORS.find((c) => !taken.some((p) => p.color === c)) ?? pick(C.SURVIVOR_COLORS);
    const bot = {
      id: `bot-${++this.botSeq}`, name, color, skin: C.SURVIVOR_SKINS[this.botSeq % C.SURVIVOR_SKINS.length],
      isBot: true, ready: true, wantsMonster: false, mapVote: null, role: 'survivor',
    };
    this.players.set(bot.id, bot);
    this.evaluateStart();
    this.broadcastLobby();
  }

  removeBot(id, botId) {
    if (id !== this.hostId || this.phase !== 'lobby' || !this.players.get(botId)?.isBot) return;
    this.players.delete(botId);
    this.evaluateStart();
    this.broadcastLobby();
  }

  removePlayer(id, now) {
    if (!this.players.has(id)) return;
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.humans()[0]?.id ?? null;
    const m = this.monsterOf(id);
    if (this.phase === 'playing' && m) {
      // Monster player left: the AI takes over so the round can finish.
      m.controllerId = null;
      m.isAI = true;
      m.ai = createAIState();
    }
    if (this.phase === 'playing') this.checkWin(now);
    this.evaluateStart();
    this.broadcastLobby();
  }

  lobbyState() {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      countdownEnd: this.countdownEnd,
      players: [...this.players.values()].map(({ id, name, color, skin, ready, wantsMonster, mapVote, isBot }) => ({
        id, name, color, skin, ready, wantsMonster, mapVote, isBot: !!isBot,
      })),
    };
  }

  broadcastLobby() { this.io.to(this.code).emit('lobby', this.lobbyState()); }

  // A player-controlled monster needs someone else (a person or a bot) to hunt.
  minPlayers() { return this.settings.monsterMode === 'player' ? 2 : 1; }

  setReady(id, ready) {
    const p = this.players.get(id);
    if (!p || p.isBot || (this.phase !== 'lobby' && this.phase !== 'countdown')) return;
    p.ready = !!ready;
    this.evaluateStart();
    this.broadcastLobby();
  }

  setWantsMonster(id, wants) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'lobby') return;
    p.wantsMonster = !!wants;
    this.broadcastLobby();
  }

  setMapVote(id, choice) {
    const p = this.players.get(id);
    if (!p || p.isBot || this.phase !== 'lobby' || this.settings.mapPick !== 'vote') return;
    p.mapVote = MAP_CHOICES.includes(choice) && p.mapVote !== choice ? choice : null; // voting again takes it back
    this.broadcastLobby();
  }

  updateSettings(id, s = {}) {
    if (id !== this.hostId || this.phase !== 'lobby') return;
    if (['ai', 'player'].includes(s.monsterMode)) this.settings.monsterMode = s.monsterMode;
    if (C.MONSTER_TYPES.includes(s.monsterType)) this.settings.monsterType = s.monsterType;
    if (C.MONSTER_COUNTS.includes(s.monsterCount)) this.settings.monsterCount = s.monsterCount;
    if (typeof s.powers === 'boolean') this.settings.powers = s.powers;
    if (s.difficulty in C.DIFFICULTIES) this.settings.difficulty = s.difficulty;
    if (s.botSkill in C.BOT_SKILLS) this.settings.botSkill = s.botSkill;
    if (C.MAP_PICK_MODES.includes(s.mapPick)) this.settings.mapPick = s.mapPick;
    if (MAP_CHOICES.includes(s.mapId)) this.settings.mapId = s.mapId;
    this.evaluateStart();
    this.broadcastLobby();
  }

  // Everyone ready and enough players? Start the countdown. Someone un-readies? Cancel it.
  evaluateStart() {
    const allReady = this.players.size >= this.minPlayers() && this.humans().every((p) => p.ready);
    if (this.phase === 'lobby' && allReady) {
      this.phase = 'countdown';
      this.countdownEnd = Date.now() + C.START_COUNTDOWN_MS;
    } else if (this.phase === 'countdown' && !allReady) {
      this.phase = 'lobby';
      this.countdownEnd = 0;
    }
  }

  // Bots are always ready; people ready up again for each round.
  unreadyHumans() {
    for (const p of this.players.values()) p.ready = !!p.isBot;
  }

  returnToLobby() {
    if (this.phase !== 'results') return;
    this.phase = 'lobby';
    this.resetRoundState();
    this.unreadyHumans();
    for (const p of this.players.values()) p.mapVote = null; // a fresh vote every round
    this.broadcastLobby();
  }

  // ---------- round setup ----------

  // In vote mode the most-voted map wins (ties are broken at random); with no votes,
  // the host's pick stands. "Random" rolls one of the real maps.
  resolveMapId() {
    let choice = this.settings.mapId;
    if (this.settings.mapPick === 'vote') {
      const tally = {};
      for (const p of this.players.values()) if (p.mapVote) tally[p.mapVote] = (tally[p.mapVote] ?? 0) + 1;
      const top = Math.max(0, ...Object.values(tally));
      if (top > 0) choice = pick(Object.keys(tally).filter((k) => tally[k] === top));
    }
    return choice === C.RANDOM_MAP ? pick(MAP_IDS) : choice;
  }

  // The first monster starts on the map's M tile; extras start a few steps away from it.
  monsterSpawns(count) {
    const origin = this.map.monsterSpawn;
    const spawns = [origin];
    const W = this.map.width;
    const start = Math.floor(origin.y / C.TILE) * W + Math.floor(origin.x / C.TILE);
    const depth = new Map([[start, 0]]);
    const queue = [start];
    for (let i = 0; i < queue.length && spawns.length < count; i++) {
      const cur = queue[i];
      const tx = cur % W;
      const ty = Math.floor(cur / W);
      if (depth.get(cur) >= 3 * spawns.length) {
        spawns.push({ x: tx * C.TILE + C.TILE / 2, y: ty * C.TILE + C.TILE / 2 });
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (ty + dy) * W + tx + dx;
        if (isSolidTile(this.map, tx + dx, ty + dy) || depth.has(k)) continue;
        depth.set(k, depth.get(cur) + 1);
        queue.push(k);
      }
    }
    return spawns;
  }

  startRound(now) {
    this.resetRoundState();
    this.phase = 'playing';
    this.useMap(this.resolveMapId());
    const players = [...this.players.values()];
    const { monsterCount, monsterType } = this.settings;

    // Volunteers first, then anyone else, but always leave someone to hunt. Empty monster slots go to the AI.
    let monsterPlayers = [];
    if (this.settings.monsterMode === 'player') {
      const humans = shuffle(this.humans());
      const ordered = [...humans.filter((p) => p.wantsMonster), ...humans.filter((p) => !p.wantsMonster)];
      monsterPlayers = ordered.slice(0, Math.min(monsterCount, players.length - 1));
    }

    let spawnIndex = 0;
    for (const p of players) {
      p.role = monsterPlayers.includes(p) ? 'monster' : 'survivor';
      const spawn = this.map.survivorSpawns[spawnIndex++ % this.map.survivorSpawns.length];
      Object.assign(p, {
        x: spawn.x, y: spawn.y, facing: 0,
        input: { up: false, down: false, left: false, right: false, sprint: false },
        stamina: C.STAMINA_MAX, sprinting: false,
        alive: p.role === 'survivor', caughtAt: null, coins: 0,
        trapped: false, escaped: false, escapedAt: null, rescueProgress: 0, safeUntil: 0, timesCaught: 0, rescues: 0,
        hiddenSpot: null, spottedHiding: false, hideUntil: 0, hideCooldownUntil: 0, lastNoiseAt: 0,
      });
      if (p.isBot) resetBot(p);
    }

    // The host's pick leads; extra monsters are the other characters, so each one looks different.
    const types = [monsterType, ...C.MONSTER_TYPES.filter((t) => t !== monsterType)];
    this.monsters = this.monsterSpawns(monsterCount).map((spawn, i) => {
      const player = monsterPlayers[i];
      const type = types[i % types.length];
      return {
        id: i,
        controllerId: player?.id ?? null,
        isAI: !player,
        name: player?.name ?? C.MONSTER_NAMES[type],
        type,
        x: spawn.x, y: spawn.y, facing: 0,
        input: { up: false, down: false, left: false, right: false },
        moveX: 0, moveY: 0,
        catches: 0,
        cooldowns: { lightsOn: now + C.INTRO_MS + C.POWER_START_DELAY, blackout: now + C.INTRO_MS + C.POWER_START_DELAY },
        searchReadyAt: 0,
        ai: createAIState(),
      };
    });

    this.spawnCoins(C.coinsFor(this.survivors().length, this.settings.difficulty));
    // Nobody moves while the intro card is up; the clock starts after it.
    this.frozenUntil = now + C.INTRO_MS;
    this.startedAt = this.frozenUntil;
    this.endsAt = this.frozenUntil + this.difficulty().roundLength * 1000;

    const monsters = this.monsters.map(({ id, name, type, isAI, controllerId }) => ({ id, name, type, isAI, controllerId }));
    for (const p of this.humans()) {
      this.io.to(p.id).emit('roundStart', {
        role: p.role, mapId: this.map.id, endsAt: this.endsAt, powers: this.settings.powers,
        difficulty: this.settings.difficulty, coinsTotal: this.coinsTotal, monsters, survivorCount: this.survivors().length,
      });
    }
    this.broadcastLobby();
  }

  spawnCoins(count) {
    const avoid = [...this.map.survivorSpawns, ...this.monsters, this.map.exitApproach];
    const candidates = this.map.floorTiles.filter((t) => avoid.every((a) => dist(t, a) > C.TILE * 3));
    this.coins = shuffle(candidates).slice(0, count).map((t, id) => ({ id, x: t.x, y: t.y }));
    this.coinsTotal = this.coins.length;
  }

  difficulty() { return C.DIFFICULTIES[this.settings.difficulty]; }

  // The exit unlocks once every coin has been collected.
  get exitOpen() { return this.phase === 'playing' && this.coins.length === 0; }

  survivors() { return [...this.players.values()].filter((p) => p.role === 'survivor'); }

  monsterOf(id) { return this.monsters.find((m) => m.controllerId === id) ?? null; }

  // ---------- player commands ----------

  handleInput(id, input = {}) {
    if (this.phase !== 'playing') return;
    const clean = {
      up: !!input.up, down: !!input.down, left: !!input.left, right: !!input.right, sprint: !!input.sprint,
    };
    const m = this.monsterOf(id);
    if (m) m.input = clean;
    else if (this.players.has(id)) this.players.get(id).input = clean;
  }

  handleAction(id, type, now) {
    if (this.phase !== 'playing' || now < this.frozenUntil) return;
    const m = this.monsterOf(id);
    if (m) {
      if (type === 'interact') this.monsterSearch(m, now);
      else if (type === 'lightsOn' || type === 'blackout') this.usePower(m, type, now);
      return;
    }
    const p = this.players.get(id);
    if (p && p.role === 'survivor' && type === 'interact') this.toggleHide(p, now);
  }

  nearestSpot(pos, radius, filter = () => true) {
    let best = null;
    let bestD = radius;
    for (const spot of this.map.hidingSpots) {
      const d = dist(pos, spot);
      if (d <= bestD && filter(spot)) { best = spot; bestD = d; }
    }
    return best;
  }

  spotOccupant(spotId) {
    return this.survivors().find((p) => p.alive && p.hiddenSpot === spotId) ?? null;
  }

  toggleHide(p, now) {
    if (!p.alive) return;
    if (p.hiddenSpot !== null) { this.unhide(p, now); return; }
    if (now < p.hideCooldownUntil) return;
    const spot = this.nearestSpot(p, C.INTERACT_RADIUS, (s) => !this.spotOccupant(s.id));
    if (!spot) return;
    p.spottedHiding = this.monsters.some((m) => this.monsterSees(m, p));
    p.hiddenSpot = spot.id;
    p.prevX = p.x;
    p.prevY = p.y;
    p.x = spot.x;
    p.y = spot.y;
    p.hideUntil = now + this.rules.hideLimitMs;
  }

  // Did this monster watch the survivor dive in? Only if they were within a couple of
  // tiles, in front of it (not behind its back) and not around a corner.
  monsterSees(m, p) {
    if (dist(p, m) > C.HIDE_SPOTTED_RANGE) return false;
    const angle = Math.atan2(p.y - m.y, p.x - m.x) - m.facing;
    const inFront = Math.cos(angle) >= 0;
    return inFront && hasLineOfSight(this.map, m.x, m.y, p.x, p.y);
  }

  unhide(p, now) {
    p.x = p.prevX;
    p.y = p.prevY;
    p.hiddenSpot = null;
    p.spottedHiding = false;
    p.hideCooldownUntil = now + C.HIDE_COOLDOWN_MS;
  }

  // A monster opens a wardrobe. Someone inside is caught only if a monster saw them
  // dive in; otherwise it looks empty.
  monsterSearch(m, now) {
    if (now < m.searchReadyAt) return;
    const spot = this.nearestSpot(m, C.INTERACT_RADIUS + 8);
    if (!spot) return;
    m.searchReadyAt = now + C.SEARCH_COOLDOWN_MS;
    const occupant = this.spotOccupant(spot.id);
    const found = !!occupant?.spottedHiding;
    if (found) this.catchSurvivor(occupant, m, now);
    this.io.to(this.code).emit('search', { spotId: spot.id, found });
  }

  // Each monster has its own cooldowns; the effects are house-wide. The host can switch powers off.
  usePower(m, name, now) {
    const power = C.POWERS[name];
    if (!this.settings.powers || !power || now < m.cooldowns[name]) return false;
    if (name === 'lightsOn') {
      this.lightsOnUntil = now + power.duration;
    } else if (name === 'blackout') {
      this.blackoutStart = now + power.warning;
      this.blackoutUntil = this.blackoutStart + power.duration;
    }
    m.cooldowns[name] = now + power.cooldown;
    this.io.to(this.code).emit('power', { name });
    return true;
  }

  makeNoise(x, y, now) {
    const jx = (Math.random() * 2 - 1) * C.NOISE_JITTER;
    const jy = (Math.random() * 2 - 1) * C.NOISE_JITTER;
    this.lastNoise = { x: x + jx, y: y + jy, at: now };
    for (const m of this.monsters) {
      if (m.controllerId) this.io.to(m.controllerId).emit('noise', { x: x + jx, y: y + jy });
    }
  }

  // A caught survivor is trapped on the spot until a friend frees them.
  catchSurvivor(p, m, now) {
    if (!p.alive) return;
    if (p.hiddenSpot !== null) { p.x = p.prevX; p.y = p.prevY; } // dragged out of the hiding spot
    p.alive = false;
    p.trapped = true;
    p.caughtAt = now;
    p.timesCaught++;
    p.rescueProgress = 0;
    p.hiddenSpot = null;
    p.spottedHiding = false;
    m.catches++;
    this.io.to(this.code).emit('caught', { id: p.id, name: p.name, by: m.name });
  }

  // Friends standing next to a trapped survivor fill their rescue meter; it drains when they leave.
  updateRescues(dt, now) {
    const free = this.survivors().filter((p) => p.alive && p.hiddenSpot === null);
    for (const t of this.survivors()) {
      if (!t.trapped) continue;
      const helper = free.find((p) => dist(p, t) <= C.RESCUE_RADIUS);
      t.rescueProgress = helper
        ? t.rescueProgress + dt * 1000
        : Math.max(0, t.rescueProgress - dt * 1000 * C.RESCUE_DECAY);
      if (helper && t.rescueProgress >= this.difficulty().rescueMs) {
        t.trapped = false;
        t.alive = true;
        t.rescueProgress = 0;
        t.safeUntil = now + C.RESCUE_GRACE_MS;
        helper.rescues++;
        this.io.to(this.code).emit('rescued', { id: t.id, name: t.name, by: helper.name });
      }
    }
  }

  escape(p, now) {
    p.alive = false;
    p.escaped = true;
    p.escapedAt = now;
    this.io.to(this.code).emit('escaped', { id: p.id, name: p.name });
  }

  // ---------- the game loop ----------

  update(dt, now) {
    if (this.phase === 'countdown' && now >= this.countdownEnd) this.startRound(now);
    if (this.phase !== 'playing') return;
    if (now < this.frozenUntil) { this.broadcastState(now); return; }

    for (const p of this.survivors()) if (p.isBot) botTick(this, p, now);

    for (const p of this.survivors()) {
      if (!p.alive) continue;
      if (p.hiddenSpot !== null) {
        if (now >= p.hideUntil) this.unhide(p, now); // hiding has a time limit
        p.stamina = Math.min(C.STAMINA_MAX, p.stamina + C.STAMINA_REGEN * dt);
        continue;
      }
      this.moveSurvivor(p, dt, now);
      for (let i = this.coins.length - 1; i >= 0; i--) {
        if (dist(p, this.coins[i]) < C.COIN_PICKUP_RADIUS) {
          this.coins.splice(i, 1);
          p.coins++;
          if (this.coins.length === 0) this.io.to(this.code).emit('exitOpen', { by: p.name });
        }
      }
      if (this.exitOpen && dist(p, this.map.exit) < C.ESCAPE_RADIUS) this.escape(p, now);
    }

    for (const m of this.monsters) {
      this.moveMonster(m, dt, now);
      for (const p of this.survivors()) {
        if (p.alive && p.hiddenSpot === null && now >= p.safeUntil && dist(p, m) < C.CATCH_RADIUS) this.catchSurvivor(p, m, now);
      }
    }
    this.updateRescues(dt, now);

    this.checkWin(now);
    if (this.phase === 'playing') this.broadcastState(now);
  }

  moveSurvivor(p, dt, now) {
    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      p.facing = Math.atan2(dy, dx);
    }
    const canSprint = p.sprinting ? p.stamina > 0 : p.stamina >= C.STAMINA_MIN_TO_SPRINT;
    p.sprinting = moving && p.input.sprint && canSprint;
    p.stamina = p.sprinting
      ? Math.max(0, p.stamina - C.STAMINA_DRAIN * dt)
      : Math.min(C.STAMINA_MAX, p.stamina + C.STAMINA_REGEN * dt);
    const speed = p.sprinting ? C.SPRINT_SPEED : C.WALK_SPEED;
    if (moving) moveCircle(this.map, p, dx * speed * dt, dy * speed * dt, C.PLAYER_RADIUS);

    // Sprinting is loud: the monsters get an approximate location.
    if (p.sprinting && now - p.lastNoiseAt >= C.NOISE_INTERVAL_MS) {
      p.lastNoiseAt = now;
      this.makeNoise(p.x, p.y, now);
    }
  }

  moveMonster(m, dt, now) {
    let dx;
    let dy;
    let speed;
    if (m.isAI) {
      updateAI(this, m, dt, now);
      dx = m.moveX;
      dy = m.moveY;
      speed = this.rules.aiMonsterSpeed;
    } else {
      dx = (m.input.right ? 1 : 0) - (m.input.left ? 1 : 0);
      dy = (m.input.down ? 1 : 0) - (m.input.up ? 1 : 0);
      speed = this.rules.monsterSpeed;
    }
    if (m.type === 'ghost') speed *= C.GHOST_SPEED_FACTOR;
    if (m.type === this.rules.homeMonster) speed *= C.HOME_SPEED_BONUS;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
      m.facing = Math.atan2(dy, dx);
      moveCircle(this.map, m, dx * speed * dt, dy * speed * dt, C.MONSTER_RADIUS, m.type === 'ghost');
    }
  }

  // The round ends when nobody is left free (everyone escaped or is trapped) or time runs out.
  // Survivors win if anyone got out.
  checkWin(now) {
    if (this.phase !== 'playing') return;
    const survivors = this.survivors();
    const winner = survivors.some((p) => p.escaped) ? 'survivors' : 'monster';
    if (survivors.every((p) => !p.alive) || now >= this.endsAt) this.endRound(winner, now);
  }

  endRound(winner, now) {
    this.phase = 'results';
    const endedAt = Math.min(now, this.endsAt);
    this.results = {
      winner,
      difficulty: this.settings.difficulty,
      mapId: this.map.id,
      coinsTotal: this.coinsTotal,
      coinsLeft: this.coins.length,
      monsters: this.monsters.map((m) => ({ name: m.name, type: m.type, isAI: m.isAI, catches: m.catches })),
      survivors: this.survivors()
        .map((p) => ({
          id: p.id, name: p.name, color: p.color, skin: p.skin, coins: p.coins, isBot: !!p.isBot,
          status: p.escaped ? 'escaped' : p.trapped ? 'caught' : 'left',
          rescues: p.rescues, timesCaught: p.timesCaught,
          time: Math.round(((p.escapedAt ?? (p.trapped ? p.caughtAt : endedAt)) - this.startedAt) / 1000),
        }))
        // Most coins first; ties go to whoever escaped, then whoever was left free, then the caught.
        .sort((a, b) => b.coins - a.coins || STATUS_RANK[a.status] - STATUS_RANK[b.status]),
    };
    this.unreadyHumans();
    this.io.to(this.code).emit('results', this.results);
    this.broadcastLobby();
  }

  // Each player gets their own view. Monsters are only told about survivors
  // one of them could actually see, so a modified client can't reveal everyone.
  broadcastState(now) {
    const lightsOn = now < this.lightsOnUntil;
    const survivors = this.survivors();
    const base = {
      t: now,
      endsAt: this.endsAt,
      lightsOnUntil: this.lightsOnUntil,
      blackoutStart: this.blackoutStart,
      blackoutUntil: this.blackoutUntil,
      frozenUntil: this.frozenUntil,
      coins: this.coins,
      coinsTotal: this.coinsTotal,
      exitOpen: this.exitOpen,
      rescueMs: this.difficulty().rescueMs,
      roster: survivors.map((p) => ({
        id: p.id, name: p.name, color: p.color, skin: p.skin, coins: p.coins, isBot: !!p.isBot,
        status: p.escaped ? 'escaped' : p.trapped ? 'trapped' : 'free',
      })),
      monsters: this.monsters.map((m) => ({ id: m.id, x: m.x, y: m.y, facing: m.facing, type: m.type, isAI: m.isAI, name: m.name, catches: m.catches })),
    };
    const near = (p) => this.monsters.some((m) => dist(p, m) <= C.MONSTER_LIGHT + 40);
    const view = (p) => ({
      id: p.id, x: p.x, y: p.y, facing: p.facing, color: p.color, skin: p.skin, name: p.name,
      hidden: p.hiddenSpot !== null, trapped: p.trapped, rescue: p.rescueProgress, safe: now < p.safeUntil,
    });

    for (const viewer of this.humans()) {
      const mine = this.monsterOf(viewer.id);
      let visible;
      if (mine) {
        // Monsters always know where their trapped catches are.
        visible = survivors
          .filter((p) => p.trapped || (p.alive && (p.hiddenSpot !== null ? p.spottedHiding : lightsOn || near(p))))
          .map(view);
      } else {
        visible = survivors.filter((p) => p.alive || p.trapped).map(view);
      }
      const state = { ...base, survivors: visible };
      if (mine) {
        state.self = { role: 'monster', monsterId: mine.id, x: mine.x, y: mine.y, cooldowns: mine.cooldowns, searchReadyAt: mine.searchReadyAt, catches: mine.catches };
      } else {
        state.self = {
          role: 'survivor', x: viewer.x, y: viewer.y, alive: viewer.alive, coins: viewer.coins,
          trapped: viewer.trapped, escaped: viewer.escaped, rescue: viewer.rescueProgress,
          stamina: viewer.stamina, hiddenSpot: viewer.hiddenSpot, hideUntil: viewer.hideUntil,
          hideCooldownUntil: viewer.hideCooldownUntil, spotted: viewer.spottedHiding,
        };
      }
      this.io.to(viewer.id).emit('state', state);
    }
  }
}
