import * as THREE from 'three'
import { Builder, Model, box, cone, cyl, sph } from './modelkit'

/* ------------------------------------------------------------------ creeps */
// Radiant: green-armored human soldiers. Dire: red/black horned orcish brutes and skeletal casters.
// Model faces +X; z is the side axis. Weapon pivot swings via rotation.z (blade points +Y at rest).

function glow(b: Builder, color: string, emissive: string, k = 1.2) {
  return b.m(color, { emissive: new THREE.Color(emissive), emissiveIntensity: k })
}

export function buildCreep(sub: string, team: number, r: number): Model {
  const b = new Builder()
  const g = new THREE.Group()
  const body = new THREE.Group()
  g.add(body)
  const weapon = new THREE.Group()
  const rad = team === 0
  if (sub === 'melee') {
    if (rad) buildRadiantMelee(b, body, weapon, r)
    else buildDireMelee(b, body, weapon, r)
  } else {
    if (rad) buildRadiantRanged(b, body, weapon, r)
    else buildDireRanged(b, body, weapon, r)
  }
  body.add(weapon)
  return { group: g, weapon, body, height: r * (sub === 'melee' && !rad ? 3.0 : 2.8), mats: b.mats }
}

function buildRadiantMelee(b: Builder, body: THREE.Group, weapon: THREE.Group, r: number) {
  const armor = b.m('#3f9a45')
  const cloth = b.m('#e8efd8')
  const dark = b.m('#245a2c')
  const skin = b.m('#e0c0a0')
  const steel = b.m('#c8ccd8', { metalness: 0.6, roughness: 0.35 })
  const gold = b.m('#e8c050', { metalness: 0.5, roughness: 0.4 })
  const trim = glow(b, '#7aff8a', '#3aff60', 0.9)
  // legs + boots
  b.mesh(cyl(r * 0.22, r * 0.26, r * 0.8, 6), dark, 0, r * 0.4, -r * 0.28, body)
  b.mesh(cyl(r * 0.22, r * 0.26, r * 0.8, 6), dark, 0, r * 0.4, r * 0.28, body)
  b.mesh(box(r * 0.5, r * 0.18, r * 0.34), steel, r * 0.1, r * 0.1, -r * 0.28, body)
  b.mesh(box(r * 0.5, r * 0.18, r * 0.34), steel, r * 0.1, r * 0.1, r * 0.28, body)
  // torso with tabard
  b.mesh(cyl(r * 0.55, r * 0.62, r * 1.0, 8), armor, 0, r * 1.25, 0, body)
  b.mesh(box(r * 0.08, r * 1.0, r * 0.5), cloth, r * 0.58, r * 1.1, 0, body)
  b.mesh(box(r * 0.1, r * 0.1, r * 1.3), trim, 0, r * 0.82, 0, body) // belt glow
  // pauldrons
  const pauld = b.m('#58b85e')
  b.mesh(sph(r * 0.22, 7, 6), pauld, 0, r * 1.7, -r * 0.6, body)
  b.mesh(sph(r * 0.22, 7, 6), pauld, 0, r * 1.7, r * 0.6, body)
  // head + helmet + plume
  b.mesh(sph(r * 0.36, 8, 7), skin, 0, r * 2.05, 0, body)
  b.mesh(new THREE.SphereGeometry(r * 0.43, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), steel, 0, r * 2.12, 0, body)
  b.mesh(box(r * 0.5, r * 0.5, r * 0.1), gold, r * 0.02, r * 2.4, 0, body) // crest
  b.mesh(cone(r * 0.12, r * 0.55, 5), trim, -r * 0.1, r * 2.7, 0, body).rotation.z = 0.5 // plume
  // kite shield on -z (left arm)
  const shield = b.mesh(box(r * 0.12, r * 1.3, r * 0.8), armor, r * 0.25, r * 1.2, -r * 0.88, body)
  shield.rotation.x = 0.0
  b.mesh(box(r * 0.14, r * 0.9, r * 0.14), gold, r * 0.3, r * 1.25, -r * 0.88, body)
  b.mesh(box(r * 0.14, r * 0.14, r * 0.6), gold, r * 0.3, r * 1.45, -r * 0.88, body)
  // short sword
  weapon.position.set(r * 0.5, r * 1.3, r * 0.7)
  b.mesh(box(r * 0.14, r * 1.15, r * 0.06), steel, 0, r * 0.7, 0, weapon)
  b.mesh(box(r * 0.12, r * 0.12, r * 0.4), gold, 0, r * 0.1, 0, weapon)
  b.mesh(sph(r * 0.1, 5, 4), gold, 0, -r * 0.08, 0, weapon)
}

