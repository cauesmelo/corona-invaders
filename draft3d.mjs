/** FORMULATE in 3D: the adjuvant draft as vaccine cartridges
 * (RESEARCH_DIFFICULTY.md §6). The three offered adjuvants are glass
 * carpules that float into the lab view over the frozen, dimmed board, turn
 * slowly under the game's own key, rim and fill lights, and load into the
 * syringe when picked. Nothing that shows card content is DOM: the name and
 * one stat are printed on each cartridge's label (a CanvasTexture), the
 * header is etched on the rack's top rail and the selected cartridge's
 * caption on its front rail. Only RESAMPLE / DISCARD / INJECT stay DOM
 * buttons (they are controls), plus the visually hidden live region.
 *
 * Why horizontal cartridges, stacked: a label that must hold a 16-character
 * name at a 14 px cap height needs ~200 px of straight run. On an upright
 * carpule that run is the circumference, which a camera sees foreshortened;
 * along a horizontal carpule's axis it is straight, so the text reads like
 * a real cartridge label (printed along the axis) and the axis lines up with
 * the syringe barrel the pick slides into. Three stacked rows also fit the
 * narrow board column in landscape and a 320 px phone in portrait without a
 * carousel: every offer stays visible at once.
 *
 * Tier reads through material, never colour alone (§6.4): clear glass,
 * frosted glass, cobalt glass, and a gold crown cap with glowing serum, plus
 * 1-4 grooves turned into the cap, the label's tier word and pips, and the
 * reveal motion. The line reads through the serum colour and what floats in
 * it (needle, plunger tip, Y antibody, graze ring, bubbles, sloshing dose).
 *
 * Performance (§6.8, SwiftShader at 960x640 DPR 1): the board is drawn once
 * into the framebuffer and copied to a texture (copyFramebufferToTexture: no
 * render target, so no second set of board shader programs), then each
 * draft frame is one render of this scene: a full-screen backdrop quad and
 * about 35 draw calls, <= 25k triangles, no transmission, no shadows, no
 * post-processing, one point light, pixel ratio <= 1.25. Glass is
 * MeshStandardMaterial (transparency, low roughness and the environment
 * map) rather than MeshPhysicalMaterial's clearcoat, and only the reflective
 * parts (glass, metal caps, the syringe) sample the environment: in an
 * interleaved A/B on SwiftShader those cut the frame's GPU time by about
 * 23% and 20%. Every program and geometry is built and compiled at boot
 * (prewarm), so the first open only draws three label canvases.
 *
 * Units: world units (u) of this scene, not the board's; times in ms.
 * Pure data and layout functions are exported for tests/draft3d.test.mjs.
 */
import * as Cards from './cards.mjs';
import { SYRINGE, PALETTE } from './shapes.mjs';
import { FONT } from './ui.mjs';
import { LINE_GLYPH } from './formulate.mjs';

const DEG = Math.PI / 180;
let UP = null; // THREE.Vector3(0, 1, 0), set when the controller is built
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - (1 - clamp01(t)) ** 3;
const easeInCubic = (t) => clamp01(t) ** 3;
const easeInOut = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
/** easeOutBack with c1 = 1.29: a 6% overshoot (§6.6). The peak of
 * 1 + (c+1)u^3 + c u^2 (u = t - 1) is u^2 c / 3 at u = -2c / (3 (c + 1)). */
const BACK = 1.29;
export const easeOutBack = (t) => {
  const u = clamp01(t) - 1;
  return 1 + (BACK + 1) * u * u * u + BACK * u * u;
};

// ---- The cartridge (one carpule, axis along +x, label facing +z) ---------------
// Glass body from the open stopper end (x0) to the shoulder, a neck and a
// crimped cap. The paper label wraps 120 degrees of the front, centred 10
// degrees above it (the camera looks down 8 degrees, so text near +8 degrees
// is seen head-on); the clear window between the label and the shoulder
// shows the serum, the line's contents and the tier's glass.
export const CARTRIDGE = Object.freeze({
  radius: 0.38,
  x0: -1.62,
  shoulder: 1.3,
  neck: 1.42,
  flange: 1.5,
  cap: Object.freeze({ x0: 1.38, x1: 1.68, r: 0.27 }),
  stopper: Object.freeze({ x0: -1.6, x1: -1.38 }),
  serum: Object.freeze({ x0: -1.38, x1: 1.3, r: 0.335 }),
  // 90 degrees of paper: clear glass shows above it (the highlight) and
  // below it (a strip of serum along the whole length).
  label: Object.freeze({ x0: -1.5, x1: 0.5, a0: -40 * DEG, a1: 50 * DEG, lift: 0.004 }),
  window: Object.freeze({ x: 0.9, half: 0.34 }),
});
export const CARTRIDGE_LENGTH = CARTRIDGE.cap.x1 - CARTRIDGE.x0;

/** Tier looks (§6.4). Distinct in glass roughness/opacity/tint and cap metal,
 * asserted by tests/draft3d.test.mjs. `sheen` is the glass's environment
 * reflection strength (it stands in for the brief's clearcoat). */
export const TIER_LOOK = Object.freeze({
  common: Object.freeze({
    glass: Object.freeze({ color: '#e9fbff', opacity: 0.3, roughness: 0.04, sheen: 1.6, frosted: false }),
    cap: Object.freeze({ color: '#bfc8cd', metalness: 0.8, roughness: 0.45 }),
    serum: 0.25,
    notches: 1,
    ornament: null,
  }),
  rare: Object.freeze({
    glass: Object.freeze({ color: '#f4fbff', opacity: 0.55, roughness: 0.5, sheen: 0.8, frosted: true }),
    cap: Object.freeze({ color: '#e6edf1', metalness: 0.9, roughness: 0.18 }),
    ring: '#5fe3ff',
    serum: 0.45,
    notches: 2,
    ornament: 'ring',
  }),
  epic: Object.freeze({
    glass: Object.freeze({ color: '#3a5bff', opacity: 0.45, roughness: 0.12, sheen: 1.6, frosted: false }),
    cap: Object.freeze({ color: '#ffffff', metalness: 1, roughness: 0.06 }),
    serum: 0.45,
    notches: 3,
    ornament: 'particles',
    particles: 24,
  }),
  legendary: Object.freeze({
    glass: Object.freeze({ color: '#e9fbff', opacity: 0.3, roughness: 0.04, sheen: 1.6, frosted: false }),
    cap: Object.freeze({ color: '#f2c14e', metalness: 1, roughness: 0.22, crown: true }),
    serum: 1.1,
    notches: 4,
    ornament: 'swirl',
    light: Object.freeze({ color: '#ffc35a', intensity: 4, distance: 3 }),
  }),
});
const TIERS = ['common', 'rare', 'epic', 'legendary'];
const TIER_WORD = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };

/** Serum colour per line (never virus green, danger pink or supply amber's
 * exact hue); EXPOSURE is the brief's name for today's GRAZE line. */
export const LINE_SERUM = Object.freeze({ NEEDLE: '#59dcff', INJECT: '#eef6ff', ANTIBODY: '#6f8dff', EXPOSURE: '#c7a6ff', GRAZE: '#c7a6ff', SOAP: '#bff6ff', DOSE: '#ffc46b' });
/** What floats in the serum names the line (<= 300 triangles each). */
export const LINE_CONTENTS = Object.freeze({ NEEDLE: 'needle', INJECT: 'disc', ANTIBODY: 'antibody', EXPOSURE: 'ring', GRAZE: 'ring', SOAP: 'bubbles', DOSE: 'meniscus' });
const lineKey = (line) => (LINE_SERUM[line] ? line : 'NEEDLE');

/** Animation timings in ms (§6.6). */
export const TIMING = Object.freeze({
  dim: 250,
  syringeRise: 350,
  dropStart: Object.freeze([150, 270, 390]),
  drop: 450,
  legendaryHold: 500, // the spin-up before a legendary lands (and the riser SFX)
  rareGlint: Object.freeze([120, 300]),
  epicWake: 200,
  legendaryLight: 300,
  revealTail: 200,
  inputs: 500,
  idleYaw: 18 * DEG,
  idlePeriod: 4000,
  idlePhase: 1300,
  bob: 0.03,
  bobHz: 0.4,
  lampSweep: 10 * DEG,
  lampPeriod: 3000,
  select: 160,
  // The brief's 1.1 s, tightened to 1.0 so play resumes within 1.2 s even
  // when a loaded machine draws at 10 fps (the frame after the hand-back
  // simulates).
  inject: Object.freeze({ seat: 300, click: 360, chamber: 640, resume: 1000 }),
  resample: Object.freeze([250, 600]),
  discard: 400,
  discardReturn: 300,
});
export const SELECT = Object.freeze({ lift: 0.25, scale: 1.12, dimOthers: 0.7 });
/** Plunger travel in syringe units: drawn back at open, pushed home as the
 * dose runs in (the brief's 0.3 u is at its 3.2x scale). */
const PLUNGER = Object.freeze({ back: -0.08, home: 0.12 });

/** When each slot starts dropping and lands, for an offer's tiers. A
 * legendary holds 500 ms above its slot (spinning 1.5 turns, the riser),
 * which shifts every later slot (the old flat draft's rule). */
export function revealSchedule(tiers) {
  let shift = 0;
  return tiers.map((tier, i) => {
    const legend = tier === 'legendary';
    const start = TIMING.dropStart[Math.min(i, 2)] + shift;
    if (legend) shift += TIMING.legendaryHold;
    const land = start + (legend ? TIMING.legendaryHold : 0) + TIMING.drop;
    return { start, land, legend };
  });
}
export const revealEnd = (tiers) => Math.max(...revealSchedule(tiers).map((s) => s.land)) + TIMING.revealTail;

/** Text bands on the label, as angles around the axis (+ = up). The camera
 * looks 8 degrees down, so a band near +8 degrees is seen head-on. */
export const LABEL_BANDS = Object.freeze({
  name: Object.freeze([14 * DEG, 40 * DEG]),
  stat: Object.freeze([-12 * DEG, 7 * DEG]),
  foot: Object.freeze([-33 * DEG, -20 * DEG]),
  stripeTop: Object.freeze([41.5 * DEG, 44.5 * DEG]),
  stripeBottom: Object.freeze([-38 * DEG, -35.5 * DEG]),
  hairlines: Object.freeze([47 * DEG, -39.3 * DEG]),
});

// ---- Label text -----------------------------------------------------------------
const STOP = new Set(['a', 'an', 'the', 'and', 'of', 'in', 'to', 'for', 'per', 'its', 'it', 'is', 'that', 'deal', 'deals', 'gives', 'gain', 'gains', 'from', 'now', 'with', 'by', 'at', 'on', 'every', 'each', 'your']);
const NUM = /[+−-]?\d+(?:\.\d+)?(?:%|×| s\b| u\b|°)?/;
/** The label's stat when a card carries none: the first number of the
 * effect sentence with the one or two words around it ("+10% DAMAGE",
 * "FIRE RATE +8%"), <= 18 characters. Used until the card data carries its
 * own stat line (the difficulty brief §7.3 adds one per card). */
export function deriveStat(text) {
  const clean = String(text || '').replace(/\(.*?\)/g, '').replace(/(?:[;:]\s|\.\s|\.$).*$/, '');
  const m = clean.match(NUM);
  if (!m) return clean.toUpperCase().split(/\s+/).filter(Boolean).slice(0, 3).join(' ').slice(0, 18);
  const before = clean.slice(0, m.index).trim().split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()));
  const after = clean.slice(m.index + m[0].length).trim().split(/[\s,]+/).filter((w) => w && !STOP.has(w.toLowerCase()));
  const num = m[0].replace('-', '−');
  const lead = before.length && before.length <= 2 ? `${before.join(' ')} ${num}` : '';
  let out = lead && lead.length <= 18 ? lead : num;
  for (const w of out === num ? after : []) {
    if ((out + ' ' + w).length > 18) break;
    out += ' ' + w;
  }
  return out.toUpperCase().slice(0, 18);
}
const field = (c, keys) => {
  for (const k of keys) {
    const v = c?.[k];
    const s = typeof v === 'function' ? v(c.fx || {}) : v;
    if (typeof s === 'string' && s.trim()) return s.trim();
  }
  return '';
};
/** Name, one stat and (trade-offs) a short COST for a card's label. Reads the
 * card's own fields first, so the difficulty squad's set (name <= 16, a stat
 * line <= 18) prints as authored. */
