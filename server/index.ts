import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import { HEROES } from '../src/sim/heroes'
import { Unit } from '../src/sim/entities'
import { World } from '../src/sim/world'
import { LANE_SLOTS, STEP, shuffle, type Lane } from '../src/sim/constants'
import { Frame, SnapshotEncoder, snapshotFor, type HostEvents } from '../src/net/snapshot'
import { randomBytes } from 'node:crypto'

const PORT = Number(process.env.PORT || 8080)
const SNAP_EVERY = 3 // ticks per snapshot (20 Hz)
const COUNTDOWN_MS = 5000
/** How long a disconnected player's hero waits (bot-controlled) for them to resume. */
const RESUME_MS = 120000
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')

/** A random hero not already used by any other seat (heroes are unique across both teams). */
const uniqueFor = (team: 0 | 1, exceptSeat: number, avoid: string[] = []) => {
  const used = new Set<string>(avoid)
  seats.forEach((s, i) => {
    if (s && i !== exceptSeat && s.hero) used.add(s.hero)
  })
  const pool = HEROES.filter((h) => !used.has(h.id))
  return (pool.length ? pool : HEROES)[Math.floor(Math.random() * (pool.length || HEROES.length))].id
}

/* ---------------------------------------------------------------- lobby state */

interface Seat {
  team: 0 | 1
  idx: number
  kind: 'bot' | 'human'
  pid: number | null
  hero: string
  lane: Lane
  ready: boolean
}
interface Player {
  pid: number
  ws: WebSocket
  name: string
  seat: number
  ping: number
  /** secret that lets this player take their hero back after a disconnect */
  token: string
  enc: SnapshotEncoder
}
/** Heroes of disconnected players, by resume token. */
const away = new Map<string, { hero: Unit; seat: number; name: string; at: number }>()

let phase: 'lobby' | 'playing' | 'ended' = 'lobby'
let nextPid = 1
const players = new Map<number, Player>()
let countdownEnd: number | null = null
const seats: Seat[] = []

function resetSeats(keepHumans: boolean) {
  const rl = shuffle(LANE_SLOTS)
  const dl = shuffle(LANE_SLOTS)
  for (let i = 0; i < 10; i++) {
    const team = (i < 5 ? 0 : 1) as 0 | 1
    const old = seats[i]
    if (keepHumans && old && old.kind === 'human' && old.pid !== null && players.has(old.pid)) {
      old.ready = false
      continue
    }
    seats[i] = { team, idx: i % 5, kind: 'bot', pid: null, hero: '', lane: (team === 0 ? rl : dl)[i % 5], ready: false }
    seats[i].hero = uniqueFor(team, i)
  }
}
resetSeats(false)

const lobbyMsg = (pid: number) => ({
  t: 'lobby',
  phase,
  me: pid,
  count: countdownEnd ? Math.max(0, countdownEnd - Date.now()) : null,
  seats: seats.map((s, i) => ({
    seat: i, team: s.team, kind: s.kind, pid: s.pid, name: s.pid !== null ? players.get(s.pid)?.name ?? '?' : 'Bot', hero: s.hero, lane: s.lane, ready: s.ready,
  })),
  people: [...players.values()].map((p) => ({ pid: p.pid, name: p.name, seat: p.seat })),
})

const send = (ws: WebSocket, m: any) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
}
const broadcastLobby = () => {
  for (const p of players.values()) send(p.ws, lobbyMsg(p.pid))
}

function freeSeat(pl: Player) {
  if (pl.seat < 0) return
  const s = seats[pl.seat]
  const rl = shuffle(LANE_SLOTS)
  s.kind = 'bot'
  s.pid = null
  s.hero = uniqueFor(s.team, pl.seat)
  s.lane = rl[0]
  s.ready = false
  pl.seat = -1
}

function checkCountdown() {
  if (phase !== 'lobby') return
  const humans = seats.filter((s) => s.kind === 'human')
  const allReady = humans.length > 0 && humans.every((s) => s.ready && s.hero)
  if (allReady && countdownEnd === null) countdownEnd = Date.now() + COUNTDOWN_MS
  else if (!allReady) countdownEnd = null
}

