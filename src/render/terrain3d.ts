import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BASE_POS, CAMPS, FOUNTAIN_POS, LANES, MAP, PATHS, PIT_R, POWER_RUNES, Pt, ROSHAN_PIT, T4_POS, TRAILS, WALLS, mirror } from '../sim/constants'
import { FORDS, LANE_PATHS, RIVER, RIVER_PATH, ROCKS, TREES, baseDist, fountainDist, heightAt, laneDist, mulberry, riverDist, riverHalfAt } from '../sim/obstacles'

/* ------------------------------------------------------------------ shared */

/** Water surface height: the river bed (see heightAt) lies below it. */
const WATER_Y = -9
const rng = mulberry

interface Item {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  ry: number
  rx?: number
  rz?: number
  c?: THREE.Color
}

/** World units per instancing tile: props are split into tiles so the camera and shadow frustums can cull them. */
const PROP_TILE = 2400

function instanced(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], shadow = true) {
  const tiles = new Map<string, Item[]>()
  for (const it of items) {
    const key = `${Math.floor(it.x / PROP_TILE)},${Math.floor(it.z / PROP_TILE)}`
    let list = tiles.get(key)
    if (!list) tiles.set(key, (list = []))
    list.push(it)
  }
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const s = new THREE.Vector3()
  for (const list of tiles.values()) {
    const m = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach((it, i) => {
      e.set(it.rx ?? 0, it.ry, it.rz ?? 0)
      q.setFromEuler(e)
      m4.compose(v.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz))
      m.setMatrixAt(i, m4)
      if (it.c) m.setColorAt(i, it.c)
    })
    m.computeBoundingSphere()
    m.castShadow = shadow
    m.receiveShadow = false
    scene.add(m)
  }
}

const hash3 = (x: number, y: number, z: number, seed = 0) => {
  const s = Math.sin(Math.round(x * 500) * 127.1 + Math.round(y * 500) * 311.7 + Math.round(z * 500) * 74.7 + seed * 19.19) * 43758.5453
  return s - Math.floor(s)
}

/** Convert to non-indexed and bake a vertex colour. */
function paint(g: THREE.BufferGeometry, hex: string) {
  const ng = g.index ? g.toNonIndexed() : g
  ng.deleteAttribute('uv')
  const c = new THREE.Color(hex)
  const n = ng.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return ng
}

/** Vertex colour gradient by height (bottom->top of the bounding box). */
function paintGrad(g: THREE.BufferGeometry, bottom: string, top: string) {
  const ng = g.index ? g.toNonIndexed() : g
  ng.deleteAttribute('uv')
  ng.computeBoundingBox()
  const bb = ng.boundingBox!
  const a = new THREE.Color(bottom)
  const b = new THREE.Color(top)
  const c = new THREE.Color()
  const pos = ng.attributes.position
  const arr = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1)
    c.copy(a).lerp(b, k)
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return ng
}

/** Radial / vertical jitter that keeps coincident vertices welded. */
function jitter(g: THREE.BufferGeometry, amt: number, seed: number, yAmt = amt) {
  const ng = g.index ? g.toNonIndexed() : g
  const p = ng.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const h = hash3(x, y, z, seed)
    const h2 = hash3(z, x, y, seed + 3)
    const k = 1 + (h - 0.5) * 2 * amt
    p.setXYZ(i, x * k, y + (h2 - 0.5) * 2 * yAmt, z * k)
  }
  ng.computeVertexNormals()
  return ng
}

function xf(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Object3D()
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  o.scale.set(sx, sy, sz)
  o.updateMatrix()
  g.applyMatrix4(o.matrix)
  return g
}

/** A limb: cone from point P leaning `tilt` rad away from vertical towards `yaw`. */
function limb(P: [number, number, number], yaw: number, tilt: number, len: number, r0: number, hex: string, seg = 4) {
  const g = new THREE.ConeGeometry(r0, len, seg)
  g.translate(0, len / 2, 0)
  const o = new THREE.Object3D()
  o.rotation.order = 'YXZ'
  o.rotation.set(0, yaw, -tilt)
  o.position.set(P[0], P[1], P[2])
  o.updateMatrix()
  g.applyMatrix4(o.matrix)
  return paint(g, hex)
}

const merge = (gs: THREE.BufferGeometry[]) => {
  const out = mergeGeometries(gs, false)
  if (!out) throw new Error('merge failed')
  return out
}

const vcMat = (o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0, ...o })

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/* -------------------------------------------------------------- scenery plan */

interface Plan {
  camps: Pt[]
  fords: Pt[]
  runes: Pt[]
}

function makePlan(): Plan {
  return { camps: CAMPS.map((c) => ({ x: c.x, y: c.y })), fords: FORDS, runes: POWER_RUNES }
}

/* --------------------------------------------------------------------- entry */

/** Builds the static 3D map (ground, water, border mountains, trees, props) into the scene. */
export function buildTerrain(scene: THREE.Scene): HTMLCanvasElement {
  const plan = makePlan()
  const tick: Array<(t: number) => void> = []
  const groundCanvas = buildGround(scene, plan)
  buildWater(scene, tick)
  buildMountains(scene)
  buildTrees(scene)
  buildRocks(scene, plan)
  buildGroundCover(scene, plan)
  buildBases(scene)
  buildWalls(scene)
  buildOuterForest(scene)
  buildPads(scene, plan, tick)
  buildPools(scene, plan, tick)
  // single animation hook: the water mesh is always rendered, so drive all animation from it
  const hook = scene.getObjectByName('river-water')
  if (hook) {
    hook.onBeforeRender = () => {
      const t = performance.now() / 1000
      for (const f of tick) f(t)
    }
  }
  return groundCanvas
}

/* -------------------------------------------------------------------- ground */

