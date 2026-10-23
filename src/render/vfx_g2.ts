import * as THREE from 'three'
import type { CustomVfx, Vfx, VfxEvt } from './vfx'

/** Hero-specific visual effects (g2: Windranger, Anti-Mage, Riki). Key = effect name used with `w.vfx(name, opts)`. */

type PosOf = ((u: { x: number; y: number }) => THREE.Vector3 | null) | undefined
const PI = Math.PI
const P = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, y)
type U = { x: number; y: number; dead?: boolean }
const UP = new THREE.Vector3(0, 1, 0)

function upos(posOf: PosOf, u: { x: number; y: number } | undefined, h = 0, fb?: { x: number; y: number }) {
  if (u) {
    const p = posOf?.(u)
    if (p) return p.clone().setY(p.y + h)
    return P(u.x, u.y, h)
  }
  return P(fb?.x ?? 0, fb?.y ?? 0, h)
}

function bm(color: string, opacity = 1, add = true) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide,
  })
}

/** Run a mesh effect for `dur` seconds. step returns false to end early. */
function run(v: Vfx, obj: THREE.Object3D, dur: number, step: (k: number, dt: number, t: number) => boolean | void) {
  v.scene.add(obj)
  let t = 0
  const kill = () => {
    v.scene.remove(obj)
    obj.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose?.()
    })
  }
  v.live.push({
    update: (dt) => {
      t += dt
      const k = t / dur
      if (k >= 1 || step(k, dt, t) === false) {
        kill()
        return false
      }
      return true
    },
    dispose: () => v.scene.remove(obj),
  })
}

function later(v: Vfx, delay: number, fn: () => void) {
  let t = 0
  v.live.push({
    update: (dt) => {
      t += dt
      if (t >= delay) {
        fn()
        return false
      }
      return true
    },
    dispose: () => {},
  })
}

const fadeEnds = (k: number, a = 0.12, b = 0.2) => Math.min(1, k / a, (1 - k) / b)

/** Dark translucent silhouette (afterimage / phase ghost). */
function ghost(v: Vfx, p: THREE.Vector3, color: string, dur: number, facing = 0, scale = 1, add = true) {
  const g = new THREE.Group()
  const m = bm(color, 0.5, add)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(14 * scale, 26 * scale, 70 * scale, 8), m)
  body.position.y = 40 * scale
  const head = new THREE.Mesh(new THREE.SphereGeometry(15 * scale, 8, 6), m)
  head.position.y = 88 * scale
  const cape = new THREE.Mesh(new THREE.ConeGeometry(26 * scale, 80 * scale, 6), m)
  cape.position.set(-14 * scale, 45 * scale, 0)
  cape.rotation.z = 0.35
  g.add(body, head, cape)
  g.position.copy(p)
  g.rotation.y = -facing
  run(v, g, dur, (k) => {
    m.opacity = 0.5 * (1 - k)
    g.scale.set(1 + k * 0.15, 1 + k * 0.05, 1 + k * 0.15)
  })
}

/** Horizontal ring around an axis at a position (for rotating bands, shockwaves along a line). */
function band(color: string, R: number, tube: number, opacity = 0.8, add = true) {
  return new THREE.Mesh(new THREE.TorusGeometry(R, tube, 6, 28), bm(color, opacity, add))
}

const smokePuff = (v: Vfx, p: THREE.Vector3, color: string, color2: string, n = 18, size: [number, number] = [30, 60], speed: [number, number] = [20, 90], alpha = 0.6) =>
  v.emit({ pos: p, kind: 'smoke', add: false, color, color2, alpha, burst: n, shape: 'sphere', radius: 16, speed, size, life: [0.6, 1.1], sizeEnd: 1.4, force: [0, 24, 0] })

