// OTA-1179 — THE FACTION STANDING WIRING, from a full read+write audit of the system.
//
// Owner: *"track all of the math and all of the wires for the faction standings. I
// want to make sure that the entire system everything that it touches is working
// correctly… search every part of this code for where the faction standings have
// any kind of application and how they're wired and make sure nothing's broken."*
//
// ⚠ THE THEME. OTA-1178 fixed ONE caller that announced a standing grant it never
// verified. The audit found the same shape in five more places and, worse, the
// mirror image on the READ side — where the failure is quieter still, because an
// unknown id reads as `0`, which is indistinguishable from genuinely neutral.
//
// ⚠ WHAT THIS SUITE DELIBERATELY DOES NOT COVER. Four findings were held for the
// owner because they are DESIGN calls, not defects: the one-directional ambient
// standing ratchet, the in-game explainer text (two of its three claims are false),
// a defensive term in the difficulty scaler, and the contract-refusal wording. Also
// held: the theft/extort spillover meters, because "how much should the world move
// standing" is the same question he is deciding. Nothing here touches any of them.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: unknown = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import * as fs from 'fs';
import * as path from 'path';
import {
  applyRepChange, canonicalFactionId, getStanding, JOIN_THRESHOLD, FACTIONS,
} from '../app/engine/factions';
import { hasFactionRapport, vendorPriceMod, rapportQuestId } from '../app/engine/factionRapport';
import { AFFILIATED_STANDING } from '../app/engine/locationChallenges';
import { hostileHuntChance, HOSTILE_STANDING, profileOf } from '../app/engine/pressure';
import { backfillPlayer } from '../app/state/gameStore';
import type { PlayerCharacter } from '../app/engine/types';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');
const VENDOR_SCREEN = read('app', 'screens', 'VendorScreen.tsx');

// The four race ids OTA-834 remapped in the stall roster and never migrated in saves.
const LEGACY = {
  architectural_sentinels: 'stone_builders',
  unknowing_masses: 'conspiracy_architects',
  aetherborn: 'eternal_dynasty',
  mud_golems: 'mud_monarchs',
} as const;

describe('OTA-1179 — the READ side heals ids too, not just the write side', () => {
  it('⚠ getStanding used to read a legacy id as neutral — indistinguishable from unknown', () => {
    // The quiet half of the OTA-1178 bug. A player who ground a faction to +30
    // through a vendor recorded under a bad id read as a STRANGER to every
    // consumer at once: pricing, contracts, hostility, brokering, titles, the sheet.
    const standing = [{ factionId: 'stone_builders', standing: 30 }];
    for (const [legacy, real] of Object.entries(LEGACY)) {
      expect(canonicalFactionId(legacy)).toBe(real);
    }
    expect(getStanding(standing, 'architectural_sentinels')).toBe(30);
    expect(getStanding(standing, 'stone_builders')).toBe(30);
  });

  it('a genuinely unknown id still reads 0, and does NOT get rewritten to something', () => {
    // ⚠ The fallback is the id itself, not null. An id this build does not know
    // might be NEWER than the roster rather than older; silently resolving it to
    // some other faction would be the same mistake pointing the other way.
    expect(getStanding([{ factionId: 'stone_builders', standing: 30 }], 'not_a_faction')).toBe(0);
    expect(canonicalFactionId('not_a_faction')).toBeNull();
  });

  it('⚠ the rapport discount was permanently 0 for a legacy-id vendor', () => {
    // It builds a QUEST ID out of the faction id. A legacy id yields
    // `fq_architectural_sentinels_rapport`, which exists in no catalogue — so the
    // player who actually completed the rapport quest silently never got the
    // discount, with no log line anywhere.
    const done = [rapportQuestId('stone_builders')];
    expect(hasFactionRapport(done, 'architectural_sentinels')).toBe(true);
    expect(vendorPriceMod(20, done, 'architectural_sentinels')).toBeGreaterThan(0);
    // …and a factionless vendor still gets nothing, which is the design.
    expect(vendorPriceMod(20, done, null)).toBe(0);
  });
});

