import { ROCKS, TREES } from '../sim/obstacles'
import * as THREE from 'three'
import { MAP, Pt, TEAM_COLOR, Team, isNeutral } from '../sim/constants'
import type { Unit } from '../sim/entities'
import { RUNE_INFO, reaches, type World } from '../sim/world'
import { Minimap } from './minimap'
import { optimizeModel } from './modelopt'
import { buildTerrain } from './terrain3d'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { Vfx } from './vfx'
import { buildCourier } from './couriers3d'
import { buildSummon } from './summons3d'
import { buildNeutral } from './neutrals3d'
import { Model, buildAncient, buildCreep, buildFountain, buildHero, buildTower } from './models'

export interface Overlay {
  /** circle drawn around the player (ability range) */
  rangeCircle?: { r: number; color: string } | null
  /** target hover highlight */
  hover?: Unit | null
  /** ground aoe preview at the cursor */
  aoe?: { x: number; y: number; r: number; color: string } | null
  attackMove?: boolean
  cursor?: Pt
  line?: { from: Pt; to: Pt; width: number; color: string } | null
}

const PITCH = (58 * Math.PI) / 180
export type Quality = 'low' | 'medium' | 'high'
export const QUALITIES: Quality[] = ['low', 'medium', 'high']
/** dpr: pixel-ratio cap; samples: MSAA on the post-processing target; bloom: bloom resolution scale (0 = off) */
const QUALITY_CFG: Record<Quality, { dpr: number; samples: number; bloom: number; shadowMap: number }> = {
  low: { dpr: 1, samples: 0, bloom: 0, shadowMap: 1024 },
  medium: { dpr: 1.5, samples: 2, bloom: 0.5, shadowMap: 2048 },
  high: { dpr: 2, samples: 4, bloom: 1, shadowMap: 2048 },
}
const loadQuality = (): Quality => {
  try {
    const q = localStorage.getItem('ac-quality') as Quality | null
    if (q && QUALITIES.includes(q)) return q
  } catch {
    /* storage unavailable */
  }
  return 'medium'
}

const SHADOW_KINDS = new Set(['hero', 'tower', 'ancient', 'courier', 'fountain'])

/** Frees the GPU resources under `root`. Skipped: shared projectile meshes, and cached merged geometry (sharedGeo). */
function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.shared) return
    if (!m.userData.sharedGeo) m.geometry.dispose()
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mt of mats) mt.dispose()
  })
}

/** Projectile geometries are identical for every shot of a style, so they are built once. */
const PROJ_GEO = {
  link: new THREE.TorusGeometry(9, 3, 6, 10),
  claw: new THREE.ConeGeometry(9, 46, 6),
  clawHub: new THREE.SphereGeometry(16, 10, 8),
  shaft: new THREE.CylinderGeometry(3, 3, 110, 6),
  tip: new THREE.ConeGeometry(9, 28, 6),
  arrowGlow: new THREE.CylinderGeometry(10, 10, 120, 8),
  bullet: new THREE.CylinderGeometry(3, 3, 70, 6),
  bulletGlow: new THREE.CylinderGeometry(7, 7, 80, 8),
  core: new THREE.SphereGeometry(0.55, 10, 8),
  orb: new THREE.SphereGeometry(1, 12, 10),
}
const projMats = new Map<string, THREE.Material>()
/** Shared projectile material, keyed by kind and colour. */
function projMat(key: string, make: () => THREE.Material) {
  let m = projMats.get(key)
  if (!m) projMats.set(key, (m = make()))
  return m
}

interface Entry {
  model: Model
  kind: string
  swing: number
  lastAtk: number
  fxT: number
  seen: Set<string>
  casting: any
  shell: THREE.Mesh | null
  chT: number
  /** opacity multiplier currently applied to the model's materials (1 = untouched) */
  fade: number
}

interface ProjMesh {
  g: THREE.Group
  links?: THREE.Mesh[]
}

export class Renderer3D {
  cam: Pt
  scale = 0.5
  W = 0
  H = 0
  myTeam: Team
  gl: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  ov: HTMLCanvasElement
  octx: CanvasRenderingContext2D
  fog: HTMLCanvasElement
  fctx: CanvasRenderingContext2D
  minimap: Minimap
  dpr = 1
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  entries = new Map<number, Entry>()
  wardMeshes = new Map<number, THREE.Group>()
  runeMeshes = new Map<number, THREE.Group>()
  vfx!: Vfx
  composer!: EffectComposer
  quality = loadQuality()
  projMeshes = new Map<any, ProjMesh>()
  private lastFrame = performance.now()
  private origEm = new WeakMap<THREE.Material, { c: THREE.Color; i: number }>()
  ray = new THREE.Raycaster()
  plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  // local ground->screen affine (set each frame)
  A = { ox: 0, oy: 0, ax: 1, ay: 0, bx: 0, by: 1 }

