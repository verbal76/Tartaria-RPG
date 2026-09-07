/**
 * OTA-1726 - THE ROAD BACK TO A DOG.
 *
 * The owner's canon, given as a decision rather than a question: the first-dog
 * encounter is still the introduction; once dog gameplay is unlocked, losing a
 * dog does NOT permanently remove access to dogs; an individual dog's death is
 * still permanent and a replacement inherits nothing; ordinary replacements are
 * BOUGHT at substantial cost, "centered around roughly 600 TC"; faction dogs are
 * better and cost faction access on top of coin; neglect-abandonment buys you
 * nothing.
 *
 * WHAT THE AUDIT FOUND FIRST, before anything was written. The only road back to
 * a dog was the puppy vendor, and it was a dead end by construction:
 *
 *   1. It told the player to type `accept puppy` or `decline puppy`. Neither
 *      phrase has a parser verb or a handler anywhere in the app - the only
 *      occurrence of the string is inside the Arbiter's own instruction.
 *   2. It wrote a `puppy_vendor_trade_id:` memo for handlers that do not exist.
 *      Its sibling `dog_rescue_pending:` IS read; this one never was.
 *   3. Its no-tradeable-item branch set `puppyVendorUsed: true` PERMANENTLY, so a
 *      player whose pack happened to be empty when the offer fired could never
 *      hold a dog again for the rest of that save.
 *   4. The offer path cleared `puppyVendorQueued` but never set `puppyVendorUsed`
 *      nor cleared `puppyVendorOwed`, contradicting its own doc comment, so the
 *      offer re-fired on any mention of a basket or a stranger, forever.
 *
 * So it was superseded, not repaired: repairing it would have made a mechanism
 * reachable that contradicts the canon on three separate counts (single-shot,
 * near-free, death-gated).
 *
 * AND THE ARCHITECTURE ALREADY SUPPORTED THE CANON. Nothing here is a new
 * system:
 *   . acquisition already funnels through ONE field, `pendingDogOnboarding`, and
 *     `finishDogOnboarding` overwrites `player.dog` wholesale from a fresh
 *     `createDogCompanion` - so "inherits nothing" was already true;
 *   . five stat profiles were already authored and differentiated, so "faction
 *     dogs are better and specialised" needed no new content;
 *   . `buyFromVendor` already had TWO branches for buying a thing that is not an
 *     item (procedure texts, recipes), and conditional vendor rows already had
 *     TWO precedents with an explicit "same shape, same place" contract.
 * This is a third instance of each, which is why it is an OTA and not a Fable
 * escalation.
 *
 * ON THE NUMBER: `techniqueTextPrice` has charged exactly 600 TC for a Rare
 * procedure since OTA-1195 - the game's other "only route into a whole feature"
 * purchase - so the owner's figure lands on a rung the economy already has. His
 * most recent log shows him holding 459 TC, so it is a sum he must go and earn.
 */
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
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore, withReplacementDogOffer } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { createDogCompanion } from '../app/engine/dogCompanion';
import * as DM from '../app/engine/dogMarket';
import type { VendorInstance } from '../app/engine/vendors';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const flush = (): Promise<unknown> => new Promise((r) => setTimeout(r, 0));
jest.setTimeout(240000);

/** Strip comments so a scanner cannot be satisfied - or tripped - by prose.
 *  OTA-1721's lesson: my own comment quoting the string I was hunting made the
 *  instrument report on itself. */
const codeOnly = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const stall = (over?: Partial<VendorInstance>): VendorInstance => ({
  id: 'roadside_honest_test', name: 'Duvo Saltbeard', title: 'roadside trader',
  offers: [{ itemName: 'Rope', price: 10, quantity: 2 }],
  ...over,
} as VendorInstance);

/** A run with a DEAD dog on the record - the state the canon is about. */
async function bootWithDeadDog(tc = 1000): Promise<void> {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Verbal', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  const dead = createDogCompanion({ name: 'Cinder', breed: 'mutt', rawSex: 'male', startingProfile: 'mongrel', currentHour: 0 });
  store.setState({
    player: { ...p0, tc, dog: { ...dead, status: 'dead' as const, loyalty: 97,
      stats: { ...dead.stats, strength: 17 }, statProgress: { strength: 40, dexterity: 0, intelligence: 0 },
      equipped: { vest: 'Padded Dog Vest', vestId: 'vest_1' } } } as typeof p0,
    worldMemory: { ...store.getState().worldMemory, pendingDogOnboarding: null },
  });
}

