// OTA-1093 — Parley: the two-button social encounter. When you speak to a wild NPC
// or an animal you're fighting, the game surfaces a CHOICE with real, asymmetric
// stakes instead of a flat "roll to talk." This module is the pure decision core;
// the store orchestrates it and ParleyModal renders it.
//
// THE LOCK-AND-KEY. Every target has a TEMPERAMENT, and exactly one approach is the
// "key" that fits it:
//   animals — skittish → CALM,      aggressive → INTIMIDATE
//   people  — reasonable → PERSUADE, greedy     → INTIMIDATE
// The lock is HARD: picking the wrong key FAILS regardless of Charisma — you can't
// sweet-talk a cornered predator or reason with a shakedown artist. Reading the
// target is the skill. A perceptive character (high Wisdom) is TOLD the temperament
// up front; a blunt one has to go on the narrated tell, or gamble.
//
// THE STAKES (set by the BUTTON, not the key):
//   CALM / PERSUADE (the safe read) — fail and the moment is SPENT: the person clams
//     up and walks (lead/goods forfeit), the animal stays a plain fight (no clean
//     exit). No new harm, but that was your one shot.
//   INTIMIDATE (the hard read) — fail and it turns on you: the person goes hostile
//     (you're fighting now) or the animal lands a vicious hit — AND the moment is
//     spent. Higher ceiling (you can extort GOODS), higher floor.
//
// THE REWARD SPLIT: persuade earns SECRETS (a location lead); intimidate earns STUFF
// (what they carry). "Talk for secrets, threaten for stuff."

export type Temperament = 'skittish' | 'aggressive' | 'reasonable' | 'greedy';
export type ParleyChoice = 'calm' | 'persuade' | 'intimidate';
export type ParleyKind = 'animal' | 'person';

/** The one approach that fits a given temperament (the "key" to its "lock"). */
export function rightChoiceFor(t: Temperament): ParleyChoice {
  switch (t) {
    case 'skittish': return 'calm';
    case 'reasonable': return 'persuade';
    case 'aggressive': return 'intimidate';
    case 'greedy': return 'intimidate';
  }
}

/** Hard lock: only the matching key works. */
export function isRightKey(choice: ParleyChoice, t: Temperament): boolean {
  return choice === rightChoiceFor(t);
}

/** Which two buttons a target offers. Animals: calm vs intimidate. People:
 *  persuade vs intimidate. (Intimidate is always one of the two — you can always
 *  TRY to threaten anything; whether it lands is the lock.) */
export function choicesFor(kind: ParleyKind): [ParleyChoice, ParleyChoice] {
  return kind === 'animal' ? ['calm', 'intimidate'] : ['persuade', 'intimidate'];
}

/** Read a COMMITTED choice out of typed input, or null if the words are a generic
 *  opener ("talk to / greet / speak / hail / approach") — in which case the caller
 *  should surface the two-button chooser instead of picking for the player. A
 *  specific approach commits: threat verbs → intimidate; gentle/reasoning verbs →
 *  the kind's safe button (calm for an animal, persuade for a person). */
export function detectParleyChoice(input: string, kind: ParleyKind): ParleyChoice | null {
  if (/\b(intimidate|threaten|scare|menace|frighten|cow|bully|coerce|extort|terrify)\b/i.test(input)) {
    return 'intimidate';
  }
  if (/\b(calm|soothe|pacify|settle|tame|gentle|ease|steady)\b/i.test(input)) {
    return kind === 'animal' ? 'calm' : 'persuade';
  }
  if (/\b(persuade|convince|reason|plead|bargain|negotiate|parley|appeal|coax|entreat)\b/i.test(input)) {
    return kind === 'animal' ? 'calm' : 'persuade';
  }
  return null; // generic opener → show the two buttons
}

// Reading the target. A high-Wisdom character sizes up a stranger or a beast at a
// glance and is told the temperament outright; below the threshold you go on the
// narrated tell (or a blind guess).
export const WIS_REVEAL_THRESHOLD = 12;
export function revealsTemperament(wisdom: number): boolean {
  return wisdom >= WIS_REVEAL_THRESHOLD;
}

// The check DC for the RIGHT key (the wrong key never rolls — it auto-fails). Calm
// and persuade are friendly reads; intimidate is harder and gets HARDER as your
// Menace climbs (see menace.ts) — the self-blunting loop is applied by the caller,
// which passes the already-computed intimidate bump in `intimidateDcBonus`.
export const BASE_PARLEY_DC = 11;
export function parleyDC(choice: ParleyChoice, intimidateDcBonus = 0): number {
  if (choice === 'intimidate') return BASE_PARLEY_DC + intimidateDcBonus;
  return BASE_PARLEY_DC - 1; // a hair easier — kindness is a lower bar than fear
}

