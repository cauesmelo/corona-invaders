/** Variant bosses and midbosses with named MUTATION cards (our spell cards).
 *
 * One VIRAL LOAD pool per boss (b.hp, shown in the HUD). Each card owns a
 * slice of it: card HP = TTK x 24 (the reference effective DPS), so boss length
 * is set by time-to-kill, never by sponge HP. A card's floor caps damage, so a
 * card can never be skipped by one burst. Each card has a timeout (normal
 * phases 30 s, cards 40 s): when it runs out the boss moves on and no
 * NEUTRALIZED bonus is paid. Survival cards (OMICRON's QUARANTINE) last a fixed
 * time and ignore damage.
 *
 * Every card start cancels the bullets on screen (they become antigen tokens),
 * clears emitters, slides in the name tape and holds 1.5 s before the first
 * pattern telegraph. During a card bosses move at most 3 u/s.
 *
 * WHO Greek-letter variant names only (no places, no people).
 */
import { RULES, clamp, random, pushEvent, requestHitstop, diff } from './core.mjs';
import { makeEnemy } from './enemies.mjs';
import { startPattern, clearEmitters } from './patterns.mjs';
import { cancelBullets } from './bullets.mjs';
import { awardKill, refreshChainFromBoss, chainMultiplier, addScore } from './scoring.mjs';

const P = (preset, params, every, o = {}) => ({ preset, params, every, ...o });
const card = (name, ttk, patterns, o = {}) => ({ name, type: 'card', ttk, patterns, ...o });
const phase = (name, ttk, patterns, o = {}) => ({ name, type: 'phase', ttk, patterns, ...o });

