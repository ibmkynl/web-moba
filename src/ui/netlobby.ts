import { HEROES } from '../sim/heroes'
import { LANE_NAME, type Lane } from '../sim/constants'
import type { NetClient } from '../net/client'
import { portraitStyle } from './hud'
import { esc } from './html'

const ATTRS = [
  { id: 'str', name: 'Strength', cls: 'str' },
  { id: 'agi', name: 'Agility', cls: 'agi' },
  { id: 'int', name: 'Intelligence', cls: 'int' },
] as const

export function showTitle(root: HTMLElement, onSingle: () => void, onMulti: () => Promise<string | null>) {
  root.className = 'screen select title'
  root.innerHTML = `
    <div class="title-box">
      <h1>ANCIENT CLASH</h1>
      <p>A browser MOBA — 5v5, three lanes, destroy the Ancient</p>
      <div class="title-btns">
        <button id="t-single" class="start">SINGLE PLAYER</button>
        <button id="t-multi" class="start alt">MULTIPLAYER · LAN</button>
      </div>
      <div class="title-note" id="t-note">Multiplayer: the host runs the game server on their PC and shares the link. Everyone opens the link, takes a seat and picks a hero.</div>
    </div>`
  root.querySelector('#t-single')!.addEventListener('click', onSingle)
  root.querySelector('#t-multi')!.addEventListener('click', async () => {
    const note = root.querySelector('#t-note') as HTMLElement
    note.textContent = 'Connecting…'
    const err = await onMulti()
    if (err) {
      note.innerHTML = `<b class="bad">${esc(err)}</b><br/>Ask the host to run <code>npm run host</code> and open the link they share (like http://192.168.x.x:8080).`
    }
  })
}

interface SeatInfo {
  seat: number
  team: number
  kind: 'bot' | 'human'
  pid: number | null
  name: string
  hero: string
  lane: string
  ready: boolean
}

