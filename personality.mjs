/** Villain personality: who each virus is, how its body moves and reacts,
 * what a boss says and how everything sounds. Pure data and pure functions
 * (no DOM, no Three.js, no Web Audio), read by the renderer (idle life,
 * reactions, boss pits), the audio engine (voices) and the UI (name cards,
 * HUD taunts).
 *
 * User feedback, two rounds (translated): "the villains could have a bit
 * more personality; the theme reads generic", then "regular viruses don't
 * need little faces; bosses are fine as long as they have some personality;
 * make it more 3D, you are pulling the style toward cartoon again". So:
 *   - Regular viruses have no faces. Their character is 3D form and motion:
 *     silhouette, breathing, spike sway and twitches, how each rears up
 *     before an attack, flinches, shivers when weak and pops.
 *   - Bosses have no drawn faces either. Their menace is sculpted geometry
 *     (glowing pits sunk into the membrane, shapes.mjs `pits`) whose glow
 *     follows the boss's mood (bossMenace), plus posture and motion, a name
 *     card and one-line HUD taunts.
 *   - Nothing here changes the simulation. The model never imports this
 *     module; every function only reads the state it is given.
 *   - Colliders stay exactly as they are. Bodies never translate (no bob
 *     offset off the board plane). Squash, stretch and tilt are applied
 *     around the body centre and normalised so the drawn board footprint
 *     never exceeds the collider (bodyMotion); a hit flinch may shrink it by
 *     at most 8% for 0.14 s.
 *   - Taunts appear in the HUD's reserved top band, never over the board.
 */

/** Each character: a role and a one-line personality and idle motion; a
 * boss also has a voice (a low formant growl, audio.mjs) and `menace`. `menace` (bosses) sets how its
 * glowing pits behave at rest: base glow, pulse rate and jitter. */
