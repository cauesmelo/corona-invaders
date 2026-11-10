/** Human proxies for the difficulty curve (RESEARCH_DIFFICULTY.md §2.1, D1).
 *
 * Three calibrated players (first-timer, casual, expert) that only send
 * ordinary inputs ({axisX, axisZ, focus, bomb, confirm}) and call the same
 * draft actions the FORMULATE screen calls. They never edit state, never read
 * the stage RNG and never look ahead in time: every decision is made from a
 * perception that is `lag` old, sampled every `decision` period, limited to
 * the `attention` nearest bullets and extrapolated in straight lines (the
 * velocity a person sees on screen, world twists included, but no sine
 * curvature, splits or upcoming twist changes).
 *
 * Human limits modelled (each has a source in the brief's table):
 *   - perception lag and a decision period (one committed direction each);
 *   - an attention cap (nearest N bullets; experts filter bullets moving away);
 *   - wrong-choice noise (a 2nd-4th best move) and lapses (keep the last move);
 *   - first-timers never hold focus;
 *   - panic SOAP when the chosen move still meets a bullet <= 0.16 s ahead;
 *   - the deathbomb press lands one human reaction time after the hit flash
 *     (Gaussian, never earlier than 150 ms), against the 0.18 s window;
 *   - INJECT on a fraction of safe chances (a popcorn body <= 3 u ahead of
 *     the tip, a loaded plunger, no seen bullet crossing the path in 0.4 s);
 *   - learning on a retry of the same stage: noise and lapses x 0.7 and
 *     attention + 2 per continue.
 *
 * Aiming: one straight needle at the start means the proxies must aim, so
 * they lead the target (seen sway velocity x (lag + needle flight)) and hold
 * a target until it dies (hysteresis), which sweeps under a formation.
 *
 * The proxies' numbers are evidence of reachability and pressure, not of fun.
 */
import { update, restartGame, pickAdjuvant, discardAdjuvants, getLevel, STAGE_COUNT, entryPower, createState, newRun, snapshot } from '../model.mjs';
import { choose } from '../cards.mjs';
import { chooseInput } from '../autopilot.mjs';

const FPS = 60;
/** §2.1, exactly (D1s asserts these numbers). Times in ms. */
export const PROFILES = Object.freeze({
  firstTimer: Object.freeze({ id: 'firstTimer', label: 'FIRST-TIMER', lag: 300, decision: 200, attention: 6, noise: 0.15, lapse: 0.08, focus: false, panic: 0.3, deathbomb: Object.freeze([380, 80]), inject: 0.05, draft: 'rarest' }),
  casual: Object.freeze({ id: 'casual', label: 'CASUAL', lag: 220, decision: 150, attention: 10, noise: 0.07, lapse: 0.03, focus: true, panic: 0.5, deathbomb: Object.freeze([280, 60]), inject: 0.25, draft: 'random' }),
  expert: Object.freeze({ id: 'expert', label: 'EXPERT', lag: 150, decision: 100, attention: Infinity, noise: 0.02, lapse: 0, focus: true, panic: 0.75, deathbomb: Object.freeze([190, 40]), inject: 0.6, draft: 'synergy' }),
});
/** Learning on a retry of the same stage (§2.1). */
export const LEARNING = Object.freeze({ noise: 0.7, lapse: 0.7, attention: 2 });
/** The earliest a deathbomb press can land after the hit flash (D1s). */
export const MIN_REACTION = 150;
export const PROXY_IDS = Object.freeze(Object.keys(PROFILES));

/** A profile after `retries` continues on the same stage. */
export function learned(profile, retries = 0) {
  if (!retries) return profile;
  const k = LEARNING.noise ** retries;
  return { ...profile, noise: profile.noise * k, lapse: profile.lapse * LEARNING.lapse ** retries, attention: profile.attention + LEARNING.attention * retries };
}

