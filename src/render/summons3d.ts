import * as THREE from 'three'
import { Builder, Model, TEAM, cone, cyl, sph } from './modelkit'

/** Generic totem/ward model for summoned units; `color` tints the glowing core. */
export function buildSummon(sub: string, team: number, r: number, color: string): Model {
  const b = new Builder()
  const g = new THREE.Group()
  const col = color || '#9ad0ff'
  const glow = b.m(col, { emissive: new THREE.Color(col), emissiveIntensity: 1.1, roughness: 0.3 })
  const stone = b.m('#6a6c76')
  const trim = b.m(TEAM[team], { emissive: new THREE.Color(TEAM[team]), emissiveIntensity: 0.5 })
  b.mesh(cyl(r * 0.9, r * 1.1, r * 0.35, 8), stone, 0, r * 0.18, 0, g)
  b.mesh(cyl(r * 0.2, r * 0.3, r * 1.7, 6), stone, 0, r * 1.1, 0, g)
  b.mesh(cyl(r * 0.62, r * 0.62, r * 0.1, 8), trim, 0, r * 0.4, 0, g)
  const orb = b.mesh(sph(r * 0.5, 10, 8), glow, 0, r * 2.2, 0, g)
  orb.castShadow = false
  b.mesh(cone(r * 0.18, r * 0.6, 5), stone, r * 0.5, r * 2.2, 0, g).rotation.z = -1.2
  b.mesh(cone(r * 0.18, r * 0.6, 5), stone, -r * 0.5, r * 2.2, 0, g).rotation.z = 1.2
  return { group: g, spin: orb, height: r * 3, mats: b.mats }
}
