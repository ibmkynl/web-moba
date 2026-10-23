import type { Game } from '../game'
import { MAP, MAX_LEVEL, TEAM_NAME, XP_TABLE } from '../sim/constants'
import type { AbilityState, HeroDef, Unit } from '../sim/entities'
import { ITEMS } from '../sim/items'
import { itemIcon } from './itemicons'
import { esc } from './html'
import { QUALITIES } from '../render/renderer3d'
import { heroPortrait } from '../render/portraits'

const ABIL_KEYS = ['Q', 'W', 'E', 'R', 'D']
const ITEM_KEYS = ['Z', 'X', 'C', 'V', 'B', 'N']
const MM = 236

export function portraitStyle(def: HeroDef) {
  const url = heroPortrait(def.id)
  const fallback = `radial-gradient(circle at 35% 28%, ${def.color}, ${def.color2} 75%)`
  return url ? `background: url(${url}) center / cover no-repeat, ${fallback};` : `background: ${fallback};`
}


const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString())
const mmss = (t: number) => `${Math.floor(t / 60)
  .toString()
  .padStart(2, '0')}:${Math.floor(t % 60)
  .toString()
  .padStart(2, '0')}`

/* DOM writes are the HUD's main cost: look elements up once and only touch them when the value changes */
const qCache = new WeakMap<Element, Map<string, Element | null>>()
const q = (root: Element, sel: string): any => {
  let m = qCache.get(root)
  if (!m) qCache.set(root, (m = new Map()))
  let el = m.get(sel)
  if (el === undefined) m.set(sel, (el = root.querySelector(sel)))
  return el
}
const setText = (el: Element, v: string) => {
  if ((el as any).__t !== v) {
    ;(el as any).__t = v
    el.textContent = v
  }
}
const setStyle = (el: HTMLElement, k: string, v: string) => {
  const c = ((el as any).__s ??= {})
  if (c[k] !== v) {
    c[k] = v
    ;(el.style as any)[k] = v
  }
}

export class Hud {
  root: HTMLElement
  mouseOverUi = false
  /** true while over a panel where edge scrolling must not trigger (not the top hero bar / menu) */
  edgeBlocked = false
  private acc = 0
  private toastT = 0
  private tip!: HTMLElement
  private e: Record<string, HTMLElement> = {}
  private abil: HTMLElement[] = []
  private items: HTMLElement[] = []
  private slots: { u: Unit; el: HTMLElement; hp: HTMLElement; mp: HTMLElement; timer: HTMLElement; lv: HTMLElement }[] = []
  private mm!: HTMLCanvasElement
  private mmc!: CanvasRenderingContext2D
  private mmDrag = false
  private feedKey = ''
  shopOpen = false
  private shopCat = 'all'
  private lastShopKey = ''

  constructor(root: HTMLElement, private g: Game) {
    this.root = root
    this.build()
    window.addEventListener('resize', () => this.fit())
    this.fit()
  }

  private fit() {
    const s = Math.min(1, window.innerWidth / 1260)
    ;(this.e.bottom as HTMLElement).style.setProperty('--ui-s', String(s))
    ;(this.e.topbar as HTMLElement).style.transform = `translateX(-50%) scale(${Math.min(1, window.innerWidth / 1300)})`
  }

  /* ------------------------------------------------------------- build */

