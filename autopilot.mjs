/** Ordinary-input autopilot. It drives the attract-mode demo and the QA
 * campaign runs (tests/controller.mjs re-exports it). It only *reads* public
 * state and returns {targetX, shoot, shield}; it never edits health, actors,
 * projectiles, timers or stages, and it plays the same rules a human does.
 *
 * The function must stay self-contained (no outer references): the root
 * cross-project suite serializes it with Function.prototype.toString().
 */
export function chooseInput(s, frame = 0) {
  const ship = s.ship,
    Z = ship.z,
    MUZZLE = Z - 1.4,
    SHOT = 34,
    MOVE = 21;
  // A world-clear LAB REPORT waits for a fresh FIRE press: tap on alternate frames.
  if (s.phase === 'transition')
    return { targetX: ship.x * 0.9, shoot: s.transitionHold ? frame % 2 === 0 : false, shield: false };

  const b = s.boss;
  const posAt = (dest, t) => ship.x + Math.max(-MOVE * t, Math.min(MOVE * t, dest - ship.x));
  const lead = (e) => {
    const t = Math.max(0, (MUZZLE - e.z) / (SHOT + (e.vz || 0)));
    return { x: e.x + (e.vx || 0) * t, t };
  };
  const bossVulnerable = (e) => {
    if (!b || b.state === 'transition' || b.state === 'intro') return false;
    if (b.type === 'mother') return e.part === 'sac' ? b.phase === 0 : b.phase > 0 && b.open;
    if (b.type === 'echo') return b.phase === 2 ? e.id === b.nucleus : b.open;
    if (b.type === 'omega') {
      if (e.part === 'node') return true;
      const step = b.script?.[b.step];
      return b.phase > 0 && !(step && step.shielded && b.stepState === 'tele');
    }
    return true;
  };

  // 1. Target choice: nearest useful enemy, weighted by urgency.
  let aimX = null,
    bestScore = Infinity;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const p = lead(e);
    if (p.x < -9 || p.x > 9) continue;
    let score = Math.abs(p.x - ship.x);
    if (e.kind === 'boss') {
      score -= bossVulnerable(e) ? (b.exposed || b.open ? 6 : 3) : -4;
      if (e.part === 'node' || e.part === 'sac' || e.part === 'half') score -= 1.5;
    } else if (e.kind === 'capsid') {
      const plate = e.plate || {};
      const openSoon = plate.state === 'open' ? plate.timer > p.t : plate.state === 'warning' && plate.timer < p.t + 0.1;
      score += openSoon ? -2 : 5;
    } else if (e.kind === 'infector') score -= e.tether ? 5 : 2;
    else if (e.kind === 'courier') score += 2;
    else if (e.kind === 'diver' && e.mode !== 'formation') score -= 1;
    if (s.breach && e.mode === 'formation') score -= e.z * 0.6;
    // Prefer finishing a sector over picking off minions while the boss is open.
    if (e.minion && b && (b.open || b.exposed)) score += 3;
    if (score < bestScore) {
      bestScore = score;
      aimX = p.x;
    }
  }
  if (aimX === null) aimX = ship.x * 0.8;
  const pickup = s.pickups.find(
    (p) => p.z > 3.5 && p.z < Z + 0.3 && Math.abs(p.x - ship.x) < 7 && (Z - p.z) / 3.5 < 2.4,
  );
  if (pickup) aimX = pickup.x;

  // 2. Danger map over destinations: where will the ship be when each threat lands?
  const lanes = s.telegraphs.filter((t) => t.kind === 'lane');
  const paths = s.telegraphs.filter((t) => t.kind === 'path');
  const rings = s.telegraphs.filter((t) => t.kind === 'ring');
  let targetX = ship.x,
    best = Infinity;
  for (let x = -8.65; x <= 8.651; x += 0.25) {
    let cost = Math.abs(x - aimX) * 0.6 + Math.abs(x - ship.x) * 0.05;
    for (const shot of s.enemyShots) {
      if (shot.vz <= 0) continue;
      // A bullet threatens the ship for the whole time it overlaps the ship's
      // row band, not just at the instant its center crosses z = ship.z.
      const reach = shot.radius + ship.radius,
        tIn = (Z - reach - shot.z) / shot.vz,
        tOut = (Z + reach - shot.z) / shot.vz;
      if (tOut < 0 || tIn > 1.4) continue;
      let gap = Infinity;
      for (let k = 0; k <= 4; k++) {
        const t = Math.max(0, tIn + ((tOut - tIn) * k) / 4);
        gap = Math.min(gap, Math.abs(posAt(x, t) - (shot.x + shot.vx * t)) - reach);
      }
      if (gap < 0.6) cost += (0.6 - gap) * (45 / (0.25 + Math.max(0, tIn)));
    }
    for (const beam of s.beams) if (Math.abs(posAt(x, 0.05) - beam.x) < beam.width / 2 + 0.75) cost += 300;
    for (const lane of lanes) {
      const left = lane.timer - lane.age;
      if (Math.abs(posAt(x, Math.max(0, left - 0.05)) - lane.x) < lane.width / 2 + 0.8) cost += left < 1.1 ? 260 : 30;
      else if (Math.abs(x - lane.x) < lane.width / 2 + 0.8) cost += 30;
    }
    for (const path of paths) if (Math.abs(x - path.x) < 1.35) cost += 70;
    for (const ring of rings)
      for (const a of ring.angles) {
        const px = ring.x + Math.tan(a) * (Z - ring.z);
        const d = Math.abs(x - px);
        if (d < 1.4) cost += (1.4 - d) * 10;
      }
    if (cost < best) {
      best = cost;
      targetX = x;
    }
  }

  // 3. Shield only for a hit the chosen motion cannot avoid.
  let shield = false;
  if (ship.shieldCooldown <= 0 && ship.invulnerable <= 0 && !(ship.powerups && ship.powerups.shield > 0)) {
    for (const shot of s.enemyShots) {
      if (shot.vz <= 0) continue;
      const reach = shot.radius + ship.radius,
        tIn = (Z - reach - shot.z) / shot.vz,
        tOut = (Z + reach - shot.z) / shot.vz;
      if (tOut < 0 || tIn > 0.2) continue;
      for (let k = 0; k <= 4; k++) {
        const t = Math.max(0, tIn + ((tOut - tIn) * k) / 4);
        if (Math.abs(posAt(targetX, t) - (shot.x + shot.vx * t)) < reach + 0.1) shield = true;
      }
    }
    for (const lane of lanes)
      if (lane.timer - lane.age < 0.12 && Math.abs(posAt(targetX, 0.12) - lane.x) < lane.width / 2 + ship.radius)
        shield = true;
    for (const beam of s.beams) if (Math.abs(ship.x - beam.x) < beam.width / 2 + ship.radius) shield = true;
  }
  return { targetX, shoot: true, shield };
}
