import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Model } from './modelkit'

/**
 * Cuts a procedural model's draw calls: every mesh that never moves relative to its nearest animated ancestor is baked
 * into one geometry per material under that ancestor. Animated parts are found by probing `model.update` (plus the
 * pivots the renderer itself animates), so builders need no annotations. Merged geometry is cached per `key` and shared
 * by every instance; materials stay per unit because hit flash and fading change them per unit.
 */

interface Pose {
  p: THREE.Vector3
  q: THREE.Quaternion
  s: THREE.Vector3
  v: boolean
}
interface MatState {
  c?: number
  e?: number
  ei?: number
  o: number
  v: boolean
}

const PROBE_T = [0.05, 0.4, 1.1, 2.3, 3.7, 6.2]
const PROBE_ST = [
  { moving: false, casting: false, attacking: false },
  { moving: true, casting: false, attacking: false },
  { moving: false, casting: true, attacking: false },
  { moving: false, casting: false, attacking: true },
  { moving: true, casting: true, attacking: true },
]

const pose = (o: THREE.Object3D): Pose => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible })
const samePose = (o: THREE.Object3D, a: Pose) =>
  o.visible === a.v && o.position.distanceToSquared(a.p) < 1e-8 && Math.abs(o.quaternion.dot(a.q)) > 1 - 1e-9 && o.scale.distanceToSquared(a.s) < 1e-10
const matState = (m: THREE.Material): MatState => {
  const x = m as THREE.MeshStandardMaterial
  return { c: x.color?.getHex(), e: x.emissive?.getHex(), ei: x.emissiveIntensity, o: m.opacity, v: m.visible }
}
const sameMat = (m: THREE.Material, a: MatState) => {
  const b = matState(m)
  return b.c === a.c && b.e === a.e && b.ei === a.ei && b.o === a.o && b.v === a.v
}

/** Objects and materials the model (or the renderer) changes over time. */
function probe(m: Model) {
  const pinned = new Set<THREE.Object3D>([m.group])
  // objects whose visibility changes: their subtrees cannot be skinned into an always-drawn mesh
  const toggles = new Set<THREE.Object3D>()
  for (const o of [m.weapon, m.body, m.spin, m.alive, m.rubble, m.shield]) if (o) pinned.add(o)
  for (const o of [m.alive, m.rubble, m.shield]) if (o) toggles.add(o)
  for (const k of ['wheels', 'wings']) {
    const o = m.group.userData[k] as THREE.Object3D | undefined
    if (!o) continue
    pinned.add(o)
    for (const c of o.children) pinned.add(c)
  }
  const liveMats = new Set<THREE.Material>()
  if (!m.update) return { pinned, toggles, liveMats }
  const objs: THREE.Object3D[] = []
  m.group.traverse((o) => objs.push(o))
  const poses = objs.map(pose)
  const mats = new Set<THREE.Material>()
  for (const o of objs) {
    const mt = (o as THREE.Mesh).material
    if (mt) for (const x of Array.isArray(mt) ? mt : [mt]) mats.add(x)
  }
  const matList = [...mats]
  const states = matList.map(matState)
  for (const st of PROBE_ST) {
    for (const t of PROBE_T) {
      m.update(t, st)
      objs.forEach((o, i) => {
        if (!samePose(o, poses[i])) pinned.add(o)
        if (o.visible !== poses[i].v) toggles.add(o)
      })
      matList.forEach((x, i) => {
        if (!liveMats.has(x) && !sameMat(x, states[i])) liveMats.add(x)
      })
    }
  }
  // restore the rest pose so the first rendered frame matches an unprobed model
  objs.forEach((o, i) => {
    const a = poses[i]
    o.position.copy(a.p)
    o.quaternion.copy(a.q)
    o.scale.copy(a.s)
    o.visible = a.v
  })
  matList.forEach((x, i) => {
    const a = states[i]
    const s = x as THREE.MeshStandardMaterial
    if (a.c !== undefined) s.color.setHex(a.c)
    if (a.e !== undefined) s.emissive.setHex(a.e)
    if (a.ei !== undefined) s.emissiveIntensity = a.ei
    x.opacity = a.o
    x.visible = a.v
  })
  return { pinned, toggles, liveMats }
}

/** Identical-looking materials collapse to one so their meshes can merge (never the ones the model animates).
 *  Without `color`, the key groups materials that differ only in base colour, which can then share one material
 *  with the colour baked into the vertices. */
function matKey(m: THREE.Material, color = true) {
  const x = m as THREE.MeshStandardMaterial
  return [
    m.type, color ? x.color?.getHex() : '', x.emissive?.getHex(), x.emissiveIntensity, x.roughness, x.metalness, x.flatShading, m.side, m.transparent,
    m.opacity, m.blending, m.depthWrite, m.depthTest, x.map?.uuid, m.vertexColors, (x as any).wireframe, m.alphaTest,
  ].join('|')
}