export const CHARACTERS = Object.freeze({
  wild: {
    label: 'WILD TYPE',
    role: 'The grunt',
    line: 'Cheeky, eager and not very bright.',
    motion: { breathe: 2.1, amp: 0.05, sway: 0.3, march: 1, twitch: 3.4 },
  },
  mini: {
    label: 'WILD TYPE',
    role: 'The choir',
    line: 'Sixty tiny fans of the wild type, singing in rows.',
    motion: { breathe: 2.6, amp: 0.04, sway: 0.14, march: 1.4, twitch: 0 },
  },
  sneezer: {
    label: 'SNEEZER',
    role: 'The drama queen',
    line: 'Always about to sneeze, and wants you to know it.',
    motion: { breathe: 1.3, amp: 0.06, sway: 0.18, march: 0, twitch: 4.2, sniffle: 1 },
  },
  budder: {
    label: 'BUDDER',
    role: 'The show-off',
    line: 'Splits for attention. Two of it? Even better.',
    motion: { breathe: 1.9, amp: 0.05, sway: 0.12, march: 0, twitch: 0, wink: 3.1 },
    tilt: false,
  },
  worm: {
    label: 'RNA WORM',
    role: 'The sneak',
    line: 'Slithers past and never looks you in the eye.',
    motion: { breathe: 3, amp: 0.03, sway: 0, march: 0, twitch: 0 },
    tilt: false,
  },
  puff: {
    label: 'AEROSOL PUFF',
    role: 'The airhead',
    line: 'Giggly, spaced out, sprays everywhere.',
    motion: { breathe: 0.9, amp: 0.05, sway: 0.1, march: 0, twitch: 0, wander: 1 },
  },
  droplet: {
    label: 'DROPLET',
    role: 'The daredevil',
    line: 'Locks on, dives and screams the whole way down.',
    motion: { breathe: 3.2, amp: 0.04, sway: 0, march: 0, twitch: 2.5 },
    tilt: false,
  },
  hijacker: {
    label: 'HIJACKER',
    role: 'The schemer',
    line: 'Whispers, recruits and lets others take the hits.',
    motion: { breathe: 1.6, amp: 0.04, sway: 0.22, march: 0, twitch: 0, shifty: 1 },
  },
  cell: {
    label: 'INFECTED CELL',
    role: 'The victim',
    line: 'A host cell, feeling very, very sick.',
    motion: { breathe: 0.8, amp: 0.07, sway: 0.2, march: 0, twitch: 0, queasy: 1 },
  },
  heavy: {
    label: 'HEAVY CROWN',
    role: 'The brute',
    line: 'Slow, armoured and permanently furious.',
    motion: { breathe: 0.7, amp: 0.07, sway: 0.08, march: 0, twitch: 0 },
  },
  bloom: {
    label: 'BLOOM',
    role: 'The diva',
    line: 'Hides in its bud, then demands applause.',
    motion: { breathe: 1.5, amp: 0.04, sway: 0.15, march: 0, twitch: 0 },
  },
  vesicle: {
    label: 'VESICLE',
    role: 'The courier',
    line: 'Just a bubble with a delivery. Please do not pop it.',
    motion: { breathe: 1.2, amp: 0.04, sway: 0.1, march: 0, twitch: 0 },
  },
  virion: {
    label: 'VIRION',
    role: 'The coward',
    line: 'Runs from everything, you included.',
    motion: { breathe: 4.5, amp: 0.03, sway: 0.25, march: 0, twitch: 6 },
  },
  // ---- Bosses and their parts ------------------------------------------------
  alpha: {
    label: 'ALPHA',
    role: 'The original',
    line: 'Pompous, proud and still coughing.',
    menace: { glow: 1, pulse: 0.45, jitter: 0 },
    motion: { breathe: 0.6, amp: 0.035, sway: 0.12, march: 0, twitch: 0 },
    voice: { pitch: 138, vowel: 'o', syl: 2, len: 0.12, glide: 0.9 },
  },
  beta: {
    label: 'BETA',
    role: 'The snob twin',
    line: 'Tall, cool and bored of its sibling.',
    menace: { glow: 0.75, pulse: 0.3, jitter: 0 },
    motion: { breathe: 0.7, amp: 0.03, sway: 0, march: 0, twitch: 0 },
    voice: { pitch: 236, vowel: 'e', syl: 2, len: 0.1, glide: 0.95 },
    tilt: false,
  },
  gamma: {
    label: 'GAMMA',
    role: 'The hothead twin',
    line: 'Squat, loud and always yelling at its sibling.',
    menace: { glow: 1.3, pulse: 1.4, jitter: 0.4 },
    motion: { breathe: 1.1, amp: 0.045, sway: 0.14, march: 0, twitch: 2.2 },
    voice: { pitch: 178, vowel: 'a', syl: 1, len: 0.11, glide: 1.1, growl: 0.5 },
  },
  delta: {
    label: 'DELTA',
    role: 'The speedster',
    line: 'Impatient, aggressive, and it really splits in two.',
    menace: { glow: 1.2, pulse: 2, jitter: 0.8 },
    motion: { breathe: 1.6, amp: 0.035, sway: 0.1, march: 0, twitch: 5, jitter: 1 },
    voice: { pitch: 198, vowel: 'a', syl: 1, len: 0.06, glide: 0.8, growl: 0.4 },
  },
  half: {
    label: 'DELTA',
    role: 'Half a speedster',
    line: 'Twice the impatience.',
    menace: { glow: 1.2, pulse: 2.2, jitter: 0.8 },
    motion: { breathe: 1.9, amp: 0.035, sway: 0.1, march: 0, twitch: 5, jitter: 1 },
    voice: { pitch: 236, vowel: 'a', syl: 1, len: 0.05, glide: 0.8, growl: 0.3 },
  },
  omicron: {
    label: 'OMICRON PRIME',
    role: 'The mutant king',
    line: 'Never the same virus twice.',
    menace: { glow: 1.1, pulse: 0.9, jitter: 0.5 },
    motion: { breathe: 0.9, amp: 0.04, sway: 0.16, march: 0, twitch: 3, wander: 1 },
    voice: { pitch: 228, vowel: 'a', syl: 3, len: 0.07, glide: 1.2 },
  },
  node: {
    label: 'SPIKE NODE',
    role: 'The bodyguard',
    line: 'Guards the king, one attack each.',
    menace: { glow: 1, pulse: 1.2, jitter: 0.2 },
    motion: { breathe: 2.4, amp: 0.04, sway: 0.1, march: 0, twitch: 2 },
    voice: { pitch: 300, vowel: 'o', syl: 1, len: 0.06, glide: 0.9 },
  },
  bigsneezer: {
    label: 'BIG SNEEZER',
    role: 'The allergy',
    line: 'One enormous sneeze away from disaster.',
    menace: { glow: 0.8, pulse: 0.6, jitter: 0 },
    motion: { breathe: 1, amp: 0.06, sway: 0.15, march: 0, twitch: 3.6, sniffle: 1 },
    voice: { pitch: 210, vowel: 'a', syl: 1, len: 0.34, glide: 1.25 },
  },
  aerosolcloud: {
    label: 'AEROSOL CLOUD',
    role: 'The space cadet',
    line: 'Floats, sprays, forgets why.',
    menace: { glow: 0.9, pulse: 0.4, jitter: 0 },
    motion: { breathe: 0.7, amp: 0.05, sway: 0.12, march: 0, twitch: 0, wander: 1 },
    voice: { pitch: 520, vowel: 'i', syl: 3, len: 0.06, glide: 1.05, breath: 0.5 },
  },
  mother: {
    label: 'MOTHER CELL',
    role: 'The mother',
    line: 'Overbearing. Her children are the bullets.',
    menace: { glow: 0.8, pulse: 0.35, jitter: 0 },
    motion: { breathe: 0.8, amp: 0.05, sway: 0.1, march: 0, twitch: 0 },
    voice: { pitch: 186, vowel: 'o', syl: 2, len: 0.12, glide: 1.05 },
  },
  lambda: {
    label: 'LAMBDA',
    role: 'The copycat',
    line: 'Mirrors your every move.',
    menace: { glow: 1, pulse: 0.7, jitter: 0.1 },
    motion: { breathe: 1.1, amp: 0.035, sway: 0, march: 0, twitch: 0, mirror: 1 },
    voice: { pitch: 256, vowel: 'o', syl: 2, len: 0.08, glide: 1.1 },
    tilt: false,
  },
});

