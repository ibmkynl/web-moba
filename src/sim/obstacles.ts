/**
 * Static map obstacles shared by the simulation (collision + pathfinding) and the 3D terrain builder:
 * forest trees and big rocks. Generated deterministically so server and every client agree.
 */
import { BASE_POS, CAMPS, FOUNTAIN_POS, LANES, MAP, PATHS, PIT_R, POWER_RUNES, Path, Pt, RIVER_HALF, ROSHAN_PIT, T3_POS, T4_POS, TOWER_ARCS, TRAILS, WALLS, mirror } from './constants'

/** Deterministic seeded random generator (mulberry32). */
export function mulberry(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The river centre line (same curve the 2D minimap and the 3D water use). It starts in Roshan's pit, runs diagonally past
 * the mid lane and ends in a pool: the exact mirror of its start, so both teams get the same river.
 */
const RIVER_HALF_PTS: Pt[] = [
  ROSHAN_PIT,
  { x: 2900, y: 2750 },
  { x: 3250, y: 3150 },
  { x: 4050, y: 3950 },
]
const RIVER_CTRL: Pt[] = [...RIVER_HALF_PTS, ...[...RIVER_HALF_PTS].reverse().map(mirror)]
export const RIVER: Pt[] = catmull(RIVER_CTRL, 6)
export const RIVER_PATH = new Path(RIVER)
/** The river water ends in rounded pools: half width of the water at distance `s` along the river (tapers over the last 500). */
export const riverHalfAt = (s: number) => RIVER_HALF * (0.55 + 0.45 * Math.min(1, Math.min(s, RIVER_PATH.len - s) / 500))

/** Catmull-Rom spline through the points, `per` samples per span. */
function catmull(p: Pt[], per: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[Math.min(p.length - 1, i + 2)]
    for (let s = 0; s < per; s++) {
      const t = s / per
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) })
    }
  }
  out.push(p[p.length - 1])
  return out
}
export const LANE_PATHS = LANES.map((l) => PATHS[0][l])
const TRAIL_PATHS = TRAILS.map((t) => new Path(t))

/* distance helpers shared with the 3D terrain builder */
export const laneDist = (x: number, y: number) => {
  const p = { x, y }
  let d = Infinity
  for (const l of LANE_PATHS) d = Math.min(d, l.distTo(p))
  return d
}
export const riverDist = (x: number, y: number) => RIVER_PATH.distTo({ x, y })
export const baseDist = (x: number, y: number) => Math.min(Math.hypot(x - BASE_POS[0].x, y - BASE_POS[0].y), Math.hypot(x - BASE_POS[1].x, y - BASE_POS[1].y))
export const fountainDist = (x: number, y: number) => Math.min(Math.hypot(x - FOUNTAIN_POS[0].x, y - FOUNTAIN_POS[0].y), Math.hypot(x - FOUNTAIN_POS[1].x, y - FOUNTAIN_POS[1].y))
const nearTrail = (x: number, y: number, d: number) => TRAIL_PATHS.some((t) => t.distTo({ x, y }) < d)
/** Within `d` of a base cliff wall (the walls only exist in the two base corners). */
const nearWall = (x: number, y: number, d: number) => {
  for (const w of WALLS) {
    const dx = w.b.x - w.a.x
    const dy = w.b.y - w.a.y
    const l2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((x - w.a.x) * dx + (y - w.a.y) * dy) / l2))
    if (Math.hypot(x - (w.a.x + dx * t), y - (w.a.y + dy * t)) < d) return true
  }
  return false
}

/** Where a lane crosses the river (only the mid lane does; the side lanes stay on their own bank). Kept free of clutter. */
export const FORDS: Pt[] = LANE_PATHS.flatMap((path) => {
  let best = Infinity
  let bp = path.pts[0]
  for (let s = 0; s <= path.len; s += 20) {
    const p = path.at(s)
    const d = RIVER_PATH.distTo(p)
    if (d < best - 1) {
      best = d
      bp = p
    }
  }
  return best < RIVER_HALF ? [bp] : []
})

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** The mid lane runs through the lowground; the side lanes, jungles and bases are the highground. */
const midDist = (x: number, y: number) => LANE_PATHS[1].distTo({ x, y })
/**
 * Terrain height. Never above 0: the river bed and Roshan's pit sink, the mid lane is a shallow valley. Everything else
 * stays at 0 because effects are drawn at ground level and a raised base would bury them.
 */