export const VFX_G2: Record<string, CustomVfx> = {
  /* ============================================================ WINDRANGER */

  /** Shackleshot: ethereal chain between two stunned units plus rotating binding rings. e: unit, unit2?, dur, color */
  windranger_shackle: (v, e, posOf) => {
    const col = e.color || '#8ad06a'
    const dur = Math.max(0.5, e.dur ?? 1.6)
    const a = e.unit as U | undefined
    const b = e.unit2 as U | undefined
    const units = [a, b].filter(Boolean) as { x: number; y: number; dead?: boolean }[]
    for (const u of units) {
      const p = upos(posOf, u, 60)
      v.emit({ pos: p, color: '#ffffff', color2: col, burst: 18, shape: 'sphere', radius: 12, speed: [60, 190], size: [16, 34], life: [0.25, 0.55], sizeEnd: 0.1 })
      v.emit({ pos: p, kind: 'spark', color: '#e8ffd0', color2: col, burst: 8, shape: 'sphere', radius: 10, speed: [80, 220], size: [14, 26], life: [0.2, 0.45] })
      v.ring(upos(posOf, u, 0), 20, 95, 0.45, col)
      // lingering green motes
      v.emit({ pos: p, kind: 'ember', color: '#d8ffb0', color2: col, alpha: 0.8, rate: 10, dur, shape: 'sphere', radius: 40, speed: [4, 20], size: [10, 18], life: [0.7, 1.2], force: [0, 30, 0], max: 40, follow: () => (u.dead ? null : upos(posOf, u, 70)) })
    }
    // binding rings on each unit
    for (const u of units) {
      const g = new THREE.Group()
      const rings: THREE.Mesh[] = []
      for (let i = 0; i < 3; i++) {
        const m = band(i === 1 ? '#ffffff' : col, 44 - i * 4, 2.4 + (i === 1 ? 0 : 0.8), 0.85)
        m.rotation.x = PI / 2
        rings.push(m)
        g.add(m)
      }
      run(v, g, dur, (k, _dt, t) => {
        if (u.dead) return false
        const p = upos(posOf, u, 0)
        g.position.copy(p)
        const f = fadeEnds(k, 0.06, 0.15)
        rings.forEach((m, i) => {
          m.position.y = 30 + i * 28 + Math.sin(t * 3 + i) * 3
          m.rotation.z = t * (i % 2 ? -2.4 : 2.4)
          m.rotation.x = PI / 2 + Math.sin(t * 2.5 + i * 2) * 0.2
          ;(m.material as THREE.MeshBasicMaterial).opacity = 0.85 * f
          m.scale.setScalar(0.4 + Math.min(1, t * 6) * 0.6)
        })
      })
    }
    // chain of links between the two
    if (a && b) {
      const N = 12
      const g = new THREE.Group()
      const links: THREE.Mesh[] = []
      const lm = bm('#e6ffd0', 0.95)
      for (let i = 0; i < N; i++) {
        const m = new THREE.Mesh(new THREE.TorusGeometry(8, 2.2, 5, 10), lm)
        m.scale.set(1.5, 1, 1)
        links.push(m)
        g.add(m)
      }
      const glowBeam = bm(col, 0.3)
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 1, 8, 1, true), glowBeam)
      g.add(glow)
      const mtx = new THREE.Matrix4()
      let spark = 0
      run(v, g, dur, (k, dt, t) => {
        if (a.dead && b.dead) return false
        const pa = upos(posOf, a, 65)
        const pb = upos(posOf, b, 65)
        const dir = new THREE.Vector3().subVectors(pb, pa)
        const len = dir.length()
        if (len < 1) return
        dir.normalize()
        const side = new THREE.Vector3().crossVectors(dir, UP).normalize()
        const up2 = new THREE.Vector3().crossVectors(side, dir).normalize()
        links.forEach((m, i) => {
          const f = (i + 0.5) / N
          m.position.lerpVectors(pa, pb, f)
          m.position.y += Math.sin(f * PI) * -14 + Math.sin(t * 6 + i) * 2.5
          if (i % 2) mtx.makeBasis(dir, up2, side)
          else mtx.makeBasis(dir, side, up2)
          m.quaternion.setFromRotationMatrix(mtx)
        })
        glow.position.lerpVectors(pa, pb, 0.5)
        glow.quaternion.setFromUnitVectors(UP, dir)
        glow.scale.set(1 + Math.sin(t * 12) * 0.2, len, 1 + Math.sin(t * 12) * 0.2)
        const f = fadeEnds(k, 0.04, 0.12)
        lm.opacity = 0.95 * f
        glowBeam.opacity = 0.3 * f
        spark += dt
        if (spark > 0.22) {
          spark = 0
          const pp = new THREE.Vector3().lerpVectors(pa, pb, Math.random())
          v.emit({ pos: pp, kind: 'spark', color: '#f0ffd8', color2: col, burst: 3, shape: 'sphere', radius: 6, speed: [10, 50], size: [12, 22], life: [0.25, 0.5] })
        }
      })
    }
  },

  /** Powershot wind-up: gold orb grows at the bow with contracting rings. e: unit, angle, dur, token?:{done} */
  windranger_powershot_charge: (v, e, posOf) => {
    const u = e.unit as U | undefined
    if (!u) return
    const ang = e.angle ?? 0
    const dur = e.dur ?? 1
    const g = new THREE.Group()
    const orbM = bm('#fff6c0', 0.9)
    const orb = new THREE.Mesh(new THREE.SphereGeometry(10, 10, 8), orbM)
    const haloM = bm('#ffd860', 0.35)
    const halo = new THREE.Mesh(new THREE.SphereGeometry(16, 10, 8), haloM)
    g.add(orb, halo)
    const rings: THREE.Mesh[] = []
    for (let i = 0; i < 3; i++) {
      const m = band(i === 1 ? '#fff0a0' : '#a8e86a', 40, 1.6, 0.7)
      m.rotation.y = PI / 2 // face the shooting direction
      rings.push(m)
      g.add(m)
    }
    let acc = 0
    run(v, g, dur, (k, dt, t) => {
      if (e.token?.done || u.dead) {
        // quick release pop
        v.emit({ pos: g.position.clone(), color: '#fff6c0', color2: '#ffd860', burst: 10, shape: 'sphere', radius: 6, speed: [50, 160], size: [18, 34], life: [0.15, 0.35], sizeEnd: 0.1 })
        return false
      }
      const p = upos(posOf, u, 95)
      p.x += Math.cos(ang) * 48
      p.z += Math.sin(ang) * 48
      g.position.copy(p)
      g.rotation.y = -ang
      const s = 0.5 + k * 1.8
      orb.scale.setScalar(s)
      halo.scale.setScalar(s * (1 + Math.sin(t * 24) * 0.12))
      rings.forEach((m, i) => {
        const f = (t * 1.6 + i / 3) % 1
        m.position.x = 0
        m.scale.setScalar(1.3 * (1 - f) + 0.1)
        ;(m.material as THREE.MeshBasicMaterial).opacity = 0.7 * f
        m.rotation.z = t * 3
      })
      acc += dt
      if (acc > 0.16) {
        acc = 0
        const a2 = Math.random() * PI * 2
        const q = new THREE.Vector3(p.x + Math.cos(a2) * 50, p.y + Math.sin(a2) * 50, p.z + (Math.random() - 0.5) * 40)
        v.emit({ pos: q, kind: 'spark', color: '#fff0a0', color2: '#a8e86a', burst: 2, shape: 'point', speed: [0, 8], size: [10, 18], life: [0.2, 0.35] })
      }
    })
  },

  /** Powershot release: gold streak along the line, wind rings that race down it. e: x,y,angle,range,frac */
  windranger_powershot_fire: (v, e) => {
    const ang = e.angle ?? 0
    const range = e.range ?? 3000
    const frac = e.frac ?? 1
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    const o = P(e.x + dx * 40, e.y + dy * 40, 95)
    const end = P(e.x + dx * range, e.y + dy * range, 95)
    // muzzle burst
    v.emit({ pos: o, color: '#fff6c0', color2: '#ffd860', burst: 22, shape: 'cone', angle: 0.5, radius: 6, speed: [160, 420], size: [20, 40], life: [0.2, 0.45], sizeEnd: 0.1, up: false })
    v.emit({ pos: o, kind: 'spark', color: '#ffffff', color2: '#a8e86a', burst: 12, shape: 'sphere', radius: 8, speed: [100, 300], size: [14, 26], life: [0.2, 0.4] })
    v.emit({ pos: o, alpha: 0.6, color: '#fff0a0', burst: 1, shape: 'point', speed: [0, 0], size: [200, 200], life: [0.16, 0.16], sizeEnd: 1.4 })
    // long arrow streak
    const dir = new THREE.Vector3().subVectors(end, o)
    const len = dir.length()
    dir.normalize()
    const g = new THREE.Group()
    const coreM = bm('#ffffff', 0.95)
    const glowM = bm('#ffd860', 0.55)
    const outerM = bm('#8ad06a', 0.25)
    const core = new THREE.Mesh(new THREE.CylinderGeometry(2 + 3 * frac, 2 + 3 * frac, 1, 8, 1, true), coreM)
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(7 + 6 * frac, 7 + 6 * frac, 1, 10, 1, true), glowM)
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 1, 12, 1, true), outerM)
    g.add(core, glow, outer)
    g.quaternion.setFromUnitVectors(UP, dir)
    g.position.copy(o).addScaledVector(dir, len / 2)
    run(v, g, 0.55, (k) => {
      const grow = Math.min(1, k / 0.16)
      const L = len * (1 - Math.pow(1 - grow, 3))
      g.position.copy(o).addScaledVector(dir, L / 2)
      const w = 1 - k
      core.scale.set(w, L, w)
      glow.scale.set(w, L, w)
      outer.scale.set(w * 0.8 + 0.2, L, w * 0.8 + 0.2)
      coreM.opacity = 0.95 * w
      glowM.opacity = 0.55 * w
      outerM.opacity = 0.25 * w
    })
    // wind rings + sparks that race along the shot
    const n = 12
    for (let i = 1; i <= n; i++) {
      const dist = (i / n) * range * 0.95
      later(v, dist / 2600, () => {
        const p = P(e.x + dx * dist, e.y + dy * dist, 95)
        const m = band(i % 2 ? '#fff0a0' : '#a8e86a', 1, 0.07, 0.8)
        m.rotation.y = PI / 2
        const gg = new THREE.Group()
        gg.add(m)
        gg.position.copy(p)
        gg.rotation.y = -ang
        run(v, gg, 0.45, (k) => {
          m.scale.setScalar(20 + k * 120)
          m.scale.z = 1
          ;(m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k)
        })
        v.emit({ pos: p, kind: 'spark', color: '#fff6c0', color2: '#8ad06a', burst: 5, shape: 'sphere', radius: 22, speed: [20, 90], size: [12, 22], life: [0.3, 0.6], force: [0, 20, 0] })
      })
    }
  },

  /** Powershot impact on a unit. e: x,y */
  windranger_powershot_hit: (v, e) => {
    const p = P(e.x, e.y, 60)
    v.emit({ pos: p, color: '#fff6c0', color2: '#ffd860', burst: 16, shape: 'sphere', radius: 10, speed: [80, 240], size: [18, 36], life: [0.2, 0.5], sizeEnd: 0.1 })
    v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: '#a8e86a', burst: 8, shape: 'sphere', radius: 8, speed: [100, 260], size: [14, 24], life: [0.2, 0.4] })
    v.ring(P(e.x, e.y, 0), 10, 90, 0.35, '#ffd860')
    v.slash(P(e.x, e.y, 20), (e.angle ?? 0) + PI / 2, 70, 0.22, '#fff6c0')
  },

  /** Windrun: swirling wind bands, speed streaks, periodic afterimages. e: unit, dur */
  windranger_windrun: (v, e, posOf) => {
    const u = e.unit as U | undefined
    if (!u) return
    const dur = e.dur ?? 4
    const p0 = upos(posOf, u, 0)
    v.ring(p0, 20, 190, 0.6, '#a8e8c8')
    v.emit({ pos: p0.clone().setY(40), color: '#e8fff4', color2: '#a8e8c8', burst: 26, shape: 'donut', radius: 60, speed: [60, 200], size: [16, 34], life: [0.3, 0.7], force: [0, 40, 0] })
    v.emit({ pos: p0.clone().setY(50), color: '#c8ffe0', color2: '#60d8a0', alpha: 0.7, rate: 30, dur, shape: 'donut', radius: 46, speed: [20, 60], size: [14, 26], life: [0.5, 0.9], force: [0, 60, 0], max: 80, follow: () => (u.dead ? null : upos(posOf, u, 40)) })
    v.emit({ pos: p0.clone().setY(60), kind: 'spark', color: '#ffffff', color2: '#a8e8c8', rate: 14, dur, shape: 'sphere', radius: 30, speed: [0, 20], size: [14, 24], life: [0.3, 0.6], max: 40, follow: () => (u.dead ? null : upos(posOf, u, 60)) })
    const g = new THREE.Group()
    const bands: THREE.Mesh[] = []
    for (let i = 0; i < 3; i++) {
      const m = band(i === 1 ? '#ffffff' : '#a8e8c8', 50 - i * 6, 1.6, 0.5)
      m.rotation.x = PI / 2
      bands.push(m)
      g.add(m)
    }
    let acc = 0
    let prev = upos(posOf, u, 0)
    run(v, g, dur, (k, dt, t) => {
      if (u.dead) return false
      const p = upos(posOf, u, 0)
      g.position.copy(p)
      const f = fadeEnds(k, 0.05, 0.12)
      bands.forEach((m, i) => {
        m.position.y = 25 + i * 32 + Math.sin(t * 5 + i) * 4
        m.rotation.set(PI / 2 + Math.sin(t * 3 + i * 2) * 0.3, Math.cos(t * 2.4 + i) * 0.3, t * (i % 2 ? -7 : 7))
        m.scale.setScalar(1 + Math.sin(t * 4 + i) * 0.1)
        ;(m.material as THREE.MeshBasicMaterial).opacity = 0.5 * f
      })
      acc += dt
      if (acc > 0.2) {
        acc = 0
        const moved = Math.hypot(p.x - prev.x, p.z - prev.z)
        if (moved > 6) {
          const fac = Math.atan2(p.z - prev.z, p.x - prev.x)
          ghost(v, prev.clone(), '#7ae8b0', 0.45, fac, 1)
          v.slash(p.clone(), fac + PI, 60, 0.25, '#c8ffe0')
        }
        prev = p.clone()
      }
    })
  },

  /** Focus Fire: red reticle over the marked target, golden arrow-flurry aura on the archer. e: unit(target), src, dur, stop? */
  windranger_focus: (v, e, posOf) => {
    const t = e.unit as U | undefined
    const src = e.src
    const dur = e.dur ?? 20
    if (src) {
      const p = upos(posOf, src, 60)
      v.ring(upos(posOf, src, 0), 20, 160, 0.5, '#f0e070')
      v.emit({ pos: p, color: '#fff8c0', color2: '#f0c040', burst: 24, shape: 'sphere', radius: 14, speed: [70, 210], size: [16, 32], life: [0.25, 0.55], sizeEnd: 0.1 })
      v.emit({ pos: p, kind: 'spark', color: '#fff6a0', color2: '#f0a030', rate: 16, dur, shape: 'sphere', radius: 36, speed: [10, 40], size: [12, 22], life: [0.3, 0.6], force: [0, 30, 0], max: 50, follow: () => (src.dead || e.stop?.() ? null : upos(posOf, src, 70)) })
    }
    if (!t) return
    const g = new THREE.Group()
    const m1 = bm('#ff3030', 0.95)
    const ring = new THREE.Mesh(new THREE.RingGeometry(34, 40, 32), m1)
    ring.rotation.x = -PI / 2
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(22, 25, 32), bm('#ff7070', 0.7))
    ring2.rotation.x = -PI / 2
    const bars: THREE.Mesh[] = []
    for (let i = 0; i < 4; i++) {
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(16, 1.6, 4), bm('#ff4040', 0.95))
      b2.position.set(Math.cos((i * PI) / 2) * 46, 0, Math.sin((i * PI) / 2) * 46)
      b2.rotation.y = -(i * PI) / 2
      bars.push(b2)
      g.add(b2)
    }
    const pip = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), bm('#ff2020', 1))
    const flat = new THREE.Group()
    flat.add(ring, ring2, ...bars)
    g.add(flat, pip)
    run(v, g, dur, (k, _dt, tm) => {
      if (t.dead || e.stop?.()) {
        v.emit({ pos: upos(posOf, t, 90), color: '#ff6060', color2: '#a02020', burst: 14, shape: 'sphere', radius: 8, speed: [40, 140], size: [14, 26], life: [0.25, 0.5] })
        return false
      }
      const p = upos(posOf, t, 0)
      g.position.copy(p)
      flat.position.y = 95 + Math.sin(tm * 4) * 4
      flat.rotation.y = tm * 1.8
      flat.scale.setScalar(1 + Math.max(0, 1 - tm * 4) * 1.5 + Math.sin(tm * 8) * 0.04)
      pip.position.y = 95 + Math.sin(tm * 4) * 4
      pip.scale.setScalar(1 + Math.sin(tm * 10) * 0.3)
      void k
    })
    // lock-on stinger on the target
    v.emit({ pos: upos(posOf, t, 90), color: '#ff5050', color2: '#ffb0b0', burst: 16, shape: 'sphere', radius: 6, speed: [100, 240], size: [14, 28], life: [0.2, 0.5] })
  },

  /* ============================================================ ANTI-MAGE */

  /** Mana Break proc: violet mana wisps leaving the target plus a violet slash. e: x,y,angle */
  antimage_manabreak: (v, e) => {
    const p = P(e.x, e.y, 70)
    v.emit({ pos: p, kind: 'ember', color: '#e0b0ff', color2: '#6a7aff', burst: 16, shape: 'sphere', radius: 22, speed: [20, 70], size: [14, 26], life: [0.6, 1.1], force: [0, 80, 0], sizeEnd: 0.1 })
    v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: '#a070ff', burst: 7, shape: 'sphere', radius: 12, speed: [90, 230], size: [14, 24], life: [0.2, 0.4] })
    v.emit({ pos: p, color: '#7a5aff', alpha: 0.5, burst: 1, shape: 'point', speed: [0, 0], size: [120, 120], life: [0.18, 0.18], sizeEnd: 1.5 })
    v.slash(P(e.x, e.y, 20), e.angle ?? 0, 90, 0.25, '#b890ff')
    v.ring(P(e.x, e.y, 0), 8, 70, 0.3, '#8a6aff')
  },

  /** Blink: violet streak, bursts at both ends, afterimage. e: x,y,x2,y2 */
  antimage_blink: (v, e) => {
    const a = P(e.x, e.y, 55)
    const b = P(e.x2 ?? e.x, e.y2 ?? e.y, 55)
    const ang = Math.atan2(b.z - a.z, b.x - a.x)
    v.beam(() => a, () => b, 0.4, '#a070ff', 20)
    v.beam(() => a, () => b, 0.25, '#7ad0ff', 8)
    ghost(v, P(e.x, e.y, 0), '#8a6aff', 0.6, ang, 1)
    for (const [p, c1] of [[a, '#d8b8ff'], [b, '#a8e0ff']] as const) {
      v.emit({ pos: p, color: c1, color2: '#5a3aff', burst: 28, shape: 'sphere', radius: 14, speed: [80, 260], size: [18, 38], life: [0.25, 0.6], sizeEnd: 0.1 })
      v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: '#8a7aff', burst: 10, shape: 'sphere', radius: 10, speed: [100, 300], size: [14, 26], life: [0.2, 0.45] })
      v.emit({ pos: p, alpha: 0.5, color: '#9a7aff', burst: 1, shape: 'point', speed: [0, 0], size: [180, 180], life: [0.2, 0.2], sizeEnd: 1.5 })
      v.ring(p.clone().setY(0), 10, 120, 0.45, '#a070ff')
    }
    // particles strewn along the path
    const n = 8
    for (let i = 1; i < n; i++) {
      const q = new THREE.Vector3().lerpVectors(a, b, i / n)
      v.emit({ pos: q, kind: 'ember', color: '#c8a8ff', color2: '#4a6aff', burst: 3, shape: 'sphere', radius: 12, speed: [4, 30], size: [12, 22], life: [0.4, 0.8] })
    }
    // fading arrival silhouette
    later(v, 0.05, () => ghost(v, P(e.x2 ?? e.x, e.y2 ?? e.y, 0), '#7ad0ff', 0.4, ang, 1.05))
  },

  /** Counterspell shell: runic bubble following the unit. e: unit, dur */
  antimage_counterspell: (v, e, posOf) => {
    const u = e.unit as U | undefined
    if (!u) return
    const dur = e.dur ?? 1.2
    const g = new THREE.Group()
    const shellM = bm('#a8e0ff', 0.16)
    const shell = new THREE.Mesh(new THREE.SphereGeometry(70, 20, 14), shellM)
    shell.scale.y = 1.45
    shell.position.y = 62
    const lat = bm('#e8f8ff', 0.35)
    const lattice = new THREE.Mesh(new THREE.IcosahedronGeometry(72, 1), lat)
    lattice.material.wireframe = true
    lattice.scale.y = 1.45
    lattice.position.y = 62
    const rune = band('#c8f0ff', 66, 2.2, 0.85)
    rune.rotation.x = PI / 2
    rune.position.y = 6
    const rune2 = band('#8ab0ff', 54, 1.6, 0.7)
    rune2.rotation.x = PI / 2
    rune2.position.y = 10
    const marks: THREE.Mesh[] = []
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(9, 1.5, 3), bm('#ffffff', 0.9))
      const a = (i / 8) * PI * 2
      m.position.set(Math.cos(a) * 60, 8, Math.sin(a) * 60)
      m.rotation.y = -a
      marks.push(m)
      g.add(m)
    }
    g.add(shell, lattice, rune, rune2)
    const p0 = upos(posOf, u, 0)
    v.ring(p0, 20, 130, 0.5, '#a8e0ff')
    v.emit({ pos: p0.clone().setY(60), color: '#ffffff', color2: '#a8e0ff', burst: 24, shape: 'sphere', radius: 30, speed: [60, 180], size: [14, 30], life: [0.25, 0.55], sizeEnd: 0.1 })
    v.emit({ pos: p0.clone().setY(60), kind: 'spark', color: '#e8f8ff', color2: '#7ab0ff', alpha: 0.8, rate: 14, dur, shape: 'sphere', radius: 62, speed: [0, 14], size: [10, 18], life: [0.3, 0.6], max: 40, follow: () => (u.dead ? null : upos(posOf, u, 60)) })
    run(v, g, dur, (k, _dt, t) => {
      if (u.dead || (e.stop?.() ?? false)) return false
      g.position.copy(upos(posOf, u, 0))
      const pop = Math.min(1, t / 0.15)
      const s = 0.5 + 0.5 * (1 - Math.pow(1 - pop, 3))
      g.scale.setScalar(s)
      const flick = k > 0.8 ? (Math.sin(k * 90) > 0 ? 1 : 0.3) : 1
      shellM.opacity = (0.14 + Math.sin(t * 8) * 0.04) * flick
      lat.opacity = 0.35 * flick
      lattice.rotation.y = t * 1.2
      rune.rotation.z = t * 2.4
      rune2.rotation.z = -t * 3.2
      marks.forEach((m, i) => {
        const a = (i / 8) * PI * 2 + t * 1.6
        m.position.set(Math.cos(a) * 60, 8, Math.sin(a) * 60)
        m.rotation.y = -a
      })
    })
  },

  /** Counterspell blocked a spell: bright reflect flash. e: x,y */
  antimage_counterspell_block: (v, e) => {
    const p = P(e.x, e.y, 65)
    v.emit({ pos: p, color: '#ffffff', color2: '#7ad0ff', burst: 36, shape: 'sphere', radius: 20, speed: [120, 380], size: [20, 44], life: [0.25, 0.6], sizeEnd: 0.1 })
    v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: '#a8e0ff', burst: 18, shape: 'sphere', radius: 14, speed: [160, 420], size: [16, 30], life: [0.2, 0.5] })
    v.emit({ pos: p, alpha: 0.7, color: '#e8f8ff', burst: 1, shape: 'point', speed: [0, 0], size: [320, 320], life: [0.22, 0.22], sizeEnd: 1.5 })
    v.ring(P(e.x, e.y, 0), 20, 190, 0.5, '#ffffff')
    v.ring(P(e.x, e.y, 0), 10, 130, 0.4, '#7ad0ff')
    const g = new THREE.Group()
    const m = new THREE.Mesh(new THREE.SphereGeometry(70, 16, 12), bm('#ffffff', 0.5))
    m.scale.y = 1.45
    m.position.y = 62
    g.add(m)
    g.position.set(e.x, 0, e.y)
    run(v, g, 0.35, (k) => {
      m.scale.set(1 + k * 0.9, 1.45 + k * 0.9, 1 + k * 0.9)
      ;(m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k)
    })
  },

  /** Mana Void: violet sphere implodes, then a big blue-violet shockwave. e: x,y,r,unit? */
  antimage_manavoid: (v, e, posOf) => {
    const r = e.r ?? 500
    const c = e.unit ? upos(posOf, e.unit, 0) : P(e.x, e.y, 0)
    const g = new THREE.Group()
    const coreM = bm('#2a104a', 0.9, false)
    const core = new THREE.Mesh(new THREE.SphereGeometry(30, 14, 10), coreM)
    const shellM = bm('#a070ff', 0.55)
    const shell = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), shellM)
    const bandA = band('#e0c8ff', 30, 1.8, 0.8)
    const bandB = band('#7ad0ff', 30, 1.4, 0.7)
    g.add(core, shell, bandA, bandB)
    g.position.set(c.x, 80, c.z)
    // inward-sucked sparks
    v.emit({ pos: c.clone().setY(80), kind: 'ember', color: '#e0b0ff', color2: '#5a3aff', burst: 36, shape: 'sphere', radius: 150, speed: [-200, -120], size: [14, 28], life: [0.25, 0.3], sizeEnd: 0.1 })
    v.ring(c.clone(), r * 0.9, 30, 0.34, '#8a6aff', 0.2)
    run(v, g, 0.36, (k, _dt, t) => {
      const s = 4 * Math.pow(1 - k, 2) + 0.5 + Math.sin(t * 50) * 0.08
      g.scale.setScalar(s)
      bandA.rotation.set(t * 9, t * 5, 0)
      bandB.rotation.set(0, t * 7, t * 11)
      shellM.opacity = 0.55
    })
    later(v, 0.34, () => {
      const p = c.clone()
      // detonation
      v.emit({ pos: p.clone().setY(80), alpha: 0.8, color: '#ffffff', burst: 1, shape: 'point', speed: [0, 0], size: [420, 420], life: [0.25, 0.25], sizeEnd: 1.6 })
      v.emit({ pos: p.clone().setY(70), color: '#e0c8ff', color2: '#4a6aff', burst: 60, shape: 'sphere', radius: 20, speed: [200, 700], size: [26, 56], life: [0.4, 0.9], sizeEnd: 0.1 })
      v.emit({ pos: p.clone().setY(60), kind: 'spark', color: '#ffffff', color2: '#7ad0ff', burst: 28, shape: 'sphere', radius: 14, speed: [250, 650], size: [16, 30], life: [0.3, 0.7] })
      v.emit({ pos: p.clone().setY(10), kind: 'smoke', add: false, color: '#5a3aa0', color2: '#2a1a60', alpha: 0.5, burst: 24, shape: 'donut', radius: r * 0.5, speed: [60, 240], size: [60, 120], life: [0.7, 1.3], sizeEnd: 1.5, force: [0, 20, 0] })
      v.ring(p.clone(), 20, r, 0.7, '#9a6aff', 0.14)
      v.ring(p.clone(), 10, r * 0.75, 0.55, '#7ad0ff', 0.1)
      v.ring(p.clone(), 10, r * 0.45, 0.45, '#ffffff', 0.08)
      v.column(p.clone(), 70, 520, 0.55, '#a070ff')
      v.spikes(p.clone(), r * 0.8, 20, 150, 0.8, '#8a6aff')
      // expanding dome
      const dg = new THREE.Group()
      const dm = bm('#a070ff', 0.4)
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, PI * 2, 0, PI / 2), dm)
      dg.add(dome)
      dg.position.copy(p)
      run(v, dg, 0.6, (k) => {
        const kk = 1 - Math.pow(1 - k, 3)
        dome.scale.set(r * kk, r * 0.35 * kk, r * kk)
        dm.opacity = 0.4 * (1 - k)
      })
      // stun stars above the target
      if (e.unit) {
        v.emit({ pos: upos(posOf, e.unit, 130), kind: 'spark', color: '#fff6a0', color2: '#ffffff', alpha: 1, rate: 12, dur: 0.4, shape: 'donut', radius: 28, speed: [4, 14], size: [14, 22], life: [0.3, 0.5], max: 14, follow: () => upos(posOf, e.unit, 130) })
      }
    })
  },

  /* ================================================================== RIKI */

  /** Smoke Screen: dense dark-violet cloud lasting the whole duration. e: x,y,r,dur */
  riki_smoke: (v, e) => {
    const r = e.r ?? 425
    const dur = e.dur ?? 6
    const c = P(e.x, e.y, 0)
    // bomb pop
    v.emit({ pos: c.clone().setY(40), color: '#ffffff', color2: '#9a6aff', burst: 24, shape: 'sphere', radius: 14, speed: [120, 420], size: [20, 44], life: [0.25, 0.5], sizeEnd: 0.1 })
    v.emit({ pos: c.clone().setY(30), alpha: 0.7, color: '#c8a8ff', burst: 1, shape: 'point', speed: [0, 0], size: [260, 260], life: [0.2, 0.2], sizeEnd: 1.5 })
    v.emit({ pos: c.clone().setY(25), kind: 'smoke', add: false, color: '#3a2860', color2: '#1a1030', alpha: 0.75, burst: 50, shape: 'donut', radius: r * 0.55, speed: [r * 0.25, r * 0.7], size: [r * 0.25, r * 0.45], life: [1.0, 1.8], sizeEnd: 1.3, force: [0, 10, 0], max: 80 })
    v.ring(c.clone(), 30, r, 0.5, '#9a8ac8', 0.06)
    // the lingering cloud: dark body + violet wisps + occasional rim pulse
    v.emit({ pos: c.clone().setY(40), kind: 'smoke', add: false, color: '#2e2050', color2: '#4a3478', alpha: 0.7, rate: 34, dur, shape: 'sphere', radius: r * 0.8, speed: [4, 22], size: [r * 0.28, r * 0.5], life: [2.0, 3.2], sizeEnd: 1.25, force: [0, 8, 0], max: 150, follow: () => c })
    v.emit({ pos: c.clone().setY(70), kind: 'smoke', add: false, color: '#1a1030', color2: '#3a2a60', alpha: 0.55, rate: 12, dur, shape: 'sphere', radius: r * 0.65, speed: [2, 14], size: [r * 0.35, r * 0.6], life: [2.4, 3.6], sizeEnd: 1.2, force: [0, 14, 0], max: 60, follow: () => c })
    v.emit({ pos: c.clone().setY(30), kind: 'ember', color: '#c8a0ff', color2: '#6a4aff', alpha: 0.7, rate: 9, dur, shape: 'sphere', radius: r * 0.8, speed: [8, 30], size: [10, 18], life: [1.0, 1.8], force: [0, 40, 0], max: 40, follow: () => c })
    for (let i = 1; i * 1.4 < dur - 0.4; i++) later(v, i * 1.4, () => v.ring(c.clone(), r * 0.88, r, 0.9, '#7a5ac8', 0.04))
    // fade-out puff when it ends
    later(v, dur, () => v.emit({ pos: c.clone().setY(40), kind: 'smoke', add: false, color: '#3a2860', color2: '#1a1030', alpha: 0.4, burst: 24, shape: 'sphere', radius: r * 0.7, speed: [20, 80], size: [r * 0.3, r * 0.5], life: [0.8, 1.4], sizeEnd: 1.8, max: 40 }))
  },

  /** Blink Strike: shadow streak and a backstab slash. e: x,y (from), x2,y2 (to), angle */
  riki_blinkstrike: (v, e) => {
    const a = P(e.x, e.y, 50)
    const b = P(e.x2 ?? e.x, e.y2 ?? e.y, 50)
    const ang = e.angle ?? Math.atan2(b.z - a.z, b.x - a.x)
    v.beam(() => a, () => b, 0.35, '#2a1a5a', 26)
    v.beam(() => a, () => b, 0.22, '#9a6aff', 9)
    ghost(v, P(e.x, e.y, 0), '#5a3aa8', 0.55, ang, 0.95, false)
    smokePuff(v, a.clone().setY(30), '#3a2860', '#1a1030', 18, [34, 70], [30, 110])
    v.emit({ pos: a, kind: 'ember', color: '#b890ff', color2: '#4a2aa8', burst: 8, shape: 'sphere', radius: 12, speed: [40, 130], size: [12, 22], life: [0.3, 0.6] })
    const n = 6
    for (let i = 1; i < n; i++) smokePuff(v, new THREE.Vector3().lerpVectors(a, b, i / n).setY(30), '#2e2050', '#1a1030', 3, [26, 44], [8, 30], 0.5)
    // arrival: backstab
    later(v, 0.05, () => {
      v.emit({ pos: b, color: '#ffffff', color2: '#ff5a7a', burst: 14, shape: 'sphere', radius: 8, speed: [100, 300], size: [16, 30], life: [0.2, 0.45], sizeEnd: 0.1 })
      v.emit({ pos: b, kind: 'spark', color: '#ffffff', color2: '#c06aff', burst: 10, shape: 'sphere', radius: 10, speed: [120, 320], size: [14, 24], life: [0.2, 0.4] })
      v.ring(P(e.x2 ?? e.x, e.y2 ?? e.y, 0), 8, 100, 0.35, '#9a6aff')
      v.slash(P(e.x2 ?? e.x, e.y2 ?? e.y, 25), ang, 105, 0.24, '#ffffff')
      later(v, 0.07, () => v.slash(P(e.x2 ?? e.x, e.y2 ?? e.y, 45), ang + 0.6, 90, 0.22, '#d89aff'))
      ghost(v, P(e.x2 ?? e.x, e.y2 ?? e.y, 0), '#7a5ae8', 0.3, ang, 1)
    })
  },

  /** Tricks of the Trade start: phase-out burst and lingering shadow mist on Riki. e: unit, dur, r */
  riki_tricks_start: (v, e, posOf) => {
    const u = e.unit as U | undefined
    if (!u) return
    const dur = e.dur ?? 2
    const p = upos(posOf, u, 50)
    smokePuff(v, p, '#3a2860', '#1a1030', 26, [40, 80], [40, 160])
    v.emit({ pos: p, color: '#ffffff', color2: '#c06aff', burst: 22, shape: 'sphere', radius: 12, speed: [100, 340], size: [16, 34], life: [0.25, 0.55], sizeEnd: 0.1 })
    v.ring(upos(posOf, u, 0), 20, e.r ?? 450, 0.6, '#c06ae8', 0.06)
    v.ring(upos(posOf, u, 0), 10, (e.r ?? 450) * 0.6, 0.5, '#7a4ac8', 0.05)
    v.emit({ pos: p, kind: 'smoke', add: false, color: '#2e2050', color2: '#4a2a80', alpha: 0.55, rate: 18, dur, shape: 'sphere', radius: 50, speed: [10, 40], size: [40, 80], life: [0.6, 1.0], sizeEnd: 1.4, force: [0, 20, 0], max: 40, follow: () => (u.dead ? null : upos(posOf, u, 50)) })
    v.emit({ pos: p, kind: 'ember', color: '#e0b8ff', color2: '#8a4aff', rate: 14, dur, shape: 'sphere', radius: 40, speed: [20, 70], size: [10, 18], life: [0.4, 0.8], max: 30, follow: () => (u.dead ? null : upos(posOf, u, 60)) })
    // flickering phase silhouette around the user
    let acc = 0
    const g = new THREE.Group()
    run(v, g, dur, (k, dt) => {
      if (u.dead) return false
      acc += dt
      if (acc > 0.25) {
        acc = 0
        const a = Math.random() * PI * 2
        const q = upos(posOf, u, 0)
        q.x += Math.cos(a) * 40
        q.z += Math.sin(a) * 40
        ghost(v, q, '#a070ff', 0.28, a + PI, 0.9)
      }
      void k
    })
  },

  /** One Tricks of the Trade strike: random-angle slashes and shadow burst at the target. e: x,y(target), x2,y2(riki) */
  riki_tricks_slash: (v, e) => {
    const t = P(e.x, e.y, 55)
    const base = Math.random() * PI * 2
    const from = e.x2 !== undefined ? P(e.x2, e.y2 ?? 0, 55) : t.clone()
    v.beam(() => from, () => t, 0.18, '#d89aff', 9)
    smokePuff(v, t.clone().setY(40), '#3a2860', '#1a1030', 12, [30, 60], [40, 150])
    v.emit({ pos: t, color: '#ffffff', color2: '#c06aff', burst: 12, shape: 'sphere', radius: 8, speed: [100, 300], size: [14, 28], life: [0.2, 0.45], sizeEnd: 0.1 })
    v.emit({ pos: t, kind: 'spark', color: '#ffffff', color2: '#ff7aa0', burst: 8, shape: 'sphere', radius: 10, speed: [140, 340], size: [12, 22], life: [0.15, 0.35] })
    const cols = ['#ffffff', '#d89aff', '#9a6aff']
    for (let i = 0; i < 3; i++) later(v, i * 0.045, () => v.slash(P(e.x, e.y, 25 + i * 20), base + i * 2.1 + Math.random(), 85 + i * 10, 0.2, cols[i]))
    // phase silhouette that appeared behind the victim
    ghost(v, P(e.x - Math.cos(base) * 55, e.y - Math.sin(base) * 55, 0), '#5a3aa8', 0.32, base, 0.95, false)
  },

  /** Cloak and Dagger: shadow mist as Riki vanishes. e: x,y */
  riki_cloak_fade: (v, e) => {
    const p = P(e.x, e.y, 45)
    smokePuff(v, p, '#2e2050', '#120a28', 22, [40, 80], [20, 90], 0.65)
    v.emit({ pos: p, kind: 'ember', color: '#c8a0ff', color2: '#4a2aa8', burst: 14, shape: 'sphere', radius: 30, speed: [10, 60], size: [10, 20], life: [0.5, 1.0], force: [0, 60, 0] })
    v.ring(P(e.x, e.y, 0), 10, 85, 0.45, '#6a4ac8', 0.08)
    ghost(v, P(e.x, e.y, 0), '#4a2a98', 0.5, 0, 1, false)
  },

  /** Backstab from behind: red crit flash. e: x,y,angle */
  riki_backstab: (v, e) => {
    const p = P(e.x, e.y, 60)
    v.emit({ pos: p, color: '#ffffff', color2: '#ff3a4a', burst: 20, shape: 'sphere', radius: 10, speed: [120, 360], size: [18, 38], life: [0.2, 0.5], sizeEnd: 0.1 })
    v.emit({ pos: p, kind: 'spark', color: '#ffe0e0', color2: '#ff2040', burst: 12, shape: 'sphere', radius: 8, speed: [160, 380], size: [14, 26], life: [0.2, 0.45] })
    v.emit({ pos: p, alpha: 0.6, color: '#ff4060', burst: 1, shape: 'point', speed: [0, 0], size: [220, 220], life: [0.18, 0.18], sizeEnd: 1.5 })
    v.slash(P(e.x, e.y, 30), e.angle ?? 0, 120, 0.26, '#ff5068')
    later(v, 0.05, () => v.slash(P(e.x, e.y, 55), (e.angle ?? 0) + 0.7, 100, 0.22, '#ffffff'))
    v.ring(P(e.x, e.y, 0), 8, 90, 0.3, '#ff3a4a', 0.1)
  },
}

export type { VfxEvt }