function paintGroundCanvas(plan: Plan) {
  const px = 4096
  const k = px / MAP
  const c = document.createElement('canvas')
  c.width = c.height = px
  const ctx = c.getContext('2d')!
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const r = rng(77)

  // biome halves
  ctx.fillStyle = '#3f7d2d'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, MAP)
  ctx.lineTo(MAP, MAP)
  ctx.fill()
  ctx.fillStyle = '#6e5a4a'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(MAP, 0)
  ctx.lineTo(MAP, MAP)
  ctx.fill()

  const RAD = [[84, 150, 56], [48, 106, 40], [108, 176, 70], [60, 124, 48], [96, 140, 58], [40, 92, 44], [130, 170, 70]]
  const DIR = [[140, 112, 90], [96, 78, 66], [160, 120, 94], [166, 92, 60], [112, 94, 84], [126, 96, 100], [84, 70, 64]]
  const blob = (x: number, y: number, rad: number, col: number[], a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`)
    g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 3600; i++) {
    const x = r() * MAP
    const y = r() * MAP
    const rad = 90 + r() * 360
    const dire = x - y + (r() - 0.5) * 500 > 0
    const pal = dire ? DIR : RAD
    blob(x, y, rad, pal[Math.floor(r() * pal.length)], 0.14 + r() * 0.22)
  }
  for (let i = 0; i < 160; i++) {
    const x = r() * MAP
    const y = r() * MAP
    const dire = x > y
    blob(x, y, 700 + r() * 700, dire ? [64, 48, 40] : [30, 70, 30], 0.12)
  }

  // dire lava cracks
  for (let i = 0; i < 160; i++) {
    const x0 = r() * MAP
    const y0 = r() * MAP
    if (x0 - y0 < 900 || laneDist(x0, y0) < 430 || riverDist(x0, y0) < 700 || baseDist(x0, y0) < 950) continue
    const branches: Array<[number, number, number, number]> = [[x0, y0, r() * 6.28, 7 + Math.floor(r() * 4)]]
    const segs: Pt[][] = []
    while (branches.length) {
      let [x, y, a, n] = branches.pop()!
      const pts: Pt[] = [{ x, y }]
      for (let j = 0; j < n; j++) {
        a += (r() - 0.5) * 1.5
        const l = 55 + r() * 70
        x += Math.cos(a) * l
        y += Math.sin(a) * l
        pts.push({ x, y })
        if (j === 3 && r() < 0.55 && branches.length < 2) branches.push([x, y, a + (r() < 0.5 ? 1 : -1), 4])
      }
      segs.push(pts)
    }
    const line = (w: number, col: string) => {
      ctx.strokeStyle = col
      ctx.lineWidth = w
      for (const pts of segs) {
        ctx.beginPath()
        pts.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.stroke()
      }
    }
    line(34, 'rgba(10,6,5,0.55)')
    line(15, '#ff4c14')
    line(6, '#ffb347')
  }

  // radiant flowers & dire ash flecks
  for (let i = 0; i < 2600; i++) {
    const x = r() * MAP
    const y = r() * MAP
    if (laneDist(x, y) < 250 || riverDist(x, y) < 450 || baseDist(x, y) < 700) continue
    if (x < y) {
      ctx.fillStyle = ['#f2f2e0', '#ffe66a', '#ff9ac8', '#9ad0ff'][Math.floor(r() * 4)]
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(x, y, 6 + r() * 7, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = r() < 0.5 ? '#a89a90' : '#150f0e'
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.ellipse(x, y, 10 + r() * 20, 5 + r() * 8, r() * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1

  const stroke = (pts: Pt[], width: number, style: string | CanvasGradient) => {
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.strokeStyle = style
    ctx.lineWidth = width
    ctx.stroke()
  }

  // river banks / bed: each layer follows the tapering width of the water
  const riverLayer = (extra: number, style: string) => {
    let s = 0
    ctx.strokeStyle = style
    ctx.lineCap = 'round'
    for (let i = 1; i < RIVER.length; i++) {
      const a = RIVER[i - 1]
      const b = RIVER[i]
      ctx.lineWidth = 2 * (riverHalfAt(s) + extra)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      s += Math.hypot(b.x - a.x, b.y - a.y)
    }
  }
  riverLayer(250, 'rgba(70,74,48,0.40)')
  riverLayer(140, 'rgba(150,140,96,0.5)')
  riverLayer(55, 'rgba(120,112,80,0.8)')
  riverLayer(28, '#1d3c4a')
  for (let i = 0; i < 1400; i++) {
    const p = RIVER_PATH.at(r() * RIVER_PATH.len)
    const a = r() * 6.28
    const d = 330 + r() * 150
    ctx.fillStyle = r() < 0.5 ? 'rgba(200,196,170,0.5)' : 'rgba(60,56,46,0.5)'
    ctx.beginPath()
    ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 5 + r() * 9, 0, Math.PI * 2)
    ctx.fill()
  }

  // Roshan's pit: trampled dark soil with a ring of scorched ground
  blob(ROSHAN_PIT.x, ROSHAN_PIT.y, PIT_R + 240, [38, 30, 26], 0.85)
  ctx.fillStyle = 'rgba(24,18,16,0.85)'
  ctx.beginPath()
  ctx.arc(ROSHAN_PIT.x, ROSHAN_PIT.y, PIT_R, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,120,40,0.35)'
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.arc(ROSHAN_PIT.x, ROSHAN_PIT.y, PIT_R * 0.7, 0, Math.PI * 2)
  ctx.stroke()

  // jungle camps
  for (const cp of plan.camps) {
    const dire = cp.x > cp.y
    blob(cp.x, cp.y, 330, dire ? [28, 20, 18] : [96, 80, 50], 0.9)
    ctx.fillStyle = dire ? 'rgba(80,36,26,0.5)' : 'rgba(150,120,70,0.55)'
    ctx.beginPath()
    ctx.arc(cp.x, cp.y, 190, 0, Math.PI * 2)
    ctx.fill()
  }

  // jungle trails
  for (const t of TRAILS) {
    const dire = t[0].x > t[0].y
    stroke(t, 150, dire ? 'rgba(36,24,22,0.55)' : 'rgba(96,78,48,0.6)')
    stroke(t, 90, dire ? 'rgba(74,50,42,0.8)' : 'rgba(150,124,78,0.85)')
    stroke(t, 36, dire ? 'rgba(96,66,54,0.7)' : 'rgba(176,150,98,0.7)')
  }
  // base walls (also shows on the minimap)
  for (const w of WALLS) {
    const dire = w.a.x > w.a.y
    stroke([w.a, w.b], 120, 'rgba(10,8,6,0.45)')
    stroke([w.a, w.b], 70, dire ? '#3b3342' : '#b4ad94')
  }

  // lanes
  const LG = (a: string, b: string) => {
    const g = ctx.createLinearGradient(0, MAP, MAP, 0)
    g.addColorStop(0.33, a)
    g.addColorStop(0.67, b)
    return g
  }
  ctx.save()
  ctx.shadowColor = 'rgba(15,10,6,0.6)'
  ctx.shadowBlur = 40 * k
  for (const lane of LANES) stroke(PATHS[0][lane].pts, 520, 'rgba(20,14,8,0.30)')
  ctx.restore()
  for (const lane of LANES) {
    const pts = PATHS[0][lane].pts
    stroke(pts, 430, LG('#6b5836', '#3d3029'))
    stroke(pts, 330, LG('#8a7347', '#554238'))
    stroke(pts, 190, LG('#a08a58', '#6c5648'))
  }
  for (const path of LANE_PATHS) {
    for (let i = 0; i < 2600; i++) {
      const p = path.at(r() * path.len)
      const a = r() * 6.28
      const d = r() * 200
      const light = r() < 0.5
      ctx.fillStyle = light ? 'rgba(230,215,170,0.45)' : 'rgba(30,22,14,0.5)'
      ctx.beginPath()
      ctx.ellipse(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 4 + r() * 8, 3 + r() * 5, r() * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // bases + fountains
  for (const team of [0, 1]) {
    const b = BASE_POS[team]
    const f = FOUNTAIN_POS[team]
    const rad = team === 0
    const accent = rad ? '#f2cf6a' : '#ff5a2a'
    const g = ctx.createRadialGradient(b.x, b.y, 200, b.x, b.y, 1350)
    g.addColorStop(0, rad ? 'rgba(130,200,80,0.55)' : 'rgba(150,50,30,0.55)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(b.x, b.y, 1350, 0, Math.PI * 2)
    ctx.fill()
    // walkway base -> fountain
    stroke([b, f], 170, rad ? 'rgba(168,162,140,0.85)' : 'rgba(52,46,56,0.9)')
    stroke([b, f], 120, rad ? 'rgba(196,190,166,0.9)' : 'rgba(70,62,76,0.9)')
    const plaza = (x: number, y: number, R: number) => {
      ctx.fillStyle = rad ? '#a8a28a' : '#3a3342'
      ctx.beginPath()
      ctx.arc(x, y, R, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = rad ? '#c3bda4' : '#4a4252'
      ctx.beginPath()
      ctx.arc(x, y, R * 0.93, 0, Math.PI * 2)
      ctx.fill()
      // tile joints
      ctx.strokeStyle = rad ? 'rgba(90,84,66,0.55)' : 'rgba(8,6,10,0.7)'
      ctx.lineWidth = 5
      for (const rr of [0.82, 0.62, 0.42, 0.24]) {
        ctx.beginPath()
        ctx.arc(x, y, R * rr, 0, Math.PI * 2)
        ctx.stroke()
      }
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(x + Math.cos(a) * R * 0.24, y + Math.sin(a) * R * 0.24)
        ctx.lineTo(x + Math.cos(a) * R * 0.92, y + Math.sin(a) * R * 0.92)
        ctx.stroke()
      }
      // glowing inlay
      ctx.save()
      ctx.shadowColor = accent
      ctx.shadowBlur = 30 * k
      ctx.strokeStyle = accent
      ctx.lineWidth = 11
      ctx.beginPath()
      ctx.arc(x, y, R * 0.76, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 8
      ctx.beginPath()
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2 * 3
        const rr = R * 0.5
        const px2 = x + Math.cos(a) * rr
        const py2 = y + Math.sin(a) * rr
        if (i) ctx.lineTo(px2, py2)
        else ctx.moveTo(px2, py2)
      }
      ctx.stroke()
      ctx.restore()
    }
    plaza(b.x, b.y, 650)
    plaza(f.x, f.y, 560)
  }

  // dark edge vignette so the border blends into the mountains
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, 700, 0, 0, 0, 700, MAP],
    [MAP, 0, MAP - 700, 0, MAP - 700, 0, 700, MAP],
    [0, 0, 0, 700, 0, 0, MAP, 700],
    [0, MAP, 0, MAP - 700, 0, MAP - 700, MAP, 700],
  ]) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, 'rgba(8,10,8,0.7)')
    g.addColorStop(1, 'rgba(8,10,8,0)')
    ctx.fillStyle = g
    ctx.fillRect(rx, ry, rw, rh)
  }
  return c
}

function noiseTexture() {
  const s = 32
  const small = document.createElement('canvas')
  small.width = small.height = s
  const sc = small.getContext('2d')!
  const img = sc.createImageData(s, s)
  const r = rng(5)
  for (let i = 0; i < s * s; i++) {
    const v = 90 + r() * 90
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  sc.putImageData(img, 0, 0)
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, 0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

const GROUND_SEGS = 192

function buildGround(scene: THREE.Scene, plan: Plan): HTMLCanvasElement {
  const canvas = paintGroundCanvas(plan)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const detail = noiseTexture()
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detail }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float dn = texture2D(detailMap, vMapUv * 95.0).r * 0.6 + texture2D(detailMap, vMapUv * 23.0 + 0.37).r * 0.4;
        diffuseColor.rgb *= 0.55 + 0.9 * dn;`,
      )
  }
  // a displaced grid: the river bed, the mid lane valley and Roshan's pit sink below the rest of the map (see heightAt)
  const geo = new THREE.PlaneGeometry(MAP, MAP, GROUND_SEGS, GROUND_SEGS)
  const gp = geo.attributes.position
  for (let i = 0; i < gp.count; i++) gp.setZ(i, heightAt(MAP / 2 + gp.getX(i), MAP / 2 - gp.getY(i)))
  geo.computeVertexNormals()
  const ground = new THREE.Mesh(geo, mat)
  ground.rotation.x = -Math.PI / 2
  ground.position.set(MAP / 2, 0, MAP / 2)
  ground.receiveShadow = true
  scene.add(ground)
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(MAP + 16000, MAP + 16000), new THREE.MeshStandardMaterial({ color: '#2c4a26', roughness: 1 }))
  outer.rotation.x = -Math.PI / 2
  outer.position.set(MAP / 2, -90, MAP / 2)
  scene.add(outer)
  return canvas
}

