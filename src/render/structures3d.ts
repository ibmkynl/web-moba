import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Model, TEAM } from './modelkit'

/* ------------------------------------------------------------------ helpers */

const GOLD = '#e2b94a'

/**
 * Collects building geometry and merges it into very few meshes
 * (one for lit/vertex-coloured stone, one for emissive parts) so a whole
 * building costs only a couple of draw calls.
 */
class Parts {
  private solid: THREE.BufferGeometry[] = []
  private glow: THREE.BufferGeometry[] = []

  private bake(g: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, order: THREE.EulerOrder) {
    const o = new THREE.Object3D()
    o.rotation.order = order
    o.position.set(x, y, z)
    o.rotation.set(rx, ry, rz)
    o.scale.set(sx, sy, sz)
    o.updateMatrix()
    g.applyMatrix4(o.matrix)
    const ng = g.index ? g.toNonIndexed() : g
    ng.deleteAttribute('uv')
    return ng
  }

  /** Lit part with a baked colour. */
  s(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order: THREE.EulerOrder = 'XYZ') {
    const ng = this.bake(g, x, y, z, rx, ry, rz, sx, sy, sz, order)
    const c = new THREE.Color(color)
    const n = ng.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r
      arr[i * 3 + 1] = c.g
      arr[i * 3 + 2] = c.b
    }
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    this.solid.push(ng)
  }

  /** Emissive (team coloured) part. */
  g(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order: THREE.EulerOrder = 'XYZ') {
    this.glow.push(this.bake(g, x, y, z, rx, ry, rz, sx, sy, sz, order))
  }

  /** Cylinder standing on y0. */
  cyl(color: string, rt: number, rb: number, h: number, y0: number, seg = 8, x = 0, z = 0, ry = 0) {
    this.s(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y0 + h / 2, z, 0, ry, 0)
  }

  /** Cone standing on y0. */
  cone(color: string, rad: number, h: number, y0: number, seg = 8, x = 0, z = 0, ry = 0) {
    this.s(new THREE.ConeGeometry(rad, h, seg), color, x, y0 + h / 2, z, 0, ry, 0)
  }

  /** Spike on the ring (angle a, radius R) leaning outwards. */
  spike(color: string, a: number, R: number, y0: number, rad: number, h: number, tilt: number, seg = 4, glow = false) {
    const g = new THREE.ConeGeometry(rad, h, seg)
    g.translate(0, h / 2, 0)
    const x = Math.cos(a) * R
    const z = Math.sin(a) * R
    if (glow) this.g(g, x, y0, z, 0, -a, -tilt, 1, 1, 1, 'YXZ')
    else this.s(g, color, x, y0, z, 0, -a, -tilt, 1, 1, 1, 'YXZ')
  }

  mesh(solidMat: THREE.Material, glowMat: THREE.Material, parent: THREE.Object3D) {
    if (this.solid.length) {
      const m = new THREE.Mesh(mergeGeometries(this.solid, false)!, solidMat)
      m.castShadow = true
      parent.add(m)
    }
    if (this.glow.length) {
      const m = new THREE.Mesh(mergeGeometries(this.glow, false)!, glowMat)
      m.castShadow = false
      parent.add(m)
    }
  }
}

const mats = (team: number) => {
  const t = TEAM[team]
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: team === 0 ? 0.62 : 0.55, metalness: team === 0 ? 0.12 : 0.22 })
  if (team === 1) {
    solid.color.setRGB(2.8, 2.4, 2.4)
    solid.emissive.set('#2a0c08')
  }
  const glow = new THREE.MeshStandardMaterial({ color: t, emissive: new THREE.Color(t), emissiveIntensity: team === 0 ? 1.0 : 0.95, roughness: 0.3, flatShading: true })
  return { solid, glow }
}

const ring = (n: number, f: (a: number, i: number) => void, off = 0) => {
  for (let i = 0; i < n; i++) f((i / n) * Math.PI * 2 + off, i)
}

const crystalGeo = (rad: number) => new THREE.OctahedronGeometry(rad, 0)
const sphereG = (rad: number) => new THREE.SphereGeometry(rad, 8, 6)

function crystalMesh(glow: THREE.Material, rad: number, sy = 1.6) {
  const m = new THREE.Mesh(crystalGeo(rad), glow)
  m.scale.y = sy
  m.castShadow = false
  return m
}

