/** Procedural game-feel audio (revision five "juice" pass). Everything is
 * synthesised with Web Audio at run time: no sample files, no downloads.
 *
 * User feedback (translated): "the SFX are really lame, they need juice."
 * Principles (RESEARCH_BULLET_HELL.md section 12, with sources):
 *   - Layers. Every important sound is a transient (a 1-10 ms click or noise
 *     tick that says "now"), a pitched body (what it is) and a tail (how big
 *     it was). Impacts get a low "thump" for weight.
 *   - Variation. Pitch, filter and timing vary on every play (a few percent
 *     or cents), so a repeat never sounds identical (machine-gun effect).
 *   - Hierarchy. Auto-fire plays 8 times a second for the whole game, so it
 *     is the quietest, softest sound (about -30 dBFS, 4 ms attack, low-passed):
 *     the excitement lives in hits, kills, grazes and boss moments.
 *   - Rising pitch. Kills inside a Dose Chain climb a pentatonic scale and
 *     consecutive grazes climb semitones, so streaks sound like streaks.
 *   - Space. Sounds pan by world x; big events briefly duck the bass bed.
 *   - A clean mix. A compressor and a soft clipper on the master keep the
 *     output under -0.2 dBFS in the busiest moments (measured in the README).
 *   - Character. Every virus type has a tiny formant "voice"; bosses babble
 *     their taunt lines (personality.mjs) while the mouth flaps.
 *
 * Audio is on by default, starts on the first user gesture (browser autoplay
 * rule, game.js) and pause, blur or a hidden tab suspends the whole context.
 * `createAudio({ context, clock })` accepts an OfflineAudioContext and a
 * clock, so the soundboard and tests/browser/audio-measure.mjs can render
 * and measure every sound.
 */
import { chainMultiplier } from './model.mjs';
import { CHARACTERS, characterOf, bossLine, syllablesOf, marchTempo } from './personality.mjs';

const BASS = [55, 43.65, 49, 41.2]; // the original 4-note march (A1 F1 G1 E1)
const PENTA = [0, 2, 4, 7, 9];
/** Formants (Hz) for the voice blips: F1, F2, F3. */
const VOWELS = { a: [800, 1150, 2900], e: [450, 2000, 2650], i: [300, 2300, 3000], o: [480, 820, 2500], u: [340, 760, 2400] };
const MAX_VOICES = 56;
// Size class of a kill: 0 mini/tiny, 1 popcorn, 2 big.
const BIG = new Set(['sneezer', 'heavy', 'puff', 'cell', 'bloom', 'vesicle', 'hijacker', 'budder']);
const sizeOf = (kind) => (kind === 'mini' || kind === 'virion-bullet' ? 0 : BIG.has(kind) ? 2 : 1);
export const panOf = (x) => Math.max(-1, Math.min(1, (x ?? 0) / 9.4)) * 0.7;
/** Kill pitch (semitones above the base) for the n-th cure of a chain: a
 * pentatonic climb over two octaves, then it holds at the top. */
export function chainStep(count) {
  const n = Math.max(0, Math.min(10, (count || 1) - 1));
  return 12 * Math.floor(n / 5) + PENTA[n % 5];
}
/** Mix levels (linear peak gains of each sound's loudest layer) that set the
 * hierarchy; the tests read these. */
export const LEVELS = Object.freeze({ shot: 0.022, hit: 0.024, graze: 0.045, kill: 0.2, voice: 0.09, bed: 0.07, bomb: 0.5, damage: 0.5 });

/** Minimal state for auditioning a sound outside the game. */
export function fixtureState(extra = {}) {
  return { chain: { count: 1 }, enemies: [], boss: null, shotsFired: 0, sector: { vialsLost: 1 }, ship: { x: 0, z: 10 }, health: 3, ...extra };
}