export const BOSSES = Object.freeze({
  // W1 tutorial boss. Its eyes narrow before each attack.
  alpha: {
    name: 'ALPHA',
    color: '#12ce5d',
    body: 'crown',
    radius: 2,
    cards: [
      phase('COUGH COUGH', 18, [P('cough', { n: 3, spread: 28, speed: 6.5 }, 1), P('ring', { n: 12, speed: 3.5, family: 'droplet' }, 2.2, { at: 0.9 })], { move: 'sway' }),
      card('FIRST SNEEZE', 22, [P('sneeze', { n: 9, spread: 60, speeds: [4, 5.5], reps: 2, repGap: 0.55, tele: 1 }, 3.8)], { move: 'sway' }),
      card('SPIKE BLOOM', 22, [P('bloom', { n: 7, interval: 0.38, rotate: 11, speed: 3.8, duration: 6 }, 7.2, { alternate: true })], { move: 'still' }),
      card('CORONA', 18, [P('ring', { n: 20, speed: 4, reps: 4, interval: 1.1, family: 'droplet' }, 5), P('cough', { n: 1, speed: 7.5 }, 2.2, { at: 1.6 })], { move: 'sway' }),
    ],
  },
  // W2 twins on one pool. ECHO's twin-nucleus rule lives on in MIRROR STRAIN.
  betagamma: {
    name: 'BETA & GAMMA',
    color: '#1fc9a4',
    color2: '#8fd23a',
    body: 'twins',
    radius: 1.45,
    cards: [
      phase('PING-PONG', 18, [P('drip', { n: 8, speed: 7.5 }, 1.4, { from: 'alt' })], { move: 'twins' }),
      card('CROSS INFECTION', 24, [P('sneeze', { n: 7, spread: 54, speeds: [4.2], angle: 0.42 }, 1.7, { from: 'B' }), P('sneeze', { n: 7, spread: 54, speeds: [4.2], angle: -0.42 }, 1.7, { from: 'G' })], { move: 'corners' }),
      // The tracker overhead lays slow rings; the aimed cough comes from the
      // mirror twin on the far side, so the aimed shot is always diagonal.
      card('MIRROR STRAIN', 24, [P('cough', { n: 3, spread: 22, speed: 6.5 }, 1.9, { from: 'B' }), P('ring', { n: 10, speed: 3.5 }, 2.3, { from: 'G', at: 0.7 })], { move: 'mirror', nucleus: 5 }),
      card('DOUBLE HELIX', 20, [P('strand', { n: 7, speed: 4.2, amp: 0.7, wavelength: 5, angle: 0.3 }, 1.8, { from: 'B' }), P('strand', { n: 7, speed: 4.2, amp: 0.7, wavelength: 5, angle: -0.3, phase: Math.PI }, 1.8, { from: 'G', at: 0.9 }), P('sniffle', { n: 6, spread: 44, speed: 4.6 }, 3.8, { from: 'near', at: 1.2 })], { move: 'orbit' }),
    ],
  },
  // W3: a delta-seamed crown that really splits in two.
  delta: {
    name: 'DELTA',
    color: '#c6e04a',
    body: 'delta',
    radius: 2,
    cards: [
      phase('TRIANGULATE', 18, [P('sniffle', { n: 6, spread: 40, speed: 5 }, 0.9, { from: 'vertex' })], { move: 'sway' }),
      card('LANE SNEEZE', 22, [P('jet', { width: 2, at: 'owner' }, 2.8), P('sneeze', { n: 7, spread: 50, speeds: [4.5, 6] }, 2.8, { at: 1.6 })], { move: 'track' }),
      card('HALVES', 24, [P('ring', { n: 14, speed: 4 }, 1.3, { from: 'alt' }), P('cough', { n: 2, speed: 7 }, 2, { from: 'near', at: 0.8 })], { move: 'halves', split: true }),
      card('BLOOD RUSH', 18, [P('wall', { gaps: 1, gapWidth: 2.4, speed: 3.2 }, 4), P('cough', { n: 1, speed: 7 }, 2.6, { from: 'near', at: 1.3 })], { move: 'halves', rush: true }),
      card('Δ CASCADE', 20, [P('replicate', { n: 3, spread: 40, speed: 3.4, maxGen: 2, splitEvery: 1.1 }, 1.7, { from: 'alt' })], { move: 'halves' }),
    ],
  },
  // W4 finale. Its "mutations" are its phases.
  omicron: {
    name: 'OMICRON PRIME',
    color: '#a8ff3c',
    body: 'omicron',
    radius: 2.2,
    cards: [
      phase(
        'SPIKE CROWN',
        // Was 35 s against a 30 s phase timeout: it could never be cleared.
        20,
        [
          P('cough', { n: 3, spread: 24, speed: 7.5 }, 1.4, { from: 'node:cough' }),
          P('ring', { n: 18, speed: 3.9, family: 'spike' }, 1.9, { from: 'node:ring', at: 0.8 }),
          P('bloom', { n: 7, interval: 0.28, rotate: 13, speed: 4, duration: 2.4 }, 3.6, { from: 'node:bloom', at: 1.6 }),
          P('drip', { n: 8, speed: 7.8 }, 2.2, { from: 'node:drip', at: 2.4 }),
        ],
        { move: 'sway', nodes: true },
      ),
      card('SNEEZE STORM', 25, [P('aerosol', { rate: 8, cone: 110, speed: [2.6, 4.4], duration: 3, lanes: 2 }, 3.2), P('cough', { n: 3, spread: 22, speed: 7 }, 1.5, { at: 1.2 })], { move: 'sway' }),
      card('MUTATION SPIRAL', 25, [P('bloom', { n: 7, interval: 0.22, rotate: 13, speed: 4.6, duration: 2.4, dir: 1 }, 3.1, { alternate: true }), P('bloom', { n: 7, interval: 0.22, rotate: 13, speed: 4.6, duration: 2.4, dir: -1 }, 3.1, { alternate: true }), P('cough', { n: 3, spread: 20, speed: 7.5 }, 1.7, { at: 0.8 })], { move: 'still' }),
      { name: 'QUARANTINE', type: 'survival', ttk: 0, duration: 15, patterns: [P('ring', { n: 20, speed: 3.8, family: 'spike' }, 1.3, { at: 1 }), P('aerosol', { rate: 6, cone: 90, speed: [2.6, 3.6], duration: 1.6 }, 2.2, { at: 1.6 })], move: 'still', quarantine: true },
      card('CORONA FLARE', 20, [P('ring', { n: 24, speed: 4.6, family: 'spike', gaps: 2 }, 1.4), P('cough', { n: 3, spread: 18, speed: 8 }, 1.2, { at: 1 })], { move: 'sway' }),
      card('R0 > 1', 25, [P('replicate', { n: 5, spread: 70, speed: 3.5, maxGen: 2, splitEvery: 1 }, 1.3), P('cough', { n: 3, spread: 16, speed: 7.5 }, 1.6, { at: 1 })], { move: 'sway', finale: true }),
    ],
  },
  // Midbosses (1-3 cards, 20-40 s total TTK).
  bigsneezer: {
    name: 'BIG SNEEZER',
    mid: true,
    color: '#12ce5d',
    body: 'sneezer',
    radius: 1.7,
    cards: [card('ACHOO!', 20, [P('sneeze', { n: 9, spread: 60, speeds: [4, 5.5], reps: 2, repGap: 0.5, tele: 1 }, 3.6), P('cough', { n: 1, speed: 6.5 }, 2, { at: 1.6 })], { move: 'sway' })],
  },
  aerosolcloud: {
    name: 'AEROSOL CLOUD',
    mid: true,
    color: '#1fc9a4',
    body: 'cloud',
    radius: 1.8,
    cards: [card('MIST', 22, [P('aerosol', { rate: 7, cone: 120, speed: [2.5, 4], duration: 2.5 }, 3.2), P('ring', { n: 12, speed: 3.5, family: 'droplet' }, 2.6, { at: 1.4 })], { move: 'sway' })],
  },
  mother: {
    name: 'MOTHER CELL',
    mid: true,
    color: '#e6e8ee',
    body: 'mother',
    radius: 2,
    cards: [
      phase('BUDDING', 12, [P('ring', { n: 8, speed: 2.8, family: 'virion' }, 2.2), P('cough', { n: 2, speed: 7 }, 1.6, { at: 0.8 })], { move: 'sway' }),
      card('LYSIS', 14, [P('replicate', { n: 4, spread: 70, speed: 3.2, maxGen: 2, splitEvery: 1.2 }, 2.4)], { move: 'sway' }),
      card('CELL BURST', 14, [P('ring', { n: 18, speed: 4, reps: 3, interval: 1, alternate: true, family: 'droplet' }, 4), P('ring', { n: 6, speed: 2.6, family: 'virion' }, 4, { at: 2, share: true })], { move: 'still' }),
    ],
  },
  lambda: {
    name: 'LAMBDA',
    mid: true,
    color: '#c6e04a',
    body: 'lambda',
    radius: 1.6,
    cards: [
      // A tracker never pairs with an aimed stream: you cannot stream past a
      // boss that follows you. Even fans (stay put) plus slow rings instead.
      phase('TRACKING', 16, [P('sniffle', { n: 8, spread: 50, speed: 5.4 }, 1.4), P('ring', { n: 14, speed: 3.8 }, 2.2, { at: 1.2 })], { move: 'track' }),
      // The jet locks on where you stood at telegraph start (not on LAMBDA's
      // own column), and LAMBDA mirrors you 3 u aside: its only damage spot is
      // never inside the beam (playtest: the hardest card in the game).
      card('MIRROR', 20, [P('jet', { width: 1.8, at: 'ship' }, 2.4), P('ring', { n: 18, speed: 4.2 }, 1.6, { at: 1.3 })], { move: 'mirror1' }),
    ],
  },
});
export const BOSS_TYPES = Object.freeze(Object.keys(BOSSES));
/** The entrance slide (s): exported for the renderer's entrance face. */
export const INTRO = 1.5;
// Seated below the reserved top band so the VIRAL LOAD bar never covers a boss.
const BOSS_Z = -7.2;