export function heightAt(x: number, y: number): number {
  let h = 0
  h -= 34 * (1 - smooth(RIVER_HALF * 0.55, RIVER_HALF + 110, riverDist(x, y)))
  h -= 20 * (1 - smooth(230, 520, midDist(x, y)))
  h -= 45 * (1 - smooth(PIT_R * 0.8, PIT_R + 160, Math.hypot(x - ROSHAN_PIT.x, y - ROSHAN_PIT.y)))
  return Math.max(-70, h)
}
const POOL: Pt = mirror(ROSHAN_PIT)
/** Within `d` of Roshan's pit or the pool at the other end of the river. */
const nearRiverEnd = (x: number, y: number, d: number) => Math.hypot(x - ROSHAN_PIT.x, y - ROSHAN_PIT.y) < d || Math.hypot(x - POOL.x, y - POOL.y) < d
/** Every tower, ancient and fountain (both teams): nothing may be generated on or next to them. */
const STRUCTURES: Pt[] = (() => {
  const out: Pt[] = [...BASE_POS, ...FOUNTAIN_POS]
  for (const team of [0, 1] as const) {
    for (const lane of LANES) {
      for (let tier = 0; tier < 2; tier++) out.push(PATHS[team][lane].at(TOWER_ARCS[lane][tier]))
      out.push(team === 0 ? T3_POS[lane] : mirror(T3_POS[lane]))
    }
    for (const p of T4_POS) out.push(team === 0 ? p : mirror(p))
  }
  return out
})()
const nearStruct = (x: number, y: number, d: number) => STRUCTURES.some((c) => Math.hypot(c.x - x, c.y - y) < d)
const nearCamp = (x: number, y: number, d: number) => CAMPS.some((c) => Math.hypot(c.x - x, c.y - y) < d)
const nearFord = (x: number, y: number, d: number) => FORDS.some((c) => Math.hypot(c.x - x, c.y - y) < d)
const nearRune = (x: number, y: number, d: number) => POWER_RUNES.some((c) => Math.hypot(c.x - x, c.y - y) < d)

export interface TreeO {
  x: number
  y: number
  r: number
  tone: number
}
export interface RockO {
  x: number
  y: number
  w: number
  h: number
  tilt: number
}

function genTrees(): TreeO[] {
  const out: TreeO[] = []
  const r = mulberry(901)
  const ok = (x: number, y: number) =>
    x > 60 && y > 60 && x < MAP - 60 && y < MAP - 60 &&
    laneDist(x, y) > 410 && riverDist(x, y) > RIVER_HALF + 170 && !nearRiverEnd(x, y, PIT_R + 420) && baseDist(x, y) > 1350 && fountainDist(x, y) > 700 &&
    !nearCamp(x, y, 340) && !nearFord(x, y, 650) && !nearTrail(x, y, 150) && !nearWall(x, y, 260) && !nearRune(x, y, 260) && !nearStruct(x, y, 330)
  for (let g = 0; g < 40000 && out.length < 2000; g++) {
    const edge = r() < 0.3
    let x = r() * MAP
    let y = r() * MAP
    if (edge) {
      const e = 120 + r() * 360
      const side = Math.floor(r() * 4)
      if (side === 0) y = e
      else if (side === 1) x = MAP - e
      else if (side === 2) y = MAP - e
      else x = e
    }
    if (!ok(x, y)) continue
    out.push({ x, y, r: 38 + r() * 34, tone: r() })
  }
  return out
}

