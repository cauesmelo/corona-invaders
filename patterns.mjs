/** Data-driven bullet emitters: the 12 pattern families of the brief
 * (RESEARCH_BULLET_HELL.md 5.2). Enemies and bosses never fire bullets
 * directly; they start an emitter, which always telegraphs first.
 *
 * An emitter lives in `s.emitters`: telegraph (`tele`) -> emission (`fire`) ->
 * `done`. Its origin follows its owner; if the owner dies during the telegraph
 * the attack is cancelled (a cured virus never fires).
 *
 * Fairness invariants (tests/patterns.test.mjs):
 *   - every preset has a minimum telegraph (0.5 s small aimed, 0.8 s fans,
 *     1.0 s walls, 1.5 s beams; card starts add 1.5 s in bosses.mjs);
 *   - every authored parameter sits inside LIMITS;
 *   - fans and rings keep >= 0.5 u clear between neighbours 10 u from the
 *     source; walls keep >= 2.0 u gaps (2.8 u on Easy);
 *   - at most 2 pattern families are live at once on Normal (1 on Easy) and
 *     never two aimed families together (gateAllows);
 *   - no bullet spawns within 2.5 u of the core (bullets.mjs).
 */
import { RULES, clamp, random, nextId, pushEvent, aimAngle, diff } from './core.mjs';
import { spawnBullet, FAMILIES } from './bullets.mjs';

const DEG = Math.PI / 180;

/** Allowed parameter ranges per preset (Normal values; Easy scales count and
 * speed down from these, never up). Units: n bullets, speed u/s, angles in
 * degrees, times in s, widths in u. */
export const LIMITS = Object.freeze({
  cough: { tele: 0.5, n: [1, 3], speed: [5, 9], spread: [0, 30], minGap: 0.5 },
  // RAIN: one droplet per singer, straight down (a static lane).
  rain: { tele: 0.5, n: [1, 1], speed: [4, 5.5] },
  sneeze: { tele: 0.8, n: [7, 11], odd: true, spread: [50, 70], speed: [4, 7], reps: [1, 3], repGap: [0.3, 0.6], minGap: 0.5 },
  sniffle: { tele: 0.8, n: [6, 10], even: true, spread: [40, 60], speed: [4, 6.5], minGap: 0.5 },
  ring: { tele: 0.8, n: [6, 24], speed: [2.5, 5], interval: [0.8, 1.5], reps: [1, 12], gaps: [0, 2], minGap: 0.5 },
  bloom: { tele: 0.8, n: [6, 12], speed: [3.5, 5], interval: [0.2, 0.4], rotate: [7, 13], duration: [1, 30], minGap: 0.5 },
  drip: { tele: 0.5, n: [6, 12], speed: [7, 9], interval: [0.08, 0.08] },
  wall: { tele: 1, gaps: [1, 2], gapWidth: [2, 4], speed: [3, 4] },
  aerosol: { tele: 0.8, rate: [1, 8], cone: [20, 120], speed: [2.5, 4.5], duration: [0.5, 30] },
  // A beam is instant once live, so its lane telegraph is the whole warning:
  // 1.5 s (the movement rubric's threat lead; 1.0 s used to be the only
  // threat in the game shown less than 1.5 s ahead).
  jet: { tele: 1.5, width: [1.6, 2.4], live: [0.5, 0.5] },
  strand: { tele: 0.8, n: [6, 16], speed: [4, 6], amp: [0.6, 1.2], wavelength: [4, 6], interval: [0.1, 0.16] },
  // Splits at most once per second (FAIR-150 rule 4), after a 0.3 s flash.
  replicate: { tele: 0.8, n: [1, 6], speed: [3, 4], maxGen: [1, 3], splitAngle: [25, 25], splitEvery: [1, 2] },
  quarantine: { tele: 1, half: [3.5, 3.5], duration: [5, 20] },
});

const lerpRange = (r, k) => r[0] + (r[1] - r[0]) * k;

/** Easy scaling: x0.6 bullets per emitter (keeping a fan's odd/even parity so
 * the trap/escape shape survives), x0.85 speed. */
function scaleCount(n, k, parity) {
  if (k >= 1) return n;
  let m = Math.max(1, Math.round(n * k));
  if (parity === 'odd' && m % 2 === 0) m += 1;
  if (parity === 'even' && m % 2 === 1) m += 1;
  return m;
}