const timeoutFor = (c) => (c.type === 'survival' ? c.duration : c.type === 'phase' ? RULES.phaseTimeout : RULES.cardTimeout);
/** Card HP: TTK x reference DPS (x0.85 on Easy). */
export const cardHp = (c, hpScale = 1, dps = RULES.referenceDps) => (c.type === 'survival' ? 0 : Math.round(c.ttk * dps * hpScale * RULES.cardHpScale));

const living = (s) => s.enemies.filter((e) => e.alive && e.kind === 'boss');
export function bossPart(s, from, entry) {
  const b = s.boss;
  const parts = living(s);
  if (!b || !parts.length) return null;
  if (!from || from === 'core') return parts.find((p) => p.part === 'core') || parts[0];
  if (from === 'nucleus') return parts.find((p) => p.id === b.nucleus) || parts[0];
  if (from === 'vertex') return parts.find((p) => p.part === 'core') || parts[0];
  if (from === 'near') return parts.reduce((a, p) => (Math.abs(p.x - s.ship.x) < Math.abs(a.x - s.ship.x) ? p : a));
  if (from === 'alt') {
    entry.flip = !entry.flip;
    const pool = parts.filter((p) => p.part !== 'node');
    return pool[entry.flip ? 0 : pool.length - 1];
  }
  if (from.startsWith('node:')) return parts.find((p) => p.part === 'node' && p.tag === from.slice(5)) || null;
  return parts.find((p) => p.tag === from) || null;
}

