export const MAP = 9600
export type Team = 0 | 1
/** Jungle creeps belong to neither side. They are typed as a Team for convenience; test with isNeutral. */
export const NEUTRAL = 2 as number as Team
export const isNeutral = (team: number) => team === 2
export interface Pt {
  x: number
  y: number
}
export type Lane = 'top' | 'mid' | 'bot'
export const LANES: Lane[] = ['top', 'mid', 'bot']
/** The five lane slots of a team: two top, one mid, two bottom. */
export const LANE_SLOTS: Lane[] = ['top', 'top', 'mid', 'bot', 'bot']
export const LANE_NAME: Record<Lane, string> = { top: 'Top', mid: 'Mid', bot: 'Bottom' }
/** Fixed simulation step (s): the host, single player and the benchmark all tick at 60 Hz. */
export const STEP = 1 / 60
/** Fisher-Yates shuffle into a new array. */
export const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

export const TEAM_NAME = ['Radiant', 'Dire', 'Neutral']
export const TEAM_COLOR = ['#5fd35f', '#e0463a', '#d9a441']

/** Ancient positions. Radiant = bottom-left, Dire = top-right. */
export const BASE_POS: Pt[] = [
  { x: 1100, y: 8500 },
  { x: 8500, y: 1100 },
]
export const FOUNTAIN_POS: Pt[] = [
  { x: 450, y: 9150 },
  { x: 9150, y: 450 },
]

/** Lane polylines, from the Radiant ancient to the Dire ancient. */
const RAW: Record<Lane, Pt[]> = {
  top: [
    { x: 1100, y: 8500 },
    { x: 900, y: 6800 },
    { x: 900, y: 900 },
    { x: 6800, y: 900 },
    { x: 8500, y: 1100 },
  ],
  mid: [
    { x: 1100, y: 8500 },
    { x: 8500, y: 1100 },
  ],
  bot: [
    { x: 1100, y: 8500 },
    { x: 2800, y: 8700 },
    { x: 8700, y: 8700 },
    { x: 8700, y: 2800 },
    { x: 8500, y: 1100 },
  ],
}

export class Path {
  cum: number[] = [0]
  constructor(public pts: Pt[]) {
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
    }
  }
  get len() {
    return this.cum[this.cum.length - 1]
  }
  /** Point at arc length s from the start. */
  at(s: number): Pt {
    s = Math.max(0, Math.min(this.len, s))
    for (let i = 1; i < this.pts.length; i++) {
      if (s <= this.cum[i]) {
        const t = (s - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1)
        const a = this.pts[i - 1]
        const b = this.pts[i]
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      }
    }
    return this.pts[this.pts.length - 1]
  }
  /** Arc length of the closest point on the path to p. */
  project(p: Pt): number {
    let best = Infinity
    let bs = 0
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1]
      const b = this.pts[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const l2 = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
      const qx = a.x + dx * t
      const qy = a.y + dy * t
      const d = (p.x - qx) ** 2 + (p.y - qy) ** 2
      if (d < best) {
        best = d
        bs = this.cum[i - 1] + Math.sqrt(l2) * t
      }
    }
    return bs
  }
  /** Distance from p to the path. */
  distTo(p: Pt): number {
    let best = Infinity
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1]
      const b = this.pts[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const l2 = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
      const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
      if (d < best) best = d
    }
    return best
  }
}

/** PATHS[team][lane] runs from that team's ancient towards the enemy ancient. */
export const PATHS: Record<Team, Record<Lane, Path>> = {
  0: { top: new Path(RAW.top), mid: new Path(RAW.mid), bot: new Path(RAW.bot) },
  1: {
    top: new Path([...RAW.top].reverse()),
    mid: new Path([...RAW.mid].reverse()),
    bot: new Path([...RAW.bot].reverse()),
  },
}

/** Tower distance from own ancient along the lane, tiers 1..3. */
export const TOWER_ARCS: Record<Lane, number[]> = {
  top: [5400, 3800, 1700],
  mid: [4300, 3300, 2350],
  bot: [5400, 3800, 1700],
}
/** Tier 3 towers (Radiant coordinates; mirrored for Dire) stand just inside the base, beside each lane ramp. */
export const T3_POS: Record<Lane, Pt> = {
  top: { x: 1380, y: 6950 },
  mid: { x: 2150, y: 6950 },
  // same offset from the ramp as the top tower: 350 inside the cliff line, just beside the ramp edge (the old spot sat 54 from the cliff end)
  bot: { x: 2650, y: 8220 },
}
/** Tier 4 towers beside the ancient (Radiant coordinates; mirrored for Dire). */
export const T4_POS: Pt[] = [
  { x: 1550, y: 8150 },
  { x: 1150, y: 7850 },
]
export const mirror = (p: Pt): Pt => ({ x: MAP - p.x, y: MAP - p.y })

