// Monster art, drawn with the canvas 2D API so the same picture is used in the
// game (as a Phaser texture) and in the lobby (MonsterIcon). Coordinates run
// from -40 to 40 with the monster's body centered on 0,0 (the witch's hat pokes
// up to -36).

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

function smile(ctx, y, r, inset, stroke) {
  ctx.beginPath();
  ctx.arc(0, y, r, inset, Math.PI - inset);
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function ghost(ctx) {
  circle(ctx, 0, 0, 22, 'rgba(191, 227, 255, 0.14)'); // cold glow
  const sheet = 'rgba(238, 246, 255, 0.9)';
  circle(ctx, 0, -4, 13, sheet);
  ctx.fillStyle = sheet;
  ctx.fillRect(-13, -4, 26, 12);
  for (const x of [-9, 0, 9]) circle(ctx, x, 8, 4.4, sheet); // wavy hem
  ellipse(ctx, -5, -5, 2.5, 4, '#10131c');
  ellipse(ctx, 5, -5, 2.5, 4, '#10131c');
  ellipse(ctx, 0, 4, 2.5, 3.5, '#10131c');
}

function witch(ctx) {
  circle(ctx, 0, 3, 14, '#7bbf5a');
  ctx.fillStyle = '#2b1240';
  ctx.beginPath();
  ctx.moveTo(-15, -5);
  ctx.lineTo(15, -5);
  ctx.lineTo(2, -36);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-21, -8, 42, 6);
  circle(ctx, -5, 1, 2.6, '#ffe14d');
  circle(ctx, 5, 1, 2.6, '#ffe14d');
  smile(ctx, 7, 6, 0.3, '#1d3b12');
}

function clown(ctx) {
  circle(ctx, -14, -5, 8, '#ff7a1a');
  circle(ctx, 14, -5, 8, '#ff7a1a');
  circle(ctx, 0, 0, 15, '#f4f1ea');
  circle(ctx, -5, -4, 2.6, '#111111');
  circle(ctx, 5, -4, 2.6, '#111111');
  circle(ctx, 0, 2, 4, '#e11d2e');
  smile(ctx, 4, 8, 0.25, '#e11d2e');
}

const DRAW = { ghost, witch, clown };

export function drawMonster(ctx, type) {
  (DRAW[type] ?? clown)(ctx);
}
