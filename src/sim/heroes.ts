import type { HeroDef } from './entities'
import * as A from './abilities'
import { HEROES_G1 } from './heroes_g1'
import { HEROES_G2 } from './heroes_g2'
import { HEROES_G3 } from './heroes_g3'
import { HEROES_G4 } from './heroes_g4'

// Base stats follow Dota 2 closely but are approximate and tunable.
export const HEROES: HeroDef[] = [
  {
    id: 'pudge', name: 'Pudge', title: 'The Butcher', attr: 'str',
    str: 25, strG: 3, agi: 14, agiG: 1.4, int: 16, intG: 1.8, hpRegen: 1.75, manaRegen: 0,
    baseDmg: 48.0, armor: -1, ms: 280, range: 175, bat: 1.7, ap: 0.5, projSpeed: 0, radius: 40,
    color: '#a85a3a', color2: '#6a2a1a', roles: ['Disabler', 'Initiator', 'Durable'],
    lore: 'A grotesque butcher who drags enemies to their doom with his hook, then feasts on whatever is left.',
    abilities: [A.MEAT_HOOK, A.ROT, A.FLESH_HEAP, A.DISMEMBER],
    skillOrder: [0, 1, 0, 2, 0, 3, 0, 1, 1, 1, 3, 2, 2, 2, 2, 3],
    buy: ['boots', 'salve', 'ogre', 'chainmail', 'vitality', 'blink'],
  },
  {
    id: 'sniper', name: 'Sniper', title: 'Dwarven Gunner', attr: 'agi',
    str: 19, strG: 2, agi: 27, agiG: 3.2, int: 15, intG: 2.6, hpRegen: 0.25, manaRegen: 0,
    baseDmg: 16.0, armor: -1, ms: 285, range: 550, bat: 1.7, ap: 0.17, projSpeed: 3000, radius: 34,
    color: '#7a8a5a', color2: '#3a4a2a', roles: ['Carry', 'Nuker'],
    lore: 'A master marksman from the Hills of Rocheport who rains death on foes from impossible distances.',
    abilities: [A.SHRAPNEL, A.HEADSHOT, A.TAKE_AIM, A.ASSASSINATE],
    skillOrder: [1, 0, 1, 2, 1, 3, 1, 2, 2, 2, 3, 0, 0, 0, 0, 3],
    buy: ['boots', 'gloves', 'blades', 'alacrity', 'broadsword', 'chainmail'],
  },
  {
    id: 'mirana', name: 'Mirana', title: 'Priestess of the Moon', attr: 'agi',
    str: 20, strG: 1.7, agi: 24, agiG: 2.5, int: 22, intG: 1.4, hpRegen: 0.25, manaRegen: 0.4,
    baseDmg: 2.7, armor: -2, ms: 290, range: 630, bat: 1.7, ap: 0.35, projSpeed: 900, radius: 34,
    color: '#8ab0d8', color2: '#3a5a8a', roles: ['Carry', 'Escape', 'Disabler'],
    lore: 'A moonlit huntress who rides her sabre-cat into battle and fires arrows from across the map.',
    abilities: [A.STARSTORM, A.SACRED_ARROW, A.LEAP, A.MOONLIGHT],
    skillOrder: [1, 0, 1, 2, 1, 3, 1, 2, 2, 2, 3, 0, 0, 0, 0, 3],
    buy: ['boots', 'gloves', 'blades', 'alacrity', 'chainmail', 'broadsword'],
  },
  {
    id: 'axe', name: 'Axe', title: 'Mogul Khan', attr: 'str',
    str: 25, strG: 2.8, agi: 20, agiG: 1.7, int: 18, intG: 1.6, hpRegen: 2.5, manaRegen: 0,
    baseDmg: 32.0, armor: -1, ms: 315, range: 150, bat: 1.7, ap: 0.4, projSpeed: 0, radius: 40,
    color: '#b83a2a', color2: '#5a1a12', roles: ['Initiator', 'Durable', 'Carry'],
    lore: 'A warlord who throws himself into the fray, forcing foes to fight him and cutting down the weak.',
    abilities: [A.BERSERKERS_CALL, A.BATTLE_HUNGER, A.COUNTER_HELIX, A.CULLING_BLADE],
    skillOrder: [2, 1, 2, 0, 2, 3, 2, 1, 1, 1, 3, 0, 0, 0, 0, 3],
    buy: ['boots', 'salve', 'chainmail', 'ogre', 'vitality', 'blink'],
  },
  {
    id: 'rubick', name: 'Rubick', title: 'The Grand Magus', attr: 'int',
    str: 21, strG: 2, agi: 23, agiG: 2.5, int: 25, intG: 3.7, hpRegen: 0.25, manaRegen: 0.5,
    baseDmg: 30.0, armor: 1, ms: 290, range: 550, bat: 1.7, ap: 0.4, projSpeed: 1125, radius: 34,
    color: '#7a58b8', color2: '#2a1a5a', roles: ['Support', 'Disabler', 'Nuker'],
    lore: 'A sorcerer who studies the magic of others and bends it to his own will.',
    abilities: [A.TELEKINESIS, A.FADE_BOLT, A.ARCANE_SUPREMACY, A.SPELL_STEAL],
    skillOrder: [1, 0, 1, 2, 1, 3, 1, 0, 0, 0, 3, 2, 2, 2, 2, 3],
    buy: ['boots', 'clarity', 'staff', 'energy', 'staff', 'blink'],
  },
]

HEROES.push(...HEROES_G1, ...HEROES_G2, ...HEROES_G3, ...HEROES_G4)

export const HERO_BY_ID: Record<string, HeroDef> = Object.fromEntries(HEROES.map((h) => [h.id, h]))
