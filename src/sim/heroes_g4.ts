import type { AbilityDef, AbilityState, HeroDef, Unit } from './entities'
import type { World } from './world'
import { dist, clamp, MAP } from './constants'
import { L, ang, same, heroesNear, predict } from './abkit'

/**
 * New heroes (g4): Earthshaker, Tidehunter, Dragon Knight (STR); Drow Ranger, Phantom Assassin, Bounty Hunter (AGI);
 * Lina, Lion, Zeus (INT). Numbers follow the Dota 2 wiki where feasible and are simplified where the engine cannot express a mechanic.
 */


/** Enemies (non-building) inside a rectangle starting at (x,y) pointing along angle a, with their distance along the line. */
function inLine(w: World, c: Unit, x: number, y: number, a: number, len: number, wid: number) {
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const out: { u: Unit; along: number }[] = []
  for (const u of w.units) {
    if (u.dead || u.team === c.team || u.isBuilding || u.isInvulnerable()) continue
    const rx = u.x - x
    const ry = u.y - y
    const along = rx * dx + ry * dy
    if (along < -u.radius * 0.3 || along > len + u.radius * 0.3) continue
    if (Math.abs(rx * dy - ry * dx) <= wid / 2 + u.radius * 0.5) out.push({ u, along })
  }
  return out
}

/** True once per cast the hero makes (polls `lastCast`; used for on-cast passives). */
function newCast(c: Unit, st: AbilityState): boolean {
  const lc = c.h?.lastCast ?? null
  if (!('seen' in st.extra)) {
    st.extra.seen = lc
    return false
  }
  if (lc !== st.extra.seen) {
    st.extra.seen = lc
    return true
  }
  return false
}

const lineAi = (w: World, c: Unit, st: AbilityState, range: number, speed: number, width: number) => {
  for (const t of heroesNear(w, c, range).sort((a, b) => dist(a, c) - dist(b, c))) {
    const p = predict(c, t, speed, 0.9)
    if (dist(c, p) > range) continue
    const a = ang(c, p)
    const hit = inLine(w, c, c.x, c.y, a, range, width).some((r) => r.u === t)
    if (hit) return !w.orderCast(c, st, undefined, p.x, p.y)
  }
  return false
}

/* ================================================================== EARTHSHAKER */

const FISSURE_DMG = [110, 160, 210, 260]
const FISSURE_STUN = [0.8, 1, 1.2, 1.4]

const ES_FISSURE: AbilityDef = {
  id: 'earthshaker_fissure', name: 'Fissure', glyph: '⛰', color: '#c8a060',
  behavior: 'point', range: same(4, 1600), castPoint: 0.69, cd: [18, 17, 16, 15], mana: [120, 130, 140, 150], maxLevel: 4,
  desc: 'Slams the ground, creating an impassable ridge of rock that damages and stuns enemies along its length. (The ridge does not block movement here.)',
  info: (l) => [`Damage: ${L(FISSURE_DMG, l)}`, `Stun: ${L(FISSURE_STUN, l)}s`, 'Length: 1600', 'Radius: 225'],
  cast(w, c, l, t) {
    const a = t.x === c.x && t.y === c.y ? c.facing : ang(c, t)
    c.facing = a
    const sx = c.x + Math.cos(a) * 90
    const sy = c.y + Math.sin(a) * 90
    w.vfx('es_fissure', { x: sx, y: sy, angle: a, len: 1600, w: 225 })
    for (const { u, along } of inLine(w, c, sx, sy, a, 1600, 450)) {
      w.after(along / 2500, () => {
        if (u.dead) return
        w.damage(c, u, L(FISSURE_DMG, l), 'magical', { spell: true, abilityId: 'earthshaker_fissure' })
        w.interrupt(u)
        w.addBuff(u, { id: 'fissure_stun', expires: w.time + L(FISSURE_STUN, l), stun: true, src: c, color: '#c8a060', label: 'Fissure' })
      })
    }
  },
  ai(w, c, st) {
    return lineAi(w, c, st, 1500, 99999, 450)
  },
}

const TOTEM_PCT = [1, 2, 3, 4]

const ES_TOTEM: AbilityDef = {
  id: 'earthshaker_enchant_totem', name: 'Enchant Totem', glyph: '♜', color: '#e0a050',
  behavior: 'point', range: same(4, 350), noMove: true, castPoint: 0.5, cd: [5, 5, 5, 5], mana: [45, 50, 55, 60], maxLevel: 4,
  desc: 'Earthshaker leaps toward the target point (or stays put) and empowers his next attack, which deals bonus damage.',
  info: (l) => [`Bonus damage: ${Math.round(L(TOTEM_PCT, l) * 100)}%`, 'Attack range: +100', 'Leap distance: up to 350', 'Lasts until used (14s)'],
  cast(w, c, l, t) {
    const d = dist(c, t)
    if (d > 60) {
      const k = Math.min(1, 350 / d)
      const tx = clamp(c.x + (t.x - c.x) * k, 40, MAP - 40)
      const ty = clamp(c.y + (t.y - c.y) * k, 40, MAP - 40)
      c.facing = ang(c, t)
      c.forced = { speed: 1000, tx, ty, onEnd: () => w.vfx('es_totem', { x: c.x, y: c.y, unit: c, land: true }) }
      w.vfx('es_totem', { x: c.x, y: c.y, unit: c, x2: tx, y2: ty })
    } else w.vfx('es_totem', { x: c.x, y: c.y, unit: c })
    w.addBuff(c, { id: 'es_totem', expires: w.time + 14, rangeBonus: 100, color: '#e0a050', label: 'Enchant Totem' })
  },
  onAttackHit(w, a, t, l) {
    if (!a.hasBuff('es_totem') || t.isBuilding) return 0
    w.removeBuff(a, 'es_totem')
    w.vfx('es_totem_hit', { x: t.x, y: t.y, unit: t })
    return a.st.dmg * L(TOTEM_PCT, l)
  },
  ai(w, c, st) {
    if (c.hasBuff('es_totem')) return false
    const t = heroesNear(w, c, 330).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (t) return !w.orderCast(c, st, undefined, t.x, t.y)
    return false
  },
}

const AS_DMG = [70, 100, 130, 160]
const AS_STUN = [1, 1.1, 1.2, 1.3]

const ES_AFTERSHOCK: AbilityDef = {
  id: 'earthshaker_aftershock', name: 'Aftershock', glyph: '〰', color: '#d8b070',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Whenever Earthshaker casts an ability, the ground shakes, damaging and stunning nearby enemies.',
  info: (l) => [`Damage: ${L(AS_DMG, l)}`, `Stun: ${L(AS_STUN, l)}s`, 'Radius: 350'],
  tick(w, c, l, _dt, st) {
    if (c.dead || !newCast(c, st)) return
    w.vfx('es_aftershock', { x: c.x, y: c.y, r: 350 })
    for (const e of w.enemiesIn(c.team, c.x, c.y, 350)) {
      w.damage(c, e, L(AS_DMG, l), 'magical', { spell: true, abilityId: 'earthshaker_aftershock' })
      w.addBuff(e, { id: 'aftershock_stun', expires: w.time + L(AS_STUN, l), stun: true, src: c, color: '#d8b070', label: 'Aftershock' })
    }
  },
}

const ECHO_INIT = [100, 140, 180]
const ECHO_DMG = [90, 110, 130]

