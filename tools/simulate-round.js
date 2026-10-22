// Runs rounds on the server's Room class with a fake clock (no network, no browser).
// Usage: node tools/simulate-round.js
import assert from 'node:assert/strict';
import { Room } from '../server/src/room.js';
import { MAPS, isSolidTile } from '../shared/map.js';
import * as C from '../shared/constants.js';

const events = [];
const fakeIo = { to: () => ({ emit: (name, data) => events.push({ name, data }) }) };
const fakeSocket = (id) => ({ id, join() {}, leave() {} });

function makeRoom(names) {
  const room = new Room('TEST', fakeIo);
  for (const n of names) room.addPlayer(fakeSocket(n), { name: n, color: C.SURVIVOR_COLORS[0] });
  return room;
}

// Starts a round at `t` and returns the moment the intro ends and play begins.
function begin(room, t) {
  room.startRound(t);
  return room.frozenUntil;
}

function run(room, seconds, start, perTick) {
  const step = 1 / C.TICK_RATE;
  let now = start;
  for (let i = 0; i < seconds * C.TICK_RATE && room.phase === 'playing'; i++) {
    now += step * 1000;
    perTick?.(now);
    room.update(step, now);
  }
  return now;
}

// 1. AI monster hunts down a survivor who just stands in the corridor.
{
  const room = makeRoom(['alice']);
  const t0 = begin(room, 1_000_000);
  assert.equal(room.monsters[0].isAI, true);
  assert.equal(room.coins.length, C.coinsFor(1, 'normal'));
  run(room, 180, t0);
  assert.equal(room.phase, 'results', 'round should end');
  assert.equal(room.results.winner, 'monster', 'AI should find a standing survivor');
  console.log(`ok - AI caught an idle survivor after ${room.results.survivors[0].time}s`);
}

// 2. Survivor walks over coins and the server counts them.
{
  const room = makeRoom(['bob']);
  const t0 = begin(room, 2_000_000);
  const p = room.players.get('bob');
  room.coins = [{ id: 0, x: p.x - 64, y: p.y }];
  room.handleInput('bob', { left: true });
  run(room, 1, t0);
  assert.equal(p.coins, 1, 'coin should be picked up');
  assert.equal(room.coins.length, 0);
  console.log('ok - coin pickup');
}

// 3. Hiding: limited duration, search catches the hider, Lights On respects cooldown.
{
  const room = makeRoom(['cara', 'dan']);
  room.updateSettings('cara', { monsterMode: 'player' });
  room.setWantsMonster('dan', true);
  const t0 = begin(room, 3_000_000);
  assert.equal(room.monsters[0].controllerId, 'dan', 'volunteer becomes the monster');
  const p = room.players.get('cara');
  const spot = MAPS.mansion.hidingSpots.find((s) => s.ty === 10); // corridor wardrobe
  p.x = spot.x + 32; p.y = spot.y;
  room.handleAction('cara', 'interact', t0);
  assert.equal(p.hiddenSpot, spot.id, 'survivor hides');
  run(room, (C.MAP_RULES.mansion.hideLimitMs + 200) / 1000, t0);
  assert.equal(p.hiddenSpot, null, 'forced out after the time limit');
  room.handleAction('cara', 'interact', t0 + C.MAP_RULES.mansion.hideLimitMs + 300);
  assert.equal(p.hiddenSpot, null, 'cannot re-hide during cooldown');

  // Hiding while the monster is far away: safe even when it opens the spot.
  const t1 = t0 + C.MAP_RULES.mansion.hideLimitMs + C.HIDE_COOLDOWN_MS + 500;
  room.handleAction('cara', 'interact', t1);
  assert.equal(p.hiddenSpot, spot.id, 'can hide again after cooldown');
  assert.equal(p.spottedHiding, false);
  assert.equal(room.usePower(room.monsters[0], 'lightsOn', t0 + 1000), false, 'powers locked at round start');
  assert.equal(room.usePower(room.monsters[0], 'lightsOn', t1), true);
  assert.equal(room.usePower(room.monsters[0], 'lightsOn', t1 + 1000), false, 'cooldown enforced');
  room.monsters[0].x = spot.x + 32; room.monsters[0].y = spot.y;
  room.handleAction('dan', 'interact', t1 + 100);
  assert.equal(p.alive, true, 'an unseen hider is safe when the spot is searched');
  assert.equal(events.at(-1).data.found, false);

  // Diving in right in front of the monster: it opens the spot and catches them.
  const t2 = t1 + 200;
  room.handleAction('cara', 'interact', t2); // leave
  const t3 = t2 + C.HIDE_COOLDOWN_MS + 100;
  room.monsters[0].x = p.x + 48; room.monsters[0].y = p.y; room.monsters[0].facing = Math.PI; // facing her
  room.handleAction('cara', 'interact', t3);
  assert.equal(p.spottedHiding, true, 'seen diving in from 1.5 tiles away');
  room.monsters[0].x = spot.x + 40;
  room.handleAction('dan', 'interact', t3 + 100);
  assert.equal(p.alive, false, 'monster finds the hider it saw');
  room.update(0.05, t3 + 150);
  assert.equal(room.results.winner, 'monster');
  console.log('ok - hiding limit, cooldown, safe hiding, search and powers');
}

