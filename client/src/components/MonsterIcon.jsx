import { useEffect, useRef } from 'react';
import { MONSTER_NAMES } from '@shared/constants.js';
import { drawMonster } from '../monsters.js';

// A monster drawn at `size` CSS pixels (same art as in the game).
export default function MonsterIcon({ type, size = 40 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const px = Math.round(size * (window.devicePixelRatio || 1));
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.scale(px / 80, px / 80);
    ctx.translate(40, 44); // nudge down so the witch's hat fits
    drawMonster(ctx, type);
  }, [type, size]);

  return <canvas ref={ref} className="skin-icon" style={{ width: size, height: size }} role="img" aria-label={MONSTER_NAMES[type] ?? type} />;
}
