import { useEffect, useState } from 'react';
import { socket } from '../socket.js';
import {
  MAX_PLAYERS, MAP_RULES, MONSTER_TYPES, MONSTER_NAMES, MONSTER_COUNTS, RANDOM_MAP, DIFFICULTIES, BOT_SKILLS, coinsFor,
} from '@shared/constants.js';
import { MAPS } from '@shared/map.js';
import MansionBackdrop from '../components/MansionBackdrop.jsx';
import SkinIcon from '../components/SkinIcon.jsx';
import MonsterIcon from '../components/MonsterIcon.jsx';
import MapPreview from '../components/MapPreview.jsx';
import { sfx } from '../sfx.js';

const MAP_CHOICES = [...Object.keys(MAP_RULES), RANDOM_MAP];
const DIFFICULTY_LEVEL = { easy: 1, normal: 2, hard: 3 };
const MONSTER_TAGLINES = {
  clown: 'Honks. Grins. Never stops walking.',
  witch: 'Cackles in the dark, hat first.',
  ghost: 'Drifts straight through furniture.',
};

function Candles({ lit }) {
  return (
    <span className="candles" aria-hidden="true">
      {[1, 2, 3].map((n) => <span key={n} className={`candle ${n <= lit ? 'lit' : ''}`} />)}
    </span>
  );
}

