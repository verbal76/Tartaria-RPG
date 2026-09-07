/**
 * OTA-1737 (repair 3 of 3) - THE PURCHASE AND THE THROW SURVIVE THE LOAD.
 *
 * 3A PROVEN before the fix (through loadSlotIntoGame): buy a Kennel Dog (600 TC),
 * save before the naming card, load - dogRescueAmnesty deleted the pending, the
 * coin stayed spent, the shelf offered another dog. The amnesty was written for
 * rescues the broken gates could never finish; a market purchase keeps its
 * pending now, and the rumour flag / once-per-save latch behave as before.
 *
 * 3B PROVEN before the fix: throw a dice-rolling throwable, save with the modal
 * open, load - throwSettlement (top-level, never saved) was gone: the shard was
 * never consumed and the off hand stayed the shard, the real weapon never
 * restored. The settlement is saved now and load settles it as CANCELLED through
 * settleThrowRestore - the same authority the in-session cancel uses.
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


import { useGameStore, withReplacementDogOffer, hasActiveDog } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { createDogCompanion } from '../app/engine/dogCompanion';
import { dogRescueAmnesty } from '../app/engine/worldMemory';
import type { VendorInstance } from '../app/engine/vendors';

jest.setTimeout(240000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');
const S = () => useGameStore.getState();
const inv = () => S().player!.inventory;
const put = (item: Record<string, unknown>) => { const p = S().player!; useGameStore.setState({ player: { ...p, inventory: [...p.inventory, item] } } as never); };
const stall = (offers: Array<{ itemName: string; price: number; quantity: number }>): VendorInstance =>
  ({ id: 'probe_stall', name: 'Duvo', title: 'trader', faction: null, offers } as unknown as VendorInstance);
async function boot(tc = 5000): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  useGameStore.setState({ player: { ...st.getState().player!, tc, inventory: [] }, tutorialStep: null } as never);
  await flush();
}
const reload = async () => { await S().persist(); await S().loadSlotIntoGame(S().activeSlotId!); await flush(); await flush(); };
function deadDog(): void {
  const dead = createDogCompanion({ name: 'Old Boy', breed: 'mutt', rawSex: 'male', startingProfile: 'mongrel', currentHour: 0 });
  useGameStore.setState({ player: { ...S().player!, dog: { ...dead, status: 'dead' } } } as never);
}
function dogShelf(): VendorInstance {
  const v = withReplacementDogOffer(stall([{ itemName: 'Rope', price: 10, quantity: 2 }]), S().player!, S().worldMemory)!;
  useGameStore.setState({ currentScene: { ...S().currentScene!, vendor: v, enemies: [], enemyHps: [] } } as never);
  return v;
}

describe('OTA-1737 (3A) - a paid dog survives the load', () => {
  it('⚠⚠⚠ buy → save before naming → load → the purchase stands → name it → dog obtained', async () => {
    await boot(5000); deadDog();
    const v = dogShelf();
    const row = v.offers.find((o) => /dog/i.test(o.itemName))!;
    S().buyFromVendor(row.itemName, 1); await flush();
    expect(S().player!.tc).toBe(5000 - row.price);
    expect(S().worldMemory.pendingDogOnboarding?.rescueData.scenario).toBe('market');
    await reload();
    expect(S().player!.tc).toBe(5000 - row.price);                              // still paid
    expect(S().worldMemory.pendingDogOnboarding?.rescueData.scenario).toBe('market'); // still owed
    S().confirmDogOnboarding('mutt', 'Ember', 'female'); await flush();
    expect(hasActiveDog(S().player!)).toBe(true);
    expect(S().player!.dog?.name).toBe('Ember');
    expect(S().worldMemory.pendingDogOnboarding ?? null).toBeNull();
    W(`  paid ${row.price}, reloaded, named Ember — TC ${S().player!.tc}`);
  });
  it('⚠⚠⚠ no refund, no duplicate: reload around the boundary any way you like', async () => {
    await boot(5000); deadDog();
    const v = dogShelf(); const row = v.offers.find((o) => /dog/i.test(o.itemName))!;
    S().buyFromVendor(row.itemName, 1); await flush();
    await reload();
    // a second purchase while the first is owed is refused, unpaid
    const tc1 = S().player!.tc;
    dogShelf();                                                                 // shelf projection: no dog row while pending
    expect(S().currentScene!.vendor!.offers.some((o) => /dog/i.test(o.itemName))).toBe(false);
    S().buyFromVendor(row.itemName, 1); await flush();
    expect(S().player!.tc).toBe(tc1);
    await reload();                                                             // reload again before naming: still one pending
    expect(S().worldMemory.pendingDogOnboarding?.rescueData.scenario).toBe('market');
    S().confirmDogOnboarding('mutt', 'Ember', 'female'); await flush();
    await reload();                                                             // and after naming: one dog, no pending, no refund
    expect(hasActiveDog(S().player!)).toBe(true);
    expect(S().worldMemory.pendingDogOnboarding ?? null).toBeNull();
    expect(S().player!.tc).toBe(5000 - row.price);
    dogShelf();
    expect(S().currentScene!.vendor!.offers.some((o) => /dog/i.test(o.itemName))).toBe(false);
  });
  it('⚠⚠ the amnesty still clears a wedged RESCUE (its whole purpose) — and only that', () => {
    const wedged = { pendingDogOnboarding: { stage: 'breed', rescueData: { scenario: 'snare' } }, dogRescueTipFired: true } as unknown as Parameters<typeof dogRescueAmnesty>[1];
    const patch = dogRescueAmnesty(false, wedged)!;
    expect(patch.pendingDogOnboarding).toBeNull();
    expect(patch.dogRescueTipFired).toBe(false);
    expect(patch.dogRescueAmnestyDone).toBe(true);
    const bought = { pendingDogOnboarding: { stage: 'breed', rescueData: { scenario: 'market' } }, dogRescueTipFired: true } as never;
    const keep = dogRescueAmnesty(false, bought)!;
    expect(keep.pendingDogOnboarding).toEqual({ stage: 'breed', rescueData: { scenario: 'market' } });
    expect(keep.dogRescueAmnestyDone).toBe(true);
    expect(dogRescueAmnesty(true, wedged)).toBeNull();                           // a dog at your side: nothing to do
    expect(dogRescueAmnesty(false, { ...wedged, dogRescueAmnestyDone: true })).toBeNull(); // once per save
  });
});

describe('OTA-1737 (3B) - an interrupted throw is cancelled, not abandoned', () => {
  const arm = async () => {
    put({ id: 'shard1', name: 'Shaped Aetheric Shard', kind: 'misc', rarity: 'Uncommon', quantity: 3, tags: ['throwable', 'aether', 'shaped'] });
    put({ id: 'blade1', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'], durability: { current: 20, max: 20 } });
    S().equipItem('Rusted Blade', 'off'); await flush();
    S().stowInBandolier('Shaped Aetheric Shard'); await flush();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const E = require('../app/data/enemies/enemies.json'); const rows = (E.enemies ?? E) as any[];
    const base = rows.find((e) => (e.hp ?? 0) > 0) ?? rows[0]; const enemy = { ...base, hp: base.hp ?? 30, maxHp: base.hp ?? 30 };
    useGameStore.setState({ currentScene: { ...S().currentScene!, enemies: [enemy], enemyHps: [enemy.hp], activeEnemyIdx: 0, range: 'mid', enemyKnockedOut: [false] } } as never);
  };
  const shards = () => inv().find((i) => i.id === 'shard1')?.quantity ?? 0;

  it('⚠⚠⚠ throw → modal open → save → load: nothing spent, the blade is back, the shard is still racked', async () => {
    await boot(5000); await arm();
    S().throwFromBandolier('Shaped Aetheric Shard', 'shard1'); await flush();
    expect(S().pendingRolls).not.toBeNull();
    expect(S().throwSettlement).not.toBeNull();
    expect(S().player!.equipped?.off).toBe('Shaped Aetheric Shard');
    await reload();
    expect(S().pendingRolls).toBeNull();
    expect(S().throwSettlement).toBeNull();                                     // settled, through the authority
    expect(shards()).toBe(3);                                                   // not consumed
    expect(S().player!.equipped?.off).toBe('Rusted Blade');                     // previous off-hand restored
    expect(S().player!.equipped?.offId).toBe('blade1');
    expect(S().player!.equipped?.bandolierIds).toEqual(['shard1']);            // still racked
    expect(inv().filter((i) => i.name === 'Shaped Aetheric Shard')).toHaveLength(1); // no duplicate
    W(`  after load: shards ${shards()}, off-hand ${S().player!.equipped?.off}`);
  });
  it('⚠⚠ and the next throw works normally: one unit spent, hand restored', async () => {
    await boot(5000); await arm();
    S().throwFromBandolier('Shaped Aetheric Shard', 'shard1'); await flush();
    await reload();
    // the scene keeps its enemy across the load (currentScene is persisted)
    if ((S().currentScene?.enemies.length ?? 0) === 0) await arm();
    S().throwFromBandolier('Shaped Aetheric Shard', 'shard1'); await flush();
    for (let k = 0; k < 20 && S().pendingRolls; k++) {
      const pr = S().pendingRolls!; const step = pr.steps[pr.currentStep] as { dice?: string } | undefined;
      const n = Number(/d(\d+)/.exec(String(step?.dice ?? 'd20'))?.[1] ?? 20);
      S().resolveRollStep([Math.max(1, n)]); await flush();
    }
    expect(S().throwSettlement).toBeNull();
    expect(shards()).toBe(2);                                                   // exactly one spent
    expect(S().player!.equipped?.off).toBe('Rusted Blade');
  });
  it('⚠ an old save with no throwSettlement field loads exactly as before', async () => {
    await boot(5000); await arm();
    await S().persist();
    await S().loadSlotIntoGame(S().activeSlotId!); await flush();
    expect(S().throwSettlement).toBeNull();
    expect(shards()).toBe(3);
    expect(S().player!.equipped?.off).toBe('Rusted Blade');
  });
});