// 3b. Hiding right next to the monster but behind its back is still safe.
{
  const room = makeRoom(['ola', 'pip']);
  room.updateSettings('ola', { monsterMode: 'player' });
  room.setWantsMonster('pip', true);
  const t0 = begin(room, 3_500_000);
  const p = room.players.get('ola');
  const spot = MAPS.mansion.hidingSpots.find((s) => s.ty === 10);
  p.x = spot.x + 32; p.y = spot.y;
  room.monsters[0].x = p.x + 40; room.monsters[0].y = p.y; room.monsters[0].facing = 0; // looking away
  room.handleAction('ola', 'interact', t0);
  assert.equal(p.spottedHiding, false);
  room.monsters[0].x = spot.x + 40;
  room.handleAction('pip', 'interact', t0 + 100);
  assert.equal(p.alive, true);
  console.log('ok - hiding behind the monster\'s back is safe');
}

// 4. Hiding out isn't enough: if nobody escapes before time runs out, the monster wins.
{
  const room = makeRoom(['eve', 'finn']);
  room.updateSettings('eve', { monsterMode: 'player' });
  room.setWantsMonster('finn', true);
  const t0 = begin(room, 4_000_000);
  run(room, 200, t0);
  assert.equal(room.results.winner, 'monster');
  assert.equal(room.results.survivors[0].status, 'left', 'still free, but never got out');
  room.returnToLobby();
  assert.equal(room.phase, 'lobby');
  console.log('ok - nobody escaped in time: monster wins, back to lobby');
}

// 5. AI keeps moving and doesn't get stuck over many random rounds.
{
  let catches = 0;
  for (let r = 0; r < 20; r++) {
    const room = makeRoom(['a', 'b', 'c']);
    const t0 = begin(room, 5_000_000 + r * 1_000_000);
    // Survivors wander randomly so the AI has moving targets.
    run(room, 180, t0, (now) => {
      if (Math.floor(now / 1500) % 1 === 0 && Math.random() < 0.05) {
        for (const id of ['a', 'b', 'c']) {
          room.handleInput(id, { up: Math.random() < 0.5, down: Math.random() < 0.5, left: Math.random() < 0.5, right: Math.random() < 0.5, sprint: Math.random() < 0.3 });
        }
      }
    });
    catches += room.results.monsters[0].catches;
  }
  console.log(`ok - 20 AI rounds vs 3 random-walking survivors: ${catches}/60 caught`);
}

