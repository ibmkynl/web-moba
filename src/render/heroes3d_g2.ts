import * as THREE from 'three'
import { type HeroModelFn, Model, box, cone, cyl, makeScaffold, sph } from './modelkit'

const PI = Math.PI

/** Shared scaffolding plus a smoothed 0..1 "moving" factor. */
function scaffold(team: number, r: number) {
  const s = makeScaffold(team, r)
  /** smoothed 0..1 "moving" factor */
  const mover = () => {
    let k = 0
    let last = 0
    return (t: number, moving: boolean) => {
      const dt = Math.min(0.1, Math.max(0, t - last))
      last = t
      k += ((moving ? 1 : 0) - k) * Math.min(1, dt * 8)
      return k
    }
  }
  return { ...s, grp: s.piv, mover }
}

const torus = (R: number, tube: number, arc = PI * 2, seg = 12) => new THREE.TorusGeometry(R, tube, 5, seg, arc)

/* ------------------------------------------------------------- Windranger */

const windranger: HeroModelFn = (id, color, color2, team, r) => {
  const { b, g, body, weapon, glow, metal, put, grp, mover } = scaffold(team, r)
  const skin = b.m('#f0cfae')
  const skinSh = b.m('#e0b894')
  const dress = b.m(color)
  const dressDark = b.m(color2)
  const dressLight = b.m('#a8e08a')
  const white = b.m('#f4f2e6')
  const hair = b.m('#f2d466')
  const hairDark = b.m('#d8b244')
  const gold = metal('#d8b858')
  const leather = b.m('#5a3e22')
  const leatherDk = b.m('#3a2814')
  const gem = glow('#60f0b8', 1.1)
  const eyeM = glow('#2fe0b0', 0.9)
  const wood = b.m('#7a5a2a')

  const torso = grp(0, 0, 0)

  // ---- legs (pivot at hip)
  const legs: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const leg = grp(0, 1.15, s * 0.26, torso)
    legs.push(leg)
    put(cyl(r * 0.15, r * 0.12, r * 0.55, 7), skin, 0, -0.28, 0, [0, 0, 0], leg)
    put(sph(r * 0.12, 6, 5), skinSh, 0.03, -0.55, 0, [0, 0, 0], leg)
    put(cyl(r * 0.18, r * 0.14, r * 0.62, 7), leather, 0, -0.78, 0, [0, 0, 0], leg)
    put(cyl(r * 0.2, r * 0.2, r * 0.07, 7), white, 0, -0.5, 0, [0, 0, 0], leg)
    put(cyl(r * 0.2, r * 0.2, r * 0.04, 7), gold, 0, -0.45, 0, [0, 0, 0], leg)
    put(box(r * 0.5, r * 0.12, r * 0.26), leatherDk, 0.1, -1.08, 0, [0, 0, 0], leg)
    put(cone(r * 0.13, r * 0.22, 5), leatherDk, 0.38, -1.05, 0, [0, 0, -PI / 2], leg)
    put(box(r * 0.06, r * 0.4, r * 0.05), gold, 0.16, -0.78, 0, [0, 0, 0], leg)
    put(sph(r * 0.06, 5, 4), gem, 0.18, -0.6, 0, [0, 0, 0], leg)
  }

  // ---- skirt: base + layered leaf petals
  put(cone(r * 0.8, r * 0.8, 10), dress, 0, 1.25, 0)
  put(cyl(r * 0.5, r * 0.84, r * 0.05, 12), white, 0, 0.9, 0)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    const pg = grp(0, 1.38, 0, torso)
    pg.rotation.y = -a
    put(cyl(r * 0.04, r * 0.2, r * 0.85, 4), i % 2 ? dress : dressLight, 0.58, -0.4, 0, [0, 0, 0.28], pg, [1, 1, 0.55])
    put(cyl(r * 0.02, r * 0.1, r * 0.4, 4), white, 0.66, -0.62, 0, [0, 0, 0.28], pg, [1, 1, 0.5])
  }
  // ---- waist, bodice
  put(cyl(r * 0.38, r * 0.34, r * 0.5, 8), dress, 0, 1.62, 0, [0, 0, 0], torso)
  put(cyl(r * 0.42, r * 0.38, r * 0.5, 8), dressDark, 0, 2.0, 0, [0, 0, 0], torso)
  put(cyl(r * 0.44, r * 0.44, r * 0.09, 9), gold, 0, 1.42, 0, [0, 0, 0], torso)
  put(box(r * 0.1, r * 0.24, r * 0.2), gold, 0.43, 1.42, 0, [0, 0, 0], torso)
  put(sph(r * 0.07, 5, 4), gem, 0.5, 1.42, 0, [0, 0, 0], torso)
  put(box(r * 0.06, r * 0.7, r * 0.3), white, 0.4, 1.95, 0, [0, 0, 0.05], torso)
  put(sph(r * 0.18, 6, 5), white, 0.3, 2.18, 0.14, [0, 0, 0], torso)
  put(sph(r * 0.18, 6, 5), white, 0.3, 2.18, -0.14, [0, 0, 0], torso)
  put(torus(r * 0.36, r * 0.04, PI * 2, 10), gold, 0.0, 2.38, 0, [PI / 2, 0, 0], torso)
  put(torus(r * 0.4, r * 0.05, PI * 2, 10), dressLight, 0.0, 2.32, 0, [PI / 2, 0, 0], torso, [1, 1, 0.8])
  for (const s of [-1, 1]) {
    put(box(r * 0.2, r * 0.28, r * 0.2), leather, 0.0, 1.32, s * 0.5, [0, 0, 0], torso)
    put(box(r * 0.22, r * 0.07, r * 0.22), gold, 0.0, 1.46, s * 0.5, [0, 0, 0], torso)
  }
  // diagonal strap
  put(box(r * 0.05, r * 1.0, r * 0.1), leatherDk, 0.1, 2.0, 0.0, [0.5, 0, 0.25], torso)

  // ---- arms. back/off arm swings; front arm holds the bow
  const mkArm = (s: number, parentY = 2.3) => {
    const sh = grp(0, parentY, s * 0.5, torso)
    put(sph(r * 0.2, 6, 5), dressDark, 0, 0.0, s * 0.02, [0, 0, 0], sh)
    put(cone(r * 0.17, r * 0.34, 5), dressLight, 0.0, 0.2, s * 0.06, [0, 0, 0], sh)
    return sh
  }
  const armL = mkArm(-1)
  put(cyl(r * 0.1, r * 0.08, r * 0.55, 6), skin, 0.0, -0.32, 0, [0, 0, 0], armL)
  const foreL = grp(0, -0.6, 0, armL)
  put(cyl(r * 0.09, r * 0.07, r * 0.5, 6), skin, 0.0, -0.24, 0, [0, 0, 0], foreL)
  put(cyl(r * 0.13, r * 0.11, r * 0.3, 6), dressLight, 0.0, -0.2, 0, [0, 0, 0], foreL)
  put(cone(r * 0.1, r * 0.3, 4), white, 0.1, -0.38, 0, [0, 0, 0.3], foreL, [0.6, 1, 1])
  put(sph(r * 0.1, 6, 5), skin, 0, -0.55, 0, [0, 0, 0], foreL)
  const armR = mkArm(1)
  armR.rotation.z = -1.3
  armR.rotation.x = -0.15
  put(cyl(r * 0.1, r * 0.08, r * 0.6, 6), skin, 0.0, -0.32, 0, [0, 0, 0], armR)
  put(cyl(r * 0.13, r * 0.11, r * 0.3, 6), dressLight, 0.0, -0.5, 0, [0, 0, 0], armR)
  put(sph(r * 0.1, 6, 5), skin, 0.0, -0.78, 0, [0, 0, 0], armR)
  put(cone(r * 0.1, r * 0.3, 4), white, 0.1, -0.55, 0, [0, 0, 0.3], armR, [0.6, 1, 1])

  // ---- cape: three flutter panels
  const capes: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const z = (i - 1) * 0.3
    const cg = grp(-0.32, 2.35, z, torso)
    capes.push(cg)
    put(box(r * 0.05, r * 1.55, r * 0.3), dressDark, -0.04, -0.78, 0, [0, 0, 0], cg)
    put(box(r * 0.03, r * 1.4, r * 0.22), white, 0.0, -0.74, 0, [0, 0, 0], cg)
    put(cone(r * 0.16, r * 0.4, 4), i === 1 ? dressDark : dress, -0.04, -1.7, 0, [0, 0, PI], cg, [1, 1, 0.5])
    put(cyl(r * 0.05, r * 0.05, r * 0.3, 5), gold, -0.04, 0.0, 0, [PI / 2, 0, 0], cg)
  }
  put(sph(r * 0.09, 5, 4), gem, -0.36, 2.35, 0, [0, 0, 0], torso)

  // ---- head
  const head = grp(0.06, 2.85, 0, torso)
  put(cyl(r * 0.1, r * 0.12, r * 0.28, 6), skin, -0.02, -0.35, 0, [0, 0, 0], head)
  put(sph(r * 0.33, 10, 8), skin, 0.04, 0.0, 0, [0, 0, 0], head, [0.95, 1.08, 0.92])
  put(sph(r * 0.1, 5, 4), skin, 0.33, -0.05, 0, [0, 0, 0], head, [1, 0.9, 0.8])
  put(sph(r * 0.15, 5, 4), skinSh, 0.28, -0.2, 0, [0, 0, 0], head, [0.7, 0.4, 1.1])
  for (const s of [-1, 1]) {
    put(sph(r * 0.065, 6, 5), white, 0.31, 0.04, s * 0.14, [0, 0, 0], head, [0.6, 0.9, 1])
    put(sph(r * 0.045, 5, 4), eyeM, 0.35, 0.04, s * 0.14, [0, 0, 0], head)
    put(box(r * 0.04, r * 0.03, r * 0.16), hairDark, 0.33, 0.14, s * 0.14, [s * 0.2, 0, 0.2], head)
    // pointed elven ears
    put(cone(r * 0.07, r * 0.4, 4), skin, -0.04, 0.12, s * 0.38, [s * 1.2, 0, 0.5], head)
    put(sph(r * 0.035, 4, 3), gold, -0.02, -0.04, s * 0.34, [0, 0, 0], head)
  }
  // hair: cap, fringe, side locks
  put(sph(r * 0.37, 9, 8), hair, -0.03, 0.14, 0, [0, 0, 0], head, [1.02, 0.85, 1.06])
  put(box(r * 0.1, r * 0.15, r * 0.5), hair, 0.3, 0.26, 0, [0, 0, -0.3], head)
  put(box(r * 0.08, r * 0.2, r * 0.2), hairDark, 0.34, 0.14, 0.18, [0, 0, -0.1], head)
  put(box(r * 0.08, r * 0.2, r * 0.2), hairDark, 0.34, 0.14, -0.18, [0, 0, -0.1], head)
  for (const s of [-1, 1]) {
    put(cone(r * 0.1, r * 0.7, 5), hair, 0.0, -0.3, s * 0.34, [0, 0, PI - 0.1], head)
  }
  // circlet
  put(torus(r * 0.36, r * 0.03, PI * 2, 12), gold, -0.01, 0.2, 0, [PI / 2, 0, 0], head)
  put(sph(r * 0.07, 5, 4), gem, 0.35, 0.2, 0, [0, 0, 0], head)
  put(cone(r * 0.06, r * 0.24, 4), gold, 0.33, 0.33, 0, [0, 0, -0.2], head)
  for (const s of [-1, 1]) put(cone(r * 0.05, r * 0.3, 4), gold, 0.0, 0.34, s * 0.25, [s * 0.5, 0, 0.1], head)
  // long ponytail: swaying chain
  const tail: THREE.Group[] = []
  let par: THREE.Object3D = head
  const tp = grp(-0.34, 0.2, 0, head)
  par = tp
  put(sph(r * 0.1, 5, 4), gem, 0, 0, 0, [0, 0, 0], tp)
  put(torus(r * 0.1, r * 0.03, PI * 2, 8), gold, 0, 0, 0, [0, PI / 2, 0], tp)
  for (let i = 0; i < 5; i++) {
    const seg = grp(0, i === 0 ? -0.05 : -0.42, 0, par)
    tail.push(seg)
    const w0 = 0.15 - i * 0.02
    put(cyl(r * w0, r * (w0 - 0.02), r * 0.46, 6), i % 2 ? hairDark : hair, 0, -0.22, 0, [0, 0, 0], seg)
    par = seg
  }
  put(cone(r * 0.09, r * 0.4, 5), hair, 0, -0.42, 0, [0, 0, PI], par)

  // ---- quiver on back
  put(cyl(r * 0.13, r * 0.11, r * 0.95, 7), leather, -0.42, 2.0, 0.22, [0, 0, -0.35], torso)
  put(torus(r * 0.13, r * 0.025, PI * 2, 8), gold, -0.28, 2.42, 0.22, [PI / 2 - 0.35, 0, 0], torso)
  put(cyl(r * 0.135, r * 0.135, r * 0.07, 7), gold, -0.5, 1.6, 0.22, [0, 0, -0.35], torso)
  for (let i = 0; i < 4; i++) {
    put(cyl(r * 0.015, r * 0.015, r * 0.4, 4), white, -0.34 - i * 0.03, 2.65 + i * 0.01, 0.14 + i * 0.07, [0, 0, -0.35], torso)
    put(cone(r * 0.06, r * 0.12, 3), i % 2 ? dress : white, -0.28 - i * 0.03, 2.88 + i * 0.01, 0.14 + i * 0.07, [0, 0, -0.35], torso, [1, 1, 0.3])
  }

  // ---- bow (weapon pivot, grip at the front-right hand)
  weapon.position.set(r * 0.35, r * 1.72, r * 0.52)
  const limb = torus(r * 1.0, r * 0.06, PI, 16)
  put(limb, wood, 0, 0, 0, [0, 0, -PI / 2], weapon)
  put(limb, gold, 0.0, 0.0, 0, [0, 0, -PI / 2], weapon, [1.0, 1.0, 0.35]).scale.set(1.01, 1.01, 0.3)
  put(cyl(r * 0.09, r * 0.09, r * 0.4, 7), leather, 1.0, 0, 0, [0, 0, 0], weapon)
  put(torus(r * 0.09, r * 0.02, PI * 2, 8), gold, 1.0, 0.22, 0, [PI / 2, 0, 0], weapon)
  put(torus(r * 0.09, r * 0.02, PI * 2, 8), gold, 1.0, -0.22, 0, [PI / 2, 0, 0], weapon)
  put(sph(r * 0.08, 5, 4), gem, 1.1, 0, 0, [0, 0, 0], weapon)
  for (const s of [-1, 1]) {
    put(cone(r * 0.08, r * 0.3, 5), gold, 0.0, s * 1.02, 0, [0, 0, s > 0 ? 0 : PI], weapon)
    put(cone(r * 0.07, r * 0.4, 4), dressLight, 0.4, s * 0.78, 0, [0, 0, s > 0 ? -0.9 : PI + 0.9], weapon, [1, 1, 0.4])
    put(cone(r * 0.06, r * 0.3, 4), dress, 0.82, s * 0.5, 0, [0, 0, s > 0 ? -0.4 : PI + 0.4], weapon, [1, 1, 0.4])
  }
  put(cyl(r * 0.014, r * 0.014, r * 2.0, 4), white, 0.0, 0.0, 0, [0, 0, 0], weapon)
  // nocked arrow
  put(cyl(r * 0.022, r * 0.022, r * 1.3, 4), white, 0.65, 0.0, 0, [0, 0, PI / 2], weapon)
  put(cone(r * 0.07, r * 0.24, 4), gold, 1.4, 0.0, 0, [0, 0, -PI / 2], weapon)
  for (let i = 0; i < 3; i++) put(cone(r * 0.06, r * 0.2, 3), i === 0 ? dress : white, 0.08 + i * 0.07, 0.0, 0, [0, 0, -PI / 2], weapon, [1, 1, 0.3])
  body.add(weapon)

  const mv = mover()
  const update: Model['update'] = (t, st) => {
    const k = mv(t, st.moving)
    const sw = Math.sin(t * 10) * 0.75 * k
    legs[0].rotation.z = sw
    legs[1].rotation.z = -sw
    armL.rotation.z = -sw * 0.8
    foreL.rotation.z = 0.15 + (k > 0.1 ? 0.35 : 0) * k
    torso.position.y = Math.sin(t * 2.2) * r * 0.025 + (k > 0.1 ? Math.abs(Math.sin(t * 10)) * r * 0.04 * k : 0)
    capes.forEach((c, i) => {
      c.rotation.z = 0.2 + Math.sin(t * 2.6 + i * 0.9) * 0.05 + k * (0.28 + Math.sin(t * 9 + i) * 0.08)
      c.rotation.x = Math.sin(t * 1.9 + i * 1.7) * 0.06
    })
    tail.forEach((s, i) => {
      s.rotation.z = -0.12 - k * 0.22 + Math.sin(t * 3 - i * 0.7) * 0.1
      s.rotation.x = Math.sin(t * 2.3 - i * 0.6) * 0.07
    })
    head.rotation.z = Math.sin(t * 1.3) * 0.02
    gem.emissiveIntensity = 0.9 + Math.sin(t * 3) * 0.25 + (st.casting ? 0.6 : 0)
  }
  return { group: g, weapon, body, height: r * 3.5, mats: b.mats, update }
}