/** World 4 MUTATION twist: a mutated enemy upgrades its pattern one tier
 * (for example COUGH x1 -> x3), clamped to LIMITS so fairness still holds. */
export function upgradeParams(preset, params, tier = 0) {
  if (!tier) return params;
  const L = LIMITS[preset],
    p = { ...params };
  if (preset === 'cough') p.n = clamp((p.n ?? 1) + 2 * tier, 1, 3);
  else if (preset === 'sneeze') p.n = clamp((p.n ?? 7) + 2 * tier, 7, 11);
  else if (preset === 'sniffle') p.n = clamp((p.n ?? 6) + 2 * tier, 6, 10);
  else if (preset === 'ring') p.n = clamp((p.n ?? 12) + 4 * tier, 12, 24);
  else if (preset === 'drip') p.n = clamp((p.n ?? 6) + 3 * tier, 6, 12);
  else if (preset === 'aerosol') p.rate = clamp((p.rate ?? 4) + 2 * tier, 1, 8);
  else if (preset === 'strand') p.n = clamp((p.n ?? 8) + 3 * tier, 6, 16);
  else if (L.n) p.n = clamp((p.n ?? L.n[0]) + tier, L.n[0], L.n[1]);
  return p;
}

/** Live emitters count by pattern family. */
export function liveFamilies(s) {
  const set = new Set();
  // The QUARANTINE box is a set piece (soft walls), not a bullet family.
  for (const em of s.emitters) if (em.state !== 'done' && em.preset !== 'quarantine') set.add(FAMILY_OF[em.preset] || em.preset);
  return set;
}
/** RAIN is the choir's second verse of the COUGH family: lanes and aimed
 * coughs from one formation count as one family for the overlap gate (so a
 * choir singing both never locks a BLOOM or a splash ring out). */
const FAMILY_OF = { rain: 'cough' };
/** Overlap gate: a new family may start only while fewer than 2 (Easy: 1)
 * families are live, and never next to another aimed family. A family that is
 * already live may be joined (a choir of WILD TYPEs coughing together). */
export function gateAllows(s, preset) {
  const set = liveFamilies(s);
  if (set.has(FAMILY_OF[preset] || preset)) return true;
  if (set.size >= diff(s).overlap) return false;
  if (PRESETS[preset].aimed) for (const p of set) if (PRESETS[p].aimed) return false;
  return true;
}

const owner = (s, em) => (em.ownerId ? s.enemies.find((e) => e.id === em.ownerId && e.alive) : null);
function origin(s, em) {
  const o = owner(s, em);
  if (o) {
    em.x = o.x + (em.dx || 0);
    em.z = o.z + (em.dz || 0);
  }
  return o;
}
const shipAngle = (s, em) => aimAngle(em.x, em.z, s.ship.x, s.ship.z);
function bullet(s, em, angle, speed, extra = {}) {
  // Spawn on the body edge in the travel direction, so nothing appears inside
  // a virus and point-blank shots still respect the exclusion circle.
  const r = em.spawnRadius ?? 0;
  return spawnBullet(s, {
    x: em.x + Math.sin(angle) * r,
    z: em.z + Math.cos(angle) * r,
    angle,
    speed: speed * em.speedScale,
    family: em.family,
    src: em.src,
    pattern: em.label,
    boss: em.boss,
    owner: em.ownerId,
    // Grammar tag (RESEARCH_V1.md 3.1) and the warning it had: the suite
    // audit sums bullets by grammar and checks FAIR-150's lead time.
    gram: em.grammar,
    tele: em.tele,
    // A fan (several angles) vs a single, stack or stream: the speed band
    // differs (aimed fans <= 7 u/s; singles and stacks may reach the max).
    fan: em.fan,
    ...extra,
  });
}
/** A preset's grammar for one emission: 'aimed' (forces movement), 'static'
 * (shapes it) or 'random'. Fixed-angle fans and owner-lane jets are static. */
function grammarOf(preset, p) {
  if (preset === 'rain' || preset === 'ring' || preset === 'bloom' || preset === 'wall') return 'static';
  if (preset === 'aerosol') return 'random';
  if (preset === 'strand') return p.aimShip ? 'aimed' : 'static';
  if (preset === 'replicate') return p.aimShip === false ? 'static' : 'aimed';
  if (preset === 'sneeze' && p.angle !== undefined) return 'static';
  if (preset === 'jet') return p.at === 'ship' ? 'aimed' : 'static';
  return 'aimed';
}

