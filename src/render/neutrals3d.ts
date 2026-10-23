import * as THREE from 'three'
import { Builder, Model, box, cone, cyl, sph } from './modelkit'

/* ------------------------------------------------------------ jungle monsters */
// Model faces +X, z is the side axis; weapon pivot swings via rotation.z.

function glow(b: Builder, color: string, emissive: string, k = 1.3) {
  return b.m(color, { emissive: new THREE.Color(emissive), emissiveIntensity: k })
}

export function buildNeutral(sub: string, r: number): Model {
  const b = new Builder()
  const g = new THREE.Group()
  const body = new THREE.Group()
  const weapon = new THREE.Group()
  g.add(body)
  let height = r * 2.6
  switch (sub) {
    case 'kobold':
    case 'kobold_lord':
      kobold(b, body, weapon, r, sub === 'kobold_lord')
      height = r * (sub === 'kobold_lord' ? 3.2 : 2.6)
      break
    case 'wolf':
    case 'wolf_alpha':
      wolf(b, body, weapon, r, sub === 'wolf_alpha')
      height = r * 1.9
      break
    case 'golem':
      golem(b, body, weapon, r)
      height = r * 3.2
      break
    case 'shard':
      shard(b, body, weapon, r)
      height = r * 2.4
      break
    default:
      wisp(b, body, weapon, r)
      height = r * 2.8
  }
  body.add(weapon)
  return { group: g, weapon, body, height, mats: b.mats }
}

function kobold(b: Builder, body: THREE.Group, weapon: THREE.Group, r: number, boss: boolean) {
  const skin = b.m(boss ? '#8a4a34' : '#9a6a44')
  const dark = b.m(boss ? '#4a2418' : '#5a3a24')
  const bone = b.m('#e6dcc0')
  const cloth = b.m(boss ? '#7a1c1c' : '#5a4a30')
  const eye = glow(b, '#ffe06a', '#ffc020', 1.6)
  const k = boss ? 1.15 : 1
  b.mesh(cyl(r * 0.2, r * 0.24, r * 0.8, 6), dark, 0, r * 0.4, -r * 0.25, body)
  b.mesh(cyl(r * 0.2, r * 0.24, r * 0.8, 6), dark, 0, r * 0.4, r * 0.25, body)
  b.mesh(cyl(r * 0.5 * k, r * 0.6 * k, r * 1.0, 7), skin, 0, r * 1.2, 0, body)
  b.mesh(box(r * 0.1, r * 0.7, r * 1.0), cloth, r * 0.52, r * 1.05, 0, body)
  // head with a snout
  b.mesh(sph(r * 0.4, 8, 7), skin, r * 0.05, r * 1.95, 0, body)
  b.mesh(cone(r * 0.2, r * 0.5, 6), skin, r * 0.5, r * 1.9, 0, body).rotation.z = -Math.PI / 2
  b.mesh(cone(r * 0.12, r * 0.4, 4), skin, -r * 0.05, r * 2.2, -r * 0.35, body).rotation.x = -0.9
  b.mesh(cone(r * 0.12, r * 0.4, 4), skin, -r * 0.05, r * 2.2, r * 0.35, body).rotation.x = 0.9
  b.mesh(sph(r * 0.07, 5, 4), eye, r * 0.36, r * 2.05, -r * 0.16, body)
  b.mesh(sph(r * 0.07, 5, 4), eye, r * 0.36, r * 2.05, r * 0.16, body)
  // tail
  b.mesh(cone(r * 0.12, r * 0.8, 5), skin, -r * 0.6, r * 0.8, 0, body).rotation.z = 1.9
  if (boss) {
    // horns and a bone crown
    b.mesh(cone(r * 0.1, r * 0.6, 5), bone, 0, r * 2.45, -r * 0.3, body).rotation.x = -0.4
    b.mesh(cone(r * 0.1, r * 0.6, 5), bone, 0, r * 2.45, r * 0.3, body).rotation.x = 0.4
    b.mesh(cyl(r * 0.45, r * 0.45, r * 0.12, 8), glow(b, '#ffcf4a', '#e09a10', 0.8), 0, r * 2.3, 0, body)
  }
  // club
  weapon.position.set(r * 0.45, r * 1.3, r * 0.6)
  b.mesh(cyl(r * 0.07, r * 0.09, r * 1.1, 5), dark, 0, r * 0.5, 0, weapon)
  b.mesh(sph(r * 0.2, 6, 5), bone, 0, r * 1.1, 0, weapon)
}

