/** A deliberately imperfect "reactive human" controller for difficulty tests.
 * Unlike the autopilot it:
 *   - perceives the world only every `sampleEvery` frames (default 6 = 100 ms),
 *   - acts on a perception that is `lagFrames` old (default 9 = 150 ms),
 *   - extrapolates what it saw in straight lines only (it does not know RNA
 *     sines, splits, deceleration or upcoming twist changes),
 *   - prefers sidestepping out of a bullet's line to backing away along it,
 *   - commits to one keyboard direction until its next decision,
 *   - bombs only if `bombs` is enabled and a seen bullet is about to land.
 * It still never edits state: it returns ordinary inputs.
 * `threads: true` lets it read what the RNA thread draws on screen: the line
 * a sine strand travels along and how far it swings (used by the per-pattern
 * fairness audit; the curve tables keep the naive player).
 */
const CORE = 0.2;
/** Distance from (px, pz) to a seen bullet's solid (capsules along travel). */
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
/** What a player sees: where each bullet is and how it is visibly moving
 * (its on-screen velocity, so the world twists are "seen"), but not its future
 * curvature: RNA sines are followed only along their tangent. */
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
function perceive(s) {
  return {
    ship: { x: s.ship.x, z: s.ship.z },
    shots: s.enemyShots
      .filter((b) => Math.abs(b.x - s.ship.x) < 8 && b.z > s.ship.z - 9 && b.z < s.ship.z + 4)
      .map((b) => {
        const [vx, vz] = seenVelocity(s, b);
        // The drawn RNA thread shows a strand's wave: its base line and width.
        const thread = b.sine && b.strand ? { x: b.bx ?? b.x, z: b.bz ?? b.z, vx: b.vx * (s.twist?.scale ?? 1), vz: b.vz * (s.twist?.scale ?? 1), amp: b.sine.amp } : null;
        return { x: b.x, z: b.z, vx, vz, r: (b.hit ?? b.radius ?? 0.16) + CORE, half: b.half || 0, curved: !!b.sine, thread };
      }),
    lanes: (s.emitters || []).filter((em) => em.preset === 'jet' && em.state === 'tele').flatMap((em) => (em.lanes || []).map((l) => ({ x: l.x, w: l.width, fromZ: l.fromZ }))),
    beams: s.beams.map((b) => ({ x: b.x, w: b.width, fromZ: b.fromZ })),
    walls: s.enemyShots.filter((b) => b.gaps && b.z < s.ship.z).map((b) => ({ z: b.z, gaps: b.gaps })),
    enemies: s.enemies.filter((e) => e.alive && !e.harmless).map((e) => ({ x: e.x, z: e.z, vx: e.mode === 'peel' ? e.vx || 0 : 0, vz: e.mode === 'peel' ? e.vz || 0 : 0, r: e.radius + (e.half || 0), kind: e.kind, part: e.part, id: e.id, open: e.bud ? e.bud.state === 'open' : true })),
    fliers: s.enemies.filter((e) => e.alive && e.harmless).map((e) => ({ x: e.x, z: e.z, open: e.bud ? e.bud.state === 'open' : true })),
    pickups: s.pickups.map((p) => ({ x: p.x, z: p.z })),
    boss: s.boss && s.boss.state !== 'defeated' ? { nodes: !!s.boss.cards[s.boss.card]?.nodes, nucleus: s.boss.cards[s.boss.card]?.nucleus ? s.boss.nucleus : null } : null,
    quarantine: s.quarantine ? { ...s.quarantine } : null,
  };
}
const DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707]];

/** `phase` shifts when the player samples the world, so a retry does not replay
 * the identical sequence of decisions (a person never does). */
