import type { AbilityDef, Buff } from '../sim/entities'
import { AbilityState, HeroState, Unit } from '../sim/entities'
import { HEROES, HERO_BY_ID } from '../sim/heroes'
import { ITEM_BY_ID } from '../sim/items'
import { World } from '../sim/world'

/* ------------------------------------------------------------------ registry */

const ABILITY_BY_ID: Record<string, AbilityDef> = {}
for (const h of HEROES) for (const a of h.abilities) ABILITY_BY_ID[a.id] = a

/* ------------------------------------------------------------------ types */

export interface AbSnap {
  i: string
  lv: number
  cd: number
  ch: number
  ca: number
  tg: number
  ex?: number
}
export interface HeroSnap {
  tp?: number
  tc?: number
  d: string
  lv: number
  xp: number
  pt: number
  g: number
  it: ({ i: string; c: number; cd: number } | null)[]
  ab: AbSnap[]
  sl: AbSnap | null
  k: number
  de: number
  as: number
  lh: number
  dn: number
  rs: number
  pl: number
  ln: string
  sk: number
  ea: number
  hd: number
  td: number
  pn: string
}
export interface UnitSnap {
  id: number
  tm: number
  k: string
  sb: string
  nm: string
  r: number
  /** hidden stub: only roster info (enemy hero not currently visible) */
  hid?: 1
  x?: number
  y?: number
  f?: number
  vx?: number
  vy?: number
  hp?: number
  mp?: number
  dead?: number
  dAt?: number
  lk?: number
  hit?: number
  tr?: number
  ln?: string | null
  st?: Record<string, number>
  b?: any[]
  aw?: { t: number; s: number; e: number } | null
  cs?: { a: string; t: number; s: number; e: number; x: number; y: number } | null
  chn?: { a: string; t: number; u: number } | null
  ex?: Record<string, any>
  h?: HeroSnap
}
export interface ProjSnap {
  id: number
  k: string
  ow: number
  tg?: number
  at?: number
  x: number
  y: number
  ang?: number
  draw?: string
  style?: string
  color?: string
  size?: number
  ph?: string
  tr?: number
  rad?: number
}
export interface Snapshot {
  t: number
  seq: number
  me: number // hero unit id of the receiving player
  units: UnitSnap[]
  projs: ProjSnap[]
  zones: any[]
  runes: any[]
  wards: any[]
  kills: [number, number]
  feed: any[]
  winner: number | null
  nextPower: number
  queue: { h: number; d: string }[][]
  ev: {
    sfx: [string, number, number, number, string][]
    ann: [string, string, number | undefined, boolean][]
    txt: [number, number, string, string, number][]
    vfx: any[]
  }
}

const EX_KEYS = ['owner', 'liftStart', 'liftEnd', 'delivering', 'color', 'mega', 'noAuto', 'ping', 'tpUntil']
const NON_HERO_ST = ['maxHp', 'armor', 'dmg', 'ms', 'range', 'bat', 'ap', 'projSpeed']

/* ------------------------------------------------------------- serialization */

function buffSnap(b: Buff) {
  const o: any = {}
  for (const k of Object.keys(b)) {
    const v = (b as any)[k]
    if (k === 'src') continue
    if (k === 'taunt') o.taunt = true
    else if (k === 'dot') o.dot = { dps: v.dps, type: v.type }
    else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') o[k] = v
  }
  return o
}

const abSnap = (a: AbilityState): AbSnap => ({ i: a.def.id, lv: a.level, cd: +a.cdUntil.toFixed(2), ch: a.charges, ca: +a.chargeAt.toFixed(2), tg: a.toggled ? 1 : 0, ex: a.expires || undefined })

