import * as THREE from 'three'
import { Builder, Model, TEAM, box, cone, cyl, sph, teamRing } from './modelkit'

export type HeroModelFn = (id: string, color: string, color2: string, team: number, r: number) => Model

const PI = Math.PI

/** Shared scaffolding: builder, groups and a `put` that positions meshes in units of r (x forward, y up, z lateral). */
function scaffold(team: number, r: number) {
  const b = new Builder()
  const g = new THREE.Group()
  teamRing(b, g, r, team)
  const body = new THREE.Group()
  g.add(body)
  const weapon = new THREE.Group()
  const glow = (c: string, i = 0.9) => b.m(c, { emissive: new THREE.Color(c), emissiveIntensity: i })
  const metal = (c: string) => b.m(c, { metalness: 0.65, roughness: 0.35 })
  const trim = b.m(TEAM[team], { emissive: new THREE.Color(TEAM[team]), emissiveIntensity: 0.35 })
  const dbl = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => b.m(c, { side: THREE.DoubleSide, ...o })
  const put = (
    geo: THREE.BufferGeometry,
    mt: THREE.Material,
    x: number,
    y: number,
    z: number,
    rot: [number, number, number] = [0, 0, 0],
    parentOrScale?: THREE.Object3D | [number, number, number],
    sc0?: [number, number, number],
  ) => {
    const parent = parentOrScale instanceof THREE.Object3D ? parentOrScale : body
    const sc = Array.isArray(parentOrScale) ? parentOrScale : sc0
    const me = b.mesh(geo, mt, x * r, y * r, z * r, parent)
    me.rotation.set(rot[0], rot[1], rot[2])
    if (sc) me.scale.set(sc[0], sc[1], sc[2])
    return me
  }
  /** A pivot group at (x,y,z) (units of r) plus a `put` that takes absolute model coordinates and places meshes inside it. */
  const pivot = (x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const pv = new THREE.Group()
    pv.position.set(x * r, y * r, z * r)
    parent.add(pv)
    const lput = (
      geo: THREE.BufferGeometry, mt: THREE.Material, mx: number, my: number, mz: number,
      rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number],
    ) => put(geo, mt, mx - x, my - y, mz - z, rot, pv, sc)
    return { pv, lput }
  }
  const finish = (height: number, update?: Model['update']): Model => {
    body.add(weapon)
    void trim
    return { group: g, weapon, body, height, mats: b.mats, update }
  }
  /** Smoothed walk/idle driver shared by all models. */
  const motion = () => {
    let last = 0
    let amp = 0
    let ph = 0
    return (t: number, moving: boolean) => {
      const dt = Math.min(0.1, Math.max(0, t - last))
      last = t
      amp += ((moving ? 1 : 0) - amp) * Math.min(1, dt * 10)
      ph += dt * (6 + amp * 5)
      return { amp, walk: Math.sin(ph), walk2: Math.sin(ph + PI), breathe: Math.sin(t * 2.2), t }
    }
  }
  return { b, g, body, weapon, glow, metal, dbl, put, pivot, finish, motion }
}

const torus = (R: number, t: number, seg = 10) => new THREE.TorusGeometry(R, t, 5, seg)

/** Swaying cloth chain: returns the root group and the segment groups (root->tip). */
function clothChain(
  body: THREE.Object3D, r: number, at: [number, number, number], segLen: number, n: number,
  fill: (seg: THREE.Group, i: number) => void,
) {
  const segs: THREE.Group[] = []
  let parent: THREE.Object3D = body
  for (let i = 0; i < n; i++) {
    const gp = new THREE.Group()
    if (i === 0) gp.position.set(at[0] * r, at[1] * r, at[2] * r)
    else gp.position.set(0, -segLen * r, 0)
    parent.add(gp)
    fill(gp, i)
    segs.push(gp)
    parent = gp
  }
  return segs
}