/** Attributes a merged part keeps: uv only when the material has a texture (colour is decided per bucket). */
const attrSig = (g: THREE.BufferGeometry, mat: THREE.Material) =>
  ['position', 'normal', ...((mat as THREE.MeshBasicMaterial).map ? ['uv'] : [])].filter((a) => g.getAttribute(a)).join(',')

/** Geometry in the anchor's space, non-indexed, with winding fixed for mirrored transforms.
 *  `colorize` bakes the material's base colour into a vertex colour attribute. */
function bake(mesh: THREE.Mesh, toAnchor: THREE.Matrix4, colorize: boolean) {
  const mat = mesh.material as THREE.MeshStandardMaterial
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  const keep = ['position', 'normal', ...(mat.map ? ['uv'] : []), ...(colorize || mat.vertexColors ? ['color'] : [])]
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name)
  if (colorize) {
    const n = g.getAttribute('position').count
    const own = mat.vertexColors ? (g.getAttribute('color') as THREE.BufferAttribute | undefined) : undefined
    const col = new Float32Array(n * 3)
    const c = mat.color ?? new THREE.Color(1, 1, 1)
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r * (own ? own.getX(i) : 1)
      col[i * 3 + 1] = c.g * (own ? own.getY(i) : 1)
      col[i * 3 + 2] = c.b * (own ? own.getZ(i) : 1)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  g.morphAttributes = {}
  g.applyMatrix4(toAnchor)
  if (toAnchor.determinant() < 0) {
    for (const name of Object.keys(g.attributes)) {
      const at = g.getAttribute(name) as THREE.BufferAttribute
      const n = at.itemSize
      const arr = at.array as Float32Array
      for (let v = 0; v + 2 < at.count; v += 3) {
        for (let k = 0; k < n; k++) {
          const a = (v + 1) * n + k
          const b = (v + 2) * n + k
          const tmp = arr[a]
          arr[a] = arr[b]
          arr[b] = tmp
        }
      }
    }
  }
  g.clearGroups()
  return g
}

const IDENTITY = new THREE.Matrix4()
/** Stand-in geometry for animated meshes whose triangles now live in the skinned mesh (they stay as bones). */
const EMPTY = new THREE.BufferGeometry()

/** Merged geometries per model key, in build order, with vertex counts to detect a builder that changed shape. */
const cache = new Map<string, { geos: THREE.BufferGeometry[]; counts: number[] }>()

interface Bucket {
  /** skinned: bone-space parts drawn by one SkinnedMesh on the root; otherwise baked into `anchor`'s space */
  skinned: boolean
  anchor: THREE.Object3D
  mat: THREE.Material
  mats: Set<THREE.Material>
  shadow: boolean
  order: number
  meshes: THREE.Mesh[]
  /** skinned: the bone each mesh follows */
  bones: THREE.Object3D[]
}

