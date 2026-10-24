import * as THREE from 'three'
import { mergeUnique } from '../sim/constants'
import { Builder, Model, box, cone, cyl, sph, teamRing } from './modelkit'
import { MODELS_G1 } from './heroes3d_g1'
import { MODELS_G2 } from './heroes3d_g2'
import { MODELS_G3 } from './heroes3d_g3'
import { MODELS_G4 } from './heroes3d_g4'
import { MODELS_G5 } from './heroes3d_g5'

const EXTRA = mergeUnique('hero model', MODELS_G1, MODELS_G2, MODELS_G3, MODELS_G4, MODELS_G5)

/* ----------------------------------------------------------------- heroes */

export function buildHero(id: string, color: string, color2: string, team: number, r: number): Model {
  if (EXTRA[id]) return EXTRA[id](id, color, color2, team, r)
  const b = new Builder()
  const g = new THREE.Group()
  teamRing(b, g, r, team)
  const body = new THREE.Group()
  g.add(body)
  const weapon = new THREE.Group()
  const c1 = b.m(color)
  void color2
  let height = r * 3.2
  let spin: THREE.Object3D | undefined
  let update: Model['update']

  /** add mesh with optional rotation, to body by default */
  const put = (
    geo: THREE.BufferGeometry,
    mt: THREE.Material,
    x: number,
    y: number,
    z: number,
    rot: [number, number, number] = [0, 0, 0],
    parent: THREE.Object3D = body,
    sc?: [number, number, number],
  ) => {
    const me = b.mesh(geo, mt, x * r, y * r, z * r, parent)
    me.rotation.set(rot[0], rot[1], rot[2])
    if (sc) me.scale.set(sc[0], sc[1], sc[2])
    return me
  }

  switch (id) {
    case 'pudge':
    case 'sniper':
    case 'mirana':
    case 'axe':
    case 'rubick': {
      const ctx: HCtx = { b, g, body, weapon, r, c1, color2, team }
      const out = { pudge: heroPudge, sniper: heroSniper, mirana: heroMirana, axe: heroAxe, rubick: heroRubick }[id](ctx)
      height = out.height
      update = out.update
      break
    }
    default:
      put(cyl(r * 0.7, r * 0.8, r * 2, 8), c1, 0, 1, 0)
  }
  body.add(weapon)
  g.scale.setScalar(1)
  return { group: g, weapon, body, spin, height, mats: b.mats, update }
}

/* ============================================================ detailed builders (base five) */

interface HCtx {
  b: Builder
  g: THREE.Group
  body: THREE.Group
  weapon: THREE.Group
  r: number
  c1: THREE.MeshStandardMaterial
  color2: string
  team: number
}
type HSt = { moving: boolean; casting: boolean; attacking: boolean }
interface HOut {
  height: number
  update: (t: number, st: HSt) => void
}
type V3 = [number, number, number]

function hkit(c: HCtx) {
  const { b, r } = c
  const put = (
    geo: THREE.BufferGeometry,
    mt: THREE.Material,
    x: number,
    y: number,
    z: number,
    rot: V3 = [0, 0, 0],
    parent: THREE.Object3D = c.body,
    sc?: V3,
  ) => {
    const me = b.mesh(geo, mt, x * r, y * r, z * r, parent)
    me.rotation.set(rot[0], rot[1], rot[2])
    if (sc) me.scale.set(sc[0], sc[1], sc[2])
    return me
  }
  const grp = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const G = new THREE.Group()
    G.position.set(x * r, y * r, z * r)
    parent.add(G)
    return G
  }
  const glow = (col: string, i = 0.8) => b.m(col, { emissive: new THREE.Color(col), emissiveIntensity: i })
  const metal = (col: string) => b.m(col, { metalness: 0.65, roughness: 0.35 })
  /** limb / strap between two points (r units); radii r1 at a, r2 at p (r units) */
  const seg = (parent: THREE.Object3D, a: V3, p: V3, r1: number, r2: number, mt: THREE.Material, n = 7) => {
    const A = new THREE.Vector3(a[0], a[1], a[2]).multiplyScalar(r)
    const B = new THREE.Vector3(p[0], p[1], p[2]).multiplyScalar(r)
    const d = B.clone().sub(A)
    const len = Math.max(0.001, d.length())
    const m = b.mesh(cyl(r2 * r, r1 * r, len, n), mt, 0, 0, 0, parent)
    m.position.copy(A).addScaledVector(d, 0.5)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    return m
  }
  /** orient a mesh's +Y axis along dir */
  const aim = (m: THREE.Object3D, dx: number, dy: number, dz: number) => {
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize())
    return m
  }
  return { put, grp, glow, metal, seg, aim }
}

class Gait {
  k = 0
  ph = 0
  private last = 0
  step(t: number, moving: boolean, speed = 10) {
    const dt = Math.min(0.1, Math.max(0, t - this.last))
    this.last = t
    this.k += ((moving ? 1 : 0) - this.k) * Math.min(1, dt * 8)
    this.ph += dt * speed * this.k
    return this
  }
}

/** flat crescent / axe-blade shape extruded along z (u = outward along +x, v = height along y) */
function crescentGeo(w: number, h: number, th: number) {
  const s = new THREE.Shape()
  s.moveTo(0, -0.3 * h)
  s.quadraticCurveTo(0.45 * w, -0.62 * h, 0.85 * w, -0.55 * h)
  s.quadraticCurveTo(1.3 * w, 0, 0.85 * w, 0.55 * h)
  s.quadraticCurveTo(0.45 * w, 0.62 * h, 0, 0.3 * h)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false })
  g.translate(0, 0, -th / 2)
  return g
}

