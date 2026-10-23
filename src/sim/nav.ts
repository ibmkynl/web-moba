/** Grid pathfinding around walls, rocks and trees. Units steer along the returned waypoints. */
import { MAP, Pt, WALLS, WALL_R, GATES } from './constants'
import { Circle, solidsNear } from './obstacles'

const CELL = 70
const N = Math.ceil(MAP / CELL)
const CLEAR = 34 // body clearance baked into the grid
const blocked = new Uint8Array(N * N)

function wallNear(x: number, y: number, d: number) {
  if (!((x < 3400 && y > 6200) || (x > MAP - 3400 && y < 3400))) return false
  for (const w of WALLS) {
    const dx = w.b.x - w.a.x
    const dy = w.b.y - w.a.y
    const l2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((x - w.a.x) * dx + (y - w.a.y) * dy) / l2))
    if (Math.hypot(x - (w.a.x + dx * t), y - (w.a.y + dy * t)) < d) return true
  }
  return false
}
function solidAt(x: number, y: number, rad: number) {
  for (const c of solidsNear(x, y) as Circle[]) if ((c.x - x) ** 2 + (c.y - y) ** 2 < (c.r + rad) ** 2) return true
  return false
}
for (let gy = 0; gy < N; gy++) {
  for (let gx = 0; gx < N; gx++) {
    const x = gx * CELL + CELL / 2
    const y = gy * CELL + CELL / 2
    if (x < 40 || y < 40 || x > MAP - 40 || y > MAP - 40) blocked[gy * N + gx] = 1
    else if (wallNear(x, y, WALL_R + CLEAR) || solidAt(x, y, CLEAR)) blocked[gy * N + gx] = 1
  }
}
// gates must stay open whatever the clutter
for (const gs of GATES) for (const g of gs) {
  for (let ox = -260; ox <= 260; ox += CELL / 2) for (let oy = -260; oy <= 260; oy += CELL / 2) {
    const x = g.mid.x + ox
    const y = g.mid.y + oy
    const gx = Math.floor(x / CELL)
    const gy = Math.floor(y / CELL)
    if (gx >= 0 && gy >= 0 && gx < N && gy < N && !wallNear(x, y, WALL_R + CLEAR)) blocked[gy * N + gx] = 0
  }
}

const cellOf = (p: Pt) => ({ gx: Math.max(0, Math.min(N - 1, Math.floor(p.x / CELL))), gy: Math.max(0, Math.min(N - 1, Math.floor(p.y / CELL))) })
const isBlocked = (gx: number, gy: number) => gx < 0 || gy < 0 || gx >= N || gy >= N || blocked[gy * N + gx] === 1

/** True when the straight segment a-b crosses no blocked cell. */
function lineClear(a: Pt, b: Pt): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const steps = Math.ceil(len / (CELL * 0.45))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const gx = Math.floor((a.x + (b.x - a.x) * t) / CELL)
    const gy = Math.floor((a.y + (b.y - a.y) * t) / CELL)
    if (isBlocked(gx, gy)) return false
  }
  return true
}

/** Nearest open cell centre to a point (for goals that sit inside a rock or tree). */
function nearestOpen(p: Pt): Pt | null {
  const c = cellOf(p)
  if (!isBlocked(c.gx, c.gy)) return p
  for (let r = 1; r < 14; r++) {
    let best: Pt | null = null
    let bd = Infinity
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const gx = c.gx + dx
        const gy = c.gy + dy
        if (isBlocked(gx, gy)) continue
        const q = { x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 }
        const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
        if (d < bd) {
          bd = d
          best = q
        }
      }
    }
    if (best) return best
  }
  return null
}

/* A* scratch space, reused by every search: a stamp marks which entries belong to the current search */
const gScore = new Float32Array(N * N)
const came = new Int32Array(N * N)
const seen = new Uint32Array(N * N)
const shut = new Uint32Array(N * N)
let stamp = 0
/** binary min-heap of cell indices keyed by f */
const heapI = new Int32Array(N * N * 8) // each cell can be re-pushed when its score improves (at most once per neighbour)
const heapF = new Float32Array(N * N * 8)
let heapN = 0
function heapPush(i: number, f: number) {
  let k = heapN++
  while (k > 0) {
    const p = (k - 1) >> 1
    if (heapF[p] <= f) break
    heapI[k] = heapI[p]
    heapF[k] = heapF[p]
    k = p
  }
  heapI[k] = i
  heapF[k] = f
}
function heapPop(): number {
  const top = heapI[0]
  const li = heapI[--heapN]
  const lf = heapF[heapN]
  let k = 0
  for (;;) {
    let c = 2 * k + 1
    if (c >= heapN) break
    if (c + 1 < heapN && heapF[c + 1] < heapF[c]) c++
    if (heapF[c] >= lf) break
    heapI[k] = heapI[c]
    heapF[k] = heapF[c]
    k = c
  }
  heapI[k] = li
  heapF[k] = lf
  return top
}

