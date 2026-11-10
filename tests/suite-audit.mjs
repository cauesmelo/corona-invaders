/** The suite audit (RESEARCH_V1.md 1.1 and 7 T3/T4/T7), committed so the
 * ladders can be re-measured: `node tests/suite-audit.mjs [seeds]` prints the
 * table; tests/suite.test.mjs asserts on it.
 *
 * Each stage runs from its tray entry with the real update(), driven by
 * tests/reactive.mjs (150 ms perception lag, 100 ms decisions, straight-line
 * extrapolation, one committed direction, no SOAP) and 99 vials, so every
 * stage runs to its end. The syringe is the reference syringe: the stage's
 * guaranteed power, no cards. Measured per stage and seed:
 *   time     seconds to clear
 *   peak     most bullets alive at once; mean alive (sampled every 0.1 s)
 *   spawn    bullets spawned per second, and the mix by grammar tag
 *            (patterns.mjs: aimed / static / random)
 *   speed    median and max spawn speed; max per grammar band (static,
 *            aimed fans, everything) and the max effective speed (BREATH x1.3
 *            plus CURRENT drift)
 *   quiet    share of samples with at most 3 bullets alive
 *   lull     the longest stretch with no bullet alive (an empty screen),
 *            outside the first 4 s, boss entrances and card holds
 *   restGap  the longest stretch without a rest (>= 2.5 s with <= 3 alive)
 *   near     bullets within 3 u of the core per 0.1 s sample (pressure)
 *   hits     vials lost
 *   forced   hits the perfect-information autopilot could not avoid either,
 *            replaying from a snapshot at least 0.5 s earlier, without SOAP
 *            (FAIR-150 rule 2)
 *   lead     bullets that could reach the lower 80% of the box (z >= 0)
 *            sooner than 0.6 s after their telegraph started (rule 3)
 *   phantom  bullets that overlap the drawn syringe without touching the
 *            core, for the v1.0 silhouette and the old 5.1 u one (T7)
 *   inject   injections by the referee (it must never inject)
 */
import { update, getLevel, LEVELS, snapshot, RULES } from '../model.mjs';
import { syringeOutline } from '../shapes.mjs';
import { bulletGap, colliderOf, bulletAxis, pointSegDist2 } from '../hitboxes.mjs';
import { createReactive } from './reactive.mjs';
import { chooseInput } from '../autopilot.mjs';
import { running } from './helpers.mjs';

export const AUDIT_SEEDS = Object.freeze([42, 1, 7, 3, 5, 11, 23, 99]);

/** The revision-five syringe (5.1 u along its axis at scale 1.333, tilted
 * 20 degrees), as drawn: the baseline for the phantom-overlap ratio. */
const OLD_SCALE = 1.333,
  OLD_COS = Math.cos(0.35);
export const OLD_OUTLINE = Object.freeze(
  [
    ['needle', -2.35, -1.11, 0.067],
    ['hub', -1.13, -0.83, 0.16],
    ['barrel', -0.85, 0.85, 0.327],
    ['collar', 0.74, 0.98, 0.48],
    ['rod', 0.82, 1.42, 0.085],
    ['thumb rest', 1.405, 1.475, 0.3],
  ].map(([role, z0, z1, half]) => Object.freeze({ role, z0: z0 * OLD_SCALE * OLD_COS, z1: z1 * OLD_SCALE * OLD_COS, half: half * OLD_SCALE })),
);
export const NEW_OUTLINE = Object.freeze(syringeOutline());

/** Does a bullet's solid overlap a silhouette (rectangles along the axis)? */
function overlaps(outline, b, sx, sz) {
  const { r } = colliderOf(b);
  const [ax, az, bx, bz] = bulletAxis(b);
  for (const p of outline) {
    // Distance from the bullet's capsule axis to the part's rectangle,
    // approximated by sampling the capsule axis (it is at most 0.32 u long).
    for (const k of [0, 0.5, 1]) {
      const x = ax + (bx - ax) * k - sx,
        z = az + (bz - az) * k - sz;
      const dx = Math.max(0, Math.abs(x) - p.half),
        dz = Math.max(0, p.z0 - z, z - p.z1);
      if (dx * dx + dz * dz < r * r) return true;
    }
  }
  return false;
}

const median = (a) => {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y);
  return b[Math.floor(b.length / 2)];
};
const pct = (a, q) => {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(b.length * q))];
};

/** Could the autopilot, replaying from `snap` (perfect information, no SOAP),
 * get through to `until` seconds of stage time without a core hit? */
function autopilotAvoids(snap, until) {
  const s = structuredClone(snap);
  s.health = s.lives = 99;
  for (let f = 0; f < 60 * 4 && s.waveElapsed < until && s.phase === 'playing'; f++) {
    const input = chooseInput(s, f);
    input.bomb = false;
    update(s, 1 / 60, input);
    if (s.events.some((e) => e.type === 'hit-core')) return false;
  }
  return true;
}

