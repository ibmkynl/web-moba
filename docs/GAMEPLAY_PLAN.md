# Gameplay plan: Glyph, backdoor, buyback, death gold, camps, siege, high ground, Roshan

Status: **implemented** on branch `feature/gameplay-plan` (see "What shipped, and where it differs from this plan" at the end). Written against the code at commit `123981e`.

## Decisions (settled)

| Topic | Decision |
|---|---|
| Death gold loss | On death a hero loses **40% of the gold they hold at that moment**. No reliable/unreliable split. |
| Backdoor protection | The first value set: **50% damage reduction, 180 HP/s regen**, tower detection radius 900, Ancient 4000, tier 1 unprotected. |
| Siege creep and Roshan numbers | **Balanced by playtest.** Starting values live in one constants block; no need to match the wiki exactly. |
| Aegis | **Ground pickup**, using the existing rune pickup system. |
| Roshan drops | **Aegis only.** No Cheese, no Refresher Shard. |
| Map | Rework the map toward the **Dota 2 wiki map** (new section 10): lanes, river, relief, jungle camps and trails, base shape, Roshan pit. No secret shop, no new neutral creep types, no features we lack. |
| README | After everything is tested, **regenerate every README screenshot** (HUD and map both change). |
| UI | Rework the HUD to the **Dota 2 wiki "Head-up Display" layout** (new section 9). Elements for features we do not have are skipped. |

## How to read the numbers

Every number below is a **starting value kept in one constants block** (`src/sim/constants.ts`, new section `RULES`), not
hard-coded in `world.ts`. The Dota wiki pages (Liquipedia, Fandom) were not reachable while writing this (403/402), so
the values come from patch-note snippets and community pages. Values marked `verify` are guesses to be tuned in
playtests; since you chose playtest balancing for siege and Roshan, treat them as a first pass, not a spec.

## Ground rules for all eight features

- **The sim is shared by single player and the server**, and multiplayer renders an interpolated replica. Anything the
  client must draw or click goes through three places: `src/net/snapshot.ts` (what is sent), `src/net/api.ts` + the
  `case` list in `server/index.ts` (commands), and `src/ui/hud.ts`. Each feature below says which it touches.
- **New client-visible unit state** goes in `NET_KEYS` / `NET_DEFAULT` (`snapshot.ts:128`). New hero state goes in the
  hero record (`snapshot.ts:175`, read back at `:626`). New team state goes in the `TOP` list (`snapshot.ts:268`).
- **Every feature gets a group in `tests/sim-tests.ts`** (it runs as `npx tsx tests/sim-tests.ts <name>`). Write the
  test first for the rules that are pure sim (backdoor, gold, vision, stacking).
- One commit per feature, `npm run typecheck` and `npm run test:sim` green before the next one starts.
- Update the README sections "Features", "Bots" and "Controls" as each lands (the README currently says
  "There is no Roshan in the game yet").

## Order and why

| # | Feature | Depends on | Size |
|---|---|---|---|
| 10a | Map layout data (lanes, river, camps, trails, runes, Roshan pit, height function) | none | M |
| 9a | HUD layout rework (existing elements only) | none | M |
| 9b | HUD additions that use data we already have | 9a | M |
| 1 | Death gold loss (40% of gold) | none | XS |
| 2 | Buyback | 1 (spends gold, uses net worth), 9a (button slot) | M |
| 3 | Glyph of Fortification | 9a (button slot beside the minimap) | S |
| 4 | Backdoor protection | 3 (shares the "building is shielded" code path) | S |
| 5 | Siege creeps | 4 (creep proximity check) | M |
| 6 | High/low ground vision | none, but do before Roshan | M |
| 7 | Neutral camp mechanics (block, stack, leash, pull) | none | M |
| 8 | Roshan and Aegis | 1, 2, 6, 7 (pit visibility, neutral AI, Aegis vs death rules) | L |

Rough sequence: 9a, 9b, 1, 2, 3, 4, 5, 6, 7, 8. The HUD goes first because buyback and glyph need a place to live, and
it is pure client work with no sim risk. Items 3-4 and 6-7 are independent pairs and could be done in parallel by two
people or two sessions, since they touch different parts of `world.ts` (see "File collisions" at the end).

---

## 1. Death gold loss

**Rule (decided).** When a hero dies they lose **40% of the gold they are holding at that moment**. Items are not
affected. No reliable/unreliable split, so this stays a very small change.

**Today.** One pool: `HeroState.gold`. `heroDied` (`world.ts:1092`) is the single place a hero death is processed, so the
rule goes there.

**Design.**

- `RULES.deathGoldLoss = 0.4`.
- In `heroDied`, before the kill rewards are paid: `lost = Math.floor(hs.gold * RULES.deathGoldLoss)`; `hs.gold -= lost`.
  Apply it for **every** death: enemy kill, tower or creep kill, deny, self-kill, neutral kill.
- Take the loss at the top of `heroDied`, before `heroKillRewards`, so the victim's gold at the moment of death is what
  gets cut (and `netWorth` used by the assist-gold formula sees the reduced value; check that this is acceptable, or
  compute the kill rewards from the pre-loss net worth).
- The gold is destroyed, not transferred (Dota does the same). It does not count towards `earned`, so GPM is unchanged.
- **Does not apply** to an Aegis revive (feature 8): that "death" never goes through `heroDied`.
- Floating red text `-N` at the corpse, shown only to the owner (`this.text(..., to)`), plus the same number in the
  respawn overlay ("lost 340 gold").

**Interactions to be aware of.**

- *Shopping:* a 40% hit on a hero who is sitting on 3000 gold hurts a lot. That is the point of the rule, but it makes
  bots' "save up for the big item" behaviour (`ai.ts` shopping) riskier. Bots already shop on trips home; check they do
  not bank gold while fighting. Optional tweak: a bot with a lot of gold and low HP prefers to shop first.