function shieldMesh(rad: number, y: number, team: number) {
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(rad, 16, 12),
    new THREE.MeshBasicMaterial({ color: team === 0 ? '#8affc0' : '#ff8a6a', transparent: true, opacity: 0.12, depthWrite: false }),
  )
  shield.position.y = y
  return shield
}

function rubbleGroup(team: number, r: number, count: number, spread: number, solid: THREE.Material, glow: THREE.Material) {
  const p = new Parts()
  let s = 7 + team * 13
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const dark = team === 0 ? ['#b8b29c', '#9a947f', '#d6d0ba'] : ['#2a242e', '#1b1720', '#3a323e']
  for (let i = 0; i < count; i++) {
    const a = rnd() * 6.28
    const d = rnd() * spread * r
    const w = r * (0.18 + rnd() * 0.3)
    p.s(new THREE.BoxGeometry(w, w * (0.5 + rnd() * 0.6), w * (0.7 + rnd() * 0.5)), dark[i % 3], Math.cos(a) * d, w * 0.25, Math.sin(a) * d, rnd() * 0.6, rnd() * 6.28, rnd() * 0.6)
  }
  p.cyl(dark[0], r * 0.55, r * 0.8, r * 0.35, 0, 8)
  for (let i = 0; i < 4; i++) {
    const a = rnd() * 6.28
    p.g(new THREE.OctahedronGeometry(r * 0.07, 0), Math.cos(a) * r * 0.5, r * 0.1, Math.sin(a) * r * 0.5)
  }
  const g = new THREE.Group()
  p.mesh(solid, glow, g)
  g.visible = false
  return g
}

/* ------------------------------------------------------------------- towers */