/* ----------------------------------------------------------------- PUDGE */
function heroPudge(c: HCtx): HOut {
  const { b, r, body, weapon } = c
  const { put, grp, glow, metal, seg } = hkit(c)
  const PI = Math.PI
  const skin = b.m('#8aa564')
  const skinD = b.m('#5f7a42')
  const fat = b.m('#9db874')
  const rotM = b.m('#46552f')
  const rotG = b.m('#7ab83a', { emissive: new THREE.Color('#4a9a18'), emissiveIntensity: 0.35 })
  const cloth = b.m('#5a3a28')
  const leather = b.m('#3b2a1e')
  const apron = b.m('#cdb98f')
  const apronD = b.m('#a89468')
  const blood = b.m('#7a1414')
  const steel = metal('#b9bfc9')
  const steelD = metal('#6a707a')
  const dark = b.m('#241f1b')
  const bone = b.m('#e8e0c0')
  const meat = b.m('#c24a52')
  const gold = metal('#c8a850')

  // legs (pivoted)
  const legs: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const L = grp(body, 0, 0.95, s * 0.5)
    legs.push(L)
    put(cyl(r * 0.4, r * 0.34, r * 0.55, 8), skinD, 0, -0.28, 0, [0, 0, 0], L)
    put(cyl(r * 0.42, r * 0.42, r * 0.1, 8), leather, 0, -0.2, 0, [0, 0, 0], L)
    put(sph(r * 0.2, 6, 5), rotM, 0.3, -0.3, s * 0.1, [0, 0, 0], L)
    put(cyl(r * 0.3, r * 0.33, r * 0.3, 8), skinD, 0, -0.6, 0, [0, 0, 0], L)
    put(cyl(r * 0.38, r * 0.33, r * 0.38, 8), leather, 0, -0.72, 0, [0, 0, 0], L)
    put(cyl(r * 0.4, r * 0.4, r * 0.07, 8), steelD, 0, -0.57, 0, [0, 0, 0], L)
    put(box(r * 0.95, r * 0.18, r * 0.52), dark, 0.18, -0.87, 0, [0, 0, 0], L)
    put(sph(r * 0.3, 7, 5), leather, 0.5, -0.76, 0, [0, 0, 0], L, [1, 0.7, 1])
    put(box(r * 0.05, r * 0.28, r * 0.12), gold, 0.33, -0.7, s * 0.3, [0, 0, 0], L)
  }

  // belly with jiggle
  const belly = grp(body, 0.05, 1.4, 0)
  put(sph(r * 1.2, 14, 12), fat, 0, 0, 0, [0, 0, 0], belly, [1, 0.8, 1.15])
  const bx = (y: number, z: number) => 1.2 * Math.sqrt(Math.max(0.02, 1 - (y / 0.96) ** 2 - (z / 1.38) ** 2))
  const boils: [number, number, number][] = [[0.3, 1.0, 0.2], [-0.2, -1.0, 0.24], [0.55, -0.65, 0.18], [-0.5, 0.75, 0.2], [0.1, 0.55, 0.14], [-0.35, -0.45, 0.16]]
  const rotMats: THREE.Mesh[] = []
  for (const [y, z, rr] of boils) rotMats.push(put(sph(r * rr, 7, 5), rotG, bx(y, z) * 0.97, y, z, [0, 0, 0], belly))
  // stitched scar on the visible flank
  put(box(r * 0.07, r * 0.95, r * 0.07), dark, bx(0, 0.92) * 0.98, 0.05, 0.92, [0, -0.55, 0], belly)
  for (let i = 0; i < 6; i++) put(box(r * 0.07, r * 0.07, r * 0.3), dark, bx(0.4 - i * 0.15, 0.92) * 0.99, 0.4 - i * 0.15, 0.92, [0, -0.55, 0.0], belly)
  // fat roll under the belt
  put(new THREE.TorusGeometry(r * 1.0, r * 0.2, 7, 18), skin, 0, -0.38, 0, [PI / 2, 0, 0], belly, [1.06, 1.22, 1])
  // intestine peeking out
  put(new THREE.TorusGeometry(r * 0.26, r * 0.08, 6, 10), meat, 1.0, -0.4, 0.45, [0.4, 1.2, 0], belly)
  put(new THREE.TorusGeometry(r * 0.2, r * 0.07, 6, 10), meat, 1.05, -0.25, 0.25, [0.2, 1.2, 0.8], belly)

  // belt + buckle + straps
  put(new THREE.TorusGeometry(r * 1.0, r * 0.12, 6, 20), cloth, 0.05, 1.02, 0, [PI / 2, 0, 0], body, [1.12, 1.28, 1])
  put(box(r * 0.12, r * 0.34, r * 0.4), gold, 1.3, 1.02, 0)
  put(box(r * 0.14, r * 0.18, r * 0.24), dark, 1.35, 1.02, 0)
  for (const z of [-0.7, -0.4, 0.4, 0.7]) put(sph(r * 0.06, 5, 4), steel, 1.28 - Math.abs(z) * 0.2, 1.02, z)
  // apron
  put(box(r * 0.1, r * 1.1, r * 1.25), apron, 1.27, 1.45, 0, [0, 0, -0.1])
  for (const z of [-0.5, 0, 0.5]) put(box(r * 0.1, r * 0.38, r * 0.4), apronD, 1.27, 0.78, z, [0, 0, -0.15])
  put(box(r * 0.04, r * 0.55, r * 0.55), blood, 1.33, 1.3, 0.2, [0, 0, -0.1])
  put(box(r * 0.04, r * 0.3, r * 0.3), blood, 1.33, 1.75, -0.3, [0, 0, -0.1])
  put(box(r * 0.04, r * 0.6, r * 0.14), blood, 1.33, 0.8, -0.05, [0, 0, -0.15])
  put(box(r * 0.06, r * 0.32, r * 0.45), leather, 1.34, 1.0, -0.25, [0, 0, -0.1]) // pocket
  for (const z of [-0.45, 0.45]) put(cyl(r * 0.05, r * 0.05, r * 0.12, 5), steel, 1.32, 1.75, z, [0, 0, PI / 2])
  seg(body, [1.15, 1.95, 0.5], [0.2, 2.5, 0.8], 0.07, 0.08, leather)
  seg(body, [1.15, 1.95, -0.5], [0.2, 2.5, -0.8], 0.07, 0.08, leather)
  seg(body, [-1.15, 1.1, 0.35], [-1.35, 0.5, 0.45], 0.05, 0.05, apronD)
  seg(body, [-1.15, 1.1, -0.35], [-1.35, 0.5, -0.45], 0.05, 0.05, apronD)
  // hanging meat slab + small hook rack on the hip (visible side)
  put(cyl(r * 0.04, r * 0.04, r * 0.35, 5), dark, 0.7, 0.85, 1.0)
  put(box(r * 0.32, r * 0.5, r * 0.22), meat, 0.7, 0.45, 1.05, [0.1, 0, 0.2])
  put(box(r * 0.1, r * 0.4, r * 0.24), bone, 0.7, 0.45, 1.05, [0.1, 0, 0.2])
  for (let i = 0; i < 3; i++) put(new THREE.TorusGeometry(r * 0.12, r * 0.035, 5, 8, PI * 1.4), steel, -0.2 + i * 0.25, 0.85, 1.15, [0.2, 0, 3.4])
  put(box(r * 0.3, r * 0.3, r * 0.1), cloth, 0.2, 0.95, 1.17)

  // shoulders / right (weapon) arm
  for (const s of [-1, 1]) {
    put(sph(r * 0.58, 8, 7), skin, 0.2, 2.3, s * 1.25)
    put(sph(r * 0.22, 6, 5), rotG, 0.3, 2.55, s * 1.4)
    put(cyl(r * 0.28, r * 0.28, r * 0.12, 8), leather, 0.3, 2.18, s * 1.3, [0.4 * s, 0, -0.3])
  }
  seg(body, [0.25, 2.25, 1.3], [0.5, 1.9, 1.5], 0.45, 0.38, skin)
  seg(body, [0.5, 1.9, 1.5], [0.58, 1.62, 1.63], 0.36, 0.3, skinD)
  put(cyl(r * 0.37, r * 0.34, r * 0.28, 8), leather, 0.55, 1.74, 1.58, [0.1, 0, 0.15])
  put(cone(r * 0.07, r * 0.2, 4), steel, 0.7, 1.78, 1.7, [0, 0, -1.2])
  put(cone(r * 0.07, r * 0.2, 4), steel, 0.7, 1.68, 1.7, [0, 0, -1.2])
  put(sph(r * 0.3, 7, 6), skin, 0.6, 1.58, 1.65)

  // left (hook) arm - pivoted
  const armL = grp(body, 0.2, 2.3, -1.25)
  seg(armL, [0, 0, 0], [0.2, -0.6, -0.1], 0.45, 0.38, skin)
  seg(armL, [0.2, -0.6, -0.1], [0.3, -1.05, -0.2], 0.36, 0.3, skinD)
  put(cyl(r * 0.36, r * 0.33, r * 0.25, 8), leather, 0.28, -0.95, -0.18, [0, 0, 0.2], armL)
  put(sph(r * 0.3, 7, 6), skin, 0.33, -1.12, -0.22, [0, 0, 0], armL)
  put(sph(r * 0.16, 6, 5), rotM, 0.1, -0.4, -0.35, [0, 0, 0], armL)
  // hook chain hanging from the hand (swings)
  const chain = grp(armL, 0.33, -1.15, -0.25)
  for (let i = 0; i < 6; i++) put(new THREE.TorusGeometry(r * 0.13, r * 0.04, 5, 8), steel, 0, -0.15 - i * 0.2, 0, [i % 2 ? PI / 2 : 0, 0, 0], chain)
  put(new THREE.TorusGeometry(r * 0.42, r * 0.1, 6, 14, PI * 1.35), steel, 0, -1.65, 0, [0, 0, -0.4], chain)
  put(cone(r * 0.14, r * 0.5, 5), steel, 0.38, -1.58, 0, [0, 0, 2.2], chain)
  put(sph(r * 0.12, 5, 4), steelD, 0, -1.25, 0, [0, 0, 0], chain)

  // head
  put(cyl(r * 0.4, r * 0.55, r * 0.35, 8), skin, 0.4, 2.65, 0)
  put(sph(r * 0.6, 10, 9), skin, 0.55, 3.0, 0, [0, 0, 0], body, [1, 0.95, 1.05])
  put(box(r * 0.3, r * 0.14, r * 0.85), dark, 0.97, 3.12, 0, [0, 0, 0.12])
  for (const s of [-1, 1]) {
    put(sph(r * 0.15, 6, 5), dark, 1.0, 3.0, s * 0.23)
    put(sph(r * 0.09, 5, 4), glow('#e8f060', 0.9), 1.08, 3.0, s * 0.23)
    put(sph(r * 0.2, 6, 5), skin, 0.5, 3.0, s * 0.64, [0, 0, 0], body, [0.5, 1, 0.6])
    put(cone(r * 0.1, r * 0.3, 4), skinD, 0.5, 3.25, s * 0.72, [s * -0.5, 0, 0])
    put(sph(r * 0.13, 5, 4), rotM, 0.95, 2.88, s * 0.42)
  }
  put(sph(r * 0.14, 6, 5), skinD, 1.1, 2.88, 0)
  put(box(r * 0.35, r * 0.22, r * 0.62), skinD, 0.95, 2.62, 0) // underbite jaw
  put(box(r * 0.18, r * 0.12, r * 0.55), bone, 1.1, 2.78, 0)
  for (const z of [-0.2, 0.2]) put(cone(r * 0.06, r * 0.26, 4), bone, 1.1, 2.9, z)
  for (const z of [-0.22, 0.22]) put(cone(r * 0.05, r * 0.2, 4), bone, 1.12, 2.58, z, [0, 0, PI])
  for (let i = 0; i < 5; i++) put(cone(r * 0.1, r * 0.4, 4), dark, 0.2 + i * 0.1, 3.58 - Math.abs(i - 2) * 0.05, (i - 2) * 0.08, [0, 0, 0.35 - i * 0.12])
  put(box(r * 0.06, r * 0.06, r * 0.5), dark, 0.3, 3.5, 0, [0.2, 0, 0.3])
  for (let i = 0; i < 4; i++) put(box(r * 0.05, r * 0.05, r * 0.1), dark, 0.3, 3.5, -0.2 + i * 0.13)
  put(box(r * 0.04, r * 0.4, r * 0.04), dark, 0.9, 3.4, 0.4, [0, 0, 0.5])

  // cleaver (weapon pivot at right hand)
  weapon.position.set(r * 0.6, r * 1.65, r * 1.65)
  put(cyl(r * 0.1, r * 0.1, r * 1.0, 7), b.m('#4a2a1a'), 0, 0.5, 0, [0, 0, 0], weapon)
  for (const y of [0.15, 0.4, 0.65]) put(new THREE.TorusGeometry(r * 0.1, r * 0.03, 5, 8), leather, 0, y, 0, [PI / 2, 0, 0], weapon)
  put(sph(r * 0.15, 6, 5), steelD, 0, -0.02, 0, [0, 0, 0], weapon)
  put(box(r * 0.3, r * 0.1, r * 0.3), steelD, 0.05, 1.0, 0, [0, 0, 0], weapon)
  put(box(r * 1.1, r * 1.3, r * 0.1), steel, 0.35, 1.6, 0, [0, 0, 0], weapon)
  put(box(r * 0.14, r * 1.3, r * 0.15), steelD, -0.2, 1.6, 0, [0, 0, 0], weapon)
  put(box(r * 0.07, r * 1.3, r * 0.13), metal('#e6eaf2'), 0.9, 1.6, 0, [0, 0, 0], weapon)
  for (const y of [1.15, 1.6, 2.0]) {
    put(box(r * 0.13, r * 0.1, r * 0.15), dark, 0.9, y, 0, [0, 0, 0], weapon)
    put(cyl(r * 0.05, r * 0.05, r * 0.14, 6), steelD, -0.02, y, 0, [PI / 2, 0, 0], weapon)
  }
  put(cyl(r * 0.1, r * 0.1, r * 0.14, 8), dark, 0.55, 2.0, 0, [PI / 2, 0, 0], weapon)
  put(box(r * 0.55, r * 0.3, r * 0.12), blood, 0.55, 1.2, 0, [0, 0, 0.3], weapon)
  put(box(r * 0.3, r * 0.2, r * 0.12), blood, 0.4, 1.85, 0, [0, 0, -0.2], weapon)
  put(box(r * 0.06, r * 0.4, r * 0.12), blood, 0.9, 0.95, 0, [0, 0, 0], weapon)

  weapon.scale.setScalar(0.8)
  // flies
  const flies: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) flies.push(put(sph(r * 0.05, 4, 3), dark, 0.5, 3.8, 0))

  const gait = new Gait()
  return {
    height: r * 3.7,
    update: (t, st) => {
      gait.step(t, st.moving, 9)
      const sw = Math.sin(gait.ph) * 0.65 * gait.k
      legs[0].rotation.z = sw
      legs[1].rotation.z = -sw
      armL.rotation.z = -sw * 0.7 + Math.sin(t * 1.4) * 0.04
      belly.scale.set(1 + Math.sin(t * 2.2) * 0.012, 1 + Math.sin(t * 2.2 + 1) * 0.02 + Math.sin(gait.ph * 2) * 0.03 * gait.k, 1 + Math.sin(t * 2.2) * 0.012)
      belly.position.y = r * (1.4 + Math.sin(gait.ph * 2 + 1) * 0.03 * gait.k)
      chain.rotation.z = Math.sin(t * 2.1) * 0.08 + sw * 0.5 + 0.05
      chain.rotation.x = Math.sin(t * 1.7) * 0.06
      const pulse = 0.3 + 0.2 * Math.sin(t * 2.5)
      ;(rotG as THREE.MeshStandardMaterial).emissiveIntensity = pulse + (st.casting ? 0.5 : 0)
      flies.forEach((f, i) => {
        const a = t * (3.2 + i) + i * 2.1
        f.position.set(r * (0.5 + Math.cos(a) * 0.85), r * (3.7 + Math.sin(a * 2.3) * 0.2), r * Math.sin(a) * 0.85)
      })
    },
  }
}

