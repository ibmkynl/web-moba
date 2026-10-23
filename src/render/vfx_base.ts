import * as THREE from 'three'
import type { CustomVfx, Vfx, VfxEvt } from './vfx'

/** Hero-specific visual effects (base five: Pudge, Sniper, Mirana, Axe, Rubick). Key = effect name used with `w.vfx(name, opts)`. */

type PosOf = ((u: { x: number; y: number }) => THREE.Vector3 | null) | undefined

const P = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, y)
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/** Run `fn(t, dt)` every frame for `dur` seconds (fn may return false to stop early). */
function timeline(v: Vfx, dur: number, fn: (t: number, dt: number) => boolean | void, done?: () => void) {
  let t = 0
  v.live.push({
    update: (dt) => {
      t += dt
      if (t >= dur || fn(t, dt) === false) {
        done?.()
        return false
      }
      return true
    },
    dispose: () => done?.(),
  })
}

const later = (v: Vfx, delay: number, fn: () => void) => timeline(v, delay, () => {}, fn)

/** Add an object to the scene for `dur` seconds, calling step(k 0..1, dt) each frame; disposed afterwards. */
function timed(v: Vfx, obj: THREE.Object3D, dur: number, step: (k: number, dt: number) => void) {
  v.scene.add(obj)
  const kill = () => {
    v.scene.remove(obj)
    obj.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mt = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mt)) mt.forEach((x) => x.dispose())
      else mt?.dispose?.()
    })
  }
  let t = 0
  v.live.push({
    update: (dt) => {
      t += dt
      if (t >= dur) {
        kill()
        return false
      }
      step(t / dur, dt)
      return true
    },
    dispose: kill,
  })
}

const addMat = (color: string, opacity = 1, side: THREE.Side = THREE.DoubleSide) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side })

const spriteMat = (v: Vfx, color: string, opacity = 1) =>
  new THREE.SpriteMaterial({ map: v.tex.glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })

/** follow function for particle emitters: tracks a unit (optionally ends when a buff disappears) with a height override. */
function followUnit(e: VfxEvt, posOf: PosOf, h?: number): (() => THREE.Vector3 | null) | undefined {
  const u = e.unit as any
  if (!u || !posOf) return undefined
  return () => {
    if (u.dead) return null
    if (e.buff && u.hasBuff && !u.hasBuff(e.buff)) return null
    const p = posOf(u)
    if (p && h !== undefined) p.y = h
    return p
  }
}

let rotN = 0
const dirOf = (a: number) => ({ cx: Math.cos(a), cz: Math.sin(a) })

