import {
  BASE_POS, BOUNTY_RUNES, CAMPS, FOUNTAIN_POS, Lane, LANES, MAP, MAX_LEVEL, PATHS, POWER_RUNES, Pt, T3_POS, T4_POS, TOWER_ARCS, Team, XP_TABLE, LANE_SLOTS, NEUTRAL, isNeutral, clamp, dist, mirror, pushOutOfWalls, shuffle,
} from './constants'
import {
  AbilityState, Buff, CastTarget, DmgType, HeroDef, HeroState, ItemState, Order, Stats, Unit,
} from './entities'
import { HERO_BY_ID } from './heroes'
import { ITEM_BY_ID } from './items'
import type { ItemDef } from './entities'
import { aiThink } from './ai'
import { freePoint, navWaypoint } from './nav'
import { pushOutOfSolids } from './obstacles'
import { TeamBrain } from './team'

/** Floating combat text (3D effects go through World.vfx instead). */
export interface Fx {
  k: 'text'
  x: number
  y: number
  text: string
  color: string
  size: number
  t0: number
  dur: number
  /** floating text only: who may see it (everyone when absent) */
  to?: Audience
}

/** Who an event or popup concerns. `only` = nobody else gets it; otherwise everyone does and the audience hears it up close. */
export interface Audience {
  hero?: number
  team?: Team
  all?: boolean
  only?: boolean
}
/** True when `viewer` (the hero a client plays) belongs to the audience. */
export const inAudience = (a: Audience | undefined, viewer: Unit | undefined) =>
  !!a && (!!a.all || (!!viewer && (a.hero === viewer.id || a.team === viewer.team)))
/** True when `viewer` should receive the event or popup at all. */
export const reaches = (a: Audience | undefined, viewer: Unit | undefined) => !a || !a.only || inAudience(a, viewer)

/** Announcements whose wording depends on which side the viewer is on: [about the viewer's team, about the enemy]. */
const ANN_TEXT = {
  ancient_hit: ['Your ancient is under attack!', 'Enemy ancient under attack'],
  tower_down: ['Your tower has fallen', 'Enemy tower destroyed'],
  ancient_down: ['Defeat', 'Victory!'],
  mega: ['Mega creeps are coming!', 'Enemy mega creeps incoming'],
} as const
export type AnnKind = keyof typeof ANN_TEXT
/** An announcer line. `team` = the side the news is good for (tone); `kind` + `about` make the text viewer-relative. */
export interface Announcement {
  text: string
  sub: string
  team?: number
  epic: boolean
  kind?: AnnKind
  about?: Team
}
export const announcementText = (a: Announcement, viewerTeam: number) => (a.kind ? ANN_TEXT[a.kind][a.about === viewerTeam ? 0 : 1] : a.text)

export interface Zone {
  x: number
  y: number
  r: number
  team: Team
  owner: Unit
  start: number
  end: number
  color: string
  kind: string
  reveal?: boolean
  tick?: (z: Zone, dt: number) => void
}

export interface Proj {
  kind: 'homing' | 'linear'
  owner: Unit
  x: number
  y: number
  dead: boolean
  // homing
  target?: Unit
  speed: number
  color?: string
  size?: number
  onHit?: (u: Unit, p: Proj) => boolean | void
  // linear
  angle?: number
  range?: number
  traveled: number
  radius?: number
  filter?: (u: Unit) => boolean
  draw?: 'hook' | 'arrow'
  style?: string
  id?: number
  phase?: 'out' | 'back'
  attached?: Unit | null
}

export interface DmgOpts {
  spell?: boolean
  abilityId?: string
  nonLethal?: boolean
  quiet?: boolean
  attack?: boolean
  self?: boolean
}

export interface KillOpts {
  abilityId?: string
  denied?: boolean
}

export type RuneKind = 'haste' | 'dd' | 'regen' | 'arcane' | 'invis' | 'bounty'
export interface Rune {
  id: number
  kind: RuneKind
  x: number
  y: number
  at: number
}
export const RUNE_INFO: Record<RuneKind, { name: string; color: string; dur: number }> = {
  haste: { name: 'Haste', color: '#ff5a3a', dur: 22 },
  dd: { name: 'Double Damage', color: '#4aa8ff', dur: 45 },
  regen: { name: 'Regeneration', color: '#5aff7a', dur: 30 },
  arcane: { name: 'Arcane', color: '#d08aff', dur: 50 },
  invis: { name: 'Invisibility', color: '#cfd8ff', dur: 45 },
  bounty: { name: 'Bounty', color: '#ffd24a', dur: 0 },
}

export interface Pick {
  hero: string
  lane: Lane
  /** Controlled by a human (multiplayer seat); otherwise a bot. */
  human?: boolean
}

export interface WorldCfg {
  playerHero: string
  playerLane: Lane
  /** Optional pre-decided lineup (first Radiant entry is the player). */
  teams?: { rad: Pick[]; dire: Pick[] }
}

/** How close to a friendly tower or ancient a teleport click must land. */
const TP_PICK_RANGE = 420
/** Teleport channel time (s). */
const TP_CHANNEL = 3

const HERO_VISION_DAY = 1800
const HERO_VISION_NIGHT = 1100

/**
 * The read side of a world: everything the renderer, minimap and HUD use. The simulation World implements it, and
 * on clients the network replica fills one in from snapshots; presentation code depends on this, never on the
 * simulation's mutating methods. (vfxQ is drained by the renderer.)
 */
export interface WorldView {
  readonly time: number
  readonly units: Unit[]
  readonly heroes: Unit[]
  readonly projs: Proj[]
  readonly zones: Zone[]
  readonly runes: Rune[]
  readonly wards: { id: number; x: number; y: number; team: Team; expires: number }[]
  readonly fxs: Fx[]
  readonly feed: { t: number; text: string; team: number }[]
  readonly kills: number[]
  readonly winner: Team | null
  readonly nextPowerRune: number
  readonly isDay: boolean
  vfxQ: any[]
  player: Unit
  isVisible(team: Team, u: Unit): boolean
  runeVisible(team: Team, r: { x: number; y: number }): boolean
  visionOf(u: Unit): number
  nightAmount(): number
  netWorth(h: Unit): number
  canLevel(h: Unit, i: number): boolean
  nearShop(h: Unit): boolean
  pendingFor(h: Unit): ItemDef[]
  castRange(u: Unit, st: AbilityState): number
  courierFor(h: Unit): Unit | undefined
}

export class World implements WorldView {
  time = 0
  units: Unit[] = []
  heroes: Unit[] = []
  towers: Unit[] = []
  ancients: Unit[] = []
  /** one courier (Hop) per hero */
  courier: Unit[] = []
  courierFor(h: Unit): Unit | undefined {
    return this.courier.find((c) => c.courierOf === h.id)
  }
  private nameBank = shuffle([...['Rook', 'Ember', 'Nova', 'Quill', 'Bolt', 'Vex', 'Mira', 'Onyx', 'Fable', 'Zephyr', 'Kite', 'Rune', 'Slate', 'Echo', 'Sable', 'Tango', 'Wisp', 'Juno', 'Pike', 'Dusk', 'Moss', 'Flint', 'Briar', 'Ash']])
  runes: Rune[] = []
  private runeId = 1
  nextPowerRune = 120
  nextBountyRune = 0
  team: TeamBrain[] = [new TeamBrain(0), new TeamBrain(1)]
  private teamThink = 0
  projId = 1
  private started = false
  wards: { id: number; x: number; y: number; team: Team; expires: number }[] = []
  private wardId = 1
  projs: Proj[] = []
  zones: Zone[] = []
  fxs: Fx[] = []
  timers: { at: number; fn: () => void }[] = []
  feed: { t: number; text: string; team: number }[] = []
  kills = [0, 0]
  winner: Team | null = null
  /** The hero this client views and controls. Client-side only: the simulation never reads it (the host serves many players). */
  player!: Unit
  nextWave = 0
  waveNo = 0
  vis: [Set<number>, Set<number>] = [new Set(), new Set()]
  visTimer = 0
  passiveGoldAcc = 0
  heroAggro = new Map<number, number>()
  dangerTimer: [number, number] = [-99, -99]
  dangerPos: [Pt | null, Pt | null] = [null, null]
  statsDirtyAt = 0
  onEvent: ((k: string, x: number, y: number, to: Audience | undefined, tag?: string) => void) | null = null

  /** Sound event. `to` = who it concerns (they hear it at full volume; with `only`, nobody else hears it). */
  emit(k: string, x: number, y: number, to?: Audience, tag = '') {
    this.onEvent?.(k, x, y, to, tag)
  }

  /** Announcer: spoken + on-screen line. */
  onAnnounce: ((a: Announcement) => void) | null = null
  private ancientAlert = [-99, -99]
  private megaTold = [false, false]
  private wasDay = true
  private firstBlood = false
  announce(text: string, sub = '', team?: number, epic = false) {
    this.onAnnounce?.({ text, sub, team, epic })
  }
  /** Announcement about `about`'s side; each viewer gets the wording for their own team. */
  announceAbout(kind: AnnKind, about: Team, sub: string, team: number | undefined, epic = false) {
    this.onAnnounce?.({ text: ANN_TEXT[kind][1], sub, team, epic, kind, about })
  }

  get isDay() {
    return Math.floor(this.time / 300) % 2 === 0
  }

  /** 0 by day, 1 by night, with 20 s fades (drives lighting and the night tint). */
  nightAmount() {
    const t = this.time % 600
    if (t < 280) return 0
    if (t < 300) return (t - 280) / 20
    if (t < 580) return 1
    return 1 - (t - 580) / 20
  }

  /** replica = true builds an empty world to be filled from network snapshots. */
  constructor(cfg: WorldCfg, public replica = false) {
    if (replica) return
    this.buildMap()
    this.buildHeroes(cfg)
    if (!this.player) this.player = this.heroes[0]
    this.computeVision()
  }

  /* ------------------------------------------------------------- setup */

  private add(u: Unit) {
    this.units.push(u)
    return u
  }

  private buildMap() {
    for (const team of [0, 1] as Team[]) {
      const anc = new Unit(team, 'ancient', 'ancient', 'Ancient', 150, {
        maxHp: 4500, dmg: 0, armor: 23, ms: 0, range: 0, bat: 1, ap: 0, projSpeed: 0, hpRegen: 12,
      })
      anc.x = BASE_POS[team].x
      anc.y = BASE_POS[team].y
      anc.locked = true
      this.ancients.push(anc)
      this.add(anc)
      const fo = new Unit(team, 'fountain', 'fountain', 'Fountain', 120, {
        maxHp: 9999, dmg: 200, armor: 0, ms: 0, range: 900, bat: 0.25, ap: 0.05, projSpeed: 1800, hpRegen: 0, // 200 damage, 4 attacks a second
      })
      fo.x = FOUNTAIN_POS[team].x
      fo.y = FOUNTAIN_POS[team].y
      this.add(fo)
      // Dota 2 wiki values per tier
      const hp = [1800, 2500, 2500, 2600]
      const dmg = [90, 172, 172, 172]
      const armor = [12, 16, 16, 21]
      const mk = (tier: number, lane: Lane | null, p: Pt) => {
        const t = new Unit(team, 'tower', 'tower', `Tier ${tier + 1} Tower`, 90, {
          maxHp: hp[tier], dmg: dmg[tier], armor: armor[tier], ms: 0, range: 700, bat: 0.9, ap: 0.6, projSpeed: 750, hpRegen: 0,
        })
        t.x = p.x
        t.y = p.y
        t.tier = tier
        t.lane = lane
        this.towers.push(t)
        this.add(t)
      }
      for (const lane of LANES) {
        for (let tier = 0; tier < 3; tier++) {
          // the tier-3 tower stands beside its ramp, not in the middle of it
          if (tier === 2) {
            const p3 = T3_POS[lane]
            mk(tier, lane, team === 0 ? p3 : mirror(p3))
          } else mk(tier, lane, PATHS[team][lane].at(TOWER_ARCS[lane][tier]))
        }
      }
      for (const p of T4_POS) mk(3, null, team === 0 ? p : mirror(p))
    }
    this.updateTowerLocks()
  }

