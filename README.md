# Ancient Clash

A browser **Dota 2–style MOBA**: 5v5 on three lanes, 23 heroes with four abilities each, neutral jungle camps, high-ground bases, runes, a courier per hero, a shop with 30 items, smart bots, and **LAN / online multiplayer** hosted from one PC. Everything is rendered in 3D with [three.js](https://threejs.org/) and runs in the browser — there are no art or sound files, all models, effects and audio are generated in code.

> Fan project inspired by Dota 2. It is not affiliated with or endorsed by Valve. Hero stats, creep stats, items and abilities follow the public [Dota 2 Wiki](https://dota2.fandom.com/wiki/Dota_2_Wiki); no Valve assets are used.

---

## Contents

0. [Screenshots](#screenshots)
1. [Quick start](#quick-start)
2. [Multiplayer: LAN and online](#multiplayer-lan-and-online)
3. [How to play](#how-to-play)
4. [Controls](#controls)
5. [Features](#features)
6. [Heroes](#heroes)
7. [Items](#items)
8. [The map](#the-map)
9. [Bots](#bots)
10. [Project layout](#project-layout)
11. [Development](#development)
12. [Troubleshooting](#troubleshooting)

---

## Screenshots

![Gameplay](docs/screenshots/gameplay.jpg)

| | |
|---|---|
| ![Title screen](docs/screenshots/title.jpg) | ![Hero picker](docs/screenshots/hero-picker.jpg) |
| *Title screen* | *Dota-style hero picker (Strength / Agility / Intelligence)* |
| ![Loading screen](docs/screenshots/loading.jpg) | ![Scoreboard](docs/screenshots/scoreboard.jpg) |
| *Loading screen with both rosters* | *Scoreboard (hold Tab)* |

### Heroes (23)

In-game models, one per hero.

**Strength**

<table>
<tr>
<td align="center"><img src="docs/screenshots/heroes/pudge.png" width="190" alt="Pudge"><br><b>Pudge</b></td>
<td align="center"><img src="docs/screenshots/heroes/axe.png" width="190" alt="Axe"><br><b>Axe</b></td>
<td align="center"><img src="docs/screenshots/heroes/sven.png" width="190" alt="Sven"><br><b>Sven</b></td>
<td align="center"><img src="docs/screenshots/heroes/legion_commander.png" width="190" alt="Legion Commander"><br><b>Legion Commander</b></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/heroes/earthshaker.png" width="190" alt="Earthshaker"><br><b>Earthshaker</b></td>
<td align="center"><img src="docs/screenshots/heroes/tidehunter.png" width="190" alt="Tidehunter"><br><b>Tidehunter</b></td>
<td align="center"><img src="docs/screenshots/heroes/dragon_knight.png" width="190" alt="Dragon Knight"><br><b>Dragon Knight</b></td>
</tr>
</table>

**Agility**

<table>
<tr>
<td align="center"><img src="docs/screenshots/heroes/sniper.png" width="190" alt="Sniper"><br><b>Sniper</b></td>
<td align="center"><img src="docs/screenshots/heroes/mirana.png" width="190" alt="Mirana"><br><b>Mirana</b></td>
<td align="center"><img src="docs/screenshots/heroes/antimage.png" width="190" alt="Anti-Mage"><br><b>Anti-Mage</b></td>
<td align="center"><img src="docs/screenshots/heroes/juggernaut.png" width="190" alt="Juggernaut"><br><b>Juggernaut</b></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/heroes/riki.png" width="190" alt="Riki"><br><b>Riki</b></td>
<td align="center"><img src="docs/screenshots/heroes/drow_ranger.png" width="190" alt="Drow Ranger"><br><b>Drow Ranger</b></td>
<td align="center"><img src="docs/screenshots/heroes/phantom_assassin.png" width="190" alt="Phantom Assassin"><br><b>Phantom Assassin</b></td>
<td align="center"><img src="docs/screenshots/heroes/bounty_hunter.png" width="190" alt="Bounty Hunter"><br><b>Bounty Hunter</b></td>
</tr>
</table>

**Intelligence**

<table>
<tr>
<td align="center"><img src="docs/screenshots/heroes/rubick.png" width="190" alt="Rubick"><br><b>Rubick</b></td>
<td align="center"><img src="docs/screenshots/heroes/crystal_maiden.png" width="190" alt="Crystal Maiden"><br><b>Crystal Maiden</b></td>
<td align="center"><img src="docs/screenshots/heroes/pugna.png" width="190" alt="Pugna"><br><b>Pugna</b></td>
<td align="center"><img src="docs/screenshots/heroes/silencer.png" width="190" alt="Silencer"><br><b>Silencer</b></td>
</tr>
<tr>
<td align="center"><img src="docs/screenshots/heroes/windranger.png" width="190" alt="Windranger"><br><b>Windranger</b></td>
<td align="center"><img src="docs/screenshots/heroes/lina.png" width="190" alt="Lina"><br><b>Lina</b></td>
<td align="center"><img src="docs/screenshots/heroes/lion.png" width="190" alt="Lion"><br><b>Lion</b></td>
<td align="center"><img src="docs/screenshots/heroes/zeus.png" width="190" alt="Zeus"><br><b>Zeus</b></td>
</tr>
</table>

### Lane creeps and towers

![Lane creeps clashing on the river bridge](docs/screenshots/lane-creeps.jpg)

*Melee and ranged lane creeps (Radiant green, Dire red) fighting a hero on the mid-lane bridge.*

![Tier 2 tower](docs/screenshots/tower.jpg)

*A lane tower and its attack range.*

### Jungle beasts (neutral camps)

| Kobold camp | Wolf camp | Ancient golem camp |
|---|---|---|
| ![Kobolds](docs/screenshots/neutral-kobolds.jpg) | ![Wolves](docs/screenshots/neutral-wolves.jpg) | ![Golems](docs/screenshots/neutral-golems.jpg) |

*Five kobolds, an alpha wolf with two wolves, and an ancient granite golem with two rock golems. Stats follow the Dota 2 wiki; camps never heal and ignore lane creeps.*

### The map

![Map overview](docs/screenshots/map-overview.jpg)

*Radiant jungle (left) with dirt trails between the camps, the river down the middle, and the dark Dire side (right).*

| High-ground base: cliffs and lane ramp | Fountain and plaza |
|---|---|
| ![Base ramp](docs/screenshots/base-ramp-cliffs.jpg) | ![Fountain](docs/screenshots/fountain-base.jpg) |
| **Enemy base** | **Edge of the map: dense forest and rocks** |
| ![Enemy base](docs/screenshots/enemy-base.jpg) | ![Map edge](docs/screenshots/map-edge-forest.jpg) |

### Items and shop

Right-click an item to buy it.

| All | Consumables | Attributes |
|---|---|---|
| ![All](docs/screenshots/shop-all.png) | ![Consumables](docs/screenshots/shop-consumable.png) | ![Attributes](docs/screenshots/shop-attribute.png) |
| **Equipment (boots and gear)** | **Misc (Blink, Black King Bar, Shiva's...)** | |
| ![Equipment](docs/screenshots/shop-equipment.png) | ![Misc](docs/screenshots/shop-misc.png) | |

### Courier and teleport

![Hop the courier](docs/screenshots/courier-hop.jpg)

*Every hero has their own courier, Hop: a bird on a red e-scooter. (Here the five Radiant couriers wait at the fountain.)*

![Teleporting](docs/screenshots/teleport-channel.jpg)

*Channeling a teleport scroll: the scroll stash (T) sits beside the inventory and the progress bar shows in the middle of the screen. Taking damage cancels it.*

> There is no Roshan in the game yet, so no screenshot of him.

---

## Quick start

You need **Node.js 18+** (tested with Node 26) and a modern browser (Chrome, Edge, Firefox or Safari with WebGL).

```bash
git clone https://github.com/ibmkynl/web-moba.git
cd web-moba
npm install
npm run host
```

`npm run host` builds the client and starts the game server. It prints something like:

```
Ancient Clash server running.
  This PC:   http://localhost:8080
  On your LAN: http://192.168.1.20:8080   <- share this link
```

Open the link, choose **Single Player** (you + 4 bots vs 5 bots) or **Multiplayer · LAN**.

| Command | What it does |
|---|---|
| `npm run host` | Build the client (`dist/`) and start the server on port 8080 |
| `npm run server` | Start the server without rebuilding (uses the existing `dist/`) |
| `npm run dev` | Vite dev server with hot reload on http://localhost:5173 (single player; the multiplayer server is still `npm run server`) |
| `npm run build` | Typecheck and build the client |
| `npm run typecheck` | `tsc --noEmit` |

Change the port with an environment variable: `PORT=9000 npm run host`.

---

## Multiplayer: LAN and online

One computer **hosts** the match. The server holds the authoritative game simulation; every player's browser only sends commands and draws what the server tells it (20 snapshots per second, filtered per team so fogged enemies are never sent).

### On the same network (LAN)

1. On the host PC run `npm run host`.
2. Share the **"On your LAN"** link it prints (for example `http://192.168.1.20:8080`).
3. Everyone opens the link, enters a name, and picks **Multiplayer · LAN**.
4. In the lobby, **click a seat** (five per team). Taking a seat kicks the bot that was there.
5. Pick a hero (and a preferred lane). Press **Ready**. When everyone seated is ready, a **5 second countdown** starts, then a loading screen, then the match.

Lobby rules:

- Any seat, either team — no restrictions. Radiant is bottom-left, Dire is top-right.
- **Every hero can only be used once across both teams.** If two players want the same hero, the first to pick it keeps it. A player may take a hero from a **bot**; the bot is given another one.
- Seats nobody takes stay bots. You can start with one human or ten.
- If **all players leave** during a match, the match ends automatically and the lobby resets (12 seconds after a match ends, it returns to the lobby on its own).

If other devices cannot connect, allow incoming connections for Node in your OS firewall (macOS: System Settings → Network → Firewall; Windows: allow Node.js through Windows Defender Firewall) and make sure both devices are on the same Wi-Fi / network (guest networks often isolate devices).

### Over the internet

The host needs to be reachable from the internet. Pick one:

**A) Tunnel (easiest, no router changes).** Run the game, then expose port 8080:

```bash
# Cloudflare quick tunnel (free, no account needed)
npx cloudflared tunnel --url http://localhost:8080
# or ngrok (free account needed)
ngrok http 8080
```

Share the `https://…` URL it prints. WebSockets are supported by both, and the game automatically uses `wss://` on https pages.

**B) Virtual LAN (good for friends).** Install [Tailscale](https://tailscale.com/) or ZeroTier on everyone's machine, join the same network, and use the host's virtual IP: `http://<tailscale-ip>:8080`.

**C) Port forwarding.** Forward TCP port 8080 on your router to the host PC and share `http://<your-public-ip>:8080`. (Only do this if you understand the exposure — see below.)

> **Security note:** the server has no accounts or passwords. Anyone who can reach the link can join the lobby, so only share it with people you trust and stop the server when you are done. Latency is best when everyone is geographically close to the host.

---

## How to play

**Goal:** destroy the enemy **Ancient**. Each team defends three lanes (top, mid, bottom). Towers protect each lane in tiers; the tier-3 towers guard the entrances (ramps) of the base, the two tier-4 towers sit beside the Ancient, and the Ancient only becomes attackable once both tier-4 towers are down.

- Lane **creeps** spawn every 30 seconds and march down the lanes. Last-hit enemy creeps for gold; **deny** your own creeps (right-click one below 50% HP) to starve the enemy of XP.
- Kill **heroes** for gold and XP. The reward follows the Dota 2 rules (see [Gold and XP](#gold-and-xp)).
- Farm the **jungle** camps for extra gold and XP — they are tougher than lane creeps.
- Spend gold at your fountain shop (or from anywhere using your courier).
- Pick up **runes**, place **wards**, use **teleport scrolls**, and win team fights.

### Single player

Choose a hero and a lane in the Dota-style hero picker. Heroes are grouped by Strength / Agility / Intelligence; click one to see its abilities and stats. Your four allies and the five enemies are random bots (no duplicate heroes). There is a **★ test button** in the left menu (single player only): instant level 25 with maxed skills and +20,000 gold, handy for trying heroes and items.

---

## Controls

| Input | Action |
|---|---|
| **Right click** | Move / attack / follow. On an allied creep below 50% HP: deny it |
| **A** + click | Attack-move |
| **Space** / **H** | Stop / hold position |
| **Q W E R** (and **D**) | Select an ability, then **click** the target or spot (**Esc** or right-click cancels). **M** toggles quick-cast |
| **Alt + Q/W/E/R** (or Ctrl) | Level up that ability (or click the **+** above it) |
| **Z X C V B N** | Use inventory slots 1–6 |
| **T** | Teleport: pick a friendly tower or the Ancient (**T** twice = Ancient). Uses a scroll from the separate scroll stash |
| **S** | Open the shop (at your fountain) |
| **Right click** an item in the shop | **Buy** it (left-click only shows the tooltip) |
| **Right click** an inventory item | Sell it (at the fountain) |
| **'** / **L** | Center camera / lock or free the camera |
| Mouse at the screen edge, arrow keys, left-drag | Move the camera (edge scrolling also works over the top bar) |
| Click a hero portrait in the top bar | Jump the camera to that hero (only if they are visible; hidden enemies are not revealed) |
| **Tab** (hold) | Scoreboard: K/D/A, last hits, net worth, GPM/XPM, damage, items, ping, bot/player |
| **P** | Pause (single player) |
| **Esc** | Cancel / quit menu |
| Minimap: left-click / right-click | Move camera / move your hero there (the route is drawn as a dashed green line) |

There is no zoom (the wheel is disabled on purpose).

---

## Features

### Gameplay
- **5v5, 3 lanes**, day/night cycle (heroes see less at night), kill/assist/death scoreboard, kill streaks, multi-kills, first blood and shutdown announcements (on-screen banners with sound stings).
- **Lane creeps** with the Dota 2 stats, upgrades every 7:30, bigger waves later, and **mega creeps** once a team's tier-3 towers fall. Creeps chase heroes only for a short leash, then return to their lane.
- **Neutral jungle:** 16 camps (kobolds, wolves, ancient golems) with Dota 2 stats and bounties, respawning every minute. They guard their camp, gang up on intruders, never heal, and ignore lane creeps.
- **High-ground bases:** each base is surrounded by rock cliffs and is entered only through three wide lane ramps. Tier-3 towers stand beside the ramps. The **fountain** deals 200 pure damage four times a second to intruders.
- **Runes:** power runes in the river every 2 minutes and bounty runes in the jungle every 3 minutes.
- **Wards** (vision for 3 minutes; bots and enemies place them too).
- **Collision and pathfinding:** trees, rocks and cliffs block movement. Units path around them (A* on a grid) and through the ramps. Towers and other buildings never move.
- **Courier ("Hop")**, one per hero: a bird on a red e-scooter. Items bought away from the fountain wait in your stash; Hop loads everything at the fountain at once and drives it to you. A new purchase sends Hop back to the fountain first, like Dota.
- **Teleport scrolls** live in their own stash (max 5). Channel for 3 seconds with a progress bar and animation; moving, being stunned or **taking damage from an enemy cancels it** (the scroll is still used).
- **Fog of war** per team; the server never sends hidden enemies to a client.

### Heroes and items
- **23 heroes** with 4 abilities each, hero stats copied from the Dota 2 wiki (attributes, growth, base regen, damage, armor, speed, range, attack time).
- **30 shop items**, including Blink Dagger, Black King Bar, Heart, Butterfly, Refresher Orb, Shiva's Guard, Aghanim's Scepter, Eye of Skadi, Divine Rapier, three kinds of fast boots and the teleport scroll.
- Health = 120 + 22 per strength, mana = 75 + 12 per intelligence, armor from agility, regen scaling with attributes and items, 25 levels with the Dota XP table.

### Look and feel
- Fully 3D low-poly map, heroes, creeps, towers and a hand-drawn item icon set, with per-ability particle effects (three.quarks) and bloom.
- A Dota-style HUD: hero/skill panel with XP bar and mana-cost badges, minimap with hero portrait icons (blue = allies, red = enemies), inventory, shop, scoreboard, kill feed, hover info.
- Dota-style **loading screen** with both teams' rosters.
- Synthesized **sound effects, ambient music and announcer stings** (WebAudio, no files).

### Multiplayer
- Lobby with seats, hero and lane picking, ready-up and countdown.
- Authoritative server, per-team fog-filtered snapshots, client-side interpolation, ping display.
- Bots fill empty seats; players can leave and the match continues (the match ends when the last human leaves).

### Gold and XP

Hero kills follow the Dota 2 wiki:

- **Killer gold:** 125 + 8 × victim level, plus a streak bonus (5k² + 5k for a streak of k ≥ 3) and +135 for first blood.
- **Assist share:** everyone within 1500 units (and anyone who damaged the victim in the last 20 s) also gets (30 + 3.8% of the victim's net worth) × a net-worth-gap factor, split evenly.
- **XP:** (100 + 13% of the victim's total XP) split between nearby enemy heroes, plus a streak bonus.
- **Kill stealing is allowed:** the last hero to hit gets the kill; earlier attackers get assists. Creep or tower kills credit the last hero who damaged the victim in the previous 20 s; with nobody recent, all enemy heroes share the bounty. Denies and neutral kills pay nothing and do not end streaks.

---

## Heroes

| Strength | Agility | Intelligence |
|---|---|---|
| **Pudge** — Meat Hook, Rot, Flesh Heap, Dismember | **Sniper** — Shrapnel, Headshot, Take Aim, Assassinate | **Rubick** — Telekinesis, Fade Bolt, Arcane Supremacy, Spell Steal |
| **Axe** — Berserker's Call, Battle Hunger, Counter Helix, Culling Blade | **Mirana** — Starstorm, Sacred Arrow, Leap, Moonlight Shadow | **Crystal Maiden** — Crystal Nova, Frostbite, Arcane Aura, Freezing Field |
| **Sven** — Storm Hammer, Great Cleave, Warcry, God's Strength | **Anti-Mage** — Mana Break, Blink, Counterspell, Mana Void | **Pugna** — Nether Blast, Decrepify, Nether Ward, Life Drain |
| **Legion Commander** — Overwhelming Odds, Press the Attack, Moment of Courage, Duel | **Juggernaut** — Blade Fury, Healing Ward, Blade Dance, Omnislash | **Silencer** — Arcane Curse, Glaives of Wisdom, Last Word, Global Silence |
| **Earthshaker** — Fissure, Enchant Totem, Aftershock, Echo Slam | **Riki** — Smoke Screen, Blink Strike, Tricks of the Trade, Cloak and Dagger | **Windranger** — Shackleshot, Powershot, Windrun, Focus Fire |
| **Tidehunter** — Gush, Kraken Shell, Anchor Smash, Ravage | **Drow Ranger** — Frost Arrows, Gust, Multishot, Marksmanship | **Lina** — Dragon Slave, Light Strike Array, Fiery Soul, Laguna Blade |
| **Dragon Knight** — Breathe Fire, Dragon Tail, Dragon Blood, Elder Dragon Form | **Phantom Assassin** — Stifling Dagger, Phantom Strike, Blur, Coup de Grace | **Lion** — Earth Spike, Hex, Mana Drain, Finger of Death |
| | **Bounty Hunter** — Shuriken Toss, Jinada, Shadow Walk, Track | **Zeus** — Arc Lightning, Lightning Bolt, Static Field, Thundergod's Wrath |

Notes: the wiki follows a newer Dota patch than the classic kits implemented here, so abilities that exist in both use the wiki's numbers, while reworked abilities keep their classic behavior (Axe is the classic Axe). A few mechanics are simplified (for example Fissure stuns but does not block movement).

---

## Items

| Group | Items |
|---|---|
| Consumables | Healing Salve, Clarity, Observer Ward, **Teleportation Scroll** (separate stash, max 5) |
| Boots | Boots of Speed (+45), Phase Boots (+45, +18 damage, active speed burst), Power Treads (+45, +25 attack speed, +10 str), Boots of Travel (+100). Boots do not stack |
| Stat items | Gloves of Haste, Blades of Attack, Broadsword, Chainmail, Ogre Axe, Blade of Alacrity, Staff of Wizardry, Vitality Booster, Energy Booster |
| Power items | **Blink Dagger**, **Black King Bar** (spell immunity), **Heart of Tarrasque**, **Butterfly** (evasion), **Assault Cuirass**, **Shiva's Guard** (active slow/damage), **Aghanim's Scepter**, **Refresher Orb** (resets cooldowns), **Force Staff** (push), **Eye of Skadi**, **Divine Rapier** |

Items are single purchases (no recipes). Hero-specific items such as auras and on-hit effects are simplified.

---

## The map

A 9600 × 9600 map, Radiant at the bottom-left and Dire at the top-right, with a river along the diagonal. Each side has:

- 3 lanes with 3 towers each, two tier-4 towers and an Ancient inside a **cliff-walled base** with three ramps.
- **8 jungle camps** (2 small kobold camps, 4 wolf camps, 2 ancient golem camps) connected by dirt trails.
- Trees and big rocks that block movement; an impassable dense forest and rock belt surrounds the playable area.

---

## Bots

Bots follow the same rules as players: same stats, XP, gold, shop prices, courier, teleport scrolls and fog of war.

- Team-level planning: push waves, defend threatened towers, gank isolated heroes, rescue allies, focus fire.
- Last-hit and deny, retreat when hurt (or teleport home), place wards, collect runes.
- Use their abilities and items: Blink, Black King Bar, Shiva's Guard, Phase Boots, Force Staff, Refresher Orb, health/mana consumables.
- Shop: a starting build per hero, then a late-game build; they sell cheap items to afford better ones and make shopping trips to the fountain.

---

## Project layout

```
server/index.ts        Game server: lobby, countdown, authoritative simulation loop, snapshots, static file server
src/main.ts            Title screen, single player / multiplayer flow
src/game.ts            Input, camera, targeting, HUD wiring (one Game per match)
src/sim/               Pure simulation (runs in the browser for single player and on the server for multiplayer)
  world.ts             World state, ticking, damage, kills, items, courier, camps, runes
  ai.ts, team.ts       Bot AI and team-level planning; creep, neutral, summon, tower AI
  heroes*.ts, abilities.ts   Hero definitions and abilities (g1–g4 = hero groups)
  items.ts             Item catalog
  constants.ts         Map geometry: lanes, towers, camps, cliff walls and ramps, XP table
  obstacles.ts, nav.ts Trees/rocks (shared with rendering), collision and A* pathfinding
src/net/               Client, command API, snapshot (de)serialisation and interpolation
src/render/            Three.js renderer, terrain, models (heroes, creeps, structures), VFX, portraits, minimap
src/ui/                HUD, lobbies, loading screen, item icons
src/audio.ts          Synthesized sound
```

Single player runs the same simulation locally; multiplayer runs it on the server and the browser shows an interpolated replica of the snapshots.

Technology: TypeScript, Vite, three.js, three.quarks (particles), `ws` (WebSockets), `tsx` (runs the server in TypeScript).

---

## Development

```bash
npm install
npm run typecheck      # type check
npm run dev            # hot-reload client at http://localhost:5173 (single player)
npm run host           # production build + server on :8080 (multiplayer)
```

After changing client code, run `npx vite build` (or `npm run host`) so the server serves the new build. The simulation is deterministic enough to run headless in Node for balance tests, for example with a short `tsx` script that creates a `World` and ticks it.

---

## Troubleshooting

- **Others cannot open the link:** check the firewall, that you are on the same network, and use the exact link the server prints (not `localhost`).
- **"Disconnected from the host":** the server stopped or the network dropped; reload the page to return to the lobby.
- **A hero is greyed out in the lobby:** someone already picked it (each hero can be used once).
- **Blank page after a build:** hard-reload (Ctrl/Cmd+Shift+R) so the browser picks up the new files.
- **Low frame rate:** close other tabs; the 3D scene is the heaviest part. A dedicated GPU helps a lot.

---

## Credits

Game design reference: Dota 2 (Valve). Numbers from the Dota 2 Wiki. Built with three.js and three.quarks (MIT).