export function unitSnap(u: Unit): UnitSnap {
  const s: UnitSnap = {
    id: u.id, tm: u.team, k: u.kind, sb: u.sub, nm: u.name, r: u.radius,
    x: +u.x.toFixed(1), y: +u.y.toFixed(1), f: +u.facing.toFixed(2), vx: Math.round(u.vx), vy: Math.round(u.vy),
    hp: Math.round(u.hp), mp: Math.round(u.mana), dead: u.dead ? 1 : 0, dAt: +u.deadAt.toFixed(2), lk: u.locked ? 1 : 0,
    hit: +u.hitAt.toFixed(2), tr: u.tier, ln: u.lane,
  }
  if (u.kind === 'hero') {
    const st: Record<string, number> = {}
    for (const k of Object.keys(u.st)) st[k] = +(u.st as any)[k].toFixed(3)
    s.st = st
  } else {
    const st: Record<string, number> = {}
    for (const k of NON_HERO_ST) st[k] = +(u.st as any)[k].toFixed(2)
    s.st = st
  }
  if (u.buffs.length) s.b = u.buffs.map(buffSnap)
  if (u.attackWind) s.aw = { t: u.attackWind.target.id, s: +u.attackWind.start.toFixed(2), e: +u.attackWind.end.toFixed(2) }
  if (u.casting) s.cs = { a: u.casting.st.def.id, t: u.casting.target?.id ?? 0, s: +u.casting.start.toFixed(2), e: +u.casting.end.toFixed(2), x: Math.round(u.casting.x), y: Math.round(u.casting.y) }
  if (u.channel) s.chn = { a: u.channel.st.def.id, t: u.channel.target?.id ?? 0, u: +u.channel.until.toFixed(2) }
  const ex: Record<string, any> = {}
  for (const k of EX_KEYS) if (u.extra[k] !== undefined && typeof u.extra[k] !== 'object') ex[k] = u.extra[k]
  if (u.extra.tk) ex.tk = { end: u.extra.tk.end, sx: u.extra.tk.start.x, sy: u.extra.tk.start.y }
  if (Object.keys(ex).length) s.ex = ex
  if (u.h) {
    const h = u.h
    s.h = {
      d: h.def.id, lv: h.level, xp: Math.round(h.xp), pt: h.points, g: Math.round(h.gold),
      it: h.items.map((i) => (i ? { i: i.def.id, c: i.charges, cd: +i.cdUntil.toFixed(2) } : null)),
      ab: h.abilities.map(abSnap), sl: h.stolen ? abSnap(h.stolen) : null,
      k: h.kills, de: h.deaths, as: h.assists, lh: h.lh, dn: h.dn, rs: +h.respawnAt.toFixed(2), pl: h.isPlayer ? 1 : 0, ln: h.lane, sk: h.streak, ea: Math.round(h.earned), hd: Math.round(h.heroDmg), td: Math.round(h.towerDmg), pn: h.pname, tp: h.tpScrolls, tc: +h.tpCd.toFixed(2),
    }
  }
  return s
}

/** Roster-only stub for an enemy hero that the receiving team cannot currently see. */
function stubSnap(u: Unit): UnitSnap {
  const full = unitSnap(u)
  return { id: full.id, tm: full.tm, k: full.k, sb: full.sb, nm: full.nm, r: full.r, hid: 1, dead: full.dead, h: full.h, st: { maxHp: u.st.maxHp } as any, hp: full.hp, ex: full.ex }
}