  private updateTowerLocks() {
    for (const t of this.towers) {
      const mates = this.towers.filter((o) => o.team === t.team && !o.dead)
      if (t.tier === 0) t.locked = false
      else if (t.tier === 1 || t.tier === 2) t.locked = mates.some((o) => o.lane === t.lane && o.tier === t.tier - 1)
      else t.locked = mates.some((o) => o.tier === 2)
    }
    for (const a of this.ancients) a.locked = this.towers.some((o) => o.team === a.team && !o.dead && o.tier === 3)
  }

  private buildHeroes(cfg: WorldCfg) {
    const allIds = Object.keys(HERO_BY_ID)
    const playerDef = HERO_BY_ID[cfg.playerHero]
    const pool = (ids: string[]) => shuffle(ids)
    const radIds = [playerDef.id, ...pool(allIds.filter((i) => i !== playerDef.id)).slice(0, 4)]
    const rest = allIds.filter((i) => !radIds.includes(i))
    // enemy team: different heroes when enough exist, otherwise mirror picks
    const direIds = [...pool(rest), ...pool(allIds)].slice(0, 5)
    const rad = radIds.map((i) => HERO_BY_ID[i])
    const dire = direIds.map((i) => HERO_BY_ID[i])
    if (cfg.teams) {
      const t = cfg.teams
      const defsT = [t.rad.map((p) => HERO_BY_ID[p.hero]), t.dire.map((p) => HERO_BY_ID[p.hero])]
      const lanesT = [t.rad.map((p) => p.lane), t.dire.map((p) => p.lane)]
      const picksT = [t.rad, t.dire]
      const anyHuman = t.rad.concat(t.dire).some((p) => p.human)
      for (const team of [0, 1] as Team[]) {
        defsT[team].forEach((def, i) => {
          const isHuman = anyHuman ? !!picksT[team][i].human : team === 0 && i === 0
          const h = this.makeHero(team, def, lanesT[team][i], isHuman)
          const off = (i - 2) * 90
          h.x = FOUNTAIN_POS[team].x + (team === 0 ? 200 : -200) + off * (team === 0 ? 1 : -1)
          h.y = FOUNTAIN_POS[team].y + (team === 0 ? -200 : 200) + off * (team === 0 ? -1 : 1)
          if (h.h!.isHuman && !this.player) this.player = h
        })
      }
      return
    }
    const slots = LANE_SLOTS
    const radLanes = [...slots]
    radLanes.splice(radLanes.indexOf(cfg.playerLane), 1)
    const shuffled = (a: Lane[]) => shuffle(a)
    const lanesFor = [[cfg.playerLane, ...shuffled(radLanes)], shuffled(slots)]
    const defs = [rad, dire]
    for (const team of [0, 1] as Team[]) {
      defs[team].forEach((def, i) => {
        const h = this.makeHero(team, def, lanesFor[team][i], team === 0 && i === 0)
        const off = (i - 2) * 90
        h.x = FOUNTAIN_POS[team].x + (team === 0 ? 200 : -200) + off * (team === 0 ? 1 : -1)
        h.y = FOUNTAIN_POS[team].y + (team === 0 ? -200 : 200) + off * (team === 0 ? -1 : 1)
        if (h.h!.isHuman) this.player = h
      })
    }
  }

  private makeHero(team: Team, def: HeroDef, lane: Lane, isHuman: boolean) {
    const u = new Unit(team, 'hero', def.id, def.name, def.radius, {
      maxHp: 600, dmg: def.baseDmg, armor: def.armor, ms: def.ms, range: def.range, bat: def.bat, ap: def.ap, projSpeed: def.projSpeed, hpRegen: 1,
    })
    u.h = new HeroState(def, lane)
    u.h.isHuman = isHuman
    u.h.pname = isHuman ? 'You' : this.nameBank.pop() || 'Bot'
    u.lane = lane
    this.recalc(u)
    u.hp = u.st.maxHp
    u.mana = u.st.maxMana
    u.facing = team === 0 ? -Math.PI / 4 : (3 * Math.PI) / 4
    this.heroes.push(u)
    this.add(u)
    this.spawnCourier(u)
    if (isHuman) u.h.items[5] = { def: ITEM_BY_ID['ward'], charges: 2, cdUntil: 0 }
    if (!isHuman) {
      // bots always learn their first skill
      this.autoLevel(u)
    }
    return u
  }

  /** Every hero owns a courier (Hop) that waits at the fountain and only carries that hero's purchases. */
  private spawnCourier(owner: Unit) {
    const team = owner.team
    const idx = this.heroes.filter((h) => h.team === team).length - 1
    const cr = new Unit(team, 'courier', 'courier', 'Hop', 30, {
      maxHp: 1, dmg: 0, armor: 0, ms: 520, range: 0, bat: 1, ap: 0, projSpeed: 0, hpRegen: 0,
    })
    const f = FOUNTAIN_POS[team]
    const sgn = team === 0 ? 1 : -1
    const spread = (idx - 2) * 85
    const home = { x: f.x + sgn * 320 + spread * 0.7, y: f.y - sgn * 320 + spread * 0.7 }
    cr.x = home.x
    cr.y = home.y
    cr.extra.home = home
    cr.courierOf = owner.id
    cr.noAuto = true
    cr.extra.queue = []
    cr.extra.carry = []
    this.courier.push(cr)
    this.add(cr)
  }

  /* ----------------------------------------------------------- queries */

  homePos(team: Team): Pt {
    return FOUNTAIN_POS[team]
  }

  isVisible(team: Team, u: Unit) {
    if (isNeutral(team)) return !u.isInvisible(this.time)
    return u.team === team || u.isBuilding || this.vis[team].has(u.id)
  }

  canHit(src: Unit, t: Unit) {
    return !t.dead && !t.isInvulnerable() && (t.team === src.team || this.isVisible(src.team, t))
  }

  enemiesIn(team: Team, x: number, y: number, r: number, opts?: { buildings?: boolean }) {
    const out: Unit[] = []
    for (const u of this.units) {
      if (u.dead || u.team === team) continue
      if (u.isBuilding && !opts?.buildings) continue
      if (u.isInvulnerable()) continue
      const d = Math.hypot(u.x - x, u.y - y)
      if (d <= r + u.radius * 0.5) out.push(u)
    }
    return out
  }

  /** Visible, hittable enemy heroes within r of the unit. */
  enemyHeroesNear(c: Unit, r: number) {
    return this.heroes.filter((h) => h.team !== c.team && !h.dead && !h.isInvulnerable() && this.isVisible(c.team, h) && dist(h, c) <= r)
  }

  enemyBuildingNear(c: Unit, r: number) {
    return this.units.some((u) => u.team !== c.team && !u.dead && (u.kind === 'tower' || u.kind === 'ancient') && dist(u, c) <= r)
  }

  /** First enemy hero/creep hit by a line from c at angle a. */
  firstHitOnLine(c: Unit, a: number, range: number, radius: number): Unit | null {
    let best: Unit | null = null
    let bd = Infinity
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    for (const u of this.units) {
      if (u.dead || u.team === c.team || (u.kind !== 'hero' && u.kind !== 'creep') || u.isInvulnerable()) continue
      if (!this.isVisible(c.team, u)) continue
      const rx = u.x - c.x
      const ry = u.y - c.y
      const along = rx * dx + ry * dy
      if (along < 0 || along > range) continue
      const perp = Math.abs(rx * dy - ry * dx)
      if (perp < radius + u.radius * 0.7 && along < bd) {
        bd = along
        best = u
      }
    }
    return best
  }

  visionOf(u: Unit) {
    if (u.kind === 'hero') return this.isDay ? HERO_VISION_DAY : HERO_VISION_NIGHT
    if (u.kind === 'creep') return this.isDay ? 750 : 500
    if (u.kind === 'tower') return this.isDay ? 1900 : 1100
    if (u.kind === 'ancient') return 900
    if (u.kind === 'courier') return 450
    if (u.kind === 'summon') return 600
    return 1000
  }

  computeVision() {
    for (const team of [0, 1] as Team[]) {
      const set = new Set<number>()
      const obs: { x: number; y: number; r: number }[] = []
      for (const u of this.units) if (u.team === team && !u.dead) obs.push({ x: u.x, y: u.y, r: this.visionOf(u) })
      for (const z of this.zones) if (z.reveal && z.team === team && this.time >= z.start) obs.push({ x: z.x, y: z.y, r: z.r + 100 })
      for (const wd of this.wards) if (wd.team === team) obs.push({ x: wd.x, y: wd.y, r: 1600 })
      for (const u of this.units) {
        if (u.dead) continue
        if (u.team === team) {
          set.add(u.id)
          continue
        }
        if (u.isInvisible(this.time)) continue
        for (const o of obs) {
          if ((u.x - o.x) ** 2 + (u.y - o.y) ** 2 <= o.r * o.r) {
            set.add(u.id)
            break
          }
        }
      }
      this.vis[team] = set
    }
  }

  /* -------------------------------------------------------------- misc */

  /** Queue of visual effects consumed by the 3D renderer (see render/vfx.ts for the effect names). */
  vfxQ: any[] = []
  vfx(name: string, o: any = {}) {
    this.vfxQ.push({ name, ...o })
    if (this.vfxQ.length > 160) this.vfxQ.shift()
  }

  /**
   * The one way a spawned unit moves (walking, knockback, blinks, collision): buildings never move, everything
   * stays on the map and out of cliff walls and solid obstacles (couriers fly over them).
   */
  displace(u: Unit, x: number, y: number) {
    if (u.isBuilding) return
    u.x = clamp(x, 30, MAP - 30)
    u.y = clamp(y, 30, MAP - 30)
    if (u.kind === 'courier') return
    pushOutOfWalls(u)
    pushOutOfSolids(u, Math.min(34, u.radius * 0.7))
  }

  /** Floating combat text. `to` limits who sees it (everyone when absent). */
  text(x: number, y: number, text: string, color = '#fff', size = 16, to?: Audience) {
    this.fxs.push({ k: 'text', x, y, text, color, size, t0: this.time, dur: 1.1, to })
  }

  after(sec: number, fn: () => void) {
    this.timers.push({ at: this.time + sec, fn })
  }

  addZone(z: Zone) {
    this.zones.push(z)
  }

  spawnLinear(p: Partial<Proj> & { owner: Unit; x: number; y: number; angle: number; speed: number; range: number; radius: number }) {
    this.projs.push({
      kind: 'linear', dead: false, traveled: 0, phase: 'out', attached: null, id: this.projId++, ...p,
    } as Proj)
  }

  spawnHoming(p: Partial<Proj> & { owner: Unit; target: Unit; x: number; y: number; speed: number }) {
    this.projs.push({ kind: 'homing', dead: false, traveled: 0, id: this.projId++, ...p } as Proj)
  }

  addBuff(u: Unit, b: Buff) {
    if (u.dead) return
    if ((b.stun || b.slow || b.silence || b.root || b.disarm || b.taunt) && u.isImmune() && b.src !== u && (!b.src || b.src.team !== u.team)) return
    const i = u.buffs.findIndex((x) => x.id === b.id)
    if (i >= 0) u.buffs[i] = b
    else u.buffs.push(b)
  }

  removeBuff(u: Unit, id: string) {
    u.buffs = u.buffs.filter((b) => b.id !== id)
  }

  /** Cancel an ongoing cast/channel/attack. `hard` also drops the order. */
  interrupt(u: Unit, hard = false) {
    if (u.channel) {
      const ch = u.channel
      u.channel = null
      ch.end(true)
    }
    u.casting = null
    if (u.attackWind) {
      u.attackWind = null
      u.attackReadyAt = this.time
    }
    if (hard) u.order = { t: 'idle' }
  }

