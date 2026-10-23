import * as THREE from 'three'
import { mergeUnique } from '../sim/constants'
import {
  Bezier, BatchedRenderer, ColorOverLife, Gradient, ConeEmitter, ConstantValue, DonutEmitter, IntervalValue, ParticleSystem,
  PiecewiseBezier, PointEmitter, SizeOverLife, SphereEmitter, ConstantColor, ApplyForce, Vector3 as QVec3, Vector4,
} from 'three.quarks'

import { VFX_BASE } from './vfx_base'
import { VFX_G1 } from './vfx_g1'
import { VFX_G2 } from './vfx_g2'
import { VFX_G3 } from './vfx_g3'
import { VFX_G4 } from './vfx_g4'

/** A custom effect: build it with the Vfx helpers (emit, ring, column, beam, slash, spikes, spawn...). */
export type CustomVfx = (v: Vfx, e: VfxEvt, posOf?: (u: { x: number; y: number }) => THREE.Vector3 | null) => void

const CUSTOM: Record<string, CustomVfx> = mergeUnique('effect', VFX_BASE, VFX_G1, VFX_G2, VFX_G3, VFX_G4)

/** Visual effects layer built on three.quarks (particles) plus a few small mesh effects. */

export interface VfxEvt {
  name: string
  x: number
  y: number
  x2?: number
  y2?: number
  z?: number
  r?: number
  r0?: number
  r1?: number
  dur?: number
  color?: string
  color2?: string
  size?: number
  count?: number
  angle?: number
  width?: number
  follow?: { x: number; y: number } | null
  /** unit-like object that is read every frame to follow its position */
  unit?: { x: number; y: number }
  unit2?: { x: number; y: number }
  [k: string]: any
}

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, s = 128) {
  const c = document.createElement('canvas')
  c.width = c.height = s
  draw(c.getContext('2d')!, s)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export type ParticleKind = 'glow' | 'smoke' | 'spark' | 'ember'

interface Live {
  update(dt: number): boolean
  dispose(): void
}

export class Vfx {
  batch = new BatchedRenderer()
  tex: Record<ParticleKind, THREE.Texture>
  live: Live[] = []
  private mats = new Map<string, THREE.MeshBasicMaterial>()

  constructor(public scene: THREE.Scene) {
    scene.add(this.batch)
    this.tex = {
      glow: canvasTex((g, s) => {
        const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
        gr.addColorStop(0, 'rgba(255,255,255,1)')
        gr.addColorStop(0.25, 'rgba(255,255,255,0.55)')
        gr.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = gr
        g.fillRect(0, 0, s, s)
      }),
      smoke: canvasTex((g, s) => {
        for (let i = 0; i < 14; i++) {
          const x = s / 2 + (Math.random() - 0.5) * s * 0.45
          const y = s / 2 + (Math.random() - 0.5) * s * 0.45
          const r = s * (0.16 + Math.random() * 0.2)
          const gr = g.createRadialGradient(x, y, 0, x, y, r)
          gr.addColorStop(0, 'rgba(255,255,255,0.35)')
          gr.addColorStop(1, 'rgba(255,255,255,0)')
          g.fillStyle = gr
          g.fillRect(0, 0, s, s)
        }
      }),
      spark: canvasTex((g, s) => {
        const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
        gr.addColorStop(0, 'rgba(255,255,255,1)')
        gr.addColorStop(0.15, 'rgba(255,255,255,0.9)')
        gr.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = gr
        g.fillRect(0, 0, s, s)
        g.fillStyle = 'rgba(255,255,255,0.9)'
        g.fillRect(s / 2 - 1.5, 4, 3, s - 8)
        g.fillRect(4, s / 2 - 1.5, s - 8, 3)
      }),
      ember: canvasTex((g, s) => {
        const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
        gr.addColorStop(0, 'rgba(255,255,255,1)')
        gr.addColorStop(0.5, 'rgba(255,255,255,0.7)')
        gr.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = gr
        g.beginPath()
        g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2)
        g.fill()
      }),
    }
  }

  private sprMat(kind: ParticleKind, add = true) {
    const key = kind + (add ? 'a' : 'n')
    let m = this.mats.get(key)
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        map: this.tex[kind], transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
      })
      this.mats.set(key, m)
    }
    return m
  }

  /**
   * Emit a particle system. Coordinates are three.js world space (x, height, z) — callers below convert from game
   * coordinates (game y -> three z).
   */
  emit(o: {
    pos: THREE.Vector3
    kind?: ParticleKind
    add?: boolean
    life?: [number, number]
    speed?: [number, number]
    size?: [number, number]
    sizeEnd?: number // 0..1 multiplier at end of life
    color?: string
    color2?: string
    alpha?: number
    burst?: number
    rate?: number
    dur?: number
    shape?: 'point' | 'sphere' | 'cone' | 'donut'
    radius?: number
    angle?: number
    up?: boolean
    force?: [number, number, number]
    max?: number
    follow?: () => THREE.Vector3 | null
  }): ParticleSystem {
    const c1 = new THREE.Color(o.color || '#ffffff')
    const c2 = new THREE.Color(o.color2 || o.color || '#ffffff')
    const a0 = o.alpha ?? 1
    const radius = o.radius ?? 20
    const shape =
      o.shape === 'cone'
        ? new ConeEmitter({ radius, thickness: 1, angle: o.angle ?? 0.4, arc: Math.PI * 2 })
        : o.shape === 'donut'
          ? new DonutEmitter({ radius, thickness: 0.15, arc: Math.PI * 2, donutRadius: radius * 0.2 })
          : o.shape === 'sphere'
            ? new SphereEmitter({ radius, thickness: 1, arc: Math.PI * 2 })
            : new PointEmitter()
    const behaviors: any[] = [
      new ColorOverLife(new Gradient([[new QVec3(c1.r, c1.g, c1.b), 0], [new QVec3(c2.r, c2.g, c2.b), 1]], [[a0, 0], [a0, 0.6], [0, 1]])),
      new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 1 + (o.sizeEnd ?? 0.2) * 0.3, o.sizeEnd ?? 0.2, o.sizeEnd ?? 0.2), 0]])),
    ]
    if (o.force) behaviors.push(new ApplyForce(new QVec3(o.force[0], o.force[1], o.force[2]), new ConstantValue(1)))
    const ps = new ParticleSystem({
      duration: o.dur ?? 0.1,
      looping: !!o.rate && !!o.follow,
      autoDestroy: true,
      worldSpace: true,
      maxParticles: o.max ?? 200,
      startLife: new IntervalValue(...(o.life ?? [0.4, 0.8])),
      startSpeed: new IntervalValue(...(o.speed ?? [20, 80])),
      startSize: new IntervalValue(...(o.size ?? [20, 40])),
      startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
      emissionOverTime: new ConstantValue(o.rate ?? 0),
      emissionBursts: o.burst ? [{ time: 0, count: new ConstantValue(o.burst), cycle: 1, interval: 0.01, probability: 1 }] : [],
      shape,
      material: this.sprMat(o.kind ?? 'glow', o.add !== false),
      renderOrder: 5,
      behaviors,
    } as any)
    // aim the cone upwards (quarks emits along +Z)
    if (o.up !== false && (o.shape === 'cone' || o.shape === 'donut')) ps.emitter.rotation.x = -Math.PI / 2
    ps.emitter.position.copy(o.pos)
    this.scene.add(ps.emitter)
    this.batch.addSystem(ps)
    if (o.follow) {
      const f = o.follow
      let t = 0
      const dur = o.dur ?? 1
      this.live.push({
        update: (dt) => {
          t += dt
          const p = f()
          if (!p || t > dur) {
            ps.endEmit()
            return false
          }
          ps.emitter.position.copy(p)
          return true
        },
        dispose: () => ps.endEmit(),
      })
    }
    return ps
  }

  /* ------------------------------------------------------------ mesh effects */

  /** Unit-sized primitive geometries shared by every effect (meshes scale them; disposal skips them). */
  private geos = new Map<string, THREE.BufferGeometry>()
  private shared(key: string, make: () => THREE.BufferGeometry) {
    let g = this.geos.get(key)
    if (!g) this.geos.set(key, (g = make()))
    return g
  }
  private sharedMesh(key: string, make: () => THREE.BufferGeometry, color: string, opacity = 1, add = true) {
    const m = this.mesh(this.shared(key, make), color, opacity, add)
    m.userData.sharedGeo = true
    return m
  }

  private mesh(geo: THREE.BufferGeometry, color: string, opacity = 1, add = true) {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    m.renderOrder = 4
    return m
  }

  private addLive(obj: THREE.Object3D, dur: number, step: (k: number, dt: number) => void) {
    this.scene.add(obj)
    let t = 0
    this.live.push({
      update: (dt) => {
        t += dt
        const k = t / dur
        if (k >= 1) {
          this.scene.remove(obj)
          obj.traverse((o) => {
            const m = o as THREE.Mesh
            if (!m.userData.sharedGeo) m.geometry?.dispose()
            ;(m.material as THREE.Material)?.dispose?.()
          })
          return false
        }
        step(k, dt)
        return true
      },
      dispose: () => this.scene.remove(obj),
    })
  }

  /** Expanding glowing ground ring. */
  ring(p: THREE.Vector3, r0: number, r1: number, dur: number, color: string, width = 0.12) {
    const w = Math.round(width * 100) / 100
    const m = this.sharedMesh('ring' + w, () => new THREE.RingGeometry(1 - w, 1, 56), color, 0.9)
    m.rotation.x = -Math.PI / 2
    m.position.copy(p)
    m.position.y += 4
    const inner = this.sharedMesh('disc', () => new THREE.CircleGeometry(1, 40), color, 0.18)
    inner.rotation.x = -Math.PI / 2
    inner.position.y = 3
    const grp = new THREE.Group()
    grp.add(m, inner)
    grp.position.set(p.x, 0, p.z)
    m.position.set(0, p.y + 4, 0)
    inner.position.set(0, 3, 0)
    this.addLive(grp, dur, (k) => {
      const e = 1 - (1 - k) * (1 - k)
      const r = r0 + (r1 - r0) * e
      m.scale.set(r, r, 1)
      inner.scale.set(r, r, 1)
      ;(m.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k)
      ;(inner.material as THREE.MeshBasicMaterial).opacity = 0.2 * (1 - k)
    })
  }

  /** Vertical light pillar. */
  column(p: THREE.Vector3, r: number, h: number, dur: number, color: string) {
    const m = this.sharedMesh('column', () => new THREE.CylinderGeometry(1, 1.2, 1, 20, 1, true), color, 0.55)
    m.position.set(p.x, h / 2, p.z)
    this.addLive(m, dur, (k) => {
      const e = Math.min(1, k * 4)
      m.scale.set(r * (1 - k * 0.5), h * e, r * (1 - k * 0.5))
      m.position.y = (h * e) / 2
      ;(m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k)
    })
  }

  /** Beam between two (possibly moving) points. */
  beam(a: () => THREE.Vector3 | null, b: () => THREE.Vector3 | null, dur: number, color: string, width = 14, jag = 0) {
    const grp = new THREE.Group()
    const core = this.sharedMesh('tube8', () => new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), '#ffffff', 1)
    const glow = this.sharedMesh('tube10', () => new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), color, 0.55)
    grp.add(core, glow)
    const segs: THREE.Mesh[] = []
    if (jag) {
      for (let i = 0; i < 8; i++) {
        const s = this.sharedMesh('tube6', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), '#ffffff', 0.9)
        segs.push(s)
        grp.add(s)
      }
      core.visible = false
    }
    const up = new THREE.Vector3(0, 1, 0)
    let jt = 0
    this.addLive(grp, dur, (k, dt) => {
      const pa = a()
      const pb = b()
      if (!pa || !pb) {
        grp.visible = false
        return
      }
      grp.visible = true
      const place = (m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, w = 1) => {
        const d = new THREE.Vector3().subVectors(to, from)
        const l = d.length()
        m.position.copy(from).addScaledVector(d, 0.5)
        m.quaternion.setFromUnitVectors(up, d.clone().normalize())
        m.scale.set(w, Math.max(0.01, l), w)
      }
      place(glow, pa, pb, width * (1 + Math.sin(k * 40) * 0.12))
      if (jag) {
        jt -= dt
        const n = segs.length
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= n; i++) {
          const f = i / n
          const p = new THREE.Vector3().lerpVectors(pa, pb, f)
          if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * jag, (Math.random() - 0.5) * jag * 0.6, (Math.random() - 0.5) * jag))
          pts.push(p)
        }
        segs.forEach((s, i) => place(s, pts[i], pts[i + 1], width * 0.3))
      } else place(core, pa, pb, width * 0.25)
      const fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
      ;(glow.material as THREE.MeshBasicMaterial).opacity = 0.55 * fade
    })
  }

  /** Circular crescent slash. */
  slash(p: THREE.Vector3, angle: number, size: number, dur: number, color: string) {
    const m = this.sharedMesh('slash', () => new THREE.RingGeometry(0.55, 1, 32, 1, -0.9, 1.8), color, 0.9)
    m.rotation.x = -Math.PI / 2
    const grp = new THREE.Group()
    grp.add(m)
    grp.position.set(p.x, p.y + 30, p.z)
    grp.rotation.y = -angle
    this.addLive(grp, dur, (k) => {
      m.scale.setScalar(size * (0.7 + k * 0.6))
      m.rotation.z = -0.5 + k * 1.0
      ;(m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k)
    })
  }

  /** Spikes/crystals rising from the ground in a circle. */
  spikes(p: THREE.Vector3, r: number, n: number, h: number, dur: number, color: string) {
    const grp = new THREE.Group()
    const cones: { m: THREE.Mesh; d: number; h: number }[] = []
    const cone = this.shared('spike', () => new THREE.ConeGeometry(0.16, 1, 5))
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const rr = Math.sqrt(Math.random()) * r
      const height = h * (0.6 + Math.random() * 0.8)
      const m = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }))
      m.userData.sharedGeo = true
      m.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr)
      m.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)
      cones.push({ m, d: Math.random() * 0.25, h: height })
      grp.add(m)
    }
    grp.position.set(p.x, 0, p.z)
    this.addLive(grp, dur, (k) => {
      for (const c of cones) {
        const kk = Math.max(0, Math.min(1, (k - c.d) / 0.25))
        const e = kk * (2 - kk)
        c.m.scale.set(c.h, c.h * e, c.h)
        c.m.position.y = (c.h * e) / 2
        ;(c.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1)
      }
    })
  }

  /* ----------------------------------------------------------------- events */

  private P(x: number, y: number, h = 0) {
    return new THREE.Vector3(x, h, y)
  }

  /** Spawn a named effect. Names: burst, ring, nova, column, beam, bolt, slash, spikes, meteor, smoke, blink, sparkle, flash. */
  spawn(e: VfxEvt, posOf?: (u: { x: number; y: number }) => THREE.Vector3 | null) {
    const custom = CUSTOM[e.name]
    if (custom) {
      custom(this, e, posOf)
      return
    }
    const col = e.color || '#ffffff'
    const col2 = e.color2 || col
    const p = this.P(e.x, e.y, e.z ?? 0)
    const dur = e.dur ?? 0.6
    switch (e.name) {
      case 'burst':
        this.emit({ pos: p.clone().setY(p.y + 40), color: col, color2: col2, burst: e.count ?? 28, shape: 'sphere', radius: 12, speed: [60, 220], size: [18, 46], life: [0.3, 0.7], sizeEnd: 0.1 })
        this.emit({ pos: p.clone().setY(p.y + 40), kind: 'spark', color: '#ffffff', color2: col, burst: 10, speed: [120, 300], size: [14, 26], life: [0.2, 0.45] })
        this.emit({ pos: p.clone().setY(p.y + 40), color: col, alpha: 0.45, burst: 1, shape: 'point', speed: [0, 0], size: [(e.size ?? 110) * 0.6, (e.size ?? 110) * 0.6], life: [0.16, 0.16], sizeEnd: 1.4 })
        break
      case 'flash':
        this.emit({ pos: p.clone().setY(p.y + 50), color: col, alpha: 0.5, burst: 1, speed: [0, 0], size: [(e.size ?? 160) * 0.7, (e.size ?? 160) * 0.7], life: [dur, dur], sizeEnd: 0.1 })
        break
      case 'ring':
        this.ring(p, e.r0 ?? 20, e.r1 ?? e.r ?? 200, dur, col)
        this.emit({ pos: p.clone().setY(8), color: col, color2: col2, burst: 26, shape: 'donut', radius: (e.r1 ?? e.r ?? 200) * 0.7, speed: [10, 40], size: [12, 26], life: [0.4, 0.8], force: [0, 40, 0] })
        break
      case 'nova': {
        const r = e.r ?? 300
        this.ring(p, 20, r, 0.7, col)
        this.spikes(p, r * 0.85, e.count ?? 22, e.size ?? 130, 0.9, col)
        this.emit({ pos: p.clone().setY(30), color: col, color2: col2, burst: 40, shape: 'donut', radius: r * 0.6, speed: [30, 120], size: [20, 44], life: [0.4, 0.9], force: [0, 70, 0] })
        this.column(p, r * 0.12, 260, 0.5, col)
        break
      }
      case 'column':
        this.column(p, e.r ?? 60, e.size ?? 420, dur, col)
        this.ring(p, 10, (e.r ?? 60) * 2.4, dur, col)
        this.emit({ pos: p.clone().setY(10), color: col, color2: col2, burst: 30, shape: 'donut', radius: e.r ?? 60, speed: [40, 120], size: [16, 34], life: [0.5, 1], force: [0, 120, 0] })
        break
      case 'beam':
      case 'bolt': {
        const a = e.unit && posOf ? () => posOf(e.unit!) : () => this.P(e.x, e.y, e.z ?? 70)
        const b = e.unit2 && posOf ? () => posOf(e.unit2!) : () => this.P(e.x2 ?? e.x, e.y2 ?? e.y, e.z2 ?? 70)
        this.beam(a, b, dur, col, e.width ?? 12, e.name === 'bolt' ? 40 : 0)
        const pb = b()
        if (pb) this.emit({ pos: pb, color: col, burst: 14, shape: 'sphere', radius: 8, speed: [40, 160], size: [14, 30], life: [0.2, 0.5] })
        break
      }
      case 'slash':
        this.slash(p, e.angle ?? 0, e.size ?? 130, dur, col)
        break
      case 'spikes':
        this.spikes(p, e.r ?? 200, e.count ?? 16, e.size ?? 120, dur, col)
        break
      case 'meteor': {
        const start = p.clone().setY(900)
        const sphere = this.mesh(new THREE.SphereGeometry(e.size ?? 42, 12, 10), col, 1)
        sphere.position.copy(start)
        const t = dur
        this.addLive(sphere, t, (k) => {
          sphere.position.lerpVectors(start, p, k * k)
          this.emit({ pos: sphere.position.clone(), color: col, color2: col2, burst: 3, shape: 'sphere', radius: 14, speed: [0, 30], size: [26, 50], life: [0.2, 0.4] })
          if (k > 0.97) {
            this.spawn({ name: 'burst', x: e.x, y: e.y, color: col, size: 220, count: 40 })
            this.ring(p, 20, 150, 0.5, col)
          }
        })
        break
      }
      case 'smoke': {
        const r = e.r ?? 400
        this.emit({ pos: p.clone().setY(30), kind: 'smoke', add: false, color: col, color2: col, alpha: 0.55, rate: 28, dur, shape: 'sphere', radius: r * 0.75, speed: [4, 18], size: [r * 0.7, r * 1.1], life: [1.6, 2.6], sizeEnd: 1.2, force: [0, 6, 0], max: 160, follow: () => p })
        this.ring(p, r * 0.9, r, dur, col, 0.05)
        break
      }
      case 'blink': {
        const q = this.P(e.x2 ?? e.x, e.y2 ?? e.y, 60)
        this.beam(() => p.clone().setY(60), () => q, 0.25, col, 18)
        this.emit({ pos: p.clone().setY(60), color: col, burst: 26, shape: 'sphere', radius: 14, speed: [40, 200], size: [20, 46], life: [0.25, 0.6] })
        this.emit({ pos: q.clone(), color: col, burst: 26, shape: 'sphere', radius: 14, speed: [40, 200], size: [20, 46], life: [0.25, 0.6] })
        this.ring(q.clone().setY(0), 10, 110, 0.4, col)
        break
      }
      case 'sparkle':
        this.emit({ pos: p.clone().setY(p.y + (e.z ?? 60)), kind: 'spark', color: col, color2: col2, burst: e.count ?? 12, shape: 'sphere', radius: e.r ?? 40, speed: [20, 90], size: [16, 30], life: [0.4, 0.9], force: [0, 40, 0] })
        break
      case 'aura': {
        // continuous particles following a unit
        const u = e.unit
        if (!u || !posOf) break
        const kind = (e.kind as string) || 'glow'
        const base = { color: col, color2: col2, dur, follow: () => posOf(u) }
        if (kind === 'frost') this.emit({ ...base, pos: p, kind: 'spark', rate: 22, shape: 'donut', radius: 50, speed: [8, 30], size: [14, 26], life: [0.5, 1], force: [0, 30, 0], max: 80 })
        else if (kind === 'fire') this.emit({ ...base, pos: p, rate: 36, shape: 'sphere', radius: 24, speed: [10, 40], size: [26, 50], life: [0.4, 0.8], force: [0, 90, 0], max: 90 })
        else if (kind === 'wisp') this.emit({ ...base, pos: p, kind: 'ember', rate: 18, shape: 'sphere', radius: 40, speed: [6, 24], size: [12, 22], life: [0.7, 1.3], force: [0, 40, 0], max: 60 })
        else if (kind === 'streak') this.emit({ ...base, pos: p, rate: 40, shape: 'sphere', radius: 14, speed: [0, 10], size: [24, 40], life: [0.25, 0.45], max: 60 })
        else this.emit({ ...base, pos: p, rate: 20, shape: 'donut', radius: 46, speed: [10, 30], size: [14, 28], life: [0.5, 1], force: [0, 40, 0], max: 70 })
        break
      }
    }
  }

  update(dt: number) {
    this.batch.update(dt)
    for (let i = this.live.length - 1; i >= 0; i--) if (!this.live[i].update(dt)) this.live.splice(i, 1)
  }
}