export function snapshotFor(w: World, team: 0 | 1, meId: number, seq: number, ev: Snapshot['ev']): Snapshot {
  const vis = w.vis[team]
  const units: UnitSnap[] = []
  for (const u of w.units) {
    if (u.dead && u.kind === 'creep' && w.time - u.deadAt > 1) continue
    if (u.kind === 'hero') {
      units.push(u.team === team || vis.has(u.id) ? unitSnap(u) : stubSnap(u))
    } else if (u.isBuilding || vis.has(u.id) || u.team === team) units.push(unitSnap(u))
  }
  const projs: ProjSnap[] = []
  for (const p of w.projs) {
    const own = p.owner.team === team
    if (!own && !vis.has(p.owner.id) && !(p.target && vis.has(p.target.id))) {
      // enemy projectile far from our vision: skip unless it is near one of our units
      let near = false
      for (const u of w.units) if (u.team === team && !u.dead && Math.hypot(u.x - p.x, u.y - p.y) < 1700) { near = true; break }
      if (!near) continue
    }
    projs.push({
      id: p.id!, k: p.kind, ow: p.owner.id, tg: p.target?.id, at: p.attached?.id, x: Math.round(p.x), y: Math.round(p.y), ang: p.angle !== undefined ? +p.angle.toFixed(3) : undefined,
      draw: p.draw, style: p.style, color: p.color, size: p.size, ph: p.phase, tr: Math.round(p.traveled), rad: p.radius,
    })
  }
  const courier = w.courierFor(w.heroes.find((h) => h.id === meId) as Unit)
  return {
    t: +w.time.toFixed(3), seq, me: meId, units, projs,
    zones: w.zones.map((z) => ({ x: z.x, y: z.y, r: z.r, team: z.team, start: z.start, end: z.end, color: z.color, kind: z.kind, reveal: z.reveal ? 1 : 0, oid: z.owner.id })),
    runes: w.runes.map((r) => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, at: r.at })),
    wards: w.wards.filter((d) => d.team === team).map((d) => ({ id: d.id, x: d.x, y: d.y, team: d.team, expires: d.expires })),
    kills: [w.kills[0], w.kills[1]], feed: w.feed.slice(-8), winner: w.winner, nextPower: w.nextPowerRune,
    queue: [(courier?.extra.queue || []).map((e: any) => ({ h: e.heroId, d: e.def.id })), (courier?.extra.carry || []).map((e: any) => ({ h: e.heroId, d: e.def.id }))],
    ev,
  }
}

/* -------------------------------------------------------------------- replica */

interface Interp {
  fx: number
  fy: number
  tx: number
  ty: number
  at: number
}

export class Replica {
  world: World
  meId = 0
  seq = 0
  private interp = new Map<number, Interp>()
  private recvAt = 0
  private interval = 50
  private lastRecv = 0
  private snapT = 0
  private nextPowerFrom = 0

  constructor() {
    this.world = new World({ playerHero: 'pudge', playerLane: 'mid' }, true)
  }

  private makeUnit(s: UnitSnap): Unit {
    const u = new Unit(s.tm as 0 | 1, s.k as any, s.sb, s.nm, s.r, { maxHp: 1, dmg: 0, armor: 0, ms: 0, range: 0, bat: 1, ap: 0, projSpeed: 0, hpRegen: 0 })
    u.id = s.id
    const w = this.world
    w.units.push(u)
    if (s.k === 'hero') w.heroes.push(u)
    else if (s.k === 'tower') w.towers.push(u)
    else if (s.k === 'ancient') w.ancients.push(u)
    else if (s.k === 'courier') w.courier.push(u)
    return u
  }

  private abState(a: AbSnap, into?: AbilityState): AbilityState | null {
    const def = ABILITY_BY_ID[a.i]
    if (!def) return null
    const st = into && into.def.id === a.i ? into : new AbilityState(def, a.lv)
    st.level = a.lv
    st.cdUntil = a.cd
    st.charges = a.ch
    st.chargeAt = a.ca
    st.toggled = !!a.tg
    st.expires = a.ex || 0
    return st
  }