/* ----------------------------------------------------------------------- game */

let world: World | null = null
let heroOf = new Map<number, Unit>() // pid -> hero unit
let tickCount = 0
let seq = 0
let endAt = 0
const pending: Omit<HostEvents, 'vfx'> = { sfx: [], ann: [], txt: [] }

function sanitize(o: any): any {
  const out: any = {}
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v instanceof Unit) out[k] = { __u: v.id }
    else if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v
    else if (v === null) out[k] = null
  }
  return out
}

function startGame() {
  const rad = seats.slice(0, 5).map((s) => ({ hero: s.hero, lane: s.lane, human: s.kind === 'human' }))
  const dire = seats.slice(5).map((s) => ({ hero: s.hero, lane: s.lane, human: s.kind === 'human' }))
  const w = new World({ playerHero: rad[0].hero, playerLane: rad[0].lane, teams: { rad, dire } })
  world = w
  heroOf = new Map()
  seats.forEach((s, i) => {
    if (s.kind === 'human' && s.pid !== null) heroOf.set(s.pid, w.heroes[i])
  })
  // events keep their audience; snapshotFor filters them for each player
  w.onEvent = (k, x, y, to, tag) => pending.sfx.push([k, Math.round(x), Math.round(y), to, tag || ''])
  w.onAnnounce = (a) => pending.ann.push(a)
  w.text = (x, y, text, color = '#fff', size = 16, to) => {
    pending.txt.push([Math.round(x), Math.round(y), text, color, size, to])
  }
  phase = 'playing'
  tickCount = 0
  seq = 0
  countdownEnd = null
  for (const p of players.values()) {
    const s = p.seat
    // seatless lobby members get no snapshots, so they stay in the lobby and wait for the next match
    if (s < 0) send(p.ws, { t: 'busy' })
    else send(p.ws, { t: 'start', seat: s, team: seats[s].team, hero: seats[s].hero })
  }
  console.log(`[game] started with ${heroOf.size} human player(s)`)
}

function broadcastSnapshots() {
  const w = world!
  for (const [pid, hero] of heroOf) {
    const pl = players.get(pid)
    if (pl) {
      if (hero.h) hero.h.pname = pl.name
      hero.ping = pl.ping
    }
  }
  const ev: HostEvents = { ...pending, vfx: w.vfxQ.splice(0).map(sanitize) }
  seq++
  const frame = new Frame()
  for (const p of players.values()) {
    const hero = heroOf.get(p.pid)
    if (!hero || p.ws.readyState !== p.ws.OPEN) continue
    const snap = snapshotFor(w, hero.team, hero.id, seq, ev, frame)
    p.ws.send(JSON.stringify({ t: 'snap', s: p.enc.encode(snap) }))
  }
  pending.sfx = []
  pending.ann = []
  pending.txt = []
}

function endMatchToLobby() {
  away.clear()
  phase = 'lobby'
  world = null
  heroOf = new Map()
  resetSeats(true)
  countdownEnd = null
  for (const p of players.values()) send(p.ws, { t: 'reset' })
  broadcastLobby()
  console.log('[game] back to lobby')
}

let last = performance.now()
let acc = 0
setInterval(() => {
  const now = performance.now()
  acc += Math.min(0.25, (now - last) / 1000)
  last = now
  if (phase === 'lobby' && countdownEnd !== null && Date.now() >= countdownEnd) {
    startGame()
    return
  }
  if (phase === 'lobby') {
    acc = 0
    return
  }
  if (phase === 'playing' && world) {
    let steps = 0
    while (acc >= STEP && steps < 8) {
      world.tick(STEP)
      acc -= STEP
      steps++
      tickCount++
      if (tickCount % SNAP_EVERY === 0) broadcastSnapshots()
    }
    if (steps >= 8) acc = 0
    if (world.winner !== null) {
      broadcastSnapshots()
      phase = 'ended'
      endAt = Date.now() + 12000
    }
  }
  if (phase === 'ended' && Date.now() > endAt) endMatchToLobby()
}, 4)