/* ------------------------------------------------------------------ SVEN */
const sven: HeroModelFn = (_id, color, color2, team, r) => {
  const { b, body, weapon, glow, metal, dbl, put, pivot, finish, motion } = scaffold(team, r)
  const steel = metal('#9aa6b8')
  const lightSteel = metal('#c9d2e0')
  const blueSteel = metal(color)
  const darkBlue = metal('#26385c')
  const red = dbl(color2 === '#8a2a2a' ? '#9a2a2a' : color2)
  const darkRed = dbl('#6a1a1a')
  const leather = b.m('#3a2a22')
  const gold = metal('#c8a850')
  const skin = b.m('#c8987a')
  const eyeMat = glow('#7fc4ff', 1.6)
  const runeMat = glow('#4a9cff', 0.9)
  const gemMat = glow('#6ab4ff', 1.1)
  const legs: THREE.Group[] = []
  // ---- legs: cuisse, knee cop with spike, greave, sabaton
  for (const s of [-1, 1]) {
    const { pv, lput } = pivot(0, 1.25, s * 0.42)
    lput(cyl(r * 0.3, r * 0.27, r * 0.7, 7), darkBlue, 0, 0.95, s * 0.42)
    lput(box(r * 0.5, r * 0.5, r * 0.52), steel, 0.1, 1.02, s * 0.42)
    lput(box(r * 0.1, r * 0.5, r * 0.4), gold, 0.37, 1.02, s * 0.42)
    lput(sph(r * 0.25, 7, 6), steel, 0.17, 0.68, s * 0.42)
    lput(cone(r * 0.1, r * 0.32, 5), steel, 0.4, 0.68, s * 0.42, [0, 0, -PI / 2])
    lput(cyl(r * 0.27, r * 0.2, r * 0.62, 7), blueSteel, 0.02, 0.38, s * 0.42)
    lput(box(r * 0.08, r * 0.5, r * 0.12), steel, 0.24, 0.4, s * 0.42)
    lput(cyl(r * 0.29, r * 0.29, r * 0.06, 7), gold, 0.02, 0.68, s * 0.42)
    lput(cyl(r * 0.22, r * 0.22, r * 0.07, 7), leather, 0.02, 0.15, s * 0.42)
    lput(box(r * 0.9, r * 0.2, r * 0.5), blueSteel, 0.2, 0.09, s * 0.42)
    lput(cone(r * 0.22, r * 0.35, 4), steel, 0.7, 0.09, s * 0.42, [0, PI / 4, -PI / 2], [1, 1, 1.2])
    lput(box(r * 0.22, r * 0.2, r * 0.36), steel, -0.22, 0.2, s * 0.42)
    legs.push(pv)
  }
  // ---- waist: belt, tassets, tabard
  put(cyl(r * 0.7, r * 0.72, r * 0.22, 10), leather, 0, 1.32, 0)
  put(box(r * 0.16, r * 0.3, r * 0.34), gold, 0.72, 1.32, 0)
  put(sph(r * 0.09, 5, 4), gemMat, 0.82, 1.32, 0)
  for (let i = -3; i <= 3; i++) if (i) put(sph(r * 0.06, 5, 4), gold, 0.7, 1.32, i * 0.19)
  for (const s of [-1, 1]) {
    put(box(r * 0.3, r * 0.34, r * 0.22), leather, 0.1, 1.15, s * 0.74)
    put(box(r * 0.34, r * 0.1, r * 0.26), gold, 0.1, 1.34, s * 0.74)
    put(box(r * 0.5, r * 0.5, r * 0.12), steel, 0.05, 1.02, s * 0.76, [0, 0, 0])
  }
  for (let i = 0; i < 3; i++) put(box(r * 0.1, r * 0.3, r * (0.8 - i * 0.1)), i % 2 ? blueSteel : steel, 0.7 - i * 0.02, 1.08 - i * 0.2, 0, [0, 0, 0.12])
  put(box(r * 0.08, r * 1.05, r * 0.46), red, 0.74, 0.62, 0, [0, 0, 0.06])
  put(box(r * 0.1, r * 0.08, r * 0.5), gold, 0.75, 0.1, 0)
  put(box(r * 0.1, r * 0.2, r * 0.2), runeMat, 0.78, 0.68, 0, [PI / 4, 0, 0])
  put(box(r * 0.08, r * 1.2, r * 0.7), darkRed, -0.64, 0.7, 0, [0, 0, -0.08])
  put(box(r * 0.1, r * 0.08, r * 0.74), gold, -0.66, 0.08, 0)
  // ---- chest
  put(cyl(r * 0.78, r * 0.62, r * 1.1, 10), darkBlue, 0, 1.95, 0, [0, 0, 0], [1, 1, 1.25])
  put(cyl(r * 0.74, r * 0.72, r * 0.62, 9), blueSteel, 0.06, 2.1, 0, [0, 0, 0], [1, 1, 1.28])
  put(box(r * 0.2, r * 0.9, r * 0.3), steel, 0.7, 2.05, 0)
  for (const s of [-1, 1]) put(box(r * 0.18, r * 0.5, r * 0.5), steel, 0.64, 2.12, s * 0.4, [0, s * 0.3, 0])
  for (let i = 0; i < 3; i++) put(cyl(r * (0.7 - i * 0.03), r * (0.68 - i * 0.03), r * 0.2, 9), i % 2 ? steel : blueSteel, 0.02, 1.55 + i * 0.2 - 0.05, 0, [0, 0, 0], [1, 1, 1.2])
  put(sph(r * 0.17, 6, 5), gemMat, 0.78, 2.28, 0)
  put(torus(r * 0.2, r * 0.04), gold, 0.78, 2.28, 0, [0, PI / 2, 0])
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) put(sph(r * 0.05, 4, 3), gold, 0.72, 1.9 + i * 0.22, s * 0.5)
  put(box(r * 0.3, r * 1.0, r * 1.5), darkBlue, -0.72, 2.0, 0) // back plate
  put(box(r * 0.34, r * 0.1, r * 1.0), gold, -0.74, 2.5, 0)
  put(cyl(r * 0.52, r * 0.64, r * 0.32, 9), steel, 0, 2.72, 0, [0, 0, 0], [1, 1, 1.1]) // gorget
  put(torus(r * 0.55, r * 0.05, 12), gold, 0, 2.82, 0, [PI / 2, 0, 0])
  put(box(r * 0.08, r * 0.9, r * 0.14), leather, 0.4, 2.2, 0.55, [0, 0, 0.1]) // straps
  put(box(r * 0.08, r * 0.9, r * 0.14), leather, 0.4, 2.2, -0.55, [0, 0, -0.1])
  // ---- arms: layered pauldrons stay put, arms swing
  const arms: THREE.Group[] = []
  for (const s of [-1, 1]) {
    put(sph(r * 0.62, 9, 7), steel, 0, 2.66, s * 1.0, [0, 0, 0], [1.05, 0.7, 1.05])
    put(sph(r * 0.52, 9, 7), blueSteel, 0, 2.52, s * 1.08, [0, 0, 0], [1.0, 0.55, 1.05])
    put(sph(r * 0.4, 8, 6), steel, 0, 2.4, s * 1.14, [0, 0, 0], [1.0, 0.5, 1.0])
    put(torus(r * 0.55, r * 0.05, 14), gold, 0, 2.62, s * 1.0, [PI / 2, 0, 0.0], undefined, [1, 1, 1])
    put(cone(r * 0.2, r * 0.6, 5), steel, 0, 3.1, s * 1.0)
    put(cone(r * 0.1, r * 0.35, 4), steel, 0.25, 2.95, s * 1.28, [0, 0, -0.6 * s * 0 - 0.4])
    put(sph(r * 0.1, 5, 4), runeMat, 0.3, 2.75, s * 1.0)
    const { pv, lput } = pivot(0, 2.45, s * 1.1)
    lput(cyl(r * 0.3, r * 0.27, r * 0.8, 7), blueSteel, 0.05, 2.0, s * 1.1)
    lput(sph(r * 0.27, 6, 5), steel, 0.1, 1.62, s * 1.1)
    lput(cone(r * 0.1, r * 0.28, 5), steel, 0.06, 1.62, s * 1.38, [0, 0, 0])
    lput(cyl(r * 0.27, r * 0.24, r * 0.65, 7), steel, 0.25, 1.35, s * 1.12, [0, 0, 0])
    lput(torus(r * 0.27, r * 0.05, 8), gold, 0.25, 1.62, s * 1.12, [PI / 2, 0, 0])
    lput(box(r * 0.08, r * 0.55, r * 0.14), lightSteel, 0.5, 1.35, s * 1.12)
    lput(box(r * 0.34, r * 0.3, r * 0.34), steel, 0.38, 1.0, s * 1.12)
    for (let i = -1; i <= 1; i++) lput(box(r * 0.2, r * 0.08, r * 0.08), steel, 0.58, 0.95 + 0.0, s * 1.12 + i * 0.1)
    lput(box(r * 0.14, r * 0.08, r * 0.1), steel, 0.4, 1.02, s * 1.12 - s * 0.24)
    arms.push(pv)
  }
  // ---- cape (3 chained segments)
  const capeSegs = clothChain(body, r, [-0.82, 2.75, 0], 0.92, 3, (gp, i) => {
    const w = 1.5 + i * 0.14
    put(box(r * 0.07, r * 0.95, r * w), i === 2 ? darkRed : red, 0, -0.45, 0, [0, 0, 0], gp)
    for (const s of [-1, 1]) put(box(r * 0.09, r * 0.95, r * 0.06), gold, 0, -0.45, (s * w) / 2, [0, 0, 0], gp)
    for (const z of [-0.3, 0.3]) put(box(r * 0.085, r * 0.9, r * 0.05), darkRed, 0, -0.45, z * (1 + i * 0.1), [0, 0, 0], gp)
    if (i === 0) for (const s of [-1, 1]) put(sph(r * 0.12, 6, 5), gold, 0.04, -0.05, s * 0.55, [0, 0, 0], gp)
    if (i === 2) put(box(r * 0.09, r * 0.07, r * w), gold, 0, -0.95, 0, [0, 0, 0], gp)
  })
  // ---- helm
  put(sph(r * 0.62, 10, 8), darkBlue, 0.0, 3.2, 0, [0, 0, 0], [1, 0.95, 1])
  put(sph(r * 0.5, 9, 7), blueSteel, -0.18, 3.25, 0, [0, 0, 0], [1, 1, 1.15])
  put(box(r * 0.22, r * 0.72, r * 0.8), steel, 0.5, 3.1, 0)
  put(box(r * 0.26, r * 0.1, r * 0.92), blueSteel, 0.47, 3.47, 0)
  put(box(r * 0.28, r * 0.07, r * 0.94), gold, 0.48, 3.55, 0)
  put(box(r * 0.1, r * 0.5, r * 0.12), blueSteel, 0.65, 3.0, 0)
  for (const s of [-1, 1]) {
    put(box(r * 0.1, r * 0.1, r * 0.24), eyeMat, 0.62, 3.3, s * 0.21)
    put(box(r * 0.24, r * 0.5, r * 0.1), steel, 0.38, 3.05, s * 0.5, [0, s * 0.4, 0])
    put(cyl(r * 0.16, r * 0.16, r * 0.1, 7), gold, 0.02, 3.15, s * 0.62, [PI / 2, 0, 0])
    put(cone(r * 0.1, r * 0.42, 4), steel, 0.15, 3.55, s * 0.74, [s * 0.5, 0, 0])
    put(box(r * 0.08, r * 0.05, r * 0.2), eyeMat, 0.0, 3.1, s * 0.66)
  }
  for (let i = 0; i < 4; i++) put(box(r * 0.08, r * 0.05, r * 0.4), b.m('#10182a'), 0.62, 2.95 - i * 0.07, 0)
  put(cone(r * 0.2, r * 0.3, 4), steel, 0.5, 2.7, 0, [0, PI / 4, PI], undefined, [1, 1, 1.4]) // chin
  put(box(r * 0.8, r * 0.14, r * 0.12), steel, 0, 3.82, 0)
  put(box(r * 0.5, r * 0.3, r * 0.1), steel, -0.2, 3.72, 0)
  put(box(r * 0.5, r * 0.08, r * 0.14), gold, 0.1, 3.9, 0)
  put(cone(r * 0.16, r * 0.4, 4), steel, -0.5, 3.6, 0, [0, 0, 1.9], undefined, [1, 1, 0.5])
  put(sph(r * 0.2, 6, 5), skin, 0.0, 2.68, 0, [0, 0, 0], [1, 0.7, 1.3]) // neck
  // ---- greatsword (weapon pivot at right hand, blade up)
  weapon.position.set(r * 0.45, r * 1.5, r * 1.12)
  const wp = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(g, m, x, y, z, rot, weapon, sc)
  wp(cyl(r * 0.09, r * 0.09, r * 0.9, 6), leather, 0, 0.1, 0)
  for (let i = 0; i < 4; i++) wp(torus(r * 0.1, r * 0.025, 7), gold, 0, -0.2 + i * 0.22, 0, [PI / 2, 0, 0])
  wp(sph(r * 0.16, 6, 5), gold, 0, -0.4, 0)
  wp(cone(r * 0.07, r * 0.2, 4), gold, 0, -0.6, 0, [PI, 0, 0])
  wp(box(r * 0.2, r * 0.18, r * 1.3), gold, 0, 0.62, 0)
  for (const s of [-1, 1]) {
    wp(cone(r * 0.11, r * 0.35, 5), gold, 0, 0.62, s * 0.78, [s * -PI / 2, 0, 0])
    wp(box(r * 0.16, r * 0.3, r * 0.1), steel, 0, 0.75, s * 0.4)
  }
  wp(box(r * 0.26, r * 0.22, r * 0.3), steel, 0, 0.98, 0)
  wp(box(r * 0.1, r * 0.1, r * 0.1), gemMat, 0.14, 0.62, 0)
  wp(box(r * 0.22, r * 3.1, r * 0.5), steel, 0, 2.3, 0)
  wp(box(r * 0.1, r * 3.0, r * 0.18), metal('#7a8698'), 0.1, 2.3, 0)
  wp(box(r * 0.26, r * 2.7, r * 0.1), lightSteel, 0, 2.3, 0.17)
  wp(box(r * 0.26, r * 2.7, r * 0.1), lightSteel, 0, 2.3, -0.17)
  wp(cone(r * 0.25, r * 0.6, 4), steel, 0, 4.15, 0, [0, PI / 4, 0], [0.45, 1, 1.0])
  for (let i = 0; i < 4; i++) wp(box(r * 0.26, r * 0.22, r * 0.12), runeMat, 0.0, 1.5 + i * 0.5, 0)
  // ---- animation
  const mo = motion()
  return finish(r * 4.0, (t, st) => {
    const m = mo(t, st.moving)
    legs[0].rotation.z = m.walk * 0.62 * m.amp
    legs[1].rotation.z = m.walk2 * 0.62 * m.amp
    arms[0].rotation.z = m.walk2 * 0.5 * m.amp + m.breathe * 0.02
    arms[1].rotation.z = m.breathe * 0.02 + 0.03
    capeSegs.forEach((sg, i) => {
      sg.rotation.z = -(i ? 0 : 0.1 + m.amp * 0.3) + Math.sin(t * 2.6 + i * 1.1) * (0.04 + m.amp * 0.07) - (i ? 0.03 + m.amp * 0.12 : 0)
    })
    runeMat.emissiveIntensity = 0.75 + 0.35 * Math.sin(t * 2.4)
    eyeMat.emissiveIntensity = st.casting || st.attacking ? 2.4 : 1.5 + 0.2 * Math.sin(t * 3)
  })
}

