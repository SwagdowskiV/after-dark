// Tuning values shared by the server (which enforces the rules)
// and the client (which draws things). Change a number here and
// both sides pick it up.

export const TILE = 32;
export const TICK_RATE = 20; // server updates per second

export const MAX_PLAYERS = 6;
export const START_COUNTDOWN_MS = 3000;
export const INTRO_MS = 3500; // everyone is frozen while the intro card shows who's hunting whom

// The host picks one difficulty: it sets the time survivors have to collect every coin
// and escape, how many coins each survivor adds to the goal, and how long freeing a
// trapped friend takes.
export const DIFFICULTIES = {
  easy: { label: 'Easy', roundLength: 210, coinsPerSurvivor: 9, rescueMs: 3000 },
  normal: { label: 'Normal', roundLength: 150, coinsPerSurvivor: 11, rescueMs: 6000 },
  hard: { label: 'Hard', roundLength: 120, coinsPerSurvivor: 13, rescueMs: 10000 },
};
export const MONSTER_COUNTS = [1, 2, 3];
export const MAP_PICK_MODES = ['host', 'vote'];
export const RANDOM_MAP = 'random'; // a map choice (or vote) that rolls one of the real maps at round start

// Movement (pixels per second)
export const PLAYER_RADIUS = 11;
export const MONSTER_RADIUS = 13;
export const WALK_SPEED = 150;
export const SPRINT_SPEED = 228;

// Sprinting
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN = 38; // per second while sprinting
export const STAMINA_REGEN = 16; // per second otherwise
export const STAMINA_MIN_TO_SPRINT = 20;

// Interaction distances
export const CATCH_RADIUS = 26;
export const INTERACT_RADIUS = 48;
export const COIN_PICKUP_RADIUS = 20;
// Survivors share one goal: collect every coin to unlock the exit. More survivors, more coins
// (a couple fewer overall, which matters most when someone plays alone).
export const coinsFor = (survivors, difficulty = 'normal') => Math.max(6, DIFFICULTIES[difficulty].coinsPerSurvivor * survivors - 2);
export const LAST_COINS_REVEALED = 5; // the last few coins show on everyone's minimap
export const ESCAPE_RADIUS = 40; // how close to the open exit door counts as getting out

// Caught survivors are trapped where they were caught until a friend stands next to them long enough.
export const RESCUE_RADIUS = 46;
export const RESCUE_DECAY = 0.5; // progress drains at half speed while nobody is helping
export const RESCUE_GRACE_MS = 2500; // a freed survivor can't be caught again straight away

// Light radius around a player-controlled monster (survivor lights are per map, below)
export const MONSTER_LIGHT = 190;

// Hiding and clues
export const HIDE_COOLDOWN_MS = 5000;
// Hiding keeps you safe, unless you dive in this close in front of the monster while it can see you.
export const HIDE_SPOTTED_RANGE = 2 * TILE;
export const SEARCH_COOLDOWN_MS = 1200;
export const NOISE_INTERVAL_MS = 700; // sprinting makes noise this often
export const NOISE_JITTER = 28; // noise shows an approximate spot, not the exact one

// AI monster fairness
export const AI_REACTION_MS = 450; // must see a new survivor this long before chasing
export const AI_MEMORY_MS = 3500; // keeps heading to where it last saw someone for this long

export const POWERS = {
  lightsOn: { label: 'Lights On', key: 'Q', cooldown: 25000, duration: 4000 },
  blackout: { label: 'Blackout', key: 'R', cooldown: 30000, duration: 3000, warning: 1200 },
};
export const POWER_START_DELAY = 8000; // powers unlock a few seconds into the round

export const SURVIVOR_COLORS = [
  '#4fc3f7', '#81c784', '#ffb74d', '#f06292',
  '#ba68c8', '#fff176', '#e0e0e0', '#ff8a65',
];
export const SURVIVOR_SKINS = ['cat', 'bat', 'child', 'pumpkin'];
export const SKIN_LABELS = { cat: 'Cat', bat: 'Bat', child: 'Child', pumpkin: 'Pumpkin Head' };

// The ghost floats through furniture and trees (but not walls), and drifts a little slower to make up for it.
export const MONSTER_TYPES = ['clown', 'witch', 'ghost'];
export const GHOST_SPEED_FACTOR = 0.92;
export const MONSTER_NAMES = { clown: 'The Clown', witch: 'The Witch', ghost: 'The Ghost' };

// Bot survivors the host can add from the lobby (handy for testing as the monster).
export const BOT_NAMES = ['Casper', 'Mabel', 'Igor', 'Elvira', 'Edgar', 'Morticia'];
// notice: how far they spot a monster (x their flashlight), reactionMs: how long before they react,
// fleeDepth/replanMs: how far ahead and how often they plan an escape route,
// hideChance: how likely they are to duck into a hiding spot when cornered,
// careful: skip coins near a monster.
export const BOT_SKILLS = {
  easy: { label: 'Easy', notice: 0.8, reactionMs: 700, fleeDepth: 8, replanMs: 900, hideChance: 0.4, careful: false },
  normal: { label: 'Normal', notice: 1.25, reactionMs: 250, fleeDepth: 14, replanMs: 500, hideChance: 0.8, careful: false },
  hard: { label: 'Hard', notice: 1.8, reactionMs: 0, fleeDepth: 18, replanMs: 300, hideChance: 1, careful: true },
};

// Per-map tuning. The forest is the hard map: weaker flashlights, fewer lights,
// a faster monster that sees further, and shorter hiding. At the circus the Clown is
// at home and moves a little faster (homeMonster).
export const HOME_SPEED_BONUS = 1.08;
export const MAP_RULES = {
  mansion: {
    label: 'Mansion', difficulty: 'Normal',
    blurb: 'Creaky halls, a wardrobe in every room and lamps that flicker on just long enough.',
    survivorLight: 150, teammateLight: 110, flickerLight: 150,
    monsterSpeed: 188, aiMonsterSpeed: 152, aiSight: 210,
    hideLimitMs: 12000,
  },
  forest: {
    label: 'Dark Forest', difficulty: 'Hard',
    blurb: 'Open woods, weak flashlights and only a few hollow logs to hide in.',
    survivorLight: 118, teammateLight: 85, flickerLight: 130,
    monsterSpeed: 200, aiMonsterSpeed: 156, aiSight: 215,
    hideLimitMs: 10000,
  },
  circus: {
    label: 'Circus', difficulty: 'Medium',
    blurb: 'A big top, striped tents and painted wagons. The Clown knows every corner of it.',
    survivorLight: 135, teammateLight: 100, flickerLight: 160,
    monsterSpeed: 192, aiMonsterSpeed: 154, aiSight: 212,
    hideLimitMs: 11000,
    homeMonster: 'clown',
  },
};
