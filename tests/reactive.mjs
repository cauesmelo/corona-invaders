/** A deliberately imperfect "reactive human" controller for difficulty-curve
 * tests. Unlike the autopilot it:
 *   - perceives the world only every `sampleEvery` frames (default 9 = 150 ms),
 *   - acts on a perception that is `lagFrames` old (default 9 = 150 ms),
 *   - steers with the keyboard axis (15.5 u/s), never a pointer target,
 *   - does not lead targets and only avoids threats it can currently see,
 *   - shields only when a visible bullet is about to land on it.
 * It still never edits state: it returns ordinary inputs.
 */
const Z = 10.4;
function perceive(s) {
  return {
    shots: s.enemyShots.map((b) => ({ x: b.x, z: b.z, vx: b.vx, vz: b.vz })),
    lanes: s.telegraphs.filter((t) => t.kind === 'lane').map((t) => ({ x: t.x, width: t.width })),
    paths: s.telegraphs.filter((t) => t.kind === 'path').map((t) => t.x),
    rings: s.telegraphs.filter((t) => t.kind === 'ring').map((t) => ({ x: t.x, z: t.z, angles: t.angles })),
    beams: s.beams.map((b) => ({ x: b.x, width: b.width })),
    enemies: s.enemies
      .filter((e) => e.alive && !e.harmless)
      .map((e) => ({ x: e.x, z: e.z, kind: e.kind, part: e.part, mode: e.mode, id: e.id, plate: e.plate?.state })),
    fliers: s.enemies.filter((e) => e.alive && e.harmless).map((e) => ({ x: e.x, z: e.z })),
    pickups: s.pickups.map((p) => ({ x: p.x, z: p.z })),
    boss: s.boss && { type: s.boss.type, open: s.boss.open, exposed: s.boss.exposed, phase: s.boss.phase, nucleus: s.boss.nucleus },
  };
}
function danger(v, x, horizon) {
  let d = 0;
  for (const b of v.shots) {
    if (b.vz <= 0) continue;
    const t = (Z - b.z) / b.vz;
    if (t < -0.05 || t > horizon) continue;
    if (Math.abs(b.x + b.vx * t - x) < 0.95) d += 1 / Math.max(0.15, t);
  }
  for (const l of v.lanes) if (Math.abs(l.x - x) < l.width / 2 + 0.9) d += 8;
  for (const b of v.beams) if (Math.abs(b.x - x) < b.width / 2 + 0.7) d += 8;
  for (const px of v.paths) if (Math.abs(px - x) < 1.2) d += 3;
  for (const r of v.rings)
    for (const a of r.angles) if (Math.abs(r.x + Math.tan(a) * (Z - r.z) - x) < 1.1) d += 1.5;
  return d;
}
/** `phase` shifts when the player samples the world, so a retry does not replay
 * the identical sequence of decisions (a person never does). */
export function createReactive({ sampleEvery = 9, lagFrames = 9, phase = 0 } = {}) {
  const seen = [];
  let dest = 0,
    shield = false;
  return function chooseReactive(s, rawFrame) {
    const frame = rawFrame + phase;
    if (frame % sampleEvery === 0) seen.push({ frame, v: perceive(s) });
    while (seen.length > 1 && seen[1].frame <= frame - lagFrames) seen.shift();
    const ship = s.ship.x;
    if (frame % sampleEvery === 0 && seen[0] && seen[0].frame <= frame - lagFrames) {
      const v = seen[0].v;
      // Target: the front-most visible enemy (or boss part), no lead.
      let target = ship;
      const pool = v.enemies.length ? v.enemies : v.fliers;
      if (pool.length) target = pool.reduce((a, b) => (b.z > a.z ? b : a)).x;
      const bossParts = v.enemies.filter((e) => e.kind === 'boss');
      if (bossParts.length) target = bossParts.reduce((a, b) => (b.z > a.z ? b : a)).x;
      const pick = v.pickups.find((p) => p.z > 4);
      if (pick) target = pick.x;
      let best = ship,
        bestScore = Infinity;
      for (let x = -8.6; x <= 8.61; x += 0.4) {
        const reach = Math.abs(x - ship) / 15.5;
        const dz = danger(v, x, 1.1) + (reach > 0.4 ? 0 : danger(v, x, 0.5));
        const score = dz * 10 + Math.abs(x - target) * 0.35 + Math.abs(x - ship) * 0.15;
        if (score < bestScore) [bestScore, best] = [score, x];
      }
      dest = best;
      shield = danger(v, ship, 0.35) > 3 && s.ship.shieldCooldown <= 0;
    } else if (frame % sampleEvery !== 0) shield = false;
    const want = dest - ship;
    // Report screens wait for a fresh FIRE press: tap on alternate frames.
    const shoot = s.phase === 'transition' && s.transitionHold ? frame % 2 === 0 : true;
    return { axis: want < -0.3 ? -1 : want > 0.3 ? 1 : 0, shoot, shield };
  };
}
