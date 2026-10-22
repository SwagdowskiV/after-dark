import { useRef, useState } from 'react';
import { socket, touchInput } from '../socket.js';

// On-screen joystick + buttons for phones and tablets.
export default function TouchControls({ role }) {
  const base = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [sprint, setSprint] = useState(false);

  const move = (e) => {
    const r = base.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    const max = r.width / 2;
    let dx = t.clientX - (r.left + max);
    let dy = t.clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    setKnob({ x: dx, y: dy });
    touchInput.dx = dx / max;
    touchInput.dy = dy / max;
  };
  const release = () => { setKnob({ x: 0, y: 0 }); touchInput.dx = 0; touchInput.dy = 0; };
  const act = (type) => socket.emit('action', { type });
  const toggleSprint = () => { touchInput.sprint = !sprint; setSprint(!sprint); };

  return (
    <div className="touch">
      <div
        ref={base}
        className="stick"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => e.buttons && move(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <div className="touch-buttons">
        {role === 'survivor' && (
          <button className={sprint ? 'on' : ''} onPointerDown={toggleSprint}>Sprint</button>
        )}
        <button onPointerDown={() => act('interact')}>{role === 'monster' ? 'Search' : 'Hide'}</button>
      </div>
    </div>
  );
}
