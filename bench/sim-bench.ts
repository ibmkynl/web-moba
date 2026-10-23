/**
 * Headless simulation benchmark: runs a full 5v5 bot match with no renderer and reports per-tick cost.
 *
 *   npx tsx bench/sim-bench.ts [minutes=20] [--phases] [--snap]
 *
 * --phases  wraps World methods to attribute time to each tick phase (adds a little overhead)
 * --snap    also measures the multiplayer snapshot builder at 20 Hz (what server/index.ts does)
 * Budget: one tick must stay well under 16.7 ms on the client (sim + render share the frame) and under 4 ms on the server.
 */
import zlib from 'node:zlib'
import { World } from '../src/sim/world'
import { STEP } from '../src/sim/constants'
import { HEROES } from '../src/sim/heroes'
import { snapshotFor } from '../src/net/snapshot'

const minutes = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 20)
const PHASES = process.argv.includes('--phases')
const SNAP = process.argv.includes('--snap')

const ids = HEROES.map((h) => h.id)
const lanes = ['top', 'mid', 'bot', 'mid', 'bot'] as const
const pick = (off: number) => lanes.map((lane, i) => ({ hero: ids[(off + i * 3) % ids.length], lane }))
const t0 = performance.now()
const w = new World({ playerHero: ids[0], playerLane: 'mid', teams: { rad: pick(0), dire: pick(1) } })
const buildMs = performance.now() - t0

const phase: Record<string, { ms: number; n: number }> = {}
if (PHASES) {
  const proto = World.prototype as any
  for (const name of ['computeVision', 'separate', 'acquire', 'stepUnit', 'recalc', 'stepBuffs', 'stepRegen', 'stepHeroAbilities', 'stepProjectiles', 'stepZones', 'stepRunes', 'spawnWave', 'enemiesIn', 'enemyHeroesNear', 'damage']) {
    const orig = proto[name]
    if (!orig) continue
    phase[name] = { ms: 0, n: 0 }
    proto[name] = function (...a: any[]) {
      const s = performance.now()
      const r = orig.apply(this, a)
      phase[name].ms += performance.now() - s
      phase[name].n++
      return r
    }
  }
  const t = proto.team ?? null
  void t
}

const samples: number[] = []
const snapSamples: number[] = []
const unitCounts: number[] = []
let snapBytes = 0
let snapZBytes = 0
const zSamples: number[] = []
let snapN = 0
const ticks = Math.round(minutes * 60 / STEP)
for (let i = 0; i < ticks && w.winner === null; i++) {
  const s = performance.now()
  w.tick(STEP)
  samples.push(performance.now() - s)
  if (i % 60 === 0) unitCounts.push(w.units.length)
  if (SNAP && i % 3 === 0) {
    const s2 = performance.now()
    const a = snapshotFor(w, 0, w.heroes[0].id, i, { sfx: [], ann: [], txt: [], vfx: [] })
    const str = JSON.stringify(a)
    snapSamples.push(performance.now() - s2)
    snapBytes += str.length
    // what permessage-deflate sends (an upper bound: ws also reuses the window across messages)
    const s3 = performance.now()
    snapZBytes += zlib.deflateRawSync(str, { level: 3 }).length
    zSamples.push(performance.now() - s3)
    snapN++
  }
}

const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}
const row = (name: string, a: number[]) =>
  `${name.padEnd(10)} mean ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3)}  p50 ${pct(a, 0.5).toFixed(3)}  p95 ${pct(a, 0.95).toFixed(3)}  p99 ${pct(a, 0.99).toFixed(3)}  max ${Math.max(...a).toFixed(2)} ms`

console.log(`World build: ${buildMs.toFixed(0)} ms`)
console.log(`Simulated ${(samples.length * STEP / 60).toFixed(1)} min (${samples.length} ticks), winner=${w.winner}`)
console.log(`units: min ${Math.min(...unitCounts)} avg ${(unitCounts.reduce((a, b) => a + b, 0) / unitCounts.length).toFixed(0)} max ${Math.max(...unitCounts)}`)
console.log(row('tick', samples))
// per-minute trend: does the tick cost grow as the match goes on?
const per = Math.round(60 / STEP)
const trend: string[] = []
for (let m = 0; m * per < samples.length; m += Math.max(1, Math.floor(minutes / 10))) {
  const sl = samples.slice(m * per, (m + 1) * per)
  trend.push(`${m}m:${(sl.reduce((a, b) => a + b, 0) / sl.length).toFixed(2)}`)
}
console.log('mean ms/tick by minute  ' + trend.join('  '))
const over = samples.filter((x) => x > 4).length
console.log(`ticks > 4 ms: ${over} (${((over / samples.length) * 100).toFixed(2)}%)   > 8 ms: ${samples.filter((x) => x > 8).length}   > 16.7 ms: ${samples.filter((x) => x > 16.7).length}`)
if (SNAP) {
  console.log(row('snapshot', snapSamples))
  console.log(`snapshot size avg ${(snapBytes / snapN / 1024).toFixed(1)} KiB x 20 Hz = ${((snapBytes / snapN / 1024) * 20).toFixed(0)} KiB/s per client`)
  console.log(`deflated  avg ${(snapZBytes / snapN / 1024).toFixed(1)} KiB x 20 Hz = ${((snapZBytes / snapN / 1024) * 20).toFixed(0)} KiB/s per client`)
  console.log(row('deflate', zSamples))
}
if (PHASES) {
  const total = samples.reduce((a, b) => a + b, 0)
  console.log('\nphase (inclusive; nested calls double count)')
  for (const [k, v] of Object.entries(phase).sort((a, b) => b[1].ms - a[1].ms))
    console.log(`${k.padEnd(18)} ${v.ms.toFixed(0).padStart(7)} ms  ${((v.ms / total) * 100).toFixed(1).padStart(5)}%  calls ${v.n}  avg ${((v.ms / v.n) * 1000).toFixed(2)} us`)
}
