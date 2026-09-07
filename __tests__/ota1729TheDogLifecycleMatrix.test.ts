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
import * as DM from '../app/engine/dogMarket';
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
      rows.push(`  dog=${String(status).padEnd(16)} active=${String(hasActiveDog(useGameStore.getState().player)).padEnd(5)} shelf=${offers().includes('Kennel Dog') ? 'SELLS' : 'silent'}`);
    }
    W('\nSTATUS MATRIX (shelf should be silent while a dog is usable, and sell once it is not —');
    W('but NEVER for a character who has not met the dog system):');
    for (const r of rows) W(r);
    // never had a dog at all
    await boot(); setDog(null);
    expect(offers()).not.toContain('Kennel Dog');
    // usable dog present
    for (const s of ['with_player', 'waiting_at_base'] as const) {
      await boot(); setDog({ status: s });
      expect(offers()).not.toContain('Kennel Dog');
    }
    // dog gone
    for (const s of ['abandoned', 'dead'] as const) {
      await boot(); setDog({ status: s });
      expect(offers()).toContain('Kennel Dog');
    }
  });

  it('⚠⚠⚠ TC IS CHARGED EXACTLY ONCE, even on a double buy in one breath', async () => {
    await boot(1000); setDog({ status: 'dead' });
    putStall(shelf());
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().buyFromVendor('Kennel Dog', 1);
    useGameStore.getState().buyFromVendor('Kennel Dog', 1);
    await flush();
    W(`  double buy: TC ${before} -> ${useGameStore.getState().player!.tc} (one dog costs ${DM.REPLACEMENT_DOG_PRICE})`);
    expect(useGameStore.getState().player!.tc).toBe(before - DM.REPLACEMENT_DOG_PRICE);
    expect(pend()).not.toBeNull();
  });

  it('⚠⚠ NO DUPLICATE DOG: confirming twice yields one dog and clears the card', async () => {
    await boot(1000); setDog({ status: 'dead' });
    putStall(shelf());
    useGameStore.getState().buyFromVendor('Kennel Dog', 1); await flush();
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
    expect(offers()).toContain('Kennel Dog');          // still offered
    putStall(shelf());
    useGameStore.getState().buyFromVendor('Kennel Dog', 1); await flush();
    // ⚠ toBeFalsy, not toBeNull: on a save that has never opened a naming card the
    // field is absent rather than explicitly null, and both mean the same thing here.
    expect(pend()).toBeFalsy();                         // refused, nothing spent
    expect(useGameStore.getState().player!.tc).toBe(0);
    // and once the purse recovers, the same shelf sells
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, tc: 700 } } as never);
    putStall(shelf());
    useGameStore.getState().buyFromVendor('Kennel Dog', 1); await flush();
    expect(pend()).not.toBeNull();
  });

  it('⚠⚠ THE MARKET IS REPEATABLE - dog dies again, shelf sells again', async () => {
    await boot(5000); setDog({ status: 'dead' });
    for (let round = 1; round <= 3; round++) {
      putStall(shelf());
      useGameStore.getState().buyFromVendor('Kennel Dog', 1); await flush();
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
    const s0 = useGameStore.getState();
    expect((withReplacementDogOffer(v, s0.player!, s0.worldMemory)?.offers ?? []).map((o) => o.itemName))
      .toContain('Kennel Dog');                        // no rapport → the ordinary dog
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    const s1 = useGameStore.getState();
    expect((withReplacementDogOffer(v, s1.player!, s1.worldMemory)?.offers ?? []).map((o) => o.itemName))
      .toContain('Kennel Dog');                        // still no rapport after reload
  });

  it('⚠⚠⚠ pendingDogOnboarding CANNOT STRAND THE SAVE across a reload', async () => {
    await boot(1000); setDog({ status: 'dead' });
    putStall(shelf());
    useGameStore.getState().buyFromVendor('Kennel Dog', 1); await flush();
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
    useGameStore.getState().buyFromVendor('Kennel Dog', 1); await flush();
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    useGameStore.getState().confirmDogOnboarding('mutt', 'Ash', 'female'); await flush();
    const d = dog()!;
    expect(d.id).not.toBe(old.id);
    expect(d.name).not.toBe(old.name);
    expect(d.stats.strength).toBe(10);
    expect(d.statProgress.strength).toBe(0);
    expect(d.equipped.vest).toBeNull();
    expect(d.loyalty).not.toBe(97);
  });
});