  heal(u: Unit, amt: number) {
    if (u.dead || amt <= 0) return
    u.hp = Math.min(u.st.maxHp, u.hp + amt)
  }

  /* ------------------------------------------------------------- stats */

  recalc(u: Unit) {
    const s = u.st
    const b = u.base
    const h = u.h
    let bonusHp = 0
    let bonusMana = 0
    let flatMs = 0
    let asBonus = 0
    let dmgBonus = 0
    let armorBonus = 0
    let hpReg = 0
    let manaReg = 0
    let itemEvasion = 0
    let bootMs = 0
    let hpPct = 0
    s.castRange = 0
    s.spellAmp = 0
    s.range = b.range
    s.block = 0
    s.evasion = 0
    s.dmgReduce = 0
    if (h) {
      const lv = h.level - 1
      const d = h.def
      s.str = d.str + d.strG * lv
      s.agi = d.agi + d.agiG * lv
      s.int = d.int + d.intG * lv
      for (const it of h.items) {
        const st = it?.def.stats
        if (!st) continue
        s.str += st.str || 0
        s.agi += st.agi || 0
        s.int += st.int || 0
        dmgBonus += st.dmg || 0
        armorBonus += st.armor || 0
        flatMs += st.ms || 0
        asBonus += st.as || 0
        bonusHp += st.hp || 0
        bonusMana += st.mana || 0
        hpReg += st.hpRegen || 0
        manaReg += st.manaRegen || 0
        itemEvasion += st.evasion || 0
        bootMs = Math.max(bootMs, st.bootMs || 0)
        hpPct += st.hpRegenPct || 0
      }
      s.armor = b.armor
      s.ms = b.ms
      s.bat = b.bat
      s.ap = b.ap
      s.projSpeed = b.projSpeed
      // ability passives (own abilities only)
      for (const a of h.abilities) {
        if (a.level > 0 && a.def.stats) a.def.stats(u, a.level, s, a)
      }
      const primary = d.attr === 'all' ? 0.45 * (s.str + s.agi + s.int) : s[d.attr]
      s.dmg = b.dmg + primary + dmgBonus
      s.maxHp = 120 + s.str * 22 + bonusHp
      s.maxMana = 75 + s.int * 12 + bonusMana
      s.hpRegen = d.hpRegen + s.str * 0.1 + hpReg + (s.maxHp * hpPct) / 100
      s.evasion += itemEvasion
      flatMs += bootMs
      s.manaRegen = d.manaRegen + s.int * 0.05 + manaReg
      s.armor += s.agi / 6 + armorBonus
      armorBonus = 0 // item armor is in; the buff pass below adds only buff armor
      s.spellAmp += s.int * 0.0007
      asBonus += s.agi
    } else {
      s.maxHp = b.maxHp
      s.maxMana = 0
      s.dmg = b.dmg
      s.armor = b.armor
      s.ms = b.ms
      s.bat = b.bat
      s.ap = b.ap
      s.projSpeed = b.projSpeed
      s.hpRegen = b.hpRegen
      s.manaRegen = 0
    }
    // buffs
    let slow = 0
    let haste = 0
    let dmgReduce = 0
    let dmgMul = 0
    for (const bf of u.buffs) {
      dmgMul += bf.dmgMul || 0
      s.spellAmp += bf.spellAmp || 0
      if (bf.slow) {
        let sl = bf.slow
        if (bf.slowFacingAway && bf.src) {
          const fx = Math.cos(u.facing)
          const fy = Math.sin(u.facing)
          const away = fx * (bf.src.x - u.x) + fy * (bf.src.y - u.y) < 0
          if (!away) sl = 0
        }
        slow = Math.max(slow, sl)
      }
      haste += bf.haste || 0
      flatMs += bf.msFlat || 0
      asBonus += bf.as || 0
      armorBonus += bf.armor || 0
      s.range += bf.rangeBonus || 0
      s.block += bf.block || 0
      s.evasion = Math.max(s.evasion, bf.evasion || 0)
      dmgReduce = Math.max(dmgReduce, bf.dmgReduce || 0)
    }
    s.armor += armorBonus
    s.ms = clamp((s.ms + flatMs) * (1 + haste) * (1 - slow), 0, 550)
    s.ias = asBonus
    const asMul = Math.max(20, 100 + asBonus) / 100
    s.bat = clamp(s.bat / Math.min(asMul, 7), 0.12, 10)
    s.ap = s.ap / Math.min(asMul, 7)
    s.dmgReduce = dmgReduce
    if (dmgMul) s.dmg *= 1 + dmgMul
    // keep hp/mana ratio when maxima change
    if (u.lastMaxHp && s.maxHp > u.lastMaxHp) u.hp += s.maxHp - u.lastMaxHp
    if (u.lastMaxMana && s.maxMana > u.lastMaxMana) u.mana += s.maxMana - u.lastMaxMana
    u.lastMaxHp = s.maxHp
    u.lastMaxMana = s.maxMana
    u.hp = Math.min(u.hp, s.maxHp)
    u.mana = Math.min(u.mana, s.maxMana)
  }

  /* ------------------------------------------------------------ damage */

  armorReduction(armor: number) {
    return (0.06 * armor) / (1 + 0.06 * Math.abs(armor))
  }

  damage(src: Unit | null, t: Unit, amt: number, type: DmgType, o: DmgOpts = {}) {
    if (t.dead || amt <= 0) return 0
    if (t.isInvulnerable() && !o.self) return 0
    let d = amt
    if (o.spell && src && src.h) d *= 1 + src.st.spellAmp
    if (t.st.block > 0 && !o.quiet) d = Math.max(0, d - t.st.block)
    const ethereal = t.buffs.some((b) => b.ethereal)
    if (type === 'physical') d = ethereal ? 0 : d * (1 - this.armorReduction(t.st.armor))
    else if (type === 'magical') {
      if (t.isImmune()) return 0
      d *= (1 - t.st.magicRes) * (ethereal ? 1.4 : 1)
    }
    if (d <= 0) return 0
    if (o.nonLethal) d = Math.min(d, t.hp - 1)
    if (d <= 0) return 0
    t.hp -= d
    if (src?.h && src.team !== t.team) {
      if (t.kind === 'hero') src.h.heroDmg += d
      else if (t.kind === 'tower' || t.kind === 'ancient') src.h.towerDmg += d
    }
    t.hitAt = this.time
    if (!o.quiet && d >= 16 && (t.kind === 'hero' || (src && src.kind === 'hero' && t.kind !== 'tower'))) {
      const col = type === 'magical' ? '#7ab8ff' : type === 'pure' ? '#ffb44a' : o.attack ? '#ffffff' : '#ffd9a0'
      this.text(t.x + (Math.random() - 0.5) * 40, t.y, String(Math.round(d)), col, 14 + Math.min(10, d / 45))
    }
    if (src && src.team !== t.team) {
      if (isNeutral(t.team)) t.extra.provoked = src
      t.lastDamagedByEnemy = this.time
      // getting hit by an enemy interrupts a teleport channel
      if (t.tpUntil && t.channel && t.hp > 0) this.interrupt(t)
      if (src.kind === 'hero') {
        t.lastDamagedByHero = this.time
        t.damagers.set(src.id, this.time)
      }
      if (src.kind === 'hero' || src.kind === 'tower') {
        for (const b of t.buffs) if (b.breakOnDamage) b.expires = 0
      }
      if (t.kind === 'ancient' && this.time - this.ancientAlert[t.team] > 45) {
        this.ancientAlert[t.team] = this.time
        this.announceAbout('ancient_hit', t.team, '', 1 - t.team)
      }
      if (t.isBuilding) {
        this.dangerTimer[t.team] = this.time
        this.dangerPos[t.team] = { x: t.x, y: t.y }
      }
    }
    if (t.hp <= 0) {
      t.hp = 0
      this.kill(t, src, { abilityId: o.abilityId })
    }
    return d
  }

  /* ------------------------------------------------------------- kills */

  netWorth(h: Unit) {
    const hs = h.h!
    return Math.round(hs.gold + hs.items.reduce((n, it) => n + (it ? it.def.cost * Math.max(1, it.charges) : 0), 0))
  }

  /**
   * Gold and experience for killing a hero, per the Dota 2 wiki.
   * Killer: 125 + 8 x victim level + streak bounty (+135 first blood) + an assist share. Everyone within 1500 (and every
   * recent damager) gets the assist share (30 + 3.8% of the victim's net worth, scaled by the net worth gap, split evenly).
   * XP: (100 + 13% of the victim's total XP) / heroes sharing, plus a streak bonus when a streak of 3+ is ended.
   */
  private heroKillRewards(t: Unit, killer: Unit | null, recent: Unit[], prevStreak: number) {
    const hs = t.h!
    const enemy = (1 - t.team) as Team
    const L = hs.level
    const streakK = Math.min(prevStreak, 10)
    const streakGold = prevStreak >= 3 ? 5 * streakK * streakK + 5 * streakK : 0
    const fb = !!killer && !this.firstBlood
    const base = 125 + 8 * L + streakGold + (fb ? 135 : 0)
    const near = this.heroes.filter((h) => h.team === enemy && !h.dead && dist(h, t) <= 1500)
    const group = new Set<Unit>([...near, ...recent])
    if (killer) group.add(killer)
    if (!killer && recent.length === 0) {
      // creeps/tower with no hero involved: the bounty is split between all enemy heroes
      const all = this.heroes.filter((h) => h.team === enemy)
      for (const h of all) this.gold(h, (125 + 8 * L) / Math.max(1, all.length))
      return
    }
    // assist share (also given to the killer)
    const nwKill = this.heroes.filter((h) => h.team === enemy).reduce((n, h) => n + this.netWorth(h), 0)
    const nwVictim = this.heroes.filter((h) => h.team === t.team).reduce((n, h) => n + this.netWorth(h), 0)
    const lead = Math.max(nwKill, nwVictim) || 1
    const diff = Math.abs(nwKill - nwVictim)
    const k = nwKill >= nwVictim ? 1 - diff / lead : 1 + diff / lead
    const share = ((30 + 0.038 * this.netWorth(t)) * k) / Math.max(1, group.size)
    for (const h of group) this.gold(h, share + (h === killer ? base : 0))
    // experience
    const xpHeroes = new Set<Unit>(near)
    if (killer) xpHeroes.add(killer)
    const x = Math.min(prevStreak, 9)
    const streakXp = prevStreak >= 3 ? (1.25 * x * x - 2.5 * x + 10) * L : 0
    const each = (100 + 0.13 * hs.xp) / Math.max(1, xpHeroes.size) + streakXp
    for (const h of xpHeroes) this.addXp(h, each)
  }

  heroesNear(team: Team, x: number, y: number, r: number) {
    return this.heroes.filter((h) => h.team === team && !h.dead && Math.hypot(h.x - x, h.y - y) <= r)
  }

  giveXp(team: Team, x: number, y: number, amt: number, r = 1500) {
    const hs = this.heroesNear(team, x, y, r)
    if (!hs.length) return
    const each = amt / hs.length
    for (const h of hs) this.addXp(h, each)
  }

  addXp(h: Unit, amt: number) {
    const hs = h.h!
    if (hs.level >= MAX_LEVEL) return
    hs.xp += amt
    while (hs.level < MAX_LEVEL && hs.xp >= XP_TABLE[hs.level]) {
      hs.level++
      hs.points++
      this.vfx('ring', { x: h.x, y: h.y, r0: 20, r1: 180, color: '#ffd24a', dur: 0.7 })
      this.text(h.x, h.y - 100, 'LEVEL UP!', '#ffd24a', 18)
      this.emit('levelup', h.x, h.y, { hero: h.id })
      this.recalc(h)
      if (!hs.isHuman) this.autoLevel(h)
    }
  }

  gold(h: Unit, amt: number, show = true) {
    h.h!.gold += Math.round(amt)
    h.h!.earned += Math.round(amt)
    if (show && h.h!.isHuman) {
      const to = { hero: h.id, only: true }
      this.text(h.x, h.y - 60, `+${Math.round(amt)}`, '#ffd24a', 17, to)
      this.emit('gold', h.x, h.y, to)
    }
  }

