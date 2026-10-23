# Combined refactor plan

Merges three inputs into one ordered plan:

- **CR**: code review and `/simplify` report (10 bug findings plus cleanups; read-only, `tsc` passes, not play-tested).
- **BP**: best-practices research (netcode, three.js, loading).
- **PERF**: [PERFORMANCE.md](PERFORMANCE.md) (measured on one M1 Pro, bots only).

Nothing here has been applied. CR bug findings were read from code, not reproduced: reproduce each before fixing it.

## 1. Where the reports agree

Items flagged by two or more reports are the plan's backbone.

| Theme | CR | BP | PERF | Decision |
|---|---|---|---|---|
| **Snapshot wire format** resends static and unchanged data | build unit JSON once, stop resending fixed fields | quantize, delta, send statics once | 24.8 KB x 20 Hz, 96% of fields unchanged | Measure `perMessageDeflate` first (Phase 1), then snapshot v2 (Phase 5). |
| **GPU resources never freed** | dispose geometries and materials on mesh removal | dispose what you remove | geometries 2,107 -> 4,274 in 8 min | Phase 1. |
| **Too many draw calls, nothing shared** | share ring and projectile geometry per style | `InstancedMesh`/`BatchedMesh`, merge static meshes, few shadow casters | 2,799 geometries for 2,800 meshes; shadow pass doubles calls | Phase 1 (shadows), Phase 4 (merge and share). |
| **Per-frame allocation** | scratch vectors in `toScreen`, cache camera matrices and gradients | pool, don't allocate in the frame loop | ~14 MB/s at idle | Phase 6. |
| **Sim hot spots** (`acquire`, `separate`, A*) | grid, heap, unreachable-goal memo, `recalc` flag | n/a | sim is 1% of a frame; A* 0.2-2.5 ms per long path, rare spikes to 11.7 ms | Demoted to Phase 6; grid only if measured. |
| **Bundle** | delete dead 2D renderer (~80% of `renderer.ts`) | 300-500 KB gzip budget | 379 KB gzip, single chunk, "fine" | Already in budget; dead-code removal is for maintainability, `manualChunks` for caching. |

Items from one report that still go in: all CR bug fixes and the multiplayer-perspective fix, BP buffered interpolation, instant order feedback, reconnect and `visibilitychange` handling.

## 2. Facts checked in the code

These change what the reports recommended:

- **Snapshots already carry server time and a sequence number.** `snapshotFor` emits `t` (sim time) and `seq` ([snapshot.ts:203](../src/net/snapshot.ts:203)). BP's "add a server tick to each snapshot" is already done. The client stores both but interpolates by receive time: `update()` lerps each unit toward the latest snapshot over the last measured interval ([snapshot.ts:451](../src/net/snapshot.ts:451)). **Buffered interpolation is therefore a client-only change** and does not need to wait for a protocol change.
- **Stale-message drop by `seq` is moot within one connection.** WebSocket is ordered. It only matters across a reconnect, so it belongs with the reconnect work.
- **Snapshots are built per player, not per team.** `broadcastSnapshots` calls `snapshotFor(w, hero.team, hero.id, seq, ev)` once per player ([server/index.ts:177](../server/index.ts:177)). Only `me` and the player's courier differ between teammates, so a per-team body plus a small per-player header is possible.
- **Client and server always ship together.** The server serves the client from `dist/` (`npm run host` builds then starts the server). A protocol change costs nothing extra to deploy, so there is no reason to bundle all network changes into one big bump. Each can land on its own.
- **`perMessageDeflate` is off.** `new WebSocketServer({ server, path: '/ws' })` uses the `ws` default, so compression has not been tried.
- **No reconnect and no `visibilitychange` handling.** `ws.onclose` only fires a callback ([client.ts:33](../src/net/client.ts:33)).
- **The status-effect shell mesh** (`e.shell`, [renderer3d.ts:462](../src/render/renderer3d.ts:462)) is created lazily and is one of the never-disposed objects PERF mentions.

## 3. Conflicts and how they are resolved