export const XP_TABLE = [
  0, 230, 600, 1080, 1660, 2260, 2980, 3730, 4620, 5550, 6520, 7530, 8580, 9805, 11055, 12330, 13630, 14955, 16455,
  18045, 19645, 21495, 23495, 25745, 28245,
]
export const MAX_LEVEL = 25

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Power rune spots in the river (one near each side lane). */
export const POWER_RUNES: Pt[] = [
  { x: 2802, y: 2958 },
  { x: 6717, y: 6723 },
]
/** Bounty rune spots in the jungles: two per side. */
export const BOUNTY_RUNES: Pt[] = [
  { x: 2500, y: 5800 },
  { x: 4200, y: 7600 },
  { x: MAP - 2500, y: MAP - 5800 },
  { x: MAP - 4200, y: MAP - 7600 },
]

/* ------------------------------------------------------------- base walls */
// Each base is a walled box (Radiant: bottom-left, Dire: top-right). The only ways in are the three lane gates,
// each guarded by a tier-3 tower just inside it.

const WALL_N = 3000 // base box size
const WALL_Y = MAP - WALL_N // Radiant box top edge

export interface Seg {
  a: Pt
  b: Pt
}
const seg = (ax: number, ay: number, bx: number, by: number): Seg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } })

// Cliff edges of the high-ground base. Every lane enters through a wide ramp (a gap in the cliff).
const RAMP_W = 420 // half width of a ramp
const RAD_WALLS: Seg[] = [
  // north edge: top ramp at x=900, mid ramp in the north-east corner
  seg(0, WALL_Y, 900 - RAMP_W, WALL_Y),
  seg(900 + RAMP_W, WALL_Y, WALL_N - 720, WALL_Y),
  // east edge: mid ramp in the corner, bot ramp at y=8700
  seg(WALL_N, WALL_Y + 720, WALL_N, 8700 - RAMP_W),
  seg(WALL_N, 8700 + RAMP_W, WALL_N, MAP),
]
export const WALLS: Seg[] = [...RAD_WALLS, ...RAD_WALLS.map((s) => ({ a: mirror(s.a), b: mirror(s.b) }))]
export const WALL_R = 46 // collision half thickness

export interface Gate {
  inside: Pt
  outside: Pt
  /** centre of the opening */
  mid: Pt
}
const RAD_GATES: Gate[] = [
  { inside: { x: 900, y: WALL_Y + 380 }, outside: { x: 900, y: WALL_Y - 380 }, mid: { x: 900, y: WALL_Y } },
  { inside: { x: WALL_N - 330, y: WALL_Y + 330 }, outside: { x: WALL_N + 330, y: WALL_Y - 330 }, mid: { x: WALL_N, y: WALL_Y } },
  { inside: { x: WALL_N - 380, y: 8700 }, outside: { x: WALL_N + 380, y: 8700 }, mid: { x: WALL_N, y: 8700 } },
]
export const GATES: Gate[][] = [RAD_GATES, RAD_GATES.map((g) => ({ inside: mirror(g.inside), outside: mirror(g.outside), mid: mirror(g.mid) }))]

function distPtSeg(px: number, py: number, s: Seg) {
  const dx = s.b.x - s.a.x
  const dy = s.b.y - s.a.y
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - s.a.x) * dx + (py - s.a.y) * dy) / l2))
  return { d: Math.hypot(px - (s.a.x + dx * t), py - (s.a.y + dy * t)), qx: s.a.x + dx * t, qy: s.a.y + dy * t }
}

/** Pushes a point out of the wall bodies (circle-vs-capsule), in place. */
export function pushOutOfWalls(p: Pt, extra = 0) {
  const r = WALL_R + extra
  // cheap reject: walls only live near the two base boxes
  const nearBox = (p.x < WALL_N + 200 && p.y > WALL_Y - 200) || (p.x > MAP - WALL_N - 200 && p.y < WALL_N + 200)
  if (!nearBox) return
  for (const s of WALLS) {
    const q = distPtSeg(p.x, p.y, s)
    if (q.d < r) {
      let nx = p.x - q.qx
      let ny = p.y - q.qy
      const l = Math.hypot(nx, ny)
      if (l < 0.001) {
        // exactly on the wall line: step out perpendicular
        nx = -(s.b.y - s.a.y)
        ny = s.b.x - s.a.x
      }
      const n = Math.hypot(nx, ny) || 1
      p.x = q.qx + (nx / n) * r
      p.y = q.qy + (ny / n) * r
    }
  }
}

