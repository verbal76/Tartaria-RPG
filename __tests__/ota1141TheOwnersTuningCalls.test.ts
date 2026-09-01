jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
// OTA-1141 — THE OWNER'S THREE TUNING CALLS, from the pressure-test numbers.
//
// The pressure test (OTA-1140) put five measured balance questions in front of
// the owner in plain terms. He picked three levers and told us to keep the
// rest on a standing tuning list:
//
//   "#5 so suggestions 1 and 2. #2 gate it. and keep these on the tuning list
//    in handoff so we can follow up later."
//
// ── #2, gated: the boss second swing is now a TIER privilege ────────────────
// The sim priced the second swing as THE killer — a connected two-swing round
// averages 22 with a 36% chance of deleting a full 24-HP bar, while a single
// swing can never one-round even a fresh arrival. Tier 1-2 Core Guardians
// (the `tier:N` trait) now swing ONCE; tier 3+ and every non-Guardian boss
// keep the two-swing tempo. The early walls become learnable; the late game
// keeps its teeth.
//
// ⚠ AND THE STAGGER RULE GENERALIZED WITH IT, deliberately. OTA-1137's stagger
// cancelled the SECOND swing — which the gate just removed from the tiers the
// owner actually fights. Left alone, his Searing Paste would have become
// worthless exactly where he uses it. So the rule is now: A STAGGER DENIES
// ONE SWING, whichever swing that is — the second on a big boss, the ONLY one
// on a gated Guardian. Same absolute value either way (one swing per round),
// and the fight stays real: a gated boss swings on every round the player
// does NOT land a fresh weakness hit. 1160's "first swing always lands" is
// consciously revised for the gated tiers only — that is the trade the owner
// chose, not an accident.
//
// ── #5.1: the hit-floor ceiling rises 13 → 16 ───────────────────────────────
// Every enemy always hits on a high-enough natural roll — the rule that keeps
// a tank from being literally unhittable. But at cap 13 the floor was ~40%
// and engaged at raw AC 18, so a Legendary armor set changed nothing against
// ordinary enemies ("I upgraded and nothing happened" — the same feeling as
// the rings that didn't move the Power gauge). At 16 the floor is ~25%: a
// maxed tank still takes one swing in four, and armor keeps paying to ~21.
//
// ── #5.2: capped-off AC becomes PLATE ───────────────────────────────────────
// AC past the cap used to buy nothing at all. Now every 2 excess points shave
// 1 damage from a landed hit (max −4), printed as `plate −N` in the damage
// clause so the tank can SEE the armor working. Runs before the 30% mitigation
// floor, so the "never immune" guarantee holds unchanged.
//
// The rest of the sim's findings — tier-1 Guardian HP (59 vs authored 42),
// acid-shred × stagger compounding, the dog redirect eating a boss round,
// dodge at very high DEX — are recorded on the STANDING TUNING LIST at the
// top of HANDOFF §8, per the owner's instruction.

import { bossSwingsTwice, enemyDamageDisplay, enemyDamageCompact } from '../app/engine/combatRules';
// ⚠ OTA-1617 — blockAt is gone from this suite: it is a BRACE-aware source
// helper, and the HANDOFF pin below only ever matched incidental punctuation.
// See the note at that pin for the window that replaced it.

// ⚠⚠ OTA-1404 — COMBAT RESOLUTION MOVED OUT OF gameStore INTO ITS OWN LEAF, and
// the pins below follow the code to its new address rather than reading both
// files and hoping. A helper that searches "wherever the code went" can never
// fail, and a pin that cannot fail is not a test. Everything still asserted
// against the store constant above is still IN the store.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const COMBAT_SRC: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', 'app', 'state', 'combatResolution.ts'), 'utf8');

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const read = (p: string): string => require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', p), 'utf8');

const STORE = read('app/state/gameStore.ts');

const gated = (tier: number) => ({ boss: true, traits: ['giant_vigil', `tier:${tier}`, 'vulnerable:burn'], damage: '1d8+3' });

describe('OTA-1141 — ⚠ the second swing is a tier privilege now', () => {
  it('tier 1 and 2 Guardians swing once', () => {
    expect(bossSwingsTwice(gated(1))).toBe(false);
    expect(bossSwingsTwice(gated(2))).toBe(false);
  });

  it('tier 3+ keeps the tempo', () => {
    for (const t of [3, 4, 5, 8, 9]) expect(bossSwingsTwice(gated(t))).toBe(true);
  });

  it('⚠ a non-Guardian boss (no tier trait) is untouched — story bosses keep both swings', () => {
    expect(bossSwingsTwice({ boss: true, traits: ['armored'] })).toBe(true);
    expect(bossSwingsTwice({ boss: true })).toBe(true);
  });

  it('a non-boss never had a second swing to gate', () => {
    expect(bossSwingsTwice({ boss: false, traits: ['tier:1'] })).toBe(false);
    expect(bossSwingsTwice({})).toBe(false);
  });

  it('a malformed tier trait fails safe to two swings', () => {
    expect(bossSwingsTwice({ boss: true, traits: ['tier:'] })).toBe(true);
    expect(bossSwingsTwice({ boss: true, traits: ['tier:abc'] })).toBe(true);
  });

  it('⚠ the volley consults the gate, not just the display', () => {
    expect(COMBAT_SRC).toContain('if (enemy.boss && bossSwingsTwice(enemy)) {');
  });

  it('⚠ THE CARDS KEEP TELLING THE TRUTH — a gated Guardian does not advertise ×2', () => {
    // This whole week was surfaces lying about boss damage. The gate must not
    // mint a new lie in the opposite direction.
    // ⚠ OTA-1608 supersede — the type word rides at the end now; the ×2 truth
    // this test exists for is unchanged.
    expect(enemyDamageDisplay(gated(1))).toMatch(/^1d8\+3\+1d6( \w+)? damage on a hit$/);
    expect(enemyDamageCompact(gated(1))).toMatch(/^1d8\+3\+1d6 \w+$/);
    expect(enemyDamageDisplay(gated(3))).toContain('twice per round');
    expect(enemyDamageCompact(gated(3))).toMatch(/^1d8\+3\+1d6 ×2 \w+$/);
  });
});

