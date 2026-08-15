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

// OTA-1029 — CAPITAL TIDY-UP. Owner, standing in Asgardar: "it just feels
// disorganized, like all of the capitals do." Three causes, all locked here:
// the vendor stay/leave popup fired on every interior ROOM hop (a capital's
// room chips submit "go <dir>", which the leave-gate intercepted); the
// Crucible's ✕ was keyed to the ROOM so it popped back the moment you walked
// next door; and four full-width two-line banners stacked down the screen.
jest.setTimeout(60000);

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore, chipDismissTileKey } from '../app/state/gameStore';

describe('OTA-1029 — chip dismissals are TILE-scoped, not room-scoped', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('the key ignores the room: walking a capital interior never changes it', () => {
    const inGate = { currentLocationId: 'asgardar', mapX: 4, mapY: 7, hubRoomId: 'outpost_gate' } as any;
    const inWorkshop = { ...inGate, hubRoomId: 'outpost_workshop' } as any;
    expect(chipDismissTileKey(inGate)).toBe(chipDismissTileKey(inWorkshop));
    // ...but a different TILE is a different key.
    expect(chipDismissTileKey({ ...inGate, mapX: 5 } as any)).not.toBe(chipDismissTileKey(inGate));
    expect(chipDismissTileKey({ ...inGate, currentLocationId: 'samarran' } as any)).not.toBe(chipDismissTileKey(inGate));
  });

  it('a dismiss survives a room hop and clears when you actually leave the tile', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: 'Tidy', raceId: 'unknowing_mass', factionId: 'reclaimers_guild', motiveId: 'debt',
    } as any);
    store.getState().dismissStoryIntro();
    store.getState().skipTutorial();

    const tileKey = chipDismissTileKey(store.getState().player);
    store.getState().setCrucibleChipDismissedKey(tileKey);
    store.getState().setVendorChipDismissedKey(tileKey);

    // Room hop inside the same capital: same tile → both dismissals hold.
    store.setState({ player: { ...store.getState().player!, hubRoomId: 'outpost_workshop' } });
    store.getState().beginScene();
    expect(store.getState().crucibleChipDismissedKey).toBe(tileKey);
    expect(store.getState().vendorChipDismissedKey).toBe(tileKey);

    // Step off the tile: the dismissals clear, so coming back re-shows both chips.
    store.setState({ player: { ...store.getState().player!, mapX: (store.getState().player!.mapX ?? 0) + 1 } });
    store.getState().beginScene();
    expect(store.getState().crucibleChipDismissedKey).toBeNull();
    expect(store.getState().vendorChipDismissedKey).toBeNull();
  });
});

describe('OTA-1029 — SOURCE LOCKS', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const screen = read('app', 'screens', 'ExplorationScreen.tsx');

  it('the vendor stay/leave popup is gone entirely', () => {
    // The state, the modal, and — the actual bug — the move intercept that
    // caught every "go <dir>", which is exactly what a capital room chip submits.
    expect(screen).not.toMatch(/vendorLeavePrompt/);
    expect(screen).not.toMatch(/Leave them behind and move on/);
    expect(screen).not.toMatch(/title="Vendor present"/);
    expect(screen).not.toMatch(/const isMove = /);
  });

  it('the trader chip carries its own ✕, wired to the tile-scoped dismiss', () => {
    expect(screen).toMatch(/setVendorChipDismissedKey\(chipViewKey\)/);
    expect(screen).toMatch(/accessibilityLabel=\{`Dismiss \$\{currentScene\.vendor\.name}`}/);
    // The Crucible's ✕ reads from the same tile key — one rule for both.
    expect(screen).toMatch(/setCrucibleChipDismissedKey\(chipViewKey\)/);
    expect(screen).toMatch(/const chipViewKey = chipDismissTileKey\(player\)/);
    // The old room-keyed shape is gone.
    expect(screen).not.toMatch(/crucibleViewKey/);
  });

  it('the four stacked banners are one compact wrapping row', () => {
    expect(screen).toMatch(/placeChipRow: \{ flexDirection: 'row', flexWrap: 'wrap'/);
    // Every chip in the family shares the compact box.
    for (const accent of ['vendorChip', 'missionBoardChip', 'wandererChip', 'fusionChip']) {
      expect(screen).toMatch(new RegExp(`styles\\.placeChip, styles\\.${accent}`));
    }
    // The tall full-width banner boxes they replaced are retired.
    for (const dead of ['vendorBanner:', 'missionBoardBanner:', 'wandererBanner:', 'fusionBanner:']) {
      expect(screen).not.toContain(dead);
    }
  });

  it('a BLOCKED Crucible still spells out what is missing (OTA-220 survives the squeeze)', () => {
    expect(screen).toMatch(/numberOfLines=\{gate\.ok \? 1 : 2}/);
    expect(screen).toMatch(/gate\.reason \?\? 'tap for details'/);
  });
});
