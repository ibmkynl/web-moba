import * as THREE from 'three'
import type { CustomVfx } from './vfx'
import { ADD, P, PI, anim, unitP } from './vfxkit'

/** Hero-specific visual effects (g5: Weaver). Key = effect name used with `w.vfx(name, opts)`. */

const bm = (color: string, opacity = 1, add = true) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: add ? ADD : THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide })

/** A small beetle: dark glossy shell, glowing green back stripe and two buzzing wings. */
function beetleMesh(scale = 1) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: '#24343a', metalness: 0.5, roughness: 0.35, emissive: new THREE.Color('#1a5a40'), emissiveIntensity: 0.6 }))
  body.scale.set(11 * scale, 6 * scale, 8 * scale)
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), bm('#8affb0', 0.9))
  stripe.scale.set(8 * scale, 2 * scale, 1.5 * scale)
  stripe.position.y = 5 * scale
  const wings: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    const wg = new THREE.Mesh(new THREE.CircleGeometry(1, 8), bm('#c8f8d8', 0.5))
    wg.scale.set(10 * scale, 6 * scale, 1)
    wg.position.set(-3 * scale, 6 * scale, s * 7 * scale)
    wg.userData.s = s
    wings.push(wg)
  }
  g.add(body, stripe, ...wings)
  return { g, wings }
}