function genRocks(): RockO[] {
  const out: RockO[] = []
  const r = mulberry(2024)
  const add = (x: number, y: number, w: number, h: number, tilt = 0.25) => out.push({ x, y, w, h, tilt })
  const ok = (x: number, y: number, lane: number, base = 1250) =>
    x > 40 && y > 40 && x < MAP - 40 && y < MAP - 40 && laneDist(x, y) > lane && baseDist(x, y) > base && fountainDist(x, y) > 650 &&
    !nearFord(x, y, 650) && !nearWall(x, y, 240) && !nearTrail(x, y, 120) && !nearStruct(x, y, 460) && !nearRiverEnd(x, y, PIT_R + 300)

  // cliff ridges along both river banks
  for (let s = 0; s < RIVER_PATH.len; s += 140) {
    const p = RIVER_PATH.at(s)
    const a = RIVER_PATH.at(s - 12)
    const b = RIVER_PATH.at(s + 12)
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = -(b.y - a.y) / l
    const ny = (b.x - a.x) / l
    for (const sd of [-1, 1]) {
      if (r() < 0.2) continue
      const off = (440 + r() * 90) * sd
      const x = p.x + nx * off
      const y = p.y + ny * off
      if (!ok(x, y, 520)) continue
      const w = 90 + r() * 130
      add(x, y, w, w * (0.6 + r() * 0.9))
      if (r() < 0.6) add(x + nx * sd * 70, y + ny * sd * 70, w * 0.6, w * (0.5 + r() * 0.5))
    }
  }
  // Roshan's pit and the pool at the other end of the river: a ring of cliff rocks, open where the river comes in
  const ring = (c: Pt, rad: number, open: number) => {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      let d = Math.abs(a - open)
      d = Math.min(d, Math.PI * 2 - d)
      if (d < 0.62) continue
      const w = 110 + r() * 80
      add(c.x + Math.cos(a) * (rad + r() * 50), c.y + Math.sin(a) * (rad + r() * 50), w, w * (0.9 + r() * 0.8), 0.3)
    }
  }
  ring(ROSHAN_PIT, PIT_R + 120, Math.PI / 4)
  ring(POOL, RIVER_HALF + 150, (5 * Math.PI) / 4)
  // low rock walls lining the lanes (well outside the walkable corridor)
  for (const path of LANE_PATHS) {
    for (let s = 150; s < path.len - 150; s += 120) {
      const p = path.at(s)
      const a = path.at(s - 10)
      const b = path.at(s + 10)
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const nx = -(b.y - a.y) / l
      const ny = (b.x - a.x) / l
      for (const sd of [-1, 1]) {
        if (r() < 0.55) continue
        const off = (470 + r() * 70) * sd
        const x = p.x + nx * off
        const y = p.y + ny * off
        if (!ok(x, y, 430) || riverDist(x, y) < 650) continue
        const w = 45 + r() * 70
        add(x, y, w, w * (0.5 + r() * 0.7))
      }
    }
  }
  // boulders
  for (let g = 0, n = 0; g < 8000 && n < 380; g++) {
    const x = r() * MAP
    const y = r() * MAP
    if (!ok(x, y, 400) || riverDist(x, y) < 560 || nearCamp(x, y, 330)) continue
    const w = 40 + r() * 80
    add(x, y, w, w * (0.5 + r() * 0.8))
    n++
  }
  // a few rocks around each camp (with wide gaps so heroes can walk in)
  for (const c of CAMPS) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28 + 0.8 + r() * 0.4
      const w = 50 + r() * 40
      add(c.x + Math.cos(a) * (270 + r() * 40), c.y + Math.sin(a) * (270 + r() * 40), w, w * (0.7 + r() * 0.7))
    }
  }
  // cliff wall just inside the map border
  for (let side = 0; side < 4; side++) {
    for (let t = 0; t < MAP; t += 110) {
      const depth = 40 + r() * 330
      const tt = t + (r() - 0.5) * 80
      let x = tt
      let y = depth
      if (side === 1) { x = MAP - depth; y = tt }
      if (side === 2) { x = tt; y = MAP - depth }
      if (side === 3) { x = depth; y = tt }
      if (!ok(x, y, 430, 800)) continue
      const w = 90 + r() * 140
      add(x, y, w, w * (0.7 + r() * 1.1) * (side === 2 ? 0.45 : 1), 0.35)
    }
  }
  return out
}

export const TREES: TreeO[] = genTrees().sort((a, b) => a.y - b.y)
export const ROCKS: RockO[] = genRocks()

/* ------------------------------------------------------------ collision circles */

export interface Circle {
  x: number
  y: number
  r: number
}
/** Solid footprints: rocks block with most of their width, trees only with their trunk. */
const SOLIDS: Circle[] = [
  ...ROCKS.map((o) => ({ x: o.x, y: o.y, r: o.w * 0.78 })),
  ...TREES.map((t) => ({ x: t.x, y: t.y, r: t.r * 0.42 })),
]

const CELL = 200
const GW = Math.ceil(MAP / CELL)
const buckets: Circle[][] = Array.from({ length: GW * GW }, () => [])
for (const c of SOLIDS) {
  const x0 = Math.max(0, Math.floor((c.x - c.r) / CELL))
  const x1 = Math.min(GW - 1, Math.floor((c.x + c.r) / CELL))
  const y0 = Math.max(0, Math.floor((c.y - c.r) / CELL))
  const y1 = Math.min(GW - 1, Math.floor((c.y + c.r) / CELL))
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) buckets[gy * GW + gx].push(c)
}
/** Solids near a point (bucket lookup). */
export function solidsNear(x: number, y: number): Circle[] {
  const gx = Math.floor(x / CELL)
  const gy = Math.floor(y / CELL)
  if (gx < 0 || gy < 0 || gx >= GW || gy >= GW) return []
  return buckets[gy * GW + gx]
}

/** Pushes a body of radius `rad` out of trees and rocks, in place. */
export function pushOutOfSolids(p: Pt, rad: number) {
  for (const c of solidsNear(p.x, p.y)) {
    const dx = p.x - c.x
    const dy = p.y - c.y
    const min = c.r + rad
    const d2 = dx * dx + dy * dy
    if (d2 >= min * min) continue
    const d = Math.sqrt(d2) || 0.001
    const k = min / d
    p.x = c.x + (d2 < 0.0001 ? min : dx * k)
    p.y = c.y + (d2 < 0.0001 ? 0 : dy * k)
  }
}
export { mirror }