function wolf(b: Builder, body: THREE.Group, weapon: THREE.Group, r: number, alpha: boolean) {
  const fur = b.m(alpha ? '#2c2c34' : '#7b7468')
  const fur2 = b.m(alpha ? '#4a4a58' : '#a39a88')
  const dark = b.m('#1c1a1e')
  const eye = glow(b, alpha ? '#ff3a2a' : '#ffd24a', alpha ? '#ff1a10' : '#e0a010', 1.8)
  const k = alpha ? 1.15 : 1
  // torso
  b.mesh(box(r * 1.9 * k, r * 0.85 * k, r * 0.85 * k), fur, 0, r * 1.0, 0, body)
  b.mesh(box(r * 1.2, r * 0.5, r * 0.7), fur2, r * 0.15, r * 0.8, 0, body)
  // legs
  for (const [x, z] of [[0.65, -0.3], [0.65, 0.3], [-0.65, -0.3], [-0.65, 0.3]]) b.mesh(cyl(r * 0.14, r * 0.12, r * 0.85, 5), dark, r * x, r * 0.42, r * z, body)
  // neck + head
  b.mesh(box(r * 0.6, r * 0.6, r * 0.55), fur, r * 1.05, r * 1.3, 0, body).rotation.z = 0.5
  b.mesh(box(r * 0.6, r * 0.45, r * 0.5), fur, r * 1.4, r * 1.45, 0, body)
  b.mesh(cone(r * 0.22, r * 0.55, 5), fur2, r * 1.8, r * 1.38, 0, body).rotation.z = -Math.PI / 2
  b.mesh(sph(r * 0.07, 4, 4), dark, r * 2.05, r * 1.38, 0, body)
  b.mesh(cone(r * 0.11, r * 0.3, 4), fur, r * 1.3, r * 1.8, -r * 0.18, body)
  b.mesh(cone(r * 0.11, r * 0.3, 4), fur, r * 1.3, r * 1.8, r * 0.18, body)
  b.mesh(sph(r * 0.06, 4, 4), eye, r * 1.62, r * 1.52, -r * 0.14, body)
  b.mesh(sph(r * 0.06, 4, 4), eye, r * 1.62, r * 1.52, r * 0.14, body)
  // tail
  b.mesh(cone(r * 0.18, r * 1.0, 5), fur, -r * 1.2, r * 1.1, 0, body).rotation.z = 1.9
  if (alpha) {
    // mane spikes and scars
    for (let i = 0; i < 6; i++) b.mesh(cone(r * 0.1, r * 0.5, 4), fur2, r * (0.9 - i * 0.28), r * 1.6, 0, body).rotation.z = 0.2 - i * 0.05
    b.mesh(box(r * 0.5, r * 0.06, r * 0.04), glow(b, '#8affc0', '#30ff90', 1.2), r * 0.4, r * 1.25, r * 0.44, body)
  }
  // fangs act as the "weapon" for the bite swing
  weapon.position.set(r * 1.95, r * 1.3, 0)
  b.mesh(cone(r * 0.05, r * 0.25, 4), b.m('#f4f0e0'), 0, -r * 0.1, -r * 0.1, weapon)
  b.mesh(cone(r * 0.05, r * 0.25, 4), b.m('#f4f0e0'), 0, -r * 0.1, r * 0.1, weapon)
}