/** The proxy's own coin: xorshift32, never the model's stream. */
function coin(state) {
  let n = state.n >>> 0;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  state.n = n >>> 0;
  return state.n / 4294967296;
}
function gauss(state) {
  const u = Math.max(1e-9, coin(state)),
    v = coin(state);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const CORE = 0.2;
const TIP = 0.95; // hitboxes.INJECT reach: the tip sits 0.95 u ahead of the core
const NEEDLE_SPEED = 34;
const POPCORN = new Set(['mini', 'wild', 'sneezer', 'puff', 'worm', 'droplet', 'budder', 'hijacker', 'cell']);
/** On-screen velocity: the twist's scale and drift are seen, a sine is
 * followed along its tangent only. */
function seenVelocity(s, b) {
  const scale = s.twist?.scale ?? 1,
    drift = s.twist?.drift ?? 0;
  let vx = b.vx + drift,
    vz = b.vz;
  if (b.sine) {
    const sp = Math.hypot(b.vx, b.vz);
    const k = (Math.PI * 2) / b.sine.wavelength;
    const lateral = b.sine.amp * k * sp * Math.cos(b.dist * k + (b.sine.phase || 0));
    vx += b.sine.px * lateral;
    vz += b.sine.pz * lateral;
  }
  return [vx * scale, vz * scale];
}
function gapTo(b, bx, bz, px, pz) {
  let ex = bx - px,
    ez = bz - pz;
  if (b.half) {
    const v = Math.hypot(b.vx, b.vz) || 1;
    const ux = b.vx / v,
      uz = b.vz / v;
    const k = Math.max(-b.half, Math.min(b.half, -(ex * ux + ez * uz)));
    ex += ux * k;
    ez += uz * k;
  }
  return Math.hypot(ex, ez) - b.r;
}
const telegraphing = (s, e) => e.mutating > 0 || (s.emitters || []).some((em) => em.ownerId === e.id && em.state === 'tele');

/** What the proxy sees at one instant (only what the screen shows). */
function perceive(s, profile) {
  const sx = s.ship.x,
    sz = s.ship.z;
  let shots = [];
  for (const b of s.enemyShots) {
    if (b.dead || Math.abs(b.x - sx) > 8 || b.z < sz - 9 || b.z > sz + 4) continue;
    const [vx, vz] = seenVelocity(s, b);
    // Experts filter bullets that are moving away and already past them.
    if (profile.attention === Infinity && b.z > sz + 0.6 && vz > 0) continue;
    shots.push({ x: b.x, z: b.z, vx, vz, r: (b.hit ?? b.radius ?? 0.16) + CORE, half: b.half || 0, curved: !!b.sine, d: Math.hypot(b.x - sx, b.z - sz) });
  }
  if (Number.isFinite(profile.attention) && shots.length > profile.attention) shots = shots.sort((a, b) => a.d - b.d).slice(0, profile.attention);
  const boss = s.boss && s.boss.state !== 'defeated' ? s.boss : null;
  const card = boss ? boss.cards[boss.card] : null;
  return {
    t: s.waveElapsed,
    wave: s.wave,
    shots,
    lanes: (s.emitters || []).filter((em) => em.preset === 'jet' && em.state === 'tele').flatMap((em) => (em.lanes || []).map((l) => ({ x: l.x, w: l.width, fromZ: l.fromZ }))),
    beams: (s.beams || []).map((b) => ({ x: b.x, w: b.width, fromZ: b.fromZ })),
    walls: s.enemyShots.filter((b) => b.gaps && b.z < sz).map((b) => ({ z: b.z, gaps: b.gaps })),
    enemies: s.enemies
      .filter((e) => e.alive && !e.harmless)
      .map((e) => ({ id: e.id, x: e.x, z: e.z, r: e.radius + (e.half || 0), radius: e.radius, kind: e.kind, part: e.part, open: e.bud ? e.bud.state === 'open' : true, popcorn: POPCORN.has(e.kind) && e.kind !== 'boss', tell: telegraphing(s, e) })),
    fliers: s.enemies.filter((e) => e.alive && e.harmless).map((e) => ({ id: e.id, x: e.x, z: e.z, open: true })),
    pickups: s.pickups.map((p) => ({ x: p.x, z: p.z })),
    boss: boss ? { nodes: !!card?.nodes, nucleus: card?.nucleus ? boss.nucleus : null } : null,
    quarantine: s.quarantine ? { ...s.quarantine } : null,
  };
}
const DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707]];
const LOOK = [0.08, 0.16, 0.26, 0.38, 0.55, 0.8];

