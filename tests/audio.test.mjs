/** The SFX engine (audio.mjs) against a recording fake AudioContext: every
 * catalogued sound builds a valid graph into the limited master, the mix
 * hierarchy (quiet, soft auto-fire; loud kills), variation, rising streaks,
 * stereo placement, ducking, the voice cap and pause. The rendered levels
 * (peak, loudness, attack) are measured in Chrome by
 * tests/browser/audio-measure.mjs and recorded in the README. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, SFX_CATALOG, playEntry, fixtureState, chainStep, panOf, LEVELS } from '../audio.mjs';
import { CHARACTERS } from '../personality.mjs';

class Param {
  constructor(v = 0) {
    this.value = v;
    this.events = [];
  }
  setValueAtTime(v, t) {
    this.events.push(['set', v, t]);
  }
  linearRampToValueAtTime(v, t) {
    this.events.push(['lin', v, t]);
  }
  exponentialRampToValueAtTime(v, t) {
    assert.ok(v > 0, 'exponential ramps never target 0');
    this.events.push(['exp', v, t]);
  }
  setTargetAtTime(v, t, tau) {
    this.events.push(['target', v, t, tau]);
  }
  cancelScheduledValues(t) {
    this.events.push(['cancel', t]);
  }
}
/** A recording AudioContext: nodes, params, starts and connections. */
function fakeContext() {
  const nodes = [];
  const ctx = {
    currentTime: 1,
    sampleRate: 48000,
    state: 'running',
    suspended: 0,
    destination: { kind: 'destination', inputs: [] },
    nodes,
    suspend() {
      this.suspended++;
      this.state = 'suspended';
      return Promise.resolve();
    },
    resume() {
      this.state = 'running';
      return Promise.resolve();
    },
  };
  const node = (kind, params = {}) => {
    const n = { kind, outputs: [], started: null, stopped: null, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, new Param(v)])) };
    n.connect = (dest) => {
      assert.ok(dest, `${kind} connects to something`);
      n.outputs.push(dest);
      return dest;
    };
    n.start = (t = 0) => (n.started = t);
    n.stop = (t = 0) => (n.stopped = t);
    nodes.push(n);
    return n;
  };
  ctx.createOscillator = () => Object.assign(node('osc', { frequency: 440, detune: 0 }), { type: 'sine' });
  ctx.createGain = () => node('gain', { gain: 1 });
  ctx.createBiquadFilter = () => Object.assign(node('biquad', { frequency: 350, Q: 1, gain: 0 }), { type: 'lowpass' });
  ctx.createBufferSource = () => Object.assign(node('source', { playbackRate: 1 }), { buffer: null, loop: false });
  ctx.createStereoPanner = () => node('panner', { pan: 0 });
  ctx.createDynamicsCompressor = () => node('compressor', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 });
  ctx.createWaveShaper = () => Object.assign(node('shaper'), { curve: null });
  ctx.createConvolver = () => Object.assign(node('convolver'), { buffer: null });
  ctx.createBuffer = (channels, length, sampleRate) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, getChannelData: (i) => data[i] };
  };
  return ctx;
}
/** A seeded random, so variation tests are reproducible. */
function seeded(seed = 1) {
  let n = seed;
  return () => ((n = (n * 16807) % 2147483647) / 2147483647);
}
function engine(seed = 1) {
  const ctx = fakeContext();
  const audio = createAudio({ context: ctx, random: seeded(seed) });
  audio.setEnabled(true, { quiet: true });
  return { ctx, audio, mark: () => ctx.nodes.length };
}
const since = (ctx, mark) => ctx.nodes.slice(mark);
/** Largest envelope peak (linear ramp target) on gain params of new nodes. */
const peakOf = (list) => Math.max(0, ...list.filter((n) => n.kind === 'gain').flatMap((n) => n.gain.events.filter((e) => e[0] === 'lin').map((e) => e[1])));

test('every catalogued sound builds a graph that starts and stops its sources', () => {
  for (const entry of SFX_CATALOG) {
    const { ctx, audio, mark } = engine();
    const m = mark();
    playEntry(audio, entry, (t) => (ctx.currentTime = 1 + t));
    const made = since(ctx, m);
    const sources = made.filter((n) => n.kind === 'osc' || n.kind === 'source');
    assert.ok(sources.length > 0, `${entry.id} makes sound`);
    for (const s of sources) assert.ok(s.started !== null && s.stopped !== null && s.stopped > s.started, `${entry.id}: a ${s.kind} starts and stops`);
  }
});

