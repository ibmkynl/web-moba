import * as THREE from 'three'
import { Builder, Model, box, cone, cyl, sph, teamRing } from './modelkit'

export type HeroModelFn = (id: string, color: string, color2: string, team: number, r: number) => Model

const PI = Math.PI

/** Shared scaffold (same conventions as heroes3d_g3): builder, groups, `put` positions in units of r, +x is "forward". */
function scaffold(team: number, r: number) {
  const b = new Builder()
  const g = new THREE.Group()
  teamRing(b, g, r, team)
  const body = new THREE.Group()
  g.add(body)
  const weapon = new THREE.Group()
  const glow = (c: string, i = 0.8) => b.m(c, { emissive: new THREE.Color(c), emissiveIntensity: i })
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
  const piv = (x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const gr = new THREE.Group()
    gr.position.set(x * r, y * r, z * r)
    parent.add(gr)
    return gr
  }
  const tor = (rad: number, tube: number, seg = 12) => new THREE.TorusGeometry(r * rad, r * tube, 5, seg)
  const S = { b, g, body, weapon, glow, put, piv, tor, r }
  return S
}
type S = ReturnType<typeof scaffold>

/** Two walking legs (pivots at hip height `y`, +-z apart). Thigh + shin + boot + knee guard. */
function legs(s: S, o: { thigh: THREE.Material; shin: THREE.Material; foot: THREE.Material; trim?: THREE.Material; y: number; z: number; w: number; len?: number; toe?: number }) {
  const { put, piv, r } = s
  const len = o.len ?? 0.95
  const out: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const lp = piv(0, o.y, sd * o.z)
    put(cyl(r * o.w, r * o.w * 0.85, r * len * 0.5, 7), o.thigh, 0, -len * 0.22, 0, [0, 0, 0], lp)
    put(cyl(r * o.w * 0.9, r * o.w * 0.75, r * len * 0.55, 7), o.shin, 0, -len * 0.7, 0, [0, 0, 0], lp)
    put(sph(r * o.w * 0.95, 6, 5), o.trim ?? o.shin, o.w * 0.4, -len * 0.45, 0, [0, 0, 0], lp, [0.8, 0.9, 1])
    put(box(r * (0.5 + (o.toe ?? 0)), r * 0.18, r * o.w * 2), o.foot, 0.12 + (o.toe ?? 0) * 0.5, -len - 0.05, 0, [0, 0, 0], lp)
    put(cone(r * o.w * 0.9, r * 0.3, 6), o.foot, 0.42 + (o.toe ?? 0), -len - 0.05, 0, [0, 0, -PI / 2], lp)
    out.push(lp)
  }
  return out
}

/** Arm hanging from a shoulder pivot with an elbow child (`userData.ep`). */
function arm(s: S, parent: THREE.Object3D, y: number, z: number, o: { cap: THREE.Material; upper: THREE.Material; lower: THREE.Material; hand: THREE.Material; w: number; len?: number }) {
  const { put, piv, r } = s
  const len = o.len ?? 0.55
  const ap = piv(0, y, z, parent)
  put(sph(r * o.w * 1.4, 6, 5), o.cap, 0, 0, 0, [0, 0, 0], ap)
  put(cyl(r * o.w, r * o.w * 0.85, r * len, 7), o.upper, 0, -len * 0.5, 0, [0, 0, 0], ap)
  const ep = piv(0, -len, 0, ap)
  put(sph(r * o.w * 0.9, 5, 4), o.upper, 0, 0, 0, [0, 0, 0], ep)
  put(cyl(r * o.w * 0.95, r * o.w * 0.75, r * len, 7), o.lower, 0, -len * 0.5, 0, [0, 0, 0], ep)
  put(sph(r * o.w * 1.1, 6, 5), o.hand, 0, -len - 0.08, 0, [0, 0, 0], ep)
  ap.userData.ep = ep
  return ap
}

/* ================================================================ Earthshaker */
function earthshaker(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const s = scaffold(team, r)
  const { b, g, body, weapon, glow, put, piv, tor } = s
  const skin = b.m('#a8744a')
  const skinDark = b.m('#80522f')
  const stone = b.m('#8a8478')
  const stoneDark = b.m('#5a5650')
  const fur = b.m('#6a4a2a')
  const furLight = b.m('#a8865a')
  const hair = b.m('#2a1a10')
  const gold = b.m('#d8b04a', { metalness: 0.5, roughness: 0.4 })
  const rune = glow('#ff9a3a', 1.2)
  const eye = glow('#ffd08a', 1)
  const bone = b.m('#e8e0c8')

  const lg = legs(s, { thigh: skin, shin: stone, foot: stoneDark, trim: stoneDark, y: 1.05, z: 0.34, w: 0.26, len: 1.0, toe: 0.05 })
  // fur kilt
  put(cyl(r * 0.78, r * 0.95, r * 0.6, 12), fur, 0, 1.05, 0)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2
    put(cone(r * 0.14, r * 0.35, 4), furLight, Math.cos(a) * 0.9, 0.7, Math.sin(a) * 0.9, [0, 0, PI])
  }
  put(cyl(r * 0.8, r * 0.8, r * 0.14, 12), gold, 0, 1.38, 0)
  put(box(r * 0.1, r * 0.3, r * 0.3), stoneDark, 0.8, 1.3, 0)
  put(sph(r * 0.09, 5, 4), rune, 0.86, 1.3, 0)

  const U = 1.45
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(cyl(r * 0.75, r * 0.62, r * 1.25, 10), skin, 0, 2.05, 0, [0, 0, 0], [1, 1, 1.15])
  // chest plates of rock
  up(box(r * 0.22, r * 0.95, r * 0.95), stone, 0.62, 2.05, 0)
  up(box(r * 0.26, r * 0.28, r * 0.85), stoneDark, 0.68, 2.35, 0)
  up(box(r * 0.2, r * 0.2, r * 0.5), stoneDark, 0.66, 1.75, 0)
  for (let i = 0; i < 3; i++) up(box(r * 0.05, r * 0.05, r * 0.3), rune, 0.78, 2.1 - i * 0.18, 0)
  up(cyl(r * 0.5, r * 0.5, r * 0.08, 10), gold, 0, 1.55, 0)
  // shoulder boulders
  for (const sd of [-1, 1]) {
    const bd = up(new THREE.DodecahedronGeometry(r * 0.44), stone, 0, 2.7, sd * 0.88)
    bd.rotation.set(sd * 0.4, 0.5, 0.3)
    up(cone(r * 0.15, r * 0.4, 5), stoneDark, 0, 3.0, sd * 0.88, [sd * 0.3, 0, 0])
    up(sph(r * 0.1, 4, 3), rune, 0.38, 2.62, sd * 0.88)
  }
  // head: beard, mane, horned helm
  const head = piv(0.05, 3.2 - U, 0, upper)
  put(sph(r * 0.42, 9, 8), skin, 0, 0, 0, [0, 0, 0], head, [1, 1, 0.98])
  put(box(r * 0.2, r * 0.1, r * 0.5), skinDark, 0.38, 0.12, 0, [0, 0, -0.1], head)
  put(sph(r * 0.1, 5, 4), skin, 0.42, -0.04, 0, [0, 0, 0], head, [1, 1.2, 0.9])
  for (const sd of [-1, 1]) put(sph(r * 0.06, 5, 4), eye, 0.37, 0.07, sd * 0.17, [0, 0, 0], head, [0.5, 1, 1])
  put(cone(r * 0.38, r * 0.85, 7), hair, 0.28, -0.5, 0, [0, 0, PI + 0.3], head)
  put(sph(r * 0.5, 8, 7), hair, -0.15, 0.1, 0, [0, 0, 0], head, [0.9, 1, 1.05])
  put(cyl(r * 0.46, r * 0.5, r * 0.28, 9), stone, 0, 0.3, 0, [0, 0, 0], head)
  for (const sd of [-1, 1]) {
    put(cone(r * 0.12, r * 0.65, 5), bone, 0, 0.45, sd * 0.45, [sd * 0.7, 0, 0], head)
    put(cone(r * 0.07, r * 0.4, 4), bone, 0.05, 0.95, sd * 0.78, [sd * 0.2, 0, 0], head)
  }
  put(box(r * 0.08, r * 0.1, r * 0.1), rune, 0.45, 0.35, 0, [0, 0, 0], head)
  // arms
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const a = arm(s, upper, 2.6 - U, sd * 0.9, { cap: stone, upper: skin, lower: skinDark, hand: skin, w: 0.24, len: 0.7 })
    put(box(r * 0.52, r * 0.3, r * 0.5), stoneDark, 0, -0.62, 0, [0, 0, 0], a.userData.ep)
    put(tor(0.24, 0.05, 8), gold, 0, -0.12, 0, [PI / 2, 0, 0], a.userData.ep)
    arms.push(a)
  }
  arms[1].rotation.z = 0.6
  // totem weapon
  weapon.position.set(r * 0.55, r * 1.5, r * 1.0)
  put(cyl(r * 0.2, r * 0.24, r * 4.0, 8), b.m('#6a4a2e'), 0, 0.7, 0, [0, 0, 0], weapon)
  for (let i = 0; i < 4; i++) {
    put(box(r * 0.5, r * 0.5, r * 0.5), i % 2 ? stoneDark : stone, 0, 0.35 + i * 0.85, 0, [0, i * 0.2, 0], weapon)
    put(box(r * 0.08, r * 0.1, r * 0.3), rune, 0.27, 0.42 + i * 0.85, 0, [0, 0, 0], weapon)
    put(box(r * 0.08, r * 0.1, r * 0.3), rune, 0.27, 0.28 + i * 0.85, 0, [0, 0, 0], weapon)
  }
  put(new THREE.DodecahedronGeometry(r * 0.55), stone, 0, 4.3, 0, [0.3, 0.2, 0], weapon)
  put(sph(r * 0.2, 6, 5), rune, 0, 4.3, 0, [0, 0, 0], weapon)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    put(cone(r * 0.12, r * 0.55, 4), bone, Math.cos(a) * 0.5, 4.5, Math.sin(a) * 0.5, [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6], weapon)
  }
  body.add(weapon)
  // floating rocks
  const spin = new THREE.Group()
  spin.position.y = r * 1.8
  const rocks: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    const m = put(new THREE.DodecahedronGeometry(r * (0.16 + (i % 2) * 0.08)), stone, Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7, [a, a, 0], spin)
    m.castShadow = false
    rocks.push(m)
  }
  g.add(spin)
  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 8) : 0
    lg[0].rotation.z = w * 0.5
    lg[1].rotation.z = -w * 0.5
    arms[0].rotation.z = -w * 0.4
    arms[1].rotation.z = 0.6 + Math.sin(t * 1.6) * 0.03
    upper.position.y = r * (U + Math.sin(t * 1.8) * 0.025)
    weapon.rotation.z = st.attacking ? -0.5 : st.casting ? 0.25 : 0
    rocks.forEach((m, i) => (m.position.y = r * (Math.sin(t * 1.5 + i * 1.4) * 0.45)))
    rune.emissiveIntensity = 1.0 + Math.sin(t * 3) * 0.4
  }
  return { group: g, weapon, body, spin, height: r * 4.0, mats: b.mats, update }
}

