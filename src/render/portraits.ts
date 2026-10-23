import * as THREE from 'three'
import { HERO_BY_ID } from '../sim/heroes'
import { buildHero } from './heroes3d'

const SIZE = 192
const cache = new Map<string, string>()
let gl: THREE.WebGLRenderer | null = null

function backdrop(c1: string, c2: string) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const g = cv.getContext('2d')!
  const gr = g.createRadialGradient(64, 50, 4, 64, 64, 90)
  gr.addColorStop(0, c1)
  gr.addColorStop(1, c2)
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Renders the hero's 3D model to a bust portrait (data URL), cached per hero. */
export function heroPortrait(id: string): string {
  const hit = cache.get(id)
  if (hit) return hit
  const def = HERO_BY_ID[id]
  try {
    if (!gl) {
      gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
      gl.setSize(SIZE, SIZE, false)
      gl.setPixelRatio(1)
      gl.outputColorSpace = THREE.SRGBColorSpace
      gl.toneMapping = THREE.ACESFilmicToneMapping
      gl.shadowMap.enabled = false
    }
    const scene = new THREE.Scene()
    scene.background = backdrop(def.color, '#0c0d10')
    scene.add(new THREE.HemisphereLight('#dfe8ff', '#4a4030', 1.1))
    const key = new THREE.DirectionalLight('#fff2d8', 2.4)
    key.position.set(300, 400, 500)
    scene.add(key)
    const rim = new THREE.DirectionalLight('#8ab0ff', 1.2)
    rim.position.set(-400, 200, -300)
    scene.add(rim)
    const m = buildHero(id, def.color, def.color2, 0, 40)
    scene.add(m.group)
    const H = m.height
    const cam = new THREE.PerspectiveCamera(28, 1, 10, 5000)
    const a = (38 * Math.PI) / 180
    const d = H * 1.55
    const ty = H * 0.68
    cam.position.set(Math.cos(a) * d, ty + H * 0.08, Math.sin(a) * d)
    cam.lookAt(0, ty, 0)
    gl.render(scene, cam)
    const url = gl.domElement.toDataURL('image/png')
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
    cache.set(id, url)
    return url
  } catch {
    return ''
  }
}