test('the master chain ends in a compressor and a soft clipper that never exceeds -0.18 dBFS', () => {
  const { ctx } = engine();
  const comp = ctx.nodes.find((n) => n.kind === 'compressor');
  const shaper = ctx.nodes.find((n) => n.kind === 'shaper' && n.curve);
  assert.ok(comp && shaper);
  assert.ok(comp.outputs.includes(shaper) && shaper.outputs.includes(ctx.destination), 'compressor -> clipper -> destination');
  assert.ok(comp.ratio.value >= 4 && comp.attack.value <= 0.005, 'a fast compressor');
  const peak = Math.max(...[...shaper.curve].map(Math.abs));
  assert.ok(peak <= 0.98 + 1e-6, `clip ceiling ${peak}`);
  // Unity gain below the knee: quiet sounds are untouched.
  const mid = (shaper.curve.length - 1) / 2,
    i = Math.round(mid + 0.5 * mid);
  assert.ok(Math.abs(shaper.curve[i] - (i / (shaper.curve.length - 1)) * 2 + 1) < 1e-3);
});

test('auto-fire is the quietest sound with a soft attack; kills are 19 dB louder', () => {
  const { ctx, audio, mark } = engine();
  let m = mark();
  audio.event({ type: 'shot', x: 0, focus: false }, fixtureState());
  const shot = since(ctx, m);
  const shotPeak = peakOf(shot);
  assert.ok(shotPeak <= LEVELS.shot + 1e-9, `shot peak ${shotPeak}`);
  // Attack: every envelope of the volley ramps up over at least 4 ms.
  for (const g of shot.filter((n) => n.kind === 'gain' && n.gain.events.length)) {
    const [set, lin] = g.gain.events;
    assert.ok(lin[2] - set[2] >= 0.004 - 1e-9, 'soft 4 ms attack');
  }
  m = mark();
  ctx.currentTime += 1;
  audio.event({ type: 'kill', kind: 'wild', x: 0 }, fixtureState());
  const killPeak = peakOf(since(ctx, m));
  assert.ok(20 * Math.log10(killPeak / shotPeak) >= 15, `kill is ${(20 * Math.log10(killPeak / shotPeak)).toFixed(1)} dB above a shot`);
  assert.ok(LEVELS.shot < LEVELS.hit && LEVELS.hit < LEVELS.graze && LEVELS.graze < LEVELS.kill && LEVELS.kill < LEVELS.bomb);
});

test('no two plays are identical: pitch varies on every repeat', () => {
  const { ctx, audio } = engine(3);
  const freqs = [];
  for (let i = 0; i < 6; i++) {
    const m = ctx.nodes.length;
    ctx.currentTime += 0.5;
    audio.event({ type: 'kill', kind: 'wild', x: 0 }, fixtureState());
    freqs.push(since(ctx, m).find((n) => n.kind === 'osc').frequency.events[0][1]);
  }
  assert.equal(new Set(freqs.map((f) => f.toFixed(3))).size, freqs.length, freqs.join(', '));
});

test('streaks rise: chained kills climb a pentatonic scale and consecutive grazes climb semitones', () => {
  for (let n = 1; n < 30; n++) assert.ok(chainStep(n + 1) >= chainStep(n));
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(chainStep), [0, 2, 4, 7, 9, 12]);
  assert.equal(chainStep(40), 24, 'holds two octaves up');
  const { ctx, audio } = engine();
  const bodies = [];
  for (let c = 1; c <= 8; c++) {
    const m = ctx.nodes.length;
    ctx.currentTime += 0.2;
    audio.event({ type: 'kill', kind: 'wild', x: 0 }, fixtureState({ chain: { count: c } }));
    bodies.push(since(ctx, m).filter((n) => n.kind === 'osc')[0].frequency.events[0][1]);
  }
  for (let i = 1; i < bodies.length; i++) assert.ok(bodies[i] > bodies[i - 1] * 1.03, `kill ${i + 1} rises: ${bodies.join(', ')}`);
  const g = [];
  for (let i = 0; i < 6; i++) {
    const m = ctx.nodes.length;
    ctx.currentTime += 0.08;
    audio.event({ type: 'graze', x: 0 }, fixtureState());
    g.push(since(ctx, m).find((n) => n.kind === 'osc').frequency.events[0][1]);
  }
  for (let i = 1; i < g.length; i++) assert.ok(g[i] > g[i - 1], `graze ${i + 1} rises`);
  // Within the 35 ms gate a second graze is dropped (no chatter).
  const m = ctx.nodes.length;
  ctx.currentTime += 0.01;
  audio.event({ type: 'graze', x: 0 }, fixtureState());
  assert.equal(since(ctx, m).length, 0);
});