const ES_ECHO_SLAM: AbilityDef = {
  id: 'earthshaker_echo_slam', name: 'Echo Slam', glyph: '◎', color: '#ffb050',
  behavior: 'none', castPoint: 0, cd: [150, 200, 250], mana: [145, 205, 265], maxLevel: 3, ult: true,
  desc: 'Shakes the earth, damaging nearby enemies. Every enemy unit hit then sends out an echo that damages every other enemy near it.',
  info: (l) => [`Initial damage: ${L(ECHO_INIT, l)}`, `Echo damage per unit: ${L(ECHO_DMG, l)}`, 'Radius: 700', 'Echo radius: 700', 'Heroes send 2 echoes'],
  cast(w, c, l) {
    w.vfx('es_echo', { x: c.x, y: c.y, r: 700, unit: c })
    const hit = w.enemiesIn(c.team, c.x, c.y, 700)
    for (const e of hit) w.damage(c, e, L(ECHO_INIT, l), 'magical', { spell: true, abilityId: 'earthshaker_echo_slam' })
    const src = hit.filter((u) => !u.dead).slice(0, 14)
    w.after(0.45, () => {
      src.forEach((s, i) => {
        const sx = s.x
        const sy = s.y
        if (i < 8) w.vfx('es_echo_wave', { x: sx, y: sy, r: 700 })
        const echoes = s.kind === 'hero' ? 2 : 1 // real heroes cause two echoes
        for (let k = 0; k < echoes; k++) {
          for (const e of w.enemiesIn(c.team, sx, sy, 700)) {
            if (e === s) continue
            w.damage(c, e, L(ECHO_DMG, l), 'magical', { spell: true, abilityId: 'earthshaker_echo_slam', quiet: (i + k) % 2 === 1 })
          }
        }
      })
    })
  },
  ai(w, c, st) {
    const hs = heroesNear(w, c, 700)
    const n = w.enemiesIn(c.team, c.x, c.y, 700).length
    if (hs.length >= 2 || (hs.length >= 1 && n >= 3)) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

/* ================================================================== TIDEHUNTER */

const GUSH_DMG = [110, 160, 210, 260]
const GUSH_ARMOR = [3, 4, 5, 6]

const TIDE_GUSH: AbilityDef = {
  id: 'tidehunter_gush', name: 'Gush', glyph: '≋', color: '#4ab0e8',
  behavior: 'unit', target: 'enemy', range: same(4, 700), castPoint: 0.3, cd: [12, 12, 12, 12], mana: [100, 105, 110, 115], maxLevel: 4,
  desc: 'Hurls a torrent of water at an enemy unit, dealing damage, slowing it and reducing its armor.',
  info: (l) => [`Damage: ${L(GUSH_DMG, l)}`, `Armor reduction: ${L(GUSH_ARMOR, l)}`, 'Slow: 40%', 'Duration: 4.5s'],
  cast(w, c, l, t) {
    const tg = t.unit!
    w.vfx('tide_gush', { unit: c, unit2: tg, x: c.x, y: c.y })
    w.spawnHoming({
      owner: c, target: tg, x: c.x, y: c.y, speed: 1800, color: '#4ab0e8', size: 9, style: 'orb',
      onHit: (u) => {
        w.vfx('tide_gush_hit', { x: u.x, y: u.y, unit: u })
        w.damage(c, u, L(GUSH_DMG, l), 'magical', { spell: true, abilityId: 'tidehunter_gush' })
        w.addBuff(u, { id: 'tide_gush', expires: w.time + 4.5, slow: 0.4, armor: -L(GUSH_ARMOR, l), src: c, color: '#4ab0e8', label: 'Gush' })
      },
    })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 700).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const SHELL_BLOCK = [16, 34, 52, 70]
const SHELL_THRESH = [600, 550, 500, 450]
const SHELL_RESET = 7

const TIDE_KRAKEN_SHELL: AbilityDef = {
  id: 'tidehunter_kraken_shell', name: 'Kraken Shell', glyph: '☗', color: '#5a9a8a',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Tidehunter\'s shell blocks incoming damage. Taking a large amount of damage in a short time purges all negative effects.',
  info: (l) => [`Damage block: ${L(SHELL_BLOCK, l)}`, `Purge threshold: ${L(SHELL_THRESH, l)} damage (resets after ${SHELL_RESET}s without damage)`],
  stats(_c, l, s) {
    s.block += L(SHELL_BLOCK, l)
  },
  tick(w, c, l, dt, st) {
    if (c.dead) return
    const prev: number = st.extra.prevHp ?? c.hp
    st.extra.prevHp = c.hp
    const lost = Math.max(0, prev - c.hp)
    if (lost > 0) st.extra.idle = 0
    else st.extra.idle = (st.extra.idle || 0) + dt
    if (st.extra.idle >= SHELL_RESET) st.extra.acc = 0
    st.extra.acc = (st.extra.acc || 0) + lost
    if (st.extra.acc >= L(SHELL_THRESH, l)) {
      st.extra.acc = 0
      const bad = c.buffs.some((b) => b.stun || b.slow || b.silence || b.root || b.disarm || b.taunt || b.dot)
      if (bad) {
        c.buffs = c.buffs.filter((b) => !(b.stun || b.slow || b.silence || b.root || b.disarm || b.taunt || b.dot))
        w.vfx('tide_shell_purge', { unit: c, x: c.x, y: c.y })
        w.text(c.x, c.y - 100, 'PURGED', '#9ae0d0', 16)
      }
    }
  },
}

const SMASH_DMG = [45, 90, 135, 180]
const SMASH_RED = [0.3, 0.4, 0.5, 0.6]

const TIDE_ANCHOR_SMASH: AbilityDef = {
  id: 'tidehunter_anchor_smash', name: 'Anchor Smash', glyph: '⚓', color: '#6a8ab0',
  behavior: 'none', castPoint: 0.4, cd: [7, 6, 5, 4], mana: [45, 50, 55, 60], maxLevel: 4,
  desc: 'Tidehunter swings his anchor, damaging nearby enemies and greatly reducing the damage of their attacks.',
  info: (l) => [`Damage: ${L(SMASH_DMG, l)}`, `Attack damage reduction: ${Math.round(L(SMASH_RED, l) * 100)}%`, 'Radius: 375', 'Duration: 6s'],
  cast(w, c, l) {
    w.vfx('tide_anchor', { x: c.x, y: c.y, r: 375, angle: c.facing, unit: c })
    for (const e of w.enemiesIn(c.team, c.x, c.y, 375)) {
      w.damage(c, e, L(SMASH_DMG, l), 'physical', { spell: true, abilityId: 'tidehunter_anchor_smash' })
      w.addBuff(e, { id: 'anchor_smash', expires: w.time + 6, dmgReduce: L(SMASH_RED, l), src: c, color: '#6a8ab0', label: 'Anchor Smash' })
    }
  },
  ai(w, c, st) {
    const hs = heroesNear(w, c, 330)
    if (hs.length) return !w.orderCast(c, st, undefined, c.x, c.y)
    const cr = w.enemiesIn(c.team, c.x, c.y, 330).filter((u) => u.kind === 'creep')
    if (cr.length >= 4 && c.mana > c.st.maxMana * 0.5) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

const RAVAGE_DMG = [250, 350, 450]
const RAVAGE_STUN = [2, 2.2, 2.4]

const TIDE_RAVAGE: AbilityDef = {
  id: 'tidehunter_ravage', name: 'Ravage', glyph: '𓆙', color: '#3a8a9a',
  behavior: 'none', castPoint: 0.3, cd: same(3, 150), mana: [125, 225, 325], maxLevel: 3, ult: true,
  desc: 'Giant tentacles erupt from the ground in an expanding ring, stunning and damaging every enemy they reach.',
  info: (l) => [`Damage: ${L(RAVAGE_DMG, l)}`, `Stun: ${L(RAVAGE_STUN, l)}s`, 'Radius: 1250', 'Expansion speed: 725'],
  cast(w, c, l) {
    const x = c.x
    const y = c.y
    w.vfx('tide_ravage', { x, y, r: 1250, speed: 725, unit: c })
    for (const e of w.enemiesIn(c.team, x, y, 1250)) {
      const d = Math.hypot(e.x - x, e.y - y)
      w.after(d / 725, () => {
        if (e.dead) return
        w.interrupt(e)
        w.damage(c, e, L(RAVAGE_DMG, l), 'magical', { spell: true, abilityId: 'tidehunter_ravage' })
        w.addBuff(e, { id: 'ravage', expires: w.time + L(RAVAGE_STUN, l), stun: true, src: c, color: '#3a8a9a', label: 'Ravage' })
      })
    }
  },
  ai(w, c, st) {
    const hs = heroesNear(w, c, 950)
    if (hs.length >= 2 || (hs.length === 1 && hs[0].hp < hs[0].st.maxHp * 0.6)) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

/* ================================================================== DRAGON KNIGHT */

const BF_DMG = [80, 160, 240, 320]
const BF_RED = [0.3, 0.3, 0.3, 0.3]

const DK_BREATHE_FIRE: AbilityDef = {
  id: 'dragon_knight_breathe_fire', name: 'Breathe Fire', glyph: '♨', color: '#ff7a30',
  behavior: 'point', range: same(4, 600), castPoint: 0.2, cd: [14, 13, 12, 11], mana: [90, 95, 100, 105], maxLevel: 4,
  desc: 'Breathes a cone of fire, damaging enemies and reducing the damage of their attacks.',
  info: (l) => [`Damage: ${L(BF_DMG, l)}`, `Attack damage reduction: ${Math.round(L(BF_RED, l) * 100)}%`, 'Duration: 11s', 'Length: 750, width 150 to 250'],
  cast(w, c, l, t) {
    const a = t.x === c.x && t.y === c.y ? c.facing : ang(c, t)
    c.facing = a
    w.vfx('dk_breathe', { x: c.x, y: c.y, angle: a, len: 750 })
    const hit = new Set<number>()
    w.spawnLinear({
      owner: c, x: c.x, y: c.y, angle: a, speed: 1050, range: 750, radius: 105, style: 'fire', color: '#ff7a30',
      filter: (u) => !hit.has(u.id) && u.team !== c.team && !u.isBuilding && !u.isInvulnerable(),
      onHit: (u) => {
        hit.add(u.id)
        w.damage(c, u, L(BF_DMG, l), 'magical', { spell: true, abilityId: 'dragon_knight_breathe_fire' })
        w.addBuff(u, { id: 'breathe_fire', expires: w.time + 11, dmgReduce: L(BF_RED, l), src: c, color: '#ff7a30', label: 'Breathe Fire' })
      },
    })
  },
  ai(w, c, st) {
    return lineAi(w, c, st, 600, 99999, 220)
  },
}

const TAIL_DMG = [70, 100, 130, 160]
const TAIL_STUN = [1.8, 2, 2.2, 2.4]

const DK_DRAGON_TAIL: AbilityDef = {
  id: 'dragon_knight_dragon_tail', name: 'Dragon Tail', glyph: '⟆', color: '#d05a3a',
  behavior: 'unit', target: 'enemy', range: same(4, 150), castPoint: 0, cd: [16, 14, 12, 10], mana: [70, 80, 90, 100], maxLevel: 4,
  desc: 'Slams an enemy unit with his tail, stunning it and dealing damage.',
  info: (l) => [`Damage: ${L(TAIL_DMG, l)}`, `Stun: ${L(TAIL_STUN, l)}s`, 'Cast range: 150'],
  cast(w, c, l, t) {
    const tg = t.unit!
    w.vfx('dk_tail', { x: tg.x, y: tg.y, x2: c.x, y2: c.y, unit: tg, angle: ang(c, tg) })
    w.interrupt(tg)
    w.damage(c, tg, L(TAIL_DMG, l), 'magical', { spell: true, abilityId: 'dragon_knight_dragon_tail' })
    w.addBuff(tg, { id: 'dragon_tail', expires: w.time + L(TAIL_STUN, l), stun: true, src: c, color: '#d05a3a', label: 'Dragon Tail' })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 150).filter((u) => !u.isStunned()).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const DB_ARMOR = [4, 7, 10, 13]
const DB_REGEN = [4, 7, 10, 13]

const DK_DRAGON_BLOOD: AbilityDef = {
  id: 'dragon_knight_dragon_blood', name: 'Dragon Blood', glyph: '♥', color: '#c0402a',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'The blood of dragons grants Dragon Knight bonus armor and health regeneration.',
  info: (l) => [`Bonus armor: +${L(DB_ARMOR, l)}`, `Health regeneration: +${L(DB_REGEN, l)}/s`],
  stats(_c, l, s) {
    s.armor += L(DB_ARMOR, l)
  },
  tick(w, c, l, dt, st) {
    if (c.dead) return
    w.addBuff(c, { id: 'dk_blood_regen', expires: w.time + 0.3, regenHp: L(DB_REGEN, l) })
    st.extra.fxT = (st.extra.fxT || 0) + dt
    if (st.extra.fxT > 3.2) {
      st.extra.fxT = 0
      w.vfx('dk_blood_pulse', { unit: c, x: c.x, y: c.y })
    }
  },
}

const EDF_DMG = [25, 60, 95]
const EDF_DUR = 60
const EDF_MS = [30, 35, 40]

const DK_ELDER_DRAGON: AbilityDef = {
  id: 'dragon_knight_elder_dragon_form', name: 'Elder Dragon Form', glyph: '🐉', color: '#ff4a2a',
  behavior: 'none', castPoint: 0, cd: same(3, 100), mana: same(3, 50), maxLevel: 3, ult: true,
  desc: 'Transforms into a mighty dragon for 60 seconds with a ranged attack (+350 range), bonus damage and movement speed. Attacks inflict corrosive poison. Level 2: attacks splash for 75% damage. Level 3: attacks also slow movement and attack speed with frost.',
  info: (l) => [
    `Duration: ${EDF_DUR}s`, 'Attack range: +350', `Bonus damage: +${L(EDF_DMG, l)}`, `Bonus move speed: +${L(EDF_MS, l)}`,
    'Corrosive Breath: poison 25/s for 3s',
    l >= 2 ? 'Splash: 75% damage, radius 350' : 'Splash: unlocks at level 2',
    l >= 3 ? 'Frost Breath: 30% move and attack speed slow for 3s' : 'Frost Breath: unlocks at level 3',
  ],
  stats(c, _l, s) {
    if (c.hasBuff('dk_elder_dragon')) {
      s.range = Math.max(s.range, 350)
      s.projSpeed = 900
    }
  },
  cast(w, c, l) {
    const dmgMul = L(EDF_DMG, l) / Math.max(30, c.st.dmg)
    w.addBuff(c, { id: 'dk_elder_dragon', expires: w.time + EDF_DUR, dmgMul, msFlat: L(EDF_MS, l), color: '#ff4a2a', label: 'Elder Dragon Form' })
    w.vfx('dk_dragon_form', { unit: c, x: c.x, y: c.y, dur: EDF_DUR, level: l })
  },
  onAttackHit(w, a, t, l) {
    if (!a.hasBuff('dk_elder_dragon') || t.isBuilding) return 0
    w.vfx('dk_dragon_hit', { x: t.x, y: t.y, unit: t, lvl: l })
    w.addBuff(t, { id: 'dk_corrosive', expires: w.time + 3, dot: { dps: 25, type: 'magical', abilityId: 'dragon_knight_elder_dragon_form' }, src: a, color: '#7ad030', label: 'Corrosive Breath' })
    if (l >= 3) w.addBuff(t, { id: 'dk_frost', expires: w.time + 3, slow: 0.3, as: -30, src: a, color: '#9fe0ff', label: 'Frost Breath' })
    if (l >= 2) {
      for (const e of w.enemiesIn(a.team, t.x, t.y, 350)) {
        if (e === t) continue
        w.damage(a, e, a.st.dmg * 0.75, 'physical', { quiet: true })
        w.addBuff(e, { id: 'dk_corrosive', expires: w.time + 3, dot: { dps: 25, type: 'magical', abilityId: 'dragon_knight_elder_dragon_form' }, src: a, color: '#7ad030', label: 'Corrosive Breath' })
        if (l >= 3) w.addBuff(e, { id: 'dk_frost', expires: w.time + 3, slow: 0.3, as: -30, src: a, color: '#9fe0ff', label: 'Frost Breath' })
      }
    }
    return 0
  },
  ai(w, c, st) {
    if (c.hasBuff('dk_elder_dragon')) return false
    const hs = heroesNear(w, c, 700)
    if (hs.length >= 1 && c.hp > c.st.maxHp * 0.3) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

/* ================================================================== DROW RANGER */

const FA_DMG = [6, 12, 18, 24]
const FA_SLOW = [0.1, 0.25, 0.4, 0.55]
const FA_COST = [9, 10, 11, 12]

const DROW_FROST_ARROWS: AbilityDef = {
  id: 'drow_ranger_frost_arrows', name: 'Frost Arrows', glyph: '❄', color: '#8fd8ff',
  behavior: 'toggle', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Coats arrows in frost (autocast). Each enchanted arrow costs mana, deals bonus damage and slows the target.',
  info: (l) => [`Bonus damage: ${L(FA_DMG, l)}`, `Slow: ${Math.round(L(FA_SLOW, l) * 100)}%`, 'Slow duration: 1.5s', `Mana per arrow: ${L(FA_COST, l)}`, 'Autocast (toggle)'],
  tick(w, c, _l, _dt, st) {
    if (!st.extra.init) {
      st.extra.init = true
      st.toggled = true
    }
  },
  onAttackHit(w, a, t, l, st) {
    if (!st.toggled || a.mana < L(FA_COST, l) || t.isBuilding) return 0
    a.mana -= L(FA_COST, l)
    w.vfx('drow_frost_hit', { x: t.x, y: t.y, unit: t })
    w.addBuff(t, { id: 'drow_frost', expires: w.time + 1.5, slow: L(FA_SLOW, l), src: a, color: '#8fd8ff', label: 'Frost Arrows' })
    return L(FA_DMG, l)
  },
}

const GUST_SIL = [3, 4, 5, 6]
const GUST_MS = [0.1, 0.12, 0.14, 0.16]
const GUST_KB = [0.6, 0.7, 0.8, 0.9]

const DROW_GUST: AbilityDef = {
  id: 'drow_ranger_wave_of_silence', name: 'Gust', glyph: '≈', color: '#bfe8ff',
  behavior: 'point', range: same(4, 900), castPoint: 0.25, cd: [19, 17, 15, 13], mana: same(4, 70), maxLevel: 4,
  desc: 'Releases a gust of wind that silences enemies and knocks them back, harder the closer they are. Drow gains bonus movement speed.',
  info: (l) => [`Silence: ${L(GUST_SIL, l)}s`, `Self move speed: +${Math.round(L(GUST_MS, l) * 100)}%`, 'Knockback: up to 450', 'Length: 900, width 250'],
  cast(w, c, l, t) {
    const a = t.x === c.x && t.y === c.y ? c.facing : ang(c, t)
    c.facing = a
    w.vfx('drow_gust', { x: c.x, y: c.y, angle: a, len: 900 })
    w.addBuff(c, { id: 'drow_gust_ms', expires: w.time + L(GUST_SIL, l), haste: L(GUST_MS, l), color: '#bfe8ff', label: 'Gust' })
    for (const { u, along } of inLine(w, c, c.x, c.y, a, 900, 250)) {
      w.after(along / 2000, () => {
        if (u.dead) return
        w.interrupt(u)
        w.addBuff(u, { id: 'drow_silence', expires: w.time + L(GUST_SIL, l), silence: true, src: c, color: '#bfe8ff', label: 'Gust' })
        if (u.kind === 'hero' || u.kind === 'creep') {
          const push = 450 - Math.min(300, along * 0.3)
          u.forced = { speed: push / L(GUST_KB, l), tx: clamp(u.x + Math.cos(a) * push, 40, MAP - 40), ty: clamp(u.y + Math.sin(a) * push, 40, MAP - 40) }
        }
      })
    }
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 800).filter((u) => !u.isSilenced() && (u.mana > 60 || dist(u, c) < 350)).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (t) return !w.orderCast(c, st, undefined, t.x, t.y)
    return false
  },
}

const MS_PCT = [1, 1.2, 1.4, 1.6]

const DROW_MULTISHOT: AbilityDef = {
  id: 'drow_ranger_multishot', name: 'Multishot', glyph: '⇶', color: '#9ad0ff',
  behavior: 'point', range: same(4, 900), noMove: true, castPoint: 0, cd: [24, 21, 18, 15], mana: [50, 70, 90, 110], maxLevel: 4,
  desc: 'Channels for 1.75 seconds, loosing three volleys of arrows in a cone toward the target point.',
  info: (l) => ['Waves: 3 (4 arrows each)', `Damage per arrow: ${Math.round(L(MS_PCT, l) * 100)}% of attack`, 'Cone width: 50 degrees', 'Channel: 1.75s'],
  cast(w, c, l, t, st) {
    const a0 = t.x === c.x && t.y === c.y ? c.facing : ang(c, t)
    c.facing = a0
    let acc = 0.725 // first wave at 0.1s, then every 0.825s
    let wave = 0
    w.vfx('drow_multishot_cast', { unit: c, x: c.x, y: c.y, angle: a0, dur: 1.75 })
    c.channel = {
      st, until: w.time + 1.8,
      tick: (dt) => {
        acc += dt
        while (acc >= 0.825 && wave < 3) {
          acc -= 0.825
          wave++
          for (let i = 0; i < 4; i++) {
            const a = a0 + (i - 1.5) * ((Math.PI * 50) / 180 / 3)
            w.spawnLinear({
              owner: c, x: c.x + Math.cos(a) * 60, y: c.y + Math.sin(a) * 60, angle: a, speed: 1900, range: 900, radius: 55, draw: 'arrow', style: 'arrow', color: '#9ad0ff',
              filter: (u) => u.team !== c.team && (u.kind === 'hero' || u.kind === 'creep' || u.kind === 'summon') && !u.isInvulnerable(),
              onHit: (u) => {
                w.vfx('drow_frost_hit', { x: u.x, y: u.y, unit: u, small: true })
                w.damage(c, u, c.st.dmg * L(MS_PCT, l), 'physical', { attack: true, abilityId: 'drow_ranger_multishot' })
                return true
              },
            })
          }
        }
      },
      end: () => {},
    }
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 700).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (t) return !w.orderCast(c, st, undefined, t.x, t.y)
    return false
  },
}

const MM_AGI = [0.3, 0.4, 0.5]
const MM_DMG = [40, 60, 80]
const MM_CHANCE = [0.2, 0.3, 0.4]

const DROW_MARKSMANSHIP: AbilityDef = {
  id: 'drow_ranger_marksmanship', name: 'Marksmanship', glyph: '◎', color: '#e8e0a0',
  behavior: 'passive', castPoint: 0, cd: same(3, 0), mana: same(3, 0), maxLevel: 3, ult: true,
  desc: 'Drow gains agility. While no enemy hero is within 400 range, 20/30/40% of her attacks deal bonus damage that ignores armor.',
  info: (l) => [`Bonus agility: +${Math.round(L(MM_AGI, l) * 100)}% of her agility`, `Bonus damage: ${L(MM_DMG, l)} (pure)`, `Chance: ${Math.round(L(MM_CHANCE, l) * 100)}%`, 'Disabled if an enemy hero is within 400'],
  stats(_c, l, s) {
    s.agi += s.agi * L(MM_AGI, l)
  },
  onAttackHit(w, a, t, l) {
    if (t.isBuilding || Math.random() > L(MM_CHANCE, l)) return 0
    if (w.enemyHeroesNear(a, 400).length) return 0
    w.vfx('drow_marksman', { x: t.x, y: t.y, unit: t })
    return L(MM_DMG, l) // folded into the attack (pure part approximated)
  },
}

/* ================================================================== PHANTOM ASSASSIN */

const SD_DMG = [65, 70, 75, 80]
const SD_PCT = [0.3, 0.45, 0.6, 0.75]
const SD_RANGE = [700, 850, 1000, 1150]
const SD_SLOW = [2.2, 2.8, 3.4, 4]

const PA_STIFLING_DAGGER: AbilityDef = {
  id: 'phantom_assassin_stifling_dagger', name: 'Stifling Dagger', glyph: '🗡', color: '#b0b8d0',
  behavior: 'unit', target: 'enemy', range: SD_RANGE, castPoint: 0.3, cd: [6, 6, 6, 6], mana: same(4, 30), maxLevel: 4,
  desc: 'Throws a dagger that slows the target heavily and deals damage.',
  info: (l) => [`Damage: ${L(SD_DMG, l)} + ${Math.round(L(SD_PCT, l) * 100)}% attack damage`, 'Slow: 50%', `Duration: ${L(SD_SLOW, l)}s`, 'Projectile speed: 1200'],
  cast(w, c, l, t) {
    const tg = t.unit!
    w.vfx('pa_dagger', { unit: c, unit2: tg, x: c.x, y: c.y })
    w.spawnHoming({
      owner: c, target: tg, x: c.x, y: c.y, speed: 1200, color: '#c8d0e8', size: 6, style: 'orb',
      onHit: (u) => {
        w.vfx('pa_dagger_hit', { x: u.x, y: u.y, unit: u })
        w.damage(c, u, L(SD_DMG, l) + c.st.dmg * L(SD_PCT, l), 'physical', { abilityId: 'phantom_assassin_stifling_dagger' })
        w.addBuff(u, { id: 'pa_dagger_slow', expires: w.time + L(SD_SLOW, l), slow: 0.5, src: c, color: '#b0b8d0', label: 'Stifling Dagger' })
      },
    })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 680).filter((u) => dist(u, c) > 250).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const PS_AS = [100, 130, 160, 190]

const PA_PHANTOM_STRIKE: AbilityDef = {
  id: 'phantom_assassin_phantom_strike', name: 'Phantom Strike', glyph: '✦', color: '#8a7ae0',
  behavior: 'unit', target: 'any', range: same(4, 1000), castPoint: 0.25, cd: [11, 9, 7, 5], mana: [35, 40, 45, 50], maxLevel: 4,
  desc: 'Teleports next to a target unit and, if it is an enemy, attacks it while gaining bonus attack speed.',
  info: (l) => ['Cast range: 1000', `Bonus attack speed: +${L(PS_AS, l)}`, 'Duration: 2.5s'],
  canCast(_w, c, t) {
    if (t.unit === c) return 'Cannot target yourself'
    return null
  },
  cast(w, c, l, t) {
    const tg = t.unit!
    const a = ang(tg, c)
    const ox = c.x
    const oy = c.y
    const nx = clamp(tg.x + Math.cos(a) * (tg.radius + c.radius + 20), 40, MAP - 40)
    const ny = clamp(tg.y + Math.sin(a) * (tg.radius + c.radius + 20), 40, MAP - 40)
    w.interrupt(c)
    w.displace(c, nx, ny)
    c.facing = ang(c, tg)
    w.vfx('pa_strike', { x: ox, y: oy, x2: nx, y2: ny, unit: c })
    if (tg.team !== c.team) {
      w.addBuff(c, { id: 'pa_strike_as', expires: w.time + 2.5, as: L(PS_AS, l), color: '#8a7ae0', label: 'Phantom Strike' })
      w.orderAttack(c, tg)
    }
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 1000).filter((u) => dist(u, c) > 400 && u.hp < u.st.maxHp * 0.75).sort((a, b) => a.hp - b.hp)[0]
    if (t && c.hp > c.st.maxHp * 0.4) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const BLUR_EVA = [0.2, 0.3, 0.4, 0.5]

const PA_BLUR: AbilityDef = {
  id: 'phantom_assassin_blur', name: 'Blur', glyph: '◌', color: '#7a6ab0',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Phantom Assassin is difficult to hit, gaining evasion against attacks.',
  info: (l) => [`Evasion: ${Math.round(L(BLUR_EVA, l) * 100)}%`],
  stats(_c, l, s) {
    s.evasion = Math.max(s.evasion, L(BLUR_EVA, l))
  },
}

const CDG_MULT = [2, 3.25, 4.5]
const CDG_CHANCE = 0.17

const PA_COUP_DE_GRACE: AbilityDef = {
  id: 'phantom_assassin_coup_de_grace', name: 'Coup de Grace', glyph: '☠', color: '#d04a5a',
  behavior: 'passive', castPoint: 0, cd: same(3, 0), mana: same(3, 0), maxLevel: 3, ult: true,
  desc: 'Phantom Assassin\'s attacks have a 17% chance to deal a devastating critical strike.',
  info: (l) => ['Chance: 17%', `Critical damage: ${Math.round(L(CDG_MULT, l) * 100)}%`],
  onAttackHit(w, a, t, l) {
    if (t.isBuilding || Math.random() > CDG_CHANCE) return 0
    const mult = L(CDG_MULT, l)
    w.vfx('pa_crit', { x: t.x, y: t.y, unit: t, unit2: a, angle: ang(a, t) })
    w.text(t.x, t.y - 110, `${Math.round(mult * 100)}%`, '#ff5a5a', 22)
    return a.st.dmg * (mult - 1)
  },
}

/* ================================================================== BOUNTY HUNTER */

const SHUR_DMG = [100, 150, 200, 250]
const SHUR_RANGE = [375, 425, 475, 525]
const TRACK_SHUR_MULT = [1.4, 1.7, 2]
const TRACK_CRIT = [1.4, 1.7, 2]
const TRACK_SELF_GOLD = [130, 225, 320]
const TRACK_ALLY_GOLD = [40, 80, 120]
const TRACK_HASTE = [0.16, 0.2, 0.24]
const ownerTrackLevel = (c: Unit) => c.h?.abilities.find((a) => a.def.id === 'bounty_hunter_track')?.level ?? 0

const BH_SHURIKEN: AbilityDef = {
  id: 'bounty_hunter_shuriken_toss', name: 'Shuriken Toss', glyph: '✴', color: '#c8d0e0',
  behavior: 'unit', target: 'enemy', range: SHUR_RANGE, castPoint: 0.3, cd: same(4, 5), mana: [50, 60, 70, 80], maxLevel: 4,
  desc: 'Hurls a spinning shuriken at an enemy unit, dealing magic damage and briefly slowing it. Bounces on to tracked enemies within 1200 and deals bonus damage to tracked targets.',
  info: (l) => [`Damage: ${L(SHUR_DMG, l)} (x1.4/1.7/2 vs tracked)`, 'Slow: 100% move speed, -100 attack speed for 0.35s', 'Bounce: tracked targets only (radius 1200)', 'Projectile speed: 1000'],
  cast(w, c, l, t) {
    const tg = t.unit!
    const hit = new Set<number>()
    const throwAt = (from: { x: number; y: number }, to: Unit, owner: Unit) => {
      w.vfx('bh_shuriken', { x: from.x, y: from.y, unit2: to })
      w.spawnHoming({
        owner, target: to, x: from.x, y: from.y, speed: 1000, color: '#c8d0e0', size: 6, style: 'orb',
        onHit: (u) => {
          hit.add(u.id)
          w.vfx('bh_shuriken_hit', { x: u.x, y: u.y, unit: u })
          const tl = u.hasBuff('bh_track') ? ownerTrackLevel(c) : 0
          w.damage(c, u, L(SHUR_DMG, l) * (tl > 0 ? L(TRACK_SHUR_MULT, tl) : 1), 'magical', { spell: true, abilityId: 'bounty_hunter_shuriken_toss' })
          w.addBuff(u, { id: 'bh_shuriken_slow', expires: w.time + 0.35, slow: 1, as: -100, src: c, color: '#c8d0e0', label: 'Shuriken Toss' })
          if (u.hasBuff('bh_track')) {
            const nx = w.enemiesIn(c.team, u.x, u.y, 1200).filter((e) => !hit.has(e.id) && !e.dead && e.kind !== 'summon').sort((a, b) => dist(a, u) - dist(b, u))[0]
            if (nx) throwAt(u, nx, owner)
          }
        },
      })
    }
    throwAt(c, tg, c)
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, L(SHUR_RANGE, st.level)).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const JIN_DMG = [60, 100, 140, 180]
const JIN_GOLD = [12, 20, 28, 36]
const JIN_CD = [9, 7, 5, 3]

const BH_JINADA: AbilityDef = {
  id: 'bounty_hunter_jinada', name: 'Jinada', glyph: '⚔', color: '#e8c060',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Every few seconds Bounty Hunter\'s next attack deals bonus damage, slows attack speed and steals gold from heroes.',
  info: (l) => [`Bonus damage: ${L(JIN_DMG, l)}`, `Cooldown: ${L(JIN_CD, l)}s`, `Gold stolen: ${L(JIN_GOLD, l)} (heroes)`, 'Slows target attack speed by 50 for 2s'],
  onAttackHit(w, a, t, l, st) {
    if (t.isBuilding || w.time < (st.extra.readyAt || 0)) return 0
    st.extra.readyAt = w.time + L(JIN_CD, l)
    w.vfx('bh_jinada', { x: t.x, y: t.y, unit: t, angle: ang(a, t) })
    w.addBuff(t, { id: 'jinada_slow', expires: w.time + 2, as: -50, src: a, color: '#e8c060', label: 'Jinada' })
    if (t.kind === 'hero' && t.h) {
      const g = Math.min(t.h.gold, L(JIN_GOLD, l))
      t.h.gold -= g
      w.gold(a, g)
    }
    return L(JIN_DMG, l)
  },
}

const SW_DMG = [20, 40, 60, 80]
const SW_DUR = [20, 25, 30, 35]
const SW_FADE = [1, 0.75, 0.5, 0.25]
const SW_STUN = [0.8, 1, 1.2, 1.4]

const BH_SHADOW_WALK: AbilityDef = {
  id: 'bounty_hunter_wind_walk', name: 'Shadow Walk', glyph: '☾', color: '#6a7a9a',
  behavior: 'none', castPoint: 0, cd: [18, 17, 16, 15], mana: same(4, 55), maxLevel: 4,
  desc: 'Bounty Hunter turns invisible for up to 20/25/30/35 seconds. His next attack from the shadows breaks the effect, stuns the target briefly and deals bonus damage.',
  info: (l) => [`Duration: ${L(SW_DUR, l)}s`, `Stun: ${L(SW_STUN, l)}s`, `Bonus attack damage: ${L(SW_DMG, l)}`, `Fade time: ${L(SW_FADE, l)}s`],
  cast(w, c, l) {
    w.vfx('bh_shadow_walk', { unit: c, x: c.x, y: c.y, on: true })
    w.addBuff(c, { id: 'bh_shadow_walk', expires: w.time + L(SW_DUR, l), invis: true, fade: L(SW_FADE, l), color: '#6a7a9a', label: 'Shadow Walk' })
  },
  onAttackHit(w, a, t, l) {
    if (!a.hasBuff('bh_shadow_walk')) return 0
    w.removeBuff(a, 'bh_shadow_walk')
    w.vfx('bh_shadow_walk', { unit: a, x: a.x, y: a.y, on: false })
    if (!t.isBuilding) w.addBuff(t, { id: 'bh_sw_stun', expires: w.time + L(SW_STUN, l), stun: true, src: a, color: '#6a7a9a', label: 'Shadow Walk' })
    return L(SW_DMG, l)
  },
  ai(w, c, st) {
    if (c.hasBuff('bh_shadow_walk')) return false
    const t = heroesNear(w, c, 900).filter((u) => dist(u, c) > 350)[0]
    if (t && c.hp > c.st.maxHp * 0.4) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}


const BH_TRACK: AbilityDef = {
  id: 'bounty_hunter_track', name: 'Track', glyph: '◉', color: '#e8c040',
  behavior: 'unit', target: 'enemy', heroOnly: true, range: same(3, 1000), castPoint: 0.3, cd: [6, 5, 4], mana: same(3, 60), maxLevel: 3, ult: true,
  desc: 'Marks an enemy hero for 30 seconds, revealing it even through invisibility. Bounty Hunter moves faster near the mark and crits it; if it dies Bounty Hunter and nearby allied heroes are rewarded with bonus gold.',
  info: (l) => [`Bonus gold on kill: ${L(TRACK_SELF_GOLD, l)} (self), ${L(TRACK_ALLY_GOLD, l)} (nearby allies)`, `Critical damage vs target: ${Math.round(L(TRACK_CRIT, l) * 100)}%`, `Shuriken Toss damage: x${L(TRACK_SHUR_MULT, l)}`, 'Duration: 30s', `Bounty Hunter move speed: +${Math.round(L(TRACK_HASTE, l) * 100)}% while target is within 1200`],
  cast(w, c, l, t) {
    const tg = t.unit!
    tg.revealUntil = Math.max(tg.revealUntil, w.time + 30)
    w.addBuff(tg, { id: 'bh_track', expires: w.time + 30, src: c, color: '#e8c040', label: 'Tracked' })
    w.vfx('bh_track', { unit: tg, x: tg.x, y: tg.y, dur: 30 })
  },
  tick(w, c, _l, _dt, st) {
    if (c.dead || st.level <= 0) return
    const tg = w.heroes.find((h) => !h.dead && h.team !== c.team && h.hasBuff('bh_track') && h.buffs.find((b) => b.id === 'bh_track')?.src === c)
    if (tg) {
      tg.revealUntil = Math.max(tg.revealUntil, w.time + 0.3)
      if (dist(c, tg) < 1200) w.addBuff(c, { id: 'bh_track_haste', expires: w.time + 0.5, haste: L(TRACK_HASTE, st.level) })
    }
  },
  onAttackHit(w, a, t, l) {
    const b = t.buffs.find((x) => x.id === 'bh_track')
    if (!b || b.src !== a || t.isBuilding) return 0
    return a.st.dmg * (L(TRACK_CRIT, l) - 1)
  },
  onEnemyHeroDeath(w, owner, victim, _killer, _l, st) {
    if (st.level <= 0) return
    const b = victim.buffs.find((x) => x.id === 'bh_track')
    if (!b || b.src !== owner) return
    const g = L(TRACK_SELF_GOLD, st.level)
    const ga = L(TRACK_ALLY_GOLD, st.level)
    for (const h of w.heroes) {
      if (h.team !== owner.team) continue
      if (h === owner) w.gold(h, g)
      else if (!h.dead && dist(h, victim) <= 1200) w.gold(h, ga)
    }
    w.text(owner.x, owner.y - 100, `+${g}g Track`, '#e8c040', 18)
    w.vfx('bh_track', { unit: owner, x: victim.x, y: victim.y, dur: 1, payout: true })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 1000).filter((u) => !u.hasBuff('bh_track')).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/* ================================================================== LINA */

const DS_DMG = [75, 150, 225, 300]
const DS_BURN = [10, 20, 30, 40]

const LINA_DRAGON_SLAVE: AbilityDef = {
  id: 'lina_dragon_slave', name: 'Dragon Slave', glyph: '🔥', color: '#ff6a2a',
  behavior: 'point', range: same(4, 800), castPoint: 0.45, cd: [11, 10, 9, 8], mana: [100, 115, 130, 145], maxLevel: 4,
  desc: 'Launches a wave of dragon fire that pierces and damages all enemies in its path, then burns them for 3 seconds.',
  info: (l) => [`Damage: ${L(DS_DMG, l)}`, `Burn: ${L(DS_BURN, l)}/s for 3s`, 'Cast range: 800', 'Length: 1075', 'Width: 275 to 200', 'Speed: 1200'],
  cast(w, c, l, t) {
    const a = t.x === c.x && t.y === c.y ? c.facing : ang(c, t)
    c.facing = a
    w.vfx('lina_dragon_slave', { x: c.x, y: c.y, angle: a, len: 1075 })
    const hit = new Set<number>()
    w.spawnLinear({
      owner: c, x: c.x, y: c.y, angle: a, speed: 1200, range: 1075, radius: 120, style: 'fire', color: '#ff6a2a',
      filter: (u) => !hit.has(u.id) && u.team !== c.team && !u.isBuilding && !u.isInvulnerable(),
      onHit: (u) => {
        hit.add(u.id)
        w.vfx('lina_dslave_hit', { x: u.x, y: u.y, unit: u })
        w.damage(c, u, L(DS_DMG, l), 'magical', { spell: true, abilityId: 'lina_dragon_slave' })
        if (!u.dead) w.addBuff(u, { id: 'lina_dslave_burn', expires: w.time + 3, dot: { dps: L(DS_BURN, l), type: 'magical', abilityId: 'lina_dragon_slave' }, src: c, color: '#ff6a2a', label: 'Dragon Slave' })
      },
    })
  },
  ai(w, c, st) {
    if (lineAi(w, c, st, 800, 1200, 240)) return true
    const cr = w.enemiesIn(c.team, c.x, c.y, 900).filter((u) => u.kind === 'creep')
    if (cr.length >= 4 && c.mana > c.st.maxMana * 0.6) return !w.orderCast(c, st, undefined, cr[0].x, cr[0].y)
    return false
  },
}

const LSA_DMG = [110, 160, 210, 260]
const LSA_STUN = [1.3, 1.6, 1.9, 2.2]

const LINA_LSA: AbilityDef = {
  id: 'lina_light_strike_array', name: 'Light Strike Array', glyph: '☀', color: '#ffb040',
  behavior: 'point', range: same(4, 700), castPoint: 0.45, cd: [13, 11, 9, 7], mana: [100, 115, 130, 145], maxLevel: 4,
  desc: 'After a short delay, a pillar of fire erupts at the target area, damaging and stunning enemies.',
  info: (l) => [`Damage: ${L(LSA_DMG, l)}`, `Stun: ${L(LSA_STUN, l)}s`, 'Radius: 250', 'Delay: 0.5s'],
  cast(w, c, l, t) {
    const x = t.x
    const y = t.y
    w.vfx('lina_lsa_charge', { x, y, r: 250, dur: 0.5 })
    w.after(0.5, () => {
      w.vfx('lina_lsa_hit', { x, y, r: 250 })
      for (const e of w.enemiesIn(c.team, x, y, 250)) {
        w.damage(c, e, L(LSA_DMG, l), 'magical', { spell: true, abilityId: 'lina_light_strike_array' })
        w.interrupt(e)
        w.addBuff(e, { id: 'lsa_stun', expires: w.time + L(LSA_STUN, l), stun: true, src: c, color: '#ffb040', label: 'Light Strike Array' })
      }
    })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 700).filter((u) => !u.isStunned()).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (t) {
      const p = predict(c, t, 99999, 0)
      return !w.orderCast(c, st, undefined, p.x + t.vx * 0.7, p.y + t.vy * 0.7)
    }
    return false
  },
}

const FS_AS = [8, 16, 24, 32]
const FS_MS = [0.01, 0.015, 0.02, 0.025]

const LINA_FIERY_SOUL: AbilityDef = {
  id: 'lina_fiery_soul', name: 'Fiery Soul', glyph: '♨', color: '#ff8a3a',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Each ability Lina casts stokes her inner fire, granting stacking attack speed and movement speed for 18 seconds.',
  info: (l) => [`Attack speed per stack: +${L(FS_AS, l)}`, `Move speed per stack: +${+(L(FS_MS, l) * 100).toFixed(1)}%`, 'Max stacks: 7', 'Duration: 18s'],
  tick(w, c, l, _dt, st) {
    if (c.dead) return
    if (newCast(c, st)) {
      st.extra.stacks = Math.min(7, (st.extra.stacks || 0) + 1)
      st.extra.until = w.time + 18
      w.vfx('lina_fiery_soul', { unit: c, x: c.x, y: c.y, stacks: st.extra.stacks })
    }
    if ((st.extra.stacks || 0) > 0 && w.time > st.extra.until) st.extra.stacks = 0
    const n = st.extra.stacks || 0
    if (n > 0) {
      w.addBuff(c, { id: 'lina_fiery', expires: w.time + 0.3, as: n * L(FS_AS, l), haste: n * L(FS_MS, l), color: '#ff8a3a', label: `Fiery Soul x${n}` })
    }
  },
}

const LAG_DMG = [500, 700, 900]

const LINA_LAGUNA: AbilityDef = {
  id: 'lina_laguna_blade', name: 'Laguna Blade', glyph: '⚡', color: '#ffe060',
  behavior: 'unit', target: 'enemy', range: same(3, 600), castPoint: 0.45, cd: [70, 60, 50], mana: [150, 300, 450], maxLevel: 3, ult: true,
  desc: 'Fires a devastating bolt of lightning at an enemy unit, dealing massive damage.',
  info: (l) => [`Damage: ${L(LAG_DMG, l)}`, 'Cast range: 600', 'Delay: 0.25s'],
  cast(w, c, l, t) {
    const tg = t.unit!
    w.vfx('lina_laguna', { unit: c, unit2: tg, x: c.x, y: c.y, x2: tg.x, y2: tg.y })
    w.after(0.25, () => {
      if (tg.dead) return
      w.damage(c, tg, L(LAG_DMG, l), 'magical', { spell: true, abilityId: 'lina_laguna_blade' })
    })
  },
  ai(w, c, st, l) {
    const dmg = L(LAG_DMG, l) * (1 - 0.25)
    const t = heroesNear(w, c, 600).filter((u) => u.hp < dmg * 1.05 || u.hp < u.st.maxHp * 0.5).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/* ================================================================== LION */

const SPIKE_DMG = [105, 170, 235, 300]
const SPIKE_STUN = [1.3, 1.6, 1.9, 2.2]
const SPIKE_LEN = 925 // cast range 650 + 275 buffer

const LION_EARTH_SPIKE: AbilityDef = {
  id: 'lion_impale', name: 'Earth Spike', glyph: '▲', color: '#a0d860',
  behavior: 'point', range: same(4, 650), castPoint: 0.3, cd: [14, 13, 12, 11], mana: [90, 110, 130, 150], maxLevel: 4,
  desc: 'Thrusts a line of spikes through the ground, hurling enemies into the air, damaging and stunning them.',
  info: (l) => [`Damage: ${L(SPIKE_DMG, l)}`, `Stun: ${L(SPIKE_STUN, l)}s`, 'Cast range: 650', 'Length: 925', 'Width: 280'],
  cast(w, c, l, t) {
    const a = t.x === c.x && t.y === c.y ? c.facing : ang(c, t)
    c.facing = a
    w.vfx('lion_spike', { x: c.x, y: c.y, angle: a, len: SPIKE_LEN, w: 280 })
    for (const { u, along } of inLine(w, c, c.x, c.y, a, SPIKE_LEN, 280)) {
      w.after(along / 1600, () => {
        if (u.dead) return
        w.interrupt(u)
        w.damage(c, u, L(SPIKE_DMG, l), 'magical', { spell: true, abilityId: 'lion_impale' })
        w.addBuff(u, { id: 'lion_impale', expires: w.time + L(SPIKE_STUN, l), stun: true, lift: false, src: c, color: '#a0d860', label: 'Earth Spike' })
      })
    }
  },
  ai(w, c, st) {
    return lineAi(w, c, st, 650, 1600, 280)
  },
}

const HEX_DUR = [2, 2.4, 2.8, 3.2]
const HEX_RANGE = [550, 575, 600, 625]

const LION_HEX: AbilityDef = {
  id: 'lion_voodoo', name: 'Hex', glyph: '🐸', color: '#7ad84a',
  behavior: 'unit', target: 'enemy', range: HEX_RANGE, castPoint: 0, cd: [24, 20, 16, 12], mana: [125, 150, 175, 200], maxLevel: 4,
  desc: 'Transforms an enemy unit into a harmless frog: it cannot attack or cast, and its movement speed is greatly reduced.',
  info: (l) => [`Duration: ${L(HEX_DUR, l)}s`, 'Move speed: 120', `Cast range: ${L(HEX_RANGE, l)}`],
  cast(w, c, l, t) {
    const tg = t.unit!
    w.interrupt(tg)
    w.addBuff(tg, { id: 'lion_hex', expires: w.time + L(HEX_DUR, l), silence: true, disarm: true, slow: Math.max(0, Math.min(0.95, 1 - 120 / Math.max(120, tg.st.ms))), src: c, color: '#7ad84a', label: 'Hex' })
    w.vfx('lion_hex', { x: tg.x, y: tg.y, unit: tg, x2: c.x, y2: c.y, dur: L(HEX_DUR, l) })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, L(HEX_RANGE, st.level)).filter((u) => !u.hasBuff('lion_hex') && !u.isStunned()).sort((a, b) => b.st.dmg - a.st.dmg)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const DRAIN_RATE = [20, 40, 60, 120]
const DRAIN_SLOW = [0.15, 0.2, 0.25, 0.3]

const LION_MANA_DRAIN: AbilityDef = {
  id: 'lion_mana_drain', name: 'Mana Drain', glyph: '☄', color: '#7a9aff',
  behavior: 'unit', target: 'enemy', range: same(4, 850), castPoint: 0.3, cd: [15, 12, 9, 6], mana: same(4, 0), maxLevel: 4,
  desc: 'Drains mana from an enemy unit, slowing it, and gives it to Lion. Channeled for up to 5 seconds; breaks if the target moves beyond 1100 range.',
  info: (l) => [`Mana drained per second: ${L(DRAIN_RATE, l)}`, `Move speed slow: ${Math.round(L(DRAIN_SLOW, l) * 100)}%`, 'Channel: 5s', 'Break distance: 1100'],
  cast(w, c, l, t, st) {
    const tg = t.unit!
    const rate = L(DRAIN_RATE, l)
    let acc = 0
    w.vfx('lion_drain', { unit: c, unit2: tg, x: c.x, y: c.y, dur: 5 })
    c.channel = {
      st, until: w.time + 5, target: tg,
      tick: (dt) => {
        if (tg.dead || tg.isInvulnerable() || dist(c, tg) > 1100 || (!w.isVisible(c.team, tg) && dist(c, tg) > 850)) {
          c.channel!.until = 0
          return
        }
        w.addBuff(tg, { id: 'lion_drain_slow', expires: w.time + 0.3, slow: L(DRAIN_SLOW, l), src: c, color: '#7a9aff', label: 'Mana Drain' })
        const take = Math.min(tg.mana, rate * dt)
        tg.mana -= take
        c.mana = Math.min(c.st.maxMana, c.mana + take)
        acc += dt
        if (acc >= 0.3) {
          acc = 0
          w.vfx('lion_drain_pulse', { unit: c, unit2: tg, x: c.x, y: c.y })
        }
      },
      end: () => {},
    }
  },
  ai(w, c, st) {
    if (c.mana > c.st.maxMana * 0.7) return false
    const t = heroesNear(w, c, 850).filter((u) => u.mana > 150).sort((a, b) => b.mana - a.mana)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const FOD_DMG = [600, 725, 850]
const FOD_STACK = [40, 40, 40]

const LION_FINGER: AbilityDef = {
  id: 'lion_finger_of_death', name: 'Finger of Death', glyph: '☝', color: '#d040ff',
  behavior: 'unit', target: 'enemy', range: same(3, 900), castPoint: 0.3, cd: [140, 90, 40], mana: [200, 400, 600], maxLevel: 3, ult: true,
  desc: 'Releases a bolt of demonic energy that obliterates an enemy unit. Each hero it kills permanently increases its damage.',
  info: (l) => [`Damage: ${L(FOD_DMG, l)} (+${L(FOD_STACK, l)} per hero kill)`, 'Cast range: 900', 'Delay: 0.25s'],
  cast(w, c, l, t, st) {
    const tg = t.unit!
    w.vfx('lion_finger', { unit: c, unit2: tg, x: c.x, y: c.y, x2: tg.x, y2: tg.y })
    w.after(0.25, () => {
      if (tg.dead) return
      w.vfx('lion_finger_hit', { x: tg.x, y: tg.y, unit: tg })
      const dmg = L(FOD_DMG, l) + (st.extra.stacks || 0) * L(FOD_STACK, l)
      w.damage(c, tg, dmg, 'magical', { spell: true, abilityId: 'lion_finger_of_death' })
      if (tg.dead && tg.kind === 'hero') {
        st.extra.stacks = (st.extra.stacks || 0) + 1
        w.text(c.x, c.y - 100, `+${L(FOD_STACK, l)} Finger`, '#d040ff', 17)
      }
    })
  },
  ai(w, c, st, l) {
    const dmg = (L(FOD_DMG, l) + (st.extra.stacks || 0) * L(FOD_STACK, l)) * 0.75
    const t = heroesNear(w, c, 900).filter((u) => u.hp < dmg * 1.1).sort((a, b) => b.hp - a.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/* ================================================================== ZEUS */

const ARC_DMG = [85, 110, 135, 160]
const ARC_PCT = [0.03, 0.04, 0.05, 0.06]
const ARC_BOUNCES = [5, 7, 9, 15]

const ZEUS_ARC: AbilityDef = {
  id: 'zuus_arc_lightning', name: 'Arc Lightning', glyph: '⌁', color: '#a8d8ff',
  behavior: 'unit', target: 'enemy', range: same(4, 850), castPoint: 0.2, cd: [1.6, 1.6, 1.6, 1.6], mana: [75, 80, 85, 90], maxLevel: 4,
  desc: 'A chain of lightning leaps from the target to nearby enemies, damaging each one for a base amount plus a percentage of its current health.',
  info: (l) => [`Damage: ${L(ARC_DMG, l)} + ${Math.round(L(ARC_PCT, l) * 100)}% current health`, `Targets: ${L(ARC_BOUNCES, l)}`, 'Jump radius: 500', 'Jump interval: 0.25s'],
  cast(w, c, l, t) {
    let cur: Unit = t.unit!
    let from: { x: number; y: number } = c
    const hit = new Set<number>()
    const jump = (n: number) => {
      if (cur.dead) return
      hit.add(cur.id)
      w.vfx('zeus_arc', { x: from.x, y: from.y, x2: cur.x, y2: cur.y, unit: from === c ? c : undefined, unit2: cur, first: n === 0 })
      w.damage(c, cur, L(ARC_DMG, l) + cur.hp * L(ARC_PCT, l), 'magical', { spell: true, abilityId: 'zuus_arc_lightning' })
      if (n >= L(ARC_BOUNCES, l) - 1) return
      const nx = w.enemiesIn(c.team, cur.x, cur.y, 500).filter((e) => !hit.has(e.id) && !e.dead && e.kind !== 'summon').sort((a, b) => dist(a, cur) - dist(b, cur))[0]
      if (!nx) return
      from = { x: cur.x, y: cur.y }
      cur = nx
      w.after(0.25, () => jump(n + 1))
    }
    jump(0)
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 850).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    const cr = w.enemiesIn(c.team, c.x, c.y, 800).filter((u) => u.kind === 'creep' && u.hp < L(ARC_DMG, st.level))
    if (cr.length && c.mana > c.st.maxMana * 0.5) return !w.orderCast(c, st, cr[0], cr[0].x, cr[0].y)
    return false
  },
}

const BOLT_DMG = [125, 200, 275, 350]
const BOLT_RANGE = [700, 750, 800, 850]

const ZEUS_BOLT: AbilityDef = {
  id: 'zuus_lightning_bolt', name: 'Lightning Bolt', glyph: '⚡', color: '#e8f0ff',
  behavior: 'point', range: BOLT_RANGE, castPoint: 0.25, cd: [6, 6, 6, 6], mana: [120, 125, 130, 135], maxLevel: 4,
  desc: 'Calls a bolt down on the target area, striking the nearest enemy unit, dealing damage, briefly stunning and revealing it.',
  info: (l) => [`Damage: ${L(BOLT_DMG, l)}`, 'Stun: 0.35s', 'Strike radius: 325', 'Reveal: 5s'],
  cast(w, c, l, t) {
    const near = w.enemiesIn(c.team, t.x, t.y, 325).filter((u) => u.kind !== 'summon')
    near.sort((a, b) => (b.kind === 'hero' ? 1 : 0) - (a.kind === 'hero' ? 1 : 0) || dist(a, t) - dist(b, t))
    const tg = near[0]
    const bx = tg ? tg.x : t.x
    const by = tg ? tg.y : t.y
    w.vfx('zeus_bolt', { x: bx, y: by, r: 325, hit: !!tg })
    if (tg) {
      tg.revealUntil = Math.max(tg.revealUntil, w.time + 5)
      w.interrupt(tg)
      w.damage(c, tg, L(BOLT_DMG, l), 'magical', { spell: true, abilityId: 'zuus_lightning_bolt' })
      w.addBuff(tg, { id: 'zeus_bolt_stun', expires: w.time + 0.35, stun: true, src: c, color: '#e8f0ff', label: 'Lightning Bolt' })
    }
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, L(BOLT_RANGE, st.level)).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, undefined, t.x, t.y)
    return false
  },
}

const SF_PCT = [0.04, 0.05, 0.06, 0.07]

const ZEUS_STATIC_FIELD: AbilityDef = {
  id: 'zuus_static_field', name: 'Static Field', glyph: '✺', color: '#b8c8ff',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Whenever Zeus casts an ability, all nearby enemies are shocked for a percentage of their current health.',
  info: (l) => [`Damage: ${Math.round(L(SF_PCT, l) * 100)}% of current health`, 'Radius: 1200'],
  tick(w, c, l, _dt, st) {
    if (c.dead || !newCast(c, st)) return
    w.vfx('zeus_static', { x: c.x, y: c.y, r: 1200, unit: c })
    for (const e of w.enemiesIn(c.team, c.x, c.y, 1200)) {
      if (e.kind === 'summon') continue
      w.vfx('zeus_static_zap', { x: c.x, y: c.y, x2: e.x, y2: e.y, unit: e })
      w.damage(c, e, e.hp * L(SF_PCT, l), 'magical', { spell: true, abilityId: 'zuus_static_field', quiet: e.kind !== 'hero' })
    }
  },
}

const TW_DMG = [300, 425, 550]
const TW_PCT = [0.05, 0.075, 0.1]

const ZEUS_WRATH: AbilityDef = {
  id: 'zuus_thundergods_wrath', name: "Thundergod's Wrath", glyph: '☈', color: '#ffe86a',
  behavior: 'none', castPoint: 0.4, cd: [120, 120, 120], mana: [250, 375, 500], maxLevel: 3, ult: true,
  desc: 'Strikes every enemy hero on the map with a bolt of lightning, dealing damage and revealing them for a moment.',
  info: (l) => [`Damage: ${L(TW_DMG, l)} + ${+(L(TW_PCT, l) * 100).toFixed(1)}% max health`, 'Global range', 'Reveal: 3s'],
  cast(w, c, l) {
    w.vfx('zeus_wrath_cast', { x: c.x, y: c.y, unit: c, r: 2400 })
    for (const h of w.heroes) {
      if (h.team === c.team || h.dead) continue
      w.after(0.3, () => {
        if (h.dead || h.isInvulnerable()) return
        h.revealUntil = Math.max(h.revealUntil, w.time + 3)
        w.vfx('zeus_wrath_hit', { x: h.x, y: h.y, unit: h })
        w.damage(c, h, L(TW_DMG, l) + h.st.maxHp * L(TW_PCT, l), 'magical', { spell: true, abilityId: 'zuus_thundergods_wrath' })
      })
    }
  },
  ai(w, c, st, l) {
    const dmg = (L(TW_DMG, l) + 0.07 * 2000) * 0.75
    const kill = w.heroes.some((h) => h.team !== c.team && !h.dead && h.hp < dmg)
    const near = heroesNear(w, c, 900).length
    if (kill || (near >= 2 && c.mana > c.st.maxMana * 0.5)) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

/* ================================================================== HEROES */

const order = (a: number, b: number, c: number, u = 3) => [a, b, a, c, a, u, a, b, b, b, u, c, c, c, u]

export const HEROES_G4: HeroDef[] = [
  {
    id: 'earthshaker', name: 'Earthshaker', title: 'Raigor Stonehoof', attr: 'str',
    str: 22, strG: 3.7, agi: 12, agiG: 1.4, int: 18, intG: 2.1, hpRegen: 1, manaRegen: 0,
    baseDmg: 32.0, armor: 2, ms: 315, range: 150, bat: 1.7, ap: 0.467, projSpeed: 0, radius: 40,
    color: '#8a6a4a', color2: '#3a2a1a', roles: ['Support', 'Initiator', 'Disabler', 'Nuker'],
    lore: 'Raigor Stonehoof, born of the mountain, wields his sacred totem to split the earth and shatter armies.',
    abilities: [ES_FISSURE, ES_TOTEM, ES_AFTERSHOCK, ES_ECHO_SLAM],
    skillOrder: order(0, 1, 2),
    buy: ['boots', 'salve', 'ogre', 'chainmail', 'vitality', 'blink'],
  },
  {
    id: 'tidehunter', name: 'Tidehunter', title: 'Leviathan', attr: 'str',
    str: 27, strG: 3.5, agi: 15, agiG: 1.5, int: 18, intG: 1.7, hpRegen: 0.25, manaRegen: 0.5,
    baseDmg: 28.0, armor: 0, ms: 300, range: 150, bat: 1.7, ap: 0.6, projSpeed: 0, radius: 42,
    color: '#3a8a7a', color2: '#143a3a', roles: ['Initiator', 'Durable', 'Disabler'],
    lore: 'Leviathan, the terror of the deep, drags whole fleets beneath the waves with his anchor and tentacles.',
    abilities: [TIDE_GUSH, TIDE_KRAKEN_SHELL, TIDE_ANCHOR_SMASH, TIDE_RAVAGE],
    skillOrder: order(2, 0, 1),
    buy: ['boots', 'salve', 'chainmail', 'ogre', 'vitality', 'blink'],
  },
  {
    id: 'dragon_knight', name: 'Dragon Knight', title: 'Davion', attr: 'str',
    str: 21, strG: 3.6, agi: 16, agiG: 2, int: 18, intG: 1.7, hpRegen: 0.25, manaRegen: 0,
    baseDmg: 37.0, armor: 0, ms: 315, range: 150, bat: 1.6, ap: 0.5, projSpeed: 0, radius: 40,
    color: '#b03a2a', color2: '#4a1a14', roles: ['Carry', 'Durable', 'Disabler', 'Pusher'],
    lore: 'Davion, bound to the Elder Dragon\'s blood, slays beasts and men alike as a fire-breathing knight or a dragon himself.',
    abilities: [DK_BREATHE_FIRE, DK_DRAGON_TAIL, DK_DRAGON_BLOOD, DK_ELDER_DRAGON],
    skillOrder: order(2, 0, 1),
    buy: ['boots', 'salve', 'broadsword', 'chainmail', 'ogre', 'vitality'],
  },
  {
    id: 'drow_ranger', name: 'Drow Ranger', title: 'Traxex', attr: 'agi',
    str: 16, strG: 1.9, agi: 20, agiG: 2.9, int: 15, intG: 1.4, hpRegen: 0.25, manaRegen: 0,
    baseDmg: 32.5, armor: 0, ms: 300, range: 625, bat: 1.7, ap: 0.5, projSpeed: 1250, radius: 34,
    color: '#8ab0d0', color2: '#2a3a5a', roles: ['Carry', 'Disabler', 'Pusher'],
    lore: 'Traxex, princess of the Drow of the Icewrack, is a deadly archer who freezes and silences her prey from afar.',
    abilities: [DROW_FROST_ARROWS, DROW_GUST, DROW_MULTISHOT, DROW_MARKSMANSHIP],
    skillOrder: order(0, 1, 2),
    buy: ['boots', 'gloves', 'blades', 'alacrity', 'broadsword', 'chainmail'],
  },
  {
    id: 'phantom_assassin', name: 'Phantom Assassin', title: 'Mortred', attr: 'agi',
    str: 19, strG: 2, agi: 21, agiG: 3.4, int: 15, intG: 1.7, hpRegen: 1, manaRegen: 0,
    baseDmg: 32.0, armor: 1, ms: 310, range: 150, bat: 1.7, ap: 0.3, projSpeed: 0, radius: 36,
    color: '#5a4a8a', color2: '#1a1430', roles: ['Carry', 'Escape'],
    lore: 'Mortred, the Veiled Sister, an assassin of the Veiled Sisterhood, is a remorseless blade that few see coming.',
    abilities: [PA_STIFLING_DAGGER, PA_PHANTOM_STRIKE, PA_BLUR, PA_COUP_DE_GRACE],
    skillOrder: order(2, 1, 0),
    buy: ['boots', 'gloves', 'blades', 'alacrity', 'broadsword', 'chainmail'],
  },
  {
    id: 'bounty_hunter', name: 'Bounty Hunter', title: 'Gondar', attr: 'agi',
    str: 19, strG: 2.5, agi: 21, agiG: 2.6, int: 22, intG: 1.9, hpRegen: 0.75, manaRegen: 0.5,
    baseDmg: 37.0, armor: 5, ms: 325, range: 150, bat: 1.5, ap: 0.59, projSpeed: 0, radius: 34,
    color: '#8a7a5a', color2: '#3a2a1a', roles: ['Escape', 'Nuker'],
    lore: 'Gondar of the Slithice Hunters tracks any quarry and collects every coin owed, hidden in the shadows.',
    abilities: [BH_SHURIKEN, BH_JINADA, BH_SHADOW_WALK, BH_TRACK],
    skillOrder: order(1, 0, 2),
    buy: ['boots', 'gloves', 'blades', 'alacrity', 'chainmail', 'broadsword'],
  },
  {
    id: 'lina', name: 'Lina', title: 'The Slayer', attr: 'int',
    str: 20, strG: 2.4, agi: 23, agiG: 2.4, int: 30, intG: 3.8, hpRegen: 0.25, manaRegen: 0,
    baseDmg: 27.9, armor: 0, ms: 290, range: 670, bat: 1.6, ap: 0.65, projSpeed: 1000, radius: 34,
    color: '#e8603a', color2: '#7a1a0a', roles: ['Support', 'Nuker', 'Disabler', 'Carry'],
    lore: 'Lina Inverse, the Slayer, blasts her foes with fire and lightning drawn from her fiery soul.',
    abilities: [LINA_DRAGON_SLAVE, LINA_LSA, LINA_FIERY_SOUL, LINA_LAGUNA],
    skillOrder: order(0, 1, 2),
    buy: ['boots', 'clarity', 'staff', 'energy', 'staff', 'blink'],
  },
  {
    id: 'lion', name: 'Lion', title: 'Demon Witch', attr: 'int',
    str: 18, strG: 2.2, agi: 15, agiG: 1.5, int: 20, intG: 3.5, hpRegen: 0.5, manaRegen: 0,
    baseDmg: 32.0, armor: 0, ms: 290, range: 600, bat: 1.7, ap: 0.43, projSpeed: 900, radius: 34,
    color: '#8a4aa8', color2: '#2a1040', roles: ['Support', 'Disabler', 'Nuker'],
    lore: 'Once a hero, now a demon witch, Lion sells his power to whoever pays and turns heroes into frogs for sport.',
    abilities: [LION_EARTH_SPIKE, LION_HEX, LION_MANA_DRAIN, LION_FINGER],
    skillOrder: order(0, 1, 2),
    buy: ['boots', 'clarity', 'staff', 'energy', 'staff', 'blink'],
  },
  {
    id: 'zeus', name: 'Zeus', title: 'Lord of Olympus', attr: 'int',
    str: 19, strG: 2.1, agi: 11, agiG: 1.2, int: 22, intG: 3.3, hpRegen: 0.25, manaRegen: 0,
    baseDmg: 38.4, armor: 2, ms: 315, range: 380, bat: 1.7, ap: 0.35, projSpeed: 1100, radius: 36,
    color: '#8ab0ff', color2: '#2a3a7a', roles: ['Nuker'],
    lore: 'The father of gods and men hurls the lightning of Olympus at any who dare to stand against him.',
    abilities: [ZEUS_ARC, ZEUS_BOLT, ZEUS_STATIC_FIELD, ZEUS_WRATH],
    skillOrder: order(0, 1, 2),
    buy: ['boots', 'clarity', 'staff', 'energy', 'staff', 'blink'],
  },
]
