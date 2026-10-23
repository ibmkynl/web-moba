import * as THREE from 'three'
import type { CustomVfx, Vfx } from './vfx'
import { PI, P, rnd, later } from './vfxkit'

/**
 * Hero-specific visual effects (g1: Sven, Juggernaut, Legion Commander).
 * Key = effect name used with `w.vfx(name, opts)`. Positions: game x,y -> three (x, height, y).
 */

type PosOf = ((u: { x: number; y: number }) => THREE.Vector3 | null) | undefined

const basic = (color: string, opacity = 1, add = true) =>
  new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
  })

const bmesh = (geo: THREE.BufferGeometry, color: string, opacity = 1, add = true) => {
  const m = new THREE.Mesh(geo, basic(color, opacity, add))
  m.renderOrder = 4
  return m
}

function disposeObj(v: Vfx, obj: THREE.Object3D) {
  v.scene.remove(obj)
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | undefined
    mat?.dispose?.()
  })
}

/** Timed mesh effect: step(k 0..1, dt). */
function timed(v: Vfx, obj: THREE.Object3D, dur: number, step: (k: number, dt: number) => void) {
  v.scene.add(obj)
  let t = 0
  v.live.push({
    update: (dt) => {
      t += dt
      const k = t / dur
      if (k >= 1) {
        disposeObj(v, obj)
        return false
      }
      step(k, dt)
      return true
    },
    dispose: () => disposeObj(v, obj),
  })
}

/** Open-ended mesh effect: step returns false to end. */
function until(v: Vfx, obj: THREE.Object3D | null, step: (t: number, dt: number) => boolean) {
  if (obj) v.scene.add(obj)
  let t = 0
  v.live.push({
    update: (dt) => {
      t += dt
      if (!step(t, dt)) {
        if (obj) disposeObj(v, obj)
        return false
      }
      return true
    },
    dispose: () => {
      if (obj) disposeObj(v, obj)
    },
  })
}


const unitPos = (posOf: PosOf, u: { x: number; y: number }, h = 70) => (posOf ? posOf(u) : null) ?? P(u.x, u.y, h)

/** Flat glowing rays on the ground that expand outward. */
function rays(v: Vfx, p: THREE.Vector3, r: number, n: number, dur: number, color: string, thick = 0.14) {
  const g = new THREE.Group()
  const bars: THREE.Mesh[] = []
  for (let i = 0; i < n; i++) {
    const m = bmesh(new THREE.PlaneGeometry(1, thick), color, 0.8)
    m.rotation.x = -PI / 2
    const pivot = new THREE.Group()
    pivot.rotation.y = (i / n) * PI * 2 + rnd(-0.05, 0.05)
    pivot.add(m)
    g.add(pivot)
    bars.push(m)
  }
  g.position.set(p.x, 6, p.z)
  timed(v, g, dur, (k) => {
    const e = 1 - (1 - k) * (1 - k)
    bars.forEach((m, i) => {
      const len = r * (0.35 + 0.45 * ((i * 7) % 5) / 5) * (0.4 + e)
      m.scale.set(len, r * 0.02 + 6, 1)
      m.position.x = r * 0.2 + e * r * 0.55
      ;(m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k)
    })
  })
}

/** Ground scorch / glow disc that fades. */
function disc(v: Vfx, p: THREE.Vector3, r: number, dur: number, color: string, opacity = 0.5, add = false) {
  const m = bmesh(new THREE.CircleGeometry(1, 36), color, opacity, add)
  m.rotation.x = -PI / 2
  m.position.set(p.x, 2, p.z)
  m.scale.set(r, r, 1)
  timed(v, m, dur, (k) => {
    ;(m.material as THREE.MeshBasicMaterial).opacity = opacity * (1 - k * k)
    m.scale.set(r * (0.7 + 0.3 * Math.min(1, k * 4)), r * (0.7 + 0.3 * Math.min(1, k * 4)), 1)
  })
}

/** Jagged crack lines on the ground radiating from p. */
function cracks(v: Vfx, p: THREE.Vector3, r: number, n: number, dur: number, color: string) {
  const g = new THREE.Group()
  const segs: { m: THREE.Mesh; d: number }[] = []
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * PI * 2 + rnd(-0.2, 0.2)
    let x = 0
    let z = 0
    let a = a0
    const len = r * rnd(0.55, 1)
    const steps = 6
    for (let s = 0; s < steps; s++) {
      const l = len / steps
      const nx = x + Math.cos(a) * l
      const nz = z + Math.sin(a) * l
      const m = bmesh(new THREE.PlaneGeometry(1, 1), color, 0.9)
      m.rotation.x = -PI / 2
      const holder = new THREE.Group()
      holder.position.set((x + nx) / 2, 0, (z + nz) / 2)
      holder.rotation.y = -Math.atan2(nz - z, nx - x)
      m.scale.set(l * 1.05, (1 - s / steps) * 14 + 4, 1)
      holder.add(m)
      g.add(holder)
      segs.push({ m, d: (s / steps) * 0.35 })
      x = nx
      z = nz
      a += rnd(-0.5, 0.5)
    }
  }
  g.position.set(p.x, 3, p.z)
  timed(v, g, dur, (k) => {
    for (const s of segs) {
      const kk = Math.max(0, Math.min(1, (k - s.d) / 0.15))
      s.m.visible = kk > 0
      ;(s.m.material as THREE.MeshBasicMaterial).opacity = 0.9 * kk * (k > 0.5 ? 1 - (k - 0.5) / 0.5 : 1)
    }
  })
}