// 6. Forest map: host picks it, everyone spawns there, hiding is shorter.
{
  const room = makeRoom(['gus']);
  room.updateSettings('gus', { mapId: 'forest' });
  room.updateSettings('gus', { mapId: 'swamp' }); // unknown maps are ignored
  const t0 = begin(room, 30_000_000);
  assert.equal(room.map, MAPS.forest);
  const p = room.players.get('gus');
  assert.ok(MAPS.forest.survivorSpawns.some((s) => s.x === p.x && s.y === p.y), 'spawns in the forest');
  assert.ok(room.rules.hideLimitMs < C.MAP_RULES.mansion.hideLimitMs, 'forest hiding is shorter');
  assert.equal(events.filter((e) => e.name === 'roundStart').at(-1).data.mapId, 'forest');
  run(room, 180, t0);
  assert.equal(room.results.mapId, 'forest');
  console.log(`ok - forest round (idle survivor caught after ${room.results.survivors[0].time}s)`);
}

// 7. The ghost floats through furniture but not walls; other monsters can't.
{
  const row = 3; // '#.TT....TT...#' - furniture at x=2,3 and 8,9, wall at x=13
  assert.equal(isSolidTile(MAPS.mansion, 2, row), true);
  for (const type of ['ghost', 'clown']) {
    const room = makeRoom(['hal', 'ivy']);
    room.updateSettings('hal', { monsterMode: 'player', monsterType: type });
    room.setWantsMonster('ivy', true);
    const t0 = begin(room, 31_000_000);
    const m = room.monsters[0];
    m.x = 1.5 * C.TILE; m.y = (row + 0.5) * C.TILE;
    room.handleInput('ivy', { right: true });
    run(room, 3, t0);
    if (type === 'ghost') {
      assert.ok(m.x > 10 * C.TILE, 'ghost passes through furniture');
      assert.ok(m.x <= 13 * C.TILE - C.MONSTER_RADIUS, 'ghost still stopped by the wall');
    } else {
      assert.ok(m.x < 2 * C.TILE, 'clown is blocked by furniture');
    }
  }
  console.log('ok - ghost floats through furniture, not walls');
}

// 8. Skins are kept per player; scoreboard puts the top coin collector first.
{
  const room = new Room('SKIN', fakeIo);
  room.addPlayer(fakeSocket('jo'), { name: 'jo', color: C.SURVIVOR_COLORS[0], skin: 'bat' });
  room.addPlayer(fakeSocket('kim'), { name: 'kim', color: C.SURVIVOR_COLORS[1], skin: 'pumpkin' });
  room.addPlayer(fakeSocket('lu'), { name: 'lu', color: C.SURVIVOR_COLORS[2], skin: 'cat' });
  assert.deepEqual(room.lobbyState().players.map((p) => p.skin), ['bat', 'pumpkin', 'cat']);
  const t0 = begin(room, 32_000_000);
  const [jo, kim, lu] = ['jo', 'kim', 'lu'].map((id) => room.players.get(id));
  jo.coins = 3; kim.coins = 7; lu.coins = 7;
  room.catchSurvivor(lu, room.monsters[0], t0 + 1000); // tie on coins: the survivor ranks above the caught player
  room.endRound('survivors', t0 + 5000);
  assert.deepEqual(room.results.survivors.map((p) => [p.name, p.coins, p.skin]), [['kim', 7, 'pumpkin'], ['lu', 7, 'cat'], ['jo', 3, 'bat']]);
  console.log('ok - skins and coin scoreboard order');
}

// 9. Both maps (and the ghost) play full AI rounds without errors. For real difficulty numbers, run tools/balance.js.
{
  const stats = {};
  for (const mapId of ['mansion', 'forest']) {
    let total = 0;
    let catches = 0;
    for (let r = 0; r < 15; r++) {
      const room = makeRoom(['a', 'b', 'c']);
      room.updateSettings('a', { mapId, monsterType: r % 3 === 0 ? 'ghost' : 'clown' });
      const t0 = begin(room, 40_000_000 + r * 1_000_000);
      run(room, 180, t0, () => {
        if (Math.random() < 0.05) {
          for (const id of ['a', 'b', 'c']) {
            room.handleInput(id, { up: Math.random() < 0.5, down: Math.random() < 0.5, left: Math.random() < 0.5, right: Math.random() < 0.5, sprint: Math.random() < 0.3 });
          }
        }
      });
      catches += room.results.monsters[0].catches;
      total += room.results.survivors.reduce((sum, p) => sum + p.time, 0);
    }
    stats[mapId] = { catches, avgSurvival: Math.round(total / 45) };
  }
  console.log(`ok - average survival: mansion ${stats.mansion.avgSurvival}s, forest ${stats.forest.avgSurvival}s (caught ${stats.mansion.catches}/45 vs ${stats.forest.catches}/45)`);
}