  constructor(public canvas: HTMLCanvasElement, public w: World) {
    this.myTeam = w.player.team
    this.cam = { x: w.player.x, y: w.player.y }
    // antialiasing happens on the post-processing target, so the canvas itself needs none
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false })
    this.gl.shadowMap.enabled = true
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1.15
    this.camera = new THREE.PerspectiveCamera(38, 1, 60, 45000)
    this.scene.background = new THREE.Color('#0a0e0a')
    this.scene.fog = new THREE.Fog('#0a0e0a', 16000, 42000)

    // overlay canvases
    this.ov = document.createElement('canvas')
    this.ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1'
    canvas.after(this.ov)
    this.octx = this.ov.getContext('2d')!
    this.fog = document.createElement('canvas')
    this.fctx = this.fog.getContext('2d')!

    this.minimap = new Minimap(w)

    this.hemi = new THREE.HemisphereLight('#c8d8ff', '#5a5040', 1.15)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#fff0d0', 2.1)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.setScalar(QUALITY_CFG[this.quality].shadowMap)
    const sc = this.sun.shadow.camera
    sc.left = -1700
    sc.right = 1700
    sc.top = 1700
    sc.bottom = -1700
    sc.near = 100
    sc.far = 5000
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 4
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.minimap.groundImg = buildTerrain(this.scene)
    this.vfx = new Vfx(this.scene)
    this.setupComposer()
    this.resize()
  }

  /* ------------------------------------------------------------ setup */

  private setupComposer() {
    const cfg = QUALITY_CFG[this.quality]
    const rt = new THREE.WebGLRenderTarget(this.W || 800, this.H || 600, { type: THREE.HalfFloatType, samples: cfg.samples })
    this.composer = new EffectComposer(this.gl, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    if (cfg.bloom > 0) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(this.W || 800, this.H || 600), 0.4, 0.5, 0.9)
      // bloom is a blur, so a lower internal resolution is hard to see and much cheaper
      const setSize = bloom.setSize.bind(bloom)
      bloom.setSize = (w: number, h: number) => setSize(Math.max(1, Math.round(w * cfg.bloom)), Math.max(1, Math.round(h * cfg.bloom)))
      this.composer.addPass(bloom)
    }
    this.composer.addPass(new OutputPass())
  }

  /** Switches the graphics preset (pixel ratio, MSAA, bloom, shadow map) and remembers it. */
  setQuality(q: Quality) {
    if (q === this.quality) return
    this.quality = q
    try {
      localStorage.setItem('ac-quality', q)
    } catch {
      /* storage unavailable */
    }
    for (const pass of this.composer.passes) pass.dispose()
    this.composer.dispose()
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
    this.sun.shadow.mapSize.setScalar(QUALITY_CFG[q].shadowMap)
    this.setupComposer()
    this.resize()
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, QUALITY_CFG[this.quality].dpr)
    this.W = window.innerWidth
    this.H = window.innerHeight
    this.gl.setPixelRatio(this.dpr)
    this.gl.setSize(this.W, this.H, false)
    this.canvas.style.width = this.W + 'px'
    this.canvas.style.height = this.H + 'px'
    this.ov.width = this.W * this.dpr
    this.ov.height = this.H * this.dpr
    this.ov.style.width = this.W + 'px'
    this.ov.style.height = this.H + 'px'
    this.fog.width = Math.ceil(this.W / 5)
    this.fog.height = Math.ceil(this.H / 5)
    this.camera.aspect = this.W / this.H
    this.camera.updateProjectionMatrix()
    if (this.composer) {
      this.composer.setPixelRatio(this.dpr)
      this.composer.setSize(this.W, this.H)
    }
  }

  clampCam() {
    this.cam.x = Math.max(0, Math.min(MAP, this.cam.x))
    this.cam.y = Math.max(0, Math.min(MAP, this.cam.y))
  }

  /* ------------------------------------------------------- projection */

  private placeCamera() {
    const d = 1500 / this.scale
    this.camera.position.set(this.cam.x, d * Math.sin(PITCH), this.cam.y + d * Math.cos(PITCH))
    this.camera.lookAt(this.cam.x, 0, this.cam.y)
    this.camera.updateMatrixWorld()
    this.camera.updateProjectionMatrix()
  }

  toWorld(sx: number, sy: number): Pt {
    this.placeCamera()
    this.ray.setFromCamera(new THREE.Vector2((sx / this.W) * 2 - 1, -(sy / this.H) * 2 + 1), this.camera)
    const p = new THREE.Vector3()
    if (!this.ray.ray.intersectPlane(this.plane, p)) return { x: this.cam.x, y: this.cam.y }
    return { x: p.x, y: p.z }
  }

  /** Sets the route polyline drawn on the minimap. */
  setRoute(r: Pt[] | null) {
    this.minimap.route = r
  }

  /**
   * Ground point under the cursor. Tall trees and rocks hide the ground behind them, so when the ray passes through
   * one we return its base instead of the (misleading) ground point behind it.
   */
  pickGround(sx: number, sy: number): Pt {
    const g = this.toWorld(sx, sy)
    const o = this.ray.ray.origin
    let best: Pt | null = null
    let bt = Infinity
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const onRay = new THREE.Vector3()
    const test = (x: number, y: number, R: number, H: number) => {
      a.set(x, 0, y)
      b.set(x, H, y)
      const d2 = this.ray.ray.distanceSqToSegment(a, b, onRay)
      if (d2 < R * R) {
        const t = onRay.distanceTo(o)
        if (t < bt) {
          bt = t
          best = { x, y }
        }
      }
    }
    for (const t of TREES) {
      if (Math.abs(t.x - g.x) > 380 || t.y < g.y - 60 || t.y > g.y + 520) continue
      test(t.x, t.y, t.r * 0.9, t.r * 2.6)
    }
    for (const r of ROCKS) {
      if (Math.abs(r.x - g.x) > 380 || r.y < g.y - 120 || r.y > g.y + 620) continue
      test(r.x, r.y, r.w * 0.85, r.h * 0.85)
    }
    return best ?? g
  }

  private scratch = new THREE.Vector3()
  private litNight: boolean | null = null
  /** cached screen vignette (rebuilt when the viewport changes) */
  private vignette: { key: string; g: CanvasGradient } | null = null
  /** soft-edged disc punched out of the fog layer for each vision source */
  private punchImg = (() => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 128
    const c = cv.getContext('2d')!
    const g = c.createRadialGradient(64, 64, 64 * 0.78, 64, 64, 64)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = g
    c.beginPath()
    c.arc(64, 64, 64, 0, Math.PI * 2)
    c.fill()
    return cv
  })()
  toScreen(wx: number, wy: number, h = 0): Pt {
    const v = this.scratch.set(wx, h, wy).project(this.camera)
    // points behind the camera (or past the far plane) project mirrored onto the screen: push them far off instead,
    // otherwise they could be clicked, hovered or get ghost health bars
    if (v.z > 1 || v.z < -1) return { x: -1e5, y: -1e5 }
    return { x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H }
  }

  /** Screen-space body of a unit: feet point, head point and a generous click radius (pixels). */
  unitScreen(u: Unit) {
    const e = this.entries.get(u.id)
    const sc = u.kind === 'hero' ? 1.55 : u.kind === 'creep' ? 1.35 : u.kind === 'summon' ? 1.2 : 1
    const H = (e ? e.model.height : 100) * sc
    const feet = this.toScreen(u.x, u.y, 0)
    const head = this.toScreen(u.x, u.y, H * 0.85)
    const side = this.toScreen(u.x + u.radius * 1.6, u.y, H * 0.4)
    const mid = this.toScreen(u.x, u.y, H * 0.4)
    const wide = Math.abs(side.x - mid.x)
    const min = u.kind === 'hero' ? 30 : u.isBuilding ? 44 : 24
    return { fx: feet.x, fy: feet.y, hx: head.x, hy: head.y, r: Math.max(min, wide * (u.isBuilding ? 1.2 : 1.1)) }
  }

  private updateAffine() {
    const o = this.toScreen(this.cam.x, this.cam.y)
    const a = this.toScreen(this.cam.x + 200, this.cam.y)
    const b = this.toScreen(this.cam.x, this.cam.y + 200)
    this.A = { ox: o.x, oy: o.y, ax: (a.x - o.x) / 200, ay: (a.y - o.y) / 200, bx: (b.x - o.x) / 200, by: (b.y - o.y) / 200 }
  }

  /** Apply transform so that world-ground coordinates can be drawn directly. */
  private groundT(c: CanvasRenderingContext2D) {
    const A = this.A
    const d = this.dpr
    c.setTransform(A.ax * d, A.ay * d, A.bx * d, A.by * d, (A.ox - A.ax * this.cam.x - A.bx * this.cam.y) * d, (A.oy - A.ay * this.cam.x - A.by * this.cam.y) * d)
  }
  private screenT(c: CanvasRenderingContext2D) {
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }


  /* -------------------------------------------------------- unit models */

  private makeModel(u: Unit): Model {
    const key = `${u.kind}|${u.kind === 'hero' ? u.h!.def.id : u.sub}|${u.team}|${u.radius}|${u.kind === 'summon' ? u.extra.color : ''}`
    const m = optimizeModel(this.buildModel(u), key)
    // only the big silhouettes cast shadows: creeps and summons would double the draw calls for little visual gain
    if (!SHADOW_KINDS.has(u.kind)) m.group.traverse((o) => (o.castShadow = false))
    return m
  }

  private buildModel(u: Unit): Model {
    switch (u.kind) {
      case 'hero':
        return buildHero(u.h!.def.id, u.h!.def.color, u.h!.def.color2, u.team, u.radius)
      case 'creep':
        return isNeutral(u.team) ? buildNeutral(u.sub, u.radius) : buildCreep(u.sub, u.team, u.radius)
      case 'courier':
        return buildCourier(u.team, u.radius)
      case 'summon':
        return buildSummon(u.sub, u.team, u.radius, u.extra.color)
      case 'tower':
        return buildTower(u.team, u.radius)
      case 'ancient':
        return buildAncient(u.team, u.radius)
      default:
        return buildFountain(u.team, u.radius)
    }
  }

  private syncUnits() {
    const w = this.w
    const t = w.time
    const seen = new Set<number>()
    for (const u of w.units) {
      if (u.dead && u.kind === 'creep' && t - u.deadAt > 1) continue
      seen.add(u.id)
      let e = this.entries.get(u.id)
      if (!e) {
        e = { model: this.makeModel(u), kind: u.kind, swing: 0, lastAtk: 0, fxT: 0, seen: new Set(), casting: null, shell: null, chT: 0, fade: 1 }
        this.scene.add(e.model.group)
        this.entries.set(u.id, e)
      }
      const m = e.model
      const g = m.group
      let show = w.isVisible(this.myTeam, u)
      let deathK = 0
      if (u.dead && u.kind === 'hero') {
        deathK = Math.min(1, (t - u.deadAt) / 0.9)
        if (deathK >= 1) show = false
      }
      g.visible = show
      if (!show) continue
      const s0 = u.kind === 'hero' ? 1.55 : u.kind === 'creep' ? 1.35 : u.kind === 'courier' ? 1.7 : u.kind === 'summon' ? 1.2 : 1
      let y = 0
      if (u.kind === 'hero' && u.hasBuff('tk') && u.extra.liftStart) {
        const k = (t - u.extra.liftStart) / Math.max(0.1, u.extra.liftEnd - u.extra.liftStart)
        y = Math.max(0, Math.min(1, Math.sin(Math.min(1, k) * Math.PI) * 1.4)) * 170
      }
      if (u.kind === 'courier') {
        // Hop rides on the ground (a little bob at speed) and the wheels spin with its speed
        const speed = Math.hypot(u.vx, u.vy)
        y = 6 + (speed > 1 ? Math.abs(Math.sin(t * 14 + u.id)) * 3 : 0)
        const wheels = g.userData.wheels as THREE.Object3D | undefined
        if (wheels) wheels.children.forEach((w) => (w.rotation.z -= speed * 0.0016))
        const wings = g.userData.wings as THREE.Object3D | undefined
        if (wings) {
          const fl = Math.sin(t * (u.extra.delivering ? 9 : 4)) * 0.08
          wings.children.forEach((w) => (w.rotation.x = (w.userData.side as number) * fl))
        }
      }
      g.position.set(u.x, y, u.y)
      if (!u.isBuilding) g.rotation.y = -u.facing + Math.PI / 2 * 0 // model faces +X
      const moving = Math.abs(u.vx) + Math.abs(u.vy) > 1
      if (m.body && !u.isBuilding) {
        m.body.position.y = moving ? Math.abs(Math.sin(t * 11 + u.id)) * 7 : 0
        m.body.rotation.z = moving ? -0.07 : 0
        if (u.isStunned()) m.body.rotation.x = Math.sin(t * 14) * 0.12
        else m.body.rotation.x = 0
      }
      // weapon swing
      if (m.weapon) {
        const aw = u.attackWind
        if (aw) {
          const k = Math.min(1, (t - aw.start) / Math.max(0.05, aw.end - aw.start))
          m.weapon.rotation.z = 1.0 - 1.9 * k
          e.lastAtk = t
        } else if (u.casting) {
          const k = Math.min(1, (t - u.casting.start) / Math.max(0.05, u.casting.end - u.casting.start))
          m.weapon.rotation.z = 0.2 + 0.9 * Math.sin(k * Math.PI)
        } else {
          const back = Math.min(1, (t - e.lastAtk) / 0.25)
          m.weapon.rotation.z = -0.9 * (1 - back) + 0.1 * back
        }
      }
      if (m.spin) {
        m.spin.rotation.y = t * 1.2
      }
      // buildings
      if (u.kind === 'tower' || u.kind === 'ancient') {
        if (m.alive) m.alive.visible = !u.dead
        if (m.rubble) m.rubble.visible = u.dead
        if (m.shield) m.shield.visible = !u.dead && u.locked
      }
      // death sink for creeps
      if (u.dead && u.kind === 'creep') {
        const k = Math.min(1, (t - u.deadAt) / 0.9)
        g.scale.set(s0, s0 * (1 - k * 0.9), s0)
        g.position.y = -k * 20
      } else g.scale.set(s0, s0, s0)
      if (deathK > 0) {
        g.rotation.z = deathK * 1.45
        g.position.y = -deathK * 24
      } else if (u.kind === 'hero') g.rotation.z = 0
      // damage flash
      const fl = Math.max(0, 1 - (t - u.hitAt) / 0.2)
      if (fl > 0 || e.swing === 2) {
        for (const mt of m.mats) {
          let o = this.origEm.get(mt)
          if (!o) {
            o = { c: mt.emissive.clone(), i: mt.emissiveIntensity }
            this.origEm.set(mt, o)
          }
          // parts that glow on purpose (runes, eyes, gems) keep their own glow
          if (o.c.getHex() !== 0 && o.i > 0.05) continue
          if (fl > 0) {
            mt.emissive.setRGB(1, 0.35, 0.3)
            mt.emissiveIntensity = Math.max(o.i, fl * 1.1)
          } else {
            mt.emissive.copy(o.c)
            mt.emissiveIntensity = o.i
          }
        }
        e.swing = fl > 0 ? 2 : 0
      }
      // living-model animation hook
      m.update?.(t, { moving, casting: !!u.casting, attacking: !!u.attackWind })
      this.unitFx(e, u, t, s0)
      // dying heroes fade out, invisible heroes are translucent; respawned / visible ones get their materials back
      const inv = u.kind === 'hero' && u.isInvisible(t)
      this.setFade(e, deathK > 0 ? 1 - deathK * 0.9 : inv ? 0.32 : 1)
    }
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) {
        this.scene.remove(e.model.group)
        disposeTree(e.model.group)
        this.entries.delete(id)
      }
    }
  }

  private origOp = new WeakMap<THREE.Material, { o: number; t: boolean }>()
  private setFade(e: Entry, k: number) {
    if (k === e.fade) return
    e.fade = k
    for (const mt of e.model.mats) {
      let o = this.origOp.get(mt)
      if (!o) {
        o = { o: mt.opacity, t: mt.transparent }
        this.origOp.set(mt, o)
      }
      mt.opacity = o.o * k
      mt.transparent = k < 1 || o.t
    }
  }

  private posOf = (u: { x: number; y: number; id?: number }) => {
    const e = u.id !== undefined ? this.entries.get(u.id) : undefined
    const h = e ? e.model.height * (e.kind === 'hero' ? 1.55 : 1.3) * 0.55 : 70
    return new THREE.Vector3(u.x, h, u.y)
  }

  /** Status auras, buff-gain effects, cast glow and channel beams for one unit. */
  private unitFx(e: Entry, u: Unit, t: number, s0: number) {
    const H = e.model.height * s0
    const heroish = u.kind === 'hero' || u.kind === 'summon'
    // cast glow
    if (u.casting && e.casting !== u.casting) {
      const col = u.casting.st.def.color
      this.vfx.spawn({ name: 'ring', x: u.x, y: u.y, r0: 12, r1: 110, dur: Math.max(0.3, u.casting.end - u.casting.start), color: col })
      this.vfx.spawn({ name: 'sparkle', x: u.x, y: u.y, z: H * 0.6, color: col, count: 10, r: 30 })
    } else if (!u.casting && e.casting && u.kind === 'hero') {
      this.vfx.spawn({ name: 'burst', x: u.x, y: u.y, z: H * 0.5, color: e.casting.st.def.color, count: 16, size: 90 })
    }
    e.casting = u.casting
    // channel / aim beams
    const tgt = u.channel?.target ?? (u.casting?.st.def.aimBeam ? u.casting.target : null)
    if (tgt && t - e.chT > 0.14) {
      e.chT = t
      const col = u.channel ? u.channel.st.def.color : '#ff4a3a'
      this.vfx.spawn({ name: u.channel ? 'bolt' : 'beam', x: u.x, y: u.y, x2: tgt.x, y2: tgt.y, unit: u, unit2: tgt, dur: 0.2, color: col, width: u.channel ? 9 : 4 }, this.posOf)
    }
    if (t - e.fxT < 0.22) return
    e.fxT = t
    const ids = new Set(u.buffs.map((b) => b.id))
    for (const id of e.seen) if (!ids.has(id)) e.seen.delete(id)
    let shellCol: string | null = null
    for (const b of u.buffs) {
      const col = b.color || (b.stun ? '#ffe36a' : b.slow ? '#8ad8ff' : b.silence ? '#c8a0ff' : b.root ? '#6aff6a' : b.dot ? '#ff8a4a' : '#ffffff')
      if (!e.seen.has(b.id)) {
        e.seen.add(b.id)
        if (b.stun || b.slow || b.silence || b.root || b.dot || b.taunt || b.label || b.haste) {
          this.vfx.spawn({ name: 'ring', x: u.x, y: u.y, r0: 10, r1: 100, dur: 0.5, color: col })
          this.vfx.spawn({ name: 'sparkle', x: u.x, y: u.y, z: H * 0.5, color: col, count: 12, r: 36 })
        }
        if (b.root) this.vfx.spawn({ name: 'spikes', x: u.x, y: u.y, r: 55, count: 9, size: 90, dur: Math.max(0.8, b.expires - t), color: col })
        if (b.stun) this.vfx.spawn({ name: 'flash', x: u.x, y: u.y, z: H, color: col, size: 120, dur: 0.25 })
      }
      if (b.invuln || b.immune || b.spellBlock || b.lift || b.ethereal) shellCol = b.color || (b.spellBlock ? '#bff0ff' : b.ethereal ? '#d8f0ff' : '#ffe9a8')
      if (!heroish) continue
      if (b.slow) this.vfx.spawn({ name: 'aura', kind: 'frost', unit: u, x: u.x, y: u.y, z: 10, dur: 0.3, color: '#bfe8ff' }, this.posOf)
      if (b.dot) this.vfx.spawn({ name: 'aura', kind: 'fire', unit: u, x: u.x, y: u.y, dur: 0.3, color: col, color2: '#ff4a20' }, this.posOf)
      if (b.silence) this.vfx.spawn({ name: 'aura', kind: 'wisp', unit: u, x: u.x, y: u.y, dur: 0.3, color: '#c8a0ff' }, this.posOf)
      if (b.haste && b.haste > 0.15) this.vfx.spawn({ name: 'aura', kind: 'streak', unit: u, x: u.x, y: u.y, dur: 0.3, color: col }, this.posOf)
      if (b.regenHp && b.regenHp > 4) this.vfx.spawn({ name: 'sparkle', x: u.x, y: u.y, z: H * 0.5, color: '#7aff9a', count: 4, r: 40 })
      if (b.dmgMul) this.vfx.spawn({ name: 'aura', kind: 'fire', unit: u, x: u.x, y: u.y, dur: 0.3, color: '#ff6a3a', color2: '#ffcf5a' }, this.posOf)
    }
    // protective shell
    if (shellCol) {
      if (!e.shell) {
        e.shell = new THREE.Mesh(
          new THREE.SphereGeometry(u.radius * 1.9, 18, 14),
          new THREE.MeshBasicMaterial({ color: shellCol, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
        )
        e.model.group.add(e.shell)
        e.shell.position.y = H * 0.45 / s0
      }
      ;(e.shell.material as THREE.MeshBasicMaterial).color.set(shellCol)
      e.shell.visible = true
    } else if (e.shell) e.shell.visible = false
  }

  /* ------------------------------------------------------------ projectiles */

  private makeProj(p: any): ProjMesh {
    const g = new THREE.Group()
    const col = p.color || (p.kind === 'linear' ? '#fff0a0' : '#ffffff')
    const glowMat = () => projMat('glow' + col, () => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
    const basic = (c: string) => projMat('basic' + c, () => new THREE.MeshBasicMaterial({ color: c }))
    const mesh = (geo: THREE.BufferGeometry, mt: THREE.Material) => {
      const m = new THREE.Mesh(geo, mt)
      m.userData.shared = true
      return m
    }
    let links: THREE.Mesh[] | undefined
    if (p.kind === 'linear' && p.draw === 'hook') {
      const stone = projMat('hookStone', () => new THREE.MeshStandardMaterial({ color: '#9a9aa8', metalness: 0.7, roughness: 0.4 }))
      links = []
      for (let i = 0; i < 26; i++) {
        const l = mesh(PROJ_GEO.link, stone)
        l.castShadow = true
        links.push(l)
        this.scene.add(l)
      }
      const head = new THREE.Group()
      const claw = projMat('hookClaw', () => new THREE.MeshStandardMaterial({ color: '#c9c9d4', metalness: 0.8, roughness: 0.3 }))
      for (let i = 0; i < 3; i++) {
        const c = mesh(PROJ_GEO.claw, claw)
        c.rotation.z = Math.PI / 2
        c.rotation.x = (i / 3) * Math.PI * 2
        c.position.set(18, Math.sin((i / 3) * Math.PI * 2) * 14, Math.cos((i / 3) * Math.PI * 2) * 14)
        head.add(c)
      }
      head.add(mesh(PROJ_GEO.clawHub, claw))
      g.add(head)
    } else if ((p.kind === 'linear' && p.draw === 'arrow') || p.style === 'arrow') {
      const shaft = mesh(PROJ_GEO.shaft, basic('#f4e8b0'))
      shaft.rotation.z = Math.PI / 2
      const tip = mesh(PROJ_GEO.tip, basic('#ffffff'))
      tip.rotation.z = -Math.PI / 2
      tip.position.x = 62
      const glow = mesh(PROJ_GEO.arrowGlow, glowMat())
      glow.rotation.z = Math.PI / 2
      g.add(shaft, tip, glow)
      if (p.kind !== 'linear') g.scale.setScalar(0.55)
    } else if (p.style === 'bullet') {
      const b = mesh(PROJ_GEO.bullet, basic('#ffffff'))
      b.rotation.z = Math.PI / 2
      const glow = mesh(PROJ_GEO.bulletGlow, glowMat())
      glow.rotation.z = Math.PI / 2
      g.add(b, glow)
    } else {
      const r = p.kind === 'linear' ? 22 : Math.max(9, (p.size || 4) * 2.6)
      const core = mesh(PROJ_GEO.core, basic('#ffffff'))
      core.scale.setScalar(r)
      const glow = mesh(PROJ_GEO.orb, glowMat())
      glow.scale.setScalar(p.style === 'fire' ? r * 1.3 : r)
      g.add(core, glow)
    }
    this.scene.add(g)
    // particle trail that follows the projectile until it disappears
    const trailCol = p.draw === 'hook' ? '#c8c8d4' : col
    this.vfx.emit({
      pos: new THREE.Vector3(p.x, 70, p.y), color: trailCol, color2: p.style === 'fire' ? '#ff4a20' : trailCol, rate: p.draw === 'hook' ? 0 : 55, dur: 600,
      shape: 'sphere', radius: 6, speed: [0, 10], size: p.kind === 'linear' ? [22, 38] : [14, 26], life: [0.25, 0.5], max: 90, kind: p.style === 'fire' ? 'smoke' : 'glow',
      follow: () => (this.w.projs.includes(p) ? new THREE.Vector3(p.x, 70, p.y) : null),
    })
    return { g, links }
  }

  private syncProjs() {
    const w = this.w
    const live = new Set<any>()
    for (const p of w.projs) {
      live.add(p)
      let pm = this.projMeshes.get(p)
      if (!pm) {
        pm = this.makeProj(p)
        this.projMeshes.set(p, pm)
      }
      pm.g.position.set(p.x, 70, p.y)
      let ang = p.angle ?? 0
      if (p.kind === 'homing' && p.target) ang = Math.atan2(p.target.y - p.y, p.target.x - p.x)
      pm.g.rotation.y = -ang
      if (pm.links) {
        const o = p.owner
        const n = pm.links.length
        for (let i = 0; i < n; i++) {
          const f = (i + 1) / (n + 1)
          pm.links[i].position.set(o.x + (p.x - o.x) * f, 70, o.y + (p.y - o.y) * f)
          pm.links[i].rotation.set(i % 2 ? Math.PI / 2 : 0, -ang + Math.PI / 2, 0)
        }
      }
    }
    for (const [p, pm] of this.projMeshes) {
      if (live.has(p)) continue
      this.scene.remove(pm.g)
      pm.links?.forEach((l) => this.scene.remove(l))
      if (p.kind === 'homing') this.vfx.spawn({ name: 'burst', x: p.x, y: p.y, z: 60, color: p.color || '#ffffff', count: 10, size: 70 })
      this.projMeshes.delete(p)
    }
  }

  private syncRunes() {
    const w = this.w
    const live = new Set<number>()
    for (const r of w.runes) {
      if (!w.runeVisible(this.myTeam, r)) continue
      live.add(r.id)
      let g = this.runeMeshes.get(r.id)
      if (!g) {
        const col = RUNE_INFO[r.kind].color
        g = new THREE.Group()
        const gem = new THREE.Mesh(
          r.kind === 'bounty' ? new THREE.DodecahedronGeometry(30) : new THREE.OctahedronGeometry(36),
          new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(col), emissiveIntensity: 1.3, roughness: 0.25, flatShading: true }),
        )
        gem.position.y = 95
        gem.scale.y = r.kind === 'bounty' ? 1 : 1.5
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(18, 40, 260, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
        )
        beam.position.y = 130
        const ring = new THREE.Mesh(new THREE.RingGeometry(70, 92, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide }))
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 6
        g.add(gem, beam, ring)
        g.userData.gem = gem
        g.position.set(r.x, 0, r.y)
        this.scene.add(g)
        this.runeMeshes.set(r.id, g)
      }
      const gem = g.userData.gem as THREE.Object3D
      gem.rotation.y = w.time * 1.8
      gem.position.y = 95 + Math.sin(w.time * 2.4 + r.id) * 10
    }
    for (const [id, g] of this.runeMeshes) {
      if (!live.has(id)) {
        this.scene.remove(g)
        disposeTree(g)
        this.runeMeshes.delete(id)
      }
    }
  }

  private syncWards() {
    const w = this.w
    const live = new Set<number>()
    for (const wd of w.wards) {
      if (wd.team !== this.myTeam) continue // enemy wards are invisible
      live.add(wd.id)
      let g = this.wardMeshes.get(wd.id)
      if (!g) {
        g = new THREE.Group()
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, 70, 6), new THREE.MeshStandardMaterial({ color: '#6a4a2a', flatShading: true }))
        stake.position.y = 35
        stake.castShadow = true
        const eye = new THREE.Mesh(new THREE.SphereGeometry(26, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: new THREE.Color('#ffd24a'), emissiveIntensity: 1.2 }))
        eye.position.y = 92
        eye.scale.set(1, 1.25, 1)
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), new THREE.MeshBasicMaterial({ color: '#2a1a08' }))
        pupil.position.set(0, 92, 20)
        const ring = new THREE.Mesh(new THREE.RingGeometry(34, 44, 24), new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.7, side: THREE.DoubleSide }))
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 3
        g.add(stake, eye, pupil, ring)
        g.position.set(wd.x, 0, wd.y)
        g.userData.eye = [eye, pupil]
        this.scene.add(g)
        this.wardMeshes.set(wd.id, g)
      }
      const [eye, pupil] = g.userData.eye as THREE.Object3D[]
      const bob = Math.sin(w.time * 2 + wd.id) * 5
      eye.position.y = 92 + bob
      pupil.position.y = 92 + bob
      g.rotation.y = w.time * 0.6
    }
    for (const [id, g] of this.wardMeshes) {
      if (!live.has(id)) {
        this.scene.remove(g)
        disposeTree(g)
        this.wardMeshes.delete(id)
      }
    }
  }

  /* ------------------------------------------------------------- draw */

  draw(ov: Overlay) {
    const w = this.w
    this.placeCamera()
    this.updateAffine()
    // lighting follows the camera target, tinted at night
    const night = w.nightAmount()
    this.sun.position.set(this.cam.x - 900, 1700, this.cam.y + 900)
    this.sun.target.position.set(this.cam.x, 0, this.cam.y)
    this.sun.intensity = 2.1 - 0.7 * night
    this.hemi.intensity = 1.15 - 0.2 * night
    const isNight = night > 0.5
    if (isNight !== this.litNight) {
      this.litNight = isNight
      this.sun.color.set(isNight ? '#a8bcff' : '#fff0d0')
      this.hemi.color.set(isNight ? '#8a9ae0' : '#c8d8ff')
    }
    this.syncUnits()
    this.syncWards()
    this.syncRunes()
    this.syncProjs()
    // effects: drain the world's queue, then advance the particle system
    const now = performance.now()
    const dtv = Math.min(0.1, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    for (const ev of this.w.vfxQ) if (this.w.time - 0 >= 0) this.vfx.spawn(ev, this.posOf)
    this.w.vfxQ.length = 0
    this.vfx.update(dtv)
    this.composer.render()

    // the minimap's camera rectangle follows the main view
    const mm = this.minimap
    mm.cam = this.cam
    mm.W = this.W
    mm.H = this.H
    mm.scale = this.scale * 0.8
    mm.myTeam = this.myTeam

    this.drawOverlay(ov)
  }

  drawMinimap(c: CanvasRenderingContext2D, size: number) {
    this.minimap.drawMinimap(c, size)
  }

  /* ----------------------------------------------------------- overlay */

  private drawOverlay(ov: Overlay) {
    const c = this.octx
    const w = this.w
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.ov.width, this.ov.height)

    // ---- ground-plane effects (affine)
    this.groundT(c)
    const p = w.player
    const lw = (px: number) => px / Math.max(0.2, Math.hypot(this.A.ax, this.A.ay))
    // player ring
    if (!p.dead) {
      c.beginPath()
      c.arc(p.x, p.y, p.radius * 1.9, 0, Math.PI * 2)
      c.strokeStyle = 'rgba(255,255,255,0.8)'
      c.lineWidth = lw(2)
      c.stroke()
    }
    // rot + zones
    for (const hh of w.heroes) {
      if (hh.dead) continue
      for (const a of hh.h!.abilities) {
        const area = a.def.toggleArea
        if (area && a.toggled && a.level > 0) {
          c.beginPath()
          c.arc(hh.x, hh.y, area.r, 0, Math.PI * 2)
          c.fillStyle = area.fill
          c.fill()
          c.strokeStyle = area.stroke
          c.lineWidth = lw(3)
          c.stroke()
        }
      }
    }
    for (const z of w.zones) {
      const active = w.time >= z.start
      c.beginPath()
      c.arc(z.x, z.y, z.r, 0, Math.PI * 2)
      c.fillStyle = active ? 'rgba(210,170,80,0.2)' : 'rgba(210,170,80,0.07)'
      c.fill()
      c.strokeStyle = active ? 'rgba(240,200,100,0.9)' : 'rgba(240,200,100,0.45)'
      c.lineWidth = lw(3)
      c.setLineDash([lw(14), lw(10)])
      c.lineDashOffset = -w.time * 30
      c.stroke()
      c.setLineDash([])
    }
    // tower range rings
    for (const u of w.units) {
      if (u.kind !== 'tower' || u.dead) continue
      const near = Math.hypot(u.x - p.x, u.y - p.y) < u.st.range + 120
      if (ov.hover === u || (u.team !== this.myTeam && near)) {
        c.beginPath()
        c.arc(u.x, u.y, u.st.range, 0, Math.PI * 2)
        c.strokeStyle = u.team === this.myTeam ? 'rgba(111,224,111,0.4)' : 'rgba(232,86,74,0.55)'
        c.lineWidth = lw(2.5)
        c.stroke()
      }
    }
    // ability previews
    if (ov.rangeCircle && !p.dead) {
      c.beginPath()
      c.arc(p.x, p.y, ov.rangeCircle.r, 0, Math.PI * 2)
      c.strokeStyle = ov.rangeCircle.color
      c.lineWidth = lw(2.5)
      c.setLineDash([lw(12), lw(8)])
      c.stroke()
      c.setLineDash([])
    }
    if (ov.line) {
      c.strokeStyle = ov.line.color
      c.lineWidth = ov.line.width
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(ov.line.from.x, ov.line.from.y)
      c.lineTo(ov.line.to.x, ov.line.to.y)
      c.stroke()
      c.lineCap = 'butt'
    }
    if (ov.aoe) {
      c.beginPath()
      c.arc(ov.aoe.x, ov.aoe.y, ov.aoe.r, 0, Math.PI * 2)
      c.strokeStyle = ov.aoe.color
      c.lineWidth = lw(2.5)
      c.stroke()
      c.fillStyle = ov.aoe.color.replace(/[\d.]+\)$/, '0.14)')
      c.fill()
    }
    // denyable creeps glow, hover ring
    for (const u of w.units) {
      if (u.dead || !w.isVisible(this.myTeam, u)) continue
      if (u.kind === 'creep' && u.team === this.myTeam && u.hp < u.st.maxHp * 0.5) {
        c.beginPath()
        c.arc(u.x, u.y, u.radius * 1.6, 0, Math.PI * 2)
        c.strokeStyle = `rgba(255,255,255,${0.6 + 0.35 * Math.sin(w.time * 8)})`
        c.lineWidth = lw(2.5)
        c.stroke()
      }
    }
    if (ov.hover && !ov.hover.dead) {
      const hv = ov.hover
      c.beginPath()
      c.arc(hv.x, hv.y, hv.radius * 1.9, 0, Math.PI * 2)
      c.strokeStyle = hv.team === this.myTeam ? 'rgba(111,224,111,0.9)' : 'rgba(255,90,70,0.95)'
      c.lineWidth = lw(3)
      c.stroke()
    }

    // ---- screen-space layer
    this.screenT(c)
    const S = (x: number, y: number, h = 0) => this.toScreen(x, y, h)
    const ppu = Math.hypot(this.A.ax, this.A.ay)

    // bars + status icons
    for (const u of w.units) {
      if (u.dead || u.kind === 'fountain' || u.kind === 'courier' || !w.isVisible(this.myTeam, u)) continue
      const e = this.entries.get(u.id)
      const hgt = (e?.model.height ?? 100) * (u.kind === 'hero' ? 1.55 : u.kind === 'creep' ? 1.35 : u.kind === 'summon' ? 1.2 : 1) + (u.kind === 'hero' && u.hasBuff('tk') ? 170 : 0) + 24
      const s = S(u.x, u.y, hgt)
      if (s.x < -80 || s.x > this.W + 80 || s.y < -80 || s.y > this.H + 80) continue
      const friend = u.team === this.myTeam
      const col = isNeutral(u.team) ? '#e0a23a' : friend ? '#4fd04f' : '#e04a3a'
      if (u.kind === 'hero') {
        const wd = Math.max(70, Math.min(130, ppu * 190))
        this.bar(c, s.x, s.y - 14, wd, 11, u.hp / u.st.maxHp, col)
        if (u.st.maxMana > 0) this.bar(c, s.x, s.y - 3, wd, 6, u.mana / u.st.maxMana, '#4a8ae8')
        // name label (player or bot)
        const human = u.h!.isHuman
        const label = (human ? '★ ' : '') + (u.h!.pname || u.name)
        c.font = "800 14px 'Barlow Condensed', sans-serif"
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.lineWidth = 4
        c.strokeStyle = 'rgba(0,0,0,0.9)'
        c.strokeText(label, s.x, s.y - 26)
        c.fillStyle = human ? '#ffe9a8' : friend ? '#bff0b8' : '#ffb4a8'
        c.fillText(label, s.x, s.y - 26)
        c.fillStyle = 'rgba(0,0,0,0.82)'
        c.fillRect(s.x - wd / 2 - 24, s.y - 16, 22, 20)
        c.strokeStyle = '#c9a85a'
        c.lineWidth = 1.5
        c.strokeRect(s.x - wd / 2 - 24, s.y - 16, 22, 20)
        c.fillStyle = '#ffe9a8'
        c.font = '700 14px Cinzel, serif'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText(String(u.h!.level), s.x - wd / 2 - 13, s.y - 5)
        if (u.isStunned()) {
          c.font = '700 20px sans-serif'
          for (let i = 0; i < 3; i++) {
            const a = w.time * 6 + (i * Math.PI * 2) / 3
            c.fillStyle = '#ffe36a'
            c.fillText('★', s.x + Math.cos(a) * 18, s.y - 38 + Math.sin(a) * 5)
          }
        }
        if (u.buffs.some((b) => b.taunt)) {
          c.font = '900 30px sans-serif'
          c.fillStyle = '#ff4a3a'
          c.fillText('!', s.x, s.y - 40)
        }
      } else if (u.kind === 'creep' || u.kind === 'summon') {
        if (u.hp < u.st.maxHp) this.bar(c, s.x, s.y - 4, Math.max(34, ppu * 80), 6, u.hp / u.st.maxHp, col)
      } else if (u.kind === 'tower' || u.kind === 'ancient') {
        const wd = u.kind === 'ancient' ? 150 : 100
        this.bar(c, s.x, s.y - 4, wd, 9, u.hp / u.st.maxHp, col)
      }
    }

    // rune labels
    for (const r of w.runes) {
      if (!w.runeVisible(this.myTeam, r)) continue
      const sp = S(r.x, r.y, 210)
      if (sp.x < -60 || sp.x > this.W + 60 || sp.y < -60 || sp.y > this.H + 60) continue
      const info = RUNE_INFO[r.kind]
      c.font = "800 15px 'Barlow Condensed', sans-serif"
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.lineWidth = 4
      c.strokeStyle = 'rgba(0,0,0,0.85)'
      c.strokeText(info.name + ' Rune', sp.x, sp.y)
      c.fillStyle = info.color
      c.fillText(info.name + ' Rune', sp.x, sp.y)
    }

    // floating text
    for (const f of w.fxs) {
      if (f.k !== 'text' || !reaches(f.to, w.player)) continue
      const k = (w.time - f.t0) / f.dur
      if (k < 0 || k > 1) continue
      const s = S(f.x!, f.y!, 140 + k * 110)
      c.globalAlpha = Math.min(1, (1 - k) * 2)
      c.font = `800 ${(f.size || 16) + 2}px 'Barlow Condensed', sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.lineWidth = 4
      c.strokeStyle = 'rgba(0,0,0,0.85)'
      c.strokeText(f.text!, s.x, s.y)
      c.fillStyle = f.color || '#fff'
      c.fillText(f.text!, s.x, s.y)
      c.globalAlpha = 1
    }

    this.drawFog(c)

    // night tint + vignette
    const night = w.nightAmount()
    if (night > 0.01) {
      c.fillStyle = `rgba(30,50,140,${0.07 * night})`
      c.fillRect(0, 0, this.W, this.H)
    }
    const vk = `${this.W}x${this.H}`
    if (!this.vignette || this.vignette.key !== vk) {
      const g = c.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.5, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.8)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.15)')
      this.vignette = { key: vk, g }
    }
    c.fillStyle = this.vignette.g
    c.fillRect(0, 0, this.W, this.H)
  }

  private bar(c: CanvasRenderingContext2D, x: number, y: number, wd: number, ht: number, f: number, color: string) {
    c.fillStyle = 'rgba(0,0,0,0.85)'
    c.fillRect(x - wd / 2 - 1.5, y - 1.5, wd + 3, ht + 3)
    c.fillStyle = '#1a1a1a'
    c.fillRect(x - wd / 2, y, wd, ht)
    c.fillStyle = color
    c.fillRect(x - wd / 2, y, wd * Math.max(0, Math.min(1, f)), ht)
    c.fillStyle = 'rgba(255,255,255,0.2)'
    c.fillRect(x - wd / 2, y, wd * Math.max(0, Math.min(1, f)), ht * 0.4)
  }

  private drawFog(c: CanvasRenderingContext2D) {
    const w = this.w
    const { fctx, fog } = this
    const k = fog.width / this.W
    // start every frame from a clean layer (otherwise the unseen area keeps darkening to solid black)
    fctx.globalCompositeOperation = 'source-over'
    fctx.clearRect(0, 0, fog.width, fog.height)
    fctx.fillStyle = 'rgba(6,10,20,0.34)'
    fctx.fillRect(0, 0, fog.width, fog.height)
    fctx.globalCompositeOperation = 'destination-out'
    const punch = (wx: number, wy: number, r: number) => {
      // sample the projected ring to get a conservative ellipse
      const s = this.toScreen(wx, wy)
      const e = this.toScreen(wx + r, wy)
      const n = this.toScreen(wx, wy - r)
      const rx = Math.abs(e.x - s.x) * k
      const ry = Math.abs(s.y - n.y) * k
      if (!isFinite(rx) || rx < 2) return
      fctx.drawImage(this.punchImg, s.x * k - rx, s.y * k - ry, rx * 2, ry * 2)
    }
    for (const u of w.units) if (u.team === this.myTeam && !u.dead) punch(u.x, u.y, w.visionOf(u))
    for (const z of w.zones) if (z.reveal && z.team === this.myTeam && w.time >= z.start) punch(z.x, z.y, z.r + 100)
    for (const wd of w.wards) if (wd.team === this.myTeam) punch(wd.x, wd.y, 1600)
    fctx.globalCompositeOperation = 'source-over'
    c.imageSmoothingEnabled = true
    c.drawImage(fog, 0, 0, this.W, this.H)
  }
}

export { TEAM_COLOR }