/* --------------------------------------------------------------------- water */

function buildWater(scene: THREE.Scene, tick: Array<(t: number) => void>) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let acc = 0
  const n = RIVER.length
  for (let i = 0; i < n; i++) {
    const p = RIVER[i]
    const a = RIVER[Math.max(0, i - 1)]
    const b = RIVER[Math.min(n - 1, i + 1)]
    const tx = b.x - a.x
    const ty = b.y - a.y
    const l = Math.hypot(tx, ty) || 1
    const nx = -ty / l
    const ny = tx / l
    const hw = riverHalfAt(acc)
    pos.push(p.x + nx * hw, WATER_Y, p.y + ny * hw, p.x - nx * hw, WATER_Y, p.y - ny * hw)
    uv.push(0, acc / 500, 1, acc / 500)
    if (i < n - 1) acc += Math.hypot(RIVER[i + 1].x - p.x, RIVER[i + 1].y - p.y)
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  const uniforms = { time: { value: 0 } }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float time; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 p = vW.xz * 0.0045;
        float w1 = sin(p.x*7.0 + time*1.3 + sin(p.y*5.0 + time*0.7)*1.6);
        float w2 = sin(p.y*10.0 - time*1.1 + p.x*4.0);
        float w3 = sin((p.x+p.y)*16.0 + time*2.0);
        float n = (w1 + w2 + 0.5*w3) * 0.2 + 0.5;
        float center = 1.0 - abs(vUv.x - 0.5) * 2.0;
        vec3 deep = vec3(0.04, 0.22, 0.36);
        vec3 shallow = vec3(0.16, 0.56, 0.64);
        vec3 col = mix(shallow, deep, smoothstep(0.0, 0.7, center));
        col += vec3(0.55, 0.85, 0.95) * pow(max(n, 0.0), 7.0) * 0.55;
        col += vec3(0.05, 0.12, 0.14) * (w1 * 0.5 + 0.5);
        float edgeFoam = smoothstep(0.17, 0.02, 1.0 - abs(vUv.x - 0.5) * 2.0) * (0.55 + 0.45 * w3);
        col = mix(col, vec3(0.85, 0.95, 0.95), edgeFoam * 0.8);
        float alpha = smoothstep(0.0, 0.07, center) * 0.9;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const water = new THREE.Mesh(geo, mat)
  water.name = 'river-water'
  water.frustumCulled = false
  water.renderOrder = 1
  scene.add(water)
  tick.push((t) => {
    uniforms.time.value = t
  })
}

