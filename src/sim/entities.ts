import type { Lane, Pt, Team } from './constants'
import type { World } from './world'

export type UnitKind = 'hero' | 'creep' | 'tower' | 'ancient' | 'fountain' | 'courier' | 'summon'
export type DmgType = 'physical' | 'magical' | 'pure'

export interface Buff {
  id: string
  expires: number
  src?: Unit
  stun?: boolean
  slow?: number // 0..1
  slowFacingAway?: boolean
  haste?: number // 0..1 multiplier on move speed
  msFlat?: number
  as?: number // bonus attack speed
  armor?: number
  block?: number
  invis?: boolean
  fade?: number // invisibility fade delay
  taunt?: Unit
  regenHp?: number // per second
  regenMana?: number
  dot?: { dps: number; type: DmgType; abilityId?: string; nonLethal?: boolean }
  lift?: boolean
  invuln?: boolean
  rangeBonus?: number
  hs100?: boolean
  evasion?: number
  dmgReduce?: number // reduces damage of attacks dealt by this unit (0..1)
  hunger?: boolean
  breakOnDamage?: boolean // breaks when damaged by an enemy hero/tower
  color?: string
  label?: string
  silence?: boolean // cannot cast abilities
  root?: boolean // cannot move
  disarm?: boolean // cannot attack
  immune?: boolean // spell immunity: ignores magical damage and debuffs
  spellBlock?: boolean // negates the next targeted enemy spell
  ethereal?: boolean // immune to physical damage, takes extra magic damage
  dmgMul?: number // +x attack damage (1 = doubled)
  spellAmp?: number
  cdr?: number // cooldown reduction rate (0.3 = cooldowns tick 30% faster)
  phased?: boolean // walks through other units (no collision)
  noAutoAttack?: boolean // does not acquire targets on its own (only attacks when ordered)
}

export interface Stats {
  str: number
  agi: number
  int: number
  maxHp: number
  maxMana: number
  hpRegen: number
  manaRegen: number
  dmg: number
  armor: number
  ms: number
  range: number
  bat: number
  ap: number
  ias: number
  magicRes: number
  spellAmp: number
  castRange: number
  evasion: number
  block: number
  projSpeed: number
  dmgReduce: number
  /** fraction of physical attack damage returned as health (0.18 = 18%) */
  lifesteal: number
}

export interface CastTarget {
  unit?: Unit
  x: number
  y: number
}

export interface AbilityDef {
  id: string
  name: string
  glyph: string
  color: string
  behavior: 'unit' | 'point' | 'none' | 'passive' | 'toggle'
  target?: 'enemy' | 'ally' | 'any'
  heroOnly?: boolean
  range?: number[]
  castPoint: number
  cd: number[]
  mana: number[]
  maxLevel: number
  ult?: boolean
  /** Cast immediately toward the point without walking into range. */
  noMove?: boolean
  charges?: { max: number; restore: number[] }
  stealable?: boolean
  desc: string
  info: (lvl: number) => string[]
  stats?: (c: Unit, lvl: number, s: Stats, st: AbilityState) => void
  cast?: (w: World, c: Unit, lvl: number, t: CastTarget, st: AbilityState) => void
  canCast?: (w: World, c: Unit, t: CastTarget, st: AbilityState) => string | null
  onAttackHit?: (w: World, a: Unit, t: Unit, lvl: number, st: AbilityState) => number
  onAttacked?: (w: World, v: Unit, a: Unit, lvl: number, st: AbilityState) => void
  onEnemyHeroDeath?: (w: World, owner: Unit, victim: Unit, killer: Unit | null, lvl: number, st: AbilityState) => void
  tick?: (w: World, c: Unit, lvl: number, dt: number, st: AbilityState) => void
  ai?: (w: World, c: Unit, st: AbilityState, lvl: number) => boolean
  /** Targeting preview while aiming: a skillshot line, an area at the cursor (radius per level), or a circle around the caster. */
  aim?: { line?: { len: number; width: number; color?: string }; aoe?: { r: number[]; color: string }; circle?: { r: number; color: string } }
  /** Distance beyond cast range before an in-progress cast is cancelled (default 80; long cast points such as Assassinate need more). */
  castSlack?: number
  /** Draw an aiming beam from caster to target during the cast point. */
  aimBeam?: boolean
  /** Ground area drawn around the caster while the ability is toggled on. */
  toggleArea?: { r: number; fill: string; stroke: string }
  /** Runs when this ability lands the killing blow on an enemy hero (cooldown resets, stacks, team buffs). */
  onKill?: (w: World, killer: Unit, victim: Unit, st: AbilityState) => void
  /** True while pressing the key again should aim the ability's follow-up (e.g. Telekinesis landing). */
  followUp?: (c: Unit, now: number) => boolean
}