/** Character id for a live enemy (bosses map by boss type and part). */
export function characterOf(e, bossType) {
  if (!e) return 'wild';
  if (e.kind !== 'boss') return CHARACTERS[e.kind] ? e.kind : 'wild';
  if (e.part === 'twin') return e.tag === 'B' ? 'beta' : 'gamma';
  if (e.part === 'half') return 'half';
  if (e.part === 'node') return 'node';
  if (bossType === 'betagamma') return 'beta';
  return CHARACTERS[bossType] ? bossType : 'alpha';
}

// ---- Boss scripts: name cards and lines ------------------------------------------
// Short lines (<= 26 characters) shown in a speech bubble for about 1.4 s.
// A twin line starts with its speaker: "B:" (BETA) or "G:" (GAMMA).
export const BOSS_SCRIPT = Object.freeze({
  alpha: {
    title: 'THE ORIGINAL',
    line: 'POMPOUS, PROUD AND STILL COUGHING.',
    cards: ['AHEM. MIND YOUR MANNERS.', 'BLESS ME, PEASANT.', 'BEHOLD MY CROWN!', 'I AM THE CORONA!'],
    gloat: ['COVER YOUR MOUTH, VACCINE.', 'HO HO! THE ORIGINAL WINS.', 'AHEM. HOW VULGAR.'],
    defeat: 'I... WAS... FIRST...',
  },
  betagamma: {
    title: 'THE BICKERING TWINS',
    line: 'ONE VIRAL LOAD, TWO EGOS.',
    cards: ['B:YOUR SERVE.', 'G:LEFT! NO, YOUR LEFT!', 'B:GUESS WHICH ONE.', 'G:TOGETHER, FOR ONCE!'],
    gloat: ['G:HA! DID YOU SEE THAT?', 'B:I DID THAT, NOT YOU.', 'G:MY HIT! MINE!'],
    defeat: 'G:IT WAS HIS FAULT!',
  },
  delta: {
    title: 'THE SPEEDSTER',
    line: 'IMPATIENT, AGGRESSIVE, SPLITS IN TWO.',
    cards: ['TOO SLOW.', 'STAY IN YOUR LANE!', 'TWICE THE TROUBLE!', 'RIDE THE CURRENT!', 'DELTA MEANS DOMINANT.'],
    gloat: ['KEEP UP!', 'BLINK AND YOU MISS IT.', 'TOO SLOW, TOO SLOW!'],
    defeat: 'HOW... ARE YOU... FASTER?',
  },
  omicron: {
    title: 'THE MUTANT KING',
    line: 'NEVER THE SAME VIRUS TWICE.',
    cards: ['PICK A SPIKE, ANY SPIKE!', 'GESUNDHEIT!', 'WATCH ME CHANGE!', 'STUCK INSIDE? ME TOO!', 'SO MANY SPIKES!', 'R0 GOES UP, UP, UP!'],
    gloat: ['HAHAHA! AGAIN!', 'MUTATE THAT, VACCINE!', 'I CHANGED MY MIND!'],
    defeat: 'R0... BELOW... ONE?!',
  },
  bigsneezer: {
    title: 'THE ALLERGY',
    line: 'ONE ENORMOUS SNEEZE AWAY FROM DISASTER.',
    cards: ['AH... AH... AH...'],
    gloat: ['SORRY! ALLERGIES.'],
    defeat: '...BLESS ME.',
  },
  aerosolcloud: {
    title: 'THE SPACE CADET',
    line: 'FLOATS, SPRAYS, FORGETS WHY.',
    cards: ['HEE HEE. BREATHE IN!'],
    gloat: ['OOPS, WAS THAT ME?'],
    defeat: 'POOF...',
  },
  mother: {
    title: 'THE MOTHER',
    line: 'OVERBEARING. HER CHILDREN ARE THE BULLETS.',
    cards: ['MEET MY CHILDREN.', 'GO, BABIES, GO!', 'MOTHER KNOWS BEST.'],
    gloat: ['THAT IS WHAT YOU GET.'],
    defeat: 'MY BABIES...',
  },
  lambda: {
    title: 'THE COPYCAT',
    line: 'MIRRORS YOUR EVERY MOVE.',
    cards: ['COPY THAT.', 'COPY THAT, COPY THAT.'],
    gloat: ['I DID WHAT YOU DID.'],
    defeat: 'COPY... THAT...',
  },
});