// Deriving an animal's temperament when the enemy carries no authored one. Keyword-
// biased (a wolf reads as a predator, a rat as prey), with a deterministic name-hash
// fallback so every creature has a STABLE read even with no data.
const AGGRESSIVE_HINTS = /\b(wolf|hound|dog|bear|cat|panther|lion|tiger|raptor|hawk|boar|serpent|viper|snake|croc|shark|hunter|stalker|predator|reaver|maw|fang|claw|beast|brute|drake|wyrm)\b/i;
const SKITTISH_HINTS = /\b(rat|mouse|bird|crow|sparrow|deer|hare|rabbit|goat|sheep|fowl|moth|roach|crab|scav|vermin|critter|grazer|swarm)\b/i;

export function deriveAnimalTemperament(name: string, traits: string[] = []): Temperament {
  const hay = `${name} ${traits.join(' ')}`;
  if (AGGRESSIVE_HINTS.test(hay)) return 'aggressive';
  if (SKITTISH_HINTS.test(hay)) return 'skittish';
  // Stable hash fallback → split ~evenly, deterministic per name.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 2 === 0 ? 'aggressive' : 'skittish';
}

/** The narrated "tell" — always shown, so even a blunt (low-WIS) character has a
 *  fighting chance to read the target from how they carry themselves. */
export function temperamentTell(t: Temperament): string {
  switch (t) {
    case 'skittish': return 'They flinch at every sound — wound-tight, ready to bolt. Fear would only spook them.';
    case 'aggressive': return 'It holds its ground, hackles up, sizing you up as prey. This one only respects a bigger threat.';
    case 'reasonable': return 'They meet your eye, tired but level-headed. There\'s a person in there you could reason with.';
    case 'greedy': return 'Their gaze keeps sliding to what you\'re carrying. This one weighs everything — and fears losing more than they want to help.';
  }
}

/** The explicit read a high-WIS character gets (names the right key). */
export function temperamentReadout(t: Temperament): string {
  switch (t) {
    case 'skittish': return 'You read them at a glance: skittish. Calm them — a threat will only make it worse.';
    case 'aggressive': return 'You read it at a glance: aggressive. Only dominance lands here — intimidate, don\'t coax.';
    case 'reasonable': return 'You read them at a glance: reasonable. A fair word will move them; a threat will not.';
    case 'greedy': return 'You read them at a glance: greedy and craven. They\'ll only fold to a threat — kindness is wasted.';
  }
}

// ---- outcome flavor -------------------------------------------------------------

export function parleySuccessLine(choice: ParleyChoice, kind: ParleyKind, targetName: string): string {
  if (choice === 'calm') {
    return `You slow everything down — low voice, open hands — until the fight goes out of ${targetName}. It circles once and slips away, leaving the ground to you.`;
  }
  if (choice === 'persuade') {
    return `You find the words that cost ${targetName} nothing to give. They lower their guard and, after a beat, tell you what they know.`;
  }
  // intimidate
  return kind === 'animal'
    ? `You draw yourself up and drive your voice at ${targetName} — a predator's certainty. Something in it decides you aren't worth it, and it breaks and runs.`
    : `You put steel in it and mean it. ${targetName} weighs you, weighs the odds, and gives up what they're carrying rather than what's left of their luck.`;
}

/** Wrong-key auto-fail line — the read was wrong, and it costs you per the button. */
export function parleyWrongKeyLine(choice: ParleyChoice, kind: ParleyKind, targetName: string): string {
  if (choice === 'calm') {
    return `${targetName} isn't the kind you can soothe — your calm reads as weakness and it presses harder. The fight's still on.`;
  }
  if (choice === 'persuade') {
    return `${targetName} has no interest in your reasoning. "Save your breath," they say, and turn away. The moment's gone.`;
  }
  // intimidate wrong key
  return kind === 'animal'
    ? `Your threat only corners ${targetName}, and a cornered thing bites — it lunges past your bravado and tears into you.`
    : `You lean on ${targetName} and misjudge them badly — they don't scare, they answer. Steel's out; this is a fight now.`;
}

/** Right-key-but-rolled-fail line — you read them right, the delivery fell short. */
export function parleyRolledFailLine(choice: ParleyChoice, kind: ParleyKind, targetName: string): string {
  if (choice === 'calm') {
    return `You almost have ${targetName} settled — then a wrong move, and the wariness snaps back. The fight's still on.`;
  }
  if (choice === 'persuade') {
    return `${targetName} hears you out, wavers... and thinks better of it. "Not today," they say, and the chance is gone.`;
  }
  return kind === 'animal'
    ? `Your bluff wavers for half a breath — long enough. ${targetName} reads the crack in it and lunges, raking you as it does.`
    : `${targetName} calls your bluff. Whatever edge you had in your voice, it wasn't enough — and now they're swinging.`;
}
