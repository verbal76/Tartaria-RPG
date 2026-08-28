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
jest.mock('expo-updates', () => ({}));


/**
 * OTA-1060 — GIFTING.
 *
 * ⚠ THIS FEATURE WAS DELETED ONCE, ON PURPOSE. OTA-803's note is still in
 * parser.ts: "Faction standing is earned through mission completions +
 * sigil/pendant turn-ins, not by handing vendors loot; the gift-for-rep side
 * door undercut that, so the whole verb + action is gone."
 *
 * So the bar for restoring it is not "does giving work" — it is "is the side
 * door shut". Most of this file is about the door. The rest is about the clause
 * the owner asked for by name: they remember that you gave them THAT ITEM.
 */
jest.setTimeout(60_000);

import {
  resolveGift, reactionFor, timesGiven, giftMemoryLine, giftPrefFor,
  GIFT_FLOOR_TC, GIFT_BOONS_PER_PERSON, GIFT_STANDING_FACTION_CAP,
  STANDING_LOVED, STANDING_INSULT, type GiftItem,
} from '../app/engine/gifting';
import type { NpcRelation } from '../app/engine/types';

const rel = (over: Partial<NpcRelation> = {}): NpcRelation => ({
  id: 'irma_ironhand', name: 'Irma', meetings: 3, firstMetAt: 1, lastSeenAt: 1, lastSeenHours: 0,
  trades: 1, tcTraded: 100, contractsTaken: 0, contractsTurnedIn: 0, wrongs: 0, ...over,
} as NpcRelation);
// ⚠ OTA-1153 — RETARGETED TO REAL CATALOG ITEMS AND REAL TAGS.
// These fixtures used to be `Iron Ingot` (tags ['metal']), `Cut Glass` (['trinket'])
// and `Bead String` (['trinket']). NONE of those three items exists, and `trinket`
// is not a tag any item in the game carries. That is not a nitpick — it is why the
// dead-taste bug survived so long: this suite was green the whole time because it
// asserted against invented data, so it could not tell that Irma's authored tastes
// never fired on anything a player could actually pick up. Fixtures use REAL
// catalog items (§3a-D), and now they do.
const ingot: GiftItem = { name: 'Titanforged Cuirass', tags: ['plate', 'titanforged', 'armor'], worth: 200 };
const nail: GiftItem = { name: 'Bent Nail', tags: ['junk', 'metal', 'scrap'], worth: 2 };
const jewel: GiftItem = { name: 'Blue Cap Mushroom', tags: ['mushroom', 'foraged'], worth: 200 };

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1060 — the door OTA-803 closed stays closed', () => {
  it('THE CAP IS SMALL — one faction can never be gifted into friendship', () => {
    // Several vendors share a faction. A per-person cap alone would be four
    // boons each across five members = eighty standing through a side door.
    // The faction budget is lifetime and global, worth roughly one mission.
    expect(GIFT_STANDING_FACTION_CAP).toBeLessThanOrEqual(12);
    expect(GIFT_STANDING_FACTION_CAP).toBeLessThan(GIFT_BOONS_PER_PERSON * STANDING_LOVED * 2);
  });

  it('and the per-person boon count is capped too', () => {
    let r = rel({ giftBoons: GIFT_BOONS_PER_PERSON });
    const out = resolveGift('irma_ironhand', 'Irma', ingot, r);
    expect(out.countsAsBoon).toBe(false);
    expect(out.standingDelta).toBe(0);
    expect(out.line).toContain('about as warm towards you as gifts can make anybody');
  });

  it('GIFT-FARM: the same item again and again stops counting', () => {
    // Twenty of the same thing must not buy twenty steps of warmth.
    const given = (n: number) =>
      rel({ gifts: Array.from({ length: n }, () => ({ name: 'Titanforged Cuirass', atHours: 0 })) });
    expect(resolveGift('irma_ironhand', 'Irma', ingot, given(0)).countsAsBoon).toBe(true);
    expect(resolveGift('irma_ironhand', 'Irma', ingot, given(1)).countsAsBoon).toBe(true);
    const third = resolveGift('irma_ironhand', 'Irma', ingot, given(2));
    expect(third.countsAsBoon).toBe(false);
    expect(third.line).toContain('lands softer each time');
  });

  it('...but a DIFFERENT item still lands', () => {
    const r = rel({ gifts: [{ name: 'Titanforged Cuirass', atHours: 0 }, { name: 'Titanforged Cuirass', atHours: 1 }] });
    // OTA-1153 — was `{ name: 'Aether Mud', tags: ['ore'] }`. `ore` is another tag
    // no item in the game carries, so this asserted a match that could never occur
    // in play. Irma really does like gauntlets.
    expect(resolveGift('irma_ironhand', 'Irma', { name: "Titan's Gauntlets", tags: ['gauntlets', 'armor'], worth: 60 }, r)
      .countsAsBoon).toBe(true);
  });

  it('TRASH-FLOOD: a worthless gift is REFUSED, not quietly accepted', () => {
    // If junk were accepted, a player could empty a pack into somebody at a
    // cost of taps only. Refusing keeps the item and makes the insult legible.
    //
    // ⚠⚠ OTA-1534 — AND THE REFUSAL IS THE WHOLE DETERRENT, which is why the
    // standing dock left the FIRST offer. The owner, after Irma docked him 2 for
    // a Salvage Cap: *"I don't think that should give negative standing since you
    // need to guess at first what they are in to and like."* Tastes are authored
    // per person and discoverable only by offering, so the first try is a guess
    // the game asked for. The anti-trash-flood claim this test exists to hold is
    // untouched: the item is REFUSED, so nothing is gained by emptying a pack.
    const out = resolveGift('irma_ironhand', 'Irma', nail, rel());
    expect(out.reaction).toBe('insulted');
    expect(out.refused).toBe(true);
    expect(out.countsAsBoon).toBe(false);
    expect(out.standingDelta).toBe(0);
    expect(out.remember).toBe(false);
  });

  it('⚠⚠ OTA-1534 — but the SAME junk offered a second time still costs standing', () => {
    // Being told "no" and handing over the identical thing again is not a guess,
    // it is a point being made — and that IS the trash-flood this suite guards.
    const repeat = rel({ gifts: [{ name: nail.name, at: 1, hours: 0 }] } as never);
    const out = resolveGift('irma_ironhand', 'Irma', nail, repeat);
    expect(out.reaction).toBe('insulted');
    expect(out.refused).toBe(true);
    expect(out.standingDelta).toBe(-STANDING_INSULT);
  });

  it('the insult floor is low enough not to gate the feature behind wealth', () => {
    expect(GIFT_FLOOR_TC).toBeLessThanOrEqual(20);
    expect(reactionFor('irma_ironhand', { name: 'Scrap', tags: [], worth: GIFT_FLOOR_TC })).not.toBe('insulted');
    expect(reactionFor('irma_ironhand', { name: 'Scrap', tags: [], worth: GIFT_FLOOR_TC - 1 })).toBe('insulted');
  });
});

