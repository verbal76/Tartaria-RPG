/**
 * OTA-1874 - THE DOG YOU CHOOSE IS THE DOG YOU GET.
 *
 * THE OWNER'S CONTRACT, in his words, for the write this suite is about:
 *
 *   "It is a one-active-companion system in which the player can deliberately
 *    replace a living dog after seeing exactly what is being gained and lost."
 *
 *   "Until FINAL confirmation: no TC spent, no old dog released, no gear
 *    destroyed, no prospective dog acquired."
 *
 *   "Do not permit an interrupted onboarding flow to produce: old dog gone /
 *    TC gone / new dog vanished."
 *
 * And what it explicitly is NOT: more frequent dogs, multiple dogs, silent
 * replacement, or a resurrection system.
 *
 * WHY THIS SUITE EXISTS AS ITS OWN FILE. The adoption is the most dangerous
 * write in the dog system, and it is dangerous in a way the rest of the game
 * is not: four irreversible things happen at once - coin leaves, a living
 * companion is set free, an equipped vest leaves the pack with it, and a
 * naming card opens - and three of them cannot be undone by buying something
 * back. A half-applied version of this write is a save the player cannot
 * repair. So every claim below is about ATOMICITY or about IDENTITY, and the
 * negative cases (refusals) are pinned harder than the positive one: a refusal
 * that moves one field is the bug this file is built to catch.
 *
 * THE NEGATIVE CONTROLS THAT WERE RUN AGAINST THIS FILE, and what each one
 * taught. None was committed; production was restored byte-identically
 * (md5-verified) after every one.
 *
 *   NC-1  double-press latch disabled ........................ STAYED GREEN
 *   NC-1b latch + both onboarding re-checks disabled ......... STAYED GREEN
 *   NC-1c the above + the shelf removal disabled ............. RED (3x charged)
 *         -> the once-only property has three independent store-level guards,
 *            each sufficient alone. The module latch was a fourth that no test
 *            could fail, so it was REMOVED. See vendorSlice for the reasoning.
 *   NC-2  planner's offerId check disabled ................... STAYED GREEN
 *   NC-2b planner's + the in-write re-check disabled ......... STAYED GREEN
 *   NC-2c every offerId key replaced by "any dog row" ........ RED (sold the
 *         replacement animal) -> §E's rule-27 claim is falsifiable, and the
 *         identity is load-bearing in three places at once.
 *   NC-3  the worn vest is not surrendered ................... RED
 *   NC-4  planner's TC check disabled ........................ STAYED GREEN
 *   NC-4b planner's + in-write TC check disabled ............. RED (tc -> -1)
 *   NC-5  nothing is ever treated as a living dog ............ RED
 *
 * ⚠ ON THE ONE DESTRUCTIVE INVENTORY WRITE. A worn dog vest never leaves
 * `player.inventory` - equipping only writes the dog's `equipped` pair - so
 * "the gear leaves with the dog" means an inventory INSTANCE is deleted. That
 * is the only place in this package where the player can lose an object they
 * earned, and §D/§E below pin both directions of it: the worn one goes, and
 * nothing else does.
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

import { useGameStore, withReplacementDogOffer, backfillPlayer } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { createDogCompanion, dogStatCeiling } from '../app/engine/dogCompanion';
import * as BR from '../app/engine/dogBreeds';
import * as DA from '../app/engine/dogAdoption';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';
import type { VendorInstance, VendorOffer } from '../app/engine/vendors';

const flush = (): Promise<unknown> => new Promise((r) => setTimeout(r, 0));
jest.setTimeout(240000);

const VEST: InventoryItem = {
  id: 'vest_worn_1', name: 'Padded Dog Vest', kind: 'dog_armor', quantity: 1,
};
const SPARE_VEST: InventoryItem = {
  id: 'vest_spare_1', name: 'Padded Dog Vest', kind: 'dog_armor', quantity: 1,
};
const ROPE: InventoryItem = { id: 'rope_1', name: 'Rope', kind: 'misc', quantity: 3 };

const stall = (): VendorInstance => ({
  id: 'roadside_honest_test', name: 'Duvo Saltbeard', title: 'roadside trader',
  offers: [{ itemName: 'Rope', price: 10, quantity: 2 }],
} as VendorInstance);

/** A run with a LIVING, equipped companion - the state the whole contract is
 *  about, and the one the old design made unreachable. */
