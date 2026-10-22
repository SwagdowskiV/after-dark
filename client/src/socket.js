import { io } from 'socket.io-client';

// Same origin in both dev (Vite proxies /socket.io) and production (Node serves the page).
export const socket = io({ autoConnect: true });

// Shared between the touch controls (React) and the game scene (Phaser).
export const touchInput = { dx: 0, dy: 0, sprint: false };
