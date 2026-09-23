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
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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
// ⚠ Reduce-motion is a real shipped path and it stops RN Animated loops from
// outliving Jest's teardown ("_bezier is not a function" as the graph unloads).
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — THE OTHER FOUR SCREENS HAD NEVER BEEN RENDERED BY A TEST.

import { useGameStore, withReplacementDogOffer, hasActiveDog, tickDogStatus } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { createDogCompanion } from '../app/engine/dogCompanion';
import type { VendorInstance } from '../app/engine/vendors';

jest.setTimeout(300000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');

async function boot(tc = 5000): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  const p = st.getState().player!;
  st.setState({ player: { ...p, tc } } as never);
  await flush();
}
const stall = (over?: Partial<VendorInstance>): VendorInstance => ({
  id: 'roadside_honest_probe', name: 'Duvo', title: 'roadside trader',
  offers: [{ itemName: 'Rope', price: 10, quantity: 2 }], ...over,
} as VendorInstance);

function setDog(patch: Record<string, unknown> | null): void {
  const p = useGameStore.getState().player!;
  if (!patch) { useGameStore.setState({ player: { ...p, dog: undefined } } as never); return; }
  const base = createDogCompanion({ name: 'Cinder', breed: 'mutt', rawSex: 'male', startingProfile: 'mongrel', currentHour: 0 });
  useGameStore.setState({ player: { ...p, dog: { ...base, ...patch } } } as never);
}
function shelf(): VendorInstance | null {
  const s = useGameStore.getState();
  return withReplacementDogOffer(stall(), s.player!, s.worldMemory);
}
const offers = (): string[] => (shelf()?.offers ?? []).map((o) => o.itemName);
/* ⚠⚠ AMENDED — THE SHELF SELLS A ROLLED ANIMAL, NOT A CATALOG ROW. This suite
 * asked for 'Kennel Dog' by name. There is no such row: every vendor dog is an
 * individual rolled inside its breed's bands, so the question "is the market
 * open?" is now "is there a DOG ROW", and a purchase names whatever breed is
 * actually standing there. Every claim below is the same claim, re-pinned. */
const dogRow = () => (shelf()?.offers ?? []).find((o) => !!o.dog) ?? null;
const sellsADog = (): boolean => !!dogRow();
/** Buy whatever dog the CURRENT scene vendor is holding. */
function buyTheDog(): void {
  const v = useGameStore.getState().currentScene?.vendor;
  const row = (v?.offers ?? []).find((o) => !!o.dog);
  useGameStore.getState().buyFromVendor(row ? row.itemName : 'no dog on this counter', 1);
}
function putStall(v: VendorInstance | null): void {
  const s = useGameStore.getState();
  useGameStore.setState({ currentScene: { ...s.currentScene!, vendor: v, enemies: [] } } as never);
}
const dog = () => useGameStore.getState().player?.dog;
const pend = () => useGameStore.getState().worldMemory.pendingDogOnboarding;