/* ================================================================ Tidehunter */
function tidehunter(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const s = scaffold(team, r)
  const { b, g, body, weapon, glow, put, piv, tor } = s
  const skin = b.m('#4a9a7a')
  const skinDark = b.m('#2e6a58')
  const belly = b.m('#c8d89a')
  const fin = b.m('#2a7a8a')
  const coat = b.m('#d8b030')
  const coatDark = b.m('#a07818')
  const iron = b.m('#6a727e', { metalness: 0.7, roughness: 0.4 })
  const rust = b.m('#7a5a3a', { metalness: 0.4 })
  const eye = glow('#fff07a', 1)
  const tooth = b.m('#f0ecd0')
  const tent = b.m('#3a8a6a')

  const lg = legs(s, { thigh: skinDark, shin: skin, foot: fin, trim: skinDark, y: 1.0, z: 0.38, w: 0.32, len: 0.95, toe: 0.2 })
  for (const sd of [-1, 1]) put(cone(r * 0.12, r * 0.5, 4), fin, -0.1, 0.5, sd * 0.7, [0, 0, 2.2])
  const U = 1.35
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(sph(r * 1.0, 10, 9), skin, 0.1, 1.85, 0, [0, 0, 0], [0.95, 1.1, 1.15])
  up(sph(r * 0.85, 10, 8), belly, 0.35, 1.7, 0, [0, 0, 0], [0.7, 1, 1])
  for (let i = 0; i < 4; i++) up(tor(0.8 - i * 0.06, 0.035, 14), skinDark, 0.38, 1.4 + i * 0.28, 0, [0, PI / 2, 0], [1, 1, 0.8])
  // yellow slicker coat on the back
  up(box(r * 0.12, r * 1.6, r * 1.5), coat, -0.65, 2.0, 0)
  up(box(r * 0.12, r * 0.5, r * 1.6), coatDark, -0.7, 1.15, 0)
  for (let i = 0; i < 4; i++) up(sph(r * 0.1, 5, 4), iron, 0.78, 2.0 - i * 0.22, 0.0)
  // dorsal fins
  for (let i = 0; i < 5; i++) up(cone(r * 0.18, r * (0.7 - i * 0.07), 4), fin, -0.82, 2.9 - i * 0.28, 0, [0, 0, 1.9])
  // head
  const head = piv(0.45, 3.1 - U, 0, upper)
  put(sph(r * 0.52, 9, 8), skin, 0, 0, 0, [0, 0, 0], head, [1.1, 0.95, 1.05])
  put(box(r * 0.45, r * 0.2, r * 0.7), skinDark, 0.38, -0.2, 0, [0, 0, 0.1], head)
  for (let i = 0; i < 6; i++) put(cone(r * 0.04, r * 0.16, 4), tooth, 0.58, -0.3, -0.27 + i * 0.1, [0, 0, PI], head)
  for (const sd of [-1, 1]) {
    put(sph(r * 0.15, 6, 5), b.m('#f6f2c0'), 0.4, 0.2, sd * 0.3, [0, 0, 0], head)
    put(sph(r * 0.08, 5, 4), eye, 0.52, 0.2, sd * 0.3, [0, 0, 0], head)
    put(cone(r * 0.2, r * 0.7, 4), fin, -0.1, 0.1, sd * 0.55, [sd * 1.2, 0, 0], head)
  }
  put(cone(r * 0.2, r * 0.8, 5), fin, -0.1, 0.62, 0, [0, 0, 0.6], head)
  // tentacle beard
  const tents: THREE.Group[] = []
  for (let i = 0; i < 6; i++) {
    const tp = piv(0.45, -0.35, -0.3 + i * 0.12, head)
    put(cone(r * 0.1, r * 1.0, 5), tent, 0, -0.5, 0, [0, 0, PI], tp)
    put(sph(r * 0.07, 4, 3), eye, 0, -0.95, 0, [0, 0, 0], tp)
    tents.push(tp)
  }
  // arms (heavy)
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const a = arm(s, upper, 2.5 - U, sd * 1.05, { cap: coat, upper: skin, lower: skinDark, hand: skin, w: 0.3, len: 0.75 })
    put(tor(0.3, 0.06, 8), iron, 0, -0.35, 0, [PI / 2, 0, 0], a.userData.ep)
    for (let i = 0; i < 3; i++) put(cone(r * 0.05, r * 0.2, 4), tooth, 0.12, -0.78, (i - 1) * 0.1, [0, 0, -PI / 2], a.userData.ep)
    arms.push(a)
  }
  arms[1].rotation.z = 0.7
  // giant anchor (weapon)
  weapon.position.set(r * 0.5, r * 1.6, r * 1.2)
  put(cyl(r * 0.12, r * 0.12, r * 3.6, 7), iron, 0, 0.9, 0, [0, 0, 0], weapon)
  put(tor(0.34, 0.08, 10), iron, 0, 2.95, 0, [0, PI / 2, 0], weapon)
  put(box(r * 0.2, r * 0.2, r * 1.6), iron, 0, 2.4, 0, [0, 0, 0], weapon)
  put(tor(1.05, 0.12, 20), rust, 0, -0.35, 0, [0, PI / 2, 0], weapon).scale.set(1, 0.75, 1)
  for (const sd of [-1, 1]) put(cone(r * 0.22, r * 0.75, 5), iron, 0, -1.1, sd * 1.0, [sd * 0.7, 0, PI], weapon)
  put(cyl(r * 0.2, r * 0.2, r * 0.2, 8), rust, 0, 2.4, 0, [PI / 2, 0, 0], weapon)
  for (let i = 0; i < 7; i++) put(tor(0.12, 0.04, 6), iron, 0.0, 2.9 + i * 0.1, 0.3 + i * 0.2, [i % 2 ? PI / 2 : 0, 0, 0], weapon)
  body.add(weapon)
  // orbiting droplets
  const spin = new THREE.Group()
  spin.position.y = r * 1.8
  const drops: THREE.Mesh[] = []
  const water = glow('#7ad8ff', 0.7)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    const m = put(sph(r * 0.13, 6, 5), water, Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8, [0, 0, 0], spin, [1, 1.4, 1])
    m.castShadow = false
    drops.push(m)
  }
  g.add(spin)
  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 7) : 0
    lg[0].rotation.z = w * 0.45
    lg[1].rotation.z = -w * 0.45
    arms[0].rotation.z = -w * 0.35
    arms[1].rotation.z = 0.7 + Math.sin(t * 1.4) * 0.03
    upper.position.y = r * (U + Math.sin(t * 1.6) * 0.03)
    upper.rotation.z = Math.sin(t * 1.6) * 0.02
    tents.forEach((p, i) => (p.rotation.z = Math.sin(t * 2.4 + i * 0.9) * 0.18 + (st.moving ? 0.2 : 0)))
    weapon.rotation.z = st.attacking ? -0.6 : st.casting ? 0.3 : 0
    drops.forEach((m, i) => (m.position.y = r * Math.sin(t * 1.9 + i * 1.3) * 0.4))
  }
  return { group: g, weapon, body, spin, height: r * 4.0, mats: b.mats, update }
}