// latency probe
setInterval(() => {
  for (const p of players.values()) send(p.ws, { t: 'ping', ts: Date.now() })
}, 2000)

// countdown ticks for the lobby UI (so clients see 5..1)
setInterval(() => {
  if (phase === 'lobby' && countdownEnd !== null) broadcastLobby()
}, 250)

/* ------------------------------------------------------------------- commands */

const num = (v: any, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

function command(p: Player, m: any) {
  const w = world
  const h = heroOf.get(p.pid)
  if (!w || !h || phase !== 'playing') return
  const unit = (id: any) => w.units.find((u) => u.id === id)
  const err = (e: string | null | undefined) => {
    if (e) send(p.ws, { t: 'err', msg: e })
  }
  switch (m.t) {
    case 'move': w.orderMove(h, num(m.x), num(m.y)); break
    case 'amove': w.orderAMove(h, num(m.x), num(m.y)); break
    case 'attack': {
      const t = unit(m.id)
      if (t) w.orderAttack(h, t)
      break
    }
    case 'stop': w.orderStop(h); break
    case 'hold': w.orderHold(h); break
    case 'cast': {
      const i = num(m.i, -1)
      const st = i >= 0 && i < 4 ? h.h!.abilities[i] : i === 4 ? h.h!.stolen : null
      if (!st) break
      err(w.orderCast(h, st, m.tid ? unit(m.tid) : undefined, num(m.x), num(m.y)))
      break
    }
    case 'level': w.levelAbility(h, num(m.i)); break
    case 'buy': err(w.buyItem(h, String(m.id))); break
    case 'sell': w.sellItem(h, num(m.slot)); break
    case 'item': err(w.useItem(h, num(m.slot), m.x === undefined ? undefined : num(m.x), m.y === undefined ? undefined : num(m.y))); break
    case 'ward': err(w.orderWard(h, num(m.slot), num(m.x), num(m.y))); break
    case 'tp': err(w.useTeleport(h, num(m.x), num(m.y))); break
    case 'tkland': w.tkLand(h, num(m.x), num(m.y)); break
  }
}

/** A reconnecting player takes their hero back from the bot. */
function resume(p: Player, token: string) {
  const a = away.get(token)
  if (!a || phase !== 'playing' || Date.now() - a.at > RESUME_MS || !a.hero.h) return
  away.delete(token)
  p.name = a.name
  p.seat = a.seat
  p.token = token
  if (seats[a.seat]) seats[a.seat].pid = p.pid
  a.hero.h.isHuman = true
  heroOf.set(p.pid, a.hero)
  p.enc.reset()
  send(p.ws, { t: 'start', seat: a.seat, team: a.hero.team, hero: a.hero.h.def.id, resume: 1 })
  console.log(`[game] ${p.name} resumed`)
}

function onMessage(p: Player, m: any) {
  switch (m.t) {
    case 'resume':
      resume(p, String(m.token || ''))
      return
    case 'pong':
      p.ping = Math.max(0, Date.now() - num(m.ts, Date.now()))
      return
    case 'name':
      p.name = String(m.name || 'Player').slice(0, 16)
      broadcastLobby()
      return
    case 'seat': {
      if (phase !== 'lobby') return
      const i = num(m.seat, -1)
      if (i < 0 || i > 9) return
      const s = seats[i]
      if (s.kind === 'human' && s.pid !== p.pid) return
      if (p.seat === i) return
      freeSeat(p)
      s.kind = 'human'
      s.pid = p.pid
      s.hero = ''
      s.ready = false
      p.seat = i
      checkCountdown()
      broadcastLobby()
      return
    }
    case 'unseat':
      if (phase !== 'lobby') return
      freeSeat(p)
      checkCountdown()
      broadcastLobby()
      return
    case 'hero': {
      if (phase !== 'lobby' || p.seat < 0) return
      if (!HEROES.some((h) => h.id === m.hero)) return
      const mine = seats[p.seat]
      const clash = seats.findIndex((x, i) => i !== p.seat && x.hero === m.hero)
      if (clash >= 0) {
        if (seats[clash].kind === 'human') {
          send(p.ws, { t: 'err', msg: 'That hero was already picked by another player' })
          return
        }
        // a bot gives the hero up (players can override bots)
        seats[clash].hero = uniqueFor(mine.team, clash, [m.hero])
      }
      mine.hero = m.hero
      mine.ready = false
      checkCountdown()
      broadcastLobby()
      return
    }
    case 'lane': {
      if (phase !== 'lobby' || p.seat < 0) return
      if (!['top', 'mid', 'bot'].includes(m.lane)) return
      seats[p.seat].lane = m.lane
      seats[p.seat].ready = false
      checkCountdown()
      broadcastLobby()
      return
    }
    case 'ready': {
      if (phase !== 'lobby' || p.seat < 0) return
      const s = seats[p.seat]
      if (!s.hero) return
      s.ready = !!m.ready
      checkCountdown()
      broadcastLobby()
      return
    }
    default:
      command(p, m)
  }
}

/* --------------------------------------------------------------------- server */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
}