async function bootWithLivingDog(tc = 5000): Promise<void> {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Verbal', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  const rocky = createDogCompanion({
    name: 'Rocky', breed: 'mutt', rawSex: 'male', startingProfile: 'mongrel', currentHour: 0,
  });
  store.setState({
    player: {
      ...p0,
      tc,
      hoursElapsed: 412,
      inventory: [ROPE, VEST, SPARE_VEST],
      dog: {
        ...rocky,
        loyalty: 97,
        stats: { strength: 17, dexterity: 12, intelligence: 11 },
        equipped: { vest: VEST.name, vestId: VEST.id },
      },
    } as PlayerCharacter,
    worldMemory: { ...store.getState().worldMemory, pendingDogOnboarding: null, releasedDogs: undefined },
  });
}

/** Put a stall carrying a prospective dog into the scene, and hand back the row. */
function putStallWithDog(): VendorOffer & { dog: NonNullable<VendorOffer['dog']> } {
  const st = useGameStore.getState();
  const v = withReplacementDogOffer(stall(), st.player!, st.worldMemory)!;
  useGameStore.setState({ currentScene: { ...st.currentScene!, vendor: v, enemies: [] } as never });
  const row = v.offers.find((o) => !!o.dog);
  expect(row).toBeTruthy();
  return row as VendorOffer & { dog: NonNullable<VendorOffer['dog']> };
}

/** Everything the transaction is allowed to touch, in one object, so a refusal
 *  can be asserted against the WHOLE surface instead of one field at a time. */
function snapshot(): string {
  const s = useGameStore.getState();
  return JSON.stringify({
    tc: s.player!.tc,
    dog: s.player!.dog,
    inventory: s.player!.inventory,
    pending: s.worldMemory.pendingDogOnboarding ?? null,
    released: s.worldMemory.releasedDogs ?? null,
    offers: s.currentScene?.vendor?.offers ?? null,
  });
}

// ===== A. the transaction is pure until it is not =========================

describe('OTA-1874 §A - planning decides, applying writes', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('a plan is computed from state it never touches', () => {
    const row = putStallWithDog();
    const before = snapshot();
    const plan = DA.planDogAdoption({
      player: useGameStore.getState().player!,
      worldMemory: useGameStore.getState().worldMemory,
      vendorName: 'Duvo Saltbeard',
      liveOffer: row,
      expectedOfferId: row.dog.offerId,
    });
    expect(plan.ok).toBe(true);
    // ⚠ THE OWNER'S FIRST RULE, AS A MEASUREMENT: planning the whole trade -
    // including which vest is destroyed - moves nothing at all.
    expect(snapshot()).toBe(before);
  });

  it('the plan names the release, the gear and the price before anything happens', () => {
    const row = putStallWithDog();
    const plan = DA.planDogAdoption({
      player: useGameStore.getState().player!,
      worldMemory: useGameStore.getState().worldMemory,
      vendorName: 'Duvo Saltbeard',
      liveOffer: row,
      expectedOfferId: row.dog.offerId,
    }) as DA.DogAdoptionPlan;
    expect(plan.price).toBe(row.price);
    expect(plan.released!.name).toBe('Rocky');
    expect(plan.released!.releasedAtHour).toBe(412);
    expect(plan.surrendered!.id).toBe(VEST.id);
    expect(plan.dog.offerId).toBe(row.dog.offerId);
  });
});

// ===== B. the whole adoption, end to end ==================================