/** One proxy for one attempt. `seed` drives only the proxy's own coin. */
export function createHuman(profileOrId, { seed = 1, retries = 0, bombs = true, preferZ = 7.5, log = null } = {}) {
  const profile = learned(typeof profileOrId === 'string' ? PROFILES[profileOrId] : profileOrId, retries);
  const rng = { n: (seed * 2654435761) >>> 0 || 0x9e3779b9 };
  const lagF = Math.round((profile.lag / 1000) * FPS),
    period = Math.max(1, Math.round((profile.decision / 1000) * FPS));
  const queue = []; // perceptions waiting out the lag
  let move = [0, 0, false],
    prevSeen = null,
    target = null,
    injectGoal = null,
    bombAt = -1,
    lastHitFrame = -1;
  const rolled = new Set(); // INJECT chances already judged (one roll per virus)
  return function chooseHuman(s, frame) {
    if (s.phase === 'transition') return { confirm: s.transitionHold && frame % 10 === 0 };
    if (s.phase !== 'playing') return {};
    // A hit flash: the deathbomb press lands one reaction time later.
    if (bombs && s.events.some((e) => e.type === 'hit-core') && frame !== lastHitFrame) {
      lastHitFrame = frame;
      const [mean, sd] = profile.deathbomb;
      const ms = Math.max(MIN_REACTION, mean + sd * gauss(rng));
      bombAt = frame + Math.round((ms / 1000) * FPS);
      log?.push({ kind: 'deathbomb', frame, at: bombAt, ms });
    }
    // Sample so that a decision at frame f sees the world at f - lag.
    if ((frame + lagF) % period === 0) queue.push({ frame, v: perceive(s, profile) });
    let bomb = bombs && frame === bombAt && s.ship.bombs > 0;
    if (frame % period === 0) {
      while (queue.length && queue[0].frame < frame - lagF) queue.shift();
      const snap = queue[0] && queue[0].frame <= frame - lagF + 1e-9 ? queue.shift() : null;
      if (snap && s.ship.respawn <= 0) {
        const lapse = coin(rng) < profile.lapse;
        if (!lapse) {
          const out = decide(s, snap.v, (frame - snap.frame) / FPS);
          move = out.move;
          if (bombs && out.hitAt <= 0.16 && s.ship.bombs > 0 && s.ship.invulnerable <= 0 && !s.soapRing && coin(rng) < profile.panic) {
            bomb = true;
            log?.push({ kind: 'panic', frame });
          }
        }
      }
    }
    return { axisX: move[0], axisZ: move[1], focus: move[2], bomb };
  };

  function decide(s, v, lag) {
    const sx = s.ship.x,
      sz = s.ship.z;
    const speedFast = s.kit?.speed ?? 11.5,
      speedSlow = s.kit?.focusSpeed ?? 5;
    // Velocity of each seen enemy from the previous perception (lead).
    const vel = new Map();
    if (prevSeen && v.t > prevSeen.t) {
      const dt = v.t - prevSeen.t;
      const old = new Map(prevSeen.enemies.map((e) => [e.id, e]));
      for (const e of v.enemies) {
        const o = old.get(e.id);
        if (o) vel.set(e.id, [(e.x - o.x) / dt, (e.z - o.z) / dt]);
      }
    }
    prevSeen = v;
    // ---- What to shoot -------------------------------------------------------
    let pool = v.enemies.filter((e) => e.open);
    if (v.boss?.nodes) pool = pool.filter((e) => e.kind !== 'boss' || e.part === 'node');
    if (v.boss?.nucleus) pool = pool.filter((e) => e.kind !== 'boss' || e.id === v.boss.nucleus);
    if (!pool.length) pool = v.fliers;
    const lead = (e) => {
      const [vx] = vel.get(e.id) || [0, 0];
      const flight = Math.max(0, sz - TIP - e.z) / NEEDLE_SPEED;
      return e.x + vx * Math.min(0.9, lag + flight);
    };
    const aimScore = (e) => Math.abs(lead(e) - sx) - e.z * 0.15 + (e.kind === 'boss' ? -1 : 0);
    let tx = sx;
    if (pool.length) {
      let best = pool.reduce((a, b) => (aimScore(b) < aimScore(a) ? b : a));
      // Hold the current target unless another is clearly better.
      const held = target && pool.find((e) => e.id === target);
      if (held && aimScore(held) < aimScore(best) + 2) best = held;
      target = best.id;
      tx = lead(best);
    }
    let tz = preferZ,
      wz = 0.1,
      wx = 0.3;
    const wall = v.walls.reduce((a, b) => (!a || b.z > a.z ? b : a), null);
    if (wall) tx = wall.gaps.reduce((a, g) => (Math.abs(g.x - sx) < Math.abs(a - sx) ? g.x : a), wall.gaps[0].x);
    const pick = v.pickups.find((p) => p.z > sz - 5 && p.z < sz + 1);
    if (pick) tx = pick.x;
    // ---- INJECT: a safe chance, judged once per virus ----------------------------
    if (injectGoal && (v.t > injectGoal.until || !v.enemies.some((e) => e.id === injectGoal.id) || s.ship.injectReload > 0)) injectGoal = null;
    if (!injectGoal && s.ship.injectReload <= 0 && !wall) {
      const tipZ = sz - TIP;
      for (const e of v.enemies) {
        if (!e.popcorn || rolled.has(e.id)) continue;
        if (e.z > tipZ + 0.2 || Math.hypot(e.x - sx, e.z - tipZ) > 3) continue;
        const gx = e.x,
          gz = Math.max(-3, e.z + e.radius + TIP - 0.1);
        if (!pathSafe(v, sx, sz, gx, gz, lag)) continue;
        rolled.add(e.id);
        if (coin(rng) < profile.inject) {
          injectGoal = { id: e.id, x: gx, z: gz, until: v.t + 0.9 };
          break;
        }
      }
    }
    if (injectGoal) {
      const e = v.enemies.find((x) => x.id === injectGoal.id);
      if (e) [injectGoal.x, injectGoal.z] = [lead(e), Math.max(-3, e.z + e.radius + TIP - 0.1)];
      [tx, tz, wx, wz] = [injectGoal.x, injectGoal.z, 0.6, 0.6];
    }
    // ---- Moves, scored by risk then goal ------------------------------------------
    const moves = [];
    for (let sp = 0; sp < (profile.focus ? 2 : 1); sp++) {
      const speed = sp ? speedSlow : speedFast;
      for (const [dx, dz] of DIRS) {
        if (sp && dx === 0 && dz === 0) continue;
        let risk = 0,
          hitAt = Infinity;
        for (const t of LOOK) {
          let px = Math.max(-8.9, Math.min(8.9, sx + dx * speed * t)),
            pz = Math.max(-3, Math.min(12, sz + dz * speed * t));
          if (v.quarantine) {
            const q = v.quarantine;
            px = Math.max(q.x - q.half + 0.2, Math.min(q.x + q.half - 0.2, px));
            pz = Math.max(q.z - q.half + 0.2, Math.min(q.z + q.half - 0.2, pz));
          }
          for (const b of v.shots) {
            const T = t + lag;
            const g = gapTo(b, b.x + b.vx * T, b.z + b.vz * T, px, pz);
            if (g < 0) {
              risk += 40 / (t + 0.1);
              hitAt = Math.min(hitAt, t);
            } else if (g < 0.35) risk += (0.35 - g) * 4;
          }
          for (const l of v.lanes) if (Math.abs(px - l.x) < l.w / 2 + 0.4 && pz > l.fromZ) risk += 30;
          for (const l of v.beams) if (Math.abs(px - l.x) < l.w / 2 + 0.4 && pz > l.fromZ) risk += 30;
          for (const e of v.enemies) if (Math.hypot(e.x - px, e.z - pz) < e.r + CORE + 0.4) risk += 20;
        }
        // Ending inside a bullet's line (next 2 s) costs a little: people
        // sidestep out of a line instead of backing away along it.
        const ex = Math.max(-8.9, Math.min(8.9, sx + dx * speed * 0.38)),
          ez = Math.max(-3, Math.min(12, sz + dz * speed * 0.38));
        for (const b of v.shots) {
          const bx = b.x + b.vx * lag,
            bz = b.z + b.vz * lag,
            v2 = b.vx * b.vx + b.vz * b.vz;
          if (v2 < 1e-6 || b.curved) continue;
          const k = Math.max(0, Math.min(2, ((ex - bx) * b.vx + (ez - bz) * b.vz) / v2));
          if (Math.hypot(bx + b.vx * k - ex, bz + b.vz * k - ez) < b.r + 0.2) risk += 6;
        }
        const goal = Math.abs(sx + dx * speed * 0.3 - tx) * wx + Math.abs(sz + dz * speed * 0.3 - tz) * wz + (v.boss && sp ? -0.1 : 0);
        moves.push({ move: [dx, dz, sp === 1], score: risk + goal, hitAt });
      }
    }
    moves.sort((a, b) => a.score - b.score);
    // Wrong-choice noise: a 2nd-4th best move.
    let chosen = moves[0];
    if (coin(rng) < profile.noise) chosen = moves[1 + Math.min(moves.length - 2, Math.floor(coin(rng) * 3))];
    return chosen;
  }
}
/** No seen bullet crosses the core's straight path to the INJECT spot within
 * 0.4 s (the brief's "safe chance"). */