- *Buyback (feature 2):* gold is already reduced when the player decides to buy back, so the cost must be payable from
  the remaining 60%. See the note there.
- *Snapshot:* nothing new to send, the `g` field already carries gold.

**Tests (`goldloss`).** Dying with 1000 gold leaves 600; with 0 gold stays 0; items are untouched; deny and tower
deaths also cost 40%; `earned` is unchanged; two deaths in a row compound (600 -> 360).

---

## 2. Buyback

**Rule.** A dead hero can pay gold to respawn instantly at the fountain. Cost depends on net worth, and there is a long
cooldown. Sources disagree on the base: `100 + netWorth/13` (patch notes) vs `200 + floor(netWorth/13)` (a blog); `verify`.
Cooldown: 480 s (`verify`). The old extra-respawn-time penalty was removed in 7.11, so do not implement it.

**Sim.** `World.netWorth(h)` already exists (`:894`), so cost is `RULES.buybackBase + netWorth / RULES.buybackDiv`.

- `HeroState.buybackReadyAt = 0`.
- `World.buyback(h): string | null` returns an error string like `buyItem` does: not dead, on cooldown, not enough gold.
  Success: subtract the cost from `hs.gold`, `buybackReadyAt = time + RULES.buybackCd`, `respawnAt = time` so `stepRespawn` (`:1920`) does its
  normal respawn at the fountain, plus an announcement/feed line ("X bought back") visible to both teams.
- **Interaction with the 40% death loss:** gold is cut by 40% at the moment of death, then the buyback cost is paid from
  what is left. Cost is based on net worth (gold + items), which already dropped by the lost gold, so a hero whose worth
  is mostly items can still be unable to afford it. That is the intended pressure, but check it in playtests; if
  buyback feels unreachable, lower `RULES.buybackBase` or compute the cost from net worth *before* the loss.
- Cost is computed on demand from current gold + items, so it changes as the player shops. Expose
  `World.buybackCost(h)` for the HUD and bots.
- Must not work for a living hero, and must not work while the match is over.
- Interaction with item 8: buyback must be refused for a hero who is waiting on the Aegis revive (they are not dead
  in the normal sense), which `hs.aegisRevive` marks.

**API and net.** `Api.buyback()`, `LocalApi`, `NetApi` (`{t:'buyback'}`), and `case 'buyback'` in `server/index.ts`
next to `buy`/`sell`. Hero snapshot gets `bb` (cooldown end) so the client can grey the button; the cost is recomputed on
the client from `netWorth` of the replica hero, or just sent as `bc` to avoid drift.

**UI.** The existing `#respawn` overlay (`hud.ts:117`, filled near `:897`) shows the countdown. Add a **Buyback** button
with the cost, disabled with a reason (cooldown seconds, "not enough gold"). Hotkey **B** is taken by inventory slot 5,
so use **Shift+B**, and document it in the README controls table.

**Bots.** In `botAI` when dead: buy back only when (a) cost is affordable with a reserve left, (b) there is a real reason:
their ancient or a tier-3 tower is under attack, or the enemy has mega creeps / a large lead and the bot's team still
has a chance. Keep it conservative so bots do not burn it at 10 minutes.

**Tests (`buyback`).** Cost scales with net worth; refused while alive, on cooldown, or too poor; success sets
`respawnAt = now`, takes exactly the cost from gold, and the hero is alive at the fountain next tick; cooldown blocks a
second buyback; snapshot round trip.

---

## 3. Glyph of Fortification

**Rule.** One team-wide button. For about 7 s the team's buildings are invulnerable. Cooldown about 300 s, shared by the
team, first usable around 3:00 (`verify`). Lane creeps get a shorter protection (4 s) in one source; I would **skip creep
protection in v1** because it is the less important half of the effect. Tier 2+ towers also gaining multi-target attacks
is a v2 nicety.

**Sim.** The simplest mechanism that fits the codebase: a team-level `glyphUntil[team]` and `glyphReadyAt[team]` on
`World`, and the glyph adds an `invuln` buff to every living friendly tower/ancient/fountain-adjacent building. Buildings
already go through `addBuff`/`stepBuffs`/`recalc` like any unit, and `Unit.isInvulnerable()` (`entities.ts`) already
treats an `invuln` buff as untouchable, so `damage()` and `canHit()` need no change. This also reuses the existing
"protection bubble" visual.

- `World.useGlyph(team): string | null`: error if on cooldown or before the unlock time, otherwise add the buff to all
  friendly buildings with `expires = time + RULES.glyphDur`, set `glyphReadyAt`, announce.
- Buildings that die cannot get the buff; buildings destroyed later in the same window are simply gone.
- Glyph is **not** an item and has no mana cost.

**API and net.** `Api.glyph()`, `{t:'glyph'}`, `case 'glyph'` in the server. Snapshot: `glyphReadyAt` and `glyphUntil`
per team in `TOP` so both the button and the enemy-side effect render.

**UI.** A round button near the minimap with the cooldown sweep, hotkey **G** (free today). The protection bubble on
buildings is the visual; add a short "Glyph" announcement for the enemy ("Radiant used Glyph").

**Bots.** `team.ts` already tracks `dangerTimer`/`dangerPos` for buildings under attack (`world.ts:880`). Rule: use glyph
when a tier-2+ tower or the ancient is below ~50% HP and enemy heroes are within its range and no defender can reach
it. One use per cooldown.

**Tests (`glyph`).** Buildings take 0 damage during the window and normal damage after; cooldown blocks a second use;
works for either team; the ancient's own lock still behaves; snapshot round trip.

