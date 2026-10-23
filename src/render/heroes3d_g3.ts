import * as THREE from 'three'
import { type HeroModelFn, Model, box, cone, cyl, makeScaffold, sph } from './modelkit'

const PI = Math.PI

const scaffold = makeScaffold

/* ------------------------------------------------------------ Crystal Maiden */
function crystalMaiden(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const { b, g, body, weapon, glow, put, piv, tor } = scaffold(team, r)
  const skin = b.m('#fbe2cf')
  const blush = b.m('#f0a8a0')
  const blue = b.m('#4f8fe0')
  const blueDark = b.m('#2c5cb0')
  const blueLight = b.m('#9fd0f6')
  const fur = b.m('#f7fbff')
  const furShade = b.m('#d6e6f6')
  const hair = b.m('#a8e2ff')
  const hairDark = b.m('#6cbcf0')
  const ice = glow('#aee8ff', 0.9)
  const iceCore = glow('#e8fbff', 1.2)
  const gold = b.m('#e8d070', { metalness: 0.5, roughness: 0.35 })
  const boot = b.m('#e2ecf8')
  const wood = b.m('#a8c4dc')
  const capeM = b.m('#4f8fe0', { side: THREE.DoubleSide })
  const capeIn = b.m('#d6ecff', { side: THREE.DoubleSide })
  const eyeM = glow('#46a8ff', 0.9)
  const white = b.m('#ffffff')

  /* legs (pivots swing while walking) */
  const legs: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const lp = piv(0, 0.95, s * 0.26)
    put(cyl(r * 0.15, r * 0.13, r * 0.5, 6), skin, 0, -0.18, 0, [0, 0, 0], lp)
    put(cyl(r * 0.25, r * 0.2, r * 0.72, 8), boot, 0.01, -0.58, 0, [0, 0, 0], lp)
    put(tor(0.26, 0.09, 10), fur, 0.01, -0.28, 0, [PI / 2, 0, 0], lp)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2
      put(sph(r * 0.1, 4, 3), furShade, 0.01 + Math.cos(a) * 0.27, -0.3, Math.sin(a) * 0.27, [0, 0, 0], lp)
    }
    put(box(r * 0.62, r * 0.18, r * 0.34), boot, 0.14, -0.9, 0, [0, 0, 0], lp)
    put(sph(r * 0.18, 6, 5), fur, 0.44, -0.86, 0, [0, 0, 0], lp, [1.1, 0.7, 1])
    put(tor(0.22, 0.035, 10), gold, 0.01, -0.62, 0, [PI / 2, 0, 0], lp)
    put(tor(0.2, 0.035, 10), gold, 0.01, -0.74, 0, [PI / 2, 0, 0], lp)
    put(box(r * 0.04, r * 0.34, r * 0.04), blueLight, 0.22, -0.62, 0, [0, 0, 0], lp)
    legs.push(lp)
  }

  /* skirt: layered, scalloped, fur hem */
  put(cone(r * 0.9, r * 1.35, 12), blue, 0, 1.58, 0)
  put(cone(r * 0.78, r * 1.1, 12), blueDark, 0, 1.55, 0, [0, 0.3, 0], body)
  put(cyl(r * 0.94, r * 0.97, r * 0.17, 14), fur, 0, 0.9, 0)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2
    put(sph(r * 0.17, 5, 4), fur, Math.cos(a) * 0.96, 0.9, Math.sin(a) * 0.96, [0, 0, 0], body, [1, 0.8, 1])
    put(cone(r * 0.11, r * 0.34, 4), blueLight, Math.cos(a) * 0.82, 1.14, Math.sin(a) * 0.82, [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15 + PI], body)
  }
  put(box(r * 0.07, r * 1.2, r * 0.4), blueLight, 0.5, 1.55, 0, [0, 0, -0.55]) // front tabard
  put(box(r * 0.075, r * 1.2, r * 0.06), gold, 0.51, 1.55, 0.2, [0, 0, -0.55])
  put(box(r * 0.075, r * 1.2, r * 0.06), gold, 0.51, 1.55, -0.2, [0, 0, -0.55])

  /* upper body group (breathes) */
  const U = 1.9
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(cyl(r * 0.5, r * 0.6, r * 0.95, 10), blueDark, 0, 2.2, 0)
  up(cyl(r * 0.52, r * 0.52, r * 0.1, 10), blueLight, 0, 2.5, 0)
  up(sph(r * 0.22, 6, 5), blueLight, 0.4, 2.55, 0.2, [0, 0, 0], [0.8, 1, 1])
  up(sph(r * 0.22, 6, 5), blueLight, 0.4, 2.55, -0.2, [0, 0, 0], [0.8, 1, 1])
  for (let i = 0; i < 3; i++) up(box(r * 0.04, r * 0.05, r * 0.2), gold, 0.57 - i * 0.02, 2.05 + i * 0.13, 0)
  up(cyl(r * 0.6, r * 0.6, r * 0.16, 12), gold, 0, 1.8, 0) // belt
  up(cyl(r * 0.62, r * 0.62, r * 0.05, 12), white, 0, 1.92, 0)
  up(sph(r * 0.13, 6, 5), iceCore, 0.62, 1.8, 0)
  up(box(r * 0.2, r * 0.28, r * 0.1), blueDark, 0.2, 1.62, 0.6, [0, 0, 0]) // pouch
  up(sph(r * 0.06, 4, 3), gold, 0.31, 1.7, 0.6)
  for (const z of [-0.32, 0.32]) {
    up(box(r * 0.05, r * 0.7, r * 0.1), blueLight, 0.64, 1.3, z, [0, 0, -0.1]) // sash tails
    up(cone(r * 0.07, r * 0.16, 4), gold, 0.7, 0.9, z, [0, 0, PI - 0.1])
  }
  // fur mantle
  up(tor(0.54, 0.17, 14), fur, 0, 2.72, 0, [PI / 2, 0, 0])
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    up(sph(r * 0.15, 5, 4), furShade, Math.cos(a) * 0.55, 2.66, Math.sin(a) * 0.55)
  }
  up(sph(r * 0.1, 5, 4), iceCore, 0.62, 2.55, 0) // brooch
  up(tor(0.12, 0.03, 8), gold, 0.62, 2.55, 0, [0, PI / 2, 0])
  // cape (fluttering panels)
  const cape = piv(-0.48, 2.65 - U, 0, upper)
  const panels: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const pp = piv(-0.02 * i, 0, (i - 1) * 0.3, cape)
    put(box(r * 0.05, r * (1.55 - Math.abs(i - 1) * 0.3), r * 0.32), capeM, 0, -0.78, 0, [0, 0, 0], pp)
    put(box(r * 0.04, r * (1.3 - Math.abs(i - 1) * 0.3), r * 0.26), capeIn, 0.03, -0.7, 0, [0, 0, 0], pp)
    put(cone(r * 0.16, r * 0.3, 4), fur, 0, -1.55 + Math.abs(i - 1) * 0.3, 0, [0, 0, PI], pp)
    panels.push(pp)
  }
  put(box(r * 0.08, r * 0.12, r * 1.0), fur, 0, 0, 0, [0, 0, 0], cape)
  // head
  const head = piv(0.12, 3.18 - U, 0, upper)
  put(sph(r * 0.4, 10, 9), skin, 0, 0, 0, [0, 0, 0], head, [1, 1.02, 0.95])
  put(sph(r * 0.06, 4, 3), skin, 0.4, -0.04, 0, [0, 0, 0], head, [1, 1.3, 0.8]) // nose
  for (const s of [-1, 1]) {
    put(sph(r * 0.08, 6, 5), white, 0.35, 0.03, s * 0.17, [0, 0, 0], head, [0.5, 1, 1])
    put(sph(r * 0.06, 5, 4), eyeM, 0.4, 0.03, s * 0.17, [0, 0, 0], head, [0.5, 1.1, 1])
    put(box(r * 0.04, r * 0.03, r * 0.13), hairDark, 0.38, 0.13, s * 0.17, [s * 0.15, 0, 0], head) // brows
    put(sph(r * 0.06, 4, 3), blush, 0.34, -0.1, s * 0.25, [0, 0, 0], head, [0.5, 0.8, 1])
    put(cone(r * 0.05, r * 0.2, 4), skin, -0.02, 0.02, s * 0.4, [s * 1.4, 0, 0], head) // ear
  }
  put(box(r * 0.04, r * 0.03, r * 0.13), b.m('#d86a7a'), 0.39, -0.16, 0, [0, 0, 0], head) // lips
  // hair: cap, bangs, side locks
  put(sph(r * 0.44, 10, 9), hair, -0.12, 0.17, 0, [0, 0, 0], head, [1, 0.7, 1.08])
  put(cone(r * 0.2, r * 0.45, 5), hair, 0.3, 0.2, 0.12, [0, 0, -1.9], head)
  put(cone(r * 0.2, r * 0.45, 5), hair, 0.3, 0.2, -0.12, [0, 0, -1.9], head)
  put(cone(r * 0.12, r * 0.4, 5), hair, 0.36, 0.18, 0, [0, 0, -2.0], head)
  for (const s of [-1, 1]) {
    put(cone(r * 0.12, r * 0.9, 5), hair, 0.12, -0.38, s * 0.42, [s * 0.1, 0, PI + 0.1], head)
    put(sph(r * 0.1, 5, 4), ice, 0.14, -0.05, s * 0.45, [0, 0, 0], head) // hair gems
  }
  // fur-trimmed hood
  put(tor(0.47, 0.1, 14), fur, -0.06, 0.0, 0, [0, PI / 2, 0], head)
  put(cone(r * 0.46, r * 0.6, 8), blue, -0.35, 0.05, 0, [0, 0, 1.5], head)
  put(sph(r * 0.12, 5, 4), fur, -0.62, 0.0, 0, [0, 0, 0], head)
  // tiara
  put(tor(0.34, 0.03, 12), gold, 0.08, 0.34, 0, [PI / 2 - 0.35, 0, 0.0], head)
  put(cone(r * 0.07, r * 0.28, 4), ice, 0.3, 0.42, 0, [0, 0, -0.3], head)
  put(cone(r * 0.04, r * 0.18, 4), ice, 0.26, 0.4, 0.14, [0, 0, -0.3], head)
  put(cone(r * 0.04, r * 0.18, 4), ice, 0.26, 0.4, -0.14, [0, 0, -0.3], head)
  // long back hair strands (flutter)
  const strands: THREE.Group[] = []
  for (let i = 0; i < 5; i++) {
    const sp = piv(-0.3, 0.2, (i - 2) * 0.17, head)
    put(cone(r * (0.16 - Math.abs(i - 2) * 0.02), r * (1.9 - Math.abs(i - 2) * 0.28), 5), i % 2 ? hairDark : hair, 0, -0.9, 0, [0, 0, PI], sp)
    strands.push(sp)
  }
  // arms
  const arms: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const ap = piv(0, 2.62 - U, s * 0.62, upper)
    put(sph(r * 0.2, 6, 5), fur, 0, 0, 0, [0, 0, 0], ap)
    put(cyl(r * 0.12, r * 0.15, r * 0.5, 6), blueDark, 0, -0.28, 0, [0, 0, 0], ap)
    const ep = piv(0, -0.5, 0, ap)
    put(sph(r * 0.12, 5, 4), blueDark, 0, 0, 0, [0, 0, 0], ep)
    put(cone(r * 0.2, r * 0.5, 7), blueLight, 0, -0.3, 0, [0, 0, PI], ep) // bell sleeve
    put(tor(0.17, 0.07, 9), fur, 0, -0.52, 0, [PI / 2, 0, 0], ep)
    put(sph(r * 0.12, 6, 5), skin, 0, -0.66, 0, [0, 0, 0], ep)
    put(tor(0.15, 0.025, 8), gold, 0, -0.45, 0, [PI / 2, 0, 0], ep)
    arms.push(ap)
    ap.userData.ep = ep
  }
  arms[1].rotation.z = 0.55 // staff hand reaches forward
  arms[1].userData.ep.rotation.z = 0.5

  /* ice crystal staff (weapon pivot) */
  weapon.position.set(r * 0.4, r * 1.75, r * 0.85)
  put(cyl(r * 0.06, r * 0.07, r * 2.9, 6), wood, 0, 0.6, 0, [0, 0, 0], weapon)
  for (let i = 0; i < 6; i++) put(tor(0.085, 0.025, 8), i % 2 ? white : ice, 0, -0.5 + i * 0.28, 0, [PI / 2, 0, 0], weapon)
  put(cyl(r * 0.1, r * 0.1, r * 0.2, 8), gold, 0, 1.75, 0, [0, 0, 0], weapon)
  put(cone(r * 0.3, r * 1.15, 5), ice, 0, 2.7, 0, [0, 0, 0], weapon).castShadow = false
  put(cone(r * 0.3, r * 0.55, 5), ice, 0, 2.0, 0, [0, 0, PI], weapon).castShadow = false
  const core = put(sph(r * 0.18, 6, 5), iceCore, 0, 2.5, 0, [0, 0, 0], weapon)
  core.castShadow = false
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    put(cone(r * 0.12, r * 0.75, 4), ice, Math.cos(a) * 0.3, 2.2, Math.sin(a) * 0.3, [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7], weapon).castShadow = false
    put(cone(r * 0.04, r * 0.7, 4), gold, Math.cos(a) * 0.17, 1.95, Math.sin(a) * 0.17, [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], weapon)
  }
  const shards = piv(0, 2.5, 0, weapon)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    put(cone(r * 0.07, r * 0.3, 4), iceCore, Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55, [0, 0, 0], shards).castShadow = false
  }
  put(tor(0.2, 0.025, 10), gold, 0, 1.55, 0, [PI / 2, 0, 0], weapon)
  put(cone(r * 0.06, r * 0.25, 4), ice, 0, -0.95, 0, [0, 0, PI], weapon)
  body.add(weapon)

  /* floating ice shards around her */
  const spin = new THREE.Group()
  spin.position.y = r * 1.7
  const fl: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    const m = put(cone(r * 0.1, r * 0.4, 4), ice, Math.cos(a) * 1.5, 0.3, Math.sin(a) * 1.5, [0, 0, 0], spin)
    m.castShadow = false
    fl.push(m)
    put(cone(r * 0.1, r * 0.25, 4), ice, Math.cos(a) * 1.5, 0.1, Math.sin(a) * 1.5, [0, 0, PI], spin).castShadow = false
  }
  g.add(spin)

  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 11) : 0
    legs[0].rotation.z = w * 0.55
    legs[1].rotation.z = -w * 0.55
    arms[0].rotation.z = -w * 0.5 + Math.sin(t * 1.7) * 0.03
    arms[1].rotation.z = 0.55 + Math.sin(t * 1.7) * 0.03
    upper.position.y = r * (U + Math.sin(t * 2.2) * 0.02)
    upper.scale.y = 1 + Math.sin(t * 2.2) * 0.015
    const fv = st.moving ? 0.28 : 0.1
    cape.rotation.z = fv + Math.sin(t * 2.4) * 0.05
    panels.forEach((p, i) => (p.rotation.z = Math.sin(t * 3 + i * 1.2) * (st.moving ? 0.25 : 0.07)))
    strands.forEach((s, i) => {
      s.rotation.z = (st.moving ? 0.3 : 0.05) + Math.sin(t * 3.2 + i * 0.9) * 0.1
      s.rotation.x = Math.sin(t * 2.1 + i) * 0.06
    })
    shards.rotation.y = t * 2.2
    core.scale.setScalar(1 + Math.sin(t * 4) * 0.2 + (st.casting ? 0.4 : 0))
    fl.forEach((m, i) => (m.position.y = r * (0.3 + Math.sin(t * 1.6 + i * 1.7) * 0.35)))
  }
  return { group: g, weapon, body, spin, height: r * 3.7, mats: b.mats, update }
}