describe('OTA-1179 — every faction has a row, forever', () => {
  const bare = (over: Partial<PlayerCharacter> = {}): PlayerCharacter =>
    ({
      name: 'Verbal', stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
      inventory: [], equipped: {}, hp: 20, hpMax: 20, tc: 0,
      factionStanding: [], ...over,
    } as unknown as PlayerCharacter);

  it('⚠ a missing row could never be created — applyRepChange is a pure map', () => {
    // This is the landmine: rows are minted at character creation and nowhere else,
    // so a faction absent from the array reads 0 forever AND silently absorbs every
    // grant aimed at it. Adding a tenth faction would do that to every live save.
    const empty = applyRepChange([], 'stone_builders', 5);
    expect(empty.standing).toEqual([]);
    expect(empty.changed).toEqual([]);
  });

  it('the backfill mints a row for every faction in the roster', () => {
    const out = backfillPlayer(bare());
    for (const f of FACTIONS) {
      expect(out.factionStanding.some((r) => r.factionId === f.id)).toBe(true);
    }
    // …and the grant now lands, which is the whole point.
    expect(applyRepChange(out.factionStanding, 'stone_builders', 5).changed.length).toBeGreaterThan(0);
  });

  it('⚠ a legacy row is MERGED onto the real faction, keeping the earned value', () => {
    const out = backfillPlayer(bare({
      factionStanding: [{ factionId: 'architectural_sentinels', standing: 30 }],
    } as Partial<PlayerCharacter>));
    expect(out.factionStanding.some((r) => r.factionId === 'architectural_sentinels')).toBe(false);
    expect(out.factionStanding.find((r) => r.factionId === 'stone_builders')?.standing).toBe(30);
  });

  it('⚠ merging keeps the value FURTHER FROM NEUTRAL, so no earned grudge is erased', () => {
    // A save can carry both rows. Taking "whichever is bigger" would quietly forgive
    // a −40; taking "whichever is first" would depend on array order.
    const out = backfillPlayer(bare({
      factionStanding: [
        { factionId: 'stone_builders', standing: 3 },
        { factionId: 'architectural_sentinels', standing: -40 },
      ],
    } as Partial<PlayerCharacter>));
    expect(out.factionStanding.find((r) => r.factionId === 'stone_builders')?.standing).toBe(-40);
  });

  it('an already-correct save is left byte-identical (no churn on every load)', () => {
    const rows = FACTIONS.map((f) => ({ factionId: f.id, standing: f.startingStanding ?? 0 }));
    const out = backfillPlayer(bare({ factionStanding: rows } as Partial<PlayerCharacter>));
    expect(out.factionStanding).toEqual(rows);
  });
});