describe('OTA-1060 — who they are decides what it is worth', () => {
  it('a smith is delighted by PLATE and actively unmoved by forage', () => {
    // OTA-1153 — the assertion is the same claim, made against things that exist.
    // Irma is a heavy armorer for the Tartarian Giants: plate is her love, and
    // `metal` deliberately is NOT (it covers Bent Nails and Pry Bars — being
    // delighted by a pry bar would make her indiscriminate, which is the failure
    // this rewrite was meant to cure).
    expect(reactionFor('irma_ironhand', ingot)).toBe('loved');
    expect(reactionFor('irma_ironhand', { name: 'Iron Core', tags: ['metal', 'core'], worth: 40 })).toBe('liked');
    // A mushroom is now a real DISLIKE rather than an indifferent shrug — the tier
    // the owner asked for and the schema did not previously have.
    expect(reactionFor('irma_ironhand', { name: 'Blue Cap Mushroom', tags: ['mushroom'], worth: 40 })).toBe('disliked');
  });

  it('a general trader is the other way round', () => {
    expect(reactionFor('halem_trader', { name: 'Trail Rations', tags: ['food'], worth: 30 })).toBe('loved');
    expect(reactionFor('halem_trader', { name: 'Iron Ore', tags: ['ore'], worth: 30 })).toBe('polite');
  });

  it('something genuinely valuable is welcome from anybody', () => {
    // Otherwise a specialist could never be given anything outside their trade,
    // which reads as a lookup table rather than a person.
    // OTA-1153 — `jewel` is now a real item (Blue Cap Mushroom) and Drakos really
    // does dislike forage, so it can no longer stand for "no opinion". The claim
    // under test is the PRICE FALLBACK, so the fixture has to be something he has
    // no view on at all: a runecaster is outside a two-hander merchant's trade.
    expect(reactionFor('drakos_mercenary', { name: 'Aetheric Ward', tags: ['runecaster', 'spell'], worth: 200 })).toBe('liked');
  });

  it('a person with no authored preferences still reacts sensibly', () => {
    const p = giftPrefFor('somebody_unauthored');
    expect(p.lovedLine ?? p.likedLine ?? p.politeLine).toBeTruthy();
    expect(resolveGift('somebody_unauthored', 'Stranger', ingot, rel()).refused).toBe(false);
  });

  it('every reaction is real prose with no placeholder left in it', () => {
    // ⚠ NOT "names the item". My first version of this asserted that, and it
    // failed against Irma's refusal — "you have brought me THAT" — which is
    // better writing than naming it would be. An author who wants the item
    // named writes {item}; the rule is that the substitution completes, not
    // that every line must use it.
    for (const npc of ['irma_ironhand', 'halem_trader', 'scrap_broker', 'unauthored']) {
      for (const it of [ingot, jewel, nail]) {
        const line = resolveGift(npc, 'Someone', it, rel()).line;
        expect(line).not.toContain('{');
        expect(line.length).toBeGreaterThan(40);
      }
    }
  });

  it('the FALLBACK lines do name it — an unauthored NPC has nothing else to go on', () => {
    for (const it of [ingot, jewel, nail]) {
      expect(resolveGift('unauthored_person', 'Stranger', it, rel()).line).toContain(it.name);
    }
  });

  it('is deterministic — gratitude is not a dice roll', () => {
    const first = resolveGift('irma_ironhand', 'Irma', ingot, rel());
    for (let i = 0; i < 50; i++) {
      expect(resolveGift('irma_ironhand', 'Irma', ingot, rel())).toEqual(first);
    }
  });
});

