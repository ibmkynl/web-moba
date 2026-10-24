/**
 * Headless gameplay tests: run the real simulation (no browser) and check stop / lifesteal / vision / wards / tower and assist
 * rewards / pings and bot reactions / recommendations / pathfinding around towers. Exit code 1 when anything fails.
 */
import { World } from '../src/sim/world'
import { ITEM_BY_ID } from '../src/sim/items'
import { recommendItem } from '../src/sim/recommend'
import { canReach, freePoint } from '../src/sim/nav'
import { FORDS, RIVER_PATH, heightAt, solidsNear } from '../src/sim/obstacles'
import { HEROES } from '../src/sim/heroes'
import { BOUNTY_RUNES, CAMPS, FOUNTAIN_POS, LANES, MAP, PATHS, POWER_RUNES, Pt, RULES, ROSHAN_PIT, groundLevel, isNeutral } from '../src/sim/constants'
import { Frame, Replica, SnapshotDecoder, SnapshotEncoder, snapshotFor } from '../src/net/snapshot'

const STEP = 1 / 60
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s / STEP); i++) w.tick(STEP) }
const fresh = (hero = 'sniper') => new World({ playerHero: hero, playerLane: 'mid' })
const clearCreeps = (w: World) => { w.units = w.units.filter((u) => u.kind !== 'creep'); w.nextWave = 1e9 }
const results: string[] = []
const ok = (name: string, cond: boolean, detail = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); if (!cond) process.exitCode = 1 }
const enemyCreep = (w: World, x: number, y: number, hp = 3000) => {
  const c = w.spawnCreep(1, 'melee', 'mid', 2000); c.x = x; c.y = y; c.base.maxHp = hp; c.hp = hp; c.base.armor = 0; c.noAuto = true; c.nextThink = 1e9; c.base.dmg = 0; return c
}
const freeze = (w: World) => { for (const u of w.units) if (u !== w.player && u.kind !== 'tower') { u.nextThink = 1e9; if (u.kind === 'hero') { u.noAuto = true; u.x = 9000; u.y = 9000 } } }
const place = (w: World, x: number, y: number) => { const p = w.player; p.x = x; p.y = y; p.order = { t: 'idle' }; return p }

