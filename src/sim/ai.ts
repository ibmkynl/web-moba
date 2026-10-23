import { Lane, LANES, PATHS, Pt, TOWER_ARCS, dist } from './constants'
import type { Unit } from './entities'
import { MAP } from './constants'
import type { World } from './world'
import { ITEM_BY_ID } from './items'

export function aiThink(w: World, u: Unit) {
  switch (u.kind) {
    case 'creep':
      return (u.team as number) === 2 ? neutralAI(w, u) : creepAI(w, u)
    case 'summon':
      return summonAI(w, u)
    case 'tower':
      return towerAI(w, u)
    case 'hero':
      if (u.h!.isHuman) {
        u.nextThink = w.time + 1
        return
      }
      return botAI(w, u)
    default:
      u.nextThink = w.time + 1
  }
}

/* ---------------------------------------------------------------- creeps */

function sameMove(u: Unit, p: Pt) {
  return u.order.t === 'move' && Math.hypot(u.order.x - p.x, u.order.y - p.y) < 8
}

/** Jungle monsters: guard their camp, gang up on intruders and give up when dragged too far. They never regain health. */
function neutralAI(w: World, u: Unit) {
  u.nextThink = w.time + 0.2
  if (u.forced || u.isStunned()) return
  const home: Pt = u.extra.home
  const camp = u.extra.camp
  if (u.extra.returning) {
    u.aiTarget = null
    if (dist(u, home) < 60) {
      u.extra.returning = false
      u.extra.provoked = null
    } else {
      if (!sameMove(u, home)) u.order = { t: 'move', x: home.x, y: home.y }
      return
    }
  }
  let t = u.aiTarget
  const pv: Unit | undefined = u.extra.provoked
  if (pv && (pv.dead || dist(pv, home) > 1300)) u.extra.provoked = undefined
  if (t && (t.dead || !w.canAttackTarget(u, t) || dist(t, home) > 1300)) t = null
  if (!t) {
    const prov: Unit | undefined = u.extra.provoked
    if (prov && !prov.dead && w.canAttackTarget(u, prov)) t = prov
  }
  if (!t) {
    let bd = 520
    for (const e of w.units) {
      if (e.dead || (e.team as number) === 2 || e.isBuilding || e.kind === 'courier' || e.kind === 'creep') continue
      if (e.isInvulnerable() || e.isInvisible(w.time)) continue
      const d = dist(u, e)
      if (d < bd) {
        bd = d
        t = e
      }
    }
  }
  // the whole camp joins in
  if (!t && camp) for (const m of camp.members as Unit[]) if (!m.dead && m !== u && m.aiTarget && !m.aiTarget.dead && dist(m.aiTarget, home) < 1100) t = m.aiTarget
  if (t && dist(u, home) > 950) t = null
  if (!t && dist(u, home) > 150) {
    u.aiTarget = null
    u.extra.returning = true
    if (u.extra.returning) u.order = { t: 'move', x: home.x, y: home.y }
    return
  }
  u.aiTarget = t
  if (t) w.orderAttack(u, t)
}