describe('OTA-1874 §B - the adoption', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('spends the price ONCE, releases the dog, and opens the naming card in one write', async () => {
    const row = putStallWithDog();
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    const s = useGameStore.getState();
    expect(s.player!.tc).toBe(before - row.price);
    // the old companion is gone from the player's side, and is NOT dead
    expect(s.player!.dog).toBeNull();
    expect(s.worldMemory.releasedDogs).toEqual([
      { id: expect.any(String), name: 'Rocky', breed: 'mutt', releasedAtHour: 412 },
    ]);
    // ⚠ RELEASED IS NOT DEAD. The Fallen lifecycle is untouched by this write.
    expect(s.worldMemory.fallenDogs ?? []).toEqual([]);
    // the naming card is open, carrying the sheet that was on the shelf
    const pend = s.worldMemory.pendingDogOnboarding!;
    expect(pend.stage).toBe('breed');
    expect(pend.rescueData.scenario).toBe('market');
    expect(pend.rescueData.market!.breedId).toBe(row.dog.breedId);
    expect(pend.rescueData.market!.stats).toEqual(row.dog.stats);
    expect(pend.rescueData.market!.potential).toEqual(row.dog.potential);
    expect(pend.rescueData.market!.hpMax).toBe(row.dog.hpMax);
    // and the shelf no longer offers the animal it has already handed over
    expect(s.currentScene!.vendor!.offers.some((o) => !!o.dog)).toBe(false);
  });

  it('THE INTERRUPTED FLOW CANNOT LOSE THE DOG: coin gone implies a card open', async () => {
    /* The owner's rule, stated as the invariant it is: there is no reachable
     *  state in which the money left and nothing is owed back. A reload lands
     *  in the state written here, so if this holds the save is recoverable. */
    const row = putStallWithDog();
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    const s = useGameStore.getState();
    const paid = s.player!.tc < before;
    const owed = !!s.worldMemory.pendingDogOnboarding;
    expect(paid).toBe(true);
    expect(owed).toBe(true);
    // And the road back to a dog stays open even mid-naming: the released
    // record proves this character has kept a dog, so the market is not shut.
    const v = withReplacementDogOffer(stall(), s.player!, { ...s.worldMemory, pendingDogOnboarding: null });
    expect(v!.offers.some((o) => !!o.dog)).toBe(true);
  });

  it('the dog that arrives is the dog that was inspected', async () => {
    const row = putStallWithDog();
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    useGameStore.getState().confirmDogOnboarding('', 'Ash', 'female');
    await flush();
    const dog = useGameStore.getState().player!.dog!;
    expect(dog.name).toBe('Ash');
    expect(dog.status).toBe('with_player');
    expect(dog.stats).toEqual(row.dog.stats);
    expect(dog.potential).toEqual(row.dog.potential);
    expect(dog.hpMax).toBe(row.dog.hpMax);
    expect(dog.hp).toBe(row.dog.hpMax);
    expect(dog.startingProfile).toBe(row.dog.profile);
    // ⚠ INHERITS NOTHING. Blank breed falls back to the shelf's own label, not
    // to the released dog's, and none of Rocky's progression came across.
    expect(dog.breed).toBe(row.dog.breedLabel);
    expect(dog.statProgress).toEqual({ strength: 0, dexterity: 0, intelligence: 0 });
    expect(dog.equipped.vest).toBeNull();
    expect(dog.loyalty).not.toBe(97);
    expect(useGameStore.getState().worldMemory.pendingDogOnboarding).toBeNull();
  });
});

// ===== C. one dog, one charge =============================================

