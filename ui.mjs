/** Lab-instrument UI drawing helpers. Everything is generated SVG markup, so no
 * font or image is fetched: headings use a 5x7 dot-matrix face, numbers use
 * seven-segment LEDs, doses are vaccine vials (cyan fluid), samples are petri
 * dishes, SOAP is bubbles, power is an mRNA helix and R0 is an analog dial.
 */
const FONT = {
  A: '.###.#...##...#######...##...##...#',
  B: '####.#...##...#####.#...##...#####.',
  C: '.###.#...##....#....#....#...#.###.',
  D: '####.#...##...##...##...##...#####.',
  E: '######....#....####.#....#....#####',
  F: '######....#....####.#....#....#....',
  G: '.###.#...##....#.####...##...#.####',
  H: '#...##...##...#######...##...##...#',
  I: '.###...#....#....#....#....#...###.',
  J: '..###...#....#....#....##..#..##...',
  K: '#...##..#.#.#..##...#.#..#..#.#...#',
  L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##.#.##...##...##...#',
  N: '#...##...###..##.#.##..###...##...#',
  O: '.###.#...##...##...##...##...#.###.',
  P: '####.#...##...#####.#....#....#....',
  Q: '.###.#...##...##...##.#.##..#..##.#',
  R: '####.#...##...#####.#.#..#..#.#...#',
  S: '.###.#...##.....###.....##...#.###.',
  T: '#####..#....#....#....#....#....#..',
  U: '#...##...##...##...##...##...#.###.',
  V: '#...##...##...##...##...#.#.#...#..',
  W: '#...##...##...##.#.##.#.##.#.#.#.#.',
  X: '#...##...#.#.#...#...#.#.#...##...#',
  Y: '#...##...#.#.#...#....#....#....#..',
  Z: '#####....#...#...#...#...#....#####',
  0: '.###.#...##..###.#.###..##...#.###.',
  1: '..#...##....#....#....#....#...###.',
  2: '.###.#...#....#...#...#...#...#####',
  3: '####.....#....#.###.....#....#####.',
  4: '...#...##..#.#.#..#.#####...#....#.',
  5: '######....####.....#....##...#.###.',
  6: '..##..#...#....####.#...##...#.###.',
  7: '#####....#...#...#...#....#....#...',
  8: '.###.#...##...#.###.#...##...#.###.',
  9: '.###.#...##...#.####....#...#..##..',
  '-': '...............#####...............',
  '/': '....#....#...#...#...#...#....#....',
  '·': '.................#.................',
  '!': '..#....#....#....#....#.........#..',
  '?': '.###.#...#....#...#...#.........#..',
  ' ': '...................................',
  '&': '.##..#..#.#.#...#...#.#.##..#.##.#.',
  '>': '#.....#.....#.....#...#...#...#....',
  '<': '....#...#...#...#.....#.....#.....#',
  '.': '...............................#...',
  'Δ': '..#....#...#.#..#.#.#...##...######',
};

/** Dot-matrix heading. Lit dots are circles so it reads as an LED matrix. */
export function matrix(text, { lit = 'currentColor', ghost = false } = {}) {
  const chars = [...String(text).toUpperCase()];
  const width = chars.length * 6 - 1;
  let dots = '';
  chars.forEach((ch, i) => {
    const map = FONT[ch] || FONT[' '];
    for (let p = 0; p < 35; p++) {
      const x = i * 6 + (p % 5) + 0.5,
        y = Math.floor(p / 5) + 0.5;
      if (map[p] === '#') dots += `<circle cx="${x}" cy="${y}" r="0.43"/>`;
      else if (ghost) dots += `<circle class="off" cx="${x}" cy="${y}" r="0.3"/>`;
    }
  });
  return `<svg class="dm" viewBox="0 0 ${width} 7" role="img" aria-label="${text}" fill="${lit}" preserveAspectRatio="xMidYMid meet">${dots}</svg>`;
}