function makePart(s, part, radius, extra = {}) {
  const primary = part === 'core' || (part === 'twin' && extra.tag === 'B') || (part === 'half' && extra.tag === 'L');
  const e = makeEnemy(s, 'wild', extra.x ?? 0, extra.z ?? BOSS_Z, {
    id: primary ? `s${s.wave}-boss` : `s${s.wave}-boss-${part}-${extra.tag ?? ''}`,
    group: -1,
    mode: 'boss',
    ...extra,
  });
  Object.assign(e, { kind: 'boss', label: s.boss.name, part, radius, half: 0, hp: extra.hp ?? s.boss.hp, maxHp: extra.maxHp ?? s.boss.maxHp });
  s.enemies.push(e);
  return e;
}

/** Create a boss or midboss. `startCard` (practice) begins at a later card. */
export function createBoss(s, type, { startCard = 0, world = 1 } = {}) {
  const def = BOSSES[type];
  const hpScale = diff(s).hp;
  const hps = def.cards.map((c) => cardHp(c, hpScale, s.dpsRef ?? RULES.referenceDps));
  const cards = def.cards.map((c, i) => ({ ...c, hp: hps[i], floor: hps.slice(i + 1).reduce((a, b) => a + b, 0), timeout: timeoutFor(c) }));
  const maxHp = hps.reduce((a, b) => a + b, 0);
  const b = {
    type,
    name: def.name,
    mid: !!def.mid,
    world,
    hp: startCard ? cards[startCard - 1].floor : maxHp,
    maxHp,
    cards,
    card: startCard,
    state: 'intro',
    timer: INTRO,
    cardTime: 0,
    capture: true,
    results: [],
    clocks: [],
    nucleus: null,
    moveT: 0,
    swapClock: 0,
    attack: cards[startCard].name,
    practiceCard: null,
  };
  s.boss = b;
  const r = def.radius;
  if (def.body === 'twins') {
    b.nucleus = makePart(s, 'twin', r, { tag: 'B', x: -4, z: BOSS_Z - 8 }).id;
    makePart(s, 'twin', r, { tag: 'G', x: 4, z: BOSS_Z - 8 });
  } else makePart(s, 'core', r, { x: 0, z: BOSS_Z - 8 });
  pushEvent(s, 'boss-enter', { boss: type, name: def.name, mid: b.mid });
  return b;
}

const smooth = (k) => k * k * (3 - 2 * k);

