# Performance report and fix plan

Measured 2026-10-23 on an Apple M1 Pro, Chrome-based in-app browser, Vite dev build, single-player 5v5 with bots.
Re-run with `npm run bench:sim` (headless simulation) and `bench/render-probe.js` (browser, see the file header).

## Summary

The simulation is cheap. The renderer is not: it is **CPU-bound on draw calls**, with a second GPU cost in post-processing that grows quickly with display resolution.

| Area | Result | Verdict |
|---|---|---|
| Simulation (20 min 5v5, headless) | 0.16 ms/tick mean, p99 0.9 ms, max 6.7 ms (1% of a 16.7 ms frame) | healthy |
| Render, idle view | 817 draw calls, 1.8M triangles, 3.3 ms CPU, 5.7 ms GPU | OK on M1, heavy for weaker GPUs |
| Render, 5v5 teamfight | up to 3.9k-5.0k draw calls, CPU render mean 10.6 ms / p95 15-18 ms / max 41 ms, frame p95 17.7 ms | **below 60 fps on an M1 Pro** |
| Render at 2x DPR (retina) | GPU 12.5 ms vs 4.8 ms at 1x | fill-rate bound |
| GPU resources over a match | geometries 2,107 -> 4,274 in 8 sim-minutes while live units stayed ~100-126 | **leak** |
| Multiplayer snapshot | 24.8 KB x 20 Hz = ~500-615 KiB/s per client; 96% of unit fields unchanged between snapshots | wasteful |
| Bundle | 1.38 MB JS (379 KB gzip), single chunk | fine, minor |

## Findings (ordered by impact)

### 1. Every unit mesh is its own draw call, with nothing shared (CPU, critical)
- Per model: hero 124 meshes, courier 40, creep ~19, tower ~6.5. 2,800 unit meshes in a 5v5 match.
- 2,799 distinct geometries and 711 materials for those 2,800 meshes: no geometry or material is shared, even between creeps of the same type and team (`src/render/modelkit.ts` builds fresh `Builder` materials and geometries per call).
- During a teamfight ~85-90% of draw calls come from unit meshes (about 3,200 visible unit meshes vs about 330 vfx meshes).
- Cost is roughly 3 us per draw call, so CPU render time scales linearly with the call count above.

### 2. The shadow pass re-draws everything (CPU)
Every unit mesh sets `castShadow = true` (`Builder.mesh`), so each is submitted twice. Measured in a fight:

| Config | Draw calls | CPU render |
|---|---|---|
| baseline | ~1,500 | 4.8-5.4 ms |
| shadows off | 233 | 2.2 ms |
| only heroes cast shadows | 876 | 3.5 ms |

### 3. MSAA x4 on a half-float target and bloom dominate GPU time at high DPR
`setupComposer` uses `HalfFloatType, samples: 4` plus `UnrealBloomPass`, and DPR is capped at 2 rather than 1.5. At 2x DPR: bloom costs about 6.9 ms and MSAA about 6.4 ms of the 12.5 ms total (each alone: 5.6 ms bloom off, 6.1 ms MSAA off). At 1x, bloom costs about 1.5 ms.

### 4. Instanced trees and rocks are never culled (vertex work, scales poorly on weaker GPUs)
19 `InstancedMesh` objects hold 18,608 props (988k triangles) with a map-wide bounding sphere. Only 3.7% of those triangles are on screen, yet all are submitted in the main pass and again in the shadow pass (1.8M triangles per frame). On the M1 hiding them saves only ~0.5 ms CPU and no GPU time, so this is mainly a risk for integrated GPUs and laptops on battery.

### 5. GPU resource leak (memory, grows over a match)
`syncUnits`, `syncProjs`, `syncWards`, `syncRunes` call `scene.remove(...)` but never `dispose()` geometries or materials (`makeProj` also allocates new geometry per projectile, and the status-shell sphere is never freed). Geometry count grew about 270 per sim-minute. A 40-minute game would hold tens of thousands of orphaned buffers.

### 6. Snapshot protocol resends static data (multiplayer bandwidth)
Of a 24.8 KB snapshot (62 units), towers are 6.2 KB, creeps 5.6 KB, heroes 8.8 KB. Each unit repeats name, radius, `st` stat block, ability and item lists every 50 ms, and 96% of fields do not change between consecutive snapshots. Server cost is fine (0.29 ms per snapshot), so this is a bandwidth and client JSON-parse issue for online play.