export function labelOf(id, copy = 1) {
  const c = Cards.CARD[id];
  if (!c) return { name: String(id || '?').toUpperCase(), stat: '', cost: '', tier: 'common', line: 'NEEDLE', tradeoff: false };
  const text = Cards.cardText?.(id, copy) || '';
  // `label` is the card's own cartridge line (<= 16 characters: RETRACTABLE,
  // AFFINITY); the full name stays in the caption, the HUD and the live
  // region. Without it, "RETRACTABLE NEEDLE" and "AFFINITY MATURATION" were
  // squeezed to 0.7 and 0.66 of the dot pitch to fit the plate.
  const name = (field(c, ['labelName', 'short', 'label']) || c.name).toUpperCase();
  const stat = (field(c, ['stat', 'statLine', 'labelStat']) || deriveStat(text)).toUpperCase();
  const tradeoff = !!(c.tradeoff || c.cost || (c.tags || []).some((t) => /trade/i.test(t)));
  let cost = field(c, ['costStat', 'costLine', 'costLabel']);
  if (!cost && tradeoff) {
    const full = (Cards.cardCost?.(id) || '').replace(/^COST:\s*/i, '');
    cost = full && full.length <= 20 ? full : deriveStat(full) || 'TRADE-OFF';
  }
  return { name, stat, cost: cost ? `COST ${cost.replace(/^COST:?\s*/i, '')}`.toUpperCase().slice(0, 24) : '', tier: c.tier, line: c.line, tradeoff };
}
/** Names -> cartridge labels, so the SYNERGY row names the two cards the way
 * their cartridges do ("RETRACTABLE + MASS VACCINATION" fits 44 characters;
 * the full names did not and lost the end of the second one). */
function shortSynergy(text) {
  const label = Object.fromEntries((Cards.ALL_CARDS || []).map((c) => [c.name, c.label || c.name]));
  return String(text)
    .split(' + ')
    .map((n) => label[n] ?? n)
    .join(' + ');
}
/** Keep the first `room` rows; the last one loses whole words (never half a
 * word) until it fits next to an ellipsis. */
function clipRows(rows, room, width) {
  if (rows.length <= room) return rows;
  const out = rows.slice(0, room);
  let words = out[room - 1].split(' ');
  while (words.length > 1 && `${words.join(' ')}…`.length > width) words.pop();
  out[room - 1] = `${words.join(' ')}…`;
  return out;
}
/** The full text for screen readers and the caption (effect, cost, synergy). */
export function captionOf(id, deck = [], ctx = {}) {
  const c = Cards.CARD[id];
  if (!c) return { lines: [], full: '' };
  const copy = (Cards.stacksOf?.(deck, id) ?? 0) + 1;
  const effect = Cards.cardText?.(id, copy) || '';
  const cost = Cards.cardCost?.(id) || '';
  let preview = null;
  try {
    preview = Cards.previewPick?.(deck, id, ctx) ?? null;
  } catch {
    preview = null;
  }
  const synergy = preview?.synergy || Cards.synergyOf?.(deck, id) || '';
  const lines = [];
  // §6.5: the full effect sentence (parentheses dropped if that makes it
  // fit two 36-character rows), else the card's own two-row `brief`, else
  // whole words and an ellipsis; then SYNERGY or the COST.
  const tail = synergy ? { text: `SYNERGY: ${shortSynergy(synergy).toUpperCase()}`, tone: 'cyan' } : cost ? { text: cost.toUpperCase(), tone: 'pink' } : null;
  const room = tail ? 2 : 3;
  let wrapped = wrap(effect.toUpperCase(), 36);
  if (wrapped.length > room) wrapped = wrap(effect.replace(/\s*\([^)]*\)/g, '').toUpperCase(), 36);
  if (wrapped.length > room && c.brief) wrapped = wrap(String(c.brief).toUpperCase(), 36);
  wrapped = clipRows(wrapped, room, 36);
  lines.push(...wrapped.map((t) => ({ text: t, tone: 'ink' })));
  if (tail) lines.push(tail);
  const full = `${c.name}, ${TIER_WORD[c.tier]?.toLowerCase() || c.tier}, ${String(c.line).toLowerCase()} line. ${effect}${cost ? ` ${cost}` : ''}${synergy ? ` Synergy: ${synergy}.` : ''}`;
  return { lines: lines.slice(0, 3).map((l) => ({ ...l, text: l.text.slice(0, 44) })), full };
}
function wrap(text, width) {
  const out = [];
  let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= width) line += ' ' + w;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

// ---- Dot-matrix lettering ---------------------------------------------------------
// The game's 5x7 face (ui.mjs FONT) plus the symbols card stats use.
const rows = (...r) => r.join('');
const EXTRA = {
  '+': rows('.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'),
  '%': rows('##...', '##..#', '...#.', '..#..', '.#...', '#..##', '...##'),
  '×': rows('.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'),
  '→': rows('.....', '..#..', '...#.', '#####', '...#.', '..#..', '.....'),
  '←': rows('.....', '..#..', '.#...', '#####', '.#...', '..#..', '.....'),
  '(': rows('...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'),
  ')': rows('.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'),
  ':': rows('.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'),
  ',': rows('.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'),
  ';': rows('.....', '.##..', '.##..', '.....', '.##..', '..#..', '.#...'),
  '…': rows('.....', '.....', '.....', '.....', '.....', '.....', '#.#.#'),
  '≤': rows('...#.', '..#..', '.#...', '..#..', '...#.', '.....', '#####'),
  '≥': rows('.#...', '..#..', '...#.', '..#..', '.#...', '.....', '#####'),
  '±': rows('..#..', '..#..', '#####', '..#..', '..#..', '.....', '#####'),
  '°': rows('.##..', '#..#.', '.##..', '.....', '.....', '.....', '.....'),
  "'": rows('..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'),
  '=': rows('.....', '.....', '#####', '.....', '#####', '.....', '.....'),
  '◆': rows('.....', '..#..', '.###.', '#####', '.###.', '..#..', '.....'),
  '◇': rows('.....', '..#..', '.#.#.', '#...#', '.#.#.', '..#..', '.....'),
  '−': rows('.....', '.....', '.....', '#####', '.....', '.....', '.....'),
  '–': rows('.....', '.....', '.....', '#####', '.....', '.....', '.....'),
  '#': rows('.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'),
  '*': rows('.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'),
};
const glyphMap = (ch) => EXTRA[ch] || FONT[ch] || FONT[ch.toUpperCase()] || FONT[' '];
/** True when `ch` has its own 5x7 glyph (anything else would print as a
 * blank). Exported for the lettering test, so the test reads the real table
 * and not a copy of it. */
export const hasGlyph = (ch) => ch === ' ' || !!(EXTRA[ch] || FONT[ch] || FONT[String(ch).toUpperCase()]);
/** The 35-cell bitmap of a character (row-major, '#' lit), as printed. */
export const glyphBitmap = (ch) => String(glyphMap(ch));
/** Dot advance in dot pitches: 5 dots + 1 gap. */
export const textDots = (text) => Math.max(0, [...String(text)].length * 6 - 1);

/** Label layout in surface units: x in u along the axis (0 at the label's
 * left end), y as angles (radians, +up). Pure, so the legibility test can
 * project it without a canvas. Each line has a cap band [a0, a1] and a dot
 * pitch in u (px, the horizontal pitch, may be condensed to fit). */
export function labelLayout(label) {
  const L = CARTRIDGE.label,
    R = CARTRIDGE.radius + L.lift,
    len = L.x1 - L.x0;
  const margin = 0.07;
  // Bands (angles): the name above the camera-facing +8 degrees, the stat
  // straddling it, the cost / tier word under it.
  const bands = LABEL_BANDS;
  const line = (text, kind, x0, maxW) => {
    const [a0, a1] = bands[kind];
    const pitchY = ((a1 - a0) * R) / 7; // u of arc per dot row
    const dots = textDots(text);
    const pitchX = dots ? Math.min(pitchY, maxW / dots) : pitchY;
    return { text, kind, a0, a1, x0, width: dots * pitchX, pitchX, pitchY };
  };
  const name = line(label.name, 'name', margin, len - 2 * margin);
  // Stat row: the line glyph (a square one cap tall) then the stat.
  const statCap = (bands.stat[1] - bands.stat[0]) * R;
  const glyphW = statCap * 1.05;
  const stat = line(label.stat, 'stat', margin + glyphW + 0.05, len - 2 * margin - glyphW - 0.05);
  const tierText = `${TIER_WORD[label.tier] || ''}`;
  const pips = 0.05 * 4 + 0.03 * 3;
  const tierW = textDots(tierText) * (((bands.foot[1] - bands.foot[0]) * R) / 7);
  // The foot row: the trade-off's COST (pink) or the tier word, then pips.
  const foot = label.cost ? line(label.cost, 'foot', margin, len - 2 * margin - pips - 0.08) : null;
  const tier = label.cost ? null : line(tierText, 'foot', len - margin - pips - 0.05 - tierW, tierW + 1e-6);
  return { R, len, bands, name, stat, glyph: { x0: margin, width: glyphW, a0: bands.stat[0], a1: bands.stat[1] }, foot, tier, pips: { x0: len - margin - pips, width: pips, a0: bands.foot[0], a1: bands.foot[1] } };
}

// ---- Layout of the whole draft (pure) ---------------------------------------------
/** Content in draft-scene units: the top rail (header), three cartridge rows,
 * the caption rail and the syringe. Two presets: 'wide' (the landscape board
 * column) and 'tall' (portrait phones, a smaller syringe so the rows get the
 * height). The camera is fitted to the safe rect each frame it changes. */
export const RAIL = Object.freeze({ width: 3.9, top: 0.3, lip: 0.56, depth: 0.16 });
export function contentLayout(preset = 'wide', aspect = 0) {
  const tall = preset === 'tall';
  let rowGap = 1.0; // 0.76 u diameter + 0.24 u (the selected row grows to 0.85 u)
  let syringeScale = tall ? 1.05 : 1.5;
  // A tall phone fits the width first; the height left over goes to roomier
  // rows and a bigger syringe instead of empty bands above and below.
  if (tall && aspect > 0) {
    const base = contentLayout('tall');
    const extra = Math.max(0, base.width / aspect - base.height - 0.3);
    rowGap += Math.min(0.24, (extra * 0.3) / 3);
    syringeScale += Math.min(0.45, (extra * 0.45) / 0.84);
  }
  const syringeH = 2 * 0.42 * syringeScale; // the finger-grip collar's diameter
  const parts = [
    ['top', RAIL.top],
    ['gap', 0.12],
    ['rows', rowGap * 3],
    ['lip', RAIL.lip],
    ['gap', tall ? 0.1 : 0.16],
    ['syringe', syringeH],
  ];
  const height = parts.reduce((n, [, h]) => n + h, 0);
  let y = height / 2;
  const at = {};
  for (const [k, h] of parts) {
    at[k] = { top: y, bottom: y - h, mid: y - h / 2 };
    y -= h;
  }
  const rows = [0, 1, 2].map((i) => at.rows.top - rowGap * (i + 0.5));
  return {
    preset,
    // The rails plus room for the selected cartridge (x1.12) at its +-18
    // degree idle yaw, whose near end grows in perspective.
    width: RAIL.width + (tall ? 0.15 : 0.3),
    height,
    rows,
    rowZ: [-0.12, 0, -0.12],
    topRail: at.top.mid,
    lipRail: at.lip.mid,
    syringe: { y: at.syringe.mid, scale: syringeScale },
  };
}
/** Camera fit: FOV 35 degrees, looking 8 degrees down at the content centre,
 * at the distance where the content's box fills the safe rect (CSS px).
 * Returns the distance and the px per world unit at the content plane. */