/** Banner / pennant that rises and waves at p. */
function banner(v: Vfx, p: THREE.Vector3, h: number, dur: number, color: string, trim: string, face = 0) {
  const g = new THREE.Group()
  const pole = bmesh(new THREE.CylinderGeometry(2.2, 2.2, h, 6), trim, 0.9)
  pole.position.y = h / 2
  const flagGeo = new THREE.PlaneGeometry(h * 0.5, h * 0.34, 8, 1)
  const flag = bmesh(flagGeo, color, 0.85)
  flag.position.set(h * 0.25 + 3, h * 0.82, 0)
  const edge = bmesh(new THREE.PlaneGeometry(h * 0.5, h * 0.04), trim, 0.95)
  edge.position.set(h * 0.25 + 3, h * 0.82 - h * 0.17, 0.5)
  const tip = bmesh(new THREE.ConeGeometry(h * 0.04, h * 0.1, 4), trim, 0.95)
  tip.position.y = h + h * 0.04
  g.add(pole, flag, edge, tip)
  g.position.set(p.x, 0, p.z)
  g.rotation.y = face
  const pos = flagGeo.attributes.position as THREE.BufferAttribute
  const base = Float32Array.from(pos.array as Float32Array)
  timed(v, g, dur, (k) => {
    const grow = Math.min(1, k * 5)
    g.scale.setScalar(0.2 + 0.8 * grow)
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]
      const w = (x / (h * 0.5)) + 0.5
      pos.setZ(i, Math.sin(k * 24 + w * 5) * h * 0.05 * w)
    }
    pos.needsUpdate = true
    const f = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
    for (const m of [pole, flag, edge, tip]) (m.material as THREE.MeshBasicMaterial).opacity = (m === flag ? 0.85 : 0.9) * f
  })
}

/** Ring of spark-ish particles at ground. */
function sparkRing(v: Vfx, p: THREE.Vector3, r: number, n: number, color: string, color2?: string, up = 60) {
  v.emit({ pos: p.clone().setY(10), kind: 'spark', color, color2: color2 ?? color, burst: n, shape: 'donut', radius: r, speed: [20, 90], size: [14, 28], life: [0.4, 0.9], force: [0, up, 0], max: n + 10 })
}

/* ======================================================================== */