### 7. Smaller items
- Simulation hot spots (not a problem today): `stepUnit` 51%, `acquire` 26% (O(units) per idle unit per tick), `separate` 11.6% (O(n^2)), `computeVision` 1.8%. Sporadic spikes up to 11.7 ms during fights (0.07% of ticks). A* costs 0.2-2.5 ms per long path (linear-scan open list, `Map`/`Set`).
- About 14 MB/s of JS allocation at idle (`new Vector3`/`Set` per frame, `Color.set(string)` per frame in `draw`, `Array.filter` in the sim loop), which causes frequent minor GCs.
- Bundle is one 1.38 MB chunk (three.js plus three.quarks): a vendor chunk would improve caching. Startup is fine (renderer build ~90 ms, first-frame shader compile ~240 ms).

## Fix plan

Each step lists its own verification so regressions are caught by the probe.

### Phase 1: quick wins (about half a day, low risk)
1. **Shadow casters**: only heroes, towers, ancients, couriers cast shadows. Creeps and summons set `castShadow = false` (optionally a cheap blob decal under them). Expected: fight draw calls about -40%, CPU about -30%.
2. **Dispose on removal**: add a `disposeModel(group)` helper (geometry, materials, shell) and call it from `syncUnits`, `syncProjs`, `syncWards`, `syncRunes`; cache the projectile geometries and materials per style instead of allocating per projectile. Verify: `__probe.leak(8)` shows flat `geometries`.
3. **Chunk instanced props**: split trees and rocks into spatial tiles (about 1,600 world units, <= 36 per prop type) so frustum culling works for both the camera and the shadow camera. Expected: submitted triangles 1.8M -> about 150k.
4. **Resolution and post-processing**: cap DPR at 1.5 (or add dynamic resolution scaling that lowers it when frame time exceeds budget), disable the render target MSAA in favour of FXAA/SMAA (or 2x), halve the bloom resolution or mip count. Add a quality setting (Low/Medium/High) so slower machines can opt down. Expected: retina GPU time about 12.5 ms -> about 5-6 ms.

### Phase 2: structural (about 2-3 days, main payoff)
5. **Merge static model parts**: when building a model, bake every static mesh into one geometry per material (`mergeGeometries` after applying local matrices). Keep only the animated pivots (`weapon`, `body`, `spin`, parts touched by `update()`) as separate objects. Targets: hero <= 12 meshes, creep <= 5, courier <= 3, tower <= 3. Expected: unit meshes 2,800 -> about 400; fight draw calls 3.3k -> about 700; CPU render about 10 ms -> about 3 ms.
6. **Share geometry and materials across instances**: cache merged geometry per (hero id) / (creep sub) and materials per (id, team). The damage flash and invisibility currently mutate per-material `emissive` and `opacity`, so use a small per-unit material set or per-instance uniform instead of cloning everything.
7. **Instance creeps**: lane creeps (50+ units of 4 types) become `InstancedMesh` per type and team with per-instance matrix, death sink via scale, and hit flash via `instanceColor`. Needs a spike first; do it only if step 5-6 do not hit the budget.

### Phase 3: multiplayer and housekeeping (as needed)
8. **Snapshot v2**: send unit definitions (name, radius, base stats, kind) once on spawn; per snapshot send only changed fields (quantized positions, hp), and items/abilities only when they change. Expected: 24.8 KB -> about 5-8 KB.
9. **Sim scaling** (only if unit counts grow): spatial hash for `acquire`/`separate`, throttle idle `acquire` to 0.1-0.2 s per unit, binary heap plus typed arrays for A*.
10. **Allocations and bundle**: reuse temporary `Vector3`/`Color`/`Set` in the render loop, `manualChunks` for three and quarks.

## Acceptance targets (re-measure with the probe after each phase)

| Metric | Now | Target |
|---|---|---|
| Teamfight draw calls (mean / max) | 2.8k / 5.0k | < 800 / < 1.2k |
| Teamfight CPU render (mean / p95) | 10.6 / 15-18 ms | < 4 / < 6 ms |
| Teamfight frame p95 at 1x DPR | 17.7 ms | < 10 ms |
| GPU time at 2x DPR | 12.5 ms | < 7 ms |
| Geometries after 8 sim-minutes | 4,274 | flat (about 2,000) |
| Snapshot size | 24.8 KB | < 8 KB |

## Caveats
- One machine (M1 Pro, tile-based GPU with very high vertex throughput), one browser, a 790-1024 px wide pane. Weaker GPUs will show the triangle and fill-rate issues earlier than these numbers suggest; the 2x DPR experiment emulated a retina display by overriding `devicePixelRatio`.
- The teamfight is scripted (all heroes teleported to mid at max level), so it is a worst case, not an average.
- GPU time comes from `EXT_disjoint_timer_query_webgl2`; CPU render time is the time inside `composer.render()`. Draw-call counts include the shadow pass.
- Not tested: Firefox/Safari, real network latency, mobile.