  /** Name shown in feeds: player/bot name with the hero in brackets. */
  label(u: Unit) {
    return u.h ? `${u.h.pname} (${u.name})` : u.name
  }

  pushFeed(text: string, team: number) {
    this.feed.push({ t: this.time, text, team })
    if (this.feed.length > 8) this.feed.shift()
  }

  kill(t: Unit, src: Unit | null, o: KillOpts = {}) {
    if (t.dead) return
    t.dead = true
    t.deadAt = this.time
    t.hp = 0
    this.stopEverything(t)
    // Battle Hunger ends on a kill
    if (src) for (const b of src.buffs) if (b.hunger) b.expires = 0
    if (t.kind === 'summon') this.vfx('ring', { x: t.x, y: t.y, r0: 10, r1: 90, dur: 0.4, color: t.tint })
    else if (t.kind === 'creep') this.creepDied(t, src)
    else if (t.kind === 'tower') this.towerDied(t)
    else if (t.kind === 'ancient') this.ancientDied(t)
    else if (t.kind === 'hero') this.heroDied(t, src, o)
  }

  /** A dying unit drops its channel, cast, swing, forced movement and orders. */
  private stopEverything(t: Unit) {
    if (t.channel) {
      const ch = t.channel
      t.channel = null
      ch.end(true)
    }
    t.casting = null
    t.attackWind = null
    t.forced = null
    t.order = { t: 'idle' }
  }

  private creepDied(t: Unit, src: Unit | null) {
    const enemyTeam = (1 - t.team) as Team
    if (isNeutral(t.team)) {
      // jungle monster
      if (src && !isNeutral(src.team)) {
        if (src.kind === 'hero') {
          src.h!.lh++
          this.gold(src, t.bounty)
        }
        this.giveXp(src.team, t.x, t.y, t.xp)
      }
      return
    }
    if (src && src.kind === 'hero' && src.team === t.team) {
      src.h!.dn++
      this.giveXp(enemyTeam, t.x, t.y, t.xp * 0.5)
      this.text(t.x, t.y - 50, 'denied', '#cfd8e0', 14)
      this.emit('deny', t.x, t.y)
      return
    }
    if (src && src.kind === 'hero') {
      src.h!.lh++
      this.gold(src, t.bounty)
    }
    if (!src || src.team !== t.team) this.giveXp(enemyTeam, t.x, t.y, t.xp)
  }

  private towerDied(t: Unit) {
    const enemyTeam = (1 - t.team) as Team
    const g = [120, 140, 160, 180][t.tier]
    for (const h of this.heroes) if (h.team === enemyTeam) this.gold(h, g)
    this.pushFeed(`${t.team === 0 ? 'Radiant' : 'Dire'} ${t.name} destroyed`, enemyTeam)
    this.emit('tower', t.x, t.y, { all: true })
    this.announceAbout('tower_down', t.team, t.name, enemyTeam)
    this.updateTowerLocks()
  }

  private ancientDied(t: Unit) {
    const enemyTeam = (1 - t.team) as Team
    this.winner = enemyTeam
    this.pushFeed(`${t.team === 0 ? 'Radiant' : 'Dire'} Ancient destroyed!`, enemyTeam)
    this.announceAbout('ancient_down', t.team, 'The ancient has fallen', undefined, true)
  }

  private heroDied(t: Unit, src: Unit | null, o: KillOpts) {
    const hs = t.h!
    const enemyTeam = (1 - t.team) as Team
    const prevStreak = hs.streak
    hs.deaths++
    this.emit('death', t.x, t.y, { team: t.team })
    hs.respawnAt = this.time + 6 + hs.level * 2.8
    // who gets the credit: the enemy hero that landed the blow; if creeps or a tower did, the last hero that damaged the
    // victim in the last 20s (earlier damagers are assists); nobody recent = every enemy hero shares the bounty
    const recent: Unit[] = []
    // most recent damager first: kill stealing is allowed, so whoever hit last gets the kill
    for (const [id, tm] of [...t.damagers].sort((a, b) => b[1] - a[1])) {
      if (this.time - tm > 20) continue
      const h = this.heroes.find((x) => x.id === id)
      if (h && h.team === enemyTeam && !recent.includes(h)) recent.push(h)
    }
    t.damagers.clear()
    const denied = !!src && src.team === t.team // denies and self-kills
    const neutralKill = !!src && isNeutral(src.team)
    let killer: Unit | null = src && src.kind === 'hero' && src.team !== t.team ? src : null
    if (!killer && !denied && !neutralKill && recent.length > 0) killer = recent[0] // creep/tower finish: the last hero to hit gets it
    if (killer) hs.streak = 0 // creep/neutral/deny deaths do not end a kill streak
    this.kills[enemyTeam] += denied || neutralKill ? 0 : 1
    this.emit('kill', t.x, t.y, { all: true })
    if (!denied && !neutralKill) this.heroKillRewards(t, killer, recent, prevStreak)
    if (killer) {
      killer.h!.kills++
      killer.h!.streak++
      this.announceKill(killer, t, prevStreak)
      for (const a of recent) if (a !== killer) a.h!.assists++
      this.pushFeed(`${this.label(killer)} killed ${this.label(t)}`, enemyTeam)
      const st = o.abilityId ? killer.h!.abilities.find((a) => a.def.id === o.abilityId) : undefined
      if (st?.def.onKill) st.def.onKill(this, killer, t, st)
    } else {
      this.pushFeed(`${this.label(t)} was killed`, enemyTeam)
    }
    for (const h of this.heroes) {
      if (h.dead || h.team !== enemyTeam) continue
      for (const a of h.h!.abilities) {
        if (a.def.onEnemyHeroDeath) a.def.onEnemyHeroDeath(this, h, t, killer, a.level || 1, a)
      }
    }
    this.vfx('ring', { x: t.x, y: t.y, r0: 20, r1: 200, color: '#ff5a4a', dur: 0.6 })
  }

  /** Announcer: first blood, multi-kills, killing sprees, shutdowns. */
  private announceKill(killer: Unit, victim: Unit, prevStreak: number) {
    const kh = killer.h!
    kh.multi = this.time - kh.lastKillAt < 18 ? kh.multi + 1 : 1
    kh.lastKillAt = this.time
    const nm = this.label(killer)
    const multiTxt = ['', '', 'Double kill', 'Triple kill', 'Ultra kill', 'Rampage']
    const sprees: Record<number, string> = { 3: 'Killing spree', 4: 'Dominating', 5: 'Mega kill', 6: 'Unstoppable', 7: 'Wicked sick', 8: 'Monster kill', 9: 'Godlike', 10: 'Beyond godlike' }
    if (!this.firstBlood) {
      this.firstBlood = true
      this.announce('First blood!', `${nm} drew first blood`, killer.team, true)
    } else if (kh.multi >= 2) {
      this.announce(multiTxt[Math.min(5, kh.multi)] + '!', nm, killer.team, kh.multi >= 4)
    } else if (sprees[Math.min(10, kh.streak)] && kh.streak >= 3) {
      this.announce(sprees[Math.min(10, kh.streak)] + '!', `${nm} · ${kh.streak} kills in a row`, killer.team, kh.streak >= 6)
    } else if (prevStreak >= 3) {
      this.announce('Shutdown!', `${nm} ended ${this.label(victim)}'s streak`, killer.team)
    }
  }

  /* ------------------------------------------------------------ levels */

  canLevel(h: Unit, i: number) {
    const hs = h.h!
    const a = hs.abilities[i]
    if (!a || hs.points <= 0 || a.level >= a.def.maxLevel) return false
    const next = a.level + 1
    const req = a.def.ult ? 6 * next : 2 * next - 1
    return hs.level >= req
  }

  levelAbility(h: Unit, i: number) {
    if (!this.canLevel(h, i)) return false
    const hs = h.h!
    hs.abilities[i].level++
    hs.points--
    this.recalc(h)
    return true
  }

  autoLevel(h: Unit) {
    const hs = h.h!
    let guard = 30
    while (hs.points > 0 && guard-- > 0) {
      if (this.levelFromOrder(h)) continue
      let any = false
      for (let i = hs.abilities.length - 1; i >= 0; i--) {
        if (this.levelAbility(h, i)) {
          any = true
          break
        }
      }
      if (!any) break
    }
  }

  /** Levels the first skill-order entry not yet learned, skipping entries that can't be levelled right now. */
  private levelFromOrder(h: Unit) {
    const hs = h.h!
    const seen = hs.abilities.map(() => 0)
    for (const i of hs.def.skillOrder) {
      if (++seen[i] > hs.abilities[i].level && this.levelAbility(h, i)) return true
    }
    return false
  }

  /* ------------------------------------------------------------ orders */

  private cancelForOrder(u: Unit) {
    if (u.channel) this.interrupt(u)
    if (u.casting) u.casting = null
    if (u.attackWind) {
      u.attackWind = null
      u.attackReadyAt = this.time
    }
  }

  canAttackTarget(u: Unit, t: Unit) {
    if (t.dead || t === u || u.st.range <= 0 || t.isInvulnerable()) return false
    if (t.team !== u.team) return this.isVisible(u.team, t)
    // deny: allied creeps below 50% health
    return t.kind === 'creep' && t.hp < t.st.maxHp * 0.5 && u.kind === 'hero'
  }

  orderMove(u: Unit, x: number, y: number) {
    if (u.dead || u.forced) return
    this.cancelForOrder(u)
    const f = freePoint({ x: clamp(x, 40, MAP - 40), y: clamp(y, 40, MAP - 40) })
    u.order = { t: 'move', x: f.x, y: f.y }
  }

  orderAttack(u: Unit, t: Unit) {
    if (u.dead || u.forced) return
    if (!this.canAttackTarget(u, t)) {
      // follow allies
      if (t.team === u.team && t !== u) this.orderMove(u, t.x, t.y)
      return
    }
    const cur = u.order
    if (cur.t === 'attack' && cur.target === t && !cur.auto) return
    if (u.attackWind && u.attackWind.target !== t) this.cancelForOrder(u)
    u.order = { t: 'attack', target: t }
  }

  orderAMove(u: Unit, x: number, y: number) {
    if (u.dead || u.forced) return
    const cur = u.order
    if (cur.t === 'amove' && Math.hypot(cur.x - x, cur.y - y) < 5) return
    if (!(u.attackWind && cur.t === 'amove')) this.cancelForOrder(u)
    u.order = { t: 'amove', x: clamp(x, 40, MAP - 40), y: clamp(y, 40, MAP - 40), target: null }
  }

  orderStop(u: Unit) {
    if (u.dead || u.forced) return
    this.cancelForOrder(u)
    u.order = { t: 'idle' }
  }

  orderHold(u: Unit) {
    if (u.dead || u.forced) return
    this.cancelForOrder(u)
    u.order = { t: 'hold' }
  }

  castRange(u: Unit, st: AbilityState) {
    const r = st.def.range?.[Math.max(0, st.level - 1)] || 0
    return r > 0 ? r + u.st.castRange : 0
  }

  allAbilities(u: Unit): AbilityState[] {
    const h = u.h
    if (!h) return []
    return h.stolen ? [...h.abilities, h.stolen] : h.abilities
  }

  abilityReady(u: Unit, st: AbilityState) {
    const d = st.def
    if (st.level <= 0 || d.behavior === 'passive') return false
    if (this.time < st.cdUntil) return false
    if (d.charges && st.charges <= 0) return false
    return true
  }