  private build() {
    const w = this.g.view
    this.root.innerHTML = `
      <div id="tpbar"><div class="tp-t">Teleporting<small>Stand still — moving cancels it and uses up the scroll</small></div><div class="tp-b"><i></i></div><div class="tp-s"></div></div>
      <div id="topbar" class="ui">
        <div class="team-row" id="rad-row"></div>
        <div id="clock">
          <div class="score"><span class="rs">0</span><span class="time">00:00</span><span class="ds">0</span></div>
          <div class="dn"><i></i><span>Day</span></div>
          <div class="rt">Rune <b>2:00</b></div>
          ${this.g.net ? '<div class="ping-live" title="Round trip to the host">— ms</div>' : ''}
        </div>
        <div class="team-row" id="dire-row"></div>
      </div>
      <div id="menu" class="ui">
        <button id="b-pause" title="Pause (P)">❚❚</button>
        <button id="b-cam" title="Camera lock (L)">⌖</button>
        <button id="b-quick" title="Quick cast (M)">⚡</button>
        <button id="b-stats" title="Stats (hold Tab)">▤</button>
        <button id="b-sound" title="Sound on/off">♪</button>
        <button id="b-gfx" title="Graphics quality">◐</button>
        <button id="b-help" title="Controls">?</button>
        ${this.g.net ? '' : '<button id="b-test" title="Test: max level + 20000 gold (single player only)">★</button>'}
        <button id="b-quit" title="Quit match (Esc)">✕</button>
      </div>
      <div id="unitinfo" class="frame hidden"></div>
      <div id="announce"></div>
      <div id="feed"></div>
      <div id="toast"></div>
      <div id="respawn"></div>
      <div id="bottom">
        <div class="frame mmframe ui"><canvas id="minimap" width="${MM}" height="${MM}"></canvas></div>
        <div class="center frame ui">
          <div class="hero-card">
            <div class="portrait"><span class="pl"></span><span class="lvl">1</span></div>
            <div class="hname"></div>
          </div>
          <div class="stats">
            <div><em>Damage</em><b id="s-dmg"></b></div>
            <div><em>Armor</em><b id="s-arm"></b></div>
            <div><em>Move</em><b id="s-ms"></b></div>
            <div><em>Range</em><b id="s-rng"></b></div>
            <div class="attrs"><span class="a-str">S</span><b id="s-str"></b><span class="a-agi">A</span><b id="s-agi"></b><span class="a-int">I</span><b id="s-int"></b></div>
          </div>
          <div class="mid">
            <div class="bar hp"><div class="fill"></div><span class="txt"></span><span class="reg"></span></div>
            <div class="bar mp"><div class="fill"></div><span class="txt"></span><span class="reg"></span></div>
            <div class="bar xp" title="Experience to next level"><div class="fill"></div><span class="txt"></span></div>
            <div class="abilities">${[0, 1, 2, 3, 4]
              .map(
                (i) => `<div class="abil" data-i="${i}">
                  <div class="plus">+</div>
                  <div class="icon"><span class="glyph"></span><div class="cd"></div><span class="cdt"></span><span class="chg"></span><span class="mana"></span></div>
                  <span class="key">${ABIL_KEYS[i]}</span>
                  <div class="pips"></div>
                </div>`,
              )
              .join('')}</div>
          </div>

        </div>
        <div class="invframe frame ui">
          <div class="tpslot" id="tpslot" title="Teleportation Scroll (T): channel 3s to a friendly tower. Max 5."><span class="glyph"></span><div class="cd"></div><span class="chg">0</span><span class="key">T</span></div>
          <div class="inv">${[0, 1, 2, 3, 4, 5]
            .map((i) => `<div class="item" data-i="${i}"><span class="glyph"></span><div class="cd"></div><span class="chg"></span><span class="key">${ITEM_KEYS[i]}</span></div>`)
            .join('')}
            <div class="goldbox"><span class="coin"></span><b id="gold">0</b></div>
            <button class="shopbtn" id="b-shop">Shop <kbd>S</kbd></button>
          </div>
        </div>
      </div>
      <div id="tip" class="tip"></div>
      <div id="shop" class="ui frame hidden"></div>
      <div id="score" class="ui frame hidden"></div>
      <div id="quitbox" class="hidden">
        <div class="frame qbox">
          <h3>Leave the match?</h3>
          <p>The current game will be cancelled and you will return to the lobby.</p>
          <div class="qbtns"><button id="q-stay">Keep playing</button><button id="q-leave" class="danger">Quit to lobby</button></div>
        </div>
      </div>
      <div id="paused" class="hidden">PAUSED<small>Press P to resume</small></div>
      <div id="help" class="ui frame hidden">
        <h3>Controls</h3>
        <div class="cols">
          <div><kbd>Right click</kbd> move / attack / <b>deny</b> allied creep (&lt;50% HP)</div>
          <div><kbd>A</kbd> + click attack-move &nbsp; <kbd>Space</kbd> stop &nbsp; <kbd>H</kbd> hold</div>
          <div><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd><kbd>D</kbd> abilities: press the key, then <b>click</b> the target or spot (<kbd>Esc</kbd>/right-click cancels; <kbd>M</kbd> = quick cast)</div>
          <div><kbd>Alt</kbd>+<kbd>Q/W/E/R</kbd> (or Ctrl) or click <b>+</b> to level up</div>
          <div><kbd>Z X C V B N</kbd> items &nbsp; <kbd>S</kbd> shop (at your fountain)</div>
          <div><kbd>'</kbd> center camera &nbsp; <kbd>L</kbd> lock/free camera</div>
          <div><kbd>Tab</kbd> scoreboard &nbsp; <kbd>P</kbd> pause &nbsp; <kbd>Esc</kbd> cancel</div>
        </div>
        <button id="help-close">Close</button>
      </div>`
    const $ = (s: string) => this.root.querySelector(s) as HTMLElement
    for (const [k, s] of Object.entries({
      topbar: '#topbar', bottom: '#bottom', hp: '.bar.hp', mp: '.bar.mp', dmg: '#s-dmg', arm: '#s-arm', ms: '#s-ms', rng: '#s-rng', str: '#s-str', agi: '#s-agi', int: '#s-int',
      gold: '#gold', rs: '.rs', ds: '.ds', time: '.time', dn: '.dn', feed: '#feed', toast: '#toast', respawn: '#respawn', shop: '#shop', score: '#score', paused: '#paused', help: '#help',
      lvl: '.lvl', portrait: '.portrait', hname: '.hname', pl: '.pl',
    })) this.e[k] = $(s)
    this.tip = $('#tip')
    this.abil = [...this.root.querySelectorAll('.abil')] as HTMLElement[]
    this.items = [...this.root.querySelectorAll('.item')] as HTMLElement[]
    this.mm = $('#minimap') as unknown as HTMLCanvasElement
    this.mmc = this.mm.getContext('2d')!

    // ui hover tracking
    this.root.querySelectorAll('.ui').forEach((el) => {
      const passThrough = el.id === 'topbar' || el.id === 'menu'
      el.addEventListener('mouseenter', () => {
        this.mouseOverUi = true
        if (!passThrough) this.edgeBlocked = true
      })
      el.addEventListener('mouseleave', () => {
        this.mouseOverUi = false
        this.edgeBlocked = false
      })
    })

    // player card
    const p = w.player
    const def = p.h!.def
    this.e.portrait.setAttribute('style', portraitStyle(def))
    this.e.hname.textContent = def.name

    // top bar
    for (const team of [0, 1]) {
      const row = $(team === 0 ? '#rad-row' : '#dire-row')
      for (const u of w.heroes.filter((h) => h.team === team)) {
        const d = u.h!.def
        const el = document.createElement('div')
        el.className = `hslot t${team}${u === p ? ' me' : ''}`
        el.innerHTML = `<div class="port" style="${portraitStyle(d)}"><i class="lv">1</i><b class="timer"></b></div><div class="mini hp"><div></div></div><div class="mini mp"><div></div></div>`
        row.appendChild(el)
        this.slots.push({
          u, el, hp: el.querySelector('.hp div') as HTMLElement, mp: el.querySelector('.mp div') as HTMLElement,
          timer: el.querySelector('.timer') as HTMLElement, lv: el.querySelector('.lv') as HTMLElement,
        })
        el.style.cursor = 'pointer'
        el.addEventListener('mousedown', (ev) => {
          ev.stopPropagation()
          if (ev.button === 0) this.g.focusHero(u)
        })
        el.addEventListener('mouseenter', () => this.showTip(el, `<h4>${esc(u.h!.pname || d.name)}</h4><p>${d.name} — ${TEAM_NAME[team]}</p>`))
        el.addEventListener('mouseleave', () => this.hideTip())
      }
    }

    // abilities
    this.abil.forEach((el, i) => {
      const pips = el.querySelector('.pips')!
      pips.innerHTML = '<i></i><i></i><i></i><i></i>'
      el.querySelector('.icon')!.addEventListener('mousedown', (ev: any) => {
        ev.stopPropagation()
        if (ev.ctrlKey || ev.button === 2) this.g.api.level(i)
        else this.g.activateAbility(i, true)
      })
      el.addEventListener('contextmenu', (ev) => ev.preventDefault())
      el.querySelector('.plus')!.addEventListener('mousedown', (ev) => {
        ev.stopPropagation()
        this.g.api.level(i)
      })
      el.addEventListener('mouseenter', () => this.abilTip(i, el))
      el.addEventListener('mouseleave', () => this.hideTip())
    })
    this.items.forEach((el, i) => {
      el.addEventListener('mousedown', (ev: any) => {
        if (ev.button === 2) {
          if (this.g.api.sell(i)) this.toast('Item sold')
          else if (p.h!.items[i]) this.toast('You can only sell at the fountain shop')
        } else this.g.activateItem(i, true)
      })
      el.addEventListener('contextmenu', (ev) => ev.preventDefault())
      el.addEventListener('mouseenter', () => {
        const it = p.h!.items[i]
        if (it) this.showTip(el, `<div class="tip-ic">${itemIcon(it.def.id)}</div><h4>${it.def.name}</h4><p>${it.def.desc}</p><div class="meta">Right-click to sell (${Math.floor(it.def.cost * 0.5)}g)</div>`)
      })
      el.addEventListener('mouseleave', () => this.hideTip())
    })

    // menu buttons
    $('#b-pause').onclick = () => this.g.togglePause()
    $('#b-cam').onclick = () => this.g.toggleCamLock()
    $('#b-quick').onclick = () => this.g.toggleQuickCast()
    $('#b-stats').onclick = () => {
      this.statsPinned = !this.statsPinned
      $('#b-stats').classList.toggle('on', this.statsPinned)
      this.showScore(this.statsPinned)
    }
    $('#b-sound').onclick = () => {
      const m = this.g.sfx.toggle()
      $('#b-sound').classList.toggle('muted', m)
      this.toast(m ? 'Sound off' : 'Sound on')
    }
    $('#b-gfx').onclick = () => {
      const r = this.g.renderer
      const q = QUALITIES[(QUALITIES.indexOf(r.quality) + 1) % QUALITIES.length]
      r.setQuality(q)
      this.toast(`Graphics: ${q[0].toUpperCase() + q.slice(1)}`)
    }
    const tb = this.root.querySelector('#b-test') as HTMLElement | null
    if (tb) tb.onclick = () => this.g.testBoost()
    $('#b-quit').onclick = () => this.openQuit()
    $('#q-stay').onclick = () => this.closeQuit()
    $('#q-leave').onclick = () => this.g.quit()
    $('#b-help').onclick = () => this.e.help.classList.toggle('hidden')
    $('#help-close').onclick = () => this.e.help.classList.add('hidden')
    $('#b-shop').onclick = () => this.toggleShop()

    // minimap
    const mmPos = (ev: MouseEvent) => {
      const r = this.mm.getBoundingClientRect()
      return { x: ((ev.clientX - r.left) / r.width) * MAP, y: ((ev.clientY - r.top) / r.height) * MAP }
    }
    this.mm.addEventListener('mousedown', (ev) => {
      ev.stopPropagation()
      const m = mmPos(ev)
      if (ev.button === 2 || ev.ctrlKey) this.g.minimapOrder(m.x, m.y)
      else {
        this.mmDrag = true
        this.g.camLocked = false
        this.g.renderer.cam = { x: m.x, y: m.y }
      }
    })
    this.mm.addEventListener('contextmenu', (ev) => ev.preventDefault())
    window.addEventListener('mousemove', (ev) => {
      if (this.mmDrag) {
        const m = mmPos(ev)
        this.g.renderer.cam = { x: Math.max(0, Math.min(MAP, m.x)), y: Math.max(0, Math.min(MAP, m.y)) }
      }
    })
    window.addEventListener('mouseup', () => (this.mmDrag = false))
  }