/* ------------------------------------------------------------- Anti-Mage */

const antimage: HeroModelFn = (id, color, color2, team, r) => {
  const { b, g, body, weapon, glow, metal, put, grp, mover } = scaffold(team, r)
  const skin = b.m('#5a7ad0')
  const skinDark = b.m('#3e58a8')
  const robe = b.m('#262270')
  const robeLight = b.m(color)
  const robeMid = b.m('#2e2a6a')
  const purple = b.m('#5a3a98')
  const gold = metal('#c8a850')
  const bone = b.m('#e8e4d4')
  const steel = metal('#cfd8e8')
  const dark = b.m('#14142a')
  const wrap = b.m('#8a7ab0')
  const rune = glow('#b070ff', 1.2)
  const eyeM = glow('#fff6a0', 1.3)
  const edge = glow('#9ad0ff', 0.9)
  const grip = b.m('#3a2a1a')
  const torso = grp(0, 0, 0)

  // legs: sandals + wraps
  const legs: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const leg = grp(0, 1.0, s * 0.28, torso)
    legs.push(leg)
    put(cyl(r * 0.17, r * 0.14, r * 0.55, 7), skinDark, 0, -0.28, 0, [0, 0, 0], leg)
    put(sph(r * 0.13, 6, 5), skinDark, 0.02, -0.55, 0, [0, 0, 0], leg)
    put(cyl(r * 0.17, r * 0.13, r * 0.4, 7), wrap, 0, -0.75, 0, [0, 0, 0], leg)
    for (let i = 0; i < 3; i++) put(torus(r * 0.15, r * 0.02, PI * 2, 8), dark, 0, -0.62 - i * 0.12, 0, [PI / 2, 0, 0], leg)
    put(box(r * 0.55, r * 0.12, r * 0.28), dark, 0.1, -0.94, 0, [0, 0, 0], leg)
    put(cone(r * 0.13, r * 0.2, 5), dark, 0.4, -0.92, 0, [0, 0, -PI / 2], leg)
    put(box(r * 0.08, r * 0.04, r * 0.3), gold, 0.0, -0.88, 0, [0, 0, 0], leg)
  }
  // robe skirt with front/back panels and glowing hem
  put(cone(r * 1.0, r * 1.55, 10), robe, 0, 0.9, 0, [0, 0, 0], torso)
  put(torus(r * 0.98, r * 0.05, PI * 2, 14), gold, 0, 0.14, 0, [PI / 2, 0, 0], torso)
  put(torus(r * 0.95, r * 0.03, PI * 2, 14), rune, 0, 0.22, 0, [PI / 2, 0, 0], torso)
  const panels: THREE.Group[] = []
  for (const sx of [1, -1]) {
    const pg = grp(sx * 0.15, 1.5, 0, torso)
    panels.push(pg)
    put(box(r * 0.06, r * 1.35, r * 0.5), sx > 0 ? robeMid : robeLight, sx * 0.62, -0.68, 0, [0, 0, -sx * 0.12], pg)
    put(box(r * 0.07, r * 1.25, r * 0.08), gold, sx * 0.63, -0.66, 0.17, [0, 0, -sx * 0.12], pg)
    put(box(r * 0.07, r * 1.25, r * 0.08), gold, sx * 0.63, -0.66, -0.17, [0, 0, -sx * 0.12], pg)
    put(cone(r * 0.18, r * 0.3, 4), purple, sx * 0.68, -1.44, 0, [0, 0, PI], pg, [1, 1, 1.4])
    put(sph(r * 0.06, 5, 4), rune, sx * 0.64, -0.5, 0, [0, 0, 0], pg)
  }
  // torso: robe top, sash, chest
  put(cyl(r * 0.5, r * 0.6, r * 0.9, 9), robe, 0, 1.95, 0, [0, 0, 0], torso)
  put(cyl(r * 0.62, r * 0.62, r * 0.2, 9), purple, 0, 1.55, 0, [0, 0, 0], torso)
  put(torus(r * 0.63, r * 0.03, PI * 2, 12), gold, 0, 1.66, 0, [PI / 2, 0, 0], torso)
  put(torus(r * 0.63, r * 0.03, PI * 2, 12), gold, 0, 1.44, 0, [PI / 2, 0, 0], torso)
  put(sph(r * 0.14, 6, 5), gold, 0.62, 1.55, 0, [0, 0, 0], torso)
  put(sph(r * 0.09, 6, 5), rune, 0.72, 1.55, 0, [0, 0, 0], torso)
  put(box(r * 0.1, r * 0.55, r * 0.34), skin, 0.5, 2.1, 0, [0, 0, 0.1], torso)
  for (let i = 0; i < 3; i++) put(box(r * 0.03, r * 0.04, r * 0.28 - i * 0.04 * r / r), rune, 0.56, 1.95 + i * 0.14, 0, [0, 0, 0.1], torso)
  put(cone(r * 0.5, r * 0.4, 8), robeLight, -0.02, 2.4, 0, [0, 0, 0], torso, [1, 0.8, 1.15])
  put(torus(r * 0.45, r * 0.05, PI * 2, 12), gold, -0.02, 2.22, 0, [PI / 2, 0, 0], torso, [1, 1.1, 0.9])
  // tattered cape strips
  const capes: THREE.Group[] = []
  for (let i = 0; i < 4; i++) {
    const cg = grp(-0.4, 2.3, (i - 1.5) * 0.28, torso)
    capes.push(cg)
    put(box(r * 0.05, r * (1.3 + (i % 2) * 0.3), r * 0.26), i % 2 ? robe : robeMid, -0.05, -0.7, 0, [0, 0, 0], cg)
    put(cone(r * 0.13, r * 0.3, 3), i % 2 ? robe : robeMid, -0.05, -1.5 - (i % 2) * 0.3, 0, [0, 0, PI], cg, [1, 1, 0.4])
  }
  // arms: shoulder mantle spikes, bracers, hands
  const arms: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const sh = grp(0, 2.38, s * 0.62, torso)
    arms.push(sh)
    put(sph(r * 0.24, 7, 5), robeLight, 0, 0, 0, [0, 0, 0], sh)
    put(cone(r * 0.1, r * 0.4, 4), bone, 0, 0.28, s * 0.1, [s * 0.4, 0, 0], sh)
    put(cone(r * 0.07, r * 0.28, 4), bone, -0.15, 0.2, s * 0.08, [s * 0.4, 0, 0.5], sh)
    put(cone(r * 0.26, r * 0.7, 7), robe, 0.0, -0.4, 0, [0, 0, 0], sh)
    const fore = grp(0.05, -0.75, 0, sh)
    fore.rotation.z = -0.55
    put(cyl(r * 0.14, r * 0.1, r * 0.4, 7), wrap, 0, -0.18, 0, [0, 0, 0], fore)
    put(cyl(r * 0.17, r * 0.17, r * 0.06, 7), gold, 0, -0.34, 0, [0, 0, 0], fore)
    put(sph(r * 0.13, 6, 5), skin, 0, -0.48, 0, [0, 0, 0], fore)
    for (let k = -1; k <= 1; k++) put(box(r * 0.05, r * 0.1, r * 0.04), skin, 0.06, -0.58, k * 0.06, [0, 0, 0.2], fore)
    ;(sh as any).fore = fore
  }
  // head
  const head = grp(0.1, 2.95, 0, torso)
  put(cyl(r * 0.14, r * 0.16, r * 0.3, 7), skin, -0.04, -0.4, 0, [0, 0, 0], head)
  put(sph(r * 0.4, 10, 8), skin, 0, 0, 0, [0, 0, 0], head, [0.95, 1.1, 0.9])
  put(sph(r * 0.1, 5, 4), skin, 0.38, -0.08, 0, [0, 0, 0], head, [1, 0.9, 0.8])
  put(box(r * 0.08, r * 0.04, r * 0.18), skinDark, 0.37, -0.22, 0, [0, 0, 0], head)
  for (const s of [-1, 1]) {
    put(sph(r * 0.075, 5, 4), eyeM, 0.35, 0.05, s * 0.17, [0, 0, 0], head, [0.7, 0.8, 1])
    put(box(r * 0.04, r * 0.04, r * 0.2), dark, 0.36, 0.14, s * 0.17, [s * 0.3, 0, 0.25], head)
    put(cone(r * 0.07, r * 0.32, 4), skin, -0.04, 0.1, s * 0.42, [s * 1.3, 0, 0.3], head)
    // face tattoo lines
    put(box(r * 0.02, r * 0.22, r * 0.02), rune, 0.4, -0.06, s * 0.28, [0, 0, 0.2], head)
  }
  put(box(r * 0.12, r * 0.07, r * 0.4), dark, 0.42, 0.28, 0, [0, 0, -0.15], head)
  put(box(r * 0.03, r * 0.2, r * 0.03), rune, 0.45, 0.08, 0, [0, 0, 0], head)
  // crown: forehead horn + swept horns + band
  put(torus(r * 0.38, r * 0.05, PI * 2, 12), gold, 0, 0.3, 0, [PI / 2, 0.1, 0], head)
  put(cone(r * 0.1, r * 0.6, 5), bone, 0.32, 0.55, 0, [0, 0, -0.35], head)
  put(sph(r * 0.07, 5, 4), rune, 0.38, 0.32, 0, [0, 0, 0], head)
  for (const s of [-1, 1]) {
    put(cone(r * 0.12, r * 1.0, 5), bone, -0.1, 0.5, s * 0.3, [s * 0.5, 0, 0.8], head)
    put(cone(r * 0.08, r * 0.6, 5), bone, 0.05, 0.25, s * 0.44, [s * 0.9, 0, 0.3], head)
    put(cone(r * 0.06, r * 0.45, 4), bone, -0.18, 0.55, s * 0.18, [s * 0.3, 0, 1.2], head)
    put(torus(r * 0.05, r * 0.02, PI * 2, 6), gold, 0.0, 0.46, s * 0.33, [0, PI / 2, 0], head)
  }
  for (let i = 0; i < 4; i++) put(cone(r * 0.07, r * 0.4, 4), bone, -0.36 - i * 0.02, 0.2 - i * 0.2, 0, [0, 0, 1.9 + i * 0.15], head)
  put(torus(r * 0.3, r * 0.05, PI * 2, 12), gold, 0.0, -0.38, 0, [PI / 2, 0, 0], head)
  put(sph(r * 0.06, 5, 4), rune, 0.3, -0.38, 0, [0, 0, 0], head)

  // blades
  const blade = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    put(cyl(r * 0.06, r * 0.06, r * 0.5, 6), grip, x, y, z, [0, 0, 0], parent)
    put(sph(r * 0.08, 5, 4), gold, x, y - 0.28, z, [0, 0, 0], parent)
    put(box(r * 0.28, r * 0.08, r * 0.14), gold, x, y + 0.28, z, [0, 0, 0], parent)
    const R = 0.75
    const arc = 1.25
    put(torus(r * R, r * 0.06, arc, 16), steel, x + R, y + 0.3, z, [0, 0, PI - arc], parent, [1, 1, 0.7])
    put(torus(r * R, r * 0.035, arc * 0.8, 14), edge, x + R + 0.03, y + 0.3, z, [0, 0, PI - arc * 0.8 + 0.0], parent, [1, 1, 0.5]).position.x += 0
    put(cone(r * 0.06, r * 0.22, 4), steel, x + R - R * Math.cos(arc) + 0.02, y + 0.3 + R * Math.sin(arc) + 0.02, z, [0, 0, -0.5], parent, [1, 1, 0.5])
  }
  blade(arms[0], 0.3, -1.35, 0) // off-hand blade, hangs from the left arm
  arms[0].children.forEach(() => {})
  weapon.position.set(r * 0.5, r * 1.35, r * 0.85)
  blade(weapon, 0, 0, 0)
  body.add(weapon)
  // front arm pose toward weapon
  arms[1].rotation.z = -0.9
  arms[1].rotation.x = 0.1

  // floating rune orbs around the monk
  const orbs: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) orbs.push(put(sph(r * 0.07, 5, 4), rune, 0, 3.4, 0, [0, 0, 0], torso))

  const mv = mover()
  const update: Model['update'] = (t, st) => {
    const k = mv(t, st.moving)
    const sw = Math.sin(t * 10.5) * 0.7 * k
    legs[0].rotation.z = sw
    legs[1].rotation.z = -sw
    arms[0].rotation.z = -sw * 0.7
    panels.forEach((p, i) => (p.rotation.z = (i ? -1 : 1) * (Math.abs(sw) * 0.25) + Math.sin(t * 2 + i) * 0.03))
    torso.position.y = Math.sin(t * 2) * r * 0.03 + (k > 0.1 ? Math.abs(Math.sin(t * 10.5)) * r * 0.04 * k : 0)
    capes.forEach((c, i) => {
      c.rotation.z = 0.15 + Math.sin(t * 2.4 + i * 0.8) * 0.05 + k * 0.25
      c.rotation.x = Math.sin(t * 1.7 + i) * 0.05
    })
    orbs.forEach((o, i) => {
      const a = t * 1.6 + (i * PI * 2) / 3
      o.position.set(Math.cos(a) * r * 0.55, r * (3.55 + Math.sin(t * 2 + i) * 0.1), Math.sin(a) * r * 0.55)
      o.scale.setScalar(1 + Math.sin(t * 4 + i) * 0.3)
    })
    rune.emissiveIntensity = 1.0 + Math.sin(t * 3) * 0.35 + (st.casting ? 0.8 : 0)
  }
  return { group: g, weapon, body, height: r * 3.9, mats: b.mats, update }
}