/* ----------------------------------------------------------------- mountains */

function buildMountains(scene: THREE.Scene) {
  const base = jitter(new THREE.ConeGeometry(1, 1, 7, 4), 0.22, 11, 0.03)
  // rock-to-snow vertex colours by height
  {
    const p = base.attributes.position
    const arr = new Float32Array(p.count * 3)
    const rock = new THREE.Color('#6f7268')
    const dark = new THREE.Color('#4a4d46')
    const snow = new THREE.Color('#f3f6f8')
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const k = p.getY(i) + 0.5
      c.copy(dark).lerp(rock, smooth(0.0, 0.55, k))
      c.lerp(snow, smooth(0.62, 0.78, k + (hash3(p.getX(i), 0, p.getZ(i), 2) - 0.5) * 0.12))
      arr[i * 3] = c.r
      arr[i * 3 + 1] = c.g
      arr[i * 3 + 2] = c.b
    }
    base.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  }
  const r = rng(404)
  const items: Item[] = []
  const lava: Item[] = []
  const cRad = new THREE.Color()
  for (let side = 0; side < 4; side++) {
    for (let row = 0; row < 3; row++) {
      const step = 200 + row * 90
      for (let t = -2600; t < MAP + 2600; t += step) {
        const tt = t + (r() - 0.5) * step * 0.8
        const near = side === 2 ? 0.5 : 1 // the bottom edge faces the camera: keep it low so it does not hide the map
        let off = -(60 + (side === 2 ? 330 : 0) + row * 520) - r() * 260
        let h = (450 + row * 420 + r() * 800) * near
        let w = 420 + row * 150 + r() * 320
        const place = (o: number): [number, number] => (side === 0 ? [tt, o] : side === 1 ? [MAP - o, tt] : side === 2 ? [tt, MAP - o] : [o, tt])
        // keep the fountain corners open: smaller, lower, further out
        const [px0, pz0] = place(off)
        const cornerK = 0.28 + 0.72 * smooth(500, 2800, fountainDist(px0, pz0))
        off -= (1 - cornerK) * 380
        h *= cornerK
        w *= 0.55 + 0.45 * cornerK
        const [x, z] = place(off)
        const d = smooth(-2200, 2200, x - z)
        const v = 0.85 + r() * 0.3
        cRad.setRGB(v, v, v)
        const tint = new THREE.Color(0.2 * v, 0.14 * v, 0.13 * v)
        const col = cRad.clone().lerp(tint, d)
        items.push({ x, y: h / 2 - 20, z, sx: w, sy: h, sz: w, ry: r() * 6.28, c: col })
        if (d > 0.55 && r() < 0.4) lava.push({ x, y: h - 20 - h * 0.05, z, sx: w * 0.1, sy: h * 0.14, sz: w * 0.1, ry: 0 })
      }
    }
  }
  instanced(scene, base, vcMat({ roughness: 1 }), items)
  instanced(scene, new THREE.ConeGeometry(1, 1, 6), new THREE.MeshBasicMaterial({ color: '#ff6a1c' }), lava, false)
}