describe('OTA-1141 — ⚠ a stagger denies ONE swing, whichever swing that is', () => {
  it('a gated boss consumes its stagger BEFORE its only swing', () => {
    expect(COMBAT_SRC).toContain('if (enemy.boss && !bossSwingsTwice(enemy) && takeStagger(get, set, liveIdx)) {');
    expect(COMBAT_SRC).toContain('STAGGERED: no swing this round.');
  });

  it('a two-swing boss still consumes it at the second swing — 1160 unchanged there', () => {
    expect(COMBAT_SRC).toContain('if (takeStagger(get, set, liveIdx)) {');
    expect(COMBAT_SRC).toContain('STAGGERED: no second swing this round.');
  });

  it('⚠ the revision of 1160\'s first-swing rule is recorded as deliberate', () => {
    expect(COMBAT_SRC).toContain('A STAGGER DENIES ONE SWING');
    expect(COMBAT_SRC).toContain('the trade the owner chose');
  });

  it('the gated check runs AFTER the dog redirect, so a soaked swing never spends the stagger', () => {
    // ⚠ RETARGETED for OTA-1142: the redirect grew a !enemy.boss gate on the
    // random soak (bosses fight the person in front of them). The ORDERING this
    // test pins — redirect first, stagger check after — is unchanged.
    const from = COMBAT_SRC.indexOf('if (dogUp && (forcedOnDog || (!enemy.boss && Math.random() < DOG_TARGET_CHANCE))) {');
    const staggerAt = COMBAT_SRC.indexOf('if (enemy.boss && !bossSwingsTwice(enemy) && takeStagger(get, set, liveIdx)) {');
    expect(from).toBeGreaterThan(0);
    expect(staggerAt).toBeGreaterThan(from);
  });
});

describe('OTA-1141 — ⚠ armor pays again: the floor rises and the excess soaks', () => {
  it('the hit-floor ceiling is 16 — a maxed tank takes one swing in four, not two in five', () => {
    expect(COMBAT_SRC).toContain('const ENEMY_HIT_NEEDED_CAP = 16;');
    // ⚠ OTA-1404 — this absence pin follows the constant to the combat leaf. Left
    // reading the store it would have passed for the wrong reason: the constant is
    // not there AT ALL any more, so "it is not 13" would have been true of an empty
    // file. An absence pin has to be aimed at the file the value actually lives in.
    expect(COMBAT_SRC).not.toContain('const ENEMY_HIT_NEEDED_CAP = 13;');
  });

  it('⚠ PLATE: 2 excess AC = −1 damage, max −4, floored at 1', () => {
    expect(COMBAT_SRC).toContain('const plateDr = acCapEngaged');
    expect(COMBAT_SRC).toContain('Math.min(4, Math.floor(((effectiveAc - (atkTotal - atkRoll)) - ENEMY_HIT_NEEDED_CAP) / 2))');
    expect(COMBAT_SRC).toContain('if (plateDr > 0 && dmg > 1) dmg = Math.max(1, dmg - plateDr);');
  });

  it('⚠ plate runs BEFORE the mitigation floor — never immune still holds', () => {
    const plateAt = COMBAT_SRC.indexOf('if (plateDr > 0 && dmg > 1)');
    const floorAt = COMBAT_SRC.indexOf('const MITIGATION_FLOOR = 0.30;');
    expect(plateAt).toBeGreaterThan(0);
    expect(plateAt).toBeLessThan(floorAt);
  });

  it('the damage clause names the plate so the tank can see it working', () => {
    expect(COMBAT_SRC).toContain('plate: plateDr,');
    expect(COMBAT_SRC).toContain('mods.push(`plate −${opts.plate}`)');
  });
});

describe('OTA-1141 — the standing tuning list exists where the owner asked', () => {
  it('HANDOFF §8 carries the list with the sim numbers still attached', () => {
    // ⚠ RETARGETED for OTA-1142: the four-lever batch moved the tier-1 HP,
    // acid×stagger, and dog-redirect items from OPEN to DONE (with new
    // wording), so the anchors are the topics — every 1163 finding must still
    // be ON the list, whichever status it carries. The list also grew, so the
    // window widens to cover the DONE block.
    const h = read('HANDOFF.md');
    expect(h).toContain('STANDING TUNING LIST');
    const at = h.indexOf('STANDING TUNING LIST');
    // ⚠ OTA-1617 — REPINNED, AND THE WINDOW IS TIGHTER THAN IT WAS. `blockAt`
    // is BRACE-AWARE: it is a source helper, and on a Markdown file it only
    // ever worked by finding some incidental `{…}` in the prose downstream.
    // Growing §9 by ~6 KB on 2026-09-01 pushed that accident out of reach and
    // the helper threw — a pin that was measuring punctuation, not the list.
    // The list is a single top-level bullet, so its own span is the honest
    // window: anchor → the next column-0 bullet (~4 KB, vs the ~29 KB the
    // helper was reaching across).
    const listEnd = h.indexOf('\n- **', at);
    expect(listEnd).toBeGreaterThan(at);
    const win = h.slice(at, listEnd).toLowerCase();
    for (const item of ['59', 'acid', 'dog soak', 'DEX']) {
      expect(win).toContain(item.toLowerCase());
    }
  });
});