test('stereo: sounds pan by world x (left board edge left, right edge right)', () => {
  assert.ok(panOf(-9.4) <= -0.69 && panOf(9.4) >= 0.69 && panOf(0) === 0);
  for (const [x, sign] of [[-8, -1], [8, 1]]) {
    const { ctx, audio, mark } = engine();
    const m = mark();
    audio.event({ type: 'kill', kind: 'wild', x }, fixtureState());
    const pan = since(ctx, m).find((n) => n.kind === 'panner').pan.value;
    assert.ok(pan * sign > 0.5, `x ${x} -> pan ${pan}`);
  }
});

test('big events duck the bass bed and let it recover', () => {
  for (const type of ['bomb', 'damage', 'boss-defeated', 'phase-break', 'boss-intro']) {
    const { ctx, audio } = engine();
    const ev = { type, x: 0, boss: 'alpha', mid: false };
    audio.event(ev, fixtureState({ boss: { type: 'alpha', state: 'fight' }, enemies: [{ id: 1, kind: 'boss', part: 'core', alive: true, x: 0 }] }));
    const ducks = ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.some((e) => e[0] === 'target' && e[1] < 0.5));
    assert.ok(ducks.length, `${type} ducks the bed`);
    assert.ok(ducks.every((n) => n.gain.events.some((e) => e[0] === 'target' && e[1] === 1)), `${type}: the bed comes back`);
  }
});

test('the voice cap holds under a flood, and pause suspends the whole context', () => {
  const { ctx, audio } = engine();
  for (let i = 0; i < 400; i++) {
    ctx.currentTime += 0.001;
    audio.event({ type: i % 2 ? 'kill' : 'hit', kind: 'wild', x: (i % 19) - 9 }, fixtureState());
  }
  assert.ok(audio.voices <= 84, `${audio.voices} voices`);
  audio.setSuspended(true);
  assert.equal(ctx.suspended, 1);
  assert.equal(audio.contextState, 'suspended');
  audio.setSuspended(false);
  assert.equal(audio.contextState, 'running');
  // Disabled: nothing is scheduled.
  audio.setEnabled(false);
  const m = ctx.nodes.length;
  audio.event({ type: 'kill', kind: 'wild', x: 0 }, fixtureState());
  assert.equal(ctx.nodes.length, m);
});

test('only bosses have voices, each its own; regular viruses make organic sounds', () => {
  const sig = (v) => `${v.pitch}:${v.vowel}:${v.syl}:${v.len}:${v.glide}:${v.growl || 0}:${v.vibrato || 0}:${v.breath || 0}`;
  const seen = new Map();
  for (const [id, ch] of Object.entries(CHARACTERS)) {
    if (!ch.voice) continue;
    const s = sig(ch.voice);
    assert.ok(!seen.has(s), `${id} sounds like ${seen.get(s)}`);
    seen.set(s, id);
    const { ctx, audio, mark } = engine();
    const m = mark();
    audio.voice(id);
    assert.ok(since(ctx, m).some((n) => n.kind === 'osc' && n.type === 'sawtooth'), `${id} growls`);
  }
  assert.ok(seen.size >= 8);
  // A popcorn wind-up, spawn, dive and death never use a voiced (sawtooth) formant.
  for (const ev of [{ type: 'telegraph', preset: 'cough', owner: 'w', x: 0 }, { type: 'spawn', kind: 'sneezer', x: 0 }, { type: 'dive-telegraph', x: 0 }, { type: 'kill', kind: 'heavy', x: 0 }, { type: 'telegraph', preset: 'sneeze', owner: 'w', x: 0, tele: 0.8 }]) {
    const { ctx, audio, mark } = engine();
    const m = mark();
    audio.event(ev, fixtureState({ enemies: [{ id: 'w', kind: 'sneezer', alive: true, x: 0 }] }));
    assert.ok(!since(ctx, m).some((n) => n.kind === 'osc' && n.type === 'sawtooth'), `${ev.type} ${ev.preset || ev.kind || ''} has no voice`);
  }
});

