# AFTER DARK: The Haunted House

Multiplayer survival horror in the browser, for 1–6 players. Survivors team up to collect every coin in a dark mansion, a creepy circus or a darker forest, which unlocks the exit, and then try to escape. Up to three monsters (a clown, a witch and a ghost, played by people or the AI) hunt them down. Caught survivors are trapped until a friend frees them.

## Run it in VS Code

1. Install **Node.js 20 or newer** from https://nodejs.org (check with `node -v`).
2. In VS Code, use **File → Open Folder…** and pick this `after-dark` folder.
3. Open a terminal (**Terminal → New Terminal**) and run:
   ```
   npm install
   npm run dev
   ```
4. Open **http://localhost:5180** in your browser. Click **Create room**, then **Ready**. With the monsters played by the AI, one player is enough to test.

**Testing as the monster by yourself:** in the lobby, set The hunt to **Players hunt**, click **I want to hunt**, click the empty spots on the porch to add bots, then **Ready**. Bots are survivors that collect coins, run when they see you, hide when cornered, free each other and make for the exit.

To test multiplayer by yourself, open a second browser window (or an incognito window), join with the 4-letter room code, and ready up in both.

**Friends on the same Wi-Fi:** the Vite terminal prints a `Network:` address such as `http://192.168.1.20:5180`. They open that on their phone or laptop. If Windows asks about the firewall, allow Node.js on private networks.

You can also press **Ctrl+Shift+B** to start the game (the "Run AFTER DARK" task), and use the Run & Debug panel to debug the server with breakpoints.

## Controls

| | Survivor | Monster |
|---|---|---|
| Move | WASD / arrow keys | WASD / arrow keys |
| Sprint | Shift (makes noise the monster can track) | — |
| E or Space | Hide in / leave a hiding spot | Search the nearest hiding spot |
| Stand next to a cage | Free a trapped friend | — |
| Q | — | Lights On (4s, 25s cooldown) |
| R | — | Blackout (3s after a short warning, 30s cooldown) |

On phones you get an on-screen joystick plus Sprint and Hide/Search buttons.

## Rules in this version

**The goal.** Survivors share one coin goal. Once every coin has been picked up, the exit door unlocks (it glows green, and the HUD points to it), and anyone who reaches it escapes. Survivors win if at least one of them gets out before time runs out. Monsters win if nobody escapes, either because everyone is caught or because the clock ran out. Hiding until the timer ends no longer wins.

**Getting caught and rescued.** A caught survivor is trapped in a cage on the spot. A friend who stands next to them fills a rescue meter (it drains slowly if they step away). When it's full, the trapped survivor is free, with a couple of seconds where they can't be caught again. Trapped friends show on survivors' minimaps.

**Difficulty** (the host picks one):

| | Time | Coins per survivor | Time to free a friend |
|---|---|---|---|
| Easy | 3½ min | 9 | 3s |
| Normal | 2½ min | 11 | 6s |
| Hard | 2 min | 13 | 10s |

The coin goal is coins-per-survivor × survivors, minus 2, so playing alone isn't hopeless. The last 5 coins sparkle through the dark and show on everyone's minimap. All of these numbers are in `DIFFICULTIES` and `coinsFor` in `shared/constants.js`.