describe('OTA-1874 §C - it happens exactly once', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('TWO PRESSES IN ONE FRAME pay once and release once', async () => {
    /* ⚠ THE OTA-1734 / OTA-1873 CLASS, on a write that cannot be undone: two
     *  taps inside one frame would spend twice and release two dogs.
     *
     *  ⚠⚠ WHAT THE NEGATIVE CONTROL ACTUALLY SHOWED, recorded here so this
     *  test cannot be read as crediting a guard it does not measure. THREE
     *  store-level conditions each stop the second press on their own - the dog
     *  is off the shelf, an onboarding is pending, and the coin is spent - and
     *  this claim only went red when ALL THREE were disabled together (three
     *  presses then charged three times). So it is a claim about the outcome,
     *  not about any one guard, and no single guard can be deleted by someone
     *  who runs this suite and sees it stay green. A module-scope latch was
     *  written here first and removed for exactly that reason; vendorSlice
     *  carries the measurement. */
    const row = putStallWithDog();
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    const s = useGameStore.getState();
    expect(s.player!.tc).toBe(before - row.price);
    expect(s.worldMemory.releasedDogs!.length).toBe(1);
  });

  it('and a repeat after the card is open changes nothing', async () => {
    const row = putStallWithDog();
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    const after = snapshot();
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    expect(snapshot()).toBe(after);
  });
});

// ===== D. the gear leaves with the dog ====================================

describe('OTA-1874 §D - the vest goes too', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('the WORN instance is gone from the pack, and only that one', async () => {
    const row = putStallWithDog();
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    const inv = useGameStore.getState().player!.inventory;
    expect(inv.some((i) => i.id === VEST.id)).toBe(false);
    // ⚠ THE SPARE STAYS. Same name, same kind, not worn - and a name-keyed
    // removal would have taken it. This is the assertion that makes the
    // destructive write safe rather than merely correct on a tidy pack.
    expect(inv.some((i) => i.id === SPARE_VEST.id)).toBe(true);
    expect(inv.find((i) => i.id === ROPE.id)!.quantity).toBe(3);
  });

  it('with nothing worn, nothing is destroyed', async () => {
    const st = useGameStore.getState();
    useGameStore.setState({
      player: { ...st.player!, dog: { ...st.player!.dog!, equipped: { vest: null, vestId: null } } } as PlayerCharacter,
    });
    const row = putStallWithDog();
    const invBefore = JSON.stringify(useGameStore.getState().player!.inventory);
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    expect(JSON.stringify(useGameStore.getState().player!.inventory)).toBe(invBefore);
  });

  it('an unresolvable vest reference loses nothing', () => {
    // Fail-safe direction: a dangling vestId with no matching instance removes
    // NOTHING rather than guessing at a same-named one.
    const st = useGameStore.getState();
    const player = {
      ...st.player!,
      dog: { ...st.player!.dog!, equipped: { vest: 'Ghost Vest', vestId: 'gone_forever' } },
    } as PlayerCharacter;
    const row = putStallWithDog();
    const plan = DA.planDogAdoption({
      player, worldMemory: st.worldMemory, vendorName: 'Duvo Saltbeard',
      liveOffer: row, expectedOfferId: row.dog.offerId,
    }) as DA.DogAdoptionPlan;
    expect(plan.ok).toBe(true);
    expect(plan.surrendered).toBeNull();
  });
});

// ===== E. every refusal moves nothing =====================================