/** Audit one stage on one seed. */
export function auditStage(stage, seed, { maxSeconds = 300, forced = true, phase = 0 } = {}) {
  const s = running(seed, stage);
  s.health = s.lives = 99;
  const level = getLevel(stage);
  const player = createReactive({ phase: (seed + phase) % 6, bombs: false });
  const seen = new Set();
  const spawn = { aimed: 0, static: 0, random: 0, other: 0 };
  const speeds = [];
  const band = { static: 0, fan: 0, any: 0, effective: 0 };
  let lastSpawn = 0,
    lull = 0,
    lullAt = 0,
    quietRun = 0,
    lastRest = 0,
    restGap = 0,
    restAt = 0,
    samples = 0,
    quiet = 0,
    alive = 0,
    peak = 0,
    near = 0,
    hits = 0,
    forcedHits = 0,
    lead = [],
    inject = 0;
  const phantomNew = new Set(),
    phantomOld = new Set();
  const snaps = [];
  let f = 0;
  for (; f < 60 * maxSeconds && s.phase === 'playing'; f++) {
    if (forced && f % 15 === 0) {
      snaps.push(snapshot(s));
      if (snaps.length > 6) snaps.shift();
    }
    const input = player(s, f);
    input.bomb = false;
    update(s, 1 / 60, input);
    const t = s.waveElapsed;
    const tw = s.twist || {};
    for (const ev of s.events) {
      if (ev.type === 'hit-core') {
        hits++;
        if (forced) {
          const snap = [...snaps].reverse().find((x) => x.waveElapsed <= t - 0.5);
          if (snap && !autopilotAvoids(snap, t + 0.1)) forcedHits++;
        }
      } else if (ev.type === 'inject' && !ev.peel) inject++; // a diver cured by the tip is the tip doing its job
    }
    let spawned = false;
    for (const b of s.enemyShots) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      if (b.gen) continue; // split children are course changes (rule 4), not new bullets
      spawned = true;
      const g = b.gram || 'other';
      spawn[g] = (spawn[g] || 0) + 1;
      const v = Math.hypot(b.vx, b.vz);
      speeds.push(v);
      band.any = Math.max(band.any, v);
      if (g === 'static') band.static = Math.max(band.static, v);
      if (b.fan) band.fan = Math.max(band.fan, v);
      const eff = v * (level.twist === 'breath' ? 1.3 : 1) + Math.abs(tw.drift || 0);
      band.effective = Math.max(band.effective, eff);
      // Rule 3: from a telegraph start to the lower 80% of the box.
      const { r } = colliderOf(b);
      const d = Math.max(0, -b.z - r - (b.half || 0) - RULES.shipRadius);
      lead.push((b.tele || 0) + (b.age || 0) + d / Math.max(0.1, eff));
    }
    const bossHold = s.boss && s.boss.state !== 'fight' && s.boss.state !== 'defeated';
    // A lull is an empty screen ("no lull without bullets"), outside the
    // stage intro and boss entrances and card holds.
    if (spawned || s.enemyShots.length || t < 4 || bossHold) lastSpawn = t;
    if (t - lastSpawn > lull) [lull, lullAt] = [t - lastSpawn, t];
    // Phantom overlaps (every frame, so a fast crossing is not missed).
    const sx = s.ship.x,
      sz = s.ship.z;
    for (const b of s.enemyShots) {
      if (Math.abs(b.x - sx) > 3.6 || Math.abs(b.z - sz) > 3.6) continue;
      if (bulletGap(b, sx, sz) < RULES.shipRadius) continue; // touching the core is a real hit
      if (!phantomOld.has(b.id) && overlaps(OLD_OUTLINE, b, sx, sz)) phantomOld.add(b.id);
      if (!phantomNew.has(b.id) && overlaps(NEW_OUTLINE, b, sx, sz)) phantomNew.add(b.id);
    }
    if (f % 6 === 0) {
      samples++;
      const n = s.enemyShots.length;
      alive += n;
      peak = Math.max(peak, n);
      if (n <= 3) quiet++;
      quietRun = n <= 3 ? quietRun + 0.1 : 0;
      if (quietRun >= 2.5 || bossHold) lastRest = t;
      if (t - lastRest > restGap) [restGap, restAt] = [t - lastRest, t];
      for (const b of s.enemyShots) if ((b.x - sx) ** 2 + (b.z - sz) ** 2 < 9) near++;
    }
    for (const b of s.enemyShots) if (b.z < 0) void pointSegDist2;
  }
  const time = f / 60;
  const total = spawn.aimed + spawn.static + spawn.random + spawn.other;
  return {
    stage,
    code: level.code,
    seed,
    cleared: s.phase !== 'playing',
    time,
    peak,
    mean: alive / Math.max(1, samples),
    spawnRate: total / Math.max(1, time),
    mix: { aimed: spawn.aimed / Math.max(1, total), static: spawn.static / Math.max(1, total), random: spawn.random / Math.max(1, total) },
    v50: median(speeds),
    v90: pct(speeds, 0.9),
    band,
    quiet: quiet / Math.max(1, samples),
    lull,
    lullAt,
    restGap,
    restAt,
    near: near / Math.max(1, samples),
    hits,
    forced: forcedHits,
    leadMin: lead.length ? Math.min(...lead) : Infinity,
    leadLow: lead.filter((x) => x < 0.6).length,
    phantomNew: (phantomNew.size * 60) / Math.max(1, time),
    phantomOld: (phantomOld.size * 60) / Math.max(1, time),
    inject,
    kills: s.kills,
  };
}

