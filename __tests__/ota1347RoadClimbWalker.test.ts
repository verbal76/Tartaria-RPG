// ⚠ OTA-1347 — PUNCHLIST-BRAVO B11: ONE CLIMB WALKER MAKES THE REAL JOURNEY.
//
// Every per-climb suite TELEPORTS (currentLocationId = climb.locationId) — which
// is exactly how the missing tower-route branch once shipped invisible, and why
// the B7 probe that TRAVELLED was the one that found the two prop-suppression
// conditions. This walker keeps that lesson alive permanently: route a tower
// from a distance (through the OTA-1346 gate confirm, since the character
// starts inside the outpost), walk the whole road with the real travel loop,
// arrive, and prove the GREAT climb — not a generic 3-tier ascent — is standing
// there. En-route fights are cleared by fiat: this walker's one job is the road.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
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
import { GREAT_CLIMBS } from '../app/engine/greatClimbs';

jest.setTimeout(240_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

describe('OTA-1347 — a great climb reached by road, not by teleport', () => {
  it('⚠⚠ route Thametan\'s Tower from the outpost, walk every tile, find the GREAT climb standing', async () => {
    const climb = GREAT_CLIMBS.find((c) => c.id === 'thametan_tower')!;
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Roadwalker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    store.setState((s) => ({
      player: {
        ...s.player!,
        hp: 500, hpMax: 500, stamina: 500, staminaMax: 500,
        stats: { ...s.player!.stats, strength: 20, dexterity: 20 },
        // The climb gate is real: strap WORN on legs + a whole rope carried.
        inventory: [
          ...s.player!.inventory,
          { id: 'road_rope', name: "Reclaimer's Rope", kind: 'misc', quantity: 1, tags: ['utility', 'gate'], durability: { current: 400, max: 400 } },
          { id: 'road_strap', name: 'Hardened Climbing Strap', kind: 'armor', quantity: 1, tags: ['utility', 'gate'] },
        ],
        equipped: { ...(s.player!.equipped ?? {}), legs: 'Hardened Climbing Strap' },
      } as never,
      worldMemory: { ...s.worldMemory, unlockedGreatClimbs: [climb.id] },
    }));

    // Route through the OTA-1346 gate confirm if we start inside; otherwise route directly.
    if (store.getState().player!.hubRoomId) {
      store.getState().requestTravelConfirm(climb.locationId, "Thametan's Tower", { climbId: climb.id });
      store.getState().confirmLeaveAndTravel();
    } else {
      store.getState().routeGreatClimb(climb.id);
    }
    expect(store.getState().player!.routedClimbId).toBe(climb.id);

    // The road: real travel steps, one tile at a time. Fights and stamina are
    // cleared by fiat each step — the walker's one job is the journey itself.
    let guard = 0;
    while (store.getState().player!.currentLocationId !== climb.locationId) {
      if (guard++ > 120) {
        throw new Error(`never arrived: at ${store.getState().player!.currentLocationId}, `
          + `target=${JSON.stringify(store.getState().player!.travelTarget)}, `
          + `last lines:\n${store.getState().gameLog.slice(-5).map((e) => `${e.channel}: ${e.text}`).join('\n')}`);
      }
      store.setState((s) => ({
        player: { ...s.player!, stamina: 500, hp: 500 } as never,
        currentScene: s.currentScene
          ? { ...s.currentScene, enemies: [], enemyHps: [], range: null } as never
          : s.currentScene,
      }));
      if (!store.getState().player!.travelTarget) {
        // Course dropped (e.g. cleared by an arrival edge) — re-route and continue.
        store.getState().routeGreatClimb(climb.id);
        if (!store.getState().player!.travelTarget) break;
      }
      store.getState().continueTravel();
    }
    expect(store.getState().player!.currentLocationId).toBe(climb.locationId);

    // B7's two recovery conditions, exercised the honest way: clear any arrival
    // fight, take a fresh look, and the tower must be in the room.
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], range: null } as never,
    }));
    store.getState().submitPlayerAction('look around');
    const nouns = (store.getState().currentScene?.ambientNouns ?? []).map((n) => String(n).toLowerCase());
    expect(nouns.some((n) => climb.tokens.some((t: string) => n.includes(t)) || n.includes(climb.noun.toLowerCase()))).toBe(true);

    // And it is the GREAT climb — start it and read the real tier count, not a
    // generic 3-tier ascent (the exact symptom that opened B7).
    // The look itself can spawn a war party (standing rules are live out here);
    // clear once more — the fight is not this walker's subject either.
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], range: null } as never,
    }));
    store.getState().submitPlayerAction(`climb the ${climb.noun}`);
    const elev = store.getState().currentScene?.elevatedOn as { totalTiers?: number; tiers?: number } | null;
    if (!elev) {
      throw new Error(`climb did not start. noun=${climb.noun} nouns=${JSON.stringify(nouns)}\nlast lines:\n`
        + store.getState().gameLog.slice(-6).map((e) => `${e.channel}: ${e.text}`).join('\n'));
    }
    const tiers = elev?.totalTiers ?? elev?.tiers ?? 0;
    expect(tiers).toBe(climb.tiers);
  });
});
