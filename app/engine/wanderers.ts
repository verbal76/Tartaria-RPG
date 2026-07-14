// OTA-1092 — Wandering NPCs. The second half of the "where does Charisma matter?"
// answer (talk-down was the first): the open road now occasionally puts a PERSON in
// front of you — a traveler, a refugee, a tinker — someone you can actually talk to,
// not a vendor stall or an animal. Greet / persuade them for a small payoff: a word
// of the road (a tip), a few coins, or — rarely — a nudge to your standing as your
// people hear you dealt well with a stranger.
//
// It's deliberately an AFTERTHOUGHT lever, in the same spirit as buy-for-rep: the
// spawn is gated on NOVEL ground (a tile you haven't crossed in your last ~20), so
// you can't sit on one square leaving-and-returning to farm it — you have to keep
// moving to keep meeting people. One interaction per wanderer; the CHA check decides
// whether the exchange gives anything.
//
// Lore-neutral: names and lines are generic road-flavor so this same module reads
// straight on the lore-agnostic engine_Dev line.

const FIRST_NAMES = [
  'Corin', 'Mave', 'Tolen', 'Sera', 'Bram', 'Ysolde', 'Garrin', 'Nix', 'Odell',
  'Perra', 'Hale', 'Vesna', 'Dorn', 'Ketch', 'Lorne', 'Ammi',
];

export interface WandererArchetype {
  id: string;
  /** Role word shown after the name ("Corin, a road-worn traveler"). */
  role: string;
  /** Arrival narration when the scene spawns them (before the name is slotted). */
  greeting: string;
  /** The "word of the road" tip line — pure flavor, the cheapest success payoff. */
  tip: string;
  /** OTA-1093 — the parley temperament this archetype naturally reads as. 'reasonable'
   *  folk yield to PERSUADE; 'greedy' ones only fold to INTIMIDATE. */
  temperament: import('./parley').Temperament;
}

const ARCHETYPES: WandererArchetype[] = [
  {
    id: 'traveler',
    role: 'a road-worn traveler',
    greeting: 'Someone is resting on a stone up ahead — a traveler, pack down, watching the horizon. They lift a hand as you approach.',
    tip: '"Keep to the high ground after dark," they say. "The low places fill with things that hunt by sound."',
    temperament: 'reasonable',
  },
  {
    id: 'refugee',
    role: 'a wary refugee',
    greeting: 'A figure with everything they own on their back stands off the path, ready to bolt. They relax a fraction when they see you\'re alone.',
    tip: '"There\'s clean water two days back the way I came," they murmur. "And nothing left worth the walk further on. Take that as you will."',
    temperament: 'reasonable',
  },
  {
    id: 'tinker',
    role: 'a wandering tinker',
    greeting: 'A tinker sits amid a clatter of half-mended gear, squinting at a broken mechanism. They wave you over without looking up.',
    tip: '"Salvage the joints, not the plate," the tinker says, tapping a ruined frame. "Plate\'s everywhere. Good joints keep you alive."',
    temperament: 'greedy',
  },
  {
    id: 'scout',
    role: 'a lone scout',
    greeting: 'A scout crouches at the treeline, reading the ground. They rise slow and easy, hands where you can see them.',
    tip: '"Tracks thin out to the east," the scout says. "Whatever\'s denning around here, it hunts west. Go against the grain if you want quiet."',
    temperament: 'reasonable',
  },
  {
    id: 'pilgrim',
    role: 'a footsore pilgrim',
    greeting: 'A pilgrim walks the road at a measured pace, staff in hand, in no apparent hurry. They slow to match you.',
    tip: '"The old markers still stand, if you know to look," the pilgrim says. "They point somewhere. I\'ve stopped asking where."',
    temperament: 'reasonable',
  },
  {
    id: 'drifter',
    role: 'a hard-eyed drifter',
    greeting: 'A drifter leans in a doorway of rusted sheet-metal, thumbs in their belt, watching you come with a trader\'s arithmetic. They don\'t move to make room.',
    tip: '"Word for word, friend — there\'s a stash north of here nobody\'s cracked. That\'s all you get for free."',
    temperament: 'greedy',
  },
  {
    id: 'scavenger',
    role: 'a twitchy scavenger',
    greeting: 'A scavenger crouches over a picked-clean carcass of machinery, stuffing bolts into a sack. They half-rise, eyeing your hands and your pack in equal measure.',
    tip: '"Finders keepers out here," they mutter, not quite meeting your eye. "You didn\'t see nothing."',
    temperament: 'greedy',
  },
];