  /* ------------------------------------------------------------ tooltips */

  private showTip(el: HTMLElement, html: string) {
    this.tip.innerHTML = html
    this.tip.style.display = 'block'
    const r = el.getBoundingClientRect()
    const tw = this.tip.offsetWidth
    const th = this.tip.offsetHeight
    let x = r.left + r.width / 2 - tw / 2
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x))
    const below = r.top < th + 20
    this.tip.style.left = x + 'px'
    this.tip.style.top = (below ? r.bottom + 8 : r.top - th - 8) + 'px'
  }

  private hideTip() {
    this.tip.style.display = 'none'
  }

  private abilTip(i: number, el: HTMLElement) {
    const st = this.g.abilityList()[i]
    if (!st) return
    const d = st.def
    const lv = Math.max(1, st.level)
    const cd = d.cd[lv - 1]
    const mana = d.mana[lv - 1]
    const info = d.info(lv)
    const kind = d.behavior === 'passive' ? 'Passive' : d.behavior === 'toggle' ? 'Toggle' : d.behavior === 'unit' ? 'Target: Unit' : d.behavior === 'point' ? 'Target: Point' : 'No Target'
    this.showTip(
      el,
      `<h4>${d.name} <small>${d.ult ? 'Ultimate' : kind}${i === 4 ? ' · Stolen' : ''}</small></h4>
       <p>${d.desc}</p>
       <ul>${info.map((s) => `<li>${s}</li>`).join('')}</ul>
       <div class="meta"><span class="cdi">⏱ ${d.charges ? d.charges.restore[lv - 1] + 's per charge' : cd + 's'}</span>${mana ? `<span class="mpi">◆ ${mana}</span>` : ''}</div>
       <div class="lvl-info">Level ${st.level}/${d.maxLevel}${i < 4 ? ' · Key ' + ABIL_KEYS[i] : ' · Key D'}</div>`,
    )
  }

  /* ----------------------------------------------------------- messages */

  private tpEl: HTMLElement | null = null
  private bannerQ: { text: string; sub: string; tone: string }[] = []
  private bannerBusy = false

  /** Big on-screen announcer line (queued so lines never overlap). */
  banner(text: string, sub: string, tone: string) {
    this.bannerQ.push({ text, sub, tone })
    if (this.bannerQ.length > 3) this.bannerQ.shift()
    if (!this.bannerBusy) this.nextBanner()
  }

  private nextBanner() {
    const b = this.bannerQ.shift()
    const el = this.root.querySelector('#announce') as HTMLElement
    if (!b || !el) {
      this.bannerBusy = false
      return
    }
    this.bannerBusy = true
    el.className = `on ${b.tone}`
    el.innerHTML = `<div class="at">${esc(b.text)}</div>${b.sub ? `<div class="as">${esc(b.sub)}</div>` : ''}`
    window.setTimeout(() => {
      el.className = ''
      window.setTimeout(() => this.nextBanner(), 250)
    }, 2400)
  }

  toast(msg: string) {
    this.e.toast.textContent = msg
    this.e.toast.classList.add('on')
    this.toastT = 2.2
  }

  setPaused(p: boolean) {
    this.e.paused.classList.toggle('hidden', !p)
  }

  statsPinned = false
  private scoreHeld = false

  showScore(on: boolean) {
    this.scoreHeld = on
    const show = on || this.statsPinned
    this.e.score.classList.toggle('hidden', !show)
    if (show) this.renderScore()
  }

  quitOpen = false
  private pausedBefore = false

  openQuit() {
    if (this.quitOpen) return
    this.quitOpen = true
    this.pausedBefore = this.g.paused
    this.g.paused = true
    this.e.quitbox = this.root.querySelector('#quitbox') as HTMLElement
    this.e.quitbox.classList.remove('hidden')
    this.mouseOverUi = true
  }

  closeQuit() {
    if (!this.quitOpen) return
    this.quitOpen = false
    this.g.paused = this.pausedBefore
    this.e.quitbox.classList.add('hidden')
    this.mouseOverUi = false
  }

  closeShop() {
    this.shopOpen = false
    this.e.shop.classList.add('hidden')
    this.hideTip()
  }

  toggleShop() {
    this.shopOpen = !this.shopOpen
    this.e.shop.classList.toggle('hidden', !this.shopOpen)
    this.lastShopKey = ''
    if (this.shopOpen) this.renderShop()
    else this.hideTip()
  }

  /* -------------------------------------------------------------- shop */

  private renderShop() {
    const w = this.g.view
    const p = w.player
    const hs = p.h!
    const near = w.nearShop(p)
    const pend = w.pendingFor(p).length
    const cats = ['all', 'consumable', 'attribute', 'equipment', 'misc']
    const key = `${this.shopCat}|${hs.gold}|${near}|${pend}|${hs.items.map((i) => (i ? i.def.id + i.charges : '-')).join(',')}`
    if (key === this.lastShopKey) return
    this.lastShopKey = key
    this.e.shop.innerHTML = `
      <div class="shop-head"><h3>Shop</h3><span class="shop-gold"><span class="coin"></span>${Math.floor(hs.gold)}</span>
        <button class="x" id="shop-close">✕</button></div>
      <div class="tabs">${cats.map((c) => `<button data-c="${c}" class="${c === this.shopCat ? 'on' : ''}">${c === 'all' ? 'All' : c[0].toUpperCase() + c.slice(1)}</button>`).join('')}</div>
      <div class="grid">${ITEMS.filter((i) => this.shopCat === 'all' || i.cat === this.shopCat)
        .map(
          (i) => `<div class="sitem ${hs.gold < i.cost ? 'poor' : ''}" data-id="${i.id}">
            <div class="ic" style="--c:${i.color}">${itemIcon(i.id)}</div><div class="nm">${i.name}</div><div class="pr"><span class="coin"></span>${i.cost}</div></div>`,
        )
        .join('')}</div>
      <div class="shop-foot">${near ? 'Right-click an item to buy it. Right-click an inventory item to sell it (at the fountain).' : `Away from the fountain: your <b class="cour">Hop</b> will ride your purchases to you.${pend ? ' Carrying ' + pend + ' item' + (pend > 1 ? 's' : '') + '.' : ''}`}</div>`
    this.e.shop.querySelector('#shop-close')!.addEventListener('click', () => this.closeShop())
    this.e.shop.querySelectorAll('.tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        this.shopCat = (b as HTMLElement).dataset.c!
        this.lastShopKey = ''
        this.renderShop()
      }),
    )
    this.e.shop.querySelectorAll('.sitem').forEach((el) => {
      const id = (el as HTMLElement).dataset.id!
      const def = ITEMS.find((i) => i.id === id)!
      el.addEventListener('contextmenu', (ev) => ev.preventDefault())
      el.addEventListener('mousedown', (ev: any) => {
        if (ev.button !== 2) return // purchases are on right-click
        const away = !w.nearShop(p)
        const err = this.g.api.buy(id)
        if (err) {
          this.toast(err)
          this.g.sfx.play('error')
        } else this.g.sfx.play('gold')
        if (!err && away && id !== 'tp') this.toast(`Hop is bringing ${def.name}`)
        this.lastShopKey = ''
      })
      el.addEventListener('mouseenter', () => this.showTip(el as HTMLElement, `<div class="tip-ic">${itemIcon(def.id)}</div><h4>${def.name}</h4><p>${def.desc}</p><div class="meta"><span class="gold">${def.cost} gold</span> · right-click to buy</div>`))
      el.addEventListener('mouseleave', () => this.hideTip())
    })
  }

  /* -------------------------------------------------------- scoreboard */

  private renderScore() {
    const w = this.g.view
    const mmss2 = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
    const min = Math.max(1 / 6, w.time / 60)
    const worth = (h: Unit) => w.netWorth(h)
    const fmtK = (n: number) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)))
    const row = (h: Unit) => {
      const hs = h.h!
      const isHuman = hs.isHuman
      const mine = h === w.player
      const pname = esc(hs.pname || (mine ? 'You' : 'Player'))
      const ping = h.ping as number | undefined
      const status = h.dead ? `<span class="dead">${Math.max(0, Math.ceil(hs.respawnAt - w.time))}s</span>` : ''
      const items = hs.items
        .map((it) => `<span class="si">${it ? itemIcon(it.def.id) : ''}${it && it.def.consumable && it.charges > 1 ? `<i>${it.charges}</i>` : ''}</span>`)
        .join('')
      return `<tr class="${mine ? 'me' : ''} ${h.dead ? 'isdead' : ''}">
        <td class="hp"><i style="${portraitStyle(hs.def)}"></i><div><b>${hs.def.name}</b><small><span class="tag ${isHuman ? 'pl' : 'bt'}">${isHuman ? 'PLAYER' : 'BOT'}</span>${pname}${status ? ' · ' + status : ''}</small></div></td>
        <td>${hs.level}</td>
        <td class="kda"><b>${hs.kills}</b> / <b class="d">${hs.deaths}</b> / <b>${hs.assists}</b></td>
        <td>${hs.lh} <small>/ ${hs.dn}</small></td>
        <td class="gold">${fmtK(worth(h))}</td>
        <td>${Math.round(hs.earned / min)}</td>
        <td>${Math.round(hs.xp / min)}</td>
        <td>${fmtK(hs.heroDmg)}</td>
        <td>${fmtK(hs.towerDmg)}</td>
        <td class="items">${items}</td>
        <td class="ping">${isHuman && ping !== undefined ? ping + ' ms' : isHuman ? '—' : 'bot'}</td></tr>`
    }
    const table = (team: number) => {
      const hs = w.heroes.filter((h) => h.team === team)
      const totalWorth = hs.reduce((n, h) => n + worth(h), 0)
      const avg = hs.reduce((n, h) => n + h.h!.level, 0) / Math.max(1, hs.length)
      return `<table class="st t${team}"><colgroup><col style="width:232px"/><col style="width:44px"/><col style="width:112px"/><col style="width:84px"/><col style="width:70px"/><col style="width:62px"/><col style="width:62px"/><col style="width:82px"/><col style="width:88px"/><col style="width:232px"/><col style="width:68px"/></colgroup><thead><tr>
        <th>${TEAM_NAME[team]} <small>${w.kills[team]} kills · avg lvl ${avg.toFixed(1)} · ${fmtK(totalWorth)} net worth</small></th>
        <th title="Level">Lv</th><th title="Kills / Deaths / Assists">K / D / A</th><th title="Last hits / denies">LH / DN</th><th title="Net worth (gold + items)">NW</th>
        <th title="Gold earned per minute">GPM</th><th title="Experience per minute">XPM</th><th title="Hero damage dealt">Hero dmg</th><th title="Damage dealt to buildings">Tower dmg</th><th>Items</th><th>Ping</th></tr></thead>
        <tbody>${hs.map(row).join('')}</tbody></table>`
    }
    const html = `<div class="st-head"><b>Match stats</b><span>${mmss2(w.time)} · ${w.isDay ? 'Day' : 'Night'}</span><span class="rk">${w.kills[0]}</span><span>:</span><span class="dk">${w.kills[1]}</span></div>${table(0)}${table(1)}`
    if (html !== this.scoreHtml) {
      this.scoreHtml = html
      this.e.score.innerHTML = html
    }
  }
  private scoreHtml = ''
  private unitInfoHtml = ''

  private updateUnitInfo() {
    const el = this.root.querySelector('#unitinfo') as HTMLElement
    const u = this.g.hover
    const w = this.g.view
    if (!u || u.dead || u.kind === 'fountain' || u.stub) {
      el.classList.add('hidden')
      return
    }
    const mine = u.team === w.player.team
    const col = mine ? '#6fe06f' : '#e8564a'
    const s = u.st
    const name = u.kind === 'hero' ? `${u.h!.def.name} <small>Lv ${u.h!.level}</small>` : esc(u.name)
    const hint =
      !mine ? 'Right-click to attack' : u.kind === 'creep' && u.hp < s.maxHp * 0.5 ? '<b>Right-click to deny</b>' : u.kind === 'creep' ? 'Deny below 50% HP' : ''
    const hpTxt = `${Math.ceil(u.hp)} / ${Math.round(s.maxHp)}`
    const html = `<div class="ui-name" style="color:${col}">${name}</div>
      <div class="ui-bar"><i style="width:${(u.hp / s.maxHp) * 100}%;background:${mine ? '#3fae3a' : '#c8402e'}"></i><span>${hpTxt}</span></div>
      <div class="ui-st"><span>Dmg <b>${Math.round(s.dmg)}</b></span><span>Armor <b>${fmt(s.armor)}</b></span><span>Move <b>${Math.round(s.ms)}</b></span>${u.locked ? '<span class="lk">Invulnerable</span>' : ''}</div>
      ${hint ? `<div class="ui-hint">${hint}</div>` : ''}`
    if (html !== this.unitInfoHtml) {
      this.unitInfoHtml = html
      el.innerHTML = html
    }
    el.classList.remove('hidden')
  }

  /* ------------------------------------------------------------- update */

  private pingTxt = ''
  private updatePing(p: Unit) {
    const ms = p.ping as number | undefined
    const txt = ms === undefined ? '— ms' : `${ms} ms`
    if (txt === this.pingTxt) return
    this.pingTxt = txt
    const el = this.root.querySelector('.ping-live') as HTMLElement | null
    if (!el) return
    el.textContent = txt
    el.className = 'ping-live ' + (ms === undefined ? '' : ms < 80 ? 'good' : ms < 160 ? 'ok' : 'bad')
  }

  update(dt: number) {
    const w = this.g.view
    const p = w.player
    const hs = p.h!
    // minimap every frame
    this.g.renderer.drawMinimap(this.mmc, MM)
    // teleport channel progress (centre of the screen)
    if (!this.tpEl) this.tpEl = q(this.root, '#tpbar') as HTMLElement
    const tpEnd = p.tpUntil as number | undefined
    if (tpEnd && tpEnd > w.time && !p.dead) {
      const k = Math.max(0, Math.min(1, 1 - (tpEnd - w.time) / 3))
      this.tpEl.classList.add('on')
      setStyle(q(this.tpEl, '.tp-b i') as HTMLElement, 'width', k * 100 + '%')
      setText(q(this.tpEl, '.tp-s') as HTMLElement, Math.max(0, tpEnd - w.time).toFixed(1) + 's')
    } else this.tpEl.classList.remove('on')
    this.acc += dt
    if (this.toastT > 0) {
      this.toastT -= dt
      if (this.toastT <= 0) this.e.toast.classList.remove('on')
    }
    if (this.acc < 0.05) return
    this.acc = 0

    // top bar
    setText(this.e.rs, String(w.kills[0]))
    setText(this.e.ds, String(w.kills[1]))
    setText(this.e.time, mmss(w.time))
    if (this.g.net) this.updatePing(p)
    const day = w.isDay
    this.e.dn.className = 'dn ' + (day ? 'day' : 'night')
    setText(q(this.e.dn, 'span')!, day ? 'Day' : 'Night')
    const nr = Math.max(0, w.nextPowerRune - w.time)
    const rtEl = q(this.root, '.rt b') as HTMLElement
    if (rtEl) setText(rtEl, mmss(nr).replace(/^0/, ''))
    for (const s of this.slots) {
      const hsx = s.u.h!
      const visible = s.u.team === p.team || w.isVisible(p.team, s.u)
      setText(s.lv, String(hsx.level))
      s.el.classList.toggle('dead', s.u.dead)
      setText(s.timer, s.u.dead ? String(Math.max(0, Math.ceil(hsx.respawnAt - w.time))) : '')
      setStyle(s.hp, 'width', (visible && !s.u.dead ? (s.u.hp / s.u.st.maxHp) * 100 : 0) + '%')
      setStyle(s.mp, 'width', (s.u.team === p.team && !s.u.dead ? (s.u.mana / Math.max(1, s.u.st.maxMana)) * 100 : 0) + '%')
    }

    // bottom: stats + bars
    const st = p.st
    setText(this.e.lvl, String(hs.level))
    setText(this.e.dmg, fmt(st.dmg))
    setText(this.e.arm, fmt(st.armor))
    setText(this.e.ms, String(Math.round(st.ms)))
    setText(this.e.rng, String(Math.round(st.range)))
    setText(this.e.str, String(Math.floor(st.str)))
    setText(this.e.agi, String(Math.floor(st.agi)))
    setText(this.e.int, String(Math.floor(st.int)))
    const bar = (el: HTMLElement, v: number, max: number, reg: number) => {
      setStyle(q(el, '.fill') as HTMLElement, 'width', (max > 0 ? (v / max) * 100 : 0) + '%')
      setText(q(el, '.txt')!, `${Math.ceil(v)} / ${Math.round(max)}`)
      setText(q(el, '.reg')!, `+${reg.toFixed(1)}`)
    }
    bar(this.e.hp, p.hp, st.maxHp, st.hpRegen)
    bar(this.e.mp, p.mana, st.maxMana, st.manaRegen)
    {
      const xpEl = q(this.root, '.bar.xp') as HTMLElement
      const lv = hs.level
      const prev = lv <= 1 ? 0 : XP_TABLE[lv - 1]
      const next = XP_TABLE[lv]
      const maxed = lv >= MAX_LEVEL || next === undefined
      const frac = maxed ? 1 : Math.max(0, Math.min(1, (hs.xp - prev) / (next - prev)))
      setStyle(q(xpEl, '.fill') as HTMLElement, 'width', frac * 100 + '%')
      setText(q(xpEl, '.txt')!, maxed ? 'MAX LEVEL' : `${Math.max(0, Math.ceil(next - hs.xp))} XP to level ${lv + 1}`)
    }
    setText(this.e.gold, String(Math.floor(hs.gold)))

    // abilities
    const list = this.g.abilityList()
    this.abil.forEach((el, i) => {
      const a: AbilityState | null = list[i]
      if (i === 4) setStyle(el, 'display', hs.def.stealSlot ? '' : 'none')
      if (!a) {
        el.classList.add('empty')
        setText(q(el, '.glyph') as HTMLElement, '')
        setStyle(q(el, '.icon') as HTMLElement, 'background', '')
        setStyle(q(el, '.cd') as HTMLElement, 'background', 'none')
        setText(q(el, '.cdt') as HTMLElement, '')
        setText(q(el, '.chg') as HTMLElement, '')
        setText(q(el, '.mana') as HTMLElement, '')
        el.classList.remove('can-level')
        return
      }
      el.classList.remove('empty')
      const d = a.def
      const icon = q(el, '.icon') as HTMLElement
      setStyle(icon, 'background', `radial-gradient(circle at 35% 30%, ${d.color}, #14161c 85%)`)
      setText(q(el, '.glyph') as HTMLElement, d.glyph)
      const learned = a.level > 0
      const cdTotal = d.charges ? d.charges.restore[Math.max(0, a.level - 1)] : d.cd[Math.max(0, a.level - 1)] || 0
      const remain = d.charges ? (a.charges < d.charges.max && a.chargeAt > 0 ? a.chargeAt - w.time : 0) : Math.max(0, a.cdUntil - w.time)
      const onCd = d.charges ? a.charges <= 0 || w.time < a.cdUntil : remain > 0
      const sweepRemain = d.charges ? (a.charges <= 0 ? remain : Math.max(0, a.cdUntil - w.time)) : remain
      const sweepTotal = d.charges ? (a.charges <= 0 ? cdTotal : 0.6) : cdTotal
      const cdEl = q(el, '.cd') as HTMLElement
      const cdt = q(el, '.cdt') as HTMLElement
      if (learned && onCd && sweepRemain > 0 && sweepTotal > 0) {
        const deg = (sweepRemain / sweepTotal) * 360
        setStyle(cdEl, 'background', `conic-gradient(rgba(0,0,0,0.72) ${deg}deg, rgba(0,0,0,0.0) 0deg)`)
        setText(cdt, sweepRemain >= 10 ? String(Math.ceil(sweepRemain)) : sweepRemain.toFixed(1))
      } else {
        setStyle(cdEl, 'background', 'none')
        setText(cdt, '')
      }
      setText(q(el, '.chg') as HTMLElement, d.charges && learned ? String(a.charges) : '')
      const mana = d.mana[Math.max(0, a.level - 1)] || 0
      const manaEl = q(el, '.mana') as HTMLElement
      setText(manaEl, mana && d.behavior !== 'passive' ? String(mana) : '')
      manaEl.classList.toggle('low', !!mana && p.mana < mana)
      setStyle(q(el, '.key') as HTMLElement, 'display', d.behavior === 'passive' ? 'none' : '')
      el.classList.toggle('learned', learned)
      el.classList.toggle('nomana', learned && p.mana < mana)
      el.classList.toggle('passive', d.behavior === 'passive')
      el.classList.toggle('on', a.toggled || (this.g.targeting?.kind === 'ability' && this.g.targeting.st === a))
      el.classList.toggle('ult', !!d.ult)
      el.classList.toggle('can-level', i < 4 && w.canLevel(p, i))
      const pips = el.querySelectorAll('.pips i')
      pips.forEach((pp, k) => {
        setStyle(pp as HTMLElement, 'display', k < d.maxLevel ? '' : 'none')
        pp.classList.toggle('f', k < a.level)
      })
    })

    // items
    this.items.forEach((el, i) => {
      const it = hs.items[i]
      const gl = q(el, '.glyph') as HTMLElement
      if (!it) {
        setText(gl, '')
        gl.dataset.id = ''
        setStyle(el, 'background', '')
        setText(q(el, '.chg') as HTMLElement, '')
        setStyle(q(el, '.cd') as HTMLElement, 'background', 'none')
        el.classList.remove('has')
        return
      }
      el.classList.add('has')
      setStyle(el, 'background', `radial-gradient(circle at 50% 40%, ${it.def.color}55, #0e1014 80%)`)
      if (gl.dataset.id !== it.def.id) {
        gl.dataset.id = it.def.id
        gl.innerHTML = itemIcon(it.def.id)
        ;(gl as any).__t = undefined // the icon replaced whatever setText last wrote
      }
      setText(q(el, '.chg') as HTMLElement, it.def.consumable ? String(it.charges) : '')
      const rem = Math.max(0, it.cdUntil - w.time)
      setStyle(q(el, '.cd') as HTMLElement, 'background', rem > 0 ? `conic-gradient(rgba(0,0,0,0.72) ${(rem / (it.def.cd || 15)) * 360}deg, transparent 0deg)` : 'none')
    })

    // teleport scroll stash
    {
      const el = q(this.root, '#tpslot') as HTMLElement
      const gl = q(el, '.glyph') as HTMLElement
      if (!gl.innerHTML) gl.innerHTML = itemIcon('tp')
      setText(q(el, '.chg') as HTMLElement, String(hs.tpScrolls))
      el.classList.toggle('empty', hs.tpScrolls <= 0)
      const rem = Math.max(0, hs.tpCd - w.time)
      setStyle(q(el, '.cd') as HTMLElement, 'background', rem > 0 ? `conic-gradient(rgba(0,0,0,0.72) ${(rem / 20) * 360}deg, transparent 0deg)` : 'none')
      if (!el.dataset.bound) {
        el.dataset.bound = '1'
        el.addEventListener('mousedown', (ev) => {
          ev.stopPropagation()
          this.g.pressTeleport()
        })
      }
    }

    // respawn
    if (p.dead) {
      setText(this.e.respawn, `Respawning in ${Math.max(0, Math.ceil(hs.respawnAt - w.time))}`)
      this.e.respawn.classList.add('on')
    } else this.e.respawn.classList.remove('on')

    // feed
    const lines = w.feed.filter((f) => w.time - f.t < 9)
    const key = lines.map((f) => f.t + f.text).join('|')
    if (key !== this.feedKey) {
      this.feedKey = key
      this.e.feed.innerHTML = lines.map((f) => `<div class="fl t${f.team}">${esc(f.text)}</div>`).join('')
    }

    this.updateUnitInfo()

    // camera / quick buttons state
    q(this.root, '#b-cam')!.classList.toggle('on', this.g.camLocked)
    q(this.root, '#b-quick')!.classList.toggle('on', this.g.quickCast)

    if (this.shopOpen) {
      this.renderShop()
      if (!w.nearShop(p) && false) this.closeShop()
    }
    if (this.scoreHeld || this.statsPinned) this.renderScore()
  }
}