function buildDireMelee(b: Builder, body: THREE.Group, weapon: THREE.Group, r: number) {
  const hide = b.m('#a8402f')
  const dark = b.m('#2a1514')
  const metal = b.m('#4a4048', { metalness: 0.5, roughness: 0.5 })
  const bone = b.m('#d8cdb0')
  const rag = b.m('#5a1c1c')
  const hide2 = b.m('#b04a38')
  const ember = glow(b, '#ff6a3a', '#ff3010', 1.4)
  // thick legs
  b.mesh(cyl(r * 0.3, r * 0.34, r * 0.85, 6), dark, 0, r * 0.42, -r * 0.34, body)
  b.mesh(cyl(r * 0.3, r * 0.34, r * 0.85, 6), dark, 0, r * 0.42, r * 0.34, body)
  b.mesh(box(r * 0.55, r * 0.15, r * 0.4), metal, r * 0.1, r * 0.08, -r * 0.34, body)
  b.mesh(box(r * 0.55, r * 0.15, r * 0.4), metal, r * 0.1, r * 0.08, r * 0.34, body)
  // hulking hunched torso (tilted forward)
  const torso = b.mesh(cyl(r * 0.85, r * 0.65, r * 1.25, 7), hide, r * 0.1, r * 1.4, 0, body)
  torso.rotation.z = -0.18
  b.mesh(box(r * 0.1, r * 0.9, r * 0.9), rag, r * 0.68, r * 1.0, 0, body) // tattered loincloth/armor strip
  b.mesh(box(r * 0.1, r * 0.12, r * 1.5), ember, r * 0.2, r * 0.9, 0, body) // glowing belt
  // spiked pauldrons
  for (const s of [-1, 1]) {
    b.mesh(sph(r * 0.3, 7, 6), hide2, r * 0.1, r * 1.95, s * r * 0.85, body)
    b.mesh(cone(r * 0.14, r * 0.55, 5), bone, r * 0.1, r * 2.4, s * r * 0.9, body)
    b.mesh(cone(r * 0.1, r * 0.4, 5), bone, r * 0.1, r * 2.15, s * r * 1.2, body).rotation.x = -s * 1.2
  }
  // small head, horned helm
  b.mesh(sph(r * 0.34, 7, 6), hide, r * 0.35, r * 2.2, 0, body)
  b.mesh(new THREE.SphereGeometry(r * 0.4, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), metal, r * 0.35, r * 2.28, 0, body)
  for (const s of [-1, 1]) {
    const h = b.mesh(cone(r * 0.11, r * 0.75, 5), bone, r * 0.3, r * 2.6, s * r * 0.4, body)
    h.rotation.x = s * 0.7
  }
  b.mesh(box(r * 0.08, r * 0.1, r * 0.34), ember, r * 0.7, r * 2.2, 0, body) // eyes
  // jagged cleaver
  weapon.position.set(r * 0.4, r * 1.5, r * 1.0)
  b.mesh(box(r * 0.1, r * 0.5, r * 0.1), dark, 0, r * 0.1, 0, weapon) // haft
  b.mesh(box(r * 0.2, r * 1.2, r * 0.1), metal, r * 0.0, r * 0.95, 0, weapon)
  for (let i = 0; i < 3; i++) b.mesh(cone(r * 0.12, r * 0.3, 4), metal, -r * 0.18, r * (0.55 + i * 0.35), 0, weapon).rotation.z = Math.PI / 2
  b.mesh(cone(r * 0.12, r * 0.35, 4), ember, 0, r * 1.7, 0, weapon)
}

