import { MAP, Pt, STEP, dist } from './sim/constants'
import { freePoint, routeFor } from './sim/nav'
import type { AbilityState, Unit } from './sim/entities'
import { World, WorldCfg, type WorldView, announcementText, inAudience, reaches, type Announcement } from './sim/world'
import type { Overlay } from './render/renderer3d'
import { Renderer3D } from './render/renderer3d'
import { Hud } from './ui/hud'
import { isPingClick } from './ui/keys'
import { Sfx } from './audio'
import { Api, LocalApi, NetApi } from './net/api'
import type { NetClient } from './net/client'
import type { Replica } from './net/snapshot'

type Targeting =
  | { kind: 'ability'; st: AbilityState; idx: number }
  | { kind: 'item'; slot: number }
  | { kind: 'tk' }
  | { kind: 'tp' }
  | { kind: 'amove' }


export class Game {
  world: World
  renderer: Renderer3D
  hud: Hud
  canvas: HTMLCanvasElement
  sfx = new Sfx()
  paused = false
  speed = 1
  over = false
  camLocked = true
  quickCast = false
  targeting: Targeting | null = null
  mouse: Pt = { x: 0, y: 0 }
  drag: { sx: number; sy: number; anchor: Pt; moved: boolean } | null = null
  hover: Unit | null = null
  keys = new Set<string>()
  private acc = 0
  private last = 0
  private raf = 0
  onEnd?: (winner: number) => void
  api: Api
  net?: NetClient
  private replica?: Replica

