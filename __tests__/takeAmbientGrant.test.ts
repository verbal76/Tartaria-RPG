// End-to-end verification: tapping the TAKE modal's chip ACTUALLY
// puts the item in player.inventory.
//
// Playtester report: "items don't land in my inventory." Engine
// dedup was working (one grant per noun), but the chip never
// greyed out — leading the player to tap repeatedly and find
// fewer items than expected. The chip fix landed in OTA 176; this
// test verifies the underlying grant call is doing its job so we
// have a regression net for the data path itself.
//
// What we exercise:
//   1. Construct a typical scene with 'rope', 'rusted blade',
//      'scrap pile' in ambientNouns (matching the user's log).
//   2. Call takeAmbientNoun('rope') — the SAME action TakeModal
//      onTake invokes.
//   3. Assert player.inventory now contains a Climbing Rope.
//   4. Call takeAmbientNoun('rope') again — assert dedup blocks
//      it AND no second item lands.
//   5. Repeat for the rusted blade and scrap pile cases the user
//      reported.

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
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

describe('TAKE modal → takeAmbientNoun → inventory', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('lands a Climbing Rope in inventory when player taps "rope" — and dedupes the second tap', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'RopeTester', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    // Plant the same ambient pool the playtest log showed at The Gate.
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene,
        ambientNouns: ['rope', 'header', 'dust trail', 'barricade', 'scrap pile', 'skeleton', 'rusted blade', 'portcullis'],
        displayedAmbientNouns: ['rope', 'header', 'dust trail', 'barricade', 'scrap pile', 'skeleton', 'rusted blade', 'portcullis'],
      },
    });

    const ropeCountBefore = store.getState().player!.inventory
      .filter((i) => i.name === 'Climbing Rope').length;

    // Single tap, same call the TakeModal makes.
    store.getState().takeAmbientNoun('rope');

    const player1 = store.getState().player!;
    const ropesAfter = player1.inventory.filter((i) => i.name === 'Climbing Rope');
    expect(ropesAfter.length).toBe(ropeCountBefore + 1);
    expect(ropesAfter[ropesAfter.length - 1]!.quantity).toBe(1);
    expect(ropesAfter[ropesAfter.length - 1]!.kind).toBe('misc');

    // Second tap — engine dedup should reject; inventory stays put.
    store.getState().takeAmbientNoun('rope');
    const player2 = store.getState().player!;
    expect(player2.inventory.filter((i) => i.name === 'Climbing Rope').length).toBe(ropesAfter.length);

    // Six more taps — confirms no race-condition double-grant when
    // a frustrated playtester pounds the chip.
    for (let i = 0; i < 6; i++) store.getState().takeAmbientNoun('rope');
    const player3 = store.getState().player!;
    expect(player3.inventory.filter((i) => i.name === 'Climbing Rope').length).toBe(ropesAfter.length);
  });

  it('lands a Rusted Blade under kind:weapon when player taps "rusted blade"', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'BladeTester', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene,
        ambientNouns: ['rusted blade', 'scrap pile'],
        displayedAmbientNouns: ['rusted blade', 'scrap pile'],
      },
    });
    const bladesBefore = store.getState().player!.inventory.filter((i) => i.name === 'Rusted Blade');
    const totalBefore = bladesBefore.reduce((sum, i) => sum + i.quantity, 0);

    store.getState().takeAmbientNoun('rusted blade');

    // Total quantity of Rusted Blade across inventory MUST increase by
    // 1 — whether grantItem merges into an existing row (starter kit
    // ships with one) or pushes a fresh row.
    const bladesAfter = store.getState().player!.inventory.filter((i) => i.name === 'Rusted Blade');
    const totalAfter = bladesAfter.reduce((sum, i) => sum + i.quantity, 0);
    expect(totalAfter).toBe(totalBefore + 1);
    // The row carrying the blade should be kind=weapon.
    expect(bladesAfter[bladesAfter.length - 1]!.kind).toBe('weapon');
    // Weapon should carry durability per stampDurability.
    expect(bladesAfter[bladesAfter.length - 1]!.durability).toBeTruthy();
  });

  it('self-heals stale searchedAmbientNouns: noun marked consumed but item not in inventory → still grants', async () => {
    // This covers the post-OTA-172 recovery case. Pre-fix, salvage
    // on a "nothing" outcome wrote the ambient noun into
    // searchedAmbientNouns even though no item was granted.
    // Players ended up with chips that read "already taken" forever
    // for items they never actually had. OTA 177+ self-heals: if
    // the catalog item isn't in inventory, treat the entry as
    // stale and allow the take.
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'StaleConsumed', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    // Force the scene to have rope in ambient.
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene,
        ambientNouns: ['rope'],
        displayedAmbientNouns: ['rope'],
      },
    });
    // Strip any starter Climbing Rope so we know the player doesn't
    // own it. Starter kits don't ship one, but be defensive.
    const p0 = store.getState().player!;
    store.setState({
      player: { ...p0, inventory: p0.inventory.filter((i) => i.name !== 'Climbing Rope') },
    });

    // Plant the stale dedup entry — what the pre-fix salvage path
    // would have left behind on a "nothing" outcome.
    const locId = p0.currentLocationId;
    const microMicroId = store.getState().currentScene!.microMicroId ?? '_';
    const mx = typeof p0.mapX === 'number' ? p0.mapX : '_';
    const my = typeof p0.mapY === 'number' ? p0.mapY : '_';
    const roomKey = `${locId}@${microMicroId}@${mx},${my}`;
    store.setState((s) => ({
      worldMemory: {
        ...s.worldMemory,
        visitedRooms: {
          ...(s.worldMemory.visitedRooms ?? {}),
          [roomKey]: {
            firstVisitAt: Date.now(),
            lastVisitAt: Date.now(),
            visitCount: 1,
            searchedAmbientNouns: ['rope'],
          },
        },
      },
    }));

    // Take should now SUCCEED despite the stale dedup entry.
    store.getState().takeAmbientNoun('rope');
    const inv = store.getState().player!.inventory;
    const got = inv.find((i) => i.name === 'Climbing Rope');
    expect(got).toBeTruthy();
    expect(got!.quantity).toBe(1);
  });

  it('legit dedup still blocks: noun marked consumed AND item in inventory → rejects', async () => {
    // Counterpoint to the self-heal test — make sure normal dedup
    // still works when the player actually has the item.
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'LegitDedup', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene,
        ambientNouns: ['rope'],
        displayedAmbientNouns: ['rope'],
      },
    });

    // First take — should succeed.
    store.getState().takeAmbientNoun('rope');
    const afterFirst = store.getState().player!.inventory.filter((i) => i.name === 'Climbing Rope');
    expect(afterFirst.length).toBe(1);
    expect(afterFirst[0]!.quantity).toBe(1);

    // Second take — should be blocked by dedup (player owns rope).
    store.getState().takeAmbientNoun('rope');
    const afterSecond = store.getState().player!.inventory.filter((i) => i.name === 'Climbing Rope');
    const totalQty = afterSecond.reduce((s, i) => s + i.quantity, 0);
    expect(totalQty).toBe(1); // No double-grant.
  });

  it('lands Scrap Metal under kind:misc (material) when player taps "scrap pile"', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'PileTester', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene,
        ambientNouns: ['scrap pile'],
        displayedAmbientNouns: ['scrap pile'],
      },
    });

    // 'scrap pile' resolves to "Scrap Metal" via the item alias layer.
    store.getState().takeAmbientNoun('scrap pile');

    const inv = store.getState().player!.inventory;
    const scrap = inv.find((i) => i.name === 'Scrap Metal');
    if (!scrap) {
      // Diagnostics on failure — print every inventory row so we can
      // see what the action actually produced.
      // eslint-disable-next-line no-console
      console.warn('inventory after scrap-pile take:', JSON.stringify(inv, null, 2));
    }
    expect(scrap).toBeTruthy();
    expect(scrap!.kind).toBe('misc');
  });
});