/* ------------------------------------------------------------ JUGGERNAUT */
const juggernaut: HeroModelFn = (_id, color, color2, team, r) => {
  const { b, body, weapon, glow, metal, dbl, put, pivot, finish, motion } = scaffold(team, r)
  const yellow = b.m(color)
  const orange = b.m('#e8742a')
  const deepOrange = b.m('#c4501e')
  const redCloth = dbl('#a8281e')
  const dark = b.m('#2a2020')
  const wrap = b.m('#d8c8a0')
  const skin = b.m('#c8946c')
  const skinDark = b.m('#a8744c')
  const bone = b.m('#efe6c8')
  const brown = b.m(color2)
  const gold = metal('#d4b050')
  const steel = metal('#cfd6de')
  const eyeMat = glow('#e04020', 1.4)
  const legs: THREE.Group[] = []
  // ---- legs: baggy trousers, wraps, sandals
  for (const s of [-1, 1]) {
    const { pv, lput } = pivot(0, 1.2, s * 0.34)
    lput(cyl(r * 0.3, r * 0.38, r * 0.7, 8), yellow, 0, 0.88, s * 0.34)
    lput(cyl(r * 0.38, r * 0.34, r * 0.45, 8), orange, 0.04, 0.55, s * 0.34)
    lput(sph(r * 0.2, 6, 5), deepOrange, 0.22, 0.75, s * 0.34, [0, 0, 0], [0.6, 1, 1])
    for (let i = 0; i < 3; i++) lput(cyl(r * 0.27, r * 0.27, r * 0.07, 8), wrap, 0.02, 0.34 - i * 0.1, s * 0.34)
    lput(cyl(r * 0.3, r * 0.3, r * 0.06, 8), brown, 0.02, 0.58, s * 0.34)
    lput(box(r * 0.8, r * 0.08, r * 0.42), dark, 0.14, 0.04, s * 0.34)
    lput(box(r * 0.44, r * 0.1, r * 0.1), brown, 0.18, 0.12, s * 0.34, [0, 0.35, 0])
    lput(box(r * 0.44, r * 0.1, r * 0.1), brown, 0.18, 0.12, s * 0.34, [0, -0.35, 0])
    lput(box(r * 0.22, r * 0.14, r * 0.34), wrap, 0.48, 0.12, s * 0.34)
    legs.push(pv)
  }
  // ---- waist: obi sash, kusazuri plates, fringe, saya
  put(cyl(r * 0.52, r * 0.58, r * 0.3, 10), redCloth, 0, 1.3, 0)
  put(cyl(r * 0.56, r * 0.56, r * 0.1, 10), gold, 0, 1.18, 0)
  put(box(r * 0.2, r * 0.26, r * 0.3), orange, 0.58, 1.32, 0)
  put(box(r * 0.22, r * 0.12, r * 0.12), gold, 0.62, 1.32, 0)
  for (const s of [-1, 1]) {
    put(box(r * 0.5, r * 0.6, r * 0.12), orange, 0.1, 1.0, s * 0.62, [0, 0, 0.05])
    put(box(r * 0.52, r * 0.08, r * 0.14), gold, 0.1, 0.72, s * 0.62)
  }
  const fringe: THREE.Group[] = []
  for (let i = -3; i <= 3; i++) {
    const gp = new THREE.Group()
    gp.position.set(0.6 * r, 1.12 * r, i * 0.15 * r)
    body.add(gp)
    put(box(r * 0.05, r * 0.7, r * 0.11), i % 2 ? orange : redCloth, 0, -0.35, 0, [0, 0, 0], gp)
    put(box(r * 0.06, r * 0.1, r * 0.12), gold, 0, -0.72, 0, [0, 0, 0], gp)
    fringe.push(gp)
  }
  for (let i = -2; i <= 2; i++) {
    const gp = new THREE.Group()
    gp.position.set(-0.55 * r, 1.12 * r, i * 0.17 * r)
    body.add(gp)
    put(box(r * 0.05, r * 0.6, r * 0.12), i % 2 ? redCloth : orange, 0, -0.3, 0, [0, 0, 0], gp)
    fringe.push(gp)
  }
  put(cyl(r * 0.07, r * 0.07, r * 1.1, 6), dark, 0.2, 1.05, -0.74, [0, 0, 1.2]) // saya (scabbard)
  put(cyl(r * 0.09, r * 0.09, r * 0.12, 6), gold, -0.3, 1.52, -0.74, [0, 0, 1.2])
  put(cone(r * 0.07, r * 0.18, 5), gold, 0.7, 0.55, -0.74, [0, 0, 1.2 + PI])
  // ---- torso: bare muscular chest with straps
  put(cyl(r * 0.54, r * 0.46, r * 1.0, 9), skin, 0, 1.9, 0, [0, 0, 0], [0.85, 1, 1.25])
  for (const s of [-1, 1]) {
    put(sph(r * 0.3, 7, 6), skin, 0.28, 2.18, s * 0.3, [0, 0, 0], [0.8, 0.8, 1])
    put(sph(r * 0.1, 5, 4), skinDark, 0.5, 2.13, s * 0.3)
    for (let i = 0; i < 3; i++) put(box(r * 0.08, r * 0.14, r * 0.22), skinDark, 0.4, 1.78 - i * 0.2, s * 0.14)
  }
  put(box(r * 0.5, r * 0.34, r * 1.1), yellow, 0.06, 1.42, 0)
  put(box(r * 0.52, r * 0.06, r * 1.12), gold, 0.06, 1.62, 0)
  put(box(r * 0.1, r * 1.5, r * 0.26), orange, 0.4, 1.95, 0.0, [0.78, 0, 0])
  put(box(r * 0.1, r * 1.5, r * 0.26), deepOrange, 0.38, 1.95, 0.0, [-0.78, 0, 0])
  put(cyl(r * 0.14, r * 0.14, r * 0.1, 8), gold, 0.5, 2.1, 0, [0, 0, PI / 2])
  put(sph(r * 0.06, 5, 4), eyeMat, 0.56, 2.1, 0)
  put(box(r * 0.28, r * 0.9, r * 0.9), deepOrange, -0.44, 1.9, 0) // back
  put(box(r * 0.1, r * 1.4, r * 0.2), brown, -0.58, 2.0, 0.0, [0.7, 0, 0])
  put(box(r * 0.1, r * 1.4, r * 0.2), brown, -0.58, 2.0, 0.0, [-0.7, 0, 0])
  // ---- arms: bare, wrapped, orange bracers
  const arms: THREE.Group[] = []
  for (const s of [-1, 1]) {
    put(sph(r * 0.44, 8, 6), deepOrange, 0, 2.38, s * 0.82, [0, 0, 0], [1, 0.55, 1.05])
    put(sph(r * 0.38, 8, 6), orange, 0, 2.5, s * 0.82, [0, 0, 0], [1, 0.5, 1])
    put(sph(r * 0.3, 8, 6), yellow, 0, 2.6, s * 0.82, [0, 0, 0], [1, 0.5, 1])
    put(torus(r * 0.4, r * 0.04, 12), gold, 0, 2.42, s * 0.82, [PI / 2, 0, 0])
    for (let i = -1; i <= 1; i++) put(box(r * 0.06, r * 0.1, r * 0.1), gold, 0.3, 2.45, s * 0.82 + i * 0.16)
    const { pv, lput } = pivot(0, 2.3, s * 0.88)
    lput(cyl(r * 0.22, r * 0.19, r * 0.8, 7), skin, 0.1, 1.9, s * 0.88)
    lput(sph(r * 0.22, 6, 5), skin, 0.12, 2.02, s * 0.88)
    lput(sph(r * 0.17, 6, 5), skinDark, 0.1, 1.5, s * 0.9)
    lput(cyl(r * 0.2, r * 0.17, r * 0.5, 7), skin, 0.25, 1.35, s * 0.92)
    lput(cyl(r * 0.22, r * 0.22, r * 0.34, 7), orange, 0.28, 1.28, s * 0.92)
    for (let i = 0; i < 3; i++) lput(cyl(r * 0.23, r * 0.23, r * 0.04, 7), wrap, 0.28, 1.42 - i * 0.1, s * 0.92)
    lput(box(r * 0.3, r * 0.26, r * 0.28), skin, 0.38, 1.04, s * 0.94)
    for (let i = -1; i <= 1; i++) lput(box(r * 0.16, r * 0.08, r * 0.07), skin, 0.54, 0.98, s * 0.94 + i * 0.09)
    arms.push(pv)
  }
  // ---- head: mask, headband, feathered crest, ponytail
  put(sph(r * 0.34, 9, 8), skin, 0.0, 2.95, 0)
  put(sph(r * 0.36, 9, 8), dark, -0.08, 3.0, 0, [0, 0, 0], [1, 1, 1.0]) // hair cap
  put(box(r * 0.14, r * 0.66, r * 0.58), bone, 0.3, 2.93, 0) // mask
  put(box(r * 0.12, r * 0.18, r * 0.5), bone, 0.3, 2.55, 0, [0, 0, 0.15], undefined) // chin
  for (const s of [-1, 1]) {
    put(box(r * 0.16, r * 0.1, r * 0.16), eyeMat, 0.38, 3.05, s * 0.15)
    put(box(r * 0.15, r * 0.4, r * 0.05), redCloth, 0.38, 2.82, s * 0.2, [0, 0, 0.08])
    put(box(r * 0.14, r * 0.14, r * 0.06), bone, 0.27, 2.9, s * 0.33, [0, s * 0.5, 0])
    put(cone(r * 0.05, r * 0.18, 4), orange, 0.1, 2.75, s * 0.4, [0, 0, 0])
  }
  put(box(r * 0.17, r * 0.4, r * 0.05), redCloth, 0.39, 2.75, 0)
  put(box(r * 0.16, r * 0.06, r * 0.4), dark, 0.39, 2.6, 0)
  put(cone(r * 0.12, r * 0.34, 4), redCloth, 0.32, 3.34, 0)
  put(box(r * 0.16, r * 0.1, r * 0.08), redCloth, 0.38, 3.2, 0)
  put(cyl(r * 0.4, r * 0.4, r * 0.12, 9), brown, 0.0, 3.2, 0)
  put(torus(r * 0.4, r * 0.03, 10), gold, 0, 3.27, 0, [PI / 2, 0, 0])
  put(sph(r * 0.1, 6, 5), redCloth, -0.38, 3.2, 0.0)
  const tails: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const gp = new THREE.Group()
    gp.position.set(-0.42 * r, 3.2 * r, s * 0.1 * r)
    body.add(gp)
    put(box(r * 0.04, r * 0.9, r * 0.1), redCloth, -0.05, -0.45, 0, [0, 0, 0], gp)
    tails.push(gp)
  }
  const feathers: THREE.Group[] = []
  for (let i = -4; i <= 4; i++) {
    const gp = new THREE.Group()
    gp.position.set(-0.22 * r, 3.38 * r, i * 0.1 * r)
    gp.rotation.x = i * 0.2
    body.add(gp)
    const l = 1.15 - Math.abs(i) * 0.1
    const ang = 0.9 + Math.abs(i) * 0.06
    const dx = -Math.sin(ang)
    const dy = Math.cos(ang)
    put(cone(r * 0.1, r * l, 4), i % 2 ? orange : yellow, dx * l * 0.5, dy * l * 0.5, 0, [0, 0, ang], gp, [1, 1, 0.45])
    put(cone(r * 0.07, r * 0.4 * l, 4), bone, dx * l * 0.88, dy * l * 0.88, 0, [0, 0, ang], gp, [1, 1, 0.45])
    feathers.push(gp)
  }
  const ponytail = clothChain(body, r, [-0.34, 3.05, 0], 0.4, 3, (gp, i) => {
    put(cyl(r * (0.14 - i * 0.025), r * (0.17 - i * 0.025), r * 0.45, 6), i % 2 ? dark : brown, 0, -0.2, 0, [0, 0, 0], gp)
  })
  put(cyl(r * 0.19, r * 0.19, r * 0.1, 7), gold, -0.35, 3.0, 0, [0, 0, 0.5])
  // ---- katana
  weapon.position.set(r * 0.45, r * 1.45, r * 0.95)
  const wp = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(g, m, x, y, z, rot, weapon, sc)
  wp(cyl(r * 0.075, r * 0.075, r * 0.9, 6), redCloth, 0, 0.12, 0)
  for (let i = 0; i < 5; i++) wp(box(r * 0.17, r * 0.05, r * 0.05), dark, 0, -0.18 + i * 0.17, 0, [0, 0, 0.5])
  wp(sph(r * 0.1, 6, 5), gold, 0, -0.38, 0)
  wp(cyl(r * 0.22, r * 0.22, r * 0.06, 10), gold, 0, 0.6, 0)
  wp(torus(r * 0.22, r * 0.03, 10), dark, 0, 0.6, 0, [PI / 2, 0, 0])
  wp(box(r * 0.1, r * 0.14, r * 0.12), gold, 0, 0.7, 0)
  wp(box(r * 0.05, r * 1.6, r * 0.2), steel, 0, 1.5, 0)
  wp(box(r * 0.06, r * 1.55, r * 0.05), b.m('#ffffff', { metalness: 0.8, roughness: 0.15, emissive: new THREE.Color('#ffd8a0'), emissiveIntensity: 0.25 }), 0.03, 1.5, 0.08)
  wp(box(r * 0.05, r * 1.15, r * 0.2), steel, 0.1, 2.6, 0, [0, 0, -0.2])
  wp(box(r * 0.06, r * 1.1, r * 0.05), steel, 0.14, 2.6, 0.08, [0, 0, -0.2])
  wp(cone(r * 0.12, r * 0.45, 3), steel, 0.3, 3.25, 0, [0, 0, -0.5], [0.4, 1, 1])
  wp(box(r * 0.07, r * 0.08, r * 0.08), glow('#ff7a3a', 0.9), 0, 0.82, 0)
  // ---- animation
  const mo = motion()
  return finish(r * 3.9, (t, st) => {
    const m = mo(t, st.moving)
    legs[0].rotation.z = m.walk * 0.66 * m.amp
    legs[1].rotation.z = m.walk2 * 0.66 * m.amp
    arms[0].rotation.z = m.walk2 * 0.55 * m.amp + m.breathe * 0.02
    arms[1].rotation.z = m.breathe * 0.02 + 0.03
    fringe.forEach((f, i) => {
      f.rotation.z = -(0.04 + m.amp * 0.25) + Math.sin(t * 5 + i) * 0.06
    })
    tails.forEach((f, i) => {
      f.rotation.z = -(0.2 + m.amp * 0.6) + Math.sin(t * 5 + i * 1.3) * (0.1 + m.amp * 0.15)
    })
    feathers.forEach((f, i) => {
      f.rotation.z = Math.sin(t * 3 + i * 0.5) * 0.05 - m.amp * 0.12
    })
    ponytail.forEach((sg, i) => {
      sg.rotation.z = (i ? 0.35 : -1.3 - m.amp * 0.2) + Math.sin(t * 4 + i * 1.2) * (0.1 + m.amp * 0.15)
    })
    eyeMat.emissiveIntensity = st.casting || st.attacking ? 2.4 : 1.3 + 0.25 * Math.sin(t * 3.3)
  })
}

