/** Villain personality: who each virus is, how its face and body act, what it
 * says and how it sounds. Pure data and pure functions (no DOM, no Three.js,
 * no Web Audio), read by the renderer (faces, idle life, reactions), the
 * audio engine (voice blips, babble) and the UI (name cards, taunts).
 *
 * User feedback (revision five, translated): "the villains could have a bit
 * more personality; the theme is great but it reads generic." Rules that keep
 * a bullet hell readable while adding character:
 *   - Nothing here changes the simulation. The model never imports this
 *     module; every function only reads the state it is given.
 *   - Colliders stay exactly as they are. Bodies never translate (no bob
 *     offset off the board plane). Squash, stretch and tilt are applied
 *     around the body centre and normalised so the drawn board footprint
 *     never exceeds the collider (bodyMotion); a hit flinch may shrink it by
 *     at most 8% for 0.14 s. The sneeze inhale used to swell the body 1.25x
 *     past its collider and the hit punch 1.14x: both now stretch upward and
 *     bristle the decorative spikes instead.
 *   - Faces are decals inside the body silhouette (faceReach), drawn under
 *     every bullet; they never enlarge the drawn body.
 *   - Speech only appears when bullets have just been cancelled (card
 *     starts, the player losing a vial, a boss defeat), never over a live
 *     pattern the player has to read.
 *
 * Face units: a face decal spans [-1, 1] in both axes (y up on screen); its
 * half-size is FACE.scale x the anchor radius. Mood values:
 *   open   eyelid opening 0 closed .. 1 open .. 1.5 wide (surprise, panic)
 *   brow   -1 angry (inner ends down) .. 0 .. +1 worried (inner ends up)
 *   curve  -1 frown .. +1 smile;  mouth 0 closed .. 1 wide open
 *   smirk  one-sided: right mouth corner and right brow up
 *   squint hurt ">.<";  sweat panic drop;  dead "X X"
 */

/** Face decal placement: the decal faces a direction tilted FACE.tilt
 * radians from the camera toward the syringe (+z), so viruses look at you. */
export const FACE = Object.freeze({ scale: 0.78, tilt: 0.21, eyeY: 0.16, mouthY: -0.42 });

const face = (o = {}) => ({ size: 0.25, gap: 0.33, tall: 1.05, pupil: 0.45, lid: 0, teeth: 0, mouthW: 0.34, brows: 1, lashes: 0, mismatch: 0, scale: FACE.scale, iris: '#0f4a2a', ink: '#08140d', ...o });
const rest = (o = {}) => ({ open: 1, brow: 0, curve: 0.2, mouth: 0, smirk: 0, ...o });

/** Each character: a role and a one-line personality, a face style and rest
 * mood, idle motion and a voice. `anchor` places the face on a body part in
 * mesh units (at, r, aspect = the body's vertical stretch). */