const mean = (a, k) => a.reduce((n, r) => n + (typeof k === 'function' ? k(r) : r[k]), 0) / a.length;
/** The whole suite on `seeds`: one row per stage (means over seeds, worst hits). */
export function auditSuite(seeds = AUDIT_SEEDS, opts = {}) {
  return LEVELS.map((level) => {
    const runs = seeds.map((seed) => auditStage(level.id, seed, opts));
    return {
      stage: level.id,
      code: level.code,
      name: level.name,
      kind: level.kind,
      world: level.world,
      runs,
      time: mean(runs, 'time'),
      peak: mean(runs, 'peak'),
      mean: mean(runs, 'mean'),
      spawnRate: mean(runs, 'spawnRate'),
      aimed: mean(runs, (r) => r.mix.aimed),
      static: mean(runs, (r) => r.mix.static),
      random: mean(runs, (r) => r.mix.random),
      v50: mean(runs, 'v50'),
      vmax: Math.max(...runs.map((r) => r.band.any)),
      vstatic: Math.max(...runs.map((r) => r.band.static)),
      vfan: Math.max(...runs.map((r) => r.band.fan)),
      veff: Math.max(...runs.map((r) => r.band.effective)),
      quiet: mean(runs, 'quiet'),
      lull: Math.max(...runs.map((r) => r.lull)),
      restGap: Math.max(...runs.map((r) => r.restGap)),
      near: mean(runs, 'near'),
      hits: mean(runs, 'hits'),
      worst: Math.max(...runs.map((r) => r.hits)),
      forced: runs.reduce((n, r) => n + r.forced, 0),
      leadLow: runs.reduce((n, r) => n + r.leadLow, 0),
      leadMin: Math.min(...runs.map((r) => r.leadMin)),
      phantomNew: mean(runs, 'phantomNew'),
      phantomOld: mean(runs, 'phantomOld'),
      inject: runs.reduce((n, r) => n + r.inject, 0),
      cleared: runs.every((r) => r.cleared),
    };
  });
}

export function formatRow(r) {
  const f = (x, d = 1) => x.toFixed(d);
  return `${r.code.padEnd(4)} ${r.name.padEnd(14)} t ${f(r.time).padStart(5)} peak ${f(r.peak, 0).padStart(3)} mean ${f(r.mean).padStart(4)} spawn ${f(r.spawnRate).padStart(4)} mix ${f(r.aimed * 100, 0)}/${f(r.static * 100, 0)}/${f(r.random * 100, 0)} v50 ${f(r.v50)} max ${f(r.vmax)} st ${f(r.vstatic)} fan ${f(r.vfan)} eff ${f(r.veff)} quiet ${f(r.quiet * 100, 0)}% lull ${f(r.lull)}@${f(Math.max(...r.runs.map((x) => (x.lull === r.lull ? x.lullAt : 0))))} restGap ${f(r.restGap)} near ${f(r.near, 2)} hits ${f(r.hits, 2)} worst ${r.worst} forced ${r.forced} lead<0.6 ${r.leadLow} ph ${f(r.phantomNew)}/${f(r.phantomOld)} inj ${r.inject}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = process.argv[2] ? process.argv[2].split(',').map(Number) : AUDIT_SEEDS;
  const rows = auditSuite(seeds, { forced: process.env.FORCED !== '0' });
  const short = process.env.SHORT === '1';
  for (const r of rows)
    console.log(short ? `${r.code} t ${r.time.toFixed(0)} peak ${r.peak.toFixed(0)} near ${r.near.toFixed(2)} mix ${(r.aimed * 100).toFixed(0)}/${(r.static * 100).toFixed(0)}/${(r.random * 100).toFixed(0)} quiet ${(r.quiet * 100).toFixed(0)} lull ${r.lull.toFixed(1)} rest ${r.restGap.toFixed(0)}@${Math.max(...r.runs.map((x) => (x.restGap === r.restGap ? x.restAt : 0))).toFixed(0)} hits ${r.hits.toFixed(2)}/${r.worst} forced ${r.forced}` : formatRow(r));
  const old = mean(rows, 'phantomOld'),
    neu = mean(rows, 'phantomNew');
  console.log(`phantom overlaps/min: v1.0 ${neu.toFixed(1)} vs 5.1 u syringe ${old.toFixed(1)} (${((neu / old) * 100).toFixed(0)}%); clean run ${(rows.reduce((n, r) => n + r.time, 0) / 60).toFixed(1)} min`);
}
