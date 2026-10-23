import * as THREE from 'three'
import type { Vfx } from './vfx'

/** Helpers shared by the hero effect modules (vfx_g1 ... vfx_g4). Game (x, y) maps to three (x, height, y). */

export type PosOf = ((u: { x: number; y: number }) => THREE.Vector3 | null | undefined) | undefined
export type V3 = THREE.Vector3

export const PI = Math.PI
export const P = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, y)
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
export const easeOut = (k: number) => 1 - (1 - k) * (1 - k)
export const easeOutBack = (k: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
}
export const ADD = THREE.AdditiveBlending

export function disposeObj(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    m.geometry?.dispose()
    const mt = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mt)) mt.forEach((x) => x.dispose())
    else mt?.dispose?.()
  })
}

/** Add an object to the scene for `dur` seconds; `step(k, dt, t)` animates it (return false to end early). */
export function anim(v: Vfx, obj: THREE.Object3D, dur: number, step: (k: number, dt: number, t: number) => boolean | void) {
  v.scene.add(obj)
  let t = 0
  let done = false
  const end = () => {
    if (done) return
    done = true
    v.scene.remove(obj)
    disposeObj(obj)
  }
  v.live.push({
    update: (dt: number) => {
      t += dt
      const k = t / dur
      if (k >= 1) {
        end()
        return false
      }
      if (step(k, dt, t) === false) {
        end()
        return false
      }
      return true
    },
    dispose: end,
  })
}

/** Run `fn` after `sec` seconds of effect time. */
export function later(v: Vfx, sec: number, fn: () => void) {
  let t = 0
  v.live.push({
    update: (dt: number) => {
      t += dt
      if (t >= sec) {
        fn()
        return false
      }
      return true
    },
    dispose: () => {},
  })
}

/* ------------------------------------------------------------------ textures */

const texCache: Record<string, THREE.CanvasTexture> = {}
export function mkTex(key: string, draw: (g: CanvasRenderingContext2D, s: number) => void, s = 256) {
  let t = texCache[key]
  if (!t) {
    const c = document.createElement('canvas')
    c.width = c.height = s
    draw(c.getContext('2d')!, s)
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    texCache[key] = t
  }
  return t
}

export const rnd = (a: number, b: number) => a + Math.random() * (b - a)
/** A unit's effect anchor, or `fb` when it is gone. */
export const unitP = (posOf: PosOf, u: { x: number; y: number } | undefined, fb: V3): V3 => (u && posOf?.(u)) || fb