/* ------------------------------------------------------------------- Pugna */
function pugna(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const { b, g, body, weapon, glow, put, piv, tor } = scaffold(team, r)
  const skin = b.m('#b4cf9c')
  const skinDark = b.m('#82a46c')
  const robe = b.m('#35502c')
  const robeDark = b.m('#1f3321')
  const robeMid = b.m('#2b4325')
  const green = glow('#58ff68', 1.1)
  const greenSoft = glow('#38c04a', 0.7)
  const rune = glow('#7dff8a', 1.3)
  const bone = b.m('#e8e8d0')
  const dark = b.m('#0c120c')
  const wood = b.m('#3a2c1c')
  const tongue = b.m('#8a3a60')
  const purple = glow('#9a50ff', 0.9)
  const cloakM = b.m('#1a2a16', { side: THREE.DoubleSide })

  /* gnarled legs */
  const legs: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const lp = piv(0, 1.1, s * 0.3)
    put(cyl(r * 0.13, r * 0.1, r * 0.55, 5), skinDark, 0, -0.25, 0, [0, 0, 0.15], lp)
    put(sph(r * 0.12, 5, 4), skin, 0.05, -0.5, 0, [0, 0, 0], lp)
    put(cyl(r * 0.09, r * 0.07, r * 0.5, 5), skinDark, 0, -0.75, 0, [0, 0, -0.2], lp)
    put(box(r * 0.5, r * 0.1, r * 0.26), dark, 0.12, -1.0, 0, [0, 0, 0], lp)
    for (let i = 0; i < 3; i++) put(cone(r * 0.04, r * 0.26, 4), bone, 0.4, -1.0, (i - 1) * 0.09, [0, 0, -PI / 2], lp)
    put(cone(r * 0.04, r * 0.18, 4), bone, -0.14, -0.98, 0, [0, 0, PI / 2], lp)
    legs.push(lp)
  }

  /* tattered robe */
  put(cone(r * 1.1, r * 2.0, 10), robe, -0.05, 1.05, 0)
  put(cone(r * 0.95, r * 1.7, 9), robeMid, 0.02, 1.2, 0, [0, 0.4, 0])
  const strips: THREE.Group[] = []
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2
    const sp = piv(Math.cos(a) * 0.95, 0.55, Math.sin(a) * 0.95)
    sp.rotation.y = -a
    put(cone(r * 0.2, r * (0.65 + (i % 3) * 0.2), 4), i % 2 ? robeDark : robe, 0, -0.35, 0, [0, 0, PI], sp, [1, 1, 0.4])
    strips.push(sp)
  }
  // glowing front runes on robe
  for (let i = 0; i < 4; i++) {
    put(box(r * 0.03, r * 0.22, r * 0.08), rune, 1.0 - i * 0.04, 0.9 + i * 0.28, 0, [0, 0, -0.3 - i * 0.02])
    put(box(r * 0.03, r * 0.06, r * 0.28), rune, 1.0 - i * 0.04, 0.85 + i * 0.28, 0, [0, 0, -0.3 - i * 0.02])
  }
  for (const z of [-0.4, 0.4]) put(box(r * 0.03, r * 0.5, r * 0.04), greenSoft, 0.95, 1.2, z, [0, 0, -0.3])
  // ragged cloak behind
  const cloak = piv(-0.45, 2.7, 0)
  const cps: THREE.Group[] = []
  for (let i = 0; i < 4; i++) {
    const cp = piv(0, 0, (i - 1.5) * 0.3, cloak)
    put(box(r * 0.04, r * (1.9 - (i % 2) * 0.5), r * 0.3), cloakM, 0, -0.95, 0, [0, 0, 0], cp)
    put(cone(r * 0.15, r * 0.4, 3), cloakM, 0, -1.9 + (i % 2) * 0.5, 0, [0, 0, PI], cp)
    cps.push(cp)
  }
  // belt, skull buckle, bones
  put(cyl(r * 0.66, r * 0.7, r * 0.14, 10), dark, 0, 1.4, 0)
  put(sph(r * 0.17, 6, 5), bone, 0.7, 1.4, 0, [0, 0, 0], body, [0.7, 1, 1])
  put(box(r * 0.04, r * 0.06, r * 0.07), dark, 0.84, 1.42, 0.07)
  put(box(r * 0.04, r * 0.06, r * 0.07), dark, 0.84, 1.42, -0.07)
  for (let i = 0; i < 3; i++) {
    const a = 0.5 + i * 0.7
    put(cyl(r * 0.025, r * 0.025, r * 0.5, 4), bone, Math.cos(a) * 0.7, 1.12, Math.sin(a) * 0.7)
    put(sph(r * 0.06, 4, 3), bone, Math.cos(a) * 0.7, 0.85, Math.sin(a) * 0.7)
  }
  put(sph(r * 0.1, 5, 4), purple, -0.1, 1.4, 0.68)

  /* hunched upper body */
  const U = 1.4
  const hunch = piv(0, U, 0)
  hunch.rotation.z = -0.33
  const hp = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, hunch, sc)
  hp(cyl(r * 0.5, r * 0.68, r * 1.3, 8), robeDark, 0.1, 2.1, 0)
  for (let i = 0; i < 4; i++) {
    hp(tor(0.36, 0.03, 8), bone, 0.3, 1.8 + i * 0.2, 0, [0, PI / 2, 0], [1, 1, 0.6])
  }
  hp(sph(r * 0.2, 5, 4), greenSoft, 0.55, 2.2, 0)
  hp(sph(r * 0.52, 8, 7), robe, -0.35, 2.6, 0, [0, 0, 0], [1, 0.9, 1.15])
  for (let i = 0; i < 5; i++) hp(cone(r * (0.09 - i * 0.007), r * 0.5, 4), bone, -0.55 - i * 0.05, 2.95 - i * 0.3, 0, [0, 0, 1.0])
  // spiky pauldrons + arms
  const arms: THREE.Group[] = []
  for (const s of [-1, 1]) {
    hp(sph(r * 0.38, 7, 6), robe, 0.15, 2.65, s * 0.7)
    for (let i = 0; i < 3; i++) hp(cone(r * 0.12, r * 0.65, 5), dark, 0.05 + i * 0.12, 3.0 - i * 0.08, s * (0.8 + i * 0.08), [s * (0.5 + i * 0.2), 0, 0.3 - i * 0.2])
    hp(tor(0.34, 0.05, 8), bone, 0.15, 2.62, s * 0.7, [0, PI / 2, 0.2])
    const ap = piv(0.15, 2.6, s * 0.75, hunch)
    ap.position.y -= r * U
    put(cyl(r * 0.11, r * 0.09, r * 0.7, 5), skin, 0.1, -0.35, 0, [0, 0, 0], ap)
    put(sph(r * 0.1, 5, 4), skinDark, 0.1, -0.7, 0, [0, 0, 0], ap)
    const ep = piv(0.1, -0.7, 0, ap)
    put(cyl(r * 0.09, r * 0.07, r * 0.7, 5), skin, 0, -0.35, 0, [0, 0, 0], ep)
    put(tor(0.11, 0.04, 8), robeDark, 0, -0.1, 0, [PI / 2, 0, 0], ep)
    put(sph(r * 0.1, 5, 4), skinDark, 0, -0.72, 0, [0, 0, 0], ep, [1, 1.2, 1])
    for (let i = 0; i < 4; i++) put(cone(r * 0.025, r * 0.3, 4), bone, 0.06, -0.92, (i - 1.5) * 0.06, [0, 0, 0.2 + i * 0.05], ep)
    ap.userData.ep = ep
    arms.push(ap)
  }
  arms[1].rotation.z = 0.7
  arms[1].userData.ep.rotation.z = 0.5
  // palm orb in left hand
  const palmOrb = piv(0.4, -0.9, 0, arms[0].userData.ep)
  put(sph(r * 0.18, 6, 5), green, 0, 0, 0, [0, 0, 0], palmOrb).castShadow = false
  put(tor(0.26, 0.02, 10), rune, 0, 0, 0, [PI / 2, 0, 0], palmOrb).castShadow = false

  /* head: gaunt skull, big fanged jaw */
  const head = piv(0.78, 2.85 - U, 0, hunch)
  put(sph(r * 0.44, 9, 8), skin, 0, 0.05, 0, [0, 0, 0], head, [1.05, 1.0, 0.82])
  put(box(r * 0.3, r * 0.1, r * 0.6), skinDark, 0.28, 0.2, 0, [0, 0, -0.1], head) // brow
  for (const s of [-1, 1]) {
    put(sph(r * 0.11, 5, 4), dark, 0.38, 0.14, s * 0.19, [0, 0, 0], head)
    put(sph(r * 0.07, 5, 4), green, 0.42, 0.14, s * 0.19, [0, 0, 0], head)
    put(cone(r * 0.1, r * 0.5, 4), skinDark, -0.05, 0.12, s * 0.42, [s * 1.6, 0, 0.3], head) // ears
    put(cone(r * 0.09, r * 0.6, 5), bone, -0.08, 0.5, s * 0.28, [s * -0.35, 0, 0.55], head) // horns
    put(cone(r * 0.06, r * 0.4, 5), bone, -0.25, 0.9, s * 0.4, [s * -0.5, 0, 0.1], head)
    put(box(r * 0.04, r * 0.08, r * 0.03), dark, 0.45, -0.03, s * 0.06, [0, 0, 0], head) // nostrils
  }
  put(cone(r * 0.08, r * 0.5, 5), bone, -0.1, 0.52, 0, [0, 0, 0.35], head)
  put(box(r * 0.3, r * 0.2, r * 0.56), dark, 0.32, -0.2, 0, [0, 0, 0], head) // mouth cavity
  for (let i = 0; i < 5; i++) {
    const z = -0.24 + i * 0.12
    put(cone(r * 0.05, r * (0.2 + (i % 2) * 0.08), 4), bone, 0.5, -0.1, z, [0, 0, PI], head)
  }
  const jaw = piv(0.1, -0.22, 0, head)
  put(box(r * 0.3, r * 0.12, r * 0.55), skinDark, 0.22, -0.06, 0, [0, 0, 0], jaw)
  put(box(r * 0.16, r * 0.12, r * 0.3), tongue, 0.25, 0.02, 0, [0, 0, 0], jaw)
  for (let i = 0; i < 5; i++) put(cone(r * 0.05, r * (0.2 + (i % 2) * 0.06), 4), bone, 0.4, 0.07, -0.22 + i * 0.11, [0, 0, 0], jaw)
  put(cone(r * 0.1, r * 0.4, 5), skinDark, 0.38, -0.2, 0, [0, 0, PI + 0.3], jaw) // chin spike
  // hood behind head
  put(cone(r * 0.55, r * 0.9, 8), robeDark, -0.35, 0.2, 0, [0, 0, 1.25], head)
  put(tor(0.46, 0.06, 12), robe, -0.2, 0.05, 0, [0, PI / 2, 0], head)

  /* twisted staff with demon-skull crown */
  weapon.position.set(r * 0.95, r * 1.4, r * 0.85)
  for (let i = 0; i < 9; i++) put(box(r * 0.13, r * 0.4, r * 0.13), wood, Math.sin(i * 0.8) * 0.04, -0.6 + i * 0.4, 0, [0, i * 0.5, Math.sin(i) * 0.05], weapon)
  put(cyl(r * 0.06, r * 0.07, r * 3.4, 5), wood, 0, 0.9, 0, [0, 0, 0], weapon)
  for (let i = 0; i < 3; i++) put(tor(0.1, 0.03, 6), rune, 0, 0.5 + i * 0.55, 0, [PI / 2, 0, 0], weapon)
  const crown = piv(0, 2.8, 0, weapon)
  put(sph(r * 0.3, 8, 7), green, 0, 0, 0, [0, 0, 0], crown).castShadow = false
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    put(cone(r * 0.07, r * 0.65, 4), dark, Math.cos(a) * 0.33, -0.05, Math.sin(a) * 0.33, [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6], crown)
    put(cone(r * 0.04, r * 0.3, 4), bone, Math.cos(a) * 0.42, 0.4, Math.sin(a) * 0.42, [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], crown)
  }
  put(sph(r * 0.19, 6, 5), bone, 0, 0.62, 0, [0, 0, 0], weapon, [1, 1.1, 1]).position.y = r * 3.35
  put(sph(r * 0.05, 4, 3), green, 0.13, 3.55, 0.07, [0, 0, 0], weapon)
  put(sph(r * 0.05, 4, 3), green, 0.13, 3.55, -0.07, [0, 0, 0], weapon)
  for (let i = 0; i < 3; i++) {
    put(cyl(r * 0.015, r * 0.015, r * 0.45, 3), bone, 0.1, 2.25 - i * 0.05, (i - 1) * 0.1, [0, 0, 0], weapon)
    put(sph(r * 0.06, 4, 3), i === 1 ? purple : bone, 0.1, 1.98 - i * 0.05, (i - 1) * 0.1, [0, 0, 0], weapon)
  }
  put(cone(r * 0.06, r * 0.3, 4), dark, 0, -0.85, 0, [0, 0, PI], weapon)
  body.add(weapon)

  /* nether energy */
  const spin = new THREE.Group()
  spin.position.y = r * 1.4
  const orbs: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    const o = put(sph(r * 0.16, 6, 5), i % 2 ? purple : green, Math.cos(a) * 1.4, 0.4 + (i % 2) * 0.6, Math.sin(a) * 1.4, [0, 0, 0], spin)
    o.castShadow = false
    orbs.push(o)
  }
  put(tor(1.4, 0.025, 28), rune, 0, 0.6, 0, [PI / 2, 0, 0], spin).castShadow = false
  g.add(spin)

  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 10) : 0
    legs[0].rotation.z = w * 0.5
    legs[1].rotation.z = -w * 0.5
    arms[0].rotation.z = -w * 0.4 + Math.sin(t * 1.9) * 0.05
    arms[0].userData.ep.rotation.z = 0.3 + Math.sin(t * 2.3) * 0.08
    arms[1].rotation.z = 0.7 + Math.sin(t * 1.9 + 1) * 0.03
    hunch.rotation.z = -0.33 + Math.sin(t * 1.8) * 0.025 - (st.moving ? 0.08 : 0)
    hunch.position.y = r * (U + Math.sin(t * 3.6) * 0.015)
    jaw.rotation.z = -(st.casting || st.attacking ? 0.5 : 0.12 + Math.sin(t * 1.5) * 0.06)
    strips.forEach((s, i) => (s.rotation.z = Math.sin(t * 2.6 + i * 0.8) * (st.moving ? 0.22 : 0.08)))
    cloak.rotation.z = (st.moving ? 0.3 : 0.1) + Math.sin(t * 2) * 0.04
    cps.forEach((c, i) => (c.rotation.z = Math.sin(t * 3.1 + i * 1.1) * 0.12))
    crown.rotation.y = t * 1.4
    crown.scale.setScalar(1 + Math.sin(t * 5) * 0.08 + (st.casting ? 0.25 : 0))
    palmOrb.scale.setScalar(1 + Math.sin(t * 4.5) * 0.18)
    orbs.forEach((o, i) => (o.position.y = r * (0.4 + (i % 2) * 0.6 + Math.sin(t * 2 + i) * 0.25)))
  }
  return { group: g, weapon, body, spin, height: r * 3.5, mats: b.mats, update }
}