function creepAI(w: World, u: Unit) {
  u.nextThink = w.time + 0.2
  if (u.forced || u.isStunned()) return
  const path = PATHS[u.team][u.lane!]
  const reach = u.st.range

  // how far a creep is willing to follow its target before giving up
  const leash = (e: Unit) => (e.isBuilding ? reach + 120 : e.kind === 'hero' ? reach + 300 : reach + 420)
  const score = (e: Unit) => dist(u, e) - e.radius + (e.isBuilding ? 220 : 0)

  // 1. keep the current target only while it is still valid and within the leash
  let t = u.aiTarget
  if (t && (t.dead || !w.canAttackTarget(u, t) || dist(u, t) - t.radius > leash(t))) t = null

  // 2. look for the closest enemy; switch to it if it is clearly closer than what we are chasing
  let best: Unit | null = null
  let bs = Infinity
  for (const e of w.units) {
    if (e.dead || e.team === u.team || e.kind === 'fountain' || (e.team as number) === 2) continue
    if (e.isInvulnerable() || !w.isVisible(u.team, e)) continue
    const d = dist(u, e) - e.radius
    if (d > (e.isBuilding ? 330 : 520)) continue
    const sc = score(e)
    if (sc < bs) {
      bs = sc
      best = e
    }
  }
  if (best && best !== t && (!t || bs + 90 < score(t))) t = best

  // 3. never wander far from the lane: give up the chase and walk back
  const offLane = path.distTo(u)
  if (t && !t.isBuilding && offLane > 700) t = null

  u.aiTarget = t
  if (t) {
    w.orderAttack(u, t)
    return
  }

  // 4. no target: rejoin the lane just ahead of where we are and carry on towards the enemy base
  const arc = path.project(u)
  let idx = 1
  while (idx < path.pts.length - 1 && path.cum[idx] <= arc + 30) idx++
  u.pathIdx = Math.max(u.pathIdx, idx)
  if (u.pathIdx > idx + 1) u.pathIdx = idx
  let dest = path.pts[Math.min(u.pathIdx, path.pts.length - 1)]
  if (offLane > 180) dest = path.at(Math.min(path.len, arc + 260))
  else if (dist(u, dest) < 160 && u.pathIdx < path.pts.length - 1) {
    u.pathIdx++
    dest = path.pts[Math.min(u.pathIdx, path.pts.length - 1)]
  }
  if (!sameMove(u, dest)) u.order = { t: 'move', x: dest.x, y: dest.y }
}

function summonAI(w: World, u: Unit) {
  u.nextThink = w.time + 0.25
  if (u.st.range <= 0) return
  let t = u.aiTarget
  if (t && (t.dead || !w.canAttackTarget(u, t) || dist(u, t) - t.radius > u.st.range + 20)) t = null
  if (!t) {
    let bd = Infinity
    for (const e of w.units) {
      if (e.dead || e.team === u.team || e.isBuilding || e.isInvulnerable() || !w.isVisible(u.team, e)) continue
      const d = dist(u, e) - e.radius
      if (d <= u.st.range && d < bd) {
        bd = d
        t = e
      }
    }
  }
  u.aiTarget = t
  if (t) w.orderAttack(u, t)
}

/* ---------------------------------------------------------------- towers */

function towerAI(w: World, u: Unit) {
  u.nextThink = w.time + 0.15
  const range = u.st.range
  let t = u.aiTarget
  if (t && (t.dead || !w.canAttackTarget(u, t) || dist(u, t) - t.radius > range + 20)) t = null
  // retarget to aggressors
  let aggressor: Unit | null = null
  for (const [id, tm] of w.heroAggro) {
    if (w.time - tm > 2.5) continue
    const h = w.heroes.find((x) => x.id === id)
    if (h && !h.dead && h.team !== u.team && dist(h, u) - h.radius <= range && w.canAttackTarget(u, h)) {
      // did it hit an ally hero near us?
      if (w.heroes.some((a) => a.team === u.team && !a.dead && dist(a, u) <= range + 300 && w.time - a.lastDamagedByHero < 2.5)) aggressor = h
    }
  }
  if (aggressor) t = aggressor
  if (!t) {
    let bc: Unit | null = null
    let bcd = Infinity
    let bh: Unit | null = null
    let bhd = Infinity
    for (const e of w.units) {
      if (e.dead || e.team === u.team || e.isBuilding) continue
      if (e.isInvulnerable() || !w.isVisible(u.team, e)) continue
      const d = dist(u, e) - e.radius
      if (d > range) continue
      if (e.kind === 'hero') {
        if (d < bhd) {
          bhd = d
          bh = e
        }
      } else if (d < bcd) {
        bcd = d
        bc = e
      }
    }
    t = bc || bh
  }
  u.aiTarget = t
  if (t) w.orderAttack(u, t)
}

/* ------------------------------------------------------------------ bots */

interface Brain {
  lane: Lane
  state: 'lane' | 'retreat'
  stateUntil: number
  buyIdx: number
  lastShop: number
  lastSalve: number
  retreatPos?: Pt | null
  ward?: { x: number; y: number; until: number } | null
  nextWard?: number
}