/** Name card for a boss entrance: { name, title, line, mid }. */
/** Boss case files (RESEARCH_V1.md 5.2): the entrance card in the lab's
 * calm, clinical voice. The villain's own line stays below it. */
export const CASE_FILES = Object.freeze({
  alpha: 'VARIANT ALPHA · FIRST OF ITS LINE · COUGHS IN THREES · TEMPERAMENT: POMPOUS',
  betagamma: 'VARIANTS BETA AND GAMMA · ONE LOAD, TWO BODIES · TEMPERAMENT: BICKERING',
  delta: 'VARIANT DELTA · TRAVELS WITH THE FLOW · SPLITS ON CONTACT · TEMPERAMENT: IMPATIENT',
  omicron: 'VARIANT OMICRON PRIME · SPIKE HEAVILY MUTATED · TEMPERAMENT: MANIC',
  bigsneezer: 'SPECIMEN BIG SNEEZER · ODD FANS, TWO TIERS · TEMPERAMENT: DRAMATIC',
  aerosolcloud: 'SPECIMEN AEROSOL CLOUD · RANDOM MIST · TEMPERAMENT: VAGUE',
  lambda: 'VARIANT LAMBDA · LANE JETS, MIRRORS YOU · TEMPERAMENT: SLY',
  mother: 'SPECIMEN MOTHER CELL · REPLICATION SITE · TEMPERAMENT: PROTECTIVE',
});
export function bossCard(type, mid = false) {
  const sc = BOSS_SCRIPT[type];
  if (!sc) return null;
  const names = { alpha: 'ALPHA', betagamma: 'BETA & GAMMA', delta: 'DELTA', omicron: 'OMICRON PRIME', bigsneezer: 'BIG SNEEZER', aerosolcloud: 'AEROSOL CLOUD', mother: 'MOTHER CELL', lambda: 'LAMBDA' };
  return { name: names[type] || type.toUpperCase(), title: sc.title, line: sc.line, file: CASE_FILES[type] || '', mid };
}

/** The line a boss says for an event, or null. Deterministic (no random), so
 * the UI bubble, the mouth animation and the babble voice always agree.
 * Returns { text, speaker: 'B' | 'G' | null, mood: 'taunt' | 'gloat' | 'defeat' }. */