export const VFX_G5: Record<string, CustomVfx> = {
  /* ================================================================ WEAVER */

  /** The Swarm leaving Weaver: a green buzz burst and a cone of motes along the flight. e: x,y,angle */
  weaver_swarm_launch: (v, e) => {
    const p = P(e.x, e.y, 70)
    const a = e.angle ?? 0
    v.ring(P(e.x, e.y, 0), 20, 160, 0.45, '#8ad0a0')
    v.emit({ pos: p, color: '#c8ffd8', color2: '#3aa070', burst: 26, shape: 'sphere', radius: 20, speed: [60, 200], size: [14, 28], life: [0.3, 0.6], sizeEnd: 0.1 })
    v.emit({ pos: p.clone().add(new THREE.Vector3(Math.cos(a) * 60, 0, Math.sin(a) * 60)), kind: 'spark', color: '#eaffd0', color2: '#6ad090', burst: 12, shape: 'sphere', radius: 30, speed: [80, 220], size: [12, 22], life: [0.25, 0.5] })
  },

  /** A beetle latched onto its host, scuttling around it and buzzing until the host dies or the swarm ends. e: unit, dur */
  weaver_beetle: (v, e, posOf) => {
    const u = e.unit as { x: number; y: number; dead?: boolean } | undefined
    if (!u) return
    const { g, wings } = beetleMesh(1)
    const ph = Math.random() * PI * 2
    anim(v, g, e.dur ?? 9, (_k, _dt, t) => {
      if (u.dead) return false
      const c = unitP(posOf, u, P(u.x, u.y, 70))
      const a = ph + t * 1.6
      g.position.set(c.x + Math.cos(a) * 26, c.y + 10 + Math.sin(t * 5) * 6, c.z + Math.sin(a) * 26)
      g.rotation.set(0, -a - PI / 2, Math.sin(t * 9) * 0.2)
      for (const w of wings) w.rotation.set(-PI / 2 + w.userData.s * (0.4 + Math.sin(t * 50) * 0.5), 0, 0)
    })
  },

  /** One beetle bite: a small green nip and an armor-crack spark. e: x,y */
  weaver_beetle_bite: (v, e) => {
    const p = P(e.x, e.y, 80)
    v.emit({ pos: p, kind: 'spark', color: '#eaffd0', color2: '#4ac080', burst: 6, shape: 'sphere', radius: 12, speed: [60, 160], size: [10, 18], life: [0.15, 0.35] })
    v.emit({ pos: p, color: '#8ad0a0', alpha: 0.5, burst: 1, shape: 'point', speed: [0, 0], size: [50, 50], life: [0.15, 0.15], sizeEnd: 1.6 })
  },

  /** Shukuchi start: Weaver ripples out of sight (no trail afterwards, so an invisible Weaver is not given away). e: x,y */
  weaver_shukuchi: (v, e) => {
    const p = P(e.x, e.y, 60)
    v.ring(P(e.x, e.y, 0), 20, 170, 0.5, '#a8d8ff')
    v.emit({ pos: p, color: '#e0f4ff', color2: '#6ab0ff', burst: 30, shape: 'sphere', radius: 26, speed: [40, 180], size: [16, 32], life: [0.3, 0.7], sizeEnd: 0.1, force: [0, 40, 0] })
    v.emit({ pos: p, alpha: 0.45, color: '#8ac8ff', burst: 1, shape: 'point', speed: [0, 0], size: [200, 200], life: [0.25, 0.25], sizeEnd: 1.6 })
    const shim = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 130, 14, 1, true), bm('#a8d8ff', 0.4))
    shim.position.copy(P(e.x, e.y, 65))
    anim(v, shim, 0.45, (k) => {
      ;(shim.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - k)
      shim.scale.set(1 + k * 0.8, 1 - k * 0.6, 1 + k * 0.8)
    })
  },

  /** Shukuchi ending early (attack or cast): Weaver snaps back into view. e: x,y */
  weaver_shukuchi_end: (v, e) => {
    v.emit({ pos: P(e.x, e.y, 60), color: '#e0f4ff', color2: '#6ab0ff', burst: 16, shape: 'sphere', radius: 20, speed: [30, 120], size: [14, 26], life: [0.25, 0.5], sizeEnd: 0.1 })
  },

  /** Shukuchi passing through an enemy: a cold slash. e: x,y */
  weaver_shukuchi_hit: (v, e) => {
    const p = P(e.x, e.y, 70)
    v.slash(P(e.x, e.y, 40), Math.random() * PI, 80, 0.25, '#bfe4ff')
    v.emit({ pos: p, kind: 'spark', color: '#ffffff', color2: '#6ab0ff', burst: 10, shape: 'sphere', radius: 14, speed: [80, 220], size: [12, 22], life: [0.2, 0.4] })
  },

  /** Geminate Attack: a twin-thread flash on Weaver as the second strike leaves. e: unit,x,y */
  weaver_geminate: (v, e, posOf) => {
    const p = unitP(posOf, e.unit, P(e.x, e.y, 80))
    v.emit({ pos: p, color: '#f0ffd0', color2: '#8ad0a0', burst: 14, shape: 'sphere', radius: 10, speed: [60, 180], size: [12, 24], life: [0.2, 0.4], sizeEnd: 0.1 })
    v.ring(P(e.x, e.y, 0), 10, 90, 0.3, '#d0f0a0')
  },

  /** Time Lapse: a ghost fades where Weaver stood, a spiral of time-motes runs back along his path, and he reforms. e: x,y,x2,y2,angle */
  weaver_time_lapse: (v, e) => {
    const a = P(e.x, e.y, 0)
    const b = P(e.x2 ?? e.x, e.y2 ?? e.y, 0)
    // fading silhouette at the old spot
    const ghost = new THREE.Group()
    const gm = bm('#7ab0ff', 0.5)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(14, 22, 70, 8), gm)
    body.position.y = 50
    const head = new THREE.Mesh(new THREE.SphereGeometry(14, 8, 6), gm)
    head.position.y = 98
    ghost.add(body, head)
    ghost.position.copy(a)
    anim(v, ghost, 0.8, (k) => {
      gm.opacity = 0.5 * (1 - k)
      ghost.scale.set(1 + k * 0.3, 1 + k * 0.2, 1 + k * 0.3)
      ghost.rotation.y = -k * PI * 2
    })
    // clock rings at both ends
    for (const [p, c] of [[a, '#7ab0ff'], [b, '#c8e0ff']] as const) {
      v.ring(p, 20, 220, 0.6, c)
      v.emit({ pos: p.clone().setY(60), color: '#e8f0ff', color2: '#4a7aff', burst: 34, shape: 'sphere', radius: 24, speed: [60, 220], size: [16, 34], life: [0.35, 0.8], sizeEnd: 0.1 })
      v.emit({ pos: p.clone().setY(60), kind: 'spark', color: '#ffffff', color2: '#7ab0ff', burst: 12, shape: 'sphere', radius: 16, speed: [100, 260], size: [12, 24], life: [0.25, 0.5] })
    }
    // spiral of motes running from the old spot back to the restored one
    const n = 18
    for (let i = 0; i <= n; i++) {
      const f = i / n
      const q = new THREE.Vector3().lerpVectors(a, b, f)
      const sp = f * PI * 6
      q.x += Math.cos(sp) * 30
      q.z += Math.sin(sp) * 30
      q.y = 40 + Math.sin(f * PI) * 80
      v.emit({ pos: q, kind: 'ember', color: '#c8e0ff', color2: '#4a6aff', burst: 3, shape: 'sphere', radius: 8, speed: [4, 30], size: [12, 22], life: [0.4, 0.8] })
    }
    v.beam(() => a.clone().setY(60), () => b.clone().setY(60), 0.35, '#7ab0ff', 10)
  },
}