export const VFX_BASE: Record<string, CustomVfx> = {
  /* ============================================================== PUDGE */
  pudge_hook_cast: (v, e) => {
    const a = e.angle ?? 0
    const { cx, cz } = dirOf(a)
    const p = P(e.x + cx * 70, e.y + cz * 70, 70)
    v.emit({ pos: p, color: '#ff4a3a', color2: '#5a0808', burst: 16, shape: 'sphere', radius: 8, speed: [60, 200], size: [14, 30], life: [0.2, 0.5], sizeEnd: 0.1 })
    v.emit({ pos: p, kind: 'spark', color: '#ffd0c0', color2: '#c02020', burst: 8, shape: 'sphere', radius: 6, speed: [100, 260], size: [12, 22], life: [0.15, 0.35] })
    v.slash(P(e.x, e.y, 0), a, 110, 0.28, '#c02828')
  },
  pudge_hook_hit: (v, e, posOf) => {
    const p = P(e.x, e.y, 60)
    v.emit({ pos: p, add: false, color: '#b01414', color2: '#3a0606', burst: 40, shape: 'sphere', radius: 12, speed: [90, 280], size: [16, 34], life: [0.35, 0.8], sizeEnd: 0.1, force: [0, -320, 0] })
    v.emit({ pos: p, kind: 'ember', add: false, color: '#e03030', color2: '#601010', burst: 18, shape: 'sphere', radius: 8, speed: [120, 320], size: [8, 16], life: [0.4, 0.9], force: [0, -420, 0] })
    v.emit({ pos: p, color: '#d83030', alpha: 0.5, burst: 1, speed: [0, 0], size: [160, 160], life: [0.18, 0.18], sizeEnd: 1.5 })
    v.ring(P(e.x, e.y, 0), 20, 140, 0.45, '#b02020')
    v.slash(P(e.x, e.y, 0), 0.8, 90, 0.25, '#e04040')
    v.slash(P(e.x, e.y, 0), 0.8 + Math.PI, 90, 0.25, '#e04040')
    // blood drips trailing the victim while it is dragged back
    const f = followUnit(e, posOf)
    if (f) v.emit({ pos: p, add: false, color: '#a01010', color2: '#400808', rate: 34, dur: 1.0, follow: f, shape: 'sphere', radius: 14, speed: [4, 22], size: [10, 20], life: [0.3, 0.6], force: [0, -260, 0], max: 80 })
  },
  pudge_rot_puff: (v, e) => {
    const r = e.r ?? 250
    const p = P(e.x, e.y, 25)
    v.emit({ pos: p, kind: 'smoke', add: false, color: '#6fa02a', color2: '#2e4a14', alpha: 0.7, burst: 9, shape: 'sphere', radius: r * 0.7, speed: [4, 18], size: [r * 0.4, r * 0.65], life: [1.3, 1.9], sizeEnd: 1.3, force: [0, 22, 0], max: 24 })
    v.emit({ pos: p, kind: 'ember', color: '#c4f04a', color2: '#58a020', burst: 6, shape: 'sphere', radius: r * 0.65, speed: [6, 26], size: [10, 18], life: [0.8, 1.5], force: [0, 55, 0], max: 12 })
    if (rotN++ % 3 === 0) v.ring(P(e.x, e.y, 0), r * 0.9, r, 0.9, '#6fa02a', 0.04)
  },
  pudge_heap_cast: (v, e, posOf) => {
    const u = e.unit as any
    const dur = e.dur ?? 5
    const p = P(e.x, e.y, 60)
    v.emit({ pos: p, add: false, color: '#d83a3a', color2: '#500808', burst: 36, shape: 'sphere', radius: 20, speed: [80, 240], size: [18, 38], life: [0.35, 0.8], sizeEnd: 0.1, force: [0, -120, 0] })
    v.emit({ pos: p, kind: 'ember', color: '#f08080', color2: '#a02020', burst: 16, shape: 'sphere', radius: 14, speed: [60, 160], size: [10, 18], life: [0.5, 1.0], force: [0, 90, 0] })
    v.ring(P(e.x, e.y, 0), 20, 170, 0.55, '#c05a5a')
    // pulsing blood-red shell that follows Pudge for the buff duration
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), addMat('#c02828', 0.2, THREE.FrontSide))
    const veins = new THREE.Mesh(new THREE.IcosahedronGeometry(1.02, 1), new THREE.MeshBasicMaterial({ color: '#ff6a6a', wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }))
    const g = new THREE.Group()
    g.add(shell, veins)
    shell.renderOrder = veins.renderOrder = 4
    timed(v, g, dur, (k) => {
      const pp = u && posOf ? posOf(u) : P(e.x, e.y, 60)
      if (pp) g.position.copy(pp)
      const beat = Math.pow(Math.max(0, Math.sin((k * dur) * 6.5)), 3)
      const s = 78 + beat * 14
      g.scale.setScalar(s)
      ;(shell.material as THREE.MeshBasicMaterial).opacity = (0.13 + beat * 0.16) * (k > 0.85 ? (1 - k) / 0.15 : 1)
      ;(veins.material as THREE.MeshBasicMaterial).opacity = (0.2 + beat * 0.3) * (k > 0.85 ? (1 - k) / 0.15 : 1)
      veins.rotation.y += 0.01
    })
  },
  pudge_heap_stack: (v, e) => {
    const p = P(e.x, e.y, 90)
    v.emit({ pos: p, kind: 'ember', color: '#ff7a7a', color2: '#8a1c1c', burst: 18, shape: 'sphere', radius: 40, speed: [20, 70], size: [12, 24], life: [0.6, 1.0], force: [0, 120, 0] })
    v.ring(P(e.x, e.y, 0), 20, 110, 0.5, '#c05a5a')
    v.column(P(e.x, e.y, 0), 28, 220, 0.6, '#c04040')
  },
  pudge_dismember_start: (v, e, posOf) => {
    const dur = e.dur ?? 2.75
    const p = P(e.x, e.y, 60)
    v.emit({ pos: p, color: '#c02020', color2: '#400808', burst: 20, shape: 'sphere', radius: 14, speed: [50, 160], size: [16, 32], life: [0.3, 0.7], force: [0, -150, 0] })
    v.ring(P(e.x, e.y, 0), 130, 25, 0.5, '#a02828')
    const f = followUnit(e, posOf)
    if (f) v.emit({ pos: p, add: false, color: '#a01010', color2: '#300606', rate: 14, dur, follow: f, shape: 'sphere', radius: 16, speed: [4, 20], size: [10, 22], life: [0.35, 0.7], force: [0, -280, 0], max: 80 })
  },
  pudge_dismember_chomp: (v, e) => {
    const p = P(e.x, e.y, 0)
    v.slash(p, Math.PI / 2, 105, 0.26, '#c01818')
    v.slash(p, -Math.PI / 2, 105, 0.26, '#c01818')
    const q = P(e.x, e.y, 70)
    v.emit({ pos: q, add: false, color: '#c01818', color2: '#400808', burst: 22, shape: 'sphere', radius: 14, speed: [60, 220], size: [14, 30], life: [0.3, 0.7], force: [0, -300, 0] })
    v.emit({ pos: q, kind: 'spark', color: '#ffb0a0', color2: '#c02020', burst: 6, shape: 'sphere', radius: 10, speed: [100, 240], size: [10, 18], life: [0.15, 0.35] })
    // fangs: quick spike pair
    v.spikes(p, 55, 6, 80, 0.3, '#e8e0c0')
  },

  /* ============================================================== SNIPER */
  sniper_shrapnel: (v, e) => {
    const r = e.r ?? 425
    const delay = e.delay ?? 1.2
    const dur = e.dur ?? 10
    const c = P(e.x, e.y, 0)
    // phase 1: shells rain down over `delay`
    const shells: { m: THREE.Mesh; trail: THREE.Mesh; x: number; z: number; t0: number; done: boolean }[] = []
    const grp = new THREE.Group()
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2
      const rr = Math.sqrt(Math.random()) * r * 0.95
      const m = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 24, 6), new THREE.MeshBasicMaterial({ color: '#e8c070' }))
      const trail = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 3, 1, 5, 1, true), addMat('#ffb050', 0.6))
      grp.add(m, trail)
      m.position.y = trail.position.y = -999
      shells.push({ m, trail, x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr, t0: (i / 18) * (delay - 0.4) + Math.random() * 0.1, done: false })
    }
    const fall = 0.38
    timed(v, grp, delay + 0.1, (k) => {
      const t = k * (delay + 0.1)
      for (const s of shells) {
        const f = (t - s.t0) / fall
        if (f < 0 || s.done) {
          if (f >= 1 || s.done) s.m.visible = s.trail.visible = false
          continue
        }
        if (f >= 1) {
          s.done = true
          v.emit({ pos: P(s.x, s.z, 6), kind: 'spark', color: '#ffe0a0', color2: '#c8a050', burst: 5, shape: 'sphere', radius: 4, speed: [40, 130], size: [10, 18], life: [0.2, 0.45], force: [0, -120, 0] })
          v.emit({ pos: P(s.x, s.z, 6), kind: 'smoke', add: false, color: '#9a8a6a', alpha: 0.35, burst: 2, shape: 'point', speed: [4, 16], size: [28, 44], life: [0.5, 0.9], sizeEnd: 1.6, max: 4 })
          continue
        }
        const y = 800 * (1 - f * f)
        s.m.position.set(s.x, y, s.z)
        s.trail.position.set(s.x, y + 60, s.z)
        s.trail.scale.set(1, 120, 1)
      }
    })
    // phase 2: spiked field with glints for the duration of the zone
    later(v, delay, () => {
      const field = new THREE.Group()
      field.position.set(c.x, 0, c.z)
      const rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.97, r, 64), addMat('#d8a850', 0.55))
      rim.rotation.x = -Math.PI / 2
      rim.position.y = 5
      const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(r, 48), addMat('#c8a050', 0.06))
      glowDisc.rotation.x = -Math.PI / 2
      glowDisc.position.y = 3
      field.add(rim, glowDisc)
      const shards: THREE.Mesh[] = []
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2
        const rr = Math.sqrt(Math.random()) * r * 0.94
        const h = rnd(26, 62)
        const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.2, h, 4), addMat(i % 3 ? '#e8c070' : '#fff0c0', 0.85))
        m.position.set(Math.cos(a) * rr, h * 0.45, Math.sin(a) * rr)
        m.rotation.set(rnd(-0.5, 0.5), Math.random() * 6, rnd(-0.5, 0.5))
        shards.push(m)
        field.add(m)
      }
      let glint = 0
      timed(v, field, dur, (k, dt) => {
        const fade = k > 0.9 ? (1 - k) / 0.1 : Math.min(1, k * 20)
        ;(rim.material as THREE.MeshBasicMaterial).opacity = (0.4 + 0.15 * Math.sin(k * dur * 3)) * fade
        ;(glowDisc.material as THREE.MeshBasicMaterial).opacity = 0.06 * fade
        shards.forEach((s, i) => ((s.material as THREE.MeshBasicMaterial).opacity = (0.5 + 0.4 * Math.sin(k * dur * 2.4 + i)) * fade))
        glint -= dt
        if (glint <= 0) {
          glint = 0.4
          const a = Math.random() * Math.PI * 2
          const rr = Math.sqrt(Math.random()) * r * 0.9
          v.emit({ pos: P(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr, 24), kind: 'spark', color: '#fff4d0', color2: '#e8b050', burst: 2, shape: 'point', speed: [0, 12], size: [26, 44], life: [0.25, 0.45], max: 4 })
        }
      })
    })
  },
  sniper_muzzle: (v, e) => {
    const a = e.angle ?? 0
    const { cx, cz } = dirOf(a)
    const p = P(e.x + cx * 120, e.y + cz * 120, 100)
    v.emit({ pos: p, color: '#ffd890', color2: '#ff6a20', alpha: 0.8, burst: 1, speed: [0, 0], size: [110, 110], life: [0.09, 0.09], sizeEnd: 1.4 })
    v.emit({ pos: p, kind: 'spark', color: '#fff4d0', color2: '#ff8a30', burst: 8, shape: 'sphere', radius: 6, speed: [160, 340], size: [10, 20], life: [0.1, 0.25] })
    v.emit({ pos: p, kind: 'smoke', add: false, color: '#b0a898', alpha: 0.3, burst: 3, shape: 'point', speed: [10, 40], size: [30, 46], life: [0.5, 0.9], sizeEnd: 1.8, max: 6 })
  },
  sniper_headshot: (v, e) => {
    const a = e.angle ?? 0
    const { cx, cz } = dirOf(a)
    const p = P(e.x, e.y, 95)
    v.emit({ pos: p, color: '#ffb347', alpha: 0.7, burst: 1, speed: [0, 0], size: [150, 150], life: [0.14, 0.14], sizeEnd: 1.3 })
    v.emit({ pos: p, kind: 'spark', color: '#fff0c0', color2: '#e8602a', burst: 18, shape: 'sphere', radius: 6, speed: [120, 340], size: [12, 26], life: [0.2, 0.5], force: [cx * 140, -100, cz * 140] })
    v.emit({ pos: p, color: '#d84a2a', color2: '#500e08', burst: 10, shape: 'sphere', radius: 8, speed: [60, 180], size: [12, 22], life: [0.25, 0.55], force: [cx * 200, -200, cz * 200] })
    v.ring(P(e.x, e.y, 0), 10, 80, 0.3, '#ff8a3a')
    // crosshair-like shock ring (vertical)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), addMat('#ffd890', 0.9))
    ring.position.copy(p)
    ring.rotation.y = -a + Math.PI / 2
    timed(v, ring, 0.25, (k) => {
      ring.scale.setScalar(20 + k * 60)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k)
    })
  },
  sniper_take_aim: (v, e, posOf) => {
    const a = e.angle ?? 0
    const { cx, cz } = dirOf(a)
    const head = P(e.x + cx * 60, e.y + cz * 60, 110)
    v.emit({ pos: head, kind: 'spark', color: '#fff8d8', color2: '#e0c060', alpha: 1, burst: 1, shape: 'point', speed: [0, 0], size: [150, 150], life: [0.5, 0.5], sizeEnd: 0.3 })
    v.emit({ pos: head, color: '#fff0b0', alpha: 0.6, burst: 1, speed: [0, 0], size: [70, 70], life: [0.35, 0.35], sizeEnd: 0.2 })
    v.ring(P(e.x, e.y, 0), 230, 45, 0.6, '#e0c060', 0.07)
    later(v, 0.2, () => v.ring(P(e.x, e.y, 0), 170, 35, 0.5, '#fff0b0', 0.05))
    v.beam(() => head, () => P(e.x + cx * 700, e.y + cz * 700, 95), 0.35, '#ffe9a0', 5)
    const f = followUnit(e, posOf)
    if (f) v.emit({ pos: head, kind: 'spark', color: '#ffe9a0', color2: '#e0c060', rate: 7, dur: e.dur ?? 3, follow: f, shape: 'donut', radius: 50, speed: [4, 18], size: [12, 22], life: [0.5, 0.9], force: [0, 24, 0], max: 24 })
  },
  sniper_assassinate_fire: (v, e) => {
    const a = Math.atan2((e.y2 ?? e.y) - e.y, (e.x2 ?? e.x) - e.x)
    const { cx, cz } = dirOf(a)
    // red laser sight + muzzle blast
    v.beam(() => P(e.x, e.y, 100), () => P(e.x2 ?? e.x, e.y2 ?? e.y, 90), 0.35, '#ff2a1a', 6)
    const m = P(e.x + cx * 130, e.y + cz * 130, 100)
    v.emit({ pos: m, color: '#ffd8a0', color2: '#ff4a20', alpha: 0.9, burst: 1, speed: [0, 0], size: [240, 240], life: [0.16, 0.16], sizeEnd: 1.5 })
    v.emit({ pos: m, kind: 'spark', color: '#ffffff', color2: '#ff6a30', burst: 20, shape: 'sphere', radius: 8, speed: [200, 500], size: [14, 30], life: [0.15, 0.4] })
    v.ring(P(e.x, e.y, 0), 20, 200, 0.4, '#ff6a3a')
    v.emit({ pos: P(e.x, e.y, 20), kind: 'smoke', add: false, color: '#c0b8a8', alpha: 0.35, burst: 8, shape: 'donut', radius: 60, speed: [30, 90], size: [60, 100], life: [0.7, 1.2], sizeEnd: 1.6, max: 12 })
  },
  sniper_assassinate_hit: (v, e) => {
    const p = P(e.x, e.y, 85)
    v.emit({ pos: p, color: '#ffffff', alpha: 0.9, burst: 1, speed: [0, 0], size: [320, 320], life: [0.2, 0.2], sizeEnd: 1.4 })
    v.emit({ pos: p, kind: 'spark', color: '#ffe0b0', color2: '#e83a2a', burst: 50, shape: 'sphere', radius: 10, speed: [160, 520], size: [14, 34], life: [0.25, 0.7] })
    v.emit({ pos: p, add: false, color: '#d83a2a', color2: '#400808', burst: 30, shape: 'sphere', radius: 14, speed: [80, 260], size: [20, 40], life: [0.35, 0.8], force: [0, -200, 0] })
    v.ring(P(e.x, e.y, 0), 20, 260, 0.5, '#ff4a2a')
    later(v, 0.1, () => v.ring(P(e.x, e.y, 0), 20, 180, 0.45, '#ffd0a0'))
    v.column(P(e.x, e.y, 0), 36, 520, 0.55, '#ff3a2a')
    v.slash(P(e.x, e.y, 0), 0.6, 150, 0.25, '#ffd8c0')
    v.slash(P(e.x, e.y, 0), 0.6 + Math.PI, 150, 0.25, '#ffd8c0')
  },

  /* ============================================================== MIRANA */
  mirana_star_strike: (v, e) => {
    const dur = e.dur ?? 0.4
    const col = e.color || '#9ac0ff'
    const end = P(e.x, e.y, 0)
    const start = P(e.x - 220, e.y - 120, 860)
    const g = new THREE.Group()
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(26), addMat('#ffffff', 1))
    const halo = new THREE.Sprite(spriteMat(v, col, 0.9))
    halo.scale.setScalar(150)
    g.add(core, halo)
    let tick = 0
    // landing marker
    v.ring(end, 80, 30, dur, col, 0.1)
    timed(v, g, dur, (k) => {
      const kk = k * k
      g.position.lerpVectors(start, end, kk)
      core.rotation.y += 0.3
      core.rotation.x += 0.2
      if ((tick++ & 1) === 0) v.emit({ pos: g.position.clone(), kind: 'spark', color: '#ffffff', color2: col, burst: 2, shape: 'sphere', radius: 8, speed: [0, 14], size: [20, 40], life: [0.25, 0.5], max: 6 })
    })
    later(v, dur, () => {
      const p = P(e.x, e.y, 40)
      v.emit({ pos: p, color: col, color2: '#ffffff', burst: 30, shape: 'sphere', radius: 12, speed: [80, 260], size: [18, 40], life: [0.3, 0.7], sizeEnd: 0.1 })
      v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: col, burst: 16, shape: 'sphere', radius: 8, speed: [120, 320], size: [14, 28], life: [0.3, 0.7], force: [0, -60, 0] })
      v.emit({ pos: p, color: col, alpha: 0.6, burst: 1, speed: [0, 0], size: [200, 200], life: [0.18, 0.18], sizeEnd: 1.4 })
      v.ring(end, 20, 170, 0.5, col)
      v.spikes(end, 70, 8, 90, 0.5, '#d8e8ff')
    })
  },
  mirana_starstorm_cast: (v, e) => {
    const r = e.r ?? 675
    const c = P(e.x, e.y, 0)
    v.ring(c, 40, r, 0.6, '#7aa8ff')
    later(v, 0.12, () => v.ring(c, 30, r * 0.7, 0.5, '#c8dcff', 0.06))
    v.emit({ pos: P(e.x, e.y, 20), kind: 'spark', color: '#c8dcff', color2: '#7aa8ff', burst: 50, shape: 'donut', radius: r * 0.45, speed: [30, 90], size: [16, 30], life: [0.8, 1.4], force: [0, 150, 0], max: 60 })
    v.emit({ pos: P(e.x, e.y, 90), color: '#9ac0ff', alpha: 0.5, burst: 1, speed: [0, 0], size: [220, 220], life: [0.3, 0.3], sizeEnd: 0.2 })
    v.column(c, 50, 700, 0.8, '#7aa8ff')
  },
  mirana_arrow_cast: (v, e) => {
    const a = e.angle ?? 0
    const { cx, cz } = dirOf(a)
    const p = P(e.x + cx * 60, e.y + cz * 60, 95)
    v.emit({ pos: p, color: '#fff4b0', color2: '#e8d870', alpha: 0.8, burst: 1, speed: [0, 0], size: [130, 130], life: [0.25, 0.25], sizeEnd: 0.3 })
    v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: '#e8d870', burst: 10, shape: 'sphere', radius: 6, speed: [60, 200], size: [12, 22], life: [0.25, 0.6] })
    v.slash(P(e.x, e.y, 0), a, 120, 0.3, '#f0e8a0')
  },
  mirana_arrow_hit: (v, e, posOf) => {
    const f = Math.max(0.2, Math.min(1, e.f ?? 0.5))
    const p = P(e.x, e.y, 85)
    v.emit({ pos: p, color: '#fff4b0', alpha: 0.8, burst: 1, speed: [0, 0], size: [140 + 120 * f, 140 + 120 * f], life: [0.2, 0.2], sizeEnd: 1.3 })
    v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: '#e8d870', burst: 18 + Math.round(18 * f), shape: 'sphere', radius: 8, speed: [100, 300], size: [14, 28], life: [0.3, 0.8] })
    v.ring(P(e.x, e.y, 0), 20, 120 + 120 * f, 0.5, '#e8d870')
    v.column(P(e.x, e.y, 0), 30, 300 + 200 * f, 0.6, '#fff0a0')
    // orbiting stun stars above the head for the stun duration
    const dur = Math.min(5, Math.max(0.4, e.stun ?? 1.5))
    const fol = followUnit(e, posOf, undefined)
    if (fol) {
      const above = () => {
        const q = fol()
        if (q) q.y += 70
        return q
      }
      v.emit({ pos: p, kind: 'spark', color: '#ffe870', color2: '#fff8c0', rate: 12, dur, follow: above, shape: 'donut', radius: 38, speed: [10, 26], size: [16, 26], life: [0.45, 0.8], force: [0, 8, 0], max: 40 })
    }
  },
  mirana_leap: (v, e) => {
    const dust = (x: number, y: number) => {
      v.emit({ pos: P(x, y, 10), kind: 'smoke', add: false, color: '#b8ab92', color2: '#8a7e68', alpha: 0.5, burst: 8, shape: 'donut', radius: 50, speed: [40, 110], size: [50, 90], life: [0.5, 0.9], sizeEnd: 1.6, force: [0, 20, 0], max: 12 })
    }
    dust(e.x, e.y)
    v.ring(P(e.x, e.y, 0), 20, 110, 0.4, '#5ad0c0')
    v.emit({ pos: P(e.x, e.y, 40), kind: 'spark', color: '#d8fff4', color2: '#5ad0c0', burst: 14, shape: 'sphere', radius: 20, speed: [40, 140], size: [14, 26], life: [0.4, 0.8], force: [0, 40, 0] })
    // sparkle streak along the pounce
    const dx = (e.x2 ?? e.x) - e.x
    const dy = (e.y2 ?? e.y) - e.y
    for (let i = 1; i <= 6; i++) {
      const k = i / 7
      later(v, k * 0.3, () =>
        v.emit({ pos: P(e.x + dx * k, e.y + dy * k, 60 + Math.sin(k * Math.PI) * 60), kind: 'spark', color: '#e8fff8', color2: '#5ad0c0', burst: 5, shape: 'sphere', radius: 14, speed: [4, 30], size: [14, 26], life: [0.4, 0.8], max: 10 }),
      )
    }
    later(v, 0.35, () => {
      dust(e.x2 ?? e.x, e.y2 ?? e.y)
      v.ring(P(e.x2 ?? e.x, e.y2 ?? e.y, 0), 20, 130, 0.45, '#5ad0c0')
      v.emit({ pos: P(e.x2 ?? e.x, e.y2 ?? e.y, 30), kind: 'spark', color: '#ffffff', color2: '#5ad0c0', burst: 12, shape: 'sphere', radius: 14, speed: [60, 180], size: [12, 22], life: [0.3, 0.7], force: [0, 30, 0] })
    })
  },
  mirana_moonbeam: (v, e) => {
    const c = P(e.x, e.y, 0)
    v.beam(() => P(e.x, e.y, 1000), () => P(e.x, e.y, 0), 1.0, '#c8b8ff', 28)
    v.column(c, 48, 700, 1.3, '#d8ccff')
    v.ring(c, 20, 190, 0.8, '#a890e8')
    later(v, 0.15, () => v.ring(c, 20, 120, 0.7, '#e8e0ff', 0.06))
    v.emit({ pos: P(e.x, e.y, 30), kind: 'smoke', color: '#d8d0ff', color2: '#8a7ac8', alpha: 0.4, burst: 12, shape: 'donut', radius: 70, speed: [10, 34], size: [100, 170], life: [1.4, 2.2], sizeEnd: 1.3, force: [0, 26, 0], max: 14 })
    v.emit({ pos: P(e.x, e.y, 30), kind: 'spark', color: '#ffffff', color2: '#b8a8ff', burst: 26, shape: 'sphere', radius: 50, speed: [20, 90], size: [14, 26], life: [0.9, 1.6], force: [0, 60, 0], max: 30 })
    // crescent moon sigil flashing over the hero
    const moon = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 32, 1, 0.5, Math.PI * 1.4), addMat('#f0eaff', 0.9))
    moon.position.set(e.x, 280, e.y)
    timed(v, moon, 1.2, (k) => {
      moon.scale.setScalar(30 + k * 20)
      moon.lookAt(moon.position.x, moon.position.y, moon.position.z + 100)
      ;(moon.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k * k)
      moon.position.y = 280 + k * 80
    })
  },

  /* ============================================================== AXE */
  axe_call: (v, e) => {
    const r = e.r ?? 315
    const c = P(e.x, e.y, 0)
    v.ring(c, 30, r, 0.5, '#d85a2a')
    later(v, 0.1, () => v.ring(c, 30, r * 0.85, 0.45, '#ff8a3a', 0.1))
    later(v, 0.2, () => v.ring(c, 30, r * 0.65, 0.4, '#ffd070', 0.12))
    v.emit({ pos: P(e.x, e.y, 70), color: '#ff5a2a', alpha: 0.6, burst: 1, speed: [0, 0], size: [260, 260], life: [0.25, 0.25], sizeEnd: 1.2 })
    v.emit({ pos: P(e.x, e.y, 15), kind: 'smoke', add: false, color: '#9a7a5a', alpha: 0.5, burst: 14, shape: 'donut', radius: r * 0.3, speed: [90, 220], size: [60, 110], life: [0.6, 1.1], sizeEnd: 1.8, max: 20 })
    v.emit({ pos: P(e.x, e.y, 60), kind: 'spark', color: '#ffe0a0', color2: '#e0502a', burst: 36, shape: 'sphere', radius: 14, speed: [160, 420], size: [14, 28], life: [0.3, 0.7] })
    v.spikes(c, r * 0.85, 12, 70, 0.55, '#e0502a')
  },
  axe_taunt_mark: (v, e, posOf) => {
    const f = followUnit(e, posOf, undefined)
    if (!f) return
    const above = () => {
      const q = f()
      if (q) q.y += 60
      return q
    }
    v.emit({ pos: P(e.x, e.y, 100), kind: 'ember', color: '#ff5a2a', color2: '#a01a0a', rate: 16, dur: e.dur ?? 2, follow: above, shape: 'sphere', radius: 22, speed: [8, 30], size: [14, 26], life: [0.4, 0.8], force: [0, 90, 0], max: 40 })
    v.emit({ pos: P(e.x, e.y, 120), kind: 'spark', color: '#ffe0a0', color2: '#ff5a2a', rate: 3, dur: e.dur ?? 2, follow: above, shape: 'point', speed: [0, 0], size: [42, 42], life: [0.5, 0.5], max: 6 })
  },
  axe_hunger: (v, e, posOf) => {
    const dur = e.dur ?? 12
    const c = P(e.x, e.y, 0)
    v.ring(c, 20, 110, 0.45, '#e05a1a')
    v.emit({ pos: P(e.x, e.y, 70), color: '#ff4a1a', color2: '#7a1008', burst: 22, shape: 'sphere', radius: 12, speed: [60, 190], size: [14, 30], life: [0.3, 0.7], sizeEnd: 0.1 })
    v.slash(c, 0.4, 100, 0.28, '#ff6a2a')
    const f = followUnit({ ...e, buff: e.buff ?? 'hunger' }, posOf, undefined)
    if (!f) return
    const eye = () => {
      const q = f()
      if (q) q.y += 105
      return q
    }
    // bloody eye: red glow + sclera + dark pupil, blinking via particle lifetimes
    v.emit({ pos: P(e.x, e.y, 170), color: '#ff2a1a', color2: '#a01008', alpha: 0.9, rate: 2.2, dur, follow: eye, shape: 'point', speed: [0, 0], size: [84, 84], life: [0.9, 0.9], sizeEnd: 0.8, max: 4 })
    v.emit({ pos: P(e.x, e.y, 170), kind: 'ember', color: '#fff0d8', color2: '#ffc8a0', rate: 2.2, dur, follow: eye, shape: 'point', speed: [0, 0], size: [46, 46], life: [0.9, 0.9], sizeEnd: 0.8, max: 4 })
    v.emit({ pos: P(e.x, e.y, 170), kind: 'ember', add: false, color: '#1a0404', color2: '#1a0404', rate: 2.2, dur, follow: eye, shape: 'point', speed: [0, 0], size: [20, 20], life: [0.9, 0.9], sizeEnd: 0.8, max: 4 })
    v.emit({ pos: P(e.x, e.y, 80), kind: 'ember', color: '#ff7a2a', color2: '#a01a0a', rate: 9, dur, follow: f, shape: 'sphere', radius: 40, speed: [6, 24], size: [8, 16], life: [0.8, 1.4], force: [0, 40, 0], max: 30 })
  },
  axe_helix: (v, e, posOf) => {
    const r = e.r ?? 300
    const u = e.unit as any
    const g = new THREE.Group()
    const blades: THREE.Mesh[] = []
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 20, 1, 0, 1.0), addMat(i % 2 ? '#ffe070' : '#ffffff', 0.9))
      m.rotation.x = -Math.PI / 2
      m.rotation.z = (i * Math.PI) / 2
      g.add(m)
      blades.push(m)
    }
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 32), addMat('#ffd84a', 0.4))
    inner.rotation.x = -Math.PI / 2
    g.add(inner)
    const base = posOf && u ? posOf(u) : P(e.x, e.y, 60)
    if (base) g.position.copy(base)
    const dur = 0.55
    timed(v, g, dur, (k) => {
      const pp = u && posOf ? posOf(u) : null
      if (pp) g.position.copy(pp)
      const rr = 70 + (r - 70) * Math.min(1, k * 1.6)
      g.scale.setScalar(rr)
      g.rotation.y += 0.35
      for (const m of blades) (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k * k)
      ;(inner.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k)
    })
    v.ring(P(e.x, e.y, 0), 30, r, 0.35, '#d8d84a')
    for (let i = 0; i < 3; i++) v.slash(P(e.x, e.y, 0), (i * Math.PI * 2) / 3, 230, 0.3, '#fff0a0')
    v.emit({ pos: P(e.x, e.y, 60), kind: 'spark', color: '#ffffff', color2: '#ffd84a', burst: 30, shape: 'donut', radius: r * 0.5, speed: [60, 200], size: [12, 24], life: [0.25, 0.6] })
  },
  axe_cull: (v, e) => {
    const a = e.angle ?? 0
    const kill = !!e.kill
    const c = P(e.x, e.y, 0)
    // axe strike from above
    v.beam(() => P(e.x, e.y, 520), () => P(e.x, e.y, 20), 0.2, kill ? '#ffffff' : '#ffd8c0', 26)
    v.slash(c, a, 190, 0.32, '#ffffff')
    v.slash(c, a + Math.PI * 0.5, 150, 0.28, kill ? '#ff5a3a' : '#ffd0b0')
    const p = P(e.x, e.y, 70)
    v.emit({ pos: p, color: '#ffffff', alpha: 0.9, burst: 1, speed: [0, 0], size: [kill ? 300 : 180, kill ? 300 : 180], life: [0.16, 0.16], sizeEnd: 1.4 })
    v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: kill ? '#e02a1a' : '#ffb070', burst: kill ? 46 : 22, shape: 'sphere', radius: 10, speed: [150, 460], size: [14, 30], life: [0.25, 0.65] })
    v.ring(c, 20, kill ? 230 : 140, 0.45, kill ? '#ff3a2a' : '#ffffff')
    if (kill) {
      v.emit({ pos: p, add: false, color: '#c01818', color2: '#400808', burst: 40, shape: 'sphere', radius: 16, speed: [100, 340], size: [18, 40], life: [0.4, 0.9], force: [0, -260, 0] })
      v.column(c, 30, 500, 0.55, '#ff3a2a')
      later(v, 0.12, () => v.ring(c, 20, 160, 0.4, '#ffd0c0', 0.1))
    }
  },

  /* ============================================================== RUBICK */
  rubick_tk_lift: (v, e, posOf) => {
    const dur = e.dur ?? 1
    const c = P(e.x, e.y, 0)
    if (e.unit && e.unit2 && posOf) v.spawn({ name: 'beam', x: e.x, y: e.y, unit: e.unit, unit2: e.unit2, dur, color: '#5ab0e8', width: 7 }, posOf)
    // spinning arcane rings under the target
    const g = new THREE.Group()
    g.position.set(e.x, 6, e.y)
    const rings: THREE.Mesh[] = []
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 36, 1, 0, Math.PI * (1.2 + i * 0.3)), addMat(i === 1 ? '#a8e0ff' : '#5ab0e8', 0.8))
      m.rotation.x = -Math.PI / 2
      g.add(m)
      rings.push(m)
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32), addMat('#5ab0e8', 0.15))
    disc.rotation.x = -Math.PI / 2
    disc.position.y = -2
    g.add(disc)
    timed(v, g, dur, (k) => {
      const fade = k > 0.85 ? (1 - k) / 0.15 : Math.min(1, k * 8)
      rings.forEach((m, i) => {
        const s = 60 + i * 38 + Math.sin(k * dur * 4 + i) * 6
        m.scale.setScalar(s)
        m.rotation.z += (i % 2 ? -1 : 1) * (0.05 + i * 0.02)
        ;(m.material as THREE.MeshBasicMaterial).opacity = 0.8 * fade
      })
      disc.scale.setScalar(150)
      ;(disc.material as THREE.MeshBasicMaterial).opacity = 0.15 * fade
    })
    v.emit({ pos: c, kind: 'spark', color: '#c8f0ff', color2: '#5ab0e8', rate: 24, dur, follow: () => P(e.x, e.y, 8), shape: 'donut', radius: 90, speed: [20, 70], size: [12, 22], life: [0.6, 1.0], force: [0, 130, 0], max: 50 })
  },
  rubick_tk_land: (v, e) => {
    const r = e.r ?? 325
    const c = P(e.x, e.y, 0)
    v.ring(c, 20, r, 0.5, '#5ab0e8')
    later(v, 0.08, () => v.ring(c, 20, r * 0.7, 0.45, '#c8f0ff', 0.08))
    v.spikes(c, r * 0.6, 12, 80, 0.5, '#8ad0ff')
    v.column(c, 40, 320, 0.45, '#5ab0e8')
    v.emit({ pos: P(e.x, e.y, 15), kind: 'smoke', add: false, color: '#a89878', alpha: 0.5, burst: 16, shape: 'donut', radius: r * 0.4, speed: [60, 180], size: [60, 110], life: [0.6, 1.1], sizeEnd: 1.8, max: 22 })
    v.emit({ pos: P(e.x, e.y, 40), kind: 'spark', color: '#ffffff', color2: '#5ab0e8', burst: 30, shape: 'sphere', radius: 14, speed: [100, 340], size: [12, 26], life: [0.3, 0.7], force: [0, -60, 0] })
    v.emit({ pos: P(e.x, e.y, 40), color: '#8ad0ff', alpha: 0.6, burst: 1, speed: [0, 0], size: [240, 240], life: [0.2, 0.2], sizeEnd: 1.3 })
  },
  rubick_fade_bolt: (v, e) => {
    const x2 = e.x2 ?? e.x
    const y2 = e.y2 ?? e.y
    v.spawn({ name: 'bolt', x: e.x, y: e.y, x2, y2, z: e.z ?? 90, z2: 80, dur: 0.22, color: '#b898ff', width: 10 })
    // lingering violet afterimage
    v.beam(() => P(e.x, e.y, e.z ?? 90), () => P(x2, y2, 80), 0.5, '#6a48c8', 24)
    for (let i = 1; i <= 4; i++) {
      const k = i / 5
      v.emit({ pos: P(e.x + (x2 - e.x) * k, e.y + (y2 - e.y) * k, 85), kind: 'spark', color: '#e0d0ff', color2: '#8a68e8', burst: 3, shape: 'sphere', radius: 10, speed: [10, 50], size: [12, 22], life: [0.3, 0.7], max: 6 })
    }
    const p = P(x2, y2, 80)
    v.emit({ pos: p, color: '#9a78e8', color2: '#e8d8ff', burst: 22, shape: 'sphere', radius: 10, speed: [60, 200], size: [14, 30], life: [0.3, 0.7] })
    v.emit({ pos: p, color: '#b898ff', alpha: 0.6, burst: 1, speed: [0, 0], size: [150, 150], life: [0.16, 0.16], sizeEnd: 1.3 })
    v.ring(P(x2, y2, 0), 10, 85, 0.4, '#9a78e8')
    // rune ring hovering on the victim
    const rune = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 6), addMat('#c8a8ff', 0.8))
    rune.position.set(x2, 110, y2)
    rune.rotation.x = -Math.PI / 2
    timed(v, rune, 0.5, (k) => {
      rune.scale.setScalar(40 + k * 14)
      rune.rotation.z += 0.12
      ;(rune.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k)
    })
  },
  rubick_steal: (v, e, posOf) => {
    const victim = e.unit as any
    const me = e.unit2 as any
    const col = '#e8c858'
    const vp = () => (victim && posOf ? posOf(victim) : null) || P(e.x, e.y, 80)
    const mp = () => (me && posOf ? posOf(me) : null) || P(e.x2 ?? e.x, e.y2 ?? e.y, 80)
    const a0 = vp()
    v.ring(P(a0.x, a0.z, 0), 150, 15, 0.6, '#c8a8ff', 0.1)
    v.emit({ pos: a0.clone(), kind: 'spark', color: '#fff0c0', color2: col, burst: 14, shape: 'sphere', radius: 20, speed: [20, 90], size: [14, 26], life: [0.4, 0.8] })
    const N = 18
    const g = new THREE.Group()
    const sprites: { s: THREE.Sprite; d: number; off: THREE.Vector3 }[] = []
    for (let i = 0; i < N; i++) {
      const s = new THREE.Sprite(spriteMat(v, i % 3 ? col : '#c8a8ff', 0))
      s.scale.setScalar(rnd(26, 44))
      g.add(s)
      sprites.push({ s, d: (i / N) * 0.35, off: new THREE.Vector3(rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1)).multiplyScalar(60) })
    }
    const total = 0.9
    timed(v, g, total, (k) => {
      const t = k * total
      const A = vp()
      const B = mp()
      for (const q of sprites) {
        const f = Math.max(0, Math.min(1, (t - q.d) / 0.55))
        const ease = f * f * (3 - 2 * f)
        q.s.position.lerpVectors(A, B, ease)
        q.s.position.addScaledVector(q.off, Math.sin(ease * Math.PI) * (1 - ease * 0.4))
        ;(q.s.material as THREE.SpriteMaterial).opacity = f > 0 && f < 1 ? Math.min(1, f * 6) * (1 - Math.max(0, f - 0.8) * 5) : 0
      }
    })
    later(v, 0.7, () => {
      const B = mp()
      v.emit({ pos: B, kind: 'spark', color: '#ffffff', color2: col, burst: 22, shape: 'sphere', radius: 16, speed: [30, 130], size: [14, 28], life: [0.4, 0.9] })
      v.emit({ pos: B, color: col, alpha: 0.6, burst: 1, speed: [0, 0], size: [200, 200], life: [0.25, 0.25], sizeEnd: 0.3 })
      v.ring(P(B.x, B.z, 0), 20, 150, 0.5, col)
    })
  },
}