/** Pattern presets. `start` runs at telegraph start (aim locks here), `tick`
 * during emission; a preset sets `em.state = 'done'` when finished. */
export const PRESETS = Object.freeze({
  // 1 COUGH: 1-3 droplets on one line (a speed stack). Aim locks when the
  // telegraph starts, so a single >= 0.6 u sidestep dodges the whole stack.
  cough: {
    family: 'droplet',
    aimed: true,
    label: 'COUGH',
    defaults: { n: 1, speed: 7 },
    start(s, em) {
      em.aim = shipAngle(s, em);
    },
    tick(s, em) {
      // spread 0: a speed stack on one line; spread > 0: a narrow aimed fan.
      const step = em.n > 1 && em.p.spread ? (em.p.spread * DEG) / (em.n - 1) : 0;
      for (let i = 0; i < em.n; i++) {
        const k = i - (em.n - 1) / 2;
        bullet(s, em, em.aim + k * step, step ? em.p.speed : em.p.speed * (1 - 0.13 * i));
      }
      em.state = 'done';
    },
  },
  // RAIN: the choir's straight-down verse. Angle 0, so only the CURRENT
  // drifts it; a front-of-column singer makes one static lane.
  rain: {
    family: 'droplet',
    label: 'RAIN',
    defaults: { n: 1, speed: 4.5 },
    start() {},
    tick(s, em) {
      bullet(s, em, 0, em.p.speed);
      em.state = 'done';
    },
  },
  // 2 SNEEZE: an odd fan (the centre bullet points at you: sidestep out),
  // stacked in 2-3 speed tiers, optionally repeated.
  sneeze: {
    family: 'droplet',
    label: 'SNEEZE',
    parity: 'odd',
    defaults: { n: 9, spread: 60, speeds: [4, 5.5, 7], reps: 1, repGap: 0.4 },
    start(s, em) {
      em.aim = em.p.angle ?? shipAngle(s, em);
    },
    tick(s, em) {
      while (em.emitted < em.p.reps && em.t >= em.emitted * em.p.repGap) {
        const step = (em.p.spread * DEG) / Math.max(1, em.n - 1);
        for (let i = 0; i < em.n; i++)
          for (const v of em.p.speeds) bullet(s, em, em.aim + (i - (em.n - 1) / 2) * step, v);
        em.emitted++;
        pushEvent(s, 'sneeze', { x: em.x, z: em.z, owner: em.ownerId });
      }
      if (em.emitted >= em.p.reps) em.state = 'done';
    },
  },
  // 3 SNIFFLE: an even fan centred on you, so you sit in the central gap.
  sniffle: {
    family: 'droplet',
    label: 'SNIFFLE',
    parity: 'even',
    defaults: { n: 8, spread: 50, speed: 5 },
    start(s, em) {
      em.aim = shipAngle(s, em);
    },
    tick(s, em) {
      const step = (em.p.spread * DEG) / Math.max(1, em.n - 1);
      for (let i = 0; i < em.n; i++) bullet(s, em, em.aim + (i - (em.n - 1) / 2) * step, em.p.speed);
      em.state = 'done';
    },
  },
  // 4 CORONA RING: full rings with an alternating half-angle offset, so the
  // next ring's bullets fall in the previous ring's gaps.
  ring: {
    family: 'spike',
    label: 'CORONA RING',
    defaults: { n: 16, speed: 4, reps: 1, interval: 1.2, alternate: true },
    start(s, em) {
      em.base = em.p.angle ?? random(s) * Math.PI * 2;
      em.gapSeeds = [];
      for (let g = 0; g < (em.p.gaps || 0); g++) em.gapSeeds.push((g ? 0.55 : -0.55) + (random(s) - 0.5) * 0.5);
    },
    tick(s, em) {
      while (em.emitted < em.p.reps && em.t >= em.emitted * em.p.interval) {
        const step = (Math.PI * 2) / em.n;
        const offset = em.p.alternate && em.emitted % 2 ? step / 2 : 0;
        // CORONA FLARE: `gaps` openings of three missing bullets, seeded and
        // pointed into the lower half so they are reachable.
        const skip = new Set();
        for (let g = 0; g < (em.p.gaps || 0); g++) {
          const centre = Math.round(((em.gapSeeds[g] - em.base - offset) / step) % em.n + em.n) % em.n;
          for (const d of [-1, 0, 1]) skip.add((centre + d + em.n) % em.n);
        }
        for (let i = 0; i < em.n; i++) if (!skip.has(i)) bullet(s, em, em.base + offset + i * step, em.p.speed);
        em.emitted++;
        pushEvent(s, 'ring', { x: em.x, z: em.z, owner: em.ownerId });
      }
      if (em.emitted >= em.p.reps) em.state = 'done';
    },
  },
  // 5 SPIKE BLOOM: a rotating spiral; the per-emit rotation is never a divisor
  // of 360 degrees, so the arms never line up into static walls.
  bloom: {
    family: 'spike',
    label: 'SPIKE BLOOM',
    defaults: { n: 10, speed: 4.2, interval: 0.3, rotate: 11, duration: 6, dir: 1 },
    start(s, em) {
      em.base = em.p.angle ?? random(s) * Math.PI * 2;
    },
    tick(s, em) {
      while (em.t >= em.emitted * em.p.interval && em.emitted * em.p.interval < em.p.duration) {
        const step = (Math.PI * 2) / em.n;
        const a0 = em.base + em.emitted * em.p.rotate * DEG * (em.p.dir || 1);
        for (let i = 0; i < em.n; i++) bullet(s, em, a0 + i * step, em.p.speed);
        em.emitted++;
      }
      if (em.t >= em.p.duration) em.state = 'done';
    },
  },
  // 6 DRIP: an aimed stream, re-aimed every bullet. Moving steadily dodges it.
  drip: {
    family: 'droplet',
    aimed: true,
    label: 'DRIP',
    defaults: { n: 8, speed: 8, interval: 0.08 },
    start() {},
    tick(s, em) {
      while (em.emitted < em.n && em.t >= em.emitted * em.p.interval) {
        bullet(s, em, shipAngle(s, em), em.p.speed);
        em.emitted++;
      }
      if (em.emitted >= em.n) em.state = 'done';
    },
  },
  // 7 MUCUS WALL: a full-width line with 1-2 gaps >= 2.0 u (Easy 2.8 u). The
  // gaps are chosen at telegraph start and marked on the floor for >= 1.0 s.
  wall: {
    family: 'glob',
    label: 'MUCUS WALL',
    defaults: { gaps: 1, gapWidth: 2.2, speed: 3.4, z: -11 },
    start(s, em) {
      const width = Math.max(em.p.gapWidth, diff(s).wallGap);
      const centres = [];
      for (let g = 0; g < em.p.gaps; g++) {
        for (let tries = 0; tries < 20; tries++) {
          const c = -6.6 + random(s) * 13.2;
          if (centres.every((o) => Math.abs(o - c) > width + 3)) {
            centres.push(c);
            break;
          }
        }
      }
      if (!centres.length) centres.push(0);
      em.gapList = centres.map((c) => ({ x: c, width }));
      em.x = em.p.x ?? 0;
      em.z = em.p.z;
    },
    tick(s, em) {
      const f = FAMILIES[em.family];
      // Neighbour centres closer than 2 x hit + core diameter: the wall is
      // solid between gaps (no accidental slip-through lanes).
      const spacing = 2 * f.hit + 0.24;
      for (let x = -RULES.halfWidth + 0.3; x <= RULES.halfWidth - 0.3; x += spacing) {
        if (em.gapList.some((g) => Math.abs(x - g.x) < g.width / 2 + f.hit)) continue;
        spawnBullet(s, { x, z: em.z, angle: 0, speed: em.p.speed * em.speedScale, family: em.family, src: em.src, pattern: em.label, boss: em.boss, owner: em.ownerId, wall: em.id, gaps: em.gapList, gram: 'static', tele: em.tele });
      }
      em.state = 'done';
    },
  },
  // 8 AEROSOL SPRAY: seeded random angles in a cone, <= 8 bullets/s per
  // emitter. Random is used sparingly and kept slow.
  aerosol: {
    family: 'aerosol',
    label: 'AEROSOL',
    defaults: { rate: 6, cone: 120, speed: [2.5, 4.5], duration: 2, angle: 0 },
    start(s, em) {
      em.aim = em.p.aimShip ? shipAngle(s, em) : em.p.angle ?? 0;
    },
    tick(s, em) {
      const rate = em.p.rate * em.countScale;
      while (em.t >= em.emitted / rate && em.emitted / rate < em.p.duration) {
        const [lo, hi] = Array.isArray(em.p.speed) ? em.p.speed : [em.p.speed, em.p.speed];
        let a = em.aim + (random(s) - 0.5) * em.p.cone * DEG;
        // SNEEZE STORM: marked density lanes stay clear (+/-8 degrees).
        const lane = (em.p.laneAngles || []).find((l) => Math.abs(a - l) < 0.14);
        if (lane !== undefined) a = lane + Math.sign(a - lane || 1) * 0.14;
        bullet(s, em, a, lo + random(s) * (hi - lo));
        em.emitted++;
      }
      if (em.t >= em.p.duration) em.state = 'done';
    },
  },
  // 9 SNEEZE JET: a lane beam. 1.5 s telegraph glow, 0.5 s live, then rest.
  jet: {
    family: 'beam',
    label: 'SNEEZE JET',
    defaults: { width: 2, live: 0.5, at: 'owner' },
    start(s, em) {
      const xs = em.p.lanes ?? [em.p.at === 'ship' ? s.ship.x : em.x];
      em.lanes = xs.map((x) => ({ x: clamp(x, -8.6, 8.6), width: em.p.width, fromZ: em.z }));
    },
    tick(s, em) {
      if (!em.fired) {
        em.fired = true;
        for (const lane of em.lanes) s.beams.push({ id: nextId(s), ...lane, timer: em.p.live, src: em.src, pattern: em.label, owner: em.ownerId });
        pushEvent(s, 'beam', { lanes: em.lanes.map((l) => l.x) });
      }
      if (em.t >= em.p.live) em.state = 'done';
    },
  },
  // 10 RNA STRAND: bead chains on a sine (amplitude 1.2 u, wavelength 4 u).
  strand: {
    family: 'rna',
    label: 'RNA STRAND',
    defaults: { n: 10, speed: 5, amp: 1.2, wavelength: 4, interval: 0.12 },
    start(s, em) {
      em.aim = em.p.aimShip ? shipAngle(s, em) : em.p.angle ?? 0;
      em.strand = nextId(s);
    },
    tick(s, em) {
      while (em.emitted < em.n && em.t >= em.emitted * em.p.interval) {
        bullet(s, em, em.aim, em.p.speed, { sine: { amp: em.p.amp, wavelength: em.p.wavelength, phase: em.p.phase ?? 0 }, strand: em.strand, bead: em.emitted });
        em.emitted++;
      }
      if (em.emitted >= em.n) em.state = 'done';
    },
  },
  // 11 REPLICATION: a bullet flashes for 0.3 s, then splits in two at +/-25
  // degrees; at most 3 generations.
  replicate: {
    family: 'droplet',
    label: 'REPLICATION',
    defaults: { n: 3, spread: 60, speed: 3.5, maxGen: 2, splitAngle: 25, splitEvery: 1.2 },
    start(s, em) {
      em.aim = em.p.aimShip === false ? em.p.angle ?? 0 : shipAngle(s, em);
    },
    tick(s, em) {
      const step = em.n > 1 ? (em.p.spread * DEG) / (em.n - 1) : 0;
      for (let i = 0; i < em.n; i++)
        bullet(s, em, em.aim + (i - (em.n - 1) / 2) * step + (em.p.offset ?? 0) * DEG, em.p.speed, {
          gen: 0,
          maxGen: em.p.maxGen,
          splitAt: em.p.splitEvery,
          splitEvery: em.p.splitEvery,
          splitAngle: em.p.splitAngle * DEG,
        });
      em.state = 'done';
    },
  },
  // 12 QUARANTINE BOX: a cyan 7x7 u frame confines the syringe (soft walls,
  // never damage) while other patterns enter it. Set piece for OMICRON.
  quarantine: {
    family: 'box',
    label: 'QUARANTINE',
    defaults: { half: 3.5, duration: 15 },
    start(s, em) {
      const h = em.p.half;
      em.box = { x: clamp(s.ship.x, RULES.moveMinX + h, RULES.moveMaxX - h), z: clamp(s.ship.z, RULES.moveMinZ + h + 1, RULES.moveMaxZ - h), half: h };
    },
    tick(s, em) {
      s.quarantine = { ...em.box, left: Math.max(0, em.p.duration - em.t) };
      if (em.t >= em.p.duration) {
        s.quarantine = null;
        em.state = 'done';
      }
    },
  },
});
export const PRESET_NAMES = Object.freeze(Object.keys(PRESETS));