export function buildTower(team: number, r: number): Model {
  const { solid, glow } = mats(team)
  const g = new THREE.Group()
  const alive = new THREE.Group()
  g.add(alive)
  const p = new Parts()

  if (team === 0) {
    // Radiant: white marble tiers, gold bands, open pavilion with a green crown
    p.cyl('#b9b39e', r * 1.5, r * 1.65, r * 0.2, 0, 8)
    p.cyl('#d8d2ba', r * 1.25, r * 1.4, r * 0.2, r * 0.2, 8)
    p.cyl('#e6e0cc', r * 0.85, r * 1.1, r * 1.3, r * 0.4, 8)
    p.cyl(GOLD, r * 0.99, r * 1.0, r * 0.09, r * 0.75, 8)
    p.cyl(GOLD, r * 0.9, r * 0.92, r * 0.09, r * 1.5, 8)
    p.cyl(GOLD, r * 1.18, r * 0.92, r * 0.2, r * 1.7, 8)
    p.cyl('#e9e4d2', r * 0.7, r * 0.85, r * 0.9, r * 1.9, 8)
    p.cyl(GOLD, r * 1.0, r * 1.0, r * 0.12, r * 2.8, 8)
    // buttresses
    ring(4, (a) => p.spike('#cfc8b0', a + Math.PI / 4, r * 1.0, r * 0.4, r * 0.16, r * 1.45, 0.08, 6))
    // pavilion columns + roof
    ring(6, (a) => p.cyl('#f4efdc', r * 0.07, r * 0.08, r * 0.8, r * 2.92, 6, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78))
    p.cyl(GOLD, r * 1.3, r * 1.3, r * 0.08, r * 3.72, 8)
    p.cone('#3f9e63', r * 1.25, r * 0.8, r * 3.8, 8)
    p.cyl(GOLD, r * 0.03, r * 0.07, r * 0.55, r * 4.55, 6)
    // hanging banners
    ring(4, (a) => {
      const bx = Math.cos(a) * r * 0.99
      const bz = Math.sin(a) * r * 0.99
      p.s(new THREE.BoxGeometry(r * 0.03, r * 0.95, r * 0.34), '#3fb560', bx, r * 1.05, bz, 0, -a, 0)
      p.s(new THREE.BoxGeometry(r * 0.06, r * 0.06, r * 0.44), GOLD, bx * 1.01, r * 1.55, bz * 1.01, 0, -a, 0)
    }, Math.PI / 4 + 0.0)
    // lanterns
    ring(4, (a) => {
      const x = Math.cos(a) * r * 1.5
      const z = Math.sin(a) * r * 1.5
      p.cyl('#b9b39e', r * 0.05, r * 0.07, r * 0.4, r * 0.2, 5, x, z)
      p.g(sphereG(r * 0.1), x, r * 0.68, z)
    }, 0.3)
    p.g(sphereG(r * 0.3), 0, r * 3.35, 0)
  } else {
    // Dire: black volcanic spire, glowing cracks, clawed crown
    p.cyl('#26212a', r * 1.6, r * 1.85, r * 0.22, 0, 6)
    ring(8, (a) => p.spike('#17131a', a, r * 1.5, r * 0.15, r * 0.17, r * 0.95, 0.5, 4))
    p.cyl('#352e38', r * 0.8, r * 1.15, r * 1.5, r * 0.22, 6)
    ring(6, (a) => p.g(new THREE.BoxGeometry(r * 0.05, r * 1.15, r * 0.035), Math.cos(a) * r * 0.98, r * 0.95, Math.sin(a) * r * 0.98, 0, -a - Math.PI / 2, 0))
    p.cyl('#201b24', r * 1.15, r * 0.75, r * 0.35, r * 1.72, 6)
    p.cyl('#3a323d', r * 0.55, r * 0.75, r * 0.9, r * 2.07, 6)
    p.cyl('#26202a', r * 1.05, r * 0.6, r * 0.3, r * 2.97, 6)
    ring(6, (a) => p.spike('#15111a', a, r * 0.78, r * 3.0, r * 0.16, r * 1.25, 0.38, 4), 0.3)
    ring(3, (a) => {
      // tattered banners
      const bx = Math.cos(a) * r * 0.95
      const bz = Math.sin(a) * r * 0.95
      p.s(new THREE.BoxGeometry(r * 0.03, r * (0.8 + (a % 0.5)), r * 0.26), '#6a1812', bx, r * 1.25, bz, 0.05, -a, 0.06)
    }, 0.6)
    p.g(new THREE.TorusGeometry(r * 1.38, r * 0.04, 4, 24), 0, r * 0.24, 0, Math.PI / 2)
    p.g(sphereG(r * 0.36), 0, r * 3.6, 0)
  }
  p.mesh(solid, glow, alive)

  // spinning crown crystal
  const spin = new THREE.Group()
  spin.position.y = r * (team === 0 ? 5.05 : 4.7)
  spin.add(crystalMesh(glow, r * 0.4))
  if (team === 1) {
    const ps = new Parts()
    ring(3, (a) => ps.g(new THREE.OctahedronGeometry(r * 0.1, 0), Math.cos(a) * r * 0.62, Math.sin(a * 2) * r * 0.2, Math.sin(a) * r * 0.62))
    ps.mesh(solid, glow, spin)
  }
  alive.add(spin)

  const shield = shieldMesh(r * 2.4, r * 1.9, team)
  g.add(shield)
  const rubble = rubbleGroup(team, r, 9, 1.0, solid, glow)
  g.add(rubble)
  return { group: g, spin, height: r * 5.6, mats: [solid, glow], alive, rubble, shield }
}

/* ------------------------------------------------------------------ ancient */