export function createReactive({ sampleEvery = 6, lagFrames = 9, phase = 0, bombs = false, preferZ = 7.5, threads = false } = {}) {
  const seen = [];
  let move = [0, 0, false],
    bomb = false;
  return function chooseReactive(s, rawFrame) {
    const frame = rawFrame + phase;
    if (s.phase === 'transition') return { confirm: s.transitionHold && frame % 2 === 0 };
    if (frame % sampleEvery === 0) seen.push({ frame, v: perceive(s) });
    while (seen.length > 1 && seen[1].frame <= frame - lagFrames) seen.shift();
    bomb = false;
    if (frame % sampleEvery === 0 && seen[0] && seen[0].frame <= frame - lagFrames) {
      const v = seen[0].v;
      const lag = (frame - seen[0].frame) / 60;
      const me = v.ship; // where it believes it is (also 150 ms stale)
      // Its own position it knows from proprioception: use the live one.
      const sx = s.ship.x,
        sz = s.ship.z;
      // Target: the front-most visible enemy (or a vulnerable boss part), no lead.
      let tx = sx;
      let pool = v.enemies.filter((e) => e.open);
      if (v.boss?.nodes) pool = pool.filter((e) => e.kind !== 'boss' || e.part === 'node');
      if (v.boss?.nucleus) pool = pool.filter((e) => e.kind !== 'boss' || e.id === v.boss.nucleus);
      if (!pool.length) pool = v.fliers.filter((e) => e.open);
      if (pool.length) tx = pool.reduce((a, b) => (Math.abs(b.x - sx) - b.z * 0.2 < Math.abs(a.x - sx) - a.z * 0.2 ? b : a)).x;
      const wall = v.walls.reduce((a, b) => (!a || b.z > a.z ? b : a), null);
      if (wall) tx = wall.gaps.reduce((a, g) => (Math.abs(g.x - sx) < Math.abs(a - sx) ? g.x : a), wall.gaps[0].x);
      const pick = v.pickups.find((p) => p.z > sz - 5 && p.z < sz + 1);
      if (pick) tx = pick.x;
      let best = null,
        bestScore = Infinity,
        bestHit = Infinity;
      for (let sp = 0; sp < 2; sp++) {
        const speed = sp ? s.kit?.focusSpeed ?? 5 : s.kit?.speed ?? 11.5;
        for (const [dx, dz] of DIRS) {
          let risk = 0,
            hitAt = Infinity;
          for (const t of [0.08, 0.16, 0.26, 0.38, 0.55, 0.8]) {
            let px = Math.max(-8.9, Math.min(8.9, sx + dx * speed * t)),
              pz = Math.max(-3, Math.min(12, sz + dz * speed * t));
            if (v.quarantine) {
              const qq = v.quarantine;
              px = Math.max(qq.x - qq.half + 0.2, Math.min(qq.x + qq.half - 0.2, px));
              pz = Math.max(qq.z - qq.half + 0.2, Math.min(qq.z + qq.half - 0.2, pz));
            }
            for (const b of v.shots) {
              const T = t + lag;
              const g = gapTo(b, b.x + b.vx * T, b.z + b.vz * T, px, pz);
              if (g < 0) {
                risk += 40 / (t + 0.1);
                hitAt = Math.min(hitAt, t);
              } else if (g < 0.35) risk += (0.35 - g) * 4;
            }
            for (const l of [...v.lanes, ...v.beams]) if (Math.abs(px - l.x) < l.w / 2 + 0.4 && pz > l.fromZ) risk += 30;
            // A diver (PEEL) is judged where its announced straight line takes it.
            for (const e of v.enemies) if (Math.hypot(e.x + (e.vx || 0) * (t + lag) - px, e.z + (e.vz || 0) * (t + lag) - pz) < e.r + CORE + 0.4) risk += 20;
          }
          // A person sidesteps out of a bullet's line instead of backing away
          // along it: ending this move inside any bullet's future path (the
          // next 2 s) costs a little, even beyond the short look-ahead.
          const ex = Math.max(-8.9, Math.min(8.9, sx + dx * speed * 0.38)),
            ez = Math.max(-3, Math.min(12, sz + dz * speed * 0.38));
          for (const b of v.shots) {
            if (threads && b.thread) {
              // Stay out of the band the thread sweeps (base line +/- amp).
              const th = b.thread,
                tx = th.x + th.vx * lag,
                tz = th.z + th.vz * lag,
                w2 = th.vx * th.vx + th.vz * th.vz;
              if (w2 < 1e-6) continue;
              const k = Math.max(0, Math.min(2, ((ex - tx) * th.vx + (ez - tz) * th.vz) / w2));
              if (Math.hypot(tx + th.vx * k - ex, tz + th.vz * k - ez) < b.r + th.amp + 0.2) risk += 6;
              continue;
            }
            const bx = b.x + b.vx * lag,
              bz = b.z + b.vz * lag,
              v2 = b.vx * b.vx + b.vz * b.vz;
            if (v2 < 1e-6 || b.curved) continue;
            const k = Math.max(0, Math.min(2, ((ex - bx) * b.vx + (ez - bz) * b.vz) / v2));
            if (Math.hypot(bx + b.vx * k - ex, bz + b.vz * k - ez) < b.r + 0.2) risk += 6;
          }
          const score = risk + Math.abs(sx + dx * speed * 0.3 - tx) * 0.3 + Math.abs(sz + dz * speed * 0.3 - preferZ) * 0.1;
          if (score < bestScore) [bestScore, best, bestHit] = [score, [dx, dz, sp === 1], hitAt];
        }
      }
      move = best;
      bomb = bombs && bestHit <= 0.16 && s.ship.bombs > 0 && s.ship.invulnerable <= 0;
      void me;
    }
    if (s.ship.dying > 0 && bombs) bomb = frame % 2 === 0;
    return { axisX: move[0], axisZ: move[1], focus: move[2], bomb };
  };
}