/* ----------------------------------------------------------------- SNIPER */
function heroSniper(c: HCtx): HOut {
  const { b, r, body, weapon, c1 } = c
  const { put, grp, glow, metal, seg } = hkit(c)
  const PI = Math.PI
  const skin = b.m('#dba682')
  const leather = b.m('#5a3a1e')
  const leatherD = b.m('#3a2614')
  const hatM = b.m('#6b4423')
  const hatD = b.m('#4a2e16')
  const beardM = b.m('#d0702a')
  const beardL = b.m('#e08a3a')
  const dark = b.m('#222226')
  const brass = metal('#c9a14a')
  const copper = metal('#b4602e')
  const pants = b.m('#3d2f22')
  const white = b.m('#efe6d2')
  const lens = glow('#80d8ff', 0.9)
  const lensRed = glow('#ff6a4a', 0.9)

  const legs: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const L = grp(body, 0, 0.85, s * 0.38)
    legs.push(L)
    put(cyl(r * 0.32, r * 0.3, r * 0.4, 7), pants, 0, -0.2, 0, [0, 0, 0], L)
    put(box(r * 0.14, r * 0.24, r * 0.3), leather, 0.28, -0.25, 0, [0, 0, 0], L) // knee pad
    put(cyl(r * 0.3, r * 0.27, r * 0.5, 7), leather, 0, -0.55, 0, [0, 0, 0], L)
    put(cyl(r * 0.36, r * 0.32, r * 0.14, 7), leatherD, 0, -0.38, 0, [0, 0, 0], L)
    put(box(r * 0.8, r * 0.16, r * 0.44), dark, 0.13, -0.78, 0, [0, 0, 0], L)
    put(sph(r * 0.22, 6, 5), leather, 0.4, -0.7, 0, [0, 0, 0], L, [1, 0.7, 1])
    for (const y of [-0.5, -0.64]) put(box(r * 0.05, r * 0.07, r * 0.36), brass, 0.28, y, 0, [0, 0, 0], L) // buckles
  }
  // coat
  put(cyl(r * 0.6, r * 0.78, r * 1.1, 10), c1, 0, 1.3, 0)
  put(cyl(r * 0.8, r * 0.98, r * 0.55, 10), c1, 0, 0.82, 0)
  put(box(r * 0.5, r * 0.9, r * 0.5), c1, -0.85, 0.55, 0, [0, 0, 0.2]) // coat tail
  put(box(r * 0.08, r * 0.6, r * 0.6), leatherD, 0.95, 0.75, 0, [0, 0, -0.05]) // front placket
  for (let i = 0; i < 4; i++) put(sph(r * 0.06, 5, 4), brass, 0.9 + (i > 1 ? 0.0 : 0), 1.1 - i * 0.2, 0.0)
  put(new THREE.TorusGeometry(r * 0.55, r * 0.14, 6, 14), leather, 0, 1.9, 0, [PI / 2, 0, 0], body, [1, 1, 1]) // collar
  for (const s of [-1, 1]) put(box(r * 0.4, r * 0.1, r * 0.3), leatherD, 0.45, 1.75, s * 0.38, [0.0, 0, -0.5 * s * 0.0 + 0.3])
  // belt, pouches
  put(new THREE.TorusGeometry(r * 0.85, r * 0.09, 6, 18), leatherD, 0, 0.95, 0, [PI / 2, 0, 0], body, [1, 1, 1])
  put(box(r * 0.1, r * 0.22, r * 0.3), brass, 0.88, 0.95, 0)
  for (const [x, z] of [[0.7, 0.45], [0.7, -0.45], [0.2, 0.84]]) {
    put(box(r * 0.28, r * 0.34, r * 0.28), leather, x, 0.65, z)
    put(box(r * 0.3, r * 0.1, r * 0.3), leatherD, x, 0.8, z)
    put(sph(r * 0.04, 4, 3), brass, x + 0.14, 0.78, z)
  }
  put(cyl(r * 0.2, r * 0.2, r * 0.35, 8), b.m('#6a7a5a'), -0.6, 0.7, 0.85, [PI / 2, 0, 0]) // canteen
  put(cyl(r * 0.12, r * 0.12, r * 0.08, 6), brass, -0.6, 0.7, 1.05, [PI / 2, 0, 0])
  put(box(r * 0.12, r * 0.55, r * 0.14), leather, 0.4, 0.45, 0.88, [0, 0, 0.1]) // knife sheath
  put(box(r * 0.08, r * 0.2, r * 0.1), brass, 0.4, 0.78, 0.88)
  // bandolier
  seg(body, [0.15, 1.95, -0.55], [0.55, 0.95, 0.6], 0.085, 0.085, leather, 6)
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9.5
    const x = 0.15 + (0.55 - 0.15) * t + 0.12
    const y = 1.95 - 1.0 * t
    const z = -0.55 + 1.15 * t
    put(cyl(r * 0.06, r * 0.06, r * 0.26, 6), brass, x, y, z)
    put(cone(r * 0.06, r * 0.12, 6), copper, x, y + 0.19, z)
  }
  // right arm (holds rifle), left arm braces the foregrip (child of weapon)
  put(sph(r * 0.3, 7, 6), c1, 0.05, 1.82, 0.78)
  seg(body, [0.05, 1.82, 0.78], [0.25, 1.48, 0.86], 0.26, 0.22, c1)
  put(cyl(r * 0.24, r * 0.24, r * 0.1, 7), leatherD, 0.27, 1.45, 0.82, [0, 0, 0.6])
  put(sph(r * 0.3, 7, 6), c1, 0.05, 1.82, -0.78)
  // head
  put(sph(r * 0.44, 10, 9), skin, 0.12, 2.15, 0)
  put(sph(r * 0.12, 6, 5), b.m('#d98a72'), 0.55, 2.08, 0)
  for (const s of [-1, 1]) {
    put(sph(r * 0.1, 5, 4), white, 0.5, 2.27, s * 0.17)
    put(sph(r * 0.05, 5, 4), dark, 0.58, 2.27, s * 0.17)
    put(box(r * 0.14, r * 0.07, r * 0.2), beardM, 0.56, 2.38, s * 0.17, [s * 0.2, 0, 0.1]) // brows
    put(sph(r * 0.14, 6, 5), b.m('#d98a72'), 0.4, 2.0, s * 0.34)
  }
  // beard
  const beard = grp(body, 0.32, 1.85, 0)
  put(sph(r * 0.58, 9, 8), beardM, 0, 0.0, 0, [0, 0, 0], beard, [0.8, 1.1, 1])
  put(cone(r * 0.42, r * 0.9, 8), beardM, 0.1, -0.55, 0, [0, 0, PI], beard, [0.8, 1, 1.1])
  for (let i = 0; i < 5; i++) put(cone(r * 0.12, r * 0.6, 5), beardL, 0.45, -0.1 - Math.abs(i - 2) * 0.1, (i - 2) * 0.2, [0, 0, PI - 0.25], beard)
  for (const s of [-1, 1]) {
    put(cone(r * 0.12, r * 0.7, 5), beardL, 0.4, -0.5, s * 0.4, [0, 0, PI - 0.1], beard)
    put(sph(r * 0.07, 5, 4), brass, 0.4, -0.85, s * 0.4, [0, 0, 0], beard)
    put(cone(r * 0.13, r * 0.5, 5), white, 0.62, 0.2, s * 0.2, [s * 0.4, 0, -1.2], beard) // moustache
  }
  // goggles + strap
  put(new THREE.TorusGeometry(r * 0.46, r * 0.045, 5, 14), dark, 0.12, 2.3, 0, [PI / 2, 0, 0])
  for (const s of [-1, 1]) {
    put(cyl(r * 0.17, r * 0.17, r * 0.1, 10), brass, 0.54, 2.3, s * 0.2, [0, 0, PI / 2])
    put(cyl(r * 0.12, r * 0.12, r * 0.06, 10), s > 0 ? lens : lensRed, 0.6, 2.3, s * 0.2, [0, 0, PI / 2])
  }
  put(box(r * 0.08, r * 0.06, r * 0.2), brass, 0.56, 2.3, 0)
  // hat
  put(cyl(r * 0.85, r * 0.9, r * 0.07, 14), hatM, 0.1, 2.5, 0)
  put(cyl(r * 0.4, r * 0.52, r * 0.55, 10), hatM, 0.1, 2.8, 0)
  put(cyl(r * 0.43, r * 0.43, r * 0.07, 10), hatD, 0.1, 3.08, 0)
  put(cyl(r * 0.53, r * 0.54, r * 0.12, 10), dark, 0.1, 2.62, 0)
  put(box(r * 0.5, r * 0.07, r * 0.1), brass, 0.65, 2.62, 0)
  put(cone(r * 0.12, r * 0.85, 4), b.m('#c84a3a'), -0.3, 3.0, 0.4, [0.2, 0, 0.9]) // feather
  put(new THREE.TorusGeometry(r * 0.85, r * 0.04, 5, 18), hatD, 0.1, 2.54, 0, [PI / 2, 0, 0])
  for (let i = 0; i < 5; i++) put(cyl(r * 0.04, r * 0.04, r * 0.16, 5), brass, 0.12 + 0.5 * Math.cos(-0.9 + i * 0.4), 2.62, 0.5 * Math.sin(-0.9 + i * 0.4) * 1.0)
  // backpack
  put(box(r * 0.45, r * 0.95, r * 0.85), leather, -0.78, 1.35, 0)
  put(box(r * 0.5, r * 0.15, r * 0.9), leatherD, -0.78, 1.85, 0)
  put(cyl(r * 0.2, r * 0.2, r * 1.05, 8), b.m('#8a7a5a'), -0.8, 2.05, 0, [PI / 2, 0, 0]) // bedroll
  put(cyl(r * 0.08, r * 0.08, r * 1.08, 5), leatherD, -0.8, 2.05, 0.3, [PI / 2, 0, 0])
  put(box(r * 0.25, r * 0.4, r * 0.3), leatherD, -1.05, 1.1, 0.4)
  put(cyl(r * 0.14, r * 0.12, r * 0.2, 7), brass, -1.0, 1.7, -0.5)
  seg(body, [-0.5, 1.8, 0.4], [0.1, 1.85, 0.7], 0.05, 0.05, leatherD, 5)
  seg(body, [-0.5, 1.8, -0.4], [0.1, 1.85, -0.7], 0.05, 0.05, leatherD, 5)

  // rifle (weapon pivot)
  weapon.position.set(r * 0.3, r * 1.55, r * 0.78)
  put(cyl(r * 0.07, r * 0.085, r * 3.3, 8), dark, 1.9, 0, 0, [0, 0, PI / 2], weapon)
  put(cyl(r * 0.13, r * 0.13, r * 1.2, 8), metal('#4a4f58'), 1.35, 0, 0, [0, 0, PI / 2], weapon) // shroud
  put(cyl(r * 0.12, r * 0.1, r * 0.4, 8), metal('#555a62'), 3.65, 0, 0, [0, 0, PI / 2], weapon) // flash hider
  for (let i = 0; i < 3; i++) put(box(r * 0.05, r * 0.2, r * 0.26), dark, 3.55 + i * 0.1, 0, 0, [0, 0, 0], weapon)
  put(box(r * 0.8, r * 0.28, r * 0.24), metal('#3a3f48'), 0.2, 0.0, 0, [0, 0, 0], weapon) // receiver
  put(box(r * 0.9, r * 0.3, r * 0.2), hatM, -0.6, -0.08, 0, [0, 0, 0.12], weapon) // stock
  put(box(r * 0.35, r * 0.4, r * 0.22), hatD, -1.15, -0.12, 0, [0, 0, 0.12], weapon) // butt
  put(box(r * 0.5, r * 0.1, r * 0.2), hatD, -0.55, 0.12, 0, [0, 0, 0.12], weapon) // cheek rest
  put(box(r * 0.22, r * 0.5, r * 0.18), leather, 0.15, -0.35, 0, [0, 0, -0.2], weapon) // grip
  put(box(r * 0.3, r * 0.4, r * 0.16), dark, 0.55, -0.3, 0, [0, 0, 0], weapon) // mag
  put(cyl(r * 0.05, r * 0.05, r * 0.25, 5), brass, 0.0, 0.25, 0.18, [0, 0, 0.9], weapon) // bolt handle
  put(sph(r * 0.07, 5, 4), brass, 0.12, 0.33, 0.28, [0, 0, 0], weapon)
  // scope
  put(cyl(r * 0.15, r * 0.15, r * 1.1, 10), dark, 0.9, 0.3, 0, [0, 0, PI / 2], weapon)
  put(cyl(r * 0.22, r * 0.17, r * 0.4, 10), dark, 1.6, 0.3, 0, [0, 0, PI / 2], weapon)
  put(cyl(r * 0.19, r * 0.1, r * 0.3, 10), dark, 0.2, 0.3, 0, [0, 0, PI / 2], weapon)
  put(cyl(r * 0.19, r * 0.19, r * 0.04, 10), lens, 1.82, 0.3, 0, [0, 0, PI / 2], weapon)
  for (const x of [0.5, 1.2]) put(cyl(r * 0.19, r * 0.19, r * 0.1, 10), brass, x, 0.3, 0, [0, 0, PI / 2], weapon)
  put(cyl(r * 0.07, r * 0.07, r * 0.14, 6), brass, 0.9, 0.5, 0, [0, 0, 0], weapon)
  put(cyl(r * 0.07, r * 0.07, r * 0.14, 6), brass, 0.9, 0.3, 0.17, [PI / 2, 0, 0], weapon)
  for (const x of [0.6, 1.2]) put(box(r * 0.08, r * 0.2, r * 0.1), dark, x, 0.12, 0, [0, 0, 0], weapon)
  // bipod + brass rings + sling
  for (const s of [-1, 1]) put(cyl(r * 0.03, r * 0.03, r * 0.55, 4), dark, 2.3, -0.2, s * 0.1, [s * 0.3, 0, 0.9], weapon)
  for (const x of [1.3, 2.6, 3.0]) put(cyl(r * 0.1, r * 0.1, r * 0.06, 8), brass, x, 0, 0, [0, 0, PI / 2], weapon)
  seg(weapon, [-1.1, -0.1, 0], [1.2, -0.1, 0], 0.025, 0.025, leatherD, 4).position.y -= r * 0.5
  // left forearm braces the foregrip
  seg(weapon, [-0.25, 0.25, -1.4], [1.05, -0.15, -0.1], 0.24, 0.2, c1)
  put(sph(r * 0.22, 6, 5), leatherD, 1.05, -0.15, -0.08, [0, 0, 0], weapon)
  put(sph(r * 0.2, 6, 5), leatherD, 0.15, -0.1, 0.1, [0, 0, 0], weapon)

  const gait = new Gait()
  return {
    height: r * 3.4,
    update: (t, st) => {
      gait.step(t, st.moving, 11)
      const sw = Math.sin(gait.ph) * 0.6 * gait.k
      legs[0].rotation.z = sw
      legs[1].rotation.z = -sw
      beard.rotation.z = Math.sin(t * 2.1) * 0.03 - gait.k * 0.1 + Math.sin(gait.ph * 2) * 0.03 * gait.k
      const base = 0.7 + 0.25 * Math.sin(t * 3)
      lens.emissiveIntensity = st.attacking ? 3 : st.casting ? 2.2 : base
      lensRed.emissiveIntensity = base * 0.8 + (st.casting ? 1.5 : 0)
    },
  }
}