export const CHARACTERS = Object.freeze({
  wild: {
    label: 'WILD TYPE',
    role: 'The grunt',
    line: 'Cheeky, eager and not very bright.',
    face: face({ size: 0.27, pupil: 0.42, teeth: 1, mouthW: 0.36, iris: '#0d5c30' }),
    rest: rest({ curve: 0.6, brow: 0.1 }),
    motion: { breathe: 2.1, amp: 0.05, sway: 0.3, march: 1, twitch: 3.4 },
    voice: { pitch: 262, vowel: 'u', syl: 1, len: 0.07, glide: 1.3 },
  },
  mini: {
    label: 'WILD TYPE',
    role: 'The choir',
    line: 'Sixty tiny fans of the wild type, singing in rows.',
    face: face({ size: 0.3, gap: 0.3, pupil: 0.58, brows: 0, mouthW: 0.2, scale: 0.86, iris: '#0b3b20' }),
    rest: rest({ curve: 0.2, mouth: 0.35 }),
    motion: { breathe: 2.6, amp: 0.04, sway: 0.14, march: 1.4, twitch: 0 },
    voice: { pitch: 622, vowel: 'i', syl: 1, len: 0.045, glide: 1.15 },
  },
  sneezer: {
    label: 'SNEEZER',
    role: 'The drama queen',
    line: 'Always about to sneeze, and wants you to know it.',
    face: face({ size: 0.24, tall: 0.9, pupil: 0.4, lid: 0.55, iris: '#1f6f62' }),
    rest: rest({ open: 0.62, brow: 0.65, curve: -0.25 }),
    motion: { breathe: 1.3, amp: 0.06, sway: 0.18, march: 0, twitch: 4.2, sniffle: 1 },
    voice: { pitch: 300, vowel: 'a', syl: 1, len: 0.3, glide: 1.25 },
    anchor: { aspect: 0.85 },
  },
  budder: {
    label: 'BUDDER',
    role: 'The show-off',
    line: 'Splits for attention. Two of it? Even better.',
    face: face({ size: 0.24, gap: 0.46, pupil: 0.46, teeth: 1, mouthW: 0.48, scale: 0.84, iris: '#0d6a37' }),
    rest: rest({ curve: 0.85, smirk: 0.3, brow: 0.25 }),
    motion: { breathe: 1.9, amp: 0.05, sway: 0.12, march: 0, twitch: 0, wink: 3.1 },
    voice: { pitch: 330, vowel: 'a', syl: 2, len: 0.08, glide: 1.33 },
    tilt: false,
  },
  worm: {
    label: 'RNA WORM',
    role: 'The sneak',
    line: 'Slithers past and never looks you in the eye.',
    face: face({ size: 0.25, tall: 0.55, gap: 0.32, pupil: 0.55, lid: -0.6, brows: 0, mouthW: 0.3, scale: 0.9, iris: '#2f7a1d' }),
    rest: rest({ open: 0.55, curve: 0.35, smirk: 0.6 }),
    motion: { breathe: 3, amp: 0.03, sway: 0, march: 0, twitch: 0 },
    voice: { pitch: 220, vowel: 'i', syl: 1, len: 0.16, glide: 0.7, breath: 0.7 },
    anchor: { at: [0, 0, 0.9], r: 0.3 },
    tilt: false,
  },
  puff: {
    label: 'AEROSOL PUFF',
    role: 'The airhead',
    line: 'Giggly, spaced out, sprays everywhere.',
    face: face({ size: 0.22, gap: 0.28, pupil: 0.36, lid: 0.3, brows: 0, mouthW: 0.16, scale: 0.7, iris: '#2b8a5b' }),
    rest: rest({ open: 0.55, mouth: 0.5, curve: 0.2 }),
    motion: { breathe: 0.9, amp: 0.05, sway: 0.1, march: 0, twitch: 0, wander: 1 },
    voice: { pitch: 640, vowel: 'i', syl: 3, len: 0.05, glide: 1.1, breath: 0.4 },
    anchor: { r: 0.5 },
  },
  droplet: {
    label: 'DROPLET',
    role: 'The daredevil',
    line: 'Locks on, dives and screams the whole way down.',
    face: face({ size: 0.28, pupil: 0.5, brows: 2, teeth: 1, scale: 0.9, iris: '#3c7f12' }),
    rest: rest({ brow: -0.8, open: 0.75, curve: 0.1 }),
    motion: { breathe: 3.2, amp: 0.04, sway: 0, march: 0, twitch: 2.5 },
    voice: { pitch: 420, vowel: 'i', syl: 1, len: 0.32, glide: 2.1 },
    anchor: { r: 0.24 },
    tilt: false,
  },
  hijacker: {
    label: 'HIJACKER',
    role: 'The schemer',
    line: 'Whispers, recruits and lets others take the hits.',
    face: face({ size: 0.25, pupil: 0.4, lid: -0.3, iris: '#6b8f14' }),
    rest: rest({ open: 0.7, curve: 0.5, smirk: 0.85 }),
    motion: { breathe: 1.6, amp: 0.04, sway: 0.22, march: 0, twitch: 0, shifty: 1 },
    voice: { pitch: 168, vowel: 'e', syl: 2, len: 0.09, glide: 0.85 },
  },
  cell: {
    label: 'INFECTED CELL',
    role: 'The victim',
    line: 'A host cell, feeling very, very sick.',
    face: face({ size: 0.22, gap: 0.3, pupil: 0.3, lid: 0.4, mouthW: 0.3, iris: '#55705f', ink: '#1a2a22' }),
    rest: rest({ open: 0.55, brow: 0.75, curve: -0.6, mouth: 0.15 }),
    motion: { breathe: 0.8, amp: 0.07, sway: 0.2, march: 0, twitch: 0, queasy: 1 },
    voice: { pitch: 128, vowel: 'u', syl: 1, len: 0.14, glide: 0.8 },
  },
  heavy: {
    label: 'HEAVY CROWN',
    role: 'The brute',
    line: 'Slow, armoured and permanently furious.',
    face: face({ size: 0.2, gap: 0.29, tall: 0.8, pupil: 0.58, brows: 3, teeth: 3, mouthW: 0.38, scale: 0.72, iris: '#24300f' }),
    rest: rest({ brow: -1, open: 0.7, curve: -0.4, mouth: 0.25 }),
    motion: { breathe: 0.7, amp: 0.07, sway: 0.08, march: 0, twitch: 0 },
    voice: { pitch: 84, vowel: 'o', syl: 1, len: 0.2, glide: 0.9, growl: 1 },
  },
  bloom: {
    label: 'BLOOM',
    role: 'The diva',
    line: 'Hides in its bud, then demands applause.',
    face: face({ size: 0.27, pupil: 0.45, lashes: 1, scale: 0.86, iris: '#2d9c46' }),
    rest: rest({ open: 0.5, curve: 0.55, brow: 0.3 }),
    motion: { breathe: 1.5, amp: 0.04, sway: 0.15, march: 0, twitch: 0 },
    voice: { pitch: 523, vowel: 'a', syl: 1, len: 0.32, glide: 1, vibrato: 1 },
  },
  vesicle: {
    label: 'VESICLE',
    role: 'The courier',
    line: 'Just a bubble with a delivery. Please do not pop it.',
    face: face({ size: 0.21, gap: 0.28, pupil: 0.52, brows: 0, mouthW: 0.22, scale: 0.6, iris: '#3e6a76', ink: '#11202a' }),
    rest: rest({ curve: 0.5 }),
    motion: { breathe: 1.2, amp: 0.04, sway: 0.1, march: 0, twitch: 0 },
    voice: { pitch: 300, vowel: 'o', syl: 1, len: 0.12, glide: 0.7 },
  },
  virion: {
    label: 'VIRION',
    role: 'The coward',
    line: 'Runs from everything, you included.',
    face: face({ size: 0.3, gap: 0.3, pupil: 0.3, mouthW: 0.26, iris: '#1d7a45' }),
    rest: rest({ open: 1.3, brow: 0.9, curve: -0.5, mouth: 0.35 }),
    motion: { breathe: 4.5, amp: 0.03, sway: 0.25, march: 0, twitch: 6 },
    voice: { pitch: 760, vowel: 'i', syl: 1, len: 0.08, glide: 1.25 },
  },
  // ---- Bosses and their parts ------------------------------------------------
  alpha: {
    label: 'ALPHA',
    role: 'The original',
    line: 'Pompous, proud and still coughing.',
    face: face({ size: 0.2, gap: 0.3, tall: 0.85, pupil: 0.4, brows: 2, mouthW: 0.36, scale: 0.72, iris: '#12ce5d' }),
    rest: rest({ open: 0.6, brow: -0.2, curve: 0.45, smirk: 0.35 }),
    motion: { breathe: 0.6, amp: 0.035, sway: 0.12, march: 0, twitch: 0 },
    voice: { pitch: 138, vowel: 'o', syl: 2, len: 0.12, glide: 0.9 },
  },
  beta: {
    label: 'BETA',
    role: 'The snob twin',
    line: 'Tall, cool and bored of its sibling.',
    face: face({ size: 0.2, gap: 0.27, tall: 1, pupil: 0.36, lid: 0.2, scale: 0.68, iris: '#1fc9a4' }),
    rest: rest({ open: 0.45, brow: 0.15, curve: 0.05, smirk: 0.5 }),
    motion: { breathe: 0.7, amp: 0.03, sway: 0, march: 0, twitch: 0 },
    voice: { pitch: 236, vowel: 'e', syl: 2, len: 0.1, glide: 0.95 },
    anchor: { aspect: 1.38 },
    tilt: false,
  },
  gamma: {
    label: 'GAMMA',
    role: 'The hothead twin',
    line: 'Squat, loud and always yelling at its sibling.',
    face: face({ size: 0.24, gap: 0.35, tall: 0.8, pupil: 0.5, brows: 2, teeth: 1, mouthW: 0.44, scale: 0.7, iris: '#8fd23a' }),
    rest: rest({ open: 1, brow: -0.9, curve: -0.3, mouth: 0.4 }),
    motion: { breathe: 1.1, amp: 0.045, sway: 0.14, march: 0, twitch: 2.2 },
    voice: { pitch: 178, vowel: 'a', syl: 1, len: 0.11, glide: 1.1, growl: 0.5 },
    anchor: { aspect: 0.7 },
  },
  delta: {
    label: 'DELTA',
    role: 'The speedster',
    line: 'Impatient, aggressive, and it really splits in two.',
    face: face({ size: 0.22, gap: 0.3, tall: 0.7, pupil: 0.5, lid: -0.7, brows: 2, teeth: 2, mouthW: 0.44, scale: 0.72, iris: '#c6e04a' }),
    rest: rest({ open: 0.75, brow: -0.7, curve: 0.7, mouth: 0.25 }),
    motion: { breathe: 1.6, amp: 0.035, sway: 0.1, march: 0, twitch: 5, jitter: 1 },
    voice: { pitch: 198, vowel: 'a', syl: 1, len: 0.06, glide: 0.8, growl: 0.4 },
  },
  half: {
    label: 'DELTA',
    role: 'Half a speedster',
    line: 'Twice the impatience.',
    face: face({ size: 0.24, gap: 0.3, tall: 0.7, pupil: 0.52, lid: -0.8, brows: 2, teeth: 2, mouthW: 0.4, scale: 0.74, iris: '#d4ea62' }),
    rest: rest({ open: 0.8, brow: -0.85, curve: 0.6, mouth: 0.3 }),
    motion: { breathe: 1.9, amp: 0.035, sway: 0.1, march: 0, twitch: 5, jitter: 1 },
    voice: { pitch: 236, vowel: 'a', syl: 1, len: 0.05, glide: 0.8, growl: 0.3 },
  },
  omicron: {
    label: 'OMICRON PRIME',
    role: 'The mutant king',
    line: 'Never the same virus twice.',
    face: face({ size: 0.22, gap: 0.33, pupil: 0.34, mismatch: 0.35, teeth: 1, mouthW: 0.5, scale: 0.72, iris: '#a8ff3c' }),
    rest: rest({ open: 1.12, brow: 0.3, curve: 0.9, mouth: 0.35 }),
    motion: { breathe: 0.9, amp: 0.04, sway: 0.16, march: 0, twitch: 3, wander: 1 },
    voice: { pitch: 228, vowel: 'a', syl: 3, len: 0.07, glide: 1.2 },
  },
  node: {
    label: 'SPIKE NODE',
    role: 'The bodyguard',
    line: 'Guards the king, one attack each.',
    face: face({ size: 0.26, gap: 0.3, pupil: 0.5, brows: 2, mouthW: 0.28, scale: 0.8, iris: '#7fbf2a' }),
    rest: rest({ brow: -0.8, open: 0.8, curve: -0.3 }),
    motion: { breathe: 2.4, amp: 0.04, sway: 0.1, march: 0, twitch: 2 },
    voice: { pitch: 300, vowel: 'o', syl: 1, len: 0.06, glide: 0.9 },
  },
  bigsneezer: {
    label: 'BIG SNEEZER',
    role: 'The allergy',
    line: 'One enormous sneeze away from disaster.',
    face: face({ size: 0.22, gap: 0.34, tall: 0.88, pupil: 0.38, lid: 0.6, brows: 2, mouthW: 0.4, scale: 0.74, iris: '#1f6f62' }),
    rest: rest({ open: 0.55, brow: 0.8, curve: -0.35 }),
    motion: { breathe: 1, amp: 0.06, sway: 0.15, march: 0, twitch: 3.6, sniffle: 1 },
    voice: { pitch: 210, vowel: 'a', syl: 1, len: 0.34, glide: 1.25 },
    anchor: { aspect: 0.85 },
  },
  aerosolcloud: {
    label: 'AEROSOL CLOUD',
    role: 'The space cadet',
    line: 'Floats, sprays, forgets why.',
    face: face({ size: 0.22, gap: 0.3, pupil: 0.34, lid: 0.35, brows: 1, mouthW: 0.2, scale: 0.82, iris: '#1fc9a4' }),
    rest: rest({ open: 0.5, brow: 0.35, mouth: 0.45, curve: 0.3 }),
    motion: { breathe: 0.7, amp: 0.05, sway: 0.12, march: 0, twitch: 0, wander: 1 },
    voice: { pitch: 520, vowel: 'i', syl: 3, len: 0.06, glide: 1.05, breath: 0.5 },
    anchor: { r: 0.42 },
  },
  mother: {
    label: 'MOTHER CELL',
    role: 'The mother',
    line: 'Overbearing. Her children are the bullets.',
    face: face({ size: 0.2, gap: 0.3, pupil: 0.42, lashes: 1, mouthW: 0.32, scale: 0.66, iris: '#4f8a66', ink: '#14231b' }),
    rest: rest({ open: 0.7, brow: 0.45, curve: 0.35 }),
    motion: { breathe: 0.8, amp: 0.05, sway: 0.1, march: 0, twitch: 0 },
    voice: { pitch: 186, vowel: 'o', syl: 2, len: 0.12, glide: 1.05 },
  },
  lambda: {
    label: 'LAMBDA',
    role: 'The copycat',
    line: 'Mirrors your every move.',
    face: face({ size: 0.22, gap: 0.3, tall: 1.1, pupil: 0.42, mouthW: 0.3, scale: 0.7, iris: '#c6e04a' }),
    rest: rest({ open: 0.85, curve: 0.3, smirk: 0.6 }),
    motion: { breathe: 1.1, amp: 0.035, sway: 0, march: 0, twitch: 0, mirror: 1 },
    voice: { pitch: 256, vowel: 'o', syl: 2, len: 0.08, glide: 1.1 },
    anchor: { aspect: 1.15 },
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
    gloat: ['COVER YOUR MOUTH NEXT TIME.', 'HO HO! THE ORIGINAL WINS.', 'MANNERS, VACCINE.'],
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
export function bossCard(type, mid = false) {
  const sc = BOSS_SCRIPT[type];
  if (!sc) return null;
  const names = { alpha: 'ALPHA', betagamma: 'BETA & GAMMA', delta: 'DELTA', omicron: 'OMICRON PRIME', bigsneezer: 'BIG SNEEZER', aerosolcloud: 'AEROSOL CLOUD', mother: 'MOTHER CELL', lambda: 'LAMBDA' };
  return { name: names[type] || type.toUpperCase(), title: sc.title, line: sc.line, mid };
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

/** Babble length for a spoken line: two syllables per word, 2..8. */
export const syllablesOf = (text) => Math.max(2, Math.min(8, text.trim().split(/\s+/).length * 2));
/** How long the mouth flaps for a line (s). */
export const talkTime = (text) => 0.12 * syllablesOf(text) + 0.1;

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

// ---- Faces --------------------------------------------------------------------
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

/** Telegraph expressions per pattern preset: what the face does while a
 * virus winds up an attack (on top of its rest mood). */
const TELE_FACE = {
  cough: { open: 0.55, brow: -0.6, curve: 0, mouth: 0.15, puff: 1 },
  sneeze: { open: 0.15, brow: 0.9, curve: -0.2, mouth: 0.9 },
  ring: { open: 0.9, brow: -0.5, curve: 0.7, mouth: 0.4 },
  bloom: { open: 1.1, brow: -0.3, curve: 0.9, mouth: 0.6 },
  strand: { open: 0.4, brow: -0.6, curve: 0.5, mouth: 0.1 },
  aerosol: { open: 0.3, brow: 0.2, curve: 0.2, mouth: 0.8 },
  default: { open: 0.4, brow: -0.8, curve: -0.1, mouth: 0.3 },
};

/** The face for one enemy this frame. `c` (context, all optional):
 *   t       visual time (s)          id      enemy id (blink phase)
 *   look    [dx, dz] to the syringe  hurt    0..1 just hit (decays)
 *   tele    { preset, k } wind-up    talk    0..1 speaking (mouth flaps)
 *   gloat   0..1 player just lost a vial      shock 0..1 player deathbombed
 *   hp      hp fraction              dying   0..1 death sequence
 *   mode    'dive' | 'aim' | 'puddle' | ...   bud 0 closed .. 1 open
 *   mutating, intro (boss entering), beat (0..1 march phase)
 * Returns the mood and style the renderer writes into the face decal. */
export function faceState(id, c = {}) {
  const ch = CHARACTERS[id] || CHARACTERS.wild;
  const r = ch.rest,
    st = ch.face;
  const t = c.t ?? 0,
    ph = hashPhase(c.id);
  let open = r.open,
    brow = r.brow,
    curve = r.curve,
    mouth = r.mouth,
    smirk = r.smirk,
    squint = 0,
    sweat = 0,
    dead = 0,
    alpha = 1;
  // Look at the syringe (pupils toward it: down on screen is +z).
  const [dx, dz] = c.look || [0, 6];
  let lookX = clamp(dx / 7, -1, 1),
    lookY = -clamp(dz / 9, -0.4, 1);
  const m = ch.motion;
  if (m.shifty) lookX = Math.sin(t * 1.3 + ph * 6) > 0.2 ? 0.9 : -0.9;
  if (m.wander) {
    lookX = Math.sin(t * 0.9 + ph * 7) * 0.8;
    lookY = Math.cos(t * 0.7 + ph * 5) * 0.5;
  }
  if (m.mirror) lookX = -lookX;
  if (id === 'worm') lookX = dx > 0 ? -0.9 : 0.9; // never looks at you
  // Low health: panic (wide eyes, small pupils, worried brows, a sweat drop).
  const hp = c.hp ?? 1;
  const panic = hp < 0.35 && id !== 'mini' ? smooth(clamp((0.35 - hp) / 0.2, 0, 1)) : 0;
  if (panic) {
    open = mix(open, 1.35, panic);
    brow = mix(brow, 0.95, panic);
    curve = mix(curve, -0.6, panic);
    mouth = mix(mouth, 0.35 + 0.1 * Math.sin(t * 22), panic);
    smirk *= 1 - panic;
    sweat = panic;
    lookX += Math.sin(t * 9 + ph * 4) * 0.5 * panic;
  }
  // The player was hit: every villain is smug (half lids, a laughing grin).
  const g = c.gloat ?? 0;
  if (g > 0) {
    open = mix(open, 0.45, g);
    brow = mix(brow, 0.2, g);
    curve = mix(curve, 1, g);
    mouth = mix(mouth, 0.35 + 0.25 * Math.abs(Math.sin(t * 14)), g);
    smirk = mix(smirk, 0.6, g);
  }
  // The player deathbombed out of a hit: shocked, then annoyed.
  const sh = c.shock ?? 0;
  if (sh > 0) {
    open = mix(open, 1.4, sh);
    brow = mix(brow, -0.6, sh);
    curve = mix(curve, -0.7, sh);
    mouth = mix(mouth, 0.5, sh);
  }
  // Wind-up for an attack: the archetype's attack face.
  if (c.tele) {
    const f = TELE_FACE[c.tele.preset] || TELE_FACE.default;
    const k = smooth(clamp(c.tele.k * 1.4, 0, 1));
    open = mix(open, f.open, k);
    brow = mix(brow, f.brow, k);
    curve = mix(curve, f.curve, k);
    mouth = mix(mouth, f.mouth, k);
    smirk *= 1 - k;
  }
  if (c.mode === 'dive') {
    // DROPLET: the scream all the way down.
    open = 1.3;
    brow = -0.9;
    mouth = 0.9 + 0.1 * Math.sin(t * 30);
    curve = 0.2;
  } else if (c.mode === 'aim') {
    open = 0.5;
    brow = -1;
    curve = 0.4;
    lookY = -1;
  }
  if (c.mutating) {
    open = 1.3 + 0.1 * Math.sin(t * 40);
    lookX = Math.sin(t * 17) * 0.9;
    lookY = Math.cos(t * 13) * 0.9;
    curve = 0.8;
    mouth = 0.5;
  }
  // Speaking: the mouth flaps with the babble.
  const talk = c.talk ?? 0;
  if (talk > 0) mouth = mix(mouth, 0.15 + 0.55 * Math.abs(Math.sin(t * 17)), Math.min(1, talk * 4));
  // Boss entrance: eyes open from shut to the rest look.
  if (c.intro !== undefined && c.intro < 1) {
    const k = smooth(clamp((c.intro - 0.25) / 0.6, 0, 1));
    open = mix(0, open, k);
    curve = mix(0.9, curve, k);
  }
  // Blink every 2.6-5.2 s (0.13 s), and on the wink beat for show-offs.
  const period = 2.6 + ph * 2.6;
  const bt = (t + ph * 11) % period;
  let blinkL = bt < 0.13 ? 1 - Math.abs(bt / 0.065 - 1) : 0,
    blinkR = blinkL;
  if (m.wink) {
    const wt = (t + ph * 5) % (m.wink * 2.2);
    if (wt < 0.3) blinkR = Math.max(blinkR, Math.sin((wt / 0.3) * Math.PI));
  }
  // Hit: a ">.<" flinch.
  const hurt = c.hurt ?? 0;
  if (hurt > 0) {
    squint = smooth(clamp(hurt * 1.6, 0, 1));
    mouth = Math.max(mouth, 0.3 * squint);
    curve = mix(curve, -0.5, squint);
  }
  if (c.dying !== undefined) {
    dead = smooth(clamp(c.dying * 2.5, 0, 1));
    mouth = mix(mouth, 0.7, dead);
    curve = mix(curve, -0.8, dead);
    sweat = Math.max(sweat, dead * 0.8);
  }
  if (c.bud !== undefined) alpha = smooth(clamp((c.bud - 0.35) / 0.5, 0, 1));
  return {
    open: clamp(open, 0, 1.5),
    blinkL,
    blinkR,
    brow: clamp(brow, -1, 1),
    curve: clamp(curve, -1, 1),
    mouth: clamp(mouth, 0, 1),
    smirk: clamp(smirk, -1, 1),
    squint,
    sweat: clamp(sweat, 0, 1),
    dead,
    lookX: clamp(lookX, -1, 1),
    lookY: clamp(lookY, -1, 1),
    alpha,
    style: st,
  };
}

/** How far the drawn face reaches from the decal centre, in units of the
 * anchor radius (features only: eyes, brows, mouth, sweat drop). Used by the
 * test that keeps every face inside its body's silhouette. */
export function faceReach(id) {
  const st = (CHARACTERS[id] || CHARACTERS.wild).face;
  const eyeR = st.size * Math.max(1, st.tall) * 1.25 * (1 + st.mismatch);
  const eyes = Math.hypot(st.gap + eyeR, FACE.eyeY + eyeR);
  const brows = Math.hypot(st.gap + st.size * 1.1, FACE.eyeY + st.size * st.tall * 1.25 + 0.32);
  const mouth = Math.hypot(st.mouthW, Math.abs(FACE.mouthY) + 0.22 + 0.35);
  const sweatDrop = Math.hypot(0.62 + 0.1, 0.45 + 0.16);
  return Math.max(eyes, brows, mouth, sweatDrop) * st.scale;
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