/* ================================================================ Dragon Knight */
function dragonKnight(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const s = scaffold(team, r)
  const { b, g, body, weapon, glow, put, piv, tor } = s
  const steel = b.m('#b4bcc8', { metalness: 0.75, roughness: 0.3 })
  const steelDark = b.m('#6a727e', { metalness: 0.7, roughness: 0.4 })
  const red = b.m('#b8302a')
  const redDark = b.m('#701814')
  const gold = b.m('#e0b84a', { metalness: 0.6, roughness: 0.3 })
  const cloth = b.m('#5a1a14')
  const skin = b.m('#e8c4a0')
  const hair = b.m('#7a4a20')
  const ember = glow('#ff7a2a', 1.2)
  const capeM = b.m('#a82820', { side: THREE.DoubleSide })

  const lg = legs(s, { thigh: steelDark, shin: steel, foot: steelDark, trim: gold, y: 1.0, z: 0.28, w: 0.22, len: 1.0, toe: 0.05 })
  put(cone(r * 0.85, r * 0.9, 10), red, 0, 1.25, 0, [0, 0, PI])
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    put(box(r * 0.08, r * 0.45, r * 0.3), i % 2 ? redDark : red, Math.cos(a) * 0.62, 0.95, Math.sin(a) * 0.62, [0, -a, 0])
  }
  const U = 1.5
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(cyl(r * 0.58, r * 0.5, r * 1.15, 10), steel, 0, 2.1, 0, [0, 0, 0], [0.9, 1, 1.15])
  up(box(r * 0.18, r * 0.9, r * 0.6), red, 0.58, 2.0, 0)
  up(cyl(r * 0.52, r * 0.52, r * 0.12, 10), gold, 0, 1.58, 0)
  up(sph(r * 0.14, 6, 5), ember, 0.66, 2.3, 0)
  up(tor(0.62, 0.06, 12), gold, 0, 2.62, 0, [PI / 2, 0, 0])
  for (let i = 0; i < 4; i++) up(cone(r * 0.06, r * 0.22, 4), gold, 0.5, 2.0 - i * 0.18, 0, [0, 0, -PI / 2 + 0.2])
  for (const sd of [-1, 1]) {
    up(sph(r * 0.4, 7, 6), steel, 0, 2.7, sd * 0.82, [0, 0, 0], [1, 0.75, 1])
    up(cone(r * 0.12, r * 0.5, 5), gold, 0, 3.0, sd * 0.84, [sd * 0.3, 0, 0])
  }
  // cape
  const cape = piv(-0.55, 2.65 - U, 0, upper)
  const panels: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const pp = piv(-0.02 * i, 0, (i - 1) * 0.36, cape)
    put(box(r * 0.05, r * (1.8 - Math.abs(i - 1) * 0.3), r * 0.36), capeM, 0, -0.9, 0, [0, 0, 0], pp)
    put(cone(r * 0.18, r * 0.3, 4), gold, 0, -1.9 + Math.abs(i - 1) * 0.3, 0, [0, 0, PI], pp)
    panels.push(pp)
  }
  // helmet with dragon crest
  const head = piv(0.05, 3.1 - U, 0, upper)
  put(sph(r * 0.38, 9, 8), skin, 0.05, -0.05, 0, [0, 0, 0], head)
  put(sph(r * 0.46, 9, 8), steel, 0, 0.1, 0, [0, 0, 0], head, [1, 0.8, 1])
  put(box(r * 0.12, r * 0.5, r * 0.08), steelDark, 0.4, -0.08, 0, [0, 0, 0], head)
  for (const sd of [-1, 1]) {
    put(sph(r * 0.06, 5, 4), glow('#6ad0ff', 1), 0.34, 0.0, sd * 0.16, [0, 0, 0], head, [0.5, 1, 1])
    put(cone(r * 0.1, r * 0.9, 5), steel, -0.05, 0.5, sd * 0.4, [sd * 0.6, 0, 0.5], head)
    put(box(r * 0.5, r * 0.04, r * 0.5), gold, -0.3, 0.2, sd * 0.55, [0, 0, 0.3], head)
  }
  for (let i = 0; i < 5; i++) put(cone(r * 0.07, r * (0.5 - i * 0.04), 4), red, 0.2 - i * 0.17, 0.62 + (i % 2) * 0.03, 0, [0, 0, -0.2 - i * 0.12], head)
  put(sph(r * 0.13, 5, 4), gold, 0.0, 0.58, 0, [0, 0, 0], head)
  put(cone(r * 0.08, r * 0.3, 4), steel, 0.4, 0.2, 0, [0, 0, -PI / 2], head)
  // arms + shield
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const a = arm(s, upper, 2.6 - U, sd * 0.84, { cap: steel, upper: red, lower: steel, hand: steelDark, w: 0.19, len: 0.55 })
    put(tor(0.2, 0.04, 8), gold, 0, -0.1, 0, [PI / 2, 0, 0], a.userData.ep)
    arms.push(a)
  }
  arms[0].rotation.z = 0.35
  // kite shield on left arm (z=-1)
  const shield = piv(0.18, -0.55, 0, arms[0].userData.ep)
  put(box(r * 0.1, r * 1.1, r * 0.8), steel, 0.14, 0, 0, [0, 0, 0], shield)
  put(cone(r * 0.4, r * 0.4, 4), steel, 0.14, -0.74, 0, [PI, PI / 4, 0], shield)
  put(box(r * 0.12, r * 0.9, r * 0.12), gold, 0.2, 0, 0, [0, 0, 0], shield)
  put(sph(r * 0.18, 6, 5), red, 0.2, 0.12, 0, [0, 0, 0], shield)
  put(cone(r * 0.1, r * 0.3, 5), gold, 0.28, 0.12, 0, [0, 0, -PI / 2], shield)
  // sword
  weapon.position.set(r * 0.3, r * 1.55, r * 0.95)
  put(box(r * 0.1, r * 3.0, r * 0.24), steel, 0, 1.7, 0, [0, 0, 0], weapon)
  put(cone(r * 0.12, r * 0.45, 4), steel, 0, 3.4, 0, [0, 0, 0], weapon).scale.set(1, 1, 1.9)
  put(box(r * 0.1, r * 2.2, r * 0.05), ember, 0, 1.7, 0, [0, 0, 0], weapon).castShadow = false
  put(box(r * 0.2, r * 0.18, r * 1.0), gold, 0, 0.2, 0, [0, 0, 0], weapon)
  put(cyl(r * 0.07, r * 0.07, r * 0.6, 6), cloth, 0, -0.1, 0, [0, 0, 0], weapon)
  put(sph(r * 0.12, 6, 5), gold, 0, -0.45, 0, [0, 0, 0], weapon)
  body.add(weapon)
  const spin = new THREE.Group()
  spin.position.y = r * 1.8
  const embers: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    const m = put(cone(r * 0.1, r * 0.35, 4), ember, Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55, [0, 0, 0], spin)
    m.castShadow = false
    embers.push(m)
  }
  g.add(spin)
  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 9) : 0
    lg[0].rotation.z = w * 0.5
    lg[1].rotation.z = -w * 0.5
    arms[0].rotation.z = 0.35 - w * 0.1
    arms[1].rotation.z = 0.3 + Math.sin(t * 1.6) * 0.03
    upper.position.y = r * (U + Math.sin(t * 2) * 0.02)
    cape.rotation.z = (st.moving ? 0.28 : 0.08) + Math.sin(t * 2.2) * 0.05
    panels.forEach((p, i) => (p.rotation.z = Math.sin(t * 3 + i * 1.2) * (st.moving ? 0.25 : 0.07)))
    weapon.rotation.z = st.attacking ? -0.7 : 0
    ember.emissiveIntensity = 1 + Math.sin(t * 5) * 0.4 + (st.casting ? 0.6 : 0)
    embers.forEach((m, i) => (m.position.y = r * Math.sin(t * 2 + i * 1.6) * 0.4))
  }
  return { group: g, weapon, body, spin, height: r * 4.0, mats: b.mats, update }
}