export interface Wanderer {
  id: string;
  name: string;
  archetypeId: string;
  role: string;
  greeting: string;
  tip: string;
  /** OTA-1093 — the parley temperament (the "lock" the player reads). */
  temperament: import('./parley').Temperament;
  /** OTA-1093 — the faction this person answers to, or null for an unaffiliated
   *  drifter. Extorting an affiliated wanderer dings your standing with them. */
  faction: string | null;
}

/** Build a wanderer from a seed index (caller passes a scene-stable number so the
 *  same tile visit reads the same person). Deterministic given the seed. `factions`
 *  is the live faction-id pool; a wanderer draws one (or, ~1 in 4, none). */
export function makeWanderer(seed: number, factions: string[] = []): Wanderer {
  const arch = ARCHETYPES[Math.abs(seed) % ARCHETYPES.length]!;
  const name = FIRST_NAMES[Math.abs(Math.floor(seed / ARCHETYPES.length)) % FIRST_NAMES.length]!;
  // Faction draw: deterministic in the seed; a 0 slot means unaffiliated.
  let faction: string | null = null;
  if (factions.length > 0) {
    const slot = Math.abs(Math.floor(seed / (ARCHETYPES.length * FIRST_NAMES.length))) % (factions.length + 1);
    faction = slot === 0 ? null : factions[slot - 1] ?? null;
  }
  return {
    id: `wanderer_${arch.id}_${Math.abs(seed)}`,
    name,
    archetypeId: arch.id,
    role: arch.role,
    greeting: arch.greeting,
    tip: arch.tip,
    temperament: arch.temperament,
    faction,
  };
}

// The talk check: d20 + CHA vs a friendly DC. A stranger on the road isn't a hard
// sell — a decent talker clears it almost every time — but a graceless one (dump
// Charisma) still coin-flips it, so CHA is what turns "meets everyone" into "gets
// something from everyone." DC 12: CHA 10 whiffs only on a 1; CHA 1 is a coin flip.
export const WANDERER_TALK_DC = 12;

export type WandererRewardKind = 'tip' | 'tc' | 'standing';

export interface WandererReward {
  kind: WandererRewardKind;
  /** For 'tc' — coins granted. For 'standing' — +1 (to the player's own faction). */
  amount: number;
  /** The line shown to the player. */
  line: string;
}

/** Decide what a SUCCESSFUL talk yields. Weighted so the tangible rewards (coins,
 *  standing) stay modest and occasional — a tip is the common case, standing the
 *  rare one, keeping this an afterthought contributor. `rand` in [0,1); `coinRand`
 *  in [0,1) sizes the coin gift. */
export function rollWandererReward(w: Wanderer, rand: number, coinRand: number): WandererReward {
  if (rand < 0.45) {
    return { kind: 'tip', amount: 0, line: w.tip };
  }
  if (rand < 0.80) {
    const amount = 6 + Math.floor(coinRand * 10); // 6..15 TC
    return {
      kind: 'tc',
      amount,
      line: `${w.name} presses a few coins into your hand. "For the road. You listened — that\'s rarer than coin out here." (+${amount} TC)`,
    };
  }
  return {
    kind: 'standing',
    amount: 1,
    line: `${w.name} clasps your arm. "I\'ll say I met one of yours who dealt fair. Word travels." Somewhere, your people hear it. (+1 standing)`,
  };
}

/** The line for a FAILED talk — no reward, they close up. */
export function wandererFailLine(w: Wanderer): string {
  return `${w.name} hears you out, but something doesn\'t land. They give a noncommittal nod and turn back to the road. Whatever they knew, they keep.`;
}
