import * as THREE from 'three'
import type { CustomVfx, Vfx } from './vfx'
import { ADD, P, PI, type V3, anim, clamp, easeOut, easeOutBack, later, mkTex, rnd, unitP } from './vfxkit'

/**
 * Hero-specific visual effects (g4): Earthshaker, Tidehunter, Dragon Knight, Drow Ranger, Phantom Assassin, Bounty Hunter,
 * Lina, Lion, Zeus. Key = effect name used with `w.vfx(name, opts)`. Game (x, y) -> three (x, height, y).
 */

/** Wall-clock seconds since this helper was created (for follow callbacks, which get no dt). */
const clock = () => {
  const t0 = performance.now()
  return () => (performance.now() - t0) / 1000
}

const dirOf = (a: number) => new THREE.Vector3(Math.cos(a), 0, Math.sin(a))

/* ------------------------------------------------------------------ textures */

const texDisc = () =>
  mkTex('g4disc', (g, s) => {
    const c = s / 2
    const gr = g.createRadialGradient(c, c, 0, c, c, c)
    gr.addColorStop(0, 'rgba(255,255,255,0.9)')
    gr.addColorStop(0.7, 'rgba(255,255,255,0.5)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, s, s)
  })

/** Magic circle: rings, ticks and a star polygon (n points, skip). */
const texCircle = (n: number, skip: number) =>
  mkTex('g4circ' + n + skip, (g, s) => {
    const c = s / 2
    g.strokeStyle = '#fff'
    g.lineCap = 'round'
    for (const [r, w] of [[0.97, 3], [0.84, 2], [0.3, 2]] as [number, number][]) {
      g.lineWidth = w
      g.beginPath()
      g.arc(c, c, c * r, 0, PI * 2)
      g.stroke()
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * PI * 2
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(c + Math.cos(a) * c * 0.84, c + Math.sin(a) * c * 0.84)
      g.lineTo(c + Math.cos(a) * c * (i % 2 ? 0.9 : 0.95), c + Math.sin(a) * c * (i % 2 ? 0.9 : 0.95))
      g.stroke()
    }
    g.lineWidth = 3
    g.beginPath()
    for (let i = 0; i <= n; i++) {
      const a = -PI / 2 + ((i * skip) / n) * PI * 2
      const x = c + Math.cos(a) * c * 0.8
      const y = c + Math.sin(a) * c * 0.8
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  })

const texCross = () =>
  mkTex('g4cross', (g, s) => {
    const c = s / 2
    g.strokeStyle = '#fff'
    g.lineWidth = 6
    g.beginPath()
    g.arc(c, c, c * 0.62, 0, PI * 2)
    g.stroke()
    g.lineWidth = 8
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2
      g.beginPath()
      g.moveTo(c + Math.cos(a) * c * 0.45, c + Math.sin(a) * c * 0.45)
      g.lineTo(c + Math.cos(a) * c * 0.95, c + Math.sin(a) * c * 0.95)
      g.stroke()
    }
    g.beginPath()
    g.arc(c, c, c * 0.06, 0, PI * 2)
    g.fillStyle = '#fff'
    g.fill()
  })

/* ------------------------------------------------------------------ mesh helpers */

const addMat = (color: string, op = 1, tex?: THREE.Texture) =>
  new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: op, blending: ADD, depthWrite: false, side: THREE.DoubleSide })
const solidMat = (color: string, op = 1) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, transparent: op < 1, opacity: op })

/** Flat textured plane on the ground that spins and fades. */
function sigil(v: Vfx, tex: THREE.Texture, color: string, p: V3, radius: number, dur: number, o: { spin?: number; peak?: number; y?: number; grow?: number } = {}) {
  const mat = addMat(color, 0, tex)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  m.rotation.x = -PI / 2
  m.renderOrder = 4
  const grp = new THREE.Group()
  grp.add(m)
  grp.position.set(p.x, o.y ?? 3, p.z)
  anim(v, grp, dur, (k, _dt, t) => {
    mat.opacity = (o.peak ?? 0.85) * clamp(k / 0.12) * (k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1)
    grp.rotation.y = t * (o.spin ?? 0.8)
    const s = radius * (o.grow !== undefined ? 1 + (o.grow - 1) * easeOut(k) : 1) * (0.85 + 0.15 * easeOut(clamp(k * 4)))
    grp.scale.set(s, 1, s)
  })
}

function disc(v: Vfx, color: string, p: V3, radius: number, dur: number, opacity = 0.4) {
  const mat = addMat(color, 0, texDisc())
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  m.rotation.x = -PI / 2
  m.renderOrder = 3
  const grp = new THREE.Group()
  grp.add(m)
  grp.position.set(p.x, 2, p.z)
  anim(v, grp, dur, (k) => {
    mat.opacity = opacity * clamp(k / 0.08) * (1 - k)
    const s = radius * (0.7 + 0.3 * easeOut(clamp(k * 3)))
    grp.scale.set(s, 1, s)
  })
}

/** Flat pie-slice on the ground starting at p, pointing along game angle `a`. */
function wedge(v: Vfx, color: string, p: V3, a: number, len: number, half: number, dur: number, op = 0.5, grow = true) {
  const mat = addMat(color, 0)
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28, -a - half, half * 2), mat)
  m.rotation.x = -PI / 2
  m.renderOrder = 3
  const grp = new THREE.Group()
  grp.add(m)
  grp.position.set(p.x, 4, p.z)
  anim(v, grp, dur, (k) => {
    mat.opacity = op * clamp(k / 0.1) * (1 - k)
    const s = len * (grow ? 0.3 + 0.7 * easeOut(clamp(k * 3)) : 1)
    grp.scale.set(s, 1, s)
  })
}

/** Glowing strip on the ground from p along angle a (crack/scorch line). */
function strip(v: Vfx, color: string, p: V3, a: number, len: number, wid: number, dur: number, op = 0.8, grow = 0.35) {
  const mat = addMat(color, 0)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  m.rotation.x = -PI / 2
  m.position.x = 0.5
  m.renderOrder = 3
  const grp = new THREE.Group()
  grp.add(m)
  grp.position.set(p.x, 5, p.z)
  grp.rotation.y = -a
  anim(v, grp, dur, (k) => {
    const gk = clamp((k * dur) / grow)
    mat.opacity = op * (k > 0.4 ? 1 - (k - 0.4) / 0.6 : 1)
    grp.scale.set(len * easeOut(gk), 1, wid)
  })
}

function flash(v: Vfx, p: V3, size: number, color: string, dur = 0.2, alpha = 0.7) {
  v.emit({ pos: p.clone(), color, alpha, burst: 1, shape: 'point', speed: [0, 0], size: [size, size], life: [dur, dur], sizeEnd: 0.2 })
}

function dust(v: Vfx, p: V3, r: number, color = '#b89c78', n = 22) {
  v.emit({ pos: p.clone().setY(10), kind: 'smoke', add: false, color, color2: color, alpha: 0.5, burst: n, shape: 'donut', radius: r, speed: [30, 120], size: [r * 0.3, r * 0.6], life: [0.7, 1.3], sizeEnd: 1.6, force: [0, 30, 0], max: n + 6 })
}

function embers(v: Vfx, p: V3, n: number, c1: string, c2: string, r = 30, speed: [number, number] = [60, 220], up = 120) {
  v.emit({ pos: p.clone(), kind: 'spark', color: c1, color2: c2, burst: n, shape: 'sphere', radius: r, speed, size: [10, 24], life: [0.4, 0.9], force: [0, up, 0], max: n + 10 })
}

/** Jagged lightning bolt between two fixed points. */
function bolt(v: Vfx, a: V3, b: V3, dur: number, color: string, width = 12, jag = 40) {
  v.beam(() => a, () => b, dur, color, width, jag)
}

function skyBolt(v: Vfx, x: number, y: number, color: string, width = 22, dur = 0.35, h = 1500) {
  const top = P(x + rnd(-60, 60), y + rnd(-40, 40), h)
  const bot = P(x, y, 0)
  bolt(v, top, bot, dur, color, width, 90)
  later(v, 0.03, () => bolt(v, top.clone().add(P(30, 0, 0)), bot, dur * 0.8, '#ffffff', width * 0.4, 70))
}

/** Glowing sprites travelling from `from()` to `to()`. */
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
    off.push((Math.random() - 0.5) * 70)
  }
  anim(v, grp, dur, (k) => {
    const a = from()
    const b = to()
    if (!a || !b) {
      grp.visible = false
      return
    }
    grp.visible = true
    spr.forEach((s, i) => {
      const kk = clamp((k - (i / n) * 0.45) / 0.55)
      const e = kk * kk * (3 - 2 * kk)
      s.position.lerpVectors(a, b, e)
      s.position.y += Math.sin(kk * PI) * arc
      s.position.x += Math.sin(kk * PI) * off[i]
      ;(s.material as THREE.SpriteMaterial).opacity = Math.sin(kk * PI)
      s.scale.setScalar(size * (0.6 + 0.6 * Math.sin(kk * PI)))
    })
  })
}

/** Stone slab / rock chunk that rises from the ground, holds, then sinks. */
function rock(v: Vfx, p: V3, h: number, w: number, delay: number, hold: number, color = '#8a8478', rotY = 0) {
  later(v, delay, () => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), solidMat(color))
    m.rotation.set(rnd(-0.25, 0.25), rotY, rnd(-0.25, 0.25))
    m.castShadow = true
    const grp = new THREE.Group()
    grp.add(m)
    grp.position.set(p.x, 0, p.z)
    const dur = 0.25 + hold + 0.4
    anim(v, grp, dur, (_k, _dt, t) => {
      const up = t < 0.25 ? easeOut(t / 0.25) : t > 0.25 + hold ? 1 - (t - 0.25 - hold) / 0.4 : 1
      m.position.y = (h / 2) * up - (1 - up) * 10
      m.scale.set(1, Math.max(0.01, up), 1)
    })
  })
}

/* ===================================================================== */

