// Tiny synthesized sound effects (no audio files needed).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('afterdark-muted') === '1'; } catch { /* storage unavailable */ }

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('afterdark-muted', v ? '1' : '0'); } catch { /* ignore */ }
}

function audio() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// A short burst of filtered noise: footsteps and scrapes.
function noise(dur, { vol = 0.05, freq = 900, q = 1, delay = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = a.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t);
}

function tone(freq, dur, { type = 'sine', vol = 0.15, slideTo = null, delay = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  click: () => tone(520, 0.06, { type: 'triangle', vol: 0.08 }),
  coin: () => { tone(988, 0.07, { type: 'square', vol: 0.05 }); tone(1480, 0.12, { type: 'square', vol: 0.05, delay: 0.06 }); },
  caught: () => tone(220, 0.9, { type: 'sawtooth', vol: 0.12, slideTo: 50 }),
  lightsOn: () => { tone(120, 0.05, { type: 'square', vol: 0.12 }); tone(60, 0.6, { type: 'sawtooth', vol: 0.04, delay: 0.05 }); },
  blackoutWarn: () => { for (let i = 0; i < 4; i++) tone(1800 + Math.random() * 600, 0.03, { type: 'square', vol: 0.04, delay: i * 0.09 }); },
  search: () => tone(160, 0.25, { type: 'triangle', vol: 0.15, slideTo: 90 }),
  heartbeat: (vol = 0.2) => { tone(62, 0.12, { vol }); tone(55, 0.14, { vol: vol * 0.8, delay: 0.18 }); },
  hide: () => tone(300, 0.12, { type: 'triangle', vol: 0.07, slideTo: 200 }),
  step: (sprint) => noise(0.05, { vol: sprint ? 0.07 : 0.04, freq: 700 + Math.random() * 400, q: 0.8 }),
  monsterStep: (vol) => { noise(0.09, { vol, freq: 160, q: 1.5 }); tone(48, 0.12, { vol: vol * 0.8 }); },
  // A dissonant stab when a monster comes into view.
  sting: () => {
    for (const f of [466, 494, 523]) tone(f, 0.7, { type: 'sawtooth', vol: 0.035, slideTo: f * 0.94 });
    tone(58, 0.9, { type: 'sawtooth', vol: 0.06 });
  },
  rescueTick: () => tone(660, 0.05, { type: 'triangle', vol: 0.04 }),
  rescued: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.08, delay: i * 0.08 })),
  exitOpen: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.05, delay: i * 0.1 })); noise(0.5, { vol: 0.05, freq: 200, delay: 0.4 }); },
  escaped: () => [659, 880, 1175].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.1, delay: i * 0.09 })),
  introBoom: () => { tone(70, 1.4, { type: 'sawtooth', vol: 0.08, slideTo: 40 }); noise(1, { vol: 0.06, freq: 120 }); },
};
