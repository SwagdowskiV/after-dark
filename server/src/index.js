import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Room } from './room.js';
import * as C from '../../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3101;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.get('/health', (_req, res) => res.json({ ok: true })); // before the page fallback, so hosts' health checks get JSON

// In production (npm run build, then npm start) this server also hosts the game page.
const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) res.sendFile(path.join(dist, 'index.html'));
    else next();
  });
}

const rooms = new Map(); // code -> Room

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanProfile({ name, color, skin } = {}) {
  return {
    name: String(name ?? '').trim().slice(0, 16) || 'Survivor',
    color: C.SURVIVOR_COLORS.includes(color) ? color : C.SURVIVOR_COLORS[0],
    skin: C.SURVIVOR_SKINS.includes(skin) ? skin : C.SURVIVOR_SKINS[0],
  };
}

io.on('connection', (socket) => {
  let room = null;

  const leave = () => {
    if (!room) return;
    room.removePlayer(socket.id, Date.now());
    socket.leave(room.code);
    if (room.isEmpty) rooms.delete(room.code);
    room = null;
  };

  socket.on('createRoom', (profile, ack) => {
    leave();
    room = new Room(makeCode(), io);
    rooms.set(room.code, room);
    room.addPlayer(socket, cleanProfile(profile));
    ack?.({ ok: true, code: room.code, id: socket.id });
  });

  socket.on('joinRoom', ({ code, ...profile } = {}, ack) => {
    const target = rooms.get(String(code ?? '').trim().toUpperCase());
    if (!target) return ack?.({ ok: false, error: 'No room with that code.' });
    if (target.phase === 'playing') return ack?.({ ok: false, error: 'That round is already in progress. Try again when it ends.' });
    if (!target.hasSeatForHuman()) return ack?.({ ok: false, error: 'That room is full.' });
    leave();
    room = target;
    room.addPlayer(socket, cleanProfile(profile));
    ack?.({ ok: true, code: room.code, id: socket.id });
  });

  socket.on('leaveRoom', leave);
  socket.on('setReady', (v) => room?.setReady(socket.id, v));
  socket.on('setWantsMonster', (v) => room?.setWantsMonster(socket.id, v));
  socket.on('updateSettings', (s) => room?.updateSettings(socket.id, s));
  socket.on('voteMap', (choice) => room?.setMapVote(socket.id, choice));
  socket.on('addBot', () => room?.addBot(socket.id));
  socket.on('removeBot', (botId) => room?.removeBot(socket.id, botId));
  socket.on('input', (input) => room?.handleInput(socket.id, input));
  socket.on('action', (a) => room?.handleAction(socket.id, a?.type, Date.now()));
  socket.on('returnToLobby', () => room?.returnToLobby());
  socket.on('disconnect', leave);
});

// One shared clock drives every room.
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const room of rooms.values()) room.update(dt, now);
}, 1000 / C.TICK_RATE);

server.listen(PORT, () => {
  console.log(`AFTER DARK server running on http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets ?? []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`  on your network: http://${n.address}:${PORT}`);
    }
  }
});