/* ------------------------------------------------------------------ Riki */

const riki: HeroModelFn = (id, color, color2, team, r) => {
  const { b, g, body, weapon, glow, metal, put, grp, mover } = scaffold(team, r)
  const skin = b.m('#7a80d8')
  const skinDk = b.m('#5a60b8')
  const cloth = b.m(color)
  const clothDark = b.m(color2)
  const hood = b.m('#4a3e8a')
  const hoodDk = b.m('#352c68')
  const mask = b.m('#1a1630')
  const steel = metal('#d8dcec')
  const gold = metal('#c8a850')
  const leather = b.m('#2a2038')
  const strap = b.m('#46345e')
  const eyeM = glow('#ff5a5a', 1.6)
  const edge = glow('#c8a8ff', 0.8)
  const rune = glow('#a070ff', 1.0)
  const torso = grp(0, 0, 0)

  // crouched legs w/ wraps
  const legs: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const leg = grp(0.05, 0.95, s * 0.28, torso)
    legs.push(leg)
    leg.rotation.z = 0
    put(cyl(r * 0.2, r * 0.15, r * 0.45, 7), clothDark, 0.06, -0.22, 0, [0, 0, -0.2], leg)
    put(sph(r * 0.15, 6, 5), clothDark, 0.12, -0.44, 0, [0, 0, 0], leg)
    put(cyl(r * 0.15, r * 0.13, r * 0.42, 7), leather, 0.0, -0.64, 0, [0, 0, 0.25], leg)
    for (let i = 0; i < 3; i++) put(torus(r * 0.14, r * 0.02, PI * 2, 8), strap, 0.02 - i * 0.02, -0.5 - i * 0.12, 0, [PI / 2, 0, 0.25], leg)
    put(box(r * 0.55, r * 0.12, r * 0.28), leather, 0.15, -0.9, 0, [0, 0, 0], leg)
    put(cone(r * 0.13, r * 0.25, 4), leather, 0.47, -0.88, 0, [0, 0, -PI / 2], leg)
  }
  // hunched torso
  const hump = grp(0.0, 0.9, 0, torso)
  hump.rotation.z = -0.28
  put(cyl(r * 0.44, r * 0.5, r * 0.5, 8), cloth, 0, 0.2, 0, [0, 0, 0], hump)
  put(cyl(r * 0.46, r * 0.44, r * 0.5, 8), clothDark, 0, 0.65, 0, [0, 0, 0], hump)
  put(sph(r * 0.42, 8, 6), hood, -0.25, 0.95, 0, [0, 0, 0], hump, [1.0, 0.8, 1.1])
  put(cyl(r * 0.53, r * 0.53, r * 0.11, 9), gold, 0, -0.05, 0, [0, 0, 0], hump)
  put(box(r * 0.2, r * 0.2, r * 0.06), gold, 0.52, -0.05, 0, [0, 0, 0], hump)
  put(sph(r * 0.06, 5, 4), rune, 0.56, -0.05, 0, [0, 0, 0], hump)
  put(box(r * 0.06, r * 1.15, r * 0.14), strap, 0.35, 0.55, 0.0, [0.55, 0, 0.1], hump)
  put(box(r * 0.06, r * 1.15, r * 0.14), strap, 0.35, 0.55, 0.0, [-0.55, 0, 0.1], hump)
  put(sph(r * 0.07, 5, 4), gold, 0.4, 0.62, 0, [0, 0, 0], hump)
  // belt pouches + knife sheaths
  for (const s of [-1, 1]) {
    put(box(r * 0.2, r * 0.25, r * 0.2), leather, 0.1, -0.2, s * 0.5, [0, 0, 0], hump)
    put(box(r * 0.22, r * 0.07, r * 0.22), gold, 0.1, -0.06, s * 0.5, [0, 0, 0], hump)
    put(box(r * 0.5, r * 0.07, r * 0.1), leather, -0.3, -0.12, s * 0.55, [0, 0, 0.5], hump)
    put(sph(r * 0.06, 5, 4), steel, -0.52, -0.02, s * 0.55, [0, 0, 0], hump)
  }
  // back spikes along hump
  for (let i = 0; i < 4; i++) put(cone(r * 0.07, r * 0.32, 4), steel, -0.5 - i * 0.04, 0.2 + i * 0.28, 0, [0, 0, 1.3 + i * 0.12], hump)

  // ragged cloak tails
  const tails: THREE.Group[] = []
  for (let i = 0; i < 5; i++) {
    const z = (i - 2) * 0.22
    const tg = grp(-0.45, 1.9, z, torso)
    tails.push(tg)
    const len = 0.9 + (i % 3) * 0.28
    put(box(r * 0.04, r * len, r * 0.2), i % 2 ? hood : hoodDk, -0.04, -len / 2, 0, [0, 0, 0], tg)
    put(cone(r * 0.1, r * 0.3, 3), i % 2 ? hood : hoodDk, -0.04, -len - 0.1, 0, [0, 0, PI], tg, [1, 1, 0.4])
  }
  // long scarf tails
  const scarf: THREE.Group[] = []
  for (const s of [-1, 1]) {
    let par: THREE.Object3D = grp(0.3, 2.15, s * 0.28, torso)
    for (let i = 0; i < 4; i++) {
      const seg = grp(0, i === 0 ? 0 : 0, 0, par)
      if (i > 0) seg.position.x = -r * 0.42
      scarf.push(seg)
      put(box(r * 0.45, r * 0.05, r * 0.14), s > 0 ? clothDark : cloth, -0.22, 0, 0, [0, 0, 0], seg)
      par = seg
    }
  }

  // arms with spiked bracers
  const mkArm = (s: number) => {
    const sh = grp(0.3, 1.75, s * 0.5, torso)
    put(sph(r * 0.2, 6, 5), cloth, 0, 0, 0, [0, 0, 0], sh)
    put(cone(r * 0.08, r * 0.3, 4), steel, 0, 0.2, s * 0.08, [s * 0.5, 0, 0], sh)
    put(cyl(r * 0.11, r * 0.09, r * 0.55, 6), skin, 0.18, -0.25, 0, [0, 0, 0.5], sh)
    const fore = grp(0.4, -0.45, 0, sh)
    put(cyl(r * 0.1, r * 0.08, r * 0.42, 6), skin, 0.12, -0.05, 0, [0, 0, -1.2], fore)
    put(cyl(r * 0.13, r * 0.12, r * 0.2, 6), leather, 0.12, -0.04, 0, [0, 0, -1.2], fore)
    put(cone(r * 0.06, r * 0.22, 4), steel, 0.14, 0.1, 0, [0, 0, 0.3], fore)
    put(sph(r * 0.12, 6, 5), skin, 0.35, 0.1, 0, [0, 0, 0], fore)
    for (let k = -1; k <= 1; k++) put(cone(r * 0.025, r * 0.12, 3), skinDk, 0.45, 0.08, k * 0.06, [0, 0, -PI / 2], fore)
    return { sh, fore }
  }
  const aL = mkArm(-1)
  mkArm(1)

  // head: hood, mask, glowing eyes
  const head = grp(0.5, 2.15, 0, torso)
  put(sph(r * 0.32, 9, 8), skin, 0.08, -0.05, 0, [0, 0, 0], head)
  put(sph(r * 0.42, 9, 8), hood, -0.04, 0.05, 0, [0, 0, 0], head, [1.05, 1.0, 1.05])
  put(cone(r * 0.42, r * 0.9, 8), hood, -0.4, 0.3, 0, [0, 0, 1.0], head)
  put(cone(r * 0.2, r * 0.7, 6), hoodDk, -0.7, 0.05, 0, [0, 0, 1.6], head)
  put(torus(r * 0.36, r * 0.05, PI * 1.5, 12), hoodDk, 0.0, 0.08, 0, [0, PI / 2 + 0.2, 0], head)
  put(box(r * 0.2, r * 0.3, r * 0.5), mask, 0.32, -0.12, 0, [0, 0, 0], head)
  put(box(r * 0.1, r * 0.04, r * 0.5), strap, 0.36, -0.2, 0, [0, 0, 0], head)
  put(box(r * 0.24, r * 0.1, r * 0.56), hood, 0.3, 0.14, 0, [0, 0, -0.05], head)
  put(box(r * 0.04, r * 0.18, r * 0.04), rune, 0.43, -0.12, 0, [0, 0, 0], head)
  for (const s of [-1, 1]) {
    put(sph(r * 0.07, 5, 4), eyeM, 0.39, 0.0, s * 0.15, [0, 0, 0], head, [0.7, 0.8, 1.3])
    put(box(r * 0.04, r * 0.03, r * 0.18), mask, 0.4, 0.09, s * 0.15, [s * -0.35, 0, 0], head)
    put(cone(r * 0.06, r * 0.38, 4), hoodDk, 0.0, 0.42, s * 0.2, [s * 0.4, 0, 0.1], head)
  }

  // daggers (curved), off-hand static on left arm, main in weapon pivot
  const dagger = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    put(cyl(r * 0.05, r * 0.05, r * 0.32, 6), leather, x, y, z, [0, 0, PI / 2], parent)
    put(sph(r * 0.07, 5, 4), gold, x - 0.2, y, z, [0, 0, 0], parent)
    put(box(r * 0.08, r * 0.28, r * 0.12), gold, x + 0.18, y, z, [0, 0, 0], parent)
    const R = 1.0
    const arc = 0.95
    put(torus(r * R, r * 0.05, arc, 14), steel, x + 0.2, y + R, z, [0, 0, -PI / 2], parent, [1, 1, 0.5])
    put(torus(r * R, r * 0.025, arc * 0.9, 12), edge, x + 0.2, y + R, z, [0, 0, -PI / 2], parent, [1.01, 1.01, 0.4])
    put(cone(r * 0.05, r * 0.2, 4), steel, x + 0.2 + R * Math.sin(arc) + 0.02, y + R - R * Math.cos(arc) + 0.04, z, [0, 0, -PI / 2 + arc], parent, [1, 1, 0.45])
  }
  dagger(aL.fore, 0.4, 0.1, 0)
  weapon.position.set(r * 0.95, r * 1.25, r * 0.65)
  dagger(weapon, 0, 0, 0)
  body.add(weapon)

  const mv = mover()
  const update: Model['update'] = (t, st) => {
    const k = mv(t, st.moving)
    const sw = Math.sin(t * 12) * 0.8 * k
    legs[0].rotation.z = sw
    legs[1].rotation.z = -sw
    aL.sh.rotation.z = -sw * 0.5
    hump.rotation.z = -0.28 - k * 0.12 + Math.sin(t * 2.4) * 0.025
    torso.position.y = Math.sin(t * 2.4) * r * 0.025 + (k > 0.1 ? Math.abs(Math.sin(t * 12)) * r * 0.05 * k : 0)
    tails.forEach((c, i) => {
      c.rotation.z = 0.3 + Math.sin(t * 3 + i * 0.9) * 0.09 + k * 0.35
      c.rotation.x = Math.sin(t * 2.2 + i * 1.3) * 0.07
    })
    scarf.forEach((s, i) => {
      s.rotation.z = 0.12 + k * 0.1 + Math.sin(t * 4 - i * 0.8) * 0.12
      s.rotation.y = Math.sin(t * 3 - i * 0.6) * 0.12
    })
    eyeM.emissiveIntensity = 1.4 + Math.sin(t * 5) * 0.3 + (st.attacking ? 0.8 : 0)
    rune.emissiveIntensity = 0.9 + Math.sin(t * 3) * 0.3
    head.rotation.y = Math.sin(t * 0.9) * 0.08
  }
  return { group: g, weapon, body, height: r * 3.1, mats: b.mats, update }
}

/** 3D builders for the g2 heroes, keyed by hero id. */
export const MODELS_G2: Record<string, HeroModelFn> = { windranger, antimage, riki }