function golem(b: Builder, body: THREE.Group, weapon: THREE.Group, r: number) {
  const rock = b.m('#6a6862')
  const rock2 = b.m('#85827a')
  const dark = b.m('#3a3834')
  const rune = glow(b, '#7fe6ff', '#30c8ff', 1.7)
  b.mesh(box(r * 0.7, r * 0.9, r * 0.7), dark, 0, r * 0.45, -r * 0.45, body)
  b.mesh(box(r * 0.7, r * 0.9, r * 0.7), dark, 0, r * 0.45, r * 0.45, body)
  b.mesh(new THREE.DodecahedronGeometry(r * 0.9, 0), rock, 0, r * 1.5, 0, body)
  b.mesh(new THREE.DodecahedronGeometry(r * 0.7, 0), rock2, 0, r * 2.2, 0, body)
  b.mesh(new THREE.DodecahedronGeometry(r * 0.5, 0), rock, r * 0.25, r * 2.85, 0, body)
  // glowing eyes and core
  b.mesh(sph(r * 0.09, 5, 4), rune, r * 0.7, r * 2.3, -r * 0.2, body)
  b.mesh(sph(r * 0.09, 5, 4), rune, r * 0.7, r * 2.3, r * 0.2, body)
  b.mesh(new THREE.OctahedronGeometry(r * 0.28, 0), rune, r * 0.7, r * 1.5, 0, body)
  for (let i = 0; i < 5; i++) b.mesh(box(r * 0.06, r * 0.4, r * 0.06), rune, r * 0.8, r * (1.0 + i * 0.12), r * (-0.4 + i * 0.2), body).rotation.z = 0.2
  // shoulder boulders + arms
  b.mesh(new THREE.DodecahedronGeometry(r * 0.55, 0), rock2, 0, r * 2.2, -r * 1.05, body)
  b.mesh(cyl(r * 0.28, r * 0.34, r * 1.2, 6), rock, 0, r * 1.5, -r * 1.1, body)
  b.mesh(new THREE.DodecahedronGeometry(r * 0.55, 0), rock2, 0, r * 2.2, r * 1.05, body)
  // right arm is the swinging weapon: a boulder fist
  weapon.position.set(r * 0.2, r * 2.0, r * 1.1)
  b.mesh(cyl(r * 0.28, r * 0.34, r * 1.2, 6), rock, 0, -r * 0.2, 0, weapon).rotation.z = 0
  b.mesh(new THREE.DodecahedronGeometry(r * 0.62, 0), dark, 0, -r * 0.95, 0, weapon)
}

function shard(b: Builder, body: THREE.Group, weapon: THREE.Group, r: number) {
  const rock = b.m('#7a7872')
  const crys = glow(b, '#9fe8ff', '#3ab8ff', 1.5)
  b.mesh(new THREE.DodecahedronGeometry(r * 0.8, 0), rock, 0, r * 0.9, 0, body)
  b.mesh(new THREE.DodecahedronGeometry(r * 0.55, 0), rock, r * 0.1, r * 1.7, 0, body)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    b.mesh(cone(r * 0.14, r * 0.7, 4), crys, Math.cos(a) * r * 0.45, r * 1.6 + (i % 2) * r * 0.2, Math.sin(a) * r * 0.45, body).rotation.z = Math.cos(a) * 0.5
  }
  b.mesh(sph(r * 0.08, 4, 4), crys, r * 0.5, r * 1.8, -r * 0.15, body)
  b.mesh(sph(r * 0.08, 4, 4), crys, r * 0.5, r * 1.8, r * 0.15, body)
  weapon.position.set(r * 0.5, r * 1.0, r * 0.7)
  b.mesh(new THREE.DodecahedronGeometry(r * 0.35, 0), rock, 0, 0, 0, weapon)
}

function wisp(b: Builder, body: THREE.Group, weapon: THREE.Group, r: number) {
  const core = glow(b, '#ffb060', '#ff7a1a', 2.2)
  const flame = glow(b, '#ff6a20', '#ff4a10', 1.5)
  b.mesh(sph(r * 0.7, 10, 8), core, 0, r * 1.6, 0, body)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    b.mesh(cone(r * 0.2, r * 0.9, 5), flame, Math.cos(a) * r * 0.55, r * 2.0 + (i % 2) * r * 0.2, Math.sin(a) * r * 0.55, body).rotation.z = Math.cos(a) * 0.6
  }
  b.mesh(cone(r * 0.4, r * 1.0, 6), flame, 0, r * 0.7, 0, body).rotation.z = Math.PI
  weapon.position.set(r * 0.6, r * 1.6, 0)
}
