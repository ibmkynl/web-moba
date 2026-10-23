import { AbilityDef, AbilityState, Unit } from './entities'
import { dist } from './constants'

import { L, ang, same, heroesNear } from './abkit'

/* ------------------------------------------------------------------ PUDGE */

export const MEAT_HOOK: AbilityDef = {
  id: 'pudge_hook', name: 'Meat Hook', glyph: '⚓', color: '#b83a3a',
  aim: { line: { len: 1300, width: 180 } },
  behavior: 'point', range: same(4, 1300), castPoint: 0.3, cd: [18, 16, 14, 12], mana: same(4, 110), maxLevel: 4,
  desc: 'Launches a bloody hook toward a location. It snags the first enemy unit in its path and drags it back to Pudge. Enemy heroes take damage; non-ancient creeps are killed outright.',
  info: (l) => [`Damage: ${L([150, 220, 290, 360], l)}`, 'Range: 1300', 'Hook radius: 100'],
  cast(w, c, l, t) {
    const a = t.x === c.x && t.y === c.y ? c.facing : ang(c, t)
    c.facing = a
    w.vfx('pudge_hook_cast', { x: c.x, y: c.y, angle: a })
    const dmg = L([150, 220, 290, 360], l)
    w.spawnLinear({
      owner: c, x: c.x, y: c.y, angle: a, speed: 1600, range: 1300, radius: 100, draw: 'hook',
      filter: (u) => u.team !== c.team && (u.kind === 'hero' || u.kind === 'creep') && !u.isInvulnerable(),
      onHit: (u, p) => {
        w.interrupt(u)
        w.vfx('pudge_hook_hit', { x: u.x, y: u.y, unit: u })
        if (u.kind === 'hero') w.damage(c, u, dmg, 'pure', { abilityId: 'pudge_hook' })
        u.forced = {
          speed: 1600, tx: c.x, ty: c.y, follow: c, stopDist: 110,
          onEnd: () => {
            if (u.kind === 'creep' && !u.dead) w.kill(u, c, { abilityId: 'pudge_hook' })
          },
        }
        p.attached = u
        p.phase = 'back'
        return true
      },
    })
  },
  ai(w, c, st, l) {
    for (const t of heroesNear(w, c, 1150).sort((a, b) => dist(a, c) - dist(b, c))) {
      const d = dist(c, t)
      const lead = (d / 1600) * 0.85
      const px = t.x + t.vx * lead
      const py = t.y + t.vy * lead
      const a = ang(c, { x: px, y: py })
      if (w.firstHitOnLine(c, a, 1300, 100) !== t) continue
      return !w.orderCast(c, st, undefined, px, py)
    }
    return false
  },
}

export const ROT: AbilityDef = {
  id: 'pudge_rot', name: 'Rot', glyph: '☣', color: '#7ab83a',
  toggleArea: { r: 250, fill: 'rgba(120,190,50,0.2)', stroke: 'rgba(150,220,70,0.7)' },
  behavior: 'toggle', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'A toxic cloud that deals heavy damage per second and slows enemies around Pudge. Pudge takes damage from his own Rot.',
  info: (l) => [`Damage per second: ${L([30, 60, 90, 120], l)}`, 'Radius: 250', `Slow: ${Math.round(L([0.14, 0.2, 0.26, 0.32], l) * 100)}%`],
  tick(w, c, l, dt, st) {
    if (!st.toggled) return
    st.extra.puffT = (st.extra.puffT || 0) - dt
    if (st.extra.puffT <= 0) {
      st.extra.puffT = 0.45
      w.vfx('pudge_rot_puff', { x: c.x, y: c.y, r: 250 })
    }
    const dps = L([30, 60, 90, 120], l)
    const slow = L([0.14, 0.2, 0.26, 0.32], l)
    for (const e of w.enemiesIn(c.team, c.x, c.y, 250)) {
      w.damage(c, e, dps * dt, 'magical', { spell: true, abilityId: 'pudge_rot', quiet: true })
      w.addBuff(e, { id: 'rot_slow', expires: w.time + 0.5, slow, color: '#7ab83a', label: 'Rot' })
    }
    w.damage(c, c, dps * dt, 'magical', { nonLethal: true, quiet: true, self: true })
  },
  ai(w, c, st) {
    const near = w.enemiesIn(c.team, c.x, c.y, 250).filter((u) => u.kind === 'hero').length
    const any = w.enemiesIn(c.team, c.x, c.y, 250).length
    const want = near > 0 && c.hp > c.st.maxHp * 0.3
    if (want !== st.toggled && (want || any === 0)) {
      st.toggled = want
    }
    return false
  },
}