/* --------------------------------------------------------------------- trees */

function leafyGeo() {
  const parts = [paint(xf(new THREE.CylinderGeometry(0.08, 0.14, 0.6, 5), 0, 0.3, 0), '#5a3b22')]
  const blobs: Array<[number, number, number, number, string]> = [
    [0, 0.8, 0, 0.5, '#2f8a34'],
    [0.28, 0.62, 0.1, 0.34, '#3b9a3c'],
    [-0.26, 0.95, -0.1, 0.34, '#48ab44'],
    [0.05, 1.18, 0.05, 0.28, '#58bb4c'],
  ]
  blobs.forEach(([x, y, z, rad, col], i) => parts.push(paint(xf(jitter(new THREE.IcosahedronGeometry(rad, 0), 0.16, i + 1), x, y, z), col)))
  return merge(parts)
}

function pineGeo() {
  const parts = [paint(xf(new THREE.CylinderGeometry(0.06, 0.1, 0.5, 5), 0, 0.25, 0), '#4e3320')]
  const tiers: Array<[number, number, number, string]> = [
    [0.52, 0.7, 0.55, '#1c5e34'],
    [0.42, 0.62, 0.9, '#24703c'],
    [0.32, 0.55, 1.22, '#2c8044'],
    [0.2, 0.5, 1.5, '#369050'],
  ]
  for (const [rad, h, y, col] of tiers) parts.push(paint(xf(new THREE.ConeGeometry(rad, h, 7), 0, y, 0), col))
  return merge(parts)
}

function deadGeo() {
  const dk = '#2b2220'
  const parts = [
    paint(xf(new THREE.CylinderGeometry(0.07, 0.14, 0.75, 5), 0.03, 0.36, 0, 0, 0, 0.1), dk),
    paint(xf(new THREE.CylinderGeometry(0.035, 0.07, 0.6, 5), 0.13, 1.0, 0, 0, 0, -0.18), '#352a26'),
    limb([0.1, 0.8, 0], 0.4, 1.1, 0.7, 0.04, dk),
    limb([0.1, 0.95, 0], 2.6, 1.0, 0.65, 0.035, dk),
    limb([0.14, 1.15, 0], 4.2, 0.9, 0.6, 0.03, '#3a2c27'),
    limb([0.15, 1.25, 0], 5.6, 0.5, 0.55, 0.028, '#3a2c27'),
    limb([0.05, 0.5, 0], 1.6, 1.2, 0.45, 0.03, dk),
  ]
  return merge(parts)
}

function spikyGeo() {
  const parts = [paint(xf(new THREE.CylinderGeometry(0.05, 0.09, 0.4, 5), 0, 0.2, 0), '#2a1d1a')]
  const tiers: Array<[number, number, number, string]> = [
    [0.3, 0.7, 0.55, '#2c2a22'],
    [0.24, 0.62, 0.95, '#3a2c26'],
    [0.17, 0.55, 1.3, '#4a2e24'],
    [0.09, 0.5, 1.65, '#5a2e22'],
  ]
  for (const [rad, h, y, col] of tiers) parts.push(paint(xf(new THREE.ConeGeometry(rad, h, 5), 0, y, 0), col))
  return merge(parts)
}

function buildTrees(scene: THREE.Scene) {
  const list = TREES
  const mat = vcMat()
  const sets: Item[][] = [[], [], [], []]
  const col = new THREE.Color()
  const rr = rng(55)
  for (const t of list) {
    const dire = t.x > t.y
    const s = t.r * 2.4
    const sp = (dire ? 2 : 0) + (t.tone > 0.5 ? 0 : 1)
    const v = 0.78 + rr() * 0.4
    if (dire) col.setRGB(v, v * (0.9 + rr() * 0.12), v * 0.95)
    else col.setRGB(v * (0.9 + rr() * 0.15), v, v * (0.85 + rr() * 0.15))
    const hs = s * (0.9 + rr() * 0.35)
    sets[sp].push({ x: t.x, y: 0, z: t.y, sx: s * (0.9 + rr() * 0.2), sy: dire && sp === 2 ? hs * 1.1 : hs, sz: s * (0.9 + rr() * 0.2), ry: rr() * 6.28, rz: (rr() - 0.5) * 0.08, rx: (rr() - 0.5) * 0.08, c: col.clone() })
  }
  instanced(scene, leafyGeo(), mat, sets[0])
  instanced(scene, pineGeo(), mat, sets[1])
  instanced(scene, deadGeo(), mat, sets[2])
  instanced(scene, spikyGeo(), mat, sets[3])
}

/* --------------------------------------------------------------------- rocks */

function buildRocks(scene: THREE.Scene, plan: Plan) {
  const geo = paint(jitter(new THREE.IcosahedronGeometry(1, 1), 0.3, 5, 0.1), '#ffffff')
  const r = rng(2025)
  const items: Item[] = []
  const col = new THREE.Color()
  for (const o of ROCKS) {
    const dire = o.x > o.y
    const v = 0.8 + r() * 0.4
    if (dire) {
      if (r() < 0.12) col.setRGB(0.3 * v, 0.07 * v, 0.045 * v)
      else col.setRGB(0.07 * v, 0.06 * v, 0.06 * v)
    } else col.setRGB(0.22 * v, 0.24 * v, 0.17 * v)
    items.push({ x: o.x, y: o.h * 0.32, z: o.y, sx: o.w, sy: o.h, sz: o.w * (0.7 + r() * 0.5), ry: r() * 6.28, rx: (r() - 0.5) * o.tilt, rz: (r() - 0.5) * o.tilt, c: col.clone() })
  }
  instanced(scene, geo, vcMat({ roughness: 1 }), items)
}

/* -------------------------------------------------------------- ground cover */