function pathSafe(v, sx, sz, gx, gz, lag) {
  for (const t of [0.1, 0.2, 0.3, 0.4]) {
    const k = Math.min(1, t / 0.4);
    const px = sx + (gx - sx) * k,
      pz = sz + (gz - sz) * k;
    for (const b of v.shots) if (gapTo(b, b.x + b.vx * (t + lag), b.z + b.vz * (t + lag), px, pz) < 0.3) return false;
  }
  return true;
}

/** Could the perfect-information autopilot, replaying from `snap` without
 * SOAP, get to `until` seconds of stage time without a core hit? (F1) */
export function autopilotAvoids(snap, until) {
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

/** A whole campaign played by one proxy: Normal (or Easy), drafts on, 3
 * credits (Easy: unlimited, capped by `maxContinues`). A lost stage spends a
 * credit and is retried from its entry with the learning rule. Returns per
 * stage: attempts, vials lost (every attempt), core hits, deathbomb saves,
 * play time and the sources of lost vials. `upTo` stops after that stage
 * (the fast subset in npm test). `forced` replays every hit with the
 * autopilot from 0.5 s earlier (F1). */
export function playHumanRun({ proxy = 'casual', seed = 1, difficulty = 'normal', drafts = true, policy = null, upTo = STAGE_COUNT, forced = false, maxContinues = 12, frameBudget = 60 * 60 * 60, bombs = true, tweak = null } = {}) {
  // `tweak` overrides profile fields for experiments (never in the bands).
  const profile = tweak ? { ...PROFILES[proxy], ...tweak } : PROFILES[proxy];
  const s = createState({ seed, difficulty, drafts });
  newRun(s, seed);
  const bot = { rng: (seed * 40503 + 7) >>> 0 || 1 };
  const stages = {};
  const entry = (st) => (stages[st] ||= { stage: st, code: getLevel(st).code, kind: getLevel(st).kind, attempts: 0, cleared: false, vialsLost: 0, coreHits: 0, deathbombs: 0, time: 0, playTime: 0, sources: {}, forced: 0, cards: {} });
  let attempt = 0,
    continues = 0,
    frame = 0,
    playFrames = 0,
    human = null,
    lostAt = null,
    cur = s.wave;
  const snaps = [];
  const fresh = () => {
    cur = s.wave;
    const st = entry(s.wave);
    st.attempts++;
    human = createHuman(profile, { seed: seed * 131 + s.wave * 17 + st.attempts, retries: st.attempts - 1, bombs });
    snaps.length = 0;
  };
  fresh();
  for (; frame < frameBudget; frame++) {
    if (s.phase === 'won') break;
    if (s.phase === 'lost') {
      const st = entry(s.wave);
      st.vialsLost += s.sector.vialsLost;
      lostAt = s.wave;
      if (s.runOver || continues >= maxContinues) break;
      continues++;
      restartGame(s);
      fresh();
      continue;
    }
    if (s.phase === 'draft' && s.run) {
      const ctx = { power: entryPower(s.wave + 1), difficulty: s.difficulty, stage: s.wave + 1 };
      const i = choose(s.run, s.run.offer, policy ?? profile.draft, ctx, bot);
      if (i < 0) discardAdjuvants(s);
      else pickAdjuvant(s, i);
      if (s.wave > upTo) break;
      continue;
    }
    if (s.phase === 'playing' && s.wave !== cur) fresh();
    if (forced && s.phase === 'playing' && frame % 15 === 0) {
      snaps.push(snapshot(s));
      if (snaps.length > 6) snaps.shift();
    }
    const input = human(s, frame);
    const wave = s.wave;
    const bossHp = s.boss && s.boss.state !== 'defeated' ? s.boss.hp : null;
    update(s, 1 / 60, input);
    if (s.phase === 'playing') {
      playFrames++;
      entry(wave).playTime += 1 / 60;
    }
    for (const ev of s.events) {
      const st = entry(wave);
      if (ev.type === 'hit-core' || ev.type === 'absorb' || ev.type === 'epipen' || ev.type === 'auto-bomb') {
        st.coreHits++;
        if (forced && ev.type === 'hit-core') {
          const snap = [...snaps].reverse().find((x) => x.waveElapsed <= s.waveElapsed - 0.5);
          if (snap && !autopilotAvoids(snap, s.waveElapsed + 0.1)) st.forced++;
        }
      }
      if (ev.type === 'damage') {
        // Boss vials are booked per card (Slay the Spire-style reporting).
        const card = s.boss && s.boss.state !== 'defeated' ? s.boss.cards[s.boss.card]?.name : null;
        const key = card ? `${ev.by}/${card}` : ev.by;
        st.sources[key] = (st.sources[key] || 0) + 1;
      }
      if (ev.type === 'card-end' && s.boss) {
        const r = s.boss.results.at(-1);
        const def = s.boss.cards[ev.index];
        const c = (st.cards[ev.name] ||= { n: 0, cleared: 0, ttk: def?.ttk ?? 0, timeSum: 0, frac: 0, dealt: 0 });
        c.n++;
        // Share of the card's HP dealt (1 when cleared; else from the pool).
        if (def?.hp) c.dealt += ev.reason === 'cleared' ? 1 : Math.max(0, Math.min(1, (def.floor + def.hp - (bossHp ?? def.floor + def.hp)) / def.hp));
        if (ev.reason === 'cleared') c.cleared++;
        c.timeSum += r?.time ?? 0;
        if (def?.ttk) c.frac += (r?.time ?? 0) / def.ttk;
      }
      if (ev.type === 'bomb' && ev.rescued) st.deathbombs++;
      if (ev.type === 'wave') {
        st.cleared = true;
        st.time = ev.time;
        st.vialsLost += ev.vialsLost;
        if (ev.stage >= upTo) frame = frameBudget;
      }
    }
  }
  const list = Object.values(stages).sort((a, b) => a.stage - b.stage);
  const won = s.phase === 'won';
  return {
    proxy,
    seed,
    difficulty,
    won,
    oneCredit: won && continues === 0,
    continues,
    reached: s.wave,
    lostAt,
    minutes: playFrames / 3600,
    vialsLost: list.reduce((n, st) => n + st.vialsLost, 0),
    deck: s.run ? s.run.deck.map((d) => d.id) : [],
    stages: list,
  };
}