1. **What to optimize first.** CR ranks sim and snapshot-building work first; PERF shows the sim costs ~1% of a frame and building a snapshot 0.29 ms. **Renderer first, network feel early (it is cheap), sim last.**
2. **"Build unit JSON once and splice" (CR) vs "delta against acknowledged baseline" (BP).** Over an ordered, reliable WebSocket no ack protocol is needed: send deltas against the previous snapshot sent on that connection, and a full keyframe on join or reconnect. Build the team-level part once per team per tick and reuse it for every teammate. This subsumes CR's splice idea.
3. **JSON deltas vs binary.** BP mentions binary; BP also says "even keeping JSON but sending only changed fields would help". Decision: measure `perMessageDeflate`, then JSON deltas. Binary only if bandwidth is still a problem after that.
4. **When to fix the multiplayer perspective.** CR calls it the biggest correctness finding and puts it right after the small bug fixes. It is kept there (Phase 2). Bundling it with the snapshot rewrite would delay a correctness fix by days for no deployment benefit (see section 2).
5. **Material state.** CR fixes the respawn opacity bug (`renderer3d.ts:358`); PERF wants materials shared across instances, which makes per-material `opacity`/`emissive` changes unsafe. Apply the one-line opacity reset now. Redesign per-unit flash and invisibility state in Phase 4 (small per-unit material set or per-instance uniform), and re-test respawn visuals there.
6. **Dedupe vs merge.** The four `heroes3d_g*.ts` files copy scaffold code (CR), and PERF's model merging lives in `modelkit.ts`. Dedupe into `makeScaffold` first (Phase 3), then add merging once (Phase 4).
7. **Pixel ratio.** BP says cap at 2 (the current value); PERF measured 2x costing 12.5 ms vs 4.8 ms at 1x and recommends 1.5 or dynamic resolution. PERF's measurement wins; a quality setting lets high-end machines pick 2.
8. **Draw-call target.** BP's "under ~100 draw calls" is a mobile guideline. The target platform is desktop web only, so the plan uses PERF's desktop target (< 800 in a fight) and mobile-specific advice is out of scope.
9. **Prediction and transport.** No full client prediction (BP: not worth it for a MOBA). WebTransport, lockstep and lag compensation are out of scope.

## 4. Phased plan

After every phase: `npm run typecheck`. After Phases 1, 4, 5 and 6: re-measure with `npm run bench:sim` and `bench/render-probe.js`. For every phase that touches `server/` or `src/net/`: a two-client LAN session with one browser per team. One logical change per commit.

### Phase 0: baseline
- Commit `bench/`, `docs/PERFORMANCE.md`, this plan and the `bench:sim` script in `package.json` (the only change in that file).
- Save the probe output (draw calls, frame p95, geometry count, snapshot bytes) as the "before" numbers.

### Phase 1: low-risk fixes (about 1 day; 1a, 1b and 1c touch different files)

**1a. Correctness and security (CR)**
1. Add `esc()` and use it for every server-supplied string reaching `innerHTML`: `netlobby.ts:63,93,97`, `loading.ts:38`, `hud.ts:204,494,725`. Highest severity: a player name runs script in every other player's browser.
2. Static-file check compares against `DIST + path.sep` (`server/index.ts:364`). Today `startsWith(DIST)` also matches sibling paths such as `dist-other/`.
3. Send seatless lobby members `busy` instead of `start` (`server/index.ts:156`).
4. Clear `client.onLobby` at match start so lobby messages can't overwrite VICTORY/DEFEAT (`main.ts` `onStart`, `netlobby.ts:149`).
5. Remove `broadcastLobby()` from the 4 ms loop (`server/index.ts:207`).
6. Reset material opacity to 1 on respawn (`renderer3d.ts:358`).
7. Fix `skillOrder` data (19 heroes over-list abilities) and make `autoLevel` skip entries that can't level (`world.ts:969`, `heroes_g*.ts`).
8. Bots count courier-queued salves before re-buying (`ai.ts:296`).

**1b. Render quick wins (PERF; each measured)**
1. Shadow casters: heroes, towers, ancients and couriers only. Expected: fight draw calls about -40%, CPU render about -30%.
2. `disposeModel(group)` (geometry, materials, status shell) called from `syncUnits`, `syncProjs`, `syncWards`, `syncRunes`. Cache projectile geometry and materials per style, and share ring geometry. Verify with `__probe.leak(8)`: geometries stay flat.
3. Chunk trees and rocks into spatial tiles (~1,600 units) so camera and shadow frustum culling work. Expected: 1.8M -> ~150k submitted triangles.
4. DPR cap 1.5 (or dynamic resolution), replace 4x MSAA with FXAA/SMAA or 2x, cheaper bloom, plus a Low/Medium/High quality setting. Expected at 2x DPR: GPU 12.5 ms -> about 5-6 ms.