function allyCreepsNear(w: World, team: number, p: Pt, r: number) {
  let n = 0
  for (const c of w.units) if (c.kind === 'creep' && c.team === team && !c.dead && dist(c, p) <= r) n++
  return n
}

function enemyTowerThreat(w: World, u: Unit, p: Pt): Unit | null {
  for (const t of w.towers) {
    if (t.team !== u.team && !t.dead && dist(t, p) <= t.st.range + 90) return t
  }
  return null
}

function laneStandPos(w: World, u: Unit, lane: Lane): Pt {
  const path = PATHS[u.team][lane]
  let front = -1
  for (const c of w.units) {
    if (c.kind === 'creep' && c.team === u.team && c.lane === lane && !c.dead) front = Math.max(front, path.project(c))
  }
  if (front < 0) {
    // no creeps: wait just behind our foremost standing tower
    const own = w.towers.filter((t) => t.team === u.team && !t.dead && t.lane === lane)
    let arc = 600
    for (const t of own) arc = Math.max(arc, TOWER_ARCS[lane][t.tier] - 120)
    return path.at(arc)
  }
  const back = u.isRanged ? 260 : 140
  let arc = front - back
  // enemy heroes are missing from the map and nobody is with me: hang back near the tower
  const lonely = !w.heroes.some((a) => a !== u && a.team === u.team && !a.dead && dist(a, u) < 1300)
  if (lonely && w.team[u.team].mia >= 2) arc -= 450
  // never stand inside enemy tower range without creep cover
  let p = path.at(arc)
  for (let i = 0; i < 12; i++) {
    const th = enemyTowerThreat(w, u, p)
    if (!th || allyCreepsNear(w, u.team, th, th.st.range) >= 2) break
    arc -= 150
    p = path.at(arc)
  }
  return p
}

function bestPushLane(w: World, team: number): Lane {
  let best: Lane = 'mid'
  let bs = -1
  for (const lane of LANES) {
    const enemyAlive = w.towers.filter((t) => t.team !== team && !t.dead && t.lane === lane).length
    const score = (3 - enemyAlive) * 10 + Math.random() * 3
    if (score > bs) {
      bs = score
      best = lane
    }
  }
  return best
}

const WARD_SPOTS: Pt[] = [
  { x: 4800, y: 4800 }, { x: 2800, y: 5200 }, { x: 5800, y: 7000 }, { x: 2400, y: 2400 }, { x: 7200, y: 7200 }, { x: 4000, y: 3600 }, { x: 3600, y: 6400 },
]

function botShop(w: World, u: Unit, b: Brain) {
  const h = u.h!
  if (w.time - b.lastShop < 2) return
  b.lastShop = w.time
  const list = h.def.buy
  let guard = 3
  while (guard-- > 0 && b.buyIdx < list.length) {
    const id = list[b.buyIdx]
    const err = w.buyItem(u, id)
    if (err === 'Not enough gold') break
    b.buyIdx++
  }
  // after the starting build: keep spending on late-game items (same shop, same prices as the player)
  if (b.buyIdx >= list.length) lateShopping(w, u, b)
  // keep a couple of teleport scrolls in the stash
  if (h.tpScrolls < 2 && h.gold > 800 && w.time > 120) w.buyItem(u, 'tp')
  // supports keep the team's vision up
  const supp = h.def.id === 'rubick' || h.def.id === 'mirana'
  const wardsOut = w.wards.filter((x) => x.team === u.team).length
  const hasWard = h.items.some((i) => i && i.def.id === 'ward') || w.pendingFor(u).some((d) => d.id === 'ward')
  if (supp && !hasWard && wardsOut < 4 && w.time > 45 && h.gold >= 150) w.buyItem(u, 'ward')
  // keep a few consumables
  const salve = h.items.some((i) => i && i.def.id === 'salve') || w.pendingFor(u).some((d) => d.id === 'salve')
  if (!salve && h.gold > 400) w.buyItem(u, 'salve')
}

const LATE_BUILD: Record<string, string[]> = {
  str: ['bkb', 'heart', 'cuirass', 'shiva', 'skadi'],
  agi: ['bkb', 'butterfly', 'cuirass', 'skadi', 'refresher'],
  int: ['scepter', 'bkb', 'shiva', 'refresher', 'force'],
  all: ['bkb', 'scepter', 'shiva', 'skadi'],
}

