import type { Pick, WorldCfg } from '../sim/world'
import { HEROES } from '../sim/heroes'
import type { Lane } from '../sim/constants'
import { portraitStyle } from './hud'

const ATTRS = [
  { id: 'str', name: 'Strength', blurb: 'Health and brawn', cls: 'str' },
  { id: 'agi', name: 'Agility', blurb: 'Speed and precision', cls: 'agi' },
  { id: 'int', name: 'Intelligence', blurb: 'Mana and spellpower', cls: 'int' },
] as const
const SLOTS_PER_COLUMN = 6

const kind = (a: { ult?: boolean; behavior: string }) =>
  a.ult ? 'Ultimate' : a.behavior === 'passive' ? 'Passive' : a.behavior === 'toggle' ? 'Toggle' : a.behavior === 'unit' ? 'Unit target' : a.behavior === 'point' ? 'Point target' : 'No target'

const LANE_NAME: Record<Lane, string> = { top: 'Top', mid: 'Mid', bot: 'Bottom' }
const shuffle = <T,>(a: T[]) => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}
const LANE_SLOTS: Lane[] = ['top', 'top', 'mid', 'bot', 'bot']

export function showSelect(root: HTMLElement, onStart: (cfg: WorldCfg) => void) {
  let heroId: string | null = null
  let lane: Lane = 'mid'
  let justPicked = false
  root.className = 'screen select'

  // The enemy team has already "picked"; your allies pick after you do.
  const direHeroes = shuffle(HEROES.map((x) => x.id)).slice(0, 5)
  const direLanes = shuffle(LANE_SLOTS)
  const dire: Pick[] = direHeroes.map((hero, i) => ({ hero, lane: direLanes[i] }))
  let allyHeroes: string[] = []
  let allyLanes: Lane[] = []
  const planAllies = (rePick: boolean) => {
    if (!heroId) return
    // the player overrides the bots: an enemy bot holding this hero swaps to another one
    const clash = direHeroes.indexOf(heroId)
    if (clash >= 0) {
      const free = shuffle(HEROES.map((x) => x.id).filter((i) => i !== heroId && !direHeroes.includes(i)))
      if (free.length) {
        direHeroes[clash] = free[0]
        dire[clash].hero = free[0]
      }
    }
    if (rePick || allyHeroes.length < 4 || allyHeroes.includes(heroId)) {
      const ids = HEROES.map((x) => x.id).filter((i) => i !== heroId)
      const fresh = ids.filter((i) => !direHeroes.includes(i))
      allyHeroes = [...shuffle(fresh), ...shuffle(ids.filter((i) => !fresh.includes(i)))].slice(0, 4)
    }
    const rest = [...LANE_SLOTS]
    rest.splice(rest.indexOf(lane), 1)
    allyLanes = shuffle(rest)
  }
  const rad = (): Pick[] => (heroId ? [{ hero: heroId, lane }, ...allyHeroes.map((hero, i) => ({ hero, lane: allyLanes[i] }))] : [])

  const slotHtml = (pick: Pick | undefined, you = false, team: 'rad' | 'dire' = 'rad') => {
    if (!pick) return `<div class="pslot empty ${team}"><div class="pp"><span>?</span></div><div class="pn">Picking…</div></div>`
    const def = HEROES.find((x) => x.id === pick.hero)!
    return `<div class="pslot ${team} ${you ? 'you' : ''}">
      <div class="pp" style="${portraitStyle(def)}">${you ? '<i class="ybadge">YOU</i>' : ''}</div>
      <div class="pn">${def.name}</div><div class="pl ln-${pick.lane}">${LANE_NAME[pick.lane]}</div></div>`
  }
  const rosterHtml = () => {
    const r = rad()
    const left = Array.from({ length: 5 }, (_, i) => slotHtml(r[i], i === 0 && !!r[0], 'rad')).join('')
    const right = dire.map((p) => slotHtml(p, false, 'dire')).join('')
    return `<div class="roster">
      <div class="rteam rad"><h5>Radiant <small>your team</small></h5><div class="rslots">${left}</div></div>
      <div class="rvs">VS</div>
      <div class="rteam dire"><h5>Dire <small>enemy team</small></h5><div class="rslots">${right}</div></div></div>`
  }

  const render = () => {
    const h = heroId ? HEROES.find((x) => x.id === heroId)! : null
    const columns = ATTRS.map((at) => {
      const list = HEROES.filter((x) => x.attr === at.id)
      const tiles = list
        .map(
          (x) => `<div class="tile ${x.id === heroId ? 'on' : ''}" data-id="${x.id}" style="${portraitStyle(x)}">
            <span class="tn">${x.name}</span><i class="tcheck">✓</i></div>`,
        )
        .join('')
      const locked = Array.from({ length: Math.max(0, SLOTS_PER_COLUMN - list.length) })
        .map(() => `<div class="tile locked" title="More heroes coming soon"><span>?</span></div>`)
        .join('')
      return `<div class="col col-${at.cls}">
        <div class="chead"><i class="aico a-${at.cls}"></i><div><b>${at.name}</b><small>${at.blurb}</small></div></div>
        <div class="tiles">${tiles}${locked}</div></div>`
    }).join('')

    const detail = h
      ? `<div class="detail frame ${justPicked ? 'enter' : ''}">
          <div class="d-left">
            <div class="d-port" style="${portraitStyle(h)}"></div>
            <div class="d-id">
              <div class="d-name"><i class="aico a-${h.attr}"></i>${h.name}</div>
              <div class="d-title">${h.title}</div>
              <div class="roles">${h.roles.map((r) => `<span>${r}</span>`).join('')}</div>
            </div>
          </div>
          <div class="d-mid">
            <p class="lore">${h.lore}</p>
            <div class="d-abil">
              ${h.abilities
                .map(
                  (a, i) => `<div class="dab ${a.ult ? 'ult' : ''}">
                    <div class="ai" style="background: radial-gradient(circle at 35% 30%, ${a.color}, #14161c 85%)"><span>${a.glyph}</span><i>${['Q', 'W', 'E', 'R'][i]}</i></div>
                    <div class="atip"><h4>${a.name}<small>${kind(a)}</small></h4><p>${a.desc}</p><div class="lines">${a.info(1).join(' · ')}</div></div>
                  </div>`,
                )
                .join('')}
            </div>
            <div class="d-stats">
              <span><em>STR</em><b class="a-str">${h.str}</b><small>+${h.strG}</small></span>
              <span><em>AGI</em><b class="a-agi">${h.agi}</b><small>+${h.agiG}</small></span>
              <span><em>INT</em><b class="a-int">${h.int}</b><small>+${h.intG}</small></span>
              <span><em>Move</em><b>${h.ms}</b></span>
              <span><em>Range</em><b>${h.range <= 150 ? 'Melee' : h.range}</b></span>
              <span><em>Attack</em><b>${Math.round(h.bat * 10) / 10}s</b></span>
            </div>
          </div>
          <div class="d-right">
            <div class="lane-title">Lane</div>
            <svg viewBox="0 0 120 120" class="lanes">
              <rect x="0" y="0" width="120" height="120" rx="6" fill="#16301a"/>
              <polygon points="0,0 120,0 120,120" fill="#2d2e16"/>
              <polyline points="14,100 10,86 10,10 82,10 100,14" class="ln ${lane === 'top' ? 'on' : ''}" data-lane="top"/>
              <line x1="14" y1="100" x2="100" y2="14" class="ln ${lane === 'mid' ? 'on' : ''}" data-lane="mid"/>
              <polyline points="14,100 34,108 108,108 108,34 100,14" class="ln ${lane === 'bot' ? 'on' : ''}" data-lane="bot"/>
              <rect x="8" y="94" width="12" height="12" fill="#5fd35f"/><rect x="96" y="8" width="12" height="12" fill="#e0463a"/>
            </svg>
            <div class="lane-btns">
              ${(['top', 'mid', 'bot'] as Lane[]).map((l) => `<button data-lane="${l}" class="${l === lane ? 'on' : ''}">${l === 'top' ? 'Top' : l === 'mid' ? 'Mid' : 'Bottom'}</button>`).join('')}
            </div>
          </div>
          <button class="start" id="start">ENTER THE BATTLE</button>
        </div>`
      : `<div class="hint">Select a hero to see their abilities and begin</div>`

    root.innerHTML = `
      <div class="top">
        <div class="brand"><h1>ANCIENT CLASH</h1></div>
        <div class="pick-title">Choose Your Hero</div>
        <div class="pick-sub">5v5 · three lanes · you and four bots vs five bots · destroy the enemy Ancient</div>
      </div>
      ${rosterHtml()}
      <div class="board">${columns}</div>
      <div class="foot">${detail}</div>
      <div class="tipsline"><span><kbd>Right-click</kbd> move / attack</span><span><b>Deny</b> your creeps below 50% HP</span><span>Press a skill key, then <b>click</b> to cast</span><span><kbd>S</kbd> cancels an attack swing</span></div>`

    root.querySelectorAll('.tile[data-id]').forEach((el) =>
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id!
        justPicked = id !== heroId
        const changed = id !== heroId
        heroId = id
        planAllies(changed)
        render()
      }),
    )
    root.querySelectorAll('[data-lane]').forEach((el) =>
      el.addEventListener('click', () => {
        lane = (el as HTMLElement).dataset.lane as Lane
        justPicked = false
        planAllies(false)
        render()
      }),
    )
    root.querySelector('#start')?.addEventListener('click', () => {
      if (!heroId) return
      root.className = 'screen hidden'
      root.innerHTML = ''
      onStart({ playerHero: heroId, playerLane: lane, teams: { rad: rad(), dire } })
    })
  }
  render()
}

export function showEnd(root: HTMLElement, win: boolean, summary: string) {
  root.className = 'screen end ' + (win ? 'win' : 'lose')
  root.innerHTML = `
    <div class="end-box frame">
      <h1>${win ? 'VICTORY' : 'DEFEAT'}</h1>
      <p>${win ? 'The enemy Ancient has fallen.' : 'Your Ancient has been destroyed.'}</p>
      <div class="summary">${summary}</div>
      <button class="start" id="again">PLAY AGAIN</button>
    </div>`
  root.querySelector('#again')!.addEventListener('click', () => location.reload())
}