// 10. Bots: the host adds them, they're always ready, and they play as survivors against a player monster.
{
  const room = makeRoom(['host']);
  room.addBot('host');
  room.addBot('host');
  room.addBot('nobody'); // only the host can add bots
  const bots = [...room.players.values()].filter((p) => p.isBot);
  assert.equal(bots.length, 2);
  assert.ok(bots.every((b) => b.ready), 'bots are always ready');
  room.removeBot('host', bots[1].id);
  assert.equal(room.players.size, 2);
  room.updateSettings('host', { monsterMode: 'player' });
  const t0 = begin(room, 50_000_000);
  assert.equal(room.monsters[0].controllerId, 'host', 'with only bots to hunt, the person is the monster');
  const bot = room.players.get(bots[0].id);
  const start = { x: bot.x, y: bot.y };
  run(room, 5, t0);
  assert.ok(Math.hypot(bot.x - start.x, bot.y - start.y) > 32, 'bot moves on its own');
  room.removePlayer('host', t0);
  assert.equal(room.isEmpty, true, 'a room with only bots left counts as empty');
  console.log('ok - bots join, play as survivors and leave with the room');
}

// 11. Several monsters: AI fills the slots no person takes, each catch is credited, all spawn apart.
{
  const room = makeRoom(['rex', 'sam']);
  room.addBot('rex');
  room.updateSettings('rex', { monsterMode: 'player', monsterCount: 3, monsterType: 'witch' });
  room.setWantsMonster('sam', true);
  const t0 = begin(room, 51_000_000);
  assert.equal(room.monsters.length, 3);
  assert.deepEqual(room.monsters.map((m) => m.type), ['witch', 'clown', 'ghost'], 'each extra monster is a different character');
  const people = room.monsters.filter((m) => !m.isAI).map((m) => m.controllerId).sort();
  assert.deepEqual(people, ['rex', 'sam'], 'both people are monsters, the bot is left to hunt');
  assert.equal(room.monsters[2].isAI, true);
  const spots = new Set(room.monsters.map((m) => `${m.x},${m.y}`));
  assert.equal(spots.size, 3, 'monsters spawn in different places');
  const bot = room.survivors()[0];
  assert.equal(bot.isBot, true);
  const m2 = room.monsters[2];
  m2.x = bot.x; m2.y = bot.y;
  room.update(0.05, t0 + 50);
  assert.equal(room.results.winner, 'monster');
  assert.equal(room.results.monsters[2].catches, 1, 'the catch goes to the monster that made it');
  console.log('ok - three monsters (two people + AI) share the hunt');
}

// 12. Powers off: nobody can use Lights On or Blackout.
{
  const room = makeRoom(['tia']);
  room.updateSettings('tia', { powers: false });
  const t0 = begin(room, 52_000_000);
  const later = t0 + C.POWER_START_DELAY + 1000;
  assert.equal(room.usePower(room.monsters[0], 'lightsOn', later), false);
  assert.equal(room.usePower(room.monsters[0], 'blackout', later), false);
  assert.equal(events.filter((e) => e.name === 'roundStart').at(-1).data.powers, false);
  run(room, 60, t0);
  assert.equal(room.lightsOnUntil, 0, 'AI never switched the lights on');
  console.log('ok - monster powers can be switched off');
}

