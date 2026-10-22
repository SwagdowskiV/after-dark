import Phaser from 'phaser';
import MansionScene from './MansionScene.js';

export function createGame(parent, data) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#000000',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    render: { antialias: true },
    audio: { noAudio: true }, // sounds come from sfx.js
  });
  game.scene.add('mansion', MansionScene, true, data);
  return game;
}
