import { Lane, LANES, PATHS, Pt, Team, TOWER_ARCS, dist } from './constants'
import type { Unit } from './entities'
import type { World } from './world'

export interface TeamOrder {
  kind: 'push' | 'defend' | 'gank' | 'rescue'
  x: number
  y: number
  targetId?: number
  towerId?: number
  phase?: 'rally' | 'go'
  until: number
}

interface Plan {
  kind: TeamOrder['kind']
  started: number
  until: number
  x: number
  y: number
  targetId?: number
  lane?: Lane
  towerId?: number
  phase?: 'rally' | 'go'
}

/** Rough combat value of a hero: health, level and damage output. */
const power = (h: Unit) => {
  const dps = h.st.dmg / Math.max(0.3, h.st.bat)
  return (0.3 + (0.7 * h.hp) / h.st.maxHp) * (50 + h.h!.level * 14 + dps * 0.9 + h.st.maxHp * 0.03)
}

/**
 * Team-level planner. It remembers where enemy heroes were last seen, picks an objective
 * (defend, rescue, gank, push) and hands individual orders to the bots, who follow them.
 */
export class TeamBrain {
  seen = new Map<number, { x: number; y: number; t: number }>()
  orders = new Map<number, TeamOrder>()
  plan: Plan | null = null
  focusId: number | null = null
  focusUntil = 0
  mia = 0
  lastPlanKind = ''

  constructor(public team: Team) {}

  orderFor(u: Unit): TeamOrder | null {
    return this.orders.get(u.id) ?? null
  }

  focus(w: World): Unit | null {
    if (this.focusId === null) return null
    const f = w.heroes.find((h) => h.id === this.focusId)
    return f && !f.dead ? f : null
  }

  /** Allied power vs enemy power around a hero (>1 means we are ahead). */
  ratio(w: World, u: Unit, r = 1300): number {
    let mine = 0
    let theirs = 0
    for (const h of w.heroes) {
      if (h.dead) continue
      if (h.team === this.team) {
        if (dist(h, u) <= r) mine += power(h)
      } else {
        const vis = w.isVisible(this.team, h)
        const s = this.seen.get(h.id)
        if (vis ? dist(h, u) <= r : s && w.time - s.t < 3 && dist(s, u) <= r + 200) theirs += power(h)
      }
    }
    return theirs <= 0 ? 99 : (mine + 40) / (theirs + 40)
  }

  private knownPos(e: Unit, now: number): Pt | null {
    const s = this.seen.get(e.id)
    return s && now - s.t < 10 ? { x: s.x, y: s.y } : null
  }

  update(w: World) {
    const T = this.team
    const now = w.time
    const mine = w.heroes.filter((h) => h.team === T && !h.dead)
    const bots = mine.filter((h) => !h.h!.isHuman)
    const foes = w.heroes.filter((h) => h.team !== T && !h.dead)
    for (const e of foes) if (w.isVisible(T, e)) this.seen.set(e.id, { x: e.x, y: e.y, t: now })
    const known = foes.filter((e) => this.knownPos(e, now))
    this.mia = foes.length - known.length

    // ---- focus fire: weakest visible enemy hero close to one of ours
    if (now >= this.focusUntil) {
      let best: Unit | null = null
      let bs = Infinity
      for (const e of foes) {
        if (!w.isVisible(T, e) || !mine.some((a) => dist(a, e) < 1500)) continue
        const s = e.hp / e.st.maxHp - power(e) / 4000
        if (s < bs) {
          bs = s
          best = e
        }
      }
      this.focusId = best ? best.id : null
      this.focusUntil = now + 2.5
    }

    // ---- keep or drop the current plan
    if (this.plan) {
      const p = this.plan
      let ok = now < p.until
      if (ok && p.kind === 'gank') {
        const t = w.heroes.find((h) => h.id === p.targetId)
        const pos = t && !t.dead ? this.knownPos(t, now) : null
        if (!pos) ok = false
        else {
          p.x = pos.x
          p.y = pos.y
        }
      }
      if ((p.kind === 'defend' || p.kind === 'rescue') && ok) {
        const near = known.filter((e) => dist(this.knownPos(e, now)!, p) < 1800)
        if (near.length === 0 && now - p.started > 4) ok = false
      }
      if (!ok) this.plan = null
    }
    if (!this.plan) this.plan = this.choose(w, mine, bots, known)
    this.assign(w, bots, mine)
  }

  /* --------------------------------------------------------------- choose */