export const DRAFT_FOV = 35;
export const DRAFT_PITCH = 8 * DEG;
export function fitCamera(safe, content) {
  const k = 2 * Math.tan((DRAFT_FOV * DEG) / 2);
  const pxPerU = Math.min(safe.w / content.width, safe.h / content.height);
  return { distance: safe.h / (k * pxPerU), pxPerU };
}

// ---- Geometry helpers -------------------------------------------------------------
function mergeGeos(THREE, list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3),
    nor = new Float32Array(total * 3),
    uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
/** Lathe around Y, then turned so the lathe axis runs along +x. */
const latheX = (THREE, pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg).rotateZ(-Math.PI / 2);
const cylX = (THREE, r0, r1, x0, x1, seg = 20, open = false) => new THREE.CylinderGeometry(r1, r0, x1 - x0, seg, 1, open).rotateZ(-Math.PI / 2).translate((x0 + x1) / 2, 0, 0);

function glassGeometry(THREE) {
  const C = CARTRIDGE,
    r = C.radius;
  // Open end with a rolled rim, the body, a rounded shoulder, neck, flange.
  const pts = [
    [r - 0.03, C.x0],
    [r + 0.012, C.x0 + 0.01],
    [r + 0.012, C.x0 + 0.05],
    [r, C.x0 + 0.07],
    [r, C.shoulder - 0.02],
  ];
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    pts.push([lerp(r, 0.2, 1 - Math.cos((t * Math.PI) / 2)), lerp(C.shoulder - 0.02, C.neck, Math.sin((t * Math.PI) / 2))]);
  }
  pts.push([0.19, C.neck + 0.04], [0.23, C.neck + 0.05], [0.23, C.flange]);
  return latheX(THREE, pts, 24);
}
function serumGeometry(THREE, fill = 1) {
  const S = CARTRIDGE.serum;
  if (fill >= 1) return cylX(THREE, S.r, S.r, S.x0, S.x1, 20);
  // DOSE: a liquid that fills `fill` of the bore, with a flat surface that
  // sloshes when the mesh rolls about the axis.
  const shape = new THREE.Shape();
  const yTop = -S.r + 2 * S.r * fill,
    phi = Math.asin(yTop / S.r);
  shape.moveTo(-S.r * Math.cos(phi), yTop);
  shape.absarc(0, 0, S.r, Math.PI - phi, 2 * Math.PI + phi, false);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: S.x1 - S.x0, bevelEnabled: false, curveSegments: 12 }).rotateY(Math.PI / 2).translate(S.x0, 0, 0);
}
function stopperGeometry(THREE) {
  const s = CARTRIDGE.stopper,
    r = CARTRIDGE.serum.r + 0.01;
  // A ribbed rubber plunger seated inside the open end.
  const pts = [[0, s.x0], [r - 0.03, s.x0], [r, s.x0 + 0.03], [r, s.x0 + 0.06], [r - 0.025, s.x0 + 0.085], [r, s.x0 + 0.11], [r, s.x0 + 0.14], [r - 0.025, s.x0 + 0.165], [r, s.x0 + 0.19], [r - 0.02, s.x1], [0, s.x1]];
  return latheX(THREE, pts, 20);
}
/** The crimp cap with `notches` turned grooves (the tier count); the gold
 * cap adds a crown-shaped flip-off seal. */
function capGeometry(THREE, notches, crown) {
  const c = CARTRIDGE.cap;
  const pts = [[0.2, c.x0], [c.r, c.x0 + 0.025]];
  const span = c.x1 - c.x0 - 0.09;
  for (let i = 0; i < notches; i++) {
    const y = c.x0 + 0.05 + ((i + 0.5) * span) / notches;
    pts.push([c.r, y - 0.016], [c.r - 0.022, y - 0.004], [c.r - 0.022, y + 0.004], [c.r, y + 0.016]);
  }
  pts.push([c.r, c.x1 - 0.03], [c.r - 0.025, c.x1], [0.12, c.x1 + 0.004], [0.1, c.x1 - 0.008], [0, c.x1 - 0.008]);
  // 18 sides: the cap is small on screen, and its grooves are the
  // cartridge's most detailed profile (<= 3,000 triangles per cartridge).
  const parts = [latheX(THREE, pts, 18)];
  if (crown) {
    // The flip-off seal: a short drum with six points, gold like the crimp.
    parts.push(cylX(THREE, 0.2, 0.2, c.x1 - 0.01, c.x1 + 0.05, 18));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tip = new THREE.ConeGeometry(0.045, 0.1, 5).rotateZ(-Math.PI / 2).translate(c.x1 + 0.09, Math.cos(a) * 0.15, Math.sin(a) * 0.15);
      parts.push(tip);
    }
  }
  return parts.length > 1 ? mergeGeos(THREE, parts) : parts[0];
}
/** The paper label: a plane bent onto the glass (u along the axis, v around),
 * so text printed along the canvas runs straight along the cartridge. */
function labelGeometry(THREE) {
  const L = CARTRIDGE.label,
    R = CARTRIDGE.radius + L.lift;
  const arc = (L.a1 - L.a0) * R,
    mid = (L.a0 + L.a1) / 2;
  const g = new THREE.PlaneGeometry(L.x1 - L.x0, arc, 1, 20);
  const p = g.attributes.position,
    n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const a = mid + p.getY(i) / R;
    p.setXYZ(i, p.getX(i) + (L.x0 + L.x1) / 2, R * Math.sin(a), R * Math.cos(a));
    n.setXYZ(i, 0, Math.sin(a), Math.cos(a));
  }
  g.computeBoundingSphere();
  return g;
}
function contentsGeometry(THREE, kind) {
  const W = CARTRIDGE.window.x;
  switch (kind) {
    case 'needle':
      return mergeGeos(THREE, [cylX(THREE, 0.014, 0.014, W - 0.3, W + 0.18, 8), new THREE.ConeGeometry(0.014, 0.08, 8).rotateZ(-Math.PI / 2).translate(W + 0.22, 0, 0), cylX(THREE, 0.04, 0.03, W - 0.36, W - 0.28, 10)]);
    case 'disc': {
      // INJECT: the plunger tip seen face-on, a cross glint on it.
      const disc = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 24).rotateX(Math.PI / 2);
      const cross = [new THREE.BoxGeometry(0.24, 0.016, 0.016), new THREE.BoxGeometry(0.016, 0.24, 0.016)].map((b) => b.translate(0, 0, 0.03));
      return mergeGeos(THREE, [disc, ...cross]).translate(W, 0, 0);
    }
    case 'antibody': {
      const arm = (x, y, rz) => new THREE.CapsuleGeometry(0.028, 0.13, 2, 6).rotateZ(rz).translate(x, y, 0);
      return mergeGeos(THREE, [arm(W, -0.08, 0), arm(W - 0.055, 0.075, 0.65), arm(W + 0.055, 0.075, -0.65)]);
    }
    case 'ring': {
      const arcs = [];
      for (let i = 0; i < 8; i++) arcs.push(new THREE.TorusGeometry(0.19, 0.012, 4, 5, (Math.PI * 2) / 8 - 0.22).rotateZ((i * Math.PI * 2) / 8));
      return mergeGeos(THREE, [...arcs, new THREE.SphereGeometry(0.04, 8, 6)]).rotateY(Math.PI / 2).translate(W, 0, 0);
    }
    case 'bubbles':
      return new THREE.IcosahedronGeometry(0.045, 1);
    case 'meniscus':
    default:
      // The DOSE line's liquid surface (fill 0.68 of the bore: y = 0.36 r).
      return new THREE.TorusGeometry(0.2, 0.009, 4, 28).scale(1.5, 1, 0.5).rotateX(Math.PI / 2).translate(W, CARTRIDGE.serum.r * 0.36, 0);
  }
}