  /** Returns an error message or null on success. */
  orderCast(u: Unit, st: AbilityState, target: Unit | undefined, x: number, y: number): string | null {
    if (u.dead) return 'dead'
    if (u.forced || u.isStunned()) return 'You are disabled'
    const d = st.def
    if (d.behavior === 'passive') return 'Passive ability'
    if (st.level <= 0) return 'Ability not learned'
    if (u.isSilenced() && d.behavior !== 'toggle') return 'You are silenced'
    if (d.behavior === 'toggle') {
      st.toggled = !st.toggled
      return null
    }
    if (this.time < st.cdUntil || (d.charges && st.charges <= 0)) return 'Ability is on cooldown'
    const lvl = st.level
    if (u.mana < (d.mana[lvl - 1] || 0)) return 'Not enough mana'
    if (d.behavior === 'unit') {
      if (!target || target.dead) return 'Must target a unit'
      if (d.target === 'enemy' && target.team === u.team) return 'Must target an enemy'
      if (d.heroOnly && target.kind !== 'hero') return 'Must target a hero'
      if (target.isInvulnerable()) return 'Target is invulnerable'
      if (d.target === 'enemy' && !this.isVisible(u.team, target)) return 'Target not visible'
      if (target.isBuilding) return 'Cannot target buildings'
    }
    if (d.canCast) {
      const err = d.canCast(this, u, { unit: target, x, y }, st)
      if (err) return err
    }
    this.cancelForOrder(u)
    u.order = { t: 'cast', st, target, x, y }
    return null
  }

  /** Telekinesis: choose a landing spot while the target is airborne. */
  tkLand(c: Unit, x: number, y: number) {
    const tk = c.tk
    if (!tk || this.time >= tk.end) return false
    const a = Math.atan2(y - tk.start.y, x - tk.start.x)
    const d = Math.min(375, Math.hypot(x - tk.start.x, y - tk.start.y))
    tk.land = { x: tk.start.x + Math.cos(a) * d, y: tk.start.y + Math.sin(a) * d }
    return true
  }

  placeWard(u: Unit, x: number, y: number) {
    const mine = this.wards.filter((w) => w.team === u.team)
    if (mine.length >= 6) {
      const oldest = mine.sort((a, b) => a.expires - b.expires)[0]
      this.wards = this.wards.filter((w) => w !== oldest)
    }
    this.wards.push({ id: this.wardId++, x, y, team: u.team, expires: this.time + 180 })
    this.vfx('ring', { x, y, r0: 20, r1: 220, dur: 0.6, color: '#ffe9a8' })
    this.text(x, y - 40, 'Ward placed', '#ffe9a8', 15, { team: u.team, only: true })
    this.emit('ward', x, y, { team: u.team })
    this.computeVision()
  }

  /** Teleport scrolls (separate stash, max 5): pick a friendly tower or the ancient, channel 3s, land beside it. */
  useTeleport(u: Unit, x: number, y: number): string | null {
    const hs = u.h
    if (!hs || u.dead) return null
    if (u.isStunned() || u.forced) return 'You are disabled'
    if (hs.tpScrolls <= 0) return 'No teleport scrolls (buy them in the shop)'
    if (this.time < hs.tpCd) return 'Teleport is on cooldown'
    if (u.channel) return 'Already channeling'
    const b = this.nearestTpPoint(u.team, x, y)
    if (!b) return 'Choose a friendly tower or building'
    this.startTeleport(u, b)
    return null
  }

  /** The living friendly tower or ancient closest to (x, y), if one is within `range`. */
  nearestTpPoint(team: number, x: number, y: number, range = TP_PICK_RANGE): Unit | null {
    let b: Unit | null = null
    let bd = range
    for (const o of this.units) {
      if (o.dead || o.team !== team || (o.kind !== 'tower' && o.kind !== 'ancient')) continue
      const dd = Math.hypot(o.x - x, o.y - y)
      if (dd < bd) {
        bd = dd
        b = o
      }
    }
    return b
  }

  ancientOf(team: number): Unit | undefined {
    return this.ancients.find((a) => a.team === team)
  }

  private startTeleport(u: Unit, b: Unit) {
    this.cancelForOrder(u)
    u.order = { t: 'idle' }
    const hs = u.h!
    const from = { x: u.x, y: u.y }
    const until = this.time + TP_CHANNEL
    const st = new AbilityState({ id: 'tp', name: 'Teleportation', color: '#6fd6ff' } as any, 1)
    u.tpUntil = until
    this.vfx('tp_channel', { x: from.x, y: from.y, unit: u, dur: TP_CHANNEL })
    this.vfx('tp_dest', { x: b.x, y: b.y, unit: u, dur: TP_CHANNEL })
    u.channel = {
      st,
      until,
      tick: () => {},
      end: (interrupted) => {
        u.tpUntil = 0
        // the scroll is spent whether the teleport lands or is cancelled
        hs.tpScrolls = Math.max(0, hs.tpScrolls - 1)
        hs.tpCd = this.time + 20
        if (interrupted || b.dead) {
          this.vfx('tp_cancel', { x: u.x, y: u.y })
          this.text(u.x, u.y - 90, 'Teleport cancelled', '#ff9a8a', 16)
          return
        }
        const a = Math.atan2(MAP / 2 - b.y, MAP / 2 - b.x)
        const off = b.radius + 120
        this.vfx('tp_depart', { x: u.x, y: u.y })
        this.displace(u, b.x + Math.cos(a) * off, b.y + Math.sin(a) * off)
        u.forced = null
        this.vfx('tp_arrive', { x: u.x, y: u.y })
      },
    }
  }

  /** Walk into range and place a ward from the given inventory slot. */
  orderWard(u: Unit, slot: number, x: number, y: number): string | null {
    const it = u.h?.items[slot]
    if (!it || it.def.active !== 'ward') return 'No ward in that slot'
    if (u.dead || u.forced || u.isStunned()) return 'You are disabled'
    this.cancelForOrder(u)
    u.order = { t: 'ward', slot, x: clamp(x, 40, MAP - 40), y: clamp(y, 40, MAP - 40) }
    return null
  }

  /** A temporary unit (wards, totems, spirits). Cannot be controlled; attacks nearby enemies if it has range. */
  spawnSummon(o: {
    team: Team
    owner: Unit
    sub: string
    name: string
    x: number
    y: number
    hp: number
    dmg?: number
    range?: number
    bat?: number
    armor?: number
    ms?: number
    radius?: number
    life: number
    color?: string
    tick?: (w: World, u: Unit, dt: number) => void
  }): Unit {
    const u = new Unit(o.team, 'summon', o.sub, o.name, o.radius ?? 34, {
      maxHp: o.hp, dmg: o.dmg ?? 0, armor: o.armor ?? 0, ms: o.ms ?? 0, range: o.range ?? 0, bat: o.bat ?? 1.2, ap: 0.3, projSpeed: 900, hpRegen: 0,
    })
    u.x = o.x
    u.y = o.y
    u.summoner = o.owner
    u.extra.life = this.time + o.life
    u.tint = o.color || '#9ad0ff'
    u.extra.tick = o.tick
    u.noAuto = true
    u.facing = o.owner.facing
    this.add(u)
    return u
  }

  /** Items. */
  /** Put an item into the hero's inventory (stacking consumables). */
  giveItem(h: Unit, def: ItemDef): boolean {
    const hs = h.h!
    if (def.id === 'tp') {
      // teleport scrolls have their own stash (max 5)
      if (hs.tpScrolls >= 5) return false
      hs.tpScrolls++
      return true
    }
    if (def.consumable) {
      const ex = hs.items.find((i) => i && i.def.id === def.id)
      if (ex) {
        ex.charges++
        return true
      }
    }
    const slot = hs.items.findIndex((i) => !i)
    if (slot < 0) return false
    hs.items[slot] = { def, charges: def.consumable ? 1 : 0, cdUntil: 0 }
    this.recalc(h)
    return true
  }

  /** Items a hero has bought that the courier has not delivered yet. */
  pendingFor(h: Unit): ItemDef[] {
    const cr = this.courierFor(h)?.extra || {}
    return [...(cr.queue || []), ...(cr.carry || [])].filter((e: { heroId: number; def: ItemDef }) => e.heroId === h.id).map((e: { heroId: number; def: ItemDef }) => e.def)
  }

  buyItem(h: Unit, id: string): string | null {
    const def = ITEM_BY_ID[id]
    const hs = h.h!
    if (!def) return 'Unknown item'
    if (hs.gold < def.cost) return 'Not enough gold'
    if (id === 'tp') {
      // scrolls are delivered instantly into the separate teleport stash
      if (hs.tpScrolls >= 5) return 'Teleport stash is full (max 5)'
      hs.gold -= def.cost
      hs.tpScrolls++
      return null
    }
    if (this.nearShop(h)) {
      if (!this.giveItem(h, def)) return 'Inventory is full'
      hs.gold -= def.cost
      return null
    }
    // away from the fountain: the courier will bring it
    const pending = this.pendingFor(h)
    const stackable = def.consumable && (hs.items.some((i) => i && i.def.id === id) || pending.some((d) => d.id === id))
    const free = hs.items.filter((i) => !i).length - pending.length
    if (!stackable && free <= 0) return 'Inventory is full'
    hs.gold -= def.cost
    this.courierFor(h)!.extra.queue.push({ heroId: h.id, def })
    return null
  }

  sellItem(h: Unit, slot: number) {
    const hs = h.h!
    const it = hs.items[slot]
    if (!it || !this.nearShop(h)) return false
    hs.gold += Math.floor(it.def.cost * 0.5) * Math.max(1, it.charges)
    hs.items[slot] = null
    this.recalc(h)
    return true
  }

  nearShop(h: Unit) {
    return h.dead || dist(h, FOUNTAIN_POS[h.team]) < 1500
  }

  useItem(u: Unit, slot: number, x?: number, y?: number): string | null {
    const it = u.h?.items[slot]
    if (!it || u.dead) return null
    if (u.isStunned() || u.forced) return 'You are disabled'
    const d = it.def
    if (this.time < it.cdUntil) return 'Item is on cooldown'
    switch (d.active) {
      case 'salve':
        this.addBuff(u, { id: 'salve', expires: this.time + 13, regenHp: 30, breakOnDamage: true, color: '#7cc24a', label: 'Healing Salve' })
        break
      case 'clarity':
        this.addBuff(u, { id: 'clarity', expires: this.time + 25, regenMana: 6, breakOnDamage: true, color: '#4aa8e0', label: 'Clarity' })
        break
      case 'ward':
        if (x === undefined || y === undefined) return 'Need a target point'
        if (Math.hypot(x - u.x, y - u.y) > (d.range || 650) + 40) return 'Too far away'
        this.placeWard(u, x, y)
        break
      case 'phase':
        this.addBuff(u, { id: 'phase', expires: this.time + 3, haste: 0.2, color: '#e0a05a', label: 'Phase Shift' })
        it.cdUntil = this.time + (d.cd || 8)
        return null
      case 'bkb':
      case 'shiva':
      case 'refresher':
      case 'force':
        return this.useManaItem(u, it)
      case 'blink':
        return this.useBlink(u, it, x, y)
    }
    if (d.consumable) {
      it.charges--
      if (it.charges <= 0) u.h!.items[slot] = null
    }
    return null
  }

