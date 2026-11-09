/** Synthesized audio. On by default; the game enables it on the first user
 * gesture (browser autoplay rule) unless the player turned sound off.
 * - Kill tones rise one semitone per Dose Chain tier (input-reactive reward).
 * - A 4-note formation bass pulse speeds up from 72 to 144 bpm as the sector
 *   empties, the way Space Invaders' march speeds up.
 * - SPREAD sounds fuller (a detuned second voice) instead of hitting harder.
 */
import { chainMultiplier } from './model.mjs';

const BASS = [55, 43.65, 49, 41.2];

export function createAudio() {
  let ctx = null,
    out = null,
    enabled = false,
    nextBeat = 0,
    beat = 0;
  function tone(freq, duration, type = 'sine', volume = 0.05, when = 0, slide = 0.5) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + duration);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + duration + 0.02);
  }
  const semis = (base, n) => base * 2 ** (n / 12);
  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on, { quiet = false } = {}) {
      if (on) {
        ctx ||= new (window.AudioContext || window.webkitAudioContext)();
        if (!out) {
          out = ctx.createGain();
          out.gain.value = 0.9;
          out.connect(ctx.destination);
        }
        ctx.resume?.();
        enabled = true;
        // Confirmation blip only for an explicit toggle, not the auto-enable.
        if (!quiet) tone(540, 0.1, 'sine', 0.04);
      } else enabled = false;
      return enabled;
    },
    resume() {
      if (enabled && ctx?.state === 'suspended') ctx.resume();
    },
    /** Pause freezes ALL audio (user request, rev 4): suspending the context
     * also holds tones already scheduled ahead and decaying tails, which a
     * gain mute would let finish silently and then resume out of sync. */
    setSuspended(flag) {
      if (!ctx) return;
      if (flag && ctx.state === 'running') ctx.suspend().catch(() => {});
      else if (!flag && enabled && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    get contextState() {
      return ctx ? ctx.state : 'none';
    },
    event(ev, s) {
      if (!enabled) return;
      const tier = chainMultiplier(s.chain.count);
      switch (ev.type) {
        case 'shot':
          tone(980, 0.05, 'triangle', 0.012);
          if (ev.spread) tone(735, 0.06, 'triangle', 0.01, 0, 0.6);
          break;
        case 'hit':
          tone(ev.kind === 'boss' ? 160 : 230, 0.04, 'square', 0.014);
          break;
        case 'kill':
          if (ev.kind === 'boss') {
            tone(70, 0.9, 'sawtooth', 0.06, 0, 0.3);
            tone(semis(440, 7), 0.5, 'sine', 0.04, 0.2, 1);
          } else tone(semis(196, (ev.mult || tier) - 1), 0.14, 'sawtooth', 0.03, 0, 0.6);
          break;
        case 'chain-tier':
          tone(semis(523, ev.tier - 2), 0.12, 'sine', 0.04, 0, 1);
          tone(semis(523, ev.tier + 2), 0.14, 'sine', 0.03, 0.07, 1);
          break;
        case 'chain-break':
          tone(180, 0.2, 'triangle', 0.025, 0, 0.5);
          break;
        case 'damage':
          tone(75, 0.3, 'sawtooth', 0.05);
          break;
        case 'shield':
          tone(440, 0.18, 'sine', 0.04, 0, 1.5);
          break;
        case 'warning':
          tone(880, 0.05, 'sine', 0.008, 0, 1);
          break;
        case 'boss-telegraph':
          tone(ev.attack === 'beam' || ev.attack === 'ring' ? 330 : 660, 0.25, 'sine', 0.02, 0, 1.4);
          break;
        case 'beam':
        case 'ring':
          tone(110, 0.35, 'sawtooth', 0.04, 0, 0.7);
          break;
        case 'burst':
          tone(semis(300, tier), 0.12, 'square', 0.02, 0, 0.4);
          break;
        case 'spark':
          tone(2200, 0.03, 'triangle', 0.008, 0, 1);
          break;
        case 'phase-break':
          tone(120, 0.5, 'sawtooth', 0.05, 0, 0.4);
          break;
        case 'drop':
        case 'courier':
          tone(720, 0.12, 'sine', 0.03, 0, 1.2);
          break;
        case 'pickup':
          tone(740, 0.12, 'sine', 0.045);
          tone(1100, 0.16, 'sine', 0.035, 0.09);
          break;
        case 'cured':
          tone(880, 0.1, 'sine', 0.04);
          tone(1320, 0.14, 'sine', 0.03, 0.08);
          break;
        case 'wave':
          tone(650, 0.2, 'sine', 0.04);
          tone(970, 0.2, 'sine', 0.03, 0.11);
          break;
        case 'lost':
          tone(220, 0.6, 'triangle', 0.05, 0, 0.3);
          break;
      }
    },
    /** Formation pulse, scheduled a few ms ahead from the frame loop. */
    tick(s, active) {
      if (!enabled || !ctx || !active) {
        nextBeat = 0;
        return;
      }
      const alive = s.enemies.filter((e) => e.alive && !e.courier && !e.harmless).length;
      const total = Math.max(1, s.enemies.filter((e) => !e.courier && !e.harmless).length);
      const fraction = s.boss ? s.boss.hp / s.boss.maxHp : alive / total;
      const bpm = 72 + (1 - fraction) * 72;
      const now = ctx.currentTime;
      if (!nextBeat || nextBeat < now) nextBeat = now + 0.05;
      while (nextBeat < now + 0.12) {
        tone(BASS[beat % 4], 0.18, 'triangle', 0.05, nextBeat - now, 0.9);
        beat++;
        nextBeat += 60 / bpm;
      }
    },
  };
}