export const FLESH_HEAP: AbilityDef = {
  id: 'pudge_heap', name: 'Flesh Heap', glyph: '❤', color: '#c05a5a',
  behavior: 'none', castPoint: 0, cd: [20, 19, 18, 17], mana: [35, 50, 65, 80], maxLevel: 4,
  desc: 'Pudge gains permanent strength whenever an enemy hero dies near him (even before this is learned). Active: gain flat damage block against all damage for a short time.',
  info: (l) => [`Strength per stack: ${L([1.1, 1.4, 1.7, 2], l)}`, `Damage block: ${L([8, 14, 20, 26], l)}`, `Duration: ${L([5, 6, 7, 8], l)}s`],
  stats(c, l, s, st) {
    s.str += (st.extra.stacks || 0) * L([1.1, 1.4, 1.7, 2], l)
  },
  onEnemyHeroDeath(w, owner, victim, killer, l, st) {
    if (killer === owner ? dist(owner, victim) <= 1600 : dist(owner, victim) <= 450) {
      st.extra.stacks = (st.extra.stacks || 0) + 1
      w.text(owner.x, owner.y - 90, '+1 Heap', '#e08a8a')
      w.vfx('pudge_heap_stack', { x: owner.x, y: owner.y })
    }
  },
  cast(w, c, l) {
    w.addBuff(c, { id: 'heap', expires: w.time + L([5, 6, 7, 8], l), block: L([8, 14, 20, 26], l), color: '#c05a5a', label: 'Flesh Heap' })
    w.vfx('pudge_heap_cast', { x: c.x, y: c.y, unit: c, dur: L([5, 6, 7, 8], l) })
  },
  ai(w, c, st, l) {
    if (heroesNear(w, c, 600).length && c.hp < c.st.maxHp * 0.7) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

export const DISMEMBER: AbilityDef = {
  id: 'pudge_dismember', name: 'Dismember', glyph: '☠', color: '#a02828',
  behavior: 'unit', target: 'enemy', range: same(3, 200), castPoint: 0.3, cd: [30, 25, 20], mana: [100, 130, 170], maxLevel: 3, ult: true,
  desc: 'Pudge chows down on an enemy unit, disabling it and dealing damage over time. Damage scales with Pudge\'s strength and heals him for the damage dealt.',
  info: (l) => [`Damage per second: ${L([80, 100, 120], l)} + ${Math.round(L([0.3, 0.6, 0.9], l) * 100)}% Str`, 'Channel: 2.75s (heroes), 5.5s (creeps)'],
  cast(w, c, l, t, st) {
    const tg = t.unit!
    const hero = tg.kind === 'hero'
    const dur = hero ? 2.75 : 5.5
    const ticks = hero ? 6 : 9
    const dps = L([80, 100, 120], l) + c.st.str * L([0.3, 0.6, 0.9], l)
    w.interrupt(tg)
    w.vfx('pudge_dismember_start', { x: tg.x, y: tg.y, unit: tg, dur, buff: 'dismember' })
    w.addBuff(tg, { id: 'dismember', expires: w.time + dur, stun: true, color: '#a02828', label: 'Dismember' })
    if (dist(c, tg) > 125) tg.forced = { speed: 500, tx: c.x, ty: c.y, follow: c, stopDist: 125 }
    const interval = dur / ticks
    let acc = 0
    c.channel = {
      st, until: w.time + dur, target: tg,
      tick: (dt) => {
        if (tg.dead) {
          c.channel!.until = 0
          return
        }
        acc += dt
        while (acc >= interval) {
          acc -= interval
          const dealt = w.damage(c, tg, dps * interval, 'magical', { spell: true, abilityId: 'pudge_dismember' })
          w.heal(c, dealt)
          w.vfx('pudge_dismember_chomp', { x: tg.x, y: tg.y })
        }
      },
      end: () => w.removeBuff(tg, 'dismember'),
    }
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 230).sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/* ----------------------------------------------------------------- SNIPER */

export const SHRAPNEL: AbilityDef = {
  id: 'sniper_shrapnel', name: 'Shrapnel', glyph: '✹', color: '#c8a050',
  aim: { aoe: { r: [400, 425, 450, 475], color: 'rgba(230,190,90,0.8)' } },
  behavior: 'point', range: same(4, 1800), castPoint: 0.3, cd: same(4, 0.6), mana: same(4, 75), maxLevel: 4,
  charges: { max: 3, restore: same(4, 35) },
  desc: 'Consumes a charge to shower a target area with pellets after a short delay. Enemies in the area take damage over time and are slowed. Reveals the area. Charges restore over time.',
  info: (l) => [
    `Damage per second: ${L([25, 40, 55, 70], l)}`, `Slow: ${Math.round(L([0.12, 0.18, 0.24, 0.3], l) * 100)}%`,
    `Radius: ${L([400, 425, 450, 475], l)}`, 'Delay 1.2s, lasts 10s',
  ],
  cast(w, c, l, t) {
    const dps = L([25, 40, 55, 70], l)
    const slow = L([0.12, 0.18, 0.24, 0.3], l)
    w.vfx('sniper_shrapnel', { x: t.x, y: t.y, r: L([400, 425, 450, 475], l), delay: 1.2, dur: 10 })
    w.addZone({
      x: t.x, y: t.y, r: L([400, 425, 450, 475], l), team: c.team, owner: c, start: w.time + 1.2, end: w.time + 11.2,
      color: '#c8a050', kind: 'shrapnel', reveal: true,
      tick: (z, dt) => {
        for (const e of w.enemiesIn(c.team, z.x, z.y, z.r)) {
          w.damage(c, e, dps * dt, 'magical', { spell: true, abilityId: 'sniper_shrapnel', quiet: true })
          w.addBuff(e, { id: 'shrapnel', expires: w.time + 0.5, slow, color: '#c8a050', label: 'Shrapnel' })
        }
      },
    })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 1500).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (t && dist(c, t) > 400) {
      return !w.orderCast(c, st, undefined, t.x + t.vx * 1.0, t.y + t.vy * 1.0)
    }
    return false
  },
}

export const HEADSHOT: AbilityDef = {
  id: 'sniper_headshot', name: 'Headshot', glyph: '◎', color: '#d86a3a',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Sniper\'s attacks have a chance to deal bonus damage, briefly knock the target back and slow its movement and attack speed.',
  info: (l) => ['Chance: 40%', `Bonus damage: ${L([20, 50, 80, 110], l)}`, 'Slow duration: 0.5s'],
  onAttackHit(w, a, t, l) {
    const chance = a.buffs.some((b) => b.hs100) ? 1 : 0.4
    if (Math.random() >= chance) return 0
    w.addBuff(t, { id: 'headshot', expires: w.time + 0.5, slow: 1, as: -100, color: '#d86a3a', label: 'Headshot' })
    const d = Math.atan2(t.y - a.y, t.x - a.x)
    w.displace(t, t.x + Math.cos(d) * 10, t.y + Math.sin(d) * 10)
    w.text(t.x, t.y - 70, 'HEADSHOT!', '#ffb347')
    w.vfx('sniper_muzzle', { x: a.x, y: a.y, angle: d })
    w.vfx('sniper_headshot', { x: t.x, y: t.y, angle: d })
    return L([20, 50, 80, 110], l)
  },
}

export const TAKE_AIM: AbilityDef = {
  id: 'sniper_take_aim', name: 'Take Aim', glyph: '⌖', color: '#e0c060',
  behavior: 'none', castPoint: 0, cd: [20, 18, 16, 14], mana: same(4, 50), maxLevel: 4,
  desc: 'Passively extends Sniper\'s attack range. Can be activated for 3 seconds to gain extra range and a guaranteed Headshot, at the cost of movement speed.',
  info: (l) => [`Bonus range: ${L([130, 220, 310, 400], l)}`, 'Active: +200 range, 100% Headshot', `Self slow: ${Math.round(L([0.45, 0.4, 0.35, 0.3], l) * 100)}%`],
  stats(c, l, s) {
    s.range += L([130, 220, 310, 400], l)
  },
  cast(w, c, l) {
    w.addBuff(c, { id: 'take_aim', expires: w.time + 3, rangeBonus: 200, hs100: true, slow: L([0.45, 0.4, 0.35, 0.3], l), color: '#e0c060', label: 'Take Aim' })
    w.vfx('sniper_take_aim', { x: c.x, y: c.y, angle: c.facing, unit: c, dur: 3, buff: 'take_aim' })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, c.st.range + 150)[0]
    if (t && dist(c, t) > c.st.range - 120) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

export const ASSASSINATE: AbilityDef = {
  id: 'sniper_assassinate', name: 'Assassinate', glyph: '✜', color: '#d84a3a',
  castSlack: 600,
  aimBeam: true,
  behavior: 'unit', target: 'enemy', range: same(3, 3000), castPoint: 2.0, cd: [20, 15, 10], mana: same(3, 175), maxLevel: 3, ult: true,
  desc: 'Sniper locks onto an enemy unit and, after a long aiming time, fires a devastating shot that deals his attack damage plus bonus damage and mini-stuns the target. Refreshes when Sniper kills an enemy hero.',
  info: (l) => [`Bonus damage: ${L([300, 400, 500], l)}`, 'Aiming time: 2s', 'Range: 3000'],
  cast(w, c, l, t) {
    const tg = t.unit!
    if (tg.dead) return
    w.vfx('sniper_assassinate_fire', { x: c.x, y: c.y, x2: tg.x, y2: tg.y })
    w.spawnHoming({
      owner: c, target: tg, x: c.x, y: c.y, speed: 2500, color: '#ff5a3a', size: 7, style: 'bullet',
      onHit: (u) => {
        w.vfx('sniper_assassinate_hit', { x: u.x, y: u.y })
        w.addBuff(u, { id: 'assassinate_stun', expires: w.time + 0.1, stun: true, color: '#d84a3a', label: 'Assassinate' })
        w.damage(c, u, c.st.dmg + L([300, 400, 500], l), 'physical', { abilityId: 'sniper_assassinate' })
      },
    })
  },
  ai(w, c, st, l) {
    const bonus = c.st.dmg + L([300, 400, 500], l)
    const t = heroesNear(w, c, 2400)
      .filter((u) => u.hp < bonus * 0.9 * (1 - (0.06 * u.st.armor) / (1 + 0.06 * Math.abs(u.st.armor))) && dist(u, c) > 600)
      .sort((a, b) => a.hp - b.hp)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/* ----------------------------------------------------------------- MIRANA */

export const STARSTORM: AbilityDef = {
  id: 'mirana_starstorm', name: 'Starstorm', glyph: '★', color: '#7aa8ff',
  aim: { circle: { r: 675, color: 'rgba(122,168,255,0.7)' } },
  behavior: 'none', castPoint: 0.4, cd: same(4, 12), mana: [80, 90, 100, 110], maxLevel: 4,
  desc: 'Calls down a wave of meteors on all nearby enemy units. The closest enemy to Mirana is struck a second time.',
  info: (l) => [`Damage: ${L([75, 150, 225, 300], l)}`, 'Radius: 675', 'Second strike: 75% to the nearest enemy'],
  cast(w, c, l) {
    const dmg = L([75, 150, 225, 300], l)
    const es = w.enemiesIn(c.team, c.x, c.y, 675)
    w.vfx('mirana_starstorm_cast', { x: c.x, y: c.y, r: 675 })
    for (const e of es) {
      w.vfx('mirana_star_strike', { x: e.x, y: e.y, dur: 0.35, color: '#9ac0ff' })
      w.damage(c, e, dmg, 'physical', { abilityId: 'mirana_starstorm' })
    }
    const near = es.filter((e) => dist(e, c) <= 650).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (near) {
      w.after(0.3, () => {
        if (near.dead) return
        w.vfx('mirana_star_strike', { x: near.x, y: near.y, dur: 0.35, color: '#c8dcff' })
        w.damage(c, near, dmg * 0.75, 'physical', { abilityId: 'mirana_starstorm' })
      })
    }
  },
  ai(w, c, st) {
    const es = w.enemiesIn(c.team, c.x, c.y, 650)
    if (es.some((e) => e.kind === 'hero') || es.filter((e) => e.kind === 'creep').length >= 3) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

export const SACRED_ARROW: AbilityDef = {
  id: 'mirana_arrow', name: 'Sacred Arrow', glyph: '➳', color: '#e8d870',
  aim: { line: { len: 3000, width: 190 } },
  behavior: 'point', range: same(4, 3000), castPoint: 0.5, cd: [19, 18, 17, 16], mana: same(4, 90), maxLevel: 4,
  desc: 'Fires a long-range arrow that stuns and damages the first enemy unit it strikes. Stun duration and damage grow with the distance the arrow has travelled. Instantly kills the first non-ancient creep it hits.',
  info: (l) => [
    `Damage: ${L([60, 150, 240, 330], l)} + up to ${L([150, 160, 170, 180], l)}`, `Stun: up to ${L([2.6, 3.4, 4.2, 5], l)}s`, 'Max bonus at 1500 distance',
  ],
  cast(w, c, l, t) {
    const a = t.x === c.x && t.y === c.y ? c.facing : ang(c, t)
    c.facing = a
    w.vfx('mirana_arrow_cast', { x: c.x, y: c.y, angle: a })
    w.spawnLinear({
      owner: c, x: c.x, y: c.y, angle: a, speed: 900, range: 3067, radius: 96, draw: 'arrow', style: 'arrow', color: '#f0e070',
      filter: (u) => u.team !== c.team && (u.kind === 'hero' || u.kind === 'creep') && !u.isInvulnerable(),
      onHit: (u, p) => {
        const f = Math.min(1, p.traveled / 1500)
        if (u.kind === 'creep') {
          w.vfx('mirana_arrow_hit', { x: u.x, y: u.y, f: 0.2, stun: 0 })
          w.kill(u, c, { abilityId: 'mirana_arrow' })
        } else {
          const stun = 0.01 + (L([2.6, 3.4, 4.2, 5], l) - 0.01) * f
          w.addBuff(u, { id: 'arrow_stun', expires: w.time + stun, stun: true, color: '#e8d870', label: 'Sacred Arrow' })
          w.vfx('mirana_arrow_hit', { x: u.x, y: u.y, unit: u, f, stun })
          w.damage(c, u, L([60, 150, 240, 330], l) + L([150, 160, 170, 180], l) * f, 'physical', { abilityId: 'mirana_arrow' })
        }
        return true
      },
    })
  },
  ai(w, c, st) {
    for (const t of heroesNear(w, c, 2200).sort((a, b) => dist(a, c) - dist(b, c))) {
      const d = dist(c, t)
      const lead = d / 900
      const px = t.x + t.vx * lead * 0.9
      const py = t.y + t.vy * lead * 0.9
      if (w.firstHitOnLine(c, ang(c, { x: px, y: py }), 3000, 96) !== t) continue
      return !w.orderCast(c, st, undefined, px, py)
    }
    return false
  },
}

export const LEAP: AbilityDef = {
  id: 'mirana_leap', name: 'Leap', glyph: '⤴', color: '#5ad0c0',
  aim: { line: { len: 575, width: 80, color: 'rgba(90,208,192,0.25)' } },
  behavior: 'point', noMove: true, castPoint: 0, cd: same(4, 0.5), mana: same(4, 40), maxLevel: 4,
  charges: { max: 3, restore: [52, 44, 36, 28] },
  desc: 'Mirana leaps forward and gains bonus movement and attack speed. Holds multiple charges that recharge over time.',
  info: (l) => ['Distance: 575', `Move speed: +${Math.round(L([0.08, 0.16, 0.24, 0.32], l) * 100)}%`, `Attack speed: +${L([25, 50, 75, 100], l)}`, 'Buff lasts 4s'],
  cast(w, c, l, t) {
    let a = ang(c, t)
    if (t.x === c.x && t.y === c.y) a = c.facing
    c.facing = a
    const tx = c.x + Math.cos(a) * 575
    const ty = c.y + Math.sin(a) * 575
    c.forced = { speed: 1300, tx, ty }
    w.vfx('mirana_leap', { x: c.x, y: c.y, x2: tx, y2: ty })
    w.addBuff(c, { id: 'leap', expires: w.time + 4, haste: L([0.08, 0.16, 0.24, 0.32], l), as: L([25, 50, 75, 100], l), color: '#5ad0c0', label: 'Leap' })
  },
  ai(w, c, st) {
    // flee when hurt
    if (c.hp < c.st.maxHp * 0.35 && w.enemyHeroesNear(c, 700).length) {
      const home = w.homePos(c.team)
      return !w.orderCast(c, st, undefined, home.x, home.y)
    }
    const t = heroesNear(w, c, 1100).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (t && dist(c, t) > c.st.range + 150 && c.hp > c.st.maxHp * 0.6 && st.charges >= 2) return !w.orderCast(c, st, undefined, t.x, t.y)
    return false
  },
}

export const MOONLIGHT: AbilityDef = {
  id: 'mirana_moonlight', name: 'Moonlight Shadow', glyph: '☾', color: '#a890e8',
  behavior: 'none', castPoint: 0.5, cd: [140, 120, 100], mana: same(3, 125), maxLevel: 3, ult: true,
  desc: 'Turns Mirana and all allied heroes invisible and grants bonus movement speed. Attacking or casting reveals a hero briefly; invisibility returns after the fade delay.',
  info: (l) => ['Duration: 18s', `Move speed: +${Math.round(L([0.09, 0.12, 0.15], l) * 100)}%`, `Fade delay: ${L([2.5, 2, 1.5], l)}s`, 'Evasion: 20%'],
  cast(w, c, l) {
    for (const h of w.heroes) {
      if (h.team !== c.team || h.dead) continue
      w.addBuff(h, {
        id: 'moonlight', expires: w.time + 18, invis: true, fade: L([2.5, 2, 1.5], l), haste: L([0.09, 0.12, 0.15], l), evasion: 0.2,
        color: '#a890e8', label: 'Moonlight Shadow',
      })
      h.revealUntil = Math.max(h.revealUntil, w.time + L([2.5, 2, 1.5], l))
      w.vfx('mirana_moonbeam', { x: h.x, y: h.y })
    }
  },
  ai(w, c, st) {
    if (w.time < 600) return false
    const allies = w.heroes.filter((h) => h.team === c.team && !h.dead && dist(h, c) < 1800).length
    if (allies >= 3 && heroesNear(w, c, 1800).length === 0 && c.hp > c.st.maxHp * 0.6 && w.enemyBuildingNear(c, 3500)) {
      return !w.orderCast(c, st, undefined, c.x, c.y)
    }
    return false
  },
}

/* -------------------------------------------------------------------- AXE */

export const BERSERKERS_CALL: AbilityDef = {
  id: 'axe_call', name: "Berserker's Call", glyph: '⚑', color: '#d85a2a',
  behavior: 'none', castPoint: 0.3, cd: [17, 15, 13, 11], mana: [80, 90, 100, 110], maxLevel: 4,
  desc: 'Axe taunts nearby enemy units, forcing them to attack him, while he gains bonus armor for the duration.',
  info: (l) => ['Radius: 315', `Duration: ${L([1.8, 2.2, 2.6, 3], l)}s`, 'Armor bonus: +25'],
  cast(w, c, l) {
    const d = L([1.8, 2.2, 2.6, 3], l)
    let marks = 0
    for (const e of w.enemiesIn(c.team, c.x, c.y, 315)) {
      if (marks++ < 6) w.vfx('axe_taunt_mark', { x: e.x, y: e.y, unit: e, dur: d, buff: 'taunt' })
      w.interrupt(e, true)
      w.addBuff(e, { id: 'taunt', expires: w.time + d, taunt: c, src: c, color: '#d85a2a', label: 'Taunted' })
    }
    w.addBuff(c, { id: 'call_armor', expires: w.time + d, armor: 25, color: '#d85a2a', label: "Berserker's Call" })
    w.vfx('axe_call', { x: c.x, y: c.y, r: 315 })
  },
  ai(w, c, st) {
    const es = w.enemiesIn(c.team, c.x, c.y, 300)
    const heroes = es.filter((e) => e.kind === 'hero').length
    if (heroes >= 1 && (heroes >= 2 || c.hp > c.st.maxHp * 0.35)) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

export const BATTLE_HUNGER: AbilityDef = {
  id: 'axe_hunger', name: 'Battle Hunger', glyph: '☄', color: '#e08a3a',
  behavior: 'unit', target: 'enemy', range: [700, 775, 850, 925], castPoint: 0.3, cd: [20, 15, 10, 5], mana: same(4, 75), maxLevel: 4,
  desc: 'Enrages an enemy unit, causing it to take damage over time until it kills another unit or the duration ends. Damage is boosted by Axe\'s armor. The enemy is slowed while it faces away from Axe.',
  info: (l) => [`Damage per second: ${L([12, 16, 22, 26], l)} + Axe armor`, `Slow: ${Math.round(L([0.11, 0.19, 0.27, 0.35], l) * 100)}%`, 'Duration: 12s'],
  cast(w, c, l, t) {
    const tg = t.unit!
    w.vfx('axe_hunger', { x: tg.x, y: tg.y, unit: tg, dur: 12, buff: 'hunger' })
    w.addBuff(tg, {
      id: 'hunger', expires: w.time + 12, hunger: true, src: c, slow: L([0.11, 0.19, 0.27, 0.35], l), slowFacingAway: true,
      dot: { dps: L([12, 16, 22, 26], l) + Math.max(0, c.st.armor), type: 'magical', abilityId: 'axe_hunger' }, color: '#e08a3a', label: 'Battle Hunger',
    })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 800).find((u) => !u.hasBuff('hunger'))
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

export const COUNTER_HELIX: AbilityDef = {
  id: 'axe_helix', name: 'Counter Helix', glyph: '↻', color: '#d8d84a',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Every so many times Axe is attacked, he spins in a helix, dealing pure damage to all nearby enemies.',
  info: (l) => [`Every ${L([7, 6, 5, 4], l)} attacks`, `Damage: ${L([95, 120, 145, 170], l)}`, 'Radius: 300'],
  onAttacked(w, v, a, l, st) {
    st.extra.count = (st.extra.count || 0) + 1
    if (st.extra.count >= L([7, 6, 5, 4], l) && w.time >= (st.extra.cd || 0)) {
      st.extra.count = 0
      st.extra.cd = w.time + 0.3
      w.vfx('axe_helix', { x: v.x, y: v.y, r: 300, unit: v })
      for (const e of w.enemiesIn(v.team, v.x, v.y, 300)) w.damage(v, e, L([95, 120, 145, 170], l), 'pure', { abilityId: 'axe_helix' })
    }
  },
}

export const CULLING_BLADE: AbilityDef = {
  id: 'axe_culling', name: 'Culling Blade', glyph: '✂', color: '#e8e8e8',
  behavior: 'unit', target: 'enemy', range: same(3, 175), castPoint: 0.3, cd: [75, 65, 55], mana: same(3, 60), maxLevel: 3, ult: true,
  desc: 'Axe spots a weakness and strikes, instantly killing an enemy below a health threshold or otherwise dealing damage. Killing a hero resets the cooldown, grants Axe permanent armor and speeds up nearby allies.',
  info: (l) => [`Kill threshold: ${L([250, 350, 450], l)} HP`, `Damage otherwise: ${L([150, 250, 350], l)}`, 'Armor per kill: +1', 'Allies in 900: +12% move speed, +3 armor for 6s'],
  stats(c, l, s, st) {
    s.armor += st.extra.stacks || 0
  },
  cast(w, c, l, t, st) {
    const tg = t.unit!
    w.vfx('axe_cull', { x: tg.x, y: tg.y, angle: ang(c, tg), kill: tg.hp <= L([250, 350, 450], l) })
    if (tg.hp <= L([250, 350, 450], l)) {
      w.kill(tg, c, { abilityId: 'axe_culling' })
    } else {
      w.damage(c, tg, L([150, 250, 350], l), 'pure', { abilityId: 'axe_culling' })
    }
  },
  ai(w, c, st, l) {
    const thr = L([250, 350, 450], l)
    const t = heroesNear(w, c, 200).find((u) => u.hp <= thr) || heroesNear(w, c, 200).find((u) => u.hp <= thr * 1.4)
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/* ----------------------------------------------------------------- RUBICK */

export const TELEKINESIS: AbilityDef = {
  id: 'rubick_tk', name: 'Telekinesis', glyph: '☝', color: '#5ab0e8',
  followUp: (c, now) => !!c.tk && now < c.tk.end,
  behavior: 'unit', target: 'enemy', range: [550, 575, 600, 625], castPoint: 0.1, cd: [24, 21, 18, 15], mana: same(4, 110), maxLevel: 4,
  desc: 'Lifts an enemy into the air and hurls it back to the ground, stunning and damaging everything nearby. Cast the ability again while the target is airborne to choose where it lands.',
  info: (l) => [
    `Lift: ${L([0.95, 1.2, 1.45, 1.7], l)}s`, `Stun: ${L([0.9, 1.1, 1.3, 1.5], l)}s`, `Stun radius: ${L([300, 325, 350, 375], l)}`, 'Landing damage: 150', 'Max throw: 375',
  ],
  cast(w, c, l, t) {
    const tg = t.unit!
    const lift = L([0.95, 1.2, 1.45, 1.7], l)
    const stunR = L([300, 325, 350, 375], l)
    const stunD = L([0.9, 1.1, 1.3, 1.5], l)
    w.interrupt(tg, true)
    tg.liftStart = w.time
    tg.liftEnd = w.time + lift
    w.addBuff(tg, { id: 'tk', lift: true, stun: true, expires: w.time + lift + 0.4, color: '#5ab0e8', label: 'Telekinesis' })
    w.vfx('rubick_tk_lift', { x: tg.x, y: tg.y, unit: c, unit2: tg, dur: lift })
    const tk = { target: tg, start: { x: tg.x, y: tg.y }, land: { x: tg.x, y: tg.y }, end: w.time + lift }
    c.tk = tk
    w.after(lift, () => {
      const finish = () => {
        w.removeBuff(tg, 'tk')
        tg.liftStart = 0
        if (c.tk === tk) c.tk = null
        w.vfx('rubick_tk_land', { x: tg.x, y: tg.y, r: stunR })
        for (const e of w.enemiesIn(c.team, tg.x, tg.y, stunR)) {
          w.interrupt(e, true)
          w.addBuff(e, { id: 'tk_stun', expires: w.time + stunD, stun: true, color: '#5ab0e8', label: 'Telekinesis' })
          w.damage(c, e, 150, 'magical', { spell: true, abilityId: 'rubick_tk' })
        }
        if (!tg.dead && !w.enemiesIn(c.team, tg.x, tg.y, stunR).includes(tg)) {
          w.addBuff(tg, { id: 'tk_stun', expires: w.time + stunD, stun: true, color: '#5ab0e8', label: 'Telekinesis' })
        }
      }
      if (tg.dead) {
        if (c.tk === tk) c.tk = null
        return
      }
      const d = dist(tg, tk.land)
      if (d < 5) w.after(0.3, finish)
      else tg.forced = { speed: d / 0.3, tx: tk.land.x, ty: tk.land.y, onEnd: finish }
    })
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 600).filter((u) => u.kind === 'hero')[0]
    if (t) {
      const home = w.homePos(c.team)
      const a = ang(t, home)
      const err = w.orderCast(c, st, t, t.x, t.y)
      if (!err) {
        c.extra.tkAiLand = { x: t.x + Math.cos(a) * 375, y: t.y + Math.sin(a) * 375 }
        return true
      }
    }
    return false
  },
}

export const FADE_BOLT: AbilityDef = {
  id: 'rubick_fade', name: 'Fade Bolt', glyph: '⚡', color: '#9a78e8',
  behavior: 'unit', target: 'enemy', range: same(4, 800), castPoint: 0.1, cd: [16, 14, 12, 10], mana: [120, 130, 140, 150], maxLevel: 4,
  desc: 'A stream of arcane energy that jumps between enemy units, dealing damage and reducing their attack damage. Each jump deals slightly less damage.',
  info: (l) => [`Damage: ${L([100, 175, 250, 325], l)}`, `Attack damage reduction: ${Math.round(L([0.05, 0.15, 0.25, 0.35], l) * 100)}%`, 'Jump range: 440'],
  cast(w, c, l, t) {
    const hit = new Set<number>()
    const red = L([0.05, 0.15, 0.25, 0.35], l)
    const go = (src: { x: number; y: number }, tg: Unit, dmg: number, n: number) => {
      hit.add(tg.id)
      w.vfx('rubick_fade_bolt', { x: src.x, y: src.y, x2: tg.x, y2: tg.y })
      w.damage(c, tg, dmg, 'magical', { spell: true, abilityId: 'rubick_fade' })
      w.addBuff(tg, { id: 'fade_bolt', expires: w.time + 10, dmgReduce: red, color: '#9a78e8', label: 'Fade Bolt' })
      if (n >= 12) return
      const cands = w.enemiesIn(c.team, tg.x, tg.y, 440).filter((u) => !hit.has(u.id))
      const next = cands.filter((u) => u.kind === 'hero').sort((a, b) => dist(a, tg) - dist(b, tg))[0] || cands.sort((a, b) => dist(a, tg) - dist(b, tg))[0]
      if (next) w.after(0.25, () => !next.dead && go(tg, next, dmg * 0.94, n + 1))
    }
    go(c, t.unit!, L([100, 175, 250, 325], l), 0)
  },
  ai(w, c, st) {
    const t = heroesNear(w, c, 800)[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

export const ARCANE_SUPREMACY: AbilityDef = {
  id: 'rubick_arcane', name: 'Arcane Supremacy', glyph: '✧', color: '#c8a8ff',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Rubick\'s mastery of the arcane grants a larger cast range and amplifies the damage of his spells (including stolen ones).',
  info: (l) => [`Cast range: +${L([60, 120, 180, 240], l)}`, `Spell damage: +${Math.round(L([0.14, 0.18, 0.22, 0.26], l) * 100)}%`],
  stats(c, l, s) {
    s.castRange += L([60, 120, 180, 240], l)
    s.spellAmp += L([0.14, 0.18, 0.22, 0.26], l)
  },
}

export const SPELL_STEAL: AbilityDef = {
  id: 'rubick_steal', name: 'Spell Steal', glyph: '⟲', color: '#e8c858',
  behavior: 'unit', target: 'enemy', heroOnly: true, range: same(3, 1000), castPoint: 0.1, cd: [20, 12, 4], mana: same(3, 25), maxLevel: 3, ult: true, stealable: false,
  desc: 'Rubick studies an enemy hero and learns the last spell it cast, which he can use as his own in the D slot for several minutes. Stolen spells use Rubick\'s stats.',
  info: (l) => [`Spell duration: ${L([180, 240, 300], l)}s`, 'Steals the last spell the hero cast'],
  canCast(w, c, t) {
    const lc = t.unit?.h?.lastCast
    if (!lc) return 'That hero has not cast a spell yet'
    return null
  },
  cast(w, c, l, t) {
    const lc = t.unit!.h!.lastCast
    if (!lc) return
    const s2 = new AbilityState(lc.def, lc.level)
    s2.expires = w.time + L([180, 240, 300], l)
    c.h!.stolen = s2
    w.vfx('rubick_steal', { x: t.unit!.x, y: t.unit!.y, x2: c.x, y2: c.y, unit: t.unit, unit2: c })
    w.text(c.x, c.y - 100, `Stole ${lc.def.name}`, '#e8c858')
  },
  ai(w, c, st) {
    if (c.h!.stolen) return false
    const t = heroesNear(w, c, 1000).find((u) => u.h?.lastCast && u.h.lastCast.def.stealable !== false && u.h.lastCast.def.behavior !== 'passive')
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}
