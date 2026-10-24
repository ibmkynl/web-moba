import type { AbilityDef, HeroDef, Unit } from './entities'
import { L, ang, same, heroesNear, predict } from './abkit'
import { dist } from './constants'

/**
 * Weaver (AGI). Numbers follow the Dota 2 wiki where the engine can express them. Simplified: Swarm beetles cannot be
 * attacked off their host, so they last 9s instead of 16s.
 */

const lowest = (us: Unit[]) => us.slice().sort((a, b) => a.hp - b.hp)[0]

/* ------------------------------------------------------------------ WEAVER */

const SWARM_RANGE = 3000
const SWARM_DUR = 9
const swarmDmg = (l: number) => L([18, 20, 22, 24], l)
const swarmRate = (l: number) => L([1.25, 1.1, 0.95, 0.8], l)

interface Beetle {
  target: Unit
  until: number
  next: number
  bites: number
}

const THE_SWARM: AbilityDef = {
  id: 'weaver_the_swarm', name: 'The Swarm', glyph: '⁘', color: '#8ad0a0',
  behavior: 'point', range: same(4, 1100), castPoint: 0.3, cd: [44, 36, 28, 20], mana: same(4, 110), maxLevel: 4, noMove: true,
  aim: { line: { len: SWARM_RANGE, width: 300, color: '#8ad0a0' } },
  desc: 'Weaver releases a swarm of 12 beetles that fly forward and latch onto every enemy unit they meet. Each beetle bites its host repeatedly, dealing damage and stripping armor with every bite, and gives vision of it.',
  info: (l) => [`Bite damage: ${swarmDmg(l)}`, `Bite interval: ${swarmRate(l)}s`, 'Armor per bite: -1', `Duration: ${SWARM_DUR}s`, 'Beetles: 12, travel 3000, width 300'],
  cast(w, c, l, t, st) {
    const a = t.x === c.x && t.y === c.y ? c.facing : ang(c, t)
    c.facing = a
    const beetles: Beetle[] = (st.extra.beetles ||= [])
    let left = 12
    w.vfx('weaver_swarm_launch', { x: c.x, y: c.y, angle: a, range: SWARM_RANGE })
    w.spawnLinear({
      owner: c, x: c.x, y: c.y, angle: a, speed: 750, range: SWARM_RANGE, radius: 150, style: 'swarm', color: '#8ad0a0',
      filter: (u: Unit) => left > 0 && u.team !== c.team && !u.isBuilding && !u.isInvulnerable() && !beetles.some((b) => b.target === u && w.time < b.until),
      onHit: (u: Unit) => {
        left--
        beetles.push({ target: u, until: w.time + SWARM_DUR, next: w.time + 0.2, bites: 0 })
        w.vfx('weaver_beetle', { x: u.x, y: u.y, unit: u, dur: SWARM_DUR })
        return false
      },
    })
  },
  tick(w, c, l, _dt, st) {
    const beetles = st.extra.beetles as Beetle[] | undefined
    if (!beetles?.length) return
    for (const b of beetles) {
      const u = b.target
      if (u.dead || w.time >= b.until) {
        b.until = 0
        continue
      }
      w.grantVision(c.team, u.x, u.y, 160, 0.2)
      if (w.time < b.next) continue
      b.next = w.time + swarmRate(l)
      b.bites++
      w.addBuff(u, { id: 'weaver_swarm', expires: b.until, armor: -b.bites, src: c, color: '#8ad0a0', label: `The Swarm (-${b.bites} armor)` })
      w.damage(c, u, swarmDmg(l), 'physical', { abilityId: 'weaver_the_swarm' })
      w.vfx('weaver_beetle_bite', { x: u.x, y: u.y })
    }
    // filter in place: a Swarm still in flight keeps pushing into this same array
    let n = 0
    for (const b of beetles) if (b.until > 0) beetles[n++] = b
    beetles.length = n
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 1100).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (!t) return false
    const p = predict(c, t, 750)
    return !w.orderCast(c, st, undefined, p.x, p.y)
  },
}

