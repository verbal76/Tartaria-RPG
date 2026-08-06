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
// OTA-1158 — THE THREE POINTS OF JEWELLERY.
//
// OTA-1156 ended with the claim *"one function, one answer, everywhere."* The
// owner found the hole in it on the next build, in one sentence:
//
//   "my base AC is 10, on the character card's small form it says 15 (armor),
//    when I click on it to expand it it says 18"
//
// Both numbers came out of this codebase and neither was a display glitch. The
// small form calls `standingAc`. The expanded DEFENCE card calls
// `effectiveACBreakdown`, which stands on `aggregateArmor` — the same function
// the enemy-attack resolver stands on. So the player was DEFENDED at 18 and
// TOLD 15.
//
// ⚠ THE MISSING THREE POINTS ARE JEWELLERY. `aggregateArmor` has summed an
// equipped amulet and up to three rings since OTA-730. `standingAc` walked
// ARMOR_SLOTS and nothing else. The catalog has exactly two AC amulets and two
// AC rings, all +1 — an amulet and two rings is +3, which is the gap the owner
// measured, to the point.
//
// ⚠ AND A SECOND, QUIETER DRIFT SAT IN THE SAME GAP. `resolveDisplayArmorByName`
// finds a piece FIRST-BY-NAME and returns the CATALOG acBonus; combat resolves
// the exact worn instance by id and prefers its rolled `instanceStats.acBonus`.
// Two copies of one piece are SUPPOSED to differ — that is what the durability
// roll is for — so the panel could read the wrong copy even before the rings.
//
// ⚠ WHY THE SUM MOVED INTO equipment.ts RATHER THAN THE RINGS MOVING INTO THE
// PANEL. Adding an amulet loop to `standingAc` would have made a THIRD inline
// copy of the same arithmetic — precisely the failure OTA-1156 was written to
// end, committed by the OTA that was supposed to have ended it. `equippedGearAc`
// is now the implementation and `aggregateArmor` calls it, so combat and the
// panel cannot answer differently: there is only one answer to give.
//
// ⚠ THE COMBAT NUMBER MUST NOT MOVE. This is a fix for a display that was
// under-reporting, not a buff. The precedence inside `equippedGearAc` is copied
// from `aggregateArmor` verbatim — fused by name+slot, then the rolled instance,
// then the catalog, and a name in no catalog contributes nothing — and the tests
// below pin that shape so a future tidy-up cannot quietly re-tune defence.
//
// ⚠ AND THE CARD NOW NAMES THE JEWELLERY. A single "armor +8" chip over a panel
// reading 15 is what made this take a report to find. "armor +5 · accessories
// +3" answers it on sight — the OTA-1156 lesson about measurements being able to
// observe the thing they measure, applied to the surface instead of the log.

import { standingAc, equippedGearAc, trimStandingAc, ARMOR_SLOTS } from '../app/engine/equipment';
import type { PlayerCharacter } from '../app/engine/types';

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const read = (p: string): string => require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', p), 'utf8');

const EQUIP = read('app/engine/equipment.ts');
const STORE = read('app/state/gameStore.ts');

/** Catalog accessories that actually carry AC. The catalog has exactly these
 *  four, all +1 — which is why the owner's gap was 3 and not some other number. */
const AC_AMULET = "Reclaimer's Aegis Pendant";
const AC_RING_A = "Titan's Iron Band";
const AC_RING_B = 'Ring of the Deep Current';

/** The reported character: base 10, real armour, and jewellery on. */
const reported = (): PlayerCharacter => ({
  ac: 10,
  inventory: [],
  equipped: {
    head: "Spirit-Caller's Helm",
    chest: "Shaman's Mud Plate",
    legs: "Aether-Warden's Legguards",
    amulet: AC_AMULET,
    ring: AC_RING_A,
    ring2: AC_RING_B,
  },
} as unknown as PlayerCharacter);

/** The same character with the jewellery taken off. */
const bare = (): PlayerCharacter => ({
  ac: 10,
  inventory: [],
  equipped: {
    head: "Spirit-Caller's Helm",
    chest: "Shaman's Mud Plate",
    legs: "Aether-Warden's Legguards",
  },
} as unknown as PlayerCharacter);