/* ----------------------------------------------------------------- MIRANA */
function heroMirana(c: HCtx): HOut {
  const { b, r, body, weapon, c1, g } = c
  const { put, grp, glow, seg, aim } = hkit(c)
  const PI = Math.PI
  const skin = b.m('#e8bc9a')
  const hair = b.m('#eef0fb')
  const hairS = b.m('#c8d2ee')
  const blue = b.m('#3f6fc4')
  const deep = b.m('#27408a')
  const gold = b.m('#e8d070', { emissive: new THREE.Color('#a89030'), emissiveIntensity: 0.4, metalness: 0.4 })
  const white = b.m('#f2f4fb')
  const capeM = b.m('#3f6fc4', { side: THREE.DoubleSide })
  const capeL = b.m('#7fa4e8', { side: THREE.DoubleSide })
  const gem = glow('#8fd0ff', 1.1)
  const moon = glow('#bfe8ff', 1.2)
  const leather = b.m('#5a3a28')

  // legs (pivoted)
  const legs: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const L = grp(body, 0, 1.55, s * 0.3)
    legs.push(L)
    put(cyl(r * 0.24, r * 0.2, r * 0.7, 7), deep, 0, -0.35, 0, [0, 0, 0], L)
    put(sph(r * 0.13, 6, 5), gem, 0.2, -0.7, 0, [0, 0, 0], L)
    put(cyl(r * 0.2, r * 0.25, r * 0.75, 7), white, 0, -1.05, 0, [0, 0, 0], L)
    put(cyl(r * 0.26, r * 0.22, r * 0.12, 7), gold, 0, -0.68, 0, [0, 0, 0], L)
    put(cyl(r * 0.28, r * 0.28, r * 0.07, 7), gold, 0, -1.3, 0, [0, 0, 0], L)
    put(box(r * 0.55, r * 0.14, r * 0.3), white, 0.15, -1.48, 0, [0, 0, 0], L)
    put(cone(r * 0.15, r * 0.5, 5), gold, 0.52, -1.46, 0, [0, 0, -PI / 2], L)
    put(box(r * 0.04, r * 0.5, r * 0.04), gold, 0.22, -1.0, s * 0.2, [0, 0, 0], L)
  }
  // skirt: flared cone + petal tassets
  put(cone(r * 0.75, r * 0.9, 12), blue, 0.0, 1.55, 0, [0, 0, 0], body, [1, 1, 1.1])
  put(cyl(r * 0.5, r * 0.55, r * 0.2, 12), deep, 0, 1.78, 0)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2
    const cx = Math.cos(a)
    const sz = Math.sin(a)
    const m = put(cone(r * 0.17, r * 0.5, 4), i % 2 ? white : gold, cx * 0.66, 1.3, sz * 0.74)
    aim(m, cx * 0.35, -1, sz * 0.35)
  }
  // torso armor
  put(cyl(r * 0.36, r * 0.5, r * 1.0, 10), c1, 0, 2.2, 0)
  put(cyl(r * 0.5, r * 0.5, r * 0.1, 10), gold, 0, 1.75, 0)
  put(cyl(r * 0.4, r * 0.4, r * 0.08, 10), gold, 0, 2.55, 0)
  put(box(r * 0.2, r * 0.55, r * 0.55), white, 0.4, 2.3, 0, [0, 0, -0.08])
  put(box(r * 0.1, r * 0.2, r * 0.7), gold, 0.48, 2.6, 0)
  put(sph(r * 0.11, 6, 5), gem, 0.52, 2.35, 0)
  for (const s of [-1, 1]) put(sph(r * 0.17, 6, 5), white, 0.38, 2.38, s * 0.22)
  put(new THREE.TorusGeometry(r * 0.35, r * 0.07, 5, 12), gold, 0, 2.72, 0, [PI / 2, 0, 0])
  put(new THREE.TorusGeometry(r * 0.12, r * 0.03, 5, 10, PI * 1.4), moon, 0.52, 1.82, 0, [0, PI / 2, 0.8]) // crescent belt charm
  put(box(r * 0.12, r * 0.45, r * 0.12), blue, 0.55, 1.45, 0)
  put(cone(r * 0.12, r * 0.3, 4), gold, 0.55, 1.2, 0, [0, 0, PI])
  // arms: left pivoted, right holds the bow
  const armL = grp(body, 0, 2.62, -0.58)
  put(sph(r * 0.3, 8, 6), white, 0, 0.05, 0, [0, 0, 0], armL, [1.1, 0.7, 1])
  seg(armL, [0, 0, 0], [0.08, -0.5, -0.03], 0.14, 0.12, skin, 6)
  put(cyl(r * 0.16, r * 0.14, r * 0.35, 7), white, 0.1, -0.7, -0.04, [0, 0, 0.1], armL)
  put(cyl(r * 0.17, r * 0.17, r * 0.05, 7), gold, 0.1, -0.52, -0.04, [0, 0, 0.1], armL)
  put(sph(r * 0.13, 6, 5), skin, 0.14, -0.95, -0.05, [0, 0, 0], armL)
  put(sph(r * 0.3, 8, 6), white, 0, 2.7, 0.58, [0, 0, 0], body, [1.1, 0.7, 1])
  put(new THREE.TorusGeometry(r * 0.25, r * 0.04, 5, 10, PI), gold, 0, 2.78, 0.58, [0, PI / 2, 0])
  seg(body, [0, 2.62, 0.58], [0.3, 2.4, 0.7], 0.14, 0.12, skin, 6)
  seg(body, [0.3, 2.4, 0.7], [0.55, 2.22, 0.76], 0.15, 0.13, white, 6)
  put(cyl(r * 0.17, r * 0.17, r * 0.05, 7), gold, 0.3, 2.4, 0.7, [0.3, 0, 0.8])
  put(sph(r * 0.14, 6, 5), skin, 0.55, 2.2, 0.76)
  // head
  put(cyl(r * 0.12, r * 0.14, r * 0.25, 6), skin, 0.02, 2.82, 0)
  put(sph(r * 0.33, 10, 9), skin, 0.14, 3.0, 0)
  for (const s of [-1, 1]) {
    put(sph(r * 0.06, 5, 4), glow('#8fd8ff', 0.9), 0.44, 3.02, s * 0.12)
    put(box(r * 0.05, r * 0.025, r * 0.1), hairS, 0.44, 3.1, s * 0.12, [s * 0.2, 0, 0])
  }
  put(box(r * 0.04, r * 0.03, r * 0.07), b.m('#c06a6a'), 0.46, 2.88, 0)
  put(sph(r * 0.38, 10, 9), hair, -0.1, 3.12, 0, [0, 0, 0], body, [1, 0.85, 1.05])
  for (const s of [-1, 1]) {
    put(cone(r * 0.1, r * 0.7, 5), hair, 0.15, 2.7, s * 0.34, [s * 0.15, 0, 0.1], body).scale.set(1, -1, 1) // face-framing locks
    put(cone(r * 0.09, r * 0.35, 4), hair, 0.28, 3.3, s * 0.1, [0, 0, -1.2])
  }
  put(box(r * 0.1, r * 0.1, r * 0.3), hair, 0.28, 3.28, 0, [0, 0, -0.3])
  // ponytail chain
  const tail: THREE.Group[] = []
  let parent: THREE.Object3D = grp(body, -0.3, 3.1, 0)
  const lens = [0.4, 0.4, 0.38, 0.32, 0.25]
  const rad = [0.2, 0.19, 0.16, 0.12, 0.07]
  const base = [-1.0, 0.3, 0.3, 0.25, 0.2]
  for (let i = 0; i < 5; i++) {
    const G = new THREE.Group()
    G.rotation.z = base[i]
    if (i) G.position.set(0, -lens[i - 1] * r, 0)
    ;(parent as THREE.Object3D).add(G)
    put(cyl(r * rad[i], r * (rad[i + 1] ?? 0.03), r * lens[i], 6), i % 2 ? hair : hairS, 0, -lens[i] / 2, 0, [0, 0, 0], G)
    tail.push(G)
    parent = G
  }
  put(sph(r * 0.15, 6, 5), gold, -0.3, 3.1, 0) // hair tie
  // crescent tiara
  put(new THREE.TorusGeometry(r * 0.3, r * 0.05, 6, 14, PI), gold, 0.12, 3.18, 0, [0, PI / 2, 0.0])
  put(new THREE.TorusGeometry(r * 0.13, r * 0.04, 6, 10, PI * 1.5), moon, 0.34, 3.38, 0, [0, PI / 2, 0.3])
  put(sph(r * 0.08, 6, 5), glow('#bfe8ff', 1.4), 0.4, 3.22, 0)
  put(cone(r * 0.05, r * 0.16, 4), gold, 0.3, 3.45, 0.15, [0, 0, 0.2])
  put(cone(r * 0.05, r * 0.16, 4), gold, 0.3, 3.45, -0.15, [0, 0, 0.2])
  // cape chain
  const cape: THREE.Group[] = []
  let cp: THREE.Object3D = grp(body, -0.45, 2.7, 0)
  const cw = [1.0, 1.2, 1.4, 1.55]
  for (let i = 0; i < 4; i++) {
    const G = new THREE.Group()
    if (i) G.position.set(0, -0.55 * r, 0)
    G.rotation.z = -0.1
    cp.add(G)
    put(box(r * 0.05, r * 0.6, r * cw[i]), i % 2 ? capeL : capeM, 0, -0.3, 0, [0, 0, 0], G)
    put(box(r * 0.07, r * 0.07, r * cw[i]), gold, 0, -0.02, 0, [0, 0, 0], G)
    cape.push(G)
    cp = G
  }
  for (let i = -2; i <= 2; i++) put(cone(r * 0.2, r * 0.5, 3), white, 0, -0.78, i * 0.3, [0, 0, PI], cape[3])
  // quiver and arrows
  put(cyl(r * 0.16, r * 0.14, r * 1.0, 8), leather, -0.5, 2.4, 0.32, [0.0, 0, 0.45])
  put(cyl(r * 0.17, r * 0.17, r * 0.06, 8), gold, -0.35, 2.75, 0.32, [0, 0, 0.45])
  for (let i = 0; i < 3; i++) {
    put(cyl(r * 0.015, r * 0.015, r * 0.5, 4), b.m('#c8b080'), -0.28 + i * 0.03, 3.05, 0.25 + i * 0.07, [0, 0, 0.45])
    put(cone(r * 0.05, r * 0.15, 4), white, -0.14 + i * 0.03, 3.28, 0.25 + i * 0.07, [0, 0, 0.45])
  }
  seg(body, [0.0, 2.7, 0.3], [-0.45, 2.1, 0.4], 0.04, 0.04, leather, 4)

  // bow (weapon pivot)
  weapon.position.set(r * 0.55, r * 2.22, r * 0.78)
  put(new THREE.TorusGeometry(r * 1.25, r * 0.07, 6, 18, PI), white, 0.1, 0, 0, [0, 0, -PI / 2], weapon)
  put(new THREE.TorusGeometry(r * 1.25, r * 0.035, 5, 18, PI), gold, 0.18, 0, 0, [0, 0, -PI / 2], weapon)
  put(new THREE.TorusGeometry(r * 1.32, r * 0.025, 5, 18, PI * 0.8), moon, 0.1, 0, 0, [0, 0, -PI / 2 - 0.0], weapon)
  put(cyl(r * 0.015, r * 0.015, r * 2.5, 3), glow('#c8f0ff', 1), 0.1, 0, 0, [0, 0, 0], weapon)
  put(cyl(r * 0.1, r * 0.1, r * 0.4, 7), leather, 1.35, 0, 0, [PI / 2, 0, 0], weapon) // grip wrap
  put(sph(r * 0.1, 6, 5), gem, 1.35, 0, 0.0, [0, 0, 0], weapon)
  for (const s of [-1, 1]) {
    put(cone(r * 0.2, r * 0.5, 4), gold, 0.12, s * 1.28, 0, [0, 0, s > 0 ? 0 : PI], weapon)
    put(sph(r * 0.08, 5, 4), moon, 0.1, s * 1.5, 0, [0, 0, 0], weapon)
    put(cone(r * 0.04, r * 0.4, 4), white, -0.1, s * 1.6, 0, [0, 0, s * 0.6], weapon) // ribbons
  }
  // nocked arrow
  put(cyl(r * 0.02, r * 0.02, r * 1.6, 4), b.m('#e8d8b0'), 0.65, 0, 0.0, [0, 0, PI / 2], weapon)
  put(cone(r * 0.07, r * 0.22, 4), moon, 1.5, 0, 0, [0, 0, -PI / 2], weapon)
  put(cone(r * 0.06, r * 0.18, 3), white, -0.05, 0.0, 0.05, [0, 0, PI / 2], weapon)

  /* ---- Mantis, the sabre-cat companion (child of g so it does not bob with Mirana) */
  const cat = new THREE.Group()
  cat.position.set(-1.9 * r, 0, -1.7 * r)
  cat.scale.setScalar(0.9)
  g.add(cat)
  const cp2: V3 = [0, 0, 0]
  void cp2
  const fur = b.m('#d3d6ea')
  const furD = b.m('#8b97c8')
  const stripe = b.m('#3c4a8a')
  const fang = b.m('#f4f0e0')
  const eye = glow('#ffe070', 1.2)
  const cput = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot: V3 = [0, 0, 0], p: THREE.Object3D = cat, sc?: V3) => {
    const me = b.mesh(geo, m, x * r, y * r, z * r, p)
    me.rotation.set(rot[0], rot[1], rot[2])
    if (sc) me.scale.set(sc[0], sc[1], sc[2])
    return me
  }
  cput(sph(r * 0.55, 9, 8), fur, 0, 0.78, 0, [0, 0, 0], cat, [1.5, 0.85, 0.85])
  cput(sph(r * 0.4, 8, 7), fur, 0.65, 0.88, 0, [0, 0, 0], cat, [1, 1, 0.95])
  for (let i = 0; i < 4; i++) cput(box(r * 0.06, r * 0.4, r * 0.7), stripe, -0.4 + i * 0.35, 0.95 - Math.abs(i - 1.5) * 0.02, 0, [0, 0, 0.2])
  const head = grp(cat, 1.0, 1.0, 0)
  cput(sph(r * 0.33, 8, 7), fur, 0, 0, 0, [0, 0, 0], head, [1, 0.9, 1])
  cput(sph(r * 0.2, 6, 5), furD, 0.3, -0.08, 0, [0, 0, 0], head, [1, 0.7, 0.9])
  cput(sph(r * 0.05, 5, 4), dark2(b), 0.5, -0.02, 0, [0, 0, 0], head)
  for (const s of [-1, 1]) {
    cput(cone(r * 0.13, r * 0.3, 4), fur, -0.05, 0.38, s * 0.2, [s * 0.2, 0, 0], head)
    cput(sph(r * 0.07, 5, 4), eye, 0.28, 0.1, s * 0.16, [0, 0, 0], head)
    cput(cone(r * 0.06, r * 0.6, 4), fang, 0.38, -0.4, s * 0.12, [0, 0, PI + 0.15], head) // sabre fangs
  }
  for (let i = 0; i < 5; i++) cput(cone(r * 0.1, r * 0.35, 4), furD, 0.45 - i * 0.2, 1.2 - Math.abs(i - 2) * 0.05, 0, [0, 0, 0.5 - i * 0.2])
  cput(new THREE.TorusGeometry(r * 0.3, r * 0.05, 5, 10), gold, 0.55, 0.95, 0, [0, PI / 2, 0])
  cput(sph(r * 0.07, 5, 4), gem, 0.82, 0.78, 0)
  const cLegs: THREE.Group[] = []
  for (const [x, z] of [[0.5, 0.28], [0.5, -0.28], [-0.55, 0.28], [-0.55, -0.28]]) {
    const L = grp(cat, x, 0.65, z)
    cLegs.push(L)
    cput(cyl(r * 0.14, r * 0.1, r * 0.65, 6), fur, 0, -0.3, 0, [0, 0, 0], L)
    cput(sph(r * 0.14, 5, 4), furD, 0.05, -0.65, 0, [0, 0, 0], L, [1.2, 0.6, 1])
  }
  const ctBase = [-2.0, 0.5, 0.5, 0.4]
  const ctail: THREE.Group[] = []
  let tp: THREE.Object3D = grp(cat, -0.8, 0.9, 0)
  for (let i = 0; i < 4; i++) {
    const G = new THREE.Group()
    G.rotation.z = ctBase[i]
    if (i) G.position.set(0, -0.3 * r, 0)
    tp.add(G)
    cput(cyl(r * (0.12 - i * 0.015), r * (0.1 - i * 0.015), r * 0.3, 6), i % 2 ? stripe : fur, 0, -0.15, 0, [0, 0, 0], G)
    ctail.push(G)
    tp = G
  }

  const gait = new Gait()
  const cgait = new Gait()
  return {
    height: r * 3.8,
    update: (t, st) => {
      gait.step(t, st.moving, 10)
      cgait.step(t, st.moving, 11)
      const sw = Math.sin(gait.ph) * 0.6 * gait.k
      legs[0].rotation.z = sw
      legs[1].rotation.z = -sw
      armL.rotation.z = -sw * 0.8 + Math.sin(t * 1.3) * 0.03
      tail.forEach((G, i) => {
        G.rotation.z = base[i] + Math.sin(t * 2.6 - i * 0.8) * 0.07 * (1 + gait.k) + (i === 0 ? gait.k * 0.35 : 0)
      })
      cape.forEach((G, i) => {
        G.rotation.z = -0.1 - gait.k * 0.18 + Math.sin(t * 2.2 - i * 0.9) * 0.06 * (1 + gait.k)
        G.rotation.x = Math.sin(t * 1.6 + i) * 0.03
      })
      moon.emissiveIntensity = 0.9 + 0.4 * Math.sin(t * 2.4) + (st.casting ? 1 : 0)
      gem.emissiveIntensity = 0.9 + 0.3 * Math.sin(t * 3 + 1)
      // cat
      const cs = Math.sin(cgait.ph) * 0.7 * cgait.k
      cLegs[0].rotation.z = cs
      cLegs[3].rotation.z = cs
      cLegs[1].rotation.z = -cs
      cLegs[2].rotation.z = -cs
      cat.position.y = Math.abs(Math.sin(cgait.ph)) * 0.06 * r * cgait.k
      cat.scale.y = 0.9 * (1 + Math.sin(t * 2) * 0.012)
      head.rotation.z = Math.sin(t * 0.9) * 0.05 - 0.05
      ctail.forEach((G, i) => (G.rotation.z = ctBase[i] + Math.sin(t * 3 - i) * 0.12))
    },
  }
}
const dark2 = (b: Builder) => b.m('#2a2230')