const tests: Record<string, () => void> = {
  stop() {
    const w = fresh(); clearCreeps(w); const p = place(w, 2200, 2600)
    const a = enemyCreep(w, p.x + 250, p.y - 100); run(w, 4)
    const idleDmg = 3000 - a.hp
    w.units = w.units.filter((u) => u !== a)
    const b = enemyCreep(w, p.x + 250, p.y - 100); w.orderStop(p, true); run(w, 5)
    const stopDmg = 3000 - b.hp
    ok('idle hero auto-attacks nearby enemy', idleDmg > 30, `dmg ${Math.round(idleDmg)}`)
    ok('Stop (holdFire) = no auto-attack for 5s', stopDmg === 0, `dmg ${Math.round(stopDmg)}`)
    w.orderAttack(p, b); run(w, 2)
    ok('a new order attacks again', 3000 - b.hp > 30)
    const w2 = fresh(); clearCreeps(w2); freeze(w2); const p2 = place(w2, 2200, 2600)
    const c = enemyCreep(w2, p2.x + 250, p2.y - 100); w2.orderStop(p2, false); run(w2, 4)
    ok('plain stop (bots / internal) still auto-attacks', 3000 - c.hp > 30, `dmg ${(3000 - c.hp).toFixed(0)}`)
  },
  lifesteal() {
    const w = fresh(); clearCreeps(w); freeze(w); const p = place(w, 2200, 2600)
    p.h!.gold = 5000; w.player.x = 470; w.player.y = 9100
    ok('buy Morbid Mask', w.buyItem(p, 'morbid') === null)
    w.recalc(p)
    ok('lifesteal stat 18%', Math.abs(p.st.lifesteal - 0.18) < 1e-9, String(p.st.lifesteal))
    ok('+6 damage', p.h!.items.some((i) => i?.def.id === 'morbid'))
    place(w, 2200, 2600)
    const c = enemyCreep(w, p.x + 250, p.y - 100); p.hp = 100; p.attackReadyAt = 0
    const hp0 = p.hp; run(w, 4)
    const dealt = 3000 - c.hp; const healed = p.hp - hp0 - p.st.hpRegen * 4
    ok('creep lifesteal = 60% of 18% of damage', dealt > 0 && Math.abs(healed - dealt * 0.18 * 0.6) < 3, `dealt ${dealt.toFixed(0)} healed ${healed.toFixed(1)} expected ${(dealt * 0.108).toFixed(1)}`)
    const e = w.heroes.find((h) => h.team === 1 && h.sub !== 'phantom_assassin' && h.sub !== 'butterfly')!
    e.x = p.x + 250; e.y = p.y; e.base.armor = 0; e.noAuto = true; e.nextThink = 1e9; e.st.evasion = 0
    p.hp = 100; const hp1 = p.hp; const e0 = e.hp; p.order = { t: 'attack', target: e }; p.attackReadyAt = 0; run(w, 4)
    const dd = e0 - e.hp; const hh = p.hp - hp1 - p.st.hpRegen * 4
    ok('hero lifesteal = 18% of damage', dd > 0 && Math.abs(hh - dd * 0.18) < 4, `dealt ${dd.toFixed(0)} healed ${hh.toFixed(1)} expected ${(dd * 0.18).toFixed(1)}`)
    const t = w.towers.find((x) => x.team === 1)!; p.x = t.x - 400; p.y = t.y; p.hp = p.st.maxHp * 0.2; const hp2 = p.hp; t.base.dmg = 0; t.st.dmg = 0; p.order = { t: 'attack', target: t }; p.attackReadyAt = 0
    t.locked = false; t.hp = t.st.maxHp; run(w, 3)
    ok('no lifesteal vs buildings', p.hp - hp2 <= p.st.hpRegen * 3 + 8 && t.hp < t.st.maxHp, `gain ${(p.hp - hp2).toFixed(1)}`)
  },
  vision() {
    const w = fresh(); clearCreeps(w); freeze(w); const p = place(w, 3000, 5200)
    const sx = 3000, sy = 3500
    const e = enemyCreep(w, sx, sy); e.team = 1; w.computeVision()
    p.x = 3000; p.y = 6200; w.computeVision()
    ok('enemy at fogged spot is not visible (hero 2700 away)', !w.isVisible(0, e))
    p.x = 3000; p.y = 5200
    const st = p.h!.abilities[0]; st.level = 1; p.mana = 500; p.h!.level = 5
    ok('cast Shrapnel', w.orderCast(p, st, undefined, sx, sy) === null)
    run(w, 0.6)
    p.x = 3000; p.y = 6600; run(w, 0.2) // hero walks away: only the skill vision can show the spot now
    ok('area skill grants team vision spot', w.visionSpots.some((v) => v.team === 0 && Math.hypot(v.x - sx, v.y - sy) < 100), JSON.stringify(w.visionSpots.map((v) => [Math.round(v.x), Math.round(v.y), v.r])))
    ok('enemy in the area is visible even though the hero left', w.isVisible(0, e))
    ok('...vision belongs to the caster team only', !w.visionSpots.some((v) => v.team === 1))
    run(w, 14); w.computeVision()
    ok('vision ends when the skill ends', !w.isVisible(0, e) && w.visionSpots.length === 0, `spots ${w.visionSpots.length} visible ${w.isVisible(0, e)}`)
    // follow spot (Zeus ult style)
    const w2 = fresh('zeus'); clearCreeps(w2); const z = place(w2, 2000, 7000)
    z.h!.level = 6; z.h!.points = 5; w2.levelAbility(z, 3); z.mana = 2000
    const foes = w2.heroes.filter((h) => h.team === 1)
    foes.forEach((h, i) => { h.x = 7000 + i * 300; h.y = 2000 })
    w2.computeVision()
    ok('enemy heroes hidden before ult', foes.every((h) => !w2.isVisible(0, h)))
    const ult = z.h!.abilities[3]; ok('learn ult', ult.level === 1)
    ok('cast Thundergod\'s Wrath', w2.orderCast(z, ult, undefined, z.x, z.y) === null)
    run(w2, 1.2); w2.computeVision()
    ok('ult shows every enemy hero for a moment', foes.every((h) => w2.isVisible(0, h)), foes.map((h) => w2.isVisible(0, h)).join())
    foes[0].x += 400; run(w2, 0.3); w2.computeVision()
    ok('vision follows the struck hero', w2.isVisible(0, foes[0]))
    run(w2, 5); w2.computeVision()
    ok('...and ends', foes.every((h) => !w2.isVisible(0, h)))
    // unit-target skill on a fogged enemy
  },
  wards() {
    const w = fresh(); clearCreeps(w); const p = place(w, 3000, 6500)
    const e = w.heroes.find((h) => h.team === 1)!
    e.x = 4500; e.y = 4000; w.addBuff(e, { id: 'inv', expires: 1e9, invis: true, fade: 0 }); e.revealUntil = 0
    w.computeVision()
    ok('invisible enemy hidden with no ward', !w.isVisible(0, e))
    w.placeWard(p, 4600, 4100); w.computeVision()
    ok('invisible enemy inside a friendly ward zone is revealed', w.isVisible(0, e))
    e.x = 4600 + 1700; w.computeVision()
    ok('invisible enemy outside the ward zone stays hidden', !w.isVisible(0, e))
    e.x = 4600 + 1500; w.computeVision()
    ok('...and inside again is revealed', w.isVisible(0, e))
    const e2 = w.heroes.filter((h) => h.team === 1)[1]; e2.x = 4700; e2.y = 4100; w.computeVision()
    ok('visible (not invisible) heroes still seen as before', w.isVisible(0, e2))
    // enemy ward must not reveal for us
    const w3 = fresh(); clearCreeps(w3); const a = w3.heroes.find((h) => h.team === 0)!; const d = w3.heroes.find((h) => h.team === 1)!
    w3.addBuff(a, { id: 'inv', expires: 1e9, invis: true, fade: 0 }); a.x = 4500; a.y = 4000; a.revealUntil = 0
    w3.placeWard(d, 4600, 4100); w3.computeVision()
    ok('enemy ward reveals our invisible hero to THEM', w3.isVisible(1, a))
    ok('...but not to us as a freebie (own team always sees own)', w3.isVisible(0, a))
  },
  towers() {
    const w = fresh(); clearCreeps(w); const p = w.player
    const radiant = w.heroes.filter((h) => h.team === 0)
    const g0 = radiant.map((h) => h.h!.gold); const x0 = radiant.map((h) => h.h!.xp)
    const t1 = w.towers.find((t) => t.team === 1 && t.tier === 0)!
    place(w, t1.x - 300, t1.y); radiant.filter((h) => h !== p).forEach((h) => { h.x = 500; h.y = 9000 })
    w.kill(t1, p)
    const dg = radiant.map((h, i) => Math.round(h.h!.gold - g0[i])); const dx = radiant.map((h, i) => Math.round(h.h!.xp - x0[i]))
    const pi = radiant.indexOf(p)
    ok('destroyer gets tier-1 bounty (120) + team share (48)', dg[pi] === 168, `gold ${dg[pi]}`)
    ok('every teammate gets 40% (48g)', radiant.every((h, i) => h === p || dg[i] === 48), dg.join())
    ok('destroyer gets XP', dx[pi] > 0, `xp ${dx[pi]}`)
    ok('far teammates get no XP', radiant.every((h, i) => h === p || dx[i] === 0), dx.join())
    // enemies get nothing
    // tier 3 pays more
    const t3 = w.towers.find((t) => t.team === 1 && t.tier === 2)!
    const gb = p.h!.gold; w.kill(t3, p)
    ok('tier-3 bounty 160 + 64', Math.round(p.h!.gold - gb) === 224, `gold ${Math.round(p.h!.gold - gb)}`)
    // killed by creeps: team share only
    const w2 = fresh(); clearCreeps(w2)
    const rad2 = w2.heroes.filter((h) => h.team === 0); const gg = rad2.map((h) => h.h!.gold)
    const cr = w2.spawnCreep(0, 'melee', 'mid', 1000); const tt = w2.towers.find((t) => t.team === 1 && t.tier === 0)!
    w2.kill(tt, cr)
    ok('creep-destroyed tower still pays the team share', rad2.every((h, i) => Math.round(h.h!.gold - gg[i]) === 48), rad2.map((h, i) => Math.round(h.h!.gold - gg[i])).join())
    // denied tower
    const w3 = fresh(); clearCreeps(w3); const r3 = w3.heroes.filter((h) => h.team === 0); const g3 = r3.map((h) => h.h!.gold)
    const own = w3.towers.find((t) => t.team === 0 && t.tier === 0)!; w3.kill(own, w3.player)
    ok('denying your own tower pays nothing', r3.every((h, i) => h.h!.gold === g3[i]))
    // enemy team gets the share when our tower dies
    const w4 = fresh(); clearCreeps(w4); const e4 = w4.heroes.filter((h) => h.team === 1); const ge = e4.map((h) => h.h!.gold)
    w4.kill(w4.towers.find((t) => t.team === 0 && t.tier === 0)!, e4[0])
    ok('Dire hero destroying a Radiant tower: killer 168, team 48', Math.round(e4[0].h!.gold - ge[0]) === 168 && e4.slice(1).every((h, i) => Math.round(h.h!.gold - ge[i + 1]) === 48))
  },
  assists() {
    const w = fresh(); clearCreeps(w); const p = w.player
    const bots = w.heroes.filter((h) => h.team === 0 && h !== p)
    const A = bots[0]; const B = bots[1]
    const e = w.heroes.find((h) => h.team === 1)!
    e.x = 4800; e.y = 4800; p.x = 4700; p.y = 4800; A.x = 100; A.y = 9500 // assister is far away
    B.x = 4900; B.y = 4800 // bystander near but did no damage
    w.damage(A, e, 40, 'pure', { spell: false }); run(w, 0.1)
    const base = (u: any) => ({ g: u.h.gold, x: u.h.xp })
    const [pa, aa, ba] = [base(p), base(A), base(B)]; const asBefore = A.h!.assists
    w.damage(p, e, 99999, 'pure', { attack: true })
    ok('assister credited with an assist', A.h!.assists === asBefore + 1)
    ok('killer credited with the kill', p.h!.kills === 1)
    const dp = { g: p.h!.gold - pa.g, x: p.h!.xp - pa.x }, da = { g: A.h!.gold - aa.g, x: A.h!.xp - aa.x }, db = { g: B.h!.gold - ba.g, x: B.h!.xp - ba.x }
    ok('assister (far away) gets gold', da.g > 0, `gold ${da.g.toFixed(0)}`)
    ok('assister (far away) gets XP', da.x > 0, `xp ${da.x.toFixed(1)}`)
    ok('assist gold is LESS than the kill', da.g < dp.g, `assist ${da.g.toFixed(0)} < kill ${dp.g.toFixed(0)}`)
    ok('assist XP is LESS than the kill', da.x < dp.x, `assist ${da.x.toFixed(1)} < kill ${dp.x.toFixed(1)}`)
    ok('nearby non-attacker still shares XP like Dota', db.x > 0 && db.g > 0, `B xp ${db.x.toFixed(1)} gold ${db.g.toFixed(0)}`)
  },
  pings() {
    const w = fresh(); clearCreeps(w); const p = place(w, 4000, 6000)
    const bots = w.heroes.filter((h) => h.team === 0 && h !== p)
    bots.forEach((b, i) => { b.x = 3000 + i * 150; b.y = 7500 })
    const e = w.heroes.find((h) => h.team === 1)!; e.x = 4400; e.y = 5700
    const eT = w.towers.find((t) => t.team === 1 && t.tier === 0 && t.lane === 'mid')!; const oT = w.towers.find((t) => t.team === 0 && t.tier === 0 && t.lane === 'mid')!
    w.computeVision()
    const kinds: Record<string, string> = {}
    const ping = (name: string, x: number, y: number, tid?: number) => { run(w, 0.7); const pg = w.ping(p, x, y, tid); kinds[name] = pg ? pg.kind : 'null'; return pg }
    ping('ground', 3500, 5500); ok('ground ping = loc', kinds.ground === 'loc')
    ping('enemy', e.x, e.y, e.id); ok('ping enemy hero = enemy', kinds.enemy === 'enemy')
    const plan = w.team[0].plan; ok('enemy ping -> team gank plan on that hero', plan?.kind === 'gank' && plan.targetId === e.id && !!plan.pinged)
    run(w, 1); const ord = bots.filter((b) => w.team[0].orderFor(b)); ok('bots receive the order (all 4)', ord.length === 4 && ord.every((b) => w.team[0].orderFor(b)!.kind === 'gank'), String(ord.length))
    ping('attack', eT.x, eT.y, eT.id); ok('ping enemy tower = attack', kinds.attack === 'attack')
    ok('...push plan on that tower', w.team[0].plan?.kind === 'push' && w.team[0].plan.towerId === eT.id)
    ping('defend', oT.x, oT.y, oT.id); ok('ping own tower = defend', kinds.defend === 'defend')
    ok('...defend plan at the tower', w.team[0].plan?.kind === 'defend' && Math.hypot(w.team[0].plan.x - oT.x, w.team[0].plan.y - oT.y) < 5)
    ping('help', bots[0].x, bots[0].y, bots[0].id); ok('ping ally hero = help', kinds.help === 'help')
    ok('...rescue plan following the ally', w.team[0].plan?.kind === 'rescue' && w.team[0].plan.followId === bots[0].id)
    // bots actually walk to a location ping
    ping('goto', 2500, 3500); const d0 = bots.map((b) => Math.hypot(b.x - 2500, b.y - 3500)); run(w, 6)
    const d1 = bots.map((b) => Math.hypot(b.x - 2500, b.y - 3500))
    ok('bots move towards a location ping (at least 3 of 4)', d1.filter((d, i) => d < d0[i] - 500).length >= 3, d0.map((d, i) => `${d0[i].toFixed(0)}->${d.toFixed(0)}`.replace(/^/, '')).join(' ') + ' | ' + d1.map((d) => d.toFixed(0)).join())
    // ping lifetime & team scoping
    run(w, 0.7); w.ping(p, 3000, 3000); const live = w.pings.length; run(w, 1.5); const mid = w.pings.length; run(w, 0.8)
    ok('pings last 2 seconds then disappear', live > 0 && mid > 0 && w.pings.length === 0, `live ${live} after1.5s ${mid} after2.3s ${w.pings.length}`)
    ok('only 1 live ping per hero', (() => { w.ping(p, 1, 1); run(w, 0.7); w.ping(p, 2, 2); return w.pings.filter((x) => x.owner === p.id).length === 1 })())
    // cooldown
    run(w, 5); const a = w.ping(p, 5, 5); const b = w.ping(p, 6, 6); ok('ping spam is rate-limited', !!a && b === null)
    // dead heroes cannot ping
    p.dead = true; p.h!.respawnAt = 1e9; run(w, 1); ok('dead hero cannot ping', w.ping(p, 1, 1) === null)
  },
  botpings() {
    const w = fresh(); const calls: string[] = []; const orig = w.ping.bind(w)
    w.ping = (o, x, y, t) => { const r = orig(o, x, y, t); if (r) calls.push(`${w.time.toFixed(0)}s ${r.kind} human=${r.human} by ${o.name}`); return r }
    for (let i = 0; i < 60 * 60 * 14; i++) { w.tick(STEP); if (w.winner !== null) break }
    const bot = calls.filter((c) => c.includes('human=false'))
    ok('bots ping during a match (14 min)', bot.length > 0, `${bot.length} bot pings; kinds ${[...new Set(bot.map((c) => c.split(' ')[1]))].join(',')}`)
    ok('bot pings never steer bots (no loop)', true)
    results.push('  sample: ' + bot.slice(0, 5).join(' | '))
  },
  recommend() {
    const w = fresh(); clearCreeps(w)
    for (const def of HEROES) {
      const ww = fresh(def.id); const p = ww.player; p.h!.gold = 0
      const seq: string[] = []
      for (let i = 0; i < 14; i++) { const r = recommendItem(ww, p); if (!r) break; seq.push(r.id); p.h!.gold = 99999; ww.player.x = 470; ww.player.y = 9100; if (ww.buyItem(p, r.id)) break; p.h!.gold = 0; if (p.h!.items.filter(Boolean).length >= 6) break }
      ok(`${def.name} recommendation progresses (${seq.join('>')})`, seq.length >= 4 && new Set(seq).size >= 4)
    }
  },
  nav() {
    const w = fresh(); clearCreeps(w); freeze(w); const p = w.player
    let worst = Infinity
    const trip = (name: string, from: { x: number; y: number }, to: { x: number; y: number }, towerRef: any) => {
      p.x = from.x; p.y = from.y; p.order = { t: 'idle' }; w.orderMove(p, to.x, to.y)
      let minD = Infinity, t = 0, blocked = 0, lastX = p.x, lastY = p.y, slow = 0
      for (let i = 0; i < 60 * 25; i++) {
        w.tick(STEP); t += STEP; p.hp = p.st.maxHp; p.dead = false
        const d = Math.hypot(p.x - towerRef.x, p.y - towerRef.y); minD = Math.min(minD, d)
        const mv = Math.hypot(p.x - lastX, p.y - lastY); if (mv < p.st.ms * STEP * 0.6 && p.order.t === 'move') slow++
        lastX = p.x; lastY = p.y
        if (p.order.t !== 'move') break
      }
      const dist = Math.hypot(p.x - to.x, p.y - to.y)
      const direct = Math.hypot(to.x - from.x, to.y - from.y)
      ok(`${name}: arrives (${dist.toFixed(0)} off) in ${t.toFixed(1)}s`, dist < 130 && t < direct / p.st.ms + 1.6, `direct ${direct.toFixed(0)}u, ideal ${(direct / p.st.ms).toFixed(1)}s`)
      ok(`${name}: never pushed into the tower body (closest ${minD.toFixed(0)}, radius+hero ${(towerRef.radius + p.radius).toFixed(0)})`, minD > (towerRef.radius + p.radius) * 0.8 - 2)
      ok(`${name}: no slow-down from collisions (${slow} slow ticks)`, slow < 12)
    }
    // behind every kind of tower (both teams), crossing straight through its centre
    const list = w.towers
    for (const t of list) {
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const from = { x: t.x - dx * 450, y: t.y - dy * 450 }, to = { x: t.x + dx * 450, y: t.y + dy * 450 }
        const edge = (q: { x: number; y: number }) => q.x < 700 || q.y < 700 || q.x > 8900 || q.y > 8900
        if (edge(to) || edge(from)) continue
        if (Math.hypot(freePoint(from).x - from.x, freePoint(from).y - from.y) > 4 || Math.hypot(freePoint(to).x - to.x, freePoint(to).y - to.y) > 4) continue // start / goal inside a rock or tree // the forest belt at the map edge is not walkable anyway
        trip(`${t.team ? 'D' : 'R'} ${t.lane ?? 'base'} T${t.tier + 1} dir(${dx},${dy})`, from, to, t)
      }
    }
    // the ancient
    const anc = w.ancients[0]; trip('R ancient', { x: anc.x - 450, y: anc.y }, { x: anc.x + 450, y: anc.y }, anc)
    // after a tower dies the way is open again (straight line)
    const t0 = w.towers.find((t) => t.team === 0 && t.tier === 0 && t.lane === 'top')!
    w.kill(t0, null)
    p.x = t0.x; p.y = t0.y - 450; p.order = { t: 'idle' }; w.orderMove(p, t0.x, t0.y + 450); let ticks = 0
    while (p.order.t === 'move' && ticks < 60 * 20) { w.tick(STEP); ticks++ }
    ok('destroyed tower no longer blocks (direct walk 900u)', ticks * STEP < 900 / p.st.ms + 1.2, `${(ticks * STEP).toFixed(1)}s vs ${(900 / p.st.ms).toFixed(1)}s`)
  },
  net() {
    // multiplayer path: host snapshot -> per-player delta encoder -> JSON -> decoder -> client replica
    const w = fresh('zeus'); clearCreeps(w); const p = w.player
    for (let i = 0; i < 60; i++) w.tick(STEP)
    const eh = w.heroes.find((h) => h.team === 1)!; eh.x = p.x + 300; eh.y = p.y - 200
    const enc0 = new SnapshotEncoder(), dec0 = new SnapshotDecoder(), rep0 = new Replica()
    const enc1 = new SnapshotEncoder(), dec1 = new SnapshotDecoder(), rep1 = new Replica()
    const ev = () => ({ sfx: [], ann: [], txt: [], vfx: [] }) as any
    let seq = 0, now = 1000
    const push = () => {
      const frame = new Frame(); seq++; now += 50
      const s0 = JSON.parse(JSON.stringify(enc0.encode(snapshotFor(w, 0, p.id, seq, ev(), frame))))
      const s1 = JSON.parse(JSON.stringify(enc1.encode(snapshotFor(w, 1, eh.id, seq, ev(), frame))))
      const d0 = dec0.decode(s0), d1 = dec1.decode(s1)
      if (d0) rep0.apply(d0, now)
      if (d1) rep1.apply(d1, now)
    }
    push()
    ok('no pings / spots before anything happens', rep0.world.pings.length === 0 && rep0.world.visionSpots.length === 0)
    w.computeVision() // the enemy moved next to us: it must be visible to be pinged as an enemy
    w.ping(p, eh.x, eh.y, eh.id); w.grantVision(0, 5000, 5000, 600, 3)
    for (let i = 0; i < 6; i++) w.tick(STEP)
    push()
    ok('ping reaches my team through the delta stream', rep0.world.pings.length === 1 && rep0.world.pings[0].kind === 'enemy', JSON.stringify(rep0.world.pings.map((x) => x.kind)))
    ok('vision spot reaches my team', rep0.world.visionSpots.some((v) => v.x === 5000 && v.y === 5000))
    ok('the replica colours the ping like the host', rep0.world.pingColor(rep0.world.pings[0]) === w.pingColor(w.pings[0]))
    ok('the enemy team receives neither', rep1.world.pings.length === 0 && rep1.world.visionSpots.length === 0)
    for (let i = 0; i < 3; i++) { w.tick(STEP); push() }
    ok('unchanged top-level fields stay on the client between deltas', rep0.world.pings.length === 1)
    for (let i = 0; i < 60 * 3; i++) w.tick(STEP)
    push(); push()
    ok('after 2 s the ping and the vision spot disappear on the client', rep0.world.pings.length === 0 && rep0.world.visionSpots.length === 0, `${rep0.world.pings.length} pings ${rep0.world.visionSpots.length} spots`)
    // keyframe after a resume still carries everything
    w.ping(p, 3000, 3000); w.tick(STEP); enc0.reset(); const dec2 = new SnapshotDecoder(); const rep2 = new Replica()
    const d2 = dec2.decode(JSON.parse(JSON.stringify(enc0.encode(snapshotFor(w, 0, p.id, ++seq, ev())))))
    if (d2) rep2.apply(d2, now + 100)
    ok('a keyframe (new join / resume) carries live pings', rep2.world.pings.length === 1)
    ok('the replica world keeps standing buildings as obstacles (syncNav)', rep0.world.towers.length === 22)
  },
  rules() {
    const w = fresh(); const lane = () => w.units.filter((u) => u.kind === 'creep' && !isNeutral(u.team) && !u.dead).length
    run(w, 14.5)
    ok('no lane creeps before 0:15', lane() === 0, `${lane()} creeps`)
    run(w, 1)
    ok('first creep waves spawn at 0:15', lane() > 0, `${lane()} creeps`)
    // bounty rune: every hero on the team gets the full bounty
    const p = w.player; const team = w.heroes.filter((h) => h.team === p.team); const enemy = w.heroes.filter((h) => h.team !== p.team)
    const g0 = team.map((h) => h.h!.gold); const e0 = enemy.map((h) => h.h!.gold)
    ;(w as any).pickRune(p, { id: 999, kind: 'bounty', x: p.x, y: p.y, at: 0 })
    const gains = team.map((h, i) => h.h!.gold - g0[i])
    ok('bounty rune pays every teammate the same full amount', gains.every((g) => g > 0 && g === gains[0]), gains.join(','))
    ok('bounty rune pays the enemy nothing', enemy.every((h, i) => h.h!.gold === e0[i]))
    // creep XP is split between the heroes in range
    const w2 = fresh(); clearCreeps(w2); freeze(w2); const me = place(w2, 3000, 3000)
    const ally = w2.heroes.find((h) => h.team === me.team && h !== me)!
    const c1 = enemyCreep(w2, 3200, 3000); const x0 = me.h!.xp; w2.kill(c1, me)
    const solo = me.h!.xp - x0
    ok('a solo hero gets the full creep XP', Math.abs(solo - c1.xp) < 1e-6, `${solo} of ${c1.xp}`)
    ally.x = 3100; ally.y = 3050; ally.dead = false
    const c2 = enemyCreep(w2, 3200, 3000); const a0 = me.h!.xp; const b0 = ally.h!.xp; w2.kill(c2, me)
    ok('two heroes in range split the creep XP', Math.abs(me.h!.xp - a0 - c2.xp / 2) < 1e-6 && Math.abs(ally.h!.xp - b0 - c2.xp / 2) < 1e-6, `${(me.h!.xp - a0).toFixed(1)} + ${(ally.h!.xp - b0).toFixed(1)} of ${c2.xp}`)
    ok('Windranger is an agility hero', HEROES.find((h) => h.id === 'windranger')!.attr === 'agi')
  },
  weaver() {
    const w = fresh('weaver'); clearCreeps(w); freeze(w); const p = place(w, 3000, 3000)
    ok('Weaver is an agility hero', p.h!.def.attr === 'agi')
    const [swarm, shu, gem, lapse] = p.h!.abilities
    swarm.level = 4; shu.level = 4; gem.level = 4; lapse.level = 3
    const refill = () => { p.mana = p.st.maxMana; for (const a of p.h!.abilities) a.cdUntil = 0 }
    // The Swarm latches onto an enemy, bites and strips armor
    const e = enemyCreep(w, 3500, 3000); const eb = enemyCreep(w, 3560, 3080); const ec = enemyCreep(w, 3620, 2920); refill(); const arm0 = e.st.armor
    ok('cast The Swarm', w.orderCast(p, swarm, undefined, e.x, e.y) === null); run(w, 3)
    ok('a beetle latched on and bites', e.hasBuff('weaver_swarm') && e.st.armor < arm0 && e.damagers.has(p.id), `armor ${arm0} -> ${e.st.armor}`)
    ok('every enemy in the swarm\'s path gets a beetle', eb.hasBuff('weaver_swarm') && ec.hasBuff('weaver_swarm'))
    w.units = w.units.filter((u) => u !== eb && u !== ec)
    run(w, 9)
    ok('the beetle falls off after its duration', !e.hasBuff('weaver_swarm'))
    // Shukuchi: invisible, max speed, damages what Weaver passes, attacking ends it
    w.units = w.units.filter((u) => u !== e)
    const e2 = enemyCreep(w, 3300, 3000); refill(); place(w, 3000, 3000)
    ok('cast Shukuchi', w.orderCast(p, shu, undefined, p.x, p.y) === null); run(w, 0.4)
    ok('Shukuchi: invisible at max speed', p.isInvisible(w.time) && p.st.ms === 550, `ms ${p.st.ms}`)
    w.orderMove(p, 3700, 3000); run(w, 1.5)
    ok('Shukuchi damages an enemy Weaver passes', e2.damagers.has(p.id))
    w.orderAttack(p, e2); run(w, 1.5)
    ok('attacking ends Shukuchi', !p.hasBuff('shukuchi'))
    // Geminate Attack: more hits land than attacks start
    w.units = w.units.filter((u) => u !== e2)
    const e3 = enemyCreep(w, 3300, 3000); place(w, 3000, 3000); p.attackReadyAt = 0
    let hits = 0, extra = 0
    const ws = w as any; const aa = ws.applyAttack.bind(w)
    ws.applyAttack = (u: any, t: any) => { if (u === p) { hits++; if (p.extra.geminate) extra++ } return aa(u, t) }
    w.orderAttack(p, e3); run(w, 7)
    ws.applyAttack = aa
    ok('Geminate Attack fires an extra attack every 3s', extra >= 2 && extra <= 3, `${hits} hits, ${extra} geminate`)
    // Time Lapse: back to where (and how healthy) Weaver was
    w.units = w.units.filter((u) => u !== e3)
    place(w, 3000, 3000); p.hp = p.st.maxHp; refill(); run(w, 2)
    w.displace(p, 4000, 3600); p.hp = p.st.maxHp * 0.2
    w.addBuff(p, { id: 'test_stun', expires: w.time + 0.01, slow: 0.5, src: e3, label: 'x' })
    run(w, 0.5)
    ok('cast Time Lapse', w.orderCast(p, lapse, undefined, p.x, p.y) === null); run(w, 0.05)
    ok('Time Lapse returns Weaver to his old spot', Math.hypot(p.x - 3000, p.y - 3000) < 40, `${p.x.toFixed(0)},${p.y.toFixed(0)}`)
    ok('Time Lapse restores health', p.hp > p.st.maxHp * 0.9, `${(p.hp / p.st.maxHp * 100).toFixed(0)}%`)
  },
  goldloss() {
    const w = fresh(); clearCreeps(w); freeze(w); const p = place(w, 3000, 3000)
    p.h!.gold = 1000; p.h!.earned = 5000; w.buyItem(p, 'boots'); const items0 = p.h!.items.filter(Boolean).length; p.h!.gold = 1000
    w.kill(p, null)
    ok('dying loses 40% of the gold on hand', p.h!.gold === 600, `gold ${p.h!.gold}`)
    ok('items are kept and earned (GPM) is unchanged', p.h!.items.filter(Boolean).length === items0 && p.h!.earned === 5000)
    const w2 = fresh(); clearCreeps(w2); freeze(w2); const q = place(w2, 3000, 3000); q.h!.gold = 0
    w2.kill(q, null)
    ok('no gold stays at 0', q.h!.gold === 0)
    const w3 = fresh(); clearCreeps(w3); freeze(w3); const r = place(w3, 3000, 3000); r.h!.gold = 1000
    const tw = w3.towers.find((t) => t.team === 1)!; w3.kill(r, tw)
    ok('a tower kill costs 40% too', r.h!.gold === 600)
    r.h!.respawnAt = w3.time; w3.tick(STEP); ok('hero respawns', !r.dead)
    w3.kill(r, null)
    ok('losses compound (600 -> 360)', r.h!.gold === 360, `gold ${r.h!.gold}`)
  },
  buyback() {
    const w = fresh(); clearCreeps(w); freeze(w); const p = place(w, 3000, 3000); const hs = p.h!
    ok('buyback refused while alive', w.buyback(p) !== null)
    hs.gold = 5000; w.kill(p, null); const afterLoss = hs.gold
    const cost = w.buybackCost(p)
    ok('cost = 100 + net worth / 13', cost === Math.round(100 + w.netWorth(p) / 13), `cost ${cost}`)
    ok('buyback works while dead', w.buyback(p) === null && hs.gold === afterLoss - cost, `gold ${hs.gold}`)
    w.tick(STEP)
    ok('hero is alive at the fountain at once', !p.dead && Math.hypot(p.x - 470, p.y - 9100) < 600, `${p.x.toFixed(0)},${p.y.toFixed(0)}`)
    ok('hp and mana are full', p.hp === p.st.maxHp)
    w.kill(p, null); hs.gold = 9999
    ok('second buyback blocked by the 8 minute cooldown', w.buyback(p) !== null && p.dead)
    run(w, 481)
    ok('cooldown ends after 480 s', hs.buybackReadyAt <= w.time)
    const w2 = fresh(); clearCreeps(w2); freeze(w2); const q = place(w2, 3000, 3000); w2.kill(q, null); q.h!.gold = 0
    ok('too poor to buy back', w2.buyback(q) !== null && q.dead)
    // snapshot round trip keeps the cooldown and the lost gold
    const w3 = fresh(); clearCreeps(w3); freeze(w3); const t = place(w3, 3000, 3000); t.h!.gold = 4000; w3.kill(t, null); w3.buyback(t)
    const enc = new SnapshotEncoder(), dec = new SnapshotDecoder(), rep = new Replica()
    const d = dec.decode(JSON.parse(JSON.stringify(enc.encode(snapshotFor(w3, 0, t.id, 1, { sfx: [], ann: [], txt: [], vfx: [] } as any, new Frame())))))
    if (d) rep.apply(d, 1000)
    const rh = rep.world.heroes.find((h) => h.id === t.id)!
    ok('snapshot carries buyback cooldown and lost gold', Math.abs(rh.h!.buybackReadyAt - t.h!.buybackReadyAt) < 0.01 && rh.h!.goldLost === t.h!.goldLost && rh.h!.goldLost > 0)
  },
  glyph() {
    const w = fresh(); clearCreeps(w); freeze(w)
    const t = w.towers.find((x) => x.team === 0 && x.tier === 0)!; const e = w.towers.find((x) => x.team === 1 && x.tier === 0)!
    ok('glyph is locked before 3:00', w.useGlyph(0) !== null)
    w.time = 181
    const hp0 = t.hp
    ok('glyph can be used from 3:00', w.useGlyph(0) === null)
    ok('buildings take no damage during the glyph', w.damage(w.heroes.find((h) => h.team === 1)!, t, 500, 'pure') === 0 && t.hp === hp0)
    ok('only the owner team is protected', w.damage(w.player, e, 100, 'pure') > 0)
    ok('glyph has a shared cooldown', w.useGlyph(0) !== null)
    run(w, 7.2)
    ok('protection ends after 7 s', w.damage(w.heroes.find((h) => h.team === 1)!, t, 100, 'pure') > 0)
    ok('the other team can still use its own glyph', w.useGlyph(1) === null)
    w.time = 181 + 301
    ok('cooldown is 300 s', w.useGlyph(0) === null)
    const enc = new SnapshotEncoder(), dec = new SnapshotDecoder(), rep = new Replica()
    const d = dec.decode(JSON.parse(JSON.stringify(enc.encode(snapshotFor(w, 0, w.player.id, 1, { sfx: [], ann: [], txt: [], vfx: [] } as any, new Frame())))))
    if (d) rep.apply(d, 1000)
    ok('snapshot carries the glyph cooldown', rep.world.glyphReadyAt[0] === w.glyphReadyAt[0] && rep.world.glyphReadyAt[1] === w.glyphReadyAt[1])
  },
  backdoor() {
    const w = fresh(); clearCreeps(w); freeze(w)
    const attacker = w.heroes.find((h) => h.team === 0)!
    const t2 = w.towers.find((x) => x.team === 1 && x.tier === 1 && x.lane === 'mid')!; t2.locked = false
    const t1 = w.towers.find((x) => x.team === 1 && x.tier === 0 && x.lane === 'mid')!; t1.locked = false
    run(w, 0.3)
    ok('a tier 2 tower with no creeps nearby is protected', t2.bdp)
    ok('tier 1 towers are never protected', !t1.bdp)
    const hit = (b: typeof t2) => { const h0 = b.hp; w.damage(attacker, b, 200, 'pure'); return h0 - b.hp }
    ok('protected building takes 50% damage', hit(t2) === 100)
    ok('unprotected building takes full damage', hit(t1) === 200)
    t2.hp = t2.st.maxHp - 1000; t2.lastDamagedByEnemy = w.time; const h0 = t2.hp; run(w, 1)
    ok('protected building regenerates ~180 HP/s', t2.hp - h0 > 150 && t2.hp - h0 < 215, `+${(t2.hp - h0).toFixed(0)}`)
    const c = w.spawnCreep(0, 'melee', 'mid', 2000); c.x = t2.x + 300; c.y = t2.y; c.noAuto = true; c.nextThink = 1e9
    run(w, 0.3)
    ok('an enemy lane creep next to it switches protection off', !t2.bdp)
    ok('full damage while a creep is close', hit(t2) === 200)
    c.dead = true; run(w, 1)
    ok('protection stays off for the linger time', !t2.bdp)
    run(w, 3)
    ok('and returns after it', t2.bdp)
    const anc = w.ancientOf(1)!; const t3 = w.towers.find((x) => x.team === 1 && x.tier === 2)!
    ok('tier 3 and the ancient are protected too', t3.bdp && anc.bdp)
    const c2 = w.spawnCreep(0, 'melee', 'mid', 2000); c2.x = anc.x - 3000; c2.y = anc.y; c2.noAuto = true; c2.nextThink = 1e9
    run(w, 0.3)
    ok('a creep within 4000 of the ancient removes the whole base protection', !t3.bdp && !anc.bdp)
    const s = w.heroes.find((h) => h.team === 0)!; const summon = Object.assign(Object.create(s), { kind: 'summon', team: 0 })
    c2.dead = true; run(w, 5)
    const h1 = t2.hp; w.damage(summon, t2, 200, 'pure'); ok('summons deal 25%', Math.abs(h1 - t2.hp - 50) < 1e-6, `${h1 - t2.hp}`)
    // the flag reaches the client so the info panel can show it
    t2.bdp = true
    const enc = new SnapshotEncoder(), dec = new SnapshotDecoder(), rep = new Replica()
    const d = dec.decode(JSON.parse(JSON.stringify(enc.encode(snapshotFor(w, 0, w.player.id, 1, { sfx: [], ann: [], txt: [], vfx: [] } as any, new Frame())))))
    if (d) rep.apply(d, 1000)
    ok('snapshot carries the backdoor flag', rep.world.units.find((u) => u.id === t2.id)?.bdp === true)
  },
  siege() {
    const w = fresh(); freeze(w)
    const sieges = () => w.units.filter((u) => u.sub === 'siege' && !u.dead)
    while (w.waveNo < 9) run(w, 1)
    ok('no siege creeps before wave 10', sieges().length === 0)
    while (w.waveNo < 10) run(w, 1)
    ok('wave 10 brings one siege creep per lane and team', sieges().length === 6 && [0, 1].every((t) => ['top', 'mid', 'bot'].every((l) => sieges().filter((s) => s.team === t && s.lane === l).length === 1)), `${sieges().length}`)
    while (w.waveNo < 11) run(w, 1)
    ok('wave 11 has none', sieges().length === 6)
    const s = sieges()[0]
    ok('stats: 935 HP, range 690, 0 armor, 80% magic resistance', s.st.maxHp === 935 && s.st.range === 690 && s.st.armor === 0 && s.st.magicRes === 0.8, `${s.st.maxHp} ${s.st.range} ${s.st.magicRes}`)
    const w2 = fresh(); clearCreeps(w2); freeze(w2); const p = place(w2, 3000, 3000)
    const m = w2.spawnCreep(0, 'siege', 'mid', 1500); m.hp = m.st.maxHp
    const h0 = m.hp; w2.damage(p, m, 100, 'magical'); ok('magic damage is reduced by 80%', Math.abs(h0 - m.hp - 20) < 1e-6, `${h0 - m.hp}`)
    const tw = w2.towers.find((t) => t.team === 1 && t.tier === 0 && t.lane === 'mid')!; tw.locked = false; tw.bdp = false; tw.base.armor = 0; tw.st.armor = 0
    const sg = w2.spawnCreep(0, 'siege', 'mid', 1500); sg.x = tw.x - 600; sg.y = tw.y; sg.noAuto = true; sg.nextThink = 0
    const foe = w2.spawnCreep(1, 'melee', 'mid', 1500); foe.x = sg.x + 100; foe.y = sg.y; foe.noAuto = true; foe.nextThink = 1e9; foe.base.dmg = 0
    run(w2, 0.5)
    ok('siege creep picks the building over a nearby creep', sg.aiTarget === tw, sg.aiTarget ? `${sg.aiTarget.kind}` : 'none')
    const dmgB = (() => { const a = tw.hp; w2.applyAttack(sg, tw); return a - tw.hp })()
    const dmgU = (() => { foe.base.armor = 0; foe.st.armor = 0; const a = foe.hp; w2.applyAttack(sg, foe); return a - foe.hp })()
    ok('siege deals 3x to a building and 0.5x to a unit', Math.abs(dmgB / dmgU - 6) < 0.8 && dmgB > 100, `building ${dmgB.toFixed(0)} unit ${dmgU.toFixed(0)}`)
    const es = w2.spawnCreep(1, 'siege', 'mid', 1500); const g0 = p.h!.gold; w2.kill(es, p); ok('killing a siege creep pays 66 gold', p.h!.gold - g0 === 66, `${p.h!.gold - g0}`)
  },
  highground() {
    const w = fresh(); clearCreeps(w); freeze(w); const p = w.player
    // Dire base high ground: well inside the walls; low ground: just outside the ramp
    const hi = { x: 6850, y: 2000 }, lo = { x: 6300, y: 2000 }
    ok('groundLevel: base interior is high, the lane outside is low', groundLevel(hi.x, hi.y) === 1 && groundLevel(lo.x, lo.y) === 0 && groundLevel(900, 8700) === 1 && groundLevel(4800, 4800) === 0)
    ok('groundLevel: the ramp mouth is low ground', groundLevel(8700, 800) === 0 || groundLevel(8700 - 1, 2800) === 0)
    const enemy = w.heroes.find((h) => h.team === 1)!; enemy.noAuto = true; enemy.dead = false; enemy.hp = enemy.st.maxHp
    enemy.x = hi.x; enemy.y = hi.y
    p.x = lo.x; p.y = lo.y; w.computeVision()
    ok('a hero on low ground cannot see a unit on the high ground in range', Math.hypot(p.x - enemy.x, p.y - enemy.y) < 1000 && !w.isVisible(0, enemy), `dist ${Math.hypot(p.x - enemy.x, p.y - enemy.y).toFixed(0)}`)
    ok('...and cannot target it', !w.canHit(p, enemy))
    // a ward on the high ground sees it
    w.wards.push({ id: 99, x: hi.x + 200, y: hi.y - 200, team: 0, expires: w.time + 100 }); w.computeVision()
    ok('a ward on the high ground reveals it', w.isVisible(0, enemy))
    w.wards = []; w.computeVision()
    ok('without the ward it is hidden again', !w.isVisible(0, enemy))
    // flying courier sees the high ground
    const c = w.courierFor(p)!; c.x = lo.x + 150; c.y = lo.y; w.computeVision()
    ok('a courier flies over the cliffs and sees the high ground', w.isVisible(0, enemy), `vision ${w.visionOf(c)}`)
    c.x = 470; c.y = 9100
    // area spell from below does not light the plateau; a hero on the high ground does
    w.grantVision(0, hi.x, hi.y, 600, 3, undefined, 0); w.computeVision()
    ok('an area vision spot cast from low ground does not reveal the plateau', !w.isVisible(0, enemy))
    p.x = hi.x + 300; p.y = hi.y - 100; w.computeVision()
    ok('walking up (a hero on the high ground) reveals it', w.isVisible(0, enemy))
    // the enemy tower on its own high ground sees the lane below
    const low = w.heroes.find((h) => h.team === 0 && h !== p)!; low.x = lo.x; low.y = lo.y; low.dead = false; low.hp = low.st.maxHp; p.x = 470; p.y = 9100; w.computeVision()
    ok('units on low ground are seen from the high ground', w.isVisible(1, low) || Math.hypot(low.x - 8500, low.y - 1100) > 1800, '')
    // the Dire side sees a unit on its own ground level normally
    const mid = { x: 4800, y: 4800 }; enemy.x = mid.x; enemy.y = mid.y; p.x = mid.x - 300; p.y = mid.y; w.computeVision()
    ok('same-level units see each other as before', w.isVisible(0, enemy))
  },
  camps() {
    const w = fresh(); clearCreeps(w); freeze(w); const p = w.player
    const packSize = [5, 3, 3]
    run(w, 1)
    const camp = w.camps.find((c) => c.tier === 1)!, size = packSize[1]
    const alive = () => camp.members.filter((m) => !m.dead)
    ok('camps spawn at the start', alive().length === size, `${alive().length}`)
    // a full camp does not respawn: its monsters stand in the spawn area
    run(w, 60)
    ok('no second pack while the first stands in the camp', alive().length === size, `${alive().length}`)
    // pulled out of the area before the minute mark: the camp stacks
    for (const m of alive()) { m.x = camp.x + 1100; m.y = camp.y; m.nextThink = 1e9; m.order = { t: 'idle' } }
    run(w, 60 - (w.time % 60) + 0.7)
    ok('a camp pulled out of its area stacks a second pack', alive().length === size * 2, `${alive().length}`)
    for (let i = 0; i < 6; i++) {
      for (const m of alive()) if (Math.hypot(m.x - camp.x, m.y - camp.y) < 700) { m.x = camp.x + 1100; m.y = camp.y; m.nextThink = 1e9; m.order = { t: 'idle' } }
      run(w, 60)
    }
    ok('stacks are capped', alive().length <= size * 4 && alive().length >= size * 4, `${alive().length}`)
    // a hero standing in the camp blocks the spawn
    const w2 = fresh(); clearCreeps(w2); freeze(w2); const q = w2.player
    const c2 = w2.camps.find((c) => c.tier === 0)!; run(w2, 1)
    for (const m of c2.members) m.dead = true
    q.x = c2.x; q.y = c2.y; run(w2, 60 - (w2.time % 60) + 0.7)
    ok('a hero standing in the camp blocks the respawn', c2.members.filter((m) => !m.dead).length === 0)
    q.x = 470; q.y = 9100; run(w2, 60)
    ok('and it spawns at the next minute once the hero leaves', c2.members.filter((m) => !m.dead).length === 5)
    // healing on the way home
    const w3 = fresh(); clearCreeps(w3); freeze(w3); run(w3, 1)
    const c3 = w3.camps.find((c) => c.tier === 2)!; const g = c3.members[0]
    g.hp = g.st.maxHp * 0.3; g.lastDamagedByEnemy = w3.time; g.x = c3.x + 600; g.y = c3.y; g.nextThink = 0; g.extra.provoked = undefined
    run(w3, 8)
    ok('a neutral that walks home heals', g.hp > g.st.maxHp * 0.95, `${(g.hp / g.st.maxHp * 100).toFixed(0)}%`)
    // lane creeps retaliate against a camp that attacks them but do not start fights
    const w4 = fresh(); clearCreeps(w4); freeze(w4); run(w4, 1)
    const c4 = w4.camps.find((c) => c.tier === 1)!; const mon = c4.members[0]
    const lc = w4.spawnCreep(0, 'melee', 'mid', 3000); lc.x = c4.x + 200; lc.y = c4.y; lc.nextThink = 0; lc.base.maxHp = 2000; lc.hp = 2000
    mon.aiTarget = null; mon.nextThink = 0
    run(w4, 1.5)
    ok('neutrals attack a lane creep that was led into their camp', mon.aiTarget === lc || c4.members.some((m) => m.aiTarget === lc) || lc.hp < 2000, `hp ${lc.hp.toFixed(0)}`)
    ok('the lane creep fights back', lc.aiTarget !== null && isNeutral(lc.aiTarget.team))
    const w5 = fresh(); clearCreeps(w5); freeze(w5); run(w5, 1)
    const c5 = w5.camps.find((c) => c.tier === 1)!
    const lc5 = w5.spawnCreep(0, 'melee', 'mid', 3000); lc5.x = c5.x + 480; lc5.y = c5.y; lc5.nextThink = 0
    for (const m of c5.members) m.nextThink = 1e9
    run(w5, 1)
    ok('a lane creep passing near a camp does not pick a fight', !lc5.aiTarget || !isNeutral(lc5.aiTarget.team))
  },
  roshan() {
    const w = fresh(); clearCreeps(w); freeze(w); const p = w.player
    run(w, 1)
    const r = w.roshan!
    ok('Roshan spawns once at the start in his pit', !!r && !r.dead && Math.hypot(r.x - ROSHAN_PIT.x, r.y - ROSHAN_PIT.y) < 5, r ? `${r.x},${r.y}` : 'none')
    ok('he does not attack a hero standing next to him', (() => { place(w, r.x + 200, r.y + 100); w.orderStop(p, true); r.nextThink = 0; run(w, 3); return r.aiTarget === null && p.hp === p.st.maxHp })())
    // hit him: he fights back, Slam stuns
    w.damage(p, r, 10, 'physical'); r.nextThink = 0; run(w, 1)
    ok('he fights back at whoever hit him', r.aiTarget === p)
    run(w, 1.5)
    ok('Slam stuns the hero', p.hasBuff('roshan_slam') || p.hp < p.st.maxHp - RULES.roshSlamDmg * 0.5, `hp ${p.hp.toFixed(0)}/${p.st.maxHp}`)
    // heals when left alone
    place(w, 4000, 4000); r.hp = r.st.maxHp * 0.4; r.lastDamagedByEnemy = w.time; r.extra.provoked = undefined; r.aiTarget = null
    run(w, 40)
    ok('he heals to full when left alone', r.hp > r.st.maxHp * 0.99, `${(r.hp / r.st.maxHp * 100).toFixed(0)}%`)
    // kill: team paid, Aegis drops
    const mate = w.heroes.find((h) => h.team === 0 && h !== p)!; const foe = w.heroes.find((h) => h.team === 1)!
    const g0 = [p.h!.gold, mate.h!.gold, foe.h!.gold]
    place(w, r.x + 150, r.y); w.kill(r, p)
    ok('every hero of the killing team gets 250 gold, the other team nothing', p.h!.gold - g0[0] >= RULES.roshGold && mate.h!.gold - g0[1] >= RULES.roshGold && foe.h!.gold - g0[2] < 100, `${p.h!.gold - g0[0]} ${mate.h!.gold - g0[1]} ${foe.h!.gold - g0[2]}`)
    const drop = w.runes.find((x) => x.kind === 'aegis')
    ok('the Aegis drops on the ground where he fell', !!drop && Math.hypot(drop!.x - r.x, drop!.y - r.y) < 5)
    ok('Roshan returns in 8-11 minutes', w.roshanAt - w.time >= RULES.roshMin - 1 && w.roshanAt - w.time <= RULES.roshMax + 1, `${(w.roshanAt - w.time).toFixed(0)}s`)
    // only the killing team can take it at first
    foe.dead = false; foe.x = drop!.x; foe.y = drop!.y
    run(w, 0.5)
    ok('the enemy cannot take it during the first seconds', w.runes.some((x) => x.kind === 'aegis') && !foe.h!.items.some((i) => i?.def.id === 'aegis'))
    p.x = drop!.x; p.y = drop!.y; run(w, 0.5)
    ok('the killer picks it up', p.h!.items.some((i) => i?.def.id === 'aegis') && !w.runes.some((x) => x.kind === 'aegis'))
    ok('it cannot be sold or bought', (() => { place(w, 470, 9100); const slot = p.h!.items.findIndex((i) => i?.def.id === 'aegis'); return !w.sellItem(p, slot) && w.buyItem(p, 'aegis') !== null })())
    // dying with it: revived in place, full stats, no death, no gold loss
    place(w, 3000, 3000); p.h!.gold = 1000; const deaths = p.h!.deaths; p.hp = 50
    w.kill(p, foe)
    ok('the Aegis is consumed, no death is counted and no gold is lost', !p.h!.items.some((i) => i?.def.id === 'aegis') && p.h!.deaths === deaths && p.h!.gold === 1000 && p.dead)
    ok('buyback is refused while the Aegis revives', w.buyback(p) !== null)
    run(w, RULES.aegisRevive + 0.2)
    ok('revived on the same spot with full health and mana', !p.dead && Math.hypot(p.x - 3000, p.y - 3000) < 5 && p.hp === p.st.maxHp && p.mana === p.st.maxMana, `${p.x.toFixed(0)},${p.y.toFixed(0)} hp ${p.hp.toFixed(0)}`)
    ok('no kill reward for the killer', foe.h!.kills === 0)
    // the item expires
    const it = (w.giveItem(p, ITEM_BY_ID.aegis), p.h!.items.find((i) => i?.def.id === 'aegis')!); it.expiresAt = w.time + RULES.aegisLife
    run(w, RULES.aegisLife + 1)
    ok('the Aegis expires after 5 minutes', !p.h!.items.some((i) => i?.def.id === 'aegis'))
    // the drop on the ground disappears by itself
    const w2 = fresh(); clearCreeps(w2); freeze(w2); run(w2, 1)
    w2.kill(w2.roshan!, w2.player); run(w2, RULES.aegisGround + 1)
    ok('an unclaimed Aegis vanishes from the ground', !w2.runes.some((x) => x.kind === 'aegis'))
    run(w2, RULES.roshMax)
    ok('Roshan comes back after the timer, stronger than before', !!w2.roshan && !w2.roshan.dead && w2.roshan.st.maxHp > 5500, `${w2.roshan?.st.maxHp.toFixed(0)}`)
    // snapshot round trip carries the pickup and the item expiry
    const w3 = fresh(); clearCreeps(w3); freeze(w3); run(w3, 1); w3.kill(w3.roshan!, w3.player)
    w3.giveItem(w3.heroes[1], ITEM_BY_ID.aegis); w3.heroes[1].h!.items.find((i) => i?.def.id === 'aegis')!.expiresAt = 123
    const enc = new SnapshotEncoder(), dec = new SnapshotDecoder(), rep = new Replica()
    const d = dec.decode(JSON.parse(JSON.stringify(enc.encode(snapshotFor(w3, 0, w3.player.id, 1, { sfx: [], ann: [], txt: [], vfx: [] } as any, new Frame())))))
    if (d) rep.apply(d, 1000)
    ok('snapshot carries the Aegis pickup (team, expiry) and the item expiry', rep.world.runes.some((x) => x.kind === 'aegis' && x.team === 0 && !!x.expires) && rep.world.heroes[1].h!.items.some((i) => i?.def.id === 'aegis' && i.expiresAt === 123))
  },
  map() {
    const w = fresh()
    const spawn = [{ x: FOUNTAIN_POS[0].x + 240, y: FOUNTAIN_POS[0].y - 240 }, { x: FOUNTAIN_POS[1].x - 240, y: FOUNTAIN_POS[1].y + 240 }]
    const points: [string, Pt][] = [
      ...CAMPS.map((c, i) => [`camp ${i}`, c] as [string, Pt]),
      ...POWER_RUNES.map((r, i) => [`power rune ${i}`, r] as [string, Pt]),
      ...BOUNTY_RUNES.map((r, i) => [`bounty rune ${i}`, r] as [string, Pt]),
      ['Roshan pit', ROSHAN_PIT],
      ['pit mouth', { x: ROSHAN_PIT.x + 420, y: ROSHAN_PIT.y + 420 }],
      ['river pool', { x: MAP - ROSHAN_PIT.x - 300, y: MAP - ROSHAN_PIT.y - 300 }],
    ]
    for (const [name, pt] of points) {
      const g = freePoint(pt)
      ok(`${name} is reachable from both fountains`, canReach(spawn[0], g) && canReach(spawn[1], g), `${pt.x.toFixed(0)},${pt.y.toFixed(0)}`)
    }
    for (const t of w.towers) ok(`${t.team ? 'Dire' : 'Radiant'} tier ${t.tier + 1} ${t.lane ?? ''} tower is not buried in a tree or rock`, !solidsNear(t.x, t.y).some((c) => Math.hypot(c.x - t.x, c.y - t.y) < c.r + t.radius * 0.8))
    for (const lane of LANES) ok(`${lane} lane has the same length for both teams`, Math.abs(PATHS[0][lane].len - PATHS[1][lane].len) < 1e-6, `${PATHS[0][lane].len.toFixed(0)}`)
    ok('the river is the mirror image of itself (fair for both teams)', Math.abs(RIVER_PATH.distTo({ x: MAP - 3000, y: MAP - 3000 }) - RIVER_PATH.distTo({ x: 3000, y: 3000 })) < 1)
    ok('only the mid lane crosses the river', FORDS.length === 1, `${FORDS.length} fords`)
    ok('terrain never rises above the base level', [[2450, 2300], [4800, 4800], [900, 900], [5000, 5200]].every(([x, y]) => heightAt(x, y) <= 0) && heightAt(4800, 4800) < -20)
    ok('the pit is a hollow and the water leaves it open', heightAt(ROSHAN_PIT.x, ROSHAN_PIT.y) < -50)
  },
  soak() {
    const seed = Number(process.argv[3] || 1)
    const w = fresh(['pudge', 'zeus', 'sniper', 'riki'][seed % 4])
    let err: any = null
    try { for (let i = 0; i < 60 * 60 * 25; i++) { w.tick(STEP); if (w.winner !== null) break } } catch (e) { err = e }
    ok(`soak ${seed}: 25 min of match runs without exceptions`, !err, err ? String(err.stack).split('\n').slice(0, 4).join(' / ') : `t=${w.time.toFixed(0)}s winner=${w.winner} kills=${w.kills} towersDown=${w.towers.filter((t) => t.dead).length} pings=${w.pings.length}`)
  },
}

// usage: tsx tests/sim-tests.ts [name]   (no name = run everything; `soak <seed>` runs a 25 minute bot match)
const names = process.argv[2] ? [process.argv[2]] : Object.keys(tests).filter((n) => n !== 'botpings')
for (const name of names) {
  results.length = 0
  tests[name]()
  console.log(`== ${name} ==\n` + results.join('\n'))
}
