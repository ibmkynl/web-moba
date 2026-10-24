import type { AbilityState, Unit } from '../sim/entities'
import { ITEM_BY_ID } from '../sim/items'
import type { World } from '../sim/world'

/** Everything the local player can ask their hero to do. Applied directly (single player) or sent to the host (multiplayer). */
export interface Api {
  move(x: number, y: number): void
  attack(t: Unit): void
  amove(x: number, y: number): void
  /** Stop: cancels the current action and the unit stops auto-attacking until it gets a new order. */
  stop(): void
  hold(): void
  /** Team ping (Alt + click). `target` is the unit under the cursor, if any. */
  ping(x: number, y: number, target?: Unit | null): void
  /** idx = ability slot (0-3 normal, 4 = stolen) */
  cast(idx: number, st: AbilityState, t: Unit | undefined, x: number, y: number): string | null
  level(i: number): void
  buy(id: string): string | null
  /** Pay gold to respawn at once (only while dead). */
  buyback(): string | null
  /** Glyph of Fortification: your buildings are invulnerable for a few seconds. */
  glyph(): string | null
  sell(slot: number): boolean
  /** Use an inventory item (wards and blink need a point). */
  itemAt(slot: number, x?: number, y?: number): string | null
  tkLand(x: number, y: number): void
  /** Teleport (T key): channel to the friendly tower or building near (x, y). */
  tpAt(x: number, y: number): string | null
}

export class LocalApi implements Api {
  constructor(private w: World, private me: () => Unit) {}
  move(x: number, y: number) {
    this.w.orderMove(this.me(), x, y)
  }
  attack(t: Unit) {
    this.w.orderAttack(this.me(), t)
  }
  amove(x: number, y: number) {
    this.w.orderAMove(this.me(), x, y)
  }
  stop() {
    this.w.orderStop(this.me(), true)
  }
  hold() {
    this.w.orderHold(this.me())
  }
  ping(x: number, y: number, target?: Unit | null) {
    this.w.ping(this.me(), x, y, target?.id)
  }
  cast(_idx: number, st: AbilityState, t: Unit | undefined, x: number, y: number) {
    return this.w.orderCast(this.me(), st, t, x, y)
  }
  level(i: number) {
    this.w.levelAbility(this.me(), i)
  }
  buy(id: string) {
    return this.w.buyItem(this.me(), id)
  }
  sell(slot: number) {
    return this.w.sellItem(this.me(), slot)
  }
  buyback() {
    return this.w.buyback(this.me())
  }
  glyph() {
    return this.w.useGlyph(this.me().team)
  }
  itemAt(slot: number, x?: number, y?: number) {
    const me = this.me()
    const it = me.h!.items[slot]
    if (it && it.def.active === 'ward') return this.w.orderWard(me, slot, x ?? me.x, y ?? me.y)
    return this.w.useItem(me, slot, x, y)
  }
  tkLand(x: number, y: number) {
    this.w.tkLand(this.me(), x, y)
  }
  tpAt(x: number, y: number) {
    return this.w.useTeleport(this.me(), x, y)
  }
}

/** Sends commands to the host; does only cheap local checks so the player gets instant feedback. */
export class NetApi implements Api {
  constructor(private send: (m: any) => void, private w: World, private me: () => Unit) {}
  move(x: number, y: number) {
    this.send({ t: 'move', x: Math.round(x), y: Math.round(y) })
  }
  attack(t: Unit) {
    this.send({ t: 'attack', id: t.id })
  }
  amove(x: number, y: number) {
    this.send({ t: 'amove', x: Math.round(x), y: Math.round(y) })
  }
  stop() {
    this.send({ t: 'stop' })
  }
  hold() {
    this.send({ t: 'hold' })
  }
  ping(x: number, y: number, target?: Unit | null) {
    this.send({ t: 'ping', x: Math.round(x), y: Math.round(y), tid: target?.id })
  }
  cast(idx: number, st: AbilityState, t: Unit | undefined, x: number, y: number) {
    const me = this.me()
    const d = st.def
    if (st.level <= 0) return 'Ability not learned'
    if (d.behavior !== 'toggle' && d.behavior !== 'passive') {
      if (!this.w.abilityReady(me, st)) return 'Ability is on cooldown'
      if (me.mana < (d.mana[st.level - 1] || 0)) return 'Not enough mana'
    }
    if (d.behavior === 'unit' && !t) return 'Must target a unit'
    this.send({ t: 'cast', i: idx, tid: t?.id, x: Math.round(x), y: Math.round(y) })
    return null
  }
  level(i: number) {
    this.send({ t: 'level', i })
  }
  buy(id: string) {
    const def = ITEM_BY_ID[id]
    const me = this.me()
    if (def && me.h!.gold < def.cost) return 'Not enough gold'
    this.send({ t: 'buy', id })
    return null
  }
  buyback() {
    const me = this.me()
    if (!me.dead) return 'You are not dead'
    if (this.w.time < me.h!.buybackReadyAt) return 'Buyback is on cooldown'
    if (me.h!.gold < this.w.buybackCost(me)) return 'Not enough gold'
    this.send({ t: 'buyback' })
    return null
  }
  glyph() {
    const me = this.me()
    if (this.w.time < this.w.glyphReadyAt[me.team]) return 'Glyph is on cooldown'
    this.send({ t: 'glyph' })
    return null
  }
  sell(slot: number) {
    const me = this.me()
    if (!me.h!.items[slot] || !this.w.nearShop(me)) return false
    this.send({ t: 'sell', slot })
    return true
  }
  itemAt(slot: number, x?: number, y?: number) {
    const me = this.me()
    const it = me.h!.items[slot]
    if (!it) return null
    if (it.def.active === 'ward') this.send({ t: 'ward', slot, x: Math.round(x ?? me.x), y: Math.round(y ?? me.y) })
    else this.send({ t: 'item', slot, x: x === undefined ? undefined : Math.round(x), y: y === undefined ? undefined : Math.round(y) })
    return null
  }
  tkLand(x: number, y: number) {
    this.send({ t: 'tkland', x: Math.round(x), y: Math.round(y) })
  }
  tpAt(x: number, y: number) {
    const hs = this.me().h!
    if (hs.tpScrolls <= 0) return 'No teleport scrolls (buy them in the shop)'
    this.send({ t: 'tp', x: Math.round(x), y: Math.round(y) })
    return null
  }
}