  /** Black King Bar, Shiva's Guard, Refresher Orb and Force Staff: mana cost, effect, cooldown. */
  private useManaItem(u: Unit, it: ItemState): string | null {
    const d = it.def
    if (d.mana && u.mana < d.mana) return 'Not enough mana'
    if (d.active === 'bkb') {
      this.addBuff(u, { id: 'bkb', expires: this.time + 9, immune: true, color: '#e8c24a', label: 'Black King Bar' })
      this.vfx('ring', { x: u.x, y: u.y, r0: 30, r1: 240, dur: 0.6, color: '#e8c24a' })
    } else if (d.active === 'shiva') {
      this.vfx('ring', { x: u.x, y: u.y, r0: 40, r1: 900, dur: 0.7, color: '#8ad8ff' })
      for (const e of this.enemiesIn(u.team, u.x, u.y, 900)) {
        this.damage(u, e, 200, 'magical', { spell: true, abilityId: 'shiva' })
        this.addBuff(e, { id: 'shiva_slow', expires: this.time + 4, slow: 0.4, src: u, color: '#8ad8ff', label: "Shiva's Guard" })
      }
    } else if (d.active === 'refresher') {
      for (const a of u.h!.abilities) a.cdUntil = 0
      if (u.h!.stolen) u.h!.stolen.cdUntil = 0
      for (const o of u.h!.items) if (o && o !== it) o.cdUntil = 0
      this.vfx('ring', { x: u.x, y: u.y, r0: 20, r1: 260, dur: 0.8, color: '#5ae0a0' })
      this.text(u.x, u.y - 90, 'Refreshed!', '#5ae0a0', 18)
    } else {
      const a = u.facing
      this.interrupt(u)
      u.forced = { speed: 1200, tx: clamp(u.x + Math.cos(a) * 600, 60, MAP - 60), ty: clamp(u.y + Math.sin(a) * 600, 60, MAP - 60), stopDist: 0 } as any
      this.vfx('ring', { x: u.x, y: u.y, r0: 20, r1: 160, dur: 0.4, color: '#5ac8e0' })
    }
    if (d.mana) u.mana -= d.mana
    it.cdUntil = this.time + (d.cd || 20)
    return null
  }

  private useBlink(u: Unit, it: ItemState, x?: number, y?: number): string | null {
    const d = it.def
    if (x === undefined || y === undefined) return 'Need a target point'
    if (this.time - u.lastDamagedByHero < 3) return 'Blink Dagger is disabled for 3s after hero damage'
    const a = Math.atan2(y - u.y, x - u.x)
    const dd = Math.min(d.range || 1200, Math.hypot(x - u.x, y - u.y))
    this.vfx('blink', { x: u.x, y: u.y, x2: u.x + Math.cos(a) * dd, y2: u.y + Math.sin(a) * dd, color: '#7ab8ff' })
    this.displace(u, u.x + Math.cos(a) * dd, u.y + Math.sin(a) * dd)
    this.cancelForOrder(u)
    if (u.order.t === 'move' || u.order.t === 'cast') u.order = { t: 'idle' }
    it.cdUntil = this.time + (d.cd || 15)
    return null
  }

  /* ---------------------------------------------------------- creeps */

  spawnCreep(team: Team, sub: 'melee' | 'ranged', lane: Lane, arc: number) {
    // Dota 2 lane creep stats (wiki): permanent upgrades every 7:30 to health, damage and bounty
    const up = Math.min(30, Math.floor(this.time / 450))
    // mega creeps: once the enemy has lost all three tier-3 towers
    const mega = this.towers.every((t) => t.team === team || t.tier !== 2 || t.dead)
    if (mega && !this.megaTold[team]) {
      this.megaTold[team] = true
      this.announceAbout('mega', team, 'Barracks destroyed', team, true)
    }
    const melee = sub === 'melee'
    const hp = mega ? (melee ? 1270 : 1015) : melee ? 550 + 12 * up : 300 + 12 * up
    const dmg = mega ? (melee ? 100 : 133.5) : melee ? 21 + up : 23.5 + 2 * up
    const u = new Unit(team, 'creep', sub, melee ? 'Melee Creep' : 'Ranged Creep', melee ? 30 : 26, {
      maxHp: hp, dmg, armor: mega ? (melee ? 3 : 1) : melee ? 2 : 0, ms: 325, range: melee ? 100 : 500,
      bat: 1, ap: melee ? 0.467 : 0.5, projSpeed: 900, hpRegen: 0,
    })
    u.bounty = mega ? (melee ? 23 : 22) : melee ? 36.5 + up : 47.5 + 6 * up
    if (mega) u.mega = true
    u.xp = mega ? (melee ? 25 : 22) : melee ? 57 : 69 + 8 * up
    u.lane = lane
    const p = PATHS[team][lane].at(arc)
    u.x = p.x
    u.y = p.y
    u.pathIdx = 1
    u.facing = team === 0 ? -Math.PI / 4 : (3 * Math.PI) / 4
    u.nextThink = this.time + Math.random() * 0.2
    this.add(u)
    return u
  }

  /* ----------------------------------------------------------- jungle */

  camps: { x: number; y: number; tier: number; members: Unit[] }[] = CAMPS.map((c) => ({ x: c.x, y: c.y, tier: c.tier, members: [] }))
  nextCamp = 0.5

  private spawnCamps() {
    // Dota 2 neutral stats (wiki): no time scaling. [name, sub, radius, hp, dmg, armor, range, bat, ap, ms, bounty, xp]
    type M = [string, string, number, number, number, number, number, number, number, number, number, number]
    const packs: M[][] = [
      // kobold camp
      [
        ['Kobold Soldier', 'kobold_lord', 30, 325, 20.5, 1, 100, 2, 0.38, 270, 15, 17],
        ['Kobold Soldier', 'kobold_lord', 30, 325, 20.5, 1, 100, 2, 0.38, 270, 15, 17],
        ['Kobold Soldier', 'kobold_lord', 30, 325, 20.5, 1, 100, 2, 0.38, 270, 15, 17],
        ['Kobold', 'kobold', 24, 240, 13.5, 0, 100, 2, 0.38, 290, 6, 14],
        ['Kobold', 'kobold', 24, 240, 13.5, 0, 100, 2, 0.38, 290, 6, 14],
      ],
      // wolf camp
      [
        ['Alpha Wolf', 'wolf_alpha', 36, 600, 31.5, 3, 90, 2, 0.33, 350, 35, 60],
        ['Giant Wolf', 'wolf', 31, 500, 16, 1, 90, 2, 0.33, 350, 22, 40],
        ['Giant Wolf', 'wolf', 31, 500, 16, 1, 90, 2, 0.33, 350, 22, 40],
      ],
      // ancient golem camp
      [
        ['Ancient Granite Golem', 'golem', 56, 1500, 82, 8, 128, 2, 0.3, 270, 80, 124],
        ['Ancient Rock Golem', 'shard', 38, 800, 23, 4, 100, 2, 0.3, 270, 42, 95],
        ['Ancient Rock Golem', 'shard', 38, 800, 23, 4, 100, 2, 0.3, 270, 42, 95],
      ],
    ]
    for (const c of this.camps) {
      if (c.members.some((m) => !m.dead)) continue
      c.members = []
      const pack = packs[c.tier]
      pack.forEach((m, i) => {
        const [name, sub, r, hp, dmg, armor, range, bat, ap, ms, bounty, xp] = m
        const u = new Unit(NEUTRAL, 'creep', sub, name, r, {
          maxHp: hp, dmg, armor, ms, range, bat, ap, projSpeed: 1000, hpRegen: 0,
        })
        const a = (i / pack.length) * Math.PI * 2 + 0.6
        const off = i === 0 ? 0 : 140
        u.x = c.x + Math.cos(a) * off
        u.y = c.y + Math.sin(a) * off
        u.facing = a
        u.bounty = bounty
        u.xp = xp
        u.extra.camp = c
        u.extra.home = { x: u.x, y: u.y }
        u.nextThink = this.time + Math.random() * 0.3
        this.add(u)
        c.members.push(u)
      })
    }
  }

  private spawnWave() {
    this.waveNo++
    const min = this.time / 60
    // wave size grows over the game (wiki): +1 melee at 15:00, 30:00 and 45:00, +1 ranged at 40:00
    const melee = 3 + (min >= 15 ? 1 : 0) + (min >= 30 ? 1 : 0) + (min >= 45 ? 1 : 0)
    const ranged = 1 + (min >= 40 ? 1 : 0)
    for (const team of [0, 1] as Team[]) {
      for (const lane of LANES) {
        for (let i = 0; i < melee + ranged; i++) {
          this.spawnCreep(team, i < melee ? 'melee' : 'ranged', lane, 650 - i * 110)
        }
      }
    }
  }

  /* ------------------------------------------------------------ tick */

