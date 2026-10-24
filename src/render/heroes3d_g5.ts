import * as THREE from 'three'
import { type HeroModelFn, box, cone, cyl, makeScaffold, sph } from './modelkit'

const PI = Math.PI

/* ------------------------------------------------------------------ Weaver */

/** Skitskurr: a slender, upright insect with a banded abdomen, compound eyes, antennae and two pairs of glassy wings. */
const weaver: HeroModelFn = (_id, color, color2, team, r) => {
  const { b, glow, metal, dbl, put, piv, tor, finish, weapon } = makeScaffold(team, r)
  const shell = metal(color)
  const shellDk = metal(color2)
  const belly = b.m('#c8d8b0')
  const joint = b.m('#1e2630')
  const claw = metal('#d8e0e8')
  const eyeM = glow('#7aff9a', 1.3)
  const band = glow('#8ad0a0', 0.7)
  const wingM = dbl('#b8f0e0', { transparent: true, opacity: 0.38, emissive: new THREE.Color('#5ad0b0'), emissiveIntensity: 0.5, depthWrite: false, metalness: 0.2, roughness: 0.1 })
  const veinM = glow('#d8fff0', 0.6)

  const torso = piv(0, 0, 0)

  // ---- digitigrade legs (pivot at the hip)
  const legs: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const leg = piv(0, 1.15, s * 0.22, torso)
    legs.push(leg)
    put(cyl(r * 0.11, r * 0.08, r * 0.6, 6), shellDk, 0.1, -0.25, 0, [0, 0, 0.45], leg)
    put(sph(r * 0.09, 6, 5), joint, 0.22, -0.52, 0, [0, 0, 0], leg)
    put(cyl(r * 0.07, r * 0.05, r * 0.6, 6), shell, 0.08, -0.8, 0, [0, 0, -0.5], leg)
    put(sph(r * 0.06, 5, 4), joint, -0.05, -1.05, 0, [0, 0, 0], leg)
    put(cyl(r * 0.05, r * 0.04, r * 0.15, 5), joint, 0.02, -1.11, 0, [0, 0, 0], leg)
    for (const k of [-1, 0, 1]) put(cone(r * 0.03, r * 0.2, 4), claw, 0.14, -1.15, k * 0.07, [0, k * 0.4, -PI / 2], leg)
  }

  // ---- banded abdomen hanging behind
  const abdomen = piv(-0.25, 1.35, 0, torso)
  abdomen.rotation.z = 0.2
  for (let i = 0; i < 4; i++) {
    const rad = 0.3 - i * 0.04
    put(sph(r * rad, 9, 7), i % 2 ? shellDk : shell, -0.2 - i * 0.22, -0.08 * i, 0, [0, 0, 0], abdomen, [1.0, 0.85, 0.9])
    put(tor(rad * 0.92, 0.025, 14), band, -0.31 - i * 0.22, -0.08 * i, 0, [0, PI / 2, 0], abdomen)
  }
  put(cone(r * 0.08, r * 0.3, 5), shellDk, -1.05, -0.32, 0, [0, 0, PI / 2 + 0.3], abdomen)

  // ---- thorax with chitin plates
  const chest = piv(0.05, 1.6, 0, torso)
  put(sph(r * 0.34, 9, 8), shell, 0, 0.1, 0, [0, 0, 0], chest, [0.9, 1.15, 0.95])
  put(sph(r * 0.24, 8, 6), belly, 0.14, 0.0, 0, [0, 0, 0], chest, [0.8, 1.2, 1])
  put(box(r * 0.08, r * 0.5, r * 0.5), shellDk, -0.24, 0.15, 0, [0, 0, -0.15], chest)
  for (const s of [-1, 1]) put(sph(r * 0.16, 7, 6), shellDk, 0.0, 0.42, s * 0.28, [0, 0, 0], chest, [1, 0.7, 1.2])
  put(cyl(r * 0.12, r * 0.15, r * 0.25, 7), joint, 0.08, 0.55, 0, [0, 0, -0.2], chest)

  // ---- head: compound eyes, mandibles, long antennae
  const head = piv(0.2, 0.78, 0, chest)
  put(sph(r * 0.24, 9, 8), shell, 0, 0, 0, [0, 0, 0], head, [1.15, 0.95, 1])
  for (const s of [-1, 1]) {
    put(sph(r * 0.13, 8, 6), eyeM, 0.14, 0.06, s * 0.16, [0, 0, 0], head)
    put(cone(r * 0.04, r * 0.24, 4), claw, 0.3, -0.16, s * 0.07, [s * 0.4, 0, -PI / 2 - 0.5], head)
  }
  const antennae: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const an = piv(0.12, 0.2, s * 0.08, head)
    antennae.push(an)
    put(cyl(r * 0.018, r * 0.012, r * 0.45, 4), joint, 0.04, 0.21, s * 0.04, [s * -0.2, 0, -0.35], an)
    const tip = piv(0.12, 0.42, s * 0.09, an)
    put(cyl(r * 0.012, r * 0.008, r * 0.35, 4), joint, 0.1, 0.13, 0, [0, 0, -1.0], tip)
    put(sph(r * 0.035, 5, 4), eyeM, 0.23, 0.21, 0, [0, 0, 0], tip)
    antennae.push(tip)
  }

  // ---- four thin arms; the right upper hand is the attack pivot
  const arms: THREE.Group[] = []
  const mkArm = (s: number, y: number, len: number) => {
    const sh = piv(0.05, y, s * 0.32, chest)
    arms.push(sh)
    put(sph(r * 0.08, 6, 5), joint, 0, 0, 0, [0, 0, 0], sh)
    put(cyl(r * 0.06, r * 0.045, r * len, 5), shell, 0.1, -len * 0.45, s * 0.06, [s * -0.15, 0, 0.25], sh)
    const fore = piv(0.2, -len * 0.9, s * 0.1, sh)
    put(sph(r * 0.05, 5, 4), joint, 0, 0, 0, [0, 0, 0], fore)
    put(cyl(r * 0.045, r * 0.03, r * len, 5), shellDk, len * 0.4, 0.05, 0, [0, 0, -1.3], fore)
    for (const k of [-1, 1]) put(cone(r * 0.025, r * 0.16, 4), claw, len * 0.85, 0.12, k * 0.04, [0, 0, -PI / 2 + k * 0.3], fore)
    return fore
  }
  mkArm(-1, 0.25, 0.55)
  const handR = mkArm(1, 0.25, 0.55)
  mkArm(-1, -0.05, 0.42)
  mkArm(1, -0.05, 0.42)
  weapon.position.set(r * 0.55, r * 1.6, r * 0.45)
  put(sph(r * 0.09, 6, 5), band, 0, 0, 0, [0, 0, 0], weapon)

  // ---- two pairs of glassy, veined wings on a back pivot
  const wings: { g: THREE.Group; s: number; k: number }[] = []
  const wingShape = (len: number, wid: number) => {
    const sh = new THREE.Shape()
    sh.moveTo(0, 0)
    sh.bezierCurveTo(len * 0.3, wid, len * 0.8, wid * 0.9, len, wid * 0.15)
    sh.bezierCurveTo(len * 0.85, -wid * 0.35, len * 0.35, -wid * 0.3, 0, 0)
    return new THREE.ShapeGeometry(sh, 10)
  }
  for (const [k, len, wid, yy] of [[0, 1.5, 0.42, 0.35], [1, 1.15, 0.32, 0.05]] as const) {
    for (const s of [-1, 1]) {
      const wg = piv(-0.2, yy, s * 0.15, chest)
      wings.push({ g: wg, s, k })
      // the wing shape lies along +x; turn it to point back and out to its side
      const a = -s * (PI - 0.5)
      put(wingShape(r * len, r * wid), wingM, 0, 0, 0, [0, a, 0], wg).castShadow = false
      put(cyl(r * 0.012, r * 0.006, r * len * 0.9, 3), veinM, Math.cos(a) * len * 0.45, 0.03, -Math.sin(a) * len * 0.45, [0, a, PI / 2], wg).castShadow = false
    }
  }

  void handR
  let last = 0
  let mvK = 0
  return finish(r * 3.0, (t, st) => {
    const dt = Math.min(0.1, Math.max(0, t - last))
    last = t
    mvK += ((st.moving ? 1 : 0) - mvK) * Math.min(1, dt * 8)
    const sw = Math.sin(t * 11) * 0.7 * mvK
    legs[0].rotation.z = sw
    legs[1].rotation.z = -sw
    torso.position.y = Math.sin(t * 2.2) * r * 0.03 + Math.abs(Math.sin(t * 11)) * r * 0.04 * mvK
    abdomen.rotation.z = 0.2 + Math.sin(t * 2.2 + 0.6) * 0.06 + mvK * 0.12
    // wings buzz, faster and wider while moving or attacking
    const buzz = 0.25 + mvK * 0.35 + (st.attacking ? 0.3 : 0)
    for (const w of wings) {
      const f = Math.sin(t * (24 + w.k * 6) + w.k) * buzz
      w.g.rotation.set(w.s * (0.7 + f), 0, 0.2 + w.k * 0.15)
    }
    antennae.forEach((a, i) => (a.rotation.z = Math.sin(t * 2.6 + i) * 0.12))
    arms.forEach((a, i) => (a.rotation.z = Math.sin(t * 1.8 + i * 1.3) * 0.1 - (i < 2 ? sw * 0.3 : 0)))
    head.rotation.y = Math.sin(t * 0.9) * 0.12
    eyeM.emissiveIntensity = 1.1 + Math.sin(t * 4) * 0.25 + (st.attacking ? 0.7 : 0)
    band.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.2
  })
}

/** 3D builders for the g5 heroes, keyed by hero id. */
export const MODELS_G5: Record<string, HeroModelFn> = { weaver }
