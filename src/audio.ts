/** Synthesized sound effects, announcer stings and ambient music (WebAudio, no asset files). */

const hashStr = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private last: Record<string, number> = {}
  muted = false
  private musicOn = false
  private musicTimer = 0

  init() {
    if (this.ctx) return
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.35
      this.master.connect(this.ctx.destination)
      this.sfxBus = this.ctx.createGain()
      this.sfxBus.gain.value = 1
      this.sfxBus.connect(this.master)
      this.musicBus = this.ctx.createGain()
      this.musicBus.gain.value = 0.5
      this.musicBus.connect(this.master)
    } catch {
      this.ctx = null
    }
  }

  toggle() {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35
    return this.muted
  }

  /* ----------------------------------------------------------------- basics */

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0, bus?: GainNode | null) {
    const c = this.ctx!
    const t = c.currentTime + delay
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(bus || this.sfxBus!)
    o.start(t)
    o.stop(t + dur + 0.03)
  }

  private noise(dur: number, vol: number, freq: number, delay = 0, type: BiquadFilterType = 'lowpass') {
    const c = this.ctx!
    const n = Math.floor(c.sampleRate * dur)
    const buf = c.createBuffer(1, n, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const s = c.createBufferSource()
    s.buffer = buf
    const f = c.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    const g = c.createGain()
    g.gain.value = vol
    s.connect(f)
    f.connect(g)
    g.connect(this.sfxBus!)
    s.start(c.currentTime + delay)
  }

  /* ------------------------------------------------------------------- sfx */

  play(kind: string, vol = 1, tag = '') {
    if (!this.ctx || this.muted || vol < 0.04) return
    const now = performance.now()
    const gap = kind === 'hit' || kind === 'shot' ? 55 : kind === 'cast' ? 70 : 90
    if (now - (this.last[kind] || 0) < gap) return
    this.last[kind] = now
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    const v = Math.min(1, vol)
    switch (kind) {
      case 'hit':
        this.noise(0.09, 0.5 * v, 1800)
        this.tone(150, 70, 0.09, 'square', 0.18 * v)
        break
      case 'shot':
        this.tone(900, 380, 0.08, 'triangle', 0.16 * v)
        break
      case 'cast': {
        // each ability color gets its own timbre and pitch
        const h = hashStr(tag || 'x')
        const base = 260 + (h % 7) * 60
        const type = (['triangle', 'sine', 'sawtooth', 'square'] as OscillatorType[])[h % 4]
        this.tone(base, base * 2.2, 0.24, type, 0.17 * v)
        this.tone(base * 1.5, base * 3.1, 0.24, 'sine', 0.09 * v, 0.02)
        this.noise(0.18, 0.12 * v, 2200 + (h % 5) * 500, 0, 'bandpass')
        break
      }
      case 'stun':
        this.tone(220, 110, 0.3, 'sawtooth', 0.2 * v)
        break
      case 'levelup':
        ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.2 * v, i * 0.07))
        break
      case 'gold':
        this.tone(1320, 1320, 0.07, 'square', 0.12 * v)
        this.tone(1760, 1760, 0.12, 'square', 0.12 * v, 0.06)
        break
      case 'deny':
        this.tone(520, 260, 0.14, 'square', 0.14 * v)
        break
      case 'kill':
        this.tone(196, 98, 0.45, 'sawtooth', 0.28 * v)
        this.noise(0.25, 0.3 * v, 900)
        break
      case 'death':
        this.tone(330, 55, 0.6, 'sawtooth', 0.26 * v)
        this.noise(0.4, 0.25 * v, 700)
        break
      case 'respawn':
        ;[392, 523, 659].forEach((f, i) => this.tone(f, f * 1.01, 0.22, 'sine', 0.2 * v, i * 0.09))
        break
      case 'tower':
        this.noise(0.9, 0.9 * v, 600)
        this.tone(90, 35, 0.9, 'sawtooth', 0.35 * v)
        break
      case 'ward':
        this.tone(660, 990, 0.12, 'sine', 0.18 * v)
        this.tone(990, 1320, 0.16, 'sine', 0.14 * v, 0.1)
        break
      case 'rune':
        ;[440, 554, 659, 880].forEach((f, i) => this.tone(f, f * 1.02, 0.16, 'triangle', 0.2 * v, i * 0.06))
        this.noise(0.3, 0.08 * v, 5000, 0, 'highpass')
        break
      case 'delivery':
        this.tone(880, 880, 0.08, 'triangle', 0.16 * v)
        this.tone(1175, 1175, 0.14, 'triangle', 0.16 * v, 0.09)
        break
      case 'ui':
        this.tone(740, 740, 0.05, 'square', 0.08 * v)
        break
      case 'error':
        this.tone(160, 120, 0.12, 'square', 0.12)
        break
      case 'horn':
        this.tone(130, 130, 0.9, 'sawtooth', 0.2 * v)
        this.tone(195, 195, 0.9, 'sawtooth', 0.14 * v, 0.02)
        this.tone(260, 262, 0.9, 'square', 0.08 * v, 0.04)
        break
      case 'fanfare':
        ;[392, 392, 523, 659, 784].forEach((f, i) => this.tone(f, f, i === 4 ? 0.6 : 0.16, 'sawtooth', 0.15 * v, i * 0.12))
        break
      case 'doom':
        ;[294, 277, 262, 196].forEach((f, i) => this.tone(f, f * 0.98, 0.34, 'sawtooth', 0.16 * v, i * 0.22))
        break
      case 'alert':
        this.tone(880, 660, 0.18, 'square', 0.14 * v)
        this.tone(880, 660, 0.18, 'square', 0.14 * v, 0.24)
        break
    }
  }

  /* ------------------------------------------------------------- announcer */

  /** Announcer sting (the text itself is shown as an on-screen banner). tone: good/bad/neutral/epic. */
  announce(text: string, tone: 'good' | 'bad' | 'neutral' | 'epic') {
    if (!this.ctx || this.muted) return
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (/^defeat/i.test(text)) this.play('doom', 1)
    else if (/battle begins/i.test(text)) this.play('horn', 1)
    else if (tone === 'epic') this.play('fanfare', 0.9)
    else if (tone === 'bad') this.play('alert', 0.8)
    else if (tone === 'good') this.play('rune', 0.6)
    else this.play('delivery', 0.6)
  }

  /* ---------------------------------------------------------------- music */

  /** Very quiet evolving ambient pad (slow chord changes) so the world is not silent. */
  startMusic() {
    if (!this.ctx || this.musicOn) return
    this.musicOn = true
    const chords = [
      [110, 164.8, 220, 277.2],
      [98, 146.8, 196, 246.9],
      [87.3, 130.8, 174.6, 220],
      [98, 146.8, 196, 233.1],
    ]
    let i = 0
    const play = () => {
      if (!this.musicOn || !this.ctx) return
      if (!this.muted) {
        const ch = chords[i % chords.length]
        ch.forEach((f, k) => {
          const c = this.ctx!
          const t = c.currentTime
          const o = c.createOscillator()
          const g = c.createGain()
          o.type = k % 2 ? 'sine' : 'triangle'
          o.frequency.value = f
          o.detune.value = (k - 1.5) * 4
          g.gain.setValueAtTime(0.0001, t)
          g.gain.exponentialRampToValueAtTime(0.045, t + 3)
          g.gain.exponentialRampToValueAtTime(0.0001, t + 9)
          o.connect(g)
          g.connect(this.musicBus!)
          o.start(t)
          o.stop(t + 9.2)
        })
        if (i % 2 === 1) this.tone(chords[i % chords.length][3] * 4, chords[i % chords.length][3] * 4, 1.6, 'sine', 0.02, 2, this.musicBus)
      }
      i++
    }
    play()
    this.musicTimer = window.setInterval(play, 7000)
  }

  stopMusic() {
    this.musicOn = false
    window.clearInterval(this.musicTimer)
  }
}