/** Per-card target positions; the speed cap is applied afterwards. */
function targets(s, b, parts, dt) {
  const c = b.cards[b.card];
  const t = b.moveT,
    sx = s.ship.x;
  const out = new Map();
  const core = parts.find((p) => p.part === 'core');
  const move = c?.move ?? 'sway';
  if (core) {
    let x = core.x,
      z = BOSS_Z + Math.sin(t * 0.5) * 0.4;
    if (move === 'sway') x = Math.sin(t * 0.32) * 4;
    else if (move === 'still') x = core.x * (1 - Math.min(1, dt * 0.8));
    else if (move === 'track') x = clamp(sx, -6.5, 6.5);
    else if (move === 'mirror1') {
      x = clamp(-sx, -6.5, 6.5);
      if (Math.abs(x - sx) < 3) x = clamp(sx + (sx > 0 ? -3 : 3), -6.5, 6.5);
    }
    out.set(core.id, [x, z]);
  }
  const twins = parts.filter((p) => p.part === 'twin');
  for (const p of twins) {
    const sign = p.tag === 'B' ? -1 : 1;
    let x, z;
    if (move === 'corners') [x, z] = [sign * 5.6, -8.8];
    // MIRROR STRAIN: BETA mirrors you deep in the field, GAMMA tracks you
    // closer in. Different depths keep both readable when you stand centred.
    else if (move === 'mirror') {
      // BETA never stacks on GAMMA: when you stand near the centre it holds
      // 4 u aside, so the two twins never fire down one column.
      const gx = clamp(sx, -7.5, 7.5);
      let bx = clamp(-sx, -7.5, 7.5);
      if (Math.abs(bx - gx) < 4) bx = clamp(gx + (gx > 0 ? -4 : 4), -7.5, 7.5);
      [x, z] = p.tag === 'B' ? [bx, -10.2] : [gx, -6.6];
    }
    else if (move === 'orbit') {
      const a = t * 0.9 + (sign > 0 ? Math.PI : 0);
      [x, z] = [Math.cos(a) * 2.6, BOSS_Z - 0.6 + Math.sin(a) * 1.6];
    } else [x, z] = [sign * 4 + Math.sin(t * 0.5) * 1.2, BOSS_Z + Math.sin(t * 0.7 + sign) * 0.4];
    out.set(p.id, [x, z]);
  }
  const halves = parts.filter((p) => p.part === 'half');
  if (halves.length) {
    const xr = 3.8 + Math.sin(t * 0.55) * 2.2;
    for (const h of halves) out.set(h.id, [h.tag === 'L' ? -xr : xr, BOSS_Z + Math.sin(t * 0.5) * 0.4]);
  }
  for (const n of parts.filter((p) => p.part === 'node')) {
    // Slow orbit (1 u/s at the rim): the nodes are the only targets.
    const a = (n.slot * Math.PI) / 2 + t * 0.3;
    const cx = core?.x ?? 0,
      cz = core?.z ?? BOSS_Z;
    out.set(n.id, [cx + Math.cos(a) * 3.4, cz + Math.sin(a) * 2.2]);
  }
  return out;
}

function moveBoss(s, b, dt) {
  const parts = living(s);
  const goal = targets(s, b, parts, dt);
  // The entry slide is the only fast motion; during cards the cap is 3 u/s.
  const entering = b.state === 'intro';
  const cap = entering ? 9 : RULES.bossMaxSpeed;
  for (const p of parts) {
    const g = goal.get(p.id);
    if (!g) continue;
    const ox = p.x,
      oz = p.z;
    // Nodes ride the core: they inherit its motion plus their orbit (<= 1.6 u/s).
    const limit = p.part === 'node' ? cap + 1.6 : cap;
    const dx = g[0] - p.x,
      dz = g[1] - p.z,
      d = Math.hypot(dx, dz),
      step = limit * dt;
    if (d <= step) [p.x, p.z] = g;
    else {
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
    }
    p.vx = dt ? (p.x - ox) / dt : 0;
    p.vz = dt ? (p.z - oz) / dt : 0;
  }
}

/** Card start: cancel bullets (antigen tokens), clear emitters, slide in the
 * name tape, hold 1.5 s. Part changes (split, nodes) happen here. */
