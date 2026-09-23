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
 *
 * ---------------------------------------------------------------------------
 * AMENDED FOR THE COMPANION-MARKET CONTRACT. Two things in the design moved
 * under this suite, both by owner ruling, and the amendment is confined to
 * them. Every claim below is the SAME claim, re-pinned against the authority
 * that now carries it; one claim is deliberately INVERTED and says so.
 *
 *   1. ONE CLAIM IS REVERSED BY RULING. This suite pinned "no offer while a
 *      dog is at your side". The owner, after the reachability audit proved
 *      that gate made the market invisible to anyone who owned a dog: *"That
 *      is NOT the final owner design contract."* A player with a living dog
 *      must be able to encounter, inspect and compare another - the comparison
 *      IS the feature. That test now asserts the opposite, by name.
 *
 *   2. THE SHELF SELLS ANIMALS, NOT CATALOG ROWS. There is no longer a fixed
 *      'Kennel Dog' / 'Tartarian War Shepherd' pair; every vendor dog is a
 *      real breed ROLLED inside its own bands (dogBreeds.ts). So the pins move
 *      off hardcoded names and onto the properties the names were standing in
 *      for - ordinary vs faction, the price band, the profile. That is not a
 *      weakening: a name pin passes for a shelf selling one thing, and these
 *      pass only for a shelf selling the right KIND of thing, whichever
 *      individual it rolled.
 *
 * Nothing else here was touched. Section 4 - the evidence that the old dead-end
 * puppy trade is gone - is byte-for-byte as it was, because none of it moved.
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
  const base = { vendorFaction: null, hasRapport: false, hadDogEver: true, onboardingPending: false };
  /** Deterministic dice, so a claim about WHAT is offered is never a claim
   *  about what the roll happened to do. Every assertion below holds for the
   *  whole pool anyway - these just stop the suite from being a lottery. */
  const lowRng = (): number => 0;
  const highRng = (): number => 0.999999;
  /** Every breed the stall could have handed us, given these gates. */
  const poolFor = (over: Partial<Parameters<typeof DM.dogOfferFor>[0]>): ReturnType<typeof DM.dogOfferFor>[] =>
    [lowRng, highRng, (): number => 0.5, (): number => 0.2, (): number => 0.8, (): number => 0.35]
      .map((rng) => DM.dogOfferFor({ ...base, ...over, rng }));

  it('THE FIRST-DOG ENCOUNTER IS STILL THE INTRODUCTION - no dog, no market', () => {
    // Without this gate a fresh character buys past five authored rescue
    // scenarios and the arc becomes content nobody sees.
    expect(DM.dogOfferFor({ ...base, hadDogEver: false })).toBeNull();
  });

  it('a player who has HAD a dog is offered one, and the ordinary market is the owner\'s number', () => {
    // ⚠ AMENDED: the shelf rolls an individual, so the pin is on the KIND of
    // animal and the band it is priced in - not on one name. 600 is unmoved:
    // it is the centre the ordinary bands are written around, and every
    // ordinary breed's band is inside the ~500-700 market the owner set.
    expect(DM.REPLACEMENT_DOG_PRICE).toBe(600);
    for (const o of poolFor({})) {
      expect(o).not.toBeNull();
      expect(o!.dog.faction).toBeNull();          // an ordinary trader, an ordinary dog
      expect(o!.quantity).toBe(1);                // one animal, never a stack
      expect(o!.itemName).toBe(o!.dog.breedLabel);
      expect(o!.price).toBe(o!.dog.price);
      expect(o!.price).toBeGreaterThanOrEqual(500);
      expect(o!.price).toBeLessThanOrEqual(700);
      expect(o!.price).toBeLessThan(DM.FACTION_DOG_PRICE);
    }
  });

  it('A DOG AT YOUR SIDE NO LONGER HIDES THE STALL - and a naming card still does', () => {
    /* ⚠⚠⚠ THIS CLAIM IS INVERTED FROM WHAT THIS SUITE USED TO PIN, BY OWNER
     *  RULING. It asserted "no offer while a dog is at your side". The
     *  reachability audit proved that was the one line making the market
     *  invisible to anyone who already owned a dog - which is nearly everyone
     *  who has finished the rescue arc - and the owner ruled it out: a player
     *  with a living companion must still be able to encounter, inspect and
     *  compare another, because the comparison IS the feature.
     *
     *  ⚠ THE GATE IS NOT MISSING, IT MOVED. Replacing a living dog is safe
     *  because the ADOPTION path makes it safe (it shows the trade and takes a
     *  final confirmation), not because the shelf was hidden. So the strongest
     *  form of this claim is that `dogOfferFor` has no way to be told about an
     *  active dog at all - there is no parameter to put the gate back into,
     *  and its one caller does not compute one. Read through `codeOnly`, so
     *  the comments that EXPLAIN the removal cannot satisfy the scanner. */
    /* ⚠ THE SCAN FOLLOWED THE CODE. `withReplacementDogOffer` moved out of the
     *  store into this same leaf (owner ruling on the gameStore ratchet), so
     *  the suppression check reads it where it now lives. The CLAIM is
     *  unchanged and is if anything tighter: neither the gate function nor its
     *  one caller may mention the removed predicate. */
    const MARKET = codeOnly(src('app', 'engine', 'dogMarket.ts'));
    expect(MARKET.includes('dogOfferFor')).toBe(true);       // self-test
    const at = MARKET.indexOf('export function withReplacementDogOffer');
    expect(at).toBeGreaterThan(-1);                          // self-test
    expect(MARKET.includes('hasActiveDog')).toBe(false);
    expect(MARKET.slice(at, at + 1400).includes('hasActiveDog')).toBe(false);
    // and the store carries no revived copy of the suppression either
    const STORE = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(STORE.includes('hasActiveDog: hasActiveDog(')).toBe(false);
    // And behaviourally: the offer stands whatever the roll.
    for (const o of poolFor({})) expect(o).not.toBeNull();
    // The surviving gate, unchanged: an acquisition in flight blocks a second.
    expect(DM.dogOfferFor({ ...base, onboardingPending: true })).toBeNull();
  });

  it('A FACTION DOG COSTS RAPPORT AS WELL AS COIN - without it you get the ordinary one', () => {
    for (const o of poolFor({ vendorFaction: 'true_tartarians', hasRapport: false })) {
      expect(o!.dog.faction).toBeNull();
      expect(o!.price).toBeLessThan(DM.FACTION_DOG_PRICE);
    }
    for (const o of poolFor({ vendorFaction: 'true_tartarians', hasRapport: true })) {
      expect(o!.dog.faction).toBe('true_tartarians');
      expect(o!.price).toBeGreaterThanOrEqual(DM.FACTION_DOG_PRICE);
    }
  });

  it('rapport with a faction that breeds no dog still gets the ordinary one', () => {
    for (const o of poolFor({ vendorFaction: 'mud_monarchs', hasRapport: true })) {
      expect(o!.dog.faction).toBeNull();
    }
  });

  it('A FACTION BREED NEVER LEAKS TO AN ORDINARY COUNTER', () => {
    // ⚠ NEW EXPRESSION OF AN OLD GATE. It used to be enforced by there being
    // one ordinary row and one faction row; now it is a whitelist, so the
    // claim worth pinning is that the whitelist holds across every faction.
    const factions = [null, 'mud_monarchs', 'true_tartarians', 'reclaimers_guild', 'forgotten_order'];
    for (const f of factions) {
      for (const o of poolFor({ vendorFaction: f, hasRapport: false })) {
        expect(o!.dog.faction).toBeNull();
      }
      for (const o of poolFor({ vendorFaction: f, hasRapport: true })) {
        // With rapport you get YOUR faction's stock or the ordinary pool -
        // never another faction's.
        expect(o!.dog.faction === null || o!.dog.faction === f).toBe(true);
      }
    }
  });

  it('FACTION DOGS ARE BETTER, and SPECIALISED - each is unbeatable at one thing only', () => {
    /* ⚠ AMENDED, AND STRICTLY STRONGER. The old form of this claim read the
     *  faction rows' `profile` fields and asserted they differed. That was a
     *  proxy for "better and specialised" from a time when a row WAS a profile.
     *  Breeds now carry their own bands, so the claim can be made directly on
     *  the numbers - and it catches the failure the proxy could not: a faction
     *  breed that is simply +N to everything, which the owner ruled out by
     *  name ("not '+N to everything'... a faction dog can be the WRONG buy"). */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const B = require('../app/engine/dogBreeds') as typeof import('../app/engine/dogBreeds');
    const ordinary = B.ALL_DOG_BREEDS.filter((b) => b.faction === null);
    const faction = B.ALL_DOG_BREEDS.filter((b) => b.faction !== null);
    expect(ordinary.length).toBeGreaterThan(0);
    expect(faction.length).toBeGreaterThan(0);
    /* ⚠⚠ AMENDED BY OWNER RULING. This demanded that a faction breed STRICTLY
     *  out-ceiling every ordinary breed in its signature stat. That is a
     *  vertical-ladder claim, and the owner ruled the ladder out: *"do NOT
     *  interpret 'keep market above' as requiring every purchased dog to have
     *  universally higher ceilings… The dog market's reason to exist is CHOICE
     *  OF FUTURE POTENTIAL AND SPECIALIZATION, not guaranteed vertical
     *  replacement."*
     *
     *  It also became false for a good reason: the Greyhound is the game's
     *  definitive sprinter and now reaches DEX 30, the absolute engine cap, so
     *  the Reclaimer's Scent Hound cannot exceed it there — nothing can.
     *
     *  The claim that survives is stronger, because a tie must still not mean
     *  DUPLICATE: a faction breed is at least level with every ordinary breed
     *  in its specialism, and wherever it merely ties, it is strictly better
     *  than that breed somewhere else. */
    for (const fb of faction) {
      const bestStat = B.DOG_STAT_KEYS.reduce((a, k) =>
        fb.potential[k][1] > fb.potential[a][1] ? k : a, B.DOG_STAT_KEYS[0]);
      for (const ob of ordinary) {
        expect(fb.potential[bestStat][1]).toBeGreaterThanOrEqual(ob.potential[bestStat][1]);
        if (fb.potential[bestStat][1] === ob.potential[bestStat][1]) {
          const betterElsewhere = B.DOG_STAT_KEYS.some(
            (k) => k !== bestStat && fb.potential[k][1] > ob.potential[k][1],
          );
          expect(betterElsewhere).toBe(true);
        }
      }
      // SPECIALISED: and it is NOT ahead of the whole ordinary market
      // everywhere. Some ordinary breed out-ceilings it in some other stat.
      const beatenSomewhere = B.DOG_STAT_KEYS.some((k) =>
        k !== bestStat && ordinary.some((ob) => ob.potential[k][1] > fb.potential[k][1]));
      expect(beatenSomewhere).toBe(true);
    }
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
    // ⚠ AMENDED: the row is identified by BEING a dog, not by a fixed name.
    const p = useGameStore.getState().player!;
    const v = withReplacementDogOffer(stall(), p, useGameStore.getState().worldMemory);
    const dogRows = (v?.offers ?? []).filter((o) => !!o.dog);
    expect(dogRows.length).toBe(1);
    expect(dogRows[0]!.dog!.faction).toBeNull();
    expect(dogRows[0]!.itemName).toBe(dogRows[0]!.dog!.breedLabel);
  });

  it('and does NOT, for a character who has never had a dog', () => {
    const p = { ...useGameStore.getState().player!, dog: undefined };
    const v = withReplacementDogOffer(stall(), p as never, useGameStore.getState().worldMemory);
    expect((v?.offers ?? []).some((o) => !!o.dog)).toBe(false);
  });

  it('the row is added ONCE - a re-run never doubles it', () => {
    // ⚠ AMENDED AND STRICTER. This used to count rows by NAME, which now
    // proves nothing: every breed is a different name, so two runs would
    // stack a Greyhound beside a Border Collie and a name count would still
    // read 1. Counting DOG ROWS is the claim that was always meant - one
    // prospective animal per stall, never a kennel.
    const p = useGameStore.getState().player!;
    const wm = useGameStore.getState().worldMemory;
    const twice = withReplacementDogOffer(withReplacementDogOffer(stall(), p, wm), p, wm);
    expect(twice!.offers.filter((o) => !!o.dog).length).toBe(1);
  });

  it('BOTH vendor sources carry it - the stall is the one players meet most', () => {
    /* The step-site stall is the dominant vendor source ("a stall every ~5
     * travel steps"). A market only at named hubs is a market most players
     * never walk into.
     *
     * ⚠⚠ AMENDED BY OWNER RULING — AND THE COUNT WAS NEVER THE CONTRACT.
     * This asserted three occurrences of `withReplacementDogOffer(` inside
     * gameStore.ts. Three was one DEFINITION plus two real CALL SITES, so the
     * definition was silently propping up a claim that is about reach.
     *
     * The helper is pure, store-free dog-market behaviour and now lives beside
     * `dogOfferFor` in engine/dogMarket — owner: *"pure/store-free dog-market
     * behavior does not belong permanently inside the monolithic store merely
     * to preserve an old source-layout assertion."* The honest gameStore
     * contract is TWO call sites, and the claim below is strictly stronger for
     * being split into the three things that actually matter. */
    const S = codeOnly(src('app', 'state', 'gameStore.ts'));
    const M = codeOnly(src('app', 'engine', 'dogMarket.ts'));

    // 1. ONE AUTHORITATIVE DEFINITION, and it is in the leaf.
    expect((M.match(/export function withReplacementDogOffer\s*\(/g) ?? []).length).toBe(1);

    // 2. BOTH vendor-generation paths in the store still invoke it. This is
    //    the reach claim the old count was standing in for.
    const calls = (S.match(/[^.\w]withReplacementDogOffer\(/g) ?? []).length;
    expect(calls).toBe(2);

    // 3. NO DUPLICATE IMPLEMENTATION survived the move. A second copy in the
    //    store is exactly how the two would start disagreeing.
    expect(S.includes('function withReplacementDogOffer')).toBe(false);
    // and the store reaches it by import, not by re-declaring it
    expect(/import\s*\{[^}]*withReplacementDogOffer[^}]*\}\s*from\s*'\.\.\/engine\/dogMarket'/.test(S)).toBe(true);
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
  /** ⚠ AMENDED: the animal on the counter is rolled, so the tests ask the
   *  shelf what it is holding instead of assuming a name. */
  const onTheCounter = () => {
    const row = useGameStore.getState().currentScene!.vendor!.offers.find((o) => !!o.dog);
    expect(row).toBeTruthy();
    return row!;
  };

  it('THE WHOLE ACQUISITION: pay, name, and a dog is at your side', async () => {
    putStallWithDog();
    const row = onTheCounter();
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().buyFromVendor(row.itemName, 1);
    await flush();
    // paid exactly the asking price, and nothing minted into the pack
    expect(useGameStore.getState().player!.tc).toBe(before - row.price);
    expect(useGameStore.getState().player!.inventory.some((i) => i.name === row.itemName)).toBe(false);
    // the naming card is open, through the SAME funnel every rescue uses
    const pend = useGameStore.getState().worldMemory.pendingDogOnboarding!;
    expect(pend.stage).toBe('breed');
    expect(pend.rescueData.scenario).toBe('market');
    expect(pend.rescueData.startingProfile).toBe(row.dog!.profile);
    // finish it
    useGameStore.getState().confirmDogOnboarding('a shepherd', 'Ash', 'female');
    await flush();
    const dog = useGameStore.getState().player!.dog!;
    expect(dog.name).toBe('Ash');
    expect(dog.status).toBe('with_player');
    expect(useGameStore.getState().worldMemory.pendingDogOnboarding).toBeNull();
    // ⚠ AND IT IS THE ANIMAL THAT WAS ON THE SHELF. The rolled sheet rides
    // through onboarding, so what the player inspected is what they got.
    expect(dog.stats).toEqual(row.dog!.stats);
    expect(dog.potential).toEqual(row.dog!.potential);
    expect(dog.hpMax).toBe(row.dog!.hpMax);
  });

  it('A REPLACEMENT INHERITS NOTHING - not the name, the bond, or the record', async () => {
    // The owner's third canon point, and the reason no "trade in" path was
    // built: finishDogOnboarding overwrites player.dog wholesale from a fresh
    // createDogCompanion, so there is nowhere for the old dog to leak through.
    putStallWithDog();
    const row = onTheCounter();
    const oldDog = useGameStore.getState().player!.dog!;
    useGameStore.getState().buyFromVendor(row.itemName, 1);
    await flush();
    useGameStore.getState().confirmDogOnboarding('a shepherd', 'Ash', 'female');
    await flush();
    const dog = useGameStore.getState().player!.dog!;
    expect(dog.name).not.toBe(oldDog.name);
    expect(dog.id).not.toBe(oldDog.id);
    expect(dog.loyalty).not.toBe(oldDog.loyalty);
    // ⚠ AMENDED: the dead dog was trained to STR 17; the bought dog's STR is
    // whatever the SHELF rolled, and 17 is above every ordinary breed's base
    // band - so "no progression came across" is still exactly what this pins.
    expect(oldDog.stats.strength).toBe(17);
    expect(dog.stats.strength).toBe(row.dog!.stats.strength);
    expect(dog.stats.strength).toBeLessThan(oldDog.stats.strength);
    expect(dog.statProgress.strength).toBe(0);
    // and the dead dog's vest did not come with it either
    expect(dog.equipped.vest).toBeNull();
    expect(dog.status).not.toBe('dead');
  });

  it('SHORT OF THE MONEY: refused, and not one TC moves', async () => {
    putStallWithDog();
    const row = onTheCounter();
    useGameStore.setState({ player: { ...useGameStore.getState().player!, tc: row.price - 1 } as never });
    useGameStore.getState().buyFromVendor(row.itemName, 1);
    await flush();
    expect(useGameStore.getState().player!.tc).toBe(row.price - 1);
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

  it('and a TYPED buy cannot replace the dog walking beside you', async () => {
    /* ⚠ AMENDED IN ITS REASON, NOT ITS RESULT. This used to pass because the
     *  market was hidden from anyone with a dog. That gate is gone by owner
     *  ruling - but a typed command still must not be the confirmation for a
     *  write that sets a named companion free, because the owner's contract
     *  is that the player replaces a dog "after seeing exactly what is being
     *  gained and lost", and *"this is not 'silently replace the current
     *  dog'."* So the money still does not move, for the right reason now. */
    putStallWithDog();
    const first = onTheCounter();
    useGameStore.getState().buyFromVendor(first.itemName, 1);
    await flush();
    useGameStore.getState().confirmDogOnboarding('a shepherd', 'Ash', 'female');
    await flush();
    expect(useGameStore.getState().player!.dog!.name).toBe('Ash');
    // A fresh stall, with a dog on it, while Ash is at your side.
    putStallWithDog();
    const second = onTheCounter();
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().buyFromVendor(second.itemName, 1);
    await flush();
    expect(useGameStore.getState().player!.tc).toBe(before);
    expect(useGameStore.getState().player!.dog!.name).toBe('Ash');
    expect(useGameStore.getState().worldMemory.pendingDogOnboarding).toBeNull();
  });

  it('THE CANON GATE: a save that already spent the old one-shot can still buy', async () => {
    // The whole point. Under the old design puppyVendorUsed retired the ONLY
    // road back forever; players carrying that flag today must not be locked out.
    useGameStore.setState({
      worldMemory: { ...useGameStore.getState().worldMemory, puppyVendorUsed: true, puppyVendorOwed: false },
    });
    putStallWithDog();
    useGameStore.getState().buyFromVendor(onTheCounter().itemName, 1);
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
    // ⚠ OTA-1844 — the loyalty ladder moved to `dogStatus.ts` with
    // `tickDogStatus`, byte-identically. OTA-1717's rule is read where it runs.
    // ⚠⚠ AND IT IS READ THROUGH `codeOnly`, exactly as the store read was. That
    // branch's own comment EXPLAINS why neglect does not owe a puppy, so a raw
    // read fails on the sentence promising the rule instead of on the rule.
    const DOGCLOCK = codeOnly(src('app', 'state', 'dogStatus.ts'));
    const at = DOGCLOCK.indexOf('if (loy <= 0) {');
    expect(at).toBeGreaterThan(-1);
    const branch = DOGCLOCK.slice(at, at + 900);
    expect(branch.includes('puppyVendorOwed')).toBe(false);
    expect(branch.includes("status: 'abandoned'")).toBe(true);
  });
});
