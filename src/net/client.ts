/** Thin WebSocket wrapper used by the lobby and the in-game client. */
export class NetClient {
  ws!: WebSocket
  pid = 0
  lastLobby: any = null
  onLobby: ((m: any) => void) | null = null
  onStart: ((m: any) => void) | null = null
  onSnap: ((s: any) => void) | null = null
  onErr: ((msg: string) => void) | null = null
  onReset: (() => void) | null = null
  onClose: (() => void) | null = null
  onBusy: (() => void) | null = null
  /** resume token of the previous connection (this tab), offered to the host on welcome */
  private prevToken: string | null = null

  /** ws url: same host as the page (the host PC serves both), or :8080 when running the vite dev server. */
  static url() {
    const loc = window.location
    const host = loc.port === '5173' || loc.port === '4173' ? `${loc.hostname}:8080` : loc.host
    return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(NetClient.url())
      this.ws = ws
      let opened = false
      ws.onopen = () => {
        opened = true
        resolve()
      }
      ws.onerror = () => {
        if (!opened) reject(new Error('Could not reach the game server'))
      }
      ws.onclose = () => this.onClose?.()
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data)
        switch (m.t) {
          case 'welcome': {
            this.pid = m.pid
            // a reload or a dropped connection: ask for our hero back (the host ignores unknown tokens)
            const prev = this.prevToken ?? sessionStorage.getItem('ac-token')
            sessionStorage.setItem('ac-token', m.token)
            if (prev && prev !== m.token) {
              this.prevToken = prev
              this.send({ t: 'resume', token: prev })
            } else this.prevToken = null
            break
          }
          case 'lobby':
            this.lastLobby = m
            this.onLobby?.(m)
            break
          case 'start':
            // a resumed hero keeps its original token for the next disconnect
            if (m.resume && this.prevToken) sessionStorage.setItem('ac-token', this.prevToken)
            this.prevToken = null
            this.onStart?.(m)
            break
          case 'snap':
            this.onSnap?.(m.s)
            break
          case 'err':
            this.onErr?.(m.msg)
            break
          case 'reset':
            this.onReset?.()
            break
          case 'busy':
            this.onBusy?.()
            break
          case 'ping':
            this.send({ t: 'pong', ts: m.ts })
            break
        }
      }
    })
  }

  send(m: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m))
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }
}