function lateShopping(w: World, u: Unit, b: Brain) {
  const h = u.h!
  const bb = b as any
  const near = w.nearShop(u)
  // trade the starter boots for the fastest ones once rich
  const boots = h.items.findIndex((i) => i && i.def.id === 'boots')
  if (near && boots >= 0 && h.gold >= 2700) {
    w.sellItem(u, boots)
    w.buyItem(u, 'travel')
    return
  }
  const late = LATE_BUILD[h.def.attr] || LATE_BUILD.str
  bb.lateIdx ??= 0
  while (bb.lateIdx < late.length) {
    const id = late[bb.lateIdx]
    if (h.items.some((i) => i && i.def.id === id)) {
      bb.lateIdx++
      continue
    }
    const def = ITEM_BY_ID[id]
    // cheap items the bot is willing to trade in (half their price comes back)
    const sellable = h.items
      .map((it, i) => ({ it, i }))
      .filter((x) => x.it && !['boots', 'travel', 'phase', 'treads', 'ward'].includes(x.it.def.id) && x.it.def.cost < 1300 && !x.it.def.active?.startsWith('tp'))
      .sort((p, q) => p.it!.def.cost - q.it!.def.cost)
    const full = h.items.every(Boolean) || w.pendingFor(u).length >= h.items.filter((i) => !i).length
    let refund = 0
    const toSell: number[] = []
    if (h.gold < def.cost || full) {
      for (const x of sellable) {
        if (h.gold + refund >= def.cost && (toSell.length > 0 || !full)) break
        toSell.push(x.i)
        refund += Math.floor(x.it!.def.cost * 0.5) * Math.max(1, x.it!.charges)
      }
      if (h.gold + refund < def.cost || (full && toSell.length === 0)) {
        // not affordable even after selling: keep saving (or head home to trade items in when nearly there)
        return
      }
      if (!near) {
        // go home for a shopping trip when the trade works out and nobody is around
        if (w.time > (bb.nextTrip ?? 0) && b.state === 'lane' && w.enemyHeroesNear(u, 1500).length === 0 && u.hp > u.st.maxHp * 0.5) {
          bb.nextTrip = w.time + 120
          b.state = 'retreat'
          b.stateUntil = w.time + 25
          b.retreatPos = null
          bb.shopTrip = true
        }
        return
      }
      for (const i of toSell) w.sellItem(u, i)
    }
    if (!w.buyItem(u, id)) bb.lateIdx++
    return
  }
}

/** Friendly tower or ancient closest to a point (teleport destination). */
function tpPointNear(w: World, team: number, x: number, y: number): Unit | null {
  let best: Unit | null = null
  let bd = Infinity
  for (const o of w.units) {
    if (o.dead || o.team !== team || (o.kind !== 'tower' && o.kind !== 'ancient')) continue
    const d = dist(o, { x, y })
    if (d < bd) {
      bd = d
      best = o
    }
  }
  return best
}

/** Bots teleport like the player: home to heal, back out to the front, or to defend a threatened tower. */
function botTeleport(w: World, u: Unit, b: Brain, ord: { kind: string; x: number; y: number } | null, hpPct: number, enemies: Unit[], home: Pt) {
  const h = u.h!
  if (h.tpScrolls <= 0 || w.time < h.tpCd || u.channel || u.casting || u.forced || u.isStunned()) return
  const atFountain = dist(u, home) < 950
  let to: Unit | null = null
  if (b.state === 'retreat' && !atFountain && dist(u, home) > 2800 && hpPct < 0.45) {
    // far from home and hurt: teleport back to the ancient
    to = w.units.find((o) => o.kind === 'ancient' && o.team === u.team) || null
  } else if (ord && ord.kind === 'defend' && dist(u, ord) > 3200 && hpPct > 0.5 && enemies.length === 0) {
    to = tpPointNear(w, u.team, ord.x, ord.y)
  } else if (atFountain && b.state === 'lane' && hpPct > 0.9) {
    // healed and shopped: jump to the most advanced tower of the bot's lane
    const path = PATHS[u.team][b.lane]
    let bestArc = -1
    for (const t of w.towers) {
      if (t.dead || t.team !== u.team || t.lane !== b.lane) continue
      const arc = path.project(t)
      if (arc > bestArc) {
        bestArc = arc
        to = t
      }
    }
  }
  if (to && dist(u, to) > 2500) w.useTeleport(u, to.x, to.y)
}