---

## 4. Backdoor protection

**Rule (values decided).** A lane building with no enemy lane creeps close to it takes **50% less damage** and heals
**180 HP/s**. Tower detection radius 900; the Ancient's detection radius is large (about 4000) and when it is triggered the
whole base loses protection together; tier 1 towers have no protection. Damage from the owner's own team is not healed
back. Summons and illusions do even less damage to protected buildings (75% reduction), but we have no illusions, so only
summons apply. All numbers go in `RULES` so they can be tuned later.

**Design.**

- New helper `World.backdoorProtected(b: Unit): boolean`: `b` is a tier 2-4 tower, barracks (none exist yet) or the
  ancient, and **no enemy lane creep** (`kind==='creep'`, not neutral, `team !== b.team`) is within the detection radius.
  Cache per building and refresh every ~0.25 s, not per damage call; the unit list scan is the only cost.
- Tier 3 and 4 towers and the ancient use the *ancient's* large radius trigger: if a lane's creeps are anywhere near the
  base, protection is off for the base. Tier 2 towers use their own 900 radius. Tier 1: never protected.
- In `damage()` (`:839`): if the target is a protected building, multiply `d` by `1 - RULES.backdoorReduce`, and in
  `stepRegen` add `RULES.backdoorRegen` HP/s to protected buildings **when they were damaged recently by the enemy**.
- Do not make the building invulnerable. Burst damage can still kill it.
- Re-arm delay: after the last enemy creep leaves, protection returns after a short delay (`backdoorLinger`), so
  pushing with creeps then backing off is not instantly punished.
- **Mega creeps and the existing push tests** may need the bot push logic to bring creeps; check `team.ts` push plan so
  bots do not stall at a protected tower with no creeps. They already prefer to push with a wave, so this should only
  matter for hero-only pushes.

**UI.** Info panel line "Backdoor protected" next to the existing "Protected" text for locked buildings, plus a thin
shimmer on the building model using the same bubble material as invulnerability but fainter. Net: derive on the client
from a `bdp` unit flag in `NET_KEYS`.

**Tests (`backdoor`).** A hero alone on a tier-2 tower does reduced damage and the tower regens; adding one enemy lane
creep nearby removes protection; tier 1 is never protected; ancient protection drops if creeps are anywhere near the
base; friendly damage is not healed back.

---

## 5. Siege creeps

**Balance:** by playtest. The numbers below are a starting point only.