describe('OTA-1060 — they remember the OBJECT', () => {
  it('THE CLAUSE THAT MATTERS: the Chronicle names what you gave', () => {
    const r = rel({ gifts: [{ name: 'Iron Ingot', atHours: 4 }, { name: 'Aether Mud', atHours: 9 }] });
    const line = giftMemoryLine(r);
    expect(line).toContain('Iron Ingot');
    expect(line).toContain('Aether Mud');
  });

  it('the same item twice is remembered as one thing, not two', () => {
    const r = rel({ gifts: [{ name: 'Iron Ingot', atHours: 1 }, { name: 'Iron Ingot', atHours: 2 }] });
    expect(giftMemoryLine(r)).toBe('gifts: Iron Ingot');
    expect(timesGiven(r, 'Iron Ingot')).toBe(2);
  });

  it('a long list is summarised rather than dumped into the column', () => {
    const r = rel({ gifts: ['A', 'B', 'C', 'D', 'E'].map((n) => ({ name: n, atHours: 0 })) });
    expect(giftMemoryLine(r)).toContain('and 2 more');
  });

  it('somebody you have given nothing has no gift line at all', () => {
    expect(giftMemoryLine(rel())).toBe('');
    expect(giftMemoryLine(null)).toBe('');
  });
});

describe('OTA-1060 — the store keeps the door shut too', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SRC: string = require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');

  it('gift standing is metered against the lifetime faction budget', () => {
    expect(SRC).toContain('GIFT_STANDING_FACTION_CAP - spent');
    expect(SRC).toMatch(/giftStandingGranted/);
  });

  it('an INSULT is never capped — being rude must always land', () => {
    // A capped penalty would let a player be rude for free once the positive
    // budget was spent, which is the wrong way round.
    expect(SRC).toMatch(/if \(delta > 0\) \{/);
  });

  it('a refused gift is not consumed', () => {
    expect(SRC).toMatch(/if \(out\.refused\)[\s\S]{0,400}return;/);
  });

  it('the verb exists again, and the parser says why', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const parser: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '../app/engine/parser.ts'), 'utf8');
    expect(parser).toMatch(/gift: \['gift', 'give', 'offer', 'present'\]/);
    expect(parser).toContain('OTA-803');
    expect(parser).toContain('GIFT_STANDING_FACTION_CAP');
  });
});