export function buildAncient(team: number, r: number): Model {
  const { solid, glow } = mats(team)
  const g = new THREE.Group()
  const alive = new THREE.Group()
  g.add(alive)
  const p = new Parts()

  if (team === 0) {
    // Radiant: white-and-gold tiered throne crowned with leaf petals
    p.cyl('#b9b39e', r * 1.7, r * 1.85, r * 0.12, 0, 8)
    p.cyl('#d6d0b8', r * 1.45, r * 1.6, r * 0.14, r * 0.12, 8)
    p.cyl('#e8e2cc', r * 1.2, r * 1.35, r * 0.16, r * 0.26, 8)
    p.cyl('#efe9d4', r * 0.5, r * 0.85, r * 1.6, r * 0.42, 8)
    p.cyl(GOLD, r * 0.82, r * 0.84, r * 0.08, r * 0.9, 8)
    p.cyl(GOLD, r * 0.65, r * 0.68, r * 0.08, r * 1.55, 8)
    p.cyl(GOLD, r * 0.75, r * 0.62, r * 0.5, r * 2.02, 8)
    p.cyl('#f0ead6', r * 0.55, r * 0.7, r * 0.9, r * 2.52, 8)
    // side colonnade
    ring(4, (a) => {
      const x = Math.cos(a) * r * 1.0
      const z = Math.sin(a) * r * 1.0
      p.cyl('#e6e0cc', r * 0.14, r * 0.2, r * 1.3, r * 0.42, 6, x, z)
      p.cyl(GOLD, r * 0.22, r * 0.18, r * 0.1, r * 1.72, 6, x, z)
      p.g(sphereG(r * 0.14), x, r * 1.95, z)
    }, Math.PI / 4)
    // leaf-petal crown
    ring(8, (a) => {
      const bx = Math.cos(a) * r * 0.5
      const bz = Math.sin(a) * r * 0.5
      const geo = new THREE.ConeGeometry(r * 0.2, r * 1.3, 4)
      geo.translate(0, r * 0.65, 0)
      p.s(geo, a % 2 < 1 ? '#4fb070' : '#68c488', bx, r * 3.42, bz, 0, -a, -0.5, 1, 1, 0.4, 'YXZ')
    })
    // hanging banners + braziers
    ring(4, (a) => {
      const bx = Math.cos(a) * r * 0.74
      const bz = Math.sin(a) * r * 0.74
      p.s(new THREE.BoxGeometry(r * 0.03, r * 1.1, r * 0.3), '#3fb560', bx, r * 1.95, bz, 0, -a, 0)
    })
    ring(4, (a) => {
      const x = Math.cos(a) * r * 1.5
      const z = Math.sin(a) * r * 1.5
      p.cyl('#b9b39e', r * 0.08, r * 0.14, r * 0.42, r * 0.42, 6, x, z)
      p.g(sphereG(r * 0.17), x, r * 0.95, z)
    }, 0.4)
    p.g(sphereG(r * 0.45), 0, r * 3.85, 0)
  } else {
    // Dire: obsidian ziggurat with a fanged monolith
    const tiers: Array<[number, string, number]> = [
      [2.05, '#241f29', 0],
      [1.7, '#2c2630', 0.28],
      [1.35, '#342d38', 0.56],
      [1.0, '#3c3441', 0.84],
    ]
    tiers.forEach(([R, col, y0], i) => {
      p.s(new THREE.CylinderGeometry(r * R * 0.9, r * R, r * 0.28, 4), col, 0, r * (y0 + 0.14), 0, 0, Math.PI / 4, 0)
      if (i) p.g(new THREE.CylinderGeometry(r * R * 1.03, r * R * 1.03, r * 0.025, 4), 0, r * (y0 + 0.01), 0, 0, Math.PI / 4, 0)
    })
    p.s(new THREE.CylinderGeometry(r * 0.2, r * 0.62, r * 2.2, 4), '#1c1822', 0, r * (1.12 + 1.1), 0, 0, Math.PI / 4, 0)
    p.s(new THREE.ConeGeometry(r * 0.2, r * 1.1, 4), '#26202c', 0, r * (3.32 + 0.55), 0, 0, Math.PI / 4, 0)
    ring(4, (a) => {
      p.spike('#17131a', a, r * 0.66, r * 1.12, r * 0.22, r * 1.9, 0.28, 4)
      p.g(new THREE.BoxGeometry(r * 0.05, r * 1.7, r * 0.03), Math.cos(a + Math.PI / 4) * r * 0.36, r * 2.2, Math.sin(a + Math.PI / 4) * r * 0.36, 0, -(a + Math.PI / 4) - Math.PI / 2, 0)
    })
    ring(4, (a) => {
      const x = Math.cos(a) * r * 1.62
      const z = Math.sin(a) * r * 1.62
      p.s(new THREE.CylinderGeometry(r * 0.08, r * 0.25, r * 1.25, 4), '#17131a', x, r * (0.28 + 0.625), z, 0, Math.PI / 4, 0)
      p.g(sphereG(r * 0.16), x, r * 1.65, z)
    }, Math.PI / 4)
    p.g(new THREE.TorusGeometry(r * 2.1, r * 0.04, 4, 32), 0, r * 0.08, 0, Math.PI / 2)
    p.g(sphereG(r * 0.35), 0, r * 3.7, 0)
  }
  p.mesh(solid, glow, alive)

  const spin = new THREE.Group()
  spin.position.y = r * (team === 0 ? 4.75 : 4.8)
  spin.add(crystalMesh(glow, r * 0.55, 1.7))
  const orbit = new Parts()
  ring(team === 0 ? 3 : 4, (a) => orbit.g(new THREE.OctahedronGeometry(r * 0.13, 0), Math.cos(a) * r * 0.95, Math.sin(a * 3) * r * 0.25, Math.sin(a) * r * 0.95))
  orbit.g(new THREE.TorusGeometry(r * 0.95, r * 0.02, 4, 32), 0, 0, 0, Math.PI / 2 + 0.25)
  orbit.mesh(solid, glow, spin)
  alive.add(spin)

  const shield = shieldMesh(r * 2.3, r * 1.9, team)
  g.add(shield)
  const rubble = rubbleGroup(team, r, 14, 1.3, solid, glow)
  g.add(rubble)
  return { group: g, spin, height: r * 5.5, mats: [solid, glow], alive, rubble, shield }
}