**Rule.** Lane waves include one siege creep every 10th wave (every 5 minutes at the game's 30 s wave interval). Siege:
high HP (935 in one source, `verify`), 0 armor, about 80% magic resistance (`verify`), long attack range, **much more
damage to buildings than to units**, and about 66 gold / 88 XP bounty (`verify`, the table I found was garbled).
Mega waves keep spawning siege.

**Sim.** `spawnWave` (`:1686`) already builds melee + ranged per lane. Extend it:

- A wave counter exists (`waveNo`). When `waveNo % 10 === 0` (decide whether the first siege is wave 10 or earlier;
  `nextWave` starts at 15 s, so wave 10 is about 4:45), spawn one `spawnCreep(team, 'siege', lane, arc)` per lane,
  placed behind the ranged creep.
- `spawnCreep` (`:1601`): add the `'siege'` sub-type with its base stats, the same 7:30 upgrade steps as other creeps
  (use the same `up` variable), and its own magic resistance (`u.st.magicRes` is set from a base stat at `entities.ts`
  construction; override after construction and make sure `recalc` does not reset it).
- Building damage: in `applyAttack` (`:2255`) multiply physical damage by `RULES.siegeVsBuilding` when the attacker is
  `sub==='siege'` and the target `isBuilding`, and by a reduction against units. This is the same place lifesteal already
  distinguishes buildings from creeps.
- AI: `creepAI` (`ai.ts:82`) picks the closest enemy with a +220 penalty for buildings. Siege should instead **prefer
  buildings** within reach and only fall back to units. Add a small `siege` branch in the scoring.
- Tower targeting: `towerAI` prefers creeps over heroes by distance. Leave it, but siege creeps are slow and will
  absorb tower shots, which is the intended Dota feel. Do not invent a special priority.
- Range: Dota siege range is long (about 690, `verify`) and its movement is slower than normal creeps. Make
  `u.st.range` and `ms` constants so the pathing and the "stop at range" logic in `creepAI` handle it without changes.

**Render.** `creeps3d.ts` builds melee and ranged creep models by `sub`. Add a catapult model (`modelkit.ts` helpers),
team coloured. Add the attack projectile (a boulder arc) through the existing projectile path with a new effect name in
`vfx.ts` if needed. Minimap shows creeps as dots already; give siege a larger dot.

**Snapshot.** `sub` is already part of the unit record, so the sub-type travels for free; confirm in `snapshot.ts`.

**Bots.** No change needed; they treat siege as a normal enemy creep. Optionally have `team.ts` count a living friendly
siege as extra push strength.

**Tests (`siege`).** One siege per lane on wave 10 and 20, none on wave 9; siege does a multiple of its unit damage to a
tower; siege prefers a tower over a nearby creep; magic damage to siege is reduced; bounty and XP match the constants;
upgrades apply at 7:30.

---

## 6. High-ground / low-ground vision

**Rule.** A unit on low ground cannot see units on the high ground above it, unless it already has vision up there
(a hero, ward or building on the high ground, a flying unit, or a ramp). The visible effect: you cannot see the enemy
base from the lane, and you cannot attack what you cannot see, so you need to walk up the ramp (or ward the high ground).

**Gap in the sim.** The sim has **no height field**. High ground exists only as the cliff walls (`WALLS`, `GATES` in
`constants.ts`) and as terrain in `terrain3d.ts`. So step one is a small pure function both sim and render can share.

- New in `constants.ts`: `groundLevel(p: Pt): 0 | 1`. Level 1 means **inside either base box** (Radiant: `x < WALL_N`,
  `y > WALL_Y`; Dire: the mirror) **and** past the ramp mouth, i.e. not within ~`RAMP_DEPTH` of a gate `mid`. The ramp
  itself counts as level 0 so units that walk up it start to see the base once they are up, and defenders standing on
  the ramp are visible from below (matches Dota).
- Keep river ridges and map-edge cliffs out of scope: they are decorative walls, not a vision rule here.

**Change in `computeVision` (`world.ts:546`).** Observers are currently circles `{x,y,r}`. Add a `level` to each observer:
`groundLevel(position)`, with these exceptions that count as level 1 (can see everything): flying units (couriers), and
the existing global reveals (Thundergod's Wrath). Then, when marking an enemy unit visible, require
`groundLevel(unit) <= obs.level`. Wards: use the ward's own position level. Skill vision spots (`VisionSpot`) and zones:
use the spot's own position level, so a Light Strike Array cast from below onto the high ground does not reveal it.
Cost: one extra comparison per observer/unit pair; `groundLevel` is a handful of arithmetic ops, and each unit's level
can be computed once per `computeVision` pass.

**Consequences to handle.**

- `isVisible`, `canHit`, `acquire`, `towerAI` and `creepAI` already ask `isVisible`, so units on low ground stop
  targeting what they cannot see without more changes. Verify towers still hit heroes on their own ground.
- **Ranged attackers from low ground at buildings** keep working because `isVisible` returns true for buildings
  (`world.ts:484`). Decide: keep that (simple, matches current play) or hide buildings too. Recommendation: keep.
- Bots lose targets when walking into the base; they rely on `acquire`, so they simply take the next target. Check the
  push logic in `team.ts` that picks tower targets so it does not stall.
- Snapshot filtering already uses `vis[team]`, so the server will not send hidden high-ground enemies.
- Minimap draws only visible enemy dots, so it follows.

**Render.** Optionally darken the fog over the enemy plateau when it is not visible. Not required.

**Tests (`highground`).** A hero below the cliff does not see an enemy standing in the base; the same hero on the ramp
does; a ward on the plateau reveals it; a ward below does not; a courier flies over and reveals; a tower on the plateau
still sees the lane below; Thundergod's Wrath still reveals everyone. Include the Dire (mirrored) base.

---

## 7. Neutral camp mechanics

Current behaviour (`spawnCamps`, `world.ts:1636`, and `neutralAI`, `ai.ts:30`):

- Every 60 s a camp respawns **only if every member is dead** (`some(!dead) -> continue`). So there is no stacking, and a
  pulled camp that is still alive blocks the respawn forever.
- Neutrals ignore lane creeps and lane creeps ignore them (`acquire`, `creepAI`, `neutralAI` all skip neutral team).
- Neutrals return home when dragged far, but "never heal" (README), so a hero can chip at them and walk away.

**Rules to add (Dota).**

1. **Spawn blocking.** At each minute mark the camp spawns only if no unit (hero, creep, ward, summon) is inside the
   camp area. Neutrals standing in their camp count too, which is why stacking only happens when they have been pulled out.
2. **Stacking.** If the camp's own creeps have left the camp area before the minute mark, the new pack spawns anyway and
   the camp now holds both. Cap stacks (`RULES.maxStacks`, `verify`); store `camp.stacks`.
3. **Leash and reset.** After leashing home, neutrals heal quickly (regen back to full) so pulling and re-pulling is
   possible. This reverses the README line "never heal"; update that sentence.
4. **Pulling.** Lane creeps must be able to fight neutrals: a neutral that is attacked by (or attacks) a lane creep
   engages it, and lane creeps retaliate against neutrals that hit them. The Dota pull is: aggro the camp onto your lane
   creeps so the wave walks away from the lane and the enemy wave meets no friends. Do not make lane creeps hunt
   neutrals on their own; only retaliate.

**Design.**

- Add a camp area to `CampDef`: a radius by tier (small/medium/ancient), `CAMP_AREA = [350, 420, 520]` as a starting guess.
  Keep the camp layout and `CAMPS` mirror logic as is.
- `spawnCamps` becomes: for each camp, compute `blocked = units.some(u => !u.dead && within area)` (use squared distances
  and skip buildings). If not blocked, spawn the pack; if the old members are alive and outside the area, `stacks++`
  (they stay in `camp.members` so clearing the camp means killing all). If blocked, skip this minute.
- Keep `camp.members` as the single list so existing code (`neutralAI`'s "the whole camp joins in", bots farming) keeps working.
  Large stacks make that join-in cheap but check the loop does not go quadratic with many members.
- `neutralAI`: add regen while `returning` (percent of max HP per second, `RULES.neutralReturnRegen`); clear
  `provoked` when it reaches home. Keep the 950 leash. Make the leash a constant.
- `creepAI` / `acquire`: allow a lane creep to target a neutral that damaged it in the last ~3 s
  (`u.lastDamagedByEnemy` and `extra.provoked` already exist for neutrals). Neutral aggro on lane creeps: let a neutral
  target a lane creep that is attacking it or the pulling hero's allies near it.
- Bounty and XP of a stacked camp are simply the sum of the members, as in Dota.

**UI.** Stack count badge over the camp on the minimap or as a small world marker; the stacking window is the key
skill, so also show the camp area outline while holding Alt (the README already uses Alt for pings, so use a camp
outline on a different key or on hover; decide during implementation).

**Bots.** Farming bots already walk to camps and attack members. Add nothing for stacking in v1, but they benefit from
stacks automatically. A later pass can teach support bots to stack at :53 (low priority).

**Tests (`camps`).** A camp does not respawn while its members sit in it; dragging members out then waiting for the
minute mark produces a second pack (stacks=2); stacks cap; a leashed neutral heals to full on return; a lane creep
retaliates against a neutral that hit it but does not start fights; a hero standing in an empty camp area blocks its
respawn.

---

## 8. Roshan and Aegis

The largest item. Do it last; it reuses most of the earlier work. **Balance by playtest**; the numbers below are a first pass.

**Roshan (`verify` all numbers; I only found values from old patches).** A neutral boss in a pit on the river. Respawns
8-11 minutes after death. Stats scale with game time. Attacks hard and stuns nearby units with Slam. Kills reward the
whole killing team with gold and drop the **Aegis of the Immortal**. (Cheese and the Refresher Shard are out of scope.)

**Sim.**

- `constants.ts`: `ROSHAN_PIT: Pt` on the river, away from the two power rune spots (`POWER_RUNES`) and off the mid lane
  path; clear trees/rocks around it in `obstacles.ts`. Pick the spot while looking at the terrain, then check `nav.ts` so
  units can path to it.
- Roshan is a `kind:'creep'`, `team: NEUTRAL`, `sub: 'roshan'` unit, so `isNeutral` logic, bounty, XP and
  provoke-on-damage code are reused. Spawn once at about 0:00 (Dota: at start) via a `roshanAt` timer in `tick()`, and
  re-arm to `time + random(RULES.roshMin, RULES.roshMax)` when he dies. 
- Scale stats by `this.time` on spawn (HP, damage, armor from `RULES`), not continuously.
- Behaviour: a custom `roshanAI` in `ai.ts` registered in the `aiThink` switch (the same dispatch used by `neutralAI`):
  stands in the pit, fights anything that hit him, **Slam** (stun + damage in a radius, short cooldown), regenerates
  fast when no one hit him recently, returns to the pit if dragged far. Optional second ability, spell block, as v2.
- Reward on death (`creepDied`, `world.ts:1049`): a `roshanDied` branch, since `creepDied`'s neutral branch only pays
  the last hitter. Pay the whole killing team a flat gold amount (`RULES.roshGold`) plus XP share, drop the Aegis.
- Kill announcement through the announcer system (`announceAbout`, add a kind in `ANN_TEXT`): "Roshan has been slain".

**Aegis of the Immortal.**

- Pickup: **reuse the rune system.** `Rune` (`world.ts:114`) is already a world list with a proximity pickup in
  `stepRunes` (`:1822`), network-synced via `TOP.runes`, and drawn by the renderer. Add `'aegis'` to `RuneKind`
  with a `team` field restricting who can take it for the first N seconds (the killing team), and a different pickup
  action: give an item rather than a buff. The Aegis lies on the ground at Roshan's death spot until picked up or it
  times out (suggest 5 minutes, `RULES.aegisGround`).
- Item: add `aegis` to `items.ts` (not sold in the shop, so skip it in the shop list); `ItemDef.active` is a closed union in `entities.ts`, so extend it
  with the new actives. Aegis is **passive** with an expiry: store `expiresAt` on the `ItemState` (add the field,
  `ItemState` currently has `charges` and `cdUntil` only) and drop it from the inventory after about 5 minutes.
  One Aegis per hero; a second one just refreshes the timer.
- Death handling: at the top of the hero branch in `kill()` (`:1020`), before `heroDied`, if the hero holds an Aegis:
  consume it, mark `hs.aegisRevive = time + 5`, do **not** count a death or award kill gold/XP/streak (Dota: the Aegis
  death is "free"), keep the corpse state, and have `stepRespawn` (`:1920`) revive at the **death location** with full
  HP/mana instead of at the fountain. Reuse `stopEverything` for the corpse state. Buyback is refused during this window.

**Render and UI.**

- Roshan model in `neutrals3d.ts` (large; reuse `modelkit.ts` helpers), pit decal/hole in `terrain3d.ts`, a minimap marker
  only when visible. The Aegis pickup uses the rune mesh with a distinct gold glow and icon.
- Item icons in `itemicons.ts` and tooltip text for the Aegis. An Aegis timer on the item slot (the cooldown
  overlay can show remaining time).
- Info panel: Roshan HP bar like any unit. Dota shows no respawn timer; skip it.

**Bots.** `team.ts` gets a `roshan` plan: after ~20 minutes, when at least 4 allies are alive and nearby, no enemy heroes
are visible near the pit, and nobody is farming a high-value task, walk to the pit and attack him, with a retreat if the
team drops below a threshold. Bots with the Aegis stay aggressive. Keep this as the last bot behaviour added; the
rest of Roshan is useful without it (humans can kill him).

**Tests (`roshan`).** Spawns once and respawns in the 8-11 minute window; stats scale with time; Slam stuns; he heals
when left alone and resets when dragged away; killing him pays the whole team, drops an Aegis restricted to the killers
for N seconds; a hero with an Aegis revives in place after 5 s with full stats and no death/gold loss; the Aegis expires on the ground and in the inventory;
enemies cannot pick it up during the restricted window; snapshot round trip with the new pickup kind.

---

## 9. HUD rework (Dota 2 layout)

**Reference.** The Dota 2 wiki "Head-up Display" page, image `Interface00gen.jpg`
(<https://dota2.fandom.com/wiki/Head-up_Display>). I read its labels: 1 Main Menu, 2 Settings, 3 Scoreboard, 4 Scan,
5 Glyph of Fortification, 6 Hero Stats, 7 Talents, 8 Health Bar, 9 Mana Bar, 10 Scepter & Shard Status, 11 Quick Buy Menu,
12 Quick Buy TP, 13 Shop & Total Gold, 14 Select Courier, 15 Courier Burst, 16 Courier Shield, 17 Courier Deliver Items,
plus Kills/Deaths/Assists, Last Hits/Denies, Ultimate Available, Radiant Kills, Game Clock, Dire Kills, Network
Information, Minimap, Portrait, Level, Abilities, Passives & Buffs, Inventory & Backpack, Item Hotkey, Neutral Item Slot,
TP Slot, Stash Window, Inspect Cosmetic Items, Showcase View and Voice Response Subtitles.

**Rule you set:** keep their general layout; where we lack the feature, **skip the element** (no empty placeholder).

### Where each Dota element stands

| Dota element | Position in Dota | Us today | Action |
|---|---|---|---|
| Main menu, Settings, Scoreboard (1-3) | top-left, three small buttons | vertical column of 8 buttons down the left edge (pause, camera, quick-cast, stats, sound, graphics, help, test, quit) | **Move** to a top-left row of three: Menu (pause, quit, help, test star), Settings (sound, graphics, camera lock, quick-cast), Scoreboard (same as holding Tab) |
| Kills / Deaths / Assists, Last hits / Denies | text under the three buttons | only in the Tab scoreboard | **Add** a small two-line readout, top-left (data: `hs.kills/deaths/assists/lh/dn`, already on the hero) |
| Hero portraits on the top bar | centre, Radiant left, Dire right | exists (portrait, level, HP, mana, respawn timer) | **Keep** |
| Ultimate Available marker | small indicator above each portrait | none | **Add** for allied heroes: lit when the ultimate is level >= 1, off cooldown and affordable (`ab` is in every snapshot). Not for enemies: hidden enemy stubs carry no ability state |
| Radiant kills, Game clock, Dire kills | top centre | exists (score, time, day/night, rune timer) | **Keep** |
| Network information | top-right | ping text under the clock in multiplayer only | **Move** to a top-right corner readout: ping (multiplayer), FPS (both modes). Packet loss: skip (no data) |
| Minimap | bottom-left | exists | **Keep** |
| Scan (4) | beside minimap | none | **Skip** (no scan) |
| Glyph of Fortification (5) | beside minimap | none | **Add with feature 3**: round button on the minimap's left edge, hotkey G, cooldown sweep |
| Portrait + level badge | bottom centre, left | exists, level circle bottom-left of the portrait | **Keep** |
| Hero stats (6) | button beside the portrait that opens a stats panel | permanent stats column (damage, armor, move, range, attributes) left of the bars | **Change**: replace the column with a small stats button that opens/hover-shows the panel (same numbers). Frees width for the abilities |
| Talents (7) | beside abilities | none | **Skip** (no talents) |
| Abilities row | bottom centre, bars underneath | abilities sit *below* HP/mana/XP bars | **Reorder**: abilities first, HP bar and mana bar directly beneath them (8 and 9), thin XP bar kept as a line under the portrait or between bars |
| Passives & Buffs | small icons above the abilities | no buff display for the player | **Add** an icon row above the abilities from `u.buffs` (each buff already has `label`, `color`, `expires`; buffs are in snapshots), with a countdown ring and tooltip |
| Inventory 3x2, item hotkeys | bottom centre-right | exists (Z X C V B N, cooldown overlays, charges) | **Keep**, move to sit right of the bars like Dota |
| Backpack | under inventory | none | **Skip** |
| Neutral item slot | right of inventory | none | **Skip** |
| TP slot | right of inventory | `#tpslot` with scroll count and T | **Keep** |
| Quick Buy TP (12) | by the shop button | none (TP scroll bought only in the shop) | **Add** a "+" on the TP slot that buys a scroll (`api.buy('tp')`, 100 gold) |
| Quick Buy menu (11) | above the gold, queued items | recommended-item row with Buy and Auto | **Keep** and **move** it into the bottom-right block above the gold, as Dota's quick-buy area |
| Shop and total gold (13) | bottom-right | gold box and Shop button in the inventory frame | **Move** to the bottom-right block (gold left, Shop button right) |
| Stash window | above gold, bottom-right | no stash display (the shop shows a pending count) | **Add** a strip of the items waiting for the courier (`w.pendingFor(p)`), hidden when empty |
| Courier controls (14-17) | next to the shop | none (courier is automatic) | **Skip** (no manual courier control, no burst/shield) |
| Scepter & Shard status (10) | by the abilities | none | **Skip** (no shard; scepter is a stat item) |
| Inspect cosmetics, showcase view | by portrait | none | **Skip** |
| Voice response subtitles | right edge | none | **Skip** |
| **Buyback** | Dota shows it with the shop/gold area when dead | none | **Add with feature 2** (button in the gold block and in the `#respawn` overlay) |

### Target layout (desktop)

```
[Menu][Settings][Score]   [ top bar: 5 hero portraits | kills clock kills | 5 hero portraits ]     ping / fps
 K/D/A  LH/DN

                         (game)

[Glyph]                  [buffs]                                                    [stash strip]
[minimap]  [portrait+lvl][stats] [ abilities Q W E R D ]  [ inventory 3x2 ] [TP+]  [recommended]
                                 [ HP bar ............ ]                         [gold]  [Shop]
                                 [ mana bar .......... ]                         [Buyback when dead]
```

### Implementation plan

Everything is in `src/ui/hud.ts` (template at `build()`, per-frame update later in the file) and `src/styles.css`
(3658 lines). The sim and networking are untouched, with two small exceptions noted below.

**9a. Layout only (no new data).** Pure restructuring of existing elements.
1. Rewrite the `#menu` column as the top-left Menu / Settings / Scoreboard row; move the old buttons into two small
   popovers; keep every existing handler and id so `game.ts` wiring does not change.
2. Reorder the `.center` panel: portrait, stats button, abilities, HP/mana (and thin XP) bars beneath.
3. Move gold, Shop button and the recommended-item row out of `.invframe` into a new bottom-right block.
4. Keep `fit()` scaling (`--ui-s`) working for widths below 1260 px; this is desktop-only, no mobile layout.
5. Update the in-game help text (`#help`) where any hotkey location is mentioned.

**9b. Additions that use data we already have.**
1. K/D/A and LH/DN readout, top-left.
2. Ultimate-available marker on the allied top-bar portraits.
3. Buff icon row for the local player.
4. Stash strip from `pendingFor`.
5. Quick-buy TP "+" on the TP slot.
6. FPS readout (measure in `game.ts` render loop; a small counter, not a perf tool) and ping, top-right.

**Hooked in by the gameplay features** (just a slot, the logic is in the feature): Glyph button (3), Buyback button and
gold-lost text in the respawn overlay (1, 2), a "Backdoor protected" line in the unit-info panel (4), Aegis timer on the
item slot (8), Roshan in the unit-info panel (8). Siege creeps and camp stacks need no HUD change beyond the minimap dot
size and the optional stack badge (7).

**Verification** (no automated UI tests exist, so use the preview): run `npm run dev`, start a single-player match,
and screenshot at 1280x720, 1600x900 and 1920x1080. Compare against the wiki image for placement, and check that
(a) every old control still works (abilities, level-up plus buttons, items, shop, scoreboard, minimap click, pause),
(b) the center panel does not overlap the minimap or the bottom-right block at 1280 px, (c) the console is clean.
Do the same in multiplayer once (`npm run host`, two browser tabs) because the ping/fps readout and ult marker read
replica state.

**Risks.** The HUD is the most-touched UI file and the CSS is large, so keep the reorder in one commit with before/after
screenshots in the PR. Hotkey hints printed in the UI (Z X C V B N, T, S) must stay accurate after the move.

## 10. Map refactor (Dota 2 map)

**References.** Wiki "Map" page (<https://dota2.fandom.com/wiki/Map>) with the labelled map (7.20) and the overhead
view (7.33). Read: two diagonal halves split by the river; Radiant lower-left, Dire upper-right; three lanes (top and
bottom hug the map edges, mid is the diagonal); the river is surrounded by high ground; Roshan lives at the western end of
the river; jungle camps between the lanes and along the map edges; each base is a high-ground area with three lane ramps,
a Tier 4 pair beside the Ancient, and Tier 3 towers on the ramps; the map has six gameplay height levels (river,
lowground = mid lane, highground = base and side lanes, elevated fountain, cliffs, valleys).

**What we already match.** Diagonal halves, three lanes with edge-hugging side lanes, the river along the diagonal,
a walled high-ground base with three ramps, Tier 1-4 tower structure, a fountain, power-rune spots in the river.

**What we change** (everything else in the wiki map needs features we do not have and is skipped, see the end):

| Area | Today | Target |
|---|---|---|
| Lane shape | polylines with sharp corners at the map corners | **rounded corners** (smoothed polylines) so the side lanes sweep around the map like Dota's; same lengths so creep meeting points stay fair |
| River | a thin band running corner to corner, so the side lanes cross it at the map corners | **wider river that stops short of the corners** (Dota's river ends inside the map, closed by rocks and pools), so the side lanes never cross it; only the mid lane does, at the centre; tapered pool ends |
| Relief | flat ground; cliffs are only rock props | a shared **`heightAt(x, y)`** (new, in `constants.ts`) that is **never above 0**: river bed and the Roshan pit sink, the mid lane is a shallow valley (lowground), jungles, side lanes and the base stay at 0 (highground). Only sinking is allowed because hundreds of effects sit at ground level and raising the base would bury them. Used for a displaced ground mesh and for unit height. The base plateau is shown by a taller cliff rim; the high-ground vision rule (`groundLevel`, feature 6) is a separate pure function over the base box |
| Jungle camps | 8 per side, 3 pack types | stay **8 per side** (3 in the secondary jungle, 5 in the primary), re-tiered toward the wiki's mix (ancient / hard / medium / small), same 3 pack types (small = kobolds, medium and hard = wolves, ancient = golems). The wiki's extra edge-area camps (well, mines, statue, graveyard) are skipped: our side lanes sit too close to the map edge to leave room for those pockets |
| Jungle paths | cosmetic dirt trails, 3 per side | trails that **connect every camp to a lane** and form the two jungle routes (primary and secondary), kept free of trees; juke gaps and ward-spot nooks left in the tree line |
| Base | square walled box, three ramps | same walls, **chamfered corner toward the map centre**, flatter ramps, a raised fountain pad; towers T3 on the ramps, T4 pair by the Ancient (already there) |
| Roshan | none | a **pit at the north-west end of the river**: a depression with one opening to the river, a clear approach and ward-spot cliffs; this is where feature 8 puts Roshan |
| Runes | 2 power-rune spots, 4 bounty spots | keep the 2 river power spots; bounty spots moved into the jungles beside the primary camps |
| Edge areas | dense forest belt | unchanged (see camps) |

**Implementation plan.**

1. **Data first (`constants.ts`).** Rounded lane polylines (a small `smooth()` helper over the existing `RAW` points),
   new `CAMPS` list with tiers, `TRAILS`, `BOUNTY_RUNES`, `ROSHAN_PIT`, the river centre line and half width as exported
   data, and `heightAt()`. The terrain builder already reads lanes, camps, trails and the river from these, so most of the
   map changes by editing data. Tower arcs (`TOWER_ARCS`) and the wall segments are re-checked against the new lane
   lengths so towers stay on their lanes and on the ramps.
2. **Obstacles (`obstacles.ts`).** Tree and rock scatter already avoids lanes, rivers, camps, trails and structures; add
   the Roshan pit and the edge pockets to the keep-clear rules, and thicker tree lines along the new river banks so the
   river reads as enclosed.
3. **Terrain (`terrain3d.ts`).** Displace the ground mesh by `heightAt` (more grid segments), put units and couriers at the
   local height (props keep y = 0: they are placed outside the sinking zones), repaint the ground canvas for the new river and
   lanes, carve the Roshan pit, close the river ends.
   Keep draw-call count flat (see `docs/PERFORMANCE.md`: the renderer is draw-call bound).
4. **Nav (`nav.ts`).** Walkability stays flat 2D; check A* still finds every camp, ramp, the pit and both ends of every lane.
5. **Minimap.** Draws the river, lanes and camps from the same data; verify it still matches.
6. **Acceptance checks.** (a) a headless test that every camp, tower, ramp, rune and the pit is reachable from both
   fountains, no structure sits on a tree or rock, lane lengths are equal for both teams; (b) screenshots of the whole map
   side by side with the wiki's labelled map: lanes, river bend, jungle camps, base shape and the pit should be recognisably
   the same layout; (c) frame time not worse than before (`npm run bench:sim`, and the render probe).

**Skipped on purpose (needs features we lack, as you said):** secret shop, outposts, watchers, twin gates, lotus pools,
shrines, effigies, defender's gates, barracks, Tormentor, wisdom runes, edge-area camps and buffs (well, mines, statue,
graveyard), new neutral creep types, trees that can be cut, and tree/cliff vision blocking. The labelled map's markers for
these are ignored.

**Ordering note.** Do 10a before features 6, 7 and 8, because high-ground vision, camp stacking and Roshan all read the
new map data (`heightAt`, camp list, `ROSHAN_PIT`). The renderer part (terrain relief, pit mesh, Roshan model) comes after
the sim parts.

## Cross-cutting checklist

- **Snapshot round trip** (`tests/sim-tests.ts` already has one): extend it for buyback cooldown, glyph
  state, `bdp`, siege `sub`, camp stacks (if shown), Roshan, and the Aegis pickup.
- **Determinism and perf.** `npm run bench:sim` before and after. The risky additions are the per-unit `groundLevel`
  in `computeVision` and the camp area scan; both should stay O(units) per pass. Cache `groundLevel` per unit per pass.
- **README.** Update Controls (Shift+B, G), Features (all eight), Items (Aegis), The map (Roshan pit), Bots,
  and remove the "no Roshan" line and the "never heal" claim.
- **README screenshots.** Once all of the above is tested, regenerate every image in `docs/screenshots/` (title, hero picker,
  loading, gameplay, scoreboard, lane creeps, towers, camps, map overview and base shots, shop, courier, teleport) with the
  new HUD and map, add new ones for Roshan, a siege creep and the Glyph/Buyback UI, and update the README captions (the
  "There is no Roshan" caption goes away).
- **UI checks.** Screenshots at 1280, 1600 and 1920 wide for section 9 (see its verification list).
- **Docs.** Add the wiki values you confirmed (and the source) into `docs/` next to `PERFORMANCE.md`, so the next balance
  pass does not redo this research.

## File collisions

`world.ts` is touched by every feature (it is 2462 lines), so two people working in parallel will conflict there. Safe
parallel split: {1 gold, 2 buyback} on the economy code (`gold`, `heroDied`, `buyItem`, `stepRespawn`); {6 vision} on
`computeVision`; {7 camps} on `spawnCamps` + `neutralAI`; {5 siege} on `spawnCreep`/`spawnWave`/`creepAI`.
Roshan and Glyph/backdoor touch `kill()`/`damage()`, so land them after the others rather than alongside.

## What shipped, and where it differs from this plan

Everything above was built and tested (`npm run test:sim`, new groups: `goldloss`, `buyback`, `glyph`, `backdoor`, `siege`, `highground`, `camps`, `roshan`, `map`). Differences from the plan as written:

- **Order.** The sim features were done first and the HUD rework in one pass afterwards, instead of HUD first. The Glyph and Buyback buttons were added to the new layout in that pass.
- **Map.** Changed: rounded lane corners, a wider river that starts in Roshan's pit and ends in a pool short of the map corners (so only the mid lane has a ford), `heightAt` relief (river bed, mid-lane valley, the pit, never above 0), the two power-rune spots moved onto the new river, Roshan's pit with a rock ring, rounded river ends. **Not changed:** camp count and tiers, the dirt trails, the bounty-rune spots and the base walls (the base already has three ramps and a chamfered mid-lane corner). The edge-area camps were skipped as noted in section 10.
- **Camp stack badge** (optional in section 7) was not added; stacks show as the extra monsters standing in the camp.
- **Vision.** High ground is the two base plateaus only. Buildings stay visible from low ground, so a team can still hit towers up the cliff.
- **Glyph** protects buildings only (no lane-creep protection, no multi-target towers).
- **Siege creeps** spawn at the lane's start (there are no barracks) and use the same 7:30 upgrade steps as the other lane creeps.
- **HUD.** Kept as in the table in section 9. The quick-buy row is the existing recommended-item row. Hero stats appear on hover over the "Hero stats" button. Skipped: Scan, Talents, backpack, neutral item slot, courier controls, scepter/shard status, cosmetics, voice subtitles.
- **Screenshots.** All gameplay screenshots in `docs/screenshots/` were regenerated at 1600x900 from the new build (the title, hero picker, loading, shop and per-hero images did not change). New ones: `roshan`, `siege-creep`, `glyph`, `buyback`.
