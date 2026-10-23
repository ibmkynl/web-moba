import type { AbilityDef, HeroDef, Unit } from './entities'
import { L, ang, same, heroesNear } from './abkit'
import type { World } from './world'
import { dist } from './constants'

/* Windranger, Anti-Mage, Riki. Numbers follow the current Dota 2 wiki. */

const adiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
const clampMap = (v: number) => Math.max(40, Math.min(9560, v))
const lowest = (us: Unit[]) => us.slice().sort((a, b) => a.hp - b.hp)[0]

/* -------------------------------------------------------------- WINDRANGER */

const SHACKLESHOT: AbilityDef = {
  id: 'windranger_shackleshot', name: 'Shackleshot', glyph: '⛓', color: '#8ad06a',
  behavior: 'unit', target: 'enemy', range: same(4, 800), castPoint: 0.15, cd: [16, 14, 12, 10], mana: [70, 80, 90, 100], maxLevel: 4,
  desc: 'Shackles the target to another enemy unit in a line directly behind it. Both are stunned. If there is nothing to shackle to, only the target is stunned, for a much shorter time.',
  info: (l) => [`Stun: ${L([1.6, 2.1, 2.6, 3.1], l)}s`, 'Failed shackle stun: 0.6s', 'Shackle search range: 575 behind the target'],
  cast(w, c, l, t) {
    const tg = t.unit!
    const a = ang(c, tg)
    c.facing = a
    let sec: Unit | null = null
    let best = Infinity
    for (const e of w.enemiesIn(c.team, tg.x, tg.y, 575)) {
      if (e === tg || e.isInvulnerable()) continue
      if (adiff(ang(tg, e), a) > (23 * Math.PI) / 180) continue
      const d = dist(tg, e)
      if (d < best) {
        best = d
        sec = e
      }
    }
    const full = L([1.6, 2.1, 2.6, 3.1], l)
    w.interrupt(tg)
    w.fx({ k: 'line', x1: c.x, y1: c.y, x2: tg.x, y2: tg.y, dur: 0.25, color: '#b8f090', width: 6 })
    if (sec) {
      w.interrupt(sec)
      w.addBuff(tg, { id: 'shackle', expires: w.time + full, stun: true, src: c, color: '#8ad06a', label: 'Shackled' })
      w.addBuff(sec, { id: 'shackle', expires: w.time + full, stun: true, src: c, color: '#8ad06a', label: 'Shackled' })
      w.vfx('windranger_shackle', { x: tg.x, y: tg.y, unit: tg, unit2: sec, dur: full, color: '#8ad06a' })
    } else {
      w.addBuff(tg, { id: 'shackle', expires: w.time + 0.6, stun: true, src: c, color: '#8ad06a', label: 'Shackled' })
      w.vfx('windranger_shackle', { x: tg.x, y: tg.y, unit: tg, dur: 0.6, color: '#8ad06a' })
    }
  },
  ai(w, c, st) {
    const r = w.castRange(c, st)
    const t = heroesNear(w, c, r).filter((u) => !u.isStunned()).sort((a, b) => dist(a, c) - dist(b, c))[0]
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

function powershotFire(w: World, c: Unit, l: number, a: number, frac: number) {
  const maxDmg = L([170, 270, 370, 470], l)
  const slowBase = L([0.2, 0.25, 0.3, 0.35], l)
  const hit = new Set<number>()
  let n = 0
  w.vfx('windranger_powershot_fire', { x: c.x, y: c.y, angle: a, range: 3000, frac })
  w.spawnLinear({
    owner: c, x: c.x, y: c.y, angle: a, speed: 3000, range: 3000, radius: 125, draw: 'arrow', style: 'arrow', color: '#ffe890',
    filter: (u: Unit) => u.team !== c.team && !hit.has(u.id) && (u.kind === 'hero' || u.kind === 'creep' || u.kind === 'summon') && !u.isInvulnerable(),
    onHit: (u: Unit) => {
      hit.add(u.id)
      w.vfx('windranger_powershot_hit', { x: u.x, y: u.y, angle: a })
      const m = Math.pow(0.85, n)
      n++
      w.damage(c, u, maxDmg * frac * m, 'physical', { abilityId: 'windranger_powershot' })
      w.addBuff(u, { id: 'powershot_slow', expires: w.time + 4, slow: slowBase * m, color: '#8ad06a', label: 'Powershot' })
      return false
    },
  })
}

const POWERSHOT: AbilityDef = {
  id: 'windranger_powershot', name: 'Powershot', glyph: '➶', color: '#d8f090',
  behavior: 'point', range: same(4, 2600), castPoint: 0, cd: [12, 11, 10, 9], mana: [90, 100, 110, 120], maxLevel: 4,
  desc: 'Windranger charges her bow for up to 1 second, then looses a powerful arrow that damages and slows every enemy along its path. Damage grows with the charge time; each enemy hit reduces the damage and slow of the next. Issue any order to release early.',
  info: (l) => [`Max damage: ${L([170, 270, 370, 470], l)}`, `Slow: ${Math.round(L([0.2, 0.25, 0.3, 0.35], l) * 100)}% for 4s`, 'Each unit hit: x0.85', 'Travel: 3000, width 125'],
  cast(w, c, l, t, st) {
    const a = t.x === c.x && t.y === c.y ? c.facing : ang(c, t)
    c.facing = a
    const start = w.time
    const token = { done: false }
    w.vfx('windranger_powershot_charge', { unit: c, x: c.x, y: c.y, angle: a, dur: 1, token })
    c.channel = {
      st, until: start + 1,
      tick: () => {},
      end: (interrupted) => {
        token.done = true
        if (c.dead || (interrupted && c.isStunned())) return
        const frac = Math.max(0.12, Math.min(1, (w.time - start) / 1))
        powershotFire(w, c, l, a, frac)
      },
    }
  },
  ai(w, c, st) {
    for (const t of heroesNear(w, c, 1900).sort((a, b) => dist(a, c) - dist(b, c))) {
      const d = dist(c, t)
      const lead = d / 3000 + 0.7
      const px = t.x + t.vx * lead * 0.6
      const py = t.y + t.vy * lead * 0.6
      if (w.firstHitOnLine(c, ang(c, { x: px, y: py }), 3000, 125) !== t) continue
      return !w.orderCast(c, st, undefined, px, py)
    }
    return false
  },
}

const WINDRUN: AbilityDef = {
  id: 'windranger_windrun', name: 'Windrun', glyph: '≋', color: '#a8e8c8',
  behavior: 'none', castPoint: 0, cd: [15, 14, 13, 12], mana: same(4, 50), maxLevel: 4,
  desc: 'Windranger becomes a gust of wind: she gains 100% evasion against physical attacks and a large movement speed bonus.',
  info: (l) => ['Evasion: 100%', 'Move speed: +60%', `Duration: ${L([3, 4, 5, 6], l)}s`],
  cast(w, c, l) {
    w.addBuff(c, { id: 'windrun', expires: w.time + L([3, 4, 5, 6], l), evasion: 1, haste: 0.6, color: '#a8e8c8', label: 'Windrun' })
    w.vfx('windranger_windrun', { x: c.x, y: c.y, unit: c, dur: L([3, 4, 5, 6], l) })
  },
  ai(w, c, st) {
    const near = w.enemyHeroesNear(c, 800)
    if (near.length && c.hp < c.st.maxHp * 0.55) return !w.orderCast(c, st, undefined, c.x, c.y)
    if (near.length && w.enemyHeroesNear(c, 650).length && c.hp > c.st.maxHp * 0.55 && c.hasBuff('focus_fire')) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

const FOCUS_FIRE: AbilityDef = {
  id: 'windranger_focusfire', name: 'Focus Fire', glyph: '⁂', color: '#f0e070',
  behavior: 'unit', target: 'enemy', range: same(3, 600), castPoint: 0, cd: [70, 50, 30], mana: [75, 100, 125], maxLevel: 3, ult: true,
  desc: 'Windranger focuses on a single enemy, gaining enormous attack speed against it at the cost of reduced attack damage. She keeps attacking that target (she may still move freely) until it dies or the effect ends.',
  info: (l) => [`Attack speed: +${L([350, 425, 500], l)}`, 'Attack damage: 70%', 'Duration: 20s'],
  cast(w, c, l, t, st) {
    const tg = t.unit!
    st.extra.focus = { target: tg, until: w.time + 20 }
    w.addBuff(c, { id: 'focus_fire', expires: w.time + 20, as: L([350, 425, 500], l), dmgReduce: 0.3, color: '#f0e070', label: 'Focus Fire' })
    w.vfx('windranger_focus', { x: tg.x, y: tg.y, unit: tg, src: c, dur: 20, stop: () => c.dead || !c.hasBuff('focus_fire') })
    w.fx({ k: 'line', x1: c.x, y1: c.y, x2: tg.x, y2: tg.y, dur: 0.3, color: '#f0e070', width: 5 })
    if (w.canAttackTarget(c, tg)) c.order = { t: 'attack', target: tg }
  },
  tick(w, c, l, dt, st) {
    const f = st.extra.focus as { target: Unit; until: number } | null | undefined
    if (!f) return
    if (c.dead || w.time >= f.until || f.target.dead) {
      w.removeBuff(c, 'focus_fire')
      st.extra.focus = null
      return
    }
    if (c.casting || c.channel || c.forced) return
    const o = c.order
    if (o.t === 'move' || o.t === 'cast' || o.t === 'ward') return
    if (o.t === 'attack' && o.target === f.target) return
    if (w.canAttackTarget(c, f.target)) c.order = { t: 'attack', target: f.target }
  },
  ai(w, c, st) {
    const r = w.castRange(c, st)
    const t = lowest(heroesNear(w, c, r))
    if (t && c.hp > c.st.maxHp * 0.3) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

/* --------------------------------------------------------------- ANTI-MAGE */

const MANA_BREAK: AbilityDef = {
  id: 'antimage_manabreak', name: 'Mana Break', glyph: '◈', color: '#6a8ae8',
  behavior: 'passive', castPoint: 0, cd: same(4, 0), mana: same(4, 0), maxLevel: 4,
  desc: 'Burns mana with each attack and deals damage equal to half the mana burned. Enemy heroes who run out of mana are briefly slowed.',
  info: (l) => [`Mana burned per hit: ${L([25, 30, 35, 40], l)} + ${L([1.6, 2.4, 3.2, 4], l)}% max mana`, 'Burned mana as damage: 50%', `Slow on full drain: ${Math.round(L([0.25, 0.3, 0.35, 0.4], l) * 100)}%`],
  onAttackHit(w, a, t, l) {
    if (t.isBuilding || t.isImmune() || t.kind !== 'hero' || t.st.maxMana <= 0) return 0
    const want = L([25, 30, 35, 40], l) + t.st.maxMana * L([0.016, 0.024, 0.032, 0.04], l)
    const burn = Math.min(t.mana, want)
    t.mana -= burn
    if (t.mana <= 0.5) {
      t.mana = 0
      w.addBuff(t, { id: 'manabreak_slow', expires: w.time + 0.75, slow: L([0.25, 0.3, 0.35, 0.4], l), color: '#6a8ae8', label: 'Mana Break' })
    }
    w.vfx('antimage_manabreak', { x: t.x, y: t.y, angle: a.facing })
    return burn * 0.5
  },
}

const AM_BLINK: AbilityDef = {
  id: 'antimage_blink', name: 'Blink', glyph: '⇢', color: '#7ad0ff',
  behavior: 'point', castPoint: 0.4, cd: [13.5, 11, 8.5, 6], mana: same(4, 45), maxLevel: 4,
  desc: 'Anti-Mage teleports a short distance toward the target point (minimum 200). Aim farther than the maximum range to blink the full distance.',
  info: (l) => [`Max distance: ${L([750, 900, 1050, 1200], l)}`, 'Min distance: 200'],
  cast(w, c, l, t) {
    const maxD = L([750, 900, 1050, 1200], l)
    let dx = t.x - c.x
    let dy = t.y - c.y
    let d = Math.hypot(dx, dy)
    if (d < 1) {
      dx = Math.cos(c.facing)
      dy = Math.sin(c.facing)
      d = 1
    }
    const nd = Math.max(200, Math.min(maxD, d))
    const x0 = c.x
    const y0 = c.y
    c.x = clampMap(c.x + (dx / d) * nd)
    c.y = clampMap(c.y + (dy / d) * nd)
    c.facing = Math.atan2(dy, dx)
    c.vx = 0
    c.vy = 0
    w.interrupt(c)
    w.vfx('antimage_blink', { x: x0, y: y0, x2: c.x, y2: c.y })
  },
  ai(w, c, st, l) {
    const maxD = L([750, 900, 1050, 1200], l)
    const home = w.homePos(c.team)
    if (c.hp < c.st.maxHp * 0.33 && w.enemyHeroesNear(c, 650).length) {
      const a = ang(c, home)
      return !w.orderCast(c, st, undefined, c.x + Math.cos(a) * maxD, c.y + Math.sin(a) * maxD)
    }
    if (c.hp > c.st.maxHp * 0.55) {
      const t = lowest(heroesNear(w, c, maxD + 120).filter((u) => dist(u, c) > c.st.range + 330))
      if (t) {
        const a = ang(c, t)
        const d = Math.max(200, dist(c, t) - 170)
        return !w.orderCast(c, st, undefined, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d)
      }
    }
    return false
  },
}

const bonusMr = (l: number) => L([0.15, 0.25, 0.35, 0.45], l)

const COUNTERSPELL: AbilityDef = {
  id: 'antimage_counterspell', name: 'Counterspell', glyph: '⛨', color: '#a8e0ff',
  behavior: 'none', castPoint: 0, cd: [15, 11, 7, 3], mana: same(4, 45), maxLevel: 4,
  desc: 'Passively grants magic resistance. Activate to surround Anti-Mage in an anti-magic shell that negates the next targeted spell cast on him.',
  info: (l) => [`Magic resistance: +${Math.round(bonusMr(l) * 100)}%`, 'Shell duration: 1.2s'],
  stats(c, l, s) {
    s.magicRes = 1 - (1 - 0.25) * (1 - bonusMr(l))
  },
  cast(w, c, _l, _t, st) {
    w.addBuff(c, { id: 'am_counterspell', expires: w.time + 1.2, spellBlock: true, color: '#a8e0ff', label: 'Counterspell' })
    st.extra.csUntil = w.time + 1.2
    w.vfx('antimage_counterspell', { x: c.x, y: c.y, unit: c, dur: 1.2, stop: () => !c.hasBuff('am_counterspell') })
  },
  tick(w, c, l, dt, st) {
    // the shell popped early = it blocked a spell
    const cu = st.extra.csUntil as number | undefined
    if (cu && !c.hasBuff('am_counterspell')) {
      if (w.time < cu - 0.05) w.vfx('antimage_counterspell_block', { x: c.x, y: c.y })
      st.extra.csUntil = 0
    }
    // bots react to an incoming targeted spell instantly
    if (!c.h || c.h.isPlayer || c.dead || c.hasBuff('am_counterspell')) return
    const mana = st.def.mana[l - 1]
    if (!w.abilityReady(c, st) || c.mana < mana || c.isSilenced() || c.isStunned()) return
    for (const e of w.enemyHeroesNear(c, 1300)) {
      const k = e.casting
      if (k && k.target === c && k.st.def.behavior === 'unit') {
        c.mana -= mana
        st.cdUntil = w.time + st.def.cd[l - 1]
        st.def.cast!(w, c, l, { x: c.x, y: c.y }, st)
        return
      }
    }
  },
  ai(w, c, st) {
    for (const e of w.enemyHeroesNear(c, 1300)) {
      const k = e.casting
      if (k && k.target === c && k.st.def.behavior === 'unit') return !w.orderCast(c, st, undefined, c.x, c.y)
    }
    return false
  },
}

const voidDmg = (c: Unit, t: Unit, l: number) =>
  Math.max(0, t.st.maxMana - t.mana) * L([0.8, 0.95, 1.1], l) * (1 + c.st.spellAmp) * (1 - t.st.magicRes)

const MANA_VOID: AbilityDef = {
  id: 'antimage_manavoid', name: 'Mana Void', glyph: '◉', color: '#9a6aff',
  behavior: 'unit', target: 'enemy', range: same(3, 600), castPoint: 0.3, cd: same(3, 70), mana: [100, 150, 200], maxLevel: 3, ult: true,
  desc: "Damages the target and all enemies around it for each point of mana the target is missing, and mini-stuns the target. The less mana the target has, the harder it hits.",
  info: (l) => [`Damage per missing mana: ${L([0.8, 0.95, 1.1], l)}`, 'Radius: 500', 'Stun: 0.3s'],
  cast(w, c, l, t) {
    const tg = t.unit!
    const base = Math.max(0, tg.st.maxMana - tg.mana) * L([0.8, 0.95, 1.1], l)
    w.vfx('antimage_manavoid', { x: tg.x, y: tg.y, unit: tg, r: 500 })
    w.interrupt(tg)
    w.addBuff(tg, { id: 'manavoid_stun', expires: w.time + 0.3, stun: true, src: c, color: '#9a6aff', label: 'Mana Void' })
    for (const e of w.enemiesIn(c.team, tg.x, tg.y, 500)) {
      w.damage(c, e, base, 'magical', { spell: true, abilityId: 'antimage_manavoid' })
    }
  },
  ai(w, c, st, l) {
    const r = w.castRange(c, st)
    for (const t of heroesNear(w, c, r).sort((a, b) => a.hp - b.hp)) {
      const d = voidDmg(c, t, l)
      const around = w.enemyHeroesNear(t, 500).length
      if (d >= t.hp || (around >= 2 && d >= 350) || d >= t.st.maxHp * 0.6) return !w.orderCast(c, st, t, t.x, t.y)
    }
    return false
  },
}

/* -------------------------------------------------------------------- RIKI */

const SMOKE_SCREEN: AbilityDef = {
  id: 'riki_smoke_screen', name: 'Smoke Screen', glyph: '☁', color: '#9a8ac8',
  behavior: 'point', range: same(4, 550), castPoint: 0.2, cd: [20, 17, 14, 11], mana: [65, 70, 75, 80], maxLevel: 4,
  desc: 'Throws down a smoke bomb. Enemies inside are silenced and their attacks miss often (modelled as reduced attack damage).',
  info: (l) => ['Radius: 425', 'Duration: 6s', `Miss chance: ${L([30, 45, 60, 75], l)}%`, 'Silences enemies'],
  cast(w, c, l, t) {
    const miss = L([0.3, 0.45, 0.6, 0.75], l)
    w.vfx('riki_smoke', { x: t.x, y: t.y, r: 425, dur: 6 })
    w.addZone({
      x: t.x, y: t.y, r: 425, team: c.team, owner: c, start: w.time, end: w.time + 6, color: '#9a8ac8', kind: 'smoke',
      tick: (z) => {
        for (const e of w.enemiesIn(c.team, z.x, z.y, z.r)) {
          w.addBuff(e, { id: 'riki_smoke', expires: w.time + 0.3, silence: true, dmgReduce: miss, src: c, color: '#9a8ac8', label: 'Smoke Screen' })
        }
      },
    })
  },
  ai(w, c, st) {
    const hs = heroesNear(w, c, 520)
    if (!hs.length) return false
    const x = hs.reduce((s, h) => s + h.x, 0) / hs.length
    const y = hs.reduce((s, h) => s + h.y, 0) / hs.length
    return !w.orderCast(c, st, undefined, x, y)
  },
}

const BLINK_STRIKE: AbilityDef = {
  id: 'riki_blink_strike', name: 'Blink Strike', glyph: '⚔', color: '#7a6ae8',
  behavior: 'unit', target: 'any', range: [600, 700, 800, 900], castPoint: 0.3, cd: same(4, 0.1), mana: [50, 55, 60, 65], maxLevel: 4,
  charges: { max: 2, restore: [25, 21, 17, 13] },
  desc: 'Teleports behind a target unit (ally or enemy). Against an enemy, Riki strikes at once for bonus damage and briefly roots it. Holds 2 charges.',
  info: (l) => [`Bonus damage: ${L([40, 55, 70, 85], l)}`, 'Enemy slowed 100% for 0.4s', 'Charges: 2'],
  canCast(w, c, t) {
    if (t.unit === c) return 'Cannot target self'
    return null
  },
  cast(w, c, l, t) {
    const tg = t.unit!
    if (tg.dead) return
    const back = tg.facing + Math.PI
    const off = tg.radius + c.radius * 0.9 + 12
    const x0 = c.x
    const y0 = c.y
    c.x = clampMap(tg.x + Math.cos(back) * off)
    c.y = clampMap(tg.y + Math.sin(back) * off)
    c.facing = ang(c, tg)
    c.vx = 0
    c.vy = 0
    w.interrupt(c)
    w.vfx('riki_blinkstrike', { x: x0, y: y0, x2: c.x, y2: c.y, angle: c.facing })
    if (tg.team === c.team) return
    w.addBuff(tg, { id: 'blinkstrike_slow', expires: w.time + 0.4, slow: 1, src: c, color: '#7a6ae8', label: 'Blink Strike' })
    c.extra.bsBack = true
    w.applyAttack(c, tg)
    c.extra.bsBack = false
    w.damage(c, tg, L([40, 55, 70, 85], l), 'magical', { spell: true, abilityId: 'riki_blink_strike' })
    if (!tg.dead) c.order = { t: 'attack', target: tg }
  },
  ai(w, c, st, l) {
    if (c.hp < c.st.maxHp * 0.3) return false
    const r = L([600, 700, 800, 900], l) + c.st.castRange
    const t = lowest(heroesNear(w, c, r).filter((u) => dist(u, c) > 260))
    if (t) return !w.orderCast(c, st, t, t.x, t.y)
    return false
  },
}

const TRICKS: AbilityDef = {
  id: 'riki_tricks_of_the_trade', name: 'Tricks of the Trade', glyph: '✦', color: '#c06ae8',
  behavior: 'none', castPoint: 0.3, cd: [18, 16, 14, 12], mana: [45, 55, 65, 75], maxLevel: 4,
  desc: 'Riki phases out of the world for 2 seconds, striking random enemies around him from behind, four attacks in total. Each strike gains bonus damage from his agility.',
  info: (l) => ['Radius: 450', 'Attacks: 4 over 2s (first on cast)', 'Instant attacks deal 40% damage', `Agility bonus: +${L([70, 80, 90, 100], l)}% of Agility`, 'Invulnerable while channeling'],
  cast(w, c, l, t, st) {
    const pct = L([70, 80, 90, 100], l) / 100
    const iv = 2 / 3 // 4 attacks across the 2s channel, first on cast
    let acc = iv
    let n = 0
    w.addBuff(c, { id: 'riki_tricks', expires: w.time + 2.2, invuln: true, dmgReduce: 0.6, color: '#c06ae8', label: 'Tricks of the Trade' })
    w.vfx('riki_tricks_start', { x: c.x, y: c.y, unit: c, dur: 2, r: 450 })
    const pulse = () => {
      const es = w.enemiesIn(c.team, c.x, c.y, 450)
      if (!es.length) return
      const e = es[Math.floor(Math.random() * es.length)]
      c.facing = ang(c, e)
      w.vfx('riki_tricks_slash', { x: e.x, y: e.y, x2: c.x, y2: c.y })
      c.extra.bsBack = true
      w.applyAttack(c, e)
      c.extra.bsBack = false
      w.damage(c, e, c.st.agi * pct * 0.4, 'physical', { abilityId: 'riki_tricks_of_the_trade' })
    }
    c.channel = {
      st, until: w.time + 2,
      tick: (dt) => {
        acc += dt
        while (acc >= iv && n < 4) {
          acc -= iv
          n++
          pulse()
        }
      },
      end: () => w.removeBuff(c, 'riki_tricks'),
    }
  },
  ai(w, c, st) {
    if (c.hp < c.st.maxHp * 0.2) return false
    if (w.enemyHeroesNear(c, 400).length) return !w.orderCast(c, st, undefined, c.x, c.y)
    return false
  },
}

const fadeDelay = (l: number) => L([4, 3, 2], l)

const CLOAK_AND_DAGGER: AbilityDef = {
  id: 'riki_cloak_and_dagger', name: 'Cloak and Dagger', glyph: '☽', color: '#6a5ac8',
  behavior: 'passive', castPoint: 0, cd: same(3, 0), mana: same(3, 0), maxLevel: 3, ult: true,
  desc: 'Riki is permanently invisible, reappearing for a short time after attacking or casting. Attacks from behind deal bonus damage based on his agility. Grants bonus experience for kills and assists.',
  info: (l) => [`Fade delay: ${fadeDelay(l)}s`, `Backstab: +${L([0.8, 1.2, 1.6], l)} damage per Agility`, 'Back angle: 105 degrees', 'Creeps take double backstab damage', `Kill XP: +${L([150, 250, 350], l)}, assist XP: +100`, 'Move speed: +8%'],
  tick(w, c, l, dt, st) {
    const inv = c.isInvisible(w.time)
    if (inv && st.extra.wasInv === false && !c.dead) w.vfx('riki_cloak_fade', { x: c.x, y: c.y })
    st.extra.wasInv = inv
    w.addBuff(c, { id: 'riki_cloak', expires: w.time + 0.3, invis: true, fade: fadeDelay(l), haste: 0.08, color: '#6a5ac8', label: 'Cloak and Dagger' })
  },
  onAttackHit(w, a, t, l) {
    if (t.isBuilding) return 0
    const back = a.extra.bsBack || adiff(ang(t, a), t.facing + Math.PI) <= (105 / 2) * (Math.PI / 180)
    if (!back) return 0
    const bonus = a.st.agi * L([0.8, 1.2, 1.6], l) * (t.kind === 'hero' ? 1 : 2)
    w.text(t.x, t.y - 70, 'BACKSTAB', '#c8a8ff', 15)
    w.vfx('riki_backstab', { x: t.x, y: t.y, angle: a.facing })
    return bonus
  },
  onEnemyHeroDeath(w, owner, victim, killer, l, st) {
    if (st.level <= 0) return
    if (killer === owner) w.addXp(owner, L([150, 250, 350], l))
    else {
      const last = victim.damagers.get(owner.id)
      if (last !== undefined && w.time - last < 10) w.addXp(owner, 100)
    }
  },
}

/* ------------------------------------------------------------------ HEROES */

export const HEROES_G2: HeroDef[] = [
  {
    id: 'windranger', name: 'Windranger', title: 'Lyralei', attr: 'int',
    str: 18, strG: 2, agi: 19, agiG: 1.4, int: 21, intG: 2.4, hpRegen: 0.25, manaRegen: 0.25,
    baseDmg: 10.0, armor: 0, ms: 290, range: 600, bat: 1.5, ap: 0.4, projSpeed: 1250, radius: 34,
    color: '#8ad06a', color2: '#3a6a2a', roles: ['Carry', 'Disabler', 'Escape'],
    lore: 'A huntress of the Ymir forest who bends the wind itself. Her bow never misses its mark, and she is gone before the echo fades.',
    abilities: [SHACKLESHOT, POWERSHOT, WINDRUN, FOCUS_FIRE],
    skillOrder: [0, 2, 0, 1, 0, 3, 0, 2, 2, 2, 3, 1, 1, 1, 3],
    buy: ['boots', 'gloves', 'staff', 'blades', 'alacrity', 'blink'],
  },
  {
    id: 'antimage', name: 'Anti-Mage', title: 'Magina', attr: 'agi',
    str: 19, strG: 1.6, agi: 24, agiG: 2.8, int: 12, intG: 1.8, hpRegen: 0.75, manaRegen: 0,
    baseDmg: 31.0, armor: 1, ms: 310, range: 150, bat: 1.4, ap: 0.3, projSpeed: 0, radius: 34,
    color: '#4a5ab8', color2: '#1e1a4a', roles: ['Carry', 'Escape', 'Nuker'],
    lore: 'A monk who turned the gentle arts of his order against all magic after the Dead Gods destroyed his home. Mana is his prey.',
    abilities: [MANA_BREAK, AM_BLINK, COUNTERSPELL, MANA_VOID],
    skillOrder: [0, 1, 0, 2, 0, 3, 0, 1, 1, 1, 3, 2, 2, 2, 3],
    buy: ['boots', 'gloves', 'blades', 'broadsword', 'alacrity', 'chainmail'],
  },
  {
    id: 'riki', name: 'Riki', title: 'Stealth Assassin', attr: 'agi',
    str: 18, strG: 2, agi: 30, agiG: 2.4, int: 14, intG: 1.3, hpRegen: 2.5, manaRegen: 0,
    baseDmg: 29.0, armor: 0, ms: 315, range: 150, bat: 1.7, ap: 0.3, projSpeed: 0, radius: 32,
    color: '#6a5aa8', color2: '#241a4a', roles: ['Carry', 'Escape', 'Disabler'],
    lore: 'A prince of the Slithice who survived the night of his betrayal by vanishing into the shadows. He strikes from behind and is gone.',
    abilities: [SMOKE_SCREEN, BLINK_STRIKE, TRICKS, CLOAK_AND_DAGGER],
    skillOrder: [1, 0, 1, 2, 1, 3, 1, 2, 2, 2, 3, 0, 0, 0, 3],
    buy: ['boots', 'gloves', 'blades', 'broadsword', 'chainmail', 'alacrity'],
  },
]