test('boss lines are vocalised as a low growl, in the right twin voice, never as babble', () => {
  const { ctx, audio, mark } = engine();
  const m = mark();
  const s = fixtureState({ boss: { type: 'betagamma', state: 'fight' }, enemies: [{ id: 1, kind: 'boss', part: 'twin', tag: 'G', alive: true, x: 2 }] });
  audio.event({ type: 'card-start', index: 1, cardType: 'card' }, s); // "G:LEFT! NO, YOUR LEFT!"
  const voices = since(ctx, m).filter((n) => n.kind === 'osc' && n.type === 'sawtooth');
  assert.equal(voices.length, 2, 'two growled syllables, whatever the line length');
  const gamma = CHARACTERS.gamma.voice.pitch;
  assert.ok(voices.every((o) => o.frequency.events[0][1] < gamma * 0.75), 'pitched down: menace, not speech');
});

test('15 adjuvant sounds: tiers escalate and stay distinct; the legendary stays under the boss defeat', () => {
  const play = (ev, st = fixtureState()) => {
    const { ctx, audio, mark } = engine(5);
    const m = mark();
    audio.event(ev, st);
    return since(ctx, m);
  };
  const tiers = ['common', 'rare', 'epic', 'legendary'];
  const shape = (nodes) => {
    const oscs = nodes.filter((n) => n.kind === 'osc' || n.kind === 'source');
    const end = Math.max(...oscs.map((n) => n.stopped)) - Math.min(...oscs.map((n) => n.started));
    // Spectral centroid proxy: oscillator start frequencies weighted by
    // their own envelope peaks.
    const pairs = nodes.filter((n) => n.kind === 'osc').map((o) => {
      const g = nodes.find((n) => n.kind === 'gain' && o.outputs.some((x) => x === n || x.outputs?.includes?.(n)));
      const peak = g ? Math.max(0, ...g.gain.events.filter((e) => e[0] === 'lin').map((e) => e[1])) : 0;
      return [o.frequency.events[0][1], peak];
    });
    const w = pairs.reduce((a, [, p]) => a + p, 0) || 1;
    return { peak: peakOf(nodes), length: end, centroid: pairs.reduce((a, [f, p]) => a + f * p, 0) / w };
  };
  const shapes = tiers.map((tier) => shape(play({ type: 'reveal', tier, slot: 1 })));
  for (let i = 1; i < 4; i++) {
    assert.ok(shapes[i].peak > shapes[i - 1].peak, `${tiers[i]} reveal is louder than ${tiers[i - 1]}`);
    assert.ok(shapes[i].length > shapes[i - 1].length, `${tiers[i]} reveal is longer`);
  }
  assert.equal(new Set(shapes.map((x) => Math.round(x.centroid / 50))).size, 4, `distinct centroids ${shapes.map((x) => x.centroid.toFixed(0))}`);
  // The legendary peak sits under the boss defeat's (the loudest payoff, -3.8 dBFS).
  const defeat = peakOf(play({ type: 'boss-defeated', boss: 'alpha', mid: false, x: 0 }, fixtureState({ boss: { type: 'alpha', state: 'fight' }, enemies: [] })));
  assert.ok(shapes[3].peak < defeat, `legendary ${shapes[3].peak} < defeat ${defeat}`);
  assert.ok(shapes[0].peak > LEVELS.shot, 'every reveal is louder than auto-fire');
  // The absorb crack is not the core-hit sound.
  const absorb = shape(play({ type: 'absorb', x: 0 })),
    hit = shape(play({ type: 'damage', x: 0 }, fixtureState({ enemies: [] })));
  assert.ok(Math.abs(absorb.centroid - hit.centroid) > 300, `absorb ${absorb.centroid.toFixed(0)} Hz vs vial lost ${hit.centroid.toFixed(0)} Hz`);
  for (const id of ['draft', 'reveal-common', 'reveal-rare', 'reveal-epic', 'legendary-riser', 'reveal-legendary', 'resample', 'adjuvant', 'discard', 'absorb', 'coat-reform', 'epipen']) assert.ok(SFX_CATALOG.some((e) => e.id === id), `${id} is catalogued`);
});