describe('OTA-1874 §E - a refusal is not a partial sale', () => {
  beforeEach(async () => { await bootWithLivingDog(); });

  it('SHORT OF THE COIN: not one field moves', async () => {
    const row = putStallWithDog();
    useGameStore.setState({ player: { ...useGameStore.getState().player!, tc: row.price - 1 } as PlayerCharacter });
    const before = snapshot();
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    expect(snapshot()).toBe(before);
  });

  it('THE STALL REFRESHED UNDER THE CARD: the sale is refused, not retargeted', async () => {
    /* ⚠ OWNER RULE 27, and the reason `offerId` exists. The player inspected
     *  one animal; if a different one is standing there now, handing THAT one
     *  over is the failure the identity is for. */
    const row = putStallWithDog();
    const staleId = row.dog.offerId;
    // the stall refreshes - a different individual is on the counter
    const st = useGameStore.getState();
    const refreshed = withReplacementDogOffer(stall(), st.player!, st.worldMemory)!;
    useGameStore.setState({ currentScene: { ...st.currentScene!, vendor: refreshed, enemies: [] } as never });
    const newRow = useGameStore.getState().currentScene!.vendor!.offers.find((o) => !!o.dog)!;
    expect(newRow.dog!.offerId).not.toBe(staleId);
    const before = snapshot();
    useGameStore.getState().adoptVendorDog(staleId);
    await flush();
    expect(snapshot()).toBe(before);
  });

  it('A NAMING CARD ALREADY OPEN blocks a second acquisition', async () => {
    const row = putStallWithDog();
    useGameStore.setState({
      worldMemory: {
        ...useGameStore.getState().worldMemory,
        pendingDogOnboarding: { stage: 'breed', rescueData: { scenario: 'snare', startingProfile: 'mongrel' } },
      },
    });
    const before = snapshot();
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    expect(snapshot()).toBe(before);
  });

  it('NOT MID-FIGHT', async () => {
    const row = putStallWithDog();
    const st = useGameStore.getState();
    useGameStore.setState({
      currentScene: { ...st.currentScene!, enemies: [{ name: 'Raider', hp: 10 }] } as never,
    });
    const before = snapshot();
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    expect(snapshot()).toBe(before);
  });
});

// ===== F. no dog at your side is still a purchase =========================

describe('OTA-1874 §F - buying with no companion releases nobody', () => {
  it('a dead record is not a release - nothing is set free, nothing is destroyed', async () => {
    await bootWithLivingDog();
    const st = useGameStore.getState();
    useGameStore.setState({
      player: { ...st.player!, dog: { ...st.player!.dog!, status: 'dead' as const } } as PlayerCharacter,
    });
    const row = putStallWithDog();
    const invBefore = JSON.stringify(useGameStore.getState().player!.inventory);
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().adoptVendorDog(row.dog.offerId);
    await flush();
    const s = useGameStore.getState();
    expect(s.player!.tc).toBe(before - row.price);
    expect(s.worldMemory.releasedDogs ?? []).toEqual([]);
    expect(JSON.stringify(s.player!.inventory)).toBe(invBefore);
    expect(s.worldMemory.pendingDogOnboarding).not.toBeNull();
  });
});

// ===== M. the ceiling arrives on LOAD, not in a helper nobody calls =======

/* ⚠⚠⚠ THIS SECTION EXISTS BECAUSE A MIGRATION THAT IS NEVER CALLED IS NOT A
 *  MIGRATION. `migrateLegacyDogPotential` was written, unit-tested and correct
 *  while NOTHING in the app invoked it: every save on every device would have
 *  come up with `potential` still absent and every one of its properties would
 *  have been true of a function the game never ran.
 *
 *  So every claim below goes through the REAL load — `persist()` then
 *  `loadSlotIntoGame(activeSlotId)`, which is the path a player's save takes
 *  when they tap their character on the title screen — and reads the dog off
 *  the store afterwards. Calling the helper directly would prove the arithmetic
 *  and nothing about whether it reaches anybody.
 *
 *  ⚠ The owner's ruling names the properties; they are pinned one per test so
 *  a failure says WHICH promise broke rather than "migration is wrong". */

const reload = async (): Promise<void> => {
  const s = useGameStore.getState();
  await s.persist();
  await s.loadSlotIntoGame(s.activeSlotId!);
  await flush(); await flush();
};
const loadedDog = () => useGameStore.getState().player!.dog!;

/** A save from before dogs had individual ceilings: a real companion record
 *  with `potential` stripped, exactly as such a save parses. */
