# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project: Ancient Clash

A browser Dota 2–style 5v5 MOBA (TypeScript, three.js, Vite) with LAN/online multiplayer hosted from one PC. No art or audio files: every model, effect and sound is generated in code. Target platform is **desktop browsers only** (no mobile), so use desktop performance budgets.

## Commands

```bash
npm install
npm run dev          # Vite hot-reload client on :5173 (single player only)
npm run host         # vite build, then start the game server on :8080 (PORT=9000 to change)
npm run server       # start the server without rebuilding (serves the existing dist/)
npm run typecheck    # tsc --noEmit (covers src/ and server/ only, not tests/ or bench/)
npm run build        # typecheck + vite build
npm run test:sim     # headless gameplay tests; runs 25-minute bot matches, takes minutes
npx tsx tests/sim-tests.ts <name>      # run ONE test group, e.g. pings, nav, stop
npx tsx tests/sim-tests.ts soak <seed> # one 25-minute bot match for a given seed
npm run bench:sim    # headless sim benchmark (npx tsx bench/sim-bench.ts [minutes] [--phases] [--snap])
```

- There is no linter and no test runner: `tests/sim-tests.ts` is a plain script. Each group is a key of the `tests` object; it records `ok(name, cond)` results and sets a non-zero exit code on any failure. Add new checks as a new key or inside an existing group.
- `tsconfig` is `strict: false` but with `strictNullChecks` and `noUnusedLocals` on, so unused imports/locals fail `typecheck`.
- The server serves `dist/`: after client changes run `npx vite build` (or `npm run host`) before testing multiplayer. `npm run dev` does not include the multiplayer server.
- `bench/render-probe.js` is not a script: paste it into the browser console during a single-player match (needs `window.__game`).

## Architecture

The core idea: **`src/sim/` is a pure, headless game simulation that runs unchanged in three places**: in the browser (single player), on the Node server (multiplayer, authoritative), and in tests/benchmarks. Nothing under `src/sim/` may touch the DOM, three.js, or `src/render`/`src/ui`. The sim ticks at a fixed `STEP = 1/60` (`src/sim/constants.ts`).

- **`src/sim/world.ts`** (~2.5k lines) — the `World` class owns all state and the tick: units, projectiles, zones, wards, runes, vision (`vis` per team), pings, damage/kill/reward rules, items, couriers, camps. Almost everything gameplay-related is reached from here. `world.player` is client-side only; the sim never reads it because the host serves many players.
- **Bots** — `ai.ts` (per-unit: heroes, creeps, neutrals, towers) and `team.ts` (`TeamBrain`: team-level push/defend/gank/rescue planning). Bots obey the same rules as players (fog, gold, courier, scrolls). Pings steer bot behaviour.
- **Heroes and abilities** — each hero is a `HeroDef` (`entities.ts`) whose `abilities` reference `AbilityDef`s. `heroes.ts` holds the first few heroes inline and concatenates `HEROES_G1…G5` from `heroes_g*.ts` (hero groups), then builds `HERO_BY_ID`/`ABILITY_BY_ID` with `indexUnique`, which **throws on duplicate ids**. Shared ability helpers live in `abkit.ts`; common ability definitions in `abilities.ts`. `HeroDef.buy` and `skillOrder` drive bot builds.
- **Map/pathing** — `constants.ts` (lanes, towers, camps, cliffs, ramps, XP table), `obstacles.ts` (trees/rocks, shared with rendering), `nav.ts` (collision + A* on a grid). Buildings count as obstacles.
- **Networking (`src/net/`)** — the server (`server/index.ts`, `ws` WebSockets + static file server for `dist/`) runs the lobby (10 seats, unique heroes across both teams) and the `World`, ticking at 60 Hz and sending a snapshot every 3 ticks (20 Hz). Snapshots are built **per player** and **fog-filtered per team** (`snapshotFor` in `snapshot.ts`); a per-connection `SnapshotEncoder` sends deltas and the client's `SnapshotDecoder`/`Replica` rebuild a `World` replica that the renderer interpolates. Changing any sim field the client needs to see means updating `snapshot.ts` (encode and decode) — the "multiplayer snapshot round trip" test guards this.
- **`Api` abstraction (`src/net/api.ts`)** — everything the local player can order. `LocalApi` calls `World.order*` directly (single player); `NetApi` sends commands to the server. `game.ts` only talks to `Api`, so a new player command needs both implementations plus the server handler.
- **`src/game.ts`** — one `Game` per match: input, camera, targeting, HUD wiring, render loop. It works off `world` whether that's local or a network replica. `src/main.ts` is the title screen and single-player/multiplayer flow.
- **Rendering (`src/render/`)** — `renderer3d.ts` syncs `World` state to a three.js scene (post-processing, bloom). Models and effects are procedural and registered by merging per-group tables: hero models `heroes3d.ts` + `heroes3d_g1…g5.ts` (built with `modelkit.ts`), VFX `vfx.ts` + `vfx_base.ts` + `vfx_g1…g5.ts` (`vfxkit.ts`, three.quarks particles). `mergeUnique` throws on duplicate ids, like `indexUnique` in the sim.
- **`src/ui/`** — DOM HUD (`hud.ts`), lobby (`netlobby.ts`), loading and title screens, item icons drawn in code.
- **`src/audio.ts`** — WebAudio-synthesized SFX/music/announcer.

### Adding a hero

A hero spans three parallel registries that must share the same id: sim definition (`src/sim/heroes*.ts`), 3D model (`src/render/heroes3d*.ts`), and VFX per ability (`src/render/vfx*.ts`). Adding to a group file (the newest is `*_g5`) is the usual route; the duplicate-id checks above will fail at load if ids collide. The roster is documented in `README.md` (hero count, per-hero ability lists) — update it when it changes.

## Docs

`README.md` has the player-facing rules, controls, gold/XP formulas and a project layout. `docs/PERFORMANCE.md` (renderer is draw-call bound; sim is ~1% of a frame) and `docs/REFACTOR_PLAN.md` are planning documents; parts of the refactor plan have since landed (e.g. the delta snapshot encoder), so check the code before trusting either as current state.