const SEGMENTS = {
  0: 'abcdef',
  1: 'bc',
  2: 'abged',
  3: 'abgcd',
  4: 'fgbc',
  5: 'afgcd',
  6: 'afgedc',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
  '-': 'g',
  ' ': '',
};
// One digit cell is 12 x 20 units; segments are slanted hexagons.
const SEG_POLY = {
  a: '2.6,1 9.6,1 8.4,2.6 3.8,2.6',
  b: '10,1.6 10,9 8.8,8.2 8.8,3',
  c: '10,11 10,18.4 8.8,17 8.8,11.8',
  d: '2.6,19 9.6,19 8.4,17.4 3.8,17.4',
  e: '2,11 2,18.4 3.2,17 3.2,11.8',
  f: '2,1.6 2,9 3.2,8.2 3.2,3',
  g: '2.8,10 4,9.1 8,9.1 9.2,10 8,10.9 4,10.9',
};
/** Seven-segment readout with dim ghost segments, like a lab counter. */
export function segments(text) {
  const chars = [...String(text)];
  let out = '';
  chars.forEach((ch, i) => {
    const on = SEGMENTS[ch] ?? '';
    for (const [seg, pts] of Object.entries(SEG_POLY)) {
      const shifted = pts
        .split(' ')
        .map((p) => {
          const [x, y] = p.split(',').map(Number);
          return `${(x + i * 12 - (y - 10) * 0.12).toFixed(2)},${y}`;
        })
        .join(' ');
      out += `<polygon class="${on.includes(seg) ? 'on' : 'off'}" points="${shifted}"/>`;
    }
  });
  return `<svg class="seg" viewBox="0 0 ${chars.length * 12} 20" aria-hidden="true">${out}</svg>`;
}

/** A dose vial. `state`: full | empty | cracked (just lost) | assist (bonus). */
export function vial(state) {
  const fill = state === 'full' || state === 'assist' ? 1 : 0;
  return `<svg class="vial ${state}" viewBox="0 0 16 34" aria-hidden="true">
    <rect class="cap" x="3" y="1" width="10" height="5" rx="1.5"/>
    <path class="glass" d="M4 7h8v20a4 4 0 0 1-8 0z"/>
    <g class="fluid-clip"><rect class="fluid" x="5.2" y="11" width="5.6" height="18" rx="2.6" style="transform:scaleY(${fill})"/></g>
    <path class="marks" d="M9 14h2M9 18h2M9 22h2"/>
    <path class="crack" d="M6 12l3 4-2 3 3 4"/>
  </svg>`;
}

export const MEDAL_COLOR = { gold: '#ffc94d', silver: '#e4edf3', bronze: '#c9814a' };
/** Medals differ by shape and pip count, not only color (playtest: silver read
 * as "no medal"): bronze = round coin + 1 pip, silver = hexagon + 2 pips,
 * gold = star. No medal is a dashed empty ring. */
export function medalRing(medal, assisted) {
  let body;
  if (medal === 'gold')
    body =
      '<path d="M10 1.6l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L10 14.2 4.9 17l1.1-5.6-4.2-3.9 5.7-.7z" fill="#ffc94d" stroke="#fff3c4" stroke-width="0.8"/>';
  else if (medal === 'silver')
    body =
      '<path d="M10 1.8l7.1 4.1v8.2L10 18.2l-7.1-4.1V5.9z" fill="#e4edf3" stroke="#ffffff" stroke-width="0.8"/><circle cx="7.4" cy="10" r="1.6" fill="#2b3a44"/><circle cx="12.6" cy="10" r="1.6" fill="#2b3a44"/>';
  else if (medal === 'bronze')
    body = '<circle cx="10" cy="10" r="7.6" fill="#c9814a" stroke="#ffc08a" stroke-width="0.8"/><circle cx="10" cy="10" r="1.8" fill="#3a1d08"/>';
  else body = '<circle cx="10" cy="10" r="7" fill="none" stroke="#4d6662" stroke-width="1.6" stroke-dasharray="2.4 2"/>';
  const a = assisted
    ? '<rect x="12.5" y="12.5" width="7" height="7" rx="1.5" fill="#6fe8ff"/><text x="16" y="18.2" text-anchor="middle" font-size="6.5" font-weight="800" fill="#05131a">A</text>'
    : '';
  return `<svg class="medal ${medal || 'none'}" viewBox="0 0 20 20" aria-hidden="true">${body}${a}</svg>`;
}
/** The user's original 16x16 sprites (refs/canvas-retro-arcade/src/img),
 * transcribed pixel for pixel and drawn as crisp SVG squares: the personality
 * this revision recovers. */