- **Lobby:** everyone stands on a porch under a lantern that lights up when they're ready, and the chosen monsters lurk behind them. The host adds bots by clicking an empty spot and sets their skill (Easy, Normal or Hard). A person joining a full room takes a bot's place. Maps are preview cards: the host picks one (or **Random**), or switches to **Everyone votes**, where the most-voted map wins and ties are settled at random.
- **Intro:** each round opens with a title card showing the map, who's hunting and what your job is. Everyone is frozen while it's up.
- **Several monsters:** the host can set 1–3 monsters. Extra monsters are the other characters, so they look different. In "Players hunt" mode, people who ticked "I want to hunt" fill the monster spots first, and the AI plays any spots nobody takes. Monster players can see a little around their fellow monsters and share what they see. With 4 or more survivors, 2 monsters keeps it tense.
- **Powers on/off:** the host can switch off Lights On and Blackout for the whole round.
- **Maps:** the **Mansion** (normal), the **Circus** (medium) and the **Dark Forest** (hard). The forest has weaker flashlights, fewer lights and hiding logs, and only 10 seconds of hiding. The Circus has a big top in the middle, striped tents in the corners and wagons to hide in, and **the Clown is at home there and moves 8% faster**. The per-map numbers are in `MAP_RULES` in `shared/constants.js`.
- **Monsters:** the Clown and the Witch play the same (except the Clown's circus bonus). **The Ghost** floats through furniture and trees (but not walls) and moves a little slower to make up for it.
- **The AI monster plays fair:** it needs a moment to react when it first spots someone and gives up a chase fairly quickly. Once the exit is open it likes to guard it, and it checks back on survivors it has trapped. Run `npm run balance` to see how often bot survivors win against it (`node tools/balance.js 30 hard normal 2` means 30 rounds per map and monster, Hard difficulty, Normal bots, 2 survivors).
- **Bots:** they only notice coins inside their flashlight beam, like a person would. They run from monsters they see, hide when cornered (less reliably on Easy), free trapped friends and head for the exit once it opens.
- **Sound:** footsteps, heavier monster footfalls when one is close, a sting when a monster steps into your light, and cues for rescues, the exit opening and escapes (all synthesized in `client/src/sfx.js`).
- **Score screen:** coins found, whether the exit opened, who escaped, and a scoreboard with coins, rescues and each survivor's status. The survivor with the most coins gets the crown.
- Hiding lasts at most 12 seconds (10 in the forest, 11 at the circus), then you have to wait 5 seconds before hiding again. While hidden you're safe, unless you dived in within 2 tiles in front of a monster while it could see you: then it can open your spot and catch you (the game tells you when that happened).
- The server decides everything (movement, coins, catches, rescues, cooldowns, winner). A monster player's browser only receives survivors the monsters can actually see, so a hacked client can't reveal everyone.

## Project layout

```
shared/          rules shared by both sides
  constants.js     all tuning numbers (speeds, cooldowns, light radius…)
  map.js           the mansion, forest and circus layouts (edit the text grids to redesign them) + collision
server/src/
  index.js         Express + Socket.IO server, rooms, the 20-tick game loop
  room.js          lobby, round rules, hiding, powers, catches, win checks
  ai.js            AI monster: chase, search hiding spots, follow noise, wander
  bots.js          bot survivors (lobby bots and tools/balance.js)
client/src/
  App.jsx          screen flow: Menu → Lobby → Game → Results
  screens/         the four screens
  components/      HUD, intro card, minimap, map previews, monster/skin icons, touch controls, backdrop
  game/MansionScene.js   Phaser scene: drawing both maps, flashlight darkness, input
  skins.js         survivor skin art (used in the game and the menus)
  monsters.js      monster art (used in the game and the lobby)
  sfx.js           synthesized sound effects (no audio files needed)
tools/simulate-round.js  headless tests of the rules and AI (npm test)
tools/balance.js         plays many rounds with bot survivors to check AI difficulty (npm run balance)
```

## Ideas for the next version

- Scent of Fear and The Bait powers (add them to `POWERS` in `shared/constants.js`, then handle them in `room.js` `usePower`)
- Real sprite art instead of the drawn shapes in `MansionScene.js`

## Putting it online

Build it once, then a single Node process serves both the page and the multiplayer server:

```
npm run build
npm start        # http://localhost:3101
```

**Render (easiest):** put the project on GitHub, then on render.com choose **New → Blueprint** and pick the repo. `render.yaml` already has the settings. The free plan goes to sleep after 15 minutes without visitors (the first visit then takes about a minute to wake it); the Starter plan stays on all the time.

Any other Node host that supports WebSockets (Railway, Fly.io) works too: use `npm ci --include=dev && npm run build` as the build command and `npm start` as the start command. The server reads the `PORT` environment variable. Run a single instance only: rooms live in the server's memory.
