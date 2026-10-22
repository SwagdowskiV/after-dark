import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket.js';
import { MAPS } from '@shared/map.js';
import * as C from '@shared/constants.js';
import { sfx } from '../sfx.js';
import MiniMap from './MiniMap.jsx';
import SkinIcon from './SkinIcon.jsx';
import IntroCard from './IntroCard.jsx';

const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const ROSTER_NOTE = { trapped: 'trapped', escaped: 'escaped' };

export default function Hud({ round, myId }) {
  const { role, powers } = round;
  const map = MAPS[round.mapId] ?? MAPS.mansion;
  const [s, setS] = useState(null);
  const [toasts, setToasts] = useState([]);
  const lastSet = useRef(0);

  useEffect(() => {
    const toast = (text, kind = '') => {
      const key = Math.random();
      setToasts((list) => [...list, { key, text, kind }]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.key !== key)), 3500);
    };
    const onState = (st) => {
      const t = performance.now();
      if (t - lastSet.current > 90) { lastSet.current = t; setS(st); }
    };
    const onCaught = ({ id, name, by }) => {
      toast(id === myId ? `${by} caught you! Hang on, a friend can free you…` : `${by} caught ${name}!`);
    };
    const onRescued = ({ id, name, by }) => {
      sfx.rescued();
      toast(id === myId ? `${by} freed you! Run!` : `${by} freed ${name}!`, 'good');
    };
    const onEscaped = ({ id, name }) => {
      sfx.escaped();
      toast(id === myId ? 'You escaped!' : `${name} escaped!`, 'good');
    };
    const onExitOpen = ({ by }) => {
      sfx.exitOpen();
      toast(`${by} grabbed the last coin. The exit is open!`, 'good');
    };
    const events = [['state', onState], ['caught', onCaught], ['rescued', onRescued], ['escaped', onEscaped], ['exitOpen', onExitOpen]];
    for (const [ev, fn] of events) socket.on(ev, fn);
    return () => { for (const [ev, fn] of events) socket.off(ev, fn); };
  }, [myId]);

  if (!s) return <div className="hud"><div className="banner">Entering the {C.MAP_RULES[map.id].label.toLowerCase()}…</div></div>;

  const now = s.t;
  const me = s.self;
  const lightsOn = now < s.lightsOnUntil;
  const blackout = now >= s.blackoutStart && now < s.blackoutUntil;
  const warning = !blackout && s.blackoutStart > now;
  const act = (type) => socket.emit('action', { type });
  const collected = s.coinsTotal - s.coins.length;
  const intro = now < s.frozenUntil;

  // Context prompt for the E key (or whatever's happening to you)
  let prompt = null;
  let promptKind = role;
  if (role === 'survivor' && me.trapped) {
    prompt = me.rescue > 0
      ? `Being freed… ${Math.round((me.rescue / s.rescueMs) * 100)}%`
      : 'Trapped! Hang on until a friend stands next to you';
    promptKind = 'trapped';
  } else if (role === 'survivor' && me.alive) {
    const friend = s.survivors.find((p) => p.trapped && Math.hypot(p.x - me.x, p.y - me.y) <= C.RESCUE_RADIUS);
    if (friend) {
      prompt = `Freeing ${friend.name}… ${Math.round((friend.rescue / s.rescueMs) * 100)}% · stay close`;
      promptKind = 'rescue';
    } else if (me.hiddenSpot !== null) {
      prompt = me.spotted
        ? `A monster saw you hide! ${fmt(me.hideUntil - now)} left · E to leave`
        : `Hidden and safe — ${fmt(me.hideUntil - now)} left · E to leave`;
    } else {
      const near = map.hidingSpots.some((h) => Math.hypot(h.x - me.x, h.y - me.y) <= C.INTERACT_RADIUS);
      if (near) prompt = now < me.hideCooldownUntil ? `Catch your breath… ${fmt(me.hideCooldownUntil - now)}` : 'E to hide';
    }
  } else if (role === 'monster') {
    const near = map.hidingSpots.some((h) => Math.hypot(h.x - me.x, h.y - me.y) <= C.INTERACT_RADIUS + 8);
    if (near) prompt = 'E to search this hiding spot';
  }

  // Minimap extras everyone already knows about: the last coins, and (for survivors) trapped friends.
  const markers = [];
  if (s.coins.length <= C.LAST_COINS_REVEALED) for (const c of s.coins) markers.push({ key: `c${c.id}`, kind: 'coin', x: c.x, y: c.y });
  if (role === 'survivor') {
    for (const p of s.survivors) if (p.trapped && p.id !== myId) markers.push({ key: `t${p.id}`, kind: 'trapped', x: p.x, y: p.y });
  }
  const exitAngle = Math.atan2(map.exit.y - me.y, map.exit.x - me.x);
  const exitDist = Math.round(Math.hypot(map.exit.x - me.x, map.exit.y - me.y) / C.TILE);

  return (
    <div className="hud">
      {intro && <IntroCard round={round} myId={myId} />}

      <div className="hud-top">
        <div className={`chip timer ${s.endsAt - now < 20000 ? 'urgent' : ''}`}>{fmt(Math.min(s.endsAt - now, s.endsAt - s.frozenUntil))}</div>
        {role === 'survivor' ? (
          <div className="chip coins"><span className="coin-icon" />{me.coins}</div>
        ) : (
          <div className="chip">
            Catches {me.catches}
            {s.monsters.length > 1 && <span className="muted">· team {s.monsters.reduce((n, m) => n + m.catches, 0)}</span>}
          </div>
        )}
      </div>

      <div className={`goal ${s.exitOpen ? 'open' : ''}`}>
        {s.exitOpen ? (
          <div className="goal-open">
            <span>{role === 'survivor' ? 'The exit is open: get out!' : 'The exit is open: guard it!'}</span>
            <span className="exit-pointer" title="Direction to the exit">
              <span className="arrow" style={{ transform: `rotate(${exitAngle}rad)` }}>➜</span>{exitDist}m
            </span>
          </div>
        ) : (
          <>
            <div className="goal-label">
              <span><span className="coin-icon" /> {collected}/{s.coinsTotal} coins</span>
              <span className="muted">{role === 'survivor' ? 'collect them all to unlock the exit' : 'stop them unlocking the exit'}</span>
            </div>
            <div className="goal-bar"><div style={{ width: `${(collected / s.coinsTotal) * 100}%` }} /></div>
          </>
        )}
      </div>

      <div className="roster">
        {s.roster.map((p) => (
          <div key={p.id} className={`roster-item ${p.status}`}>
            <SkinIcon skin={p.skin} color={p.color} size={20} />
            {p.name}{p.id === myId && ' (you)'}{p.isBot && <span className="tag">bot</span>}
            <span className="muted">{ROSTER_NOTE[p.status] ?? `${p.coins}c`}</span>
          </div>
        ))}
      </div>

      <MiniMap map={map} x={me.x} y={me.y} color={role === 'monster' ? '#ff3355' : '#ffffff'} exitOpen={s.exitOpen} markers={markers} />

      {lightsOn && <div className="banner danger">The lights are on!</div>}
      {warning && role === 'survivor' && <div className="banner warn">Your flashlight is flickering…</div>}
      {blackout && <div className="banner danger">Blackout</div>}
      {role === 'survivor' && me.escaped && <div className="banner good">You escaped! Watching the others…</div>}
      {role === 'survivor' && !me.alive && !me.trapped && !me.escaped && <div className="banner">Spectating</div>}

      <div className="toasts">
        {toasts.map((t) => <div key={t.key} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>

      {prompt && <div className={`prompt ${promptKind}`}>{prompt}</div>}

      {role === 'survivor' && me.alive && (
        <div className="stamina" aria-label="Stamina">
          <div style={{ width: `${(me.stamina / C.STAMINA_MAX) * 100}%` }} />
        </div>
      )}

      {role === 'monster' && powers && (
        <div className="powers">
          {Object.entries(C.POWERS).map(([key, p]) => {
            const left = me.cooldowns[key] - now;
            const ready = left <= 0;
            return (
              <button key={key} className={`power ${ready ? 'ready' : ''}`} disabled={!ready} onClick={() => act(key)}>
                <span className="pkey">{p.key}</span>
                {p.label}
                <span className="pcd">{ready ? 'Ready' : `${Math.ceil(left / 1000)}s`}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
