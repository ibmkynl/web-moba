import * as THREE from 'three'
import { Builder, Model, TEAM, box, cone, cyl, sph } from './modelkit'

/** "Hop": a bird riding a red e-scooter that carries items across the map. Faces +X. */
export function buildCourier(team: number, r: number): Model {
  const b = new Builder()
  const g = new THREE.Group()
  const body = new THREE.Group()
  g.add(body)
  const t = TEAM[team]
  const red = b.m('#d8222a', { roughness: 0.35, metalness: 0.35 })
  const redDark = b.m('#8a1218', { roughness: 0.5, metalness: 0.3 })
  const black = b.m('#1c1c22', { roughness: 0.8 })
  const chrome = b.m('#c8ccd6', { metalness: 0.8, roughness: 0.25 })
  const glow = b.m('#fff4c0', { emissive: new THREE.Color('#ffe9a0'), emissiveIntensity: 1.6 })
  const led = b.m(t, { emissive: new THREE.Color(t), emissiveIntensity: 1.1 })
  const fur = b.m(team === 0 ? '#f0e8d0' : '#6a4a42')
  const dark = b.m(team === 0 ? '#bfb28e' : '#3a2622')
  const gold = b.m('#e8c858', { metalness: 0.6, roughness: 0.4 })
  const feather = b.m(team === 0 ? '#ffffff' : '#c8483a', { side: THREE.DoubleSide })

  // ---- scooter
  const wheelY = r * 0.5
  const wheels = new THREE.Group()
  for (const x of [-r * 1.3, r * 1.45]) {
    const w = new THREE.Group()
    w.position.set(x, wheelY, 0)
    const tyre = b.mesh(cyl(r * 0.5, r * 0.5, r * 0.34, 14), black, 0, 0, 0, w)
    tyre.rotation.x = Math.PI / 2
    const hub = b.mesh(cyl(r * 0.28, r * 0.28, r * 0.38, 10), chrome, 0, 0, 0, w)
    hub.rotation.x = Math.PI / 2
    b.mesh(box(r * 0.08, r * 0.7, r * 0.4), redDark, 0, 0, 0, w) // spoke bar so the spin is visible
    wheels.add(w)
  }
  body.add(wheels)
  // deck and rear fender
  b.mesh(box(r * 2.5, r * 0.22, r * 0.85), red, 0, wheelY + r * 0.3, 0, body)
  b.mesh(box(r * 2.3, r * 0.06, r * 0.9), led, 0, wheelY + r * 0.16, 0, body) // underglow strip
  const fender = b.mesh(cyl(r * 0.62, r * 0.62, r * 0.5, 12, ), red, -r * 1.3, wheelY + r * 0.1, 0, body)
  fender.rotation.x = Math.PI / 2
  fender.scale.set(1, 1, 0.6)
  b.mesh(box(r * 0.5, r * 0.22, r * 0.7), redDark, -r * 1.55, wheelY + r * 0.55, 0, body) // battery pack
  // steering column, handlebar, headlight
  const col = b.mesh(cyl(r * 0.07, r * 0.09, r * 1.9, 6), chrome, r * 1.3, wheelY + r * 1.15, 0, body)
  col.rotation.z = -0.22
  b.mesh(cyl(r * 0.07, r * 0.07, r * 1.1, 6), black, r * 1.08, wheelY + r * 2.0, 0, body).rotation.x = Math.PI / 2
  b.mesh(sph(r * 0.13, 6, 6), black, r * 1.08, wheelY + r * 2.0, r * 0.55, body)
  b.mesh(sph(r * 0.13, 6, 6), black, r * 1.08, wheelY + r * 2.0, -r * 0.55, body)
  b.mesh(box(r * 0.28, r * 0.24, r * 0.4), red, r * 1.28, wheelY + r * 1.75, 0, body) // dash
  b.mesh(sph(r * 0.2, 8, 6), glow, r * 1.52, wheelY + r * 1.6, 0, body) // headlight
  b.mesh(box(r * 0.12, r * 0.1, r * 0.3), led, -r * 1.85, wheelY + r * 0.5, 0, body) // tail light

  // ---- bird (Hop) standing on the deck
  const bodyY = wheelY + r * 1.05
  const torso = b.mesh(sph(r * 0.75, 10, 8), fur, -r * 0.15, bodyY + r * 0.35, 0, body)
  torso.scale.set(1.15, 1.1, 0.95)
  const belly = b.mesh(sph(r * 0.6, 8, 7), dark, r * 0.05, bodyY + r * 0.2, 0, body)
  belly.scale.set(1, 0.9, 0.8)
  b.mesh(sph(r * 0.46, 9, 7), fur, r * 0.45, bodyY + r * 1.15, 0, body) // head
  b.mesh(cone(r * 0.18, r * 0.5, 6), gold, r * 0.95, bodyY + r * 1.08, 0, body).rotation.z = -Math.PI / 2 // beak
  for (const s of [-1, 1]) {
    b.mesh(sph(r * 0.12, 6, 6), b.m('#ffffff'), r * 0.78, bodyY + r * 1.25, s * r * 0.26, body)
    b.mesh(sph(r * 0.07, 5, 5), b.m('#101010'), r * 0.86, bodyY + r * 1.26, s * r * 0.27, body)
  }
  b.mesh(cone(r * 0.14, r * 0.55, 5), led, r * 0.35, bodyY + r * 1.65, 0, body) // crest
  // helmet strap-less goggles band
  b.mesh(box(r * 0.2, r * 0.1, r * 0.78), black, r * 0.7, bodyY + r * 1.3, 0, body)
  // tail feathers
  const tail = b.mesh(cone(r * 0.4, r * 1.2, 6), dark, -r * 1.05, bodyY + r * 0.45, 0, body)
  tail.rotation.z = Math.PI / 2 + 0.3
  // legs on the deck + saddle bags
  for (const s of [-1, 1]) {
    b.mesh(cyl(r * 0.09, r * 0.09, r * 0.6, 5), gold, r * 0.1, wheelY + r * 0.7, s * r * 0.28, body)
    b.mesh(box(r * 0.45, r * 0.55, r * 0.34), led, -r * 0.6, wheelY + r * 0.65, s * r * 0.62, body)
    b.mesh(box(r * 0.42, r * 0.08, r * 0.38), gold, -r * 0.6, wheelY + r * 0.96, s * r * 0.62, body)
  }
  // wings reach forward to the handlebar (arm-like, flapped lightly by the renderer)
  const wings = new THREE.Group()
  wings.position.set(r * 0.25, bodyY + r * 0.6, 0)
  for (const s of [-1, 1]) {
    const w = new THREE.Group()
    w.position.z = s * r * 0.55
    for (let i = 0; i < 3; i++) {
      const f = b.mesh(box(r * (0.95 - i * 0.12), r * 0.07, r * 0.28), feather, r * (0.25 + i * 0.12), -r * i * 0.1, s * r * i * 0.06, w)
      f.castShadow = false
    }
    w.userData.side = s
    wings.add(w)
  }
  body.add(wings)
  g.userData.wings = wings
  g.userData.wheels = wheels
  return { group: g, body, height: r * 3.2, mats: b.mats }
}
