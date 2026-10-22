import { useEffect } from 'react';
import { MAP_RULES, DIFFICULTIES, MONSTER_NAMES } from '@shared/constants.js';
import { sfx } from '../sfx.js';
import MonsterIcon from './MonsterIcon.jsx';

// The title card shown while everyone is frozen at the start of a round:
// where you are, who's hunting, and what you have to do.
export default function IntroCard({ round, myId }) {
  useEffect(() => { sfx.introBoom(); }, []);
  const rules = MAP_RULES[round.mapId];
  const mine = round.monsters.find((m) => m.controllerId === myId);
  const difficulty = DIFFICULTIES[round.difficulty];

  return (
    <div className="intro" role="dialog" aria-label="Round intro">
      <div className="intro-map">{rules.label}</div>
      <div className="intro-hunters">
        {round.monsters.map((m) => (
          <div key={m.id} className={`intro-hunter ${m === mine ? 'me' : ''}`}>
            <MonsterIcon type={m.type} size={86} />
            <span>{m.controllerId ? m.name : MONSTER_NAMES[m.type]}{m === mine && ' (you)'}</span>
          </div>
        ))}
      </div>
      {round.role === 'monster' ? (
        <div className="intro-role monster">
          <strong>You are {MONSTER_NAMES[mine?.type] ?? 'the monster'}</strong>
          <span>Catch all {round.survivorCount} {round.survivorCount === 1 ? 'survivor' : 'survivors'} before they collect {round.coinsTotal} coins and escape.</span>
          {rules.homeMonster === mine?.type && <span className="perk">You're at home here: a little faster than usual.</span>}
        </div>
      ) : (
        <div className="intro-role">
          <strong>Survive</strong>
          <span>Collect all {round.coinsTotal} coins as a team to unlock the exit, then get out.</span>
          <span className="perk">Caught friends are trapped in a cage. Stand next to them for {difficulty.rescueMs / 1000}s to free them.</span>
        </div>
      )}
    </div>
  );
}