describe('OTA-1158 — ⚠ the panel could not see the rings', () => {
  it('⚠ THE REPRODUCTION: jewellery is worth exactly the three points that went missing', () => {
    const withJewels = equippedGearAc(reported());
    const without = equippedGearAc(bare());
    expect(withJewels.accessories).toBe(3);
    expect(without.accessories).toBe(0);
    // The worn armour is identical between the two — only the jewellery moved.
    expect(withJewels.worn).toBe(without.worn);
  });

  it('⚠ and standingAc now counts them, which is the whole bug', () => {
    // Before this OTA the two players below returned the SAME standing AC,
    // because the amulet and rings were invisible to the function the panel
    // called. That is the 15-vs-18 the owner reported.
    expect(standingAc(reported())).toBe(standingAc(bare()) + 3);
  });

  it('the total is base + worn + accessories, trimmed — no fourth term', () => {
    const p = reported();
    const g = equippedGearAc(p);
    expect(standingAc(p)).toBe(trimStandingAc(10 + g.worn + g.accessories));
  });

  it('an amulet alone counts, and so does a single ring', () => {
    const onlyAmulet = { ac: 10, inventory: [], equipped: { amulet: AC_AMULET } } as unknown as PlayerCharacter;
    const onlyRing = { ac: 10, inventory: [], equipped: { ring: AC_RING_A } } as unknown as PlayerCharacter;
    expect(equippedGearAc(onlyAmulet).accessories).toBe(1);
    expect(equippedGearAc(onlyRing).accessories).toBe(1);
    expect(standingAc(onlyAmulet)).toBe(11);
  });

  it('all three ring slots are read, not just the first', () => {
    // ring3 was in aggregateArmor's loop from the start; a helper that forgot it
    // would reproduce the same class of bug one slot further along.
    const p = {
      ac: 10, inventory: [],
      equipped: { ring: AC_RING_A, ring2: AC_RING_B, ring3: AC_RING_A },
    } as unknown as PlayerCharacter;
    expect(equippedGearAc(p).accessories).toBe(3);
  });

  it('accessories with no acBonus contribute nothing — most of the catalog is like that', () => {
    const p = { ac: 10, inventory: [], equipped: { amulet: 'Amulet of Nothing At All' } } as unknown as PlayerCharacter;
    expect(equippedGearAc(p).accessories).toBe(0);
  });

  it('a missing or empty player answers zero rather than throwing', () => {
    expect(equippedGearAc(null)).toEqual({ worn: 0, accessories: 0 });
    expect(equippedGearAc(undefined)).toEqual({ worn: 0, accessories: 0 });
    expect(equippedGearAc({ ac: 10, inventory: [], equipped: {} } as unknown as PlayerCharacter))
      .toEqual({ worn: 0, accessories: 0 });
  });
});

describe('OTA-1158 — ⚠ the worn half keeps combat bit-identical', () => {
  it('a rolled instance beats the catalog row — two copies are meant to differ', () => {
    // `resolveDisplayArmorByName` returns the CATALOG number; combat prefers the
    // instance roll. The panel used to read the former.
    const p = {
      ac: 10,
      equipped: { chest: "Shaman's Mud Plate", chestId: 'inst-1' },
      inventory: [
        { id: 'inst-1', name: "Shaman's Mud Plate", quantity: 1, instanceStats: { acBonus: 7 } },
        { id: 'inst-2', name: "Shaman's Mud Plate", quantity: 1, instanceStats: { acBonus: 1 } },
      ],
    } as unknown as PlayerCharacter;
    expect(equippedGearAc(p).worn).toBe(7);
  });

  it('a FUSED piece resolves from uniqueStats, matched on name AND slot', () => {
    const p = {
      ac: 10,
      equipped: { chest: 'Resonant Carapace' },
      inventory: [{
        id: 'f1', name: 'Resonant Carapace', quantity: 1,
        uniqueStats: { kind: 'armor', armorSlot: 'chest', acBonus: 5 },
      }],
    } as unknown as PlayerCharacter;
    expect(equippedGearAc(p).worn).toBe(5);
  });

  it('⚠ a fused piece worn in the WRONG slot contributes nothing — as combat had it', () => {
    // The tempting "improvement" here is to resolve the equipped instance by id
    // and read its uniqueStats regardless of slot. Combat never did that, so
    // doing it here would silently raise defence. Bit-identical or it is not a fix.
    const p = {
      ac: 10,
      equipped: { chest: 'Resonant Carapace' },
      inventory: [{
        id: 'f1', name: 'Resonant Carapace', quantity: 1,
        uniqueStats: { kind: 'armor', armorSlot: 'legs', acBonus: 5 },
      }],
    } as unknown as PlayerCharacter;
    expect(equippedGearAc(p).worn).toBe(0);
  });

  it('a slot name in no catalog contributes nothing rather than NaN', () => {
    const p = { ac: 10, inventory: [], equipped: { chest: 'A Thing That Does Not Exist' } } as unknown as PlayerCharacter;
    expect(equippedGearAc(p).worn).toBe(0);
    expect(standingAc(p)).toBe(10);
  });

  it('every armour slot is walked, cloak and hands included', () => {
    expect(ARMOR_SLOTS).toContain('cloak');
    expect(ARMOR_SLOTS).toContain('hands');
    expect(EQUIP).toContain('for (const slot of ARMOR_SLOTS) {');
  });

  it('the tail trim still bends the runaway end', () => {
    const heavy = { ac: 40, inventory: [], equipped: {} } as unknown as PlayerCharacter;
    expect(standingAc(heavy)).toBe(trimStandingAc(40));
    expect(standingAc(heavy)).toBeLessThan(40);
  });
});