/** Active items in a fight: Blink, Black King Bar, Shiva's, Phase Boots, Force Staff, Refresher. */
function useCombatItems(w: World, u: Unit, enemies: Unit[], hpPct: number, retreating: boolean, home: Pt) {
  if (u.casting || u.channel || u.forced || u.isStunned()) return
  const h = u.h!
  const slot = (id: string) => h.items.findIndex((i) => i && i.def.id === id && w.time >= i.cdUntil)
  const near = (r: number) => enemies.filter((e) => dist(e, u) <= r)
  let i: number
  if ((i = slot('bkb')) >= 0 && !u.hasBuff('bkb') && u.mana >= 50 && ((near(900).length >= 2 && hpPct < 0.8) || (near(700).length >= 1 && hpPct < 0.45) || u.buffs.some((x) => x.stun))) w.useItem(u, i)
  if ((i = slot('shiva')) >= 0 && u.mana >= 75 && near(800).length >= 1 && (near(800).length >= 2 || hpPct < 0.7)) w.useItem(u, i)
  if ((i = slot('phase')) >= 0 && !u.hasBuff('phase') && (retreating || near(1100).length >= 1)) w.useItem(u, i)
  if ((i = slot('force')) >= 0 && u.mana >= 150 && retreating && hpPct < 0.4 && near(900).length >= 1) {
    u.facing = Math.atan2(home.y - u.y, home.x - u.x)
    w.useItem(u, i)
  }
  if ((i = slot('refresher')) >= 0 && u.mana >= 350 && near(900).length >= 1) {
    const ult = h.abilities[3]
    const ready = h.abilities.filter((a) => a.level > 0).every((a) => w.time >= a.cdUntil)
    if (ult && ult.level > 0 && !ready && w.time < ult.cdUntil - 8) w.useItem(u, i)
  }
  if ((i = slot('blink')) >= 0) {
    if (retreating && hpPct < 0.45 && near(900).length >= 1) {
      const a = Math.atan2(home.y - u.y, home.x - u.x)
      w.useItem(u, i, u.x + Math.cos(a) * 1200, u.y + Math.sin(a) * 1200)
    } else if (!retreating && hpPct > 0.5) {
      // close the gap on a hero we are about to fight
      const t = enemies.filter((e) => dist(e, u) > 650 && dist(e, u) < 1500).sort((a, b) => dist(a, u) - dist(b, u))[0]
      if (t && w.enemyHeroesNear(u, 900).length <= 1) {
        const d = dist(t, u) - 250
        const a = Math.atan2(t.y - u.y, t.x - u.x)
        w.useItem(u, i, u.x + Math.cos(a) * Math.min(1200, d), u.y + Math.sin(a) * Math.min(1200, d))
      }
    }
  }
}

function useConsumables(w: World, u: Unit, b: Brain, safe: boolean) {
  if (!safe) return
  const h = u.h!
  const hp = u.hp / u.st.maxHp
  h.items.forEach((it, i) => {
    if (!it) return
    if (it.def.active === 'salve' && hp < 0.6 && !u.hasBuff('salve')) w.useItem(u, i)
    if (it.def.active === 'clarity' && u.st.maxMana > 0 && u.mana / u.st.maxMana < 0.35 && !u.hasBuff('clarity')) w.useItem(u, i)
  })
}

function botAbilities(w: World, u: Unit): boolean {
  if (u.casting || u.channel || u.forced || u.isStunned()) return false
  for (const a of w.allAbilities(u)) {
    const d = a.def
    if (!d.ai || a.level <= 0) continue
    if (d.behavior === 'toggle') {
      d.ai(w, u, a, a.level)
      continue
    }
    if (!w.abilityReady(u, a)) continue
    if (u.mana < (d.mana[a.level - 1] || 0)) continue
    if (d.ai(w, u, a, a.level)) return true
  }
  return false
}

