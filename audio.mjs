/** Synthesized audio. On by default; the game enables it on the first user
 * gesture (browser autoplay rule) unless the player turned sound off.
 * - Kill tones rise one semitone per Dose Chain tier (input-reactive reward).
 * - A 4-note bass pulse speeds up from 72 to 144 bpm as the sample empties
 *   (or the viral load drops), the way Space Invaders' march speeds up.
 * - Personality cues: a rising "ah... ah..." on a sneezer's inhale and a
 *   noisy "CHOO" on the sneeze, a soft graze tick, a soap-bubble whoosh, a
 *   breath swell for the lungs' BREATH twist and a fanfare for NEUTRALIZED.
 * Pause, blur or a hidden tab suspends the whole context (all audio).
 */
import { chainMultiplier } from './model.mjs';

const BASS = [55, 43.65, 49, 41.2];

export function createAudio() {
  let ctx = null,
    out = null,
    noise = null,
    enabled = false,
    nextBeat = 0,
    beat = 0,
    lastGraze = 0;
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
  /** Filtered noise burst: sneezes and soap. */
  function hiss(duration, volume = 0.05, from = 2400, to = 600, when = 0) {
    if (!enabled || !ctx) return;
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource(),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    src.buffer = noise;
    f.type = 'bandpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + duration);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + duration + 0.02);
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
        if (!quiet) tone(540, 0.1, 'sine', 0.04);
      } else enabled = false;
      return enabled;
    },
    resume() {
      if (enabled && ctx?.state === 'suspended') ctx.resume();
    },
    /** Pause freezes ALL audio: suspending the context also holds tones
     * already scheduled ahead and decaying tails. */
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
          // Auto-fire: kept very quiet so the stream stays calm.
          if (s.shotsFired % 2 === 0) tone(1180, 0.03, 'triangle', 0.006);
          break;
        case 'hit':
          tone(ev.kind === 'boss' ? 170 : 240, 0.035, 'square', 0.008);
          break;
        case 'kill':
          if (ev.kind === 'boss') {
            tone(70, 0.9, 'sawtooth', 0.06, 0, 0.3);
            tone(semis(440, 7), 0.5, 'sine', 0.04, 0.2, 1);
          } else tone(semis(196, (ev.mult || tier) - 1), 0.12, 'sawtooth', 0.022, 0, 0.6);
          break;
        case 'graze': {
          const now = ctx.currentTime;
          if (now - lastGraze > 0.05) {
            lastGraze = now;
            tone(2600, 0.025, 'sine', 0.01, 0, 1.2);
          }
          break;
        }
        case 'telegraph':
          if (ev.preset === 'sneeze') {
            // "ah... ah..." rising into the sneeze.
            tone(330, 0.32, 'sine', 0.025, 0, 1.25);
            tone(392, 0.36, 'sine', 0.025, 0.36, 1.25);
          } else if (ev.preset === 'jet' || ev.preset === 'wall') tone(220, 0.5, 'triangle', 0.02, 0, 1.3);
          else if (ev.boss) tone(660, 0.12, 'sine', 0.01, 0, 1.2);
          break;
        case 'sneeze':
          hiss(0.28, 0.06, 3200, 700); // "CHOO"
          break;
        case 'bomb':
          hiss(0.6, 0.07, 600, 4000);
          tone(330, 0.5, 'sine', 0.04, 0, 2);
          break;
        case 'cancel':
          if (ev.reason === 'card') tone(880, 0.2, 'sine', 0.02, 0, 0.7);
          break;
        case 'chain-tier':
          tone(semis(523, ev.tier - 2), 0.12, 'sine', 0.035, 0, 1);
          tone(semis(523, ev.tier + 2), 0.14, 'sine', 0.025, 0.07, 1);
          break;
        case 'chain-break':
          tone(180, 0.2, 'triangle', 0.02, 0, 0.5);
          break;
        case 'hit-core':
          tone(1400, 0.08, 'square', 0.02, 0, 0.5);
          break;
        case 'damage':
          tone(75, 0.4, 'sawtooth', 0.06);
          break;
        case 'beam':
          hiss(0.5, 0.05, 1200, 300);
          break;
        case 'card-start':
          tone(523, 0.12, 'square', 0.02);
          tone(784, 0.18, 'square', 0.02, 0.1);
          break;
        case 'card-end':
          if (ev.neutralized) [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'sine', 0.04, i * 0.08, 1));
          break;
        case 'twist':
          if (ev.stage === 'warn') tone(ev.kind === 'breath' ? 196 : 440, 0.8, 'sine', 0.025, 0, ev.kind === 'breath' ? 1.5 : 1);
          break;
        case 'mutating':
          tone(600, 0.4, 'sawtooth', 0.012, 0, 1.6);
          break;
        case 'escape':
          tone(140, 0.25, 'triangle', 0.025, 0, 0.6);
          break;
        case 'drop':
        case 'vesicle':
          tone(720, 0.12, 'sine', 0.03, 0, 1.2);
          break;
        case 'pickup':
          tone(740, 0.12, 'sine', 0.04);
          tone(1100, 0.16, 'sine', 0.03, 0.09);
          break;
        case 'extend':
        case 'graze-soap':
          [659, 880, 1318].forEach((f, i) => tone(f, 0.14, 'sine', 0.035, i * 0.07, 1));
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
    /** Bass pulse, scheduled a few ms ahead from the frame loop. */
    tick(s, active) {
      if (!enabled || !ctx || !active) {
        nextBeat = 0;
        return;
      }
      const hostile = s.enemies.filter((e) => !e.harmless && e.kind !== 'vesicle');
      const alive = hostile.filter((e) => e.alive).length;
      const total = Math.max(1, hostile.length);
      const fraction = s.boss && s.boss.state !== 'defeated' ? s.boss.hp / s.boss.maxHp : alive / total;
      const bpm = 72 + (1 - fraction) * 72;
      const now = ctx.currentTime;
      if (!nextBeat || nextBeat < now) nextBeat = now + 0.05;
      while (nextBeat < now + 0.12) {
        tone(BASS[beat % 4], 0.18, 'triangle', 0.045, nextBeat - now, 0.9);
        beat++;
        nextBeat += 60 / bpm;
      }
    },
  };
}