/* ------------------------------------------------------------------ jungle */
// Camp spots on the Radiant half (mirrored for Dire). tier 0 small, 1 medium, 2 ancient.

export interface CampDef {
  x: number
  y: number
  tier: 0 | 1 | 2
}
const RAD_CAMPS: CampDef[] = [
  { x: 1900, y: 4000, tier: 0 },
  { x: 3200, y: 4300, tier: 1 },
  { x: 3000, y: 5000, tier: 1 },
  { x: 2000, y: 5300, tier: 2 },
  { x: 4400, y: 7000, tier: 1 },
  { x: 5200, y: 6300, tier: 1 },
  { x: 6700, y: 7800, tier: 2 },
  { x: 5700, y: 7700, tier: 0 },
]
export const CAMPS: CampDef[] = [...RAD_CAMPS, ...RAD_CAMPS.map((c) => ({ ...mirror(c), tier: c.tier }))]

/** Jungle trails (Radiant half, mirrored): cosmetic dirt paths linking camps to the lanes. */
const RAD_TRAILS: Pt[][] = [
  [
    { x: 900, y: 4300 },
    { x: 1900, y: 4000 },
    { x: 3200, y: 4300 },
    { x: 3600, y: 4850 },
    { x: 3300, y: 5400 },
    { x: 2700, y: 5800 },
    { x: 2000, y: 5300 },
    { x: 1000, y: 5500 },
  ],
  [
    { x: 4300, y: 8700 },
    { x: 4400, y: 7000 },
    { x: 5200, y: 6300 },
    { x: 6000, y: 6900 },
    { x: 6700, y: 7800 },
    { x: 5700, y: 7700 },
    { x: 5400, y: 8700 },
  ],
  [
    { x: 3300, y: 5400 },
    { x: 4000, y: 6000 },
    { x: 5200, y: 6300 },
  ],
]
export const TRAILS: Pt[][] = [...RAD_TRAILS, ...RAD_TRAILS.map((t) => t.map(mirror))]

/* ---------------------------------------------------------------- registries */

/** Merges id-keyed tables from several modules; a duplicate id throws instead of silently replacing an entry. */
export function mergeUnique<T>(label: string, ...tables: Record<string, T>[]): Record<string, T> {
  const out: Record<string, T> = {}
  for (const t of tables) {
    for (const k of Object.keys(t)) {
      if (k in out) throw new Error(`duplicate ${label} id: ${k}`)
      out[k] = t[k]
    }
  }
  return out
}
/** Indexes a list by id; a duplicate id throws. */
export const indexUnique = <T extends { id: string }>(label: string, list: T[]) => mergeUnique(label, ...list.map((x) => ({ [x.id]: x })))

/* ------------------------------------------------------------------ rules */
// Tunable gameplay numbers, kept together so balance passes do not touch the simulation code. Values marked "tune" are first
// guesses to be settled by playtesting; the rest follow the Dota 2 wiki.

export const RULES = {
  /** fraction of the gold a hero is holding that is lost on death */
  deathGoldLoss: 0.4,
  /** buyback cost = base + net worth / div; cooldown in seconds */
  buybackBase: 100,
  buybackDiv: 13,
  buybackCd: 480,
  /** Glyph of Fortification: building invulnerability (s), shared team cooldown (s), first use */
  glyphDur: 7,
  glyphCd: 300,
  glyphFirst: 180,
  /** backdoor protection: damage reduction, regen (HP/s), detection radius of towers and of the ancient, seconds it stays off after a lane creep leaves */
  backdoorReduce: 0.5,
  backdoorRegen: 180,
  backdoorRadius: 900,
  backdoorAncientRadius: 4000,
  backdoorLinger: 3,
  /** summons deal even less to a protected building */
  backdoorSummonReduce: 0.75,
  /** siege creep (tune): every Nth wave, damage multiplier against buildings and against everything else */
  siegeEvery: 10,
  siegeVsBuilding: 3,
  siegeVsUnit: 0.5,
  siegeMagicRes: 0.8,
  /** camp stacking: most packs a camp can hold (tune) and the area (by tier) that must be empty for a spawn */
  maxStacks: 4,
  campArea: [380, 440, 520] as number[],
  neutralReturnRegen: 0.25,
  /** Roshan (tune): respawn window (s), pit radius, Aegis lifetime on the ground and in the inventory (s) */
  roshMin: 480,
  roshMax: 660,
  roshGold: 250,
  aegisGround: 300,
  aegisLife: 300,
  aegisRevive: 5,
  aegisTeamOnly: 15,
}