/* ----------------------------------------------------------------- fountain */

export function buildFountain(team: number, r: number): Model {
  const { solid, glow } = mats(team)
  const t = TEAM[team]
  const g = new THREE.Group()
  const p = new Parts()
  if (team === 0) {
    p.cyl('#cfc9b2', r * 1.6, r * 1.68, r * 0.2, 0, 16)
    p.cyl('#e8e2cc', r * 1.46, r * 1.5, r * 0.26, 0, 16)
    p.s(new THREE.TorusGeometry(r * 1.48, r * 0.045, 5, 24), GOLD, 0, r * 0.27, 0, Math.PI / 2)
    p.cyl('#e6e0cc', r * 0.35, r * 0.5, r * 0.5, r * 0.2, 10)
    p.cyl(GOLD, r * 0.38, r * 0.38, r * 0.05, r * 0.7, 10)
    p.cyl('#d8d2ba', r * 0.22, r * 0.3, r * 0.4, r * 0.75, 10)
    p.cyl('#f0ead6', r * 0.06, r * 0.14, r * 1.25, r * 1.15, 8)
    p.cone(GOLD, r * 0.09, r * 0.35, r * 2.4, 8)
    ring(4, (a) => {
      const x = Math.cos(a) * r * 1.75
      const z = Math.sin(a) * r * 1.75
      p.cyl('#e6e0cc', r * 0.1, r * 0.14, r * 0.6, 0, 6, x, z)
      p.g(sphereG(r * 0.13), x, r * 0.75, z)
    }, Math.PI / 4)
  } else {
    p.cyl('#26212a', r * 1.6, r * 1.72, r * 0.22, 0, 10)
    p.cyl('#342d38', r * 1.46, r * 1.5, r * 0.28, 0, 10)
    ring(10, (a) => p.spike('#15111a', a, r * 1.55, r * 0.1, r * 0.13, r * 0.9, 0.45, 4), 0.2)
    p.cyl('#1c1822', r * 0.22, r * 0.5, r * 0.7, r * 0.2, 5)
    p.s(new THREE.ConeGeometry(r * 0.2, r * 1.5, 5), '#26202c', 0, r * (0.9 + 0.75), 0)
    p.g(new THREE.TorusGeometry(r * 0.52, r * 0.03, 4, 16), 0, r * 0.62, 0, Math.PI / 2)
    ring(4, (a) => {
      const x = Math.cos(a) * r * 1.75
      const z = Math.sin(a) * r * 1.75
      p.s(new THREE.CylinderGeometry(r * 0.05, r * 0.16, r * 0.85, 4), '#17131a', x, r * 0.42, z, 0, Math.PI / 4, 0)
      p.g(sphereG(r * 0.12), x, r * 0.95, z)
    }, Math.PI / 4)
  }
  p.mesh(solid, glow, g)
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.34, r * 1.34, r * 0.05, 20),
    new THREE.MeshStandardMaterial({ color: t, emissive: new THREE.Color(t), emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }),
  )
  water.position.y = r * 0.2
  g.add(water)
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.2, r * 0.55, r * 2.4, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: t, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  )
  beam.position.y = r * 1.4
  g.add(beam)
  const spin = new THREE.Group()
  spin.position.y = r * (team === 0 ? 2.9 : 2.7)
  spin.add(crystalMesh(glow, r * 0.3, 1.9))
  g.add(spin)
  return { group: g, spin, height: r * 3.3, mats: [solid, glow, water.material as THREE.MeshStandardMaterial] }
}