describe('OTA-1179 — the hunt roll is about the faction that is actually hunting you', () => {
  it('⚠ the function reduces to the MINIMUM of whatever array it is handed', () => {
    // This is the mechanism. Handing it the whole table means the roll for a
    // Reclaimers patrol is computed from your worst standing with anybody.
    const profile = profileOf({ hoursElapsed: 900 } as unknown as PlayerCharacter);
    const wholeTable = [
      { factionId: 'reclaimers_guild', standing: -1 },
      { factionId: 'mud_monarchs', standing: -60 },
    ];
    const justTheHunter = [{ factionId: 'reclaimers_guild', standing: -1 }];
    expect(hostileHuntChance(wholeTable, profile))
      .toBeGreaterThan(hostileHuntChance(justTheHunter, profile));
    // A faction you are barely negative with is above the hostile line, so on its
    // own it cannot hunt you at all.
    expect(-1).toBeGreaterThan(HOSTILE_STANDING);
    expect(hostileHuntChance(justTheHunter, profile)).toBe(0);
  });

  it('⚠ the call site passes ONE row, not the whole table', () => {
    expect(STORE).toContain('const hostileStanding = player.factionStanding.find((r) => r.factionId === hostile.factionId)');
    expect(STORE).not.toMatch(/hostileHuntChance\(player\.factionStanding,/);
  });
});

describe('OTA-1179 — the join threshold is one number', () => {
  it('every consumer derives from JOIN_THRESHOLD instead of copying 20', () => {
    expect(AFFILIATED_STANDING).toBe(JOIN_THRESHOLD);
    const bounty = read('app', 'engine', 'factionBounty.ts');
    expect(bounty).toContain('const FRIENDLY_QUARRY = JOIN_THRESHOLD;');
    expect(bounty).toContain('if (s >= JOIN_THRESHOLD) return 0;');
  });

  it('⚠ the two screens stopped hardcoding it — they were the copies most likely to drift', () => {
    // CharacterScreen's own comment cited "per JOIN_THRESHOLD in engine/factions.ts"
    // and then hardcoded 20 twice, so the ✓ mark and the colour could disagree with
    // the rule they claim to show.
    const cs = read('app', 'screens', 'CharacterScreen.tsx');
    const ws = read('app', 'screens', 'WorldScreen.tsx');
    expect(cs).toContain('standing >= JOIN_THRESHOLD');
    expect(cs).not.toContain('const qualifies = standing >= 20;');
    expect(ws).toContain('standing >= JOIN_THRESHOLD');
  });
});

describe('OTA-1179 — writers report what landed, not what was authored', () => {
  it('⚠ the story fork stopped printing a raw id and an unverified delta', () => {
    // The closest structural twin of the OTA-1178 gift bug: bare `.standing`,
    // `changed` discarded, log unconditional, and the underscored id shown raw.
    const i = STORE.indexOf('function applyForkEffects');
    const fn = STORE.slice(i, STORE.indexOf('\n}\n', i));
    expect(i).toBeGreaterThan(0);
    expect(fn).toContain('canonicalFactionId(factionId)');
    expect(fn).toContain('logRepChanges(get, forkChanges)');
    expect(fn).not.toContain("${factionId.replace(/_/g, ' ')}");
  });

  it('⚠ the hostile dock stamps its one-shot ledger LAST', () => {
    // Order is the whole bug. The ledger is what makes the dock one-shot, so
    // stamping it before confirming meant an unresolvable id burned the ledger,
    // moved nothing, and reported a punishment that could then never be applied.
    const i = STORE.indexOf('function dockHostileStanding');
    const fn = STORE.slice(i, STORE.indexOf('\n}\n', i));
    expect(i).toBeGreaterThan(0);
    expect(fn.indexOf('applyRepChange')).toBeLessThan(fn.indexOf('standingDocked: magnitude'));
    expect(fn).toContain('if (!anyLanded)');
    expect(fn).toContain('canonicalFactionId(f)');
  });

  it('the gift path now shows the ally/rival cascade it used to hide', () => {
    const i = STORE.indexOf('function applyGiftStanding');
    const fn = STORE.slice(i, STORE.indexOf('\n}\n', i));
    expect(fn).toContain('logRepChanges(get, giftChanges)');
  });

  it('⚠ a real grant genuinely moves rivals — the thing that was invisible', () => {
    const rows = FACTIONS.map((f) => ({ factionId: f.id, standing: 0 }));
    const out = applyRepChange(rows, 'conspiracy_architects', 4);
    expect(out.changed.find((c) => c.factionId === 'conspiracy_architects')?.delta).toBe(4);
    // Somebody else moved too, and the player was never told.
    expect(out.changed.length).toBeGreaterThan(1);
  });
});

describe('OTA-1179 — honest custom is not confiscated', () => {
  it('⚠ the buy pool is only spent when the grant actually lands', () => {
    // Every roadside trader has `faction: null`, so crossing 500 TC at one used to
    // burn 500 TC of accumulated credit and grant nothing — permanently, because
    // the pool does not refund. Same loss at REP_MAX.
    // ⚠ OTA-1181 RETARGET, NOT A REGRESSION. This used to anchor its slice on
    // `const BUY_REP_TC_PER_STANDING = 500;` — a function-local declaration that
    // OTA-1181 promoted to engine/factions.ts so the character sheet could state
    // the rule instead of printing a second copy of the number. The claim being
    // asserted (the pool is debited only when the grant lands) is unchanged and is
    // still asserted in full; only the anchor moved, onto the pool arithmetic
    // itself, which is the thing this test is actually about and cannot relocate
    // without the behaviour relocating with it.
    const i = STORE.indexOf('const buyRepPool = (player.buyRepProgress ?? 0) + totalCost;');
    expect(i).toBeGreaterThan(0);
    const block = STORE.slice(i, i + 2600);
    expect(block).toContain('const buyRepLanded = repResult.changed.length > 0;');
    expect(block).toContain('const nextBuyRepProgress = buyRepLanded');
    expect(STORE).toContain('canonicalFactionId(scene.vendor.faction)');
    // and the constant still exists, at its new single home
    expect(read('app', 'engine', 'factions.ts'))
      .toContain('export const BUY_REP_TC_PER_STANDING = 500;');
    expect(STORE).toContain('BUY_REP_TC_PER_STANDING, // OTA-1181');
  });

  it('the roadside vendors this protects really do have no faction', () => {
    // If this ever stops being true the bug stops being reachable that way — but
    // the REP_MAX case keeps it live regardless.
    expect(read('app', 'engine', 'vendors.ts')).toContain('faction: null,');
  });
});

describe('OTA-1179 — the vendor screen charges what it shows', () => {
  it('⚠ the display passes all SIX price factors, like the purchase does', () => {
    // It passed four. Missing: OTA-1076 per-person regard and OTA-1089's Phase-4
    // pressure tide — so shown and charged silently disagreed for any vendor who
    // liked or disliked you, inside the very file written to prevent that drift.
    const shown = VENDOR_SCREEN.match(/finalBuyPrice\(o\.price, \{([^}]*)\}/)?.[1] ?? '';
    expect(shown).toBeTruthy();
    for (const part of ['corruptionMult', 'buyDiscount', 'tideMult', 'warBuyMult', 'regardMult', 'pressureTideMult']) {
      expect([part, shown.includes(part)]).toEqual([part, true]);
    }
  });

  it('the store side still passes the same six', () => {
    const charged = STORE.match(/const priceParts = \{([^}]*)\}/)?.[1] ?? '';
    for (const part of ['corruptionMult', 'buyDiscount', 'tideMult', 'warBuyMult', 'regardMult', 'pressureTideMult']) {
      expect([part, charged.includes(part)]).toEqual([part, true]);
    }
  });
});