  apply(snap: Snapshot, now: number) {
    const w = this.world
    this.meId = snap.me
    this.interval = Math.max(20, Math.min(120, now - this.lastRecv || 50))
    this.lastRecv = now
    this.recvAt = now
    this.snapT = snap.t
    w.time = snap.t
    w.kills = [snap.kills[0], snap.kills[1]]
    w.feed = snap.feed
    w.winner = snap.winner as any
    w.nextPowerRune = snap.nextPower

    const byId = new Map<number, Unit>()
    for (const u of w.units) byId.set(u.id, u)
    const seen = new Set<number>()
    const visIds = new Set<number>()
    for (const s of snap.units) {
      seen.add(s.id)
      let u = byId.get(s.id)
      if (!u) {
        u = this.makeUnit(s)
        byId.set(s.id, u)
      }
      if (s.hid) {
        // hidden enemy hero: roster info only
        u.extra.stub = true
        u.dead = !!s.dead
        u.hp = s.hp ?? 0
        u.st.maxHp = s.st?.maxHp ?? 1
        this.applyHero(u, s)
        continue
      }
      u.extra.stub = false
      visIds.add(u.id)
      // interpolation target
      const prev = this.interp.get(u.id)
      const jump = prev && Math.hypot(u.x - s.x!, u.y - s.y!) > 450
      if (!prev || jump) {
        u.x = s.x!
        u.y = s.y!
        this.interp.set(u.id, { fx: s.x!, fy: s.y!, tx: s.x!, ty: s.y!, at: now })
      } else {
        this.interp.set(u.id, { fx: u.x, fy: u.y, tx: s.x!, ty: s.y!, at: now })
      }
      u.facing = s.f!
      u.vx = s.vx!
      u.vy = s.vy!
      u.hp = s.hp!
      u.mana = s.mp!
      u.dead = !!s.dead
      u.deadAt = s.dAt!
      u.locked = !!s.lk
      u.hitAt = s.hit!
      u.tier = s.tr!
      u.lane = (s.ln as any) ?? null
      if (s.st) for (const k of Object.keys(s.st)) (u.st as any)[k] = s.st[k]
      u.buffs = (s.b || []) as any
      for (const b of u.buffs as any[]) if (b.taunt === true) b.taunt = u
      u.extra = { ...u.extra, ...(s.ex || {}), stub: false }
      if (!s.ex?.tk) delete u.extra.tk
      else u.extra.tk = { end: s.ex.tk.end, start: { x: s.ex.tk.sx, y: s.ex.tk.sy } }
      if (u.kind === 'hero') this.applyHero(u, s)
      u.attackWind = null
      u.casting = null
      u.channel = null
    }
    // second pass: references to other units
    for (const s of snap.units) {
      if (s.hid) continue
      const u = byId.get(s.id)!
      if (s.aw) {
        const t = byId.get(s.aw.t)
        if (t) u.attackWind = { target: t, start: s.aw.s, end: s.aw.e }
      }
      if (s.cs && u.h) {
        const st = this.findAbility(u, s.cs.a)
        if (st) u.casting = { st, target: byId.get(s.cs.t), x: s.cs.x, y: s.cs.y, start: s.cs.s, end: s.cs.e }
      }
      if (s.chn && u.h) {
        const st = this.findAbility(u, s.chn.a)
        if (st) u.channel = { st, until: s.chn.u, tick: () => {}, end: () => {}, target: byId.get(s.chn.t) }
      }
    }
    // remove units that are no longer sent
    if (w.units.some((u) => !seen.has(u.id))) {
      const dead = w.units.filter((u) => !seen.has(u.id))
      for (const u of dead) this.interp.delete(u.id)
      w.units = w.units.filter((u) => seen.has(u.id))
      w.heroes = w.heroes.filter((u) => seen.has(u.id))
      w.towers = w.towers.filter((u) => seen.has(u.id))
      w.ancients = w.ancients.filter((u) => seen.has(u.id))
    }
    const me = byId.get(snap.me)
    if (me) w.player = me
    // visibility for the receiving team
    const team = me ? me.team : 0
    w.vis[team as 0 | 1] = visIds
    w.vis[(1 - team) as 0 | 1] = new Set()

    // projectiles (rebuilt each snapshot; ids keep renderer meshes alive)
    const oldP = new Map<number, any>()
    for (const p of w.projs) oldP.set(p.id!, p)
    w.projs = []
    for (const s of snap.projs) {
      const owner = byId.get(s.ow)
      if (!owner) continue
      let p = oldP.get(s.id)
      if (!p) p = { kind: s.k, id: s.id, dead: false, speed: 0, traveled: 0, owner }
      p.owner = owner
      p.target = s.tg ? byId.get(s.tg) : undefined
      p.attached = s.at ? byId.get(s.at) ?? null : null
      p.x = s.x
      p.y = s.y
      p.angle = s.ang
      p.draw = s.draw
      p.style = s.style
      p.color = s.color
      p.size = s.size
      p.phase = s.ph
      p.traveled = s.tr
      p.radius = s.rad
      w.projs.push(p)
    }
    w.zones = snap.zones.map((z) => ({ ...z, owner: byId.get(z.oid) as Unit, reveal: !!z.reveal }))
    w.runes = snap.runes
    w.wards = snap.wards
    const meU = w.heroes.find((h) => h.id === snap.me)
    const cq = meU ? w.courierFor(meU) : undefined
    if (cq) {
      cq.extra.queue = (snap.queue[0] || []).map((e) => ({ heroId: e.h, def: ITEM_BY_ID[e.d] }))
      cq.extra.carry = (snap.queue[1] || []).map((e) => ({ heroId: e.h, def: ITEM_BY_ID[e.d] }))
    }

    // one-shot events
    for (const e of snap.ev.sfx) w.onEvent?.(e[0], e[1], e[2], e[3] === team, e[4])
    for (const a of snap.ev.ann) w.onAnnounce?.(a[0], a[1], a[2], a[3])
    for (const t of snap.ev.txt) w.text(t[0], t[1], t[2], t[3], t[4])
    for (const v of snap.ev.vfx) {
      const o: any = { ...v }
      for (const k of ['unit', 'unit2']) if (o[k] && typeof o[k] === 'object' && o[k].__u) o[k] = byId.get(o[k].__u) || undefined
      w.vfxQ.push(o)
    }
    if (w.vfxQ.length > 200) w.vfxQ.splice(0, w.vfxQ.length - 200)
    // team-wide gold/xp popups etc come through txt events
    void this.nextPowerFrom
  }

