/**
 * Render probe: paste into the browser console (or run through a browser tool) once a single-player match is running
 * (`window.__game` exists). Hooks the renderer and reports CPU / GPU / draw-call cost per frame.
 *
 *   await __probe.run('label', 3000)      measure for 3 s of real time
 *   await __probe.teamfight(15000)        cluster all heroes at mid and measure a 15 s brawl (worst case)
 *   await __probe.leak(8)                 fast-forward N sim minutes and report GPU geometry / texture growth
 *
 * GPU time uses EXT_disjoint_timer_query_webgl2 (Chrome/Edge); CPU time is the time spent inside composer.render().
 */
(() => {
  const g = window.__game
  if (!g) throw new Error('start a single-player match first (window.__game is missing)')
  const R = g.renderer
  const w = g.world
  const gl = R.gl.getContext()
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const st = (a) => {
    const s = [...a].sort((x, y) => x - y)
    const f = (v) => Math.round(v * 100) / 100
    return { mean: f(a.reduce((x, y) => x + y, 0) / (a.length || 1)), p50: f(s[Math.floor(s.length * 0.5)]), p95: f(s[Math.floor(s.length * 0.95)]), max: f(s[s.length - 1]) }
  }

  const frames = { cpu: [], calls: [], tris: [], gpu: [], draw: [] }
  const pending = []
  R.gl.info.autoReset = false
  const render = R.composer.render.bind(R.composer)
  R.composer.render = () => {
    R.gl.info.reset()
    let q
    if (ext) {
      q = gl.createQuery()
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
    }
    const s = performance.now()
    render()
    frames.cpu.push(performance.now() - s)
    if (ext) {
      gl.endQuery(ext.TIME_ELAPSED_EXT)
      pending.push(q)
    }
    frames.calls.push(R.gl.info.render.calls)
    frames.tris.push(R.gl.info.render.triangles)
  }
  const draw = R.draw.bind(R)
  R.draw = (ov) => {
    const s = performance.now()
    draw(ov)
    frames.draw.push(performance.now() - s)
  }
  const poll = () => {
    while (pending.length && ext && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = pending.shift()
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) frames.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
      gl.deleteQuery(q)
    }
    requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)

  const run = async (label, ms = 3000) => {
    await sleep(600)
    for (const k in frames) frames[k].length = 0
    const ft = []
    let last = performance.now()
    let go = true
    const loop = (t) => {
      ft.push(t - last)
      last = t
      if (go) requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
    await sleep(ms)
    go = false
    const cut = (a) => a.slice(3)
    return {
      label,
      frameMs: st(cut(ft)),
      cpuRenderMs: st(cut(frames.cpu)),
      drawFnMs: st(cut(frames.draw)),
      gpuMs: ext ? st(cut(frames.gpu)) : 'timer query unsupported',
      drawCalls: st(cut(frames.calls)),
      trianglesK: st(cut(frames.tris).map((x) => x / 1000)),
      units: w.units.length,
      geometries: R.gl.info.memory.geometries,
    }
  }

  const teamfight = async (ms = 15000) => {
    for (const h of w.heroes) {
      w.addXp(h, 1e9)
      w.autoLevel(h)
      w.recalc(h)
      h.dead = false
      h.hp = h.st.maxHp * 5
      h.mana = h.st.maxMana
      h.buffs = []
    }
    let i = 0
    for (const h of w.heroes) {
      const a = (i++ / w.heroes.length) * 6.283
      h.x = 4800 + (h.team ? 260 : -260) + Math.cos(a) * 90
      h.y = 4800 + Math.sin(a) * 160
      h.order = { t: 'idle' }
    }
    g.camLocked = false
    R.cam.x = 4800
    R.cam.y = 4800
    return run('teamfight @ mid', ms)
  }

  const leak = async (minutes = 8) => {
    const i = R.gl.info
    const snap = () => ({ simMin: +(w.time / 60).toFixed(1), units: w.units.length, entries: R.entries.size, geometries: i.memory.geometries, textures: i.memory.textures, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) })
    const rows = [snap()]
    g.paused = true
    for (let m = 0; m < minutes; m++) {
      for (let s = 0; s < 60; s++) {
        for (let k = 0; k < 60; k++) w.tick(1 / 60)
        if (s % 2 === 0) R.draw(g.overlay())
      }
      await sleep(30)
      rows.push(snap())
    }
    g.paused = false
    return rows
  }

  window.__probe = { run, teamfight, leak, frames }
  return 'probe ready'
})()