/* ================================================================ Drow Ranger */
function drowRanger(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const s = scaffold(team, r)
  const { b, g, body, weapon, glow, put, piv, tor } = s
  const skin = b.m('#b8c8e8')
  const hair = b.m('#f2f6ff')
  const cloak = b.m('#2e4a78')
  const cloakDark = b.m('#1a2c4e', { side: THREE.DoubleSide })
  const leather = b.m('#5a4a3a')
  const fur = b.m('#e8eef8')
  const bow = b.m('#7a5a3a')
  const ice = glow('#8ad8ff', 1)
  const silver = b.m('#c0c8d8', { metalness: 0.7, roughness: 0.35 })
  const eye = glow('#4ab8ff', 1)

  const lg = legs(s, { thigh: cloakDark, shin: leather, foot: leather, trim: silver, y: 1.05, z: 0.2, w: 0.15, len: 1.05, toe: 0.05 })
  put(cone(r * 0.62, r * 0.9, 9), cloak, 0, 1.3, 0, [0, 0, PI])
  put(cyl(r * 0.5, r * 0.5, r * 0.12, 10), leather, 0, 1.5, 0)
  put(box(r * 0.14, r * 0.14, r * 0.14), silver, 0.5, 1.5, 0)
  const U = 1.7
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(cyl(r * 0.4, r * 0.34, r * 0.95, 9), cloak, 0, 2.05, 0, [0, 0, 0], [0.9, 1, 1.1])
  up(box(r * 0.1, r * 0.8, r * 0.5), leather, 0.34, 2.0, 0)
  for (let i = 0; i < 3; i++) up(sph(r * 0.05, 4, 3), silver, 0.4, 2.3 - i * 0.22, 0)
  up(tor(0.4, 0.1, 12), fur, 0, 2.55, 0, [PI / 2, 0, 0])
  // quiver
  const qv = piv(-0.4, 2.1 - U, 0.15, upper)
  put(cyl(r * 0.16, r * 0.14, r * 1.0, 7), leather, 0, 0, 0, [0, 0, 0.35], qv)
  for (let i = 0; i < 5; i++) {
    put(cyl(r * 0.015, r * 0.015, r * 0.5, 4), b.m('#e8e0c0'), 0.0 - i * 0.02, 0.6, -0.1 + i * 0.05, [0, 0, 0.35], qv)
    put(cone(r * 0.05, r * 0.1, 4), ice, 0.18, 0.86, -0.1 + i * 0.05, [0, 0, 0.35], qv)
  }
  // head with hood + white hair
  const head = piv(0.05, 3.1 - U, 0, upper)
  put(sph(r * 0.34, 9, 8), skin, 0, 0, 0, [0, 0, 0], head, [1, 1.05, 0.95])
  put(sph(r * 0.06, 4, 3), skin, 0.34, -0.03, 0, [0, 0, 0], head, [1, 1.2, 0.8])
  for (const sd of [-1, 1]) {
    put(sph(r * 0.06, 5, 4), eye, 0.3, 0.04, sd * 0.14, [0, 0, 0], head, [0.5, 1, 1])
    put(cone(r * 0.05, r * 0.3, 4), skin, -0.02, 0.06, sd * 0.36, [sd * 1.2, 0, 0.3], head)
  }
  put(box(r * 0.04, r * 0.03, r * 0.1), b.m('#d06a8a'), 0.33, -0.14, 0, [0, 0, 0], head)
  put(cone(r * 0.44, r * 0.7, 8), cloak, -0.12, 0.05, 0, [0, 0, 1.45], head)
  put(tor(0.37, 0.07, 12), fur, 0.0, 0.0, 0, [0, PI / 2, 0], head)
  const braids: THREE.Group[] = []
  for (let i = 0; i < 4; i++) {
    const bp = piv(-0.25, 0.1, (i - 1.5) * 0.17, head)
    put(cone(r * 0.08, r * (1.4 - Math.abs(i - 1.5) * 0.2), 5), hair, 0, -0.7, 0, [0, 0, PI], bp)
    braids.push(bp)
  }
  put(sph(r * 0.09, 5, 4), ice, 0.28, 0.38, 0, [0, 0, 0], head) // circlet gem
  put(tor(0.3, 0.025, 10), silver, 0.05, 0.3, 0, [PI / 2 - 0.3, 0, 0], head)
  // cloak back
  const cape = piv(-0.38, 2.5 - U, 0, upper)
  const panels: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const pp = piv(-0.02 * i, 0, (i - 1) * 0.28, cape)
    put(box(r * 0.04, r * (1.6 - Math.abs(i - 1) * 0.3), r * 0.3), cloakDark, 0, -0.8, 0, [0, 0, 0], pp)
    panels.push(pp)
  }
  // arms
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const a = arm(s, upper, 2.5 - U, sd * 0.5, { cap: fur, upper: cloak, lower: leather, hand: skin, w: 0.12, len: 0.55 })
    put(tor(0.13, 0.03, 8), silver, 0, -0.12, 0, [PI / 2, 0, 0], a.userData.ep)
    arms.push(a)
  }
  arms[0].rotation.z = -0.9 // bow arm forward
  arms[1].rotation.z = 0.2
  // frost bow
  weapon.position.set(r * 0.9, r * 1.95, r * -0.5)
  put(tor(1.0, 0.045, 18), bow, 0, 0, 0, [0, 0, 0], weapon).scale.set(0.45, 1.3, 1)
  for (const sd of [-1, 1]) {
    put(cone(r * 0.06, r * 0.5, 4), ice, -0.2, sd * 1.25, 0, [0, 0, sd * 0.6], weapon)
    put(sph(r * 0.07, 5, 4), ice, -0.38, sd * 1.12, 0, [0, 0, 0], weapon)
  }
  put(cyl(r * 0.015, r * 0.015, r * 2.4, 4), b.m('#e8f4ff'), -0.28, 0, 0, [0, 0, 0], weapon)
  put(cyl(r * 0.07, r * 0.07, r * 0.4, 6), leather, 0.0, 0, 0, [0, 0, 0], weapon)
  body.add(weapon)
  // orbiting frost motes
  const spin = new THREE.Group()
  spin.position.y = r * 1.9
  const motes: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    const m = put(cone(r * 0.07, r * 0.28, 4), ice, Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35, [0, 0, 0], spin)
    m.castShadow = false
    motes.push(m)
  }
  g.add(spin)
  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 11) : 0
    lg[0].rotation.z = w * 0.55
    lg[1].rotation.z = -w * 0.55
    arms[1].rotation.z = 0.2 - w * 0.3 + (st.attacking ? -0.6 : 0)
    upper.position.y = r * (U + Math.sin(t * 2.2) * 0.02)
    cape.rotation.z = (st.moving ? 0.3 : 0.08) + Math.sin(t * 2.4) * 0.05
    panels.forEach((p, i) => (p.rotation.z = Math.sin(t * 3 + i * 1.2) * (st.moving ? 0.25 : 0.08)))
    braids.forEach((p, i) => (p.rotation.z = (st.moving ? 0.3 : 0.06) + Math.sin(t * 3 + i) * 0.08))
    weapon.rotation.y = st.attacking ? 0.15 : 0
    motes.forEach((m, i) => (m.position.y = r * Math.sin(t * 1.8 + i * 1.5) * 0.4))
  }
  return { group: g, weapon, body, spin, height: r * 3.7, mats: b.mats, update }
}

