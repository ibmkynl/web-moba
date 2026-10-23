import { heroPortrait } from './portraits'
import { TREES, RIVER } from '../sim/obstacles'
import { LANES, MAP, PATHS, Pt, TEAM_COLOR, Team } from '../sim/constants'
import type { World } from '../sim/world'

/** The minimap: map art, units, wards, runes, the player's route and the camera rectangle. */
export class Minimap {
  /** camera centre, viewport size and zoom of the main view (for the camera rectangle) */
  cam: Pt = { x: 0, y: 0 }
  W = 0
  H = 0
  scale = 0.6
  myTeam: Team = 0
  /** The player's current route. */
  route: Pt[] | null = null
  /** The painted ground of the 3D map, drawn dimmed as the minimap background. */
  groundImg: HTMLCanvasElement | null = null
  private heroIcons = new Map<string, HTMLImageElement>()

  constructor(public w: World) {}

  private heroIcon(id: string): HTMLImageElement | null {
    let im = this.heroIcons.get(id)
    if (!im) {
      im = new Image()
      const url = heroPortrait(id)
      if (!url) return null
      im.src = url
      this.heroIcons.set(id, im)
    }
    return im.complete && im.naturalWidth > 0 ? im : null
  }

  /** Static map art (ground, river, forest, lanes, vignette) rendered once per minimap size. */
  private bg: HTMLCanvasElement | null = null
  private bgKey = ''
  private background(size: number) {
    const key = `${size}|${!!this.groundImg}`
    if (this.bg && this.bgKey === key) return this.bg
    const cv = document.createElement('canvas')
    cv.width = cv.height = size
    const c = cv.getContext('2d')!
    const s = size / MAP
    c.lineJoin = 'round'
    c.lineCap = 'round'
    const stroke = (pts: Pt[], wd: number, col: string) => {
      c.beginPath()
      pts.forEach((p, i) => (i ? c.lineTo(p.x * s, p.y * s) : c.moveTo(p.x * s, p.y * s)))
      c.strokeStyle = col
      c.lineWidth = wd
      c.stroke()
    }
    if (this.groundImg) {
      // the real map art, slightly dimmed for contrast
      c.imageSmoothingEnabled = true
      c.drawImage(this.groundImg, 0, 0, size, size)
      c.fillStyle = 'rgba(0,0,0,0.16)'
      c.fillRect(0, 0, size, size)
      stroke(RIVER, 13, 'rgba(24,70,104,0.9)')
      stroke(RIVER, 9, 'rgba(60,150,196,0.95)')
      stroke(RIVER, 3, 'rgba(180,230,255,0.5)')
      // forest: tree canopy dots, greener on the Radiant side and ashier on the Dire side
      for (const t of TREES) {
        c.fillStyle = t.x > t.y ? 'rgba(46,40,30,0.7)' : 'rgba(18,70,26,0.72)'
        c.beginPath()
        c.arc(t.x * s, t.y * s, 1.9 + t.r * 0.012, 0, Math.PI * 2)
        c.fill()
      }
      // lane edges
      for (const lane of LANES) stroke(PATHS[0][lane].pts, 5.5, 'rgba(214,186,128,0.55)')
      // soft inner vignette
      const vg = c.createRadialGradient(size / 2, size / 2, size * 0.4, size / 2, size / 2, size * 0.72)
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, 'rgba(0,0,0,0.35)')
      c.fillStyle = vg
      c.fillRect(0, 0, size, size)
    } else {
      c.fillStyle = '#16301a'
      c.fillRect(0, 0, size, size)
      stroke(RIVER, 11, '#2b6a8a')
      for (const lane of LANES) stroke(PATHS[0][lane].pts, 6, '#7c6a45')
    }
    this.bg = cv
    this.bgKey = key
    return cv
  }

  drawMinimap(c: CanvasRenderingContext2D, size: number) {
    const w = this.w
    const s = size / MAP
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, size, size)
    c.lineJoin = 'round'
    c.lineCap = 'round'
    const stroke = (pts: Pt[], wd: number, col: string) => {
      c.beginPath()
      pts.forEach((p, i) => (i ? c.lineTo(p.x * s, p.y * s) : c.moveTo(p.x * s, p.y * s)))
      c.strokeStyle = col
      c.lineWidth = wd
      c.stroke()
    }
    c.drawImage(this.background(size), 0, 0)
    for (const u of w.units) {
      if (u.dead || u.kind === 'fountain') continue
      if (!w.isVisible(this.myTeam, u)) continue
      const x = u.x * s
      const y = u.y * s
      const col = TEAM_COLOR[u.team]
      if (u.kind === 'tower') {
        c.fillStyle = col
        c.fillRect(x - 4, y - 4, 8, 8)
        c.strokeStyle = '#000'
        c.lineWidth = 1
        c.strokeRect(x - 4, y - 4, 8, 8)
      } else if (u.kind === 'ancient') {
        c.fillStyle = col
        c.fillRect(x - 8, y - 8, 16, 16)
        c.strokeStyle = '#000'
        c.strokeRect(x - 8, y - 8, 16, 16)
      } else if (u.kind === 'creep') {
        c.fillStyle = col
        c.fillRect(x - 1.5, y - 1.5, 3, 3)
      } else if (u.kind === 'courier' && u.team === this.myTeam) {
        c.fillStyle = '#ffe9a8'
        c.beginPath()
        c.moveTo(x, y - 5)
        c.lineTo(x + 4, y)
        c.lineTo(x, y + 5)
        c.lineTo(x - 4, y)
        c.closePath()
        c.fill()
        c.strokeStyle = '#000'
        c.lineWidth = 1
        c.stroke()
      }
    }
    for (const r of w.runes) {
      if (!w.runeVisible(this.myTeam, r)) continue
      c.save()
      c.translate(r.x * s, r.y * s)
      c.rotate(Math.PI / 4)
      c.fillStyle = r.kind === 'bounty' ? '#ffd24a' : '#ffffff'
      c.fillRect(-4, -4, 8, 8)
      c.lineWidth = 1.5
      c.strokeStyle = '#000'
      c.strokeRect(-4, -4, 8, 8)
      c.restore()
    }
    for (const wd of w.wards) {
      if (wd.team !== this.myTeam) continue
      c.beginPath()
      c.arc(wd.x * s, wd.y * s, 4.5, 0, Math.PI * 2)
      c.fillStyle = '#ffe9a8'
      c.fill()
      c.lineWidth = 1.5
      c.strokeStyle = '#7a5a10'
      c.stroke()
    }
    for (const h of w.heroes) {
      if (h.dead || !w.isVisible(this.myTeam, h)) continue
      const x = h.x * s
      const y = h.y * s
      const me = h === w.player
      const R = me ? 10.5 : 9
      const friend = h.team === this.myTeam
      const img = this.heroIcon(h.h!.def.id)
      c.save()
      c.beginPath()
      c.arc(x, y, R, 0, Math.PI * 2)
      c.closePath()
      c.fillStyle = h.h!.def.color
      c.fill()
      if (img) {
        c.clip()
        c.drawImage(img, x - R, y - R, R * 2, R * 2)
      }
      c.restore()
      c.beginPath()
      c.arc(x, y, R, 0, Math.PI * 2)
      c.lineWidth = 2.6
      c.strokeStyle = friend ? '#3a9bff' : '#ff3a3a'
      c.stroke()
      if (me) {
        c.beginPath()
        c.arc(x, y, R + 2.4, 0, Math.PI * 2)
        c.lineWidth = 1.4
        c.strokeStyle = '#ffffff'
        c.stroke()
      }
    }
    // camera rect
    if (this.route && this.route.length > 1) {
      c.save()
      c.setLineDash([5, 4])
      stroke(this.route, 2.6, 'rgba(0,0,0,0.7)')
      stroke(this.route, 1.6, '#7dff9a')
      c.setLineDash([])
      const g = this.route[this.route.length - 1]
      c.beginPath()
      c.arc(g.x * s, g.y * s, 3.2, 0, Math.PI * 2)
      c.fillStyle = '#7dff9a'
      c.fill()
      c.strokeStyle = '#000'
      c.lineWidth = 1
      c.stroke()
      c.restore()
    }
    const hw = this.W / 2 / this.scale
    const hh = this.H / 2 / this.scale
    c.strokeStyle = 'rgba(255,255,255,0.8)'
    c.lineWidth = 1.5
    c.strokeRect((this.cam.x - hw) * s, (this.cam.y - hh) * s, hw * 2 * s, hh * 2 * s)
  }
}
