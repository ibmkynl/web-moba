import * as THREE from 'three'
import type { CustomVfx, Vfx } from './vfx'

/**
 * Hero-specific visual effects (g3): Crystal Maiden, Pugna, Silencer.
 * Key = effect name used with `w.vfx(name, opts)`. Coordinates: game (x, y) -> three (x, height, y).
 */

type PosOf = ((u: { x: number; y: number }) => THREE.Vector3 | null | undefined) | undefined
type V3 = THREE.Vector3

const PI = Math.PI
const P = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, y)
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const easeOut = (k: number) => 1 - (1 - k) * (1 - k)
const easeOutBack = (k: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
}
const ADD = THREE.AdditiveBlending

function disposeObj(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    m.geometry?.dispose()
    const mt = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mt)) mt.forEach((x) => x.dispose())
    else mt?.dispose?.()
  })
}

/** Add an object to the scene for `dur` seconds; `step(k, dt, t)` animates it (return false to end early). */
function anim(v: Vfx, obj: THREE.Object3D, dur: number, step: (k: number, dt: number, t: number) => boolean | void) {
  v.scene.add(obj)
  let t = 0
  let done = false
  const end = () => {
    if (done) return
    done = true
    v.scene.remove(obj)
    disposeObj(obj)
  }
  v.live.push({
    update: (dt: number) => {
      t += dt
      const k = t / dur
      if (k >= 1) {
        end()
        return false
      }
      if (step(k, dt, t) === false) {
        end()
        return false
      }
      return true
    },
    dispose: end,
  })
}

/** Run `fn` after `sec` seconds of effect time. */
function later(v: Vfx, sec: number, fn: () => void) {
  let t = 0
  v.live.push({
    update: (dt: number) => {
      t += dt
      if (t >= sec) {
        fn()
        return false
      }
      return true
    },
    dispose: () => {},
  })
}

/* ------------------------------------------------------------------ textures */

const texCache: Record<string, THREE.CanvasTexture> = {}
function mkTex(key: string, draw: (g: CanvasRenderingContext2D, s: number) => void, s = 256) {
  let t = texCache[key]
  if (!t) {
    const c = document.createElement('canvas')
    c.width = c.height = s
    draw(c.getContext('2d')!, s)
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    texCache[key] = t
  }
  return t
}

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296
    return a / 4294967296
  }
}

function circle(g: CanvasRenderingContext2D, c: number, r: number, w = 2) {
  g.lineWidth = w
  g.beginPath()
  g.arc(c, c, r, 0, PI * 2)
  g.stroke()
}

function glyphRing(g: CanvasRenderingContext2D, s: number, R: number, n: number, size: number, seed: number) {
  const rnd = rng(seed)
  const c = s / 2
  g.lineWidth = 2
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2
    g.save()
    g.translate(c + Math.cos(a) * R, c + Math.sin(a) * R)
    g.rotate(a + PI / 2)
    g.beginPath()
    let px = (rnd() - 0.5) * size
    let py = -size / 2
    g.moveTo(px, py)
    for (let k = 0; k < 3; k++) {
      px = (rnd() - 0.5) * size
      py = -size / 2 + ((k + 1) / 3) * size
      g.lineTo(px, py)
    }
    g.stroke()
    g.restore()
  }
}

function polyStar(g: CanvasRenderingContext2D, c: number, r: number, n: number, skip: number, rot = -PI / 2) {
  g.beginPath()
  for (let i = 0; i <= n; i++) {
    const a = rot + ((i * skip) / n) * PI * 2
    const x = c + Math.cos(a) * r
    const y = c + Math.sin(a) * r
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
}

const texSnow = () =>
  mkTex('snow', (g, s) => {
    const c = s / 2
    g.strokeStyle = '#fff'
    g.lineCap = 'round'
    circle(g, c, c * 0.96, 3)
    circle(g, c, c * 0.9, 1.5)
    circle(g, c, c * 0.3, 2)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2
      g.save()
      g.translate(c, c)
      g.rotate(a)
      g.lineWidth = 4
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(c * 0.82, 0)
      g.stroke()
      g.lineWidth = 2.5
      for (const f of [0.35, 0.55, 0.72]) {
        const l = c * 0.22 * (1.2 - f * 0.5)
        g.beginPath()
        g.moveTo(c * f, 0)
        g.lineTo(c * f + l * 0.6, l)
        g.moveTo(c * f, 0)
        g.lineTo(c * f + l * 0.6, -l)
        g.stroke()
      }
      g.restore()
    }
    g.lineWidth = 2
    polyStar(g, c, c * 0.5, 6, 1)
  })

const texArcane = () =>
  mkTex('arcane', (g, s) => {
    const c = s / 2
    g.strokeStyle = '#fff'
    g.lineCap = 'round'
    circle(g, c, c * 0.97, 3)
    circle(g, c, c * 0.88, 2)
    circle(g, c, c * 0.62, 2)
    glyphRing(g, s, c * 0.925, 28, c * 0.07, 7)
    glyphRing(g, s, c * 0.75, 12, c * 0.14, 21)
    g.lineWidth = 3
    polyStar(g, c, c * 0.6, 3, 1)
    polyStar(g, c, c * 0.6, 3, 1, PI / 2)
    circle(g, c, c * 0.2, 3)
    g.beginPath()
    g.arc(c, c, c * 0.12, 0.6, PI * 2 - 0.6)
    g.stroke()
    g.fillStyle = '#fff'
    g.beginPath()
    g.arc(c + c * 0.04, c, c * 0.035, 0, PI * 2)
    g.fill()
  })

const texNether = () =>
  mkTex('nether', (g, s) => {
    const c = s / 2
    g.strokeStyle = '#fff'
    g.lineCap = 'round'
    circle(g, c, c * 0.97, 3)
    circle(g, c, c * 0.84, 2)
    glyphRing(g, s, c * 0.905, 32, c * 0.06, 13)
    g.lineWidth = 3
    polyStar(g, c, c * 0.8, 5, 2)
    circle(g, c, c * 0.32, 2)
    // eye
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(c - c * 0.26, c)
    g.quadraticCurveTo(c, c - c * 0.28, c + c * 0.26, c)
    g.quadraticCurveTo(c, c + c * 0.28, c - c * 0.26, c)
    g.stroke()
    g.fillStyle = '#fff'
    g.beginPath()
    g.arc(c, c, c * 0.09, 0, PI * 2)
    g.fill()
    glyphRing(g, s, c * 0.5, 10, c * 0.09, 33)
  })

const texRunes = () =>
  mkTex('runes', (g, s) => {
    const c = s / 2
    g.strokeStyle = '#fff'
    g.lineCap = 'round'
    circle(g, c, c * 0.97, 3)
    circle(g, c, c * 0.66, 2)
    glyphRing(g, s, c * 0.815, 22, c * 0.16, 55)
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * PI * 2
      g.beginPath()
      g.moveTo(c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9)
      g.lineTo(c + Math.cos(a) * c * (i % 2 ? 0.94 : 0.96), c + Math.sin(a) * c * (i % 2 ? 0.94 : 0.96))
      g.stroke()
    }
  })