  tick(dt: number) {
    if (this.winner !== null) return
    this.time += dt
    if (!this.started && this.time > 0.6) {
      this.started = true
      this.announce('The battle begins!', 'Destroy the enemy ancient', undefined, true)
    }
    if (this.isDay !== this.wasDay) {
      this.wasDay = this.isDay
      this.announce(this.isDay ? 'Day has come' : 'Night has fallen', this.isDay ? 'Vision returns' : 'Heroes see less', undefined)
    }
    if (this.time >= this.nextCamp) {
      this.nextCamp += 60
      this.spawnCamps()
    }
    if (this.time >= this.nextWave) {
      this.spawnWave()
      this.nextWave += 30
    }
    // timers
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time)
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time)
        for (const t of due) t.fn()
      }
    }
    // passive gold
    this.passiveGoldAcc += dt * 1.7
    if (this.passiveGoldAcc >= 1) {
      const g = Math.floor(this.passiveGoldAcc)
      this.passiveGoldAcc -= g
      for (const h of this.heroes) if (!h.dead) {
        h.h!.gold += g
        h.h!.earned += g
      }
    }
    this.stepRunes()
    // per-unit updates
    for (const u of this.units) {
      if (u.dead) {
        if (u.kind === 'hero') this.stepRespawn(u)
        continue
      }
      this.stepBuffs(u, dt)
      this.recalc(u)
      this.stepRegen(u, dt)
      if (u.h) this.stepHeroAbilities(u, dt)
      if (u.kind === 'summon') {
        u.extra.tick?.(this, u, dt)
        if (this.time >= u.extra.life) {
          u.dead = true
          u.deadAt = this.time
        }
      }
    }
    // team-level planning
    if (this.time >= this.teamThink) {
      this.teamThink = this.time + 0.5
      this.team[0].update(this)
      this.team[1].update(this)
    }
    // ai
    for (const u of this.units) {
      if (u.dead) continue
      if (this.time >= u.nextThink) {
        aiThink(this, u)
      }
    }
    for (const u of this.units) {
      if (u.dead) continue
      if (u.kind === 'courier') this.stepCourier(u, dt)
      else this.stepUnit(u, dt)
    }
    this.stepProjectiles(dt)
    this.stepZones(dt)
    this.separate(dt)
    // vision
    this.visTimer -= dt
    if (this.visTimer <= 0) {
      this.visTimer = 0.1
      this.computeVision()
    }
    // cleanup
    if (this.units.length > 400 || this.time % 5 < dt) {
      this.units = this.units.filter((u) => !(u.dead && (u.kind === 'creep' || u.kind === 'summon') && this.time - u.deadAt > 1))
    }
    if (this.wards.length) this.wards = this.wards.filter((wd) => wd.expires > this.time)
    this.fxs = this.fxs.filter((f) => this.time - f.t0 < f.dur)
    this.zones = this.zones.filter((z) => this.time < z.end)
    if (this.time % 2 < dt) for (const [id, t] of this.heroAggro) if (this.time - t > 3) this.heroAggro.delete(id)
  }

  /* -------------------------------------------------------------- runes */

  private spawnRune(kind: RuneKind, x: number, y: number) {
    this.runes = this.runes.filter((r) => Math.hypot(r.x - x, r.y - y) > 60)
    this.runes.push({ id: this.runeId++, kind, x, y, at: this.time })
    this.vfx('ring', { x, y, r0: 20, r1: 200, dur: 0.8, color: RUNE_INFO[kind].color })
  }

  runeVisible(team: Team, r: { x: number; y: number }) {
    for (const u of this.units) if (u.team === team && !u.dead && Math.hypot(u.x - r.x, u.y - r.y) <= this.visionOf(u)) return true
    for (const wd of this.wards) if (wd.team === team && Math.hypot(wd.x - r.x, wd.y - r.y) <= 1600) return true
    return false
  }

  private stepRunes() {
    if (this.time >= this.nextBountyRune) {
      this.nextBountyRune += 180
      for (const p of BOUNTY_RUNES) this.spawnRune('bounty', p.x, p.y)
    }
    if (this.time >= this.nextPowerRune) {
      this.nextPowerRune += 120
      const kinds: RuneKind[] = ['haste', 'dd', 'regen', 'arcane', 'invis']
      for (const p of POWER_RUNES) this.spawnRune(kinds[Math.floor(Math.random() * kinds.length)], p.x, p.y)
      this.announce('Power runes have spawned', 'In the river', undefined)
    }
    if (!this.runes.length) return
    for (const r of this.runes) {
      let taker: Unit | null = null
      let bd = 140
      for (const h of this.heroes) {
        if (h.dead) continue
        const d = Math.hypot(h.x - r.x, h.y - r.y)
        if (d < bd) {
          bd = d
          taker = h
        }
      }
      if (taker) {
        this.pickRune(taker, r)
        r.at = -1
      }
    }
    this.runes = this.runes.filter((r) => r.at >= 0)
  }

  private pickRune(h: Unit, r: Rune) {
    const info = RUNE_INFO[r.kind]
    if (r.kind === 'bounty') {
      const min = this.time / 60
      const gold = Math.round(55 + min * 4)
      this.gold(h, gold)
      for (const a of this.heroes) if (a.team === h.team && a !== h && !a.dead) this.gold(a, Math.round(gold * 0.5), false)
      this.addXp(h, 30 + min * 3)
      this.text(h.x, h.y - 120, `Bounty Rune +${gold}`, info.color, 17)
    } else {
      const b: Buff = { id: 'rune', expires: this.time + info.dur, color: info.color, label: info.name + ' Rune' }
      if (r.kind === 'haste') b.msFlat = 600
      if (r.kind === 'dd') b.dmgMul = 1
      if (r.kind === 'regen') {
        b.regenHp = h.st.maxHp * 0.06
        b.regenMana = h.st.maxMana * 0.06
        b.breakOnDamage = true
      }
      if (r.kind === 'arcane') {
        b.cdr = 0.4
        b.spellAmp = 0.25
      }
      if (r.kind === 'invis') {
        b.invis = true
        b.fade = 1.5
        h.revealUntil = Math.max(h.revealUntil, this.time + 1.5)
      }
      this.addBuff(h, b)
      this.text(h.x, h.y - 120, `${info.name} Rune!`, info.color, 18)
      this.pushFeed(`${this.label(h)} captured the ${info.name} rune`, h.team)
    }
    this.vfx('ring', { x: h.x, y: h.y, r0: 20, r1: 180, dur: 0.6, color: info.color })
    this.emit('rune', h.x, h.y, { team: h.team })
  }

  private stepBuffs(u: Unit, dt: number) {
    if (!u.buffs.length) return
    let expired = false
    for (const b of u.buffs) {
      if (b.expires <= this.time) {
        expired = true
        continue
      }
      if (b.dot) this.damage(b.src || null, u, b.dot.dps * dt, b.dot.type, { spell: true, abilityId: b.dot.abilityId, quiet: true, nonLethal: b.dot.nonLethal })
      if (u.dead) return
    }
    if (expired) u.buffs = u.buffs.filter((b) => b.expires > this.time)
  }

  private stepRegen(u: Unit, dt: number) {
    const s = u.st
    if (u.kind === 'fountain') return
    if (u.hp < s.maxHp) u.hp = Math.min(s.maxHp, u.hp + (s.hpRegen + this.buffRegen(u, 'regenHp')) * dt)
    if (s.maxMana > 0 && u.mana < s.maxMana) u.mana = Math.min(s.maxMana, u.mana + (s.manaRegen + this.buffRegen(u, 'regenMana')) * dt)
    // fountain healing
    if (u.kind === 'hero' && dist(u, FOUNTAIN_POS[u.team]) < 1000) {
      u.hp = Math.min(s.maxHp, u.hp + s.maxHp * 0.07 * dt)
      u.mana = Math.min(s.maxMana, u.mana + s.maxMana * 0.07 * dt)
    }
  }

  private buffRegen(u: Unit, k: 'regenHp' | 'regenMana') {
    let n = 0
    for (const b of u.buffs) n += b[k] || 0
    return n
  }

  private stepRespawn(u: Unit) {
    const hs = u.h!
    if (this.time >= hs.respawnAt) {
      u.dead = false
      u.buffs = []
      u.hp = u.st.maxHp
      u.mana = u.st.maxMana
      const f = FOUNTAIN_POS[u.team]
      u.x = f.x + (u.team === 0 ? 240 : -240)
      u.y = f.y + (u.team === 0 ? -240 : 240)
      u.order = { t: 'idle' }
      u.forced = null
      u.revealUntil = 0
      this.recalc(u)
      if (u.h!.isHuman) this.emit('respawn', u.x, u.y, { hero: u.id, only: true })
    }
  }

  private stepHeroAbilities(u: Unit, dt: number) {
    const hs = u.h!
    const cdr = u.buffs.reduce((n, b) => n + (b.cdr || 0), 0)
    if (cdr) for (const a of this.allAbilities(u)) if (a.cdUntil > this.time) a.cdUntil -= dt * cdr
    if (hs.stolen && this.time >= hs.stolen.expires) hs.stolen = null
    for (const a of this.allAbilities(u)) {
      const d = a.def
      if (d.charges && a.charges < d.charges.max) {
        if (a.chargeAt === 0) a.chargeAt = this.time + d.charges.restore[Math.max(0, a.level - 1)]
        if (this.time >= a.chargeAt) {
          a.charges++
          a.chargeAt = a.charges < d.charges.max ? this.time + d.charges.restore[Math.max(0, a.level - 1)] : 0
        }
      }
      if (d.tick && a.level > 0) d.tick(this, u, a.level, dt, a)
    }
    for (const it of hs.items) void it
  }

  /* ----------------------------------------------------- unit actions */

  private moveToward(u: Unit, x: number, y: number, dt: number, stop = 0) {
    if (u.isRooted()) return false
    // base walls: route through the lane gates when the straight line is blocked
    const wp = navWaypoint(u, { x, y }, u.extra, this.time)
    const direct = !wp
    if (wp) {
      x = wp.x
      y = wp.y
      stop = 0
    }
    const dx = x - u.x
    const dy = y - u.y
    const d = Math.hypot(dx, dy)
    if (d <= stop + 1) return direct
    u.facing = Math.atan2(dy, dx)
    const step = Math.min(u.st.ms * dt, Math.max(0, d - stop))
    u.vx = (dx / d) * u.st.ms
    u.vy = (dy / d) * u.st.ms
    this.displace(u, u.x + (dx / d) * step, u.y + (dy / d) * step)
    return direct && d - step <= stop + 1
  }

  /**
   * Each hero's own Hop (courier), like Dota's: purchases made away from the fountain wait in the base stash (`queue`). Hop loads the
   * whole stash at once when it is at the fountain and carries it (`carry`) to the heroes. Any new purchase sends Hop back to
   * the fountain first (even mid-delivery), then it delivers everything it carries. Cannot be harmed.
   */
  private stepCourier(c: Unit, dt: number) {
    const stash: { heroId: number; def: ItemDef }[] = c.extra.queue
    const carry: { heroId: number; def: ItemDef }[] = (c.extra.carry ||= [])
    const home: Pt = c.extra.home
    const atHome = Math.hypot(home.x - c.x, home.y - c.y) < 40
    // everything waiting at the shop is picked up in one go
    if (stash.length && atHome) {
      carry.push(...stash.splice(0))
      this.vfx('ring', { x: c.x, y: c.y, r0: 10, r1: 90, dur: 0.4, color: '#ffe9a8' })
    }
    let target: Unit | null = null
    if (!stash.length) {
      for (const e of carry) {
        const h = this.heroes.find((x) => x.id === e.heroId)
        if (h && !h.dead) {
          target = h
          break
        }
      }
    }
    c.delivering = !!target
    const dest = target ? { x: target.x, y: target.y } : home
    const d = Math.hypot(dest.x - c.x, dest.y - c.y)
    const stop = target ? 110 : 8
    if (d > stop) {
      const step = Math.min(c.st.ms * dt, d - stop)
      c.facing = Math.atan2(dest.y - c.y, dest.x - c.x)
      this.displace(c, c.x + Math.cos(c.facing) * step, c.y + Math.sin(c.facing) * step)
      c.vx = Math.cos(c.facing) * c.st.ms
      c.vy = Math.sin(c.facing) * c.st.ms
    } else {
      c.vx = 0
      c.vy = 0
    }
    if (target && d <= stop + 20) {
      let given = 0
      for (let i = carry.length - 1; i >= 0; i--) {
        if (carry[i].heroId !== target.id) continue
        if (this.giveItem(target, carry[i].def)) {
          given++
        } else {
          // inventory full: the purchase is refunded instead of Hop circling forever
          target.h!.gold += carry[i].def.cost
          this.text(target.x, target.y - 70, 'Inventory full: refunded', '#ff9a8a', 14)
        }
        carry.splice(i, 1)
      }
      if (given) {
        this.text(target.x, target.y - 90, `Hop delivered ${given} item${given > 1 ? 's' : ''}`, '#ffe9a8', 16)
        this.vfx('ring', { x: target.x, y: target.y, r0: 20, r1: 130, dur: 0.5, color: '#ffe9a8' })
        if (target.h!.isHuman) this.emit('delivery', target.x, target.y, { hero: target.id, only: true })
      }
    }
  }

  private stepForced(u: Unit, dt: number) {
    const f = u.forced!
    if (f.follow) {
      if (f.follow.dead) {
        u.forced = null
        return
      }
      f.tx = f.follow.x
      f.ty = f.follow.y
    }
    const dx = f.tx - u.x
    const dy = f.ty - u.y
    const d = Math.hypot(dx, dy)
    const stop = f.stopDist || 0
    if (d <= stop + 2) {
      u.forced = null
      f.onEnd?.()
      return
    }
    const step = Math.min(f.speed * dt, d - stop)
    this.displace(u, u.x + (dx / d) * step, u.y + (dy / d) * step)
    u.vx = 0
    u.vy = 0
    if (d - step <= stop + 2) {
      u.forced = null
      f.onEnd?.()
    }
  }

  acquire(u: Unit, r: number, allowBuildings = true): Unit | null {
    let best: Unit | null = null
    let bd = Infinity
    let bb: Unit | null = null
    let bbd = Infinity
    for (const t of this.units) {
      if (t.dead || t.team === u.team) continue
      if (t.isInvulnerable() || !this.isVisible(u.team, t)) continue
      if (t.kind === 'fountain') continue
      if (isNeutral(t.team) && (u.kind === 'summon' || u.kind === 'creep')) continue // only heroes pull jungle camps
      const d = dist(u, t) - t.radius
      if (d > r) continue
      if (t.isBuilding) {
        if (d < bbd) {
          bbd = d
          bb = t
        }
      } else if (d < bd) {
        bd = d
        best = t
      }
    }
    return best || (allowBuildings ? bb : null)
  }

  private stepUnit(u: Unit, dt: number) {
    u.vx = 0
    u.vy = 0
    const now = this.time
    if (u.forced) {
      this.stepForced(u, dt)
      return
    }
    if (u.isStunned()) {
      this.interrupt(u)
      return
    }
    if (u.channel) {
      const ch = u.channel
      ch.tick(dt)
      if (u.channel === ch && now >= ch.until) {
        u.channel = null
        ch.end(false)
      }
      return
    }
    if (u.casting) {
      if (now >= u.casting.end) this.finishCast(u)
      return
    }
    if (u.attackWind) {
      const aw = u.attackWind
      if (aw.target.dead || !this.canAttackTarget(u, aw.target)) {
        u.attackWind = null
        u.attackReadyAt = now
      } else {
        u.facing = Math.atan2(aw.target.y - u.y, aw.target.x - u.x)
        if (now >= aw.end) {
          u.attackWind = null
          this.performAttack(u, aw.target)
        }
      }
      return
    }
    if (u.kind === 'ancient') return
    // taunt
    let order: Order = u.order
    const tb = u.buffs.find((b) => b.taunt && !b.taunt.dead)
    if (tb) order = { t: 'attack', target: tb.taunt! }

    switch (order.t) {
      case 'idle':
      case 'hold': {
        const r = u.st.range
        const t = u.kind === 'creep' || u.noAuto ? null : this.acquire(u, r + 40, u.kind !== 'hero')
        if (t) this.attackStep(u, t, dt, false)
        break
      }
      case 'move': {
        const arrived = this.moveToward(u, order.x, order.y, dt, 6)
        if (arrived) u.order = { t: 'idle' }
        break
      }
      case 'attack': {
        const t = order.target
        if (!t || t.dead || !this.canAttackTarget(u, t)) {
          if (u.order === order) u.order = { t: 'idle' }
          break
        }
        if (order.auto && dist(u, t) > u.st.range + 350) {
          u.order = { t: 'idle' }
          break
        }
        this.attackStep(u, t, dt, true)
        break
      }
      case 'amove': {
        let t = order.target || null
        if (!t || t.dead || !this.canAttackTarget(u, t) || dist(u, t) > u.st.range + 450) t = this.acquire(u, u.st.range + 300)
        order.target = t
        if (t) this.attackStep(u, t, dt, true)
        else if (this.moveToward(u, order.x, order.y, dt, 20)) u.order = { t: 'idle' }
        break
      }
      case 'ward': {
        const it = u.h?.items[order.slot]
        if (!it || it.def.active !== 'ward') {
          u.order = { t: 'idle' }
          break
        }
        const range = (it.def.range || 650) - 40
        if (Math.hypot(order.x - u.x, order.y - u.y) <= range) {
          u.order = { t: 'idle' }
          this.useItem(u, order.slot, order.x, order.y)
        } else this.moveToward(u, order.x, order.y, dt, range - 30)
        break
      }
      case 'cast': {
        const st = order.st
        const d = st.def
        const unitTarget = d.behavior === 'unit'
        if (unitTarget && (!order.target || order.target.dead)) {
          u.order = { t: 'idle' }
          break
        }
        const tx = unitTarget ? order.target!.x : order.x
        const ty = unitTarget ? order.target!.y : order.y
        const range = this.castRange(u, st)
        const dd = Math.hypot(tx - u.x, ty - u.y)
        const need = range + (unitTarget ? order.target!.radius : 0)
        if (d.noMove || range <= 0 || dd <= need) {
          u.order = { t: 'idle' }
          this.beginCast(u, st, order.target, order.x, order.y)
        } else this.moveToward(u, tx, ty, dt, Math.max(0, need - 30))
        break
      }
    }
  }

  private attackStep(u: Unit, t: Unit, dt: number, chase: boolean) {
    if (u.st.range <= 0) return
    const d = dist(u, t) - t.radius
    const reach = u.st.range + 10
    if (d <= reach) {
      u.facing = Math.atan2(t.y - u.y, t.x - u.x)
      if (this.time >= u.attackReadyAt && !u.buffs.some((b) => b.stun || b.disarm)) this.startAttack(u, t)
    } else if (chase && u.kind !== 'tower' && u.kind !== 'fountain') {
      this.moveToward(u, t.x, t.y, dt, Math.max(0, u.st.range + t.radius - 20))
    }
  }

  private startAttack(u: Unit, t: Unit) {
    u.attackWind = { target: t, start: this.time, end: this.time + u.st.ap }
    u.attackReadyAt = this.time + u.st.bat
    if (u.h) u.revealUntil = Math.max(u.revealUntil, this.time + (u.buffs.find((b) => b.invis)?.fade ?? 0))
    if (u.st.ap <= 0.001) {
      u.attackWind = null
      this.performAttack(u, t)
    }
  }

  private performAttack(u: Unit, t: Unit) {
    if (t.dead) return
    if (u.isRanged || u.kind === 'tower' || u.kind === 'fountain') {
      this.emit('shot', u.x, u.y)
      this.spawnHoming({
        owner: u, target: t, x: u.x, y: u.y, speed: u.st.projSpeed || 900, color: u.kind === 'tower' ? '#ffb24a' : u.h ? u.h.def.color : u.team === 0 ? '#bff0a0' : '#ffb0a0',
        size: u.kind === 'tower' ? 6 : 4,
        style: u.kind === 'tower' ? 'fire' : u.h ? ({ sniper: 'bullet', mirana: 'arrow', windranger: 'arrow' } as Record<string, string>)[u.h.def.id] || 'orb' : 'orb',
        onHit: (tg) => this.applyAttack(u, tg),
      })
      if (u.kind === 'hero') this.heroAggroMark(u, t)
    } else {
      this.vfx('slash', { x: t.x, y: t.y, z: 30, angle: u.facing, color: '#fff4d8', size: 75, dur: 0.2 })
      this.vfx('sparkle', { x: t.x, y: t.y, z: 60, color: '#ffe9c8', count: 6, r: 20 })
      this.applyAttack(u, t)
      if (u.kind === 'hero') this.heroAggroMark(u, t)
    }
  }

  private heroAggroMark(u: Unit, t: Unit) {
    if (t.kind === 'hero' && t.team !== u.team) this.heroAggro.set(u.id, this.time)
  }

  applyAttack(u: Unit, t: Unit) {
    if (t.dead) return
    // evasion
    if (u.kind !== 'fountain' && t.st.evasion > 0 && u.team !== t.team && Math.random() < t.st.evasion) {
      this.text(t.x, t.y - 60, 'MISS', '#cfd8e0', 14)
      return
    }
    let dmg = u.st.dmg * (0.95 + Math.random() * 0.1) * (1 - u.st.dmgReduce)
    if (u.h) {
      for (const a of u.h.abilities) if (a.level > 0 && a.def.onAttackHit) dmg += a.def.onAttackHit(this, u, t, a.level, a)
    }
    if (u.mega && t.isBuilding) dmg *= 2.2
    if (u.kind === 'fountain') {
      // the fountain deals exactly 200 pure damage per hit (armor and evasion cannot save you)
      this.damage(u, t, 200, 'pure', { attack: true })
      this.emit('hit', t.x, t.y)
      return
    }
    this.damage(u, t, dmg, 'physical', { attack: true })
    this.emit('hit', t.x, t.y)
    if (t.h && u.team !== t.team) {
      for (const a of t.h.abilities) if (a.level > 0 && a.def.onAttacked) a.def.onAttacked(this, t, u, a.level, a)
    }
  }

  private beginCast(u: Unit, st: AbilityState, target: Unit | undefined, x: number, y: number) {
    const d = st.def
    const tx = target ? target.x : x
    const ty = target ? target.y : y
    if (tx !== u.x || ty !== u.y) u.facing = Math.atan2(ty - u.y, tx - u.x)
    if (u.h) u.revealUntil = Math.max(u.revealUntil, this.time + (u.buffs.find((b) => b.invis)?.fade ?? 0))
    u.casting = { st, target, x, y, start: this.time, end: this.time + d.castPoint }
    if (d.castPoint <= 0) this.finishCast(u)
  }

  private finishCast(u: Unit) {
    const c = u.casting!
    u.casting = null
    const st = c.st
    const d = st.def
    const lvl = st.level
    if (c.target && (c.target.dead || (d.target === 'enemy' && c.target.team !== u.team && !this.isVisible(u.team, c.target)))) return
    if (d.behavior === 'unit' && c.target) {
      const range = this.castRange(u, st) + c.target.radius + (d.castSlack ?? 80)
      if (dist(u, c.target) > range) return
    }
    const mana = d.mana[lvl - 1] || 0
    if (u.mana < mana) return
    if (u.isSilenced() && d.behavior !== 'toggle') return
    if (c.target && c.target.team !== u.team) {
      const blk = c.target.buffs.find((b) => b.spellBlock)
      if (blk) {
        // the spell is negated but still costs mana and goes on cooldown
        u.mana -= mana
        st.cdUntil = this.time + (d.cd[lvl - 1] || 0)
        blk.expires = 0
        this.text(c.target.x, c.target.y - 90, 'BLOCKED', '#bff0ff', 17)
        this.vfx('ring', { x: c.target.x, y: c.target.y, r0: 20, r1: 150, dur: 0.5, color: '#bff0ff' })
        return
      }
    }
    u.mana -= mana
    st.cdUntil = this.time + (d.cd[lvl - 1] || 0)
    if (d.charges) {
      st.charges--
      if (st.chargeAt === 0) st.chargeAt = this.time + d.charges.restore[Math.max(0, lvl - 1)]
    }
    if (u.h && d.stealable !== false && d.behavior !== 'passive') u.h.lastCast = { def: d, level: lvl }
    d.cast?.(this, u, lvl, { unit: c.target, x: c.x, y: c.y }, st)
    this.emit('cast', u.x, u.y, u.h ? { hero: u.id } : undefined, d.color)
  }

  /* ------------------------------------------------------- projectiles */

  private stepProjectiles(dt: number) {
    for (const p of this.projs) {
      if (p.dead) continue
      if (p.kind === 'homing') {
        const t = p.target!
        if (t.dead) {
          p.dead = true
          continue
        }
        const dx = t.x - p.x
        const dy = t.y - p.y
        const d = Math.hypot(dx, dy)
        const step = p.speed * dt
        if (d <= step + t.radius * 0.6) {
          p.dead = true
          p.onHit?.(t, p)
        } else {
          p.x += (dx / d) * step
          p.y += (dy / d) * step
        }
      } else {
        if (p.phase === 'out') {
          const step = p.speed * dt
          p.x += Math.cos(p.angle!) * step
          p.y += Math.sin(p.angle!) * step
          p.traveled += step
          let hit: Unit | null = null
          for (const u of this.units) {
            if (u.dead || !p.filter!(u)) continue
            if (Math.hypot(u.x - p.x, u.y - p.y) <= p.radius! + u.radius * 0.8) {
              hit = u
              break
            }
          }
          if (hit) {
            const stop = p.onHit?.(hit, p)
            if (stop && p.draw === 'arrow') p.dead = true
          } else if (p.traveled >= p.range!) {
            if (p.draw === 'hook') p.phase = 'back'
            else p.dead = true
          }
          if (p.x < 0 || p.y < 0 || p.x > MAP || p.y > MAP) {
            if (p.draw === 'hook') p.phase = 'back'
            else p.dead = true
          }
        } else {
          // hook retract
          const at = p.attached
          if (at) {
            if (at.dead || !at.forced) p.dead = true
            else {
              p.x = at.x
              p.y = at.y
            }
          } else {
            const o = p.owner
            const dx = o.x - p.x
            const dy = o.y - p.y
            const d = Math.hypot(dx, dy)
            const step = p.speed * dt
            if (d <= step + 40) p.dead = true
            else {
              p.x += (dx / d) * step
              p.y += (dy / d) * step
            }
          }
        }
      }
    }
    this.projs = this.projs.filter((p) => !p.dead)
  }

  private stepZones(dt: number) {
    for (const z of this.zones) if (this.time >= z.start && z.tick) z.tick(z, dt)
  }

  private separate(dt: number) {
    const us = this.units.filter((u) => !u.dead && !u.forced && u.kind !== 'fountain' && u.kind !== 'courier')
    for (let i = 0; i < us.length; i++) {
      const a = us[i]
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j]
        if (a.isBuilding && b.isBuilding) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const min = (a.radius + b.radius) * 0.8
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue
        const d = Math.hypot(dx, dy) || 0.01
        if (d >= min) continue
        const push = Math.min((min - d) * 0.5, 300 * dt)
        const nx = dx / d
        const ny = dy / d
        if (a.isBuilding) {
          this.displace(b, b.x + nx * push * 2, b.y + ny * push * 2)
        } else if (b.isBuilding) {
          this.displace(a, a.x - nx * push * 2, a.y - ny * push * 2)
        } else {
          this.displace(a, a.x - nx * push, a.y - ny * push)
          this.displace(b, b.x + nx * push, b.y + ny * push)
        }
      }
    }
  }
}

export type { CastTarget, ItemState, Stats }