const server = http.createServer((req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    let file = path.normalize(path.join(DIST, url === '/' ? 'index.html' : url))
    if (!file.startsWith(DIST + path.sep)) {
      res.writeHead(403).end()
      return
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    if (!fs.existsSync(file)) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end('Client not built. Run: npm run host')
      return
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' })
    fs.createReadStream(file).pipe(res)
  } catch {
    res.writeHead(500).end()
  }
})

// snapshots are repetitive JSON: deflate shrinks them about 6x for ~0.2 ms of CPU each (see bench/sim-bench.ts --snap)
const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } } })
wss.on('connection', (ws) => {
  if (players.size >= 14) {
    send(ws, { t: 'full' })
    ws.close()
    return
  }
  const p: Player = { pid: nextPid++, ws, name: 'Player ' + (nextPid - 1), seat: -1, ping: 0, token: randomBytes(12).toString('hex'), enc: new SnapshotEncoder() }
  players.set(p.pid, p)
  send(ws, { t: 'welcome', pid: p.pid, token: p.token, heroes: HEROES.map((h) => h.id) })
  if (phase !== 'lobby') send(ws, { t: 'busy' })
  broadcastLobby()
  ws.on('message', (data) => {
    try {
      onMessage(p, JSON.parse(String(data)))
    } catch (e) {
      console.warn('[net] bad message', e)
    }
  })
  ws.on('close', () => {
    players.delete(p.pid)
    if (phase === 'lobby') {
      freeSeat(p)
      checkCountdown()
    } else if (world) {
      // a disconnected human is replaced by a bot until they resume
      const hero = heroOf.get(p.pid)
      if (hero && hero.h) {
        hero.h.isHuman = false
        hero.noAuto = true
        world.autoLevel(hero)
        if (phase === 'playing') away.set(p.token, { hero, seat: p.seat, name: p.name, at: Date.now() })
      }
      heroOf.delete(p.pid)
    }
    if ((phase === 'playing' || phase === 'ended') && heroOf.size === 0) {
      // nobody left: end the match unless someone resumes within the grace period
      const grace = phase === 'playing' && away.size ? 30000 : 0
      setTimeout(() => {
        if ((phase === 'playing' || phase === 'ended') && heroOf.size === 0) {
          console.log('[game] all players left, ending the match')
          endMatchToLobby()
        }
      }, grace)
      return
    }
    broadcastLobby()
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nAncient Clash server running.')
  console.log(`  This PC:   http://localhost:${PORT}`)
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  On your LAN: http://${i.address}:${PORT}   <- share this link`)
  }
  console.log('\nOpen the link, take a seat, pick a hero and press Ready.\n')
})
