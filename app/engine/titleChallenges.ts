// titleChallenges — the two "content-review-only" Tier-C challenges that need
// no drawn layout: Speaker of Forgotten Tongues (Red Tower of Nimari) and
// Warden of the Old World (Sinking Cathedral).
//
// Design (per the user's call):
//   • SCOUTING IS FREE. Examining the trial never consumes your attempt — it
//     tells you the requirement (a material/relic) and the check you'll face
//     (d20 + a stat vs a DC) so you can judge whether to attempt now or come
//     back stronger / with materials.
//   • COMMITTING IS ONE-SHOT. Actually attempting rolls the check; pass earns
//     the title, fail spends your single chance (recorded on the player so it
//     can't be retried). Lacking the required material refuses the attempt
//     WITHOUT consuming it — you learn what to bring and return later.
//
// Speaker is SKILL-gated (the Glyph-Key is recovered free on-site; the rune
// trial is the real test). Warden is MATERIALS-gated (bring shoring Scrap Metal;
// then an Engineering check). Both checks are pure here; the store rolls + wires
// recordTitleProgress on success.

import type { Stats } from './types';

export interface TitleChallengeDef {
  id: string;
  titleId: string;
  locationId: string;
  /** TitleProgress counter bumped on success. */
  counter: 'languageLearned' | 'relicsPreserved' | 'settlementsDefended';
  /** Optional per-challenge success / failure narration (falls back to the
   *  built-in Speaker/Warden lines in the store handler when omitted). */
  successLine?: string;
  failLine?: string;
  /** Human label for the perk (display only — the perk itself lives in titles.ts). */
  perkLabel: string;
  /** The required item. `recoverOnScout` = handed to the player for free when
   *  they scout (Speaker's Glyph-Key); otherwise it must be brought (Warden's
   *  Scrap Metal). `consumeOnAttempt` = spent when the attempt is committed. */
  requirement: {
    itemName: string;
    quantity: number;
    recoverOnScout: boolean;
    consumeOnAttempt: boolean;
    /** Hint shown when the player lacks it. */
    hint: string;
  };
  /** d20 + stats[stat] vs dc. */
  check: { stat: keyof Stats; dc: number; statLabel: string; trialLabel: string };
  /** Free assessment verbs (scouting). */
  scoutVerb: RegExp;
  /** Committing verbs (the one-shot attempt). */
  attemptVerb: RegExp;
}

export const TITLE_CHALLENGES: Record<string, TitleChallengeDef> = {
  tongue_of_the_red_tower: {
    id: 'tongue_of_the_red_tower',
    titleId: 'speaker_of_forgotten_tongues',
    locationId: 'red_tower_of_nimari',
    counter: 'languageLearned',
    perkLabel: 'Machine Speech',
    requirement: {
      itemName: 'Red Tower Glyph-Key',
      quantity: 1,
      recoverOnScout: true, // the device rests in the housing — picked up while scouting
      consumeOnAttempt: false, // the key is a tool, not spent
      hint: 'the Red Tower Glyph-Key (it rests in the rune-housing here — examine the runes to take it)',
    },
    check: { stat: 'intelligence', dc: 16, statLabel: 'INT', trialLabel: 'reading the rune-wall' },
    scoutVerb: /\b(examine|read|inspect|study|look\s+at)\b.*\b(rune|runes|glyph|glyphs|wall|device)\b/i,
    attemptVerb: /\b(decipher|attempt|cast|translate|read\s+aloud)\b.*\b(rune|runes|glyph|glyphs|trial|wall)\b|^(decipher|attempt\s+the\s+trial)\b/i,
  },
  warden_of_the_cathedral: {
    id: 'warden_of_the_cathedral',
    titleId: 'warden_of_the_old_world',
    locationId: 'sinking_cathedral',
    counter: 'relicsPreserved',
    perkLabel: 'Ruins Defense Bonus',
    requirement: {
      itemName: 'Scrap Metal',
      quantity: 3,
      recoverOnScout: false, // must be brought
      consumeOnAttempt: true, // spent shoring the nave
      hint: '3× Scrap Metal to shore the collapsing nave (salvage it from ruins, then return)',
    },
    check: { stat: 'intelligence', dc: 15, statLabel: 'Engineering', trialLabel: 'bracing the nave' },
    scoutVerb: /\b(examine|inspect|study|assess|look\s+at)\b.*\b(cathedral|nave|ruin|collapse|structure|pillar|pillars)\b/i,
    attemptVerb: /\b(stabilize|stabilise|shore|brace|preserve|save|repair)\b.*\b(cathedral|nave|ruin|structure)\b|^(stabilize|shore\s+up|brace\s+the\s+nave)\b/i,
  },
  // arb54 — Protector of the Forgotten (deep True-Tartarian enclave under siege).
  // SKILL-gated, no material: a single d20 + STR to hold the breach. One-shot.
  defense_of_the_enclave: {
    id: 'defense_of_the_enclave',
    titleId: 'protector_of_the_forgotten',
    locationId: 'tartarian_enclave',
    counter: 'settlementsDefended',
    perkLabel: 'Ruins Defense Bonus',
    requirement: { itemName: '', quantity: 0, recoverOnScout: false, consumeOnAttempt: false, hint: '' },
    check: { stat: 'strength', dc: 15, statLabel: 'STR', trialLabel: 'holding the breach against the raiders' },
    scoutVerb: /\b(examine|inspect|assess|scout|survey|look\s+at)\b.*\b(enclave|settlement|wall|walls|gate|breach|siege|defense|defence|raiders)\b/i,
    attemptVerb: /\b(defend|hold|protect|rally|man|guard)\b.*\b(enclave|line|wall|walls|gate|settlement|breach|defense|defence)\b|^(defend|hold\s+the\s+line|rally\s+the\s+defense|rally\s+the\s+defence)\b/i,
    successLine: "You hold the breach. When the raiders break and run, the enclave still stands — and its elders learn the name of the one who would not move.",
    failLine: "The line buckles and the gate gives. You drag the wounded clear as fire takes the wall behind you — there was only ever the one stand to make here.",
  },
};

export function challengeForLocation(locationId: string): TitleChallengeDef | null {
  return Object.values(TITLE_CHALLENGES).find((c) => c.locationId === locationId) ?? null;
}

export interface CheckResult {
  roll: number;   // raw d20
  bonus: number;  // stat value
  total: number;
  dc: number;
  success: boolean;
}

/** d20 + stat vs dc. A natural 20 always succeeds; a natural 1 always fails. */
export function rollCheck(statValue: number, dc: number, rng: () => number = Math.random): CheckResult {
  const roll = 1 + Math.floor(rng() * 20);
  const total = roll + statValue;
  const success = roll === 20 ? true : roll === 1 ? false : total >= dc;
  return { roll, bonus: statValue, total, dc, success };
}
