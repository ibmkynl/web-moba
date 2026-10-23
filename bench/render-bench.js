/**
 * Repeatable render benchmark: run in the browser console on the title screen of the dev server (`npm run dev`).
 * Starts a single-player match with the same fixed lineup as bench/sim-bench.ts, loads bench/render-probe.js and
 * runs the idle, teamfight and leak measurements.
 *
 *   await __renderBench({ dpr: 1 })     results at 1x pixel ratio
 *   await __renderBench({ dpr: 2 })     emulates a retina display (reload the page between runs)
 */
window.__renderBench = async ({ dpr = 1, quality, fightMs = 15000, leakMin = 8 } = {}) => {
  Object.defineProperty(window, 'devicePixelRatio', { get: () => dpr, configurable: true })
  if (quality) localStorage.setItem('ac-quality', quality) // 'low' | 'medium' | 'high'
  const { Game } = await import('/src/game.ts')
  const { HEROES } = await import('/src/sim/heroes.ts')
  const ids = HEROES.map((h) => h.id)
  const lanes = ['top', 'mid', 'bot', 'mid', 'bot']
  const pick = (off) => lanes.map((lane, i) => ({ hero: ids[(off + i * 3) % ids.length], lane }))
  const screen = document.getElementById('screen')
  screen.className = 'screen hidden'
  screen.innerHTML = ''
  const game = new Game({ playerHero: ids[0], playerLane: 'mid', teams: { rad: pick(0), dire: pick(1) } }, document.getElementById('game'), document.getElementById('hud'))
  window.__game = game
  game.sfx.setMuted?.(true)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  await sleep(3000)
  // eslint-disable-next-line no-eval
  ;(0, eval)(await (await fetch('/bench/render-probe.js')).text())
  const out = { dpr, quality: game.renderer.quality ?? 'n/a', viewport: `${innerWidth}x${innerHeight}` }
  out.idle = await window.__probe.drive('idle at base (driven)', 240)
  out.teamfight = await window.__probe.driveFight(Math.round((fightMs / 1000) * 40))
  out.leak = await window.__probe.leak(leakMin)
  return out
}