function beginCard(s, b, index) {
  b.card = index;
  const c = b.cards[index];
  b.state = 'cardIntro';
  b.timer = RULES.cardIntro + diff(s).tele;
  b.cardTime = 0;
  b.capture = true;
  b.attack = c.name;
  b.clocks = c.patterns.map((p) => ({ clock: p.at ?? 0.2, em: null, flip: false, alt: false }));
  clearEmitters(s, (em) => em.boss);
  cancelBullets(s, { reason: 'card' });
  s.beams = [];
  s.quarantine = null;
  const parts = living(s);
  if (c.split && !parts.some((p) => p.part === 'half')) {
    const core = parts.find((p) => p.part === 'core');
    const x = core?.x ?? 0,
      z = core?.z ?? BOSS_Z;
    if (core) core.alive = false;
    for (const tag of ['L', 'R']) makePart(s, 'half', 1.45, { tag, x: x + (tag === 'L' ? -1.2 : 1.2), z });
    pushEvent(s, 'split', { x, z });
  }
  for (const n of parts.filter((p) => p.part === 'node')) if (!c.nodes) n.alive = false;
  if (c.nodes) {
    const core = parts.find((p) => p.part === 'core');
    const hp = Math.round(c.hp / 4);
    ['cough', 'ring', 'bloom', 'drip'].forEach((tag, slot) =>
      makePart(s, 'node', 1.05, { tag, slot, local: true, hp: slot === 3 ? c.hp - hp * 3 : hp, maxHp: hp, x: core?.x ?? 0, z: core?.z ?? BOSS_Z }),
    );
  }
  if (c.nucleus) {
    const twin = parts.find((p) => p.part === 'twin');
    b.nucleus = twin?.id ?? null;
    b.swapClock = c.nucleus;
  }
  s.twistOverride = c.rush ? { kind: 'rush' } : null;
  pushEvent(s, 'card-start', { name: c.name, index, cardType: c.type, boss: b.name, count: b.cards.length });
}

function endCard(s, b, reason) {
  const c = b.cards[b.card];
  const neutralized = reason === 'cleared' && b.capture && c.type !== 'phase';
  let bonus = 0;
  if (neutralized) {
    bonus = Math.round((b.card + 1) * 10000 * b.world * diff(s).neutralized);
    addScore(s, bonus);
  }
  b.results.push({ name: c.name, reason, neutralized, bonus, time: b.cardTime });
  b.hp = Math.min(b.hp, c.floor);
  for (const p of living(s)) if (!p.local) p.hp = b.hp;
  // A timed-out or finished card's remaining nodes are cured with it.
  if (c.nodes) for (const p of living(s)) if (p.part === 'node') p.alive = false;
  clearEmitters(s, (em) => em.boss);
  s.quarantine = null;
  s.twistOverride = null;
  pushEvent(s, 'card-end', { name: c.name, index: b.card, reason, neutralized, bonus, cardType: c.type, finale: !!c.finale });
  if (b.practiceCard !== null) {
    b.practiceDone = { name: c.name, neutralized, reason };
    defeat(s, b, null, { practice: true });
    return;
  }
  if (b.card >= b.cards.length - 1 || b.hp <= 0) defeat(s, b);
  else {
    requestHitstop(s, 0.12);
    pushEvent(s, 'phase-break', { name: b.cards[b.card + 1].name, phase: b.card + 2, boss: b.name });
    beginCard(s, b, b.card + 1);
  }
}

function defeat(s, b, part, { practice = false } = {}) {
  b.state = 'defeated';
  b.hp = 0;
  b.attack = '';
  const main = living(s)[0];
  const x = part?.x ?? main?.x ?? 0,
    z = part?.z ?? main?.z ?? BOSS_Z;
  for (const p of living(s)) p.alive = false;
  clearEmitters(s, (em) => em.boss);
  cancelBullets(s, { reason: 'defeat', filter: (bl) => bl.boss });
  s.beams = [];
  s.quarantine = null;
  s.twistOverride = null;
  if (!practice) {
    const { mult, points } = awardKill(s, b.mid ? 2000 : 5000);
    pushEvent(s, 'kill', { kind: 'boss', boss: b.type, x, z, mult, points, final: !b.mid });
  }
  requestHitstop(s, 0.2, true);
  if (!b.mid) s.slowmo = 0.8;
  pushEvent(s, 'boss-defeated', { name: b.name, x, z, mid: b.mid, boss: b.type, contained: b.cards.at(-1)?.finale && b.results.at(-1)?.neutralized });
}