// ---- Canvas drawing ---------------------------------------------------------------
function dots(g, text, x, y, pitchX, pitchY, color) {
  g.fillStyle = color;
  const w = pitchX * 0.84,
    h = pitchY * 0.84;
  [...String(text)].forEach((ch, i) => {
    const map = glyphMap(ch);
    for (let p = 0; p < 35; p++) if (map[p] === '#') g.fillRect(x + (i * 6 + (p % 5)) * pitchX, y + Math.floor(p / 5) * pitchY, w, h);
  });
}
/** Draw a 24x24 stroked SVG glyph (formulate.mjs LINE_GLYPH) into a box. */
function drawGlyph(g, svg, x, y, w, h, color) {
  g.save();
  g.translate(x, y);
  g.scale(w / 24, h / 24);
  g.strokeStyle = color;
  g.lineWidth = 2.2;
  g.lineCap = g.lineJoin = 'round';
  for (const m of String(svg).matchAll(/<(path|rect|circle)([^>]*)\/?>/g)) {
    const attr = (k) => Number((m[2].match(new RegExp(`\\b${k}="([^"]+)"`)) || [])[1] || 0);
    const dash = (m[2].match(/stroke-dasharray="([^"]+)"/) || [])[1];
    g.setLineDash(dash ? dash.split(/[\s,]+/).map(Number) : []);
    if (m[1] === 'path') {
      const d = (m[2].match(/\bd="([^"]+)"/) || [])[1];
      if (d && typeof Path2D !== 'undefined') g.stroke(new Path2D(d));
    } else if (m[1] === 'rect') {
      g.beginPath();
      g.roundRect ? g.roundRect(attr('x'), attr('y'), attr('width'), attr('height'), attr('rx')) : g.rect(attr('x'), attr('y'), attr('width'), attr('height'));
      g.stroke();
    } else {
      g.beginPath();
      g.arc(attr('cx'), attr('cy'), attr('r'), 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();
}
export const LABEL_W = 1024;
export const LABEL_H = Math.round((LABEL_W * (CARTRIDGE.label.a1 - CARTRIDGE.label.a0) * (CARTRIDGE.radius + CARTRIDGE.label.lift)) / (CARTRIDGE.label.x1 - CARTRIDGE.label.x0));
const INK = '#0b1c22',
  INK_STAT = '#0f4652',
  INK_PINK = '#c4165c';
const TIER_STRIPE = { common: null, rare: ['#1fb5d6'], epic: ['#3a5bff', '#3a5bff'], legendary: ['#c9952c', '#c9952c'] };
/** Paper label: NAME, [glyph] STAT, then COST (pink) and the tier word with
 * pips. Bands: rare one cyan stripe, epic two cobalt, legendary two gold.
 * Exported for the browser check that rasterises every card's label. */
export function paintLabel(g, label) {
  const W = LABEL_W,
    H = LABEL_H,
    lay = labelLayout(label);
  const sx = W / lay.len;
  const A1 = CARTRIDGE.label.a1,
    span = CARTRIDGE.label.a1 - CARTRIDGE.label.a0;
  const vy = (a) => ((A1 - a) / span) * H; // angle -> canvas y
  g.clearRect(0, 0, W, H);
  const paper = g.createLinearGradient(0, 0, 0, H);
  paper.addColorStop(0, '#f4f8f6');
  paper.addColorStop(1, '#e3ebe8');
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);
  // Printed hairlines along both edges, and the tier stripes inside them.
  g.fillStyle = '#9fb2b0';
  for (const a of LABEL_BANDS.hairlines) g.fillRect(0, vy(a) - 1, W, 2);
  (TIER_STRIPE[label.tier] || []).forEach((c, i) => {
    const [a0, a1] = i === 0 ? LABEL_BANDS.stripeTop : LABEL_BANDS.stripeBottom;
    g.fillStyle = c;
    g.fillRect(0, vy(a1), W, vy(a0) - vy(a1));
  });
  if (label.tradeoff) {
    // Trade-off: a pink band at the shoulder end (a cost is a risk).
    g.fillStyle = INK_PINK;
    g.fillRect(W - 22, 0, 22, H);
  }
  const text = (ln, color) => {
    if (!ln || !ln.text) return;
    const pY = (ln.pitchY / lay.R / span) * H; // canvas px per dot row
    dots(g, ln.text, ln.x0 * sx, vy(ln.a1), ln.pitchX * sx, pY, color);
  };
  text(lay.name, INK);
  text(lay.stat, INK_STAT);
  drawGlyph(g, LINE_GLYPH[label.line] || LINE_GLYPH.NEEDLE, lay.glyph.x0 * sx, vy(lay.glyph.a1), lay.glyph.width * sx, vy(lay.glyph.a0) - vy(lay.glyph.a1), INK_STAT);
  if (lay.foot) text(lay.foot, INK_PINK);
  if (lay.tier) text(lay.tier, '#3d5d63');
  // Tier pips: filled diamonds for the tier, open for the rest.
  const n = { common: 1, rare: 2, epic: 3, legendary: 4 }[label.tier] || 1;
  const pipY0 = vy(lay.pips.a1),
    pipY1 = vy(lay.pips.a0),
    ph = pipY1 - pipY0,
    pw = 0.05 * sx,
    gap = 0.03 * sx;
  for (let i = 0; i < 4; i++) {
    const cx = lay.pips.x0 * sx + i * (pw + gap) + pw / 2,
      cy = (pipY0 + pipY1) / 2;
    g.beginPath();
    g.moveTo(cx, cy - ph / 2);
    g.lineTo(cx + pw / 2, cy);
    g.lineTo(cx, cy + ph / 2);
    g.lineTo(cx - pw / 2, cy);
    g.closePath();
    g.fillStyle = '#3d5d63';
    g.strokeStyle = '#3d5d63';
    g.lineWidth = 3;
    if (i < n) g.fill();
    else g.stroke();
  }
}
/** Etched text on black anodised aluminium (the rack rails). */
function paintRail(g, W, H, rows) {
  g.clearRect(0, 0, W, H);
  // A machined chamfer: a lit top edge and a dark bottom edge.
  g.fillStyle = 'rgba(159, 232, 255, 0.35)';
  g.fillRect(0, 0, W, 2);
  g.fillStyle = 'rgba(0, 0, 0, 0.5)';
  g.fillRect(0, H - 2, W, 2);
  for (const r of rows) {
    const pitch = Math.min(r.pitch, (r.maxW ?? W - 48) / Math.max(1, textDots(r.text)));
    const x = r.align === 'right' ? W - 24 - textDots(r.text) * pitch : 24;
    dots(g, r.text, x, r.y, pitch, pitch, r.color);
  }
}

// ---- Controller (GPU) ---------------------------------------------------------------
/**
 * createDraft3D(THREE, opts) builds the draft scene and returns its controller.
 *   renderer       the game's WebGLRenderer (one canvas, one context)
 *   stage          the element whose CSS size is the canvas size
 *   settings       { effects() } (false = reduced motion)
 *   boardRatio()   the board's pixel ratio, restored on close
 *   boardSyringe() { x, y, lengthPx } of the board syringe on screen (CSS px),
 *                  where the draft syringe flies on its way back to play
 *   cue(ev)        sound cues: { type: 'reveal', tier, slot }, 'legendary-riser'
 *   makeCanvas     (w, h) -> canvas, injectable for tests
 */
export function createDraft3D(THREE, opts) {
  const { renderer, stage, settings = { effects: () => true }, boardRatio = () => Math.min(globalThis.devicePixelRatio || 1, 2), boardSyringe = () => null, cue = () => {} } = opts;
  const makeCanvas = opts.makeCanvas || ((w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }));
  UP = new THREE.Vector3(0, 1, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(DRAFT_FOV, 1, 0.5, 60);

  // ---- Lights: the board's rig, so the cartridges belong to the world --------
  scene.add(new THREE.HemisphereLight('#e4f6ff', '#15302e', 0.75));
  const key = new THREE.DirectionalLight('#fff4e6', 2.6);
  const keyBase = new THREE.Vector3(-6, 22, 10).normalize().multiplyScalar(20);
  key.position.copy(keyBase);
  const rim = new THREE.DirectionalLight('#9fe8ff', 2.2);
  rim.position.set(5, 9, -18);
  scene.add(key, rim, key.target, rim.target);
  // The legendary lamp: always in the scene (intensity 0 otherwise), so the
  // light count, and with it every shader program, never changes.
  const amber = new THREE.PointLight(TIER_LOOK.legendary.light.color, 0, TIER_LOOK.legendary.light.distance, 2);
  scene.add(amber);

  // ---- Environment: a gradient room with two bright window bars, PMREM once --
  let envRT = null;
  const reflective = new Set();
  /** Mark a material as reflective: it gets the environment map at boot. */
  const reflect = (m) => (reflective.add(m), m);
  function buildEnvironment() {
    const w = 256,
      h = 128,
      data = new Uint16Array(w * h * 4);
    const half = THREE.DataUtils.toHalfFloat;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = y / (h - 1); // 0 = top (sky)
        let r = lerp(0.62, 0.03, v),
          gg = lerp(0.8, 0.07, v),
          b = lerp(0.9, 0.07, v);
        // Two window bars high on the front-left and the back: the sheen
        // that slides along the glass as the lamp sweeps.
        const bar = (cx, cw, y0, y1) => Math.abs(x - cx) < cw && y > y0 && y < y1;
        if (bar(70, 9, 22, 58) || bar(96, 5, 26, 54)) [r, gg, b] = [5.5, 5.3, 5];
        if (bar(200, 14, 30, 46)) [r, gg, b] = [2.2, 3.4, 3.8];
        const o = (y * w + x) * 4;
        data[o] = half(r);
        data[o + 1] = half(gg);
        data[o + 2] = half(b);
        data[o + 3] = half(1);
      }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      envRT = pm.fromEquirectangular(tex);
      pm.dispose();
    } catch {
      envRT = null;
    }
    tex.dispose();
    // Only the reflective parts sample it (glass, metal, the syringe); the
    // labels, serum, rubber and the anodised rails are lit by the rig alone.
    for (const m of reflective) m.envMap = envRT?.texture ?? null;
    for (const m of reflective) m.needsUpdate = true;
  }

  // ---- Backdrop: the held board frame, dimmed and desaturated (one quad) ------
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  let boardTex = null;
  const backdropMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, dim: { value: 1 }, desat: { value: 0 }, flash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    // The copied framebuffer already holds display values (tone mapped, sRGB):
    // no tone mapping or colour-space chunk, so it is shown as captured.
    fragmentShader:
      'uniform sampler2D map; uniform float dim, desat, flash; varying vec2 vUv; void main(){ vec3 c = texture2D(map, vUv).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(c, vec3(l), desat) * dim + flash * vec3(1.0, 0.8, 0.42); gl_FragColor = vec4(c, 1.0); }',
    depthTest: false,
    depthWrite: false,
  });
  const backdrop = new THREE.Mesh(tri, backdropMat);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1000;
  scene.add(backdrop);
  // The return to play: a black veil over the live board that lifts.
  const veilMat = new THREE.ShaderMaterial({
    uniforms: { alpha: { value: 0 } },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform float alpha; void main(){ gl_FragColor = vec4(0.012, 0.03, 0.04, alpha); }',
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const veil = new THREE.Mesh(tri, veilMat);
  veil.frustumCulled = false;
  veil.renderOrder = -999;
  veil.visible = false;
  scene.add(veil);

  // ---- The rack: two black anodised rails with etched text ---------------------
  const anodised = new THREE.MeshStandardMaterial({ color: '#0d1519', metalness: 0.65, roughness: 0.34 });
  const rack = new THREE.Group();
  scene.add(rack);
  const railBox = new THREE.BoxGeometry(1, 1, 1);
  const topRail = new THREE.Mesh(railBox, anodised);
  const lipRail = new THREE.Mesh(railBox, anodised);
  rack.add(topRail, lipRail);
  const railText = (w, h) => {
    const canvas = makeCanvas(w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 5;
    rack.add(mesh);
    return { canvas, tex, mesh, g: canvas.getContext?.('2d') };
  };
  // Canvases at the rail faces' aspect, so etched dots stay square.
  const HEAD_H = Math.round((1024 * (RAIL.top - 0.04)) / (RAIL.width - 0.06)),
    LIP_H = Math.round((1024 * (RAIL.lip - 0.04)) / (RAIL.width - 0.06));
  const headText = railText(1024, HEAD_H);
  const lipText = railText(1024, LIP_H);

  // ---- The syringe (the board's hero, merged to 8 draw calls) -----------------
  const part = (role) => SYRINGE.parts.find((p) => p.role === role);
  const sx = (z) => -z; // board axis z (negative = needle) -> draft +x
  const syringe = new THREE.Group();
  scene.add(syringe);
  const sGlass = reflect(new THREE.MeshStandardMaterial({ color: '#e9fbff', transparent: true, opacity: 0.42, roughness: 0.04, metalness: 0, depthWrite: false, envMapIntensity: 1.6 }));
  const sFluid = new THREE.MeshStandardMaterial({ color: PALETTE.vaccine, emissive: '#1fb8d8', emissiveIntensity: 0.6, roughness: 0.15, transparent: true, opacity: 0.85, depthWrite: false });
  const sChamber = new THREE.MeshStandardMaterial({ color: '#dff9ff', emissive: PALETTE.vaccine, emissiveIntensity: 1.2, roughness: 0.2 });
  const sPlastic = reflect(new THREE.MeshStandardMaterial({ color: '#f4f8fa', roughness: 0.3, metalness: 0, envMapIntensity: 0.8 }));
  const sSteel = reflect(new THREE.MeshStandardMaterial({ color: '#f1f6fa', roughness: 0.18, metalness: 0.9 }));
  const sRubber = new THREE.MeshStandardMaterial({ color: '#1d2a33', roughness: 0.75 });
  const sHub = new THREE.MeshStandardMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.75, roughness: 0.2, depthWrite: false });
  const barrel = part('barrel'),
    fluidP = part('fluid'),
    needleP = part('needle'),
    hubP = part('hub'),
    collar = part('finger grip'),
    rod = part('plunger rod'),
    thumb = part('thumb rest');
  const glassMesh = new THREE.Mesh(cylX(THREE, barrel.r, barrel.r, sx(barrel.z1), sx(barrel.z0), 28, true), sGlass);
  glassMesh.renderOrder = 3;
  const fluidMesh = new THREE.Mesh(cylX(THREE, fluidP.r, fluidP.r, 0, 1, 20), sFluid); // scaled to the fill
  fluidMesh.renderOrder = 1;
  // The dose: a small glowing core (the board's white dot), not the full
  // 0.2 u chamber, so the barrel still reads as glass around it.
  const chamber = new THREE.Mesh(new THREE.SphereGeometry(part('vaccine chamber').r * 0.6, 18, 12), sChamber);
  const tube = (collar.z1 - collar.z0) / 2;
  const fixedPlastic = new THREE.Mesh(
    mergeGeos(THREE, [
      new THREE.TorusGeometry(collar.r - tube, tube, 10, 28).rotateY(Math.PI / 2).translate(sx((collar.z0 + collar.z1) / 2), 0, 0),
      new THREE.TorusGeometry(barrel.r, 0.022, 6, 24).rotateY(Math.PI / 2).translate(sx(barrel.z0), 0, 0),
      new THREE.TorusGeometry(barrel.r, 0.022, 6, 24).rotateY(Math.PI / 2).translate(sx(barrel.z1), 0, 0),
    ]),
    sPlastic,
  );
  const plunger = new THREE.Group();
  const plungerPlastic = new THREE.Mesh(mergeGeos(THREE, [cylX(THREE, rod.r, rod.r, sx(rod.z1), sx(rod.z0), 10), cylX(THREE, thumb.r, thumb.r, sx(thumb.z1), sx(thumb.z0), 24)]), sPlastic);
  // The rubber stopper sits just inside the barrel's back end; drawn back it
  // stays inside (PLUNGER.back), pushed home it meets the dose.
  const stopperMesh = new THREE.Mesh(cylX(THREE, fluidP.r, fluidP.r, sx(fluidP.z1) + 0.02, sx(fluidP.z1) + 0.1, 20), sRubber);
  plunger.add(plungerPlastic, stopperMesh);
  const hubMesh = new THREE.Mesh(cylX(THREE, hubP.r1, hubP.r, sx(hubP.z1), sx(hubP.z0), 10), sHub);
  hubMesh.renderOrder = 3;
  const shaft = needleP.z1 - needleP.z0 - 0.12;
  const needleMesh = new THREE.Mesh(mergeGeos(THREE, [cylX(THREE, needleP.r, needleP.r, sx(needleP.z1), sx(needleP.z1) + shaft, 10), new THREE.ConeGeometry(needleP.r, 0.12, 10).rotateZ(-Math.PI / 2).translate(sx(needleP.z0) - 0.06, 0, 0)]), sSteel);
  syringe.add(glassMesh, fluidMesh, chamber, fixedPlastic, plunger, hubMesh, needleMesh);
  const barrelInner = { x0: sx(fluidP.z1), x1: sx(fluidP.z0), r: fluidP.r };

  // ---- Shared cartridge geometry (built once, at boot) -------------------------
  const geo = {
    glass: glassGeometry(THREE),
    label: labelGeometry(THREE),
    stopper: stopperGeometry(THREE),
    serum: serumGeometry(THREE, 1),
    serumDose: serumGeometry(THREE, 0.68),
    caps: Object.fromEntries(TIERS.map((t) => [t, capGeometry(THREE, TIER_LOOK[t].notches, !!TIER_LOOK[t].cap.crown)])),
    contents: Object.fromEntries(['needle', 'disc', 'antibody', 'ring', 'bubbles', 'meniscus'].map((k) => [k, contentsGeometry(THREE, k)])),
    ring: new THREE.TorusGeometry(CARTRIDGE.cap.r + 0.006, 0.02, 6, 28).rotateY(Math.PI / 2).translate(CARTRIDGE.cap.x0 + 0.045, 0, 0),
    swirl: (() => {
      const pts = [];
      const S = CARTRIDGE.serum;
      for (let i = 0; i <= 60; i++) {
        const t = i / 60,
          a = t * Math.PI * 7;
        pts.push(new THREE.Vector3(lerp(S.x0 + 0.1, S.x1 - 0.1, t), Math.cos(a) * 0.18, Math.sin(a) * 0.18));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.008, 3, false);
    })(),
  };
  // Frosted glass: a fine noise bump (one 128 px canvas, shared).
  const frostTex = (() => {
    const c = makeCanvas(128, 128);
    const g = c.getContext?.('2d');
    if (g) {
      const img = g.createImageData(128, 128);
      let seed = 7;
      for (let i = 0; i < img.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const v = 110 + ((seed >>> 16) % 90);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 2);
    return t;
  })();
  const dotTex = (() => {
    const c = makeCanvas(32, 32);
    const g = c.getContext?.('2d');
    if (g) {
      const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.35, 'rgba(255,255,255,0.7)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 32, 32);
    }
    return new THREE.CanvasTexture(c);
  })();

  const glassMaterial = (tier) => {
    const L = TIER_LOOK[tier].glass;
    const m = reflect(new THREE.MeshStandardMaterial({ color: L.color, transparent: true, opacity: L.opacity, roughness: L.roughness, metalness: 0, depthWrite: false, envMapIntensity: L.sheen }));
    if (L.frosted) {
      m.bumpMap = frostTex;
      m.bumpScale = 0.6;
    }
    // The rare reveal's cyan glint runs through the glass's emissive.
    m.emissive.set(tier === 'rare' ? '#5fe3ff' : '#000000');
    m.emissiveIntensity = 0;
    return m;
  };
  const capMaterial = (tier) => {
    const C = TIER_LOOK[tier].cap;
    return reflect(new THREE.MeshStandardMaterial({ color: C.color, metalness: C.metalness, roughness: C.roughness, envMapIntensity: 1.2 }));
  };

  // ---- Three slots, each one cartridge whose look follows the offered tier ----
  const slots = [0, 1, 2].map((i) => {
    const group = new THREE.Group(); // placement (row, lift, drop)
    const spin = new THREE.Group(); // idle yaw, the legendary spin
    group.add(spin);
    scene.add(group);
    const mats = {
      glass: Object.fromEntries(TIERS.map((t) => [t, glassMaterial(t)])),
      cap: Object.fromEntries(TIERS.map((t) => [t, capMaterial(t)])),
      // LITE (the slow-machine fallback): the same glass without reflections.
      // (No environment map, so it is a cheaper program than the full glass.)
      lite: new THREE.MeshStandardMaterial({ color: '#e9fbff', transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false }),
      serum: new THREE.MeshStandardMaterial({ color: '#59dcff', emissive: '#59dcff', emissiveIntensity: 0.25, roughness: 0.2, transparent: true, opacity: 0.86, depthWrite: false }),
      stopper: new THREE.MeshStandardMaterial({ color: '#26323b', roughness: 0.78 }),
      contents: reflect(new THREE.MeshStandardMaterial({ color: '#f2f7fa', metalness: 0.7, roughness: 0.22, emissive: '#ffffff', emissiveIntensity: 0.12 })),
      ring: reflect(new THREE.MeshStandardMaterial({ color: TIER_LOOK.rare.ring, emissive: TIER_LOOK.rare.ring, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.25 })),
      particles: new THREE.PointsMaterial({ color: '#dfe6ff', size: 0.07, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
      swirl: new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    };
    const canvas = makeCanvas(LABEL_W, LABEL_H);
    const labelTex = new THREE.CanvasTexture(canvas);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    labelTex.anisotropy = 4;
    mats.label = new THREE.MeshStandardMaterial({ map: labelTex, emissiveMap: labelTex, emissive: '#ffffff', emissiveIntensity: 0.32, roughness: 0.62, metalness: 0 });
    const glass = new THREE.Mesh(geo.glass, mats.glass.common);
    glass.renderOrder = 3;
    const cap = new THREE.Mesh(geo.caps.common, mats.cap.common);
    const stopper = new THREE.Mesh(geo.stopper, mats.stopper);
    const serum = new THREE.Mesh(geo.serum, mats.serum);
    serum.renderOrder = 1;
    const label = new THREE.Mesh(geo.label, mats.label);
    const contents = new THREE.InstancedMesh(geo.contents.needle, mats.contents, 6);
    contents.count = 1;
    contents.frustumCulled = false;
    const ring = new THREE.Mesh(geo.ring, mats.ring);
    // Epic: 24 motes suspended in the serum.
    const pg = new THREE.BufferGeometry();
    const pp = new Float32Array(TIER_LOOK.epic.particles * 3);
    for (let k = 0; k < TIER_LOOK.epic.particles; k++) {
      const a = k * 2.399,
        rr = 0.08 + ((k * 37) % 23) / 100;
      pp.set([lerp(CARTRIDGE.serum.x0 + 0.1, CARTRIDGE.serum.x1 - 0.1, ((k * 0.618) % 1 + 1) % 1), Math.cos(a) * rr, Math.sin(a) * rr], k * 3);
    }
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const particles = new THREE.Points(pg, mats.particles);
    particles.renderOrder = 2;
    const swirl = new THREE.Mesh(geo.swirl, mats.swirl);
    swirl.renderOrder = 2;
    spin.add(glass, cap, stopper, serum, label, contents, ring, particles, swirl);
    return {
      i,
      group,
      spin,
      mats,
      canvas,
      g: canvas.getContext?.('2d'),
      labelTex,
      meshes: { glass, cap, stopper, serum, label, contents, ring, particles, swirl },
      id: null,
      tier: 'common',
      line: 'NEEDLE',
      label: null,
      schedule: { start: 0, land: 0, legend: false },
      sel: 0,
      dim: 1,
      cued: {},
      out: null, // exit animation: { kind, t0 }
    };
  });
  // Focus halo behind the selected cartridge (a soft cyan glow).
  const haloTex = (() => {
    const c = makeCanvas(128, 64);
    const g = c.getContext?.('2d');
    if (g) {
      const grd = g.createRadialGradient(64, 32, 2, 64, 32, 62);
      grd.addColorStop(0, 'rgba(127,232,255,0.9)');
      grd.addColorStop(0.5, 'rgba(127,232,255,0.25)');
      grd.addColorStop(1, 'rgba(127,232,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 64);
    }
    return new THREE.CanvasTexture(c);
  })();
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.5), haloMat);
  halo.renderOrder = 0;
  scene.add(halo);
  // Legendary flourish: a gold ring that blooms behind the landing cartridge.
  const burstMat = new THREE.MeshBasicMaterial({ map: dotTex, color: '#ffd37a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const burst = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), burstMat);
  burst.renderOrder = 4;
  burst.visible = false;
  scene.add(burst);
  // DISCARD: the +1 SOAP bubble rising to the HUD.
  const bubbleMat = new THREE.MeshBasicMaterial({ map: dotTex, color: '#e8fbff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const bubble = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), bubbleMat);
  bubble.renderOrder = 6;
  bubble.visible = false;
  scene.add(bubble);

  // ---- State -----------------------------------------------------------------------
  const S = {
    active: false,
    mode: 'closed', // draft | inject | discard | return | closed
    openT: 0, // ms since the draft opened (backdrop, syringe, lamp)
    t: 0, // ms since the current offer began its reveal (reset by RESAMPLE)
    modeT: 0, // ms since the current mode started
    selected: 0,
    revealed: false,
    revealAt: 0,
    header: { left: '', right: '' },
    caption: [],
    motion: true,
    lite: false,
    autoLite: true,
    frameLog: [],
    needsBackdrop: false,
    safe: { x: 0, y: 0, w: 1, h: 1 },
    preset: 'wide',
    layout: contentLayout('wide'),
    fit: { distance: 10, pxPerU: 50 },
    viewport: { w: 1, h: 1 },
    resampleT: -1,
    inject: null, // { slot, color }
    returnFrom: null, // { pos, scale, rot } of the syringe when the return starts
    returnTo: null,
    stats: { calls: 0, triangles: 0 },
    flash: 0,
  };

  function placeCamera() {
    const w = Math.max(1, stage.clientWidth),
      h = Math.max(1, stage.clientHeight);
    S.viewport = { w, h };
    const safe = S.safe;
    S.layout = contentLayout(S.preset, safe.w / safe.h);
    S.fit = fitCamera(safe, S.layout);
    camera.aspect = safe.w / safe.h;
    camera.fov = DRAFT_FOV;
    const d = S.fit.distance;
    camera.position.set(0, d * Math.sin(DRAFT_PITCH), d * Math.cos(DRAFT_PITCH));
    camera.lookAt(0, 0, 0);
    // The safe rect is the camera's nominal frustum; the full canvas is
    // drawn around it (negative offsets), so drops from above are not cut.
    camera.setViewOffset(safe.w, safe.h, -safe.x, -safe.y, w, h);
    camera.near = Math.max(0.5, d - 8);
    camera.far = d + 12;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const L = S.layout;
    topRail.scale.set(RAIL.width, RAIL.top, RAIL.depth);
    topRail.position.set(0, L.topRail, -0.5);
    lipRail.scale.set(RAIL.width, RAIL.lip, RAIL.depth);
    lipRail.position.set(0, L.lipRail, -0.2);
    headText.mesh.scale.set(RAIL.width - 0.06, RAIL.top - 0.04, 1);
    headText.mesh.position.set(0, L.topRail, -0.5 + RAIL.depth / 2 + 0.002);
    lipText.mesh.scale.set(RAIL.width - 0.06, RAIL.lip - 0.04, 1);
    lipText.mesh.position.set(0, L.lipRail, -0.2 + RAIL.depth / 2 + 0.002);
    syringe.scale.setScalar(L.syringe.scale);
  }
  /** The safe rect (CSS px, within the stage) the content must fit. */
  function setSafeRect(r, preset) {
    S.safe = { x: r.x, y: r.y, w: Math.max(40, r.w), h: Math.max(40, r.h) };
    S.preset = preset || (S.safe.w / S.safe.h < 0.9 ? 'tall' : 'wide');
    placeCamera();
  }

  function drawLabels() {
    for (const s of slots) {
      if (s.g && s.label) paintLabel(s.g, s.label);
      s.labelTex.needsUpdate = true;
    }
  }
  function drawHeader() {
    const g = headText.g;
    if (!g) return;
    const pitch = 5;
    paintRail(g, 1024, HEAD_H, [
      { text: S.header.left, y: (HEAD_H - 7 * pitch) / 2, pitch, color: '#cfe7e4', maxW: 640 },
      { text: S.header.right, y: (HEAD_H - 7 * pitch) / 2, pitch, color: '#7fe8ff', align: 'right', maxW: 300 },
    ]);
    headText.tex.needsUpdate = true;
  }
  function drawCaption() {
    const g = lipText.g;
    if (!g) return;
    const color = { ink: '#e4f3f1', cyan: '#7fe8ff', pink: '#ff6fb2' };
    // Two rows at a 6.2 px dot pitch, or three at 4.8 (a long effect plus
    // its SYNERGY or COST line).
    const lines = S.caption.slice(0, 3);
    const pitch = lines.length > 2 ? 4.8 : 6.2,
      n = Math.max(2, lines.length),
      gap = (LIP_H - 7 * n * pitch) / (n + 1);
    const rows = lines.map((l, k) => ({ text: l.text, y: gap + k * (7 * pitch + gap), pitch, color: color[l.tone] || color.ink, maxW: 976 }));
    paintRail(g, 1024, LIP_H, rows);
    lipText.tex.needsUpdate = true;
  }

  function applyTier(s) {
    const look = TIER_LOOK[s.tier] || TIER_LOOK.common;
    const m = s.meshes;
    m.glass.material = S.lite ? s.mats.lite : s.mats.glass[s.tier];
    if (S.lite) {
      s.mats.lite.color.set(look.glass.color);
      s.mats.lite.opacity = look.glass.opacity;
      s.mats.lite.roughness = look.glass.roughness;
    }
    m.cap.geometry = geo.caps[s.tier];
    m.cap.material = s.mats.cap[s.tier];
    const line = lineKey(s.line);
    const kind = LINE_CONTENTS[line];
    m.serum.geometry = kind === 'meniscus' ? geo.serumDose : geo.serum;
    m.serum.rotation.x = 0;
    s.mats.serum.color.set(LINE_SERUM[line]);
    s.mats.serum.emissive.set(LINE_SERUM[line]);
    s.mats.serum.emissiveIntensity = look.serum;
    m.contents.geometry = geo.contents[kind];
    m.contents.count = kind === 'bubbles' ? 6 : 1;
    m.ring.visible = look.ornament === 'ring';
    m.particles.visible = look.ornament === 'particles' && !S.lite;
    m.swirl.visible = look.ornament === 'swirl' && !S.lite;
  }

  // ---- Prewarm: every program and buffer at boot ---------------------------------
  function prewarm() {
    buildEnvironment();
    setSafeRect({ x: 0, y: 0, w: stage.clientWidth || 960, h: stage.clientHeight || 640 });
    // Show one cartridge per tier (and every ornament) plus the lite glass,
    // compile, and draw once so geometry and textures are uploaded too.
    const tiers = ['rare', 'epic', 'legendary'];
    slots.forEach((s, i) => {
      s.tier = tiers[i];
      s.line = ['SOAP', 'EXPOSURE', 'DOSE'][i];
      applyTier(s);
      s.group.position.set(0, S.layout.rows[i], 0);
      s.group.visible = true;
    });
    const extra = [];
    for (const t of TIERS) {
      const g = new THREE.Mesh(geo.glass, slots[0].mats.glass[t]);
      const c = new THREE.Mesh(geo.caps[t], slots[0].mats.cap[t]);
      extra.push(g, c);
    }
    extra.push(new THREE.Mesh(geo.glass, slots[0].mats.lite));
    for (const k of Object.keys(geo.contents)) extra.push(new THREE.Mesh(geo.contents[k], slots[0].mats.contents));
    for (const e of extra) {
      e.frustumCulled = false;
      e.position.y = -50;
      scene.add(e);
    }
    veil.visible = burst.visible = bubble.visible = true;
    halo.visible = true;
    const fb = new THREE.Vector2();
    renderer.getDrawingBufferSize(fb);
    boardTex = new THREE.FramebufferTexture(Math.max(1, fb.x), Math.max(1, fb.y));
    backdropMat.uniforms.map.value = boardTex;
    amber.intensity = 0.01;
    try {
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
      renderer.copyFramebufferToTexture(boardTex);
    } catch {
      /* warm-up only */
    }
    for (const e of extra) scene.remove(e);
    veil.visible = burst.visible = bubble.visible = false;
    amber.intensity = 0;
    for (const s of slots) s.group.visible = false;
  }

  // ---- Open / resample --------------------------------------------------------------
  /** Open (or, with `resampled`, re-roll) the draft for an offer:
   * { ids, tiers, selected, header: { left, right }, caption: [{text, tone}],
   *   deck } */
  function open(data, { resampled = false } = {}) {
    S.motion = settings.effects();
    const fresh = !S.active || S.mode !== 'draft';
    if (fresh) {
      S.active = true;
      S.mode = 'draft';
      S.t = 0;
      S.openT = 0;
      S.modeT = 0;
      S.frameLog = [];
      S.needsBackdrop = true;
      S.inject = null;
      S.flash = 0;
      const ratio = Math.min(boardRatio(), 1.25);
      if (Math.abs(renderer.getPixelRatio() - ratio) > 1e-6) renderer.setPixelRatio(ratio);
      setSafeRect(S.safe, S.preset);
      for (const s of slots) s.sel = s.dim = 1;
      syringe.visible = true;
    }
    S.header = data.header || S.header;
    S.caption = data.caption || [];
    S.selected = Math.max(0, Math.min(2, data.selected ?? 0));
    const assign = () => {
      const sched = revealSchedule(data.tiers);
      slots.forEach((s, i) => {
        s.id = data.ids[i] ?? null;
        s.tier = data.tiers[i] || Cards.CARD[s.id]?.tier || 'common';
        s.line = Cards.CARD[s.id]?.line || 'NEEDLE';
        s.label = labelOf(s.id, (Cards.stacksOf?.(data.deck || [], s.id) ?? 0) + 1);
        s.label.tier = s.tier;
        s.schedule = sched[i] || { start: 0, land: 0, legend: false };
        s.cued = {};
        s.out = null;
        s.sel = 0;
        s.dim = 1;
        s.group.visible = !!s.id;
        applyTier(s);
      });
      drawLabels();
      S.revealAt = revealEnd(data.tiers);
      S.revealed = !S.motion;
      if (!S.motion) for (const s of slots) s.cued = { land: true, glint: true, wake: true, riser: true };
      if (!S.motion) for (const tier of [...new Set(data.tiers)]) cue({ type: 'reveal', tier, slot: 1 });
    };
    if (resampled && !fresh && S.motion) {
      // The old cartridges spin away (250 ms), then the new ones drop in.
      for (const s of slots) s.out = { kind: 'resample', t0: S.t };
      S.revealed = false;
      S.resampleT = S.t;
      S.pending = assign;
    } else {
      S.resampleT = -1;
      assign();
      S.t = 0;
    }
    drawHeader();
    drawCaption();
  }
  function select(i) {
    S.selected = Math.max(0, Math.min(2, i));
  }
  function setCaption(lines) {
    S.caption = lines || [];
    drawCaption();
  }
  function skipReveal() {
    if (S.revealed || S.mode !== 'draft') return false;
    if (S.pending) {
      S.pending();
      S.pending = null;
      S.resampleT = -1;
    }
    S.t = Math.max(S.t, S.revealAt);
    for (const s of slots) {
      if (!s.cued.land) cue({ type: 'reveal', tier: s.tier, slot: s.i });
      s.cued = { land: true, glint: true, wake: true, riser: true };
      s.out = null;
    }
    S.revealed = true;
    return true;
  }

  // ---- Inject / discard / close ------------------------------------------------------
  function inject(i) {
    if (!S.active) return;
    if (!S.motion) return close();
    S.mode = 'inject';
    S.modeT = 0;
    const s = slots[i];
    S.inject = { slot: i, color: new THREE.Color(LINE_SERUM[lineKey(s.line)]), from: s.group.position.clone(), fromScale: s.group.scale.x };
    S.revealed = true;
    S.caption = [];
    drawCaption();
  }
  function discard() {
    if (!S.active) return;
    if (!S.motion) return close();
    S.mode = 'discard';
    S.modeT = 0;
    for (const s of slots) s.out = { kind: 'discard', t0: 0 };
    S.caption = [];
    drawCaption();
  }
  /** Hand back to play: restores the board's pixel ratio. */
  function close() {
    if (!S.active) return;
    S.active = false;
    S.mode = 'closed';
    S.inject = null;
    for (const s of slots) s.group.visible = false;
    veil.visible = false;
    amber.intensity = 0;
    const ratio = boardRatio();
    if (Math.abs(renderer.getPixelRatio() - ratio) > 1e-6) renderer.setPixelRatio(ratio);
  }
  /** Any press after the click (360 ms) skips to play (§6.6). */
  function finish() {
    if (S.mode === 'inject' && S.modeT < TIMING.inject.click) return false;
    if (S.mode === 'inject' || S.mode === 'discard' || S.mode === 'return') {
      close();
      return true;
    }
    return false;
  }

  // ---- Animation ------------------------------------------------------------------------
  const tmpV = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();
  const unW = new THREE.Matrix4().makeTranslation(-CARTRIDGE.window.x, 0, 0);
  const dummy = new THREE.Object3D();
  function animateSlot(s, time, dt) {
    const L = S.layout;
    const sch = s.schedule;
    const motion = S.motion;
    const rowY = L.rows[s.i],
      rowZ = L.rowZ[s.i];
    let y = rowY,
      z = rowZ,
      x = 0,
      yaw = 0,
      roll = 0,
      spinRoll = 0,
      scale = 1,
      tilt = 0;
    // Drop-in from above the frame (ease-out-back, 6% overshoot).
    if (motion) {
      const top = L.height / 2 + 1.6 + s.i * 0.2;
      if (time < sch.start) y = top + 3;
      else if (sch.legend && time < sch.start + TIMING.legendaryHold) {
        // The spin-up: it falls to its own row in front of the others,
        // rolling 1.5 turns about its axis (a centrifuge), the lamp waking.
        const k = (time - sch.start) / TIMING.legendaryHold;
        y = lerp(top, rowY, easeOutCubic(k));
        z = rowZ + 0.7;
        spinRoll = k * Math.PI * 3;
      } else if (sch.legend) {
        // ...then settles back into the row with the last half turn, so it
        // lands label-forward (2 turns in all, no snap).
        const k = clamp01((time - sch.start - TIMING.legendaryHold) / TIMING.drop);
        z = lerp(rowZ + 0.7, rowZ, easeOutBack(k));
        spinRoll = Math.PI * 3 + Math.PI * easeOutCubic(k);
      } else {
        const k = clamp01((time - sch.start) / TIMING.drop);
        y = lerp(top, rowY, easeOutBack(k));
        tilt = (1 - easeOutCubic(k)) * 0.35 * (s.i % 2 ? -1 : 1);
      }
      if (time >= sch.land && !s.cued.land) {
        s.cued.land = true;
        cue({ type: 'reveal', tier: s.tier, slot: s.i });
        if (s.tier === 'legendary') {
          burst.visible = true;
          burst.userData.t0 = time;
          burst.position.set(0, rowY, rowZ - 0.3);
          S.flash = 0.22;
        }
      }
      if (sch.legend && time >= sch.start && !s.cued.riser) {
        s.cued.riser = true;
        cue({ type: 'legendary-riser' });
      }
      // Idle: yaw +-18 degrees over 4 s (1.3 s phase per slot), a 0.03 u bob.
      const idle = clamp01((time - sch.land) / 600);
      // (+-10 degrees on a phone, where the rows span the whole width.)
      const amp = S.preset === 'tall' ? 10 * DEG : TIMING.idleYaw;
      yaw += idle * amp * Math.sin(((time - s.i * TIMING.idlePhase) / TIMING.idlePeriod) * Math.PI * 2);
      y += idle * TIMING.bob * Math.sin((time / 1000) * TIMING.bobHz * Math.PI * 2 + s.i * 1.7);
    }
    // Selection: lift toward the camera and grow; the others dim to 70%.
    const want = S.mode === 'draft' && S.selected === s.i ? 1 : 0;
    const step = dt / TIMING.select;
    s.sel = motion ? (want > s.sel ? Math.min(want, s.sel + step) : Math.max(want, s.sel - step)) : want;
    const e = easeOutCubic(s.sel);
    z += SELECT.lift * e;
    scale *= lerp(1, SELECT.scale, e);
    const dimWant = S.revealed && S.mode === 'draft' && S.selected !== s.i ? SELECT.dimOthers : 1;
    s.dim = motion ? lerp(s.dim, dimWant, clamp01(dt / 120)) : dimWant;
    // Exits: resample spin-away, discard tumble, inject's others falling.
    if (s.out) {
      const k = clamp01((S.t - s.out.t0) / (s.out.kind === 'resample' ? TIMING.resample[0] : s.out.kind === 'discard' ? TIMING.discard : 300));
      if (s.out.kind === 'resample') {
        yaw += k * Math.PI;
        y += easeInCubic(k) * 2.5;
        scale *= 1 - 0.3 * k;
      } else if (s.out.kind === 'fall') {
        // Not picked: slide out of the frame sideways (alternating), behind
        // the syringe, never across it.
        const side = s.i === 0 || (s.i === 1 && S.inject?.slot === 0) ? -1 : 1;
        x += side * easeInCubic(k) * (L.width + 1.5);
        z -= k * 1.2;
        roll = side * k * 0.25;
      } else {
        // DISCARD: tip over and drop behind the syringe, into the sharps bin.
        y -= easeInCubic(k) * (L.height + 2);
        z -= k * 2.2;
        roll = k * (s.i - 1) * 0.9 + k * 0.5;
      }
    }
    const g = s.group;
    g.position.set(x, y, z);
    g.rotation.set(0, 0, roll + tilt);
    g.scale.setScalar(scale);
    s.spin.rotation.set(spinRoll, yaw, 0);
    // Dimming: scale the slot's own material colours.
    const look = TIER_LOOK[s.tier];
    const d = s.dim;
    s.mats.label.emissiveIntensity = 0.32 * d;
    s.mats.label.color.setScalar(d);
    s.mats.serum.emissiveIntensity = look.serum * d;
    const capM = s.mats.cap[s.tier];
    capM.color.set(look.cap.color).multiplyScalar(d);
    // Tier reveal accents.
    const since = time - sch.land;
    if (s.tier === 'rare') {
      const [delay, len] = TIMING.rareGlint;
      const k = motion ? clamp01((since - delay) / len) : 1;
      s.mats.ring.emissiveIntensity = (0.55 + (k > 0 && k < 1 ? Math.sin(k * Math.PI) * 2.2 : 0)) * d;
      s.mats.glass.rare.emissiveIntensity = k > 0 && k < 1 ? Math.sin(k * Math.PI) * 0.5 : 0;
    }
    if (s.tier === 'epic') {
      const wake = motion ? clamp01((since - TIMING.epicWake) / 300) : 1;
      s.mats.particles.opacity = wake * 0.9 * d;
      s.meshes.particles.rotation.x += (dt / 1000) * (0.02 / 0.15);
    }
    if (s.tier === 'legendary') {
      s.meshes.swirl.rotation.x += (dt / 1000) * 0.6;
      s.mats.swirl.opacity = (0.28 + 0.1 * Math.sin(time / 300)) * d;
    }
    // The line's contents.
    const kind = LINE_CONTENTS[lineKey(s.line)];
    const c = s.meshes.contents;
    const tt = time / 1000;
    if (kind === 'bubbles') {
      for (let k = 0; k < 6; k++) {
        const ph = (tt * 0.35 + k / 6) % 1;
        dummy.position.set(CARTRIDGE.window.x + (k - 2.5) * 0.11, lerp(-0.24, 0.24, ph), ((k * 0.37) % 0.3) - 0.15);
        dummy.scale.setScalar(0.6 + 0.6 * Math.sin(ph * Math.PI));
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        c.setMatrixAt(k, dummy.matrix);
      }
    } else {
      dummy.position.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.rotation.set(0, 0, 0);
      if (kind === 'ring' || kind === 'disc') {
        // The ring orbits the cartridge axis; the plunger tip turns about its
        // own face. Both pivot on the window centre.
        dummy.position.set(CARTRIDGE.window.x, 0, 0);
        if (kind === 'ring') dummy.rotation.set(tt * 1.2, 0, 0);
        else dummy.rotation.set(0, 0, tt * 0.5);
        dummy.updateMatrix();
        c.setMatrixAt(0, tmpM.multiplyMatrices(dummy.matrix, unW));
      } else {
        if (kind === 'needle' || kind === 'antibody') dummy.position.set(0.04 * Math.sin(tt * 0.8 + s.i), 0.03 * Math.sin(tt * 1.1), 0);
        if (kind === 'meniscus') s.meshes.serum.rotation.x = (motion ? 0.14 : 0) * Math.sin(tt * 1.6 + s.i);
        if (kind === 'meniscus') dummy.rotation.set(s.meshes.serum.rotation.x, 0, 0);
        dummy.updateMatrix();
        c.setMatrixAt(0, dummy.matrix);
      }
    }
    c.instanceMatrix.needsUpdate = true;
  }

  function animate(dtMs) {
    const dt = Math.max(0, dtMs);
    S.t += dt;
    S.openT += dt;
    S.modeT += dt;
    const motion = S.motion;
    // Resample: swap the offer once the old cartridges are gone.
    if (S.pending && S.t - S.resampleT >= TIMING.resample[0]) {
      S.pending();
      S.pending = null;
      S.resampleT = -1;
      S.t = 0;
    }
    if (!S.revealed && S.t >= S.revealAt && !S.pending) S.revealed = true;
    // Backdrop: dim to 35% and desaturate 60% over 250 ms (§6.2); the
    // inject's chamber phase gives the colour back before the return.
    const open = motion ? clamp01(S.openT / TIMING.dim) : 1;
    const dim = lerp(1, 0.35, open);
    let desat = 0.6 * open;
    if (S.mode === 'inject') desat = lerp(0.6, 0, clamp01((S.modeT - TIMING.inject.click) / (TIMING.inject.chamber - TIMING.inject.click)));
    // Lamp sweep: the key light's azimuth swings +-10 degrees over 3 s.
    const sweep = motion ? TIMING.lampSweep * Math.sin((S.openT / TIMING.lampPeriod) * Math.PI * 2) : 0;
    key.position.copy(keyBase).applyAxisAngle(UP, sweep);
    // The syringe rises into the lower third and its plunger draws back.
    const L = S.layout;
    if (S.mode === 'draft') {
      const k = motion ? easeOutCubic(S.openT / TIMING.syringeRise) : 1;
      syringe.position.set(0, lerp(L.syringe.y - 2.4, L.syringe.y, k), 0.1);
      syringe.rotation.set(0.25, 0, 0);
      syringe.scale.setScalar(L.syringe.scale);
      plunger.position.x = PLUNGER.back * k;
      fluidFill(0.22, null);
      sChamber.emissiveIntensity = 1.2;
    }
    for (const s of slots) if (s.group.visible) animateSlot(s, S.t, dt);
    // Halo behind the selected one, once things have landed.
    const sel = slots[S.selected];
    halo.visible = S.mode === 'draft' && !!sel?.id;
    if (halo.visible) {
      halo.position.set(0, sel.group.position.y, sel.group.position.z - 0.55);
      haloMat.opacity = (S.revealed ? 0.5 : 0) * easeOutCubic(sel.sel);
    }
    // Legendary lamp: in the legendary cartridge's window, fading in over
    // 300 ms from its spin-up, pulsing 0.6 -> 1.0 at 1.2 Hz.
    const legend = slots.find((s) => s.group.visible && s.tier === 'legendary' && !s.out);
    if (legend && !S.lite && (S.mode === 'draft' || (S.mode === 'inject' && S.inject?.slot === legend.i))) {
      const k = motion ? clamp01((S.t - legend.schedule.start - TIMING.legendaryHold + TIMING.legendaryLight) / TIMING.legendaryLight) : 1;
      const pulse = 0.8 + 0.2 * Math.sin((S.t / 1000) * 1.2 * Math.PI * 2);
      amber.intensity = TIER_LOOK.legendary.light.intensity * k * pulse * legend.dim;
      legend.meshes.label.localToWorld(tmpV.set(CARTRIDGE.window.x, 0, 0.1));
      amber.position.copy(tmpV);
    } else amber.intensity = 0;
    // Flourish ring.
    if (burst.visible) {
      const k = clamp01((S.t - (burst.userData.t0 ?? 0)) / 700);
      burst.scale.set(lerp(1, 6.5, easeOutCubic(k)), lerp(0.4, 2.2, easeOutCubic(k)), 1);
      burstMat.opacity = (1 - k) * 0.85;
      if (k >= 1) burst.visible = false;
    }
    S.flash = Math.max(0, S.flash - dt / 900);
    if (S.mode === 'inject') animateInject();
    if (S.mode === 'discard') animateDiscard();
    if (S.mode === 'return') animateReturn();
    backdropMat.uniforms.dim.value = dim;
    backdropMat.uniforms.desat.value = desat;
    backdropMat.uniforms.flash.value = S.flash;
  }
  function fluidFill(level, color) {
    // The barrel's vaccine from the needle end: `level` of the bore.
    const len = (barrelInner.x1 - barrelInner.x0) * Math.max(0.02, level);
    fluidMesh.scale.set(len, 1, 1);
    fluidMesh.position.x = barrelInner.x1 - len;
    if (color) {
      sFluid.color.copy(color);
      sFluid.emissive.copy(color);
    } else {
      sFluid.color.set(PALETTE.vaccine);
      sFluid.emissive.set('#1fb8d8');
      sChamber.emissive.set(PALETTE.vaccine);
    }
  }
  function animateInject() {
    const T = TIMING.inject,
      t = S.modeT,
      inj = S.inject,
      s = slots[inj.slot];
    const L = S.layout;
    // 0-300 ms: the cartridge arcs into the barrel and shrinks to fit it.
    const k = easeInOut(t / T.seat);
    const sp = syringe.position;
    const S0 = L.syringe.scale;
    const fit = ((barrelInner.x1 - barrelInner.x0) * S0) / CARTRIDGE_LENGTH;
    const target = tmpV.set(sp.x + ((barrelInner.x0 + barrelInner.x1) / 2) * S0, sp.y, sp.z + 0.05);
    const mid = new THREE.Vector3((inj.from.x + target.x) / 2, Math.max(inj.from.y, target.y) + 0.6, inj.from.z + 0.9);
    const a = inj.from,
      b = target;
    const q = (u, p0, p1, p2) => (1 - u) * (1 - u) * p0 + 2 * (1 - u) * u * p1 + u * u * p2;
    s.group.position.set(q(k, a.x, mid.x, b.x), q(k, a.y, mid.y, b.y), q(k, a.z, mid.z, b.z));
    const shrink = t < T.click ? lerp(inj.fromScale, fit, k) : lerp(fit, 0, clamp01((t - T.click) / (T.chamber - T.click)));
    s.group.scale.setScalar(Math.max(0.0001, shrink));
    s.group.rotation.set(0, 0, 0);
    s.spin.rotation.set(0, lerp(s.spin.rotation.y, 0, k), 0);
    s.dim = 1;
    // 300 ms: seat with a click; the plunger pushes home 360-700 ms while the
    // serum colour runs into the barrel and the vaccine chamber.
    if (t >= T.seat && !s.cued.seat) {
      s.cued.seat = true;
      cue({ type: 'reveal', tier: 'common', slot: 1 });
    }
    const run = clamp01((t - T.click) / (T.chamber - T.click));
    plunger.position.x = lerp(PLUNGER.back, PLUNGER.home, easeOutCubic(run));
    fluidFill(lerp(0.22, 0.96, easeOutCubic(run)), run > 0 ? new THREE.Color(PALETTE.vaccine).lerp(inj.color, run) : null);
    if (run > 0) {
      sChamber.emissive.copy(new THREE.Color(PALETTE.vaccine).lerp(inj.color, run));
      sChamber.emissiveIntensity = 1.2 + Math.sin(run * Math.PI) * 1.4;
    }
    // The other cartridges fall out of frame from the click.
    for (const o of slots) if (o !== s && !o.out && t >= T.click) o.out = { kind: 'fall', t0: S.t };
    if (t >= T.chamber) startReturn();
  }
  function animateDiscard() {
    const t = S.modeT;
    // SOAP +1: a bubble rises from the syringe toward the top of the frame.
    bubble.visible = true;
    const k = clamp01(t / (TIMING.discard + TIMING.discardReturn));
    bubble.position.set(lerp(0, -1.2, k), lerp(S.layout.syringe.y, S.layout.height / 2 + 0.8, easeInOut(k)), 0.6);
    bubble.scale.setScalar(lerp(0.6, 1.2, Math.sin(k * Math.PI)));
    bubbleMat.opacity = Math.sin(k * Math.PI) * 0.9;
    if (t >= TIMING.discard) startReturn();
  }
  function startReturn() {
    S.mode = 'return';
    S.modeT = 0;
    S.returnFrom = { pos: syringe.position.clone(), scale: syringe.scale.x, rotZ: syringe.rotation.z, rotX: syringe.rotation.x };
    S.returnTo = null;
    const b = boardSyringe();
    if (b && Number.isFinite(b.x)) {
      // Where the board syringe sits, on the content plane, and its size.
      const ndc = new THREE.Vector2((b.x / S.viewport.w) * 2 - 1, -(b.y / S.viewport.h) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)) {
        const len = SYRINGE.parts.reduce((m, p) => Math.max(m, -p.z0), 0) + SYRINGE.parts.reduce((m, p) => Math.max(m, p.z1), 0);
        S.returnTo = { pos: hit, scale: Math.max(0.05, b.lengthPx / S.fit.pxPerU / len) };
      }
    }
    for (const s of slots) s.group.visible = false;
    bubble.visible = false;
  }
  function animateReturn() {
    const T = TIMING.inject;
    const dur = S.inject ? T.resume - T.chamber : TIMING.discardReturn;
    const k = easeInOut(S.modeT / dur);
    veilMat.uniforms.alpha.value = 0.65 * (1 - k);
    const f = S.returnFrom,
      to = S.returnTo;
    if (to && S.inject) {
      syringe.position.lerpVectors(f.pos, to.pos, k);
      syringe.scale.setScalar(lerp(f.scale, to.scale, k));
      syringe.rotation.set(lerp(f.rotX, 0, k), 0, lerp(f.rotZ, Math.PI / 2, k));
      syringe.visible = k < 0.98;
    } else syringe.visible = false;
    if (S.modeT >= dur) close();
  }

  // ---- Render ---------------------------------------------------------------------------
  /** True when the caller must draw the board this frame first: the open
   * frame (to capture it), after a resize, and while returning to play. */
  const wantsBoard = () => S.active && (S.needsBackdrop || S.mode === 'return');
  /** One draft frame. `boardDrawn`: the board was rendered into the
   * framebuffer this frame (capture it, or draw over it when returning). */
  function frame(dtMs, { boardDrawn = false } = {}) {
    if (!S.active) return;
    const fb = new THREE.Vector2();
    if (S.needsBackdrop && boardDrawn) {
      renderer.getDrawingBufferSize(fb);
      if (!boardTex || boardTex.image.width !== fb.x || boardTex.image.height !== fb.y) {
        boardTex?.dispose();
        boardTex = new THREE.FramebufferTexture(fb.x, fb.y);
        backdropMat.uniforms.map.value = boardTex;
      }
      renderer.copyFramebufferToTexture(boardTex);
      S.needsBackdrop = false;
    }
    animate(dtMs);
    if (!S.active) return; // the animation closed the draft
    const returning = S.mode === 'return';
    backdrop.visible = !returning;
    veil.visible = returning;
    rack.visible = S.mode === 'draft' || S.mode === 'discard' || (S.mode === 'inject' && S.modeT < TIMING.inject.chamber);
    const auto = renderer.autoClear;
    if (returning) {
      renderer.autoClear = false;
      renderer.clearDepth();
    }
    renderer.render(scene, camera);
    renderer.autoClear = auto;
    S.stats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    // LITE: if the first 30 frames' median exceeds 28 ms, drop the costly
    // parts (glass reflections, motes, swirl, the lamp) for the rest of the run.
    if (S.autoLite && !S.lite && S.mode === 'draft' && dtMs > 0 && S.frameLog.length < 31) {
      S.frameLog.push(dtMs);
      if (S.frameLog.length === 31) {
        const sorted = S.frameLog.slice(1).sort((a, b) => a - b);
        if (sorted[15] > 28) setLite(true, { auto: true });
      }
    }
  }
  /** LITE on or off by hand (QA, or a setting); this also stops the
   * automatic switch for the rest of the session. */
  function setLite(on, { auto = false } = {}) {
    if (!auto) S.autoLite = false;
    S.lite = !!on;
    for (const s of slots) if (s.id) applyTier(s);
  }
  /** QA: the GPU cost of one draft frame, drawn `n` times, each followed by
   * a 1-pixel read so SwiftShader completes it (independent of rAF
   * scheduling on a busy machine). */
  function bench(n = 30) {
    if (!S.active) return null;
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      renderer.render(scene, camera);
      // A 1-pixel read waits for the GPU process to finish the frame
      // (gl.finish() returns early in Chrome).
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out.push(performance.now() - t0);
    }
    return out;
  }
  function resize() {
    if (!S.active) return;
    placeCamera();
    S.needsBackdrop = true;
  }

  // ---- Picking and QA ---------------------------------------------------------------------
  const box = new THREE.Box3();
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  function rectOf(object) {
    object.updateMatrixWorld(true);
    box.setFromObject(object, false);
    if (box.isEmpty()) return null;
    let i = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners[i++].set(x, y, z);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const c of corners) {
      c.project(camera);
      const px = ((c.x + 1) / 2) * S.viewport.w,
        py = ((1 - c.y) / 2) * S.viewport.h;
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      y1 = Math.max(y1, py);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  /** Slot under a stage point (CSS px), with a 12% margin (§6.7), or -1. */
  function hit(px, py) {
    if (!S.active || S.mode !== 'draft') return -1;
    let best = -1,
      bestD = Infinity;
    for (const s of slots) {
      if (!s.id || !s.group.visible || s.out) continue;
      const r = rectOf(s.spin);
      if (!r) continue;
      const mx = r.w * 0.12,
        my = r.h * 0.12;
      if (px >= r.x - mx && px <= r.x + r.w + mx && py >= r.y - my && py <= r.y + r.h + my) {
        const d = Math.hypot(px - (r.x + r.w / 2), py - (r.y + r.h / 2));
        if (d < bestD) [best, bestD] = [s.i, d];
      }
    }
    return best;
  }
  /** Projected cap height (px) of a label line, measured on the real
   * cylinder: the name's top and bottom dot rows at the label's centre. */
  function capPx(s, band) {
    const R = CARTRIDGE.radius + CARTRIDGE.label.lift;
    const xc = (CARTRIDGE.label.x0 + CARTRIDGE.label.x1) / 2;
    const p = (a) => {
      s.meshes.label.localToWorld(tmpV.set(xc, R * Math.sin(a), R * Math.cos(a)));
      tmpV.project(camera);
      return ((1 - tmpV.y) / 2) * S.viewport.h;
    };
    return Math.abs(p(band[0]) - p(band[1]));
  }
  function info() {
    const lay = (s) => (s.label ? labelLayout(s.label) : null);
    return {
      open: S.active,
      mode: S.mode,
      busy: S.mode !== 'draft' || !!S.pending,
      lite: S.lite,
      revealed: S.revealed,
      selected: S.selected,
      motion: S.motion,
      preset: S.preset,
      safe: { ...S.safe },
      pxPerU: S.fit.pxPerU,
      pixelRatio: renderer.getPixelRatio(),
      header: { ...S.header },
      caption: S.caption.map((l) => l.text),
      renderer: { ...S.stats },
      cartridges: slots
        .filter((s) => s.id)
        .map((s) => {
          // The tier's own (full-quality) materials; `lite` says what is drawn.
          const g = s.mats.glass[s.tier],
            c = s.mats.cap[s.tier],
            l = lay(s);
          return {
            slot: s.i,
            id: s.id,
            tier: s.tier,
            line: s.line,
            label: { ...s.label },
            text: `${s.label.name} ${s.label.stat}`.trim(),
            rect: s.group.visible ? rectOf(s.spin) : null,
            nameCapPx: l ? capPx(s, [l.name.a0, l.name.a1]) : 0,
            statCapPx: l ? capPx(s, [l.stat.a0, l.stat.a1]) : 0,
            // The trade-off's pink COST line (0 when the card has none).
            costCapPx: l?.foot ? capPx(s, [l.foot.a0, l.foot.a1]) : 0,
            nameFits: l ? l.name.width <= l.len : false,
            selected: S.selected === s.i,
            glassInUse: S.lite ? 'lite' : 'full',
            materials: {
              glass: { type: g.type, color: `#${g.color.getHexString()}`, opacity: g.opacity, roughness: g.roughness, sheen: g.envMapIntensity, reflects: !!g.envMap, bump: !!g.bumpMap },
              cap: { color: `#${new THREE.Color(TIER_LOOK[s.tier].cap.color).getHexString()}`, metalness: c.metalness, roughness: c.roughness, crown: !!TIER_LOOK[s.tier].cap.crown },
              serum: { color: `#${s.mats.serum.color.getHexString()}`, emissiveIntensity: TIER_LOOK[s.tier].serum },
              notches: TIER_LOOK[s.tier].notches,
              ornament: TIER_LOOK[s.tier].ornament,
            },
          };
        }),
    };
  }
  /** QA: render now and measure each cartridge's pixels (luminance 5% / 95%
   * means and the mean colour), read in the same task as the render. */
  function probe() {
    if (!S.active) return null;
    frame(0);
    const gl = renderer.getContext();
    const ratio = renderer.getPixelRatio();
    const fbH = gl.drawingBufferHeight;
    return slots
      .filter((s) => s.id && s.group.visible)
      .map((s) => {
        const r = rectOf(s.spin);
        const x = Math.max(0, Math.floor(r.x * ratio)),
          y = Math.max(0, Math.floor(fbH - (r.y + r.h) * ratio)),
          w = Math.max(1, Math.floor(r.w * ratio)),
          h = Math.max(1, Math.floor(r.h * ratio));
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const lum = [];
        let rr = 0,
          gg = 0,
          bb = 0;
        for (let i = 0; i < px.length; i += 4) {
          lum.push(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
          rr += px[i];
          gg += px[i + 1];
          bb += px[i + 2];
        }
        lum.sort((a, b) => a - b);
        const n = lum.length,
          k = Math.max(1, Math.floor(n * 0.05));
        const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
        return { slot: s.i, tier: s.tier, dark: mean(lum.slice(0, k)), bright: mean(lum.slice(n - k)), color: [rr / (n || 1), gg / (n || 1), bb / (n || 1)] };
      });
  }

  return {
    scene,
    camera,
    /** Dev-only handles for profiling (tests/browser/draft-3d.mjs never
     * changes them). */
    parts: () => ({ backdrop, rack, syringe, halo, amber, slots: slots.map((s) => s.meshes), key, rim }),
    prewarm,
    open,
    select,
    setCaption,
    skipReveal,
    inject,
    discard,
    close,
    finish,
    frame,
    resize,
    setSafeRect,
    setLite,
    hit,
    info,
    probe,
    bench,
    wantsBoard,
    get active() {
      return S.active;
    },
    get mode() {
      return S.mode;
    },
    /** Play is held (the model does not simulate) while a pick or a discard
     * animates; the stage it began starts when this turns false. */
    get holding() {
      return S.active && (S.mode === 'inject' || S.mode === 'discard' || S.mode === 'return');
    },
    get revealed() {
      return S.revealed;
    },
    get busy() {
      return S.mode !== 'draft' || !!S.pending;
    },
  };
}