/* ================================================================ Phantom Assassin */
function phantomAssassin(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const s = scaffold(team, r)
  const { b, g, body, weapon, glow, put, piv, tor } = s
  const dark = b.m('#241c3a')
  const mid = b.m('#3a2c5e')
  const light = b.m('#5a4a8a')
  const skin = b.m('#d8cce0')
  const mask = b.m('#e8e4f0')
  const silver = b.m('#c8cce0', { metalness: 0.75, roughness: 0.3 })
  const gold = b.m('#c8a850', { metalness: 0.5, roughness: 0.4 })
  const scarf = b.m('#7a1a3a', { side: THREE.DoubleSide })
  const eye = glow('#ff4a6a', 1.3)
  const purple = glow('#b070ff', 1)

  const lg = legs(s, { thigh: dark, shin: mid, foot: dark, trim: silver, y: 1.0, z: 0.2, w: 0.16, len: 1.0, toe: 0.05 })
  put(cone(r * 0.55, r * 0.85, 8), dark, 0, 1.25, 0, [0, 0, PI])
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    put(box(r * 0.04, r * 0.7, r * 0.22), i % 2 ? mid : light, Math.cos(a) * 0.5, 0.95, Math.sin(a) * 0.5, [0, -a, 0.1])
  }
  const U = 1.65
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(cyl(r * 0.36, r * 0.3, r * 0.9, 9), mid, 0, 2.05, 0, [0, 0, 0], [0.85, 1, 1.1])
  up(box(r * 0.1, r * 0.85, r * 0.42), dark, 0.3, 2.0, 0)
  up(box(r * 0.04, r * 0.85, r * 0.06), gold, 0.36, 2.0, 0.18)
  up(box(r * 0.04, r * 0.85, r * 0.06), gold, 0.36, 2.0, -0.18)
  up(cyl(r * 0.4, r * 0.4, r * 0.1, 10), silver, 0, 1.6, 0)
  up(sph(r * 0.1, 5, 4), purple, 0.42, 1.6, 0)
  for (const sd of [-1, 1]) {
    up(sph(r * 0.24, 6, 5), silver, 0, 2.5, sd * 0.5, [0, 0, 0], [1, 0.6, 1])
    up(cone(r * 0.1, r * 0.4, 4), silver, 0.0, 2.75, sd * 0.5, [sd * 0.2, 0, 0])
  }
  // hooded head + mask
  const head = piv(0.05, 3.0 - U, 0, upper)
  put(sph(r * 0.33, 9, 8), mask, 0.04, -0.02, 0, [0, 0, 0], head, [0.95, 1.05, 0.95])
  for (const sd of [-1, 1]) {
    put(box(r * 0.06, r * 0.04, r * 0.1), eye, 0.33, 0.06, sd * 0.13, [0, 0, 0.3 * sd], head)
    put(box(r * 0.03, r * 0.2, r * 0.03), dark, 0.34, -0.1, sd * 0.1, [0, 0, 0], head)
  }
  put(box(r * 0.03, r * 0.3, r * 0.04), scarf, 0.34, -0.08, 0, [0, 0, 0], head)
  put(cone(r * 0.46, r * 0.75, 8), dark, -0.12, 0.08, 0, [0, 0, 1.4], head)
  put(tor(0.37, 0.08, 12), mid, 0, 0.0, 0, [0, PI / 2, 0], head)
  put(cone(r * 0.1, r * 0.4, 4), silver, 0.15, 0.4, 0, [0, 0, -0.3], head)
  // flowing scarf / cape
  const scarves: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const sp = piv(-0.2, 2.6 - U, (i - 1) * 0.22, upper)
    put(box(r * 0.04, r * 1.7, r * 0.2), i === 1 ? scarf : dark, 0, -0.85, 0, [0, 0, 0], sp)
    put(cone(r * 0.1, r * 0.3, 4), purple, 0, -1.8, 0, [0, 0, PI], sp)
    scarves.push(sp)
  }
  // arms with daggers
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const a = arm(s, upper, 2.5 - U, sd * 0.5, { cap: silver, upper: mid, lower: dark, hand: skin, w: 0.11, len: 0.55 })
    put(tor(0.12, 0.03, 8), gold, 0, -0.12, 0, [PI / 2, 0, 0], a.userData.ep)
    arms.push(a)
  }
  arms[1].rotation.z = 0.5
  arms[0].rotation.z = -0.3
  // curved blade (weapon)
  weapon.position.set(r * 0.45, r * 1.45, r * 0.62)
  put(cyl(r * 0.05, r * 0.05, r * 0.5, 6), dark, 0, 0, 0, [0, 0, 0], weapon)
  put(box(r * 0.3, r * 0.08, r * 0.1), gold, 0, 0.3, 0, [0, 0, 0], weapon)
  put(box(r * 0.07, r * 1.5, r * 0.18), silver, 0, 1.1, 0, [0, 0, -0.1], weapon)
  put(cone(r * 0.09, r * 0.4, 4), silver, 0.15, 2.0, 0, [0, 0, -0.5], weapon).scale.set(1, 1, 1.8)
  put(box(r * 0.04, r * 1.2, r * 0.05), purple, 0, 1.1, 0.0, [0, 0, -0.1], weapon).castShadow = false
  body.add(weapon)
  const off = piv(0.35, 1.5, -0.62)
  put(cyl(r * 0.05, r * 0.05, r * 0.45, 6), dark, 0, 0, 0, [0, 0, 0], off)
  put(box(r * 0.06, r * 1.2, r * 0.16), silver, 0, 0.8, 0, [0, 0, 0.15], off)
  put(cone(r * 0.08, r * 0.35, 4), silver, -0.1, 1.5, 0, [0, 0, 0.5], off)
  const spin = new THREE.Group()
  spin.position.y = r * 1.8
  const wisps: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    const m = put(sph(r * 0.1, 5, 4), purple, Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4, [0, 0, 0], spin, [1, 1.5, 1])
    m.castShadow = false
    wisps.push(m)
  }
  g.add(spin)
  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 12) : 0
    lg[0].rotation.z = w * 0.6
    lg[1].rotation.z = -w * 0.6
    arms[0].rotation.z = -0.3 - w * 0.4
    arms[1].rotation.z = 0.5 + Math.sin(t * 1.8) * 0.03
    upper.position.y = r * (U + Math.sin(t * 2.3) * 0.02)
    scarves.forEach((p, i) => (p.rotation.z = (st.moving ? 0.55 : 0.12) + Math.sin(t * 3.4 + i * 1.1) * 0.12))
    weapon.rotation.z = st.attacking ? -0.9 : 0
    off.rotation.z = st.attacking ? 0.5 : 0
    wisps.forEach((m, i) => (m.position.y = r * Math.sin(t * 2.2 + i * 1.6) * 0.45))
  }
  return { group: g, weapon, body, spin, height: r * 3.7, mats: b.mats, update }
}

/* ================================================================ Bounty Hunter */
function bountyHunter(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const s = scaffold(team, r)
  const { b, g, body, weapon, glow, put, piv, tor } = s
  const cloth = b.m('#3a3a42')
  const clothDark = b.m('#1e1e26')
  const brown = b.m('#6a5036')
  const leather = b.m('#4a3a2a')
  const metal = b.m('#a8aeb8', { metalness: 0.75, roughness: 0.3 })
  const gold = b.m('#e0b83a', { metalness: 0.6, roughness: 0.3 })
  const skin = b.m('#8a7a66')
  const eye = glow('#ffd84a', 1.4)
  const red = b.m('#8a2a2a', { side: THREE.DoubleSide })

  const lg = legs(s, { thigh: clothDark, shin: leather, foot: leather, trim: metal, y: 1.0, z: 0.22, w: 0.17, len: 1.0, toe: 0.05 })
  put(cone(r * 0.6, r * 0.7, 8), clothDark, 0, 1.2, 0, [0, 0, PI])
  put(cyl(r * 0.48, r * 0.48, r * 0.12, 10), leather, 0, 1.45, 0)
  put(sph(r * 0.18, 6, 5), gold, 0.5, 1.45, 0.2) // pouch of coin
  put(sph(r * 0.12, 5, 4), gold, 0.55, 1.5, 0.35)
  put(box(r * 0.14, r * 0.14, r * 0.14), metal, 0.5, 1.45, 0)
  const U = 1.65
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(cyl(r * 0.38, r * 0.32, r * 0.95, 9), cloth, 0, 2.05, 0, [0, 0, 0], [0.9, 1, 1.15])
  up(box(r * 0.1, r * 0.9, r * 0.5), leather, 0.34, 2.0, 0, [0, 0, 0])
  // bandolier with shurikens
  up(box(r * 0.06, r * 1.1, r * 0.1), brown, 0.36, 2.05, 0, [0.6, 0, 0.2])
  for (let i = 0; i < 4; i++) up(box(r * 0.04, r * 0.14, r * 0.14), metal, 0.4, 1.7 + i * 0.22, -0.3 + i * 0.2, [0.6, 0, 0.2])
  up(tor(0.36, 0.08, 10), red, 0, 2.55, 0, [PI / 2, 0, 0])
  for (const sd of [-1, 1]) up(sph(r * 0.22, 6, 5), metal, 0, 2.5, sd * 0.5, [0, 0, 0], [1, 0.7, 1])
  // hood + half mask
  const head = piv(0.05, 3.0 - U, 0, upper)
  put(sph(r * 0.33, 9, 8), skin, 0.03, 0, 0, [0, 0, 0], head, [0.95, 1, 0.95])
  put(cone(r * 0.46, r * 0.8, 8), clothDark, -0.12, 0.05, 0, [0, 0, 1.45], head)
  put(tor(0.37, 0.09, 12), cloth, 0, 0.02, 0, [0, PI / 2, 0], head)
  put(box(r * 0.1, r * 0.3, r * 0.6), metal, 0.3, -0.12, 0, [0, 0, 0], head) // mask plate
  for (const sd of [-1, 1]) put(sph(r * 0.06, 5, 4), eye, 0.32, 0.1, sd * 0.14, [0, 0, 0], head, [0.5, 1, 1])
  for (let i = 0; i < 3; i++) put(box(r * 0.03, r * 0.16, r * 0.03), clothDark, 0.37, -0.14, (i - 1) * 0.12, [0, 0, 0], head)
  put(cone(r * 0.08, r * 0.3, 4), metal, -0.35, 0.3, 0, [0, 0, 1.0], head)
  // tail scarf
  const scarves: THREE.Group[] = []
  for (let i = 0; i < 2; i++) {
    const sp = piv(-0.35, 2.5 - U, (i - 0.5) * 0.3, upper)
    put(box(r * 0.04, r * 1.5, r * 0.22), red, 0, -0.75, 0, [0, 0, 0], sp)
    scarves.push(sp)
  }
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const a = arm(s, upper, 2.5 - U, sd * 0.55, { cap: metal, upper: cloth, lower: leather, hand: skin, w: 0.12, len: 0.55 })
    put(tor(0.13, 0.03, 8), gold, 0, -0.12, 0, [PI / 2, 0, 0], a.userData.ep)
    arms.push(a)
  }
  arms[1].rotation.z = 0.5
  arms[0].rotation.z = -0.4
  // jitte (weapon)
  weapon.position.set(r * 0.5, r * 1.4, r * 0.65)
  put(cyl(r * 0.05, r * 0.05, r * 0.5, 6), leather, 0, 0, 0, [0, 0, 0], weapon)
  put(box(r * 0.06, r * 1.4, r * 0.14), metal, 0, 1.0, 0, [0, 0, 0], weapon)
  put(cone(r * 0.08, r * 0.4, 4), metal, 0, 1.9, 0, [0, 0, 0], weapon)
  put(cone(r * 0.05, r * 0.5, 4), metal, 0.2, 0.7, 0, [0, 0, -PI / 2], weapon)
  put(box(r * 0.2, r * 0.14, r * 0.14), gold, 0, 0.3, 0, [0, 0, 0], weapon)
  body.add(weapon)
  const off = piv(0.4, 1.4, -0.65)
  put(cyl(r * 0.05, r * 0.05, r * 0.5, 6), leather, 0, 0, 0, [0, 0, 0], off)
  put(box(r * 0.06, r * 1.4, r * 0.14), metal, 0, 1.0, 0, [0, 0, 0], off)
  put(cone(r * 0.08, r * 0.4, 4), metal, 0, 1.9, 0, [0, 0, 0], off)
  put(cone(r * 0.05, r * 0.5, 4), metal, 0.2, 0.7, 0, [0, 0, -PI / 2], off)
  // orbiting shuriken
  const spin = new THREE.Group()
  spin.position.y = r * 1.8
  const stars: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2
    const sp = piv(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5, spin)
    for (let k = 0; k < 4; k++) put(cone(r * 0.09, r * 0.4, 3), metal, Math.cos((k * PI) / 2) * 0.2, 0, Math.sin((k * PI) / 2) * 0.2, [PI / 2, 0, (k * PI) / 2 - PI / 2], sp).castShadow = false
    put(sph(r * 0.07, 5, 4), gold, 0, 0, 0, [0, 0, 0], sp)
    stars.push(sp)
  }
  g.add(spin)
  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 12) : 0
    lg[0].rotation.z = w * 0.6
    lg[1].rotation.z = -w * 0.6
    arms[0].rotation.z = -0.4 - w * 0.4
    arms[1].rotation.z = 0.5 + Math.sin(t * 1.8) * 0.03
    upper.position.y = r * (U + Math.sin(t * 2.3) * 0.02)
    scarves.forEach((p, i) => (p.rotation.z = (st.moving ? 0.5 : 0.1) + Math.sin(t * 3.4 + i * 1.3) * 0.12))
    weapon.rotation.z = st.attacking ? -0.9 : 0
    off.rotation.z = st.attacking ? 0.5 : 0
    stars.forEach((p, i) => {
      p.rotation.y = t * 8
      p.position.y = r * Math.sin(t * 2 + i * 2.1) * 0.35
    })
  }
  return { group: g, weapon, body, spin, height: r * 3.7, mats: b.mats, update }
}