export function bossLine(ev, s) {
  const b = s?.boss;
  const type = ev.type === 'boss-defeated' ? ev.boss : b?.type;
  const sc = BOSS_SCRIPT[type];
  if (!sc) return null;
  let raw = null,
    mood = 'taunt';
  if (ev.type === 'card-start' && b && b.state !== 'defeated') raw = sc.cards[ev.index] ?? sc.cards.at(-1);
  else if (ev.type === 'damage' && b && b.state !== 'defeated' && b.state !== 'intro') {
    mood = 'gloat';
    raw = sc.gloat[Math.max(0, (s.sector?.vialsLost ?? 1) - 1) % sc.gloat.length];
  } else if (ev.type === 'boss-defeated') {
    mood = 'defeat';
    raw = sc.defeat;
  }
  if (!raw) return null;
  const m = /^([BG]):(.*)$/.exec(raw);
  return { text: m ? m[2] : raw, speaker: m ? m[1] : null, mood };
}

/** When a boss death's final pop lands (s after the defeat). The renderer's
 * visual pop and the audio boom both use it, so picture and sound hit
 * together; small pops lead up to it at DEFEAT_POPS (fractions of it). */
export const DEFEAT_FINAL = Object.freeze({ main: 1, mid: 0.55 });
export const DEFEAT_POPS = Object.freeze({ main: [0, 0.18, 0.34, 0.48, 0.6, 0.7, 0.78, 0.85], mid: [0, 0.16, 0.3, 0.42] });

/** Length of a spoken line in syllables: two per word, 2..8 (timing). */
export const syllablesOf = (text) => Math.max(2, Math.min(8, text.trim().split(/\s+/).length * 2));
/** How long a boss line is voiced and shown as active in the HUD (s). */
export const talkTime = (text) => 0.12 * syllablesOf(text) + 0.1;

// ---- Sector arrangements of the original march (RESEARCH_V1.md 5.1) ----------
/** One motif, four arrangements. `tempo(k)` maps how empty the board is (0
 * full .. 1 nearly empty) to beats per minute; LUNGS is locked to BREATH (80
 * bpm: an 8-beat phrase per 6 s breath). All synthesized in audio.mjs. */
export const ARRANGEMENTS = Object.freeze({
  airway: Object.freeze({ id: 'airway', label: 'DRY MARCH: BASS, TICK, CILIA SHAKER', tempo: (k) => 96 + 36 * k, phraseBeats: 4 }),
  lungs: Object.freeze({ id: 'lungs', label: 'BREATH-LOCKED PAD: OPENS ON THE INHALE', tempo: () => 80, phraseBeats: 8 }),
  blood: Object.freeze({ id: 'blood', label: 'HEARTBEAT LUB-DUB, HAT, ARPEGGIO WITH THE FLOW', tempo: (k) => 72 + 24 * k, phraseBeats: 4 }),
  cell: Object.freeze({ id: 'cell', label: '16-STEP SEQUENCER COPYING THE MARCH', tempo: (k) => 108 + 36 * k, phraseBeats: 4 }),
});
/** How empty the board is: 1 - alive / total of the stage's hostiles, or the
 * boss's lost share of its viral load. */
export function emptiness(s) {
  const b = s.boss;
  if (b && b.state !== 'defeated') return 1 - Math.max(0, b.hp) / Math.max(1, b.maxHp);
  let alive = 0,
    total = 0;
  for (const e of s.enemies) {
    if (e.harmless || e.kind === 'vesicle') continue;
    total++;
    if (e.alive) alive++;
  }
  return 1 - alive / Math.max(1, total);
}
/** The sector's tempo now (bpm). */
export const sectorTempo = (arrangement, s) => (ARRANGEMENTS[arrangement] || ARRANGEMENTS.airway).tempo(emptiness(s));

// ---- The march: the bass pulse that speeds up as a sample empties ---------------
/** Beats per minute of the Space Invaders march: 72 at a full sample or a full
 * viral load, 144 when it is nearly empty. Shared by the bass bed (audio) and
 * the choir's head-bob (renderer). */
export function marchTempo(s) {
  const b = s.boss;
  if (b && b.state !== 'defeated') return 72 + (1 - Math.max(0, b.hp) / Math.max(1, b.maxHp)) * 72;
  let alive = 0,
    total = 0;
  for (const e of s.enemies) {
    if (e.harmless || e.kind === 'vesicle') continue;
    total++;
    if (e.alive) alive++;
  }
  return 72 + (1 - alive / Math.max(1, total)) * 72;
}