function buildGroundCover(scene: THREE.Scene, plan: Plan) {
  const r = rng(808)
  const nearCamp = (x: number, y: number, d: number) => plan.camps.some((c) => Math.hypot(c.x - x, c.y - y) < d)
  const nearFord = (x: number, y: number) => plan.fords.some((c) => Math.hypot(c.x - x, c.y - y) < 450)
  const spots = (n: number, dire: boolean, near?: Pt) => {
    const out: Pt[] = []
    for (let g = 0; g < 100000 && out.length < n; g++) {
      let x: number
      let y: number
      if (near) {
        const a = r() * 6.28
        const d = 680 + r() * 650
        x = near.x + Math.cos(a) * d
        y = near.y + Math.sin(a) * d
      } else {
        x = r() * MAP
        y = r() * MAP
      }
      if (x < 30 || y < 30 || x > MAP - 30 || y > MAP - 30) continue
      if ((x > y) !== dire) continue
      if (laneDist(x, y) < 235 || riverDist(x, y) < 350 || baseDist(x, y) < 690 || fountainDist(x, y) < 590) continue
      if (nearFord(x, y) || nearCamp(x, y, 190)) continue
      out.push({ x, y })
    }
    return out
  }
  // grass tufts
  const blade = (yaw: number, tilt: number) => {
    const g = new THREE.ConeGeometry(0.07, 1, 3)
    g.translate(0, 0.5, 0)
    return xf(g, 0, 0, 0, 0, yaw, tilt)
  }
  const tuft = merge([blade(0, 0.25), blade(2.1, 0.35), blade(4.2, 0.2), blade(1, 0.5)].map((g) => paintGrad(g, '#27501f', '#9ad45a')))
  const gi: Item[] = []
  const col = new THREE.Color()
  const addGrass = (p: Pt) => {
    const h = 26 + r() * 40
    const v = 0.8 + r() * 0.45
    col.setRGB(v * (0.85 + r() * 0.25), v, v * 0.8)
    gi.push({ x: p.x, y: 0, z: p.y, sx: h * 1.1, sy: h, sz: h * 1.1, ry: r() * 6.28, c: col.clone() })
  }
  spots(4200, false).forEach(addGrass)
  for (const b of [BASE_POS[0]]) spots(900, false, b).forEach(addGrass)
  instanced(scene, tuft, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), gi, false)

  // dire: obsidian shards with ember tips
  const shardGeo = (yaw: number, tilt: number, rad: number) => {
    const g = new THREE.ConeGeometry(rad, 1, 4)
    g.translate(0, 0.5, 0)
    return paintGrad(xf(g, 0, 0, 0, 0, yaw, tilt), '#1b1413', '#9a4a2a')
  }
  const shard = merge([shardGeo(0, 0.1, 0.12), shardGeo(2, 0.45, 0.09), shardGeo(4, 0.35, 0.08)])
  const si: Item[] = []
  const addShard = (p: Pt) => {
    const h = 22 + r() * 60
    const v = 0.7 + r() * 0.6
    col.setRGB(v, v * 0.9, v * 0.9)
    si.push({ x: p.x, y: 0, z: p.y, sx: h * 0.9, sy: h, sz: h * 0.9, ry: r() * 6.28, c: col.clone() })
  }
  spots(2400, true).forEach(addShard)
  spots(700, true, BASE_POS[1]).forEach(addShard)
  instanced(scene, shard, vcMat({ roughness: 0.7, metalness: 0.15 }), si, false)

  // radiant bushes
  const bush = merge([
    paint(xf(jitter(new THREE.IcosahedronGeometry(0.5, 0), 0.2, 3), 0, 0.3, 0, 0, 0, 0, 1, 0.75, 1), '#2e7e32'),
    paint(xf(jitter(new THREE.IcosahedronGeometry(0.35, 0), 0.2, 4), 0.35, 0.22, 0.1), '#3d9440'),
    paint(xf(jitter(new THREE.IcosahedronGeometry(0.3, 0), 0.2, 5), -0.3, 0.2, -0.15), '#4aa648'),
  ])
  const bi: Item[] = []
  const addBush = (p: Pt) => {
    const s = 55 + r() * 60
    const v = 0.85 + r() * 0.3
    col.setRGB(v, v, v * 0.9)
    bi.push({ x: p.x, y: 0, z: p.y, sx: s, sy: s * (0.7 + r() * 0.5), sz: s, ry: r() * 6.28, c: col.clone() })
  }
  spots(260, false).forEach(addBush)
  spots(110, false, BASE_POS[0]).forEach(addBush)
  instanced(scene, bush, vcMat(), bi, true)
}

/* --------------------------------------------------------------------- bases */