/* -------------------------------------------------------------------- AXE */
function heroAxe(c: HCtx): HOut {
  const { b, r, body, weapon, c1 } = c
  const { put, grp, glow, metal, seg } = hkit(c)
  const PI = Math.PI
  const skin = b.m('#b8472f')
  const skinD = b.m('#8a2f20')
  const skinL = b.m('#cc5a3e')
  const beardM = b.m('#c4301e')
  const beardD = b.m('#8e1f12')
  const fur = b.m('#6b3a20')
  const furL = b.m('#8a5a34')
  const iron = metal('#8a8e98')
  const ironD = metal('#4e525c')
  const bone = b.m('#ece3c8')
  const dark = b.m('#2a1a14')
  const leather = b.m('#4a2a18')
  const steel = metal('#cfd3de')
  const gold = metal('#d8a840')
  const eye = glow('#ffe080', 1.0)
  const rune = glow('#ff6a4a', 0.7)
  const gem = glow('#ffd070', 0.9)
  const paint = b.m('#2a1410')

  // legs
  const legs: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const L = grp(body, 0, 1.05, s * 0.55)
    legs.push(L)
    put(cyl(r * 0.45, r * 0.4, r * 0.5, 8), skinD, 0, -0.25, 0, [0, 0, 0], L)
    put(cyl(r * 0.4, r * 0.46, r * 0.35, 8), skinD, 0, -0.55, 0, [0, 0, 0], L)
    for (const y of [-0.15, -0.5, -0.65]) put(new THREE.TorusGeometry(r * 0.44, r * 0.04, 4, 10), leather, 0, y, 0, [PI / 2, 0, 0], L)
    put(box(r * 0.14, r * 0.34, r * 0.4), iron, 0.4, -0.35, 0, [0, 0, 0.1], L) // knee guard
    put(cone(r * 0.1, r * 0.3, 5), iron, 0.55, -0.35, 0, [0, 0, -PI / 2], L)
    put(cyl(r * 0.55, r * 0.6, r * 0.45, 8), fur, 0, -0.78, 0, [0, 0, 0], L)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2
      put(cone(r * 0.1, r * 0.3, 4), furL, Math.cos(a) * 0.55, -0.58, Math.sin(a) * 0.55, [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3 + PI], L)
    }
    put(box(r * 0.95, r * 0.14, r * 0.62), dark, 0.18, -1.0, 0, [0, 0, 0], L)
    put(sph(r * 0.3, 6, 5), fur, 0.52, -0.93, 0, [0, 0, 0], L, [1, 0.7, 1.1])
  }
  // kilt: leather strips + studs
  put(cyl(r * 0.96, r * 1.05, r * 0.3, 10), fur, 0, 1.3, 0, [0, 0, 0], body, [0.9, 1, 1])
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2
    const x = Math.cos(a) * 0.82
    const z = Math.sin(a) * 1.0
    const m = put(box(r * 0.07, r * 0.65, r * 0.3), i % 2 ? leather : b.m('#5a3420'), x, 1.0, z, [0, 0, 0])
    m.rotation.y = -a
    m.rotation.z = 0.12
    put(sph(r * 0.045, 4, 3), iron, x * 1.05, 1.18, z * 1.05)
  }
  put(new THREE.TorusGeometry(r * 0.95, r * 0.12, 6, 18), leather, 0, 1.45, 0, [PI / 2, 0, 0], body, [0.9, 1.05, 1])
  put(sph(r * 0.2, 7, 6), bone, 0.98, 1.45, 0, [0, 0, 0], body, [0.7, 1, 1]) // skull
  put(box(r * 0.1, r * 0.1, r * 0.22), dark, 1.1, 1.38, 0)
  for (const z of [-0.07, 0.07]) put(sph(r * 0.045, 4, 3), dark, 1.1, 1.48, z)
  for (const z of [-0.6, 0.6]) put(cone(r * 0.1, r * 0.3, 5), bone, 0.9, 1.45, z, [0, 0, PI]) // tusks
  put(sph(r * 0.18, 6, 5), iron, 0.0, 1.45, 1.0)
  put(sph(r * 0.18, 6, 5), iron, 0.0, 1.45, -1.0)
  // chest
  put(cyl(r * 1.15, r * 0.8, r * 1.2, 10), skin, 0, 2.05, 0, [0, 0, 0], body, [0.85, 1, 1.05])
  for (const s of [-1, 1]) put(sph(r * 0.48, 8, 7), skinL, 0.62, 2.4, s * 0.42, [0, 0, 0], body, [0.8, 0.9, 1])
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) put(sph(r * 0.2, 6, 5), skinL, 0.78, 1.95 - i * 0.2, s * 0.22, [0, 0, 0], body, [0.6, 0.7, 1])
  // scars + war paint
  put(box(r * 0.04, r * 0.7, r * 0.06), skinD, 0.98, 2.1, 0.5, [0.3, 0, 0.5])
  put(box(r * 0.04, r * 0.5, r * 0.06), skinD, 0.95, 2.2, -0.6, [-0.3, 0, -0.5])
  put(box(r * 0.04, r * 0.9, r * 0.18), paint, 0.97, 2.45, 0, [0, 0, 0])
  // harness: X straps + plate
  seg(body, [0.85, 2.85, -0.55], [0.9, 1.4, 0.55], 0.08, 0.08, leather, 6)
  seg(body, [0.85, 2.85, 0.55], [0.9, 1.4, -0.55], 0.08, 0.08, leather, 6)
  put(cyl(r * 0.28, r * 0.28, r * 0.1, 10), iron, 0.98, 2.1, 0, [0, 0, PI / 2])
  put(sph(r * 0.15, 6, 5), gem, 1.06, 2.1, 0)
  put(box(r * 0.2, r * 0.18, r * 0.8), iron, 0.85, 2.7, 0)
  for (const z of [-0.3, 0, 0.3]) put(sph(r * 0.06, 4, 3), gold, 0.97, 2.7, z)
  // tooth necklace
  for (let i = 0; i < 7; i++) {
    const a = -1.0 + i * (2.0 / 6)
    put(cone(r * 0.05, r * 0.2, 4), bone, 0.92 + Math.cos(a) * 0.15, 2.95 - Math.cos(a * 1.6) * 0.22, Math.sin(a) * 0.5 * 1.2, [0, 0, PI])
  }
  // back cape (fur lined)
  const cape: THREE.Group[] = []
  let cp: THREE.Object3D = grp(body, -0.7, 3.0, 0)
  for (let i = 0; i < 3; i++) {
    const G = new THREE.Group()
    if (i) G.position.set(0, -0.65 * r, 0)
    G.rotation.z = -0.12
    cp.add(G)
    put(box(r * 0.07, r * 0.7, r * (1.5 - i * 0.1)), i % 2 ? b.m('#9a2a1a', { side: THREE.DoubleSide }) : b.m('#7a1e12', { side: THREE.DoubleSide }), 0, -0.35, 0, [0, 0, 0], G)
    cape.push(G)
    cp = G
  }
  put(cyl(r * 0.2, r * 0.2, r * 1.6, 6), furL, -0.0, 0.0, 0, [PI / 2, 0, 0], cape[0])
  // arms + shoulders
  for (const s of [-1, 1]) {
    put(sph(r * 0.62, 9, 7), c1, 0, 2.75, s * 1.15, [0, 0, 0], body, [1, 0.8, 1])
    put(sph(r * 0.55, 7, 6), fur, 0, 3.0, s * 1.1, [0, 0, 0], body, [1, 0.6, 1])
    for (let i = 0; i < 5; i++) put(cone(r * 0.1, r * 0.3, 4), furL, -0.15 + i * 0.08, 3.1, s * (0.75 + i * 0.15), [s * 0.5, 0, 0])
    for (let i = 0; i < 3; i++) put(cone(r * (0.18 - i * 0.03), r * (0.6 - i * 0.1), 5), iron, 0.0 + i * 0.1, 3.18 + i * 0.05, s * (1.2 + i * 0.1), [s * 0.4, 0, 0])
    put(new THREE.TorusGeometry(r * 0.5, r * 0.06, 5, 12), gold, 0, 2.7, s * 1.15, [0, PI / 2, 0], body, [1, 0.8, 1])
  }
  const armL = grp(body, 0.0, 2.55, -1.2)
  seg(armL, [0, 0, 0], [0.2, -0.55, -0.1], 0.45, 0.4, skin, 8)
  seg(armL, [0.2, -0.55, -0.1], [0.3, -1.0, -0.2], 0.4, 0.34, skin, 8)
  put(cyl(r * 0.4, r * 0.38, r * 0.4, 8), fur, 0.28, -0.9, -0.18, [0, 0, 0.1], armL)
  put(box(r * 0.16, r * 0.34, r * 0.5), iron, 0.4, -0.85, -0.18, [0, 0, 0.1], armL)
  put(sph(r * 0.3, 7, 6), skin, 0.33, -1.1, -0.22, [0, 0, 0], armL)
  seg(body, [0.0, 2.55, 1.2], [0.35, 2.05, 1.4], 0.45, 0.4, skin, 8)
  seg(body, [0.35, 2.05, 1.4], [0.55, 1.65, 1.55], 0.4, 0.34, skin, 8)
  put(cyl(r * 0.4, r * 0.38, r * 0.4, 8), fur, 0.48, 1.8, 1.48, [0, 0, 0.2])
  put(box(r * 0.16, r * 0.34, r * 0.55), iron, 0.62, 1.72, 1.5, [0, 0, 0.2])
  put(sph(r * 0.32, 7, 6), skin, 0.55, 1.58, 1.55)
  // head
  put(cyl(r * 0.4, r * 0.55, r * 0.35, 8), skin, 0.1, 2.8, 0)
  put(sph(r * 0.5, 10, 9), skin, 0.15, 3.1, 0)
  put(box(r * 0.22, r * 0.12, r * 0.64), dark, 0.62, 3.22, 0, [0, 0, 0.1])
  put(sph(r * 0.1, 6, 5), skinD, 0.66, 3.05, 0)
  for (const s of [-1, 1]) {
    put(sph(r * 0.11, 5, 4), dark, 0.62, 3.14, s * 0.18)
    put(sph(r * 0.07, 5, 4), eye, 0.68, 3.14, s * 0.18)
    put(box(r * 0.05, r * 0.3, r * 0.04), paint, 0.66, 3.0, s * 0.3, [0, 0, 0])
  }
  // beard with braids
  put(sph(r * 0.52, 9, 8), beardM, 0.4, 2.7, 0, [0, 0, 0], body, [0.9, 1.1, 1.1])
  put(cone(r * 0.4, r * 0.8, 7), beardM, 0.52, 2.15, 0, [0, 0, PI])
  const braids: THREE.Group[] = []
  for (const z of [-0.28, 0.28]) {
    const G = grp(body, 0.75, 2.45, z)
    for (let i = 0; i < 4; i++) put(sph(r * (0.12 - i * 0.012), 5, 4), i % 2 ? beardM : beardD, 0, -0.17 - i * 0.2, 0, [0, 0, 0], G)
    put(sph(r * 0.07, 5, 4), gold, 0, -0.95, 0, [0, 0, 0], G)
    braids.push(G)
  }
  put(box(r * 0.2, r * 0.1, r * 0.5), beardD, 0.7, 2.88, 0)
  // horned helmet
  put(cyl(r * 0.56, r * 0.6, r * 0.45, 10), iron, 0.1, 3.5, 0)
  put(sph(r * 0.58, 9, 6), iron, 0.1, 3.65, 0, [0, 0, 0], body, [1, 0.6, 1])
  put(new THREE.TorusGeometry(r * 0.6, r * 0.05, 5, 14), gold, 0.1, 3.3, 0, [PI / 2, 0, 0])
  put(box(r * 0.1, r * 0.5, r * 0.12), iron, 0.65, 3.25, 0)
  for (const z of [-0.3, 0.3]) put(box(r * 0.08, r * 0.35, r * 0.2), ironD, 0.55, 3.3, z * 1.1, [0, 0.4 * Math.sign(z), 0])
  put(box(r * 0.3, r * 0.16, r * 0.04), gold, 0.62, 3.58, 0)
  for (const s of [-1, 1]) {
    put(cone(r * 0.18, r * 0.8, 6), bone, 0.1, 3.75, s * 0.78, [s * -0.9, 0, 0.0])
    put(cone(r * 0.12, r * 0.55, 6), bone, 0.1, 4.2, s * 1.1, [s * -0.35, 0, 0.0])
    put(new THREE.TorusGeometry(r * 0.15, r * 0.035, 4, 8), gold, 0.1, 3.8, s * 0.82, [s * 0.65, 0, 0.0])
    put(cone(r * 0.08, r * 0.35, 5), ironD, 0.1, 3.95, s * 0.5, [s * -0.2, 0, 0])
  }
  put(cone(r * 0.12, r * 0.4, 5), iron, 0.1, 4.05, 0)

  // axe
  weapon.position.set(r * 0.55, r * 1.6, r * 1.55)
  put(cyl(r * 0.1, r * 0.1, r * 3.2, 7), b.m('#4a2a14'), 0, 1.2, 0, [0, 0, 0], weapon)
  for (const y of [0.1, 0.35, 0.6]) put(new THREE.TorusGeometry(r * 0.1, r * 0.03, 4, 8), leather, 0, y, 0, [PI / 2, 0, 0], weapon)
  put(cyl(r * 0.14, r * 0.14, r * 0.35, 8), iron, 0, -0.35, 0, [0, 0, 0], weapon)
  put(sph(r * 0.18, 7, 6), bone, 0, -0.55, 0, [0, 0, 0], weapon)
  put(cone(r * 0.1, r * 0.35, 5), iron, 0, -0.85, 0, [0, 0, PI], weapon)
  put(sph(r * 0.2, 7, 6), iron, 0, 2.85, 0, [0, 0, 0], weapon)
  put(cone(r * 0.14, r * 0.5, 6), steel, 0, 3.2, 0, [0, 0, 0], weapon)
  put(box(r * 0.34, r * 0.55, r * 0.34), iron, 0, 2.3, 0, [0, 0, 0], weapon)
  for (const y of [2.05, 2.55]) put(cyl(r * 0.16, r * 0.16, r * 0.06, 8), gold, 0, y, 0, [0, 0, 0], weapon)
  const blades: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    const ry = s > 0 ? 0 : PI
    const bl = put(crescentGeo(r * 1.15, r * 1.5, r * 0.12), steel, s * 0.12, 2.3, 0, [0, ry, 0], weapon)
    blades.push(bl)
    const ed = put(crescentGeo(r * 1.0, r * 1.3, r * 0.17), ironD, s * 0.12, 2.3, 0, [0, ry, 0], weapon)
    ed.scale.set(0.97, 0.97, 0.7)
    put(crescentGeo(r * 0.45, r * 0.7, r * 0.18), rune, s * 0.18, 2.3, 0, [0, ry, 0], weapon)
    put(cone(r * 0.1, r * 0.4, 4), steel, s * 1.15, 3.0, 0, [0, 0, -s * 0.5], weapon)
    put(cone(r * 0.1, r * 0.4, 4), steel, s * 1.15, 1.6, 0, [0, 0, PI + s * 0.5], weapon)
  }

  weapon.scale.setScalar(0.85)
  const gait = new Gait()
  return {
    height: r * 4.3,
    update: (t, st) => {
      gait.step(t, st.moving, 8.5)
      const sw = Math.sin(gait.ph) * 0.6 * gait.k
      legs[0].rotation.z = sw
      legs[1].rotation.z = -sw
      armL.rotation.z = -sw * 0.7 + Math.sin(t * 1.4) * 0.03
      braids.forEach((G, i) => {
        G.rotation.z = Math.sin(t * 2.3 + i) * 0.05 - gait.k * 0.12
      })
      cape.forEach((G, i) => {
        G.rotation.z = -0.12 - gait.k * 0.2 + Math.sin(t * 2 - i * 0.9) * 0.05 * (1 + gait.k)
      })
      eye.emissiveIntensity = 0.9 + 0.3 * Math.sin(t * 4) + (st.attacking || st.casting ? 1.2 : 0)
      rune.emissiveIntensity = 0.6 + 0.3 * Math.sin(t * 3) + (st.attacking ? 1.6 : st.casting ? 0.9 : 0)
      gem.emissiveIntensity = 0.8 + 0.3 * Math.sin(t * 2.2)
    },
  }
}