/** A* over the grid; returns smoothed waypoints from a (exclusive) to b (inclusive), or null when unreachable. */
function findPath(a: Pt, b: Pt): Pt[] | null {
  const start = nearestOpen(a)
  const goal = nearestOpen(b)
  if (!start || !goal) return null
  const s = cellOf(start)
  const g = cellOf(goal)
  const si = s.gy * N + s.gx
  const gi = g.gy * N + g.gx
  stamp++
  heapN = 0
  gScore[si] = 0
  seen[si] = stamp
  came[si] = -1
  heapPush(si, 0)
  const hh = (i: number) => Math.hypot((i % N) - g.gx, Math.floor(i / N) - g.gy)
  let found = false
  let guard = 0
  while (heapN && guard++ < 20000) {
    const cur = heapPop()
    if (shut[cur] === stamp) continue
    shut[cur] = stamp
    if (cur === gi) {
      found = true
      break
    }
    const cx = cur % N
    const cy = Math.floor(cur / N)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = cx + dx
        const ny = cy + dy
        if (isBlocked(nx, ny)) continue
        // no corner cutting
        if (dx && dy && (isBlocked(cx + dx, cy) || isBlocked(cx, cy + dy))) continue
        const ni = ny * N + nx
        if (shut[ni] === stamp) continue
        const ng = gScore[cur] + (dx && dy ? 1.414 : 1)
        if (seen[ni] !== stamp || ng < gScore[ni]) {
          seen[ni] = stamp
          gScore[ni] = ng
          came[ni] = cur
          heapPush(ni, ng + hh(ni))
        }
      }
    }
  }
  if (!found) return null
  const cells: Pt[] = []
  for (let c = gi; c >= 0; c = came[c]) {
    cells.push({ x: (c % N) * CELL + CELL / 2, y: Math.floor(c / N) * CELL + CELL / 2 })
    if (c === si) break
  }
  cells.reverse()
  // string-pull: keep only the corners needed to stay in line of sight
  const out: Pt[] = []
  let anchor: Pt = a
  for (let i = 0; i < cells.length; i++) {
    const next = cells[i + 1]
    if (next && lineClear(anchor, next)) continue
    out.push(cells[i])
    anchor = cells[i]
  }
  if (out.length === 0 || Math.hypot(out[out.length - 1].x - b.x, out[out.length - 1].y - b.y) > 4) {
    if (!(goal.x !== b.x || goal.y !== b.y)) out.push(b)
    else if (lineClear(out[out.length - 1] || a, b)) out.push(b)
  }
  return out
}

interface NavCache {
  gx: number
  gy: number
  at: number
  path: Pt[]
  /** A* found no route: wait for the retry interval instead of searching again every tick */
  none: boolean
}
/** Last line-of-sight answer per unit, valid while both ends stay in the same grid cells. */
interface LosCache {
  a: number
  b: number
  clear: boolean
}

const cellKey = (p: Pt) => Math.floor(p.y / CELL) * N + Math.floor(p.x / CELL)

/**
 * Next waypoint on the way from a to b when something solid is in the way, or null when the straight line is clear.
 * `cache` (per unit) avoids re-running A* and the line-of-sight walk every tick.
 */
export function navWaypoint(a: Pt, b: Pt, cache?: { nav?: NavCache; los?: LosCache }, now = 0): Pt | null {
  const ak = cellKey(a)
  const bk = cellKey(b)
  let los = cache?.los
  if (!los || los.a !== ak || los.b !== bk) {
    los = { a: ak, b: bk, clear: lineClear(a, b) }
    if (cache) cache.los = los
  }
  if (los.clear) {
    if (cache) cache.nav = undefined
    return null
  }
  let nc = cache?.nav
  if (!nc || Math.hypot(nc.gx - b.x, nc.gy - b.y) > 60 || now - nc.at > 1.2 || (nc.path.length === 0 && !nc.none)) {
    const path = findPath(a, b)
    nc = { gx: b.x, gy: b.y, at: now, path: path || [], none: !path }
    if (cache) cache.nav = nc
  }
  while (nc.path.length && Math.hypot(nc.path[0].x - a.x, nc.path[0].y - a.y) < 50) nc.path.shift()
  if (!nc.path.length) return null
  return nc.path[0]
}

/** Full route for drawing (minimap): current position, waypoints, goal. */
export function routeFor(a: Pt, b: Pt): Pt[] {
  if (lineClear(a, b)) return [a, b]
  const p = findPath(a, b)
  return p ? [a, ...p] : [a, b]
}

/** Nearest walkable point to p (so a move order onto a rock or tree ends right next to it). */
export function freePoint(p: Pt): Pt {
  return nearestOpen(p) ?? p
}