function botAI(w: World, u: Unit) {
  const h = u.h!
  const b: Brain = (h.brain ||= {
    lane: h.lane, state: 'lane', stateUntil: 0, buyIdx: 0, lastShop: -10, lastSalve: 0,
  } as Brain)
  u.extra.noAuto = true
  u.nextThink = w.time + 0.17 + Math.random() * 0.06
  if (u.forced || u.isStunned() || u.casting || u.channel) return

  const home = w.homePos(u.team)
  const atFountain = dist(u, home) < 950
  botShop(w, u, b)

  // Rubick: choose a landing spot for Telekinesis
  if (u.extra.tk && u.extra.tkAiLand) {
    w.tkLand(u, u.extra.tkAiLand.x, u.extra.tkAiLand.y)
    u.extra.tkAiLand = null
  }

  const st = u.st
  const hpPct = u.hp / st.maxHp
  const enemies = w.enemyHeroesNear(u, 1400)
  const allies = w.heroes.filter((a) => a !== u && a.team === u.team && !a.dead && dist(a, u) < 1400)
  const myPower = (1 + allies.length) * 1.0
  const theirPower = enemies.length * 1.0

  const tb = w.team[u.team]
  const ratio = tb.ratio(w, u)
  const ord = tb.orderFor(u)

  botTeleport(w, u, b, ord, hpPct, enemies, home)
  if (u.channel) return

  // ---- retreat
  if (b.state === 'retreat') {
    if (b.retreatPos) {
      // tactical pull-back to a tower, then rejoin the lane
      if (w.time > b.stateUntil || dist(u, b.retreatPos) < 250 || (ratio > 1.3 && hpPct > 0.6)) {
        b.state = 'lane'
        b.retreatPos = null
      } else {
        botAbilities(w, u)
        w.orderMove(u, b.retreatPos.x, b.retreatPos.y)
        return
      }
    } else if ((b as any).shopTrip && !atFountain && w.time < b.stateUntil) {
      // shopping trip: walk home, spend the gold, then go back out
      w.orderMove(u, home.x, home.y)
      return
    } else if ((b as any).shopTrip && atFountain && w.time < ((b as any).leaveAt ??= w.time + 7)) {
      // at the shop: stay a few seconds so every purchase goes through
      return
    } else if ((hpPct > 0.88 && (atFountain || w.time > b.stateUntil)) || hpPct > 0.95) {
      b.state = 'lane'
      ;(b as any).shopTrip = false
      ;(b as any).leaveAt = undefined
    }
    else {
      botAbilities(w, u)
      useConsumables(w, u, b, enemies.length === 0)
      useCombatItems(w, u, enemies, hpPct, true, home)
      if (!atFountain || hpPct < 0.88) w.orderMove(u, home.x, home.y)
      return
    }
  }
  const lowEnough = hpPct < 0.35 || (hpPct < 0.5 && enemies.length > 0) || (hpPct < 0.65 && ratio < 0.8)
  if (lowEnough && !atFountain) {
    b.state = 'retreat'
    b.stateUntil = w.time + 10
    botAbilities(w, u)
    useCombatItems(w, u, enemies, hpPct, true, home)
    w.orderMove(u, home.x, home.y)
    return
  }
  useConsumables(w, u, b, enemies.length === 0)
  if (enemies.length) useCombatItems(w, u, enemies, hpPct, false, home)

  // ---- late game: group up and push the weakest lane
  if (w.time > 1000 && h.level >= 11 && Math.random() < 0.01) b.lane = bestPushLane(w, u.team)

  // ---- outnumbered: pull back to the nearest tower instead of feeding
  const reach = st.range + (u.isRanged ? 260 : 380)
  const foes = enemies.filter((e) => dist(e, u) - e.radius <= reach + 150)
  if (foes.length && ratio < 0.65 && hpPct < 0.95 && !atFountain && !(ord && ord.kind === 'defend')) {
    let safe: Pt = home
    let sd = Infinity
    for (const t of w.towers) {
      if (t.team !== u.team || t.dead) continue
      const d = dist(t, u)
      if (d < sd) {
        sd = d
        safe = { x: t.x + (home.x - t.x) * 0.12, y: t.y + (home.y - t.y) * 0.12 }
      }
    }
    b.state = 'retreat'
    b.stateUntil = w.time + 7
    b.retreatPos = safe
    botAbilities(w, u)
    w.orderMove(u, safe.x, safe.y)
    return
  }

  // ---- fight enemy heroes (together, focusing the same target)
  if (foes.length) {
    const aggressive = ord && (ord.kind === 'gank' || ord.kind === 'defend' || ord.kind === 'rescue')
    const fav = ratio >= (aggressive ? 0.85 : 1.15) || foes.some((f) => f.hp < f.st.maxHp * 0.3 && hpPct > 0.5)
    const tower = enemyTowerThreat(w, u, foes[0])
    const dive = tower && allyCreepsNear(w, u.team, tower, tower.st.range) < 2 && ratio < 2 && !foes.some((f) => f.hp < f.st.maxHp * 0.2)
    if (fav && hpPct > 0.45 && !dive) {
      if (botAbilities(w, u)) return
      const f = tb.focus(w)
      const target = (f && foes.includes(f) ? f : null) || foes.sort((a, b2) => a.hp / a.st.maxHp - b2.hp / b2.st.maxHp)[0]
      w.orderAttack(u, target)
      return
    }
  }

  if (botAbilities(w, u)) return

  // ---- follow the team plan (gank / push / defend / rescue)
  if (ord && hpPct > 0.4) {
    if (ord.kind === 'gank') {
      const tgt = w.heroes.find((x) => x.id === ord.targetId)
      if (tgt && !tgt.dead && w.canHit(u, tgt)) w.orderAttack(u, tgt)
      else w.orderAMove(u, ord.x, ord.y)
      return
    }
    if (ord.kind === 'push') {
      if (ord.phase === 'rally') {
        if (dist(u, ord) > 250) w.orderMove(u, ord.x, ord.y)
        else if (u.order.t !== 'idle') u.order = { t: 'idle' }
        return
      }
      const tower = w.units.find((x) => x.id === ord.towerId)
      if (tower && !tower.dead && !tower.locked) {
        if (dist(tower, u) - tower.radius <= st.range + 30) w.orderAttack(u, tower)
        else w.orderAMove(u, tower.x, tower.y)
        return
      }
    } else {
      if (dist(u, ord) > 450) w.orderAMove(u, ord.x, ord.y)
      return
    }
  }

  // ---- grab a nearby rune (only if I'm the closest ally to it)
  if (hpPct > 0.5 && enemies.length === 0 && w.runes.length) {
    let pick: { x: number; y: number } | null = null
    let pd = Infinity
    for (const r of w.runes) {
      const d = dist(u, r)
      const lim = r.kind === 'bounty' ? 2700 : 3800
      if (d > lim || d >= pd) continue
      if (w.heroes.some((a) => a !== u && a.team === u.team && !a.dead && dist(a, r) < d - 100)) continue
      pd = d
      pick = r
    }
    if (pick) {
      if (!(u.order.t === 'move' && Math.hypot(u.order.x - pick.x, u.order.y - pick.y) < 40)) w.orderMove(u, pick.x, pick.y)
      return
    }
  }

  // ---- place a ward at an uncovered spot
  const wardSlot = h.items.findIndex((i) => i && i.def.active === 'ward')
  if (b.ward && (w.time > b.ward.until || wardSlot < 0)) b.ward = null
  if (b.ward) {
    if (enemies.length === 0 && hpPct > 0.5) {
      if (u.order.t !== 'ward') w.orderWard(u, wardSlot, b.ward.x, b.ward.y)
      return
    }
    b.ward = null
  } else if (wardSlot >= 0 && enemies.length === 0 && hpPct > 0.6 && w.time > (b.nextWard || 0)) {
    let best: Pt | null = null
    let bd = 4200
    for (const sp0 of WARD_SPOTS) {
      const sp = u.team === 0 ? sp0 : { x: MAP - sp0.x, y: MAP - sp0.y }
      if (w.wards.some((x) => x.team === u.team && dist(x, sp) < 900)) continue
      const d = dist(u, sp)
      if (d < bd) {
        bd = d
        best = sp
      }
    }
    b.nextWard = w.time + 20
    if (best) {
      b.ward = { x: best.x, y: best.y, until: w.time + 25 }
      w.orderWard(u, wardSlot, best.x, best.y)
      return
    }
  }

  // ---- last hit / deny / harass
  const dmg = st.dmg * (1 - w.armorReduction(0))
  const rng = st.range + 100
  let lastHit: Unit | null = null
  let deny: Unit | null = null
  let lhHp = Infinity
  for (const c of w.units) {
    if (c.dead || c.kind !== 'creep') continue
    const d = dist(c, u) - c.radius
    if (d > rng + (u.isRanged ? 0 : 60)) continue
    if (c.team !== u.team) {
      if (!w.canAttackTarget(u, c)) continue
      const eff = dmg * (1 - w.armorReduction(c.st.armor))
      if (c.hp <= eff * 1.25 && c.hp < lhHp) {
        lhHp = c.hp
        lastHit = c
      }
    } else if (c.hp < c.st.maxHp * 0.5) {
      const eff = dmg * (1 - w.armorReduction(c.st.armor))
      if (c.hp <= eff * 1.1) deny = c
    }
  }
  if (lastHit) {
    w.orderAttack(u, lastHit)
    return
  }
  if (deny && Math.random() < 0.6) {
    w.orderAttack(u, deny)
    return
  }

  // ---- harass an enemy hero when safe
  if (foes.length && theirPower < myPower && hpPct > 0.7) {
    const tgt = foes[0]
    if (!enemyTowerThreat(w, u, tgt)) {
      w.orderAttack(u, tgt)
      return
    }
  }

  // ---- push towers when creeps are tanking
  for (const t of w.towers) {
    if (t.team === u.team || t.dead || t.locked) continue
    if (dist(t, u) > 1300) continue
    if (allyCreepsNear(w, u.team, t, t.st.range + 100) >= 2 && enemies.length <= allies.length) {
      w.orderAttack(u, t)
      return
    }
  }
  const anc = w.ancients.find((a) => a.team !== u.team)!
  if (!anc.locked && dist(anc, u) < 1500 && allyCreepsNear(w, u.team, anc, 700) >= 1) {
    w.orderAttack(u, anc)
    return
  }

  // ---- lane cleared: siege the next unlocked building (base towers, then the Ancient)
  const laneTowersLeft = w.towers.some((t) => t.team !== u.team && !t.dead && t.lane === b.lane)
  const outerLeft = w.towers.some((t) => t.team !== u.team && !t.dead && t.tier < 3)
  const myAlive = w.heroes.filter((h) => h.team === u.team && !h.dead).length
  const theirAlive = w.heroes.filter((h) => h.team !== u.team && !h.dead).length
  const groupPush = w.time > 1080 && myAlive >= 3 && myAlive >= theirAlive
  const allIn = (!outerLeft || groupPush) && hpPct > 0.55
  if (allIn || (!laneTowersLeft && hpPct > 0.6 && enemies.length <= allies.length)) {
    let tgt: Unit | null = null
    let td = Infinity
    for (const t of w.towers) {
      if (t.team === u.team || t.dead || t.locked) continue
      const d = dist(t, u)
      if (d < td) {
        td = d
        tgt = t
      }
    }
    if (!tgt && !anc.locked) tgt = anc
    if (tgt) {
      if (dist(tgt, u) - tgt.radius <= st.range + 30) w.orderAttack(u, tgt)
      else w.orderAMove(u, tgt.x, tgt.y)
      return
    }
  }

  // ---- position in lane
  const pos = laneStandPos(w, u, b.lane)
  if (dist(u, pos) > 70) {
    if (!(u.order.t === 'move' && Math.hypot(u.order.x - pos.x, u.order.y - pos.y) < 60)) w.orderMove(u, pos.x, pos.y)
  } else if (u.order.t !== 'idle') {
    u.order = { t: 'idle' }
  }
}
