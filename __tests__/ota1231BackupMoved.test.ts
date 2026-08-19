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

// OTA-1231 — THE BACKUP MOVED ROOMS, IT DID NOT NARROW. Owner: the OTA-1201
// BACK UP button on every character row "makes the game look broken to
// testers." Living characters now back up from Settings → RUN (beside SAVE);
// dead rows keep their button — a dead save has no other door. One shared
// implementation (app/ui/backupCharacter.ts) serves both, so the two doors
// cannot drift.
import { readFileSync } from 'fs';
import { join } from 'path';
import * as Clipboard from 'expo-clipboard';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { backUpCharacterSlot } from '../app/ui/backupCharacter';
import { decodeSaveExport } from '../app/engine/saveExport';

jest.setTimeout(120000);

describe('OTA-1231 — the shared backup routine', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('backs up a real persisted slot: ok, and the clipboard text decodes back', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Keeper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await store.getState().persist();
    const slotId = store.getState().activeSlotId!;
    expect(slotId).toBeTruthy();

    const result = await backUpCharacterSlot({ slotId, playerName: 'Keeper' });
    expect(result).toBe('ok');
    const setString = (Clipboard.setStringAsync as jest.Mock);
    expect(setString).toHaveBeenCalled();
    const text = setString.mock.calls[setString.mock.calls.length - 1]![0] as string;
    // The payload is a REAL restorable backup, not just a blob that shipped.
    const decoded = decodeSaveExport(text);
    expect(decoded.ok).toBe(true);
  });

  it('an unreadable slot reports unreadable — never a silent ok', async () => {
    expect(await backUpCharacterSlot({ slotId: 'slot_does_not_exist', playerName: 'Ghost' })).toBe('unreadable');
  });
});

describe('OTA-1231 — both doors exist and share the one routine', () => {
  // ⚠ Source pins, silent-no-op class all three: a backup door that quietly
  // vanished ships as "the game looks cleaner" with green tests behind it.
  const title = readFileSync(join(__dirname, '..', 'app', 'screens', 'TitleScreen.tsx'), 'utf8');
  const about = readFileSync(join(__dirname, '..', 'app', 'screens', 'AboutScreen.tsx'), 'utf8');

  it('title rows: the BACK UP block is gated on item.dead — and still present', () => {
    const at = title.indexOf("accessibilityLabel={`Back up ${item.playerName}`}");
    expect(at).toBeGreaterThan(-1);
    // The gate sits within the preceding block — the button renders only for the dead.
    expect(title.slice(Math.max(0, at - 900), at)).toContain('{item.dead && (');
  });

  it('settings RUN card: BACK UP CHARACTER exists and SAVES FIRST', () => {
    expect(about).toContain('BACK UP CHARACTER');
    const fn = about.slice(about.indexOf('const handleBackUp'), about.indexOf('async function handleCopyLog'));
    // persist() must be awaited BEFORE the share — a stale backup silently
    // loses the session the player is standing in (the OTA-1201 wound anew).
    expect(fn.indexOf('await persist()')).toBeGreaterThan(-1);
    expect(fn.indexOf('await persist()')).toBeLessThan(fn.indexOf('backUpCharacterSlot('));
  });

  it('both screens call the ONE shared routine', () => {
    expect(title).toContain("require('../ui/backupCharacter')");
    expect(about).toContain("require('../ui/backupCharacter')");
  });
});