export function createAudio({ context = null, clock = null, random = Math.random } = {}) {
  let ctx = context,
    master = null,
    sfx = null,
    bed = null,
    duck = null,
    verb = null,
    noiseBuf = null,
    shaper = null,
    enabled = false,
    nextBeat = 0,
    beat = 0;
  const last = new Map(); // rate-limit gates: key -> [times]
  const ends = []; // active sound end times (voice cap)
  let grazeStreak = 0,
    lastGrazeAt = -1;
  const now = () => (clock ? clock() : ctx.currentTime);
  const rnd = (a = 0, b = 1) => a + (b - a) * random();
  const vary = (cents) => 2 ** ((rnd(-1, 1) * cents) / 1200);

  function build() {
    // Master: sfx + bed + reverb -> gain -> compressor -> soft clipper -> out.
    master = ctx.createGain();
    master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    // Soft clipper: unity below 0.8, a smooth knee to 0.98 (-0.18 dBFS), so a
    // transient that outruns the compressor's attack can never clip.
    const clip = ctx.createWaveShaper();
    const n = 2048,
      curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1,
        a = Math.abs(x);
      curve[i] = Math.sign(x) * (a <= 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18));
    }
    clip.curve = curve;
    master.connect(comp);
    comp.connect(clip);
    clip.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.connect(master);
    duck = ctx.createGain();
    duck.connect(master);
    bed = ctx.createGain();
    bed.gain.value = 1;
    bed.connect(duck);
    // A short synthetic room (stereo decaying noise) for tails and fanfares.
    const sr = ctx.sampleRate,
      len = Math.floor(sr * 1.3),
      ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += (random() * 2 - 1 - lp) * 0.35; // darker than white noise
        d[i] = lp * Math.exp((-3.2 * i) / len) * (i < sr * 0.01 ? i / (sr * 0.01) : 1);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    verb = ctx.createGain();
    verb.gain.value = 1;
    const ret = ctx.createGain();
    ret.gain.value = 0.32;
    verb.connect(conv);
    conv.connect(ret);
    ret.connect(master);
    noiseBuf = ctx.createBuffer(1, sr, sr);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = random() * 2 - 1;
    // Grit for the player-hit crunch.
    shaper = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      shaper[i] = Math.tanh(x * 6);
    }
  }

  // ---- Building blocks ------------------------------------------------------------
  /** A destination for one sound: panned into the sfx bus, with an optional
   * reverb send. */
  function out(pan = 0, send = 0) {
    let node = sfx;
    if (ctx.createStereoPanner) {
      node = ctx.createStereoPanner();
      node.pan.value = pan;
      node.connect(sfx);
    }
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      node.connect(s);
      s.connect(verb);
    }
    return node;
  }
  function envelope(param, t, a, peak, d) {
    // The intrinsic value must be 0 too: otherwise a source that starts a
    // fraction of a sample before t passes one sample at gain 1, an audible
    // click (measured: single-sample spikes up to -13 dBFS).
    param.value = 0;
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  /** Oscillator layer: pitch glides f -> f1 over `glide` x its length. */
  function osc(dest, { type = 'sine', f, f1 = f, t, a = 0.002, d = 0.1, peak = 0.1, glide = 1, filter = null }) {
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f1 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d * glide);
    envelope(g.gain, t, a, peak, d);
    let head = o;
    if (filter) {
      const bq = ctx.createBiquadFilter();
      bq.type = filter.type || 'lowpass';
      bq.frequency.setValueAtTime(filter.f, t);
      if (filter.f1) bq.frequency.exponentialRampToValueAtTime(filter.f1, t + a + d * (filter.glide ?? 1));
      bq.Q.value = filter.q ?? 0.7;
      o.connect(bq);
      head = bq;
    }
    head.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + a + d + 0.03);
    return o;
  }
  /** Filtered noise layer. */
  function noise(dest, { t, a = 0.001, d = 0.05, peak = 0.05, type = 'bandpass', f = 2000, f1 = f, q = 1, glide = 1, drive = false }) {
    const src = ctx.createBufferSource(),
      bq = ctx.createBiquadFilter(),
      g = ctx.createGain();
    src.buffer = noiseBuf;
    src.loop = true;
    // A random offset: two noise layers never start on the same samples.
    const offset = rnd(0, 0.9);
    bq.type = type;
    bq.frequency.setValueAtTime(f, t);
    if (f1 !== f) bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d * glide);
    bq.Q.value = q;
    envelope(g.gain, t, a, peak, d);
    src.connect(bq);
    let head = bq;
    if (drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = shaper;
      bq.connect(ws);
      head = ws;
    }
    head.connect(g);
    g.connect(dest);
    src.start(t, offset);
    src.stop(t + a + d + 0.03);
  }
  /** Rate limits: at most `max` plays of `key` within `win` seconds. */
  function gate(key, win, max = 1) {
    const t = now();
    const list = (last.get(key) || []).filter((x) => t - x < win);
    if (list.length >= max) {
      last.set(key, list);
      return false;
    }
    list.push(t);
    last.set(key, list);
    return true;
  }
  /** Voice cap: low-priority sounds are skipped when the mix is crowded. */
  function claim(length, priority = 1) {
    const t = now();
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] < t) ends.splice(i, 1);
    if (ends.length >= MAX_VOICES && priority < 2) return false;
    if (ends.length >= MAX_VOICES * 1.5) return false;
    ends.push(t + length);
    return true;
  }
  /** Briefly lower the bass bed under a big event (dB, hold seconds). */
  function duckBed(db, hold, t = now()) {
    const g = duck.gain;
    const low = 10 ** (-db / 20);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(low, t, 0.012);
    g.setTargetAtTime(1, t + hold, 0.18);
  }

  // ---- Voices: formant blips per character -----------------------------------------
  /** One syllable through three formant band-passes. */
  function syllable(dest, { t, pitch, pitch1, len, vowel, peak, growl = 0, vibrato = 0, breath = 0 }) {
    const [f1, f2, f3] = VOWELS[vowel] || VOWELS.a;
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(pitch, t);
    src.frequency.exponentialRampToValueAtTime(Math.max(30, pitch1), t + len);
    const amp = ctx.createGain();
    envelope(amp.gain, t, Math.min(0.012, len * 0.2), peak, len);
    let head = src;
    const stopAt = t + len + 0.05;
    if (growl > 0) {
      // A 30 Hz amplitude flutter: the brute's growl.
      const am = ctx.createGain(),
        lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      am.gain.value = 1 - growl * 0.45;
      lfo.type = 'square';
      lfo.frequency.value = 29;
      depth.gain.value = growl * 0.45;
      lfo.connect(depth);
      depth.connect(am.gain);
      src.connect(am);
      head = am;
      lfo.start(t);
      lfo.stop(stopAt);
    }
    if (vibrato > 0) {
      const lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      lfo.frequency.value = 6.2;
      depth.gain.value = pitch * 0.03 * vibrato;
      lfo.connect(depth);
      depth.connect(src.frequency);
      lfo.start(t);
      lfo.stop(stopAt);
    }
    for (const [f, q, k] of [[f1, 7, 1], [f2, 9, 0.55], [f3, 11, 0.25]]) {
      const bq = ctx.createBiquadFilter(),
        g = ctx.createGain();
      bq.type = 'bandpass';
      bq.frequency.value = f * vary(40);
      bq.Q.value = q;
      g.gain.value = k * 3.2; // make-up gain: narrow bands pass little energy
      head.connect(bq);
      bq.connect(g);
      g.connect(amp);
    }
    amp.connect(dest);
    src.start(t);
    src.stop(stopAt);
    if (breath > 0) noise(dest, { t, a: 0.01, d: len, peak: peak * breath * 0.6, type: 'bandpass', f: f2, q: 2 });
  }
  /** A character's voice blip (`syl` syllables, or its own count). */
  function speak(id, { t = now() + 0.005, pan = 0, syl = null, pitchMul = 1, loud = 1, vowels = null, contour = 0 } = {}) {
    const v = (CHARACTERS[id] || CHARACTERS.wild).voice;
    const n = syl ?? v.syl;
    const dest = out(pan, 0.12);
    for (let i = 0; i < n; i++) {
      const start = t + i * (v.len + 0.035);
      // Babble contour: +1 rises (question, excitement), -1 falls (defeat).
      const p = v.pitch * pitchMul * vary(60) * 2 ** ((contour * i) / Math.max(1, n - 1) / 4);
      const vowel = vowels ? vowels[i % vowels.length] : v.vowel;
      syllable(dest, { t: start, pitch: p, pitch1: p * v.glide, len: v.len * vary(80), vowel, peak: LEVELS.voice * loud, growl: v.growl || 0, vibrato: v.vibrato || 0, breath: v.breath || 0 });
    }
    return n * (v.len + 0.035);
  }
  /** A boss line spoken as babble: vowels taken from the text, so each line
   * has its own melody; "?" and "!" rise, "..." falls. */
  function babble(id, text, pan) {
    const vowels = (text.toLowerCase().match(/[aeiou]/g) || ['a']).filter((_, i) => i % 2 === 0);
    const contour = /\.\.\./.test(text) ? -1.2 : /[?!]$/.test(text) ? 1 : 0;
    speak(id, { syl: syllablesOf(text), pan, vowels, contour, loud: 1.15, t: now() + 0.02 });
  }

  // ---- Sound recipes -------------------------------------------------------------
  const SFX = {
    shot(ev) {
      // Low-fatigue auto-fire: a soft pneumatic "tff", 4 ms attack, low-passed
      // band of noise plus a quiet thump; pitch and band move every volley.
      if (!gate('shot', 0.06) || !claim(0.08, 0)) return;
      const t = now() + 0.003,
        v = vary(70),
        dest = out(panOf(ev.x) * 0.6);
      noise(dest, { t, a: 0.004, d: 0.05, peak: LEVELS.shot, type: 'bandpass', f: (ev.focus ? 2500 : 1800) * v, f1: 800 * v, q: 1.3 });
      osc(dest, { type: 'sine', f: 230 * v, f1: 150, t, a: 0.004, d: 0.05, peak: LEVELS.shot * 0.55 });
    },
    hit(ev, s) {
      const boss = ev.kind === 'boss';
      if (!gate(boss ? 'hit-boss' : 'hit', boss ? 0.075 : 0.03, 2) || !claim(0.06, 0)) return;
      const t = now() + 0.002,
        dest = out(panOf(ev.x));
      if (boss) {
        // A dull "tink" on the boss hide: two inharmonic partials.
        const f = 610 * vary(90);
        osc(dest, { type: 'sine', f, f1: f * 0.97, t, a: 0.001, d: 0.06, peak: LEVELS.hit * 0.6 });
        osc(dest, { type: 'sine', f: f * 2.76, t, a: 0.001, d: 0.03, peak: LEVELS.hit * 0.25 });
        return;
      }
      // Popcorn: a tight tick that rises as the target nears death.
      const e = s?.enemies?.find?.((x) => x.id === ev.id);
      const frac = e ? Math.max(0, e.hp) / Math.max(1, e.maxHp) : 1;
      const f = 1250 * 2 ** ((1 - frac) * 0.6) * vary(60);
      osc(dest, { type: 'triangle', f, f1: f * 0.55, t, a: 0.001, d: 0.035, peak: LEVELS.hit });
      noise(dest, { t, a: 0.0005, d: 0.012, peak: LEVELS.hit * 0.5, type: 'highpass', f: 3500 });
    },
    kill(ev, s) {
      if (ev.kind === 'boss') return; // the boss death has its own sequence
      if (!gate('kill', 0.03, 3) || !claim(0.35, 2)) return;
      const t = now() + 0.002,
        size = ev.kind === 'boss-part' ? 2 : sizeOf(ev.kind),
        pan = panOf(ev.x),
        dest = out(pan, 0.1);
      const count = s?.chain?.count || 1;
      const note = 2 ** (chainStep(count) / 12);
      const base = [880, 587, 392][size] * note * vary(25);
      const k = [0.55, 0.8, 1][size];
      // Transient: the "pop" click.
      noise(dest, { t, a: 0.0005, d: 0.01, peak: LEVELS.kill * 0.45 * k, type: 'highpass', f: 2600 * vary(200) });
      // Body: a bubble pop, a fast downward sine sweep.
      osc(dest, { type: 'sine', f: base * 1.7, f1: base * 0.42, t, a: 0.001, d: 0.06 + size * 0.02, peak: LEVELS.kill * 0.8 * k, glide: 0.7 });
      // Weight: a short low thump (bigger viruses hit harder).
      osc(dest, { type: 'sine', f: [160, 125, 96][size], f1: 44, t, a: 0.002, d: [0.05, 0.09, 0.15][size], peak: LEVELS.kill * [0.4, 0.75, 1][size] });
      // Squelch for big ones.
      if (size === 2) noise(dest, { t: t + 0.005, a: 0.004, d: 0.12, peak: LEVELS.kill * 0.3, type: 'lowpass', f: 900, f1: 220, q: 2 });
      // Tail: the chain note, a soft sparkle that climbs with the streak.
      osc(dest, { type: 'triangle', f: base * 2, t: t + 0.012, a: 0.004, d: 0.13, peak: LEVELS.kill * 0.16 * (0.6 + Math.min(1, count / 8) * 0.4) });
      if (ev.kind && ev.kind !== 'mini' && ev.kind !== 'virion-bullet' && ev.kind !== 'boss-part' && rnd() < 0.35 && gate('death-voice', 0.4)) speak(characterOf({ kind: ev.kind }), { t: t + 0.02, pan, syl: 1, pitchMul: 1.35, loud: 0.6 });
    },
    graze(ev) {
      if (!gate('graze', 0.035) || !claim(0.04, 0)) return;
      const t = now() + 0.002;
      // Streak: consecutive grazes within 0.45 s climb one semitone each.
      grazeStreak = t - lastGrazeAt < 0.45 ? Math.min(14, grazeStreak + 1) : 0;
      lastGrazeAt = t;
      const f = 2700 * 2 ** (grazeStreak / 12) * vary(20),
        dest = out(panOf(ev.x));
      osc(dest, { type: 'sine', f, f1: f * 1.12, t, a: 0.001, d: 0.028, peak: LEVELS.graze });
      noise(dest, { t, a: 0.0005, d: 0.008, peak: LEVELS.graze * 0.6, type: 'highpass', f: 6500 });
    },
    focus(ev) {
      if (!ev.on) return; // nothing on release: tapping focus never chatters
      const t = now() + 0.002,
        dest = out(0);
      osc(dest, { type: 'sine', f: 1560, f1: 1330, t, a: 0.002, d: 0.04, peak: 0.016 });
      osc(dest, { type: 'sine', f: 3120, t, a: 0.001, d: 0.02, peak: 0.006 });
    },
    bomb(ev) {
      claim(1.2, 3);
      const t = now() + 0.003,
        pan = panOf(ev.x);
      // Whoosh: two band-passed noises sweeping up, spread left and right.
      for (const side of [-0.6, 0.6]) noise(out(Math.max(-1, Math.min(1, pan + side)), 0.25), { t, a: 0.09, d: 0.5, peak: 0.16, type: 'bandpass', f: 260 * vary(100), f1: 5200 * vary(100), q: 0.9, glide: 0.8 });
      const dest = out(pan, 0.3);
      // Boom: sub sweep and a punchy mid thump.
      osc(dest, { type: 'sine', f: 78, f1: 30, t, a: 0.004, d: 0.85, peak: LEVELS.bomb, glide: 0.6 });
      osc(dest, { type: 'triangle', f: 170, f1: 52, t, a: 0.002, d: 0.22, peak: 0.2 });
      noise(dest, { t, a: 0.002, d: 0.3, peak: 0.2, type: 'lowpass', f: 1400, f1: 120, q: 0.8 });
      // Soap bubbles popping across the ring.
      for (let i = 0; i < 12; i++) {
        const f = rnd(900, 2800);
        osc(out(rnd(-0.8, 0.8), 0.4), { type: 'sine', f, f1: f * 1.4, t: t + 0.08 + rnd(0, 0.55), a: 0.001, d: 0.04, peak: 0.035 });
      }
      duckBed(12, 0.55, t);
      if (ev.rescued) {
        // Deathbomb: a relieved upward chime on top.
        [0, 4, 7, 12].forEach((n, i) => osc(dest, { type: 'triangle', f: 784 * 2 ** (n / 12), t: t + 0.12 + i * 0.05, a: 0.003, d: 0.16, peak: 0.05 }));
      }
    },
    'auto-bomb'() {},
    'hit-core'(ev) {
      // The hit itself: a sharp glassy crack that says "SOAP now!" (0.18 s window).
      claim(0.2, 3);
      const t = now() + 0.002,
        dest = out(panOf(ev.x));
      noise(dest, { t, a: 0.0005, d: 0.05, peak: 0.16, type: 'highpass', f: 3800 });
      osc(dest, { type: 'square', f: 1760, f1: 1250, t, a: 0.001, d: 0.09, peak: 0.05, filter: { f: 4200 } });
      osc(dest, { type: 'sine', f: 2637, t: t + 0.06, a: 0.001, d: 0.06, peak: 0.05 });
    },
    damage(ev, s) {
      // The vial is lost: crunch, a descending tritone and a heavy thud.
      claim(1.2, 4);
      const t = now() + 0.002,
        dest = out(panOf(ev.x), 0.25);
      noise(dest, { t, a: 0.001, d: 0.12, peak: 0.22, type: 'lowpass', f: 2600, f1: 500, q: 1.2, drive: true });
      osc(dest, { type: 'sawtooth', f: 466, f1: 311, t, a: 0.004, d: 0.48, peak: 0.08, filter: { f: 2200, f1: 500 } });
      osc(dest, { type: 'sawtooth', f: 330, f1: 220, t, a: 0.004, d: 0.5, peak: 0.08, filter: { f: 2000, f1: 450 } });
      osc(dest, { type: 'sine', f: 96, f1: 36, t, a: 0.002, d: 0.4, peak: LEVELS.damage });
      duckBed(14, 0.9, t);
      // Every villain on screen laughs at you (one voice, the boss's if any).
      const line = bossLine(ev, s);
      if (line) babble(speakerOf(line, s), line.text, 0);
      else {
        const near = (s?.enemies || []).find((e) => e.alive && !e.harmless && e.kind !== 'mini');
        if (near) speak(characterOf(near), { t: t + 0.35, pan: panOf(near.x), syl: 3, pitchMul: 1.15, contour: 0.6 });
      }
    },
    respawn(ev) {
      const t = now() + 0.002,
        dest = out(panOf(ev.x), 0.2);
      osc(dest, { type: 'sine', f: 330, f1: 990, t, a: 0.02, d: 0.28, peak: 0.05 });
      osc(dest, { type: 'triangle', f: 660, f1: 1320, t: t + 0.05, a: 0.02, d: 0.22, peak: 0.025 });
    },
    lost() {
      const t = now() + 0.01,
        dest = out(0, 0.35);
      [392, 349, 311, 262].forEach((f, i) => osc(dest, { type: 'triangle', f, f1: f * 0.97, t: t + i * 0.22, a: 0.01, d: 0.4, peak: 0.07 }));
      osc(dest, { type: 'sine', f: 65, t: t + 0.66, a: 0.02, d: 0.9, peak: 0.12 });
      duckBed(20, 1.6, t);
    },
    pickup(ev) {
      claim(0.5, 3);
      const t = now() + 0.003,
        dest = out(panOf(ev.x), 0.3);
      const arp = { mrna: [0, 4, 7, 12, 16], booster: [0, 7, 12, 19, 24], mask: [0, 5, 9, 12], soap: [0, 4, 7, 11], vial: [0, 4, 7, 12, 16, 19] }[ev.kind] || [0, 4, 7, 12];
      const step = ev.kind === 'booster' ? 0.032 : ev.kind === 'vial' ? 0.07 : 0.045;
      arp.forEach((n, i) => {
        const f = 659 * 2 ** (n / 12) * vary(8);
        osc(dest, { type: 'triangle', f, t: t + i * step, a: 0.003, d: 0.16, peak: 0.07 });
        osc(dest, { type: 'sine', f: f * 2, t: t + i * step, a: 0.002, d: 0.09, peak: 0.025 });
      });
      noise(dest, { t, a: 0.02, d: 0.3, peak: 0.02, type: 'highpass', f: 7000 });
      if (ev.kind === 'soap') for (let i = 0; i < 5; i++) osc(dest, { type: 'sine', f: rnd(1200, 2400), f1: 2600, t: t + 0.05 + i * 0.04, a: 0.001, d: 0.03, peak: 0.03 });
    },
    power(ev) {
      if (!ev.up) return;
      const t = now() + 0.05,
        dest = out(0, 0.3);
      osc(dest, { type: 'sawtooth', f: 220, f1: 880, t, a: 0.02, d: 0.42, peak: 0.05, filter: { f: 500, f1: 5000 } });
    },
    'chain-tier'(ev) {
      const t = now() + 0.004,
        dest = out(0, 0.3),
        base = 523 * 2 ** ((ev.tier - 2) / 12);
      [0, 4, 7, 12].forEach((n, i) => osc(dest, { type: 'triangle', f: base * 2 ** (n / 12), t: t + i * 0.035, a: 0.002, d: 0.14, peak: 0.055 }));
      noise(dest, { t, a: 0.004, d: 0.2, peak: 0.025, type: 'highpass', f: 6000 });
    },
    'chain-break'() {
      const t = now() + 0.004,
        dest = out(0);
      osc(dest, { type: 'triangle', f: 392, f1: 370, t, a: 0.005, d: 0.13, peak: 0.04 });
      osc(dest, { type: 'triangle', f: 262, f1: 240, t: t + 0.12, a: 0.005, d: 0.22, peak: 0.04 });
    },
    extend() {
      const t = now() + 0.004,
        dest = out(0, 0.4);
      [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => osc(dest, { type: 'triangle', f: 523 * 2 ** (n / 12), t: t + i * 0.07, a: 0.004, d: 0.2, peak: 0.07 }));
      duckBed(8, 0.6, t);
    },
    'graze-soap'() {
      const t = now() + 0.004,
        dest = out(0, 0.35);
      for (let i = 0; i < 6; i++) osc(dest, { type: 'sine', f: 880 * 2 ** ((i * 3) / 12), f1: 1760 * 2 ** ((i * 3) / 12), t: t + i * 0.04, a: 0.001, d: 0.06, peak: 0.05 });
    },
    cured(ev) {
      const t = now() + 0.003,
        dest = out(panOf(ev.x), 0.3);
      osc(dest, { type: 'sine', f: 1319, t, a: 0.002, d: 0.14, peak: 0.06 });
      osc(dest, { type: 'sine', f: 1760, t: t + 0.07, a: 0.002, d: 0.2, peak: 0.05 });
    },
    antigen() {
      if (!gate('antigen', 0.05)) return;
      const t = now() + 0.002;
      osc(out(rnd(-0.3, 0.3)), { type: 'sine', f: 2093 * vary(150), t, a: 0.001, d: 0.03, peak: 0.02 });
    },
    cancel(ev) {
      // Bullets fizz into antigen tokens.
      if (!ev.count) return;
      const t = now() + 0.003,
        k = Math.min(1, ev.count / 60);
      noise(out(0, 0.3), { t, a: 0.01, d: 0.25 + k * 0.25, peak: 0.02 + k * 0.05, type: 'highpass', f: 4500, f1: 9000 });
    },
    telegraph(ev, s) {
      const owner = s?.enemies?.find?.((e) => e.id === ev.owner);
      const id = owner ? characterOf(owner, s.boss?.type) : 'wild';
      const pan = panOf(ev.x);
      const t = now() + 0.004;
      if (ev.preset === 'sneeze') {
        // "ah... ah..." in the sneezer's own voice, rising into the sneeze.
        const v = CHARACTERS[id].voice;
        const dest = out(pan, 0.15);
        const tele = Math.max(0.5, ev.tele || 0.8);
        [0, 0.42].forEach((at, i) => syllable(dest, { t: t + at * tele, pitch: v.pitch * (1 + i * 0.19), pitch1: v.pitch * (1.18 + i * 0.22), len: 0.3 * tele, vowel: 'a', peak: LEVELS.voice * 0.9, breath: 0.6 }));
      } else if (ev.preset === 'jet' || ev.preset === 'wall') {
        // A rising danger swell for lane jets and mucus walls.
        osc(out(pan), { type: 'triangle', f: 196, f1: 392, t, a: 0.25, d: 0.5, peak: 0.035, glide: 1 });
        noise(out(pan), { t, a: 0.3, d: 0.45, peak: 0.03, type: 'bandpass', f: 400, f1: 2400, q: 2 });
      } else if (ev.boss) {
        if (gate('tele-boss', 0.25)) osc(out(pan), { type: 'sine', f: 1319, f1: 1568, t, a: 0.002, d: 0.08, peak: 0.016 });
      } else if (gate('tele-voice', 0.16) && gate(`tele-${id}`, 0.5)) speak(id, { t, pan, loud: 0.75 });
    },
    sneeze(ev) {
      // "CHOO": a wet noise burst with an "oo" and a little recoil thump.
      if (!gate('sneeze', 0.08)) return;
      const t = now() + 0.003,
        dest = out(panOf(ev.x), 0.2);
      noise(dest, { t, a: 0.004, d: 0.26, peak: 0.12, type: 'bandpass', f: 3600, f1: 700, q: 1.1 });
      syllable(dest, { t: t + 0.02, pitch: 340, pitch1: 250, len: 0.18, vowel: 'u', peak: LEVELS.voice * 0.7, breath: 0.8 });
      osc(dest, { type: 'sine', f: 140, f1: 60, t, a: 0.002, d: 0.1, peak: 0.08 });
    },
    ring(ev) {
      if (!gate('ring', 0.09)) return;
      noise(out(panOf(ev.x)), { t: now() + 0.003, a: 0.003, d: 0.07, peak: 0.025, type: 'lowpass', f: 1400, f1: 500 });
    },
    beam(ev) {
      const t = now() + 0.003,
        x = ev.lanes?.[0] ?? 0,
        dest = out(panOf(x), 0.2);
      noise(dest, { t, a: 0.01, d: 0.55, peak: 0.1, type: 'lowpass', f: 1500, f1: 300, q: 1.5 });
      osc(dest, { type: 'sawtooth', f: 110, f1: 82, t, a: 0.01, d: 0.5, peak: 0.035, filter: { f: 900 } });
    },
    'dive-telegraph'(ev) {
      if (gate('dive', 0.3)) speak('droplet', { t: now() + 0.01, pan: panOf(ev.x), loud: 0.9 });
    },
    land(ev) {
      noise(out(panOf(ev.x)), { t: now() + 0.003, a: 0.003, d: 0.1, peak: 0.06, type: 'lowpass', f: 700, f1: 180, q: 3 });
    },
    splash(ev) {
      const t = now() + 0.003,
        dest = out(panOf(ev.x), 0.2);
      noise(dest, { t, a: 0.002, d: 0.2, peak: 0.08, type: 'bandpass', f: 1800, f1: 500, q: 1.5 });
      for (let i = 0; i < 4; i++) osc(dest, { type: 'sine', f: rnd(600, 1400), f1: 300, t: t + i * 0.03, a: 0.001, d: 0.05, peak: 0.03 });
    },
    burst(ev) {
      const t = now() + 0.003,
        dest = out(panOf(ev.x), 0.15);
      noise(dest, { t, a: 0.002, d: 0.16, peak: 0.09, type: 'lowpass', f: 1100, f1: 200, q: 2 });
      osc(dest, { type: 'sine', f: 180, f1: 60, t, a: 0.002, d: 0.12, peak: 0.12 });
    },
    infected(ev) {
      const t = now() + 0.003;
      speak('hijacker', { t, pan: panOf(ev.x), syl: 2, loud: 0.9 });
      noise(out(panOf(ev.x)), { t, a: 0.003, d: 0.15, peak: 0.06, type: 'bandpass', f: 900, q: 3, drive: true });
    },
    tether(ev) {
      if (gate('tether', 0.6)) speak('hijacker', { t: now() + 0.01, pan: panOf(ev.x), syl: 1, pitchMul: 0.9, loud: 0.7 });
    },
    'bloom-open'(ev) {
      if (gate('bloom', 0.4)) speak('bloom', { t: now() + 0.01, pan: panOf(ev.x), loud: 0.8 });
    },
    spawn(ev) {
      // A rare-type entrance gets its voice (popcorn stays quiet).
      if (ev.kind === 'mini' || ev.kind === 'wild' || ev.kind === 'virion' || ev.kind === 'vesicle') return;
      if (gate('spawn', 0.4) && gate(`spawn-${ev.kind}`, 1.5)) speak(characterOf({ kind: ev.kind }), { t: now() + 0.01, pan: panOf(ev.x), loud: 0.7 });
    },
    escape(ev) {
      if (!gate('escape', 0.3)) return;
      const t = now() + 0.003;
      speak(characterOf({ kind: ev.kind }), { t, pan: panOf(ev.x), syl: 2, contour: 1, loud: 0.8 });
      osc(out(panOf(ev.x)), { type: 'triangle', f: 330, f1: 140, t: t + 0.1, a: 0.005, d: 0.25, peak: 0.03 });
    },
    mutating(ev) {
      const t = now() + 0.003;
      const o = osc(out(panOf(ev.x)), { type: 'sawtooth', f: 300, f1: 900, t, a: 0.02, d: 0.42, peak: 0.025, filter: { f: 1200, f1: 3000 } });
      const lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      lfo.frequency.value = 11;
      depth.gain.value = 40;
      lfo.connect(depth);
      depth.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + 0.5);
    },
    mutated(ev) {
      osc(out(panOf(ev.x), 0.2), { type: 'triangle', f: 988, t: now() + 0.003, a: 0.002, d: 0.16, peak: 0.04 });
    },
    drop(ev) {
      osc(out(panOf(ev.x), 0.2), { type: 'sine', f: 520, f1: 860, t: now() + 0.003, a: 0.004, d: 0.14, peak: 0.05 });
    },
    vesicle(ev) {
      speak('vesicle', { t: now() + 0.01, pan: panOf(ev.x), loud: 0.6 });
    },
    absorbed() {
      if (gate('absorbed', 0.06)) osc(out(0), { type: 'sine', f: 400, f1: 260, t: now() + 0.002, a: 0.002, d: 0.05, peak: 0.03 });
    },
    replicate(ev) {
      if (gate('replicate', 0.08)) osc(out(panOf(ev.x)), { type: 'sine', f: 1046 * vary(100), f1: 700, t: now() + 0.002, a: 0.001, d: 0.04, peak: 0.02 });
    },
    split(ev) {
      const t = now() + 0.003,
        dest = out(panOf(ev.x), 0.25);
      noise(dest, { t, a: 0.005, d: 0.35, peak: 0.12, type: 'bandpass', f: 600, f1: 3000, q: 2, drive: true });
      speak('delta', { t: t + 0.1, pan: 0, syl: 1, loud: 1 });
    },
    'nucleus-swap'(ev) {
      osc(out(panOf(ev.x), 0.2), { type: 'sine', f: 880, f1: 1320, t: now() + 0.003, a: 0.003, d: 0.12, peak: 0.03 });
    },
    twist(ev) {
      if (ev.stage !== 'warn') return;
      const t = now() + 0.004;
      if (ev.kind === 'breath') noise(out(0, 0.2), { t, a: 0.6, d: 0.5, peak: 0.05, type: 'bandpass', f: 400, f1: 1400, q: 1.2 });
      else osc(out(0), { type: 'sine', f: 440, f1: 520, t, a: 0.2, d: 0.6, peak: 0.025 });
    },
    surge() {
      const t = now() + 0.004;
      osc(out(0, 0.2), { type: 'sawtooth', f: 110, f1: 220, t, a: 0.3, d: 0.5, peak: 0.04, filter: { f: 400, f1: 2000 } });
    },
    'card-start'(ev, s) {
      // Spell-card declaration: a rising swell and a two-note motif, then the
      // boss says its line (bullets were just cancelled, so it is safe).
      const t = now() + 0.004,
        b = liveBoss(s),
        pan = panOf(b?.x),
        dest = out(pan, 0.3);
      const card = ev.cardType !== 'phase';
      noise(dest, { t, a: 0.32, d: 0.12, peak: card ? 0.06 : 0.035, type: 'bandpass', f: 400, f1: 4200, q: 1.4, glide: 0.9 });
      if (card) {
        osc(dest, { type: 'square', f: 523, t: t + 0.3, a: 0.004, d: 0.12, peak: 0.035, filter: { f: 2400 } });
        osc(dest, { type: 'square', f: 784, t: t + 0.42, a: 0.004, d: 0.22, peak: 0.035, filter: { f: 2400 } });
      }
      const line = bossLine(ev, s);
      if (line && b) babble(speakerOf(line, s), line.text, pan);
    },
    'card-end'(ev) {
      const t = now() + 0.004,
        dest = out(0, 0.4);
      if (ev.neutralized) {
        [523, 659, 784, 1046].forEach((f, i) => {
          osc(dest, { type: 'triangle', f, t: t + i * 0.075, a: 0.003, d: 0.22, peak: 0.07 });
          osc(dest, { type: 'sine', f: f * 2, t: t + i * 0.075, a: 0.002, d: 0.12, peak: 0.025 });
        });
        noise(dest, { t: t + 0.25, a: 0.01, d: 0.4, peak: 0.025, type: 'highpass', f: 7000 });
      } else if (ev.cardType !== 'phase' || ev.reason === 'timeout') {
        osc(dest, { type: 'triangle', f: 330, f1: 320, t, a: 0.005, d: 0.18, peak: 0.05 });
        osc(dest, { type: 'triangle', f: 247, f1: 220, t: t + 0.17, a: 0.005, d: 0.32, peak: 0.05 });
      }
    },
    'phase-break'(ev, s) {
      // Phase-change stinger: a brassy minor stab, a timpani hit, a room tail.
      claim(1, 4);
      const t = now() + 0.004,
        b = liveBoss(s),
        dest = out(panOf(b?.x), 0.45);
      for (const n of [0, 3, 7, 12]) for (const det of [-6, 6]) osc(dest, { type: 'sawtooth', f: 220 * 2 ** (n / 12) * 2 ** (det / 1200), t, a: 0.006, d: 0.55, peak: 0.022, filter: { f: 3000, f1: 500, q: 1.5, glide: 0.7 } });
      osc(dest, { type: 'sine', f: 92, f1: 44, t, a: 0.003, d: 0.55, peak: 0.32 });
      noise(dest, { t, a: 0.002, d: 0.2, peak: 0.08, type: 'lowpass', f: 900, f1: 200 });
      duckBed(9, 0.5, t);
    },
    'boss-intro'(ev, s) {
      // Entrance: an ominous low swell into an impact as the boss lands, and
      // its voice (a laugh) as the name card slides in.
      claim(1.8, 4);
      const t = now() + 0.01,
        dest = out(0, 0.4),
        mid = !!ev.mid;
      const len = mid ? 0.9 : 1.35;
      for (const det of [-8, 8]) osc(dest, { type: 'sawtooth', f: 55 * 2 ** (det / 1200), f1: 58, t, a: len * 0.85, d: 0.35, peak: 0.05, filter: { f: 150, f1: 1500, glide: 0.9 } });
      osc(dest, { type: 'sine', f: 82, f1: 40, t: t + len, a: 0.003, d: 0.6, peak: 0.34 });
      noise(dest, { t: t + len, a: 0.002, d: 0.28, peak: 0.12, type: 'lowpass', f: 1500, f1: 150 });
      duckBed(10, len + 0.4, t);
      const id = ev.boss === 'betagamma' ? 'gamma' : ev.boss;
      if (CHARACTERS[id]) speak(id, { t: t + 0.35, syl: 3, contour: 0.8, loud: 1.1 });
      void s;
    },
    'boss-defeated'(ev, s) {
      // The payoff: escalating pops across the body, then a huge boom and a
      // major fanfare with a long room tail (the visual pop lands at FINAL).
      claim(3, 5);
      const t = now() + 0.004,
        mid = !!ev.mid,
        pan = panOf(ev.x),
        dest = out(pan, 0.35);
      const pops = mid ? [0, 0.16, 0.3, 0.42] : [0, 0.18, 0.34, 0.48, 0.6, 0.7, 0.78, 0.85];
      const final = mid ? DEFEAT_FINAL.mid : DEFEAT_FINAL.main;
      osc(dest, { type: 'sine', f: 110, f1: 40, t, a: 0.002, d: 0.3, peak: 0.3 });
      noise(dest, { t, a: 0.001, d: 0.06, peak: 0.15, type: 'highpass', f: 3000 });
      pops.forEach((at, i) => {
        const f = 300 * 2 ** (i / 4) * vary(50);
        const d2 = out(Math.max(-1, Math.min(1, pan + rnd(-0.4, 0.4))), 0.3);
        osc(d2, { type: 'sine', f: f * 1.7, f1: f * 0.4, t: t + at, a: 0.001, d: 0.07, peak: 0.12 });
        noise(d2, { t: t + at, a: 0.0005, d: 0.012, peak: 0.06, type: 'highpass', f: 2500 });
        osc(d2, { type: 'sine', f: 120, f1: 45, t: t + at, a: 0.002, d: 0.08, peak: 0.12 });
      });
      const line = bossLine(ev, s);
      if (line) babble(speakerOf(line, s, ev.boss), line.text, pan);
      // The big one.
      osc(dest, { type: 'sine', f: 70, f1: 24, t: t + final, a: 0.004, d: 1.5, peak: 0.55, glide: 0.5 });
      noise(dest, { t: t + final, a: 0.002, d: 0.9, peak: 0.28, type: 'lowpass', f: 3500, f1: 120, q: 0.7, glide: 0.7 });
      noise(out(-0.7, 0.3), { t: t + final, a: 0.002, d: 0.7, peak: 0.08, type: 'highpass', f: 5000, f1: 1500 });
      noise(out(0.7, 0.3), { t: t + final, a: 0.002, d: 0.7, peak: 0.08, type: 'highpass', f: 5200, f1: 1500 });
      // Fanfare: C major with octave doubling (midbosses get a shorter one).
      const notes = mid ? [0, 4, 7, 12] : [0, 4, 7, 12, 16, 19, 24];
      notes.forEach((n, i) => {
        const f = 523 * 2 ** (n / 12);
        osc(out(0, 0.45), { type: 'triangle', f, t: t + final + 0.12 + i * 0.07, a: 0.004, d: mid ? 0.4 : 0.9, peak: 0.06 });
        osc(out(0, 0.45), { type: 'sine', f: f / 2, t: t + final + 0.12 + i * 0.07, a: 0.004, d: mid ? 0.35 : 0.8, peak: 0.03 });
      });
      duckBed(24, final + (mid ? 1 : 2.2), t);
    },
    wave() {
      const t = now() + 0.005,
        dest = out(0, 0.35);
      [0, 7, 12].forEach((n, i) => osc(dest, { type: 'triangle', f: 659 * 2 ** (n / 12), t: t + i * 0.09, a: 0.004, d: 0.22, peak: 0.06 }));
    },
    won() {
      const t = now() + 0.01,
        dest = out(0, 0.45);
      [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => osc(dest, { type: 'triangle', f: 392 * 2 ** (n / 12), t: t + i * 0.1, a: 0.005, d: 0.6, peak: 0.06 }));
    },
  };
  /** Who speaks a boss line: the named twin, else the boss itself. */
  const speakerOf = (line, s, type = s?.boss?.type) => (line.speaker === 'G' ? 'gamma' : line.speaker === 'B' ? 'beta' : type === 'betagamma' ? 'beta' : CHARACTERS[type] ? type : 'alpha');
  const liveBoss = (s) => (s?.enemies || []).find((e) => e.kind === 'boss' && e.alive && e.part !== 'node') || (s?.enemies || []).find((e) => e.kind === 'boss');

  function playBass(t, interval) {
    const f = BASS[beat % 4];
    // A round bass pluck an octave up from the original march (82-110 Hz
    // reads on laptop and phone speakers; the old 20-27 Hz sub only ate
    // headroom), with the original pitch as a closing low-passed triangle.
    osc(bed, { type: 'sine', f: f * 2, f1: f * 1.96, t, a: 0.006, d: 0.24, peak: LEVELS.bed });
    osc(bed, { type: 'triangle', f, t, a: 0.004, d: 0.2, peak: LEVELS.bed * 0.8, filter: { f: 1100, f1: 160, glide: 0.5 } });
    // A soft off-beat tick so the march has a pulse even on small speakers.
    noise(bed, { t: t + interval / 2, a: 0.002, d: 0.025, peak: 0.006, type: 'highpass', f: 7000 });
  }

  return {
    get enabled() {
      return enabled;
    },
    get context() {
      return ctx;
    },
    setEnabled(on, { quiet = false } = {}) {
      if (on) {
        ctx ||= new (window.AudioContext || window.webkitAudioContext)();
        if (!master) build();
        ctx.resume?.()?.catch?.(() => {});
        enabled = true;
        if (!quiet) {
          const t = now() + 0.005;
          osc(out(0, 0.2), { type: 'triangle', f: 659, t, a: 0.003, d: 0.1, peak: 0.05 });
          osc(out(0, 0.2), { type: 'triangle', f: 988, t: t + 0.07, a: 0.003, d: 0.14, peak: 0.05 });
        }
      } else enabled = false;
      return enabled;
    },
    resume() {
      if (enabled && ctx?.state === 'suspended') ctx.resume().catch?.(() => {});
    },
    /** Pause freezes ALL audio: suspending the context also holds tones
     * already scheduled ahead and decaying tails. */
    setSuspended(flag) {
      if (!ctx || ctx instanceof (globalThis.OfflineAudioContext || class {})) return;
      if (flag && ctx.state === 'running') ctx.suspend().catch(() => {});
      else if (!flag && enabled && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    get contextState() {
      return ctx ? ctx.state : 'none';
    },
    /** Active sounds right now (QA: the voice cap). */
    get voices() {
      const t = ctx ? now() : 0;
      return ends.filter((e) => e >= t).length;
    },
    event(ev, s) {
      if (!enabled || !ctx) return;
      const fn = SFX[ev.type];
      if (fn) fn(ev, s);
    },
    /** A character's voice blip on its own (soundboard). */
    voice(id, opts = {}) {
      if (enabled && ctx) speak(id, opts);
    },
    /** Bass march, scheduled a few ms ahead from the frame loop: 72 bpm at a
     * full sample, 144 when nearly empty (personality.marchTempo). */
    tick(s, active) {
      if (!enabled || !ctx || !active) {
        nextBeat = 0;
        return;
      }
      const bpm = marchTempo(s);
      const t = now();
      if (!nextBeat || nextBeat < t) nextBeat = t + 0.05;
      while (nextBeat < t + 0.12) {
        playBass(nextBeat, 60 / bpm);
        beat++;
        nextBeat += 60 / bpm;
      }
    },
  };
}

/** When the boss death's final pop lands (s after the defeat): the renderer's
 * visual pop uses the same numbers, so sound and picture hit together. */
export const DEFEAT_FINAL = Object.freeze({ main: 1, mid: 0.55 });

// ---- Catalogue: every sound with a fixture (soundboard, measurement, tests) ------
const S = fixtureState;
const boss = (type, extra = {}) => {
  const part = { id: 'boss-core', kind: 'boss', part: type === 'betagamma' ? 'twin' : 'core', tag: type === 'betagamma' ? 'G' : undefined, alive: true, x: 1.5, z: -7, hp: 100, maxHp: 100 };
  return S({ boss: { type, state: 'fight', hp: 600, maxHp: 1200, mid: false, cards: [] }, enemies: [part], ...extra });
};
const enemy = (kind, extra = {}) => ({ id: `fx-${kind}`, kind, alive: true, x: -3, z: -6, hp: 3, maxHp: 3, ...extra });
const seq = (list) => list.map(([at, ev, st]) => ({ at, ev, s: st }));
export const SFX_CATALOG = Object.freeze([
  { id: 'shot', group: 'Auto-fire', label: 'Needle volley (SPRAY)', ev: { type: 'shot', x: 0, focus: false } },
  { id: 'shot-focus', group: 'Auto-fire', label: 'Needle volley (FOCUS)', ev: { type: 'shot', x: 0, focus: true } },
  { id: 'shot-stream', group: 'Auto-fire', label: 'Two seconds of auto-fire', seq: seq(Array.from({ length: 16 }, (_, i) => [i * 0.125, { type: 'shot', x: Math.sin(i) * 3, focus: false }])) },
  { id: 'hit', group: 'Impacts', label: 'Needle hits a virus', ev: { type: 'hit', kind: 'wild', id: 'fx-wild', x: -3 }, s: S({ enemies: [enemy('wild')] }) },
  { id: 'hit-low', group: 'Impacts', label: 'Needle hits a virus near death', ev: { type: 'hit', kind: 'wild', id: 'fx-wild', x: -3 }, s: S({ enemies: [enemy('wild', { hp: 1 })] }) },
  { id: 'hit-boss', group: 'Impacts', label: 'Needle hits a boss', ev: { type: 'hit', kind: 'boss', x: 1.5 } },
  { id: 'kill-mini', group: 'Kills', label: 'Pop: mini corona', ev: { type: 'kill', kind: 'mini', x: -4 } },
  { id: 'kill', group: 'Kills', label: 'Pop: WILD TYPE', ev: { type: 'kill', kind: 'wild', x: 2 } },
  { id: 'kill-big', group: 'Kills', label: 'Pop: HEAVY CROWN', ev: { type: 'kill', kind: 'heavy', x: 0 } },
  { id: 'kill-chain', group: 'Kills', label: 'Dose Chain of 10 kills (rising)', seq: seq(Array.from({ length: 10 }, (_, i) => [i * 0.16, { type: 'kill', kind: 'wild', x: -6 + i * 1.3 }, S({ chain: { count: i + 1 } })])) },
  { id: 'kill-part', group: 'Kills', label: 'Pop: boss spike node', ev: { type: 'kill', kind: 'boss-part', x: 3 } },
  { id: 'kill-virion', group: 'Kills', label: 'Pop: shootable virion bullet', ev: { type: 'kill', kind: 'virion-bullet', x: 0 } },
  { id: 'graze', group: 'Player', label: 'Graze tick', ev: { type: 'graze', x: 0.6 } },
  { id: 'graze-streak', group: 'Player', label: 'Graze streak (8, rising)', seq: seq(Array.from({ length: 8 }, (_, i) => [i * 0.09, { type: 'graze', x: Math.cos(i) }])) },
  { id: 'focus', group: 'Player', label: 'Focus on (Shift)', ev: { type: 'focus', on: true } },
  { id: 'bomb', group: 'Player', label: 'SOAP burst', ev: { type: 'bomb', x: 0, rescued: false } },
  { id: 'deathbomb', group: 'Player', label: 'SOAP deathbomb (rescued)', ev: { type: 'bomb', x: 0, rescued: true } },
  { id: 'hit-core', group: 'Player', label: 'Core hit (0.18 s SOAP window)', ev: { type: 'hit-core', x: 0 } },
  { id: 'damage', group: 'Player', label: 'Vial lost (player hit sting)', ev: { type: 'damage', x: 0 }, s: S({ enemies: [enemy('wild')] }) },
  { id: 'respawn', group: 'Player', label: 'Respawn glide-in', ev: { type: 'respawn', x: 0 } },
  { id: 'lost', group: 'Player', label: 'Run lost', ev: { type: 'lost' } },
  { id: 'pickup-mrna', group: 'Rewards', label: 'Supply: mRNA', ev: { type: 'pickup', kind: 'mrna', x: 0 } },
  { id: 'pickup-booster', group: 'Rewards', label: 'Supply: BOOSTER', ev: { type: 'pickup', kind: 'booster', x: 0 } },
  { id: 'pickup-mask', group: 'Rewards', label: 'Supply: MASK', ev: { type: 'pickup', kind: 'mask', x: 0 } },
  { id: 'pickup-soap', group: 'Rewards', label: 'Supply: SOAP', ev: { type: 'pickup', kind: 'soap', x: 0 } },
  { id: 'pickup-vial', group: 'Rewards', label: 'Supply: VIAL', ev: { type: 'pickup', kind: 'vial', x: 0 } },
  { id: 'power', group: 'Rewards', label: 'Power level up', ev: { type: 'power', up: true } },
  { id: 'chain-tier', group: 'Rewards', label: 'Chain tier x3', ev: { type: 'chain-tier', tier: 3 } },
  { id: 'chain-break', group: 'Rewards', label: 'Chain break', ev: { type: 'chain-break' } },
  { id: 'extend', group: 'Rewards', label: 'Extend (+1 vial)', ev: { type: 'extend' } },
  { id: 'graze-soap', group: 'Rewards', label: '100 grazes: +1 SOAP', ev: { type: 'graze-soap' } },
  { id: 'cured', group: 'Rewards', label: 'CURED +300', ev: { type: 'cured', x: 0 } },
  { id: 'cancel', group: 'Rewards', label: 'Bullets cancelled into tokens', ev: { type: 'cancel', count: 40, reason: 'card' } },
  { id: 'wave', group: 'Rewards', label: 'Sample cleared', ev: { type: 'wave' } },
  { id: 'tele-cough', group: 'Threats', label: 'WILD TYPE winds up a cough', ev: { type: 'telegraph', preset: 'cough', owner: 'fx-wild', x: -3 }, s: S({ enemies: [enemy('wild')] }) },
  { id: 'tele-sneeze', group: 'Threats', label: 'SNEEZER inhales "ah... ah..."', ev: { type: 'telegraph', preset: 'sneeze', owner: 'fx-sneezer', x: 2, tele: 0.8 }, s: S({ enemies: [enemy('sneezer', { x: 2 })] }) },
  { id: 'sneeze', group: 'Threats', label: 'SNEEZE "CHOO"', ev: { type: 'sneeze', x: 2 } },
  { id: 'tele-jet', group: 'Threats', label: 'Lane jet warning', ev: { type: 'telegraph', preset: 'jet', x: 0 } },
  { id: 'beam', group: 'Threats', label: 'Lane jet fires', ev: { type: 'beam', lanes: [0] } },
  { id: 'dive', group: 'Threats', label: 'DROPLET dives "wheee"', ev: { type: 'dive-telegraph', x: 4 } },
  { id: 'splash', group: 'Threats', label: 'DROPLET splash', ev: { type: 'splash', x: 4 } },
  { id: 'mutating', group: 'Threats', label: 'MUTATION warble', ev: { type: 'mutating', x: 0 } },
  ...Object.keys(CHARACTERS).map((id) => ({ id: `voice-${id}`, group: 'Voices', label: `${CHARACTERS[id].label}: ${CHARACTERS[id].role}`, voice: id })),
  { id: 'boss-intro', group: 'Bosses', label: 'Boss entrance (ALPHA)', ev: { type: 'boss-intro', boss: 'alpha', mid: false } },
  { id: 'boss-intro-mid', group: 'Bosses', label: 'Midboss entrance (BIG SNEEZER)', ev: { type: 'boss-intro', boss: 'bigsneezer', mid: true } },
  { id: 'card-start', group: 'Bosses', label: 'Card declared + taunt (OMICRON)', ev: { type: 'card-start', index: 2, cardType: 'card' }, s: boss('omicron') },
  { id: 'card-twins', group: 'Bosses', label: 'Twin taunt (GAMMA)', ev: { type: 'card-start', index: 1, cardType: 'card' }, s: boss('betagamma') },
  { id: 'phase-break', group: 'Bosses', label: 'Phase-change stinger', ev: { type: 'phase-break' }, s: boss('alpha') },
  { id: 'card-neutralized', group: 'Bosses', label: 'Card NEUTRALIZED fanfare', ev: { type: 'card-end', neutralized: true, cardType: 'card' } },
  { id: 'card-timeout', group: 'Bosses', label: 'Card TIME OUT', ev: { type: 'card-end', neutralized: false, cardType: 'card', reason: 'timeout' } },
  { id: 'boss-gloat', group: 'Bosses', label: 'Vial lost to a boss (gloat)', ev: { type: 'damage', x: 0 }, s: boss('delta') },
  { id: 'boss-defeated', group: 'Bosses', label: 'Boss defeated (payoff)', ev: { type: 'boss-defeated', boss: 'alpha', mid: false, x: 0 }, s: boss('alpha') },
  { id: 'midboss-defeated', group: 'Bosses', label: 'Midboss defeated', ev: { type: 'boss-defeated', boss: 'mother', mid: true, x: 0 }, s: boss('mother') },
  { id: 'won', group: 'Bosses', label: 'Campaign won', ev: { type: 'won' } },
]);

/** Play one catalogue entry on an audio engine (soundboard and measurement).
 * `at(t)` must move the engine's clock to t seconds after the start. */
export function playEntry(audio, entry, at = () => {}) {
  if (entry.voice) {
    at(0);
    audio.voice(entry.voice);
    return;
  }
  for (const step of entry.seq || [{ at: 0, ev: entry.ev, s: entry.s }]) {
    at(step.at);
    audio.event(step.ev, step.s || fixtureState());
  }
}
