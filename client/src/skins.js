// Survivor skins, drawn with the canvas 2D API so the same art is used in the
// game (as Phaser textures) and in the menus (SkinIcon). Coordinates run from
// -16 to 16 with the character centered on 0,0; `color` is the player's color.

function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function poly(ctx, points, fill, stroke) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

const mirror = (points) => points.map(([x, y]) => [-x, y]);

// Darken a #rrggbb color by `amount` (0..1).
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = 1 - amount;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

const SKINS = {
  cat(ctx, c) {
    const ear = [[-10, -3], [-9, -15], [-2, -9]];
    const inner = [[-8, -6], [-8, -12], [-4, -9]];
    poly(ctx, ear, c);
    poly(ctx, mirror(ear), c);
    poly(ctx, inner, '#f8a5c2');
    poly(ctx, mirror(inner), '#f8a5c2');
    circle(ctx, 0, 0, 11, c);
    for (const x of [-4, 4]) {
      ellipse(ctx, x, -1, 2.6, 3.2, '#d4f542');
      ellipse(ctx, x, -1, 0.9, 2.6, '#111111');
    }
    poly(ctx, [[-1.6, 3], [1.6, 3], [0, 4.8]], '#f48fb1');
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(3 * s, 5); ctx.lineTo(12 * s, 3);
      ctx.moveTo(3 * s, 6.5); ctx.lineTo(12 * s, 8);
    }
    ctx.stroke();
  },

  bat(ctx, c) {
    const wing = [[-3, -3], [-16, -9], [-14, -2], [-16, 4], [-11, 2], [-9, 7], [-4, 4]];
    const ear = [[-6, -5], [-4, -13], [-1, -7]];
    poly(ctx, wing, shade(c, 0.35));
    poly(ctx, mirror(wing), shade(c, 0.35));
    poly(ctx, ear, c);
    poly(ctx, mirror(ear), c);
    circle(ctx, 0, 0, 8, c);
    circle(ctx, -3, -1, 1.7, '#ff2a2a');
    circle(ctx, 3, -1, 1.7, '#ff2a2a');
    const fang = [[-2.2, 3], [-0.6, 3], [-1.4, 5.5]];
    poly(ctx, fang, '#ffffff');
    poly(ctx, mirror(fang), '#ffffff');
  },

  child(ctx, c) {
    circle(ctx, -10.5, 2, 3, c); // pigtails
    circle(ctx, 10.5, 2, 3, c);
    circle(ctx, 0, -1, 11, shade(c, 0.25));
    circle(ctx, 0, 1.5, 9, '#f3dcc4');
    ellipse(ctx, 0, -6, 9.5, 4.5, c);
    for (const x of [-3.5, 3.5]) {
      circle(ctx, x, 1.5, 2.1, '#1a1a1a'); // big, too-dark eyes
      circle(ctx, x + 0.6, 0.9, 0.6, '#ffffff');
    }
    ellipse(ctx, -6, 5, 1.6, 1, 'rgba(255,120,120,0.55)');
    ellipse(ctx, 6, 5, 1.6, 1, 'rgba(255,120,120,0.55)');
    ellipse(ctx, 0, 6, 1.4, 1.1, '#6b2b2b');
  },

  // The carved face glows in the player's color.
  pumpkin(ctx, c) {
    ctx.fillStyle = '#4e7d32';
    ctx.fillRect(-1.6, -14, 3.2, 5);
    ellipse(ctx, -5.5, 1, 6.5, 10, '#d9650b');
    ellipse(ctx, 5.5, 1, 6.5, 10, '#d9650b');
    ellipse(ctx, 0, 1, 7, 10.5, '#f57c1f');
    const eye = [[-7, -1], [-2, -1], [-4.5, -5.5]];
    poly(ctx, eye, c, '#3a1800');
    poly(ctx, mirror(eye), c, '#3a1800');
    poly(ctx, [[-6.5, 3], [6.5, 3], [5, 7.5], [3, 6], [1.2, 8], [-0.6, 6], [-2.4, 8], [-4.2, 6], [-5.5, 7.5]], c, '#3a1800');
  },
};

export function drawSkin(ctx, skin, color) {
  (SKINS[skin] ?? SKINS.cat)(ctx, color);
}
