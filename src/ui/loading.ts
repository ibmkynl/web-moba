import { HEROES } from '../sim/heroes'
import { portraitStyle } from './hud'

export interface LoadSeat {
  team: number
  hero: string
  lane: string
  name: string
  human: boolean
  you?: boolean
}

const TIPS = [
  'Right-click an enemy creep to attack it — and your own creeps below 50% health to deny them.',
  'Press a skill key, then click the target or spot to cast it.',
  'Last-hit enemy creeps for gold. Deny your own to starve the enemy of experience.',
  'Wards give your team vision for 3 minutes — place them in the river and jungle.',
  'Power runes spawn in the river every 2 minutes. Bounty runes spawn in the jungle every 3.',
  'Your courier delivers items to you when you buy away from the fountain.',
  'Destroy the towers in a lane to unlock the next ones — then the Ancient.',
  'Hold Tab to see everyone’s kills, items and net worth.',
]
const LANE: Record<string, string> = { top: 'Top', mid: 'Mid', bot: 'Bottom' }

export interface Loader {
  set(progress: number, text: string): void
  /** Fade the screen out once the minimum display time has passed. */
  finish(): Promise<void>
}

export function showLoading(root: HTMLElement, seats: LoadSeat[]): Loader {
  const t0 = performance.now()
  root.className = 'screen loading'
  const card = (s: LoadSeat, i: number) => {
    const def = HEROES.find((h) => h.id === s.hero)
    return `<div class="lcard ${s.team === 0 ? 'rad' : 'dire'} ${s.you ? 'you' : ''}" style="--d:${0.15 + i * 0.12}s">
      <div class="lp" style="${def ? portraitStyle(def) : ''}"></div>
      <div class="lt"><b>${def ? def.name : '?'}</b><small>${s.human ? '★ ' : ''}${s.name}</small></div>
      <div class="ll">${LANE[s.lane] || ''}</div></div>`
  }
  const rad = seats.filter((s) => s.team === 0).map(card).join('')
  const dire = seats.filter((s) => s.team === 1).map(card).join('')
  const embers = Array.from({ length: 22 }, (_, i) => `<i style="left:${(i * 47) % 100}%;--s:${6 + (i % 5) * 2}s;--dl:${(i % 7) * 0.7}s;--sz:${3 + (i % 4) * 2}px"></i>`).join('')
  root.innerHTML = `
    <div class="embers">${embers}</div>
    <div class="lhead"><h1>ANCIENT CLASH</h1><p>The battle is about to begin</p></div>
    <div class="lmain">
      <div class="lteam rad"><h5>Radiant</h5>${rad}</div>
      <div class="lcenter">
        <div class="rune"><div class="r1"></div><div class="r2"></div><div class="r3"></div><span>⚔</span></div>
        <div class="lstatus" id="ls-text">Preparing the battlefield…</div>
      </div>
      <div class="lteam dire"><h5>Dire</h5>${dire}</div>
    </div>
    <div class="lbar"><div class="lfill" id="ls-fill"></div></div>
    <div class="ltip" id="ls-tip">${TIPS[Math.floor(Math.random() * TIPS.length)]}</div>`
  const fill = root.querySelector('#ls-fill') as HTMLElement
  const text = root.querySelector('#ls-text') as HTMLElement
  const tip = root.querySelector('#ls-tip') as HTMLElement
  const tipTimer = window.setInterval(() => {
    tip.style.opacity = '0'
    window.setTimeout(() => {
      tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]
      tip.style.opacity = '1'
    }, 400)
  }, 4200)
  return {
    set(p, t) {
      fill.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'
      text.textContent = t
    },
    async finish() {
      fill.style.width = '100%'
      text.textContent = 'Good luck, have fun!'
      const wait = Math.max(0, 2600 - (performance.now() - t0))
      await new Promise((r) => setTimeout(r, wait))
      root.classList.add('fade')
      await new Promise((r) => setTimeout(r, 500))
      window.clearInterval(tipTimer)
      root.className = 'screen hidden'
      root.innerHTML = ''
    },
  }
}
