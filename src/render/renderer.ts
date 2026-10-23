import { heroPortrait } from './portraits'
import { TREES } from '../sim/obstacles'
import { BASE_POS, FOUNTAIN_POS, LANES, MAP, PATHS, Path, Pt, TEAM_COLOR, Team } from '../sim/constants'
import type { Unit } from '../sim/entities'
import type { Proj, World } from '../sim/world'

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

interface Tree {
  x: number
  y: number
  r: number
  tone: number
}

const RIVER: Pt[] = []
for (let i = -2; i <= 22; i++) {
  const t = i / 20
  const base = t * MAP
  const wob = Math.sin(t * 9) * 260
  RIVER.push({ x: base - wob * 0.7, y: base + wob * 0.7 })
}

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export class Renderer {
  ctx: CanvasRenderingContext2D
  fog: HTMLCanvasElement
  fctx: CanvasRenderingContext2D
  W = 0
  H = 0
  dpr = 1
  cam: Pt = { x: 1500, y: 8000 }
  scale = 0.6
  trees: Tree[] = []
  myTeam: Team = 0
  shake = 0
  skipTrees = false
  private heroIcons = new Map<string, HTMLImageElement>()
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
  /** The player's current route (drawn on the minimap). */
  route: Pt[] | null = null
  groundImg: HTMLCanvasElement | null = null

  constructor(public canvas: HTMLCanvasElement, public w: World) {
    this.ctx = canvas.getContext('2d')!
    this.fog = document.createElement('canvas')
    this.fctx = this.fog.getContext('2d')!
    this.makeTrees()
    this.myTeam = w.player.team
    this.resize()
    this.cam = { x: w.player.x, y: w.player.y }
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.W = window.innerWidth
    this.H = window.innerHeight
    this.canvas.width = this.W * this.dpr
    this.canvas.height = this.H * this.dpr
    this.canvas.style.width = this.W + 'px'
    this.canvas.style.height = this.H + 'px'
    this.fog.width = Math.ceil(this.W / 5)
    this.fog.height = Math.ceil(this.H / 5)
  }

  toWorld(sx: number, sy: number): Pt {
    return { x: this.cam.x + (sx - this.W / 2) / this.scale, y: this.cam.y + (sy - this.H / 2) / this.scale }
  }
  toScreen(wx: number, wy: number): Pt {
    return { x: (wx - this.cam.x) * this.scale + this.W / 2, y: (wy - this.cam.y) * this.scale + this.H / 2 }
  }

  clampCam() {
    const hw = this.W / 2 / this.scale
    const hh = this.H / 2 / this.scale
    this.cam.x = Math.max(hw * 0.4, Math.min(MAP - hw * 0.4, this.cam.x))
    this.cam.y = Math.max(hh * 0.4, Math.min(MAP - hh * 0.4, this.cam.y))
  }

  private makeTrees() {
    this.trees = TREES.map((t) => ({ x: t.x, y: t.y, r: t.r, tone: t.tone }))
  }

  /* ---------------------------------------------------------------- draw */

  draw(ov: Overlay) {
    const { ctx, w } = this
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = '#0b0f0b'
    ctx.fillRect(0, 0, this.W, this.H)
    ctx.save()
    ctx.translate(this.W / 2, this.H / 2)
    ctx.scale(this.scale, this.scale)
    ctx.translate(-this.cam.x, -this.cam.y)

    const vx0 = this.cam.x - this.W / 2 / this.scale - 200
    const vx1 = this.cam.x + this.W / 2 / this.scale + 200
    const vy0 = this.cam.y - this.H / 2 / this.scale - 200
    const vy1 = this.cam.y + this.H / 2 / this.scale + 200
    const vis = (x: number, y: number, r = 0) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1

    this.drawTerrain(vis)
    this.drawZones(vis)

    // buildings first
    for (const u of w.units) {
      if (!u.isBuilding || !vis(u.x, u.y, 250)) continue
      if (u.kind === 'fountain') this.drawFountain(u)
      else this.drawBuilding(u, ov)
    }

    // toggles (rot) under units
    for (const h of w.heroes) {
      if (h.dead || !vis(h.x, h.y, 500)) continue
      for (const a of h.h!.abilities) {
        if (a.def.id === 'pudge_rot' && a.toggled && a.level > 0) {
          const ctx2 = this.ctx
          ctx2.beginPath()
          ctx2.arc(h.x, h.y, 250, 0, Math.PI * 2)
          ctx2.fillStyle = 'rgba(120,190,50,0.16)'
          ctx2.fill()
          ctx2.strokeStyle = 'rgba(150,220,70,0.55)'
          ctx2.lineWidth = 4
          ctx2.stroke()
        }
      }
    }

    // player marker + range circle
    const p = w.player
    if (!p.dead) {
      ctx.beginPath()
      ctx.ellipse(p.x, p.y + 6, p.radius * 1.5, p.radius * 1.1, 0, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'
      ctx.lineWidth = 3
      ctx.stroke()
    }
    if (ov.rangeCircle && !p.dead) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, ov.rangeCircle.r, 0, Math.PI * 2)
      ctx.strokeStyle = ov.rangeCircle.color
      ctx.lineWidth = 4
      ctx.setLineDash([24, 16])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = ov.rangeCircle.color.replace(/[\d.]+\)$/, '0.05)')
      ctx.fill()
    }
    if (ov.line) {
      ctx.strokeStyle = ov.line.color
      ctx.lineWidth = ov.line.width
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(ov.line.from.x, ov.line.from.y)
      ctx.lineTo(ov.line.to.x, ov.line.to.y)
      ctx.stroke()
      ctx.lineCap = 'butt'
    }
    if (ov.aoe) {
      ctx.beginPath()
      ctx.arc(ov.aoe.x, ov.aoe.y, ov.aoe.r, 0, Math.PI * 2)
      ctx.strokeStyle = ov.aoe.color
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.fillStyle = ov.aoe.color.replace(/[\d.]+\)$/, '0.12)')
      ctx.fill()
    }

    // units sorted by y
    const us = w.units.filter((u) => !u.isBuilding && !(u.dead && u.kind === 'hero') && vis(u.x, u.y, 200) && w.isVisible(this.myTeam, u))
    us.sort((a, b) => a.y - b.y)
    for (const u of us) {
      if (u.kind === 'creep') this.drawCreep(u, ov)
      else this.drawHero(u, ov)
    }
    for (const u of us) this.drawBars(u)

    for (const pr of w.projs) if (vis(pr.x, pr.y, 200) || pr.owner.team === this.myTeam) this.drawProj(pr)
    this.drawFx(vis)

    ctx.restore()

    // fog of war
    this.drawFog()

    // night tint
    const night = this.nightAmount()
    if (night > 0.01) {
      ctx.fillStyle = `rgba(10,20,60,${0.28 * night})`
      ctx.fillRect(0, 0, this.W, this.H)
    }
    // vignette
    const g = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.45, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, this.W, this.H)
  }

  nightAmount() {
    const t = this.w.time % 600
    // 0..300 day, 300..600 night with 20s fades
    if (t < 280) return 0
    if (t < 300) return (t - 280) / 20
    if (t < 580) return 1
    return 1 - (t - 580) / 20
  }

  /* ------------------------------------------------------------ terrain */

  /** Paint the flat ground (halves, river, lanes, bases) onto a square canvas of px pixels. */
  paintGround(c: CanvasRenderingContext2D, px: number) {
    const saved = this.ctx
    this.ctx = c
    c.setTransform(px / MAP, 0, 0, px / MAP, 0, 0)
    this.skipTrees = true
    this.drawTerrain(() => true)
    this.skipTrees = false
    this.ctx = saved
  }

  private drawTerrain(vis: (x: number, y: number, r?: number) => boolean) {
    const ctx = this.ctx
    // two halves
    ctx.fillStyle = '#2d5326'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, MAP)
    ctx.lineTo(MAP, MAP)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#4a4326'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(MAP, 0)
    ctx.lineTo(MAP, MAP)
    ctx.closePath()
    ctx.fill()
    // grass patches for texture
    ctx.fillStyle = 'rgba(255,255,255,0.025)'
    for (let gx = 0; gx < MAP; gx += 700) {
      for (let gy = 0; gy < MAP; gy += 700) {
        if (!vis(gx, gy, 700)) continue
        ctx.beginPath()
        ctx.arc(gx + ((gy / 7) % 300), gy + ((gx / 5) % 300), 260, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // river
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    const stroke = (pts: Pt[], width: number, color: string) => {
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.stroke()
    }
    stroke(RIVER, 560, '#1f4a63')
    stroke(RIVER, 440, '#2b6a8a')
    stroke(RIVER, 260, '#3a86a8')
    // lanes
    for (const lane of LANES) {
      const pts = PATHS[0][lane].pts
      stroke(pts, 420, '#4a3d28')
      stroke(pts, 330, '#6e5c3a')
      stroke(pts, 150, '#7c6a45')
    }
    // bases
    for (const team of [0, 1]) {
      const b = BASE_POS[team]
      const g = ctx.createRadialGradient(b.x, b.y, 100, b.x, b.y, 1250)
      g.addColorStop(0, team === 0 ? 'rgba(90,170,70,0.55)' : 'rgba(170,70,50,0.55)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(b.x, b.y, 1250, 0, Math.PI * 2)
      ctx.fill()
      const f = FOUNTAIN_POS[team]
      ctx.beginPath()
      ctx.arc(f.x, f.y, 520, 0, Math.PI * 2)
      ctx.fillStyle = team === 0 ? 'rgba(80,200,120,0.18)' : 'rgba(220,100,70,0.18)'
      ctx.fill()
      ctx.strokeStyle = TEAM_COLOR[team]
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 6
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // map border
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 80
    ctx.strokeRect(-40, -40, MAP + 80, MAP + 80)
    // trees
    for (const t of this.skipTrees ? [] : this.trees) {
      if (!vis(t.x, t.y, 120)) continue
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.beginPath()
      ctx.ellipse(t.x + 8, t.y + t.r * 0.5, t.r * 0.95, t.r * 0.45, 0, 0, Math.PI * 2)
      ctx.fill()
      const dire = t.x > t.y
      ctx.fillStyle = dire ? (t.tone > 0.5 ? '#3a4a22' : '#33411d') : t.tone > 0.5 ? '#1f4a22' : '#1a3f1d'
      ctx.beginPath()
      ctx.arc(t.x, t.y - t.r * 0.3, t.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = dire ? 'rgba(160,170,80,0.18)' : 'rgba(120,200,110,0.2)'
      ctx.beginPath()
      ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.55, t.r * 0.55, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawZones(vis: (x: number, y: number, r?: number) => boolean) {
    const ctx = this.ctx
    const w = this.w
    for (const z of w.zones) {
      if (!vis(z.x, z.y, z.r)) continue
      const active = w.time >= z.start
      ctx.beginPath()
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2)
      ctx.fillStyle = active ? 'rgba(210,170,80,0.16)' : 'rgba(210,170,80,0.06)'
      ctx.fill()
      ctx.strokeStyle = active ? 'rgba(230,190,90,0.8)' : 'rgba(230,190,90,0.4)'
      ctx.lineWidth = 5
      ctx.setLineDash([30, 22])
      ctx.lineDashOffset = -w.time * 40
      ctx.stroke()
      ctx.setLineDash([])
      if (active) {
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4 + w.time * 0.9
          const rr = z.r * (0.2 + 0.7 * (((i * 37) % 10) / 10))
          ctx.fillStyle = 'rgba(255,220,120,0.5)'
          ctx.fillRect(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, 14, 14)
        }
      }
    }
  }

  /* ----------------------------------------------------------- entities */

  private teamCol(u: Unit) {
    return u.team === this.myTeam ? '#6fe06f' : '#e8564a'
  }

  private drawBuilding(u: Unit, ov: Overlay) {
    const ctx = this.ctx
    const col = TEAM_COLOR[u.team]
    if (u.dead) {
      ctx.fillStyle = 'rgba(50,45,40,0.9)'
      ctx.beginPath()
      ctx.arc(u.x, u.y, u.radius * 0.8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(30,28,25,0.9)'
      ctx.beginPath()
      ctx.arc(u.x + 20, u.y - 10, u.radius * 0.45, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    const r = u.radius
    ctx.save()
    ctx.translate(u.x, u.y)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(10, r * 0.4, r * 1.1, r * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
    if (u.kind === 'ancient') {
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, r * 1.5)
      g.addColorStop(0, col + 'aa')
      g.addColorStop(1, col + '00')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#4a4a52'
      this.poly(0, 0, r, 8, Math.PI / 8)
      ctx.fill()
      ctx.fillStyle = '#6a6a74'
      this.poly(0, -8, r * 0.75, 8, Math.PI / 8)
      ctx.fill()
      ctx.fillStyle = col
      ctx.globalAlpha = u.locked ? 0.55 : 0.95
      this.poly(0, -22, r * 0.38, 6, 0)
      ctx.fill()
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = '#5a5c64'
      this.poly(0, 0, r, 6, Math.PI / 6)
      ctx.fill()
      ctx.fillStyle = '#76787f'
      this.poly(0, -10, r * 0.72, 6, Math.PI / 6)
      ctx.fill()
      ctx.fillStyle = '#3c3e44'
      ctx.fillRect(-r * 0.22, -r * 1.35, r * 0.44, r * 0.9)
      ctx.beginPath()
      ctx.arc(0, -r * 1.4, r * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.globalAlpha = u.locked ? 0.5 : 1
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = col
      ctx.lineWidth = 6
      this.poly(0, 0, r, 6, Math.PI / 6)
      ctx.stroke()
    }
    ctx.restore()
    // range ring on hover / when our hero is close
    if (ov.hover === u || (u.team !== this.myTeam && Math.hypot(u.x - this.w.player.x, u.y - this.w.player.y) < u.st.range + 450)) {
      ctx.beginPath()
      ctx.arc(u.x, u.y, u.st.range, 0, Math.PI * 2)
      ctx.strokeStyle = u.team === this.myTeam ? 'rgba(111,224,111,0.28)' : 'rgba(232,86,74,0.4)'
      ctx.lineWidth = 4
      ctx.stroke()
    }
    if (u.locked) {
      ctx.beginPath()
      ctx.arc(u.x, u.y, r * 1.2, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(150,200,255,0.5)'
      ctx.lineWidth = 3
      ctx.stroke()
    }
    this.hpBar(u.x, u.y - r * 1.9 - (u.kind === 'ancient' ? 40 : 0), u.kind === 'ancient' ? 260 : 170, 16, u.hp / u.st.maxHp, u.team === this.myTeam ? '#4fd04f' : '#e04a3a', 0)
  }

  private drawFountain(u: Unit) {
    const ctx = this.ctx
    const col = TEAM_COLOR[u.team]
    const t = this.w.time
    ctx.save()
    ctx.translate(u.x, u.y)
    ctx.fillStyle = '#34363c'
    ctx.beginPath()
    ctx.arc(0, 0, 120, 0, Math.PI * 2)
    ctx.fill()
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(0, 0, 40 + i * 28 + ((t * 20) % 28), 0, Math.PI * 2)
      ctx.strokeStyle = col
      ctx.globalAlpha = 0.5 - i * 0.12
      ctx.lineWidth = 6
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(0, 0, 26, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private poly(x: number, y: number, r: number, n: number, rot: number) {
    const ctx = this.ctx
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2
      const px = x + Math.cos(a) * r
      const py = y + Math.sin(a) * r * 0.85
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    }
    ctx.closePath()
  }

  private drawCreep(u: Unit, ov: Overlay) {
    const ctx = this.ctx
    const friendly = u.team === this.myTeam
    const r = u.radius
    if (u.dead) {
      ctx.globalAlpha = Math.max(0, 1 - (this.w.time - u.deadAt) * 2)
    }
    ctx.save()
    ctx.translate(u.x, u.y)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(0, r * 0.4, r, r * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    // denyable glow
    if (friendly && !u.dead && u.hp < u.st.maxHp * 0.5) {
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.35 * Math.sin(this.w.time * 8)})`
      ctx.lineWidth = 4
      ctx.stroke()
    }
    const body = friendly ? '#58c458' : '#d4503f'
    const dark = friendly ? '#2c7a2c' : '#8a2a20'
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.5, 2, 0, -r * 0.2, r * 1.3)
    g.addColorStop(0, '#fff3')
    g.addColorStop(0.2, body)
    g.addColorStop(1, dark)
    ctx.fillStyle = g
    if (u.sub === 'melee') {
      ctx.beginPath()
      ctx.arc(0, -r * 0.3, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.lineWidth = 3
      ctx.stroke()
      // sword
      ctx.strokeStyle = '#ddd'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(Math.cos(u.facing) * r * 0.6, -r * 0.3 + Math.sin(u.facing) * r * 0.6)
      ctx.lineTo(Math.cos(u.facing) * r * 1.5, -r * 0.3 + Math.sin(u.facing) * r * 1.5)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(0, -r * 1.5)
      ctx.lineTo(r, r * 0.4)
      ctx.lineTo(-r, r * 0.4)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.lineWidth = 3
      ctx.stroke()
    }
    ctx.restore()
    ctx.globalAlpha = 1
    void ov
  }

  private heroLift(u: Unit) {
    if (!u.hasBuff('tk') || !u.extra.liftStart) return 0
    const t = this.w.time
    const total = u.extra.liftEnd - u.extra.liftStart
    const k = (t - u.extra.liftStart) / Math.max(0.1, total)
    return Math.max(0, Math.min(1, Math.sin(Math.min(1, k) * Math.PI) * 1.4)) * 150
  }

  private drawHero(u: Unit, ov: Overlay) {
    const ctx = this.ctx
    const hs = u.h!
    const def = hs.def
    const r = u.radius
    const z = this.heroLift(u)
    const invis = u.isInvisible(this.w.time)
    ctx.save()
    ctx.translate(u.x, u.y)
    if (invis) ctx.globalAlpha = 0.4
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(0, r * 0.5, r * 1.1 * (1 - z / 400), r * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.translate(0, -z)
    const R = r * 1.25
    // team ring
    ctx.beginPath()
    ctx.arc(0, -r * 0.2, R + 7, 0, Math.PI * 2)
    ctx.strokeStyle = this.teamCol(u)
    ctx.lineWidth = 6
    ctx.stroke()
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.7, 3, 0, -r * 0.2, R * 1.2)
    g.addColorStop(0, def.color)
    g.addColorStop(1, def.color2)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, -r * 0.2, R, 0, Math.PI * 2)
    ctx.fill()
    // weapon by hero
    const fx = Math.cos(u.facing)
    const fy = Math.sin(u.facing)
    ctx.save()
    ctx.translate(0, -r * 0.2)
    ctx.lineCap = 'round'
    switch (def.id) {
      case 'pudge':
        ctx.fillStyle = 'rgba(255,200,170,0.25)'
        ctx.beginPath()
        ctx.arc(0, 6, R * 0.7, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#c8c8d0'
        ctx.lineWidth = 9
        ctx.beginPath()
        ctx.moveTo(fx * R * 0.6, fy * R * 0.6)
        ctx.lineTo(fx * (R + 38), fy * (R + 38))
        ctx.stroke()
        break
      case 'sniper':
        ctx.strokeStyle = '#2a2a2e'
        ctx.lineWidth = 7
        ctx.beginPath()
        ctx.moveTo(fx * R * 0.3, fy * R * 0.3)
        ctx.lineTo(fx * (R + 70), fy * (R + 70))
        ctx.stroke()
        ctx.strokeStyle = '#8a6a3a'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(fx * R * 0.3, fy * R * 0.3)
        ctx.lineTo(fx * (R + 20), fy * (R + 20))
        ctx.stroke()
        break
      case 'mirana':
        ctx.strokeStyle = '#e8d870'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.arc(fx * (R + 14), fy * (R + 14), 34, u.facing - 1.2, u.facing + 1.2)
        ctx.stroke()
        break
      case 'axe':
        ctx.strokeStyle = '#5a3a1a'
        ctx.lineWidth = 7
        ctx.beginPath()
        ctx.moveTo(fx * R * 0.5, fy * R * 0.5)
        ctx.lineTo(fx * (R + 40), fy * (R + 40))
        ctx.stroke()
        ctx.fillStyle = '#d8d8e0'
        ctx.beginPath()
        ctx.arc(fx * (R + 38), fy * (R + 38), 22, u.facing - 1.4, u.facing + 1.4)
        ctx.closePath()
        ctx.fill()
        break
      case 'rubick':
        ctx.fillStyle = '#b8a0ff'
        ctx.beginPath()
        ctx.arc(fx * (R + 26), fy * (R + 26), 13, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#d8c8ff'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.fillStyle = '#3a2a7a'
        ctx.beginPath()
        ctx.moveTo(-R * 0.7, -R * 0.55)
        ctx.lineTo(0, -R * 1.65)
        ctx.lineTo(R * 0.7, -R * 0.55)
        ctx.closePath()
        ctx.fill()
        break
    }
    ctx.lineCap = 'butt'
    ctx.restore()
    // initial
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `700 ${Math.round(R * 1.0)}px 'Cinzel', serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(def.name[0], 0, -r * 0.15)
    // statuses
    if (u.isStunned()) {
      const t = this.w.time * 6
      for (let i = 0; i < 3; i++) {
        const a = t + (i * Math.PI * 2) / 3
        ctx.fillStyle = '#ffe36a'
        ctx.font = '700 28px sans-serif'
        ctx.fillText('★', Math.cos(a) * R * 0.9, -R * 1.6 + Math.sin(a) * 10)
      }
    }
    if (u.buffs.some((b) => b.taunt)) {
      ctx.fillStyle = '#ff4a3a'
      ctx.font = '900 44px sans-serif'
      ctx.fillText('!', 0, -R * 2.0)
    }
    ctx.restore()
    // hover highlight
    if (ov.hover === u) {
      ctx.beginPath()
      ctx.arc(u.x, u.y - z, r * 1.8, 0, Math.PI * 2)
      ctx.strokeStyle = u.team === this.myTeam ? 'rgba(111,224,111,0.8)' : 'rgba(255,90,70,0.9)'
      ctx.lineWidth = 4
      ctx.stroke()
    }
    // cast / attack channel indicators
    if (u.casting && u.casting.st.def.id === 'sniper_assassinate' && u.casting.target) {
      const t = u.casting.target
      ctx.strokeStyle = `rgba(255,60,40,${0.4 + 0.4 * Math.sin(this.w.time * 14)})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(u.x, u.y)
      ctx.lineTo(t.x, t.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(t.x, t.y, 70, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (u.channel && u.channel.target) {
      const t = u.channel.target
      ctx.strokeStyle = 'rgba(190,40,40,0.8)'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(u.x, u.y)
      ctx.lineTo(t.x, t.y)
      ctx.stroke()
    }
  }

  private hpBar(x: number, y: number, wd: number, ht: number, frac: number, color: string, lv: number) {
    const ctx = this.ctx
    ctx.fillStyle = '#000000cc'
    ctx.fillRect(x - wd / 2 - 3, y - 3, wd + 6, ht + 6)
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(x - wd / 2, y, wd, ht)
    ctx.fillStyle = color
    ctx.fillRect(x - wd / 2, y, wd * Math.max(0, Math.min(1, frac)), ht)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(x - wd / 2, y, wd * Math.max(0, Math.min(1, frac)), ht * 0.4)
    void lv
  }

  private drawBars(u: Unit) {
    const ctx = this.ctx
    if (u.dead) return
    const z = u.kind === 'hero' ? this.heroLift(u) : 0
    const friend = u.team === this.myTeam
    const col = friend ? '#4fd04f' : '#e04a3a'
    if (u.kind === 'hero') {
      const wd = 150
      const y = u.y - u.radius * 2.6 - z
      this.hpBar(u.x, y, wd, 16, u.hp / u.st.maxHp, col, 0)
      if (u.st.maxMana > 0) {
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(u.x - wd / 2, y + 16, wd, 9)
        ctx.fillStyle = '#4a8ae8'
        ctx.fillRect(u.x - wd / 2, y + 16, wd * (u.mana / u.st.maxMana), 9)
      }
      // level badge
      ctx.fillStyle = '#000000d0'
      ctx.fillRect(u.x - wd / 2 - 40, y - 3, 38, 30)
      ctx.strokeStyle = '#c9a85a'
      ctx.lineWidth = 2
      ctx.strokeRect(u.x - wd / 2 - 40, y - 3, 38, 30)
      ctx.fillStyle = '#ffe9a8'
      ctx.font = '700 22px Cinzel, serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(u.h!.level), u.x - wd / 2 - 21, y + 13)
    } else if (u.kind === 'creep') {
      if (u.hp < u.st.maxHp) this.hpBar(u.x, u.y - u.radius * 2.1, 66, 9, u.hp / u.st.maxHp, col, 0)
    }
  }

  /* -------------------------------------------------------- projectiles */

  private drawProj(p: Proj) {
    const ctx = this.ctx
    if (p.kind === 'homing') {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, (p.size || 4) * 3)
      g.addColorStop(0, p.color || '#fff')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(p.x, p.y, (p.size || 4) * 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(p.x, p.y, (p.size || 4) * 0.7, 0, Math.PI * 2)
      ctx.fill()
    } else if (p.draw === 'hook') {
      const o = p.owner
      ctx.strokeStyle = '#8a8a92'
      ctx.lineWidth = 9
      ctx.setLineDash([22, 8])
      ctx.beginPath()
      ctx.moveTo(o.x, o.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#c9c9d2'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 28, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#6a2a2a'
      ctx.lineWidth = 6
      ctx.stroke()
    } else {
      const a = p.angle!
      ctx.strokeStyle = '#e8d870'
      ctx.lineWidth = 8
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x - Math.cos(a) * 110, p.y - Math.sin(a) * 110)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      ctx.fillStyle = '#fff6b8'
      ctx.beginPath()
      ctx.moveTo(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30)
      ctx.lineTo(p.x + Math.cos(a + 2.5) * 28, p.y + Math.sin(a + 2.5) * 28)
      ctx.lineTo(p.x + Math.cos(a - 2.5) * 28, p.y + Math.sin(a - 2.5) * 28)
      ctx.closePath()
      ctx.fill()
      ctx.lineCap = 'butt'
    }
  }

  private drawFx(vis: (x: number, y: number, r?: number) => boolean) {
    const ctx = this.ctx
    const t = this.w.time
    for (const f of this.w.fxs) {
      const k = (t - f.t0) / f.dur
      if (k < 0 || k > 1) continue
      switch (f.k) {
        case 'ring': {
          if (!vis(f.x!, f.y!, f.r1!)) break
          ctx.beginPath()
          ctx.arc(f.x!, f.y!, f.r0! + (f.r1! - f.r0!) * k, 0, Math.PI * 2)
          ctx.strokeStyle = f.color || '#fff'
          ctx.globalAlpha = 1 - k
          ctx.lineWidth = f.width || 5
          ctx.stroke()
          ctx.globalAlpha = (1 - k) * 0.15
          ctx.fillStyle = f.color || '#fff'
          ctx.fill()
          ctx.globalAlpha = 1
          break
        }
        case 'line': {
          ctx.globalAlpha = 1 - k
          ctx.strokeStyle = f.color || '#fff'
          ctx.lineWidth = f.width || 4
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(f.x1!, f.y1!)
          ctx.lineTo(f.x2!, f.y2!)
          ctx.stroke()
          ctx.lineCap = 'butt'
          ctx.globalAlpha = 1
          break
        }
        case 'meteor': {
          const yy = f.y! - (1 - k) * 700
          ctx.globalAlpha = 1
          const g = ctx.createRadialGradient(f.x!, yy, 0, f.x!, yy, 50)
          g.addColorStop(0, '#fff')
          g.addColorStop(0.4, f.color || '#9ac0ff')
          g.addColorStop(1, 'rgba(100,150,255,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(f.x!, yy, 50, 0, Math.PI * 2)
          ctx.fill()
          if (k > 0.85) {
            ctx.beginPath()
            ctx.arc(f.x!, f.y!, 120 * ((k - 0.85) / 0.15), 0, Math.PI * 2)
            ctx.strokeStyle = f.color || '#9ac0ff'
            ctx.lineWidth = 6
            ctx.stroke()
          }
          break
        }
        case 'text': {
          ctx.globalAlpha = Math.min(1, (1 - k) * 2)
          const px = (f.size || 16) / this.scale
          ctx.font = `800 ${px}px 'Barlow Condensed', 'Cinzel', sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.lineWidth = px * 0.18
          ctx.strokeStyle = 'rgba(0,0,0,0.85)'
          const yy = f.y! - k * 90
          ctx.strokeText(f.text!, f.x!, yy)
          ctx.fillStyle = f.color || '#fff'
          ctx.fillText(f.text!, f.x!, yy)
          ctx.globalAlpha = 1
          break
        }
      }
    }
  }

  /* ----------------------------------------------------------------- fog */

  private drawFog() {
    const { fctx, fog, ctx, w } = this
    const k = fog.width / this.W
    fctx.globalCompositeOperation = 'source-over'
    fctx.fillStyle = 'rgba(4,8,18,0.58)'
    fctx.fillRect(0, 0, fog.width, fog.height)
    fctx.globalCompositeOperation = 'destination-out'
    const punch = (wx: number, wy: number, r: number) => {
      const s = this.toScreen(wx, wy)
      const sr = r * this.scale * k
      if (s.x * k + sr < 0 || s.x * k - sr > fog.width || s.y * k + sr < 0 || s.y * k - sr > fog.height) return
      const g = fctx.createRadialGradient(s.x * k, s.y * k, sr * 0.78, s.x * k, s.y * k, sr)
      g.addColorStop(0, 'rgba(0,0,0,1)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      fctx.fillStyle = g
      fctx.beginPath()
      fctx.arc(s.x * k, s.y * k, sr, 0, Math.PI * 2)
      fctx.fill()
    }
    for (const u of w.units) {
      if (u.team !== this.myTeam || u.dead) continue
      punch(u.x, u.y, w.visionOf(u))
    }
    for (const z of w.zones) if (z.reveal && z.team === this.myTeam && w.time >= z.start) punch(z.x, z.y, z.r + 100)
    fctx.globalCompositeOperation = 'source-over'
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(fog, 0, 0, this.W, this.H)
  }

  /* ------------------------------------------------------------- minimap */

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
      for (const t of this.trees) {
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

export type { Path }
