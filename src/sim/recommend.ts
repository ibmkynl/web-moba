import type { ItemDef, Unit } from './entities'
import { ITEM_BY_ID } from './items'
import type { World } from './world'

/** Items bots (and the shop's recommendation) go for once the hero's starting build is complete. */
export const LATE_BUILD: Record<string, string[]> = {
  str: ['morbid', 'bkb', 'heart', 'cuirass', 'shiva', 'skadi'],
  agi: ['morbid', 'bkb', 'butterfly', 'cuirass', 'skadi', 'refresher'],
  int: ['scepter', 'bkb', 'shiva', 'refresher', 'force'],
  all: ['bkb', 'scepter', 'shiva', 'skadi'],
}

const BOOTS = ['boots', 'phase', 'treads', 'travel']

/** True when `def` fits the hero's inventory (a free slot, or it stacks with a consumable already carried / on the way). */
export function roomFor(w: World, h: Unit, def: ItemDef): boolean {
  const hs = h.h!
  const pend = w.pendingFor(h)
  if (def.id === 'tp') return hs.tpScrolls < 5
  if (def.consumable && (hs.items.some((i) => i && i.def.id === def.id) || pend.some((d) => d.id === def.id))) return true
  return hs.items.filter((i) => !i).length - pend.length > 0
}

/**
 * The next item worth buying: the hero's starting build in order, then the late-game build for their attribute. Items already
 * carried (or on Hop's way) are skipped; any pair of boots counts as having boots.
 */
export function recommendItem(w: World, h: Unit): ItemDef | null {
  const hs = h.h!
  const owned = new Map<string, number>()
  const add = (id: string) => owned.set(id, (owned.get(id) ?? 0) + 1)
  for (const it of hs.items) if (it) add(it.def.id)
  for (const d of w.pendingFor(h)) add(d.id)
  const hasBoots = BOOTS.some((b) => owned.has(b))
  const list = [...hs.def.buy, ...(LATE_BUILD[hs.def.attr] ?? LATE_BUILD.str)]
  const seen = new Map<string, number>()
  for (const id of list) {
    const nth = (seen.get(id) ?? 0) + 1
    seen.set(id, nth)
    if (id === 'boots' && hasBoots) continue
    if ((owned.get(id) ?? 0) >= nth) continue
    return ITEM_BY_ID[id] ?? null
  }
  return null
}