export class AbilityState {
  level = 0
  cdUntil = 0
  charges = 0
  chargeAt = 0
  toggled = false
  expires = 0
  extra: any = {}
  constructor(public def: AbilityDef, level = 0) {
    this.level = level
    if (def.charges) this.charges = def.charges.max
  }
}

export interface ItemDef {
  id: string
  name: string
  cost: number
  glyph: string
  color: string
  desc: string
  cat: 'consumable' | 'attribute' | 'equipment' | 'misc'
  stats?: Partial<{
    str: number
    agi: number
    int: number
    dmg: number
    armor: number
    ms: number
    as: number
    hp: number
    mana: number
    hpRegen: number
    manaRegen: number
    evasion: number
    /** boots movement speed: only the best pair counts, it does not stack with other boots */
    bootMs: number
    /** health regeneration as % of max health per second */
    hpRegenPct: number
    /** fraction of physical attack damage healed (0.18 = 18%) */
    lifesteal: number
  }>
  consumable?: boolean
  active?: 'salve' | 'clarity' | 'blink' | 'ward' | 'tp' | 'bkb' | 'shiva' | 'refresher' | 'force' | 'phase'
  mana?: number
  cd?: number
  range?: number
}

export interface ItemState {
  def: ItemDef
  charges: number
  cdUntil: number
}

export interface HeroDef {
  id: string
  name: string
  title: string
  attr: 'str' | 'agi' | 'int' | 'all'
  str: number
  strG: number
  agi: number
  agiG: number
  int: number
  intG: number
  /** base health / mana regen before the strength / intelligence bonus */
  hpRegen: number
  manaRegen: number
  baseDmg: number
  armor: number
  ms: number
  range: number
  bat: number
  ap: number
  projSpeed: number
  radius: number
  color: string
  color2: string
  roles: string[]
  /** Has a fifth (stolen spell) ability slot. */
  stealSlot?: boolean
  /** Bots playing this hero keep wards up for the team. */
  buysWards?: boolean
  lore: string
  abilities: AbilityDef[]
  skillOrder: number[]
  buy: string[]
}

export class HeroState {
  level = 1
  xp = 0
  points = 1
  gold = 625
  items: (ItemState | null)[] = [null, null, null, null, null, null]
  abilities: AbilityState[]
  stolen: AbilityState | null = null
  kills = 0
  deaths = 0
  assists = 0
  lh = 0
  dn = 0
  respawnAt = 0
  /** buyback is usable again at this time */
  buybackReadyAt = 0
  /** gold lost at the last death (shown on the respawn screen) */
  goldLost = 0
  lastCast: { def: AbilityDef; level: number } | null = null
  /** controlled by a person (no bot AI); which hero a client views is World.player */
  isHuman = false
  streak = 0
  pname = ''
  earned = 0
  heroDmg = 0
  towerDmg = 0
  lastKillAt = -99
  multi = 0
  brain: any = null
  /** teleportation scrolls live in their own stash (max 5), used with the T key */
  tpScrolls = 1
  tpCd = 0
  constructor(public def: HeroDef, public lane: Lane) {
    this.abilities = def.abilities.map((a) => new AbilityState(a, 0))
  }
}

export type Order =
  /** holdFire: set by the Stop command, the unit stays passive instead of auto-attacking nearby enemies until it gets a new order */
  | { t: 'idle'; holdFire?: boolean }
  | { t: 'move'; x: number; y: number }
  | { t: 'attack'; target: Unit; auto?: boolean }
  | { t: 'amove'; x: number; y: number; target?: Unit | null }
  | { t: 'hold' }
  | { t: 'cast'; st: AbilityState; target?: Unit; x: number; y: number }
  | { t: 'ward'; slot: number; x: number; y: number }

export interface Forced {
  speed: number
  tx: number
  ty: number
  follow?: Unit
  stopDist?: number
  onEnd?: () => void
}

export interface Casting {
  st: AbilityState
  target?: Unit
  x: number
  y: number
  end: number
  start: number
}