// ===== 1. the gates, measured without a store =============================

describe('OTA-1726 - who is offered a dog, and who is not', () => {
  const base = { vendorFaction: null, hasRapport: false, hadDogEver: true, hasActiveDog: false, onboardingPending: false };

  it('THE FIRST-DOG ENCOUNTER IS STILL THE INTRODUCTION - no dog, no market', () => {
    // Without this gate a fresh character buys past five authored rescue
    // scenarios and the arc becomes content nobody sees.
    expect(DM.dogOfferFor({ ...base, hadDogEver: false })).toBeNull();
  });

  it('a player who has HAD a dog is offered one, at the owner\'s number', () => {
    const o = DM.dogOfferFor(base);
    expect(o?.itemName).toBe('Kennel Dog');
    expect(o?.price).toBe(600);
    expect(DM.REPLACEMENT_DOG_PRICE).toBe(600);
  });

  it('no offer while a dog is at your side, or while a naming card is open', () => {
    expect(DM.dogOfferFor({ ...base, hasActiveDog: true })).toBeNull();
    expect(DM.dogOfferFor({ ...base, onboardingPending: true })).toBeNull();
  });

  it('A FACTION DOG COSTS RAPPORT AS WELL AS COIN - without it you get the ordinary one', () => {
    const noRapport = DM.dogOfferFor({ ...base, vendorFaction: 'true_tartarians', hasRapport: false });
    expect(noRapport?.itemName).toBe('Kennel Dog');
    const withRapport = DM.dogOfferFor({ ...base, vendorFaction: 'true_tartarians', hasRapport: true });
    expect(withRapport?.itemName).toBe('Tartarian War Shepherd');
    expect(withRapport?.price).toBe(900);
  });

  it('rapport with a faction that breeds no dog still gets the ordinary one', () => {
    const o = DM.dogOfferFor({ ...base, vendorFaction: 'mud_monarchs', hasRapport: true });
    expect(o?.itemName).toBe('Kennel Dog');
  });

  it('FACTION DOGS ARE BETTER, and it is the authored profiles that make them so', () => {
    // "Better/specialised" needed no new content: five profiles were already in
    // dogCompanion.ts with different stats. Each faction row is the ONE profile
    // that faction would breed for.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DC = require('../app/engine/dogCompanion');
    const profiles = Object.values(DM.FACTION_DOGS).map((r) => r.profile);
    expect(new Set(profiles).size).toBe(profiles.length); // no two the same
    expect(profiles).not.toContain('mongrel');            // and none is the ordinary one
    expect(profiles).not.toContain('puppy');
    expect(typeof DC.rollStartingDogHP(profiles[0]!)).toBe('number');
  });

  it('every market name resolves back to exactly one row, case-insensitively', () => {
    for (const r of DM.ALL_DOG_MARKET_ROWS) {
      expect(DM.dogMarketRowByName(r.itemName.toUpperCase())).toBe(r);
    }
    expect(DM.dogMarketRowByName('rope')).toBeNull();
    expect(DM.dogMarketRowByName('')).toBeNull();
  });

  it('NO MARKET NAME COLLIDES WITH A CATALOG ITEM - the buy branch asks first', () => {
    // The dog branch runs BEFORE the item lookup, so a shared name would mean a
    // real item could never be bought again.
    const names = new Set<string>();
    for (const f of ['gear.json', 'weapons.json', 'armor.json', 'materials.json']) {
      let raw: string;
      try { raw = src('app', 'data', 'items', f); } catch { continue; }
      for (const m of raw.matchAll(/"name":\s*"([^"]+)"/g)) names.add(m[1]!.toLowerCase());
    }
    expect(names.size).toBeGreaterThan(200); // the scanner actually read something
    for (const r of DM.ALL_DOG_MARKET_ROWS) expect(names.has(r.itemName.toLowerCase())).toBe(false);
  });
});

// ===== 2. the row reaches a real vendor ===================================