/** Start an emitter. Returns null when the overlap gate is closed (the caller
 * simply tries again later) or the owner is gone. */
export function startPattern(s, preset, { ownerId = null, x = 0, z = -6, params = {}, src = 'VIRUS', boss = false, tier = 0, force = false, label, dx = 0, dz = 0, spawnRadius = 0.4, extraTele = 0 } = {}) {
  const P = PRESETS[preset];
  if (!P) throw new Error(`Unknown pattern ${preset}`);
  if (!force && !gateAllows(s, preset)) return null;
  const d = diff(s);
  const p = { ...P.defaults, ...upgradeParams(preset, { ...P.defaults, ...params }, tier) };
  // The stage's pressure lever (levels.mjs `pressure`, set by the model at
  // stage start): a bullet-count and an aimed-speed factor that scale by
  // stage only, never by the player's deck (RESEARCH_DIFFICULTY 3.5).
  const pr = s.pressure || { count: 1, aimed: 1 };
  const grammar = grammarOf(preset, p);
  const em = {
    id: nextId(s),
    preset,
    label: label || P.label,
    family: p.family || P.family,
    ownerId,
    x,
    z,
    dx,
    dz,
    spawnRadius,
    src,
    boss,
    tier,
    p,
    n: scaleCount(p.n ?? 1, d.count * pr.count, P.parity),
    countScale: d.count * pr.count,
    speedScale: d.speed * (grammar === 'aimed' ? pr.aimed : 1),
    // Telegraph: the preset minimum (or a longer authored one) plus the Easy
    // allowance; boss card starts add their own 1.5 s on top.
    tele: Math.max(LIMITS[preset].tele, p.tele ?? 0) + d.tele + extraTele,
    state: 'tele',
    timer: 0,
    t: 0,
    emitted: 0,
    grammar,
    fan: ['sneeze', 'sniffle'].includes(preset) || ((preset === 'cough' || preset === 'replicate') && (p.n ?? 1) > 1 && (p.spread ?? 0) > 0),
  };
  em.timer = em.tele;
  if (ownerId && !origin(s, em)) return null;
  P.start(s, em);
  s.emitters.push(em);
  pushEvent(s, 'telegraph', { preset, x: em.x, z: em.z, owner: ownerId, tele: em.tele, boss });
  return em;
}