/* ================================================================ Lina */
function lina(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const s = scaffold(team, r)
  const { b, g, body, weapon, glow, put, piv, tor } = s
  const skin = b.m('#f6d4bc')
  const dress = b.m('#c8301e')
  const dressDark = b.m('#821a10')
  const gold = b.m('#e8c050', { metalness: 0.55, roughness: 0.35 })
  const hairM = glow('#ff6a28', 0.6)
  const hairTip = glow('#ffb040', 1)
  const boot = b.m('#4a1a14')
  const fire = glow('#ff7a20', 1.4)
  const fireCore = glow('#ffe080', 1.6)
  const eye = glow('#ffd040', 1)
  const white = b.m('#f8f0e8')

  const lg = legs(s, { thigh: skin, shin: boot, foot: boot, trim: gold, y: 1.0, z: 0.2, w: 0.14, len: 1.0, toe: 0.05 })
  // skirt with flame hem
  put(cone(r * 0.82, r * 0.95, 12), dress, 0, 1.3, 0, [0, 0, PI])
  put(cone(r * 0.7, r * 0.8, 12), dressDark, 0, 1.28, 0, [0, 0.3, PI])
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2
    put(cone(r * 0.1, r * 0.3, 4), i % 2 ? hairTip : fire, Math.cos(a) * 0.82, 0.78, Math.sin(a) * 0.82, [Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1 + PI])
  }
  put(cyl(r * 0.5, r * 0.5, r * 0.12, 10), gold, 0, 1.55, 0)
  const U = 1.7
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(cyl(r * 0.38, r * 0.3, r * 0.9, 10), dress, 0, 2.05, 0, [0, 0, 0], [0.85, 1, 1.1])
  up(box(r * 0.08, r * 0.8, r * 0.4), dressDark, 0.32, 2.0, 0)
  up(sph(r * 0.1, 5, 4), fireCore, 0.4, 2.1, 0)
  up(tor(0.4, 0.05, 12), gold, 0, 2.48, 0, [PI / 2, 0, 0])
  for (const sd of [-1, 1]) up(sph(r * 0.2, 6, 5), gold, 0, 2.5, sd * 0.5, [0, 0, 0], [1, 0.7, 1])
  // head
  const head = piv(0.05, 3.05 - U, 0, upper)
  put(sph(r * 0.34, 9, 8), skin, 0, 0, 0, [0, 0, 0], head, [1, 1.02, 0.95])
  put(sph(r * 0.05, 4, 3), skin, 0.34, -0.04, 0, [0, 0, 0], head, [1, 1.3, 0.8])
  for (const sd of [-1, 1]) {
    put(sph(r * 0.08, 6, 5), white, 0.3, 0.04, sd * 0.14, [0, 0, 0], head, [0.5, 1, 1])
    put(sph(r * 0.055, 5, 4), eye, 0.34, 0.04, sd * 0.14, [0, 0, 0], head, [0.5, 1.1, 1])
    put(box(r * 0.04, r * 0.025, r * 0.12), boot, 0.33, 0.14, sd * 0.14, [sd * 0.2, 0, 0], head)
  }
  put(box(r * 0.03, r * 0.03, r * 0.08), b.m('#c8504a'), 0.34, -0.14, 0, [0, 0, 0], head)
  // spiky flame hair
  put(sph(r * 0.4, 9, 8), hairM, -0.1, 0.12, 0, [0, 0, 0], head, [1, 0.8, 1.1])
  const spikes: THREE.Mesh[] = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2
    spikes.push(put(cone(r * 0.12, r * (0.55 + (i % 3) * 0.2), 4), i % 2 ? hairTip : hairM, Math.cos(a) * 0.3 - 0.1, 0.4 + (i % 2) * 0.05, Math.sin(a) * 0.35, [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], head))
  }
  const tails: THREE.Group[] = []
  for (let i = 0; i < 5; i++) {
    const tp = piv(-0.3, 0.2, (i - 2) * 0.17, head)
    put(cone(r * (0.14 - Math.abs(i - 2) * 0.015), r * (1.5 - Math.abs(i - 2) * 0.25), 5), i % 2 ? hairTip : hairM, 0, -0.75, 0, [0, 0, PI], tp)
    tails.push(tp)
  }
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const a = arm(s, upper, 2.5 - U, sd * 0.52, { cap: gold, upper: skin, lower: dress, hand: skin, w: 0.11, len: 0.5 })
    put(tor(0.13, 0.04, 8), gold, 0, -0.14, 0, [PI / 2, 0, 0], a.userData.ep)
    put(cone(r * 0.16, r * 0.4, 6), dressDark, 0, -0.4, 0, [0, 0, PI], a.userData.ep)
    arms.push(a)
  }
  arms[0].rotation.z = -0.7
  arms[1].rotation.z = 0.5
  // fire orb in hand (weapon pivot)
  weapon.position.set(r * 0.75, r * 1.45, r * 0.62)
  put(sph(r * 0.3, 8, 7), fire, 0, 0.4, 0, [0, 0, 0], weapon).castShadow = false
  put(sph(r * 0.16, 7, 6), fireCore, 0, 0.4, 0, [0, 0, 0], weapon).castShadow = false
  const flames: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    flames.push(put(cone(r * 0.09, r * 0.4, 4), fire, Math.cos(a) * 0.22, 0.7, Math.sin(a) * 0.22, [0, 0, 0], weapon))
    flames[i].castShadow = false
  }
  body.add(weapon)
  const spin = new THREE.Group()
  spin.position.y = r * 1.9
  const emb: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    const m = put(sph(r * 0.11, 5, 4), fire, Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5, [0, 0, 0], spin, [1, 1.4, 1])
    m.castShadow = false
    emb.push(m)
  }
  put(tor(1.5, 0.015, 30), hairTip, 0, 0, 0, [PI / 2, 0, 0], spin).castShadow = false
  g.add(spin)
  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 11) : 0
    lg[0].rotation.z = w * 0.55
    lg[1].rotation.z = -w * 0.55
    arms[0].rotation.z = -0.7 - w * 0.2
    arms[1].rotation.z = 0.5 + Math.sin(t * 1.7) * 0.03
    upper.position.y = r * (U + Math.sin(t * 2.2) * 0.02)
    tails.forEach((p, i) => (p.rotation.z = (st.moving ? 0.35 : 0.08) + Math.sin(t * 4 + i * 0.9) * 0.1))
    spikes.forEach((m, i) => m.scale.set(1, 1 + Math.sin(t * 6 + i * 1.7) * 0.15, 1))
    const k = 1 + Math.sin(t * 5) * 0.1 + (st.casting ? 0.5 : 0)
    weapon.scale.setScalar(k)
    flames.forEach((m, i) => (m.scale.y = 1 + Math.sin(t * 9 + i * 2) * 0.35))
    emb.forEach((m, i) => (m.position.y = r * Math.sin(t * 2.2 + i * 1.3) * 0.4))
  }
  return { group: g, weapon, body, spin, height: r * 3.8, mats: b.mats, update }
}