const texDisc = () =>
  mkTex('disc', (g, s) => {
    const c = s / 2
    const gr = g.createRadialGradient(c, c, 0, c, c, c)
    gr.addColorStop(0, 'rgba(255,255,255,0.9)')
    gr.addColorStop(0.7, 'rgba(255,255,255,0.55)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, s, s)
  })

/** A flat ground/air sigil (spinning group). Returns {grp, mat}. */
function sigil(tex: THREE.Texture, color: string, radius: number, opacity = 1, additive = true) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, blending: additive ? ADD : THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  m.rotation.x = -PI / 2
  m.renderOrder = 4
  const grp = new THREE.Group()
  grp.add(m)
  grp.scale.set(radius, 1, radius)
  return { grp, mat }
}

/** Sigil that spins and fades; spawns at p (ground) for `dur`. */
function groundSigil(v: Vfx, tex: THREE.Texture, color: string, p: V3, radius: number, dur: number, o: { spin?: number; y?: number; peak?: number; grow?: number; additive?: boolean } = {}) {
  const { grp, mat } = sigil(tex, color, radius, 0, o.additive !== false)
  grp.position.set(p.x, o.y ?? 3, p.z)
  const spin = o.spin ?? 0.6
  const peak = o.peak ?? 0.85
  anim(v, grp, dur, (k, _dt, t) => {
    const fin = clamp(k / 0.12)
    const fout = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1
    mat.opacity = peak * fin * fout
    grp.rotation.y = t * spin
    const s = radius * (o.grow !== undefined ? 1 + (o.grow - 1) * easeOut(k) : 1) * (0.85 + 0.15 * easeOut(clamp(k * 4)))
    grp.scale.set(s, 1, s)
  })
}

/** Soft coloured ground patch (frost, scorch). */
function groundDisc(v: Vfx, color: string, p: V3, radius: number, dur: number, opacity = 0.4, additive = true) {
  const { grp, mat } = sigil(texDisc(), color, radius, 0, additive)
  grp.position.set(p.x, 2, p.z)
  anim(v, grp, dur, (k) => {
    mat.opacity = opacity * clamp(k / 0.08) * (1 - k)
    const s = radius * (0.7 + 0.3 * easeOut(clamp(k * 3)))
    grp.scale.set(s, 1, s)
  })
}

/** Spinning horizontal rune ring that follows a unit (above its head). */
function haloRing(
  v: Vfx,
  posOf: PosOf,
  u: { x: number; y: number },
  tex: THREE.Texture,
  color: string,
  radius: number,
  dur: number,
  o: { lift?: number; spin?: number; alive?: () => boolean; peak?: number; pulse?: number } = {},
) {
  const { grp, mat } = sigil(tex, color, radius, 0, true)
  const inner = sigil(texArcane(), color, radius * 0.55, 0, true)
  inner.grp.position.y = 2
  grp.add(inner.grp)
  const lift = o.lift ?? 50
  anim(v, grp, dur, (k, _dt, t) => {
    if (o.alive && !o.alive()) return false
    const p = posOf?.(u) ?? P(u.x, u.y, 70)
    grp.position.set(p.x, p.y + lift, p.z)
    const f = clamp(t / 0.25) * clamp((dur - t) / 0.3)
    const pul = 1 + Math.sin(t * (o.pulse ?? 4)) * 0.06
    mat.opacity = (o.peak ?? 0.8) * f
    inner.mat.opacity = (o.peak ?? 0.8) * f * 0.8
    grp.rotation.y = t * (o.spin ?? 1.2)
    inner.grp.rotation.y = -t * (o.spin ?? 1.2) * 2.2
    grp.scale.set(radius * pul * (0.6 + 0.4 * easeOutBack(clamp(t / 0.3))), 1, radius * pul * (0.6 + 0.4 * easeOutBack(clamp(t / 0.3))))
    void k
  })
}

/** Glowing sprites that travel from one (moving) point to another. */
function flow(v: Vfx, from: () => V3 | null, to: () => V3 | null, color: string, n: number, dur: number, size = 22, arc = 40) {
  const grp = new THREE.Group()
  const spr: THREE.Sprite[] = []
  const off: number[] = []
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: v.tex.glow, color, transparent: true, blending: ADD, depthWrite: false }))
    s.scale.setScalar(size)
    s.renderOrder = 6
    grp.add(s)
    spr.push(s)
    off.push((Math.random() - 0.5) * 60)
  }
  const a0 = new THREE.Vector3()
  anim(v, grp, dur, (k) => {
    const a = from()
    const b = to()
    if (!a || !b) {
      grp.visible = false
      return
    }
    grp.visible = true
    a0.copy(a)
    spr.forEach((s, i) => {
      const kk = clamp((k - (i / n) * 0.45) / 0.55)
      const e = kk * kk * (3 - 2 * kk)
      s.position.lerpVectors(a0, b, e)
      s.position.y += Math.sin(kk * PI) * arc
      s.position.x += Math.sin(kk * PI) * off[i]
      ;(s.material as THREE.SpriteMaterial).opacity = Math.sin(kk * PI)
      s.scale.setScalar(size * (0.6 + 0.6 * Math.sin(kk * PI)))
    })
  })
}

/** Swirling/orbiting point cloud (snow vortex, wisps) that follows a position. */
function swirl(
  v: Vfx,
  o: {
    pos: () => V3 | null
    n: number
    r0: number
    r1: number
    h0: number
    h1: number
    color: string
    size: number
    dur: number
    spin: number
    rise: number
    alive?: () => boolean
    peak?: number
    tex?: THREE.Texture
  },
) {
  const n = o.n
  const geo = new THREE.BufferGeometry()
  const arr = new Float32Array(n * 3)
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  const rho: number[] = []
  const th: number[] = []
  const hh: number[] = []
  const om: number[] = []
  for (let i = 0; i < n; i++) {
    rho.push(o.r0 + Math.random() * (o.r1 - o.r0))
    th.push(Math.random() * PI * 2)
    hh.push(o.h0 + Math.random() * (o.h1 - o.h0))
    om.push(o.spin * (0.6 + 0.8 * Math.random()) * Math.sqrt(o.r1 / Math.max(40, rho[i])) * 0.6)
  }
  const mat = new THREE.PointsMaterial({ map: o.tex ?? v.tex.glow, color: o.color, size: o.size, transparent: true, opacity: 0, blending: ADD, depthWrite: false, sizeAttenuation: true })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  pts.renderOrder = 6
  anim(v, pts, o.dur, (_k, dt, t) => {
    if (o.alive && !o.alive()) return false
    const c = o.pos()
    if (!c) {
      pts.visible = false
      return
    }
    pts.visible = true
    mat.opacity = (o.peak ?? 0.9) * clamp(t / 0.6) * clamp((o.dur - t) / 0.8)
    for (let i = 0; i < n; i++) {
      th[i] += om[i] * dt
      hh[i] += o.rise * dt
      if (hh[i] < o.h0) hh[i] = o.h1
      else if (hh[i] > o.h1) hh[i] = o.h0
      arr[i * 3] = c.x + Math.cos(th[i]) * rho[i]
      arr[i * 3 + 1] = hh[i]
      arr[i * 3 + 2] = c.z + Math.sin(th[i]) * rho[i]
    }
    geo.attributes.position.needsUpdate = true
  })
}