**1c. Network quick wins (BP; client-side or one-line)**
1. Turn on `perMessageDeflate` and measure bytes per snapshot and server CPU. Keep it if CPU stays acceptable. This sets the baseline Phase 5 has to beat.
2. Buffered interpolation using the existing `t`: keep the last 3 snapshots, render ~100 ms behind, interpolate between the two surrounding snapshots, adapt the delay to measured jitter, keep the >450-unit teleport snap. Replaces lerp-to-latest in `Replica.update`.
3. Instant order feedback: move/attack marker and a "pending" cursor on click. First check whether a local marker already appears before the server answers.
4. Show live ping on the HUD (it is already measured every 2 s).

### Phase 2: multiplayer perspective (CR; about half a day, medium risk)
1. Sim events carry facts, not text, e.g. `{kind:'tower_down', subjectTeam, actorId}`. Each client derives wording, tone and volume from its own team (`Game.announceLine`, `onEvent`).
2. Filter popups and sound events per recipient in `snapshotFor`, where visibility is already filtered.
3. Once that works, delete `World.player` and the `mine` parameter, and split `HeroState.isPlayer` into "human-controlled" and "is the local viewer".
4. Test with two browsers, one per team: "Victory!"/"Defeat" and "Your tower has fallen" must be correct on both.

### Phase 3: dedupe and dead code (CR; mechanical, prepares Phase 4)
- Delete the dead 2D renderer; keep the minimap in `minimap.ts`; move `nightAmount` to `World`. (`renderer.ts` is imported by `game.ts`, `renderer3d.ts` and `terrain3d.ts`; check each import.)
- `makeScaffold` in `modelkit.ts` for the four `heroes3d_g*.ts`; `vfxkit.ts` for the helpers copied across `vfx_g3`/`vfx_g4`.
- `abilities.ts` imports from `abkit.ts`; `clampMap`, `predict`, `lowestHp` move there. `LANE_SLOTS`, `LANE_NAME`, `shuffle`, `STEP` go into `constants.ts`. Export the river and lane-distance helpers from `obstacles.ts` for `terrain3d.ts`.
- `World.nearestTpPoint`, `World.ancientOf`, named constants for the 420 range and the 3 s channel.
- `NEUTRAL = 2` team constant; declare the missing `Brain` fields.
- Remove about 25 `void x` no-ops, the unreachable `!killer` block, the duplicate `lastCast` assignment and unused exports. Drop the legacy `fx()` ring/line/meteor path in favour of `vfx()`.
- Share `togglePause`/`toggleQuickCast` between HUD buttons and keys; remove the duplicate `worth()` in the HUD.
- The larger function splits (`kill()`, `useItem()`, `botAI`) move to Phase 7 unless a later phase touches those functions anyway.

### Phase 4: render restructure (PERF; about 2-3 days, main frame-time payoff)
1. Merge static meshes per material in the model builders (`mergeGeometries`; `BatchedMesh` is the alternative if merged parts need per-part visibility). Keep only animated pivots separate. Targets: hero <= 12 meshes, creep <= 5, courier <= 3, tower <= 3.
2. Share geometry per hero id / creep subtype and materials per (id, team). Redesign damage flash and invisibility so they no longer mutate shared materials. Re-test respawn opacity.
3. Pool short-lived vfx meshes and particles instead of creating and disposing them each time.
4. Instance lane creeps only if steps 1-3 miss the draw-call budget (spike first).

### Phase 5: snapshot v2 and connection robustness (BP + CR + PERF)
1. Send unit definitions (name, radius, base stats, kind, abilities) once, when a unit first becomes visible to a team. Snapshots carry only changed fields, with quantized positions; items and abilities only when they change. Build `stubSnap` directly instead of via `unitSnap`.
2. Build the team-level part once per team per tick; add the per-player `me`/courier part on top.
3. Fog of war: units entering vision get a definition, units leaving vision get a removal, stubs stay stubs. Test both teams.
4. Reconnect with a full keyframe; drop messages whose `seq` is older than the keyframe; `visibilitychange` handling that restarts the loop once and clamps the first frame delta.
5. Target: under 8 KB per snapshot before compression, and lower than the Phase 1c deflate result.

### Phase 6: sim, UI and allocation hygiene (measure first)
- A*: binary heap (and typed arrays), remember unreachable goals, cache `lineClear` per unit. This fixes the stall on unreachable goals that CR found.
- `recalc` dirty flag and boolean buff flags instead of repeated `buffs.some(...)`; throttle idle `acquire` to 0.1-0.2 s.
- Uniform grid for `separate`/`acquire`/projectile hits/`computeVision` only if `bench:sim` shows it matters.
- Cache the minimap background in an offscreen canvas, the camera matrices and the fog/vignette gradients. Reuse scratch vectors in `toScreen` and temporary `Vector3`/`Color`/`Set` in the render loop; no `Color.set(string)` per frame; no `Array.filter` in the sim loop.
- HUD change detection: cache element references, skip unchanged DOM writes, and key `renderScore` and `updateUnitInfo` on a signature string.
- `manualChunks` for three and three.quarks.