// 13. Map voting: most votes wins, voting again takes it back, the host's pick breaks a no-vote tie.
{
  const room = makeRoom(['uma', 'vic', 'wes']);
  room.setMapVote('uma', 'forest');
  assert.equal(room.players.get('uma').mapVote, null, 'no voting while the host picks');
  room.updateSettings('uma', { mapPick: 'vote', mapId: 'mansion' });
  room.setMapVote('uma', 'forest');
  room.setMapVote('vic', 'forest');
  room.setMapVote('wes', 'mansion');
  room.setMapVote('wes', 'swamp'); // unknown maps are ignored (and clear the vote)
  assert.equal(room.players.get('wes').mapVote, null);
  room.setMapVote('wes', 'mansion');
  assert.equal(room.resolveMapId(), 'forest');
  room.setMapVote('uma', 'forest'); // voting again takes it back: now 1-1
  const picks = new Set(Array.from({ length: 40 }, () => room.resolveMapId()));
  assert.deepEqual([...picks].sort(), ['forest', 'mansion'], 'ties are broken at random');
  room.updateSettings('uma', { mapPick: 'host', mapId: C.RANDOM_MAP });
  const rolled = new Set(Array.from({ length: 40 }, () => room.resolveMapId()));
  assert.ok(rolled.has('forest') && rolled.has('mansion'), 'random rolls a real map');
  console.log('ok - map voting and random map');
}

// 14. The intro freezes everyone, then the clock starts.
{
  const room = makeRoom(['xan']);
  room.startRound(60_000_000);
  const p = room.players.get('xan');
  const start = { x: p.x, y: p.y };
  room.handleInput('xan', { left: true });
  run(room, (C.INTRO_MS - 500) / 1000, 60_000_000);
  assert.deepEqual({ x: p.x, y: p.y }, start, 'frozen during the intro');
  assert.equal(room.endsAt - room.frozenUntil, C.DIFFICULTIES.normal.roundLength * 1000, 'the timer starts after the intro');
  run(room, 1, room.frozenUntil);
  assert.notEqual(p.x, start.x, 'moves once the intro ends (input held during it counts)');
  console.log('ok - intro freeze');
}

// 15. Coins scale with survivors; collecting them all opens the exit, walking out escapes and wins.
{
  assert.ok(C.coinsFor(4) > C.coinsFor(2) && C.coinsFor(2) > C.coinsFor(1), 'more survivors, more coins');
  assert.ok(C.coinsFor(3, 'hard') > C.coinsFor(3, 'easy'));
  const room = makeRoom(['yul', 'zed']);
  const t0 = begin(room, 61_000_000);
  assert.equal(room.coinsTotal, C.coinsFor(2));
  const [yul, zed] = ['yul', 'zed'].map((id) => room.players.get(id));
  room.monsters[0].x = MAPS.mansion.monsterSpawn.x; // keep the AI out of the way
  room.monsters[0].isAI = false;
  assert.equal(room.exitOpen, false);
  room.coins = [{ id: 0, x: yul.x - 40, y: yul.y }];
  room.handleInput('yul', { left: true });
  let now = run(room, 1, t0);
  assert.equal(room.exitOpen, true, 'last coin unlocks the exit');
  assert.ok(events.some((e) => e.name === 'exitOpen'));
  const exit = MAPS.mansion.exitApproach;
  yul.x = exit.x; yul.y = exit.y;
  room.handleInput('yul', {});
  now = run(room, 0.1, now);
  assert.equal(yul.escaped, true, 'standing at the open door gets you out');
  assert.equal(room.phase, 'playing', 'the round goes on while someone is still inside');
  zed.x = exit.x; zed.y = exit.y;
  run(room, 0.1, now);
  assert.equal(room.results.winner, 'survivors');
  assert.deepEqual(room.results.survivors.map((s) => s.status), ['escaped', 'escaped']);
  console.log('ok - coins unlock the exit, escaping wins');
}

