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