export const VFX_G1: Record<string, CustomVfx> = {
  /* --------------------------------------------------------------- SVEN */

  /** Spinning lightning-wreathed gauntlet hammer flying from e.unit to e.unit2. */
  sven_hammer_fly: (v, e, posOf) => {
    const a = e.unit
    const b = e.unit2
    if (!a || !b) return
    const g = new THREE.Group()
    const head = bmesh(new THREE.BoxGeometry(46, 30, 30), '#7ab8ff', 0.95, false)
    const core = bmesh(new THREE.BoxGeometry(34, 22, 22), '#ffffff', 0.9)
    const handle = bmesh(new THREE.CylinderGeometry(5, 5, 60, 6), '#cfe6ff', 0.9, false)
    handle.rotation.z = PI / 2
    handle.position.x = -40
    const knob = bmesh(new THREE.SphereGeometry(9, 8, 6), '#9ad0ff', 0.9)
    knob.position.x = -72
    const halo = bmesh(new THREE.SphereGeometry(44, 12, 10), '#5aa8ff', 0.28)
    const spin = new THREE.Group()
    spin.add(head, core, handle, knob)
    g.add(spin, halo)
    const start = unitPos(posOf, a, 110)
    start.y = 110
    g.position.copy(start)
    let alive = true
    v.emit({ pos: start.clone(), kind: 'spark', color: '#ffffff', color2: '#4a9cff', rate: 70, dur: 3, shape: 'sphere', radius: 14, speed: [10, 60], size: [12, 26], life: [0.15, 0.4], max: 120, follow: () => (alive ? g.position.clone() : null) })
    v.emit({ pos: start.clone(), color: '#4a9cff', color2: '#1a3a9a', alpha: 0.6, rate: 40, dur: 3, shape: 'sphere', radius: 16, speed: [0, 20], size: [30, 50], life: [0.25, 0.5], max: 90, follow: () => (alive ? g.position.clone() : null) })
    let arc = 0
    until(v, g, (t, dt) => {
      const tp = unitPos(posOf, b, 90)
      tp.y = 90
      const d = tp.clone().sub(g.position)
      const len = d.length()
      if (len < 45 || t > 3) {
        alive = false
        return false
      }
      g.position.addScaledVector(d, Math.min(1, (1000 * dt) / len))
      g.rotation.y = -Math.atan2(d.z, d.x)
      spin.rotation.z -= dt * 22
      halo.scale.setScalar(1 + Math.sin(t * 30) * 0.12)
      arc -= dt
      if (arc <= 0) {
        arc = 0.09
        const from = g.position.clone()
        const to = from.clone().add(new THREE.Vector3(rnd(-80, 80), rnd(-30, 60), rnd(-80, 80)))
        v.beam(() => from, () => to, 0.1, '#9ad0ff', 5, 30)
      }
      return true
    })
  },

  /** Thunder impact: sky bolt, shockwave, scorch, debris. */
  sven_hammer_impact: (v, e) => {
    const r = e.r ?? 270
    const p = P(e.x, e.y)
    v.beam(() => P(e.x, e.y, 950), () => P(e.x, e.y, 10), 0.28, '#9ad0ff', 46, 90)
    v.emit({ pos: p.clone().setY(60), color: '#ffffff', color2: '#7ab8ff', alpha: 0.85, burst: 1, speed: [0, 0], size: [r * 0.9, r * 0.9], life: [0.2, 0.2], sizeEnd: 0.2 })
    v.ring(p, 20, r, 0.5, '#5aa8ff', 0.1)
    later(v, 0.1, () => v.ring(p, 10, r * 0.7, 0.45, '#ffffff', 0.06))
    v.column(p, r * 0.16, 520, 0.5, '#9ad0ff')
    sparkRing(v, p, r * 0.5, 44, '#ffffff', '#4a9cff', 80)
    v.emit({ pos: p.clone().setY(30), color: '#cfe6ff', color2: '#4a9cff', burst: 36, shape: 'sphere', radius: 14, speed: [120, 380], size: [14, 30], life: [0.25, 0.6], force: [0, -300, 0], max: 60 })
    v.emit({ pos: p.clone().setY(10), kind: 'smoke', add: false, color: '#6a7488', color2: '#3a4050', alpha: 0.5, burst: 14, shape: 'donut', radius: r * 0.35, speed: [30, 90], size: [50, 90], life: [0.6, 1.1], sizeEnd: 1.6, force: [0, 30, 0], max: 24 })
    disc(v, p, r * 0.45, 1.6, '#10141c', 0.55)
    disc(v, p, r * 0.7, 0.5, '#5aa8ff', 0.35, true)
    cracks(v, p, r * 0.55, 7, 1.2, '#7ab8ff')
    for (let i = 0; i < 3; i++) {
      later(v, 0.08 * i, () => {
        const q = p.clone().add(new THREE.Vector3(rnd(-r * 0.6, r * 0.6), 0, rnd(-r * 0.6, r * 0.6)))
        v.beam(() => q.clone().setY(220), () => q.clone().setY(8), 0.12, '#bfe0ff', 8, 40)
      })
    }
  },

  /** Great Cleave: wide arcing blade swipe. */
  sven_cleave: (v, e) => {
    const ang = e.angle ?? 0
    const p = P(e.x, e.y, 40)
    v.slash(p, ang, 330, 0.28, '#c8d4ee')
    v.slash(p.clone().setY(60), ang, 260, 0.22, '#ffffff')
    v.slash(p.clone().setY(20), ang, 400, 0.34, '#6a8acc')
    const cx = Math.cos(ang)
    const cy = Math.sin(ang)
    for (let i = -2; i <= 2; i++) {
      const a = ang + i * 0.45
      const q = P(e.x + Math.cos(a) * 240, e.y + Math.sin(a) * 240, 50)
      v.emit({ pos: q, kind: 'spark', color: '#ffffff', color2: '#9ab4e8', burst: 6, shape: 'sphere', radius: 6, speed: [60, 200], size: [12, 22], life: [0.15, 0.4], max: 10 })
    }
    v.emit({ pos: P(e.x + cx * 120, e.y + cy * 120, 40), color: '#dfe8ff', alpha: 0.5, burst: 1, speed: [0, 0], size: [150, 150], life: [0.15, 0.15], sizeEnd: 0.3 })
  },

  /** Warcry: golden shockwave, banners, rising motes. */
  sven_warcry: (v, e) => {
    const r = e.r ?? 700
    const p = P(e.x, e.y)
    v.ring(p, 40, r, 0.7, '#ffcf60', 0.07)
    later(v, 0.12, () => v.ring(p, 30, r * 0.7, 0.6, '#e0a040', 0.08))
    later(v, 0.24, () => v.ring(p, 20, r * 0.45, 0.5, '#fff0b0', 0.1))
    v.emit({ pos: p.clone().setY(80), color: '#ffe9a0', alpha: 0.45, burst: 1, speed: [0, 0], size: [260, 260], life: [0.3, 0.3], sizeEnd: 1.8 })
    rays(v, p, 330, 14, 0.9, '#ffd060')
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + 0.3
      const q = P(e.x + Math.cos(a) * 120, e.y + Math.sin(a) * 120)
      banner(v, q, 230, 1.5, '#c8352a', '#f0c050', -a)
    }
    sparkRing(v, p, 180, 40, '#fff0b0', '#e0a040', 140)
    v.emit({ pos: p.clone().setY(20), color: '#ffcf60', color2: '#c06020', burst: 40, shape: 'donut', radius: 160, speed: [60, 160], size: [20, 40], life: [0.5, 1], force: [0, 120, 0], max: 50 })
    v.column(p, 70, 480, 0.7, '#ffcf60')
  },
  sven_warcry_ally: (v, e, posOf) => {
    const u = e.unit ?? { x: e.x, y: e.y }
    const p = P(u.x, u.y)
    v.ring(p, 20, 150, 0.6, '#ffcf60', 0.1)
    v.column(p, 24, 280, 0.6, '#e0a040')
    v.emit({ pos: unitPos(posOf, u), kind: 'spark', color: '#fff0b0', color2: '#e0a040', burst: 14, shape: 'sphere', radius: 40, speed: [20, 70], size: [14, 26], life: [0.5, 1], force: [0, 90, 0], max: 20 })
    if (e.unit) v.emit({ pos: unitPos(posOf, u), color: '#ffcf60', color2: '#e0a040', rate: 24, dur: 1.2, shape: 'sphere', radius: 14, speed: [0, 10], size: [20, 34], life: [0.2, 0.4], max: 40, follow: () => (posOf ? posOf(u) : null) })
  },

  /** God's Strength cast: pillar, ground cracks, fire. */
  sven_gods_cast: (v, e) => {
    const p = P(e.x, e.y)
    v.column(p, 60, 700, 0.9, '#ff8a3a')
    v.column(p, 30, 800, 0.7, '#ffe9a0')
    v.ring(p, 30, 260, 0.6, '#ff8a3a', 0.1)
    later(v, 0.15, () => v.ring(p, 20, 340, 0.6, '#ffd060', 0.07))
    v.emit({ pos: p.clone().setY(80), color: '#ffcf80', alpha: 0.7, burst: 1, speed: [0, 0], size: [300, 300], life: [0.3, 0.3], sizeEnd: 0.4 })
    v.emit({ pos: p.clone().setY(20), color: '#ffcf60', color2: '#ff3a10', burst: 60, shape: 'donut', radius: 70, speed: [60, 200], size: [24, 56], life: [0.5, 1.1], force: [0, 200, 0], max: 70 })
    sparkRing(v, p, 120, 30, '#ffffff', '#ff8a3a', 160)
    disc(v, p, 160, 2.2, '#2a0a04', 0.5)
    disc(v, p, 200, 0.7, '#ff6a20', 0.4, true)
    cracks(v, p, 320, 9, 2.0, '#ff7a2a')
    rays(v, p, 380, 12, 0.9, '#ffb060')
  },
  /** Sustained red-gold aura with flaring eyes while God's Strength lasts. */
  sven_gods_aura: (v, e, posOf) => {
    const u = e.unit as any
    if (!u) return
    const dur = e.dur ?? 35
    const eyes = new THREE.Group()
    const eyeL = bmesh(new THREE.SphereGeometry(8, 8, 6), '#ffb060', 0.95)
    const eyeR = bmesh(new THREE.SphereGeometry(8, 8, 6), '#ffb060', 0.95)
    const flare = bmesh(new THREE.SphereGeometry(22, 10, 8), '#ff6a20', 0.25)
    eyes.add(eyeL, eyeR, flare)
    let acc = 0
    let pulse = 0
    until(v, eyes, (t, dt) => {
      if (u.dead || t > dur || (u.hasBuff && !u.hasBuff('gods_strength'))) return false
      const rr = (u.radius || 40) * 1.55
      const f = u.facing || 0
      const cx = Math.cos(f)
      const cy = Math.sin(f)
      const hx = u.x + cx * rr * 0.62
      const hy = u.y + cy * rr * 0.62
      const hh = rr * 3.3
      eyeL.position.set(hx - cy * rr * 0.2, hh, hy + cx * rr * 0.2)
      eyeR.position.set(hx + cy * rr * 0.2, hh, hy - cx * rr * 0.2)
      flare.position.set(hx, hh, hy)
      flare.scale.setScalar(0.8 + 0.4 * Math.sin(t * 7))
      acc -= dt
      if (acc <= 0) {
        acc = 0.22
        const bp = unitPos(posOf, u)
        v.emit({ pos: bp.clone().setY(rr * 0.3), color: '#ffcf60', color2: '#ff3a10', burst: 5, shape: 'donut', radius: 55, speed: [10, 40], size: [24, 46], life: [0.5, 0.9], force: [0, 140, 0], max: 10 })
        v.emit({ pos: new THREE.Vector3(hx, hh, hy), kind: 'spark', color: '#ffffff', color2: '#ff8a3a', burst: 1, shape: 'point', speed: [10, 40], size: [16, 26], life: [0.3, 0.5], max: 3 })
      }
      pulse -= dt
      if (pulse <= 0) {
        pulse = 2.5
        v.ring(P(u.x, u.y), 30, 130, 0.9, '#ff8a3a', 0.06)
      }
      return true
    })
  },

  /* --------------------------------------------------------- JUGGERNAUT */

  jugg_fury_cast: (v, e) => {
    const p = P(e.x, e.y)
    v.ring(p, 20, 280, 0.5, '#e8c040', 0.07)
    later(v, 0.1, () => v.ring(p, 20, 200, 0.4, '#ffffff', 0.05))
    v.emit({ pos: p.clone().setY(70), kind: 'spark', color: '#ffffff', color2: '#e8c040', burst: 40, shape: 'sphere', radius: 20, speed: [120, 340], size: [14, 28], life: [0.25, 0.6], max: 50 })
    v.emit({ pos: p.clone().setY(70), color: '#fff0b0', alpha: 0.6, burst: 1, speed: [0, 0], size: [220, 220], life: [0.2, 0.2], sizeEnd: 0.4 })
  },
  /** Spinning blade vortex that follows the unit while Blade Fury is active. */
  jugg_fury: (v, e, posOf) => {
    const u = e.unit as any
    if (!u) return
    const dur = e.dur ?? 5
    const g = new THREE.Group()
    const layers: { grp: THREE.Group; spd: number }[] = []
    const mk = (radius: number, h: number, n: number, spd: number, color: string) => {
      const grp = new THREE.Group()
      for (let i = 0; i < n; i++) {
        const m = bmesh(new THREE.RingGeometry(radius * 0.93, radius, 20, 1, 0, 1.0), color, 0.75)
        m.rotation.x = -PI / 2
        m.rotation.z = (i / n) * PI * 2
        grp.add(m)
        // blade tip glint
        const a = (i / n) * PI * 2 + 1.0
        const tip = bmesh(new THREE.ConeGeometry(7, 40, 4), '#ffffff', 0.9)
        tip.position.set(Math.cos(a) * radius, 0, -Math.sin(a) * radius)
        tip.rotation.z = PI / 2
        tip.rotation.y = a
        grp.add(tip)
      }
      grp.position.y = h
      g.add(grp)
      layers.push({ grp, spd })
    }
    mk(150, 40, 4, 16, '#f0d060')
    mk(190, 85, 3, -13, '#ffffff')
    mk(120, 125, 4, 19, '#e8a030')
    mk(210, 20, 3, 11, '#ffe9a0')
    const wind = bmesh(new THREE.CylinderGeometry(150, 190, 150, 24, 1, true), '#f0d060', 0.12)
    wind.position.y = 75
    g.add(wind)
    let acc = 0
    until(v, g, (t, dt) => {
      const gone = u.dead || t > dur || (u.hasBuff && !u.hasBuff('blade_fury'))
      const fade = Math.min(1, t * 6) * (t > dur - 0.4 ? Math.max(0, (dur - t) / 0.4) : 1)
      const bp = unitPos(posOf, u)
      g.position.set(bp.x, 0, bp.z)
      g.scale.setScalar(0.3 + 0.7 * fade)
      for (const l of layers) {
        l.grp.rotation.y += l.spd * dt
      }
      wind.rotation.y -= dt * 8
      acc -= dt
      if (acc <= 0) {
        acc = 0.2
        v.emit({ pos: P(u.x, u.y, 70), kind: 'spark', color: '#fff0b0', color2: '#e8a030', burst: 6, shape: 'donut', radius: 170, speed: [60, 150], size: [12, 22], life: [0.25, 0.5], max: 10, up: true })
      }
      if (Math.floor(t * 2.5) !== Math.floor((t - dt) * 2.5)) v.emit({ pos: P(u.x, u.y, 8), kind: 'smoke', add: false, color: '#b8a070', color2: '#8a7850', alpha: 0.3, burst: 5, shape: 'donut', radius: 160, speed: [40, 90], size: [40, 70], life: [0.5, 0.9], sizeEnd: 1.4, max: 8 })
      return !gone
    })
  },
  jugg_fury_hit: (v, e) => {
    const p = P(e.x, e.y, 60)
    v.slash(p, rnd(0, PI * 2), 90, 0.18, '#fff0b0')
    v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: '#e8a030', burst: 8, shape: 'sphere', radius: 6, speed: [80, 220], size: [10, 20], life: [0.15, 0.35], max: 10 })
  },

  /** Healing Ward summon: rotating rune circle, green-gold column, motes. */
  jugg_ward_summon: (v, e) => {
    const p = P(e.x, e.y)
    const r = e.r ?? 220
    const g = new THREE.Group()
    const outer = bmesh(new THREE.RingGeometry(0.95, 1, 48), '#6ae08a', 0.9)
    outer.rotation.x = -PI / 2
    const mid = bmesh(new THREE.RingGeometry(0.62, 0.65, 48), '#e8d060', 0.85)
    mid.rotation.x = -PI / 2
    const tri = bmesh(new THREE.RingGeometry(0.58, 0.6, 3), '#b8ffb0', 0.9)
    tri.rotation.x = -PI / 2
    const tri2 = bmesh(new THREE.RingGeometry(0.58, 0.6, 3), '#b8ffb0', 0.9)
    tri2.rotation.x = -PI / 2
    tri2.rotation.z = PI
    const fill = bmesh(new THREE.CircleGeometry(1, 40), '#6ae08a', 0.16)
    fill.rotation.x = -PI / 2
    g.add(outer, mid, tri, tri2, fill)
    const ticks = new THREE.Group()
    for (let i = 0; i < 12; i++) {
      const t = bmesh(new THREE.PlaneGeometry(0.09, 0.14), '#e8d060', 0.9)
      t.rotation.x = -PI / 2
      const a = (i / 12) * PI * 2
      t.position.set(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8)
      t.rotation.z = -a
      ticks.add(t)
    }
    g.add(ticks)
    g.position.set(p.x, 5, p.z)
    timed(v, g, 1.8, (k, dt) => {
      const grow = Math.min(1, k * 4)
      const s = r * (0.3 + 0.7 * (1 - (1 - grow) * (1 - grow)))
      g.scale.set(s, s, s)
      tri.rotation.z += dt * 1.2
      tri2.rotation.z += dt * 1.2
      ticks.rotation.y -= dt * 0.8
      const f = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1
      for (const m of [outer, mid, tri, tri2]) (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * f
      ;(fill.material as THREE.MeshBasicMaterial).opacity = 0.18 * f
    })
    v.column(p, 36, 360, 0.9, '#6ae08a')
    v.column(p, 16, 420, 0.7, '#ffe9a0')
    v.emit({ pos: p.clone().setY(10), kind: 'ember', color: '#b8ffb0', color2: '#e8d060', burst: 36, shape: 'donut', radius: r * 0.7, speed: [20, 70], size: [12, 24], life: [0.7, 1.4], force: [0, 110, 0], max: 40 })
    v.emit({ pos: p.clone().setY(60), color: '#9af0a8', alpha: 0.6, burst: 1, speed: [0, 0], size: [220, 220], life: [0.3, 0.3], sizeEnd: 0.5 })
  },
  /** Floating rune halo that follows the ward. */
  jugg_ward_glow: (v, e, posOf) => {
    const u = e.unit as any
    if (!u) return
    const dur = e.dur ?? 25
    const g = new THREE.Group()
    const ring = bmesh(new THREE.TorusGeometry(34, 2.4, 6, 24), '#9af0a8', 0.85)
    ring.rotation.x = PI / 2
    const ring2 = bmesh(new THREE.TorusGeometry(24, 1.6, 6, 20), '#ffe9a0', 0.85)
    ring2.rotation.x = PI / 2
    const orb = bmesh(new THREE.SphereGeometry(10, 8, 6), '#e8ffd0', 0.9)
    const halo = bmesh(new THREE.SphereGeometry(30, 10, 8), '#6ae08a', 0.18)
    g.add(ring, ring2, orb, halo)
    let acc = 0
    until(v, g, (t, dt) => {
      if (u.dead || t > dur) return false
      g.position.set(u.x, 150 + Math.sin(t * 2) * 8, u.y)
      ring.rotation.z += dt * 2.2
      ring.rotation.x = PI / 2 + Math.sin(t * 1.3) * 0.4
      ring2.rotation.z -= dt * 3
      ring2.rotation.y += dt * 1.5
      halo.scale.setScalar(1 + Math.sin(t * 5) * 0.15)
      acc -= dt
      if (acc <= 0) {
        acc = 0.5
        v.emit({ pos: P(u.x, u.y, 140), kind: 'ember', color: '#b8ffb0', color2: '#e8d060', burst: 3, shape: 'sphere', radius: 26, speed: [6, 24], size: [12, 20], life: [0.8, 1.3], force: [0, -20, 0], max: 6 })
      }
      return true
    })
  },
  jugg_ward_pulse: (v, e) => {
    const p = P(e.x, e.y)
    const r = e.r ?? 400
    v.ring(p, 30, r, 0.9, '#6ae08a', 0.04)
    v.emit({ pos: p.clone().setY(8), kind: 'ember', color: '#b8ffb0', color2: '#e8d060', burst: 24, shape: 'donut', radius: r * 0.5, speed: [10, 40], size: [12, 22], life: [0.9, 1.5], force: [0, 90, 0], max: 30 })
  },
  jugg_ward_heal: (v, e, posOf) => {
    const a = e.unit
    const b = e.unit2
    if (!a || !b) return
    v.beam(() => { const q = unitPos(posOf, a, 120); q.y = 130; return q }, () => unitPos(posOf, b), 0.6, '#9af0a8', 5, 0)
    v.emit({ pos: unitPos(posOf, b), kind: 'spark', color: '#ffffff', color2: '#6ae08a', burst: 8, shape: 'sphere', radius: 30, speed: [10, 50], size: [14, 24], life: [0.5, 0.9], force: [0, 90, 0], max: 12 })
  },

  /** Blade Dance crit: golden X slash. */
  jugg_crit: (v, e) => {
    const p = P(e.x, e.y, 60)
    const a = e.angle ?? rnd(0, PI * 2)
    v.slash(p, a + 0.5, 190, 0.26, '#ffb060')
    v.slash(p, a - 0.5 + PI, 190, 0.26, '#ffe9a0')
    v.slash(p.clone().setY(80), a, 130, 0.18, '#ffffff')
    v.emit({ pos: p, color: '#ffd080', alpha: 0.7, burst: 1, speed: [0, 0], size: [170, 170], life: [0.15, 0.15], sizeEnd: 0.3 })
    v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: '#ff9a3a', burst: 22, shape: 'sphere', radius: 8, speed: [120, 340], size: [14, 28], life: [0.2, 0.5], max: 30 })
    v.ring(P(e.x, e.y), 10, 110, 0.3, '#ffb060', 0.1)
  },

  /** Omnislash: afterimage dash + multi-angle slashes. */
  jugg_omni_hop: (v, e) => {
    const a = P(e.x, e.y)
    const b = P(e.x2 ?? e.x, e.y2 ?? e.y)
    const d = b.clone().sub(a)
    const len = d.length()
    const ya = -Math.atan2(d.z, d.x)
    v.beam(() => a.clone().setY(80), () => b.clone().setY(80), 0.22, '#ffd0a0', 20)
    v.beam(() => a.clone().setY(80), () => b.clone().setY(80), 0.12, '#ffffff', 7)
    const n = Math.max(2, Math.min(6, Math.floor(len / 70)))
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n
      const gp = new THREE.Group()
      const body = bmesh(new THREE.CylinderGeometry(24, 30, 120, 8), '#ff7a3a', 0.45)
      body.position.y = 70
      const head = bmesh(new THREE.SphereGeometry(20, 8, 6), '#ffd0a0', 0.5)
      head.position.y = 150
      const blade = bmesh(new THREE.BoxGeometry(8, 120, 8), '#ffffff', 0.55)
      blade.position.set(30, 130, 40)
      blade.rotation.z = -0.9
      gp.add(body, head, blade)
      gp.position.copy(a).addScaledVector(d, f)
      gp.rotation.y = ya
      timed(v, gp, 0.4 + 0.04 * i, (k) => {
        const o = 0.5 * (1 - k)
        for (const m of [body, head, blade]) (m.material as THREE.MeshBasicMaterial).opacity = o
        gp.scale.set(1, 1, 1 - k * 0.3)
      })
    }
    v.emit({ pos: a.clone().setY(70), color: '#ff9a5a', color2: '#ffd0a0', burst: 14, shape: 'sphere', radius: 14, speed: [30, 140], size: [20, 40], life: [0.2, 0.45], max: 20 })
    // arrival
    v.emit({ pos: b.clone().setY(80), color: '#ffffff', alpha: 0.85, burst: 1, speed: [0, 0], size: [190, 190], life: [0.14, 0.14], sizeEnd: 0.3 })
    for (let i = 0; i < 3; i++) v.slash(b.clone().setY(40 + i * 30), rnd(0, PI * 2), 110 + i * 25, 0.2, i === 1 ? '#ffffff' : '#ff9a5a')
    v.emit({ pos: b.clone().setY(70), kind: 'spark', color: '#ffffff', color2: '#ff5a3a', burst: 20, shape: 'sphere', radius: 8, speed: [120, 320], size: [12, 24], life: [0.2, 0.45], max: 30 })
    v.ring(b.clone().setY(0), 10, 120, 0.35, '#ff7a3a', 0.1)
  },
  jugg_omni_start: (v, e) => {
    const p = P(e.x, e.y)
    v.column(p, 50, 520, 0.7, '#ff5a3a')
    v.ring(p, 20, 260, 0.6, '#ff5a3a', 0.08)
    later(v, 0.1, () => v.ring(p, 10, 180, 0.5, '#ffffff', 0.05))
    v.emit({ pos: p.clone().setY(80), color: '#ffb080', alpha: 0.6, burst: 1, speed: [0, 0], size: [240, 240], life: [0.25, 0.25], sizeEnd: 0.4 })
    sparkRing(v, p, 140, 28, '#ffffff', '#ff5a3a', 120)
  },
  jugg_omni_end: (v, e) => {
    const p = P(e.x, e.y)
    v.ring(p, 20, 220, 0.5, '#ffd0a0', 0.07)
    v.emit({ pos: p.clone().setY(80), color: '#ffffff', alpha: 0.6, burst: 1, speed: [0, 0], size: [200, 200], life: [0.2, 0.2], sizeEnd: 0.3 })
    sparkRing(v, p, 100, 24, '#ffffff', '#ff7a3a', 130)
  },

  /* ---------------------------------------------------- LEGION COMMANDER */

  /** Overwhelming Odds: crimson-gold banner shockwave. */
  legion_odds: (v, e) => {
    const r = e.r ?? 600
    const p = P(e.x, e.y)
    v.ring(p, 40, r, 0.7, '#e04a3a', 0.08)
    later(v, 0.1, () => v.ring(p, 30, r * 0.75, 0.6, '#f0c050', 0.06))
    rays(v, p, 420, 16, 0.9, '#ff6a4a')
    v.emit({ pos: p.clone().setY(70), color: '#ff8a6a', alpha: 0.55, burst: 1, speed: [0, 0], size: [300, 300], life: [0.3, 0.3], sizeEnd: 1.5 })
    v.emit({ pos: p.clone().setY(15), color: '#e04a3a', color2: '#f0c050', burst: 50, shape: 'donut', radius: r * 0.3, speed: [80, 260], size: [22, 50], life: [0.5, 1], force: [0, 100, 0], max: 60 })
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + 0.7
      banner(v, P(e.x + Math.cos(a) * 140, e.y + Math.sin(a) * 140), 260, 1.4, '#b02a22', '#f0c050', -a)
    }
    v.spikes(p, r * 0.75, 14, 90, 1.0, '#e04a3a')
    // decorative spear rain over the area
    for (let i = 0; i < 7; i++) {
      const a = rnd(0, PI * 2)
      const rr = Math.sqrt(Math.random()) * r * 0.85
      const q = { x: e.x + Math.cos(a) * rr, y: e.y + Math.sin(a) * rr }
      later(v, rnd(0, 0.35), () => VFX_G1.legion_spear(v, { name: 'legion_spear', x: q.x, y: q.y, dur: 0.3 }))
    }
  },
  /** A spear plunging from the sky into (x, y). */
  legion_spear: (v, e) => {
    const dur = e.dur ?? 0.3
    const p = P(e.x, e.y)
    const g = new THREE.Group()
    const shaft = bmesh(new THREE.CylinderGeometry(3.2, 3.2, 150, 6), '#a08060', 1, false)
    shaft.position.y = 75
    const head = bmesh(new THREE.ConeGeometry(9, 38, 4), '#f4f4ff', 1, false)
    head.rotation.z = PI
    head.position.y = -18
    const gold = bmesh(new THREE.CylinderGeometry(6, 6, 8, 6), '#f0c050', 1, false)
    const glow = bmesh(new THREE.SphereGeometry(22, 8, 6), '#ff8a5a', 0.4)
    glow.position.y = 20
    g.add(shaft, head, gold, glow)
    const tilt = rnd(-0.18, 0.18)
    g.rotation.z = tilt
    const startY = 820
    timed(v, g, dur + 0.7, (k, dt) => {
      const kk = Math.min(1, (k * (dur + 0.7)) / dur)
      const y = startY * (1 - kk * kk)
      g.position.set(p.x - Math.sin(tilt) * y * 0.5, y + 38, p.z)
      if (kk < 1 && Math.random() < 0.7) v.emit({ pos: g.position.clone().setY(g.position.y + 60), color: '#ff8a5a', color2: '#f0c050', burst: 1, shape: 'point', speed: [0, 10], size: [20, 34], life: [0.15, 0.3], max: 3 })
      if (kk >= 1 && !g.userData.hit) {
        g.userData.hit = true
        v.emit({ pos: p.clone().setY(20), color: '#ffcf80', color2: '#e04a3a', burst: 16, shape: 'sphere', radius: 8, speed: [60, 220], size: [16, 34], life: [0.2, 0.5], max: 20 })
        v.emit({ pos: p.clone().setY(8), kind: 'smoke', add: false, color: '#8a6a50', color2: '#5a4030', alpha: 0.4, burst: 5, shape: 'donut', radius: 30, speed: [20, 60], size: [40, 70], life: [0.5, 0.9], sizeEnd: 1.5, max: 8 })
        v.ring(p, 8, 80, 0.3, '#f0c050', 0.1)
      }
      const f = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1
      for (const m of [shaft, head, gold]) (m.material as THREE.MeshBasicMaterial).opacity = f
      ;(glow.material as THREE.MeshBasicMaterial).opacity = 0.4 * f * (kk < 1 ? 1 : 0.3)
    })
  },

  /** Press the Attack: golden shield dome + dispel sparkle. */
  legion_press: (v, e, posOf) => {
    const u = e.unit ?? { x: e.x, y: e.y }
    const p = P(u.x, u.y)
    const base = unitPos(posOf, u)
    const dome = bmesh(new THREE.SphereGeometry(1, 22, 12, 0, PI * 2, 0, PI / 2), '#f0c050', 0.4)
    const grid = bmesh(new THREE.SphereGeometry(1.02, 12, 6, 0, PI * 2, 0, PI / 2), '#fff0b0', 0.35)
    ;(grid.material as THREE.MeshBasicMaterial).wireframe = true
    const g = new THREE.Group()
    g.add(dome, grid)
    g.position.set(p.x, 0, p.z)
    timed(v, g, 0.9, (k) => {
      const s = 60 + 90 * (1 - (1 - Math.min(1, k * 2.5)) * (1 - Math.min(1, k * 2.5)))
      g.scale.set(s, s * 1.3, s)
      const f = 1 - k
      ;(dome.material as THREE.MeshBasicMaterial).opacity = 0.38 * f
      ;(grid.material as THREE.MeshBasicMaterial).opacity = 0.5 * f
      if (e.unit) {
        g.position.x = (e.unit as any).x
        g.position.z = (e.unit as any).y
      }
    })
    v.ring(p, 20, 160, 0.6, '#f0c050', 0.09)
    v.column(p, 30, 300, 0.6, '#ffe9a0')
    v.emit({ pos: base.clone().setY(10), kind: 'spark', color: '#ffffff', color2: '#f0c050', burst: 30, shape: 'donut', radius: 50, speed: [20, 60], size: [14, 26], life: [0.7, 1.3], force: [0, 160, 0], max: 40 })
    v.emit({ pos: base.clone(), color: '#ffe9a0', alpha: 0.6, burst: 1, speed: [0, 0], size: [200, 200], life: [0.2, 0.2], sizeEnd: 0.5 })
    // dispel: cast-off dark motes flying outward
    v.emit({ pos: base.clone(), kind: 'ember', color: '#6a2a8a', color2: '#2a1030', burst: 10, shape: 'sphere', radius: 20, speed: [80, 200], size: [14, 24], life: [0.3, 0.6], max: 14 })
    if (e.unit) v.emit({ pos: base.clone(), kind: 'spark', color: '#ffe9a0', color2: '#f0c050', rate: 18, dur: 1.4, shape: 'donut', radius: 50, speed: [10, 30], size: [12, 20], life: [0.6, 1], force: [0, 80, 0], max: 30, follow: () => (posOf ? posOf(u) : null) })
  },

  /** Moment of Courage: counter flare. */
  legion_counter: (v, e, posOf) => {
    const u = e.unit ?? { x: e.x, y: e.y }
    const p = unitPos(posOf, u, 90)
    const a = e.angle ?? 0
    v.slash(p, a + 0.4, 190, 0.25, '#ff6a6a')
    v.slash(p, a - 0.4, 170, 0.22, '#f0c050')
    v.slash(p.clone().setY(p.y + 20), a, 120, 0.16, '#ffffff')
    v.emit({ pos: p, color: '#ffd8b0', alpha: 0.65, burst: 1, speed: [0, 0], size: [180, 180], life: [0.15, 0.15], sizeEnd: 0.4 })
    v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: '#e04a3a', burst: 18, shape: 'sphere', radius: 10, speed: [100, 300], size: [12, 24], life: [0.2, 0.45], max: 24 })
    v.ring(P(u.x, u.y), 10, 120, 0.35, '#e04a3a', 0.1)
  },
  /** Lifesteal motes streaming from the victim (x,y) to the unit. */
  legion_lifesteal: (v, e, posOf) => {
    const u = e.unit
    if (!u) return
    const n = 7
    const src = P(e.x, e.y, 70)
    for (let i = 0; i < n; i++) {
      const m = bmesh(new THREE.SphereGeometry(rnd(5, 8), 6, 5), i % 2 ? '#ff4a4a' : '#ff9a6a', 0.95)
      const off = new THREE.Vector3(rnd(-60, 60), rnd(0, 80), rnd(-60, 60))
      const dur = rnd(0.35, 0.6)
      const delay = i * 0.03
      const start = src.clone().add(new THREE.Vector3(rnd(-20, 20), rnd(-20, 30), rnd(-20, 20)))
      let tt = -delay
      until(v, m, (_t, dt) => {
        tt += dt
        if (tt < 0) {
          m.visible = false
          return true
        }
        m.visible = true
        const k = tt / dur
        if (k >= 1) return false
        const end = unitPos(posOf, u, 90)
        const s = k * k * (3 - 2 * k)
        m.position.lerpVectors(start, end, s).addScaledVector(off, Math.sin(k * PI) * 1.2)
        ;(m.material as THREE.MeshBasicMaterial).opacity = k > 0.8 ? (1 - k) / 0.2 : 1
        return true
      })
    }
    v.emit({ pos: unitPos(posOf, u, 90), kind: 'spark', color: '#ff8a8a', color2: '#ffd0a0', burst: 8, shape: 'sphere', radius: 30, speed: [10, 40], size: [14, 22], life: [0.5, 0.9], force: [0, 70, 0], max: 12 })
  },

  /** Duel: dueling rings under both fighters, arena circle, clashing link. */
  legion_duel: (v, e, posOf) => {
    const a = e.unit as any
    const b = e.unit2 as any
    if (!a || !b) return
    const dur = e.dur ?? 4.5
    const g = new THREE.Group()
    const mkRing = (rad: number, color: string) => {
      const grp = new THREE.Group()
      const ring = bmesh(new THREE.RingGeometry(0.92, 1, 48), color, 0.9)
      ring.rotation.x = -PI / 2
      const fill = bmesh(new THREE.CircleGeometry(1, 36), color, 0.12)
      fill.rotation.x = -PI / 2
      grp.add(ring, fill)
      for (let i = 0; i < 8; i++) {
        const t = bmesh(new THREE.PlaneGeometry(0.1, 0.22), '#ffe9a0', 0.9)
        t.rotation.x = -PI / 2
        const an = (i / 8) * PI * 2
        t.position.set(Math.cos(an) * 0.78, 0, Math.sin(an) * 0.78)
        t.rotation.z = -an
        grp.add(t)
      }
      grp.scale.set(rad, rad, rad)
      return grp
    }
    const ringA = mkRing(110, '#ffb040')
    const ringB = mkRing(110, '#ff6a3a')
    const arena = mkRing(300, '#ffd060')
    g.add(ringA, ringB, arena)
    const link = bmesh(new THREE.CylinderGeometry(3, 3, 1, 6, 1, true), '#fff0b0', 0.8)
    const linkGlow = bmesh(new THREE.CylinderGeometry(9, 9, 1, 8, 1, true), '#ffb040', 0.3)
    g.add(link, linkGlow)
    const up = new THREE.Vector3(0, 1, 0)
    let clash = 0
    let tick = 0
    until(v, g, (t, dt) => {
      const over = a.dead || b.dead || t > dur || (a.hasBuff && !a.hasBuff('duel'))
      const fade = Math.min(1, t * 4) * (t > dur - 0.3 ? Math.max(0, (dur - t) / 0.3) : 1)
      const pa = unitPos(posOf, a)
      const pb = unitPos(posOf, b)
      ringA.position.set(a.x, 6, a.y)
      ringB.position.set(b.x, 6, b.y)
      ringA.rotation.y += dt * 1.6
      ringB.rotation.y -= dt * 1.6
      const mid = pa.clone().lerp(pb, 0.5)
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      arena.position.set(mid.x, 5, mid.z)
      const ar = Math.max(200, dist / 2 + 130)
      arena.scale.set(ar, ar, ar)
      arena.rotation.y += dt * 0.5
      const d = pb.clone().sub(pa)
      const len = d.length()
      for (const m of [link, linkGlow]) {
        m.position.copy(pa).addScaledVector(d, 0.5)
        m.quaternion.setFromUnitVectors(up, d.clone().normalize())
        m.scale.set(1 + Math.sin(t * 30) * 0.2, Math.max(1, len), 1 + Math.sin(t * 30) * 0.2)
      }
      g.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
        if (mm && o !== link && o !== linkGlow) {
          if (mm.userData.b === undefined) mm.userData.b = mm.opacity
          mm.opacity = mm.userData.b * fade
        }
      })
      g.visible = fade > 0.01
      for (const m of [link, linkGlow]) (m.material as THREE.MeshBasicMaterial).opacity = (m === link ? 0.8 : 0.3) * fade * (0.7 + 0.3 * Math.sin(t * 25))
      clash -= dt
      if (clash <= 0) {
        clash = 0.35
        v.emit({ pos: mid.clone().setY(mid.y + 20), kind: 'spark', color: '#ffffff', color2: '#ffb040', burst: 10, shape: 'sphere', radius: 8, speed: [60, 220], size: [12, 24], life: [0.2, 0.45], max: 14 })
        v.emit({ pos: mid.clone().setY(mid.y + 20), color: '#fff0b0', alpha: 0.4, burst: 1, speed: [0, 0], size: [70, 70], life: [0.1, 0.1], sizeEnd: 0.3 })
      }
      tick -= dt
      if (tick <= 0) {
        tick = 0.5
        for (const u of [a, b]) v.emit({ pos: P(u.x, u.y, 8), kind: 'ember', color: '#ffd060', color2: '#ff6a3a', burst: 5, shape: 'donut', radius: 90, speed: [10, 30], size: [12, 20], life: [0.6, 1], force: [0, 70, 0], max: 8 })
      }
      return !over
    })
    // intro flash
    for (const u of [a, b]) {
      v.column(P(u.x, u.y), 36, 360, 0.6, '#ffb040')
      v.ring(P(u.x, u.y), 20, 130, 0.5, '#ffd060', 0.1)
    }
  },
  /** Duel finish: dramatic golden flash. */
  legion_duel_end: (v, e) => {
    const p = P(e.x, e.y)
    const win = !!e.win
    v.emit({ pos: p.clone().setY(100), color: '#fff0b0', alpha: 0.9, burst: 1, speed: [0, 0], size: [win ? 420 : 280, win ? 420 : 280], life: [0.35, 0.35], sizeEnd: 0.5 })
    v.column(p, win ? 70 : 40, win ? 800 : 500, 0.9, '#ffd060')
    v.ring(p, 20, win ? 340 : 220, 0.7, '#ffb040', 0.08)
    later(v, 0.12, () => v.ring(p, 20, win ? 260 : 160, 0.6, '#ffffff', 0.05))
    sparkRing(v, p, 130, win ? 50 : 26, '#ffffff', '#ffb040', 180)
    rays(v, p, win ? 400 : 260, 14, 1.0, '#ffd060')
    if (win) {
      v.emit({ pos: p.clone().setY(60), kind: 'spark', color: '#fff0b0', color2: '#ffb040', burst: 50, shape: 'sphere', radius: 30, speed: [100, 340], size: [16, 30], life: [0.5, 1.1], force: [0, 60, 0], max: 60 })
      banner(v, p, 300, 1.6, '#b02a22', '#f0c050', 0)
    }
  },
}