function isVulnerable(s, b, p) {
  if (b.state !== 'fight') return false;
  const c = b.cards[b.card];
  if (c.type === 'survival') return false;
  if (c.nodes) return p.part === 'node';
  if (c.nucleus) return p.id === b.nucleus;
  return true;
}
export const bossVulnerable = (s, p) => !!s.boss && isVulnerable(s, s.boss, p);
/** The dormant twin of MIRROR STRAIN is intangible: needles pass through it,
 * so the glowing nucleus can always be reached. */
export const bossIntangible = (s, p) => {
  const b = s.boss;
  if (!b || b.state === 'defeated') return false;
  const c = b.cards[b.card];
  // SPIKE CROWN: the shielded core lets needles through to the nodes (a
  // core that ate every needle made the card unclearable for many players).
  if (c?.nodes) return p.part === 'core';
  if (p.part !== 'twin') return false;
  return !!c?.nucleus && p.id !== b.nucleus;
};

/** Apply damage to a boss part. Returns {blocked} so a closed plate sparks
 * rather than silently swallowing a needle. */
export function damageBoss(s, part, amount, source = 'shot') {
  const b = s.boss;
  if (!b || !part.alive || !isVulnerable(s, b, part)) {
    pushEvent(s, 'spark', { x: part.x, z: part.z + part.radius * 0.8, id: part.id });
    return { blocked: true, damage: 0 };
  }
  const c = b.cards[b.card];
  let damage = Math.min(amount, b.hp - c.floor);
  if (part.local) damage = Math.min(damage, part.hp);
  if (damage <= 0) return { blocked: true, damage: 0 };
  b.hp -= damage;
  if (part.local) part.hp -= damage;
  for (const p of living(s)) if (!p.local) p.hp = b.hp;
  refreshChainFromBoss(s);
  addScore(s, Math.round(10 * damage * chainMultiplier(s.chain.count)));
  pushEvent(s, 'hit', { kind: 'boss', part: part.part, id: part.id, x: part.x, z: part.z, damage, source });
  if (part.local && part.hp <= 0) {
    part.alive = false;
    const r = awardKill(s, 600);
    pushEvent(s, 'kill', { kind: 'boss-part', part: part.part, tag: part.tag, id: part.id, x: part.x, z: part.z, ...r });
    requestHitstop(s, 0.03);
  }
  if (b.hp <= c.floor + 1e-9) endCard(s, b, 'cleared');
  return { blocked: false, damage };
}

/** SOAP on a boss: 3% of the current card's HP, and the card is no longer
 * capturable. */
export function bombBoss(s) {
  const b = s.boss;
  if (!b || b.state === 'defeated') return;
  b.capture = false;
  const c = b.cards[b.card];
  if (b.state !== 'fight' || c.type === 'survival') return;
  const target = c.nodes ? living(s).find((p) => p.part === 'node') : living(s).find((p) => isVulnerable(s, b, p));
  if (target) damageBoss(s, target, Math.max(1, Math.ceil(c.hp * RULES.bombBossFraction)), 'soap');
}

function runPatterns(s, b, dt) {
  const c = b.cards[b.card];
  c.patterns.forEach((entry, i) => {
    const clock = b.clocks[i];
    if (clock.em && clock.em.state !== 'done') return;
    clock.clock -= dt;
    if (clock.clock > 0) return;
    const src = bossPart(s, entry.from, clock);
    if (!src) {
      clock.clock = 0.5;
      return;
    }
    let params = entry.params;
    if (entry.alternate) {
      clock.alt = !clock.alt;
      params = { ...params, dir: (params.dir || 1) * (clock.alt ? 1 : -1) };
    }
    if (entry.params.lanes) params = { ...params, laneAngles: laneAngles(s, entry.params.lanes) };
    // TRIANGULATE: fans leave the three vertices of the delta in rotation.
    let dx = 0,
      dz = 0;
    if (entry.from === 'vertex') {
      clock.vertex = ((clock.vertex ?? -1) + 1) % 3;
      [dx, dz] = [[-1.5, -0.6], [1.5, -0.6], [0, 1.3]][clock.vertex];
    }
    const em = startPattern(s, entry.preset, { ownerId: src.id, params, src: b.name, boss: true, label: c.name, spawnRadius: src.radius * (dx || dz ? 0.2 : 0.7), dx, dz });
    if (em) {
      clock.em = em;
      clock.clock = entry.every;
    } else clock.clock = 0.1;
  });
}
/** SNEEZE STORM density lanes: two seeded safe directions, at least 40
 * degrees apart, inside the lower field. */
