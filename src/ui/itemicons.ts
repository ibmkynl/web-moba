/** Hand-drawn SVG icons (64x64) so every item looks like what it is. */

const steel = (id: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa4b4"/><stop offset=".5" stop-color="#f4f7fc"/><stop offset="1" stop-color="#7c8696"/></linearGradient>`
const gold = (id: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe89a"/><stop offset="1" stop-color="#b07a1a"/></linearGradient>`
const wood = (id: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6a4420"/><stop offset=".5" stop-color="#a8723a"/><stop offset="1" stop-color="#5a3818"/></linearGradient>`

const ICONS: Record<string, string> = {
  // green bottle of healing paste
  salve: `<defs><radialGradient id="sv" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d8ffb0"/><stop offset="1" stop-color="#3a8a1a"/></radialGradient></defs>
    <rect x="25" y="8" width="14" height="9" rx="2" fill="#8a5a2a" stroke="#3a2210" stroke-width="1.5"/>
    <path d="M27 17h10v6c9 3 14 10 14 19 0 9-7 14-19 14S13 51 13 42c0-9 5-16 14-19z" fill="url(#sv)" stroke="#1d4a0a" stroke-width="2"/>
    <path d="M32 31v14M25 38h14" stroke="#f2ffe0" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="22" cy="36" rx="3" ry="6" fill="#fff" opacity=".35"/>`,
  // blue mana potion
  clarity: `<defs><radialGradient id="cl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d8f2ff"/><stop offset="1" stop-color="#1f58c8"/></radialGradient></defs>
    <rect x="25" y="7" width="14" height="10" rx="2" fill="#c9a050" stroke="#5a4210" stroke-width="1.5"/>
    <path d="M27 17h10v8l11 17c3 8-3 14-16 14S13 50 16 42l11-17z" fill="url(#cl)" stroke="#14336e" stroke-width="2"/>
    <path d="M32 33l6 8-6 8-6-8z" fill="#fff" opacity=".85"/>
    <ellipse cx="23" cy="43" rx="2.5" ry="6" fill="#fff" opacity=".35"/>`,
  // leather boots with a winged cuff
  boots: `<defs>${gold('bg')}<linearGradient id="bl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8844a"/><stop offset="1" stop-color="#5a3418"/></linearGradient></defs>
    <path d="M22 8h17v26l14 7c5 3 6 8 6 13v2H14V8z" fill="url(#bl)" stroke="#2a1608" stroke-width="2.2" stroke-linejoin="round"/>
    <rect x="21" y="8" width="19" height="9" rx="2" fill="url(#bg)" stroke="#5a3a08" stroke-width="1.5"/>
    <path d="M14 54h45v4H14z" fill="#2a1a0c"/>
    <path d="M17 22h-9l3-5-6-1 8-5z" fill="#fff6d0" stroke="#b08a2a" stroke-width="1.2" opacity=".95"/>
    <path d="M40 40l8 4" stroke="#2a1608" stroke-width="2"/>`,
  // gloves of haste
  gloves: `<defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4d868"/><stop offset="1" stop-color="#a8761a"/></linearGradient></defs>
    <g stroke="#5a3d08" stroke-width="2" stroke-linejoin="round" fill="url(#gl)">
    <rect x="14" y="24" width="8" height="22" rx="4"/><rect x="23" y="14" width="8" height="30" rx="4"/><rect x="32" y="12" width="8" height="32" rx="4"/><rect x="41" y="17" width="8" height="27" rx="4"/>
    <path d="M12 40c-4-4-6-9-3-11s7 1 9 4z"/>
    <path d="M13 40h37v8c0 6-5 10-11 10H26c-8 0-13-6-13-12z"/></g>
    <path d="M17 52h30" stroke="#5a3d08" stroke-width="3"/>
    <path d="M52 20l8-3M53 28l9-1M52 36l8 3" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
  // blades of attack: two crossed short swords
  blades: `<defs>${steel('bs')}</defs>
    <g transform="rotate(-38 32 32)"><path d="M28 6h8l2 30h-12z" fill="url(#bs)" stroke="#434b58" stroke-width="1.6"/><rect x="21" y="36" width="22" height="5" rx="2" fill="#c9a050" stroke="#5a4210" stroke-width="1.4"/><rect x="29" y="41" width="6" height="13" rx="2" fill="#5a3418" stroke="#2a1608" stroke-width="1.4"/></g>
    <g transform="rotate(38 32 32)"><path d="M28 6h8l2 30h-12z" fill="url(#bs)" stroke="#434b58" stroke-width="1.6"/><rect x="21" y="36" width="22" height="5" rx="2" fill="#c9a050" stroke="#5a4210" stroke-width="1.4"/><rect x="29" y="41" width="6" height="13" rx="2" fill="#5a3418" stroke="#2a1608" stroke-width="1.4"/></g>`,
  // broadsword: big single blade
  broadsword: `<defs>${steel('ws')}${gold('wg')}</defs>
    <path d="M32 3l8 7v28H24V10z" fill="url(#ws)" stroke="#434b58" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M32 6v32" stroke="#8a95a6" stroke-width="1.5"/>
    <path d="M14 38h36l-3 6H17z" fill="url(#wg)" stroke="#5a3a08" stroke-width="1.6"/>
    <rect x="28" y="44" width="8" height="13" rx="2" fill="#6a3a1a" stroke="#2a1608" stroke-width="1.5"/>
    <circle cx="32" cy="59" r="3.4" fill="url(#wg)" stroke="#5a3a08" stroke-width="1.2"/>`,
  // chainmail hauberk with link texture
  chainmail: `<defs><pattern id="cm" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.2" fill="none" stroke="#e8edf5" stroke-width="1"/></pattern><linearGradient id="cb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#aab4c4"/><stop offset="1" stop-color="#5a6474"/></linearGradient></defs>
    <path d="M20 8c4 4 20 4 24 0l14 9-6 12-6-3v30H18V26l-6 3-6-12z" fill="url(#cb)" stroke="#2c3440" stroke-width="2" stroke-linejoin="round"/>
    <path d="M20 8c4 4 20 4 24 0l14 9-6 12-6-3v30H18V26l-6 3-6-12z" fill="url(#cm)" opacity=".8"/>
    <path d="M24 9c4 6 12 6 16 0" fill="none" stroke="#2c3440" stroke-width="2"/>
    <rect x="18" y="46" width="28" height="4" fill="#6a4420"/>`,
  // ogre axe: huge double-bladed axe
  ogre: `<defs>${steel('os')}${wood('ow')}</defs>
    <rect x="29" y="8" width="6" height="52" rx="3" fill="url(#ow)" stroke="#2a1608" stroke-width="1.6"/>
    <path d="M30 12C14 6 5 14 6 26c8-2 16-2 24 0z" fill="url(#os)" stroke="#434b58" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M34 12c16-6 25 2 24 14-8-2-16-2-24 0z" fill="url(#os)" stroke="#434b58" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="26" y="26" width="12" height="5" rx="2" fill="#c0442a" stroke="#4a1208" stroke-width="1.4"/>
    <path d="M10 22c6-1 12-1 18 1M54 22c-6-1-12-1-18 1" stroke="#fff" stroke-width="1.4" opacity=".55" fill="none"/>`,
  // blade of alacrity: slim green-glow katana
  alacrity: `<defs>${steel('as')}<filter id="ag"><feGaussianBlur stdDeviation="2"/></filter></defs>
    <path d="M12 56L50 6c3-4 8-3 6 2-2 6-8 14-14 22L18 60z" fill="#5aff8a" opacity=".45" filter="url(#ag)"/>
    <path d="M14 54L49 8c2-3 6-2 5 2-2 6-7 13-12 20L20 58z" fill="url(#as)" stroke="#3a4a58" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M18 50L49 10" stroke="#5aff8a" stroke-width="1.6" opacity=".9"/>
    <path d="M6 52l14 10-3 2L4 56z" fill="#6a3a1a" stroke="#2a1608" stroke-width="1.2"/>
    <path d="M13 47l10 10" stroke="#c9a050" stroke-width="4" stroke-linecap="round"/>`,
  // staff of wizardry: wooden staff with a blue crystal
  staff: `<defs>${wood('sw')}<radialGradient id="sc" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e8f6ff"/><stop offset="1" stop-color="#2a78e8"/></radialGradient><filter id="sg"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <circle cx="32" cy="16" r="14" fill="#5aa8ff" opacity=".5" filter="url(#sg)"/>
    <rect x="29" y="22" width="6" height="40" rx="3" fill="url(#sw)" stroke="#2a1608" stroke-width="1.5"/>
    <path d="M24 16c0-6 3-10 8-12 5 2 8 6 8 12-3-1-5-2-8-2s-5 1-8 2z" fill="#c9a050" stroke="#5a4210" stroke-width="1.5"/>
    <path d="M32 4l8 11-8 12-8-12z" fill="url(#sc)" stroke="#144a9a" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M32 8l3 7-3 6" fill="none" stroke="#fff" stroke-width="1.5" opacity=".8"/>
    <rect x="26" y="34" width="12" height="4" rx="2" fill="#c9a050" stroke="#5a4210" stroke-width="1.2"/>`,
  // observer ward: an eye on a stake
  ward: `<defs><radialGradient id="we" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fffbe0"/><stop offset="1" stop-color="#e0a820"/></radialGradient><filter id="wg"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <circle cx="32" cy="24" r="20" fill="#ffd24a" opacity=".45" filter="url(#wg)"/>
    <path d="M28 40h8l3 20H25z" fill="#6a4a2a" stroke="#2a1608" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M18 44l14 8 14-8" fill="none" stroke="#2a1608" stroke-width="3" stroke-linecap="round"/>
    <path d="M6 24c8-12 44-12 52 0-8 12-44 12-52 0z" fill="url(#we)" stroke="#6a4a08" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="32" cy="24" r="8.5" fill="#2a1a08"/><circle cx="32" cy="24" r="4" fill="#ffd24a"/><circle cx="29.5" cy="21.5" r="1.8" fill="#fff"/>`,
  // vitality booster: red heart gem
  vitality: `<defs><radialGradient id="vh" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffc8c8"/><stop offset=".5" stop-color="#e0283a"/><stop offset="1" stop-color="#7a0818"/></radialGradient>${gold('vg')}</defs>
    <path d="M32 54C10 40 6 28 10 19c4-9 17-9 22 1 5-10 18-10 22-1 4 9 0 21-22 35z" fill="url(#vh)" stroke="#4a0610" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M17 24c1-5 7-6 10-3" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".7"/>
    <path d="M14 56h36" stroke="url(#vg)" stroke-width="5" stroke-linecap="round"/>`,
  // energy booster: blue crystal
  energy: `<defs><linearGradient id="ec" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8e8ff"/><stop offset=".5" stop-color="#4a6ae8"/><stop offset="1" stop-color="#1a2a8a"/></linearGradient>${gold('eg')}</defs>
    <path d="M32 4l16 14-6 30H22l-6-30z" fill="url(#ec)" stroke="#121e6a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M32 4l-5 14 5 30 5-30z" fill="#fff" opacity=".22"/>
    <path d="M16 18h32M22 48l10-30 10 30" fill="none" stroke="#c8d8ff" stroke-width="1.3" opacity=".8"/>
    <path d="M18 54h28" stroke="url(#eg)" stroke-width="5" stroke-linecap="round"/>
    <path d="M50 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff"/>`,
  // teleportation scroll: rolled parchment with a swirling blue portal sigil
  tp: `<defs><radialGradient id="tpg" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#e8fbff"/><stop offset=".6" stop-color="#4ab8ff"/><stop offset="1" stop-color="#1a4ab8"/></radialGradient><linearGradient id="tpp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c8b080"/><stop offset=".5" stop-color="#f6ecc8"/><stop offset="1" stop-color="#b89c68"/></linearGradient><filter id="tpb"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <circle cx="32" cy="28" r="24" fill="#4ab8ff" opacity=".4" filter="url(#tpb)"/>
    <rect x="12" y="14" width="40" height="38" rx="3" fill="url(#tpp)" stroke="#5a4210" stroke-width="2"/>
    <rect x="8" y="10" width="48" height="8" rx="4" fill="#c9a050" stroke="#5a4210" stroke-width="1.8"/><rect x="8" y="48" width="48" height="8" rx="4" fill="#c9a050" stroke="#5a4210" stroke-width="1.8"/>
    <circle cx="32" cy="32" r="12" fill="url(#tpg)" stroke="#123a8a" stroke-width="1.6"/>
    <path d="M32 22c7 0 10 7 5 11-4 3-9 0-8-4 1-3 5-3 6-1" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M40 18l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#fff"/>`,
  bkb: `<defs>${gold('bg')}<radialGradient id="bk" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#fff2b0"/><stop offset="1" stop-color="#c8901a"/></radialGradient></defs>
    <path d="M8 44l6-26 10 10 8-18 8 18 10-10 6 26z" fill="url(#bk)" stroke="#5a3a08" stroke-width="2.2" stroke-linejoin="round"/>
    <rect x="9" y="44" width="46" height="9" rx="2" fill="url(#bg)" stroke="#5a3a08" stroke-width="2"/>
    <circle cx="32" cy="46.5" r="3.4" fill="#e0283a" stroke="#4a0610" stroke-width="1"/><circle cx="19" cy="46.5" r="2.2" fill="#5ab0ff"/><circle cx="45" cy="46.5" r="2.2" fill="#5ab0ff"/>
    <circle cx="14" cy="17" r="2.4" fill="#fff"/><circle cx="32" cy="9" r="2.4" fill="#fff"/><circle cx="50" cy="17" r="2.4" fill="#fff"/>`,
  heart: `<defs><radialGradient id="ht" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffb8b8"/><stop offset=".45" stop-color="#d81c34"/><stop offset="1" stop-color="#5a0614"/></radialGradient><filter id="hg"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <path d="M32 56C8 40 4 26 9 17c5-9 18-9 23 2 5-11 18-11 23-2 5 9 1 23-23 39z" fill="#ff2a40" opacity=".5" filter="url(#hg)"/>
    <path d="M32 55C10 40 6 28 10 19c4-8 17-8 22 2 5-10 18-10 22-2 4 9 0 21-22 36z" fill="url(#ht)" stroke="#3a0410" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M18 24c1-5 7-6 10-3M14 31c0 3 2 6 4 8" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".7"/>
    <path d="M10 33h10l4-8 6 14 4-8h18" stroke="#ffe7a8" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  butterfly: `<defs><linearGradient id="bw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8f4ff"/><stop offset="1" stop-color="#3a8ae8"/></linearGradient></defs>
    <path d="M32 30C20 8 4 10 6 28c2 14 16 16 26 6z" fill="url(#bw)" stroke="#143a7a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M32 30c12-22 28-20 26-2-2 14-16 16-26 6z" fill="url(#bw)" stroke="#143a7a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M32 36C22 42 14 48 16 56c8 2 14-6 16-14zM32 36c10 6 18 12 16 20-8 2-14-6-16-14z" fill="#8ac8ff" stroke="#143a7a" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="19" cy="24" r="4" fill="#fff" opacity=".8"/><circle cx="45" cy="24" r="4" fill="#fff" opacity=".8"/>
    <rect x="29.5" y="14" width="5" height="36" rx="2.5" fill="#2a2a46" stroke="#0a0a1a" stroke-width="1.4"/><path d="M31 14c-3-6-6-8-9-8M33 14c3-6 6-8 9-8" stroke="#2a2a46" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  cuirass: `<defs><linearGradient id="cu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe8a0"/><stop offset="1" stop-color="#a8701a"/></linearGradient></defs>
    <path d="M14 10l10 4h16l10-4 6 14-8 6v22H16V30l-8-6z" fill="url(#cu)" stroke="#4a3008" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M24 14v38M40 14v38M16 32h32M16 42h32" stroke="#6a4810" stroke-width="1.4" opacity=".7"/>
    <path d="M32 18l5 8-5 8-5-8z" fill="#d8283a" stroke="#4a0610" stroke-width="1.6" stroke-linejoin="round"/>`,
  shiva: `<defs><radialGradient id="sh" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#f4fdff"/><stop offset="1" stop-color="#3a9ae8"/></radialGradient><filter id="shb"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <circle cx="32" cy="32" r="26" fill="#5ac0ff" opacity=".4" filter="url(#shb)"/>
    <path d="M32 6c12 2 22 12 22 24 0 18-12 26-22 28C22 56 10 48 10 30 10 18 20 8 32 6z" fill="url(#sh)" stroke="#143a7a" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M32 14v36M16 22l32 20M48 22L16 42" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="32" cy="32" r="5" fill="#1a4a9a" stroke="#fff" stroke-width="1.4"/>`,
  scepter: `<defs><radialGradient id="sc2" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e8f6ff"/><stop offset=".6" stop-color="#3a7ae8"/><stop offset="1" stop-color="#1a2a8a"/></radialGradient>${gold('sg2')}<filter id="sb2"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <circle cx="32" cy="15" r="16" fill="#5aa8ff" opacity=".5" filter="url(#sb2)"/>
    <rect x="29" y="22" width="6" height="38" rx="3" fill="url(#sg2)" stroke="#4a3008" stroke-width="1.6"/>
    <path d="M32 2l11 12-11 14-11-14z" fill="url(#sc2)" stroke="#143a8a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M21 20c3 4 7 6 11 6s8-2 11-6" stroke="url(#sg2)" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="25" y="40" width="14" height="5" rx="2" fill="url(#sg2)" stroke="#4a3008" stroke-width="1.2"/>`,
  refresher: `<defs><radialGradient id="rf" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#e8fff4"/><stop offset="1" stop-color="#1ea86a"/></radialGradient></defs>
    <circle cx="32" cy="32" r="22" fill="url(#rf)" stroke="#0a4a2a" stroke-width="2.4"/>
    <path d="M44 22a16 16 0 1 0 2 14" stroke="#0a5a34" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M47 14v12H35z" fill="#0a5a34"/>
    <circle cx="32" cy="32" r="5" fill="#fff" opacity=".85"/>`,
  force: `<defs>${wood('fw')}<radialGradient id="fg" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#e8fdff"/><stop offset="1" stop-color="#2aa8d8"/></radialGradient></defs>
    <rect x="29" y="18" width="6" height="42" rx="3" fill="url(#fw)" stroke="#2a1608" stroke-width="1.6"/>
    <path d="M32 3l9 9-9 12-9-12z" fill="url(#fg)" stroke="#0e4a6a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M6 40h14M4 48h18M10 32h10" stroke="#7ae0ff" stroke-width="3" stroke-linecap="round" opacity=".8"/><path d="M46 36l10 6-10 6" stroke="#2aa8d8" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  skadi: `<defs><radialGradient id="sk" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#f4fdff"/><stop offset=".6" stop-color="#6ac8ff"/><stop offset="1" stop-color="#1a5ac8"/></radialGradient></defs>
    <path d="M6 32c8-14 40-14 52 0-12 14-44 14-52 0z" fill="#12306a" stroke="#0a1a3a" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="32" cy="32" r="11" fill="url(#sk)" stroke="#0a3a8a" stroke-width="2"/><circle cx="32" cy="32" r="4.5" fill="#0a1a3a"/><circle cx="29.5" cy="29.5" r="1.8" fill="#fff"/>
    <path d="M32 6v10M32 48v10M12 12l7 7M45 45l7 7M52 12l-7 7M19 45l-7 7" stroke="#aee6ff" stroke-width="2.4" stroke-linecap="round"/>`,
  rapier: `<defs>${steel('rp')}${gold('rg')}<filter id="rb"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <path d="M32 2l-3 6 3 38 3-38z" fill="#ffd24a" opacity=".5" filter="url(#rb)"/>
    <path d="M32 2l5 8 1 36H26l1-36z" fill="url(#rp)" stroke="#5a3a08" stroke-width="2" stroke-linejoin="round"/><path d="M32 6v38" stroke="#ffd24a" stroke-width="1.6"/>
    <rect x="16" y="46" width="32" height="6" rx="3" fill="url(#rg)" stroke="#5a3a08" stroke-width="1.8"/>
    <rect x="29" y="52" width="6" height="8" rx="2" fill="#7a1018" stroke="#2a0408" stroke-width="1.4"/><circle cx="32" cy="62" r="2" fill="url(#rg)"/>`,
  phase: `<defs><linearGradient id="pb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0c080"/><stop offset="1" stop-color="#8a4a18"/></linearGradient><filter id="pbb"><feGaussianBlur stdDeviation="2"/></filter></defs>
    <path d="M4 38h14M2 46h18M6 30h10" stroke="#e0a05a" stroke-width="3" stroke-linecap="round" opacity=".6" filter="url(#pbb)"/>
    <path d="M20 8h16l2 22 14 8c4 2 6 5 6 9v5H18V30z" fill="url(#pb)" stroke="#3a1c06" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M18 48h40" stroke="#3a1c06" stroke-width="2"/><path d="M22 20h14" stroke="#fff3d0" stroke-width="2" opacity=".7"/>
    <path d="M44 30l4 6M38 34l4 6" stroke="#ffe0a0" stroke-width="2" stroke-linecap="round"/>`,
  treads: `<defs><linearGradient id="tb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8c490"/><stop offset="1" stop-color="#6a5020"/></linearGradient></defs>
    <path d="M20 8h16l2 22 14 8c4 2 6 5 6 9v5H18V30z" fill="url(#tb)" stroke="#2a2008" stroke-width="2.2" stroke-linejoin="round"/>
    <rect x="16" y="46" width="44" height="9" rx="2" fill="#2a2a32" stroke="#0a0a10" stroke-width="2"/>
    <path d="M22 46v9M30 46v9M38 46v9M46 46v9M54 46v9" stroke="#6a6a78" stroke-width="2"/><path d="M22 18h14" stroke="#fff3d0" stroke-width="2" opacity=".6"/>`,
  travel: `<defs><linearGradient id="vb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8fbff"/><stop offset=".5" stop-color="#4ab8ff"/><stop offset="1" stop-color="#1a4ab8"/></linearGradient><filter id="vbb"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <circle cx="36" cy="30" r="22" fill="#4ab8ff" opacity=".4" filter="url(#vbb)"/>
    <path d="M20 6h16l2 22 14 8c4 2 6 5 6 9v6H18V28z" fill="url(#vb)" stroke="#0e2a6a" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M18 49h40" stroke="#0e2a6a" stroke-width="2"/><path d="M4 22l10 4M2 32h12M6 42l8-3" stroke="#aee6ff" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 14l4 6-4 6-4-6z" fill="#fff" opacity=".9"/><path d="M42 36l3 4-3 4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  // morbid mask: a pale skull-faced mask with red eyes
  morbid: `<defs><radialGradient id="mm" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#f4eee0"/><stop offset="1" stop-color="#8a7a66"/></radialGradient><filter id="mmg"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <ellipse cx="32" cy="32" rx="24" ry="26" fill="#d8283a" opacity=".35" filter="url(#mmg)"/>
    <path d="M32 5c14 0 22 9 22 22 0 8-3 13-8 16v9H18v-9c-5-3-8-8-8-16C10 14 18 5 32 5z" fill="url(#mm)" stroke="#3a2a1c" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M16 24c4-3 10-2 13 2-2 5-9 6-13 2zM48 24c-4-3-10-2-13 2 2 5 9 6 13 2z" fill="#2a0a10" stroke="#1a0408" stroke-width="1.4"/>
    <circle cx="23" cy="26" r="2.6" fill="#ff3a4a"/><circle cx="41" cy="26" r="2.6" fill="#ff3a4a"/>
    <path d="M29 34l3 6 3-6z" fill="#3a2a1c"/>
    <path d="M22 50v-5M28 50v-6M34 50v-6M40 50v-5" stroke="#3a2a1c" stroke-width="2" stroke-linecap="round"/>
    <path d="M32 9v9" stroke="#b8324a" stroke-width="2.4" stroke-linecap="round"/>`,
  // aegis of the immortal: a golden shield with a blue gem and wings
  aegis: `<defs>${gold('ag')}<radialGradient id="ae" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#e8fbff"/><stop offset="1" stop-color="#2a7ad8"/></radialGradient></defs>
    <path d="M6 22c6-10 12-12 18-10l-4 12zM58 22c-6-10-12-12-18-10l4 12z" fill="#fff6d0" stroke="#b08a2a" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M32 6l20 7v16c0 14-8 22-20 28C20 51 12 43 12 29V13z" fill="url(#ag)" stroke="#6a4208" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M32 13l13 5v11c0 9-5 15-13 19-8-4-13-10-13-19V18z" fill="#7a4e0c" opacity=".55"/>
    <path d="M32 21l7 8-7 10-7-10z" fill="url(#ae)" stroke="#143a7a" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M32 21v18M25 29h14" stroke="#fff" stroke-width="1.2" opacity=".6"/>`,
  // blink dagger: glowing blue dagger with a swoosh
  blink: `<defs>${steel('ks')}<filter id="kg"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <path d="M6 50c10-4 20-10 30-22" stroke="#6ab0ff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".55" filter="url(#kg)"/>
    <g transform="rotate(40 34 32)"><path d="M34 2l7 22H27z" fill="url(#ks)" stroke="#2a4a8a" stroke-width="1.6" stroke-linejoin="round"/><path d="M34 4v20" stroke="#6ab0ff" stroke-width="1.6"/>
    <rect x="22" y="24" width="24" height="5" rx="2" fill="#4a7ae8" stroke="#142a6a" stroke-width="1.4"/><rect x="31" y="29" width="6" height="15" rx="2" fill="#2a3a7a" stroke="#0e1a4a" stroke-width="1.4"/><circle cx="34" cy="47" r="3.6" fill="#8ad0ff" stroke="#142a6a" stroke-width="1.2"/></g>
    <path d="M6 58c8-2 14-6 20-12" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".7"/>`,
}

export function itemIcon(id: string): string {
  const body = ICONS[id]
  if (!body) return ''
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" class="iicon">${body}</svg>`
}