/** Advance all emitters one substep. */
export function updateEmitters(s, dt) {
  for (const em of s.emitters) {
    if (em.state === 'done') continue;
    const o = origin(s, em);
    if (em.ownerId && !o) {
      // The owner was cured: an unfired attack is cancelled, a running one stops.
      if (em.preset === 'quarantine') s.quarantine = null;
      em.state = 'done';
      continue;
    }
    if (o) o.charge = em.state === 'tele' ? Math.max(o.charge || 0, em.timer) : o.charge;
    if (em.state === 'tele') {
      em.timer -= dt;
      if (em.timer > 0) continue;
      em.state = 'fire';
      em.t = 0;
      if (o) o.charge = 0;
    } else em.t += dt;
    PRESETS[em.preset].tick(s, em, dt);
  }
  if (s.emitters.some((em) => em.state === 'done')) s.emitters = s.emitters.filter((em) => em.state !== 'done');
}

/** Stop every emitter (card change, boss defeat, death). */
export function clearEmitters(s, filter = () => true) {
  for (const em of s.emitters) if (filter(em)) {
    if (em.preset === 'quarantine') s.quarantine = null;
    em.state = 'done';
  }
  s.emitters = s.emitters.filter((em) => em.state !== 'done');
}

export const emitterBusy = (s, ownerId) => s.emitters.some((em) => em.ownerId === ownerId && em.state !== 'done');