### Phase 7: structural (optional, only if the project keeps growing)
`aim`/`onKill` fields on `AbilityDef` instead of hero-id checks in `game.ts`, `world.ts` and `ai.ts`; typed `Unit` fields instead of `extra`, with `EX_KEYS` as the only serialisation path; `World.displace` as the only writer of unit positions; a `WorldView` read model so `Replica` stops being a half-built `World`; `heroes3d`/`vfx`/`heroes` grouped by theme with duplicate-id checks; split `kill()`, `useItem()` and `botAI`.

## 5. Acceptance targets

| Metric | Now | After Phase 1 (expected) | Final target |
|---|---|---|---|
| Teamfight draw calls (mean / max) | 2.8k / 5.0k | about 1.7k / 3k | < 800 / < 1.2k |
| Teamfight CPU render (mean / p95) | 10.6 / 15-18 ms | about 7 ms mean | < 4 / < 6 ms |
| Teamfight frame p95, 1x DPR | 17.7 ms | n/a | < 10 ms |
| GPU time at 2x DPR | 12.5 ms | about 5-6 ms | < 7 ms |
| Geometries after 8 sim-minutes | 4,274 | flat | flat (~2,000) |
| Snapshot size | 24.8 KB | measured with deflate | < 8 KB uncompressed |
| Remote units with one late packet | freeze, then jump | smooth (~100 ms buffer) | smooth |
| CR findings | 10 open | the 8 items in 1a fixed | all 10 marked fixed, skipped or no change needed |

"After Phase 1" numbers are PERF's own estimates (-40% calls, -30% CPU, 5-6 ms retina), not measurements. The CR report lists its 10 findings only partly: 1a covers its 7 table rows (row 7 split into two items), and Phase 2 (perspective) and Phase 6 (A* stall) cover the others it names. Map all 10 explicitly before closing them out.

## 6. Open questions and risks

- Target platform is desktop web only (decided 2026-10-23); mobile is out of scope.
- PERF numbers come from one M1 Pro. Weaker desktop GPUs (Intel/AMD integrated, laptops on battery) will show the triangle and fill-rate problems earlier. Re-measure on one before deciding on instancing creeps.
- No one has run the CR bugs, checked background-tab behaviour in networked play, or tested whether click feedback already exists.
- The teamfight benchmark is a scripted worst case, not an average match.
- BP's sources disagree on Safari's WebTransport support. That only matters if the out-of-scope transport work is ever picked up.

## Status (2026-10-24)

All phases were implemented on branch `refactor/combined-plan`, one commit per logical change. Measured results are in
[PERFORMANCE.md](PERFORMANCE.md#results-after-the-refactor-2026-10-24-branch-refactorcombined-plan).

| Phase | Status | Notes |
|---|---|---|
| 0 Baseline | done | bench files committed; `bench/render-bench.js` added for repeatable render runs |
| 1a Correctness and security | done | all 8 items; verified with two LAN clients (escaped names, seatless `busy`) |
| 1b Render quick wins | done | MSAA later replaced by FXAA (see below) |
| 1c Network quick wins | done | deflate on; buffered interpolation uses the existing `t`; click markers already existed |
| 2 Multiplayer perspective | done | headless check: each team gets its own wording/tone; `World.player` kept as the client's viewed hero, unused by the sim |
| 3 Dedupe and dead code | done | `noUnusedLocals` now on |
| 4 Render restructure | done | merging plus rigid skinning instead of creep instancing (draw calls already in budget) |
| 5 Snapshot v2 and reconnect | done | JSON deltas, not binary (1.1 KB per message made binary unnecessary); resume verified live and after reload |
| 6 Sim/UI hygiene | done, partly by choice | A*, LOS cache, minimap/overlay/HUD caches, vendor chunks. Not done: recalc dirty flags, idle-acquire throttling, spatial grid (sim is ~1% of a frame) |
| 7 Structural | done except file regrouping | `aim`/`onKill`/etc. fields, typed Unit fields + NET_KEYS, `World.displace`, `WorldView`, duplicate-id registries, split `kill`/`useItem`/`botAI`. The g1..g4 files were not regrouped by theme: sim and render must stay in separate import graphs, so a per-hero module would still be two files |

Found during measurement: 4x MSAA on the composer's render targets made every post pass pay MSAA cost
(~41 ms GPU at 2x DPR with bloom). Medium and High now use FXAA instead.