function buildBases(scene: THREE.Scene) {
  const colHex = ['#f2cf6a', '#ff5a2a']
  // radiant marble column, dire obelisk
  const column = merge([
    paint(xf(new THREE.BoxGeometry(0.95, 0.2, 0.95), 0, 0.1, 0), '#bfb9a2'),
    paint(xf(new THREE.CylinderGeometry(0.27, 0.34, 3.4, 7), 0, 1.9, 0), '#ece6d0'),
    paint(xf(new THREE.CylinderGeometry(0.42, 0.3, 0.3, 7), 0, 3.75, 0), '#f2cf6a'),
    paint(xf(new THREE.BoxGeometry(0.9, 0.18, 0.9), 0, 3.99, 0), '#ece6d0'),
  ])
  const obelisk = merge([
    paint(xf(new THREE.BoxGeometry(1.1, 0.35, 1.1), 0, 0.17, 0), '#2a2430'),
    paint(xf(new THREE.CylinderGeometry(0.12, 0.45, 3.6, 4), 0, 2.15, 0, 0, Math.PI / 4), '#1b1720'),
    paint(xf(new THREE.ConeGeometry(0.16, 0.9, 4), 0, 4.4, 0, 0, Math.PI / 4), '#3a2a34'),
  ])
  const orbGeo = new THREE.OctahedronGeometry(0.3, 0)
  const rr = rng(66)
  const orbs: Item[] = []
  const pills: Item[][] = [[], []]
  const T4 = [...T4_POS, ...T4_POS.map(mirror)]
  for (let team = 0; team < 2; team++) {
    const b = BASE_POS[team]
    const n = 30
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + 0.1
      const R = 1070
      const x = b.x + Math.cos(a) * R
      const y = b.y + Math.sin(a) * R
      if (x < 160 || y < 160 || x > MAP - 160 || y > MAP - 160) continue
      if (laneDist(x, y) < 470 || fountainDist(x, y) < 700) continue
      if (T4.some((t) => Math.hypot(t.x - x, t.y - y) < 260)) continue
      const s = 52 + rr() * 8
      pills[team].push({ x, y: 0, z: y, sx: s, sy: s * (team === 0 ? 1 : 1.15), sz: s, ry: rr() * 6.28 })
      orbs.push({ x, y: s * (team === 0 ? 4.55 : 5.0), z: y, sx: s * 0.9, sy: s * (team === 0 ? 0.9 : 1.5), sz: s * 0.9, ry: 0, c: new THREE.Color(colHex[team]) })
    }
  }
  instanced(scene, column, vcMat({ roughness: 0.6 }), pills[0])
  instanced(scene, obelisk, vcMat({ roughness: 0.5, metalness: 0.2 }), pills[1])
  instanced(scene, orbGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), orbs, false)
}

/* ---------------------------------------------------------------------- pads */

function cobbleTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#4b483f'
  ctx.fillRect(0, 0, 512, 512)
  const r = rng(9)
  for (let y = 0; y < 512; y += 46) {
    for (let x = (y / 46) % 2 ? -23 : 0; x < 512; x += 46) {
      const v = 120 + r() * 60
      ctx.fillStyle = `rgb(${v},${v * 0.97},${v * 0.88})`
      ctx.beginPath()
      ctx.roundRect(x + 3, y + 3, 40, 40, 9)
      ctx.fill()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2.6, 2.6)
  return t
}

function buildPads(scene: THREE.Scene, plan: Plan, tick: Array<(t: number) => void>) {
  // stone fords where the lanes cross the river
  const cobble = cobbleTexture()
  const fordMat = new THREE.MeshStandardMaterial({ map: cobble, color: '#b8b4a8', roughness: 0.95 })
  const railMat = new THREE.MeshStandardMaterial({ color: '#8a7a5a', roughness: 0.9, flatShading: true })
  for (const f of plan.fords) {
    // a bridge across the river (the river runs along the x = y diagonal)
    const g = new THREE.Group()
    const deck = new THREE.Mesh(new THREE.BoxGeometry(900, 10, 330), fordMat)
    deck.position.y = 5
    deck.receiveShadow = true
    g.add(deck)
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(900, 26, 18), railMat)
      rail.position.set(0, 22, s * 160)
      rail.castShadow = true
      g.add(rail)
      for (let i = -4; i <= 4; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(22, 52, 22), railMat)
        post.position.set(i * 110, 26, s * 160)
        post.castShadow = true
        g.add(post)
      }
    }
    g.position.set(f.x, 0, f.y)
    g.rotation.y = Math.PI / 4
    scene.add(g)
  }
  // rune pads on the river
  const glow = new THREE.MeshBasicMaterial({ color: '#ffd24a' })
  const stone = new THREE.MeshStandardMaterial({ color: '#6c6a62', roughness: 0.9, flatShading: true })
  const gems: THREE.Mesh[] = []
  for (const p of plan.runes) {
    const g = new THREE.Group()
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(115, 135, 8, 8), stone)
    pad.position.y = 4
    pad.receiveShadow = true
    const ring = new THREE.Mesh(new THREE.TorusGeometry(92, 6, 6, 24), glow)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 9
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(26, 0), glow)
    gem.scale.y = 1.7
    gem.position.y = 78
    gems.push(gem)
    g.add(pad, ring, gem)
    g.position.set(p.x, 0, p.y)
    scene.add(g)
  }
  tick.push((t) => {
    gems.forEach((gm, i) => {
      gm.rotation.y = t * 1.5 + i
      gm.position.y = 78 + Math.sin(t * 2 + i) * 8
    })
  })
}

/* --------------------------------------------------------------------- pools */

function buildPools(scene: THREE.Scene, plan: Plan, tick: Array<(t: number) => void>) {
  const r = rng(515)
  const placed: Array<Pt & { r: number }> = []
  const find = (dire: boolean, rad: number) => {
    for (let g = 0; g < 6000; g++) {
      const x = 500 + r() * (MAP - 1000)
      const y = 500 + r() * (MAP - 1000)
      if ((x - y > 1200) !== dire || (y - x > 1200) === dire) continue
      if (laneDist(x, y) < 520 + rad || riverDist(x, y) < 700 + rad || baseDist(x, y) < 1500) continue
      if (plan.camps.some((c) => Math.hypot(c.x - x, c.y - y) < 420 + rad)) continue
      if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < 800)) continue
      placed.push({ x, y, r: rad })
      return { x, y }
    }
    return null
  }
  const lavaMat = new THREE.MeshBasicMaterial({ color: '#ff6a1c' })
  const haloMat = new THREE.MeshBasicMaterial({ color: '#ff5a14', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
  const rimMat = new THREE.MeshStandardMaterial({ color: '#1c1210', roughness: 1 })
  const pondMat = new THREE.MeshStandardMaterial({ color: '#3a9ab0', roughness: 0.1, metalness: 0.25, transparent: true, opacity: 0.92 })
  const pondRim = new THREE.MeshStandardMaterial({ color: '#6c6c58', roughness: 1 })
  const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, h: number) => {
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, h, y)
    scene.add(m)
    return m
  }
  for (let i = 0; i < 7; i++) {
    const rad = 90 + r() * 80
    const p = find(true, rad)
    if (!p) continue
    flat(new THREE.CircleGeometry(rad * 2.4, 24), haloMat, p.x, p.y, 1.0).renderOrder = 2
    flat(new THREE.CircleGeometry(rad * 1.3, 20), rimMat, p.x, p.y, 1.2)
    flat(new THREE.CircleGeometry(rad, 20), lavaMat, p.x, p.y, 1.6)
  }
  for (let i = 0; i < 5; i++) {
    const rad = 110 + r() * 100
    const p = find(false, rad)
    if (!p) continue
    flat(new THREE.CircleGeometry(rad * 1.18, 20), pondRim, p.x, p.y, 1.2)
    flat(new THREE.CircleGeometry(rad, 20), pondMat, p.x, p.y, 1.6)
  }
  tick.push((t) => {
    lavaMat.color.setHSL(0.045, 1, 0.48 + 0.06 * Math.sin(t * 3))
    haloMat.opacity = 0.22 + 0.06 * Math.sin(t * 2.3)
  })
}