describe('OTA-1726 - the row on the shelf', () => {
  beforeEach(async () => { await bootWithDeadDog(); });

  it('a roadside stall carries the ordinary dog once you have had one', () => {
    const p = useGameStore.getState().player!;
    const v = withReplacementDogOffer(stall(), p, useGameStore.getState().worldMemory);
    expect(v?.offers.map((o) => o.itemName)).toContain('Kennel Dog');
  });

  it('and does NOT, for a character who has never had a dog', () => {
    const p = { ...useGameStore.getState().player!, dog: undefined };
    const v = withReplacementDogOffer(stall(), p as never, useGameStore.getState().worldMemory);
    expect(v?.offers.map((o) => o.itemName)).not.toContain('Kennel Dog');
  });

  it('the row is added ONCE - a re-run never doubles it', () => {
    const p = useGameStore.getState().player!;
    const wm = useGameStore.getState().worldMemory;
    const twice = withReplacementDogOffer(withReplacementDogOffer(stall(), p, wm), p, wm);
    expect(twice!.offers.filter((o) => o.itemName === 'Kennel Dog').length).toBe(1);
  });

  it('BOTH vendor sources carry it - the stall is the one players meet most', () => {
    // The step-site stall is the dominant vendor source ("a stall every ~5
    // travel steps"). A market only at named hubs is a market most players
    // never walk into.
    const S = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect((S.match(/withReplacementDogOffer\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

// ===== 3. the purchase, end to end =======================================

describe('OTA-1726 - buying the dog', () => {
  beforeEach(async () => { await bootWithDeadDog(1000); });

  const putStallWithDog = (): void => {
    const st = useGameStore.getState();
    const v = withReplacementDogOffer(stall(), st.player!, st.worldMemory)!;
    useGameStore.setState({ currentScene: { ...st.currentScene!, vendor: v, enemies: [] } as never });
  };

  it('THE WHOLE ACQUISITION: pay, name, and a dog is at your side', async () => {
    putStallWithDog();
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().buyFromVendor('Kennel Dog', 1);
    await flush();
    // paid exactly the asking price, and nothing minted into the pack
    expect(useGameStore.getState().player!.tc).toBe(before - 600);
    expect(useGameStore.getState().player!.inventory.some((i) => i.name === 'Kennel Dog')).toBe(false);
    // the naming card is open, through the SAME funnel every rescue uses
    const pend = useGameStore.getState().worldMemory.pendingDogOnboarding!;
    expect(pend.stage).toBe('breed');
    expect(pend.rescueData.scenario).toBe('market');
    expect(pend.rescueData.startingProfile).toBe('mongrel');
    // finish it
    useGameStore.getState().confirmDogOnboarding('a shepherd', 'Ash', 'female');
    await flush();
    const dog = useGameStore.getState().player!.dog!;
    expect(dog.name).toBe('Ash');
    expect(dog.status).toBe('with_player');
    expect(useGameStore.getState().worldMemory.pendingDogOnboarding).toBeNull();
  });

  it('A REPLACEMENT INHERITS NOTHING - not the name, the bond, or the record', async () => {
    // The owner's third canon point, and the reason no "trade in" path was
    // built: finishDogOnboarding overwrites player.dog wholesale from a fresh
    // createDogCompanion, so there is nowhere for the old dog to leak through.
    putStallWithDog();
    const oldDog = useGameStore.getState().player!.dog!;
    useGameStore.getState().buyFromVendor('Kennel Dog', 1);
    await flush();
    useGameStore.getState().confirmDogOnboarding('a shepherd', 'Ash', 'female');
    await flush();
    const dog = useGameStore.getState().player!.dog!;
    expect(dog.name).not.toBe(oldDog.name);
    expect(dog.id).not.toBe(oldDog.id);
    expect(dog.loyalty).not.toBe(oldDog.loyalty);
    // the dead dog was trained to STR 17; a bought mongrel starts at the
    // profile's own 10, so no progression came across.
    expect(oldDog.stats.strength).toBe(17);
    expect(dog.stats.strength).toBe(10);
    expect(dog.statProgress.strength).toBe(0);
    // and the dead dog's vest did not come with it either
    expect(dog.equipped.vest).toBeNull();
    expect(dog.status).not.toBe('dead');
  });

  it('SHORT OF THE MONEY: refused, and not one TC moves', async () => {
    const st0 = useGameStore.getState();
    useGameStore.setState({ player: { ...st0.player!, tc: 599 } as never });
    putStallWithDog();
    useGameStore.getState().buyFromVendor('Kennel Dog', 1);
    await flush();
    expect(useGameStore.getState().player!.tc).toBe(599);
    expect(useGameStore.getState().worldMemory.pendingDogOnboarding).toBeNull();
  });

  it('A VENDOR WHO IS NOT OFFERING ONE CANNOT SELL ONE', async () => {
    // Without this the typed command would buy a faction dog at any stall in
    // the world and delete the rapport gate.
    const st = useGameStore.getState();
    useGameStore.setState({ currentScene: { ...st.currentScene!, vendor: stall(), enemies: [] } as never });
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().buyFromVendor('Tartarian War Shepherd', 1);
    await flush();
    expect(useGameStore.getState().player!.tc).toBe(before);
    expect(useGameStore.getState().worldMemory.pendingDogOnboarding).toBeNull();
  });

  it('and you cannot buy a second dog while one walks beside you', async () => {
    putStallWithDog();
    useGameStore.getState().buyFromVendor('Kennel Dog', 1);
    await flush();
    useGameStore.getState().confirmDogOnboarding('a shepherd', 'Ash', 'female');
    await flush();
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().buyFromVendor('Kennel Dog', 1);
    await flush();
    expect(useGameStore.getState().player!.tc).toBe(before);
  });

  it('THE CANON GATE: a save that already spent the old one-shot can still buy', async () => {
    // The whole point. Under the old design puppyVendorUsed retired the ONLY
    // road back forever; players carrying that flag today must not be locked out.
    useGameStore.setState({
      worldMemory: { ...useGameStore.getState().worldMemory, puppyVendorUsed: true, puppyVendorOwed: false },
    });
    putStallWithDog();
    useGameStore.getState().buyFromVendor('Kennel Dog', 1);
    await flush();
    expect(useGameStore.getState().worldMemory.pendingDogOnboarding).not.toBeNull();
  });
});

// ===== 4. the dead end is actually gone ===================================

describe('OTA-1726 - what was removed, and the evidence it was dead', () => {
  const STORE = codeOnly(src('app', 'state', 'gameStore.ts'));

  it('self-test - the scanner read real source with its comments stripped', () => {
    expect(STORE.length).toBeGreaterThan(500_000);
    expect(STORE.includes('withReplacementDogOffer')).toBe(true);
  });

  it('THE UNCOMPLETABLE TRADE IS GONE - offer, memo and queue all removed', () => {
    expect(STORE.includes('triggerPuppyVendor')).toBe(false);
    expect(STORE.includes('queuePuppyVendor')).toBe(false);
    expect(STORE.includes('puppy_vendor_trade_id')).toBe(false);
    expect(STORE.includes('accept puppy')).toBe(false);
  });

  it('AND THE PHRASE IT ASKED FOR NEVER EXISTED - nothing in the app parses it', () => {
    // This is why it was superseded rather than wired up: the offer was not
    // half-built, it was a sentence with no machine behind it.
    for (const f of [['app', 'engine', 'parser.ts'], ['app', 'state', 'gameStore.ts']]) {
      const s = codeOnly(src(...f));
      expect(s.includes('accept puppy')).toBe(false);
      expect(s.includes('decline puppy')).toBe(false);
    }
  });

  it('the rubble puppy SURVIVES - it is a one-off story beat, not an economy', () => {
    // Deleting working authored content on my own reading of the canon would
    // exceed the brief. Flagged for the owner instead: a free late-game pup
    // coexisting with a 600 TC market is a balance question, not a defect.
    expect(STORE.includes('tryFireRubblePuppy')).toBe(true);
  });

  it('NEGLECT STILL BUYS NOTHING - OTA-1717\'s rule survives the supersede', () => {
    const at = STORE.indexOf('if (loy <= 0) {');
    expect(at).toBeGreaterThan(-1);
    const branch = STORE.slice(at, at + 900);
    expect(branch.includes('puppyVendorOwed')).toBe(false);
    expect(branch.includes("status: 'abandoned'")).toBe(true);
  });
});
