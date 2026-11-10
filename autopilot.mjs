/** Ordinary-input autopilot for the attract demo and QA campaign runs
 * (tests/controller.mjs re-exports it). It only READS public state and returns
 * the same inputs a player has: {axisX, axisZ, focus, bomb, confirm}. It never
 * edits health, actors, bullets, timers or stages.
 *
 * Method (RESEARCH_BULLET_HELL.md 10): every frame it samples 9 directions x
 * {normal, focus} speed over a 0.42 s look-ahead, predicting each nearby
 * bullet's motion (linear, plus the RNA sine and the world twists), and picks
 * the lowest-risk move that also lines up a shot. It bombs only for a hit the
 * best move cannot avoid, or inside the deathbomb window.
 *
 * The function must stay self-contained (no outer references): the root
 * cross-project suite serializes it with Function.prototype.toString().
 */
export function chooseInput(s, frame = 0) {
  const ship = s.ship;
  if (s.phase === 'transition') return { axisX: 0, axisZ: 0, focus: false, bomb: false, confirm: s.transitionHold ? frame % 2 === 0 : false };
  if (s.phase !== 'playing' || ship.respawn > 0) return { axisX: 0, axisZ: 0, focus: false, bomb: false };
  // Deathbomb: alternate presses so each frame pair is a fresh edge.
  if (ship.dying > 0) return { axisX: 0, axisZ: 0, focus: false, bomb: frame % 2 === 0 };

  const CORE = ship.radius || 0.2,
    FAST = 11.5,
    SLOW = 5,
    MINX = -8.9,
    MAXX = 8.9,
    MINZ = -3,
    MAXZ = 12;
  const tw = s.twist || { scale: 1, drift: 0 };
  const scale = tw.scale || 1,
    drift = tw.drift || 0;
  const q = s.quarantine;
  const lo = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clampX = (x) => (q ? lo(x, q.x - q.half + 0.2, q.x + q.half - 0.2) : lo(x, MINX, MAXX));
  const clampZ = (z) => (q ? lo(z, q.z - q.half + 0.2, q.z + q.half - 0.2) : lo(z, MINZ, MAXZ));

  // ---- Threats near the syringe ---------------------------------------------
  const near = [];
  for (const b of s.enemyShots) {
    if (b.dead) continue;
    const dx = b.x - ship.x,
      dz = b.z - ship.z;
    if (dx > 7 || dx < -7 || dz > 3.5 || dz < -8) continue;
    near.push(b);
  }
  const bossTele = [];
  for (const em of s.emitters || [])
    if (em.preset === 'jet' && em.state === 'tele') for (const l of em.lanes || []) bossTele.push({ x: l.x, w: l.width, fromZ: l.fromZ, left: em.timer });
  const beams = s.beams || [];
  const bodies = s.enemies.filter((e) => e.alive && !e.harmless && e.kind !== 'vesicle' && Math.abs(e.x - ship.x) < 6 && Math.abs(e.z - ship.z) < 6);
  const T = [0.05, 0.11, 0.18, 0.27, 0.42];
  const W = [4, 3, 2.2, 1.5, 1];
  function predict(b, t) {
    const tt = t * scale;
    if (b.sine) {
      const sp = Math.hypot(b.vx, b.vz);
      const bx = b.bx + (b.vx + drift) * tt,
        bz = b.bz + b.vz * tt;
      const off = b.sine.amp * Math.sin(((b.dist + sp * tt) / b.sine.wavelength) * Math.PI * 2 + (b.sine.phase || 0));
      return [bx + b.sine.px * off, bz + b.sine.pz * off];
    }
    return [b.x + (b.vx + drift) * tt, b.z + b.vz * tt];
  }
  // Pre-compute bullet positions per look-ahead step (shared by candidates).
  const pos = T.map((t) => near.map((b) => predict(b, t)));
  const rad = near.map((b) => (b.hit ?? b.radius ?? 0.16) + CORE + (b.splitAt && b.age > b.splitAt - 0.45 ? 0.6 : 0));
  // Elongated bullets are capsules along their travel (hitboxes.mjs).
  const hf = near.map((b) => b.half || 0);
  const ux = near.map((b) => {
    const v = Math.hypot(b.vx, b.vz);
    return v > 1e-6 ? b.vx / v : 0;
  });
  const uz = near.map((b) => {
    const v = Math.hypot(b.vx, b.vz);
    return v > 1e-6 ? b.vz / v : 1;
  });

  // ---- Goal: what to shoot, where to stand -------------------------------------
  const boss = s.boss && s.boss.state !== 'defeated' ? s.boss : null;
  const card = boss ? boss.cards[boss.card] : null;
  let aim = null,
    aimZ = null,
    best = Infinity;
  for (const e of s.enemies) {
    if (!e.alive || e.z < -13.2 || Math.abs(e.x) > 9.2) continue;
    let score = Math.abs(e.x - ship.x) * 0.5 - e.z * 0.12;
    if (e.kind === 'boss') {
      if (card && card.nodes && e.part !== 'node') continue;
      if (card && card.nucleus && e.id !== boss.nucleus) score += 30;
      score -= 2;
    } else if (e.kind === 'bloom' && (!e.bud || e.bud.state !== 'open')) score += e.bud && e.bud.state === 'opening' ? 2 : 12;
    else if (e.kind === 'droplet' && e.mode !== 'formation') score -= 8;
    else if (e.mode === 'flight' || e.mode === 'worm') score -= 3;
    else if (e.kind === 'hijacker' && e.tether) score -= 5;
    else if (e.kind === 'vesicle') score += 1;
    if (score < best) {
      best = score;
      const lead = Math.max(0, (ship.z - e.z) / 34);
      aim = e.x + (e.vx || 0) * lead;
      aimZ = e.z;
    }
  }
  let goalX = aim === null ? ship.x * 0.7 : aim,
    goalZ = 7.2;
  if (aimZ !== null && !boss) goalZ = lo(aimZ + 9, 3.5, 8.5);
  // A wall above us: line up with its nearest gap first.
  let wallGap = null,
    wallZ = -99;
  for (const b of s.enemyShots)
    if (b.gaps && b.z < ship.z - 0.3 && b.z > wallZ) {
      wallZ = b.z;
      wallGap = b.gaps;
    }
  if (wallGap) {
    const shift = drift * Math.max(0, (ship.z - wallZ) / 3.2);
    let g = wallGap[0].x + shift;
    for (const k of wallGap) if (Math.abs(k.x + shift - ship.x) < Math.abs(g - ship.x)) g = k.x + shift;
    goalX = g;
  }
  for (const p of s.pickups) if (p.z > ship.z - 7 && p.z < ship.z + 1.5 && Math.abs(p.x - ship.x) < 7) {
    goalX = p.x;
    goalZ = lo(p.z + 0.5, MINZ, MAXZ);
    break;
  }

  // ---- Candidate moves ------------------------------------------------------------
  const R = Math.SQRT1_2;
  const DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [R, R], [R, -R], [-R, R], [-R, -R]];
  let pick = null,
    pickRisk = Infinity,
    pickHit = Infinity;
  for (let speedIndex = 0; speedIndex < 2; speedIndex++) {
    const v = speedIndex ? SLOW : FAST;
    for (let d = 0; d < DIRS.length; d++) {
      if (speedIndex && d === 0) continue;
      const [dx, dz] = DIRS[d];
      let risk = 0,
        firstHit = Infinity;
      let px = ship.x,
        pz = ship.z,
        gx = ship.x,
        gz = ship.z;
      for (let k = 0; k < T.length; k++) {
        px = clampX(ship.x + dx * v * T[k]);
        pz = clampZ(ship.z + dz * v * T[k]);
        if (k === 2) [gx, gz] = [px, pz];
        const P = pos[k];
        for (let i = 0; i < near.length; i++) {
          let ex = P[i][0] - px,
            ez = P[i][1] - pz;
          if (hf[i]) {
            const k = lo(-(ex * ux[i] + ez * uz[i]), -hf[i], hf[i]);
            ex += ux[i] * k;
            ez += uz[i] * k;
          }
          const gap = Math.sqrt(ex * ex + ez * ez) - rad[i];
          if (gap < 0) {
            risk += 60 * W[k];
            if (T[k] < firstHit) firstHit = T[k];
          } else if (gap < 0.4) risk += (0.4 - gap) * 7 * W[k];
        }
        for (const l of bossTele) if (Math.abs(px - l.x) < l.w / 2 + 0.35 && pz > l.fromZ) risk += (l.left < T[k] + 0.15 ? 80 : 6) * W[k];
        for (const bm of beams) if (Math.abs(px - bm.x) < bm.width / 2 + 0.3 && pz > bm.fromZ) {
          risk += 80 * W[k];
          if (T[k] < firstHit) firstHit = T[k];
        }
        for (const e of bodies) {
          const ax = e.x + (e.vx || 0) * T[k] - px,
            az = e.z + (e.vz || 0) * T[k] - pz;
          const g = Math.hypot(ax - lo(ax, -(e.half || 0), e.half || 0), az) - (e.radius + CORE + 0.35);
          if (g < 0) risk += 25 * W[k];
        }
      }
      // Edge pressure: corners trap; keep some room to the sides and bottom.
      // Goal and edge are judged 0.18 s ahead (the next decision), not at the
      // end of the look-ahead: a full-speed 0.42 s overshoot into the wall
      // used to stop it ever lining up a virus in an edge column.
      const room = Math.min(gx - MINX, MAXX - gx, MAXZ - gz);
      if (room < 1.2) risk += (1.2 - room) * 1.5;
      const goal = Math.abs(gx - goalX) * 0.22 + Math.abs(gz - goalZ) * 0.08 + (boss && speedIndex ? -0.15 : 0);
      const total = risk + goal;
      if (total < pickRisk) {
        pickRisk = total;
        pick = [dx, dz, speedIndex === 1];
        pickHit = firstHit;
      }
    }
  }
  const bomb = pickHit <= 0.12 && ship.invulnerable <= 0 && ship.bombs > 0 && !s.soapRing && frame % 2 === 0;
  return { axisX: pick[0], axisZ: pick[1], focus: pick[2], bomb, confirm: false };
}
