const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escapes text for use inside innerHTML templates (player names and any text that came over the network). */
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c])
