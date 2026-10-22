import Phaser from 'phaser';
import { MAPS, flickerOn } from '@shared/map.js';
import * as C from '@shared/constants.js';
import { touchInput } from '../socket.js';
import { sfx } from '../sfx.js';
import { drawSkin } from '../skins.js';
import { drawMonster } from '../monsters.js';

const T = C.TILE;
const hex = (css) => Phaser.Display.Color.HexStringToColor(css).color;

// Stable pseudo-random number per tile, so the forest looks the same for everyone.
function rnd(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Depth layers (higher draws on top)
const D = { coins: 5, players: 10, monster: 11, dark: 50, reveal: 55, fx: 60 };

export default class MansionScene extends Phaser.Scene {
  constructor() { super('mansion'); }

  init({ socket, myId, role, mapId, powers }) {
    this.socket = socket;
    this.myId = myId;
    this.role = role;
    this.powers = powers;
    this.map = MAPS[mapId] ?? MAPS.mansion;
    this.rules = C.MAP_RULES[this.map.id];
    this.latest = null;
    this.offset = null; // server clock minus local clock
    this.lastInput = '';
    this.nextHeartbeat = 0;
    this.nextSting = 0;
    this.monsterInView = false;
    this.exitShownOpen = null;
  }

  create() {
    const W = this.map.pixelWidth;
    const H = this.map.pixelHeight;
    this.cameras.main.setBounds(0, 0, W, H).setBackgroundColor('#000000');

    this.drawMap();
    this.makeLightTexture();
    this.exitG = this.add.graphics().setDepth(D.coins);
    this.exitLabel = this.add.text(this.map.exit.x, this.map.exit.y - 30, 'EXIT', {
      fontFamily: 'Inter, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#9dffb0', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(D.fx).setVisible(false);
    this.drawExit(false);

    this.coinSprites = new Map();
    this.survivorSprites = new Map();
    this.monsterSprites = new Map(); // monster id -> sprite, created as the server reports them

    // The darkness: a black sheet over the whole house with light "erased" out of it each frame.
    this.dark = this.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(D.dark);
    this.brush = this.make.image({ x: 0, y: 0, key: 'light', add: false }).setOrigin(0.5);
    this.revealG = this.add.graphics().setDepth(D.reveal);

    this.setupInput();
    this.setupSocket();

    this.scale.on('resize', this.fitZoom, this);
    this.fitZoom();

    const cleanup = () => {
      if (this.cleaned) return;
      this.cleaned = true;
      for (const [ev, fn] of this.handlers) this.socket.off(ev, fn);
      this.scale.off('resize', this.fitZoom, this);
    };
    this.events.once('shutdown', cleanup);
    this.events.once('destroy', cleanup);
  }

  // ---------- drawing the map ----------

  drawMap() {
    const g = this.add.graphics();
    if (this.map.id === 'forest') this.drawForest(g);
    else if (this.map.id === 'circus') this.drawCircus(g);
    else this.drawMansion(g);
    const key = `map-${this.map.id}`;
    g.generateTexture(key, this.map.pixelWidth, this.map.pixelHeight);
    g.destroy();
    this.add.image(0, 0, key).setOrigin(0, 0);
  }

  drawMansion(g) {
    const map = this.map;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const c = map.tiles[ty][tx];
        const x = tx * T;
        const y = ty * T;
        if (c === '#') {
          g.fillStyle(0x2a2233).fillRect(x, y, T, T);
          g.fillStyle(0x3a3047).fillRect(x, y, T, 6);
          g.lineStyle(1, 0x1a1420).strokeRect(x, y, T, T);
          continue;
        }
        // Wooden floor planks
        g.fillStyle((tx + ty) % 2 ? 0x2b1f18 : 0x30231b).fillRect(x, y, T, T);
        g.lineStyle(1, 0x21170f, 0.8).lineBetween(x, y + 10, x + T, y + 10).lineBetween(x, y + 21, x + T, y + 21);
        if (c === 'T') {
          g.fillStyle(0x5a3a22).fillRoundedRect(x + 3, y + 3, T - 6, T - 6, 4);
          g.lineStyle(2, 0x3c2513).strokeRoundedRect(x + 3, y + 3, T - 6, T - 6, 4);
        } else if (c === 'H') {
          g.fillStyle(0x4a2a14).fillRect(x + 2, y + 2, T - 4, T - 4);
          g.lineStyle(2, 0x2a170a).strokeRect(x + 2, y + 2, T - 4, T - 4);
          g.lineStyle(1, 0x2a170a).lineBetween(x + T / 2, y + 4, x + T / 2, y + T - 4);
          g.fillStyle(0xc9a227).fillCircle(x + T / 2 - 4, y + T / 2, 1.8).fillCircle(x + T / 2 + 4, y + T / 2, 1.8);
        } else if (c === 'L') {
          g.fillStyle(0x6b5d3f).fillCircle(x + T / 2, y + T / 2, 6);
          g.fillStyle(0xfff3c4, 0.6).fillCircle(x + T / 2, y + T / 2, 3);
        }
      }
    }
  }

  // Two passes: ground everywhere first, then thickets, trees and logs on top,
  // so canopies can spill over neighbouring tiles.
  drawForest(g) {
    const map = this.map;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const x = tx * T;
        const y = ty * T;
        g.fillStyle((tx + ty) % 2 ? 0x15211a : 0x17251b).fillRect(x, y, T, T);
        if (rnd(tx, ty) < 0.45) {
          g.fillStyle(0x223a26).fillRect(x + rnd(ty, tx) * 26, y + rnd(tx + 9, ty) * 26, 2, 4);
        }
        if (rnd(tx + 3, ty + 7) < 0.12) g.fillStyle(0x2b2219).fillCircle(x + 16, y + 16, 3); // leaf litter
      }
    }
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const c = map.tiles[ty][tx];
        const x = tx * T;
        const y = ty * T;
        const cx = x + T / 2;
        const cy = y + T / 2;
        if (c === '#') {
          g.fillStyle(0x0a120c).fillRect(x, y, T, T);
          for (let i = 0; i < 3; i++) {
            g.fillStyle(i % 2 ? 0x1b3320 : 0x203c26)
              .fillCircle(x + 6 + rnd(tx + i, ty) * 20, y + 6 + rnd(tx, ty + i) * 20, 11 + rnd(tx * i, ty) * 5);
          }
        } else if (c === 'T') {
          if (rnd(tx, ty + 1) < 0.25) {
            g.fillStyle(0x4b4f55).fillRoundedRect(x + 4, y + 6, T - 8, T - 12, 7); // boulder
            g.fillStyle(0x62676e).fillRoundedRect(x + 7, y + 8, T - 18, 6, 3);
          } else {
            g.fillStyle(0x3d2a1c).fillCircle(cx, cy + 3, 6); // trunk peeking out
            g.fillStyle(0x24452b).fillCircle(cx, cy, 14);
            g.fillStyle(0x30593a).fillCircle(cx - 3, cy - 3, 8);
          }
        } else if (c === 'H') {
          g.fillStyle(0x5b3a1f).fillRoundedRect(x + 1, y + 8, T - 2, 16, 6); // hollow log
          g.lineStyle(1, 0x3a2412).lineBetween(x + 4, y + 13, x + T - 10, y + 13).lineBetween(x + 4, y + 19, x + T - 10, y + 19);
          g.fillStyle(0x3a2412).fillCircle(x + T - 7, cy, 7);
          g.fillStyle(0x0d0704).fillCircle(x + T - 7, cy, 4.5);
          g.fillStyle(0x3f6b2e).fillCircle(x + 7, y + 9, 3); // moss
        } else if (c === 'L') {
          for (let i = 0; i < 5; i++) {
            g.fillStyle(0xe6ff7a, 0.85).fillCircle(x + 4 + rnd(tx + i, ty * 2) * 24, y + 4 + rnd(tx * 2, ty + i) * 24, 1.3);
          }
        }
      }
    }
  }

  // Sawdust everywhere, a red ring inside the big top, then striped canvas walls,
  // crates, hay bales and pedestals, painted wagons to hide in, and strings of bulbs.
  drawCircus(g) {
    const map = this.map;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const x = tx * T;
        const y = ty * T;
        g.fillStyle((tx + ty) % 2 ? 0x3a2b1b : 0x3f2f1e).fillRect(x, y, T, T);
        if (rnd(tx, ty) < 0.5) g.fillStyle(0x5a4429).fillRect(x + rnd(ty, tx) * 28, y + rnd(tx + 5, ty) * 28, 3, 2);
      }
    }
    // The ring under the big top
    const rx = 20 * T;
    const ry = 15 * T;
    g.fillStyle(0x4a1219).fillEllipse(rx, ry, 15 * T, 11 * T);
    g.fillStyle(0x5a1820).fillEllipse(rx, ry, 9.5 * T, 6.5 * T);
    g.lineStyle(5, 0xc9a227, 0.7).strokeEllipse(rx, ry, 9.5 * T, 6.5 * T);
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const c = map.tiles[ty][tx];
        const x = tx * T;
        const y = ty * T;
        const cx = x + T / 2;
        const cy = y + T / 2;
        if (c === '#') {
          // red-and-cream tent canvas
          g.fillStyle(0x8e1b2a).fillRect(x, y, T / 2, T);
          g.fillStyle(0xcdbd96).fillRect(x + T / 2, y, T / 2, T);
          g.fillStyle(0x000000, 0.25).fillRect(x, y + T - 6, T, 6);
          g.fillStyle(0xc9a227).fillRect(x, y, T, 3);
        } else if (c === 'T') {
          const inRing = ((tx + 0.5 - 20) / 7.5) ** 2 + ((ty + 0.5 - 15) / 5.5) ** 2 < 1;
          const kind = rnd(tx + 2, ty + 3);
          if (inRing) {
            g.fillStyle(0x2f6fb5).fillCircle(cx, cy, 13); // pedestal
            g.lineStyle(3, 0xc9a227).strokeCircle(cx, cy, 13);
            g.fillStyle(0xf2e6c9).fillTriangle(cx, cy - 7, cx - 6, cy + 4, cx + 6, cy + 4).fillTriangle(cx, cy + 7, cx - 6, cy - 4, cx + 6, cy - 4);
          } else if (kind < 0.5) {
            g.fillStyle(0x6b4a2a).fillRect(x + 3, y + 3, T - 6, T - 6); // crate
            g.lineStyle(2, 0x3f2a14).strokeRect(x + 3, y + 3, T - 6, T - 6)
              .lineBetween(x + 4, y + 4, x + T - 4, y + T - 4).lineBetween(x + T - 4, y + 4, x + 4, y + T - 4);
          } else {
            g.fillStyle(0xc9a44a).fillRoundedRect(x + 2, y + 5, T - 4, T - 10, 5); // hay bale
            g.lineStyle(1, 0x8a6a22).lineBetween(x + 4, y + 12, x + T - 4, y + 12).lineBetween(x + 4, y + 19, x + T - 4, y + 19);
          }
        } else if (c === 'H') {
          g.fillStyle(0x4b2a6b).fillRoundedRect(x + 1, y + 3, T - 2, T - 9, 4); // painted wagon
          g.lineStyle(2, 0xc9a227).strokeRoundedRect(x + 1, y + 3, T - 2, T - 9, 4);
          g.fillStyle(0xc9a227).fillCircle(cx, y + 12, 2.5);
          g.fillStyle(0x1a0f08).fillCircle(x + 8, y + T - 4, 4).fillCircle(x + T - 8, y + T - 4, 4);
        } else if (c === 'L') {
          g.lineStyle(1, 0x222222).lineBetween(x, y + 10, x + T, y + 14);
          [0xff5a5a, 0xffd54f, 0x6ad1ff, 0x9dff7a].forEach((col, i) => g.fillStyle(col).fillCircle(x + 4 + i * 8, y + 11 + i, 2.6));
        }
      }
    }
  }

  // The exit door in the outer wall: locked bars until every coin is collected, then it glows.
  drawExit(open) {
    const { x, y } = this.map.exit;
    const g = this.exitG.clear();
    g.fillStyle(0x0c0a10).fillRect(x - T / 2, y - T / 2, T, T);
    if (open) {
      g.fillStyle(0x7dffa0, 0.35).fillRect(x - T / 2 + 2, y - T / 2 + 2, T - 4, T - 4);
      g.lineStyle(3, 0x7dffa0).strokeRect(x - T / 2 + 1, y - T / 2 + 1, T - 2, T - 2);
    } else {
      g.fillStyle(0x3a2a1a).fillRect(x - T / 2 + 3, y - T / 2 + 3, T - 6, T - 6);
      g.lineStyle(2, 0x6b6f78);
      for (let i = -9; i <= 9; i += 6) g.lineBetween(x + i, y - T / 2 + 3, x + i, y + T / 2 - 3);
      g.fillStyle(0xc9a227).fillRoundedRect(x - 5, y - 2, 10, 8, 2); // padlock
      g.lineStyle(2, 0xc9a227).strokeCircle(x, y - 3, 3.5);
    }
    this.exitLabel.setVisible(open);
  }

  // Bakes a skin in a player's color into a texture (drawn at 2x for sharpness).
  skinTexture(skin, color) {
    const key = `skin-${skin}-${color}`;
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, 64, 64);
      const ctx = tex.getContext();
      ctx.scale(2, 2);
      ctx.translate(16, 16);
      drawSkin(ctx, skin, color);
      tex.refresh();
    }
    return key;
  }

  makeLightTexture() {
    if (this.textures.exists('light')) return;
    const tex = this.textures.createCanvas('light', 256, 256);
    const ctx = tex.getContext();
    const grd = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.92)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 256);
    tex.refresh();
  }

  makeSurvivor(s) {
    const isMe = s.id === this.myId;
    // A ring in the player's color (white for you) under the skin, so everyone stays easy to tell apart.
    const ring = this.add.graphics();
    ring.fillStyle(0x000000, 0.35).fillCircle(0, 0, C.PLAYER_RADIUS + 2);
    ring.lineStyle(isMe ? 3 : 2, isMe ? 0xffffff : hex(s.color)).strokeCircle(0, 0, C.PLAYER_RADIUS + 2);
    const torch = this.add.graphics();
    torch.fillStyle(0xfff2a8).fillRect(9, -2.5, 8, 5);
    const skin = this.add.image(0, 0, this.skinTexture(s.skin, s.color)).setDisplaySize(32, 32);
    const label = this.add.text(0, -26, s.name, {
      fontFamily: 'Inter, sans-serif', fontSize: '11px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    // Cage bars, shown while the survivor is trapped.
    const cage = this.add.graphics();
    cage.lineStyle(2, 0xb8bcc6);
    for (let i = -12; i <= 12; i += 6) cage.lineBetween(i, -16, i, 16);
    cage.lineStyle(3, 0x8a8f99).lineBetween(-14, -16, 14, -16).lineBetween(-14, 16, 14, 16);
    cage.setVisible(false);
    const c = this.add.container(s.x, s.y, [ring, torch, skin, cage, label]).setDepth(D.players);
    c.torch = torch;
    c.skin = skin;
    c.cage = cage;
    c.target = { x: s.x, y: s.y };
    return c;
  }

  // Bakes a monster into a texture (drawn at 2x for sharpness), centered on its body.
  monsterTexture(type) {
    const key = `monster-${type}`;
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, 160, 160);
      const ctx = tex.getContext();
      ctx.scale(2, 2);
      ctx.translate(40, 40);
      drawMonster(ctx, type);
      tex.refresh();
    }
    return key;
  }

  makeMonster(m) {
    const body = this.add.image(0, 0, this.monsterTexture(m.type)).setDisplaySize(80, 80);
    const parts = [body];
    // Fellow monster players get a name tag so the hunters can tell each other apart.
    if (this.role === 'monster' && !m.isAI) {
      parts.push(this.add.text(0, -30, m.name, {
        fontFamily: 'Inter, sans-serif', fontSize: '11px', color: '#ffb3c1', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5));
    }
    const c = this.add.container(m.x, m.y, parts).setDepth(D.monster);
    c.target = { x: m.x, y: m.y };
    c.body = body;
    c.type = m.type;
    c.monsterId = m.id;
    return c;
  }

  makeCoin(coin) {
    const g = this.add.graphics().setDepth(D.coins);
    g.fillStyle(0xb8860b).fillCircle(0, 0, 7);
    g.fillStyle(0xffd54f).fillCircle(0, 0, 5.5);
    g.fillStyle(0xfff3b0).fillCircle(-1.5, -1.5, 1.8);
    g.setPosition(coin.x, coin.y);
    g.baseY = coin.y;
    g.phase = Math.random() * Math.PI * 2;
    return g;
  }

  fitZoom() {
    const { width, height } = this.scale;
    const zoom = Phaser.Math.Clamp(Math.min(width / 960, height / 640), 0.5, 1.6);
    this.cameras.main.setZoom(zoom);
  }

  // ---------- input ----------

  setupInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT');
    const act = (type) => this.socket.emit('action', { type });
    this.input.keyboard.on('keydown-E', () => act('interact'));
    this.input.keyboard.on('keydown-SPACE', () => act('interact'));
    if (this.role === 'monster' && this.powers) {
      this.input.keyboard.on('keydown-Q', () => act('lightsOn'));
      this.input.keyboard.on('keydown-R', () => act('blackout'));
    }
  }

  sendInput() {
    const k = this.keys;
    const tx = touchInput.dx;
    const ty = touchInput.dy;
    const input = {
      up: k.W.isDown || k.UP.isDown || ty < -0.35,
      down: k.S.isDown || k.DOWN.isDown || ty > 0.35,
      left: k.A.isDown || k.LEFT.isDown || tx < -0.35,
      right: k.D.isDown || k.RIGHT.isDown || tx > 0.35,
      sprint: k.SHIFT.isDown || touchInput.sprint,
    };
    const key = JSON.stringify(input);
    if (key !== this.lastInput) {
      this.lastInput = key;
      this.socket.emit('input', input);
    }
  }

  // ---------- network ----------

  setupSocket() {
    this.handlers = [
      ['state', (s) => this.onState(s)],
      ['noise', (n) => this.ring(n.x, n.y, 0xff3355, 70)],
      ['search', ({ spotId, found }) => {
        const spot = this.map.hidingSpots[spotId];
        this.ring(spot.x, spot.y, found ? 0xff2222 : 0xffffff, 40);
        sfx.search();
      }],
      ['caught', ({ id }) => {
        if (id === this.myId) {
          this.cameras.main.shake(400, 0.012);
          this.cameras.main.flash(500, 120, 0, 0);
        }
        sfx.caught();
      }],
      ['power', ({ name }) => (name === 'lightsOn' ? sfx.lightsOn() : sfx.blackoutWarn())],
    ];
    for (const [ev, fn] of this.handlers) this.socket.on(ev, fn);
  }

  onState(s) {
    const offset = s.t - Date.now();
    this.offset = this.offset === null ? offset : this.offset + (offset - this.offset) * 0.1;
    if (this.latest?.self?.coins !== undefined && s.self.coins > this.latest.self.coins) sfx.coin();
    if (this.latest?.self && this.latest.self.hiddenSpot !== s.self.hiddenSpot && s.self.hiddenSpot !== null) sfx.hide();
    this.latest = s;

    // Coins
    const coinIds = new Set(s.coins.map((c) => c.id));
    for (const [id, g] of this.coinSprites) if (!coinIds.has(id)) { g.destroy(); this.coinSprites.delete(id); }
    for (const c of s.coins) if (!this.coinSprites.has(c.id)) this.coinSprites.set(c.id, this.makeCoin(c));

    // Survivors (the monster only receives the ones it can see)
    const seen = new Set();
    for (const p of s.survivors) {
      seen.add(p.id);
      let sprite = this.survivorSprites.get(p.id);
      if (!sprite) { sprite = this.makeSurvivor(p); this.survivorSprites.set(p.id, sprite); }
      sprite.target = { x: p.x, y: p.y };
      sprite.facing = p.facing;
      sprite.hidden = p.hidden;
      sprite.trapped = p.trapped;
      sprite.rescue = p.rescue;
      sprite.safe = p.safe;
    }
    if (this.exitShownOpen !== s.exitOpen) {
      this.exitShownOpen = s.exitOpen;
      this.drawExit(s.exitOpen);
    }
    // The last few coins sparkle through the dark so nobody hunts forever.
    const reveal = s.coins.length <= C.LAST_COINS_REVEALED;
    for (const g of this.coinSprites.values()) g.setDepth(reveal ? D.reveal : D.coins);
    for (const [id, sprite] of this.survivorSprites) {
      if (!seen.has(id)) { sprite.destroy(); this.survivorSprites.delete(id); }
    }

    for (const m of s.monsters) {
      let sprite = this.monsterSprites.get(m.id);
      if (!sprite) { sprite = this.makeMonster(m); this.monsterSprites.set(m.id, sprite); }
      sprite.target = { x: m.x, y: m.y };
    }
  }

  myMonster() {
    return this.monsterSprites.get(this.latest?.self.monsterId);
  }

  nearestMonsterDistance(x, y) {
    let best = Infinity;
    for (const m of this.monsterSprites.values()) best = Math.min(best, Phaser.Math.Distance.Between(x, y, m.x, m.y));
    return best;
  }

  // ---------- per-frame ----------

  update(_time, delta) {
    this.sendInput();
    const s = this.latest;
    if (!s) return;
    const now = Date.now() + (this.offset ?? 0);
    const k = Math.min(1, (delta / 1000) * 14);

    const glide = (sprite) => {
      const dx = sprite.target.x - sprite.x;
      const dy = sprite.target.y - sprite.y;
      if (Math.hypot(dx, dy) > 120) sprite.setPosition(sprite.target.x, sprite.target.y);
      else sprite.setPosition(sprite.x + dx * k, sprite.y + dy * k);
    };

    // Survivors
    this.revealG.clear();
    for (const [id, sprite] of this.survivorSprites) {
      glide(sprite);
      sprite.torch.setRotation(sprite.facing ?? 0);
      if (sprite.facing !== undefined) sprite.skin.setFlipX(Math.cos(sprite.facing) < -0.1);
      sprite.cage.setVisible(!!sprite.trapped);
      if (sprite.trapped && sprite.rescue > 0) {
        // Rescue meter: fills as a friend stands by.
        const t = Math.min(1, sprite.rescue / s.rescueMs);
        this.revealG.lineStyle(4, 0x000000, 0.5).strokeCircle(sprite.x, sprite.y, 22);
        this.revealG.lineStyle(4, 0x7ee08a).beginPath()
          .arc(sprite.x, sprite.y, 22, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2).strokePath();
      }
      if (this.role === 'monster' && sprite.hidden) {
        // We watched them dive into this hiding spot: show a pulsing outline, not the survivor.
        sprite.setVisible(false);
        const pulse = 0.5 + 0.5 * Math.sin(now / 120);
        this.revealG.lineStyle(3, 0xff3355, 0.4 + 0.6 * pulse).strokeRect(sprite.target.x - 17, sprite.target.y - 17, 34, 34);
      } else {
        sprite.setVisible(true);
        const flicker = sprite.safe && Math.sin(now / 60) > 0; // just freed: blinks while it can't be caught
        sprite.setAlpha(sprite.hidden ? 0.35 : sprite.trapped ? 0.75 : flicker ? 0.4 : 1);
      }
      if (id === this.myId) sprite.setDepth(D.players + 1);
    }

    for (const sprite of this.monsterSprites.values()) {
      glide(sprite);
      if (sprite.type === 'ghost') {
        sprite.body.y = Math.sin(now / 260) * 3; // hovering
        sprite.setAlpha(0.7 + 0.2 * Math.sin(now / 400));
      }
    }
    for (const g of this.coinSprites.values()) {
      g.y = g.baseY + Math.sin(now / 300 + g.phase) * 1.5;
      if (g.depth === D.reveal) g.setScale(1 + 0.25 * Math.sin(now / 150 + g.phase));
    }
    if (s.exitOpen) this.exitLabel.setScale(1 + 0.08 * Math.sin(now / 200));

    this.followCamera();
    this.drawDarkness(s, now);
    this.heartbeat(now);
    this.footsteps(now);
    this.sting(now);
  }

  // Your own steps, and heavy footfalls from any monster close enough to hear.
  footsteps(now) {
    const mine = this.role === 'monster' ? this.myMonster() : this.survivorSprites.get(this.myId);
    const walkers = [...this.monsterSprites.values(), ...(mine && this.role === 'survivor' ? [mine] : [])];
    for (const w of walkers) {
      const moved = w.lastStepPos ? Phaser.Math.Distance.Between(w.x, w.y, w.lastStepPos.x, w.lastStepPos.y) : 0;
      w.lastStepPos = { x: w.x, y: w.y };
      w.stride = (w.stride ?? 0) + Math.min(moved, 20);
      const isMonster = this.monsterSprites.has(w.monsterId);
      if (w.stride < (isMonster ? 46 : 38)) continue;
      w.stride = 0;
      if (!isMonster) { sfx.step(this.lastInput.includes('"sprint":true')); continue; }
      if (w === mine) { sfx.monsterStep(0.05); continue; }
      const me = this.role === 'survivor' ? mine : this.myMonster();
      const d = me ? Phaser.Math.Distance.Between(me.x, me.y, w.x, w.y) : Infinity;
      if (d < 320) sfx.monsterStep(0.12 * (1 - d / 320));
    }
  }

  // A sting the moment a monster steps into a survivor's light.
  sting(now) {
    if (this.role !== 'survivor' || !this.latest.self.alive) return;
    const me = this.survivorSprites.get(this.myId);
    if (!me) return;
    const inView = this.nearestMonsterDistance(me.x, me.y) < this.rules.survivorLight;
    if (inView && !this.monsterInView && now >= this.nextSting) {
      sfx.sting();
      this.cameras.main.shake(180, 0.004);
      this.nextSting = now + 6000;
    }
    this.monsterInView = inView;
  }

  followCamera() {
    let focus;
    if (this.role === 'monster') focus = this.myMonster();
    else focus = this.survivorSprites.get(this.myId) ?? this.survivorSprites.values().next().value; // spectate when caught
    if (focus && focus !== this.following) {
      this.cameras.main.startFollow(focus, true, 0.15, 0.15);
      this.following = focus;
    }
  }

  drawDarkness(s, now) {
    const lightsOn = now < s.lightsOnUntil;
    const blackout = now >= s.blackoutStart && now < s.blackoutUntil;
    const warning = !blackout && s.blackoutStart > now && s.blackoutStart - now < 1500;

    const erase = (x, y, radius) => {
      if (radius <= 0) return;
      this.brush.setScale(radius / 128);
      this.dark.erase(this.brush, x, y);
    };
    this.dark.clear();
    const forest = this.map.id === 'forest';
    this.dark.fill(forest ? 0x010403 : 0x030207, lightsOn ? 0.28 : forest ? 0.985 : 0.97);
    if (s.exitOpen) erase(this.map.exit.x, this.map.exit.y, 90); // the open door is a beacon for everyone


    if (this.role === 'monster') {
      // Your own sight, plus a smaller glow around the other monsters.
      const mine = this.myMonster();
      for (const sprite of this.monsterSprites.values()) {
        erase(sprite.x, sprite.y, sprite === mine ? C.MONSTER_LIGHT : this.rules.teammateLight);
      }
    } else {
      for (const [id, sprite] of this.survivorSprites) {
        const isMe = id === this.myId;
        let r = isMe ? this.rules.survivorLight : this.rules.teammateLight;
        if (sprite.hidden) r = isMe ? 55 : 0; // peeking out through the wardrobe slats
        if (sprite.trapped) r = isMe ? 70 : 60; // a dim glow so friends can find the cage
        if (blackout) r = isMe ? 26 : 0;
        if (warning && Math.random() < 0.4) r *= 0.4; // flashlight sputters before a blackout
        erase(sprite.x, sprite.y, r);
      }
    }

    this.map.flickerLights.forEach((l, i) => {
      if (flickerOn(i, now)) erase(l.x, l.y, this.rules.flickerLight);
    });
  }

  heartbeat(now) {
    if (this.role !== 'survivor' || !this.latest.self.alive) return;
    const me = this.survivorSprites.get(this.myId);
    if (!me) return;
    const d = this.nearestMonsterDistance(me.x, me.y);
    if (d < 260 && now >= this.nextHeartbeat) {
      sfx.heartbeat(0.08 + 0.25 * (1 - d / 260));
      this.nextHeartbeat = now + 350 + (d / 260) * 700;
    }
  }

  ring(x, y, color, size) {
    const g = this.add.graphics().setDepth(D.fx).setPosition(x, y);
    g.lineStyle(3, color, 1).strokeCircle(0, 0, size / 2);
    g.setScale(0.3);
    this.tweens.add({ targets: g, scale: 1.5, alpha: 0, duration: 900, onComplete: () => g.destroy() });
  }
}
