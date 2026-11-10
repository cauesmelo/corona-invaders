/** Personality and sector identity (RESEARCH_V1.md 5, test T14): the lab
 * voice is calm (<= 60 characters, no exclamation marks outside card names
 * and taunts), each sector has a magnification, a backdrop, a music
 * arrangement and a FIELD NOTE, the lungs' phrase is one breath, and the
 * march speeds up as the board empties. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS, WORLDS, PROLOGUE, update } from '../model.mjs';
import { ARRANGEMENTS, sectorTempo, CASE_FILES, emptiness } from '../personality.mjs';
import { running, quiet, group } from './helpers.mjs';

test('T14: every stage has a lab-voice intro and PROTOCOL line of at most 60 characters, no "!"', () => {
  for (const l of LEVELS) {
    for (const text of [l.intro.text, l.protocol]) {
      assert.ok(text && text.length <= 60, `${l.code}: "${text}" (${text?.length})`);
      assert.ok(!text.includes('!'), `${l.code}: no exclamation mark`);
      assert.equal(text, text.toUpperCase());
    }
  }
  const src = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
  for (const m of src.matchAll(/hintOnce\('[^']+', '([^']+)'\)/g)) {
    assert.ok(m[1].length <= 60 && !m[1].includes('!'), m[1]);
    assert.ok(m[1].startsWith('PROTOCOL: '), `one-time hints are PROTOCOL lines: ${m[1]}`);
  }
  for (const f of Object.values(CASE_FILES)) assert.ok(!f.includes('!'), f);
});

test('T14: each sector has a magnification, a backdrop, a music arrangement and a FIELD NOTE', () => {
  assert.deepEqual(WORLDS.map((w) => w.zoom), [40, 400, 4000, 40000], 'one magnification step deeper each');
  assert.deepEqual(WORLDS.map((w) => w.name), ['AIRWAY', 'LUNGS', 'BLOODSTREAM', 'THE CELL']);
  for (const w of WORLDS) {
    assert.ok(w.backdrop && w.site, w.name);
    assert.ok(ARRANGEMENTS[w.music], `${w.name} music ${w.music}`);
    assert.ok(w.note && w.note.length <= 90 && !w.note.includes('!'), w.note);
  }
  assert.equal(new Set(WORLDS.map((w) => w.music)).size, 4, 'four arrangements of one motif');
  assert.ok(PROLOGUE.startsWith('SPECIMEN RECEIVED'));
  assert.ok(WORLDS[3].note.includes('CONTAINED'));
  // The story tells no patients and no deaths (RESEARCH_BULLET_HELL 4.3).
  for (const text of [PROLOGUE, ...WORLDS.map((w) => w.note)]) assert.ok(!/\b(PATIENT|DIE|DEAD|DEATH|KILL)\b/.test(text), text);
});

test("T14: LUNGS' phrase equals the BREATH period (8 beats at 80 bpm = 6 s)", () => {
  const a = ARRANGEMENTS.lungs;
  const s = running(42, 4);
  const bpm = sectorTempo('lungs', s);
  assert.equal((a.phraseBeats * 60) / bpm, 6);
});

test('T14: the march tempo rises as the formation empties (every sector)', () => {
  for (const id of ['airway', 'blood', 'cell']) {
    const s = quiet(1);
    const alive = group(s, ['WWWW']);
    const full = sectorTempo(id, s);
    alive[0].alive = alive[1].alive = alive[2].alive = false;
    assert.ok(sectorTempo(id, s) > full, id);
    assert.ok(Math.abs(emptiness(s) - 0.75) < 1e-9);
  }
});

test('T14: the LAB REPORT carries specimen, EXPOSURE, INJECTIONS, R0 + verdict, doses lost, time, medal and an assessment', () => {
  const s = running(42, 1);
  for (const e of s.enemies) e.alive = false;
  s.sector.step = 1e9;
  update(s, 0.3);
  const r = s.events.find((e) => e.type === 'wave') || s.medals[1];
  for (const key of ['code', 'name', 'site', 'zoom', 'exposure', 'injections', 'r0', 'verdict', 'vialsLost', 'time', 'medal', 'assessment']) assert.ok(r[key] !== undefined, key);
  assert.equal(r.verdict, 'CONTAINED');
  assert.ok(!r.assessment.includes('!'));
});