  constructor(cfg: WorldCfg | null, canvas: HTMLCanvasElement, hudRoot: HTMLElement, net?: { client: NetClient; replica: Replica }) {
    this.canvas = canvas
    this.net = net?.client
    this.replica = net?.replica
    this.world = net ? net.replica.world : new World(cfg!)
    this.api = net ? new NetApi((m) => net.client.send(m), this.world, () => this.world.player) : new LocalApi(this.world, () => this.world.player)
    this.renderer = new Renderer3D(canvas, this.world)
    this.hud = new Hud(hudRoot, this)
    this.bind()
    this.sfx.init()
    this.world.onEvent = (k, x, y, to, tag) => {
      if (!reaches(to, this.player)) return
      const mine = inAudience(to, this.player)
      const c = this.renderer.cam
      const d = Math.hypot(x - c.x, y - c.y)
      const vol = mine ? 1 : Math.max(0, 1 - d / 2600)
      this.sfx.play(k, vol, tag)
    }
    this.world.onAnnounce = (a) => this.announceLine(a)
    this.sfx.startMusic()
    this.last = performance.now()
    // back from a hidden tab: start timing afresh so the first frame does not jump
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.last = performance.now()
    })
    this.raf = requestAnimationFrame(this.frame)
  }

  announceLine(a: Announcement) {
    const mine = this.player?.team ?? 0
    const text = announcementText(a, mine)
    const tone = a.epic ? 'epic' : a.team === undefined ? 'neutral' : a.team === mine ? 'good' : 'bad'
    this.sfx.announce(text, tone)
    this.hud.banner(text, a.sub, tone)
  }

  /** Leave the match and return to the lobby (hero select). */
  quit() {
    cancelAnimationFrame(this.raf)
    this.net?.close()
    location.reload()
  }

  /** What presentation code (HUD) may read. */
  get view(): WorldView {
    return this.world
  }

  get player() {
    return this.world.player
  }

  /* ------------------------------------------------------------ loop */

  private frame = (ts: number) => {
    const dt = Math.min(0.1, (ts - this.last) / 1000)
    this.last = ts
    const w = this.world
    if (this.replica) {
      this.replica.update(ts)
      if (w.winner !== null && !this.over) {
        this.over = true
        this.onEnd?.(w.winner)
      }
    } else if (!this.paused && !this.over) {
      this.acc += dt * this.speed
      let n = 0
      while (this.acc >= STEP && n < 8) {
        w.tick(STEP)
        this.acc -= STEP
        n++
      }
      if (n >= 8) this.acc = 0
      if (w.winner !== null && !this.over) {
        this.over = true
        this.onEnd?.(w.winner)
      }
    }
    this.soundPings()
    this.updateCamera(dt)
    this.updateHover()
    this.updateRoute()
    this.renderer.draw(this.overlay())
    this.hud.update(dt)
    this.raf = requestAnimationFrame(this.frame)
  }

  private updateCamera(dt: number) {
    const r = this.renderer
    const p = this.player
    const speed = 2600 / r.scale / 1.6
    let dx = 0
    let dy = 0
    if (this.keys.has('ArrowLeft')) dx -= 1
    if (this.keys.has('ArrowRight')) dx += 1
    if (this.keys.has('ArrowUp')) dy -= 1
    if (this.keys.has('ArrowDown')) dy += 1
    // edge scrolling: works in both camera modes, with a wide zone and speed that ramps up near the edge
    if (!this.hud.edgeBlocked && !this.drag?.moved && !this.targetingCancelsEdge) {
      const edge = 30
      const ramp = (pos: number, size: number) => {
        if (pos < edge) return -(0.45 + 0.55 * Math.min(1, (edge - pos) / edge))
        if (pos > size - edge) return 0.45 + 0.55 * Math.min(1, (pos - (size - edge)) / edge)
        return 0
      }
      if (this.mouseInside) {
        dx += ramp(this.screenMouse.x, r.W)
        dy += ramp(this.screenMouse.y, r.H)
      } else if (this.outsideDir) {
        // the cursor left the window past an edge: keep scrolling that way until it comes back
        dx += this.outsideDir.x
        dy += this.outsideDir.y
      }
    }
    if (dx || dy) {
      this.camLocked = false
      const len = Math.max(1, Math.hypot(dx, dy))
      r.cam.x += (dx / len) * Math.min(1, len) * speed * dt
      r.cam.y += (dy / len) * Math.min(1, len) * speed * dt
    } else if (this.camLocked) {
      const k = Math.min(1, dt * 9)
      r.cam.x += (p.x - r.cam.x) * k
      r.cam.y += (p.y - r.cam.y) * k
    }
    r.clampCam()
  }

  private targetingCancelsEdge = false
  private outsideDir: { x: number; y: number } | null = null

  screenMouse: Pt = { x: 0, y: 0 }
  mouseInside = false

  private cursorCache: Record<string, string> = {}
  private reticle(color: string) {
    if (this.cursorCache[color]) return this.cursorCache[color]
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44'><circle cx='22' cy='22' r='14' fill='rgba(0,0,0,0.15)' stroke='${color}' stroke-width='3'/><circle cx='22' cy='22' r='2.5' fill='${color}'/><path d='M22 2v11M22 31v11M2 22h11M31 22h11' stroke='${color}' stroke-width='3' stroke-linecap='round'/></svg>`
    return (this.cursorCache[color] = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 22 22, crosshair`)
  }

  /** Which units an ability may be aimed at (mirrors the rules in World.orderCast). */
  private unitFilter(def: AbilityState['def']) {
    const p = this.player
    return (u: Unit) => !u.isBuilding && (def.target !== 'enemy' || u.team !== p.team) && (!def.heroOnly || u.kind === 'hero')
  }

  private updateHover() {
    const w = this.renderer.toWorld(this.screenMouse.x, this.screenMouse.y)
    this.mouse = w
    this.hover = this.hud.mouseOverUi ? null : this.pick(w.x, w.y)
    const t = this.targeting
    if (this.drag?.moved) this.canvas.style.cursor = 'grabbing'
    else if (t && t.kind === 'ability' && t.st.def.behavior === 'unit') {
      // unit-target spell: green reticle over a valid target, red otherwise
      const ok = !!this.pick(w.x, w.y, this.unitFilter(t.st.def))
      this.canvas.style.cursor = this.reticle(ok ? '#6fff6f' : '#ff5a4a')
    } else if (t) this.canvas.style.cursor = this.reticle(t.kind === 'amove' ? '#ff6a4a' : '#ffe9a8')
    else this.canvas.style.cursor = this.hover && this.hover.team !== this.player.team ? 'pointer' : 'default'
  }

  /**
   * Pick the unit under the cursor in SCREEN space: the click is tested against the whole body (feet to head), so
   * clicking a tall hero's chest or head selects it instead of the ground behind it. Enemies are preferred.
   */
  pick(_x?: number, _y?: number, filter?: (u: Unit) => boolean): Unit | null {
    const w = this.world
    const mx = this.screenMouse.x
    const my = this.screenMouse.y
    const me = this.player
    let best: Unit | null = null
    let bs = Infinity
    const under = this.renderer.toWorld(mx, my) // ground point under the cursor: a clicked unit must be near it
    for (const u of w.units) {
      if (u.dead || u.kind === 'fountain' || u.kind === 'courier' || u.stub) continue
      if (Math.abs(u.x - under.x) > 900 || Math.abs(u.y - under.y) > 1100) continue
      if (!w.isVisible(me.team, u)) continue
      if (filter && !filter(u)) continue
      const b = this.renderer.unitScreen(u)
      // distance from the cursor to the feet->head segment
      const vx = b.hx - b.fx
      const vy = b.hy - b.fy
      const l2 = vx * vx + vy * vy || 1
      const t = Math.max(0, Math.min(1, ((mx - b.fx) * vx + (my - b.fy) * vy) / l2))
      const d = Math.hypot(mx - (b.fx + vx * t), my - (b.fy + vy * t))
      if (d > b.r) continue
      // closer to the unit's centre wins; heroes and enemies get a small advantage
      let score = d / b.r
      if (u.kind === 'hero') score -= 0.25
      if (u.team !== me.team) score -= 0.2
      if (u.isBuilding) score += 0.3
      if (score < bs) {
        bs = score
        best = u
      }
    }
    return best
  }

  private overlay(): Overlay {
    const ov: Overlay = { hover: this.hover, attackMove: this.targeting?.kind === 'amove' }
    const t = this.targeting
    const p = this.player
    if (t && t.kind === 'ability') {
      const def = t.st.def
      const range = this.world.castRange(p, t.st)
      const aim = def.aim
      if (range > 0) ov.rangeCircle = { r: range, color: 'rgba(255,255,255,0.55)' }
      else if (aim?.circle) ov.rangeCircle = aim.circle
      if (aim?.line) {
        const a = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x)
        const { len, width, color = 'rgba(255,255,255,0.18)' } = aim.line
        ov.line = { from: { x: p.x, y: p.y }, to: { x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len }, width, color }
      }
      if (aim?.aoe) ov.aoe = { x: this.mouse.x, y: this.mouse.y, r: aim.aoe.r[Math.max(0, t.st.level - 1)], color: aim.aoe.color }
    } else if (t && t.kind === 'item') {
      const it = p.h!.items[t.slot]
      if (it && it.def.active === 'ward') {
        ov.rangeCircle = { r: 650, color: 'rgba(255,233,168,0.6)' }
        ov.aoe = { x: this.mouse.x, y: this.mouse.y, r: 1600, color: 'rgba(255,233,168,0.7)' }
      } else ov.rangeCircle = { r: 1200, color: 'rgba(122,184,255,0.5)' }
    } else if (t && t.kind === 'tp') {
      const b = this.world.nearestTpPoint(p.team, this.mouse.x, this.mouse.y)
      if (b) ov.aoe = { x: b.x, y: b.y, r: 260, color: 'rgba(111,214,255,0.9)' }
    } else if (t && t.kind === 'tk') {
      const tk = p.tk
      if (tk) ov.aoe = { x: tk.start.x, y: tk.start.y, r: 375, color: 'rgba(90,176,232,0.8)' }
    }
    return ov
  }

  /* ----------------------------------------------------------- input */

  private bind() {
    const c = this.canvas
    c.addEventListener('contextmenu', (e) => e.preventDefault())
    c.addEventListener('mousemove', (e) => {
      this.screenMouse = { x: e.clientX, y: e.clientY }
      this.mouseInside = true
    })
    c.addEventListener('mouseleave', () => (this.mouseInside = false))
    // track the pointer over the whole window (also over the HUD) and remember which edge it left through
    window.addEventListener('mousemove', (e) => {
      this.screenMouse = { x: e.clientX, y: e.clientY }
      this.mouseInside = true
      this.outsideDir = null
    })
    document.documentElement.addEventListener('mouseleave', (e) => {
      const W = window.innerWidth
      const H = window.innerHeight
      const x = e.clientX
      const y = e.clientY
      const dx = x <= 2 ? -1 : x >= W - 2 ? 1 : 0
      const dy = y <= 2 ? -1 : y >= H - 2 ? 1 : 0
      this.mouseInside = false
      this.outsideDir = dx || dy ? { x: dx, y: dy } : null
    })
    document.documentElement.addEventListener('mouseenter', () => {
      this.outsideDir = null
    })
    window.addEventListener('blur', () => (this.outsideDir = null))
    window.addEventListener('mousemove', (e) => {
      const d = this.drag
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return
      d.moved = true
      this.camLocked = false
      this.screenMouse = { x: e.clientX, y: e.clientY }
      const now = this.renderer.toWorld(e.clientX, e.clientY)
      this.renderer.cam.x += d.anchor.x - now.x
      this.renderer.cam.y += d.anchor.y - now.y
      this.renderer.clampCam()
      this.canvas.style.cursor = 'grabbing'
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.drag = null
    })
    c.addEventListener('mousedown', (e) => {
      this.screenMouse = { x: e.clientX, y: e.clientY }
      this.mouse = this.renderer.toWorld(e.clientX, e.clientY)
      if (isPingClick(e) && !this.targeting) {
        // Alt + click (Cmd + click on Mac): team ping (location, enemy, own/enemy building, ally)
        this.mouse = this.renderer.pickGround(e.clientX, e.clientY)
        this.pingHere()
      } else if (e.button === 0 && !e.ctrlKey) {
        if (this.targeting) this.leftClick()
        else this.drag = { sx: e.clientX, sy: e.clientY, anchor: this.mouse, moved: false }
      } else if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
        // tall rocks and trees hide the ground behind them: aim at the object's base instead
        this.mouse = this.renderer.pickGround(e.clientX, e.clientY)
        this.rightClick()
      }
    })
    c.addEventListener('wheel', (e) => e.preventDefault(), { passive: false })
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
      if (e.code === 'Tab') this.hud.showScore(false)
    })
    window.addEventListener('resize', () => this.renderer.resize())
    window.addEventListener('blur', () => this.keys.clear())
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat && !e.code.startsWith('Arrow')) {
      if (e.code === 'Tab') e.preventDefault()
      return
    }
    this.keys.add(e.code)
    const p = this.player
    const abilityKeys = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF']
    const itemKeys = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN']
    const ai = abilityKeys.indexOf(e.code)
    const ii = itemKeys.indexOf(e.code)
    if (e.code === 'Tab') {
      e.preventDefault()
      this.hud.showScore(true)
      return
    }
    if (e.code.startsWith('Arrow')) {
      e.preventDefault()
      return
    }
    if (ai >= 0 && ai <= 3 && (e.altKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      this.api.level(ai)
      return
    }
    if (ai >= 0) {
      e.preventDefault()
      this.activateAbility(ai, false, false)
      return
    }
    if (e.code === 'KeyB' && e.shiftKey) {
      e.preventDefault()
      this.pressBuyback()
      return
    }
    if (ii >= 0) {
      e.preventDefault()
      this.activateItem(ii, false)
      return
    }
    if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      this.pressGlyph()
      return
    }
    if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      this.pressTeleport()
      return
    }
    switch (e.code) {
      case 'KeyA':
        this.targeting = { kind: 'amove' }
        break
      case 'Space':
        e.preventDefault()
        this.api.stop()
        this.moveGoal = null
        this.targeting = null
        break
      case 'KeyH':
        this.api.hold()
        this.moveGoal = null
        break
      case 'Digit1':
      case 'Numpad1':
        this.camLocked = true
        this.renderer.cam = { x: p.x, y: p.y }
        break
      case 'KeyL':
        this.toggleCamLock()
        break
      case 'KeyS':
      case 'F4':
        e.preventDefault()
        this.hud.toggleShop()
        break
      case 'KeyP':
        this.togglePause()
        break
      case 'KeyM':
        this.toggleQuickCast()
        break
      case 'Escape':
        if (this.hud.quitOpen) this.hud.closeQuit()
        else if (this.targeting) this.targeting = null
        else if (this.hud.shopOpen) this.hud.closeShop()
        else this.hud.openQuit()
        break
    }
  }

  private leftClick() {
    const t = this.targeting
    if (t) {
      if (t.kind === 'amove') {
        this.api.amove(this.mouse.x, this.mouse.y)
        this.marker(this.mouse, '#ff6a4a')
        this.targeting = null
      } else if (t.kind === 'ability') {
        if (this.castAt(t.st, true)) this.targeting = null
      } else if (t.kind === 'item') {
        const err = this.api.itemAt(t.slot, this.mouse.x, this.mouse.y)
        if (err) this.hud.toast(err)
        this.targeting = null
      } else if (t.kind === 'tk') {
        this.api.tkLand(this.mouse.x, this.mouse.y)
        this.targeting = null
      } else if (t.kind === 'tp') {
        const err = this.api.tpAt(this.mouse.x, this.mouse.y)
        if (err) this.hud.toast(err)
        else this.moveGoal = null
        this.targeting = null
      }
      return
    }
  }

  private rightClick() {
    const p = this.player
    const w = this.world
    if (this.targeting) {
      this.targeting = null
      return
    }
    if (p.dead) return
    const t = this.hud.mouseOverUi ? null : this.pick()
    if (t && t !== p) {
      if (t.team !== p.team) {
        this.api.attack(t)
        this.moveGoal = null
        this.marker(t, '#ff4a3a')
        return
      }
      if (w.canAttackTarget(p, t)) {
        this.api.attack(t)
        this.marker(t, '#ffffff')
        return
      }
    }
    this.api.move(this.mouse.x, this.mouse.y)
    this.marker(this.mouse, '#6fe06f')
    this.moveGoal = { x: this.mouse.x, y: this.mouse.y }
  }

  /** Pause (single player only); shared by the P key and the menu button. */
  togglePause() {
    if (this.net) return
    this.paused = !this.paused
    this.hud.setPaused(this.paused)
  }
  toggleQuickCast() {
    this.quickCast = !this.quickCast
    this.hud.toast(this.quickCast ? 'Quick cast ON — abilities fire at the cursor' : 'Quick cast OFF — press, then click a target')
  }
  toggleCamLock() {
    this.camLocked = !this.camLocked
    this.hud.toast(this.camLocked ? 'Camera locked to hero' : 'Camera free — edge scroll / arrows')
  }

  /** Alt + click (Cmd + click on Mac): ping what is under the cursor (a unit, or the ground). */
  private pingHere() {
    if (this.player.dead) return
    const t = this.hud.mouseOverUi ? null : this.pick()
    this.api.ping(this.mouse.x, this.mouse.y, t)
  }

  /** Alt + click (Cmd + click on Mac) on the minimap. */
  minimapPing(x: number, y: number) {
    if (this.player.dead) return
    this.api.ping(x, y, null)
  }

  /** Play a sound once for every ping that appeared (own, a teammate's or a bot's). */
  private pingSeen = new Set<number>()
  private soundPings() {
    const pings = this.world.pings
    for (const p of pings) {
      if (this.pingSeen.has(p.id)) continue
      this.pingSeen.add(p.id)
      this.sfx.play('ping', p.owner === this.player.id ? 0.8 : 1, p.kind)
    }
    if (this.pingSeen.size > 60) for (const id of this.pingSeen) if (!pings.some((p) => p.id === id)) this.pingSeen.delete(id)
  }

  marker(p: Pt, color: string) {
    this.world.vfx('ring', { x: p.x, y: p.y, r0: 46, r1: 10, dur: 0.35, color })
  }

  /** Clicking a hero portrait in the top bar: jump the camera to them, but only if they are visible (no free scouting). */
  focusHero(u: Unit) {
    const me = this.player
    if (u === me) {
      this.camLocked = true
      return
    }
    if (u.dead || u.stub || !this.world.isVisible(me.team, u)) {
      this.hud.toast(u.dead ? 'That hero is dead' : 'Not visible right now')
      return
    }
    this.camLocked = false
    this.renderer.cam = { x: u.x, y: u.y }
    this.renderer.clampCam?.()
  }

  /** T key / teleport slot: start choosing a destination (a second press goes to your ancient). */
  pressGlyph() {
    const err = this.api.glyph()
    if (err) this.hud.toast(err)
  }

  pressBuyback() {
    const err = this.api.buyback()
    if (err) this.hud.toast(err)
  }

  pressTeleport() {
    const p = this.player
    const w = this.world
    if (p.dead) return
    const hs = p.h!
    if (this.targeting?.kind === 'tp') {
      const anc = w.ancientOf(p.team)
      const err = anc ? this.api.tpAt(anc.x, anc.y) : null
      if (err) this.hud.toast(err)
      this.targeting = null
    } else if (hs.tpScrolls <= 0) this.hud.toast('No teleport scrolls (buy them in the shop)')
    else if (w.time < hs.tpCd) this.hud.toast('Teleport is on cooldown')
    else this.targeting = { kind: 'tp' }
  }

  /** Single-player testing helper: max level (skills maxed too) and +20000 gold, instantly. */
  testBoost() {
    if (this.net) return
    const w = this.world
    const p = this.player
    if (p.dead) return
    w.addXp(p, 1e9)
    w.autoLevel(p)
    w.recalc(p)
    p.hp = p.st.maxHp
    p.mana = p.st.maxMana
    p.h!.gold += 20000
    p.h!.earned += 20000
    w.text(p.x, p.y - 110, 'MAX LEVEL +20000', '#ffe36a', 20)
    this.sfx.play('levelup')
    this.hud.toast('Test boost: max level and +20000 gold')
  }

  /** Right-click on the minimap. */
  minimapOrder(x: number, y: number) {
    this.api.move(x, y)
    this.marker({ x, y }, '#6fe06f')
    this.moveGoal = { x, y }
  }

  /** Remembered destination of the last move order, shown as a route line on the minimap. */
  moveGoal: Pt | null = null
  private routeAt = 0
  private updateRoute() {
    const p = this.player
    const g = this.moveGoal
    if (g && (p.dead || Math.hypot(p.x - g.x, p.y - g.y) < 90)) this.moveGoal = null
    const goal = this.moveGoal
    if (!goal) {
      this.renderer.setRoute(null)
      return
    }
    if (performance.now() - this.routeAt < 250) return
    this.routeAt = performance.now()
    const f = freePoint(goal)
    this.renderer.setRoute(routeFor({ x: p.x, y: p.y }, f))
  }

  /* --------------------------------------------------------- casting */

  abilityList() {
    const p = this.player
    const h = p.h!
    return [...h.abilities, h.stolen]
  }

  activateAbility(idx: number, fromClick: boolean, invertQuick = false) {
    const p = this.player
    const w = this.world
    if (p.dead) return
    const st = this.abilityList()[idx]
    if (!st) return
    const def = st.def
    if (st.level <= 0) {
      this.hud.toast('Ability not learned')
      return
    }
    // follow-up stage (Telekinesis landing)
    if (def.followUp?.(p, w.time)) {
      if (this.quickCast && !fromClick) this.api.tkLand(this.mouse.x, this.mouse.y)
      else this.targeting = { kind: 'tk' }
      return
    }
    if (def.behavior === 'passive') return
    if (def.noMove) {
      // Leap: no-target in Dota, fires immediately toward the cursor
      const err = this.api.cast(this.abilityList().indexOf(st), st, undefined, this.mouse.x, this.mouse.y)
      if (err) this.hud.toast(err)
      return
    }
    if (def.behavior === 'toggle' || def.behavior === 'none') {
      const err = this.api.cast(this.abilityList().indexOf(st), st, undefined, p.x, p.y)
      if (err) this.hud.toast(err)
      return
    }
    const quick = (this.quickCast !== invertQuick) && !fromClick
    if (quick) {
      if (!this.castAt(st, false)) {
        if (def.behavior === 'unit') this.targeting = { kind: 'ability', st, idx }
      }
    } else {
      // pre-check readiness for a nicer message
      if (!w.abilityReady(p, st)) {
        this.hud.toast(w.time < st.cdUntil || (def.charges && st.charges <= 0) ? 'Ability is on cooldown' : 'Not available')
        return
      }
      if (p.mana < (def.mana[st.level - 1] || 0)) {
        this.hud.toast('Not enough mana')
        return
      }
      this.targeting = { kind: 'ability', st, idx }
    }
  }

  /** Try to cast `st` using the current cursor. Returns true if an order was issued. */
  private castAt(st: AbilityState, toast: boolean) {
    const def = st.def
    let err: string | null = null
    if (def.behavior === 'unit') {
      const tgt = this.pick(this.mouse.x, this.mouse.y, this.unitFilter(def))
      if (!tgt) {
        if (toast) this.hud.toast('Must target a unit')
        return false
      }
      err = this.api.cast(this.abilityList().indexOf(st), st, tgt, tgt.x, tgt.y)
    } else {
      err = this.api.cast(this.abilityList().indexOf(st), st, undefined, this.mouse.x, this.mouse.y)
    }
    if (err) {
      this.hud.toast(err)
      return false
    }
    return true
  }

  activateItem(slot: number, fromClick: boolean) {
    const p = this.player
    const it = p.h!.items[slot]
    if (!it || p.dead) return
    if (it.def.active === 'blink' || it.def.active === 'ward') {
      if (this.quickCast && !fromClick) {
        const err = this.api.itemAt(slot, this.mouse.x, this.mouse.y)
        if (err) this.hud.toast(err)
      } else this.targeting = { kind: 'item', slot }
      return
    }
    const err = this.api.itemAt(slot)
    if (err) this.hud.toast(err)
  }

  clampMap(v: number) {
    return Math.max(0, Math.min(MAP, v))
  }
}

export { dist }