  private choose(w: World, mine: Unit[], bots: Unit[], known: Unit[]): Plan | null {
    const T = this.team
    const now = w.time
    const kp = (e: Unit) => this.knownPos(e, now)!
    const powerNear = (p: Pt, r: number, side: 'ally' | 'foe') =>
      side === 'ally' ? mine.filter((a) => dist(a, p) < r).reduce((s, a) => s + power(a), 0) : known.filter((e) => dist(kp(e), p) < r).reduce((s, e) => s + power(e), 0)

    // 1) rescue a teammate who is losing a fight
    for (const a of mine) {
      if (a.hp < a.st.maxHp * 0.45 && now - a.lastDamagedByHero < 2.5) {
        const p = { x: a.x, y: a.y }
        if (known.some((e) => dist(kp(e), p) < 1400) && powerNear(p, 4500, 'ally') >= powerNear(p, 1600, 'foe') * 0.9) {
          return { kind: 'rescue', started: now, until: now + 9, x: p.x, y: p.y }
        }
      }
    }
    // 2) defend buildings under attack by heroes
    const dp = w.dangerPos[T]
    if (dp && now - w.dangerTimer[T] < 4) {
      const foesNear = known.filter((e) => dist(kp(e), dp) < 1800)
      if (foesNear.length && powerNear(dp, 5500, 'ally') >= powerNear(dp, 1800, 'foe') * 0.7) {
        return { kind: 'defend', started: now, until: now + 15, x: dp.x, y: dp.y }
      }
    }
    // 3) catch out an isolated enemy hero
    let bestGank: { e: Unit; score: number } | null = null
    for (const e of known) {
      if (!w.isVisible(T, e)) continue
      const alone = !known.some((o) => o !== e && dist(kp(o), kp(e)) < 1300)
      if (!alone) continue
      const tower = w.towers.find((t) => t.team !== T && !t.dead && dist(t, e) < t.st.range + 100)
      if (tower && e.hp > e.st.maxHp * 0.35) continue
      const helpers = bots.filter((b) => dist(b, e) < 3200 && b.hp > b.st.maxHp * 0.55)
      const need = e.hp < e.st.maxHp * 0.4 ? 1 : 2
      if (helpers.length < need) continue
      const score = helpers.length * 2 + (1 - e.hp / e.st.maxHp) * 3
      if (!bestGank || score > bestGank.score) bestGank = { e, score }
    }
    if (bestGank) return { kind: 'gank', started: now, until: now + 7, x: kp(bestGank.e).x, y: kp(bestGank.e).y, targetId: bestGank.e.id }
    // 4) group up and push a lane
    const ready = bots.filter((b) => b.hp > b.st.maxHp * 0.6)
    const foeAlive = w.heroes.filter((h) => h.team !== T && !h.dead).length
    if (now > 300 && ready.length >= 3 && mine.length >= foeAlive) {
      const plan = this.planPush(w)
      if (plan) return plan
    }
    return null
  }

  private planPush(w: World): Plan | null {
    const T = this.team
    const enemy = (1 - T) as Team
    let best: { lane: Lane; score: number; front: number } | null = null
    for (const lane of LANES) {
      const alive = w.towers.filter((t) => t.team === enemy && !t.dead && t.lane === lane)
      if (!alive.length && w.towers.every((t) => t.team !== enemy || t.dead || t.locked || t.lane === lane)) continue
      const path = PATHS[T][lane]
      let front = 0
      for (const c of w.units) if (c.kind === 'creep' && c.team === T && c.lane === lane && !c.dead) front = Math.max(front, path.project(c))
      const score = (3 - alive.length) * 1.2 + front / path.len * 2 + Math.random() * 0.4
      if (!best || score > best.score) best = { lane, score, front }
    }
    if (!best) return null
    const path = PATHS[T][best.lane]
    const arc = Math.max(900, Math.min(best.front, path.len * 0.62) - 450)
    const rally = path.at(arc)
    const tower = this.pushTower(w, best.lane)
    return { kind: 'push', started: w.time, until: w.time + 50, x: rally.x, y: rally.y, lane: best.lane, phase: 'rally', towerId: tower?.id }
  }

  private pushTower(w: World, lane: Lane | undefined): Unit | null {
    const enemy = (1 - this.team) as Team
    const open = w.towers.filter((t) => t.team === enemy && !t.dead && !t.locked)
    const inLane = open.filter((t) => t.lane === lane).sort((a, b) => a.tier - b.tier)
    if (inLane.length) return inLane[0]
    const any = open.sort((a, b) => a.tier - b.tier)
    if (any.length) return any[0]
    const anc = w.ancients.find((a) => a.team === enemy)
    return anc && !anc.locked ? anc : null
  }

  /* --------------------------------------------------------------- assign */

  private assign(w: World, bots: Unit[], mine: Unit[]) {
    const now = w.time
    this.orders.clear()
    const p = this.plan
    if (!p) return
    const give = (list: Unit[], o: Omit<TeamOrder, 'until'>) => {
      for (const b of list) this.orders.set(b.id, { ...o, until: now + 1.5 })
    }
    if (p.kind === 'defend' || p.kind === 'rescue') {
      give(
        bots.filter((b) => dist(b, p) < 5500 && b.hp > b.st.maxHp * 0.35),
        { kind: p.kind, x: p.x, y: p.y },
      )
    } else if (p.kind === 'gank') {
      const helpers = bots
        .filter((b) => b.hp > b.st.maxHp * 0.55 && dist(b, p) < 3400)
        .sort((a, b) => dist(a, p) - dist(b, p))
        .slice(0, 3)
      give(helpers, { kind: 'gank', x: p.x, y: p.y, targetId: p.targetId })
    } else if (p.kind === 'push') {
      const squad = bots.filter((b) => b.hp > b.st.maxHp * 0.5)
      if (squad.length < 2) {
        this.plan = null
        return
      }
      if (p.phase === 'rally') {
        const here = squad.filter((b) => dist(b, p) < 950).length
        if (here >= Math.min(3, squad.length) || now - p.started > 16) p.phase = 'go'
      }
      if (p.phase === 'go') {
        let tower = p.towerId ? (w.units.find((u) => u.id === p.towerId) ?? null) : null
        if (!tower || tower.dead || tower.locked) {
          tower = this.pushTower(w, p.lane)
          p.towerId = tower?.id
        }
        if (!tower) {
          this.plan = null
          return
        }
        give(squad, { kind: 'push', x: tower.x, y: tower.y, phase: 'go', towerId: tower.id })
      } else give(squad, { kind: 'push', x: p.x, y: p.y, phase: 'rally' })
    }
    void mine
  }
}
