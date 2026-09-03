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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1635 — THREE FROM THE 00:49 LOG.
//
// Owner, typed into the game on build 1634:
//   00:32:12  "how did I equip food?"
//   00:32:59  "honey glazed knuckles shouldn't be equippable"
//   00:07:56  "I hit investigate and right after that the pop-up for Nix came
//              up. so then I had to do my investigate and then when that
//              closed then the next conversation came up. they kind of
//              overlapped each other"
// And one thing he did not type because he could not see it: fifty minutes of
// `arbiter: template (reason=qwen-not-ready)`, a trailer reading `Model
// contexts Opened: 0 · Narration engine: idle`, and NOT ONE qwen line to say
// whether the warm was skipped, started and hung, or never released.

import { validSlotsForItem } from '../app/engine/equipment';
import { qwenGateReason } from '../app/diagnostics/mlHealth';
import type { InventoryItem } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const codeOnly = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const item = (name: string, kind: InventoryItem['kind'], tags: string[] = []): InventoryItem =>
  ({ id: `t_${name}`, name, kind, rarity: 'Common', quantity: 1, tags });

describe('OTA-1635 — food is never gear', () => {
  it('⚠⚠⚠ HIS ITEM — the Honey-Glazed Knuckle has no slot', () => {
    expect(validSlotsForItem(item('Honey-Glazed Knuckle', 'consumable', ['food', 'treat', 'dog_treat', 'baker']))).toEqual([]);
  });

  it('⚠⚠ any consumable with a gear-shaped name has no slot — kind beats the regex', () => {
    expect(validSlotsForItem(item('Honey-Glazed Knuckle', 'consumable'))).toEqual([]);
    expect(validSlotsForItem(item('Marrow Bone Ring', 'consumable'))).toEqual([]);
    expect(validSlotsForItem(item('Iron Helm Broth', 'consumable'))).toEqual([]);
  });

  it('⚠⚠ and the food tags alone are enough, whatever the kind says', () => {
    expect(validSlotsForItem(item('Honey-Glazed Knuckle', 'misc', ['food']))).toEqual([]);
    expect(validSlotsForItem(item('Glazed Knuckle', 'misc', ['dog_treat']))).toEqual([]);
  });

  it('⚠⚠⚠ THE REAL KNUCKLES STILL EQUIP — the weapon catalog answers first', () => {
    expect(validSlotsForItem(item('Giant Bone Knuckles', 'weapon'))).toEqual(['main', 'off']);
  });

  it('⚠ the unknown-but-gear-shaped name still equips (the owner\'s rule survives)', () => {
    expect(validSlotsForItem(item('Mud-Rend Blade', 'misc'))).toEqual(['main', 'off']);
    expect(validSlotsForItem(item('Tinker\'s Knuckle Guards', 'misc'))).toEqual(['hands']);
  });
});

describe('OTA-1635 — the wanderer card waits for the picker', () => {
  it('⚠⚠⚠ the screen tells the store while a picker is up, and clears on unmount', () => {
    const scr = codeOnly(src('app/screens/ExplorationScreen.tsx'));
    expect(scr).toContain('useGameStore.setState({ explorationPickerOpen: searchOpen || takeOpen });');
    expect(scr).toContain('return () => { useGameStore.setState({ explorationPickerOpen: false }); };');
  });

  it('⚠⚠⚠ the card reads it — and the screen — before it arms', () => {
    const card = codeOnly(src('app/components/WandererEncounterModal.tsx'));
    expect(card).toContain('const pickerOpen = useGameStore((s) => s.explorationPickerOpen);');
    expect(card).toContain("const screen = useGameStore((s) => s.currentScreen);");
    expect(card).toContain("&& !pickerOpen && screen === 'exploration';");
    // the dwell still runs off `armed`, so closing the picker restarts the wait
    expect(card).toContain('const t = setTimeout(() => setReady(true), WANDERER_CARD_DWELL_MS);');
  });

  it('⚠ the flag exists in the store with a quiet default', () => {
    const g = src('app/state/gameStore.ts');
    expect(g).toContain('explorationPickerOpen: boolean;');
    expect(g).toContain('explorationPickerOpen: false,');
  });
});

describe('OTA-1635 — the engine says why it is silent', () => {
  it('⚠⚠⚠ the gate reason is a sentence, for every branch of the gate', () => {
    // health not loaded → says so rather than inventing a verdict
    expect(qwenGateReason()).toBe('health not loaded yet');
  });

  it('⚠⚠⚠ every skip branch in the boot path writes the reason to the LOG, not the console', () => {
    const app = codeOnly(src('App.tsx'));
    const skips = app.match(/qwen: SKIPPED this session — \$\{qwenGateReason\(\)\}/g) ?? [];
    // three sites: the crash-guarded path, the normal path, the health-load-failed path
    expect(skips.length).toBe(3);
    // and each sits inside a !shouldAttemptQwen() branch
    const gates = app.match(/if \(!shouldAttemptQwen\(\)\)/g) ?? [];
    expect(gates.length).toBe(3);
  });

  it('⚠⚠⚠ the load announces itself, and a load that never settles says so once', () => {
    const slice = codeOnly(src('app/state/slices/aiLifecycleSlice.ts'));
    expect(slice).toContain('qwen: loading (was ${current})');
    expect(slice).toContain('const stallTimer = setTimeout(() => {');
    expect(slice).toContain("if (st === 'downloading' || st === 'loading') {");
    expect(slice).toContain('clearTimeout(stallTimer);');
    expect(slice).toContain('const QWEN_LOAD_STALL_MS = 90_000;');
  });
});