describe('OTA-1158 — ⚠ there is ONE implementation, and the store calls it', () => {
  it('aggregateArmor no longer owns an AC sum', () => {
    // The whole point. A second implementation is what produced 15 and 18.
    const from = STORE.indexOf('function aggregateArmor(');
    const to = STORE.indexOf('export function effectiveACBreakdown(');
    const body = STORE.slice(from, to);
    expect(from).toBeGreaterThan(0);
    expect(body).toContain('const gearAc = equippedGearAc(player);');
    expect(body).toContain('const acBonus = gearAc.worn + gearAc.accessories;');
    // No accumulation of its own left anywhere inside it.
    expect(body).not.toContain('acBonus +=');
  });

  it('⚠ the amulet and ring loops are GONE from the store, not duplicated', () => {
    const from = STORE.indexOf('function aggregateArmor(');
    const to = STORE.indexOf('export function effectiveACBreakdown(');
    const body = STORE.slice(from, to);
    expect(body).not.toContain('findAmuletByName');
    expect(body).not.toContain('findRingByName');
  });

  it('the store still owns the RESISTANCE walk — that genuinely lives there', () => {
    // Combat weights a resist by the slot it came from; nothing else needs that,
    // so it stays. Only the AC half moved.
    const from = STORE.indexOf('function aggregateArmor(');
    const to = STORE.indexOf('export function effectiveACBreakdown(');
    const body = STORE.slice(from, to);
    expect(body).toContain('resistSlots.push({ type: r, slot });');
  });

  it('standingAc delegates rather than re-deriving', () => {
    const from = EQUIP.indexOf('export function standingAc(');
    const body = EQUIP.slice(from, EQUIP.indexOf('export function equippedGearAc('));
    expect(body).toContain('equippedGearAc(player)');
    expect(body).toContain('trimStandingAc((player.ac ?? 10) + gear.worn + gear.accessories)');
    // The old inline ARMOR_SLOTS walk must not survive alongside the call.
    expect(body).not.toContain('for (const slot of ARMOR_SLOTS)');
  });
});

describe('OTA-1158 — ⚠ the card names which gear, so this is visible next time', () => {
  it('armor and accessories are separate chips, not one lump', () => {
    const from = STORE.indexOf('export function effectiveACBreakdown(');
    const body = STORE.slice(from, from + 3000);
    expect(body).toContain("sources.push({ label: 'armor', delta: armor })");
    expect(body).toContain("sources.push({ label: 'accessories', delta: accessories })");
  });

  it('and the total counts both — splitting a label must not drop a term', () => {
    const from = STORE.indexOf('export function effectiveACBreakdown(');
    const body = STORE.slice(from, from + 3000);
    // RETARGETED BY OTA-1163 (pressure test) — the breakdown now applies the
    // OTA-947 trim exactly as the resolver does (it had been skipping it, so
    // the expanded card over-read a heavy build). Both terms still counted:
    expect(body).toContain('base + raceCtxDelta + armor + accessories + titleRuinsAc');
    expect(body).toContain('trimStandingAc(standingRaw) + statusAdj');
  });

  it('the breakdown draws its gear from the same helper the panel does', () => {
    const from = STORE.indexOf('export function effectiveACBreakdown(');
    const body = STORE.slice(from, from + 3000);
    expect(body).toContain('const gearAc = equippedGearAc(player);');
  });
});

describe('OTA-1158 — the file records why OTA-1156 did not finish the job', () => {
  it('the helper carries the owner’s report verbatim', () => {
    expect(EQUIP).toContain('THE GEAR STACK, ONCE, WITH THE JEWELLERY IN IT');
    expect(EQUIP).toContain('THE THREE MISSING POINTS ARE JEWELLERY');
  });

  it('and states the constraint that shaped the implementation', () => {
    expect(EQUIP).toContain('Bit-identical or it is not a fix.');
  });
});