function buildRadiantRanged(b: Builder, body: THREE.Group, weapon: THREE.Group, r: number) {
  const robe = b.m('#3a8a4a')
  const cloth = b.m('#e8efd8')
  const dark = b.m('#215a30')
  const skin = b.m('#e0c0a0')
  const wood = b.m('#6a4420')
  const gold = b.m('#e8c050', { metalness: 0.5, roughness: 0.4 })
  const orbM = glow(b, '#a8ffb0', '#40ff70', 1.6)
  // robe
  b.mesh(cone(r * 0.85, r * 1.8, 8), robe, 0, r * 0.9, 0, body)
  b.mesh(cyl(r * 0.55, r * 0.6, r * 0.14, 8), cloth, 0, r * 1.1, 0, body) // sash
  b.mesh(box(r * 0.06, r * 1.2, r * 0.36), cloth, r * 0.52, r * 0.85, 0, body).rotation.z = -0.1
  b.mesh(cyl(r * 0.3, r * 0.5, r * 0.6, 7), robe, 0, r * 1.7, 0, body) // chest
  // head + hood
  b.mesh(sph(r * 0.32, 7, 6), skin, r * 0.1, r * 2.05, 0, body)
  const hood = b.mesh(cone(r * 0.5, r * 0.85, 7), dark, -r * 0.08, r * 2.25, 0, body)
  hood.rotation.z = 0.15
  b.mesh(box(r * 0.06, r * 0.1, r * 0.3), orbM, r * 0.38, r * 2.08, 0, body) // glowing eyes
  // shoulder mantle
  b.mesh(cyl(r * 0.6, r * 0.7, r * 0.2, 8), b.m('#7cc872'), 0, r * 1.9, 0, body)
  // staff
  weapon.position.set(r * 0.55, r * 0.9, r * 0.55)
  b.mesh(cyl(r * 0.07, r * 0.07, r * 2.0, 5), wood, 0, r * 0.75, 0, weapon)
  b.mesh(cyl(r * 0.16, r * 0.1, r * 0.3, 6), gold, 0, r * 1.8, 0, weapon)
  const orb = b.mesh(sph(r * 0.27, 8, 7), orbM, 0, r * 2.08, 0, weapon)
  orb.castShadow = false
  for (const s of [-1, 1]) b.mesh(cone(r * 0.06, r * 0.35, 4), gold, 0, r * 2.0, s * r * 0.26, weapon)
}

function buildDireRanged(b: Builder, body: THREE.Group, weapon: THREE.Group, r: number) {
  const bone = b.m('#d8cdb0')
  const robe = b.m('#4a1620')
  const dark = b.m('#20101a')
  const wood = b.m('#3a2418')
  const ember = glow(b, '#ff5a40', '#ff1a10', 1.8)
  // tattered robe with ragged hem
  b.mesh(cone(r * 0.8, r * 1.5, 7), robe, -r * 0.1, r * 0.75, 0, body)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    b.mesh(cone(r * 0.14, r * 0.5, 4), robe, -r * 0.1 + Math.cos(a) * r * 0.7, r * 0.2, Math.sin(a) * r * 0.7, body).rotation.x = Math.PI
  }
  // hunched spine/torso
  const torso = b.mesh(cyl(r * 0.4, r * 0.55, r * 0.9, 6), dark, r * 0.05, r * 1.55, 0, body)
  torso.rotation.z = -0.35
  // ribs/spikes on back
  for (let i = 0; i < 3; i++) b.mesh(cone(r * 0.08, r * 0.4, 4), bone, -r * 0.4, r * (1.4 + i * 0.28), 0, body).rotation.z = 1.9
  // skull head + hood + horns
  b.mesh(sph(r * 0.33, 7, 6), bone, r * 0.4, r * 2.0, 0, body)
  b.mesh(box(r * 0.25, r * 0.14, r * 0.3), bone, r * 0.62, r * 1.88, 0, body) // jaw
  b.mesh(box(r * 0.06, r * 0.12, r * 0.4), ember, r * 0.67, r * 2.05, 0, body) // eyes
  const hood = b.mesh(cone(r * 0.48, r * 0.7, 6), dark, r * 0.25, r * 2.3, 0, body)
  hood.rotation.z = -0.35
  for (const s of [-1, 1]) {
    b.mesh(cone(r * 0.09, r * 0.6, 4), bone, r * 0.3, r * 2.5, s * r * 0.32, body).rotation.x = s * 0.6
    b.mesh(sph(r * 0.2, 6, 5), dark, r * 0.1, r * 1.85, s * r * 0.55, body) // shoulders
  }
  // curved bow (weapon): arc built from rotated boxes, string as a thin box
  weapon.position.set(r * 0.7, r * 1.0, r * 0.55)
  b.mesh(box(r * 0.1, r * 0.8, r * 0.1), wood, 0, r * 0.1, 0, weapon).rotation.z = 0.0
  b.mesh(box(r * 0.1, r * 0.7, r * 0.1), wood, r * 0.22, r * 0.75, 0, weapon).rotation.z = -0.4
  b.mesh(box(r * 0.1, r * 0.7, r * 0.1), wood, r * 0.22, -r * 0.55, 0, weapon).rotation.z = 0.4
  b.mesh(cone(r * 0.1, r * 0.4, 4), bone, r * 0.4, r * 1.2, 0, weapon).rotation.z = -0.9
  b.mesh(box(r * 0.03, r * 2.0, r * 0.03), ember, -r * 0.1, r * 0.1, 0, weapon) // glowing string
  const orb = b.mesh(sph(r * 0.18, 6, 5), ember, r * 0.1, r * 0.1, 0, weapon)
  orb.castShadow = false
}