// ---- Per-enemy phase ------------------------------------------------------------
/** Stable per-enemy phase in [0, 1): blinks and sways never march in lockstep
 * (except the choir, which shares the beat on purpose). */
export function hashPhase(id) {
  const str = String(id ?? '');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);


// ---- Boss menace: the glow of the pits sunk into a boss's membrane ---------------
/** How a boss's pits glow this frame: { glow, size } (glow 0 dark .. 2 flaring,
 * size multiplies the glowing core inside its socket, never the socket).
 * Context as for bodyMotion, plus `talk` (taunting) and `intro` (entrance
 * progress 0..1). The pits flare before an attack (the old "eyes narrow"
 * cue, now light instead of drawn lids), pulse while taunting, flicker when
 * hit or nearly beaten, glare when the player loses a vial and die out on
 * defeat. */
export function bossMenace(id, c = {}) {
  const ch = CHARACTERS[id] || CHARACTERS.alpha;
  const m = ch.menace || { glow: 1, pulse: 0.8, jitter: 0 };
  const t = c.t ?? 0,
    ph = hashPhase(c.id);
  let glow = m.glow * (0.85 + 0.15 * Math.sin(t * m.pulse * Math.PI * 2 + ph * 6));
  let size = 1;
  if (m.jitter) glow *= 1 + m.jitter * 0.25 * Math.sin(t * 37 + ph * 9);
  if (c.tele) {
    const k = smooth(clamp(c.tele.k * 1.3, 0, 1));
    glow = mix(glow, 2, k);
    size = mix(size, 1.3, k);
  }
  if (c.talk) glow *= 1.15 + 0.35 * Math.abs(Math.sin(t * 9));
  if ((c.gloat ?? 0) > 0) {
    glow = mix(glow, 1.9, c.gloat);
    size = mix(size, 1.2, c.gloat);
  }
  const hp = c.hp ?? 1;
  if (hp < 0.35) glow *= 0.6 + 0.4 * (Math.sin(t * 31 + ph) > -0.3 ? 1 : 0.2);
  if ((c.hurt ?? 0) > 0) glow *= 1 - 0.6 * clamp(c.hurt, 0, 1);
  if (c.intro !== undefined && c.intro < 1) {
    const k = smooth(clamp((c.intro - 0.2) / 0.6, 0, 1));
    glow *= k;
    size *= 0.6 + 0.4 * k;
  }
  if (c.dying !== undefined) {
    const d = clamp(c.dying, 0, 1);
    glow = (1 - d) * (1.6 + 0.6 * Math.sin(t * 47));
    size *= 1 - 0.5 * d;
  }
  return { glow: clamp(glow, 0, 2.2), size: clamp(size, 0.3, 1.35) };
}

// ---- Body motion (squash, stretch, tilt; never translation) ---------------------
/** Horizontal half-extents of a unit ellipsoid with semi-axes (ax, ay, az)
 * after pitch (about x) then roll (about z): world = Rz(roll) Rx(pitch) D. */
export function footprint(ax, ay, az, pitch = 0, roll = 0) {
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch),
    cr = Math.cos(roll),
    sr = Math.sin(roll);
  // Rx: rows (1,0,0) (0,cp,-sp) (0,sp,cp); Rz: rows (cr,-sr,0) (sr,cr,0) (0,0,1).
  // M = Rz * Rx: row x = (cr, -sr*cp, sr*sp); row z = (0, sp, cp).
  const ex = Math.hypot(cr * ax, -sr * cp * ay, sr * sp * az);
  const ez = Math.hypot(0, sp * ay, cp * az);
  return Math.max(ex, ez);
}

/** Squash, stretch and tilt for one enemy this frame. `aspect` is the body's
 * vertical stretch from shapes.mjs (BETA 1.38, GAMMA 0.7). The result is
 * scaled down until the drawn board footprint is at most the collider
 * (footprint <= 1): personality never draws a body bigger than what hits.
 * Returns { sx, sy, sz, pitch, roll, yaw, crown } (crown: decorative spike
 * scale, applied only to separately built crowns). */
