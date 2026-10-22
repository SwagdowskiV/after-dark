import { useEffect, useState } from 'react';
import { socket } from './socket.js';
import Menu from './screens/Menu.jsx';
import Lobby from './screens/Lobby.jsx';
import GameScreen from './screens/GameScreen.jsx';
import Results from './screens/Results.jsx';

// Screens follow the flowchart: Menu -> Lobby -> Game -> Results -> (Play again) Lobby
export default function App() {
  const [screen, setScreen] = useState('menu');
  const [lobby, setLobby] = useState(null);
  const [round, setRound] = useState(null);
  const [results, setResults] = useState(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onLobby = (l) => setLobby(l);
    const onRoundStart = (r) => { setRound({ ...r, key: Date.now() }); setScreen('game'); };
    const onResults = (r) => { setResults(r); setScreen('results'); };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => { setConnected(false); setScreen('menu'); setLobby(null); };
    socket.on('lobby', onLobby);
    socket.on('roundStart', onRoundStart);
    socket.on('results', onResults);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnected(socket.connected); // it may have connected before these listeners were attached
    return () => {
      socket.off('lobby', onLobby);
      socket.off('roundStart', onRoundStart);
      socket.off('results', onResults);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const leave = () => { socket.emit('leaveRoom'); setLobby(null); setScreen('menu'); };

  return (
    <>
      {!connected && <div className="offline">Connecting to the mansion… is the server running?</div>}
      {screen === 'menu' && <Menu onJoined={() => setScreen('lobby')} />}
      {screen === 'lobby' && lobby && <Lobby lobby={lobby} myId={socket.id} onLeave={leave} />}
      {screen === 'game' && round && <GameScreen key={round.key} round={round} myId={socket.id} />}
      {screen === 'results' && results && (
        <Results
          results={results}
          myId={socket.id}
          onPlayAgain={() => { socket.emit('returnToLobby'); setScreen('lobby'); }}
          onLeave={leave}
        />
      )}
    </>
  );
}