const shukuchiDmg = (l: number) => L([75, 100, 125, 150], l)

const SHUKUCHI: AbilityDef = {
  id: 'weaver_shukuchi', name: 'Shukuchi', glyph: '≈', color: '#a8d8ff',
  behavior: 'none', castPoint: 0, cd: [12, 10, 8, 6], mana: same(4, 70), maxLevel: 4,
  desc: 'Weaver shifts out of sight: after a 0.25s fade he becomes invisible, moves at maximum speed and passes through units. Every enemy he passes is damaged once. He does not auto-attack while shifted; attacking or casting ends it.',
  info: (l) => [`Damage: ${shukuchiDmg(l)}`, 'Damage radius: 175', 'Move speed: maximum (550)', 'Duration: 4s', 'Fade time: 0.25s'],
  cast(w, c, l, _t, st) {
    w.addBuff(c, { id: 'shukuchi', expires: w.time + 4, invis: true, fade: 0.25, msFlat: 600, phased: true, noAutoAttack: true, color: '#a8d8ff', label: 'Shukuchi' })
    c.revealUntil = w.time + 0.25
    st.extra.shuHit = new Set<number>()
    st.extra.shuStart = w.time
    w.vfx('weaver_shukuchi', { x: c.x, y: c.y, unit: c, dur: 4 })
  },
  tick(w, c, l, _dt, st) {
    if (!c.hasBuff('shukuchi')) return
    // attacking or casting another spell breaks the shift
    if (c.attackWind || (c.casting && c.casting.st !== st)) {
      w.removeBuff(c, 'shukuchi')
      w.vfx('weaver_shukuchi_end', { x: c.x, y: c.y })
      return
    }
    const hit = st.extra.shuHit as Set<number>
    for (const e of w.enemiesIn(c.team, c.x, c.y, 175)) {
      if (hit.has(e.id)) continue
      hit.add(e.id)
      w.damage(c, e, shukuchiDmg(l), 'magical', { spell: true, abilityId: 'weaver_shukuchi' })
      w.vfx('weaver_shukuchi_hit', { x: e.x, y: e.y })
    }
  },
  ai(w, c, st) {
    if (c.hasBuff('shukuchi')) return false
    const near = w.enemyHeroesNear(c, 900)
    // a ready Time Lapse is the better escape: keep the mana for it
    const lapse = c.h?.abilities[3]
    const lapseReady = !!lapse && lapse.level > 0 && w.abilityReady(c, lapse) && c.mana >= lapse.def.mana[lapse.level - 1]
    if (near.length && c.hp < c.st.maxHp * 0.4 && !lapseReady) return !w.orderCast(c, st, undefined, c.x, c.y)
    const t = lowest(near.filter((u) => dist(u, c) > c.st.range + 150))
    if (t && c.hp > c.st.maxHp * 0.6) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

const gemCd = (l: number) => L([6, 5, 4, 3], l)
const gemDmg = (l: number) => L([5, 15, 25, 35], l)

const GEMINATE_ATTACK: AbilityDef = {
  id: 'weaver_geminate_attack', name: 'Geminate Attack', glyph: '⁑', color: '#d0f0a0',
  behavior: 'passive', castPoint: 0, cd: [6, 5, 4, 3], mana: same(4, 0), maxLevel: 4,
  desc: 'Every few seconds Weaver\'s attack is followed by a second one that strikes the same target with bonus damage and applies attack effects.',
  info: (l) => [`Cooldown: ${gemCd(l)}s`, 'Extra attacks: 1', `Extra attack bonus damage: +${gemDmg(l)}`],
  onAttackHit(w, a, t, l, st) {
    if (a.extra.geminate) return gemDmg(l)
    if (w.time < st.cdUntil) return 0
    st.cdUntil = w.time + gemCd(l)
    w.after(0.15, () => {
      if (a.dead || t.dead) return
      w.vfx('weaver_geminate', { x: a.x, y: a.y, unit: a })
      w.spawnHoming({
        owner: a, target: t, x: a.x, y: a.y, speed: a.st.projSpeed || 900, color: '#d0f0a0', size: 5, style: 'orb',
        onHit: (tg: Unit) => {
          a.extra.geminate = true
          w.applyAttack(a, tg)
          a.extra.geminate = false
        },
      })
    })
    return 0
  },
}

const LAPSE_BACK = 5

interface LapseMark {
  t: number
  x: number
  y: number
  hp: number
  mana: number
}

const TIME_LAPSE: AbilityDef = {
  id: 'weaver_time_lapse', name: 'Time Lapse', glyph: '⟲', color: '#7ab0ff',
  behavior: 'none', castPoint: 0, cd: [60, 45, 30], mana: [150, 75, 0], maxLevel: 3, ult: true,
  desc: 'Weaver rewinds his own timeline, returning to the position, health and mana he had 5 seconds ago and shedding every debuff.',
  info: () => [`Rewind: ${LAPSE_BACK}s`, 'Restores position, health and mana (never lowers health)', 'Removes debuffs'],
  cast(w, c, _l, _t, st) {
    const hist = (st.extra.hist || []) as LapseMark[]
    const m = hist.find((h) => h.t >= w.time - LAPSE_BACK) ?? hist[hist.length - 1]
    w.vfx('weaver_time_lapse', { x: c.x, y: c.y, x2: m?.x ?? c.x, y2: m?.y ?? c.y, angle: c.facing })
    c.buffs = c.buffs.filter((b) => !(b.src && b.src.team !== c.team) && !b.stun && !b.silence && !b.root && !b.disarm && !b.dot && !b.slow)
    w.interrupt(c, true)
    if (!m) return
    w.displace(c, m.x, m.y)
    c.vx = 0
    c.vy = 0
    w.recalc(c)
    c.hp = Math.min(c.st.maxHp, Math.max(c.hp, 1, m.hp))
    c.mana = Math.min(c.st.maxMana, Math.max(0, m.mana))
    st.extra.hist = []
  },
  tick(w, c, _l, _dt, st) {
    const hist: LapseMark[] = (st.extra.hist ||= [])
    if (c.dead) {
      hist.length = 0
      return
    }
    const last = hist[hist.length - 1]
    if (last && w.time - last.t < 0.2) return
    hist.push({ t: w.time, x: c.x, y: c.y, hp: c.hp, mana: c.mana })
    while (hist.length && hist[0].t < w.time - LAPSE_BACK - 0.5) hist.shift()
  },
  ai(w, c, st) {
    const hist = (st.extra.hist || []) as LapseMark[]
    const m = hist.find((h) => h.t >= w.time - LAPSE_BACK)
    if (!m) return false
    const lost = m.hp - c.hp
    if (c.hp < c.st.maxHp * 0.35 && (lost > c.st.maxHp * 0.15 || w.enemyHeroesNear(c, 700).length)) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

/* ------------------------------------------------------------------ HEROES */

export const HEROES_G5: HeroDef[] = [
  {
    id: 'weaver', name: 'Weaver', title: 'Skitskurr', attr: 'agi',
    str: 20, strG: 2.2, agi: 14, agiG: 3.0, int: 13, intG: 1.8, hpRegen: 0.25, manaRegen: 0,
    baseDmg: 23.0, armor: 0, ms: 290, range: 425, bat: 1.8, ap: 0.55, projSpeed: 900, radius: 34,
    color: '#5ab8a8', color2: '#2a3a6a', roles: ['Carry', 'Escape'],
    lore: 'A weaver of the cosmic tapestry who was cast out for unpicking threads he was meant to mend. He slips through time itself, striking twice before his foes can strike once.',
    abilities: [THE_SWARM, SHUKUCHI, GEMINATE_ATTACK, TIME_LAPSE],
    skillOrder: [1, 2, 1, 0, 1, 3, 1, 2, 2, 2, 3, 0, 0, 0, 3],
    buy: ['boots', 'gloves', 'alacrity', 'blades', 'broadsword', 'chainmail'],
  },
]