// 16. Rescue: a caught survivor is trapped where they were caught; a friend standing by frees them
//     after the difficulty's rescue time, and progress drains if the friend walks away.
{
  for (const difficulty of ['easy', 'hard']) {
    const room = makeRoom(['ann', 'ben']);
    room.updateSettings('ann', { difficulty });
    const t0 = begin(room, 62_000_000);
    const [ann, ben] = ['ann', 'ben'].map((id) => room.players.get(id));
    const m = room.monsters[0];
    m.isAI = false; // parked
    ann.x = 9 * C.TILE; ann.y = 11.5 * C.TILE; // the long corridor
    m.x = ann.x; m.y = ann.y;
    let now = run(room, 0.1, t0);
    assert.equal(ann.trapped, true);
    assert.equal(room.phase, 'playing', 'one survivor still free');
    m.x = MAPS.mansion.monsterSpawn.x; m.y = MAPS.mansion.monsterSpawn.y;
    const caughtAt = { x: ann.x, y: ann.y };
    ben.x = ann.x + 30; ben.y = ann.y;
    const rescueMs = C.DIFFICULTIES[difficulty].rescueMs;
    now = run(room, (rescueMs - 600) / 1000, now);
    assert.equal(ann.trapped, true, 'not free yet');
    ben.x += 200; // walks off for a moment
    now = run(room, 0.5, now);
    assert.ok(ann.rescueProgress < rescueMs - 600 && ann.rescueProgress > 0, 'progress drains, slowly');
    ben.x -= 200;
    now = run(room, 1.5, now);
    assert.equal(ann.trapped, false, `freed after about ${rescueMs / 1000}s`);
    assert.deepEqual({ x: ann.x, y: ann.y }, caughtAt, 'freed where they were caught');
    assert.equal(ben.rescues, 1);
    m.x = ann.x; m.y = ann.y;
    run(room, 0.2, now);
    assert.equal(ann.alive, true, 'a moment of safety right after being freed');
  }
  console.log('ok - rescue takes 3s on Easy and 10s on Hard, and drains when nobody helps');
}

// 17. Everyone trapped means the monster wins; bots head for the exit and free friends on their own.
{
  const room = makeRoom(['cat']);
  room.addBot('cat');
  room.addBot('cat');
  const t0 = begin(room, 63_000_000);
  const [b1, b2] = room.survivors().filter((p) => p.isBot);
  const m = room.monsters[0];
  m.isAI = false;
  m.x = MAPS.mansion.monsterSpawn.x; m.y = MAPS.mansion.monsterSpawn.y;
  b1.x = 20 * C.TILE; b1.y = 11.5 * C.TILE;
  room.catchSurvivor(b1, m, t0);
  b2.x = b1.x + 5 * C.TILE; b2.y = b1.y;
  let now = run(room, 4 + C.DIFFICULTIES.normal.rescueMs / 1000, t0);
  assert.equal(b1.trapped, false, 'a bot walked over and freed its friend');
  room.coins = [];
  now = run(room, 40, now);
  assert.ok(b1.escaped && b2.escaped, 'bots make for the open exit');
  const solo = makeRoom(['dot']);
  const t1 = begin(solo, 64_000_000);
  solo.catchSurvivor(solo.players.get('dot'), solo.monsters[0], t1);
  solo.update(0.05, t1 + 50);
  assert.equal(solo.results.winner, 'monster', 'nobody left to rescue');
  console.log('ok - bots rescue and escape; all trapped is a monster win');
}

// 18. The circus: the Clown is at home there and moves a little faster.
{
  const speeds = {};
  for (const mapId of ['mansion', 'circus']) {
    const room = makeRoom(['eli', 'fay']);
    room.updateSettings('eli', { mapId, monsterMode: 'player', monsterType: 'clown' });
    room.setWantsMonster('fay', true);
    const t0 = begin(room, 65_000_000);
    const m = room.monsters[0];
    m.x = 16.5 * C.TILE; m.y = 14.5 * C.TILE; // open floor on both maps
    room.handleInput('fay', { right: true });
    const x0 = m.x;
    run(room, 0.5, t0);
    speeds[mapId] = (m.x - x0) / 0.5 / C.MAP_RULES[mapId].monsterSpeed;
  }
  assert.ok(Math.abs(speeds.circus / speeds.mansion - C.HOME_SPEED_BONUS) < 0.02, `home bonus on the circus: ${JSON.stringify(speeds)}`);
  console.log('ok - the Clown is faster under the big top');
}

console.log('All simulations passed.');