/** Straight tube between two moving points (normal or additive blending). */
function tube(v: Vfx, a: () => V3 | null, b: () => V3 | null, dur: number, color: string, width: number, opacity = 0.8, additive = false) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true)
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: additive ? ADD : THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide })
  const m = new THREE.Mesh(geo, mat)
  m.renderOrder = 4
  const up = new THREE.Vector3(0, 1, 0)
  const d = new THREE.Vector3()
  anim(v, m, dur, (k, _dt, t) => {
    const pa = a()
    const pb = b()
    if (!pa || !pb) {
      m.visible = false
      return
    }
    m.visible = true
    d.subVectors(pb, pa)
    const len = Math.max(1, d.length())
    m.position.copy(pa).addScaledVector(d, 0.5)
    m.quaternion.setFromUnitVectors(up, d.normalize())
    const w = width * (0.85 + 0.25 * Math.sin(t * 40)) * (k < 0.15 ? k / 0.15 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1)
    m.scale.set(w, len, w)
    mat.opacity = opacity * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1)
  })
}

const unitP = (posOf: PosOf, u: { x: number; y: number } | undefined, fb: V3): V3 => (u && posOf?.(u)) || fb

/* ------------------------------------------------------------ ice mesh helpers */

const iceMat = (op = 0.8) =>
  new THREE.MeshStandardMaterial({ color: '#bfeaff', emissive: new THREE.Color('#5ec0ff'), emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: op, depthWrite: false })

function iceShard(h: number, r: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mat)
}

/* ===================================================================== */

