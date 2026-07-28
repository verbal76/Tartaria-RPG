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

// OTA-1028 — the wedged bandolier (ghost equip references). Racked/stowed ids
// whose instances left the pack by any path other than throw/unrack rendered
// as EMPTY slots that still counted against the cap — unfillable, unclearable.
import * as fs from 'fs';
import * as path from 'path';
import { backfillPlayer } from '../app/state/gameStore';

const STORE = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

describe('OTA-1028 — ghosts are swept on load', () => {
  it('bandolier and pouch ids that no longer resolve to inventory are dropped', () => {
    const knife = { id: 'k1', name: 'Throwing Knife', kind: 'weapon', quantity: 3, tags: ['weapon', 'throwable'] };
    const p = {
      name: 'Wedged', raceId: 'reclaimer', hp: 10, hpMax: 10, stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
      inventory: [knife],
      equipped: {
        bandolierIds: ['ghost_a', 'ghost_b', 'k1'],
        toolPouchIds: ['ghost_c'],
      },
    } as any;
    const out = backfillPlayer(p) as any;
    expect(out.equipped.bandolierIds).toEqual(['k1']);
    expect(out.equipped.toolPouchIds).toEqual([]);
  });
  it('a clean save passes through with its racks intact', () => {
    const knife = { id: 'k1', name: 'Throwing Knife', kind: 'weapon', quantity: 1, tags: ['weapon', 'throwable'] };
    const p = {
      name: 'Clean', raceId: 'reclaimer', hp: 10, hpMax: 10, stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
      inventory: [knife],
      equipped: { bandolierIds: ['k1'], toolPouchIds: [] },
    } as any;
    expect((backfillPlayer(p) as any).equipped.bandolierIds).toEqual(['k1']);
  });
});

describe('OTA-1028 — the cap checks count only LIVE ids (mid-session ghosts cannot wedge)', () => {
  it('both stow handlers filter to inventory-resolving ids before the cap', () => {
    const liveFilter = /const current = \(player\.equipped\?\.(bandolierIds|toolPouchIds) \?\? \[\]\)\.filter\(\(id\) => player\.inventory\.some\(\(i\) => i\.id === id\)\);/g;
    expect(STORE.match(liveFilter)?.length).toBe(2);
    // The raw reads at the cap sites are gone.
    const stowBand = STORE.slice(STORE.indexOf('stowInBandolier(itemName)'), STORE.indexOf('stowInBandolier(itemName)') + 900);
    expect(stowBand).not.toContain('const current = player.equipped?.bandolierIds ?? [];');
  });
});
