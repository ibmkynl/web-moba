import type { ItemDef } from './entities'

export const ITEMS: ItemDef[] = [
  {
    id: 'salve', name: 'Healing Salve', cost: 100, glyph: '✚', color: '#7cc24a', cat: 'consumable', consumable: true,
    active: 'salve', desc: 'Restores 30 health per second for 13 seconds (390 total). Broken by damage from enemy heroes or towers.',
  },
  {
    id: 'clarity', name: 'Clarity', cost: 50, glyph: '◈', color: '#4aa8e0', cat: 'consumable', consumable: true,
    active: 'clarity', desc: 'Restores 6 mana per second for 25 seconds (150 total). Broken by damage from enemy heroes or towers.',
  },
  {
    id: 'ward', name: 'Observer Ward', cost: 50, glyph: '◉', color: '#e8c858', cat: 'consumable', consumable: true,
    active: 'ward', range: 650, desc: 'Place on the ground to give your team vision of a 1600 radius for 3 minutes. Cast range 650.',
  },
  {
    id: 'tp', name: 'Teleportation Scroll', cost: 100, glyph: '⟁', color: '#6fd6ff', cat: 'consumable', consumable: true,
    active: 'tp', cd: 20, desc: 'Kept in its own stash (max 5), not your inventory. Press T, then click a friendly tower or your ancient (T twice goes to the ancient): channel for 3 seconds to teleport beside it. Moving or being stunned cancels it and the scroll is still used up. Cooldown 20s.',
  },
  { id: 'boots', name: 'Boots of Speed', cost: 500, glyph: '▲', color: '#c9a35a', cat: 'equipment', stats: { bootMs: 45 }, desc: '+45 movement speed. Boots do not stack with each other: only the fastest pair counts.' },
  {
    id: 'phase', name: 'Phase Boots', cost: 1500, glyph: '≫', color: '#e0a05a', cat: 'equipment', stats: { bootMs: 45, dmg: 18 },
    active: 'phase', cd: 8, desc: '+45 movement speed, +18 damage. Active (Phase Shift): +20% movement speed for 3 seconds. Cooldown 8s.',
  },
  { id: 'treads', name: 'Power Treads', cost: 1400, glyph: '⇶', color: '#c8a85a', cat: 'equipment', stats: { bootMs: 45, as: 25, str: 10 }, desc: '+45 movement speed, +25 attack speed, +10 strength.' },
  { id: 'travel', name: 'Boots of Travel', cost: 2500, glyph: '⇛', color: '#6ad0ff', cat: 'equipment', stats: { bootMs: 100 }, desc: '+100 movement speed: the fastest boots. Does not stack with other boots.' },
  { id: 'gloves', name: 'Gloves of Haste', cost: 450, glyph: '✋', color: '#d8d05a', cat: 'equipment', stats: { as: 20 }, desc: '+20 attack speed.' },
  { id: 'blades', name: 'Blades of Attack', cost: 450, glyph: '⚔', color: '#c8c8d8', cat: 'equipment', stats: { dmg: 9 }, desc: '+9 damage.' },
  { id: 'broadsword', name: 'Broadsword', cost: 1000, glyph: '🗡', color: '#d89a5a', cat: 'equipment', stats: { dmg: 15 }, desc: '+15 damage.' },
  { id: 'morbid', name: 'Morbid Mask', cost: 900, glyph: '☠', color: '#b8324a', cat: 'equipment', stats: { dmg: 6, lifesteal: 0.18 }, desc: '+6 damage and 18% lifesteal: you heal for a share of the physical damage your attacks deal to enemy heroes and creeps (60% against creeps). Does not work on buildings or spell damage.' },
  { id: 'chainmail', name: 'Chainmail', cost: 550, glyph: '▦', color: '#9aa4b4', cat: 'equipment', stats: { armor: 4 }, desc: '+4 armor.' },
  { id: 'ogre', name: 'Ogre Axe', cost: 1000, glyph: 'S', color: '#e0623a', cat: 'attribute', stats: { str: 10 }, desc: '+10 strength.' },
  { id: 'alacrity', name: 'Blade of Alacrity', cost: 1000, glyph: 'A', color: '#5ae07a', cat: 'attribute', stats: { agi: 10 }, desc: '+10 agility.' },
  { id: 'staff', name: 'Staff of Wizardry', cost: 1000, glyph: 'I', color: '#5a9ae0', cat: 'attribute', stats: { int: 10 }, desc: '+10 intelligence.' },
  { id: 'vitality', name: 'Vitality Booster', cost: 1000, glyph: '♥', color: '#e05a6a', cat: 'misc', stats: { hp: 250 }, desc: '+250 health.' },
  { id: 'energy', name: 'Energy Booster', cost: 800, glyph: '◆', color: '#6a7ae0', cat: 'misc', stats: { mana: 250 }, desc: '+250 mana.' },
  {
    id: 'blink', name: 'Blink Dagger', cost: 2250, glyph: '✦', color: '#7ab8ff', cat: 'misc', active: 'blink', cd: 15, range: 1200,
    desc: 'Active: Blink up to 1200 units toward the target point. Cooldown 15s. Cannot be used for 3 seconds after taking damage from an enemy hero.',
  },
  /* ---- late-game power items (Dota 2 wiki values) ---- */
  {
    id: 'bkb', name: 'Black King Bar', cost: 3975, glyph: '♛', color: '#e8c24a', cat: 'misc', stats: { str: 10, dmg: 24 },
    active: 'bkb', cd: 95, mana: 50, desc: '+10 strength, +24 damage. Active (Avatar): become spell immune for 9 seconds. Mana 50, cooldown 95s.',
  },
  { id: 'heart', name: 'Heart of Tarrasque', cost: 5000, glyph: '❤', color: '#e0405a', cat: 'attribute', stats: { str: 40, hpRegenPct: 1.6 }, desc: '+40 strength and +1.6% of max health regenerated every second.' },
  { id: 'butterfly', name: 'Butterfly', cost: 4975, glyph: '❦', color: '#7ad0ff', cat: 'equipment', stats: { agi: 35, dmg: 25, evasion: 0.35, as: 20 }, desc: '+35 agility, +25 damage, +20 attack speed and 35% evasion.' },
  { id: 'cuirass', name: 'Assault Cuirass', cost: 5125, glyph: '⛨', color: '#d8a24a', cat: 'equipment', stats: { armor: 10, as: 30 }, desc: '+10 armor and +30 attack speed.' },
  {
    id: 'shiva', name: "Shiva's Guard", cost: 5175, glyph: '❄', color: '#8ad8ff', cat: 'misc', stats: { str: 5, agi: 5, int: 5, armor: 15, hpRegen: 5 },
    active: 'shiva', cd: 27, mana: 75, desc: '+5 all stats, +15 armor, +5 health regen. Active (Arctic Blast): 200 magic damage and a 40% slow for 4s to enemies within 900. Mana 75, cooldown 27s.',
  },
  { id: 'scepter', name: "Aghanim's Scepter", cost: 4200, glyph: '✧', color: '#6aa0ff', cat: 'attribute', stats: { str: 10, agi: 10, int: 10, hp: 175, mana: 175 }, desc: '+10 all stats, +175 health and +175 mana.' },
  {
    id: 'refresher', name: 'Refresher Orb', cost: 5000, glyph: '↺', color: '#5ae0a0', cat: 'misc', stats: { dmg: 10, hpRegen: 18, manaRegen: 8 },
    active: 'refresher', cd: 180, mana: 350, desc: '+10 damage, +18 health regen, +8 mana regen. Active: resets the cooldowns of all your abilities and items. Mana 350, cooldown 180s.',
  },
  {
    id: 'force', name: 'Force Staff', cost: 2200, glyph: '➤', color: '#5ac8e0', cat: 'misc', stats: { int: 10, hp: 175 },
    active: 'force', cd: 19, mana: 150, desc: '+10 intelligence, +175 health. Active: push yourself 600 units forward over 0.5s. Mana 150, cooldown 19s.',
  },
  { id: 'skadi', name: 'Eye of Skadi', cost: 5300, glyph: '❅', color: '#a8e8ff', cat: 'attribute', stats: { str: 35, agi: 35, int: 35 }, desc: '+35 to all attributes.' },
  { id: 'rapier', name: 'Divine Rapier', cost: 5600, glyph: '⚔', color: '#ffd24a', cat: 'equipment', stats: { dmg: 250 }, desc: '+250 damage.' },
]

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))