/* ================================================================ Lion */
function lion(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const s = scaffold(team, r)
  const { b, g, body, weapon, glow, put, piv, tor } = s
  const skin = b.m('#9a5aa8')
  const skinDark = b.m('#6a3a7a')
  const robe = b.m('#3a2a50')
  const robeDark = b.m('#201430')
  const robeAlt = b.m('#6a3a5a', { side: THREE.DoubleSide })
  const bone = b.m('#e8e0c0')
  const gold = b.m('#d8b040', { metalness: 0.5, roughness: 0.4 })
  const wood = b.m('#4a3226')
  const eye = glow('#8aff5a', 1.4)
  const orb = glow('#c060ff', 1.4)
  const horn = b.m('#2a2030')

  const lg = legs(s, { thigh: skinDark, shin: skin, foot: horn, trim: skinDark, y: 1.0, z: 0.2, w: 0.14, len: 1.0, toe: 0.15 })
  for (const sd of [-1, 1]) put(cone(r * 0.1, r * 0.4, 4), bone, 0.5, -0.05, sd * 0.2, [0, 0, -PI / 2], body) // toe claws
  put(cone(r * 0.8, r * 1.1, 10), robe, 0, 1.45, 0, [0, 0, PI])
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2
    put(box(r * 0.04, r * 0.55, r * 0.26), i % 2 ? robeAlt : robeDark, Math.cos(a) * 0.72, 0.85, Math.sin(a) * 0.72, [0, -a, 0.05])
  }
  put(cyl(r * 0.5, r * 0.5, r * 0.12, 10), gold, 0, 1.5, 0)
  put(sph(r * 0.14, 5, 4), bone, 0.5, 1.5, 0)
  const U = 1.7
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(cyl(r * 0.4, r * 0.32, r * 0.95, 9), robe, 0, 2.05, 0, [0, 0, 0], [0.9, 1, 1.1])
  up(box(r * 0.08, r * 0.8, r * 0.42), robeAlt, 0.32, 2.0, 0)
  up(tor(0.4, 0.09, 12), robeDark, 0, 2.55, 0, [PI / 2, 0, 0])
  for (let i = 0; i < 4; i++) up(sph(r * 0.07, 4, 3), bone, 0.38, 2.4 - i * 0.2, 0)
  for (const sd of [-1, 1]) {
    up(sph(r * 0.24, 6, 5), robeDark, 0, 2.52, sd * 0.52, [0, 0, 0], [1, 0.7, 1])
    up(cone(r * 0.1, r * 0.45, 4), bone, 0, 2.85, sd * 0.55, [sd * 0.3, 0, 0])
  }
  // head: demon face, horns, wild hair
  const head = piv(0.05, 3.05 - U, 0, upper)
  put(sph(r * 0.36, 9, 8), skin, 0, 0, 0, [0, 0, 0], head, [1, 1.02, 0.95])
  put(box(r * 0.2, r * 0.12, r * 0.4), skinDark, 0.3, -0.18, 0, [0, 0, 0.1], head)
  put(cone(r * 0.07, r * 0.2, 4), skinDark, 0.38, -0.02, 0, [0, 0, -PI / 2], head)
  for (const sd of [-1, 1]) {
    put(sph(r * 0.09, 5, 4), eye, 0.3, 0.1, sd * 0.15, [0, 0, 0], head, [0.5, 1, 1.3])
    put(cone(r * 0.12, r * 1.0, 5), horn, -0.05, 0.3, sd * 0.3, [sd * 0.6, 0, 0.6], head)
    put(cone(r * 0.06, r * 0.5, 4), horn, -0.35, 0.9, sd * 0.6, [sd * 0.2, 0, 0.8], head)
    put(cone(r * 0.05, r * 0.3, 4), skin, -0.02, 0.0, sd * 0.38, [sd * 1.2, 0, 0.3], head)
    put(cone(r * 0.04, r * 0.18, 4), bone, 0.34, -0.26, sd * 0.1, [0, 0, PI], head)
  }
  const hairs: THREE.Group[] = []
  for (let i = 0; i < 5; i++) {
    const hp = piv(-0.25, 0.25, (i - 2) * 0.16, head)
    put(cone(r * 0.09, r * (1.2 - Math.abs(i - 2) * 0.15), 5), b.m('#c8c8e0'), 0, -0.6, 0, [0, 0, PI], hp)
    hairs.push(hp)
  }
  // back cloak
  const cape = piv(-0.4, 2.55 - U, 0, upper)
  const panels: THREE.Group[] = []
  for (let i = 0; i < 4; i++) {
    const pp = piv(-0.02 * i, 0, (i - 1.5) * 0.28, cape)
    put(box(r * 0.04, r * (1.8 - Math.abs(i - 1.5) * 0.3), r * 0.28), i % 2 ? robeAlt : robeDark, 0, -0.9, 0, [0, 0, 0], pp)
    put(cone(r * 0.14, r * 0.3, 4), robeDark, 0, -1.9 + Math.abs(i - 1.5) * 0.3, 0, [0, 0, PI], pp)
    panels.push(pp)
  }
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const a = arm(s, upper, 2.5 - U, sd * 0.56, { cap: robeDark, upper: skin, lower: robe, hand: skin, w: 0.12, len: 0.5 })
    put(cone(r * 0.2, r * 0.5, 6), robeAlt, 0, -0.4, 0, [0, 0, PI], a.userData.ep)
    for (let i = 0; i < 3; i++) put(cone(r * 0.03, r * 0.2, 4), bone, 0.04, -0.82, (i - 1) * 0.07, [0, 0, -PI / 2 - 0.2], a.userData.ep)
    arms.push(a)
  }
  arms[0].rotation.z = -0.9 // pointing hand forward
  arms[1].rotation.z = 0.35
  // crooked staff
  weapon.position.set(r * 0.5, r * 1.5, r * 0.75)
  put(cyl(r * 0.07, r * 0.09, r * 3.3, 6), wood, 0, 0.7, 0, [0, 0, 0.05], weapon)
  put(tor(0.35, 0.07, 10), wood, 0.05, 2.5, 0, [0, PI / 2, 0], weapon)
  put(sph(r * 0.24, 7, 6), orb, 0.05, 2.5, 0, [0, 0, 0], weapon).castShadow = false
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    put(cone(r * 0.06, r * 0.4, 4), bone, 0.05 + Math.cos(a) * 0.32, 2.5, Math.sin(a) * 0.32, [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0], weapon)
  }
  put(cone(r * 0.05, r * 0.25, 4), horn, 0, -0.95, 0, [0, 0, PI], weapon)
  body.add(weapon)
  const spin = new THREE.Group()
  spin.position.y = r * 1.8
  const skulls: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2
    const m = put(sph(r * 0.14, 6, 5), bone, Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6, [0, 0, 0], spin, [1, 0.9, 1])
    m.castShadow = false
    put(sph(r * 0.04, 4, 3), eye, Math.cos(a) * 1.6 + 0.1, 0.03, Math.sin(a) * 1.6 + 0.06, [0, 0, 0], spin).castShadow = false
    skulls.push(m)
  }
  g.add(spin)
  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 10) : 0
    lg[0].rotation.z = w * 0.5
    lg[1].rotation.z = -w * 0.5
    arms[0].rotation.z = -0.9 + (st.casting ? -0.3 : 0) - w * 0.1
    arms[1].rotation.z = 0.35 + Math.sin(t * 1.5) * 0.03
    upper.position.y = r * (U + Math.sin(t * 2) * 0.02)
    cape.rotation.z = (st.moving ? 0.3 : 0.07) + Math.sin(t * 2.2) * 0.04
    panels.forEach((p, i) => (p.rotation.z = Math.sin(t * 2.8 + i * 1.2) * (st.moving ? 0.25 : 0.08)))
    hairs.forEach((p, i) => (p.rotation.z = (st.moving ? 0.3 : 0.08) + Math.sin(t * 3 + i) * 0.1))
    orb.emissiveIntensity = 1.2 + Math.sin(t * 4) * 0.4 + (st.casting ? 0.8 : 0)
    skulls.forEach((m, i) => (m.position.y = r * Math.sin(t * 1.8 + i * 2) * 0.4))
  }
  return { group: g, weapon, body, spin, height: r * 3.9, mats: b.mats, update }
}

