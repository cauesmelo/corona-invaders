/** v1.0 release facts (common/docs/V1_RELEASE_PLAN.md): the version a player
 * sees matches package.json and the changelog, the credits name the original
 * game, three.js and the synthesized sound, and the itch.io embed settings
 * are decided (common/scripts/release-gate.mjs reads the same files). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VERSION, creditsCard } from '../ui.mjs';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('the title label, package.json and CHANGELOG.md agree on v1.0', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.version, '1.0.0');
  const [major, minor] = pkg.version.split('.');
  assert.equal(VERSION, `v${major}.${minor}`);
  assert.match(await read('index.html'), new RegExp(`id="version-tag">${VERSION.replace('.', '\\.')}<`), 'the label is DOM text in the page');
  assert.match(await read('CHANGELOG.md'), /^## \[1\.0\.0\] - \d{4}-\d{2}-\d{2}$/m);
});

test('in-game credits: the original game and its author, three.js (MIT), synthesized sound, the march', () => {
  const text = creditsCard().replace(/<[^>]+>/g, ' ');
  for (const s of ['Credits', 'Original Corona Invaders by Cauê Melo', 'three.js', 'MIT licence', 'synthesized', 'Space Invaders']) assert.ok(text.includes(s), s);
});

test('itch.json: the 960x640 game surface, fullscreen, click to play, an explicit mobile decision', async () => {
  const { embed } = JSON.parse(await read('itch.json'));
  assert.equal(embed.width, 960);
  assert.equal(embed.height, 640);
  assert.equal(embed.fullscreenButton, true);
  assert.equal(embed.clickToPlay, true);
  assert.equal(typeof embed.mobileFriendly, 'boolean');
  assert.ok(['portrait', 'landscape', 'default'].includes(embed.orientation));
});