export const VFX_G3: Record<string, CustomVfx> = {
  /* ------------------------------------------------------------ CRYSTAL MAIDEN */

  // Crystal Nova: icy shockwave, frost spikes, drifting snow, frost patch
  crystal_maiden_nova: (v, e) => {
    const r = e.r ?? 425
    const p = P(e.x, e.y)
    groundDisc(v, '#9fe0ff', p, r, 2.6, 0.38)
    groundSigil(v, texSnow(), '#d8f4ff', p, r * 0.92, 2.2, { spin: 0.35, peak: 0.8 })
    v.ring(p, 30, r, 0.55, '#9fe0ff', 0.1)
    later(v, 0.12, () => v.ring(p, 20, r * 0.75, 0.7, '#ffffff', 0.05))
    v.spikes(p, r * 0.85, 22, 150, 1.1, '#bfeaff')
    later(v, 0.2, () => v.spikes(p, r * 0.5, 10, 95, 0.9, '#ffffff'))
    v.column(p, r * 0.05, 300, 0.5, '#9fe0ff')
    v.emit({ pos: P(e.x, e.y, 14), kind: 'spark', color: '#ffffff', color2: '#9fe0ff', burst: 34, shape: 'donut', radius: r * 0.6, speed: [40, 150], size: [14, 30], life: [0.5, 1], force: [0, 60, 0], max: 80 })
    v.emit({ pos: P(e.x, e.y, 210), kind: 'ember', color: '#ffffff', color2: '#bfeaff', burst: 60, shape: 'sphere', radius: r * 0.7, speed: [5, 25], size: [9, 17], life: [1.2, 1.9], force: [0, -70, 0], max: 80 })
    v.emit({ pos: P(e.x, e.y, 40), color: '#9fe0ff', alpha: 0.3, burst: 1, speed: [0, 0], size: [r * 0.7, r * 0.7], life: [0.2, 0.2], sizeEnd: 1.3 })
  },

  // Frostbite: ice crystals + frozen shell encasing the victim, falling ice dust, shatter at the end
  crystal_maiden_frostbite: (v, e, posOf) => {
    const u = e.unit as any
    const dur = Math.max(0.6, Math.min(e.dur ?? 2, 10.5))
    const here = () => unitP(posOf, u, P(e.x, e.y, 60))
    if (e.x2 !== undefined) v.beam(() => P(e.x2!, e.y2!, 80), () => here(), 0.22, '#bfeaff', 10)
    const grp = new THREE.Group()
    const sm = iceMat(0.85)
    const shellMat = iceMat(0.28)
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * PI * 2 + Math.random() * 0.3
      const h = 65 + Math.random() * 60
      const s = iceShard(h, 9 + Math.random() * 6, sm)
      const rr = 30 + Math.random() * 14
      s.position.set(Math.cos(a) * rr, h / 2 - 4, Math.sin(a) * rr)
      s.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3)
      grp.add(s)
    }
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), shellMat)
    shell.scale.set(44, 70, 44)
    shell.position.y = 58
    grp.add(shell)
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 1)), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }))
    edges.scale.copy(shell.scale)
    edges.position.copy(shell.position)
    grp.add(edges)
    let shattered = false
    let last = here().clone()
    const shatter = () => {
      if (shattered) return
      shattered = true
      v.emit({ pos: last.clone().setY(60), kind: 'spark', color: '#ffffff', color2: '#9fe0ff', burst: 28, shape: 'sphere', radius: 24, speed: [60, 190], size: [12, 24], life: [0.4, 0.8], force: [0, -120, 0] })
      v.ring(P(last.x, last.z), 10, 120, 0.35, '#bfeaff', 0.1)
    }
    groundDisc(v, '#bfeaff', P(e.x, e.y), 90, Math.min(dur, 2.5), 0.4)
    v.emit({ pos: here().clone(), kind: 'spark', color: '#ffffff', color2: '#bfeaff', rate: 16, dur, shape: 'sphere', radius: 34, speed: [2, 14], size: [8, 15], life: [0.7, 1.2], force: [0, -40, 0], max: 50, follow: () => (shattered ? null : here().clone().setY(90)) })
    anim(v, grp, dur, (k, _dt, t) => {
      if (t > 0.4 && u && u.hasBuff && !u.hasBuff('frostbite')) {
        shatter()
        return false
      }
      const p = here()
      last = p
      grp.position.set(p.x, 0, p.z)
      const g = clamp(t / 0.28)
      const sc = Math.max(0.01, easeOutBack(g))
      grp.scale.set(sc, sc, sc)
      const f = k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1
      sm.opacity = 0.85 * f
      shellMat.opacity = (0.28 + Math.sin(t * 6) * 0.04) * f
      ;(edges.material as THREE.LineBasicMaterial).opacity = 0.8 * f
      shell.rotation.y = t * 0.3
      edges.rotation.y = t * 0.3
    })
    later(v, dur - 0.03, shatter)
  },

  // Arcane Aura: soft motes around Maiden and drifting to allies; occasional wide pulse
  crystal_maiden_aura: (v, e, posOf) => {
    const c = e.unit as any
    if (e.mode === 'pulse') {
      const p = P(c.x, c.y)
      v.ring(p, 40, e.r ?? 1200, 1.6, '#6fa8ff', 0.012)
      groundSigil(v, texSnow(), '#8fc0ff', p, 260, 1.8, { spin: 0.5, peak: 0.45 })
      return
    }
    if (e.mode === 'ally') {
      const a = e.ally as any
      flow(v, () => unitP(posOf, c, P(c.x, c.y, 90)).clone().setY(100), () => unitP(posOf, a, P(a.x, a.y, 70)).clone().setY(95), '#7fb8ff', 3, 1.6, 20, 50)
      v.emit({ pos: P(a.x, a.y, 60), kind: 'ember', color: '#aad4ff', color2: '#7fb8ff', burst: 5, shape: 'sphere', radius: 30, speed: [3, 12], size: [8, 14], life: [0.8, 1.3], force: [0, 40, 0], max: 12 })
      return
    }
    // self: rising motes
    v.emit({ pos: unitP(posOf, c, P(c.x, c.y, 60)).clone().setY(20), kind: 'ember', color: '#bfe0ff', color2: '#5a98ff', rate: 12, dur: 1.4, shape: 'sphere', radius: 50, speed: [3, 12], size: [8, 15], life: [0.9, 1.5], force: [0, 45, 0], max: 30, follow: () => unitP(posOf, c, P(c.x, c.y, 60)).clone().setY(20) })
  },

  // Freezing Field: persistent blizzard around the caster (swirling snow, sigil, spinning rings)
  crystal_maiden_blizzard: (v, e, posOf) => {
    const c = e.unit as any
    const dur = e.dur ?? 10
    const r = e.r ?? 800
    const here = () => unitP(posOf, c, P(c.x, c.y, 60))
    const alive = () => !c.dead && !!c.channel
    const p0 = P(c.x, c.y)
    v.ring(p0, 60, r, 0.8, '#7fd4ff', 0.05)
    v.emit({ pos: P(c.x, c.y, 60), color: '#bfeaff', alpha: 0.5, burst: 1, speed: [0, 0], size: [320, 320], life: [0.3, 0.3], sizeEnd: 1.6 })
    // big sigil on the ground, follows the caster
    const big = sigil(texSnow(), '#9fe0ff', r, 0, true)
    const ring2 = sigil(texRunes(), '#d8f4ff', r * 0.45, 0, true)
    const root = new THREE.Group()
    root.add(big.grp)
    ring2.grp.position.y = 4
    root.add(ring2.grp)
    // thin spinning rings at heights
    const rings: THREE.Mesh[] = []
    for (const [h, rr] of [[70, 200], [150, 160], [240, 120]] as [number, number][]) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(rr, 2.5, 4, 40), new THREE.MeshBasicMaterial({ color: '#bfeaff', transparent: true, opacity: 0, blending: ADD, depthWrite: false }))
      m.rotation.x = PI / 2
      m.position.y = h
      root.add(m)
      rings.push(m)
    }
    // funnel
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(260, 60, 340, 18, 1, true), new THREE.MeshBasicMaterial({ color: '#cfeeff', transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide }))
    funnel.position.y = 170
    root.add(funnel)
    anim(v, root, dur, (k, _dt, t) => {
      if (t > 0.5 && !alive()) return false
      const p = here()
      root.position.set(p.x, 0, p.z)
      const f = clamp(t / 0.7) * clamp((dur - t) / 0.9)
      big.mat.opacity = 0.55 * f
      ring2.mat.opacity = 0.5 * f
      big.grp.position.y = 3
      big.grp.rotation.y = t * 0.25
      ring2.grp.rotation.y = -t * 0.9
      rings.forEach((m, i) => {
        ;(m.material as THREE.MeshBasicMaterial).opacity = 0.35 * f
        m.rotation.z = t * (1.4 + i * 0.5) * (i % 2 ? -1 : 1)
        m.position.y = [70, 150, 240][i] + Math.sin(t * 2 + i) * 14
      })
      funnel.rotation.y = t * 1.5
      ;(funnel.material as THREE.MeshBasicMaterial).opacity = 0.07 * f
      void k
    })
    swirl(v, { pos: () => (c.dead ? null : P(here().x, here().z, 0)), n: 130, r0: 90, r1: r * 0.92, h0: 8, h1: 330, color: '#e6f6ff', size: 65, dur, spin: 1.8, rise: -55, alive: () => !c.dead && !!c.channel, peak: 0.85 })
    swirl(v, { pos: () => (c.dead ? null : P(here().x, here().z, 0)), n: 40, r0: 60, r1: 330, h0: 10, h1: 300, color: '#7fd4ff', size: 110, dur, spin: 2.4, rise: 35, alive: () => !c.dead && !!c.channel, peak: 0.4 })
  },

  // Freezing Field: one icy shard crashing down (throttled by the caller)
  crystal_maiden_ffhit: (v, e) => {
    const p = P(e.x, e.y)
    const mat = iceMat(0.95)
    const shard = new THREE.Mesh(new THREE.ConeGeometry(26, 190, 5), mat)
    shard.rotation.x = PI
    const grp = new THREE.Group()
    grp.add(shard)
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(8, 22, 260, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#bfeaff', transparent: true, opacity: 0.35, blending: ADD, depthWrite: false, side: THREE.DoubleSide }))
    glow.position.y = 190
    grp.add(glow)
    const fall = 0.26
    let landed = false
    anim(v, grp, fall + 0.01, (k) => {
      const kk = Math.min(1, k * (1 + 0.01 / fall))
      const e2 = kk * kk
      grp.position.set(p.x + (1 - e2) * 90, 640 * (1 - e2) + 95, p.z - (1 - e2) * 40)
      grp.rotation.z = Math.atan2(90, 640) * (1 - e2)
      if (kk >= 0.98 && !landed) {
        landed = true
        impact()
      }
    })
    const impact = () => {
      v.emit({ pos: P(e.x, e.y, 30), kind: 'spark', color: '#ffffff', color2: '#7fd4ff', burst: 24, shape: 'sphere', radius: 14, speed: [80, 260], size: [12, 26], life: [0.3, 0.7], force: [0, -160, 0], max: 40 })
      v.emit({ pos: P(e.x, e.y, 30), kind: 'smoke', add: false, color: '#e8f6ff', color2: '#bfeaff', alpha: 0.35, burst: 6, shape: 'sphere', radius: 20, speed: [20, 60], size: [70, 120], life: [0.5, 0.9], sizeEnd: 1.6, max: 12 })
      v.emit({ pos: P(e.x, e.y, 50), color: '#bfeaff', alpha: 0.5, burst: 1, speed: [0, 0], size: [200, 200], life: [0.12, 0.12], sizeEnd: 1.6 })
      v.ring(p, 20, e.r ?? 260, 0.45, '#bfeaff', 0.1)
      v.spikes(p, (e.r ?? 260) * 0.5, 7, 100, 0.7, '#ffffff')
      groundDisc(v, '#9fe0ff', p, (e.r ?? 260) * 0.8, 1.4, 0.35)
    }
  },

  /* ------------------------------------------------------------------ PUGNA */

  // Nether Blast: gathering sigil and a violet-green orb falling onto the target area
  pugna_nether_blast_charge: (v, e) => {
    const r = e.r ?? 400
    const dur = e.dur ?? 0.8
    const p = P(e.x, e.y)
    groundSigil(v, texNether(), '#6fe05a', p, r, dur + 0.5, { spin: -0.9, peak: 0.75 })
    groundSigil(v, texArcane(), '#b070ff', p, r * 0.6, dur + 0.3, { spin: 1.4, peak: 0.5 })
    // contracting ring
    const rg = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 56), new THREE.MeshBasicMaterial({ color: '#9aff7a', transparent: true, opacity: 0.9, blending: ADD, depthWrite: false, side: THREE.DoubleSide }))
    rg.rotation.x = -PI / 2
    const rgG = new THREE.Group()
    rgG.add(rg)
    rgG.position.set(p.x, 5, p.z)
    anim(v, rgG, dur, (k) => {
      const s = r * (1 - 0.88 * k * k)
      rgG.scale.set(s, 1, s)
    })
    // falling orb
    const orb = new THREE.Group()
    orb.add(new THREE.Mesh(new THREE.SphereGeometry(34, 14, 12), new THREE.MeshBasicMaterial({ color: '#eaffd8' })))
    orb.add(new THREE.Mesh(new THREE.SphereGeometry(62, 14, 12), new THREE.MeshBasicMaterial({ color: '#6fe05a', transparent: true, opacity: 0.45, blending: ADD, depthWrite: false })))
    orb.add(new THREE.Mesh(new THREE.SphereGeometry(92, 14, 12), new THREE.MeshBasicMaterial({ color: '#9a50ff', transparent: true, opacity: 0.2, blending: ADD, depthWrite: false })))
    let alive = true
    const start = P(e.x - 60, e.y + 40, 950)
    const end = P(e.x, e.y, 40)
    v.emit({ pos: start.clone(), color: '#6fe05a', color2: '#9a50ff', rate: 70, dur: dur + 0.2, shape: 'sphere', radius: 18, speed: [0, 20], size: [30, 56], life: [0.3, 0.6], max: 120, follow: () => (alive ? orb.position.clone() : null) })
    anim(v, orb, dur, (k) => {
      orb.position.lerpVectors(start, end, k * k)
      orb.rotation.y = k * 10
      const s = 0.6 + k * 0.7
      orb.scale.set(s, s, s)
      if (k > 0.98) alive = false
    })
    later(v, dur, () => {
      alive = false
    })
    // gathering motes
    swirl(v, { pos: () => P(e.x, e.y, 0), n: 36, r0: r * 0.25, r1: r * 0.9, h0: 6, h1: 170, color: '#9aff7a', size: 50, dur: dur + 0.2, spin: 3.2, rise: 90, peak: 0.8 })
  },

  pugna_nether_blast_hit: (v, e) => {
    const r = e.r ?? 400
    const p = P(e.x, e.y)
    v.ring(p, 40, r, 0.5, '#9aff7a', 0.12)
    v.ring(p, 20, r * 0.7, 0.75, '#b070ff', 0.07)
    later(v, 0.1, () => v.ring(p, 20, r * 1.08, 0.6, '#d8ffc0', 0.03))
    // dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, PI * 2, 0, PI / 2), new THREE.MeshBasicMaterial({ color: '#6fe05a', transparent: true, opacity: 0.5, blending: ADD, depthWrite: false, side: THREE.DoubleSide }))
    dome.position.set(p.x, 0, p.z)
    anim(v, dome, 0.5, (k) => {
      const s = r * (0.15 + 0.9 * easeOut(k))
      dome.scale.set(s, s * 0.75, s)
      ;(dome.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k) * (1 - k)
    })
    v.column(p, r * 0.2, 480, 0.6, '#9aff7a')
    v.emit({ pos: P(e.x, e.y, 20), color: '#6fe05a', color2: '#d8ffc0', burst: 55, shape: 'donut', radius: r * 0.5, speed: [50, 200], size: [18, 40], life: [0.5, 1], force: [0, 160, 0], max: 80 })
    v.emit({ pos: P(e.x, e.y, 40), kind: 'smoke', add: false, color: '#1c3a20', color2: '#0c1a10', alpha: 0.55, burst: 14, shape: 'sphere', radius: r * 0.35, speed: [20, 90], size: [90, 160], life: [0.9, 1.6], sizeEnd: 1.5, force: [0, 30, 0], max: 24 })
    v.emit({ pos: P(e.x, e.y, 60), kind: 'spark', color: '#ffffff', color2: '#b070ff', burst: 24, shape: 'sphere', radius: 20, speed: [120, 320], size: [14, 28], life: [0.3, 0.7], max: 40 })
    v.emit({ pos: P(e.x, e.y, 70), color: '#c8ffa0', alpha: 0.6, burst: 1, speed: [0, 0], size: [r * 0.8, r * 0.8], life: [0.16, 0.16], sizeEnd: 1.5 })
    groundDisc(v, '#0c2a10', p, r * 0.8, 2.2, 0.55, false)
    groundSigil(v, texNether(), '#6fe05a', p, r * 0.7, 1.4, { spin: 0.4, peak: 0.4 })
  },

  // Decrepify: pale-green banishing swirl, ghost shell
  pugna_decrepify: (v, e, posOf) => {
    const u = e.unit as any
    const dur = e.dur ?? 3.5
    const here = () => unitP(posOf, u, P(e.x, e.y, 60))
    const p = P(e.x, e.y)
    if (e.x2 !== undefined) v.beam(() => P(e.x2!, e.y2!, 90), () => here(), 0.25, '#b8f0a0', 9, 14)
    v.ring(p, 10, 150, 0.6, '#b8f0a0', 0.08)
    groundSigil(v, texNether(), '#b8f0a0', p, 130, 1.4, { spin: 1.2, peak: 0.6 })
    v.emit({ pos: P(e.x, e.y, 60), kind: 'ember', color: '#e4ffd8', color2: '#8fd08a', burst: 34, shape: 'sphere', radius: 26, speed: [20, 90], size: [14, 28], life: [0.6, 1.2], force: [0, 70, 0], max: 50 })
    v.emit({ pos: P(e.x, e.y, 60), color: '#d8ffc8', alpha: 0.5, burst: 1, speed: [0, 0], size: [180, 180], life: [0.2, 0.2], sizeEnd: 0.2 })
    const ok = () => !u || u.dead || !u.hasBuff || u.hasBuff('decrepify')
    swirl(v, { pos: () => P(here().x, here().z, 0), n: 26, r0: 38, r1: 66, h0: 5, h1: 130, color: '#d8ffc8', size: 36, dur, spin: 3.2, rise: 70, alive: () => ok() && !(u && u.dead), peak: 0.8 })
    // ghost shell
    const shellMat = new THREE.MeshBasicMaterial({ color: '#c8f4b8', transparent: true, opacity: 0, blending: ADD, depthWrite: false })
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), shellMat)
    anim(v, shell, dur, (_k, _dt, t) => {
      if (t > 0.3 && !ok()) return false
      const p2 = here()
      shell.position.set(p2.x, p2.y + 5, p2.z)
      const f = clamp(t / 0.25) * clamp((dur - t) / 0.4)
      shellMat.opacity = (0.1 + Math.sin(t * 5) * 0.03) * f
      const s = 1 + Math.sin(t * 4) * 0.05
      shell.scale.set(52 * s, 78 * s, 52 * s)
    })
  },

  // Nether Ward: summoning sigil + lightning strike + totem pillar
  pugna_ward_summon: (v, e) => {
    const p = P(e.x, e.y)
    groundSigil(v, texNether(), '#4ad88a', p, 190, 2.2, { spin: 1.0, peak: 0.85 })
    groundSigil(v, texArcane(), '#a050ff', p, 120, 1.8, { spin: -1.6, peak: 0.6 })
    v.ring(p, 20, 190, 0.5, '#4ad88a', 0.1)
    v.column(p, 26, 380, 0.9, '#6aff9a')
    v.beam(() => P(e.x, e.y, 700), () => P(e.x, e.y, 20), 0.3, '#b8ffd0', 18, 0)
    v.beam(() => P(e.x + 40, e.y - 30, 650), () => P(e.x, e.y, 30), 0.25, '#b070ff', 10, 60)
    v.emit({ pos: P(e.x, e.y, 20), kind: 'ember', color: '#6aff9a', color2: '#9a50ff', burst: 40, shape: 'donut', radius: 90, speed: [40, 150], size: [14, 28], life: [0.5, 1.1], force: [0, 120, 0], max: 60 })
    v.emit({ pos: P(e.x, e.y, 70), color: '#6aff9a', alpha: 0.6, burst: 1, speed: [0, 0], size: [220, 220], life: [0.2, 0.2], sizeEnd: 0.3 })
  },

  // Nether Ward: faint ambient crackle (called at most ~1.5/s per ward)
  pugna_ward_ambient: (v, e) => {
    v.emit({ pos: P(e.x, e.y, 70), kind: 'ember', color: '#6aff9a', color2: '#9a50ff', burst: 4, shape: 'sphere', radius: 16, speed: [6, 26], size: [8, 15], life: [0.8, 1.3], force: [0, 40, 0], max: 10 })
    if (Math.random() < 0.6) {
      const a = Math.random() * PI * 2
      const d = 60 + Math.random() * 60
      v.beam(() => P(e.x, e.y, 120), () => P(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 60 + Math.random() * 60), 0.14, Math.random() < 0.5 ? '#6aff9a' : '#b070ff', 6, 40)
    }
  },

  // Nether Ward fires at a caster: crackling green/purple arcs
  pugna_ward_zap: (v, e) => {
    const a = () => P(e.x, e.y, 110)
    const b = () => P(e.x2!, e.y2!, 60)
    v.beam(a, b, 0.38, '#6aff9a', 12, 50)
    v.beam(a, b, 0.3, '#b070ff', 7, 80)
    v.ring(P(e.x, e.y), 20, 130, 0.35, '#6aff9a', 0.1)
    v.emit({ pos: P(e.x, e.y, 110), color: '#b8ffd0', alpha: 0.6, burst: 1, speed: [0, 0], size: [140, 140], life: [0.14, 0.14], sizeEnd: 0.5 })
    v.emit({ pos: P(e.x2!, e.y2!, 60), kind: 'spark', color: '#ffffff', color2: '#6aff9a', burst: 26, shape: 'sphere', radius: 16, speed: [60, 240], size: [12, 26], life: [0.25, 0.6], max: 40 })
    v.emit({ pos: P(e.x2!, e.y2!, 60), color: '#9a50ff', color2: '#6aff9a', burst: 14, shape: 'sphere', radius: 12, speed: [30, 110], size: [18, 36], life: [0.3, 0.6], max: 20 })
    v.column(P(e.x2!, e.y2!), 24, 200, 0.35, '#6aff9a')
  },

  // Life Drain: thick green-black beam with draining orbs flowing back to Pugna (called every ~0.25 s)
  pugna_drain_pulse: (v, e, posOf) => {
    const c = e.unit as any
    const t = e.unit2 as any
    const ally = !!e.ally
    const a = () => unitP(posOf, c, P(c.x, c.y, 80))
    const b = () => unitP(posOf, t, P(t.x, t.y, 70))
    const core = ally ? '#8aff9a' : '#c8f05a'
    tube(v, a, b, 0.4, ally ? '#14502a' : '#0a2410', 20, 0.8, false)
    v.beam(a, b, 0.36, ally ? '#8aff9a' : '#7aff4a', 9, 16)
    if (e.orbs !== false) {
      if (ally) flow(v, a, b, core, 3, 0.65, 26, 45)
      else flow(v, b, a, core, 3, 0.65, 26, 45)
    }
    const pt = b()
    v.emit({ pos: pt.clone(), kind: 'smoke', add: false, color: '#10301a', color2: '#050d08', alpha: 0.5, burst: 2, shape: 'sphere', radius: 14, speed: [10, 40], size: [50, 80], life: [0.5, 0.9], sizeEnd: 1.4, max: 6 })
    v.emit({ pos: pt.clone(), kind: 'ember', color: core, color2: '#2a6a30', burst: 5, shape: 'sphere', radius: 18, speed: [10, 50], size: [10, 18], life: [0.4, 0.8], force: [0, 60, 0], max: 10 })
  },

  pugna_drain_start: (v, e, posOf) => {
    const c = e.unit as any
    const t = e.unit2 as any
    const pa = unitP(posOf, c, P(c.x, c.y, 80))
    const pb = unitP(posOf, t, P(t.x, t.y, 70))
    v.ring(P(c.x, c.y), 20, 160, 0.5, '#7aff4a', 0.1)
    v.ring(P(t.x, t.y), 150, 30, 0.55, '#c8f05a', 0.1)
    groundSigil(v, texNether(), '#7aff4a', P(t.x, t.y), 120, 1.0, { spin: 2, peak: 0.6 })
    v.emit({ pos: pb.clone(), kind: 'ember', color: '#c8f05a', color2: '#2a6a30', burst: 24, shape: 'sphere', radius: 26, speed: [20, 80], size: [14, 26], life: [0.5, 1], force: [0, 70, 0], max: 40 })
    v.emit({ pos: pa.clone(), color: '#7aff4a', alpha: 0.45, burst: 1, speed: [0, 0], size: [150, 150], life: [0.2, 0.2], sizeEnd: 0.4 })
  },

  /* ---------------------------------------------------------------- SILENCER */

  // Arcane Curse: big purple glyph on the ground, shockwave, rising wisps
  silencer_curse_cast: (v, e) => {
    const r = e.r ?? 350
    const p = P(e.x, e.y)
    groundDisc(v, '#2a0a50', p, r, 2.0, 0.55, false)
    groundSigil(v, texArcane(), '#b070ff', p, r, 2.0, { spin: 0.7, peak: 0.9 })
    groundSigil(v, texRunes(), '#e0c8ff', p, r * 0.6, 1.7, { spin: -1.1, peak: 0.7 })
    v.ring(p, 30, r, 0.5, '#a070e0', 0.1)
    later(v, 0.15, () => v.ring(p, 20, r * 0.8, 0.7, '#e0c8ff', 0.04))
    v.column(p, r * 0.12, 360, 0.6, '#a070e0')
    v.emit({ pos: P(e.x, e.y, 10), kind: 'ember', color: '#e0c8ff', color2: '#7a40d0', burst: 55, shape: 'donut', radius: r * 0.6, speed: [30, 110], size: [14, 30], life: [0.7, 1.4], force: [0, 110, 0], max: 80 })
    v.emit({ pos: P(e.x, e.y, 60), color: '#a070e0', alpha: 0.5, burst: 1, speed: [0, 0], size: [r * 0.9, r * 0.9], life: [0.2, 0.2], sizeEnd: 1.4 })
  },

  silencer_curse_hit: (v, e, posOf) => {
    const u = e.unit as any
    const p = unitP(posOf, u, P(e.x, e.y, 70))
    haloRing(v, posOf, u, texRunes(), '#c8a0ff', 62, 1.2, { lift: 55, spin: 2.2, peak: 0.85 })
    v.emit({ pos: p.clone(), kind: 'ember', color: '#e0c8ff', color2: '#7a40d0', burst: 20, shape: 'sphere', radius: 22, speed: [20, 90], size: [12, 24], life: [0.6, 1.2], force: [0, 90, 0], max: 30 })
    v.ring(P(u.x, u.y), 10, 110, 0.4, '#a070e0', 0.1)
  },

  // cursed wisps rising from a victim (throttled by caller to ~1/s)
  silencer_curse_wisp: (v, e, posOf) => {
    const u = e.unit as any
    const here = () => unitP(posOf, u, P(e.x, e.y, 60)).clone().setY(10)
    v.emit({ pos: here(), kind: 'ember', color: '#e0c8ff', color2: '#6a30c0', rate: 14, dur: e.dur ?? 1.1, shape: 'sphere', radius: 32, speed: [4, 14], size: [10, 18], life: [0.8, 1.4], force: [0, 75, 0], max: 30, follow: () => (u.dead ? null : here()) })
  },

  silencer_curse_end: (v, e, posOf) => {
    const u = e.unit as any
    const p = unitP(posOf, u, P(e.x, e.y, 70))
    v.emit({ pos: p.clone(), kind: 'ember', color: '#e0c8ff', color2: '#7a40d0', burst: 26, shape: 'sphere', radius: 24, speed: [30, 120], size: [12, 26], life: [0.5, 1.1], force: [0, 110, 0], max: 40 })
    v.ring(P(u.x, u.y), 10, 140, 0.5, '#a070e0', 0.08)
  },

  // Glaives of Wisdom: glaive impact + intelligence flowing back to Silencer
  silencer_glaive_hit: (v, e, posOf) => {
    const a = e.unit as any
    const t = e.unit2 as any
    const p = unitP(posOf, t, P(e.x, e.y, 70))
    v.slash(p.clone().setY(30), Math.random() * PI * 2, 85, 0.25, '#c8b0f0')
    v.emit({ pos: p.clone(), color: '#c8b0f0', alpha: 0.6, burst: 1, speed: [0, 0], size: [110, 110], life: [0.14, 0.14], sizeEnd: 0.4 })
    v.emit({ pos: p.clone(), kind: 'spark', color: '#ffffff', color2: '#b070ff', burst: 12, shape: 'sphere', radius: 12, speed: [60, 200], size: [10, 22], life: [0.25, 0.55], max: 20 })
    if (a && e.steal) flow(v, () => unitP(posOf, t, P(t.x, t.y, 70)), () => unitP(posOf, a, P(a.x, a.y, 80)), '#d8c0ff', 3, 0.7, 20, 40)
  },

  // Last Word: ticking runic hex above the target while the timer runs
  silencer_lastword_mark: (v, e, posOf) => {
    const u = e.unit as any
    const dur = e.dur ?? 4
    const radius = 58
    const N = 16
    const root = new THREE.Group()
    const mark = sigil(texRunes(), '#c8a0ff', radius, 0, true)
    const hex = sigil(texArcane(), '#e8d8ff', radius * 0.6, 0, true)
    hex.grp.position.y = 2
    root.add(mark.grp, hex.grp)
    const ticks: THREE.Mesh[] = []
    const tm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, blending: ADD, depthWrite: false })
    for (let i = 0; i < N; i++) {
      const a = (i / N) * PI * 2
      const m = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 14), tm)
      m.position.set(Math.cos(a) * radius * 1.18, 0, Math.sin(a) * radius * 1.18)
      m.rotation.y = -a
      root.add(m)
      ticks.push(m)
    }
    let lastTick = -1
    anim(v, root, dur, (k, _dt, t) => {
      if (u.dead || (t > 0.25 && u.hasBuff && !u.hasBuff('silencer_last_word'))) return false
      const p = posOf?.(u) ?? P(u.x, u.y, 70)
      root.position.set(p.x, p.y + 62 + Math.sin(t * 3) * 3, p.z)
      const f = clamp(t / 0.25)
      const urgent = 1 + k * 3
      mark.mat.opacity = 0.8 * f
      hex.mat.opacity = 0.75 * f
      mark.grp.rotation.y = t * 1.0
      hex.grp.rotation.y = -t * 2.0 * urgent
      const s = radius * (0.5 + 0.5 * easeOutBack(clamp(t / 0.3)))
      mark.grp.scale.set(s, 1, s)
      hex.grp.scale.set(s * 0.6, 1, s * 0.6)
      const left = Math.ceil(N * (1 - k))
      ticks.forEach((m, i) => (m.visible = i < left))
      const sec = Math.floor(t)
      if (sec !== lastTick) {
        lastTick = sec
        // tick pulse once per second, faster feeling flash
        v.emit({ pos: P(p.x, p.z, p.y + 62), color: '#c8a0ff', alpha: 0.5, burst: 1, speed: [0, 0], size: [90, 90], life: [0.18, 0.18], sizeEnd: 0.4 })
      }
      tm.opacity = 0.7 + Math.sin(t * 10 * urgent) * 0.25
    })
  },

  // Last Word trigger: silent shockwave, darkening pulse, stacked rune rings
  silencer_lastword_hit: (v, e, posOf) => {
    const u = e.unit as any
    const p0 = unitP(posOf, u, P(e.x, e.y, 70))
    const p = P(p0.x, p0.z)
    v.ring(p, 20, 280, 0.5, '#b890e8', 0.12)
    v.ring(p, 10, 180, 0.7, '#ffffff', 0.04)
    // darkening pulse (normal blending so it really darkens)
    groundDisc(v, '#10001e', p, 300, 0.9, 0.7, false)
    v.emit({ pos: p0.clone(), color: '#2a0a50', alpha: 0.6, burst: 1, speed: [0, 0], size: [260, 260], life: [0.3, 0.3], sizeEnd: 1.5, add: false })
    // stacked rune rings rising
    for (let i = 0; i < 3; i++) {
      const { grp, mat } = sigil(texRunes(), i === 1 ? '#ffffff' : '#c8a0ff', 100, 0, true)
      grp.position.set(p.x, 20, p.z)
      const delay = i * 0.08
      anim(v, grp, 1.0 + delay, (k, _dt, t) => {
        const kk = clamp((t - delay) / 1.0)
        grp.position.y = 20 + kk * (110 + i * 25)
        const s = 70 + kk * (90 + i * 25)
        grp.scale.set(s, 1, s)
        grp.rotation.y = kk * 4 * (i % 2 ? -1 : 1)
        mat.opacity = 0.85 * Math.sin(Math.min(1, kk * 1.0) * PI * 0.5 + (kk > 0.4 ? 0 : 0)) * (1 - kk)
        void k
      })
    }
    groundSigil(v, texArcane(), '#b890e8', p, 150, 1.2, { spin: 2, peak: 0.8 })
    v.column(p, 40, 340, 0.45, '#b890e8')
    v.emit({ pos: p0.clone(), kind: 'spark', color: '#ffffff', color2: '#b070ff', burst: 30, shape: 'sphere', radius: 14, speed: [80, 260], size: [12, 26], life: [0.3, 0.7], max: 50 })
    v.emit({ pos: p0.clone(), kind: 'ember', color: '#e0c8ff', color2: '#7a40d0', burst: 20, shape: 'sphere', radius: 30, speed: [20, 90], size: [14, 26], life: [0.6, 1.2], force: [0, 80, 0], max: 30 })
    haloRing(v, posOf, u, texRunes(), '#c8a0ff', 60, e.dur ?? 1.4, { lift: 62, spin: 2.4, alive: () => !u.dead, peak: 0.75 })
  },

  // Global Silence cast: enormous expanding shockwave from Silencer
  silencer_global_cast: (v, e, posOf) => {
    const c = e.unit as any
    const p = P(e.x, e.y)
    const maxR = e.r ?? 2400
    v.ring(p, 40, maxR, 1.4, '#d0b8ff', 0.035)
    later(v, 0.15, () => v.ring(p, 40, maxR * 0.85, 1.2, '#a070e0', 0.05))
    later(v, 0.35, () => v.ring(p, 40, maxR * 0.6, 1.1, '#ffffff', 0.02))
    groundDisc(v, '#12002a', p, maxR * 0.55, 1.6, 0.5, false)
    // expanding dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, PI * 2, 0, PI / 2), new THREE.MeshBasicMaterial({ color: '#b890ff', transparent: true, opacity: 0.3, blending: ADD, depthWrite: false, side: THREE.DoubleSide }))
    dome.position.set(p.x, 0, p.z)
    anim(v, dome, 1.1, (k) => {
      const s = maxR * 0.9 * easeOut(k)
      dome.scale.set(s, s * 0.22, s)
      ;(dome.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - k)
    })
    // giant rune circle under him, spinning
    groundSigil(v, texRunes(), '#d0b8ff', p, 640, 2.4, { spin: 0.5, peak: 0.9 })
    groundSigil(v, texArcane(), '#b070ff', p, 420, 2.2, { spin: -0.9, peak: 0.8 })
    groundSigil(v, texNether(), '#e8d8ff', p, 260, 1.8, { spin: 1.6, peak: 0.6 })
    v.column(p, 70, 700, 0.9, '#c8a8ff')
    v.emit({ pos: P(e.x, e.y, 20), kind: 'ember', color: '#e8d8ff', color2: '#7a40d0', burst: 80, shape: 'donut', radius: 420, speed: [60, 220], size: [16, 34], life: [0.8, 1.6], force: [0, 140, 0], max: 100 })
    v.emit({ pos: P(e.x, e.y, 80), color: '#d0b8ff', alpha: 0.6, burst: 1, speed: [0, 0], size: [700, 700], life: [0.3, 0.3], sizeEnd: 1.8 })
    void c
    void posOf
  },

  // Global Silence on a victim: rune circle pulse + persistent rune ring above the head
  silencer_global_mark: (v, e, posOf) => {
    const u = e.unit as any
    const dur = e.dur ?? 5
    const p0 = unitP(posOf, u, P(e.x, e.y, 70))
    const p = P(p0.x, p0.z)
    v.ring(p, 20, 240, 0.7, '#d0b8ff', 0.08)
    v.beam(() => P(p.x, p.z, 900), () => P(p.x, p.z, 20), 0.3, '#e8d8ff', 16, 0)
    v.column(p, 38, 360, 0.6, '#c8a8ff')
    groundSigil(v, texRunes(), '#d0b8ff', p, 150, 1.1, { spin: 2.4, peak: 0.85 })
    v.emit({ pos: p0.clone(), kind: 'ember', color: '#e8d8ff', color2: '#7a40d0', burst: 24, shape: 'sphere', radius: 26, speed: [30, 110], size: [12, 26], life: [0.6, 1.2], force: [0, 90, 0], max: 40 })
    haloRing(v, posOf, u, texRunes(), '#d0b8ff', 66, dur, { lift: 66, spin: 1.6, alive: () => !u.dead && (!u.hasBuff || u.hasBuff('silence_global')), peak: 0.85, pulse: 3 })
    // periodic pulse over the victim's head (every 1.4 s, cheap)
    for (let t = 1.4; t < dur - 0.3; t += 1.4) {
      later(v, t, () => {
        if (u.dead) return
        const q = unitP(posOf, u, p0)
        v.ring(P(q.x, q.z), 20, 150, 0.6, '#d0b8ff', 0.08)
        v.emit({ pos: q.clone().setY(q.y + 55), color: '#d0b8ff', alpha: 0.5, burst: 1, speed: [0, 0], size: [130, 130], life: [0.2, 0.2], sizeEnd: 0.4 })
      })
    }
  },
}

