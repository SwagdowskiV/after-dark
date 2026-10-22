import { useEffect, useRef } from 'react';
import { socket } from '../socket.js';
import { createGame } from '../game/createGame.js';
import Hud from '../components/Hud.jsx';
import TouchControls from '../components/TouchControls.jsx';

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export default function GameScreen({ round, myId }) {
  const holder = useRef(null);

  useEffect(() => {
    const game = createGame(holder.current, { socket, myId, role: round.role, mapId: round.mapId, powers: round.powers });
    return () => game.destroy(true);
  }, [round, myId]);

  return (
    <div className="game-wrap">
      <div ref={holder} className="game-canvas" />
      <Hud round={round} myId={myId} />
      {isTouch && <TouchControls role={round.role} />}
    </div>
  );
}
