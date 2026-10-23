import type { AbilityDef, HeroDef, Unit } from './entities'
import type { World } from './world'
import { dist } from './constants'
import { L, ang, same, heroesNear, predict } from './abkit'

/** New heroes (g3): Crystal Maiden, Pugna, Silencer. */


/* ================================================================== CRYSTAL MAIDEN */

const NOVA_DMG = [110, 160, 210, 260]
const NOVA_SLOW = [0.2, 0.3, 0.4, 0.5]
const NOVA_AS = [30, 45, 60, 75]

const CM_CRYSTAL_NOVA: AbilityDef = {
  id: 'crystal_maiden_crystal_nova', name: 'Crystal Nova', glyph: '❄', color: '#9fe0ff',
  behavior: 'point', range: same(4, 700), castPoint: 0.3, cd: [11, 10, 9, 8], mana: [115, 135, 155, 175], maxLevel: 4,
  desc: 'A burst of damaging frost slows enemy movement and attack rate in the targeted area.',
  info: (l) => [
    `Damage: ${L(NOVA_DMG, l)}`, 'Radius: 425', `Move speed slow: ${Math.round(L(NOVA_SLOW, l) * 100)}%`,
    `Attack speed slow: ${L(NOVA_AS, l)}`, 'Slow duration: 5s',
  ],
  cast(w, c, l, t) {
    w.vfx('crystal_maiden_nova', { x: t.x, y: t.y, r: 425 })
    for (const e of w.enemiesIn(c.team, t.x, t.y, 425)) {
      w.damage(c, e, L(NOVA_DMG, l), 'magical', { spell: true, abilityId: 'crystal_maiden_crystal_nova' })
      w.addBuff(e, {
        id: 'cm_nova', expires: w.time + 5, slow: L(NOVA_SLOW, l), as: -L(NOVA_AS, l), src: c, color: '#9fe0ff', label: 'Crystal Nova',
      })
    }
  },
  ai(w, c, st) {
    const hs = heroesNear(w, c, 700).sort((a, b) => dist(a, c) - dist(b, c))
    if (hs.length) {
      const p = predict(c, hs[0], 99999, 0)
      return !w.orderCast(c, st, undefined, p.x + hs[0].vx * 0.4, p.y + hs[0].vy * 0.4)
    }
    const cr = w.enemiesIn(c.team, c.x, c.y, 650).filter((u) => u.kind === 'creep')
    if (cr.length >= 4 && c.mana > c.st.maxMana * 0.6) return !w.orderCast(c, st, undefined, cr[0].x, cr[0].y)
    return false
  },
}

const FROST_DUR = [1.5, 2, 2.5, 3]

