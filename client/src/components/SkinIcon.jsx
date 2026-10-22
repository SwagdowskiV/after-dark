import { useEffect, useRef } from 'react';
import { SKIN_LABELS } from '@shared/constants.js';
import { drawSkin } from '../skins.js';

// A survivor's skin drawn at `size` CSS pixels (same art as in the game).
export default function SkinIcon({ skin, color, size = 28 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const px = Math.round(size * (window.devicePixelRatio || 1));
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.scale(px / 32, px / 32);
    ctx.translate(16, 16);
    drawSkin(ctx, skin, color);
  }, [skin, color, size]);

  return <canvas ref={ref} className="skin-icon" style={{ width: size, height: size }} role="img" aria-label={SKIN_LABELS[skin] ?? skin} />;
}