/* ----------------------------------------------------------------- RUBICK */
function heroRubick(c: HCtx): HOut {
  const { b, r, body, weapon, g } = c
  const { put, grp, glow, seg } = hkit(c)
  const PI = Math.PI
  const skin = b.m('#d8b090')
  const robe = b.m('#6b5a34')
  const robeD = b.m('#4e4126')
  const cloak = b.m('#2f8a78')
  const cloakL = b.m('#3fa890', { side: THREE.DoubleSide })
  const cloakB = b.m('#277566', { side: THREE.DoubleSide })
  const goldM = b.m('#e6c455', { metalness: 0.55, roughness: 0.35, emissive: new THREE.Color('#6a5010'), emissiveIntensity: 0.3 })
  const beardM = b.m('#f0f0f6')
  const hoodDark = b.m('#142a28')
  const wood = b.m('#5a3e28')
  const leather = b.m('#3a2a1c')
  const paper = b.m('#e8dcb0')
  const orbA = glow('#b48cff', 1.3)
  const orbB = glow('#78e8ff', 1.3)
  const orbC = glow('#ffd070', 1.3)
  const rune = glow('#50f0c8', 1.0)

  // robe (layered, hem flaps sway)
  put(cone(r * 1.15, r * 2.2, 12), robe, 0, 1.1, 0)
  put(cyl(r * 1.08, r * 1.15, r * 0.14, 12), goldM, 0, 0.16, 0)
  put(cyl(r * 0.9, r * 0.98, r * 0.08, 12), goldM, 0, 0.4, 0)
  const hem: THREE.Group[] = []
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2
    const G = grp(body, Math.cos(a) * 1.0, 0.55, Math.sin(a) * 1.0)
    G.rotation.y = -a
    put(box(r * 0.05, r * 0.5, r * 0.34), i % 2 ? robeD : robe, 0.05, -0.2, 0, [0, 0, 0.18], G)
    put(box(r * 0.06, r * 0.05, r * 0.34), goldM, 0.08, -0.45, 0, [0, 0, 0.18], G)
    hem.push(G)
  }
  put(cyl(r * 0.62, r * 0.7, r * 0.16, 10), goldM, 0, 1.55, 0)
  put(box(r * 0.1, r * 1.3, r * 0.3), goldM, 0.9, 0.85, 0, [0, 0, -0.17])
  for (let i = 0; i < 5; i++) put(sph(r * 0.05, 5, 4), rune, 0.96 - i * 0.02, 0.4 + i * 0.22, 0, [0, 0, 0])
  // belt gear
  put(box(r * 0.2, r * 0.22, r * 0.2), goldM, 0.7, 1.55, 0)
  put(sph(r * 0.1, 6, 5), rune, 0.82, 1.55, 0)
  put(box(r * 0.3, r * 0.34, r * 0.28), leather, 0.35, 1.38, 0.62)
  put(sph(r * 0.04, 4, 3), goldM, 0.5, 1.45, 0.62)
  put(cyl(r * 0.1, r * 0.1, r * 0.5, 7), paper, 0.1, 1.45, -0.7, [0, 0, 0.5]) // scroll
  put(cyl(r * 0.11, r * 0.11, r * 0.04, 7), goldM, 0.0, 1.62, -0.7, [0, 0, 0.5])
  put(cyl(r * 0.14, r * 0.14, r * 0.3, 7), b.m('#8a5ad0'), 0.3, 1.15, -0.65) // potion
  put(sph(r * 0.12, 6, 5), orbA, 0.3, 1.0, -0.65)
  // chest + mantle
  put(cyl(r * 0.45, r * 0.7, r * 0.8, 10), cloak, 0, 2.0, 0)
  put(cone(r * 1.0, r * 1.0, 12), cloak, -0.05, 2.35, 0, [0, 0, 0], body, [1, 0.8, 1.1])
  put(cyl(r * 0.95, r * 0.95, r * 0.09, 12), goldM, -0.05, 1.95, 0, [0, 0, 0], body, [1, 1, 1.1])
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    put(new THREE.OctahedronGeometry(r * 0.08), rune, -0.05 + Math.cos(a) * 0.92, 2.0, Math.sin(a) * 1.0)
  }
  put(new THREE.TorusGeometry(r * 0.45, r * 0.07, 6, 14), goldM, 0.0, 2.55, 0, [PI / 2, 0, 0])
  put(sph(r * 0.16, 7, 6), rune, 0.55, 2.35, 0)
  put(box(r * 0.1, r * 0.4, r * 0.1), goldM, 0.55, 2.35, 0)
  // back cloak chain
  const cloakCh: THREE.Group[] = []
  let cp: THREE.Object3D = grp(body, -0.55, 2.6, 0)
  const cw = [1.1, 1.2, 1.3]
  for (let i = 0; i < 3; i++) {
    const G = new THREE.Group()
    if (i) G.position.set(0, -0.62 * r, 0)
    G.rotation.z = -0.08
    cp.add(G)
    put(box(r * 0.06, r * 0.64, r * cw[i]), i % 2 ? cloakB : cloakL, 0, -0.32, 0, [0, 0, 0], G)
    put(box(r * 0.07, r * 0.06, r * cw[i]), goldM, 0, 0, 0, [0, 0, 0], G)
    cloakCh.push(G)
    cp = G
  }
  put(box(r * 0.08, r * 0.08, r * 1.3), goldM, 0, -0.66, 0, [0, 0, 0], cloakCh[2])
  put(sph(r * 0.1, 5, 4), rune, 0, -0.45, 0, [0, 0, 0], cloakCh[1])
  // hood + face
  put(sph(r * 0.52, 10, 9), cloak, -0.05, 2.75, 0, [0, 0, 0], body, [1.05, 1.1, 1])
  put(cone(r * 0.4, r * 0.8, 8), cloak, -0.5, 2.85, 0, [0, 0, 1.9])
  put(sph(r * 0.36, 8, 7), hoodDark, 0.25, 2.7, 0, [0, 0, 0], body, [0.7, 1, 0.95])
  put(sph(r * 0.28, 9, 8), skin, 0.38, 2.68, 0, [0, 0, 0], body, [0.7, 1, 0.9])
  put(sph(r * 0.08, 6, 5), b.m('#d09a7a'), 0.6, 2.62, 0)
  for (const s of [-1, 1]) {
    put(sph(r * 0.08, 5, 4), glow('#ffffff', 0.9), 0.55, 2.78, s * 0.13)
    put(sph(r * 0.04, 5, 4), glow('#50f0c8', 1.3), 0.62, 2.78, s * 0.13)
    put(box(r * 0.08, r * 0.06, r * 0.18), beardM, 0.58, 2.88, s * 0.13, [s * 0.25, 0, 0.1]) // brows
  }
  // beard
  put(cone(r * 0.38, r * 1.1, 9), beardM, 0.5, 2.0, 0, [0, 0, PI + 0.15], body, [0.8, 1, 1.1])
  put(sph(r * 0.3, 7, 6), beardM, 0.52, 2.5, 0, [0, 0, 0], body, [0.7, 0.9, 1])
  for (const s of [-1, 1]) {
    put(cone(r * 0.1, r * 0.5, 5), beardM, 0.65, 2.58, s * 0.16, [s * 0.6, 0, -1.2])
    put(cone(r * 0.1, r * 0.5, 5), beardM, 0.62, 1.75, s * 0.2, [0, 0, PI + 0.05])
  }
  put(sph(r * 0.06, 5, 4), goldM, 0.55, 1.5, 0)
  // circlet
  put(new THREE.TorusGeometry(r * 0.45, r * 0.05, 5, 14), goldM, -0.02, 3.0, 0, [PI / 2, 0, 0.2])
  put(sph(r * 0.1, 6, 5), glow('#50f0c8', 1.3), 0.43, 3.02, 0)
  put(cone(r * 0.07, r * 0.25, 4), goldM, 0.4, 3.2, 0)
  // arms: left raised-pivot, right holds the staff
  const armL = grp(body, 0.15, 2.15, -0.95)
  put(cone(r * 0.4, r * 0.95, 8), cloak, 0.12, -0.35, -0.05, [0, 0, 0.18], armL)
  put(cyl(r * 0.38, r * 0.38, r * 0.08, 8), goldM, 0.22, -0.75, -0.08, [0, 0, 0.2], armL)
  put(sph(r * 0.13, 6, 5), skin, 0.27, -0.9, -0.1, [0, 0, 0], armL)
  seg(body, [0.15, 2.15, 0.95], [0.5, 1.8, 1.1], 0.38, 0.3, cloak, 8)
  put(cyl(r * 0.36, r * 0.36, r * 0.08, 8), goldM, 0.45, 1.85, 1.07, [0.2, 0, 0.5])
  put(sph(r * 0.14, 6, 5), skin, 0.64, 1.55, 1.15)

  // staff (weapon pivot)
  weapon.position.set(r * 0.65, r * 1.5, r * 1.15)
  put(cyl(r * 0.07, r * 0.08, r * 3.0, 7), wood, 0, 0.6, 0, [0, 0, 0], weapon)
  for (const y of [-0.3, 0.6, 1.3]) put(cyl(r * 0.1, r * 0.1, r * 0.1, 7), goldM, 0, y, 0, [0, 0, 0], weapon)
  put(cone(r * 0.08, r * 0.3, 5), goldM, 0, -0.95, 0, [0, 0, PI], weapon)
  put(new THREE.TorusGeometry(r * 0.32, r * 0.05, 5, 12), goldM, 0, 2.05, 0, [PI / 2, 0, 0], weapon)
  put(new THREE.TorusGeometry(r * 0.32, r * 0.05, 5, 12), goldM, 0, 2.05, 0, [0, PI / 2, 0], weapon)
  for (const s of [-1, 1]) {
    put(cone(r * 0.1, r * 0.55, 4), goldM, s * 0.25, 2.25, 0, [0, 0, -s * 0.5], weapon)
    put(cone(r * 0.08, r * 0.4, 4), goldM, 0, 2.2, s * 0.25, [s * 0.5, 0, 0], weapon)
  }
  put(sph(r * 0.28, 12, 10), orbA, 0, 2.05, 0, [0, 0, 0], weapon).castShadow = false
  put(sph(r * 0.4, 10, 8), glow('#b48cff', 0.25), 0, 2.05, 0, [0, 0, 0], weapon).castShadow = false

  // orbiting orbs + rune rings
  const orbit = new THREE.Group()
  orbit.position.y = r * 1.9
  g.add(orbit)
  const orbs: THREE.Mesh[] = []
  const orbMats = [orbA, orbB, orbC]
  for (let i = 0; i < 3; i++) {
    const o = b.mesh(sph(r * 0.2, 9, 7), orbMats[i], 0, 0, 0, orbit)
    o.castShadow = false
    const halo = b.mesh(sph(r * 0.32, 8, 6), b.m(['#b48cff', '#78e8ff', '#ffd070'][i], { emissive: new THREE.Color(['#b48cff', '#78e8ff', '#ffd070'][i]), emissiveIntensity: 0.3, transparent: true, opacity: 0.3 }), 0, 0, 0, o)
    halo.castShadow = false
    orbs.push(o)
  }
  const ringA = b.mesh(new THREE.TorusGeometry(r * 1.55, r * 0.015, 4, 40), rune, 0, 0, 0, orbit)
  ringA.castShadow = false
  const ringB = b.mesh(new THREE.TorusGeometry(r * 1.7, r * 0.015, 4, 40), orbA, 0, 0, 0, orbit)
  ringB.castShadow = false
  const gl: THREE.Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const m = b.mesh(new THREE.OctahedronGeometry(r * 0.06), rune, 0, 0, 0, orbit)
    m.castShadow = false
    gl.push(m)
  }

  const gait = new Gait()
  return {
    height: r * 4.3,
    update: (t, st) => {
      gait.step(t, st.moving, 8)
      armL.rotation.z = Math.sin(gait.ph) * 0.4 * gait.k + Math.sin(t * 1.5) * 0.03
      hem.forEach((G, i) => {
        G.rotation.z = Math.sin(t * 2.2 + i * 0.7) * 0.05 + gait.k * Math.sin(gait.ph * 2 + i) * 0.1
      })
      cloakCh.forEach((G, i) => {
        G.rotation.z = -0.08 - gait.k * 0.16 + Math.sin(t * 2 - i * 0.9) * 0.05 * (1 + gait.k)
      })
      const speed = st.casting ? 3.6 : 1.4
      orbs.forEach((o, i) => {
        const a = t * speed + (i * PI * 2) / 3
        o.position.set(Math.cos(a) * 1.5 * r, Math.sin(t * 1.7 + i * 2) * 0.35 * r + (i - 1) * 0.15 * r, Math.sin(a) * 1.5 * r)
        o.scale.setScalar(1 + 0.15 * Math.sin(t * 4 + i) + (st.casting ? 0.3 : 0))
      })
      ringA.rotation.set(PI / 2 + Math.sin(t * 0.7) * 0.2, t * 0.6, 0)
      ringB.rotation.set(PI / 2 + 0.5, -t * 0.4, Math.sin(t * 0.5) * 0.3)
      gl.forEach((m, i) => {
        const a = t * 0.9 + i * 1.047
        m.position.set(Math.cos(a) * 1.55 * r, Math.sin(a * 2 + i) * 0.5 * r, Math.sin(a) * 1.55 * r)
        m.rotation.set(t * 2 + i, t * 1.5, 0)
      })
      orbA.emissiveIntensity = 1.2 + 0.5 * Math.sin(t * 3) + (st.casting ? 1 : 0)
      rune.emissiveIntensity = 0.8 + 0.3 * Math.sin(t * 2.5)
    },
  }
}