/* ---------------------------------------------------------------- Silencer */
function silencer(_id: string, _c1: string, _c2: string, team: number, r: number): Model {
  const { b, g, body, weapon, glow, put, piv, tor } = scaffold(team, r)
  const robe = b.m('#8a82a4')
  const robeMid = b.m('#6e6690')
  const robeDark = b.m('#4c4468')
  const cowl = b.m('#5e567a')
  const skin = b.m('#cfcad8')
  const beard = b.m('#ffffff', { emissive: new THREE.Color('#9a98a8'), emissiveIntensity: 0.5 })
  const beardShade = b.m('#d8d6e6', { emissive: new THREE.Color('#807e90'), emissiveIntensity: 0.4 })
  const purple = glow('#b070ff', 1.1)
  const purpleDeep = glow('#7a40d0', 0.8)
  const silver = b.m('#b8bcc8', { metalness: 0.6, roughness: 0.35 })
  const gold = b.m('#e0c060', { metalness: 0.6, roughness: 0.3 })
  const dark = b.m('#1a1626')
  const leather = b.m('#2e2640')
  const capeM = b.m('#3e3656', { side: THREE.DoubleSide })
  const capeIn = b.m('#6a4aa0', { side: THREE.DoubleSide })

  /* feet peeking under hem */
  const feet: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const fp = piv(0, 0.5, s * 0.3)
    put(cyl(r * 0.14, r * 0.12, r * 0.4, 6), dark, 0, -0.1, 0, [0, 0, 0], fp)
    put(box(r * 0.55, r * 0.16, r * 0.3), leather, 0.15, -0.35, 0, [0, 0, 0], fp)
    put(cone(r * 0.12, r * 0.3, 5), silver, 0.5, -0.33, 0, [0, 0, -PI / 2], fp)
    feet.push(fp)
  }

  /* layered robe */
  put(cyl(r * 0.56, r * 0.92, r * 2.5, 12), robe, 0, 1.3, 0)
  put(cyl(r * 0.5, r * 0.8, r * 2.0, 12), robeMid, 0, 1.3, 0, [0, 0.3, 0])
  put(cyl(r * 0.84, r * 0.92, r * 0.14, 14), robeDark, 0, 0.12, 0)
  put(tor(0.9, 0.045, 24), gold, 0, 0.2, 0, [PI / 2, 0, 0])
  put(tor(0.8, 0.03, 24), silver, 0, 0.45, 0, [PI / 2, 0, 0])
  const hem: THREE.Group[] = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2
    const hp = piv(Math.cos(a) * 0.86, 0.2, Math.sin(a) * 0.86)
    hp.rotation.y = -a
    put(cone(r * 0.2, r * 0.4, 4), i % 2 ? cowl : robeDark, 0, -0.1, 0, [0, 0, PI], hp, [1, 1, 0.45])
    hem.push(hp)
  }
  // tabard with gold borders and runes
  put(box(r * 0.08, r * 1.75, r * 0.4), robeDark, 0.76, 1.25, 0, [0, 0, -0.14])
  for (const z of [-0.22, 0.22]) put(box(r * 0.09, r * 1.75, r * 0.05), gold, 0.77, 1.25, z, [0, 0, -0.14])
  for (let i = 0; i < 4; i++) {
    put(box(r * 0.09, r * 0.2, r * 0.05), purple, 0.83 - i * 0.04, 0.55 + i * 0.35, 0, [0, 0, -0.14])
    put(box(r * 0.09, r * 0.05, r * 0.2), purple, 0.83 - i * 0.04, 0.62 + i * 0.35, 0, [0, 0, -0.14])
  }
  put(cone(r * 0.2, r * 0.34, 4), gold, 0.95, 0.3, 0, [0, 0, PI - 0.14])

  /* upper body */
  const U = 1.9
  const upper = piv(0, U, 0)
  const up = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
    put(geo, mt, x, y - U, z, rot, upper, sc)
  up(cyl(r * 0.5, r * 0.7, r * 1.15, 10), robe, 0, 2.2, 0)
  up(cyl(r * 0.62, r * 0.62, r * 0.14, 12), silver, 0, 1.78, 0)
  up(cyl(r * 0.64, r * 0.64, r * 0.05, 12), gold, 0, 1.88, 0)
  up(sph(r * 0.13, 6, 5), purple, 0.64, 1.78, 0)
  up(tor(0.16, 0.035, 8), gold, 0.64, 1.78, 0, [0, PI / 2, 0])
  up(box(r * 0.1, r * 1.3, r * 0.12), leather, 0.55, 2.35, 0, [0.0, 0, 0.85 * 0]) // chest strap
  up(box(r * 0.8, r * 0.1, r * 0.1), leather, 0.35, 2.3, 0, [0, 0.0, 0.0], [0.01, 1, 1])
  for (const z of [-0.5, 0.5]) up(box(r * 0.22, r * 0.3, r * 0.12), leather, 0.15, 1.55, z * 1.05) // pouches
  up(sph(r * 0.06, 4, 3), gold, 0.28, 1.6, 0.52)
  up(sph(r * 0.06, 4, 3), gold, 0.28, 1.6, -0.52)
  // silver gorget & mantle
  up(cone(r * 0.98, r * 0.7, 12), cowl, 0, 2.72, 0, [0, 0, 0], [1, 0.85, 1.1])
  up(tor(0.8, 0.05, 16), gold, 0, 2.55, 0, [PI / 2, 0, 0])
  up(tor(0.5, 0.09, 12), silver, 0, 2.78, 0, [PI / 2, 0, 0])
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    up(cone(r * 0.06, r * 0.22, 4), silver, Math.cos(a) * 0.52, 2.9, Math.sin(a) * 0.52)
  }
  // cape
  const cape = piv(-0.55, 2.7 - U, 0, upper)
  const panels: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const pp = piv(0, 0, (i - 1) * 0.38, cape)
    put(box(r * 0.06, r * 2.1, r * 0.38), capeM, 0, -1.05, 0, [0, 0, 0], pp)
    put(box(r * 0.05, r * 1.9, r * 0.26), capeIn, 0.03, -1.0, 0, [0, 0, 0], pp)
    put(box(r * 0.08, r * 0.06, r * 0.38), gold, 0, -2.0, 0, [0, 0, 0], pp)
    panels.push(pp)
  }
  put(box(r * 0.1, r * 0.14, r * 1.3), gold, 0, 0, 0, [0, 0, 0], cape)
  // arms with wide sleeves
  const arms: THREE.Group[] = []
  for (const s of [-1, 1]) {
    // pauldrons
    for (let i = 0; i < 3; i++) up(sph(r * (0.34 - i * 0.05), 7, 6), i === 1 ? silver : cowl, 0, 2.75 - i * 0.02 + i * 0.03, s * (0.7 + i * 0.05), [0, 0, 0], [1, 0.5 + i * 0.1, 1])
    up(cone(r * 0.1, r * 0.4, 5), silver, 0, 3.08, s * 0.72)
    up(tor(0.34, 0.03, 10), gold, 0, 2.72, s * 0.7, [PI / 2, 0, 0])
    const ap = piv(0, 2.65 - U, s * 0.78, upper)
    put(cyl(r * 0.12, r * 0.16, r * 0.5, 6), robeDark, 0, -0.25, 0, [0, 0, 0], ap)
    const ep = piv(0, -0.5, 0, ap)
    put(cone(r * 0.4, r * 0.85, 8), robe, 0.0, -0.4, 0, [0, 0, PI], ep)
    put(tor(0.3, 0.05, 10), silver, 0, -0.8, 0, [PI / 2, 0, 0], ep)
    put(tor(0.3, 0.03, 10), gold, 0, -0.7, 0, [PI / 2, 0, 0], ep)
    put(sph(r * 0.12, 6, 5), skin, 0, -0.92, 0, [0, 0, 0], ep)
    for (let i = 0; i < 3; i++) put(cone(r * 0.025, r * 0.15, 4), skin, 0.04, -1.04, (i - 1) * 0.05, [0, 0, 0], ep)
    ap.userData.ep = ep
    arms.push(ap)
  }
  arms[1].rotation.z = 0.35
  arms[1].userData.ep.rotation.z = 0.5

  // head: pointed cowl, glowing eyes, long beard
  const head = piv(0, 3.08 - U, 0, upper)
  put(sph(r * 0.5, 10, 9), cowl, -0.05, 0, 0, [0, 0, 0], head, [1.05, 1.1, 1])
  put(cone(r * 0.46, r * 1.2, 8), cowl, -0.12, 0.8, 0, [0, 0, 0.12], head)
  put(cone(r * 0.2, r * 0.5, 6), robeDark, -0.3, 1.38, 0, [0, 0, 0.55], head)
  put(tor(0.5, 0.045, 14), gold, 0.0, 0.12, 0, [0, PI / 2, 0.0], head, [1, 1, 1])
  put(sph(r * 0.34, 8, 7), dark, 0.2, -0.04, 0, [0, 0, 0], head, [0.7, 1, 0.95])
  put(sph(r * 0.3, 8, 7), skin, 0.36, -0.04, 0, [0, 0, 0], head, [0.7, 1, 0.9])
  put(box(r * 0.07, r * 0.2, r * 0.07), skin, 0.56, -0.12, 0, [0, 0, 0.1], head) // nose
  for (const s of [-1, 1]) {
    put(box(r * 0.06, r * 0.04, r * 0.16), dark, 0.5, 0.075, s * 0.12, [s * 0.2, 0, 0], head)
    put(sph(r * 0.06, 5, 4), purple, 0.53, 0.03, s * 0.12, [0, 0, 0], head)
    put(cone(r * 0.05, r * 0.7, 5), purpleDeep, 0.46, 0.03, s * 0.12, [0, 0, -PI / 2], head, [1, 0.3, 1]).castShadow = false
  }
  put(sph(r * 0.08, 5, 4), purple, 0.34, 0.5, 0, [0, 0, 0], head, [0.5, 1, 1]) // forehead sigil
  put(tor(0.1, 0.02, 8), gold, 0.36, 0.5, 0, [0, PI / 2, 0], head)
  put(box(r * 0.16, r * 0.08, r * 0.4), beard, 0.55, -0.2, 0, [0, 0, 0.1], head) // moustache
  put(cone(r * 0.1, r * 0.5, 5), beard, 0.62, -0.28, 0.25, [0, 0, 1.9], head)
  put(cone(r * 0.1, r * 0.5, 5), beard, 0.62, -0.28, -0.25, [0, 0, 1.9], head)
  // beard layers (sway)
  const beardG = piv(0.5, -0.1, 0, head)
  put(cone(r * 0.34, r * 2.0, 9), beard, 0.08, -1.0, 0, [0, 0, PI + 0.08], beardG, [0.8, 1, 1.1])
  const bl: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const bp = piv(0.06, -0.2, (i - 1) * 0.22, beardG)
    put(cone(r * 0.2, r * (1.9 - Math.abs(i - 1) * 0.3), 6), beardShade, 0, -0.95, 0, [0, 0, PI], bp)
    put(tor(0.17, 0.03, 8), silver, 0, -0.9, 0, [PI / 2, 0, 0], bp)
    bl.push(bp)
  }
  put(tor(0.3, 0.04, 10), gold, 0.0, -1.3, 0, [PI / 2, 0, 0], beardG)

  /* staff with ring crown */
  weapon.position.set(r * 0.5, r * 1.55, r * 1.05)
  put(cyl(r * 0.07, r * 0.08, r * 3.1, 6), b.m('#2a2236'), 0, 0.75, 0, [0, 0, 0], weapon)
  for (let i = 0; i < 4; i++) put(tor(0.1, 0.03, 8), i % 2 ? gold : silver, 0, -0.3 + i * 0.5, 0, [PI / 2, 0, 0], weapon)
  const crown = piv(0, 2.45, 0, weapon)
  put(sph(r * 0.26, 9, 7), purple, 0, 0, 0, [0, 0, 0], crown).castShadow = false
  const ringA = new THREE.Group()
  crown.add(ringA)
  put(tor(0.42, 0.045, 14), silver, 0, 0, 0, [0, PI / 2, 0], ringA)
  put(tor(0.42, 0.045, 14), gold, 0, 0, 0, [0, 0, 0], ringA)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    put(cone(r * 0.07, r * 0.3, 4), silver, Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46, [Math.sin(a) * 1.5, 0, -Math.cos(a) * 1.5], crown)
  }
  put(cone(r * 0.12, r * 0.55, 4), silver, 0, 0.5, 0, [0, 0, 0], crown)
  put(cone(r * 0.08, r * 0.4, 4), silver, 0, -0.42, 0, [0, 0, PI], crown)
  for (let i = 0; i < 2; i++) {
    put(cyl(r * 0.015, r * 0.015, r * 0.6, 3), purpleDeep, 0.0, 1.3, (i ? 1 : -1) * 0.08, [0, 0, 0], weapon)
    put(cone(r * 0.05, r * 0.14, 4), gold, 0.0, 0.98, (i ? 1 : -1) * 0.08, [0, 0, PI], weapon)
  }
  put(cone(r * 0.06, r * 0.3, 4), silver, 0, -0.9, 0, [0, 0, PI], weapon)
  body.add(weapon)

  /* floating rune pillars / glaives orbiting */
  const spin = new THREE.Group()
  spin.position.y = r * 1.9
  const glaives: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2
    const gp = piv(Math.cos(a) * 1.55, 0.3, Math.sin(a) * 1.55, spin)
    put(box(r * 0.12, r * 0.8, r * 0.12), silver, 0, 0, 0, [0, 0, 0], gp)
    put(cone(r * 0.12, r * 0.4, 4), purple, 0, 0.6, 0, [0, 0, 0], gp).castShadow = false
    put(cone(r * 0.12, r * 0.4, 4), purple, 0, -0.6, 0, [0, 0, PI], gp).castShadow = false
    put(box(r * 0.14, r * 0.08, r * 0.14), gold, 0, 0.15, 0, [0, 0, 0], gp)
    put(box(r * 0.14, r * 0.08, r * 0.14), gold, 0, -0.15, 0, [0, 0, 0], gp)
    put(sph(r * 0.07, 5, 4), purple, 0.1, 0, 0, [0, 0, 0], gp).castShadow = false
    glaives.push(gp)
  }
  put(tor(1.55, 0.02, 32), purpleDeep, 0, 0.3, 0, [PI / 2, 0, 0], spin).castShadow = false
  g.add(spin)

  const update: Model['update'] = (t, st) => {
    const w = st.moving ? Math.sin(t * 9) : 0
    feet[0].rotation.z = w * 0.5
    feet[1].rotation.z = -w * 0.5
    upper.position.y = r * (U + Math.sin(t * 1.8) * 0.03)
    arms[0].rotation.z = -w * 0.3 + Math.sin(t * 1.5) * 0.03
    arms[1].rotation.z = 0.35 + Math.sin(t * 1.5 + 1) * 0.03
    cape.rotation.z = (st.moving ? 0.25 : 0.07) + Math.sin(t * 2) * 0.04
    panels.forEach((p, i) => (p.rotation.z = Math.sin(t * 2.6 + i * 1.3) * (st.moving ? 0.2 : 0.06)))
    hem.forEach((h, i) => (h.rotation.z = Math.sin(t * 2.2 + i * 0.7) * 0.08))
    beardG.rotation.z = Math.sin(t * 1.6) * 0.04 + (st.moving ? -0.12 : 0)
    bl.forEach((p, i) => (p.rotation.z = Math.sin(t * 2.4 + i * 1.1) * 0.06))
    crown.rotation.y = t * 1.6
    ringA.rotation.x = t * 1.3
    crown.scale.setScalar(1 + Math.sin(t * 3.5) * 0.08 + (st.casting ? 0.3 : 0))
    glaives.forEach((gp, i) => {
      gp.position.y = r * (0.3 + Math.sin(t * 1.8 + i * 2.1) * 0.25)
      gp.rotation.y = t * 2.5
    })
  }
  return { group: g, weapon, body, spin, height: r * 4.1, mats: b.mats, update }
}

/** 3D builders for the g3 heroes, keyed by hero id. */
export const MODELS_G3: Record<string, HeroModelFn> = {
  crystal_maiden: crystalMaiden,
  pugna,
  silencer,
}
