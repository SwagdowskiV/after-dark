import { useState } from 'react';
import { socket } from '../socket.js';
import { SURVIVOR_COLORS, SURVIVOR_SKINS, SKIN_LABELS } from '@shared/constants.js';
import MansionBackdrop from '../components/MansionBackdrop.jsx';
import SkinIcon from '../components/SkinIcon.jsx';
import { isMuted, setMuted, sfx } from '../sfx.js';

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem('afterdark-profile')) ?? {};
  } catch {
    return {};
  }
}

export default function Menu({ onJoined }) {
  const saved = loadProfile();
  const [name, setName] = useState(saved.name ?? '');
  const [color, setColor] = useState(saved.color ?? SURVIVOR_COLORS[0]);
  const [skin, setSkin] = useState(SURVIVOR_SKINS.includes(saved.skin) ? saved.skin : SURVIVOR_SKINS[0]);
  const [code, setCode] = useState(new URLSearchParams(location.search).get('room') ?? '');
  const [error, setError] = useState('');
  const [muted, setMutedState] = useState(isMuted());

  const profile = () => {
    const p = { name: name.trim() || 'Survivor', color, skin };
    try { localStorage.setItem('afterdark-profile', JSON.stringify(p)); } catch { /* ignore */ }
    sfx.click();
    return p;
  };

  const handle = (res) => (res?.ok ? onJoined() : setError(res?.error ?? 'Something went wrong.'));
  const create = () => socket.emit('createRoom', profile(), handle);
  const join = (e) => {
    e.preventDefault();
    if (code.trim().length !== 4) { setError('Room codes are 4 letters.'); return; }
    socket.emit('joinRoom', { ...profile(), code }, handle);
  };

  return (
    <div className="screen menu">
      <MansionBackdrop />
      <div className="panel">
        <h1 className="logo">After Dark</h1>
        <p className="tagline">The Haunted House</p>

        <label className="field">
          <span>Your name</span>
          <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="Survivor" />
        </label>

        <div className="field">
          <span>Character</span>
          <div className="skins">
            {SURVIVOR_SKINS.map((k) => (
              <button
                key={k}
                type="button"
                className={`skin-pick ${k === skin ? 'on' : ''}`}
                onClick={() => setSkin(k)}
                aria-pressed={k === skin}
              >
                <SkinIcon skin={k} color={color} size={44} />
                <span>{SKIN_LABELS[k]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Flashlight color</span>
          <div className="swatches">
            {SURVIVOR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${c === color ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <button className="btn primary" onClick={create}>Create room</button>

        <form className="join" onSubmit={join}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
            placeholder="CODE"
            aria-label="Room code"
          />
          <button className="btn">Join room</button>
        </form>

        {error && <p className="error">{error}</p>}

        <button
          className="link"
          onClick={() => { setMuted(!muted); setMutedState(!muted); }}
        >
          Sound: {muted ? 'off' : 'on'}
        </button>
      </div>
    </div>
  );
}