/* ------------------------------------------------------ LEGION COMMANDER */
const legion_commander: HeroModelFn = (_id, color, color2, team, r) => {
  const { b, body, weapon, glow, metal, dbl, put, pivot, finish, motion } = scaffold(team, r)
  const red = b.m(color)
  const cape = dbl('#a82a22')
  const darkCape = dbl('#7a1a16')
  const gold = metal(color2)
  const darkGold = metal('#9a7a30')
  const skin = b.m('#e0b090')
  const hair = b.m('#3a2418')
  const leather = b.m('#4a2a1e')
  const steel = metal('#cfd6de')
  const eyeMat = glow('#fff2d0', 0.7)
  const gemMat = glow('#ff5a4a', 1.2)
  const legs: THREE.Group[] = []
  // ---- legs: gold greaves, strapped sandals
  for (const s of [-1, 1]) {
    const { pv, lput } = pivot(0, 1.3, s * 0.32)
    lput(cyl(r * 0.24, r * 0.2, r * 0.7, 7), skin, 0, 0.95, s * 0.32)
    lput(sph(r * 0.22, 6, 5), gold, 0.12, 0.66, s * 0.32)
    lput(cyl(r * 0.26, r * 0.2, r * 0.65, 8), gold, 0.03, 0.4, s * 0.32)
    lput(box(r * 0.08, r * 0.5, r * 0.1), darkGold, 0.24, 0.4, s * 0.32)
    lput(cyl(r * 0.27, r * 0.27, r * 0.05, 8), darkGold, 0.03, 0.7, s * 0.32)
    for (let i = 0; i < 2; i++) lput(cyl(r * 0.2, r * 0.2, r * 0.04, 7), leather, 0.02, 0.22 - i * 0.06, s * 0.32)
    lput(box(r * 0.8, r * 0.08, r * 0.38), leather, 0.14, 0.05, s * 0.32)
    lput(box(r * 0.3, r * 0.1, r * 0.36), gold, 0.3, 0.12, s * 0.32)
    lput(cone(r * 0.12, r * 0.25, 4), gold, 0.62, 0.1, s * 0.32, [0, PI / 4, -PI / 2])
    legs.push(pv)
  }
  // ---- pteruges skirt (two layers of leather strips) + belt
  const strips: THREE.Group[] = []
  for (let layer = 0; layer < 2; layer++) {
    const n = layer ? 12 : 10
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + layer * 0.2
      const gp = new THREE.Group()
      gp.position.set(Math.cos(a) * (0.6 + layer * 0.06) * r, (1.55 - layer * 0.05) * r, Math.sin(a) * (0.6 + layer * 0.06) * r)
      gp.rotation.y = -a
      body.add(gp)
      put(box(r * 0.07, r * (0.5 - layer * 0.12), r * 0.3), i % 2 ? red : leather, 0, -0.25, 0, [0, 0, 0], gp)
      put(box(r * 0.09, r * 0.08, r * 0.32), gold, 0.01, -0.5 + layer * 0.12, 0, [0, 0, 0], gp)
      strips.push(gp)
    }
  }
  put(cyl(r * 0.55, r * 0.58, r * 0.2, 10), leather, 0, 1.72, 0)
  put(cyl(r * 0.17, r * 0.17, r * 0.08, 10), gold, 0.58, 1.72, 0, [0, 0, PI / 2])
  put(sph(r * 0.07, 5, 4), gemMat, 0.64, 1.72, 0)
  for (const s of [-1, 1]) for (let i = 1; i <= 2; i++) put(sph(r * 0.05, 4, 3), gold, 0.54, 1.72, s * i * 0.2 + s * 0.12)
  // ---- cuirass (musculata)
  put(cyl(r * 0.55, r * 0.46, r * 0.95, 10), gold, 0, 2.25, 0, [0, 0, 0], [0.9, 1, 1.15])
  for (const s of [-1, 1]) {
    put(sph(r * 0.26, 7, 6), gold, 0.3, 2.45, s * 0.26, [0, 0, 0], [0.9, 0.9, 1])
    put(box(r * 0.08, r * 0.14, r * 0.3), darkGold, 0.44, 2.18, s * 0.17)
    put(cone(r * 0.1, r * 0.4, 4), darkGold, 0.5, 2.7, s * 0.3, [0, 0, -2.0], [1, 1, 0.5])
  }
  for (let i = 0; i < 3; i++) put(box(r * 0.07, r * 0.05, r * 0.5), darkGold, 0.5 - i * 0.01, 2.1 - i * 0.15, 0)
  put(box(r * 0.12, r * 0.5, r * 0.18), darkGold, 0.52, 2.35, 0)
  put(sph(r * 0.1, 6, 5), gemMat, 0.6, 2.32, 0)
  put(torus(r * 0.12, r * 0.03, 8), gold, 0.6, 2.32, 0, [0, PI / 2, 0])
  put(box(r * 0.3, r * 0.7, r * 0.85), darkGold, -0.4, 2.3, 0)
  put(cyl(r * 0.3, r * 0.4, r * 0.25, 8), gold, 0, 2.75, 0)
  put(torus(r * 0.36, r * 0.04, 10), darkGold, 0, 2.86, 0, [PI / 2, 0, 0])
  put(sph(r * 0.12, 6, 5), skin, 0.0, 2.9, 0, [0, 0, 0], [1, 1, 1.2])
  for (const s of [-1, 1]) put(box(r * 0.07, r * 0.8, r * 0.1), leather, 0.4, 2.3, s * 0.4)
  // ---- arms (left arm carries the shield)
  const arms: THREE.Group[] = []
  for (const s of [-1, 1]) {
    put(sph(r * 0.32, 8, 6), gold, 0, 2.72, s * 0.72, [0, 0, 0], [1, 0.65, 1])
    put(sph(r * 0.27, 8, 6), darkGold, 0, 2.6, s * 0.78, [0, 0, 0], [1, 0.5, 1])
    put(sph(r * 0.18, 8, 6), gold, 0, 2.5, s * 0.82, [0, 0, 0], [1, 0.5, 1])
    put(sph(r * 0.08, 5, 4), gemMat, 0.15, 2.76, s * 0.72)
    const { pv, lput } = pivot(0, 2.55, s * 0.8)
    lput(cyl(r * 0.15, r * 0.13, r * 0.75, 7), skin, 0.1, 2.2, s * 0.8)
    lput(sph(r * 0.14, 6, 5), skin, 0.14, 1.85, s * 0.82)
    lput(cyl(r * 0.17, r * 0.14, r * 0.45, 7), skin, 0.22, 1.7, s * 0.84)
    lput(cyl(r * 0.2, r * 0.19, r * 0.34, 8), gold, 0.24, 1.62, s * 0.84)
    lput(torus(r * 0.2, r * 0.03, 8), darkGold, 0.24, 1.78, s * 0.84, [PI / 2, 0, 0])
    lput(box(r * 0.07, r * 0.28, r * 0.12), darkGold, 0.42, 1.62, s * 0.84)
    lput(box(r * 0.22, r * 0.2, r * 0.2), skin, 0.32, 1.38, s * 0.86)
    for (let i = -1; i <= 1; i++) lput(box(r * 0.12, r * 0.06, r * 0.05), skin, 0.46, 1.34, s * 0.86 + i * 0.07)
    arms.push(pv)
  }
  // ---- cape (chained segments) with gold clasps
  const capeSegs = clothChain(body, r, [-0.62, 2.75, 0], 0.8, 3, (gp, i) => {
    const w = 1.1 + i * 0.12
    put(box(r * 0.06, r * 0.85, r * w), i === 2 ? darkCape : cape, 0, -0.4, 0, [0, 0, 0], gp)
    for (const s of [-1, 1]) put(box(r * 0.08, r * 0.85, r * 0.05), gold, 0, -0.4, (s * w) / 2, [0, 0, 0], gp)
    if (i === 0) for (const s of [-1, 1]) put(sph(r * 0.1, 6, 5), gold, 0.05, -0.05, s * 0.5, [0, 0, 0], gp)
    if (i === 2) put(box(r * 0.08, r * 0.07, r * w), gold, 0, -0.84, 0, [0, 0, 0], gp)
  })
  // ---- head, face, hair
  put(sph(r * 0.3, 9, 8), skin, 0.05, 3.1, 0)
  for (const s of [-1, 1]) {
    put(sph(r * 0.06, 5, 4), eyeMat, 0.33, 3.14, s * 0.11)
    put(box(r * 0.04, r * 0.03, r * 0.12), hair, 0.35, 3.23, s * 0.11, [s * 0.25, 0, 0])
  }
  put(box(r * 0.04, r * 0.04, r * 0.12), b.m('#b04a4a'), 0.34, 2.96, 0)
  put(sph(r * 0.05, 4, 3), skin, 0.36, 3.06, 0)
  const ponytail = clothChain(body, r, [-0.3, 3.15, 0], 0.4, 3, (gp, i) => {
    put(cyl(r * (0.14 - i * 0.025), r * (0.18 - i * 0.025), r * 0.45, 6), hair, 0, -0.2, 0, [0, 0, 0], gp)
  })
  put(sph(r * 0.2, 7, 6), hair, -0.2, 3.1, 0, [0, 0, 0], [1, 1, 1.1])
  // ---- helmet: dome, cheek guards, crest holder, horsehair plume
  put(sph(r * 0.38, 9, 7), gold, 0.0, 3.3, 0, [0, 0, 0], [1, 0.85, 1])
  put(torus(r * 0.37, r * 0.04, 12), darkGold, 0, 3.2, 0, [PI / 2, 0, 0])
  put(box(r * 0.12, r * 0.08, r * 0.56), gold, 0.3, 3.26, 0) // brow
  for (const s of [-1, 1]) {
    put(box(r * 0.28, r * 0.5, r * 0.1), gold, 0.15, 3.0, s * 0.3, [0, s * 0.15, 0])
    put(box(r * 0.05, r * 0.3, r * 0.1), darkGold, 0.3, 3.0, s * 0.3)
    put(cone(r * 0.1, r * 0.3, 4), gold, 0.0, 3.0, s * 0.4, [0, 0, 2.5])
  }
  put(box(r * 0.08, r * 0.45, r * 0.1), gold, 0.34, 3.12, 0) // nasal
  put(box(r * 1.0, r * 0.12, r * 0.14), darkGold, 0, 3.62, 0)
  put(box(r * 0.12, r * 0.1, r * 0.2), gemMat, 0.35, 3.52, 0)
  const plume = new THREE.Group()
  plume.position.set(0, 3.66 * r, 0)
  body.add(plume)
  const plumeStrips: THREE.Mesh[] = []
  for (let i = 0; i < 9; i++) {
    const x = 0.42 - i * 0.12
    const hgt = 0.7 - Math.abs(i - 2) * 0.05 + (i > 5 ? -0.05 * (i - 5) : 0)
    plumeStrips.push(put(box(r * 0.14, r * hgt, r * 0.07), i % 3 === 2 ? darkCape : red, x, hgt / 2, 0, [0, 0, 0.1 + i * 0.1], plume))
  }
  put(box(r * 0.4, r * 0.1, r * 0.1), gold, 0.0, 0.0, 0, [0, 0, 0], plume)
  // ---- shield (scutum) held on the left arm
  const R = r * 0.95
  const arc = 1.5
  const ts = PI / 2 - arc / 2
  const shield = new THREE.Group()
  shield.position.set(0.45 * r, 1.65 * r, -1.0 * r)
  body.add(shield)
  const sh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(g, m, x, y, z, rot, shield, sc)
  const Rn = R / r
  sh(new THREE.CylinderGeometry(R, R, r * 1.95, 16, 1, true, ts, arc), dbl(color), -Rn, 0, 0)
  for (const yy of [-0.98, 0.98]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.02, r * 0.12, 16, 1, true, ts, arc), dbl(color2, { metalness: 0.65, roughness: 0.35 }))
    rim.position.set(-R, yy * r, 0)
    rim.castShadow = true
    shield.add(rim)
  }
  for (const e of [-1, 1]) {
    const th = PI / 2 + e * (arc / 2)
    sh(box(r * 0.1, r * 1.98, r * 0.1), gold, Rn * Math.sin(th) - Rn, 0, Rn * Math.cos(th), [0, -e * (arc / 2) * 0.0, 0])
  }
  const bossX = 0.04
  sh(sph(r * 0.24, 8, 6), gold, bossX, 0, 0, [0, 0, 0], [0.5, 1, 1])
  sh(sph(r * 0.1, 6, 5), gemMat, bossX + 0.08, 0, 0)
  sh(box(r * 0.08, r * 1.2, r * 0.1), darkGold, bossX + 0.02, 0, 0)
  for (const s of [-1, 1]) {
    sh(cone(r * 0.12, r * 0.6, 4), gold, bossX + 0.03, 0.15, s * 0.3, [0, 0, 0], [1, 1, 0.4]).rotation.x = s * 0.9
    sh(box(r * 0.08, r * 0.08, r * 0.3), gold, bossX, -0.55, s * 0.12)
  }
  // ---- gladius
  weapon.position.set(r * 0.45, r * 1.55, r * 0.88)
  const wp = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(g, m, x, y, z, rot, weapon, sc)
  wp(cyl(r * 0.08, r * 0.08, r * 0.7, 6), leather, 0, 0.05, 0)
  for (let i = 0; i < 3; i++) wp(torus(r * 0.09, r * 0.025, 7), gold, 0, -0.15 + i * 0.2, 0, [PI / 2, 0, 0])
  wp(sph(r * 0.13, 6, 5), gold, 0, -0.35, 0)
  wp(box(r * 0.14, r * 0.14, r * 0.78), gold, 0, 0.45, 0)
  for (const s of [-1, 1]) wp(sph(r * 0.09, 5, 4), darkGold, 0, 0.45, s * 0.4)
  wp(box(r * 0.07, r * 1.1, r * 0.34), steel, 0, 1.1, 0)
  wp(box(r * 0.07, r * 0.9, r * 0.4), steel, 0, 1.95, 0, [0, 0, 0], [1, 1, 1.0])
  wp(box(r * 0.09, r * 1.7, r * 0.07), metal('#8a96a8'), 0.01, 1.4, 0)
  wp(cone(r * 0.2, r * 0.5, 4), steel, 0, 2.7, 0, [0, PI / 4, 0], [0.35, 1, 1])
  wp(box(r * 0.09, r * 0.5, r * 0.1), glow('#ffd070', 0.5), 0.02, 0.9, 0)
  // ---- animation
  const mo = motion()
  return finish(r * 4.0, (t, st) => {
    const m = mo(t, st.moving)
    legs[0].rotation.z = m.walk * 0.64 * m.amp
    legs[1].rotation.z = m.walk2 * 0.64 * m.amp
    arms[0].rotation.z = m.breathe * 0.02
    arms[1].rotation.z = m.breathe * 0.02 + 0.03
    shield.position.y = (1.65 + m.breathe * 0.015) * r
    strips.forEach((sg, i) => {
      sg.rotation.z = -0.1 - m.amp * 0.12 * (1 + Math.sin(t * 9 + i * 0.7)) - Math.sin(t * 2 + i) * 0.02
    })
    capeSegs.forEach((sg, i) => {
      sg.rotation.z = -(i ? 0.03 + m.amp * 0.12 : 0.08 + m.amp * 0.28) + Math.sin(t * 2.8 + i * 1.1) * (0.04 + m.amp * 0.07)
    })
    plume.rotation.z = -m.amp * 0.18 + Math.sin(t * 3) * 0.03
    plumeStrips.forEach((p, i) => {
      p.rotation.z = 0.1 + i * 0.1 + Math.sin(t * 4.2 + i * 0.6) * (0.04 + m.amp * 0.08)
    })
    ponytail.forEach((sg, i) => {
      sg.rotation.z = (i ? 0.35 : -1.2 - m.amp * 0.2) + Math.sin(t * 4 + i * 1.2) * (0.1 + m.amp * 0.15)
    })
    gemMat.emissiveIntensity = 0.9 + 0.35 * Math.sin(t * 2.7)
  })
}

/** 3D builders for the g1 heroes, keyed by hero id. */
export const MODELS_G1: Record<string, HeroModelFn> = { sven, juggernaut, legion_commander }
