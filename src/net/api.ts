import type { AbilityState, Unit } from '../sim/entities'
import { ITEM_BY_ID } from '../sim/items'
import type { World } from '../sim/world'

/** Everything the local player can ask their hero to do. Applied directly (single player) or sent to the host (multiplayer). */
export interface Api {
  move(x: number, y: number): void
  attack(t: Unit): void
  amove(x: number, y: number): void
  stop(): void
  hold(): void
  /** idx = ability slot (0-3 normal, 4 = stolen) */
  cast(idx: number, st: AbilityState, t: Unit | undefined, x: number, y: number): string | null
  level(i: number): void
  buy(id: string): string | null
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
    this.w.orderStop(this.me())
  }
  hold() {
    this.w.orderHold(this.me())
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