export const VFX_G4: Record<string, CustomVfx> = {
  /* ------------------------------------------------------------ EARTHSHAKER */

  // Fissure: crack races down the line, rock wall erupts piece by piece, dust and embers
  es_fissure: (v, e) => {
    const a = e.angle ?? 0
    const len = e.len ?? 1400
    const wid = e.w ?? 225
    const p0 = P(e.x, e.y)
    const d = dirOf(a)
    strip(v, '#ff8a2a', p0, a, len, wid * 0.22, 2.4, 0.9, 0.5)
    strip(v, '#3a2a1a', p0, a, len, wid * 0.5, 2.8, 0.55, 0.5)
    flash(v, p0.clone().setY(40), 220, '#ffb050', 0.25)
    const n = Math.ceil(len / 90)
    for (let i = 0; i < n; i++) {
      const at = (i + 0.5) / n
      const dl = (at * len) / 2600
      const pp = p0.clone().addScaledVector(d, at * len)
      rock(v, pp.clone().add(P(rnd(-30, 30), rnd(-30, 30), 0)), rnd(170, 290), rnd(48, 70), dl, 1.4 + (i % 3) * 0.1, i % 2 ? '#8a8478' : '#6a645c', rnd(0, 3))
      rock(v, pp.clone().add(P(rnd(-wid * 0.4, wid * 0.4), rnd(-wid * 0.4, wid * 0.4), 0)), rnd(70, 140), rnd(28, 44), dl + 0.05, 1.2, '#5a564e', rnd(0, 3))
      later(v, dl, () => {
        dust(v, pp, 90, '#a08460', 6)
        if (i % 2 === 0) embers(v, pp.clone().setY(30), 6, '#ffb050', '#ff5a1a', 40, [60, 220], 160)
      })
    }
  },

  // Enchant Totem: leap arc with fiery trail, landing quake; empowered glow rings the hero
  es_totem: (v, e, posOf) => {
    const u = e.unit as any
    const p = P(e.x, e.y)
    v.ring(p, 20, 190, 0.5, '#ffb050', 0.1)
    flash(v, p.clone().setY(40), 200, '#ffb050', 0.2)
    dust(v, p, 100, '#a08460', 10)
    if (e.x2 !== undefined) {
      v.emit({ pos: p.clone().setY(60), color: '#ffb050', color2: '#ff4a1a', rate: 60, dur: 0.4, shape: 'sphere', radius: 20, speed: [0, 20], size: [30, 55], life: [0.3, 0.5], max: 60, follow: () => unitP(posOf, u, p).clone().setY(60) })
      v.column(p, 40, 260, 0.45, '#ffb050')
    }
    if (e.land) {
      const q = unitP(posOf, u, p)
      const g = P(q.x, q.z)
      v.ring(g, 20, 260, 0.55, '#ffd890', 0.12)
      v.ring(g, 10, 160, 0.45, '#ff8a2a', 0.2)
      dust(v, g, 140, '#a08460', 16)
      v.spikes(g, 150, 10, 110, 0.7, '#c8a060')
    }
    // fiery totem halo orbiting the hero while the empowerment lasts
    const grp = new THREE.Group()
    const mat = addMat('#ffa040', 0.8)
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(9, 34, 4), mat)
      const a = (i / 6) * PI * 2
      m.position.set(Math.cos(a) * 58, 0, Math.sin(a) * 58)
      grp.add(m)
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(58, 1.6, 4, 24), mat)
    ring.rotation.x = PI / 2
    grp.add(ring)
    anim(v, grp, 14, (k, _dt, t) => {
      if (!u?.hasBuff || !u.hasBuff('es_totem')) return false
      const q = unitP(posOf, u, p)
      grp.position.set(q.x, 45 + Math.sin(t * 3) * 6, q.z)
      grp.rotation.y = t * 2.2
      mat.opacity = 0.55 + Math.sin(t * 6) * 0.2
    })
  },

  es_totem_hit: (v, e) => {
    const p = P(e.x, e.y)
    flash(v, p.clone().setY(60), 330, '#ffd890', 0.25, 0.8)
    v.ring(p, 10, 230, 0.45, '#ffb050', 0.15)
    v.slash(p.clone().setY(30), 0.3, 160, 0.3, '#ffe0a0')
    v.slash(p.clone().setY(30), 2.4, 140, 0.3, '#ff9a3a')
    v.spikes(p, 120, 9, 140, 0.6, '#c8a060')
    dust(v, p, 110, '#a08460', 12)
    embers(v, p.clone().setY(50), 22, '#fff0c0', '#ff7a2a', 24, [100, 340], 80)
  },

  es_aftershock: (v, e) => {
    const r = e.r ?? 300
    const p = P(e.x, e.y)
    v.ring(p, 20, r, 0.4, '#d8b070', 0.14)
    later(v, 0.1, () => v.ring(p, 10, r * 0.7, 0.4, '#ffe0a0', 0.08))
    v.spikes(p, r * 0.8, 10, 110, 0.7, '#c8a060')
    dust(v, p, r * 0.5, '#a08460', 10)
    disc(v, '#d8b070', p, r, 0.6, 0.35)
  },

  // Echo Slam: titanic shockwaves, star of cracks, rock ring and a lingering rune circle
  es_echo: (v, e, posOf) => {
    const r = e.r ?? 600
    const u = e.unit as any
    const p = unitP(posOf, u, P(e.x, e.y))
    const g = P(p.x, p.z)
    flash(v, g.clone().setY(80), 500, '#ffd890', 0.35, 0.9)
    v.ring(g, 30, r, 0.7, '#ffb050', 0.1)
    later(v, 0.12, () => v.ring(g, 20, r * 0.85, 0.7, '#ffffff', 0.05))
    later(v, 0.25, () => v.ring(g, 20, r * 0.6, 0.7, '#ff7a2a', 0.1))
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2 + rnd(-0.15, 0.15)
      strip(v, i % 2 ? '#ff8a2a' : '#ffd890', g, a, r * rnd(0.7, 1), 26, 1.8, 0.85, 0.35)
    }
    v.spikes(g, r * 0.9, 26, 190, 1.1, '#c8a060')
    later(v, 0.2, () => v.spikes(g, r * 0.5, 14, 140, 0.9, '#ffd890'))
    dust(v, g, r * 0.55, '#a08460', 28)
    sigil(v, texCircle(8, 3), '#ffb050', g, r * 0.95, 2.2, { spin: 0.5, peak: 0.75 })
    disc(v, '#ff7a2a', g, r, 1.6, 0.4)
    v.column(g, 70, 520, 0.5, '#ffb050')
  },

  es_echo_wave: (v, e) => {
    const p = P(e.x, e.y)
    v.ring(p, 20, (e.r ?? 600) * 0.7, 0.55, '#ffb050', 0.08)
    v.spikes(p, 90, 5, 110, 0.6, '#c8a060')
    embers(v, p.clone().setY(30), 8, '#ffd890', '#ff7a2a', 20, [60, 180], 140)
  },

  /* ------------------------------------------------------------ TIDEHUNTER */

  tide_gush: (v, e, posOf) => {
    const u = e.unit as any
    const p = unitP(posOf, u, P(e.x, e.y, 70))
    const t = e.unit2 as any
    const q = t ? unitP(posOf, t, p) : p
    const a = Math.atan2(q.z - p.z, q.x - p.x)
    const ps = v.emit({ pos: p.clone().setY(80), color: '#bfefff', color2: '#2a8ad8', burst: 50, shape: 'cone', angle: 0.35, radius: 12, speed: [500, 900], size: [20, 46], life: [0.3, 0.55], sizeEnd: 0.5, up: false, max: 70 })
    ps.emitter.rotation.y = PI / 2 - a
    v.ring(P(p.x, p.z), 20, 130, 0.4, '#4ab0e8', 0.15)
    flow(v, () => p.clone().setY(80), () => (t ? unitP(posOf, t, q) : q), '#7ad8ff', 9, 0.45, 26, 20)
  },

  tide_gush_hit: (v, e) => {
    const p = P(e.x, e.y)
    v.column(p, 50, 240, 0.5, '#7ad8ff')
    v.ring(p, 10, 190, 0.5, '#4ab0e8', 0.15)
    v.emit({ pos: p.clone().setY(40), color: '#e8fbff', color2: '#2a8ad8', burst: 40, shape: 'sphere', radius: 24, speed: [100, 320], size: [14, 32], life: [0.4, 0.8], force: [0, -300, 0], max: 60 })
    v.emit({ pos: p.clone().setY(10), kind: 'smoke', add: false, color: '#bfefff', color2: '#7ad8ff', alpha: 0.4, burst: 12, shape: 'donut', radius: 60, speed: [40, 120], size: [40, 80], life: [0.5, 0.9], sizeEnd: 1.8, max: 20 })
    flash(v, p.clone().setY(60), 200, '#9ae0ff', 0.2)
  },

  // Kraken Shell purge: a bubble of water bursts outward
  tide_shell_purge: (v, e, posOf) => {
    const u = e.unit as any
    const p0 = unitP(posOf, u, P(e.x, e.y, 70))
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), addMat('#7ad8c8', 0.5))
    m.position.copy(p0)
    anim(v, m, 0.6, (k) => {
      const q = unitP(posOf, u, p0)
      m.position.set(q.x, q.y, q.z)
      const s = 40 + 130 * easeOut(k)
      m.scale.set(s, s, s)
      ;(m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k)
    })
    v.ring(P(p0.x, p0.z), 20, 210, 0.5, '#7ad8c8', 0.12)
    v.emit({ pos: p0.clone(), kind: 'ember', color: '#e8fff8', color2: '#4aa890', burst: 36, shape: 'sphere', radius: 30, speed: [80, 260], size: [10, 22], life: [0.4, 0.9], force: [0, 60, 0], max: 50 })
  },

  // Anchor Smash: heavy crescent swing, ground crack, splash donut
  tide_anchor: (v, e, posOf) => {
    const r = e.r ?? 375
    const u = e.unit as any
    const q = unitP(posOf, u, P(e.x, e.y))
    const p = P(q.x, q.z)
    const a = e.angle ?? 0
    v.slash(p.clone().setY(60), a, 260, 0.35, '#bfe0ff')
    later(v, 0.08, () => v.slash(p.clone().setY(40), a + PI * 0.6, 240, 0.35, '#7ab0d8'))
    later(v, 0.16, () => v.slash(p.clone().setY(30), a + PI * 1.2, 220, 0.35, '#bfe0ff'))
    later(v, 0.12, () => {
      v.ring(p, 20, r, 0.5, '#6a8ab0', 0.12)
      for (let i = 0; i < 7; i++) strip(v, '#3a5a7a', p, (i / 7) * PI * 2 + 0.2, r * 0.9, 18, 1.2, 0.7, 0.25)
      v.emit({ pos: p.clone().setY(30), color: '#e8fbff', color2: '#4a90c8', burst: 50, shape: 'donut', radius: r * 0.7, speed: [60, 220], size: [16, 36], life: [0.4, 0.8], force: [0, -60, 0], max: 70 })
      dust(v, p, r * 0.5, '#7a98a8', 12)
      flash(v, p.clone().setY(60), 320, '#9ac8ff', 0.2)
    })
  },

  // Ravage: expanding ring of kraken tentacles that surge up as the wave passes
  tide_ravage: (v, e, posOf) => {
    const R = e.r ?? 1025
    const speed = e.speed ?? 725
    const u = e.unit as any
    const q = unitP(posOf, u, P(e.x, e.y))
    const c = P(e.x ?? q.x, e.y ?? q.z)
    flash(v, c.clone().setY(70), 420, '#7ad8ff', 0.3, 0.8)
    v.ring(c, 40, R, R / speed, '#3a9ac8', 0.06)
    later(v, 0.15, () => v.ring(c, 30, R * 0.9, R / speed, '#7ad8c8', 0.04))
    sigil(v, texCircle(7, 2), '#3a9ac8', c, 360, 1.6, { spin: -0.9, peak: 0.8 })
    disc(v, '#1a6a8a', c, R * 0.6, R / speed + 0.5, 0.35)
    const mat = solidMat('#3a8a72')
    const tipMat = addMat('#9aefc8', 0.7)
    for (let ring = 1; ring * 130 <= R; ring++) {
      const rad = ring * 130
      const cnt = Math.max(5, Math.round((rad * PI * 2) / 150))
      const dl = rad / speed
      for (let i = 0; i < cnt; i++) {
        const ang = (i / cnt) * PI * 2 + ring * 0.37
        later(v, dl + rnd(0, 0.1), () => {
          const x = c.x + Math.cos(ang) * rad
          const z = c.z + Math.sin(ang) * rad
          const grp = new THREE.Group()
          const segs: THREE.Group[] = []
          let parent: THREE.Object3D = grp
          const H = rnd(130, 220)
          for (let k = 0; k < 5; k++) {
            const sg = new THREE.Group()
            sg.position.y = k === 0 ? 0 : (H / 5) * 0.95
            const cone = new THREE.Mesh(new THREE.ConeGeometry(22 - k * 3.6, (H / 5) * 1.25, 6), mat)
            cone.position.y = (H / 5) * 0.5
            cone.castShadow = true
            sg.add(cone)
            parent.add(sg)
            segs.push(sg)
            parent = sg
          }
          const tip = new THREE.Mesh(new THREE.SphereGeometry(7, 6, 5), tipMat)
          tip.position.y = (H / 5) * 1.0
          parent.add(tip)
          grp.position.set(x, 0, z)
          const ph = rnd(0, 6)
          anim(v, grp, 1.5, (_k, _dt, t) => {
            const up = t < 0.25 ? easeOut(t / 0.25) : t > 1.1 ? Math.max(0.01, 1 - (t - 1.1) / 0.4) : 1
            grp.scale.set(1, up, 1)
            segs.forEach((s, j) => (s.rotation.z = Math.sin(t * 4 + ph + j * 0.6) * 0.22 + (j ? 0.12 : 0)))
          })
          if (i % 3 === 0) v.emit({ pos: P(x, z, 10), color: '#e8fbff', color2: '#3a9ac8', burst: 8, shape: 'sphere', radius: 20, speed: [50, 180], size: [12, 26], life: [0.4, 0.8], force: [0, -120, 0], max: 14 })
        })
      }
    }
  },

  /* ------------------------------------------------------------ DRAGON KNIGHT */

  // Breathe Fire: a real cone of flame, scorched ground wedge
  dk_breathe: (v, e) => {
    const a = e.angle ?? 0
    const len = e.len ?? 750
    const p = P(e.x, e.y, 80)
    const mk = (c1: string, c2: string, n: number, kind: 'glow' | 'smoke', size: [number, number], add = true) => {
      const ps = v.emit({ pos: p.clone().add(dirOf(a).multiplyScalar(60)), kind, add, color: c1, color2: c2, rate: n, dur: 0.7, shape: 'cone', angle: 0.28, radius: 14, speed: [len * 0.9, len * 1.5], size, life: [0.35, 0.6], sizeEnd: 1.8, up: false, max: 260, alpha: add ? 1 : 0.4 })
      ps.emitter.rotation.y = PI / 2 - a
    }
    mk('#ffe890', '#ff5a1a', 160, 'glow', [40, 80])
    mk('#ff7a2a', '#7a1a0a', 80, 'smoke', [60, 110], false)
    const base = P(e.x, e.y)
    wedge(v, '#ff6a20', base, a, len, 0.27, 1.0, 0.45)
    wedge(v, '#ffd060', base, a, len * 0.8, 0.12, 0.7, 0.45)
    flash(v, p.clone().add(dirOf(a).multiplyScalar(90)), 240, '#ffb050', 0.35)
    strip(v, '#3a1208', base, a, len * 0.85, 120, 2.4, 0.5, 0.4)
  },

  // Dragon Tail: heavy tail whip then ground-shaking slam
  dk_tail: (v, e) => {
    const p = P(e.x, e.y)
    const a = e.angle ?? 0
    v.slash(p.clone().setY(70), a + PI, 230, 0.3, '#ffb070')
    later(v, 0.1, () => {
      v.slash(p.clone().setY(40), a + PI + 0.6, 200, 0.3, '#ff6a2a')
      v.ring(p, 10, 220, 0.5, '#ff7a3a', 0.15)
      v.spikes(p, 100, 8, 100, 0.6, '#d05a3a')
      flash(v, p.clone().setY(60), 280, '#ffb070', 0.22)
      dust(v, p, 90, '#a08060', 10)
      embers(v, p.clone().setY(40), 22, '#ffe0a0', '#ff4a1a', 20, [100, 320], 100)
      for (let i = 0; i < 4; i++) strip(v, '#ff7a2a', p, (i / 4) * PI * 2 + a, 130, 14, 1.0, 0.8, 0.2)
    })
  },

  dk_blood_pulse: (v, e, posOf) => {
    const u = e.unit as any
    const q = unitP(posOf, u, P(e.x, e.y, 60))
    v.ring(P(q.x, q.z), 20, 120, 0.8, '#c0402a', 0.06)
    v.emit({ pos: q.clone().setY(30), kind: 'ember', color: '#ff7a5a', color2: '#7a1a10', burst: 10, shape: 'donut', radius: 50, speed: [10, 30], size: [10, 18], life: [0.7, 1.2], force: [0, 60, 0], max: 14 })
  },

  // Elder Dragon Form: eruption, rune circle, flaming wings and aura for the whole duration
  dk_dragon_form: (v, e, posOf) => {
    const u = e.unit as any
    const dur = e.dur ?? 60
    const lvl = e.level ?? 1
    const p0 = unitP(posOf, u, P(e.x, e.y, 60))
    const g = P(p0.x, p0.z)
    flash(v, p0.clone().setY(100), 600, '#ffb050', 0.5, 0.9)
    v.column(g, 80, 700, 0.9, '#ff6a2a')
    v.ring(g, 30, 420, 0.7, '#ff8a3a', 0.1)
    later(v, 0.15, () => v.ring(g, 20, 300, 0.7, '#ffe0a0', 0.06))
    sigil(v, texCircle(6, 2), '#ff6a2a', g, 240, 1.8, { spin: 1.4, peak: 0.85 })
    v.spikes(g, 220, 14, 220, 0.9, '#ff7a2a')
    embers(v, p0.clone(), 70, '#ffe890', '#ff3a0a', 40, [120, 420], 220)
    const accent = lvl >= 3 ? '#9fe0ff' : lvl >= 2 ? '#8ad030' : '#ff6a2a'
    v.emit({ pos: p0.clone(), color: '#ff9a3a', color2: accent, rate: 34, dur, shape: 'sphere', radius: 34, speed: [10, 50], size: [26, 54], life: [0.4, 0.8], force: [0, 110, 0], max: 90, follow: () => (u && u.hasBuff && !u.hasBuff('dk_elder_dragon') ? null : unitP(posOf, u, p0).clone().setY(70)) })
    // wings
    const wingShape = new THREE.Shape()
    wingShape.moveTo(0, 0)
    wingShape.lineTo(30, 100)
    wingShape.lineTo(110, 190)
    wingShape.lineTo(105, 130)
    wingShape.lineTo(170, 150)
    wingShape.lineTo(140, 95)
    wingShape.lineTo(195, 90)
    wingShape.lineTo(150, 55)
    wingShape.lineTo(185, 20)
    wingShape.lineTo(90, 25)
    wingShape.lineTo(40, -30)
    wingShape.closePath()
    const wmat = new THREE.MeshStandardMaterial({ color: '#8a1a14', emissive: new THREE.Color('#ff4a1a'), emissiveIntensity: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.92, flatShading: true })
    const bmat = new THREE.MeshStandardMaterial({ color: '#2a1410', flatShading: true })
    const grp = new THREE.Group()
    const wings: THREE.Group[] = []
    for (const sd of [-1, 1]) {
      const pivot = new THREE.Group()
      const w = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), wmat)
      w.rotation.y = sd > 0 ? -PI / 2 : PI / 2 // spread along +-z, height along y
      pivot.add(w)
      for (const [x, y] of [[110, 190], [170, 150], [195, 90], [185, 20]] as [number, number][]) {
        const len = Math.hypot(x, y)
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, len, 5), bmat)
        bone.position.set(0, y / 2, (sd * x) / 2)
        bone.rotation.x = sd * Math.atan2(x, y)
        pivot.add(bone)
      }
      pivot.position.set(-18, 70, sd * 22)
      grp.add(pivot)
      wings.push(pivot)
    }
    anim(v, grp, dur, (_k, _dt, t) => {
      if (!u || u.dead || (u.hasBuff && !u.hasBuff('dk_elder_dragon'))) return false
      const q = unitP(posOf, u, p0)
      grp.position.set(q.x, 0, q.z)
      grp.rotation.y = -(u.facing ?? 0)
      const f = Math.sin(t * 2.6) * 0.28
      wings.forEach((w, i) => {
        w.rotation.x = (i === 0 ? 1 : -1) * (0.35 + f) // i=0 is the -z wing
      })
      wmat.emissiveIntensity = 0.5 + Math.sin(t * 5) * 0.2
    })
  },

  dk_dragon_hit: (v, e) => {
    const p = P(e.x, e.y, 60)
    const c = e.lvl >= 3 ? ['#e8fbff', '#4ab0e8'] : e.lvl >= 2 ? ['#d8ff8a', '#4a9a1a'] : ['#ffe890', '#ff4a1a']
    v.emit({ pos: p.clone(), color: c[0], color2: c[1], burst: 24, shape: 'sphere', radius: 14, speed: [60, 240], size: [18, 40], life: [0.3, 0.6], sizeEnd: 0.1 })
    flash(v, p.clone(), 150, c[1], 0.15)
    if (e.lvl >= 3) v.ring(P(e.x, e.y), 10, 150, 0.4, c[1], 0.15)
  },

  /* ------------------------------------------------------------ DROW RANGER */

  drow_frost_hit: (v, e) => {
    const p = P(e.x, e.y, 60)
    const k = e.small ? 0.5 : 1
    v.emit({ pos: p.clone(), kind: 'spark', color: '#ffffff', color2: '#8fd8ff', burst: Math.round(20 * k), shape: 'sphere', radius: 12, speed: [50, 200], size: [10, 22], life: [0.3, 0.7], force: [0, -40, 0], max: 30 })
    if (!e.small) {
      v.spikes(P(e.x, e.y), 50, 6, 100, 0.6, '#bfeaff')
      v.ring(P(e.x, e.y), 10, 110, 0.4, '#8fd8ff', 0.15)
    }
    flash(v, p.clone(), 110 * k, '#bfeaff', 0.15)
  },

  // Gust: sweeping wind crescents travelling down the line, whirling snow
  drow_gust: (v, e) => {
    const a = e.angle ?? 0
    const len = e.len ?? 900
    const p0 = P(e.x, e.y)
    const d = dirOf(a)
    const ps = v.emit({ pos: p0.clone().setY(70).add(d.clone().multiplyScalar(60)), kind: 'smoke', add: true, color: '#e8f6ff', color2: '#8fc8ff', rate: 120, dur: 0.5, shape: 'cone', angle: 0.22, radius: 80, speed: [len * 1.3, len * 2], size: [60, 120], life: [0.4, 0.65], sizeEnd: 1.6, up: false, max: 200, alpha: 0.5 })
    ps.emitter.rotation.y = PI / 2 - a
    wedge(v, '#bfe8ff', p0, a, len, 0.22, 0.8, 0.35)
    for (let i = 0; i < 4; i++) {
      later(v, i * 0.09, () => {
        const mat = addMat('#e8f6ff', 0.7)
        const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 24, 1, -0.7, 1.4), mat)
        m.rotation.x = -PI / 2
        const grp = new THREE.Group()
        grp.add(m)
        grp.rotation.y = -a
        anim(v, grp, 0.55, (k) => {
          const x = p0.x + d.x * len * 0.9 * easeOut(k)
          const z = p0.z + d.z * len * 0.9 * easeOut(k)
          grp.position.set(x, 60 + i * 14, z)
          const s = 90 + 90 * k
          m.scale.set(s, s, 1)
          mat.opacity = 0.7 * (1 - k)
          m.position.x = 0
        })
      })
    }
    v.ring(P(p0.x, p0.z), 20, 180, 0.4, '#bfe8ff', 0.1)
  },

  // Multishot: guide cone on the ground, muzzle flash per volley
  drow_multishot_cast: (v, e, posOf) => {
    const u = e.unit as any
    const a = e.angle ?? 0
    const dur = e.dur ?? 2
    const p0 = unitP(posOf, u, P(e.x, e.y, 60))
    const grp = new THREE.Group()
    const mat = addMat('#9ad0ff', 0.3)
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20, -a - 0.38, 0.76), mat)
    m.rotation.x = -PI / 2
    grp.add(m)
    anim(v, grp, dur, (k, _dt, t) => {
      const q = unitP(posOf, u, p0)
      grp.position.set(q.x, 4, q.z)
      grp.scale.set(700, 1, 700)
      mat.opacity = (0.22 + Math.sin(t * 14) * 0.08) * (k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1)
    })
    for (let i = 0; i < 4; i++) {
      later(v, 0.5 * (i + 1) - 0.4, () => {
        const q = unitP(posOf, u, p0)
        const ps = v.emit({ pos: q.clone().add(dirOf(a).multiplyScalar(70)).setY(80), kind: 'spark', color: '#ffffff', color2: '#8fd8ff', burst: 16, shape: 'cone', angle: 0.45, radius: 8, speed: [300, 700], size: [14, 28], life: [0.15, 0.3], up: false, max: 24 })
        ps.emitter.rotation.y = PI / 2 - a
        flash(v, q.clone().add(dirOf(a).multiplyScalar(70)).setY(80), 150, '#bfeaff', 0.12)
      })
    }
  },

  // Marksmanship proc: crosshair slams onto the target
  drow_marksman: (v, e) => {
    const p = P(e.x, e.y)
    const mat = addMat('#ffe890', 0.9, texCross())
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    m.rotation.x = -PI / 2
    const grp = new THREE.Group()
    grp.add(m)
    grp.position.set(p.x, 6, p.z)
    anim(v, grp, 0.45, (k) => {
      const s = 150 - 90 * easeOut(clamp(k * 3)) + 20 * k
      grp.scale.set(s, 1, s)
      grp.rotation.y = k * 1.6
      mat.opacity = 0.9 * (1 - k)
    })
    v.beam(() => P(p.x, p.z, 700), () => P(p.x, p.z, 40), 0.18, '#fff6c0', 8)
    embers(v, p.clone().setY(50), 16, '#fff6c0', '#ffb030', 12, [60, 240], 60)
    v.ring(p, 10, 100, 0.35, '#ffe890', 0.14)
  },

  /* ------------------------------------------------------------ PHANTOM ASSASSIN */

  pa_dagger: (v, e, posOf) => {
    const u = e.unit as any
    const t = e.unit2 as any
    const a = unitP(posOf, u, P(e.x, e.y, 70))
    const b = unitP(posOf, t, a)
    const ang = Math.atan2(b.z - a.z, b.x - a.x)
    v.slash(a.clone().setY(40), ang, 110, 0.2, '#c8d0e8')
    flash(v, a.clone().setY(80), 100, '#d8e0ff', 0.12)
    // spinning dagger mesh flying to the target
    const grp = new THREE.Group()
    const blade = new THREE.Mesh(new THREE.ConeGeometry(6, 46, 4), new THREE.MeshBasicMaterial({ color: '#e8eefc' }))
    blade.rotation.z = -PI / 2
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 22, 5), new THREE.MeshBasicMaterial({ color: '#7a5a8a' }))
    handle.rotation.z = PI / 2
    handle.position.x = -30
    const halo = new THREE.Mesh(new THREE.SphereGeometry(16, 8, 6), addMat('#b8a0ff', 0.35))
    grp.add(blade, handle, halo)
    const dist = Math.hypot(b.x - a.x, b.z - a.z)
    anim(v, grp, Math.max(0.1, dist / 1200), (k, _dt, tt) => {
      const to = t ? unitP(posOf, t, b) : b
      grp.position.lerpVectors(a, to, k)
      grp.position.y = 75
      grp.rotation.y = -Math.atan2(to.z - a.z, to.x - a.x)
      blade.rotation.x = tt * 28
      handle.rotation.x = tt * 28
    })
    v.emit({ pos: a.clone().setY(75), color: '#c8b8ff', color2: '#5a3aa8', rate: 70, dur: dist / 1200, shape: 'point', speed: [0, 8], size: [14, 24], life: [0.25, 0.4], max: 40, follow: (() => { const c = clock(); return () => new THREE.Vector3().lerpVectors(a, t ? unitP(posOf, t, b) : b, clamp(c() / (dist / 1200))).setY(75) })() })
  },

  pa_dagger_hit: (v, e) => {
    const p = P(e.x, e.y, 60)
    v.slash(p.clone().setY(30), 0.5, 120, 0.25, '#e8eefc')
    v.slash(p.clone().setY(30), 2.6, 100, 0.25, '#b8a0ff')
    embers(v, p, 14, '#ffffff', '#7a5ad8', 10, [60, 220], 0)
    v.ring(P(e.x, e.y), 10, 100, 0.35, '#b8a0ff', 0.14)
    v.emit({ pos: p.clone(), kind: 'smoke', add: false, color: '#5a4a8a', color2: '#1a1430', alpha: 0.5, burst: 6, shape: 'sphere', radius: 10, speed: [10, 50], size: [40, 70], life: [0.4, 0.8], sizeEnd: 1.6, max: 8 })
  },

  // Phantom Strike: ghost trail, shadow burst at both ends, X cut at the destination
  pa_strike: (v, e, posOf) => {
    const a = P(e.x, e.y, 70)
    const b = P(e.x2!, e.y2!, 70)
    v.beam(() => a, () => b, 0.35, '#7a5ad8', 22)
    v.beam(() => a, () => b, 0.2, '#ffffff', 6)
    for (const [p, big] of [[a, true], [b, false]] as [V3, boolean][]) {
      v.emit({ pos: p.clone(), kind: 'smoke', add: false, color: '#3a2a6a', color2: '#0e0a1e', alpha: 0.7, burst: big ? 26 : 18, shape: 'sphere', radius: 26, speed: [40, 160], size: [50, 100], life: [0.5, 1], sizeEnd: 1.4, max: 40 })
      v.emit({ pos: p.clone(), color: '#c8b0ff', color2: '#6a3ad8', burst: 20, shape: 'sphere', radius: 14, speed: [80, 260], size: [14, 30], life: [0.25, 0.6], max: 30 })
      v.ring(P(p.x, p.z), 10, 130, 0.45, '#8a6ae8', 0.14)
    }
    flash(v, b.clone(), 260, '#c8b0ff', 0.2, 0.8)
    const ang = Math.atan2(b.z - a.z, b.x - a.x)
    later(v, 0.05, () => {
      v.slash(b.clone().setY(40), ang + 0.5, 170, 0.28, '#ffffff')
      v.slash(b.clone().setY(40), ang - 0.5 + PI, 170, 0.28, '#b090ff')
    })
    // lingering silhouette at the origin
    const ghost = new THREE.Mesh(new THREE.CapsuleGeometry(24, 90, 4, 8), addMat('#6a4ad8', 0.5))
    ghost.position.set(a.x, 70, a.z)
    anim(v, ghost, 0.55, (k) => {
      ;(ghost.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k)
      ghost.scale.set(1 - k * 0.4, 1 + k * 0.1, 1 - k * 0.4)
    })
  },

  // Coup de Grace: blood-red X slash, shock flash, vertical pillar
  pa_crit: (v, e) => {
    const p = P(e.x, e.y, 60)
    const a = e.angle ?? 0
    flash(v, p.clone().setY(80), 480, '#ff5a6a', 0.3, 0.9)
    flash(v, p.clone().setY(80), 240, '#ffffff', 0.15, 1)
    v.slash(p.clone().setY(40), a + 0.4, 240, 0.35, '#ff3a4a')
    v.slash(p.clone().setY(40), a + PI - 0.4, 240, 0.35, '#ffffff')
    later(v, 0.08, () => v.slash(p.clone().setY(40), a + PI / 2, 220, 0.3, '#ff7a8a'))
    v.ring(P(e.x, e.y), 10, 260, 0.5, '#ff3a4a', 0.14)
    v.column(P(e.x, e.y), 30, 420, 0.35, '#ff3a4a')
    v.emit({ pos: p.clone(), kind: 'spark', color: '#ffffff', color2: '#c0102a', burst: 40, shape: 'sphere', radius: 14, speed: [120, 420], size: [12, 26], life: [0.3, 0.8], force: [0, -200, 0], max: 50 })
    v.emit({ pos: p.clone(), kind: 'smoke', add: false, color: '#8a0a1a', color2: '#2a0408', alpha: 0.5, burst: 10, shape: 'sphere', radius: 20, speed: [30, 120], size: [40, 80], life: [0.5, 1], sizeEnd: 1.6, max: 14 })
  },

  /* ------------------------------------------------------------ BOUNTY HUNTER */

  bh_shuriken: (v, e, posOf) => {
    const t = e.unit2 as any
    const a = P(e.x, e.y, 80)
    const b0 = unitP(posOf, t, a)
    const grp = new THREE.Group()
    const m = new THREE.MeshBasicMaterial({ color: '#d8dee8' })
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(10, 36, 3), m)
      c.rotation.x = PI / 2
      c.rotation.y = (i * PI) / 2
      c.position.set(Math.cos((i * PI) / 2) * 14, 0, Math.sin((i * PI) / 2) * 14)
      c.rotation.set(PI / 2, 0, (i * PI) / 2 - PI / 2)
      grp.add(c)
    }
    grp.add(new THREE.Mesh(new THREE.SphereGeometry(18, 8, 6), addMat('#9ab8ff', 0.4)))
    const dist = Math.hypot(b0.x - a.x, b0.z - a.z)
    const dur = Math.max(0.12, dist / 1000)
    anim(v, grp, dur + 0.5, (_k, _dt, tt) => {
      if (!t || t.dead) {
        if (tt > dur) return false
      }
      const to = t ? unitP(posOf, t, b0) : b0
      const k = clamp(tt / dur)
      grp.position.lerpVectors(a, to, k)
      grp.position.y = 80
      grp.rotation.y = tt * 22
      if (k >= 1) return false
    })
    flash(v, a.clone(), 110, '#d8e4ff', 0.12)
    v.emit({ pos: a.clone(), kind: 'spark', color: '#ffffff', color2: '#8aa8ff', rate: 50, dur, shape: 'point', speed: [0, 6], size: [10, 18], life: [0.25, 0.4], max: 30, follow: (() => { const c = clock(); return () => new THREE.Vector3().lerpVectors(a, t ? unitP(posOf, t, b0) : b0, clamp(c() / dur)).setY(80) })() })
  },

  bh_shuriken_hit: (v, e) => {
    const p = P(e.x, e.y, 60)
    v.slash(p.clone().setY(30), 0.7, 130, 0.25, '#d8e4ff')
    embers(v, p, 18, '#ffffff', '#6a8ae8', 10, [80, 280], 0)
    v.ring(P(e.x, e.y), 10, 120, 0.4, '#8aa8ff', 0.14)
    flash(v, p.clone(), 140, '#bfd0ff', 0.14)
  },

  // Jinada: golden X slash with coins spilling out
  bh_jinada: (v, e) => {
    const p = P(e.x, e.y, 60)
    const a = e.angle ?? 0
    v.slash(p.clone().setY(40), a + 0.5, 190, 0.3, '#ffe060')
    v.slash(p.clone().setY(40), a + PI - 0.5, 190, 0.3, '#ffffff')
    flash(v, p.clone(), 220, '#ffd040', 0.2, 0.8)
    v.emit({ pos: p.clone().setY(70), kind: 'spark', color: '#fff0a0', color2: '#e0a020', burst: 22, shape: 'sphere', radius: 12, speed: [100, 300], size: [14, 26], life: [0.5, 1.0], force: [0, -520, 0], max: 30 })
    v.ring(P(e.x, e.y), 10, 140, 0.4, '#ffd040', 0.14)
  },

  // Shadow Walk: ink-black smoke swallows the hero (on) or sloughs off (off)
  bh_shadow_walk: (v, e, posOf) => {
    const u = e.unit as any
    const p = unitP(posOf, u, P(e.x, e.y, 60))
    const g = P(p.x, p.z)
    const col = e.on ? '#1a1a2a' : '#3a3a5a'
    v.emit({ pos: p.clone().setY(50), kind: 'smoke', add: false, color: col, color2: '#06060c', alpha: 0.85, burst: e.on ? 34 : 24, shape: 'sphere', radius: 32, speed: [30, 150], size: [60, 120], life: [0.6, 1.2], sizeEnd: 1.5, force: [0, 30, 0], max: 50 })
    v.ring(g, 20, 190, 0.6, e.on ? '#6a7a9a' : '#c8d0e8', 0.1)
    v.emit({ pos: p.clone().setY(60), color: '#8aa0d0', color2: '#2a3a6a', burst: 16, shape: 'sphere', radius: 24, speed: [20, 100], size: [12, 24], life: [0.5, 1], force: [0, 50, 0], max: 24 })
    if (e.on) {
      v.emit({ pos: p.clone().setY(40), kind: 'smoke', add: false, color: '#10101c', color2: '#06060c', alpha: 0.6, rate: 24, dur: 0.9, shape: 'sphere', radius: 28, speed: [4, 22], size: [50, 90], life: [0.5, 0.9], sizeEnd: 1.2, max: 40, follow: () => unitP(posOf, u, p).clone().setY(40) })
    }
  },

  // Track: rotating crosshair over the mark with a beacon beam; payout fountain of gold
  bh_track: (v, e, posOf) => {
    const u = e.unit as any
    const dur = e.dur ?? 30
    const p0 = unitP(posOf, u, P(e.x, e.y, 60))
    if (e.payout) {
      v.emit({ pos: P(e.x, e.y, 60), kind: 'spark', color: '#fff0a0', color2: '#e0a020', burst: 60, shape: 'sphere', radius: 20, speed: [120, 420], size: [14, 28], life: [0.7, 1.4], force: [0, -420, 0], max: 70 })
      v.ring(P(e.x, e.y), 10, 220, 0.6, '#ffd040', 0.12)
      flash(v, P(e.x, e.y, 80), 320, '#ffd040', 0.3)
      return
    }
    flash(v, p0.clone().setY(90), 280, '#ffd040', 0.25)
    v.ring(P(p0.x, p0.z), 10, 200, 0.5, '#ffd040', 0.12)
    v.beam(() => P(p0.x, p0.z, 900), () => unitP(posOf, u, p0), 0.35, '#ffd040', 10)
    const mat = addMat('#ffd040', 0.9, texCross())
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    m.rotation.x = -PI / 2
    const grp = new THREE.Group()
    grp.add(m)
    anim(v, grp, dur, (k, _dt, t) => {
      if (!u || u.dead || (u.hasBuff && !u.hasBuff('bh_track'))) return false
      const q = unitP(posOf, u, p0)
      grp.position.set(q.x, 130 + Math.sin(t * 3) * 6, q.z)
      grp.rotation.y = t * 1.4
      const s = 60 + Math.sin(t * 4) * 5
      grp.scale.set(s, 1, s)
      mat.opacity = (0.55 + Math.sin(t * 5) * 0.2) * (k > 0.95 ? 1 - (k - 0.95) / 0.05 : 1)
    })
    // ground footprints glow under the mark
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), addMat('#ffd040', 0.5))
    ring.rotation.x = -PI / 2
    const rg = new THREE.Group()
    rg.add(ring)
    anim(v, rg, dur, (k, _dt, t) => {
      if (!u || u.dead || (u.hasBuff && !u.hasBuff('bh_track'))) return false
      const q = unitP(posOf, u, p0)
      rg.position.set(q.x, 4, q.z)
      const s = 70 + Math.sin(t * 3) * 6
      rg.scale.set(s, 1, s)
    })
  },

  /* ------------------------------------------------------------ LINA */

  // Dragon Slave: a roaring wave of dragon fire sweeping down the line
  lina_dragon_slave: (v, e) => {
    const a = e.angle ?? 0
    const len = e.len ?? 1075
    const p0 = P(e.x, e.y)
    const d = dirOf(a)
    const T = len / 1200
    const grp = new THREE.Group()
    const fireMat = addMat('#ff6a20', 0.7)
    const coreMat = addMat('#ffe890', 0.9)
    // dragon head: cone body + jaws + horns
    const body = new THREE.Mesh(new THREE.ConeGeometry(110, 300, 8, 1, true), fireMat)
    body.rotation.z = -PI / 2
    body.position.x = -60
    const core = new THREE.Mesh(new THREE.ConeGeometry(55, 220, 7, 1, true), coreMat)
    core.rotation.z = -PI / 2
    core.position.x = -20
    const jawU = new THREE.Mesh(new THREE.ConeGeometry(34, 140, 5), addMat('#ffb040', 0.9))
    jawU.rotation.z = -PI / 2 + 0.18
    jawU.position.set(110, 36, 0)
    const jawL = jawU.clone()
    jawL.rotation.z = -PI / 2 - 0.18
    jawL.position.set(110, -36, 0)
    grp.add(body, core, jawU, jawL)
    for (const sd of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(14, 90, 4), addMat('#ffd060', 0.9))
      h.position.set(30, 70, sd * 60)
      h.rotation.z = 0.7
      grp.add(h)
    }
    grp.rotation.y = -a
    v.ring(P(p0.x, p0.z), 20, 200, 0.4, '#ff8a3a', 0.12)
    flash(v, p0.clone().setY(80), 300, '#ffb050', 0.25)
    v.emit({ pos: p0.clone().setY(70), color: '#ffe890', color2: '#ff3a0a', rate: 150, dur: T, shape: 'sphere', radius: 70, speed: [10, 90], size: [50, 100], life: [0.4, 0.8], sizeEnd: 0.3, max: 260, follow: (() => { const c = clock(); return () => p0.clone().addScaledVector(d, Math.min(len, 1200 * c())).setY(70) })() })
    v.emit({ pos: p0.clone().setY(60), kind: 'smoke', add: false, color: '#5a1a08', color2: '#1a0804', alpha: 0.4, rate: 50, dur: T, shape: 'sphere', radius: 80, speed: [10, 50], size: [80, 140], life: [0.6, 1.1], sizeEnd: 1.5, max: 120, follow: (() => { const c = clock(); return () => p0.clone().addScaledVector(d, Math.min(len, 1200 * c())).setY(60) })() })
    strip(v, '#ff5a1a', p0, a, len, 110, 1.6, 0.6, T)
    anim(v, grp, T + 0.15, (k, _dt, t) => {
      grp.position.copy(p0).addScaledVector(d, Math.min(len, 1200 * t))
      grp.position.y = 70
      body.scale.set(1 + Math.sin(t * 40) * 0.08, 1, 1 + Math.cos(t * 33) * 0.08)
      core.scale.set(1, 1 + Math.sin(t * 50) * 0.1, 1)
      jawU.rotation.z = -PI / 2 + 0.18 + Math.sin(t * 20) * 0.06
      jawL.rotation.z = -PI / 2 - 0.18 - Math.sin(t * 20) * 0.06
      const fo = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1
      fireMat.opacity = 0.7 * fo
      coreMat.opacity = 0.9 * fo
    })
  },

  lina_dslave_hit: (v, e) => {
    const p = P(e.x, e.y, 60)
    flash(v, p.clone(), 220, '#ff9a3a', 0.2, 0.8)
    v.emit({ pos: p.clone(), color: '#ffe890', color2: '#ff3a0a', burst: 28, shape: 'sphere', radius: 16, speed: [80, 300], size: [20, 46], life: [0.3, 0.7], force: [0, 90, 0], sizeEnd: 0.1, max: 40 })
    v.ring(P(e.x, e.y), 10, 130, 0.4, '#ff7a2a', 0.14)
  },

  // Light Strike Array: rune circle burns in, then a pillar of fire
  lina_lsa_charge: (v, e) => {
    const r = e.r ?? 250
    const dur = e.dur ?? 0.5
    const p = P(e.x, e.y)
    sigil(v, texCircle(5, 2), '#ff8a3a', p, r, dur + 0.5, { spin: 2.2, peak: 0.95 })
    disc(v, '#ff5a1a', p, r, dur + 0.4, 0.45)
    v.ring(p, r * 1.1, r * 0.3, dur, '#ffb050', 0.08)
    v.emit({ pos: p.clone().setY(10), kind: 'ember', color: '#ffe890', color2: '#ff4a1a', rate: 70, dur, shape: 'donut', radius: r * 0.8, speed: [30, 90], size: [12, 24], life: [0.4, 0.7], force: [0, 160, 0], max: 80, follow: () => p })
  },

  lina_lsa_hit: (v, e) => {
    const r = e.r ?? 250
    const p = P(e.x, e.y)
    flash(v, p.clone().setY(100), 560, '#ffe890', 0.3, 0.95)
    v.column(p, r * 0.55, 900, 0.7, '#ff8a2a')
    v.column(p, r * 0.3, 1100, 0.5, '#ffffff')
    v.ring(p, 20, r * 1.4, 0.5, '#ff7a2a', 0.12)
    later(v, 0.1, () => v.ring(p, 10, r, 0.5, '#ffe890', 0.08))
    v.spikes(p, r * 0.8, 14, 260, 0.8, '#ff6a20')
    v.emit({ pos: p.clone().setY(30), kind: 'ember', color: '#ffe890', color2: '#ff2a0a', burst: 80, shape: 'donut', radius: r * 0.7, speed: [80, 360], size: [14, 34], life: [0.6, 1.3], force: [0, 260, 0], max: 100 })
    v.emit({ pos: p.clone().setY(30), kind: 'smoke', add: false, color: '#5a1a08', color2: '#1a0804', alpha: 0.5, burst: 14, shape: 'donut', radius: r * 0.6, speed: [40, 140], size: [70, 120], life: [0.8, 1.4], sizeEnd: 1.6, force: [0, 60, 0], max: 20 })
    disc(v, '#7a1a08', p, r * 1.1, 2.2, 0.55)
  },

  // Fiery Soul: flames lick up around her; embers burn for each stack
  lina_fiery_soul: (v, e, posOf) => {
    const u = e.unit as any
    const n = e.stacks ?? 1
    const p = unitP(posOf, u, P(e.x, e.y, 60))
    v.ring(P(p.x, p.z), 20, 120 + n * 30, 0.5, '#ff8a3a', 0.1)
    flash(v, p.clone().setY(70), 200 + n * 40, '#ffb050', 0.25)
    v.emit({ pos: p.clone().setY(40), color: '#ffe890', color2: '#ff3a0a', burst: 22 + n * 8, shape: 'donut', radius: 50, speed: [40, 160], size: [24, 50], life: [0.4, 0.8], force: [0, 200, 0], sizeEnd: 0.1, max: 60 })
    v.emit({ pos: p.clone().setY(40), color: '#ff9a3a', color2: '#ff3a0a', rate: 16 + n * 8, dur: 1.2, shape: 'sphere', radius: 30, speed: [8, 30], size: [22, 40], life: [0.4, 0.7], force: [0, 120, 0], max: 40, follow: () => unitP(posOf, u, p).clone().setY(60) })
  },

  // Laguna Blade: thunderous bolt of lightning, white-hot core, forking arcs
  lina_laguna: (v, e, posOf) => {
    const u = e.unit as any
    const t = e.unit2 as any
    const a = unitP(posOf, u, P(e.x, e.y, 90)).clone().setY(110)
    const b = unitP(posOf, t, P(e.x2!, e.y2!, 70)).clone().setY(70)
    flash(v, a.clone(), 320, '#fff0a0', 0.3, 0.9)
    v.emit({ pos: a.clone(), kind: 'spark', color: '#ffffff', color2: '#ffd040', burst: 30, shape: 'sphere', radius: 30, speed: [20, 140], size: [12, 24], life: [0.3, 0.6], max: 40 })
    v.ring(P(a.x, a.z), 10, 140, 0.4, '#ffe060', 0.12)
    later(v, 0.1, () => {
      const bb = t ? unitP(posOf, t, b).clone().setY(70) : b
      v.beam(() => a, () => bb, 0.55, '#ffe060', 34, 70)
      v.beam(() => a, () => bb, 0.45, '#ffffff', 12, 40)
      for (let i = 0; i < 4; i++) {
        later(v, i * 0.06, () => {
          const mid = a.clone().lerp(bb, rnd(0.3, 0.7))
          const side = mid.clone().add(P(rnd(-160, 160), rnd(-160, 160), rnd(-30, 80)))
          bolt(v, mid, side, 0.25, '#fff0a0', 8, 40)
        })
      }
      flash(v, bb.clone(), 520, '#ffe890', 0.35, 0.95)
      v.ring(P(bb.x, bb.z), 10, 300, 0.55, '#ffd040', 0.12)
      v.column(P(bb.x, bb.z), 50, 700, 0.5, '#ffe060')
      v.emit({ pos: bb.clone(), kind: 'spark', color: '#ffffff', color2: '#ff8a1a', burst: 60, shape: 'sphere', radius: 20, speed: [120, 460], size: [14, 30], life: [0.3, 0.9], force: [0, -150, 0], max: 80 })
      disc(v, '#ffb040', P(bb.x, bb.z), 230, 1.4, 0.5)
    })
  },

  /* ------------------------------------------------------------ LION */

  // Earth Spike: demonic spikes burst from the ground one after another
  lion_spike: (v, e) => {
    const a = e.angle ?? 0
    const len = e.len ?? 900
    const p0 = P(e.x, e.y)
    const d = dirOf(a)
    strip(v, '#8ad030', p0, a, len, 70, 1.8, 0.6, len / 1600)
    flash(v, p0.clone().setY(40), 180, '#b0f060', 0.2)
    const n = Math.ceil(len / 70)
    for (let i = 0; i < n; i++) {
      const at = (i + 0.5) / n
      const pp = p0.clone().addScaledVector(d, at * len)
      const dl = (at * len) / 1600
      for (const sd of [-1, 1]) {
        const off = P(-d.z * sd * 60, d.x * sd * 60, 0)
        rock(v, pp.clone().add(off), rnd(150, 270), rnd(26, 40), dl + (sd > 0 ? 0.02 : 0), 0.55, i % 2 ? '#7a4a98' : '#5a2a78', rnd(0, 3))
      }
      later(v, dl, () => {
        v.spikes(pp, 70, 3, 160, 0.7, '#a0f050')
        if (i % 2 === 0) embers(v, pp.clone().setY(30), 6, '#d8ff8a', '#5aa020', 30, [60, 200], 140)
        if (i % 3 === 0) dust(v, pp, 70, '#6a8a40', 4)
      })
    }
  },

  // Hex: green puff and a frog bobbing over the victim
  lion_hex: (v, e, posOf) => {
    const u = e.unit as any
    const dur = e.dur ?? 3
    const p0 = unitP(posOf, u, P(e.x, e.y, 60))
    const g = P(p0.x, p0.z)
    flash(v, p0.clone().setY(80), 320, '#8aff5a', 0.3, 0.8)
    v.ring(g, 10, 190, 0.5, '#7ad84a', 0.14)
    v.emit({ pos: p0.clone().setY(60), kind: 'smoke', add: false, color: '#5ad030', color2: '#1a4a10', alpha: 0.7, burst: 28, shape: 'sphere', radius: 34, speed: [40, 150], size: [50, 100], life: [0.6, 1.1], sizeEnd: 1.4, max: 40 })
    v.emit({ pos: p0.clone().setY(70), kind: 'spark', color: '#e8ffa0', color2: '#5ad030', burst: 30, shape: 'sphere', radius: 24, speed: [60, 220], size: [12, 24], life: [0.5, 1.1], force: [0, 80, 0], max: 40 })
    if (e.x2 !== undefined) v.beam(() => P(e.x2!, e.y2!, 100), () => unitP(posOf, u, p0), 0.25, '#8aff5a', 14, 30)
    sigil(v, texCircle(5, 2), '#7ad84a', g, 120, Math.min(dur, 3), { spin: 1.6, peak: 0.8 })
    // frog
    const frog = new THREE.Group()
    const skin = new THREE.MeshStandardMaterial({ color: '#5ad030', flatShading: true, roughness: 0.6 })
    const belly = new THREE.MeshStandardMaterial({ color: '#d8f0a0', flatShading: true })
    const eyeM = new THREE.MeshBasicMaterial({ color: '#fff8a0' })
    const pupil = new THREE.MeshBasicMaterial({ color: '#101010' })
    const body = new THREE.Mesh(new THREE.SphereGeometry(30, 8, 7), skin)
    body.scale.set(1.2, 0.8, 1)
    const bel = new THREE.Mesh(new THREE.SphereGeometry(24, 7, 6), belly)
    bel.position.set(8, -8, 0)
    bel.scale.set(1, 0.7, 0.9)
    frog.add(body, bel)
    for (const sd of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(10, 6, 5), eyeM)
      eye.position.set(20, 22, sd * 16)
      const pu = new THREE.Mesh(new THREE.SphereGeometry(4.5, 5, 4), pupil)
      pu.position.set(27, 23, sd * 16)
      const leg = new THREE.Mesh(new THREE.ConeGeometry(12, 50, 5), skin)
      leg.position.set(-14, -8, sd * 28)
      leg.rotation.z = PI / 2 + 0.4
      const arm = new THREE.Mesh(new THREE.ConeGeometry(6, 30, 4), skin)
      arm.position.set(22, -14, sd * 20)
      arm.rotation.z = -PI / 2
      frog.add(eye, pu, leg, arm)
    }
    anim(v, frog, dur, (k, _dt, t) => {
      if (!u || u.dead || (u.hasBuff && !u.hasBuff('lion_hex'))) return false
      const q = unitP(posOf, u, p0)
      const hop = Math.abs(Math.sin(t * 3.2))
      frog.position.set(q.x, 150 + hop * 22, q.z)
      frog.rotation.y = -(u.facing ?? 0) + Math.sin(t * 1.5) * 0.3
      frog.rotation.z = Math.sin(t * 3.2) * 0.1
      const s = easeOutBack(clamp(t / 0.35))
      frog.scale.setScalar(Math.max(0.01, s) * (k > 0.95 ? 1 - (k - 0.95) / 0.05 : 1))
    })
    v.emit({ pos: p0.clone().setY(150), kind: 'ember', color: '#a8ff70', color2: '#2a8a10', rate: 14, dur, shape: 'sphere', radius: 36, speed: [4, 20], size: [10, 18], life: [0.6, 1.1], force: [0, 40, 0], max: 40, follow: () => (u && u.hasBuff && !u.hasBuff('lion_hex') ? null : unitP(posOf, u, p0).clone().setY(150)) })
  },

  // Mana Drain: pulsating beam of blue mana streaming from the victim to Lion
  lion_drain: (v, e, posOf) => {
    const u = e.unit as any
    const t = e.unit2 as any
    const dur = e.dur ?? 5
    const from = () => unitP(posOf, t, P(e.x2 ?? e.x, e.y2 ?? e.y, 90)).clone().setY(90)
    const to = () => unitP(posOf, u, P(e.x, e.y, 90)).clone().setY(100)
    v.beam(from, to, dur, '#5a7aff', 6, 0)
    v.emit({ pos: from(), color: '#a8c0ff', color2: '#2a4ad8', rate: 40, dur, shape: 'sphere', radius: 40, speed: [10, 40], size: [14, 28], life: [0.4, 0.8], max: 60, follow: () => (u?.channel ? from() : null) })
    v.ring(P(from().x, from().z), 10, 130, 0.5, '#5a7aff', 0.12)
    sigil(v, texCircle(6, 2), '#5a7aff', P(from().x, from().z), 90, 1.6, { spin: -2, peak: 0.7 })
  },

  lion_drain_pulse: (v, e, posOf) => {
    const u = e.unit as any
    const t = e.unit2 as any
    const a = () => unitP(posOf, t, P(e.x, e.y, 90)).clone().setY(90)
    const b = () => unitP(posOf, u, P(e.x, e.y, 90)).clone().setY(100)
    flow(v, a, b, '#9ab4ff', 6, 0.5, 26, 50)
    v.emit({ pos: a(), kind: 'ember', color: '#cfe0ff', color2: '#4a6aff', burst: 6, shape: 'sphere', radius: 24, speed: [10, 50], size: [10, 18], life: [0.4, 0.8], force: [0, 40, 0], max: 8 })
  },

  // Finger of Death: violet bolt gathers in his finger, then smites from above
  lion_finger: (v, e, posOf) => {
    const u = e.unit as any
    const t = e.unit2 as any
    const a = unitP(posOf, u, P(e.x, e.y, 90)).clone().setY(100)
    const b = unitP(posOf, t, P(e.x2!, e.y2!, 70)).clone().setY(70)
    flash(v, a.clone(), 260, '#d060ff', 0.3, 0.9)
    v.emit({ pos: a.clone(), kind: 'spark', color: '#f0c0ff', color2: '#9a20e0', burst: 40, shape: 'sphere', radius: 70, speed: [-160, -60], size: [12, 24], life: [0.2, 0.3], max: 50 })
    v.ring(P(a.x, a.z), 120, 20, 0.28, '#d060ff', 0.1)
    v.beam(() => a, () => (t ? unitP(posOf, t, b).clone().setY(70) : b), 0.3, '#c040ff', 18, 36)
    later(v, 0.22, () => v.beam(() => a, () => b, 0.15, '#ffffff', 6, 12))
  },

  lion_finger_hit: (v, e) => {
    const p = P(e.x, e.y)
    flash(v, p.clone().setY(90), 520, '#e090ff', 0.3, 0.95)
    v.column(p, 60, 800, 0.6, '#c040ff')
    v.column(p, 28, 900, 0.4, '#ffffff')
    v.ring(p, 20, 330, 0.55, '#c040ff', 0.12)
    later(v, 0.1, () => v.ring(p, 10, 220, 0.5, '#f0c0ff', 0.08))
    v.emit({ pos: p.clone().setY(40), kind: 'spark', color: '#ffffff', color2: '#9a20e0', burst: 60, shape: 'sphere', radius: 20, speed: [100, 420], size: [14, 30], life: [0.4, 1], force: [0, 40, 0], max: 80 })
    v.emit({ pos: p.clone().setY(30), kind: 'smoke', add: false, color: '#5a1a8a', color2: '#1a0830', alpha: 0.6, burst: 16, shape: 'sphere', radius: 30, speed: [30, 120], size: [60, 110], life: [0.7, 1.3], sizeEnd: 1.6, max: 20 })
    // rising skull
    const sk = new THREE.Group()
    const m = new THREE.MeshBasicMaterial({ color: '#f0d8ff', transparent: true, opacity: 0.9 })
    const dark = new THREE.MeshBasicMaterial({ color: '#2a0840' })
    const cr = new THREE.Mesh(new THREE.SphereGeometry(34, 10, 8), m)
    const jw = new THREE.Mesh(new THREE.BoxGeometry(34, 16, 36), m)
    jw.position.set(10, -34, 0)
    sk.add(cr, jw)
    for (const sd of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(9, 6, 5), dark)
      eye.position.set(22, 4, sd * 14)
      sk.add(eye)
    }
    sk.position.set(p.x, 120, p.z)
    anim(v, sk, 1.1, (k) => {
      sk.position.y = 120 + 170 * easeOut(k)
      sk.rotation.y = k * 2
      const s = 0.5 + 0.9 * easeOut(clamp(k * 3))
      sk.scale.setScalar(s)
      m.opacity = 0.9 * (1 - k * k)
    })
    disc(v, '#7a20b0', p, 260, 1.6, 0.5)
  },

  /* ------------------------------------------------------------ ZEUS */

  zeus_arc: (v, e, posOf) => {
    const t = e.unit2 as any
    const a = e.unit ? unitP(posOf, e.unit, P(e.x, e.y, 90)).clone().setY(e.first ? 110 : 80) : P(e.x, e.y, 80)
    const b = t ? unitP(posOf, t, P(e.x2!, e.y2!, 70)).clone().setY(75) : P(e.x2!, e.y2!, 75)
    v.beam(() => a, () => b, 0.3, '#8ac8ff', 14, 55)
    v.beam(() => a, () => b, 0.22, '#ffffff', 5, 35)
    flash(v, b.clone(), 170, '#cfe8ff', 0.15, 0.85)
    v.emit({ pos: b.clone(), kind: 'spark', color: '#ffffff', color2: '#4a90ff', burst: 14, shape: 'sphere', radius: 10, speed: [60, 240], size: [10, 20], life: [0.2, 0.5], max: 20 })
    v.ring(P(b.x, b.z), 10, 90, 0.3, '#8ac8ff', 0.16)
  },

  zeus_bolt: (v, e) => {
    const p = P(e.x, e.y)
    const r = e.r ?? 275
    flash(v, P(e.x, e.y, 1500), 900, '#ffffff', 0.18, 0.5)
    skyBolt(v, e.x, e.y, '#d0e4ff', 30, 0.45)
    later(v, 0.04, () => skyBolt(v, e.x, e.y, '#8ac8ff', 16, 0.3))
    flash(v, p.clone().setY(60), 520, '#ffffff', 0.25, 1)
    v.column(p, 36, 1200, 0.3, '#e8f4ff')
    v.ring(p, 10, r, 0.5, '#8ac8ff', 0.1)
    v.ring(p, 10, r * 0.6, 0.35, '#ffffff', 0.12)
    disc(v, '#6aa8ff', p, r * 0.8, 1.2, 0.5)
    v.emit({ pos: p.clone().setY(30), kind: 'spark', color: '#ffffff', color2: '#4a90ff', burst: e.hit ? 60 : 32, shape: 'sphere', radius: 24, speed: [100, 420], size: [12, 28], life: [0.3, 0.9], force: [0, -100, 0], max: 70 })
    for (let i = 0; i < 4; i++) {
      const a = rnd(0, PI * 2)
      later(v, i * 0.05, () => bolt(v, p.clone().setY(20), p.clone().add(P(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, 10)), 0.25, '#bfdcff', 6, 30))
    }
    dust(v, p, 90, '#9aa8c0', 8)
  },

  // Static Field: a crackling dome of charge radiates out when he casts
  zeus_static: (v, e, posOf) => {
    const u = e.unit as any
    const q = unitP(posOf, u, P(e.x, e.y, 70))
    const g = P(q.x, q.z)
    flash(v, q.clone().setY(80), 280, '#bfe0ff', 0.2, 0.8)
    v.ring(g, 20, (e.r ?? 1200) * 0.5, 0.7, '#8ac8ff', 0.04)
    later(v, 0.05, () => v.ring(g, 10, (e.r ?? 1200) * 0.8, 0.6, '#d8ecff', 0.03))
    v.emit({ pos: q.clone().setY(60), kind: 'spark', color: '#ffffff', color2: '#4a90ff', burst: 40, shape: 'sphere', radius: 30, speed: [200, 600], size: [10, 22], life: [0.2, 0.5], max: 50 })
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + rnd(0, 1)
      bolt(v, q.clone().setY(70), q.clone().add(P(Math.cos(a) * 160, Math.sin(a) * 160, rnd(-40, 20))).setY(rnd(30, 90)), 0.25, '#bfdcff', 6, 30)
    }
  },

  zeus_static_zap: (v, e) => {
    const a = P(e.x, e.y, 80)
    const b = P(e.x2!, e.y2!, 70)
    bolt(v, a, b, 0.22, '#9ad0ff', 6, 40)
    flash(v, b.clone(), 110, '#cfe8ff', 0.12, 0.8)
  },

  // Thundergod's Wrath: the sky goes white, sigil blazes under Zeus
  zeus_wrath_cast: (v, e, posOf) => {
    const u = e.unit as any
    const q = unitP(posOf, u, P(e.x, e.y, 70))
    const g = P(q.x, q.z)
    flash(v, q.clone().setY(110), 700, '#ffffff', 0.5, 0.95)
    v.ring(g, 30, e.r ?? 2400, 0.9, '#8ac8ff', 0.02)
    later(v, 0.1, () => v.ring(g, 20, 1200, 0.7, '#ffffff', 0.04))
    sigil(v, texCircle(8, 3), '#ffe86a', g, 300, 1.6, { spin: 1.6, peak: 0.9 })
    v.column(g, 110, 1400, 0.7, '#ffe86a')
    v.column(g, 50, 1500, 0.5, '#ffffff')
    v.emit({ pos: q.clone().setY(70), kind: 'spark', color: '#ffffff', color2: '#4a90ff', burst: 80, shape: 'sphere', radius: 40, speed: [160, 560], size: [12, 28], life: [0.4, 1], max: 100 })
    skyBolt(v, g.x, g.z, '#fff6a0', 36, 0.5)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2
      bolt(v, q.clone().setY(80), q.clone().add(P(Math.cos(a) * 260, Math.sin(a) * 260, 0)).setY(20), 0.3, '#bfdcff', 8, 40)
    }
  },

  zeus_wrath_hit: (v, e) => {
    const p = P(e.x, e.y)
    flash(v, P(e.x, e.y, 1500), 1100, '#ffffff', 0.2, 0.5)
    skyBolt(v, e.x, e.y, '#fff6a0', 44, 0.55)
    later(v, 0.05, () => skyBolt(v, e.x, e.y, '#8ac8ff', 22, 0.4))
    flash(v, p.clone().setY(60), 700, '#ffffff', 0.35, 1)
    v.column(p, 60, 1400, 0.45, '#ffffff')
    v.column(p, 110, 1000, 0.6, '#ffe86a')
    v.ring(p, 20, 380, 0.6, '#ffe86a', 0.1)
    later(v, 0.08, () => v.ring(p, 10, 260, 0.5, '#ffffff', 0.1))
    v.spikes(p, 200, 10, 200, 0.6, '#cfe8ff')
    v.emit({ pos: p.clone().setY(40), kind: 'spark', color: '#ffffff', color2: '#4a90ff', burst: 90, shape: 'sphere', radius: 26, speed: [140, 560], size: [14, 32], life: [0.4, 1.1], force: [0, -120, 0], max: 110 })
    dust(v, p, 130, '#8a94a8', 14)
    disc(v, '#ffe86a', p, 300, 1.8, 0.5)
  },

  /* ---- Teleportation Scroll ---- */
  tp_channel: (v, e, posOf) => {
    const u = e.unit as any
    const dur = e.dur ?? 3
    const live = () => !!u?.extra?.tpUntil
    const at = () => unitP(posOf, u, P(e.x, e.y)).clone().setY(0)
    sigil(v, texCircle(6, 2), '#6fd6ff', P(e.x, e.y), 150, dur, { spin: 2.2, peak: 0.8 })
    sigil(v, texCircle(4, 1), '#e8fbff', P(e.x, e.y), 95, dur, { spin: -3, peak: 0.6 })
    v.emit({ pos: at(), kind: 'spark', color: '#e8fbff', color2: '#3a9aff', rate: 46, dur, shape: 'donut', radius: 130, speed: [20, 80], size: [10, 20], life: [0.6, 1.1], force: [0, 260, 0], max: 120, follow: () => (live() ? at() : null) })
    v.emit({ pos: at().setY(60), kind: 'glow', color: '#6fd6ff', color2: '#1a4ab8', rate: 10, dur, shape: 'sphere', radius: 50, speed: [0, 20], size: [90, 150], life: [0.8, 1.2], alpha: 0.5, max: 20, follow: () => (live() ? at().setY(60) : null) })
    for (let i = 0; i < 3; i++) setTimeout(() => live() && v.ring(P(e.x, e.y), 240, 40, 0.9, '#9ae6ff', 0.1), i * 950)
  },

  tp_dest: (v, e, posOf) => {
    const u = e.unit as any
    const dur = e.dur ?? 3
    const live = () => !!u?.extra?.tpUntil
    const p = P(e.x, e.y)
    sigil(v, texCircle(6, 2), '#6fd6ff', p, 210, dur, { spin: -1.6, peak: 0.7 })
    v.emit({ pos: p.clone(), kind: 'spark', color: '#ffffff', color2: '#4aa8ff', rate: 38, dur, shape: 'donut', radius: 200, speed: [10, 50], size: [10, 20], life: [0.8, 1.4], force: [0, 330, 0], max: 130, follow: () => (live() ? p.clone() : null) })
    v.column(p, 60, 800, dur, '#6fd6ff')
    for (let i = 0; i < 3; i++) setTimeout(() => live() && v.ring(p, 40, 300, 0.9, '#9ae6ff', 0.1), i * 950)
  },

  tp_depart: (v, e) => {
    const p = P(e.x, e.y)
    v.column(p, 70, 900, 0.7, '#9ae6ff')
    v.ring(p, 30, 280, 0.5, '#ffffff', 0.14)
    v.emit({ pos: p.clone().setY(60), kind: 'spark', color: '#ffffff', color2: '#4aa8ff', burst: 70, shape: 'sphere', radius: 40, speed: [100, 420], size: [12, 26], life: [0.4, 0.9], force: [0, 200, 0], max: 80 })
  },

  tp_arrive: (v, e) => {
    const p = P(e.x, e.y)
    v.column(p, 80, 1000, 0.9, '#6fd6ff')
    v.ring(p, 20, 360, 0.7, '#ffffff', 0.16)
    v.ring(p, 20, 240, 0.9, '#6fd6ff', 0.1)
    v.emit({ pos: p.clone().setY(40), kind: 'spark', color: '#ffffff', color2: '#4aa8ff', burst: 90, shape: 'donut', radius: 60, speed: [120, 380], size: [12, 26], life: [0.5, 1.1], force: [0, 160, 0], max: 100 })
    v.emit({ pos: p.clone().setY(90), kind: 'glow', color: '#e8fbff', color2: '#4aa8ff', burst: 3, shape: 'point', speed: [0, 0], size: [320, 360], life: [0.3, 0.4], alpha: 0.8, max: 4 })
  },

  tp_cancel: (v, e) => {
    const p = P(e.x, e.y)
    v.ring(p, 120, 30, 0.35, '#ff9a8a', 0.1)
    v.emit({ pos: p.clone().setY(40), kind: 'spark', color: '#ffffff', color2: '#ff6a5a', burst: 24, shape: 'sphere', radius: 30, speed: [60, 200], size: [8, 16], life: [0.3, 0.6], max: 30 })
  },
}