/* --------------------------------------------------------------- base high ground */

/** The base sits on a high-ground plateau: sheer rock cliffs all round, entered only by the three lane ramps. */
function buildWalls(scene: THREE.Scene) {
  const geo = paint(jitter(new THREE.IcosahedronGeometry(1, 1), 0.28, 9, 0.12), '#ffffff')
  const r = rng(515)
  const items: Item[] = []
  const col = new THREE.Color()
  const rockCol = (rad: boolean) => {
    const v = 0.85 + r() * 0.3
    if (rad) col.setRGB(0.36 * v, 0.34 * v, 0.29 * v)
    else col.setRGB(0.11 * v, 0.09 * v, 0.1 * v)
    return col.clone()
  }
  WALLS.forEach((w, i) => {
    const rad = i < WALLS.length / 2
    const dx = w.b.x - w.a.x
    const dz = w.b.y - w.a.y
    const L = Math.hypot(dx, dz)
    const ux = dx / L
    const uz = dz / L
    const nx = -uz
    const nz = ux
    for (let s = 0; s <= L; s += 70) {
      for (let row = 0; row < 3; row++) {
        const jx = (r() - 0.5) * 30
        const off = (row - 1) * 70 + jx
        const x = w.a.x + ux * s + nx * off
        const z = w.a.y + uz * s + nz * off
        if (x < -80 || z < -80 || x > MAP + 80 || z > MAP + 80) continue
        const wd = 90 + r() * 70
        const h = (row === 1 ? 380 : 270) + r() * 170
        items.push({ x, y: h * 0.36, z, sx: wd, sy: h, sz: wd * (0.8 + r() * 0.4), ry: r() * 6.28, rx: (r() - 0.5) * 0.2, rz: (r() - 0.5) * 0.2, c: rockCol(rad) })
      }
    }
    // massive boulders flanking the ramp mouths
    for (const end of [w.a, w.b]) {
      if (end.x <= 1 || end.y <= 1 || end.x >= MAP - 1 || end.y >= MAP - 1) continue
      for (let k = 0; k < 3; k++) {
        const wd = 130 + r() * 70
        const h = 480 + r() * 160
        items.push({ x: end.x + (r() - 0.5) * 90, y: h * 0.36, z: end.y + (r() - 0.5) * 90, sx: wd, sy: h, sz: wd, ry: r() * 6.28, rx: 0.1, rz: -0.1, c: rockCol(rad) })
      }
    }
  })
  instanced(scene, geo, vcMat({ roughness: 1 }), items)
}

/* -------------------------------------------------------------- outer forest */

/** Dense impassable forest and rock belt beyond the playable map, so the edges never show void. */
function buildOuterForest(scene: THREE.Scene) {
  const r = rng(7771)
  const sets: Item[][] = [[], [], [], []]
  const rocks: Item[] = []
  const col = new THREE.Color()
  const SPAN = 3600
  const outside = (x: number, y: number) => x < 30 || y < 30 || x > MAP - 30 || y > MAP - 30
  for (let g = 0, n = 0; g < 60000 && n < 5200; g++) {
    const x = -SPAN + r() * (MAP + SPAN * 2)
    const y = -SPAN + r() * (MAP + SPAN * 2)
    if (!outside(x, y)) continue
    const dire = x > y
    const sc = (38 + r() * 40) * 2.4
    const sp = (dire ? 2 : 0) + (r() > 0.5 ? 0 : 1)
    const v = 0.7 + r() * 0.4
    if (dire) col.setRGB(v, v * (0.9 + r() * 0.1), v * 0.92)
    else col.setRGB(v * (0.85 + r() * 0.15), v, v * (0.8 + r() * 0.15))
    sets[sp].push({ x, y: 0, z: y, sx: sc, sy: sc * (0.9 + r() * 0.6), sz: sc, ry: r() * 6.28, c: col.clone() })
    n++
  }
  for (let g = 0, n = 0; g < 30000 && n < 700; g++) {
    const x = -SPAN + r() * (MAP + SPAN * 2)
    const y = -SPAN + r() * (MAP + SPAN * 2)
    if (!outside(x, y)) continue
    const w = 70 + r() * 150
    const v = 0.8 + r() * 0.4
    if (x > y) col.setRGB(0.1 * v, 0.08 * v, 0.08 * v)
    else col.setRGB(0.24 * v, 0.26 * v, 0.2 * v)
    rocks.push({ x, y: w * 0.3, z: y, sx: w, sy: w * (0.6 + r() * 0.8), sz: w * (0.8 + r() * 0.4), ry: r() * 6.28, rx: (r() - 0.5) * 0.3, rz: (r() - 0.5) * 0.3, c: col.clone() })
    n++
  }
  const mat = vcMat()
  instanced(scene, leafyGeo(), mat, sets[0])
  instanced(scene, pineGeo(), mat, sets[1])
  instanced(scene, deadGeo(), mat, sets[2])
  instanced(scene, spikyGeo(), mat, sets[3])
  instanced(scene, paint(jitter(new THREE.IcosahedronGeometry(1, 1), 0.3, 5, 0.1), '#ffffff'), vcMat({ roughness: 1 }), rocks)
}