export function showNetLobby(root: HTMLElement, client: NetClient, onLeave: () => void) {
  root.className = 'screen select netlobby'
  let me = 0
  let state: any = null
  let busy = false
  let lastKey = ''
  const savedName = localStorage.getItem('ac-name') || ''

  const heroDef = (id: string) => HEROES.find((h) => h.id === id)

  const seatHtml = (s: SeatInfo) => {
    const mine = s.pid === me && s.kind === 'human'
    const def = s.hero ? heroDef(s.hero) : null
    const cls = ['nseat', s.team === 0 ? 'rad' : 'dire', s.kind, mine ? 'mine' : '', s.ready ? 'ready' : ''].join(' ')
    const other = s.kind === 'human' && !mine
    return `<div class="${cls}" data-seat="${s.seat}" ${other ? 'data-locked="1"' : ''}>
      <div class="np" style="${def ? portraitStyle(def) : ''}">${def ? '' : '<span>?</span>'}${mine ? '<i class="ybadge">YOU</i>' : ''}${s.ready ? '<i class="rbadge">✓</i>' : ''}</div>
      <div class="nt"><b>${s.kind === 'human' ? esc(s.name) : 'Bot'}</b><small>${def ? def.name : s.kind === 'human' ? 'Picking…' : ''}</small></div>
      <div class="nl ln-${s.lane}">${LANE_NAME[s.lane as Lane] || ''}</div>
      ${s.kind === 'bot' ? '<em class="take">Take seat</em>' : ''}
    </div>`
  }

  const render = () => {
    if (!state) return
    const seats: SeatInfo[] = state.seats
    const mySeat = seats.find((s) => s.kind === 'human' && s.pid === me)
    const key = JSON.stringify([seats, state.people, busy, state.phase])
    const count = state.count as number | null
    const overlay = root.querySelector('.cdown') as HTMLElement | null
    if (key === lastKey) {
      if (overlay) {
        overlay.classList.toggle('hidden', count === null)
        if (count !== null) overlay.querySelector('b')!.textContent = String(Math.max(1, Math.ceil(count / 1000)))
      }
      return
    }
    lastKey = key
    const rad = seats.filter((s) => s.team === 0).map(seatHtml).join('')
    const dire = seats.filter((s) => s.team === 1).map(seatHtml).join('')
    const tiles = ATTRS.map((at) => {
      const list = HEROES.filter((h) => h.attr === at.id)
      return `<div class="col col-${at.cls}"><div class="chead"><i class="aico a-${at.cls}"></i><div><b>${at.name}</b></div></div>
        <div class="tiles">${list
          .map((h) => {
            const owner = mySeat ? seats.find((x) => x.seat !== mySeat.seat && x.hero === h.id) : undefined
            const takenBy = owner ? (owner.kind === 'human' ? esc(owner.name) : 'a bot') : ''
            return `<div class="tile ${mySeat && mySeat.hero === h.id ? 'on' : ''} ${owner && owner.kind === 'human' ? 'taken' : ''}" data-hero="${h.id}" ${owner && owner.kind === 'human' ? 'data-taken="1"' : ''} title="${owner ? 'Picked by ' + takenBy : ''}" style="${portraitStyle(h)}"><span class="tn">${h.name}</span><i class="tcheck">✓</i>${owner && owner.kind === 'human' ? `<em class="tk">${takenBy}</em>` : ''}</div>`
          })
          .join('')}</div></div>`
    }).join('')
    const people = (state.people as any[]).map((p) => `<span class="${p.pid === me ? 'me' : ''}">${esc(p.name)}${p.seat >= 0 ? '' : ' <small>(no seat)</small>'}</span>`).join('')
    root.innerHTML = `
      <div class="nl-head">
        <h2>Game Lobby</h2>
        <div class="nl-name">Your name <input id="nm" maxlength="16" value="${esc(state.people.find((p: any) => p.pid === me)?.name || savedName)}"/></div>
        <button id="nl-leave" class="mini">Leave</button>
      </div>
      <div class="nl-hint">${busy ? '<b>A match is in progress.</b> You can take a seat when it ends.' : mySeat ? 'Pick a hero (each hero can be used once per team), choose your lane, then press <b>Ready</b>. The match starts 5 seconds after everyone is ready.' : 'Click a seat on <b>Radiant</b> or <b>Dire</b> to join. Taking a seat removes that bot.'}</div>
      <div class="nl-teams">
        <div class="nl-team rad"><h5>Radiant</h5>${rad}</div>
        <div class="nvs">VS</div>
        <div class="nl-team dire"><h5>Dire</h5>${dire}</div>
      </div>
      ${
        mySeat && !busy
          ? `<div class="nl-pick">
              <div class="board">${tiles}</div>
              <div class="nl-ctrl">
                <div class="nl-lanes">${['top', 'mid', 'bot'].map((l) => `<button data-lane="${l}" class="${mySeat.lane === l ? 'on' : ''}">${LANE_NAME[l as Lane]}</button>`).join('')}</div>
                <button id="nl-ready" class="start ${mySeat.ready ? 'on' : ''}" ${mySeat.hero ? '' : 'disabled'}>${mySeat.ready ? 'READY ✓ (click to cancel)' : mySeat.hero ? 'READY' : 'PICK A HERO'}</button>
                <button id="nl-stand" class="mini">Stand up</button>
              </div>
            </div>`
          : ''
      }
      <div class="nl-people">In lobby: ${people}</div>
      <div class="cdown ${count === null ? 'hidden' : ''}"><div>Match starts in</div><b>${count === null ? '' : Math.max(1, Math.ceil(count / 1000))}</b></div>`

    root.querySelectorAll('.nseat').forEach((el) =>
      el.addEventListener('click', () => {
        const e = el as HTMLElement
        if (e.dataset.locked || busy) return
        client.send({ t: 'seat', seat: Number(e.dataset.seat) })
      }),
    )
    root.querySelectorAll('.tile[data-hero]').forEach((el) =>
      el.addEventListener('click', () => {
        if ((el as HTMLElement).dataset.taken) return
        client.send({ t: 'hero', hero: (el as HTMLElement).dataset.hero })
      }),
    )
    root.querySelectorAll('[data-lane]').forEach((el) => el.addEventListener('click', () => client.send({ t: 'lane', lane: (el as HTMLElement).dataset.lane })))
    root.querySelector('#nl-ready')?.addEventListener('click', () => client.send({ t: 'ready', ready: !mySeat!.ready }))
    root.querySelector('#nl-stand')?.addEventListener('click', () => client.send({ t: 'unseat' }))
    root.querySelector('#nl-leave')?.addEventListener('click', onLeave)
    const nm = root.querySelector('#nm') as HTMLInputElement | null
    nm?.addEventListener('change', () => {
      localStorage.setItem('ac-name', nm.value)
      client.send({ t: 'name', name: nm.value })
    })
  }

  client.onLobby = (m) => {
    me = m.me
    state = m
    busy = m.phase !== 'lobby'
    render()
  }
  client.onBusy = () => {
    busy = true
    lastKey = ''
    render()
  }
  if (savedName) client.send({ t: 'name', name: savedName })
}