describe('OTA-1179 — text that described the wrong rule', () => {
  it('the scion title finally mentions the standing it requires', () => {
    const titles = read('app', 'data', 'lore', 'arbiter-titles.json');
    const scion = JSON.parse(titles).find?.((t: { id: string }) => t.id === 'scion_of_the_giants')
      ?? (JSON.parse(titles).titles ?? []).find((t: { id: string }) => t.id === 'scion_of_the_giants');
    expect(scion.requirement).toContain('25 standing');
  });

  it('the comment claiming stealing is standing-gated is gone', () => {
    // It is not gated on standing — standing is a CONSEQUENCE of being caught.
    expect(VENDOR_SCREEN).not.toMatch(/Steal has its own gates \(DC roll, faction\n\s*\/\/ standing/);
  });
});

describe('OTA-1179 — the held decisions are untouched', () => {
  // ⚠ These assertions exist so a future session cannot quietly implement the
  // owner's pending design calls as "cleanup". He is deciding on them.
  //
  // ⚠ THE AMBIENT-RATCHET ASSERTION THAT LIVED HERE IS GONE ON PURPOSE. The owner
  // DECIDED that one on 2026-08-07 ("you should work to get standing, not earn it
  // by breathing") and OTA-1180 shipped it. Its replacement lives in
  // ota1180AmbientStandingOff and asserts the OPPOSITE — that the catalogue's
  // repDelta count is ZERO. Deciding a held item does not retire its lock; it
  // inverts it, so the decision is as hard to undo as the hold was.

  it('the difficulty scaler still has no defensive term', () => {
    const enc = read('app', 'engine', 'encounter.ts');
    expect(enc).toContain('return bestCombatStat + hpMax / 10;');
  });
});
