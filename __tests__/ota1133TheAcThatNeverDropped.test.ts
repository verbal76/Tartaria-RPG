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
// OTA-1133 — THE AC THAT NEVER DROPPED.
//
// The owner reported this three separate times as a DROP: *"AC 16 → AC 10,
// recurring."* Two builds of instrumentation were aimed at catching the moment
// it fell. It never fell. There was no moment.
//
// ⚠ `player.ac` IS THE RACIAL BASE, AND NOTHING EVER UPDATES IT. There is
// exactly ONE write to that field in the entire codebase:
//
//     ac: race.baseAC,        // character.ts, at creation
//
// No equip handler touches it. No unequip handler touches it. It is the number
// the character was born with, for the whole life of the save.
//
// Five consumers knew that and added the worn-armour stack themselves. TWO
// printed the raw field as though it were the finished number:
//
//   · contextInjector `AC ${player.ac}`  → the LLM was told AC 10
//   · the Arbiter's look-you-over line   → and SAID "AC 10" out loud
//
// So the character sheet showed 16 while the Arbiter, asked the same question
// seconds later, answered 10. That is the entire bug: not a drop over time, but
// two surfaces that never agreed. The device log has it cold — eight pieces of
// worn gear listed on one line, `AC 10` on the next.
//
// ⚠ AND THE INSTRUMENTATION MISSED IT FOR A REASON WORTH RECORDING. OTA-1124's
// `ac-shift` ledger only fires inside `applyEnemyCounter` — in combat. The owner
// fled both fights in that log, so it never ran once. A ledger that can only
// speak in combat cannot describe a bug that lives on the character sheet. The
// lesson is not "add more logging"; it is that a measurement has to be able to
// observe the thing being measured.
//
// ⚠ WHY ONE HELPER RATHER THAN TWO PATCHES. The five "correct" consumers did not
// agree with each other either — each re-derived the sum inline, which is how a
// field like this drifts in the first place. Patching only the two loud sites
// would have left five copies of the same arithmetic waiting to disagree again.
// `standingAc()` is now the single place that answers "what is my AC", and the
// test below is what stops a sixth surface inventing a seventh number.

import { standingAc, trimStandingAc } from '../app/engine/equipment';
import type { PlayerCharacter } from '../app/engine/types';

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
const CHAR: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/engine/character.ts'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const INJ: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/engine/contextInjector.ts'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const STORE: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PANEL: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/components/StatsPanel.tsx'), 'utf8');

/** A geared player, shaped like the one in the device log: base 10, real
 *  catalog armour in five slots. Each of these pieces carries acBonus 2. */
const geared = (): PlayerCharacter => ({
  ac: 10,
  inventory: [],
  equipped: {
    head: "Spirit-Caller's Helm",
    chest: "Shaman's Mud Plate",
    legs: "Aether-Warden's Legguards",
    feet: "Shaman's Mud Boots",
    cloak: "Aether-Warden's Cape",
  },
} as unknown as PlayerCharacter);

const naked = (): PlayerCharacter => ({
  ac: 10, inventory: [], equipped: {},
} as unknown as PlayerCharacter);

describe('OTA-1133 — ⚠ player.ac is the racial base and nothing updates it', () => {
  it('there is exactly ONE write to the field, and it is at creation', () => {
    // If this ever becomes two, someone has started mutating the base and the
    // whole model below changes.
    expect((CHAR.match(/\bac: race\.baseAC\b/g) ?? []).length).toBe(1);
  });

  it('no equip or unequip path writes it', () => {
    // The absence is the point: equipping armour must NOT retro-write the base,
    // because the base is what the gear stack is added TO.
    expect(STORE).not.toMatch(/\bac:\s*(?:newAc|nextAc|computedAc)\b/);
    expect(STORE).not.toMatch(/player\.ac\s*=/);
  });
});

describe('OTA-1133 — ⚠ the reported "16 → 10" reproduced, and fixed', () => {
  it('a naked character stands at the racial base', () => {
    expect(standingAc(naked())).toBe(10);
  });

  it('⚠ five worn pieces raise it — the 16 the sheet was showing', () => {
    // base 10 + five pieces at +2 = 20 raw, under the trim knee of 22, so 20.
    // The exact figure matters less than the direction: gear counts.
    const ac = standingAc(geared());
    expect(ac).toBeGreaterThan(10);
    expect(ac).toBe(trimStandingAc(10 + 2 * 5));
  });

  it('⚠ and the gap between geared and naked is the whole complaint', () => {
    expect(standingAc(geared()) - standingAc(naked())).toBe(10);
  });

  it('a missing player does not throw — it answers the bare base', () => {
    expect(standingAc(null)).toBe(10);
    expect(standingAc(undefined)).toBe(10);
  });

  it('a player with no ac field falls back to 10 rather than NaN', () => {
    const p = { inventory: [], equipped: {} } as unknown as PlayerCharacter;
    expect(standingAc(p)).toBe(10);
  });

  it('the tail trim still applies — a legendary stack cannot buy immunity', () => {
    const heavy = { ac: 30, inventory: [], equipped: {} } as unknown as PlayerCharacter;
    expect(standingAc(heavy)).toBe(trimStandingAc(30));
    expect(standingAc(heavy)).toBeLessThan(30);
  });
});

describe('OTA-1133 — ⚠ every surface answers with the SAME function', () => {
  it('the LLM prompt no longer prints the raw base', () => {
    expect(INJ).toContain('AC ${standingAc(player)}');
    expect(INJ).not.toContain('AC ${player.ac}');
  });

  it('the Arbiter no longer SAYS the raw base out loud', () => {
    expect(STORE).toContain('AC ${standingAc(player)}');
    expect(STORE).not.toContain('AC ${player.ac}');
  });

  it('the character sheet uses it too — one function, not a fourth inline copy', () => {
    expect(PANEL).toContain('const effectiveAc = standingAc(player);');
    // The old inline derivation is gone, so there is nothing left to drift.
    expect(PANEL).not.toContain('trimStandingAc(player.ac + armorAc)');
  });

  it('⚠ no surface anywhere still interpolates the raw field as an answer', () => {
    // The regression this suite exists to prevent: a sixth screen printing
    // `AC ${player.ac}` and quietly disagreeing with the other five.
    for (const src of [INJ, STORE, PANEL]) {
      expect(src).not.toMatch(/AC \$\{player\.ac\}/);
    }
  });
});

describe('OTA-1133 — what combat keeps, and why that is not a contradiction', () => {
  it('the store still owns the richer in-combat breakdown', () => {
    // standingAc is the STANDING number. applyEnemyCounter legitimately adds
    // scene-conditional racial context, the ruins-defence title, and live status
    // effects — none of which exist outside a fight. Both start from the same
    // base, which is what stops them drifting.
    expect(COMBAT_SRC).toContain('export function effectiveACBreakdown(');
    expect(COMBAT_SRC).toContain('const base = player.ac ?? 10;');
  });

  it('the helper documents its scope so the next reader does not "fix" it', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const EQ: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '../app/engine/equipment.ts'), 'utf8');
    expect(EQ).toContain('THE ONE ANSWER TO "WHAT IS MY AC"');
    expect(EQ).toContain('IS THE RACIAL BASE, NOT THE EFFECTIVE AC');
  });
});