async function bootWithLegacyDog(
  profile: 'mongrel' | 'shepherd' | 'hound' | 'mutt' | 'puppy',
  stats: { strength: number; dexterity: number; intelligence: number },
): Promise<void> {
  await bootWithLivingDog();
  const p = useGameStore.getState().player!;
  const base = createDogCompanion({
    name: 'Rocky', breed: 'mutt', rawSex: 'male', startingProfile: profile, currentHour: 0,
  });
  const legacy = { ...base, stats } as Record<string, unknown>;
  delete legacy.potential;                       // ← what a pre-OTA save has
  useGameStore.setState({ player: { ...p, dog: legacy } as unknown as PlayerCharacter });
  expect((useGameStore.getState().player!.dog as { potential?: unknown }).potential).toBeUndefined();
}

describe('OTA-1874 §M - a legacy dog is given its ceiling BY THE LOAD PATH', () => {
  it('⚠⚠⚠ a save with no `potential` comes back from loadSlotIntoGame WITH one', async () => {
    await bootWithLegacyDog('mongrel', { strength: 12, dexterity: 11, intelligence: 10 });
    await reload();
    const d = loadedDog();
    expect(d.potential).toBeTruthy();
    expect(d.potential).toEqual(BR.legacyPotentialFor('mongrel', d.stats));
  });

  it('⚠⚠⚠ NO EARNED POINT IS EVER LOST, and a stat trained past the profile RAISES its own ceiling', async () => {
    // The defect this whole ruling came from: potential was stamped at BIRTH
    // from starting stats, so a dog trained beyond it was stranded at progress
    // 0 for ever. A migrated ceiling is never below what the dog already is.
    await bootWithLegacyDog('mongrel', { strength: 28, dexterity: 11, intelligence: 10 });
    await reload();
    const d = loadedDog();
    expect(d.stats.strength).toBe(28);                    // not reduced
    expect(d.potential!.strength).toBeGreaterThanOrEqual(28);
    for (const k of ['strength', 'dexterity', 'intelligence'] as const) {
      expect(dogStatCeiling(d, k)).toBeGreaterThanOrEqual(d.stats[k]);
    }
  });

  it('⚠⚠⚠ NOBODY IS GRANDFATHERED TO 30/30/30 for being old', async () => {
    // The owner's words: the old universal 30 was an ENGINE rule, not a promise
    // to every dog alive. A legacy veteran that inherited it would be the best
    // animal that can ever exist and the market would have nothing to sell.
    await bootWithLegacyDog('hound', { strength: 9, dexterity: 12, intelligence: 10 });
    await reload();
    const d = loadedDog();
    expect(d.potential).not.toEqual({ strength: 30, dexterity: 30, intelligence: 30 });
    for (const k of ['strength', 'dexterity', 'intelligence'] as const) {
      expect(d.potential![k]).toBeLessThanOrEqual(30);     // the engine cap still holds
    }
    expect(Math.min(...Object.values(d.potential!))).toBeLessThan(30);
  });

  it('⚠⚠⚠ THE AUTHORED 22+/23+ TIERS STAY REACHABLE for a rescued dog', async () => {
    // Owner ruling: rescued dogs are NOT a disposable starter tier. The growth
    // curve has tiers at 22 and 23+, and a ceiling under 23 would make authored
    // content unreachable — which is exactly what the first derivation did.
    for (const profile of ['mongrel', 'shepherd', 'hound', 'mutt', 'puppy'] as const) {
      await bootWithLegacyDog(profile, { strength: 10, dexterity: 10, intelligence: 10 });
      await reload();
      const d = loadedDog();
      const best = Math.max(...Object.values(d.potential!));
      expect(best).toBeGreaterThanOrEqual(23);
      // ...and every stat still reaches the 22-tier's doorstep at worst.
      expect(Math.min(...Object.values(d.potential!))).toBeGreaterThanOrEqual(21);
    }
  });

  it('⚠⚠⚠ IT RUNS ONCE: a second load does not reroll, inflate or re-derive it', async () => {
    await bootWithLegacyDog('mutt', { strength: 9, dexterity: 10, intelligence: 12 });
    await reload();
    // ⚠ WIDENED AFTER NC-1. Without this line the test compared `undefined` to
    // `undefined` across three loads and passed with the migration unwired —
    // stable, yes, but stably absent. "It does not change" is only a claim
    // about a ceiling once there IS a ceiling.
    expect(loadedDog().potential).toBeTruthy();
    const first = JSON.stringify(loadedDog().potential);
    // Train the dog UP between loads: a re-derivation would now read the higher
    // stats and quietly raise the ceiling — the slow upward drift the `once`
    // rule exists to stop.
    //
    // ⚠⚠ WIDENED AFTER NC-2 (once-guard removed → this test STAYED GREEN). The
    // stats used here were 20/21/22, all UNDER the mutt table (21/22/26), and
    // `legacyPotentialFor` takes max(table, earned) — so re-deriving produced
    // the identical numbers and the test could not see the guard at all. Every
    // stat is now ABOVE its table entry, which is the only region where a
    // second derivation differs from the first.
    const p = useGameStore.getState().player!;
    const table = BR.legacyPotentialFor('mutt', { strength: 0, dexterity: 0, intelligence: 0 });
    useGameStore.setState({ player: { ...p, dog: { ...p.dog!, stats: {
      strength: table.strength + 3, dexterity: table.dexterity + 3, intelligence: table.intelligence + 1,
    } } } as PlayerCharacter });
    await reload();
    expect(JSON.stringify(loadedDog().potential)).toBe(first);
    await reload();
    expect(JSON.stringify(loadedDog().potential)).toBe(first);
  });

  it('⚠⚠ IT IS DETERMINISTIC — the same save always migrates to the same numbers', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      await bootWithLegacyDog('shepherd', { strength: 13, dexterity: 9, intelligence: 9 });
      await reload();
      // ⚠ WIDENED AFTER NC-1 — same reason as above: six runs all landing on
      // `undefined` is a set of size one and proves nothing.
      expect(loadedDog().potential).toBeTruthy();
      seen.add(JSON.stringify(loadedDog().potential));
    }
    expect(seen.size).toBe(1);
  });

  it('⚠⚠ A DOG THAT ALREADY HAS A CEILING IS NOT TOUCHED — including a bought one', async () => {
    // A market dog arrives with the potential the player paid to see. If load
    // re-derived it from a rescue profile, the animal on the counter and the
    // animal in the pack would be different dogs.
    await bootWithLivingDog();
    const p = useGameStore.getState().player!;
    const bought = { ...p.dog!, potential: { strength: 15, dexterity: 27, intelligence: 19 } };
    useGameStore.setState({ player: { ...p, dog: bought } as PlayerCharacter });
    await reload();
    expect(loadedDog().potential).toEqual({ strength: 15, dexterity: 27, intelligence: 19 });
  });

  it('⚠⚠ …and a save with NO DOG loads with no dog — the migration invents nothing', async () => {
    await bootWithLivingDog();
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, dog: null } as unknown as PlayerCharacter });
    await reload();
    expect(useGameStore.getState().player!.dog ?? null).toBeNull();
  });

  it('⚠⚠⚠ THE LOAD PATH ITSELF IS THE CALLER — backfillPlayer, which every load runs', async () => {
    // Pinned on the authority rather than on a spelling: hand backfillPlayer a
    // legacy player directly and it must come back migrated. That is the
    // function loadSlotIntoGame calls on `saved.player`, so a future refactor
    // that moves the call but keeps the authority still passes, and one that
    // drops it fails here AND in every test above.
    await bootWithLegacyDog('puppy', { strength: 8, dexterity: 9, intelligence: 9 });
    const raw = useGameStore.getState().player!;
    expect((raw.dog as { potential?: unknown }).potential).toBeUndefined();
    const out = backfillPlayer(raw);
    expect(out.dog!.potential).toEqual(BR.legacyPotentialFor('puppy', out.dog!.stats));
  });
});