function MapCard({ choice, selected, leading, voters, voting, myVote, disabled, onPick }) {
  const rules = MAP_RULES[choice];
  const isRandom = choice === RANDOM_MAP;
  return (
    <button
      type="button"
      className={`map-card ${selected ? 'on' : ''} ${leading ? 'leading' : ''} ${myVote ? 'mine' : ''}`}
      disabled={disabled}
      onClick={onPick}
      aria-pressed={voting ? myVote : selected}
    >
      <div className="map-art">
        {isRandom ? (
          <div className="map-random">
            {Object.values(MAPS).map((m, i) => <MapPreview key={m.id} map={m} className={`stack-${i}`} />)}
            <span className="qmark">?</span>
          </div>
        ) : (
          <MapPreview map={MAPS[choice]} />
        )}
        {voting && leading && <span className="map-badge">Leading</span>}
        {!voting && selected && <span className="map-badge">Tonight</span>}
      </div>
      <div className="map-info">
        <div className="map-title">
          {isRandom ? 'Random' : rules.label}
          {!isRandom && <small className={`diff ${rules.difficulty.toLowerCase()}`}>{rules.difficulty}</small>}
        </div>
        <div className="map-blurb">{isRandom ? 'Let the night decide. Rolled when the lights go out.' : rules.blurb}</div>
        {voting && (
          <div className="map-votes">
            <span>{voters.length} {voters.length === 1 ? 'vote' : 'votes'}</span>
            <span className="voters">
              {voters.map((p) => <SkinIcon key={p.id} skin={p.skin} color={p.color} size={18} />)}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

// One spot on the porch: a player under their lantern (lit when ready), or an empty spot.
function StageSpot({ player, index, isMe, canKick, isHostSpot, monsterMode, canEdit, onAddBot }) {
  if (!player) {
    return (
      <div className={`spot empty ${canEdit ? '' : 'idle'}`} style={{ '--i': index }}>
        <div className="lantern" />
        {canEdit ? (
          <button className="ghost-slot" onClick={onAddBot} title="Add a bot survivor">
            <span className="plus">+</span>
            <span>Add bot</span>
          </button>
        ) : (
          <div className="ghost-slot"><span className="plus">?</span><span>Waiting…</span></div>
        )}
      </div>
    );
  }
  return (
    <div className={`spot ${player.ready ? 'ready' : ''} ${isMe ? 'me' : ''}`} style={{ '--i': index }}>
      <div className="lantern" />
      <div className="character">
        <SkinIcon skin={player.skin} color={player.color} size={68} />
      </div>
      <div className="nameplate">
        <span className="pname">{player.name}</span>
        <span className="badges">
          {isMe && <span className="tag me">you</span>}
          {isHostSpot && <span className="tag">host</span>}
          {player.isBot && <span className="tag">bot</span>}
          {monsterMode === 'player' && player.wantsMonster && <span className="tag red">wants to hunt</span>}
        </span>
        <span className={`ready-word ${player.ready ? 'yes' : ''}`}>{player.ready ? 'Ready' : 'Not ready'}</span>
      </div>
      {player.isBot && canKick && (
        <button className="kick" onClick={() => socket.emit('removeBot', player.id)} aria-label={`Remove ${player.name}`}>✕</button>
      )}
    </div>
  );
}

export default function Lobby({ lobby, myId, onLeave }) {
  const me = lobby.players.find((p) => p.id === myId);
  const isHost = lobby.hostId === myId;
  const { settings } = lobby;
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (lobby.phase !== 'countdown') return undefined;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [lobby.phase]);

  const set = (s) => { sfx.click(); socket.emit('updateSettings', s); };
  const editable = isHost && lobby.phase === 'lobby';
  const minPlayers = settings.monsterMode === 'player' ? 2 : 1;
  const inviteLink = `${location.origin}/?room=${lobby.code}`;
  const countdown = Math.max(0, Math.ceil((lobby.countdownEnd - now) / 1000));
  const humans = lobby.players.filter((p) => !p.isBot);
  const full = lobby.players.length >= MAX_PLAYERS;

  const voting = settings.mapPick === 'vote';
  const votersFor = (choice) => lobby.players.filter((p) => p.mapVote === choice);
  const topVotes = Math.max(0, ...MAP_CHOICES.map((c) => votersFor(c).length));
  const leadingMap = voting ? MAP_CHOICES.find((c) => topVotes > 0 && votersFor(c).length === topVotes) : null;
  const themeMap = leadingMap ?? settings.mapId;

  const pickMap = (choice) => { sfx.click(); if (voting) socket.emit('voteMap', choice); else set({ mapId: choice }); };
  const hunters = [settings.monsterType, ...MONSTER_TYPES.filter((t) => t !== settings.monsterType)].slice(0, settings.monsterCount);
  const humanMonsters = settings.monsterMode === 'player' ? Math.min(settings.monsterCount, humans.length, lobby.players.length - 1) : 0;
  // Who will be hunting: monster players first, then the AI.
  const expectedSurvivors = Math.max(1, lobby.players.length - humanMonsters);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  const spots = Array.from({ length: MAX_PLAYERS }, (_, i) => lobby.players[i] ?? null);

  return (
    <div className={`screen lobby2 theme-${themeMap}`}>
      <MansionBackdrop />

      {lobby.phase === 'countdown' && (
        <div className="countdown-overlay" aria-live="assertive">
          <span className="cd-label">The lights go out in</span>
          <span key={countdown} className="cd-number">{countdown}</span>
        </div>
      )}

      <div className="lobby-shell">
        <header className="lobby-top">
          <div className="lobby-brand">
            <span className="mini-logo">After Dark</span>
            <span className="muted">Lobby</span>
          </div>
          <div className="ticket" title="Room code">
            <span className="ticket-label">Room</span>
            <span className="ticket-code">{lobby.code}</span>
            <button className="btn small" onClick={copy}>{copied ? 'Copied!' : 'Copy invite'}</button>
          </div>
          <button className="btn small" onClick={onLeave}>Leave</button>
        </header>

        <section className="stage" aria-label={`Players ${lobby.players.length} of ${MAX_PLAYERS}`}>
          <div className="lurkers" aria-label="Hunting tonight">
            {hunters.map((t, i) => (
              <div key={t} className="lurker" style={{ '--i': i }}>
                <MonsterIcon type={t} size={120 - i * 14} />
              </div>
            ))}
          </div>
          <div className="stage-caption">
            <span>Hunting tonight:</span>
            <strong>{hunters.map((t) => MONSTER_NAMES[t]).join(', ')}</strong>
            <span className="muted">
              {settings.monsterMode === 'ai' ? '(AI)' : humanMonsters < settings.monsterCount ? `(${humanMonsters} played by people, the rest by AI)` : '(played by people)'}
            </span>
          </div>
          <div className="porch">
            {spots.map((p, i) => (
              <StageSpot
                key={p?.id ?? `empty-${i}`}
                player={p}
                index={i}
                isMe={p?.id === myId}
                canKick={editable}
                isHostSpot={p?.id === lobby.hostId}
                monsterMode={settings.monsterMode}
                canEdit={editable && !full && i === lobby.players.length}
                onAddBot={() => { sfx.click(); socket.emit('addBot'); }}
              />
            ))}
          </div>
          {isHost && (
            <div className="stage-tools">
              <span className="muted">Bot skill</span>
              {Object.entries(BOT_SKILLS).map(([k, b]) => (
                <button key={k} disabled={!editable} className={`pill ${settings.botSkill === k ? 'on' : ''}`} onClick={() => set({ botSkill: k })}>{b.label}</button>
              ))}
            </div>
          )}
        </section>

        <div className="lobby-cols">
          <section className="card-block">
            <div className="block-head">
              <h2>Choose the haunt</h2>
              <div className="switch-row" role="group" aria-label="How the map is chosen">
                {[['host', 'Host picks'], ['vote', 'Everyone votes']].map(([v, label]) => (
                  <button key={v} disabled={!editable} className={`pill ${settings.mapPick === v ? 'on' : ''}`} onClick={() => set({ mapPick: v })}>{label}</button>
                ))}
              </div>
            </div>
            <div className="map-grid">
              {MAP_CHOICES.map((choice) => {
                const voters = votersFor(choice);
                return (
                  <MapCard
                    key={choice}
                    choice={choice}
                    voting={voting}
                    selected={settings.mapId === choice}
                    leading={voting && topVotes > 0 && voters.length === topVotes}
                    voters={voters}
                    myVote={me?.mapVote === choice}
                    disabled={voting ? lobby.phase !== 'lobby' : !editable}
                    onPick={() => pickMap(choice)}
                  />
                );
              })}
            </div>
            <p className="hint flush">
              {voting
                ? 'Click a map to vote, and click again to take it back. Most votes wins; ties are a coin flip.'
                : isHost ? 'Click a map to pick tonight\'s haunt.' : 'The host is picking the map.'}
            </p>
          </section>

          <section className="card-block">
            <div className="block-head">
              <h2>The hunt</h2>
              <div className="switch-row" role="group" aria-label="Who plays the monsters">
                {[['ai', 'AI monsters'], ['player', 'Players hunt']].map(([v, label]) => (
                  <button key={v} disabled={!editable} className={`pill ${settings.monsterMode === v ? 'on' : ''}`} onClick={() => set({ monsterMode: v })}>{label}</button>
                ))}
              </div>
            </div>
            <div className="monster-picks">
              {MONSTER_TYPES.map((v) => {
                const lead = settings.monsterType === v;
                const extra = !lead && hunters.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={!editable}
                    className={`monster-pick ${lead ? 'on' : ''} ${extra ? 'extra' : ''}`}
                    onClick={() => set({ monsterType: v })}
                    aria-pressed={lead}
                  >
                    <MonsterIcon type={v} size={60} />
                    <span className="mp-name">{MONSTER_NAMES[v].replace('The ', '')}</span>
                    <small>{lead ? 'leads the hunt' : extra ? 'also hunting' : MONSTER_TAGLINES[v]}</small>
                  </button>
                );
              })}
            </div>
            <div className="option-row">
              <span className="opt-label">How many</span>
              <div className="switch-row">
                {MONSTER_COUNTS.map((n) => (
                  <button key={n} disabled={!editable} className={`pill count ${settings.monsterCount === n ? 'on' : ''}`} onClick={() => set({ monsterCount: n })}>
                    {Array.from({ length: n }, (_, i) => <span key={i} className="pip" />)}<span className="sr">{n}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="option-row">
              <span className="opt-label">Powers</span>
              <button
                className={`toggle ${settings.powers ? 'on' : ''}`}
                disabled={!editable}
                onClick={() => set({ powers: !settings.powers })}
                aria-pressed={settings.powers}
              >
                <span className="knob" />
              </button>
              <span className="muted small">{settings.powers ? 'Lights On (Q) and Blackout (R)' : 'Off: hunt by sight and sound only'}</span>
            </div>
            {settings.monsterType === 'clown' && <p className="hint flush">The Clown is at home at the Circus and moves a little faster there.</p>}
            {hunters.includes('ghost') && <p className="hint flush">The Ghost floats through furniture and trees.</p>}

            <h2 className="sub">Difficulty</h2>
            <div className="difficulty-picks">
              {Object.entries(DIFFICULTIES).map(([k, d]) => (
                <button key={k} disabled={!editable} className={`diff-card ${settings.difficulty === k ? 'on' : ''}`} onClick={() => set({ difficulty: k })}>
                  <Candles lit={DIFFICULTY_LEVEL[k]} />
                  <strong>{d.label}</strong>
                  <span>{d.roundLength / 60} min · {coinsFor(expectedSurvivors, k)} coins</span>
                  <span>{d.rescueMs / 1000}s to free a friend</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="howto">
          <strong>How to play.</strong> Survivors: move with WASD or arrows, sprint with Shift (it makes noise), hide with E.
          Collect every coin as a team to unlock the exit, then get out before time runs out. Caught friends are trapped in a cage:
          stand next to them to free them. Monsters: catch everyone before they escape
          {settings.powers ? ', with Q for Lights On and R for Blackout.' : '.'}
          {' '}<strong>Testing as the monster?</strong> Pick Players hunt, tick "I want to hunt" and add a few bots.
        </div>
      </div>

      <footer className="ready-bar">
        <div className="ready-status">
          {lobby.phase === 'countdown'
            ? 'Here we go…'
            : lobby.players.length < minPlayers
              ? 'Player monsters need someone to hunt. Invite a friend or add a bot.'
              : `${humans.filter((p) => p.ready).length}/${humans.length} ready · the round starts when everyone is`}
        </div>
        {settings.monsterMode === 'player' && me && (
          <button
            className={`btn hunt ${me.wantsMonster ? 'on' : ''}`}
            onClick={() => { sfx.click(); socket.emit('setWantsMonster', !me.wantsMonster); }}
            aria-pressed={me.wantsMonster}
          >
            {me.wantsMonster ? 'You want to hunt' : 'I want to hunt'}
          </button>
        )}
        <button
          className={`btn primary big ${me?.ready ? 'armed' : 'pulse'}`}
          onClick={() => { sfx.click(); socket.emit('setReady', !me?.ready); }}
        >
          {me?.ready ? 'Ready! (click to cancel)' : 'Ready'}
        </button>
      </footer>
    </div>
  );
}
