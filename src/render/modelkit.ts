import * as THREE from 'three'

export interface Model {
  group: THREE.Group
  /** pivot swung during attacks */
  weapon?: THREE.Object3D
  /** bobbing body part */
  body?: THREE.Object3D
  /** spinning decoration */
  spin?: THREE.Object3D
  height: number
  mats: THREE.MeshStandardMaterial[]
  alive?: THREE.Object3D
  rubble?: THREE.Object3D
  shield?: THREE.Object3D
  /** Optional per-frame animation (cape flutter, orbiting orbs, hair...). */
  update?: (t: number, st: { moving: boolean; casting: boolean; attacking: boolean }) => void
}

export const TEAM = ['#5fd35f', '#e0463a']

export function mat(color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.78, metalness: 0.08, ...o })
}

export class Builder {
  mats: THREE.MeshStandardMaterial[] = []
  m(color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    const x = mat(color, o)
    this.mats.push(x)
    return x
  }
  mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
    const me = new THREE.Mesh(geo, material)
    me.position.set(x, y, z)
    me.castShadow = true
    me.receiveShadow = false
    parent?.add(me)
    return me
  }
}

export const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg)
export const sph = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h)
export const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z)
export const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg)

export function teamRing(b: Builder, g: THREE.Group, r: number, team: number) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r * 1.15, r * 1.45, 28),
    new THREE.MeshBasicMaterial({ color: TEAM[team], transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 3
  g.add(ring)
}

export type HeroModelFn = (id: string, color: string, color2: string, team: number, r: number) => Model

type Vec3 = [number, number, number]

/**
 * Shared hero-model scaffolding: builder, group, body and weapon pivots, plus helpers that position meshes in units of r
 * (+x forward, y up, z lateral). `glowDefault` is the default emissive intensity of `glow` materials.
 */
export function makeScaffold(team: number, r: number, glowDefault = 0.8) {
  const b = new Builder()
  const g = new THREE.Group()
  teamRing(b, g, r, team)
  const body = new THREE.Group()
  g.add(body)
  const weapon = new THREE.Group()
  const glow = (c: string, i = glowDefault) => b.m(c, { emissive: new THREE.Color(c), emissiveIntensity: i })
  const metal = (c: string) => b.m(c, { metalness: 0.65, roughness: 0.35 })
  const dbl = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => b.m(c, { side: THREE.DoubleSide, ...o })
  /** The 7th argument is a parent (default: body) or, as a shorthand, a scale. */
  const put = (
    geo: THREE.BufferGeometry,
    mt: THREE.Material,
    x: number,
    y: number,
    z: number,
    rot: Vec3 = [0, 0, 0],
    parentOrScale?: THREE.Object3D | Vec3,
    sc0?: Vec3,
  ) => {
    const parent = parentOrScale instanceof THREE.Object3D ? parentOrScale : body
    const sc = Array.isArray(parentOrScale) ? parentOrScale : sc0
    const me = b.mesh(geo, mt, x * r, y * r, z * r, parent)
    me.rotation.set(rot[0], rot[1], rot[2])
    if (sc) me.scale.set(sc[0], sc[1], sc[2])
    return me
  }
  /** An empty group at (x, y, z) in units of r, used as an animation pivot. */
  const piv = (x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const gr = new THREE.Group()
    gr.position.set(x * r, y * r, z * r)
    parent.add(gr)
    return gr
  }
  const tor = (rad: number, tube: number, seg = 12) => new THREE.TorusGeometry(r * rad, r * tube, 5, seg)
  const finish = (height: number, update?: Model['update']): Model => {
    body.add(weapon)
    return { group: g, weapon, body, height, mats: b.mats, update }
  }
  return { b, g, body, weapon, glow, metal, dbl, put, piv, tor, finish, r }
}
