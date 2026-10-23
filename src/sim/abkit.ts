import type { Unit } from './entities'
import type { World } from './world'
import { dist } from './constants'

/** Small helpers shared by ability files. */
export const L = (arr: number[], l: number) => arr[Math.max(0, Math.min(arr.length, l) - 1)]
export const ang = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x)
export const same = (n: number, x: number) => Array.from({ length: n }, () => x)
/** Visible, hittable enemy heroes within r of c. */
export const heroesNear = (w: World, c: Unit, r: number) => w.enemyHeroesNear(c, r)
/** Where `t` will be when a projectile of `speed` from `c` arrives (k scales the lead). */
export const predict = (c: Unit, t: Unit, speed: number, k = 0.8) => {
  const lead = (dist(c, t) / speed) * k
  return { x: t.x + t.vx * lead, y: t.y + t.vy * lead }
}