export function bodyMotion(id, c = {}, aspect = 1) {
  const ch = CHARACTERS[id] || CHARACTERS.wild;
  const m = ch.motion;
  const t = c.t ?? 0,
    ph = hashPhase(c.id);
  let sx = 1,
    sy = 1,
    pitch = 0,
    roll = 0,
    yaw = 0,
    crown = 1;
  // Breathing: a vertical swell, with the footprint easing in (never out).
  const br = Math.sin(t * m.breathe * Math.PI * 2 * 0.5 + ph * 6.28);
  sy *= 1 + m.amp * br;
  sx *= 1 - m.amp * 0.35 * (0.5 + 0.5 * br);
  // The march: the choir bobs on the beat, swaying left and right.
  if (m.march && c.beat !== undefined) {
    const pulse = Math.max(0, Math.cos(c.beat * Math.PI * 2)) ** 6;
    sy *= 1 + 0.07 * m.march * pulse;
    roll += 0.1 * m.march * Math.sin(c.beat * Math.PI) * (c.beatOdd ? -1 : 1);
  }
  // Idle sway of the crown (yaw) and a spike twitch every few seconds.
  yaw = m.sway * Math.sin(t * 0.7 + ph * 9);
  if (m.twitch) {
    const tt = (t + ph * 13) % m.twitch;
    if (tt < 0.12) yaw += 0.25 * Math.sin((tt / 0.12) * Math.PI);
  }
  if (m.sniffle) {
    const st = (t + ph * 7) % 3.7;
    if (st < 0.25) sy *= 1 + 0.08 * Math.sin((st / 0.25) * Math.PI * 2);
  }
  if (m.queasy) roll += 0.06 * Math.sin(t * 2.1 + ph * 5);
  if (m.jitter) yaw += 0.04 * Math.sin(t * 31 + ph * 3);
  // Telegraph: anticipation. The body rears up (stretch toward the camera)
  // and the decorative spikes bristle; the sneeze inhale stretches most.
  if (c.tele) {
    const k = clamp(c.tele.k, 0, 1);
    if (c.tele.preset === 'sneeze') {
      sy *= 1 + 0.3 * smooth(Math.min(1, k * 1.2));
      crown = 1 + 0.3 * smooth(Math.min(1, k * 1.2));
      pitch -= 0.18 * smooth(k);
    } else {
      sy *= 1 + 0.12 * Math.sin(k * Math.PI);
      crown = 1 + 0.12 * Math.sin(k * Math.PI);
    }
  }
  // Just sneezed: the recoil squash (vertical only).
  if (c.recoil > 0) {
    sy *= 1 - 0.22 * c.recoil;
    pitch += 0.22 * c.recoil;
  }
  // Hit: a flinch upward; the footprint shrinks at most 8%.
  if (c.hurt > 0) {
    const w = clamp(c.hurt, 0, 1);
    sx *= 1 - 0.08 * w;
    sy *= 1 + 0.16 * w;
  }
  // Smug laugh when the player is hit: little bounces.
  if (c.gloat > 0) sy *= 1 + 0.07 * c.gloat * Math.abs(Math.sin(t * 14));
  // Panic: a shiver (rotation only; the body never moves off its collider).
  const hp = c.hp ?? 1;
  if (hp < 0.35 && id !== 'mini') {
    const p = clamp((0.35 - hp) / 0.2, 0, 1);
    yaw += 0.08 * p * Math.sin(t * 38 + ph);
    roll += 0.05 * p * Math.sin(t * 29 + ph * 2);
  }
  // Boss landing at the end of its entrance slide.
  if (c.land > 0) sy *= 1 - 0.18 * Math.sin(c.land * Math.PI);
  // Death sequence: a swelling shiver before the pop (no collider remains).
  if (c.dying !== undefined) {
    const d = clamp(c.dying, 0, 1);
    yaw += 0.3 * d * Math.sin(t * 50);
    roll += 0.15 * d * Math.sin(t * 43);
    sy *= 1 + 0.25 * d;
  }
  // Capsule bodies (BUDDER, RNA WORM) and tall eggs never tilt: tilting them
  // would swing their long axis over the board.
  if (ch.tilt === false) pitch = roll = 0;
  let sz = sx;
  // Normalise: at rest every body's footprint is exactly 1 (the collider);
  // any squash, stretch or tilt that would widen it is scaled back to 1.
  if (c.dying === undefined) {
    const f = footprint(sx, sy * aspect, sz, pitch, roll);
    if (f > 1) {
      sx /= f;
      sy /= f;
      sz /= f;
    }
  }
  return { sx, sy, sz, pitch, roll, yaw, crown };
}
