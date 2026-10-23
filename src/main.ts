import './styles.css'
import { Game } from './game'
import { NetClient } from './net/client'
import { Replica, SnapshotDecoder } from './net/snapshot'
import { showEnd, showSelect } from './ui/screens'
import { showNetLobby, showTitle } from './ui/netlobby'
import { showLoading, type LoadSeat } from './ui/loading'

/** Yield so the loading screen can paint; falls back to a timer when the tab is hidden and frames are not delivered. */
const nextFrame = () =>
  new Promise<void>((r) => {
    let done = false
    const fin = () => {
      if (!done) {
        done = true
        r()
      }
    }
    requestAnimationFrame(() => setTimeout(fin, 60))
    setTimeout(fin, 220)
  })

const canvas = document.getElementById('game') as HTMLCanvasElement
const hud = document.getElementById('hud') as HTMLElement
const screen = document.getElementById('screen') as HTMLElement

function wireEnd(game: Game) {
  game.onEnd = (winner) => {
    const w = game.world
    const mine = game.player.team
    const lines = [0, 1].map((t) => `<div class="sl t${t}">${t === 0 ? 'Radiant' : 'Dire'}: ${w.kills[t]} kills</div>`).join('')
    const p = game.player.h!
    setTimeout(
      () =>
        showEnd(
          screen,
          winner === mine,
          `${lines}<div class="sl">You: ${p.kills}/${p.deaths}/${p.assists} · ${p.lh} last hits · ${p.dn} denies</div><div class="sl">Match time ${Math.floor(w.time / 60)}:${String(Math.floor(w.time % 60)).padStart(2, '0')}</div>`,
        ),
      1200,
    )
  }
}

function singlePlayer() {
  showSelect(screen, async (cfg) => {
    const seats: LoadSeat[] = [
      ...(cfg.teams?.rad || []).map((p, i) => ({ team: 0, hero: p.hero, lane: p.lane, name: i === 0 ? 'You' : 'Bot', human: i === 0, you: i === 0 })),
      ...(cfg.teams?.dire || []).map((p) => ({ team: 1, hero: p.hero, lane: p.lane, name: 'Bot', human: false })),
    ]
    const loader = showLoading(screen, seats)
    loader.set(0.2, 'Building the map…')
    await nextFrame()
    const game = new Game(cfg, canvas, hud)
    ;(window as any).__game = game
    wireEnd(game)
    loader.set(0.9, 'Warming up the heroes…')
    await loader.finish()
  })
}

async function multiplayer(): Promise<string | null> {
  const client = new NetClient()
  try {
    await client.connect()
  } catch (e: any) {
    return e?.message || 'Could not reach the game server'
  }
  let game: Game | null = null
  showNetLobby(screen, client, () => {
    client.close()
    location.reload()
  })
  client.onStart = (m) => {
    if (game) {
      // resumed after a dropped connection: the next snapshot is a keyframe
      reconnecting = false
      game.hud.toast('Reconnected')
      return
    }
    // the lobby screen is gone; late lobby messages must not redraw it over the match or the end screen
    client.onLobby = null
    client.onBusy = null
    const lobbySeats: any[] = (client.lastLobby?.seats as any[]) || []
    const seats: LoadSeat[] = lobbySeats.map((x) => ({ team: x.team, hero: x.hero, lane: x.lane, name: x.name, human: x.kind === 'human', you: x.seat === m.seat }))
    const loader = showLoading(screen, seats)
    loader.set(0.15, 'Connected to the host…')
    const replica = new Replica()
    const decoder = new SnapshotDecoder()
    let building = false
    client.onSnap = async (d) => {
      const s = decoder.decode(d)
      if (!s) return
      replica.apply(s, performance.now())
      if (game || building) return
      building = true
      loader.set(0.45, 'Receiving the world…')
      await nextFrame()
      loader.set(0.7, 'Building the map…')
      await nextFrame()
      game = new Game(null, canvas, hud, { client, replica })
      ;(window as any).__game = game
      wireEnd(game)
      loader.set(0.95, 'Compiling effects…')
      await loader.finish()
    }
  }
  client.onErr = (msg) => {
    game?.hud.toast(msg)
    game?.sfx.play('error')
  }
  client.onReset = () => location.reload()
  let reconnecting = false
  client.onClose = () => {
    if (!game) {
      showTitle(screen, singlePlayer, multiplayer)
      return
    }
    if (reconnecting) return // a failed attempt closing; the retry loop handles it
    reconnecting = true
    // try to get back in: on welcome the client offers its resume token and the host hands the hero back
    game.hud.toast('Connection lost — reconnecting…')
    let tries = 0
    const giveUp = () => {
      game!.hud.toast('Could not reconnect to the host')
      setTimeout(() => location.reload(), 2500)
    }
    const retry = () => {
      if (++tries > 15) return giveUp()
      client
        .connect()
        .then(() => setTimeout(() => reconnecting && giveUp(), 5000)) // connected, but the host did not hand the hero back
        .catch(() => setTimeout(retry, 1500))
    }
    setTimeout(retry, 800)
  }
  return null
}

showTitle(screen, singlePlayer, multiplayer)
