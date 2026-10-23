import type { AbilityDef, HeroDef, Unit } from './entities'
import type { World } from './world'
import { dist } from './constants'
import { L, ang, same, heroesNear, clampMap } from './abkit'

/** New heroes (g1): Sven, Juggernaut, Legion Commander. Numbers follow the current Dota 2 wiki. */

const armorRed = (w: World, t: Unit) => 1 - w.armorReduction(t.st.armor)

/* ------------------------------------------------------------------- SVEN */

const STORM_HAMMER: AbilityDef = {
  id: 'sven_storm_hammer', name: 'Storm Hammer', glyph: '⚡', color: '#5aa8ff',
  behavior: 'unit', target: 'enemy', range: same(4, 600), castPoint: 0.2, cd: [21, 18, 15, 12], mana: [110, 115, 120, 125], maxLevel: 4,
  desc: 'Sven hurls his magical gauntlet at an enemy unit. On impact it damages and stuns all enemies in a small area around the target.',
  info: (l) => [`Damage: ${L([80, 160, 240, 320], l)}`, `Stun: ${L([1, 1.2, 1.4, 1.6], l)}s`, 'Radius: 270', 'Range: 600'],
  cast(w, c, l, t) {
    const tg = t.unit!
    if (tg.dead) return
    const dmg = L([80, 160, 240, 320], l)
    const stun = L([1, 1.2, 1.4, 1.6], l)
    w.vfx('sven_hammer_fly', { unit: c, unit2: tg, x: c.x, y: c.y })
    w.spawnHoming({
      owner: c, target: tg, x: c.x, y: c.y, speed: 1000, color: '#7ab8ff', size: 9, style: 'orb',
      onHit: (u) => {
        w.vfx('sven_hammer_impact', { x: u.x, y: u.y, r: 270 })
        for (const e of w.enemiesIn(c.team, u.x, u.y, 270)) {
          w.damage(c, e, dmg, 'magical', { spell: true, abilityId: 'sven_storm_hammer' })
          w.interrupt(e)
          w.addBuff(e, { id: 'storm_hammer', expires: w.time + stun, stun: true, src: c, color: '#5aa8ff', label: 'Storm Hammer' })
        }
      },
    })
  },
  ai(w, c, st, l) {
    const t = heroesNear(w, c, 600).filter((u) => !u.isStunned()).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/** Extra God's Strength damage currently active on a unit (percent of base damage). */
const gsBonus = (u: Unit, lvl: number) => (u.hasBuff('gods_strength') ? (u.base.dmg + u.st.str) * L([1, 1.4, 1.8], lvl) : 0)

const GREAT_CLEAVE: AbilityDef = {
  id: 'sven_great_cleave', name: 'Great Cleave', glyph: '⚔', color: '#c8c8d8',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Sven strikes with great force, cleaving all enemies in a wide arc in front of the target. Also grants bonus Strength.',
  info: (l) => [`Cleave damage: ${L([40, 60, 80, 100], l)}%`, 'Length 700, widening from 150 to 360', `Strength: +${L([3, 6, 9, 12], l)}`],
  stats(c, l, s) {
    s.str += L([3, 6, 9, 12], l)
  },
  onAttackHit(w, a, t, l) {
    const pct = L([0.4, 0.6, 0.8, 1], l)
    const gs = a.h?.abilities.find((x) => x.def.id === 'sven_gods_strength')
    const base = a.st.dmg + (gs && gs.level > 0 ? gsBonus(a, gs.level) : 0)
    const dir = Math.atan2(t.y - a.y, t.x - a.x)
    const cx = Math.cos(dir)
    const cy = Math.sin(dir)
    let hit = false
    for (const e of w.enemiesIn(a.team, a.x, a.y, 760)) {
      if (e === t) continue
      const dx = e.x - a.x
      const dy = e.y - a.y
      const along = dx * cx + dy * cy
      if (along < 0 || along > 700) continue
      const lat = Math.abs(-dx * cy + dy * cx)
      if (lat > 150 + (210 * along) / 700 + e.radius * 0.5) continue
      hit = true
      w.damage(a, e, base * pct, 'physical', { abilityId: 'sven_great_cleave', quiet: true })
      w.vfx('slash', { x: e.x, y: e.y, z: 40, angle: dir + 0.3, size: 70, dur: 0.22, color: '#e8e8ff' })
    }
    if (hit) w.vfx('sven_cleave', { x: a.x, y: a.y, angle: dir })
    return 0
  },
}

const WARCRY: AbilityDef = {
  id: 'sven_warcry', name: 'Warcry', glyph: '⚑', color: '#e0a040',
  behavior: 'none', castPoint: 0, cd: [35, 30, 25, 20], mana: [30, 35, 40, 45], maxLevel: 4,
  desc: 'Sven rallies himself and nearby allied heroes, increasing their armor and movement speed for 10 seconds.',
  info: (l) => [`Move speed: +${L([10, 14, 18, 22], l)}%`, `Armor: +${L([6, 9, 12, 15], l)}`, 'Radius: 700', 'Duration: 10s'],
  cast(w, c, l) {
    for (const h of w.heroes) {
      if (h.team !== c.team || h.dead || dist(h, c) > 700) continue
      w.addBuff(h, {
        id: 'warcry', expires: w.time + 10, haste: L([0.1, 0.14, 0.18, 0.22], l), armor: L([6, 9, 12, 15], l), color: '#e0a040', label: 'Warcry',
      })
      if (h !== c) w.vfx('sven_warcry_ally', { x: h.x, y: h.y, unit: h })
    }
    w.vfx('sven_warcry', { x: c.x, y: c.y, r: 700 })
  },
  ai(w, c, st) {
    if (heroesNear(w, c, 650).length || (c.hp < c.st.maxHp * 0.6 && w.enemiesIn(c.team, c.x, c.y, 500).length)) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

const GODS_STRENGTH: AbilityDef = {
  id: 'sven_gods_strength', name: "God's Strength", glyph: '☀', color: '#ff8a3a',
  behavior: 'none', castPoint: 0.3, cd: [110, 105, 100], mana: [100, 150, 200], maxLevel: 3, ult: true,
  desc: 'Sven channels his rogue strength, gaining a large bonus to attack damage for 35 seconds.',
  info: (l) => [`Bonus damage: +${L([100, 140, 180], l)}% base damage`, 'Duration: 35s'],
  onAttackHit(w, a, t, l) {
    return gsBonus(a, l)
  },
  cast(w, c) {
    w.addBuff(c, { id: 'gods_strength', expires: w.time + 35, color: '#ff8a3a', label: "God's Strength" })
    w.vfx('sven_gods_cast', { x: c.x, y: c.y })
    w.vfx('sven_gods_aura', { unit: c, x: c.x, y: c.y, dur: 35 })
  },
  ai(w, c, st) {
    if (heroesNear(w, c, 500).length && c.hp > c.st.maxHp * 0.35) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

/* ------------------------------------------------------------ JUGGERNAUT */

const BLADE_FURY: AbilityDef = {
  id: 'jugg_blade_fury', name: 'Blade Fury', glyph: '✺', color: '#e8c040',
  behavior: 'none', castPoint: 0, cd: [42, 34, 26, 18], mana: [120, 110, 100, 90], maxLevel: 4,
  desc: 'Juggernaut becomes a whirling blade storm, immune to magic and dealing damage each second to nearby enemies. He cannot attack while spinning.',
  info: (l) => [`Damage per second: ${L([90, 115, 140, 165], l)}`, 'Radius: 260', 'Duration: 5s', 'Spell immune'],
  cast(w, c, l, t, st) {
    st.extra.until = w.time + 5
    w.addBuff(c, { id: 'blade_fury', expires: w.time + 5, immune: true, disarm: true, color: '#e8c040', label: 'Blade Fury' })
    w.vfx('jugg_fury_cast', { x: c.x, y: c.y })
    w.vfx('jugg_fury', { unit: c, x: c.x, y: c.y, dur: 5 })
  },
  tick(w, c, l, dt, st) {
    if (c.dead || !c.hasBuff('blade_fury') || w.time >= (st.extra.until || 0)) return
    const dps = L([90, 115, 140, 165], l)
    for (const e of w.enemiesIn(c.team, c.x, c.y, 260)) w.damage(c, e, dps * dt, 'magical', { spell: true, abilityId: 'jugg_blade_fury', quiet: true })
    st.extra.fx = (st.extra.fx || 0) + dt
    if (st.extra.fx > 0.5) {
      st.extra.fx = 0
      const near = w.enemiesIn(c.team, c.x, c.y, 260).slice(0, 2)
      for (const e of near) w.vfx('jugg_fury_hit', { x: e.x, y: e.y })
    }
  },
  ai(w, c, st) {
    const es = w.enemiesIn(c.team, c.x, c.y, 300)
    if (es.some((e) => e.kind === 'hero') || es.filter((e) => e.kind === 'creep').length >= 3) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

const HEALING_WARD: AbilityDef = {
  id: 'jugg_healing_ward', name: 'Healing Ward', glyph: '✚', color: '#6ae08a',
  behavior: 'point', range: same(4, 350), castPoint: 0.3, cd: same(4, 60), mana: [140, 130, 120, 110], maxLevel: 4,
  desc: 'Summons a healing ward that follows Juggernaut and heals all nearby allied units based on their maximum health. It dies to a single attack.',
  info: (l) => [`Heal: ${L([2, 3, 4, 5], l)}% max HP per second`, 'Radius: 400', 'Duration: 25s', 'Attacks to destroy: 1'],
  cast(w, c, l, t) {
    const pct = L([0.02, 0.03, 0.04, 0.05], l) / 1
    w.vfx('jugg_ward_summon', { x: t.x, y: t.y, r: 220 })
    const ward = w.spawnSummon({
      team: c.team, owner: c, sub: 'jugg_healing_ward', name: 'Healing Ward', x: t.x, y: t.y, hp: 1, radius: 28, life: 25, color: '#6ae08a',
      tick: (ww, u, dt) => {
        const o = u.summoner
        if (o && !o.dead && dist(u, o) > 160) {
          const a = ang(u, o)
          u.x += Math.cos(a) * 325 * dt
          u.y += Math.sin(a) * 325 * dt
          u.facing = a
        }
        for (const e of ww.units) {
          if (e.dead || e.team !== u.team || (e.kind !== 'hero' && e.kind !== 'creep') || dist(e, u) > 400) continue
          ww.heal(e, e.st.maxHp * pct * dt)
        }
        u.extra.fxAcc = (u.extra.fxAcc || 0) + dt
        if (u.extra.fxAcc > 1.2) {
          u.extra.fxAcc = 0
          ww.vfx('jugg_ward_pulse', { x: u.x, y: u.y, r: 400 })
          let n = 0
          for (const e of ww.units) {
            if (n >= 3) break
            if (e.dead || e.team !== u.team || e === u || (e.kind !== 'hero' && e.kind !== 'creep') || dist(e, u) > 400 || e.hp >= e.st.maxHp) continue
            ww.vfx('jugg_ward_heal', { unit: u, unit2: e, x: u.x, y: u.y })
            n++
          }
        }
      },
    })
    w.vfx('jugg_ward_glow', { unit: ward, x: ward.x, y: ward.y, dur: 25 })
  },
  ai(w, c, st) {
    const hurt = w.heroes.filter((h) => h.team === c.team && !h.dead && dist(h, c) < 450 && h.hp < h.st.maxHp * 0.65)
    if (hurt.length || (c.hp < c.st.maxHp * 0.6 && !w.enemyHeroesNear(c, 500).length)) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

const BLADE_DANCE: AbilityDef = {
  id: 'jugg_blade_dance', name: 'Blade Dance', glyph: '✦', color: '#e87a3a',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Gives Juggernaut a chance to deal critical damage on each attack. Critical strikes also heal him.',
  info: (l) => [`Chance: ${L([20, 25, 30, 35], l)}%`, 'Critical damage: 190%', 'Lifesteal on crit: 60%'],
  onAttackHit(w, a, t, l) {
    if (Math.random() >= L([0.2, 0.25, 0.3, 0.35], l)) return 0
    const extra = 0.9 * a.st.dmg
    w.heal(a, (a.st.dmg + extra) * armorRed(w, t) * 0.6)
    w.text(t.x, t.y - 70, 'CRIT!', '#ff9a3a')
    w.vfx('jugg_crit', { x: t.x, y: t.y, angle: Math.atan2(t.y - a.y, t.x - a.x) })
    return extra
  },
}

const OMNISLASH: AbilityDef = {
  id: 'jugg_omnislash', name: 'Omnislash', glyph: '⚔', color: '#ff5a3a',
  behavior: 'unit', target: 'enemy', range: same(3, 350), castPoint: 0.3, cd: same(3, 120), mana: [200, 275, 350], maxLevel: 3, ult: true,
  desc: 'Juggernaut leaps to an enemy and slashes it and other nearby enemies at an increased attack rate, with bonus damage. He is invulnerable for the duration.',
  info: (l) => [`Duration: ${L([3, 3.25, 3.5], l)}s`, `Bonus damage per slash: +${L([40, 45, 50], l)}`, 'Attack speed: +40', 'Attack rate divisor: 1.5', 'Search radius: 425'],
  cast(w, c, l, t, st) {
    const tg = t.unit!
    if (tg.dead) return
    const dur = L([3, 3.25, 3.5], l)
    const bonus = L([40, 45, 50], l)
    const hop = (e: Unit) => {
      const a = ang(e, c) || 0
      c.x = clampMap(e.x + Math.cos(a) * (e.radius + c.radius) * 0.8)
      c.y = clampMap(e.y + Math.sin(a) * (e.radius + c.radius) * 0.8)
      c.facing = ang(c, e)
    }
    const from0 = { x: c.x, y: c.y }
    w.vfx('jugg_omni_start', { x: c.x, y: c.y })
    hop(tg)
    w.vfx('jugg_omni_hop', { x: from0.x, y: from0.y, x2: c.x, y2: c.y })
    w.addBuff(c, { id: 'omnislash', expires: w.time + dur + 0.1, invuln: true, as: 40, color: '#ff5a3a', label: 'Omnislash' })
    const center = { x: tg.x, y: tg.y }
    let acc = 99
    c.channel = {
      st, until: w.time + dur, target: tg,
      tick: (dt) => {
        acc += dt
        const interval = Math.max(0.2, c.st.bat / 1.5)
        if (acc < interval) return
        acc = 0
        const cands = w.enemiesIn(c.team, center.x, center.y, 425).filter((e) => !e.isBuilding)
        if (!cands.length) {
          c.channel!.until = 0
          return
        }
        const e = cands[Math.floor(Math.random() * cands.length)]
        const prev = { x: c.x, y: c.y }
        hop(e)
        w.vfx('jugg_omni_hop', { x: prev.x, y: prev.y, x2: c.x, y2: c.y })
        w.applyAttack(c, e)
        w.damage(c, e, bonus, 'physical', { abilityId: 'jugg_omnislash' })
      },
      end: () => {
        w.removeBuff(c, 'omnislash')
        w.vfx('jugg_omni_end', { x: c.x, y: c.y })
      },
    }
  },
  ai(w, c, st) {
    const ts = heroesNear(w, c, 350).sort((a, b) => a.hp - b.hp)
    const t = ts[0]
    if (t && c.hp > c.st.maxHp * 0.3 && !c.hasBuff('blade_fury')) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/* ------------------------------------------------------- LEGION COMMANDER */

const OVERWHELMING_ODDS: AbilityDef = {
  id: 'legion_odds', name: 'Overwhelming Odds', glyph: '⚑', color: '#e04a3a',
  behavior: 'none', castPoint: 0.3, cd: same(4, 15), mana: [100, 110, 120, 130], maxLevel: 4,
  desc: 'Turns the enemies\' numbers against them, dealing damage per enemy hero and creep nearby and granting Legion Commander bonus attack speed. Hurts summoned units for a share of their current health.',
  info: (l) => [
    `Base damage: ${L([35, 65, 95, 125], l)}`, `Per hero: +${L([35, 65, 95, 125], l)}`, `Per creep: +${L([14, 16, 18, 20], l)}`,
    'Radius: 600', `Attack speed: +${L([50, 75, 100, 125], l)} for 5s`,
  ],
  cast(w, c, l) {
    const es = w.enemiesIn(c.team, c.x, c.y, 600)
    const heroes = es.filter((e) => e.kind === 'hero').length
    const creeps = es.filter((e) => e.kind === 'creep').length
    const dmg = L([35, 65, 95, 125], l) + heroes * L([35, 65, 95, 125], l) + creeps * L([14, 16, 18, 20], l)
    w.vfx('legion_odds', { x: c.x, y: c.y, r: 600 })
    for (const e of es) {
      w.vfx('legion_spear', { x: e.x, y: e.y, dur: 0.35 })
      let d = dmg
      if (e.kind === 'summon') d += e.hp * 0.25
      w.damage(c, e, d, 'magical', { spell: true, abilityId: 'legion_odds' })
    }
    w.addBuff(c, { id: 'odds_as', expires: w.time + 5, as: L([50, 75, 100, 125], l), color: '#e04a3a', label: 'Overwhelming Odds' })
  },
  ai(w, c, st) {
    const es = w.enemiesIn(c.team, c.x, c.y, 560)
    if (es.some((e) => e.kind === 'hero') || es.filter((e) => e.kind === 'creep').length >= 4) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

const DEBUFF_KEYS = ['stun', 'slow', 'silence', 'root', 'disarm', 'taunt', 'dot', 'dmgReduce', 'hunger'] as const

const PRESS_THE_ATTACK: AbilityDef = {
  id: 'legion_press', name: 'Press the Attack', glyph: '✚', color: '#f0c050',
  behavior: 'unit', target: 'any', range: same(4, 700), castPoint: 0.2, cd: [16, 15, 14, 13], mana: same(4, 110), maxLevel: 4,
  desc: 'Removes debuffs and disables from a friendly unit (or Legion Commander herself) and grants bonus movement speed and health regeneration for 5 seconds.',
  info: (l) => [`Health regen: +${L([24, 36, 48, 60], l)}/s`, `Move speed: +${L([10, 14, 18, 22], l)}%`, 'Duration: 5s', 'Range: 700'],
  canCast(w, c, t) {
    if (t.unit && t.unit.team !== c.team) return 'Must target an ally'
    return null
  },
  cast(w, c, l, t) {
    const tg = t.unit && !t.unit.dead && t.unit.team === c.team ? t.unit : c
    tg.buffs = tg.buffs.filter((b) => b.lift || b.invuln || !DEBUFF_KEYS.some((k) => b[k]) || (b.src && b.src.team === tg.team))
    w.addBuff(tg, {
      id: 'press_attack', expires: w.time + 5, regenHp: L([24, 36, 48, 60], l), haste: L([0.1, 0.14, 0.18, 0.22], l), color: '#f0c050', label: 'Press the Attack',
    })
    w.vfx('legion_press', { x: tg.x, y: tg.y, unit: tg })
  },
  ai(w, c, st) {
    const hasDebuff = c.buffs.some((b) => (b.stun || b.slow || b.silence || b.root || b.disarm) && (!b.src || b.src.team !== c.team))
    const enemies = w.enemyHeroesNear(c, 900).length > 0
    if (c.hp < c.st.maxHp * 0.55 && enemies) return !w.orderCast(c, st, c, c.x, c.y)
    if (hasDebuff && enemies) return !w.orderCast(c, st, c, c.x, c.y)
    const ally = w.heroes
      .filter((h) => h.team === c.team && h !== c && !h.dead && dist(h, c) < 650 && h.hp < h.st.maxHp * 0.5 && w.enemyHeroesNear(h, 800).length)
      .sort((a, b) => a.hp - b.hp)[0]
    if (ally) return !w.orderCast(c, st, ally, ally.x, ally.y)
    return false
  },
}

const MOMENT_OF_COURAGE: AbilityDef = {
  id: 'legion_courage', name: 'Moment of Courage', glyph: '✦', color: '#d8d8f0',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'When attacked, Legion Commander has a chance to immediately counterattack with bonus attack speed and lifesteal.',
  info: (l) => ['Chance: 25%', `Lifesteal: ${L([55, 65, 75, 85], l)}%`, 'Attack speed: +1000 for 1s', `Internal cooldown: ${L([1.9, 1.5, 1.1, 0.7], l)}s`],
  onAttacked(w, v, a, l, st) {
    if (v.dead || w.time < (st.extra.cd || 0) || Math.random() >= 0.25) return
    st.extra.cd = w.time + L([1.9, 1.5, 1.1, 0.7], l)
    st.extra.lsUntil = w.time + 1
    w.addBuff(v, { id: 'courage_as', expires: w.time + 1, as: 1000, color: '#d8d8f0', label: 'Moment of Courage' })
    w.text(v.x, v.y - 90, 'COUNTER!', '#d8d8f0')
    w.vfx('legion_counter', { x: v.x, y: v.y, unit: v, angle: Math.atan2(a.y - v.y, a.x - v.x) })
    if (!a.dead && dist(v, a) <= v.st.range + v.radius + a.radius + 60) w.applyAttack(v, a)
  },
  onAttackHit(w, a, t, l, st) {
    if (w.time < (st.extra.lsUntil || 0)) {
      w.heal(a, a.st.dmg * armorRed(w, t) * L([0.55, 0.65, 0.75, 0.85], l))
      w.vfx('legion_lifesteal', { x: t.x, y: t.y, unit: a })
    }
    return 0
  },
}

const DUEL: AbilityDef = {
  id: 'legion_duel', name: 'Duel', glyph: '⚔', color: '#ffb040',
  behavior: 'unit', target: 'enemy', heroOnly: true, range: [200, 250, 300], castPoint: 0.3, cd: [60, 55, 50], mana: same(3, 75), maxLevel: 3, ult: true,
  desc: 'Legion Commander and the target enemy hero are forced to attack each other and cannot use abilities. The winner of the Duel gains permanent bonus damage (it carries on while Duel is learned).',
  info: (l) => [`Duration: ${L([3.75, 4.5, 5.25], l)}s`, `Winner bonus damage: +${L([10, 20, 30], l)} permanently`, `Range: ${L([200, 250, 300], l)}`],
  cast(w, c, l, t, st) {
    const tg = t.unit!
    if (tg.dead) return
    const dur = L([3.75, 4.5, 5.25], l)
    const end = w.time + dur
    w.interrupt(tg, true)
    w.interrupt(c, true)
    w.addBuff(tg, { id: 'duel', expires: end, taunt: c, silence: true, src: c, color: '#ffb040', label: 'Duel' })
    w.addBuff(c, { id: 'duel', expires: end, taunt: tg, silence: true, src: c, color: '#ffb040', label: 'Duel' })
    st.extra.duel = { target: tg, end, bonus: L([10, 20, 30], l) }
    w.vfx('legion_duel', { x: (c.x + tg.x) / 2, y: (c.y + tg.y) / 2, unit: c, unit2: tg, dur })
  },
  tick(w, c, l, dt, st) {
    const d = st.extra.duel as { target: Unit; end: number; bonus: number } | undefined
    if (!d) return
    const over = w.time >= d.end
    if (!c.dead && !d.target.dead && !over) return
    st.extra.duel = undefined
    w.removeBuff(c, 'duel')
    w.removeBuff(d.target, 'duel')
    if (d.target.dead && !c.dead) {
      st.extra.bonus = (st.extra.bonus || 0) + d.bonus
      w.text(c.x, c.y - 100, `Duel won +${d.bonus}`, '#ffb040')
    }
    const won = d.target.dead && !c.dead
    w.vfx('legion_duel_end', { x: won ? c.x : (c.x + d.target.x) / 2, y: won ? c.y : (c.y + d.target.y) / 2, win: won })
  },
  onAttackHit(w, a, t, l, st) {
    return st.extra.bonus || 0
  },
  ai(w, c, st, l) {
    const t = heroesNear(w, c, L([200, 250, 300], l) + 100).filter((u) => !u.isStunned()).sort((a, b) => b.hp - a.hp)[0]
    if (t && c.hp > c.st.maxHp * 0.45 && w.enemyHeroesNear(c, 800).length <= 2) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/* ----------------------------------------------------------------- HEROES */

export const HEROES_G1: HeroDef[] = [
  {
    id: 'sven', name: 'Sven', title: 'Rogue Knight', attr: 'str',
    str: 22, strG: 3.2, agi: 21, agiG: 2.2, int: 16, intG: 1.5, hpRegen: 0.75, manaRegen: 0,
    baseDmg: 38.0, armor: -1, ms: 325, range: 150, bat: 1.9, ap: 0.4, projSpeed: 0, radius: 40,
    color: '#4a6ea8', color2: '#8a2a2a', roles: ['Carry', 'Disabler', 'Initiator', 'Durable'],
    lore: 'Bastard son of a Vigil Knight, Sven is an outcast who wields a stolen blade and cleaves through any who stand between him and honor.',
    abilities: [STORM_HAMMER, GREAT_CLEAVE, WARCRY, GODS_STRENGTH],
    skillOrder: [0, 1, 0, 2, 0, 3, 0, 1, 1, 1, 3, 2, 2, 2, 3],
    buy: ['boots', 'broadsword', 'gloves', 'chainmail', 'vitality', 'blink'],
  },
  {
    id: 'juggernaut', name: 'Juggernaut', title: 'The Masked Blade', attr: 'agi',
    str: 20, strG: 2.2, agi: 34, agiG: 2.8, int: 14, intG: 1.4, hpRegen: 0.5, manaRegen: 0,
    baseDmg: 21.0, armor: 0, ms: 300, range: 150, bat: 1.4, ap: 0.33, projSpeed: 0, radius: 36,
    color: '#d89a2a', color2: '#7a3a1a', roles: ['Carry', 'Pusher', 'Escape'],
    lore: 'Yurnero the Juggernaut, last of his blademasters from the Isle of Masks, hides his face behind a mask and lets only his katana speak.',
    abilities: [BLADE_FURY, HEALING_WARD, BLADE_DANCE, OMNISLASH],
    skillOrder: [0, 2, 0, 1, 0, 3, 0, 2, 2, 2, 3, 1, 1, 1, 3],
    buy: ['boots', 'gloves', 'blades', 'alacrity', 'broadsword', 'chainmail'],
  },
  {
    id: 'legion_commander', name: 'Legion Commander', title: 'Tresdin', attr: 'str',
    str: 23, strG: 3.1, agi: 18, agiG: 1.7, int: 20, intG: 2.2, hpRegen: 0.25, manaRegen: 0,
    baseDmg: 35.0, armor: 0, ms: 325, range: 150, bat: 1.7, ap: 0.46, projSpeed: 0, radius: 36,
    color: '#c8382a', color2: '#e0b040', roles: ['Carry', 'Disabler', 'Initiator', 'Durable'],
    lore: 'Tresdin of the Bronze Legion fights at the head of an army of one, and nobody who challenges her walks away from the duel.',
    abilities: [OVERWHELMING_ODDS, PRESS_THE_ATTACK, MOMENT_OF_COURAGE, DUEL],
    skillOrder: [1, 0, 2, 1, 2, 3, 2, 1, 1, 2, 3, 0, 0, 0, 3],
    buy: ['boots', 'gloves', 'broadsword', 'chainmail', 'blades', 'vitality'],
  },
]