const SPRITES = {
  corona: [
    '......####......',
    '...#...##...#...',
    '..#....##....#..',
    '.#.#..####..#.#.',
    '....###..###....',
    '....########....',
    '#..###.##.###..#',
    '####.##..##.####',
    '####.##..##.####',
    '#..###.##.###..#',
    '....########....',
    '....###..###....',
    '.#.#..####..#.#.',
    '..#....##....#..',
    '...#...##...#...',
    '......####......',
  ],
  syringe: [
    '........#.......',
    '........#.......',
    '........#.......',
    '.......###......',
    '.......#.#......',
    '.......###......',
    '.......#.#......',
    '.......###......',
    '.......#.#......',
    '.......###......',
    '.......#.#......',
    '......#####.....',
    '.....#######....',
    '........#.......',
    '........#.......',
    '.......###......',
  ],
};
export function pixelSprite(name, { color = '#12ce5d', cls = '' } = {}) {
  let rects = '';
  SPRITES[name].forEach((row, y) => [...row].forEach((c, x) => c === '#' && (rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`)));
  return `<svg class="pixel ${cls}" viewBox="0 0 16 16" fill="${color}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
export const SPRITE_ROWS = SPRITES;

/** SOAP stock: bubbles; the last one fills with graze progress. */
export function soapBubbles(count, progress = 0) {
  const n = Math.max(count, 0);
  let out = '';
  for (let i = 0; i < Math.max(2, n); i++) out += `<svg class="bubble ${i < n ? 'on' : 'off'}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><circle class="shine" cx="7" cy="7" r="2"/></svg>`;
  return `${out}<svg class="graze-ring" viewBox="0 0 20 20" aria-hidden="true"><circle class="track" cx="10" cy="10" r="7"/><circle class="fill" cx="10" cy="10" r="7" pathLength="100" stroke-dasharray="${(progress * 100).toFixed(1)} 100" transform="rotate(-90 10 10)"/></svg>`;
}
/** mRNA power: a 4-segment helix (one rung per level). */
export function helix(power) {
  let out = '';
  for (let i = 0; i < 4; i++) {
    const y = 2 + i * 8;
    out += `<g class="${i < power ? 'on' : 'off'}"><path d="M3 ${y}c6 0 10 6 16 6M19 ${y}c-6 0-10 6-16 6"/><path class="rung" d="M11 ${y + 1}v4"/></g>`;
  }
  return `<svg class="helix" viewBox="0 0 22 34" aria-hidden="true">${out}</svg>`;
}
/** R0 dial from 0 to 3 with a red zone above 1. Below 1 the outbreak shrinks. */
export function r0Dial(value) {
  const v = Math.max(0, Math.min(3, value || 0));
  const a = Math.PI * (1 - v / 3);
  const x = 20 + Math.cos(a) * 14,
    y = 22 - Math.sin(a) * 14;
  const zoneA = Math.PI * (1 - 1 / 3);
  const zx = 20 + Math.cos(zoneA) * 15,
    zy = 22 - Math.sin(zoneA) * 15;
  return `<svg class="r0-dial ${v >= 1 ? 'over' : ''}" viewBox="0 0 40 26" aria-hidden="true"><path class="arc" d="M5 22a15 15 0 0 1 30 0"/><path class="zone" d="M${zx.toFixed(2)} ${zy.toFixed(2)}A15 15 0 0 1 35 22"/><line class="needle" x1="20" y1="22" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/><circle cx="20" cy="22" r="2"/></svg>`;
}

/** Mini icons for the sample intro "NEW" line. */
const crownIcon = (spikes = 8, r = 5) => {
  let d = '';
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    d += `M${(12 + Math.cos(a) * r).toFixed(1)} ${(12 + Math.sin(a) * r).toFixed(1)}L${(12 + Math.cos(a) * (r + 4)).toFixed(1)} ${(12 + Math.sin(a) * (r + 4)).toFixed(1)}`;
  }
  return `<circle cx="12" cy="12" r="${r}"/><path d="${d}"/>`;
};
export const ICONS = {
  wild: `<svg viewBox="0 0 24 24">${crownIcon()}</svg>`,
  sneezer: `<svg viewBox="0 0 24 24">${crownIcon(10, 6)}<path class="dash" d="M8 22l4-3 4 3"/></svg>`,
  budder: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/><path d="M12 6v12"/></svg>',
  worm: '<svg viewBox="0 0 24 24"><path d="M2 12c3-6 5 6 8 0s5 6 8 0 3 0 4 0"/></svg>',
  puff: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="5" cy="12" r="1.6"/></svg>',
  droplet: '<svg viewBox="0 0 24 24"><path d="M12 3c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/><path class="dash" d="M12 21v2"/></svg>',
  hijacker: `<svg viewBox="0 0 24 24">${crownIcon(8, 4)}<path class="dash" d="M15 15l6 6"/></svg>`,
  heavy: `<svg viewBox="0 0 24 24">${crownIcon(10, 5)}<circle cx="12" cy="12" r="2"/></svg>`,
  bloom: '<svg viewBox="0 0 24 24"><path d="M12 20c-5-3-6-9-1-15M12 20c5-3 6-9 1-15M12 20V6"/></svg>',
  breath: '<svg viewBox="0 0 24 24"><path d="M12 4v8M12 12c-6 0-8 4-7 8 2 0 6-1 7-4M12 12c6 0 8 4 7 8-2 0-6-1-7-4"/></svg>',
  mutation: '<svg viewBox="0 0 24 24"><path d="M7 3c10 6 0 12 10 18M17 3C7 9 17 15 7 21"/></svg>',
  r0: '<svg viewBox="0 0 24 24"><path d="M3 18a9 9 0 0 1 18 0"/><path d="M12 18l5-6"/></svg>',
  boss: `<svg viewBox="0 0 24 24">${crownIcon(12, 6)}</svg>`,
  bonus: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9L3.5 9.2l5.9-.8z"/></svg>',
};

export const KEYCAP = (label, wide = false) => `<kbd class="${wide ? 'wide' : ''}">${label}</kbd>`;
/** One control scheme. Keyboard: arrows move, Shift focus, Space SOAP, fire is
 * automatic. Touch: drag anywhere (relative), the SOAP button, auto-fire. */
export function controlsLine(touch) {
  return touch
    ? '<span><i class="gesture">↔</i><b>DRAG</b> MOVE</span><span><i class="gesture soap">◎</i><b>SOAP</b></span><span><b>AUTO-FIRE</b></span>'
    : `<span>${KEYCAP('←')}${KEYCAP('→')}${KEYCAP('↑')}${KEYCAP('↓')}<b>MOVE</b></span><span>${KEYCAP('SHIFT', true)}<b>FOCUS</b></span><span>${KEYCAP('SPACE', true)}<b>SOAP</b></span><span><b>AUTO-FIRE</b></span>`;
}
export function controlsCard(touch) {
  const rows = touch
    ? [['DRAG ANYWHERE', 'MOVE (THE FINGER NEVER COVERS THE SYRINGE)'], ['◎ SOAP', 'BOMB: CLEARS BULLETS'], ['AUTO-FIRE', 'ALWAYS ON'], ['❚❚', 'PAUSE']]
    : [['ARROWS / WASD', 'MOVE IN 2D'], ['HOLD SHIFT', 'FOCUS: SLOW + NEEDLE STREAM'], ['SPACE / X', 'SOAP BOMB (ALSO JUST AFTER A HIT)'], ['AUTO-FIRE', 'ALWAYS ON'], ['P / ESC · R', 'PAUSE · RETRY']];
  return `<div class="controls-card">${rows.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('')}<p>ONLY THE WHITE DOT IN THE BARREL CAN BE HIT. GRAZE BULLETS FOR POINTS AND SOAP.</p></div>`;
}

/** The CONTAINMENT LOST cause line. Always meaningful: a bullet without a
 * source or family (a bare QA fixture) reads "Hit by VIRUS droplet", never
 * "Hit by undefined shot". */
export function causeText(cause) {
  const c = cause || {};
  const ok = (v) => typeof v === 'string' && v && v !== 'undefined' && v !== 'null';
  const by = ok(c.by) ? c.by : 'VIRUS';
  if (c.what === 'CONTACT') return `Touched a ${by}`;
  const what = (ok(c.what) ? c.what : 'DROPLET').toLowerCase();
  return `Hit by ${by} ${what}${ok(c.pattern) && c.pattern !== c.what ? ` · ${c.pattern}` : ''}`;
}

export const fmtTime = (seconds) => {
  const t = Math.max(0, Math.floor(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
