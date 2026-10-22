import { MAP_RULES, DIFFICULTIES } from '@shared/constants.js';
import MansionBackdrop from '../components/MansionBackdrop.jsx';
import SkinIcon from '../components/SkinIcon.jsx';
import MonsterIcon from '../components/MonsterIcon.jsx';

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const ordinal = (n) => ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`;
const STATUS = { escaped: 'Escaped', caught: 'Caught', left: 'Left behind' };

export default function Results({ results, myId, onPlayAgain, onLeave }) {
  const { winner, monsters, survivors, mapId, coinsTotal, coinsLeft, difficulty } = results;
  const escaped = survivors.filter((p) => p.status === 'escaped').length;
  const catches = monsters.reduce((n, m) => n + m.catches, 0);
  const hunters = monsters.map((m) => `${m.name}${m.isAI ? ' (AI)' : ''}`).join(', ');

  // Survivors arrive sorted by coins. Everyone tied on the top score shares the crown.
  const best = survivors[0]?.coins ?? 0;
  const champions = best > 0 ? survivors.filter((p) => p.coins === best) : [];
  const rank = (p) => survivors.findIndex((q) => q.coins === p.coins) + 1;

  return (
    <div className="screen results">
      <MansionBackdrop />
      <div className="panel wide">
        <h1 className={`verdict ${winner}`}>
          {winner === 'survivors' ? 'Survivors win' : monsters.length > 1 ? 'The monsters win' : 'The monster wins'}
        </h1>
        <p className="center muted">
          {MAP_RULES[mapId]?.label ?? 'Mansion'} · {DIFFICULTIES[difficulty]?.label} · {hunters} caught {catches} {catches === 1 ? 'time' : 'times'}.
        </p>
        <div className="round-summary">
          <div><strong>{coinsTotal - coinsLeft}/{coinsTotal}</strong><span>coins found</span></div>
          <div><strong>{coinsLeft === 0 ? 'Open' : 'Locked'}</strong><span>exit</span></div>
          <div><strong>{escaped}/{survivors.length}</strong><span>escaped</span></div>
        </div>
        {monsters.length > 1 && (
          <div className="hunters">
            {monsters.map((m) => (
              <div key={m.name} className="hunter">
                <MonsterIcon type={m.type} size={44} />
                <span>{m.name}{m.isAI && <span className="muted"> (AI)</span>}</span>
                <strong>{m.catches}</strong>
              </div>
            ))}
          </div>
        )}

        <section className="champion" aria-label="Most coins">
          {champions.length ? (
            <>
              <div className="champ-label">{champions.length > 1 ? 'Tied for most coins' : 'Most coins'}</div>
              <div className="champ-row">
                {champions.map((p) => (
                  <div key={p.id} className="champ">
                    <span className="crown" aria-hidden="true">👑</span>
                    <SkinIcon skin={p.skin} color={p.color} size={72} />
                    <div className="champ-name">{p.name}{p.id === myId && ' (you)'}</div>
                  </div>
                ))}
              </div>
              <div className="champ-coins"><span className="coin-icon" />{best} {best === 1 ? 'coin' : 'coins'}</div>
            </>
          ) : (
            <div className="muted">Nobody grabbed a single coin this round.</div>
          )}
        </section>

        <h2>Scoreboard</h2>
        <table className="scores">
          <thead>
            <tr><th>#</th><th>Survivor</th><th>Coins</th><th>Rescues</th><th>Status</th><th>Time</th></tr>
          </thead>
          <tbody>
            {survivors.map((p) => (
              <tr key={p.id} className={p.id === myId ? 'me' : ''}>
                <td className="rank">{ordinal(rank(p))}</td>
                <td><span className="who"><SkinIcon skin={p.skin} color={p.color} size={24} />{p.name}{p.isBot && <span className="tag">bot</span>}</span></td>
                <td>{p.coins}</td>
                <td>{p.rescues}</td>
                <td className={`status-${p.status}`}>{STATUS[p.status]}</td>
                <td>{fmt(p.time)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row">
          <button className="btn" onClick={onLeave}>Main menu</button>
          <button className="btn primary" onClick={onPlayAgain}>Play again</button>
        </div>
      </div>
    </div>
  );
}
