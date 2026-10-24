/** Platform-specific modifier keys: Mac players ping with Cmd + click, everyone else with Alt + click. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
export const PING_KEY = IS_MAC ? 'Cmd' : 'Alt'
/** True for a left click held with the ping modifier. */
export const isPingClick = (e: MouseEvent) => e.button === 0 && (IS_MAC ? e.metaKey : e.altKey)
