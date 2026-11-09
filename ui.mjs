/** Lab-instrument UI drawing helpers. Everything is generated SVG markup, so no
 * font or image is fetched: headings use a 5x7 dot-matrix face, numbers use
 * seven-segment LEDs, doses are glass vials and sectors are petri dishes.
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
/** HUD twin of the renderer's Omega node icons. */
export function nodeIcon(kind) {
  const paths = {
    aimed: '<path d="M12 20L6 7h12z" fill="currentColor"/>',
    spread: '<path d="M12 6v14M12 6l-6 12M12 6l6 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    beam: '<rect x="9.5" y="3" width="5" height="18" rx="1" fill="currentColor"/>',
    spawn: '<ellipse cx="12" cy="12" rx="5" ry="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M4 12h16" stroke="currentColor" stroke-width="2.2"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || ''}</svg>`;
}

/** Mini archetype icons for the sector intro "NEW" line. */
export const ICONS = {
  membrane:
    '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="5" height="4" rx="1"/><rect x="9.5" y="8" width="5" height="4" rx="1"/><rect x="16" y="8" width="5" height="4" rx="1"/><rect x="6" y="13" width="5" height="4" rx="1"/><rect x="13" y="13" width="5" height="4" rx="1"/></svg>',
  courier: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 3v3M12 18v3"/></svg>',
  splitter: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/><path d="M12 5v14"/></svg>',
  diver: '<svg viewBox="0 0 24 24"><path d="M12 3l5 8h-3v4h-4v-4H7z"/><path d="M12 17v1.5M12 20.5V22" class="dash"/></svg>',
  burster: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  infector: '<svg viewBox="0 0 24 24"><path d="M5 18l4-9 4 9z"/><path d="M13 13l7-6" class="dash"/><circle cx="20" cy="6" r="2"/></svg>',
  capsid: '<svg viewBox="0 0 24 24"><path d="M12 3l7 4v10l-7 4-7-4V7z"/><rect x="7" y="16" width="10" height="3" rx="1"/></svg>',
  boss: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/></svg>',
  bonus: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9L3.5 9.2l5.9-.8z"/></svg>',
  none: '<svg viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="6" rx="1.5"/><path d="M4 20L20 4"/></svg>',
};

export const KEYCAP = (label, wide = false) => `<kbd class="${wide ? 'wide' : ''}">${label}</kbd>`;
export function controlsCard(touch) {
  if (touch)
    return `<div class="controls-card"><span><i class="gesture">↔</i>DRAG</span><span><i class="gesture">●</i>HOLD = FIRE</span><span><i class="gesture shield">◎</i>SHIELD</span></div>`;
  return `<div class="controls-card"><span>${KEYCAP('←')}${KEYCAP('→')}MOVE</span><span>${KEYCAP('SPACE', true)}FIRE</span><span>${KEYCAP('SHIFT', true)}SHIELD</span></div>`;
}

export const fmtTime = (seconds) => {
  const t = Math.max(0, Math.floor(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