function laneAngles(s, n) {
  const out = [];
  for (let tries = 0; out.length < n && tries < 30; tries++) {
    const a = (random(s) - 0.5) * 1.4;
    if (out.every((o) => Math.abs(o - a) > 0.7)) out.push(a);
  }
  return out;
}

export function updateBoss(s, level, dt) {
  const b = s.boss;
  if (!b || b.state === 'defeated') return;
  for (const p of living(s)) if (p.charge > 0) p.charge = Math.max(0, p.charge - dt);
  b.moveT += dt;
  moveBoss(s, b, dt);
  if (b.state === 'intro') {
    if ((b.timer -= dt) <= 0) beginCard(s, b, b.card);
    return;
  }
  // A QA fixture may set the pool directly; catch the cards up to it.
  if (b.hp <= 0) return defeat(s, b);
  const c = b.cards[b.card];
  if (b.state === 'cardIntro') {
    if ((b.timer -= dt) <= 0) {
      b.state = 'fight';
      if (c.quarantine) startPattern(s, 'quarantine', { params: { duration: c.duration }, src: b.name, boss: true, force: true, label: c.name });
    }
    return;
  }
  if (b.state !== 'fight') return;
  if (b.hp <= c.floor && c.type !== 'survival') return endCard(s, b, 'cleared');
  b.cardTime += dt;
  if (c.nucleus && (b.swapClock -= dt) <= 0) {
    b.swapClock = c.nucleus;
    const other = living(s).find((p) => p.part === 'twin' && p.id !== b.nucleus);
    if (other) {
      b.nucleus = other.id;
      pushEvent(s, 'nucleus-swap', { id: other.id, x: other.x, z: other.z });
    }
  }
  if (b.cardTime >= c.timeout) return endCard(s, b, c.type === 'survival' ? 'cleared' : 'timeout');
  runPatterns(s, b, dt);
}

/** Survival cards and captures need to know when the player was hit/bombed. */
export function voidCapture(s) {
  if (s.boss && s.boss.state !== 'defeated') s.boss.capture = false;
}

/** HUD data: the real pool, card notches, local parts and the card tape. */
export function bossStatus(s) {
  const b = s.boss;
  if (!b || b.state === 'defeated') return null;
  const c = b.cards[b.card];
  const parts = s.enemies.filter((e) => e.kind === 'boss' && e.local);
  // The displayed phase is the notch the pool has crossed (it already shows
  // the incoming card while a QA fixture or a card break moves the pool).
  const shown = Math.min(b.cards.length, 1 + b.cards.filter((k, i) => i < b.cards.length - 1 && b.hp <= k.floor).length);
  return {
    id: b.type,
    name: b.name,
    mid: b.mid,
    hp: Math.max(0, Math.round(b.hp)),
    maxHp: b.maxHp,
    phase: Math.max(shown, b.card + 1),
    phases: b.cards.length,
    phaseName: c.name,
    attack: c.name,
    cardType: c.type,
    cardIndex: b.card,
    timeLeft: Math.max(0, c.timeout - b.cardTime),
    capture: b.capture,
    notches: b.cards.slice(0, -1).map((k) => k.floor / b.maxHp),
    parts: parts.map((p) => ({ id: p.id, label: p.tag ?? p.part, part: p.part, hp: Math.max(0, p.hp), maxHp: p.maxHp, alive: p.alive })),
    state: b.state,
    nucleus: b.nucleus,
    results: b.results,
  };
}