export interface Channel {
  st: AbilityState
  until: number
  tick: (dt: number) => void
  end: (interrupted: boolean) => void
  target?: Unit
}

export interface BaseStats {
  maxHp: number
  dmg: number
  armor: number
  ms: number
  range: number
  bat: number
  ap: number
  projSpeed: number
  hpRegen: number
}

let NEXT_ID = 1

export class Unit {
  id = NEXT_ID++
  x = 0
  y = 0
  vx = 0
  vy = 0
  facing = 0
  hp = 1
  mana = 0
  dead = false
  deadAt = 0
  locked = false
  buffs: Buff[] = []
  order: Order = { t: 'idle' }
  attackReadyAt = 0
  attackWind: { target: Unit; end: number; start: number } | null = null
  casting: Casting | null = null
  channel: Channel | null = null
  forced: Forced | null = null
  revealUntil = 0
  lastMaxHp = 0
  lastMaxMana = 0
  lastDamagedByHero = -99
  hitAt = -99
  lastDamagedByEnemy = -99
  damagers = new Map<number, number>()
  base: BaseStats
  st: Stats
  h: HeroState | null = null
  // creep ai
  pathIdx = 0
  lane: Lane | null = null
  nextThink = 0
  aiTarget: Unit | null = null
  // tower
  tier = 0
  z = 0
  bounty = 0
  xp = 0
  /* engine-visible state (renderer, HUD, network): typed here; snapshot.ts NET_KEYS lists what goes over the wire */
  /** courier: id of the hero it serves */
  courierOf = 0
  /** summon: the unit that created it */
  summoner: Unit | null = null
  /** summon: colour of its glowing core */
  tint = ''
  /** lane creep upgraded to mega */
  mega = false
  /** building: backdoor protection is active (no enemy lane creeps near) */
  bdp = false
  /** never auto-acquires targets (couriers, summons, bots and players pick their own) */
  noAuto = false
  /** courier on a delivery run */
  delivering = false
  /** lifted by Telekinesis between these times */
  liftStart = 0
  liftEnd = 0
  /** teleport channel ends at this time (0 = not teleporting) */
  tpUntil = 0
  /** hero: round trip to the host in ms (multiplayer) */
  ping: number | undefined = undefined
  /** replica: enemy hero known only from the roster (not visible) */
  stub = false
  /** caster of an active Telekinesis: where the target was lifted and when it lands */
  tk: { target?: Unit; start: Pt; land?: Pt; end: number } | null = null
  /** ability-private scratch state (stacks, timers...) */
  extra: any = {}
  constructor(
    public team: Team,
    public kind: UnitKind,
    public sub: string,
    public name: string,
    public radius: number,
    base: BaseStats,
  ) {
    this.base = base
    this.hp = base.maxHp
    this.st = {
      str: 0,
      agi: 0,
      int: 0,
      maxHp: base.maxHp,
      maxMana: 0,
      hpRegen: base.hpRegen,
      manaRegen: 0,
      dmg: base.dmg,
      armor: base.armor,
      ms: base.ms,
      range: base.range,
      bat: base.bat,
      ap: base.ap,
      ias: 0,
      magicRes: 0.25,
      spellAmp: 0,
      castRange: 0,
      evasion: 0,
      block: 0,
      projSpeed: base.projSpeed,
      dmgReduce: 0,
      lifesteal: 0,
    }
  }
  get isBuilding() {
    return this.kind === 'tower' || this.kind === 'ancient' || this.kind === 'fountain'
  }
  hasBuff(id: string) {
    return this.buffs.some((b) => b.id === id)
  }
  isStunned() {
    return this.buffs.some((b) => b.stun)
  }
  isSilenced() {
    return this.buffs.some((b) => b.silence)
  }
  isRooted() {
    return this.buffs.some((b) => b.root)
  }
  isDisarmed() {
    return this.buffs.some((b) => b.disarm)
  }
  isImmune() {
    return this.buffs.some((b) => b.immune)
  }
  isInvulnerable() {
    return this.locked || this.kind === 'fountain' || this.kind === 'courier' || this.buffs.some((b) => b.invuln || b.lift)
  }
  isInvisible(now: number) {
    return now >= this.revealUntil && this.buffs.some((b) => b.invis)
  }
  get isRanged() {
    return this.st.range > 250
  }
}
