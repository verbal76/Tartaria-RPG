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


// ⚠⚠ OTA-1305 — THE FIVE TOWERS WERE THE ONLY MISSIONS YOU COULD NOT ROUTE TO.
//
// Owner, after reading a Skyreacher chart: *"there's five beacon towers and all
// five beacon towers are known grid locations so I should be able to autoroute
// to it. how come that's not available?… it should ask me if I want to set an
// auto route like the rest of the missions."*
//
// He was right on both counts. Every GreatClimb carries its own `locationId`, so
// the destination was never in doubt — CONTRACTS just rendered the towers as
// read-only cards (OTA-912) with no route affordance at any point.
//
// ⚠ AND NO WALKER COULD EVER HAVE CAUGHT IT. Every climb suite puts the player
// on the tower by assignment — `currentLocationId: climb.locationId` — so all of
// them proved the climb works ONCE YOU ARE STANDING THERE and none of them ever
// travelled. The last test below is the one that would have failed.
import { useGameStore } from '../app/state/gameStore';
import { GREAT_CLIMBS } from '../app/engine/greatClimbs';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

async function player(): Promise<void> {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({
    name: 'Climber', raceId: 'aetherborn', factionId: 'eternal_dynasty',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  useGameStore.getState().skipTutorial?.();
  useGameStore.setState((s) => (s.player ? {
    player: { ...s.player, hubRoomId: null, stamina: 200, staminaMax: 200, currentLocationId: 'tartarian_outskirts' },
  } : s));
}
const unlock = (id: string): void => {
  useGameStore.setState((s) => ({
    worldMemory: { ...s.worldMemory, unlockedGreatClimbs: [...(s.worldMemory.unlockedGreatClimbs ?? []), id] },
  }));
};

describe('OTA-1305 — a beacon tower routes like every other mission', () => {
  it('⚠ every one of the five towers names a real location to route to', () => {
    expect(GREAT_CLIMBS.length).toBe(5);
    for (const c of GREAT_CLIMBS) expect(typeof c.locationId).toBe('string');
  });

  it("⚠⚠ THE OWNER'S CASE: routing an unlocked tower sets a course to it", async () => {
    await player();
    const climb = GREAT_CLIMBS[0]!;
    unlock(climb.id);
    useGameStore.getState().routeGreatClimb(climb.id);
    const p = useGameStore.getState().player!;
    expect(p.travelTarget?.locationId ?? null).toBe(climb.locationId);
    expect(p.routedClimbId).toBe(climb.id);
  });

  it('⚠⚠ ...and it becomes THE mission you are on — everything else pauses', async () => {
    await player();
    const climb = GREAT_CLIMBS[1]!;
    unlock(climb.id);
    // Put a tracked mission of every routed kind on the slate first.
    useGameStore.setState((s) => (s.player ? {
      player: {
        ...s.player,
        activeHunts: [{ id: 'h1', tracked: true }] as never,
        activeMysteries: [{ id: 'm1', tracked: true }] as never,
        activeStorylines: [{ id: 's1', tracked: true }] as never,
      },
    } : s));
    useGameStore.getState().routeGreatClimb(climb.id);
    const p = useGameStore.getState().player!;
    for (const rec of [...(p.activeFactionQuests ?? []), ...(p.activeHunts ?? []),
                       ...(p.activeMysteries ?? []), ...(p.activeStorylines ?? [])]) {
      expect((rec as { tracked?: boolean }).tracked).toBe(false);
    }
  });

  it('⚠ a tower whose chart is unread cannot be routed', async () => {
    await player();
    const climb = GREAT_CLIMBS[2]!;
    useGameStore.getState().routeGreatClimb(climb.id);
    expect(useGameStore.getState().player!.travelTarget ?? null).toBeNull();
    expect(useGameStore.getState().player!.routedClimbId ?? null).toBeNull();
  });

  it('⚠ the CONTRACTS card offers the route — a read-only tower is the bug', () => {
    const screen = readFileSync(join(__dirname, '..', 'app', 'screens', 'ContractsScreen.tsx'), 'utf8');
    const i = screen.indexOf('const climbMissions = GREAT_CLIMBS.filter');
    expect(i).toBeGreaterThan(-1);
    const section = screen.slice(i, i + 4000);
    expect(section).toContain('SET COURSE TO');
    expect(section).toContain('climbId: c.id');
  });

  it('⚠⚠ THE JOURNEY THE CLIMB WALKERS NEVER MADE: route, travel, arrive, climb', async () => {
    // ⚠ Every climb suite reaches its tower by ASSIGNMENT —
    // `currentLocationId: climb.locationId` — so all five proved the climb works
    // once you are standing there and not one of them ever travelled. That is
    // the blind spot the missing route button lived in. This walks it end to
    // end: set the course from somewhere else, complete the journey through the
    // engine's own arrival path, and confirm the tower is really under you with
    // its climb to start. Nothing here writes the destination in by hand.
    await player();
    const climb = GREAT_CLIMBS[0]!;
    unlock(climb.id);
    expect(useGameStore.getState().player!.currentLocationId).not.toBe(climb.locationId);

    useGameStore.getState().routeGreatClimb(climb.id);
    expect(useGameStore.getState().player!.travelTarget?.locationId ?? null).toBe(climb.locationId);

    useGameStore.getState().travelTo(climb.locationId);
    const t0 = Date.now();
    while (useGameStore.getState().player!.currentLocationId !== climb.locationId && Date.now() - t0 < 6000) {
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(useGameStore.getState().player!.currentLocationId).toBe(climb.locationId);

    // And the tower is actually here to be climbed — a road to the right tile
    // that does not put the climb in front of you is not a road to the climb.
    const nouns = (useGameStore.getState().currentScene?.ambientNouns ?? []).map((n) => n.toLowerCase());
    expect(nouns.some((n) => climb.tokens.some((t) => n.includes(t)))).toBe(true);
  });
});
