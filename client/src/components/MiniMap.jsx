import { useEffect, useRef } from 'react';
import { TILE } from '@shared/constants.js';

const SCALE = 4; // pixels per tile on the minimap

// Shows the floor plan, your own position and the exit. The only other things it ever
// shows are what the game already tells everyone: the last few coins, and (for survivors)
// friends trapped in cages. Never where other players are.
const COLORS = {
  mansion: { '#': '#6b5a80', H: '#7a4a24', floor: '#1a1320' },
  forest: { '#': '#2f5236', T: '#1f3524', H: '#7a4a24', floor: '#0e1711' },
  circus: { '#': '#9a2a3a', T: '#4a3520', H: '#5b3480', floor: '#21170e' },
};

export default function MiniMap({ map, x, y, color, exitOpen, markers = [] }) {
  const base = useRef(null);

  useEffect(() => {
    const ctx = base.current.getContext('2d');
    const palette = COLORS[map.id] ?? COLORS.mansion;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const c = map.tiles[ty][tx];
        ctx.fillStyle = palette[c] ?? (c === 'E' ? palette['#'] : palette.floor);
        ctx.fillRect(tx * SCALE, ty * SCALE, SCALE, SCALE);
      }
    }
  }, [map]);

  const at = (p) => ({ left: (p.x / TILE) * SCALE, top: (p.y / TILE) * SCALE });

  return (
    <div className="minimap">
      <canvas ref={base} width={map.width * SCALE} height={map.height * SCALE} />
      <span className={`exit-dot ${exitOpen ? 'open' : ''}`} style={at(map.exit)} title={exitOpen ? 'Exit (open)' : 'Exit (locked)'} />
      {markers.map((m) => <span key={m.key} className={`mark ${m.kind}`} style={at(m)} />)}
      <span className="me-dot" style={{ ...at({ x, y }), background: color }} />
    </div>
  );
}