const CM_FROSTBITE: AbilityDef = {
  id: 'crystal_maiden_frostbite', name: 'Frostbite', glyph: '✱', color: '#bfeaff',
  behavior: 'unit', target: 'enemy', range: same(4, 600), castPoint: 0.3, cd: [9, 8, 7, 6], mana: [125, 135, 145, 155], maxLevel: 4,
  desc: 'Encases an enemy unit in ice, prohibiting movement and attack, while dealing damage over time. Lasts 10 seconds on creeps.',
  info: (l) => ['Damage per second: 100', `Hero duration: ${L(FROST_DUR, l)}s`, 'Creep duration: 10s', 'Root + disarm'],
  cast(w, c, l, t) {
    const tg = t.unit!
    const dur = tg.kind === 'hero' ? L(FROST_DUR, l) : 10
    w.addBuff(tg, {
      id: 'frostbite', expires: w.time + dur, root: true, disarm: true, src: c,
      dot: { dps: 100, type: 'magical', abilityId: 'crystal_maiden_frostbite' }, color: '#bfeaff', label: 'Frostbite',
    })
    w.vfx('crystal_maiden_frostbite', { x: tg.x, y: tg.y, x2: c.x, y2: c.y, unit: tg, dur })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 600).filter((u) => !u.hasBuff('frostbite') && !u.isStunned()).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const AURA_REGEN = [0.4, 0.6, 0.8, 1]

const CM_ARCANE_AURA: AbilityDef = {
  id: 'crystal_maiden_arcane_aura', name: 'Arcane Aura', glyph: '✧', color: '#7fb8ff',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Gives additional mana regeneration to all allied heroes on the map. Allies near Crystal Maiden receive triple the bonus, and Crystal Maiden herself receives seven times the bonus.',
  info: (l) => [`Mana regeneration: +${L(AURA_REGEN, l)}/s (global)`, 'Within 1200 of Crystal Maiden: x3', 'Crystal Maiden herself: x7'],
  tick(w, c, l, dt, st) {
    if (c.dead) return
    // visual: soft mana motes every ~1.6 s, motes drifting to nearby allies, rare wide pulse
    st.extra.fxT = (st.extra.fxT || 0) + dt
    if (st.extra.fxT >= 1.6) {
      st.extra.fxT = 0
      st.extra.fxN = (st.extra.fxN || 0) + 1
      w.vfx('crystal_maiden_aura', { unit: c, x: c.x, y: c.y, mode: 'self' })
      if (st.extra.fxN % 2 === 0) {
        for (const h of w.heroes) if (h !== c && !h.dead && h.team === c.team && dist(h, c) <= 1200) w.vfx('crystal_maiden_aura', { unit: c, ally: h, x: h.x, y: h.y, mode: 'ally' })
      }
      if (st.extra.fxN % 6 === 0) w.vfx('crystal_maiden_aura', { unit: c, x: c.x, y: c.y, mode: 'pulse', r: 1200 })
    }
    const base = L(AURA_REGEN, l)
    for (const h of w.heroes) {
      if (h.dead || h.team !== c.team) continue
      const f = h === c ? 7 : dist(h, c) <= 1200 ? 3 : 1
      w.addBuff(h, { id: 'cm_aura_' + c.id, expires: w.time + 0.3, regenMana: base * f })
    }
  },
}

const FF_DMG = [105, 170, 250]

const CM_FREEZING_FIELD: AbilityDef = {
  id: 'crystal_maiden_freezing_field', name: 'Freezing Field', glyph: '❆', color: '#7fd4ff',
  behavior: 'none', castPoint: 0, cd: [100, 95, 90], mana: [200, 400, 600], maxLevel: 3, ult: true,
  desc: 'Surrounds Crystal Maiden with 100 random icy explosions that slow enemies and deal massive damage. Grants bonus armor while channeling. Lasts 10 seconds.',
  info: (l) => [
    `Damage per explosion: ${L(FF_DMG, l)}`, 'Explosion radius: 320', 'Slow radius: 810', 'Slow: 40% move, 60 attack speed',
    'Bonus armor while channeling: +20', 'Channel: 10s',
  ],
  cast(w, c, l, _t, st) {
    const dmg = L(FF_DMG, l)
    const dur = 10
    let acc = 0
    w.vfx('crystal_maiden_blizzard', { unit: c, x: c.x, y: c.y, dur, r: 800 })
    let hitN = 0
    w.addBuff(c, { id: 'ff_armor', expires: w.time + dur + 0.2, armor: 20, color: '#7fd4ff', label: 'Freezing Field' })
    c.channel = {
      st, until: w.time + dur,
      tick: (dt) => {
        acc += dt
        while (acc >= 0.1) {
          acc -= 0.1
          const a = Math.random() * Math.PI * 2
          const r = Math.sqrt(195 * 195 + Math.random() * (785 * 785 - 195 * 195))
          const x = c.x + Math.cos(a) * r
          const y = c.y + Math.sin(a) * r
          if (hitN++ % 3 === 0) w.vfx('crystal_maiden_ffhit', { x, y, r: 320 })
          for (const e of w.enemiesIn(c.team, x, y, 320)) {
            w.damage(c, e, dmg, 'magical', { spell: true, abilityId: 'crystal_maiden_freezing_field', quiet: true })
          }
        }
        for (const e of w.enemiesIn(c.team, c.x, c.y, 810)) {
          w.addBuff(e, { id: 'ff_slow', expires: w.time + 1, slow: 0.4, as: -60, src: c, color: '#7fd4ff', label: 'Freezing Field' })
        }
      },
      end: () => w.removeBuff(c, 'ff_armor'),
    }
  },
  ai(w, c, st) {
    if (c.hp < c.st.maxHp * 0.4) return false
    const hs = heroesNear(w, c, 700)
    if (hs.length >= 2 || (hs.length === 1 && hs[0].hp < hs[0].st.maxHp * 0.65)) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

/* ================================================================== PUGNA */

const NB_DMG = [100, 180, 260, 340]

const PUGNA_NETHER_BLAST: AbilityDef = {
  id: 'pugna_nether_blast', name: 'Nether Blast', glyph: '✺', color: '#6fe05a',
  behavior: 'point', range: same(4, 600), castPoint: 0.2, cd: same(4, 5), mana: [100, 115, 130, 145], maxLevel: 4,
  desc: 'An exploding pulse of emerald flame deals damage to enemies in the area after a short delay. Structures take reduced damage.',
  info: (l) => [`Damage: ${L(NB_DMG, l)}`, 'Radius: 400', 'Delay: 0.8s', 'Structure damage: 65%'],
  cast(w, c, l, t) {
    const x = t.x
    const y = t.y
    w.vfx('pugna_nether_blast_charge', { x, y, r: 400, dur: 0.8 })
    w.after(0.8, () => {
      w.vfx('pugna_nether_blast_hit', { x, y, r: 400 })
      for (const e of w.enemiesIn(c.team, x, y, 400, { buildings: true })) {
        w.damage(c, e, L(NB_DMG, l) * (e.isBuilding ? 0.65 : 1), 'magical', { spell: true, abilityId: 'pugna_nether_blast' })
      }
    })
  },
  ai(w, c, st) {
    const hs = heroesNear(w, c, 700).sort((a, b) => dist(a, c) - dist(b, c))
    if (hs.length) {
      const d = dist(c, hs[0])
      const p = predict(c, hs[0], 99999, 0)
      const lx = p.x + hs[0].vx * 0.8
      const ly = p.y + hs[0].vy * 0.8
      if (d < 740) return !w.orderCast(c, st, undefined, lx, ly)
    }
    const cr = w.enemiesIn(c.team, c.x, c.y, 650).filter((u) => u.kind === 'creep')
    if (cr.length >= 4 && c.mana > c.st.maxMana * 0.5) return !w.orderCast(c, st, undefined, cr[0].x, cr[0].y)
    return false
  },
}

const DEC_RANGE = [475, 550, 625, 700]
const DEC_SLOW = [0.45, 0.5, 0.55, 0.6]

const PUGNA_DECREPIFY: AbilityDef = {
  id: 'pugna_decrepify', name: 'Decrepify', glyph: '☁', color: '#9ad88a',
  behavior: 'unit', target: 'any', range: DEC_RANGE, castPoint: 0.2, cd: [16, 13, 10, 7], mana: same(4, 80), maxLevel: 4,
  desc: 'A powerful banishing spell that slows a unit and renders it unable to attack or be attacked by physical damage. Afflicted units take extra magic damage. Can be cast on allies or on Pugna himself.',
  info: (l) => [`Cast range: ${L(DEC_RANGE, l)}`, `Enemy slow: ${Math.round(L(DEC_SLOW, l) * 100)}%`, 'Duration: 3.5s', 'Takes +40% magic damage, immune to physical damage'],
  cast(w, c, l, t) {
    const tg = t.unit!
    const enemy = tg.team !== c.team
    w.interrupt(tg)
    w.addBuff(tg, {
      id: 'decrepify', expires: w.time + 3.5, ethereal: true, disarm: true, src: c,
      slow: enemy ? L(DEC_SLOW, l) : undefined, color: '#9ad88a', label: 'Decrepify',
    })
    w.vfx('pugna_decrepify', tg === c ? { x: tg.x, y: tg.y, unit: tg, dur: 3.5 } : { x: tg.x, y: tg.y, x2: c.x, y2: c.y, unit: tg, dur: 3.5 })
  },
  ai(w, c, st, l) {
    const near = heroesNear(w, c, 650)
    if (c.hp < c.st.maxHp * 0.4 && near.length && !c.hasBuff('decrepify')) return !w.orderCast(c, st, c, c.x, c.y)
    const t = near.filter((u) => dist(u, c) <= L(DEC_RANGE, l) && !u.hasBuff('decrepify') && u.hp < u.st.maxHp * 0.7 && dist(u, c) > 300)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const WARD_BASE = [50, 70, 90, 110]
const WARD_MULT = [1, 1.2, 1.4, 1.6]
const WARD_LIFE = [18, 22, 26, 30]

const PUGNA_NETHER_WARD: AbilityDef = {
  id: 'pugna_nether_ward', name: 'Nether Ward', glyph: '♆', color: '#4ad88a',
  behavior: 'point', range: same(4, 150), castPoint: 0.2, cd: same(4, 40), mana: same(4, 80), maxLevel: 4,
  desc: 'Places a Nether Ward at the target location. The ward fires at any enemy hero within range who spends mana on a spell, dealing base damage plus a multiple of the mana spent.',
  info: (l) => [
    `Base damage: ${L(WARD_BASE, l)}`, `Damage per mana spent: ${L(WARD_MULT, l)}`, 'Radius: 1400', `Duration: ${L(WARD_LIFE, l)}s`, 'Destroyed in 4 hero attacks',
  ],
  cast(w, c, l, t, st) {
    const old: Unit | undefined = st.extra.ward
    if (old && !old.dead) {
      old.dead = true
      old.deadAt = w.time
    }
    const base = L(WARD_BASE, l)
    const mult = L(WARD_MULT, l)
    const ward = w.spawnSummon({
      team: c.team, owner: c, sub: 'nether_ward', name: 'Nether Ward', x: t.x, y: t.y, hp: 320, radius: 30, life: L(WARD_LIFE, l), color: '#4ad88a',
      tick: (_w, u) => {
        const pm: Record<number, number> = (u.extra.pm ||= {})
        if (w.time - (u.extra.fxT || 0) > 0.7) {
          u.extra.fxT = w.time
          w.vfx('pugna_ward_ambient', { x: u.x, y: u.y })
        }
        for (const e of w.enemiesIn(u.team, u.x, u.y, 1400)) {
          if (e.kind !== 'hero') continue
          const prev = pm[e.id]
          if (prev !== undefined && e.mana < prev - 0.5) {
            const spent = prev - e.mana
            w.vfx('pugna_ward_zap', { x: u.x, y: u.y, x2: e.x, y2: e.y })
            w.damage(c, e, base + mult * spent, 'magical', { spell: true, abilityId: 'pugna_nether_ward' })
          }
          pm[e.id] = e.mana
        }
      },
    })
    st.extra.ward = ward
    w.vfx('pugna_ward_summon', { x: t.x, y: t.y })
  },
  ai(w, c, st) {
    if (st.extra.ward && !st.extra.ward.dead) return false
    const t = heroesNear(w, c, 1100).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (!t) return false
    const a = ang(c, t)
    return !w.orderCast(c, st, undefined, c.x + Math.cos(a) * 90, c.y + Math.sin(a) * 90)
  },
}

const LD_DPS = [160, 240, 320]
const LD_HEAL = [120, 210, 300]

const PUGNA_LIFE_DRAIN: AbilityDef = {
  id: 'pugna_life_drain', name: 'Life Drain', glyph: '☥', color: '#c8f05a',
  behavior: 'unit', target: 'any', range: same(3, 700), castPoint: 0.2, cd: same(3, 7), mana: [100, 150, 200], maxLevel: 3, ult: true,
  desc: 'Drains health from an enemy unit to heal Pugna. If Pugna is at full health and the target is a hero, mana is restored instead. On an ally, Pugna drains his own health into them. Channeled up to 10 seconds; breaks if the link stretches beyond 900.',
  info: (l) => [`Damage per second: ${L(LD_DPS, l)}`, `Heal per second: ${L(LD_HEAL, l)}`, 'Mana restore at full health: 50%', 'Break distance: 900', 'Channel: 10s'],
  canCast(w, c, t) {
    if (t.unit === c) return 'Cannot target yourself'
    return null
  },
  cast(w, c, l, t, st) {
    const tg = t.unit!
    const ally = tg.team === c.team
    const dps = L(LD_DPS, l)
    const hps = L(LD_HEAL, l)
    let acc = 0
    let pulses = 0
    w.vfx('pugna_drain_start', { unit: c, unit2: tg, x: c.x, y: c.y })
    c.channel = {
      st, until: w.time + 10, target: tg,
      tick: (dt) => {
        if (tg.dead || tg.isInvulnerable() || dist(c, tg) > 900 || (!ally && !w.isVisible(c.team, tg) && dist(c, tg) > 700)) {
          c.channel!.until = 0
          return
        }
        if (ally) {
          w.damage(c, c, hps * dt, 'pure', { nonLethal: true, quiet: true, self: true })
          w.heal(tg, hps * dt)
        } else {
          const dealt = w.damage(c, tg, dps * dt, 'pure', { spell: true, abilityId: 'pugna_life_drain', quiet: true })
          if (c.hp >= c.st.maxHp - 1 && tg.kind === 'hero') c.mana = Math.min(c.st.maxMana, c.mana + dealt * 0.5)
          else w.heal(c, hps * dt)
        }
        acc += dt
        if (acc >= 0.25) {
          acc = 0
          w.vfx('pugna_drain_pulse', { unit: c, unit2: tg, ally, x: c.x, y: c.y, orbs: pulses++ % 2 === 0 })
        }
      },
      end: () => {},
    }
  },
  ai(w, c, st) {
    const hs = heroesNear(w, c, 650).sort((a, b) => a.hp - b.hp)
    const t = hs[0]
    if (!t) return false
    const hurt = c.hp < c.st.maxHp * 0.85 || c.mana < c.st.maxMana * 0.4
    if ((hurt || t.hp < t.st.maxHp * 0.4) && hs.length <= 2) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/* ================================================================== SILENCER */

const CURSE_INIT = [20, 40, 60, 80]
const CURSE_DPS = [16, 24, 32, 40]
const CURSE_SLOW = [0.1, 0.15, 0.2, 0.25]

function applyCurse(w: World, c: Unit, tg: Unit, l: number) {
  const tok = (tg.extra.curseTok = (tg.extra.curseTok || 0) + 1)
  let remaining = 6
  let prevMana = tg.mana
  let steps = 0
  const step = () => {
    if (tg.dead || tg.extra.curseTok !== tok) return
    const dt = 0.25
    if (remaining <= 0) {
      w.removeBuff(tg, 'silencer_curse')
      w.vfx('silencer_curse_end', { unit: tg, x: tg.x, y: tg.y })
      return
    }
    if (steps++ % 4 === 0) w.vfx('silencer_curse_wisp', { unit: tg, x: tg.x, y: tg.y, dur: 1.1 })
    const silenced = tg.isSilenced()
    const f = silenced ? 1.5 : 1
    if (tg.mana < prevMana - 0.5) remaining += 2
    prevMana = tg.mana
    if (!silenced) remaining -= dt
    w.damage(c, tg, L(CURSE_DPS, l) * f * dt, 'magical', { spell: true, abilityId: 'silencer_curse', quiet: true })
    w.addBuff(tg, { id: 'silencer_curse', expires: w.time + 0.5, slow: Math.min(0.9, L(CURSE_SLOW, l) * f), src: c, color: '#a070e0', label: 'Arcane Curse' })
    w.after(dt, step)
  }
  step()
}

const SIL_ARCANE_CURSE: AbilityDef = {
  id: 'silencer_curse', name: 'Arcane Curse', glyph: '☾', color: '#a070e0',
  behavior: 'point', range: same(4, 1000), castPoint: 0.3, cd: [22, 20, 18, 16], mana: [130, 135, 140, 145], maxLevel: 4,
  desc: 'Curses an area, dealing damage and causing enemy heroes to take damage over time and be slowed. Silenced enemies take 1.5x slow and damage. The curse lasts 6 seconds, is extended by 2 seconds whenever the target casts a spell, and is paused while the target is silenced.',
  info: (l) => [
    `Initial damage: ${L(CURSE_INIT, l)}`, `Damage per second: ${L(CURSE_DPS, l)}`, `Slow: ${Math.round(L(CURSE_SLOW, l) * 100)}%`, 'Radius: 350', 'Duration: 6s (+2s per spell cast)',
  ],
  cast(w, c, l, t) {
    w.vfx('silencer_curse_cast', { x: t.x, y: t.y, r: 350 })
    for (const e of w.enemiesIn(c.team, t.x, t.y, 350)) {
      w.damage(c, e, L(CURSE_INIT, l), 'magical', { spell: true, abilityId: 'silencer_curse' })
      if (e.kind === 'hero') {
        w.vfx('silencer_curse_hit', { unit: e, x: e.x, y: e.y })
        applyCurse(w, c, e, l)
      }
    }
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 1000).filter((u) => !u.hasBuff('silencer_curse')).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (t) {
      const p = predict(c, t, 99999, 0)
      return !w.orderCast(c, st, undefined, p.x + t.vx * 0.5, p.y + t.vy * 0.5)
    }
    return false
  },
}

const GL_PCT = [0.2, 0.4, 0.6, 0.8]
const GL_STEAL = [1, 1, 2, 3]
const GL_TIME = [20, 25, 30, 35]
const GL_COST = 20

const SIL_GLAIVES: AbilityDef = {
  id: 'silencer_glaives', name: 'Glaives of Wisdom', glyph: '✦', color: '#c8b0f0',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Silencer enchants his glaives with wisdom: attacks (while he has the mana) deal bonus pure damage based on his Intelligence and steal intelligence from the target. Killing an enemy hero nearby permanently steals 2 intelligence.',
  info: (l) => [
    `Bonus damage: ${Math.round(L(GL_PCT, l) * 100)}% of Intelligence`, `Intelligence stolen per hit: ${L(GL_STEAL, l)} for ${L(GL_TIME, l)}s`,
    `Mana per attack: ${GL_COST}`, 'Permanent steal on hero kill: 2',
  ],
  stats(c, l, s, st) {
    const temps: { exp: number; amt: number }[] = st.extra.temps || []
    let n = st.extra.perm || 0
    for (const t of temps) n += t.amt
    s.int += n
  },
  tick(w, c, l, dt, st) {
    const temps: { exp: number; amt: number }[] | undefined = st.extra.temps
    if (temps && temps.length) st.extra.temps = temps.filter((t) => t.exp > w.time)
  },
  onAttackHit(w, a, t, l, st) {
    if (a.mana < GL_COST || t.isBuilding) return 0
    a.mana -= GL_COST
    w.vfx('silencer_glaive_hit', { unit: a, unit2: t, x: t.x, y: t.y, steal: t.kind === 'hero' })
    w.damage(a, t, a.st.int * L(GL_PCT, l), 'pure', { abilityId: 'silencer_glaives' })
    if (t.kind === 'hero') {
      const temps: { exp: number; amt: number }[] = (st.extra.temps ||= [])
      temps.push({ exp: w.time + L(GL_TIME, l), amt: L(GL_STEAL, l) })
      if (temps.length > 30) temps.shift()
    }
    return 0
  },
  onEnemyHeroDeath(w, owner, victim, killer, l, st) {
    if (killer === owner || dist(owner, victim) <= 925) {
      st.extra.perm = (st.extra.perm || 0) + 2
      w.text(owner.x, owner.y - 90, '+2 Int', '#c8b0f0')
    }
  },
}

const LW_BASE = [120, 160, 200, 240]
const LW_MULT = [1, 1.5, 2, 2.5]
const LW_SIL = [3, 4, 5, 6]

const SIL_LAST_WORD: AbilityDef = {
  id: 'silencer_last_word', name: 'Last Word', glyph: '✎', color: '#b890e8',
  behavior: 'unit', target: 'enemy', range: same(4, 900), castPoint: 0.3, cd: [22, 18, 14, 10], mana: [100, 105, 110, 115], maxLevel: 4,
  desc: 'Enchants a target for 4 seconds. If it casts a spell or the timer expires, it takes damage (plus a bonus based on how much more Intelligence Silencer has) and is silenced.',
  info: (l) => [
    `Base damage: ${L(LW_BASE, l)}`, `Bonus: ${L(LW_MULT, l)} x Intelligence difference`, 'Trigger timer: 4s', `Silence: ${L(LW_SIL, l)}s`,
  ],
  cast(w, c, l, t) {
    const tg = t.unit!
    const tok = (tg.extra.lastWordTok = (tg.extra.lastWordTok || 0) + 1)
    const end = w.time + 4
    let prev = tg.mana
    w.addBuff(tg, { id: 'silencer_last_word', expires: end, src: c, color: '#b890e8', label: 'Last Word' })
    w.vfx('silencer_lastword_mark', { unit: tg, x: tg.x, y: tg.y, dur: 4 })
    const poll = () => {
      if (tg.dead || tg.extra.lastWordTok !== tok) return
      if (tg.mana < prev - 0.5 || w.time >= end - 0.01) {
        w.removeBuff(tg, 'silencer_last_word')
        const diff = Math.max(0, c.st.int - tg.st.int)
        w.vfx('silencer_lastword_hit', { unit: tg, x: tg.x, y: tg.y, dur: Math.min(1.6, L(LW_SIL, l)) })
        w.damage(c, tg, L(LW_BASE, l) + L(LW_MULT, l) * diff, 'magical', { spell: true, abilityId: 'silencer_last_word' })
        if (!tg.dead) {
          w.interrupt(tg)
          w.addBuff(tg, { id: 'last_word_silence', expires: w.time + L(LW_SIL, l), silence: true, src: c, color: '#b890e8', label: 'Silenced' })
        }
        return
      }
      prev = tg.mana
      w.after(0.1, poll)
    }
    w.after(0.1, poll)
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 900).filter((u) => !u.hasBuff('silencer_last_word') && !u.isSilenced()).sort((a, b) => b.mana - a.mana)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const GS_DUR = [4.5, 5.25, 6]

const SIL_GLOBAL_SILENCE: AbilityDef = {
  id: 'silencer_global_silence', name: 'Global Silence', glyph: '⛔', color: '#d0b8ff',
  behavior: 'none', castPoint: 0.3, cd: [130, 115, 100], mana: [300, 450, 600], maxLevel: 3, ult: true,
  desc: 'Stops all sound, preventing every enemy hero on the map from casting spells and interrupting their channels.',
  info: (l) => [`Duration: ${L(GS_DUR, l)}s`, 'Radius: global'],
  cast(w, c, l) {
    const dur = L(GS_DUR, l)
    w.vfx('silencer_global_cast', { x: c.x, y: c.y, unit: c, r: 2400 })
    for (const h of w.heroes) {
      if (h.team === c.team || h.dead) continue
      if (h.channel || h.casting) w.interrupt(h)
      w.addBuff(h, { id: 'silence_global', expires: w.time + dur, silence: true, src: c, color: '#d0b8ff', label: 'Global Silence' })
      w.vfx('silencer_global_mark', { unit: h, x: h.x, y: h.y, dur })
    }
  },
  ai(w, c, st) {
    const hs = heroesNear(w, c, 1100)
    const chan = w.heroes.some((h) => h.team !== c.team && !h.dead && h.channel && dist(h, c) < 1800)
    if (hs.length >= 2 || chan) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

/* ================================================================== HEROES */

export const HEROES_G3: HeroDef[] = [
  {
    id: 'crystal_maiden', name: 'Crystal Maiden', title: 'Rylai the Frost Mage', attr: 'int',
    str: 17, strG: 2.2, agi: 16, agiG: 1.6, int: 18, intG: 3.3, hpRegen: 0.25, manaRegen: 0.5,
    baseDmg: 33.0, armor: 0, ms: 280, range: 600, bat: 1.7, ap: 0.45, projSpeed: 900, radius: 34,
    color: '#8fd0ff', color2: '#2a5aa0', roles: ['Support', 'Disabler', 'Nuker'],
    lore: 'Exiled to the wastes of Icewrack, Rylai channels the cold of the Blueheart Glacier to freeze her foes and fuel her allies.',
    abilities: [CM_CRYSTAL_NOVA, CM_FROSTBITE, CM_ARCANE_AURA, CM_FREEZING_FIELD],
    skillOrder: [1, 0, 1, 2, 1, 3, 1, 0, 0, 0, 3, 2, 2, 2, 3],
    buy: ['boots', 'clarity', 'staff', 'energy', 'staff', 'blink'],
  },
  {
    id: 'pugna', name: 'Pugna', title: 'Oblivion', attr: 'int',
    str: 19, strG: 2, agi: 21, agiG: 1.3, int: 27, intG: 5.2, hpRegen: 0.25, manaRegen: 0.5,
    baseDmg: 24.5, armor: 0, ms: 330, range: 630, bat: 1.7, ap: 0.5, projSpeed: 900, radius: 34,
    color: '#5a9a48', color2: '#1e3a1a', roles: ['Nuker', 'Pusher'],
    lore: 'A demonic warlock of the Nether Reaches who banishes, drains and detonates his enemies with the Arts of Oblivion.',
    abilities: [PUGNA_NETHER_BLAST, PUGNA_DECREPIFY, PUGNA_NETHER_WARD, PUGNA_LIFE_DRAIN],
    skillOrder: [0, 2, 0, 1, 0, 3, 0, 2, 2, 2, 3, 1, 1, 1, 3],
    buy: ['boots', 'clarity', 'staff', 'energy', 'staff', 'blink'],
  },
  {
    id: 'silencer', name: 'Silencer', title: 'Nortrom', attr: 'int',
    str: 19, strG: 2.2, agi: 22, agiG: 2.4, int: 25, intG: 2.9, hpRegen: 0.25, manaRegen: 0,
    baseDmg: 25.0, armor: 0, ms: 290, range: 600, bat: 1.6, ap: 0.5, projSpeed: 900, radius: 34,
    color: '#8a80a8', color2: '#3a2a5a', roles: ['Carry', 'Support', 'Disabler'],
    lore: 'Nortrom of the Aeol Drias needs no incantations, and ensures that every spell his enemies speak will be their last.',
    abilities: [SIL_ARCANE_CURSE, SIL_GLAIVES, SIL_LAST_WORD, SIL_GLOBAL_SILENCE],
    skillOrder: [1, 0, 1, 2, 1, 3, 1, 0, 0, 0, 3, 2, 2, 2, 3],
    buy: ['boots', 'clarity', 'staff', 'ogre', 'energy', 'blink'],
  },
]