export function optimizeModel(m: Model, key: string): Model {
  const { pinned, toggles, liveMats } = probe(m)
  const root = m.group
  root.updateMatrixWorld(true)

  // one shared material per look
  const byKey = new Map<string, THREE.Material>()
  const remap = (mt: THREE.Material) => {
    if (liveMats.has(mt)) return mt
    const k = matKey(mt)
    const hit = byKey.get(k)
    if (hit) return hit
    byKey.set(k, mt)
    return mt
  }

  const buckets = new Map<string, Bucket>()
  const order: Bucket[] = []
  const bones: THREE.Object3D[] = []
  const boneIdx = new Map<THREE.Object3D, number>()
  const drop: THREE.Mesh[] = []
  const boneMeshes: THREE.Mesh[] = []
  const add = (skinned: boolean, anchor: THREE.Object3D, mesh: THREE.Mesh, bone: THREE.Object3D) => {
    const mat = mesh.material as THREE.Material
    const look = liveMats.has(mat) ? mat.uuid : matKey(mat, false)
    const k = `${skinned ? 'S' : anchor.id}|${look}|${mesh.castShadow}|${mesh.renderOrder}|${attrSig(mesh.geometry, mat)}`
    let b = buckets.get(k)
    if (!b) {
      b = { skinned, anchor, mat, mats: new Set(), shadow: mesh.castShadow, order: mesh.renderOrder, meshes: [], bones: [] }
      buckets.set(k, b)
      order.push(b)
    }
    b.meshes.push(mesh)
    b.bones.push(bone)
    b.mats.add(mat)
    if (skinned && !boneIdx.has(bone)) {
      boneIdx.set(bone, bones.length)
      bones.push(bone)
    }
  }
  const walk = (o: THREE.Object3D, anchor: THREE.Object3D, inToggle: boolean, hidden: boolean) => {
    for (const c of [...o.children]) {
      const isPinned = pinned.has(c)
      const tog = inToggle || toggles.has(c)
      const mesh = c as THREE.Mesh
      const plain = mesh.isMesh && !Array.isArray(mesh.material) && !(mesh as any).isInstancedMesh && !(mesh as any).isSkinnedMesh
      if (plain) {
        mesh.material = remap(mesh.material as THREE.Material)
        if (isPinned) {
          // an animated mesh becomes a bone of the skinned mesh unless its visibility or material is animated
          if (!tog && !liveMats.has(mesh.material as THREE.Material)) {
            add(true, root, mesh, mesh)
            boneMeshes.push(mesh)
          }
        } else if (!hidden && c.visible) {
          if (tog) add(false, anchor, mesh, anchor)
          else add(true, root, mesh, anchor)
          drop.push(mesh)
        } else drop.push(mesh)
      }
      walk(c, isPinned ? c : anchor, tog, isPinned ? false : hidden || !c.visible)
    }
  }
  walk(root, root, false, false)

  // buckets mixing several colours get one vertex-coloured material (a clone of the first, so the unit owns it)
  for (const b of order) {
    if (b.mats.size < 2) continue
    const mt = b.mat.clone() as THREE.MeshStandardMaterial
    mt.color?.setRGB(1, 1, 1)
    mt.vertexColors = true
    b.mat = mt
  }

  const cached = cache.get(key)
  const counts = order.map((b) => b.meshes.reduce((n, me) => n + (me.geometry.index ? me.geometry.index.count : me.geometry.getAttribute('position').count), 0))
  const reuse = !!cached && cached.counts.length === counts.length && cached.counts.every((c, i) => c === counts[i])
  const inv = new THREE.Matrix4()
  const geos = order.map((b, i) => {
    if (reuse) return cached!.geos[i]
    const parts = b.meshes.map((me, j) => {
      const space = b.skinned ? b.bones[j] : b.anchor
      inv.copy(space.matrixWorld).invert()
      const g = bake(me, new THREE.Matrix4().multiplyMatrices(inv, me.matrixWorld), b.mats.size > 1)
      if (b.skinned) {
        const n = g.getAttribute('position').count
        const si = new Uint16Array(n * 4)
        const sw = new Float32Array(n * 4)
        const bi = boneIdx.get(b.bones[j])!
        for (let v = 0; v < n; v++) {
          si[v * 4] = bi
          sw[v * 4] = 1
        }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
      }
      return g
    })
    // mergeGeometries needs identical attribute sets
    const common = Object.keys(parts[0].attributes).filter((a) => parts.every((p) => p.getAttribute(a)))
    for (const p of parts) for (const a of Object.keys(p.attributes)) if (!common.includes(a)) p.deleteAttribute(a)
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)!
    if (parts.length > 1) parts.forEach((p) => p.dispose())
    if (!b.skinned) merged.computeBoundingSphere()
    return merged
  })
  if (!reuse) cache.set(key, { geos, counts })

  // detach the merged originals (their geometry was never uploaded, so nothing to free on the GPU)
  for (const me of drop) {
    const keep = me.children.filter((c) => pinned.has(c) || c.children.length > 0)
    const par = me.parent
    par?.remove(me)
    if (keep.length && par) {
      // a static mesh with animated descendants: keep an empty transform node in its place
      const node = new THREE.Group()
      node.position.copy(me.position)
      node.quaternion.copy(me.quaternion)
      node.scale.copy(me.scale)
      for (const c of keep) node.add(c)
      par.add(node)
    }
  }
  // animated meshes drawn by the skinned mesh stay in the tree as invisible bones (children keep rendering)
  for (const me of boneMeshes) {
    me.geometry = EMPTY
    me.userData.sharedGeo = true
    me.layers.disableAll()
  }
  const skeleton = bones.length ? new THREE.Skeleton(bones as THREE.Bone[], bones.map(() => new THREE.Matrix4())) : null
  order.forEach((b, i) => {
    const mesh = b.skinned ? new THREE.SkinnedMesh(geos[i], b.mat) : new THREE.Mesh(geos[i], b.mat)
    mesh.castShadow = b.shadow
    mesh.renderOrder = b.order
    mesh.userData.sharedGeo = true
    if (b.skinned) {
      root.add(mesh)
      ;(mesh as THREE.SkinnedMesh).bind(skeleton!, IDENTITY)
      ;(mesh as THREE.SkinnedMesh).computeBoundingSphere()
      // limbs swing a little beyond the rest pose
      ;(mesh as THREE.SkinnedMesh).boundingSphere!.radius *= 1.35
    } else {
      mesh.matrixAutoUpdate = false
      b.anchor.add(mesh)
    }
  })
  prune(root, pinned)

  const used = new Set<THREE.MeshStandardMaterial>()
  root.traverse((o) => {
    const mt = (o as THREE.Mesh).material as THREE.Material | undefined
    if (mt && (mt as THREE.MeshStandardMaterial).isMeshStandardMaterial) used.add(mt as THREE.MeshStandardMaterial)
  })
  m.mats = [...used]
  return m
}

/** Removes static groups left empty after merging. */
function prune(o: THREE.Object3D, pinned: Set<THREE.Object3D>) {
  for (const c of [...o.children]) {
    prune(c, pinned)
    if (!pinned.has(c) && !(c as THREE.Mesh).isMesh && c.children.length === 0 && c.type === 'Group') o.remove(c)
  }
}