  private findAbility(u: Unit, id: string): AbilityState | null {
    const h = u.h!
    return h.abilities.find((a) => a.def.id === id) || (h.stolen && h.stolen.def.id === id ? h.stolen : null)
  }

  private applyHero(u: Unit, s: UnitSnap) {
    const hs = s.h!
    if (!u.h) {
      const def = HERO_BY_ID[hs.d]
      u.h = new HeroState(def, hs.ln as any)
    }
    const h = u.h
    h.level = hs.lv
    h.xp = hs.xp
    h.points = hs.pt
    h.gold = hs.g
    h.kills = hs.k
    h.deaths = hs.de
    h.assists = hs.as
    h.lh = hs.lh
    h.dn = hs.dn
    h.respawnAt = hs.rs
    h.isPlayer = !!hs.pl
    h.lane = hs.ln as any
    h.streak = hs.sk
    h.pname = hs.pn
    h.tpScrolls = hs.tp ?? 0
    h.tpCd = hs.tc ?? 0
    h.earned = hs.ea
    h.heroDmg = hs.hd
    h.towerDmg = hs.td
    if (s.ex) u.extra.ping = s.ex.ping
    h.items = hs.it.map((i) => (i ? { def: ITEM_BY_ID[i.i], charges: i.c, cdUntil: i.cd } : null))
    h.abilities.forEach((a, idx) => {
      const as = hs.ab[idx]
      if (as) this.abState(as, a)
    })
    h.stolen = hs.sl ? this.abState(hs.sl, h.stolen ?? undefined) : null
  }

  /** Per-frame: smooth positions between snapshots and advance the clock. */
  update(now: number) {
    const w = this.world
    const k = (t: number) => Math.max(0, Math.min(1, (now - t) / this.interval))
    for (const u of w.units) {
      const it = this.interp.get(u.id)
      if (!it) continue
      const a = k(it.at)
      u.x = it.fx + (it.tx - it.fx) * a
      u.y = it.fy + (it.ty - it.fy) * a
    }
    w.time = this.snapT + Math.min(0.12, (now - this.recvAt) / 1000)
  }
}