describe('DOG LIFECYCLE - the whole transition matrix', () => {
  it('MATRIX - every status, and what the market says at each', async () => {
    const rows: string[] = [];
    for (const status of [null, 'with_player', 'waiting_at_base', 'abandoned', 'dead'] as const) {
      await boot();
      setDog(status === null ? null : { status });
      rows.push(`  dog=${String(status).padEnd(16)} active=${String(hasActiveDog(useGameStore.getState().player)).padEnd(5)} shelf=${sellsADog() ? 'SELLS' : 'silent'}`);
    }
    W('\nSTATUS MATRIX (shelf is silent ONLY before the rescue arc; after it, it sells at every status —');
    W('but NEVER for a character who has not met the dog system):');
    for (const r of rows) W(r);
    /* ⚠⚠⚠ ONE ROW OF THIS MATRIX IS INVERTED BY OWNER RULING, and it is the
     *  row the whole companion market turns on. This asserted that a USABLE
     *  dog silenced the shelf. The reachability audit proved that hid the
     *  market from nearly everyone past the rescue arc, and the owner ruled it
     *  out: *"That is NOT the final owner design contract."* A player with a
     *  living dog must be able to encounter, inspect and compare another. */
    // never had a dog at all — the rescue arc is still the introduction
    await boot(); setDog(null);
    expect(sellsADog()).toBe(false);
    // ⚠ INVERTED: a usable dog NO LONGER hides the stall
    for (const s of ['with_player', 'waiting_at_base'] as const) {
      await boot(); setDog({ status: s });
      expect(sellsADog()).toBe(true);
    }
    // dog gone — unchanged, and still the OTA-1726 point
    for (const s of ['abandoned', 'dead'] as const) {
      await boot(); setDog({ status: s });
      expect(sellsADog()).toBe(true);
    }
    // ⚠ AND THE SURVIVING GATE: an acquisition already in flight blocks a second
    await boot(); setDog({ status: 'dead' });
    useGameStore.setState({ worldMemory: {
      ...useGameStore.getState().worldMemory,
      pendingDogOnboarding: { stage: 'breed', rescueData: { scenario: 'snare', startingProfile: 'mongrel' } },
    } } as never);
    expect(sellsADog()).toBe(false);
  });

  it('⚠⚠⚠ TC IS CHARGED EXACTLY ONCE, even on a double buy in one breath', async () => {
    await boot(1000); setDog({ status: 'dead' });
    putStall(shelf());
    /* ⚠⚠ AMENDED — ONE CHARGE, AT THAT ANIMAL'S OWN PRICE. This subtracted the
     *  flat `DM.REPLACEMENT_DOG_PRICE`. Dogs are priced individually off their
     *  rolled potential now, so a flat pin would only ever have been true by
     *  luck. The claim — charged ONCE, never twice — is unchanged and is asked
     *  of the price on the row actually standing on the counter. */
    const row = (useGameStore.getState().currentScene!.vendor!.offers).find((o) => !!o.dog)!;
    const price = row.price;
    const before = useGameStore.getState().player!.tc;
    buyTheDog();
    buyTheDog();
    await flush();
    const after = useGameStore.getState().player!.tc;
    W(`  double buy: TC ${before} -> ${after} (this dog costs ${price})`);
    expect(after).toBe(before - price);
    expect(before - after).toBeLessThan(price * 2);   // the second press bought nothing
    expect(pend()).not.toBeNull();
  });

  it('⚠⚠ NO DUPLICATE DOG: confirming twice yields one dog and clears the card', async () => {
    await boot(1000); setDog({ status: 'dead' });
    putStall(shelf());
    buyTheDog(); await flush();
    useGameStore.getState().confirmDogOnboarding('mutt', 'Ash', 'female'); await flush();
    const first = dog()!;
    useGameStore.getState().confirmDogOnboarding('mutt', 'Bram', 'male'); await flush();
    expect(dog()!.id).toBe(first.id);
    expect(dog()!.name).toBe('Ash');
    expect(pend()).toBeNull();
  });

  it('⚠⚠ NO IMPOSSIBLE RESURRECTION: a dead dog is not revived by the clock', async () => {
    await boot(); setDog({ status: 'dead', hp: 0 });
    for (let i = 0; i < 5; i++) tickDogStatus(useGameStore.getState as never, useGameStore.setState as never);
    expect(dog()!.status).toBe('dead');
    await boot(); setDog({ status: 'abandoned', loyalty: 0 });
    for (let i = 0; i < 5; i++) tickDogStatus(useGameStore.getState as never, useGameStore.setState as never);
    expect(dog()!.status).toBe('abandoned');
  });

  it('⚠⚠⚠ NO PERMANENT LOCKOUT FROM AN EMPTY PURSE - the shelf still offers when broke', async () => {
    // The old puppy vendor retired itself forever when the pack was empty. A
    // temporary economic condition must never close the road.
    await boot(0); setDog({ status: 'dead' });
    expect(sellsADog()).toBe(true);                     // still offered
    putStall(shelf());
    buyTheDog(); await flush();
    // ⚠ toBeFalsy, not toBeNull: on a save that has never opened a naming card the
    // field is absent rather than explicitly null, and both mean the same thing here.
    expect(pend()).toBeFalsy();                         // refused, nothing spent
    expect(useGameStore.getState().player!.tc).toBe(0);
    // and once the purse recovers, the same shelf sells
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, tc: 700 } } as never);
    putStall(shelf());
    buyTheDog(); await flush();
    expect(pend()).not.toBeNull();
  });

  it('⚠⚠ THE MARKET IS REPEATABLE - dog dies again, shelf sells again', async () => {
    await boot(5000); setDog({ status: 'dead' });
    for (let round = 1; round <= 3; round++) {
      putStall(shelf());
      buyTheDog(); await flush();
      useGameStore.getState().confirmDogOnboarding('mutt', `Dog${round}`, 'female'); await flush();
      expect(dog()!.name).toBe(`Dog${round}`);
      expect(hasActiveDog(useGameStore.getState().player)).toBe(true);
      setDog({ status: 'dead', name: `Dog${round}` });   // it dies again
    }
    W('  bought a replacement three times over — the road never closes');
  });

  it('⚠⚠ FACTION GATE SURVIVES A RELOAD', async () => {
    await boot(5000); setDog({ status: 'dead' });
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, completedFactionQuestIds: [] } } as never);
    const v = stall({ id: 'named_probe', faction: 'true_tartarians', nativeFaction: 'true_tartarians' } as never);
    /* ⚠⚠ AMENDED — SAME GATE, PINNED ON THE ANIMAL RATHER THAN A CATALOG NAME.
     *  This read `toContain('Kennel Dog')`: the one ordinary row the old
     *  catalog had. There is no catalog now, so "the player got the ordinary
     *  dog, not the faction dog" is asked of the animal itself — it must be
     *  standing there (the road is never closed by a missing gate) and its
     *  breed must carry NO faction. That is strictly more than the old pin:
     *  the name 'Kennel Dog' could not have caught a faction breed leaking
     *  under a different label, and `faction === null` catches every one. */
    const rowAt = (vi: VendorInstance) => {
      const s = useGameStore.getState();
      return (withReplacementDogOffer(vi, s.player!, s.worldMemory)?.offers ?? [])
        .find((o) => !!o.dog) ?? null;
    };
    const before = rowAt(v);
    expect(before).not.toBeNull();                     // the shelf is still open
    expect(before!.dog!.faction).toBeNull();           // no rapport → the ordinary dog
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    const after = rowAt(v);
    expect(after).not.toBeNull();
    expect(after!.dog!.faction).toBeNull();            // still no rapport after reload
  });

  it('⚠⚠⚠ pendingDogOnboarding CANNOT STRAND THE SAVE across a reload', async () => {
    await boot(1000); setDog({ status: 'dead' });
    putStall(shelf());
    buyTheDog(); await flush();
    expect(pend()).not.toBeNull();
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    // the naming card is still open (the money was taken; the dog is owed)
    expect(pend()).not.toBeNull();
    useGameStore.getState().confirmDogOnboarding('mutt', 'Ash', 'female'); await flush();
    expect(dog()!.name).toBe('Ash');
    expect(pend()).toBeNull();
    W('  paid → reloaded → the card survived and still paid out a dog');
  });

  it('⚠ REPLACEMENT INHERITS NOTHING, checked across the reload path too', async () => {
    await boot(1000);
    setDog({ status: 'dead', loyalty: 97, stats: { strength: 17, dexterity: 12, intelligence: 12 },
             statProgress: { strength: 44, dexterity: 0, intelligence: 0 },
             equipped: { vest: 'Padded Dog Vest', vestId: 'v1' } });
    const old = dog()!;
    putStall(shelf());
    buyTheDog(); await flush();
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    /* ⚠⚠ AMENDED — THE DOG THAT ARRIVES IS THE DOG THAT WAS ON THE COUNTER.
     *  This pinned `stats.strength === 10`, the mongrel profile's flat base,
     *  because every replacement used to be a catalog dog. A purchase now
     *  carries the individual sheet the player inspected, so the base is
     *  whatever that animal rolled. The claim is unchanged in substance and
     *  stronger in reach: it must match the PAID-FOR sheet exactly, and it
     *  must not be the dead dog's developed 17. The old literal could not
     *  have told those two apart — 10 is neither. */
    const paidFor = pend()!.rescueData!.market!;
    useGameStore.getState().confirmDogOnboarding('mutt', 'Ash', 'female'); await flush();
    const d = dog()!;
    expect(d.id).not.toBe(old.id);
    expect(d.name).not.toBe(old.name);
    expect(d.stats).toEqual(paidFor.stats);
    expect(d.stats.strength).not.toBe(old.stats.strength);   // 17 was EARNED, and dies with it
    expect(d.statProgress.strength).toBe(0);
    expect(d.equipped.vest).toBeNull();
    expect(d.loyalty).not.toBe(97);
  });
});
