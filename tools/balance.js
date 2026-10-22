// Plays many AI-monster rounds against bot survivors that play roughly like people
// (the same bots the host can add in the lobby, see server/src/bots.js)
// and reports how often survivors collect every coin and escape, and how they get caught.
// Usage: node tools/balance.js [roundsPerMap] [difficulty] [botSkill] [survivors]
import { Room } from '../server/src/room.js';
import { botTick } from '../server/src/bots.js';
import * as C from '../shared/constants.js';

const ROUNDS = Number(process.argv[2]) || 30;
const DIFFICULTY = process.argv[3] ?? 'normal';
const SKILL = process.argv[4] ?? 'normal';
const SURVIVORS = Number(process.argv[5]) || 4;
const fakeIo = { to: () => ({ emit() {} }) };
const pct = (n, d) => `${String(Math.round((n / d) * 100)).padStart(3)}%`;

function playRound(mapId, monsterType, seed) {
  const room = new Room('BAL', fakeIo);
  const ids = 'abcdef'.slice(0, SURVIVORS).split('');
  for (const id of ids) room.addPlayer({ id, join() {}, leave() {} }, { name: id, color: C.SURVIVOR_COLORS[0], skin: 'cat' });
  room.updateSettings('a', { mapId, monsterType, difficulty: DIFFICULTY, botSkill: SKILL });
  const causes = { touch: 0, search: 0 };
  const catchSurvivor = room.catchSurvivor.bind(room);
  room.catchSurvivor = (p, m, now) => {
    if (p.alive) causes[p.hiddenSpot !== null ? 'search' : 'touch']++;
    catchSurvivor(p, m, now);
  };
  let now = 1_000_000 + seed * 1_000_000;
  room.startRound(now);
  const step = 1000 / C.TICK_RATE;
  let exitOpenedAt = null;
  while (room.phase === 'playing') {
    now += step;
    for (const id of ids) botTick(room, room.players.get(id), now);
    room.update(step / 1000, now);
    if (exitOpenedAt === null && room.coins.length === 0) exitOpenedAt = now - room.startedAt;
  }
  const res = room.results.survivors;
  return {
    escaped: res.filter((s) => s.status === 'escaped').length,
    rescues: res.reduce((n, s) => n + s.rescues, 0),
    coinShare: 1 - room.results.coinsLeft / room.results.coinsTotal,
    exitOpenedAt,
    causes,
  };
}

console.log(`${ROUNDS} rounds per line, ${SURVIVORS} ${SKILL} bots, ${DIFFICULTY} difficulty`);
for (const mapId of Object.keys(C.MAP_RULES)) {
  for (const monsterType of C.MONSTER_TYPES) {
    let wins = 0;
    let escaped = 0;
    let rescues = 0;
    let coinShare = 0;
    let opened = 0;
    let openTime = 0;
    const causes = { touch: 0, search: 0 };
    for (let r = 0; r < ROUNDS; r++) {
      const res = playRound(mapId, monsterType, r);
      if (res.escaped > 0) wins++;
      escaped += res.escaped;
      rescues += res.rescues;
      coinShare += res.coinShare;
      if (res.exitOpenedAt !== null) { opened++; openTime += res.exitOpenedAt; }
      for (const k in causes) causes[k] += res.causes[k];
    }
    console.log(
      `${mapId.padEnd(8)} ${monsterType.padEnd(6)} survivors win ${pct(wins, ROUNDS)} | ${pct(escaped, ROUNDS * SURVIVORS)} escape | `
      + `coins collected ${pct(coinShare, ROUNDS)} | exit opened ${pct(opened, ROUNDS)}`
      + `${opened ? ` (avg ${Math.round(openTime / opened / 1000)}s)` : ''} | `
      + `catches: touch ${causes.touch}, hiding ${causes.search} | rescues ${rescues}`,
    );
  }
}