/* ================================================================ Zeus */
function zeus(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const s = scaffold(team, r)
  const { b, g, body, weapon, glow, put, piv, tor } = s
  const skin = b.m('#e8c4a0')
  const toga = b.m('#e8f0ff')
  const togaBlue = b.m('#4a70c8', { side: THREE.DoubleSide })
  const beard = b.m('#e8eefc')
  const gold = b.m('#e8c050', { metalness: 0.6, roughness: 0.3 })
  const sandal = b.m('#8a6a3a')
  const bolt = glow('#fff6a0', 1.6)
  const elec = glow('#8ac8ff', 1.4)
  const eye = glow('#7ad0ff', 1.2)
  const cloud = b.m('#c8d4f0', { transparent: true, opacity: 0.85 })

  const lg = legs(s, { thigh: skin, shin: skin, foot: sandal, trim: gold, y: 1.05, z: 0.26, w: 0.2, len: 1.05, toe: 0.05 })
  for (const sd of [-1, 1]) put(tor(0.2, 0.025, 8), sandal, 0.0, 0.5, sd * 0.26, [PI / 2, 0, 0])
  // toga skirt with blue sash
  put(cone(r * 0.85, r * 1.0, 12), toga, 0, 1.4, 0, [0, 0, PI])
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    put(box(r * 0.05, r * 0.7, r * 0.3), togaBlue, Math.cos(a) * 0.7, 1.0, Math.sin(a) * 0.7, [0, -a, 0])
  }
  put(cyl(r * 0.5, r * 0.5, r * 0.12, 10), gold, 0, 1.55, 0)
  const U = 1.75
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(cyl(r * 0.62, r * 0.48, r * 1.0, 10), skin, 0, 2.15, 0, [0, 0, 0], [0.9, 1, 1.2]) // bare muscular chest
  up(box(r * 0.08, r * 0.3, r * 0.3), skin, 0.5, 2.3, 0.2, [0, 0, 0]) // pecs
  up(box(r * 0.08, r * 0.3, r * 0.3), skin, 0.5, 2.3, -0.2, [0, 0, 0])
  up(box(r * 0.12, r * 1.4, r * 0.34), togaBlue, 0.45, 2.1, 0.1, [0.5, 0, 0.35]) // diagonal sash
  up(sph(r * 0.1, 5, 4), gold, 0.55, 2.5, -0.25)
  for (const sd of [-1, 1]) {
    up(sph(r * 0.3, 6, 5), gold, 0, 2.75, sd * 0.78, [0, 0, 0], [1, 0.7, 1])
    up(cone(r * 0.12, r * 0.35, 4), bolt, 0, 3.0, sd * 0.78)
  }
  // head: laurel, long white beard
  const head = piv(0.08, 3.25 - U, 0, upper)
  put(sph(r * 0.37, 9, 8), skin, 0, 0, 0, [0, 0, 0], head, [1, 1.02, 0.95])
  put(sph(r * 0.07, 4, 3), skin, 0.37, -0.03, 0, [0, 0, 0], head, [1, 1.3, 0.8])
  for (const sd of [-1, 1]) {
    put(sph(r * 0.06, 5, 4), eye, 0.33, 0.08, sd * 0.15, [0, 0, 0], head, [0.5, 1, 1])
    put(box(r * 0.06, r * 0.04, r * 0.16), beard, 0.34, 0.17, sd * 0.15, [sd * 0.3, 0, 0], head)
  }
  put(sph(r * 0.42, 9, 8), beard, -0.12, 0.05, 0, [0, 0, 0], head, [0.95, 1, 1.05])
  const beardG = piv(0.28, -0.22, 0, head)
  put(cone(r * 0.4, r * 1.2, 8), beard, 0, -0.55, 0, [0, 0, PI], beardG)
  put(cone(r * 0.2, r * 0.8, 6), beard, 0.1, -0.95, 0, [0, 0, PI], beardG)
  put(box(r * 0.08, r * 0.06, r * 0.34), beard, 0.38, -0.12, 0, [0, 0, 0], head) // moustache
  put(tor(0.4, 0.04, 14), gold, 0, 0.3, 0, [PI / 2 - 0.15, 0, 0], head)
  for (let i = 0; i < 7; i++) put(cone(r * 0.05, r * 0.2, 4), gold, 0.15 - Math.abs(i - 3) * 0.03, 0.38, (i - 3) * 0.12, [0, 0, -0.2], head)
  // cape
  const cape = piv(-0.5, 2.8 - U, 0, upper)
  const panels: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const pp = piv(-0.02 * i, 0, (i - 1) * 0.4, cape)
    put(box(r * 0.05, r * (1.9 - Math.abs(i - 1) * 0.3), r * 0.4), togaBlue, 0, -0.95, 0, [0, 0, 0], pp)
    put(box(r * 0.04, r * 0.1, r * 0.4), gold, 0.03, -1.8 + Math.abs(i - 1) * 0.3, 0, [0, 0, 0], pp)
    panels.push(pp)
  }
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const a = arm(s, upper, 2.75 - U, sd * 0.86, { cap: gold, upper: skin, lower: skin, hand: skin, w: 0.21, len: 0.62 })
    put(tor(0.22, 0.05, 8), gold, 0, -0.2, 0, [PI / 2, 0, 0], a.userData.ep)
    put(tor(0.2, 0.04, 8), gold, 0, -0.55, 0, [PI / 2, 0, 0], a.userData.ep)
    arms.push(a)
  }
  arms[1].rotation.z = 0.8
  arms[0].rotation.z = -0.2
  // lightning bolt weapon (jagged)
  weapon.position.set(r * 0.65, r * 1.7, r * 1.0)
  const pts: [number, number, number][] = [[0, -0.2, 0], [0.18, 0.5, 0], [-0.1, 1.0, 0], [0.2, 1.7, 0], [-0.1, 2.3, 0], [0.12, 3.1, 0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const c2 = pts[i + 1]
    const dx = c2[0] - a[0]
    const dy = c2[1] - a[1]
    put(box(r * 0.14, r * Math.hypot(dx, dy), r * 0.14), bolt, (a[0] + c2[0]) / 2, (a[1] + c2[1]) / 2, 0, [0, 0, -Math.atan2(dx, dy)], weapon).castShadow = false
  }
  put(cone(r * 0.15, r * 0.4, 4), bolt, 0.12, 3.3, 0, [0, 0, 0], weapon).castShadow = false
  put(sph(r * 0.2, 6, 5), elec, 0, 1.1, 0, [0, 0, 0], weapon).castShadow = false
  body.add(weapon)
  // floating storm cloud + orbiting sparks
  const spin = new THREE.Group()
  spin.position.y = r * 2.0
  const sparks: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    const m = put(cone(r * 0.08, r * 0.4, 3), elec, Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6, [Math.random(), 0, Math.random()], spin)
    m.castShadow = false
    sparks.push(m)
  }
  put(tor(1.6, 0.012, 30), elec, 0, 0, 0, [PI / 2, 0, 0], spin).castShadow = false
  g.add(spin)
  const puffs: THREE.Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    const m = put(sph(r * 0.35, 7, 6), cloud, Math.cos(a) * 0.65, 0.15, Math.sin(a) * 0.65, [0, 0, 0], body, [1, 0.55, 1])
    m.castShadow = false
    puffs.push(m)
  }
  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 8) : 0
    lg[0].rotation.z = w * 0.45
    lg[1].rotation.z = -w * 0.45
    arms[0].rotation.z = -0.2 - w * 0.3
    arms[1].rotation.z = 0.8 + Math.sin(t * 1.6) * 0.03
    upper.position.y = r * (U + Math.sin(t * 1.8) * 0.025)
    cape.rotation.z = (st.moving ? 0.28 : 0.08) + Math.sin(t * 2.2) * 0.05
    panels.forEach((p, i) => (p.rotation.z = Math.sin(t * 2.8 + i * 1.2) * (st.moving ? 0.25 : 0.07)))
    beardG.rotation.z = Math.sin(t * 1.7) * 0.04 + (st.moving ? -0.12 : 0)
    bolt.emissiveIntensity = 1.3 + Math.sin(t * 17) * 0.4 + (st.casting ? 0.8 : 0)
    sparks.forEach((m, i) => {
      m.position.y = r * Math.sin(t * 2 + i * 1.3) * 0.45
      m.rotation.y = t * 6 + i
    })
    puffs.forEach((m, i) => m.scale.set(1 + Math.sin(t * 1.4 + i) * 0.08, 0.55, 1 + Math.cos(t * 1.2 + i) * 0.08))
  }
  return { group: g, weapon, body, spin, height: r * 4.15, mats: b.mats, update }
}

/** 3D builders for the g4 heroes, keyed by hero id. */
export const MODELS_G4: Record<string, HeroModelFn> = {
  earthshaker,
  tidehunter,
  dragon_knight: dragonKnight,
  drow_ranger: drowRanger,
  phantom_assassin: phantomAssassin,
  bounty_hunter: bountyHunter,
  lina,
  lion,
  zeus,
}
