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



// ⚠⚠ OTA-1324 — THE CRUCIBLE CHIP OBEYS THE GATE ITS OWN HANDLER ENFORCES.
//
// Owner's device log (4.29.186, roadside stall, mid-first-journey): he tapped the
// vendor's Fusing Crucible FOUR times in seventy seconds and got the same wall
// every time — *"The Crucible's not for first-timers. Leave the outpost and see
// something of the world first."*
//
// `useVendorCrucible` refuses while `macroVisitSeq < 1`, and that is correct. The
// defect is that the check lived ONLY inside the handler: the chip rendered lit,
// accepted the tap, and answered with a refusal. The requirement is known at
// RENDER time, so it is now consulted at render time.
//
// ⚠ This is the same shape as OTA-1024 — whose comment sits twelve lines below the
// fix — where the owner spent down to 11 TC, tapped, and learned about the fee from
// a buried system line. He called it "a lit button that doesn't fire." Same defect,
// different gate.
//
// ⚠ THE HANDLER'S REFUSAL STAYS. Hiding a control is not the same as securing it,
// and there are other doors into the crucible; the refusal is the backstop.
// ⚠ OTA-1399 — SLICE 8 sent vendor / inventory / crafting into
// `app/state/slices/`. Re-pointed via `storeSource()`, which reads gameStore AND
// every slice — that is what a pin on THE STORE has meant since slice 4, and this
// is the case the helper was built for: a slice IS the store, same object, same
// keys, same 473 importers. (Slices 5-7 moved code DOWN to leaves instead, which
// storeSource deliberately does NOT see; those suites name their leaf directly.)
import { storeSource } from '../test-utils/storeSource';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', 'app', ...p), 'utf8');
const VENDOR = read('screens', 'VendorScreen.tsx');
const STORE = storeSource();
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe('OTA-1324 — the chip consults the gate before it lights', () => {
  it('⚠⚠ the render gate exists and reads the SAME field the handler refuses on', () => {
    expect(codeOnly(VENDOR)).toContain("{(player?.macroVisitSeq ?? 0) >= 1");
    // The handler's own gate, unchanged — one rule, read in two places is fine;
    // read in ONE place and enforced in the other is the bug.
    expect(STORE).toContain("if ((player.macroVisitSeq ?? 0) < 1) {");
  });

  it('⚠⚠ THE REFUSAL IS STILL THERE — hiding a control is not securing it', () => {
    expect(STORE).toContain("The Crucible's not for first-timers");
  });

  it('⚠ the location-Crucible de-duplication is untouched', () => {
    // arb153: the chip must still stand down where the LOCATION already offers one,
    // or a returning player sees two crucibles on the same screen.
    const code = codeOnly(VENDOR);
    expect(code).toContain('player?.fusionPending');
    expect(code).toContain("activeBuildingId === 'market'");
    expect(code).toContain('(player?.hubRoomId && (player?.macroVisitSeq ?? 0) >= 1)');
  });

  it('⚠ the exploration-screen chip already gated on the same journey count', () => {
    // It always did — which is why the vendor copy was the odd one out.
    expect(read('screens', 'ExplorationScreen.tsx'))
      .toContain('(player.hubRoomId && (player.macroVisitSeq ?? 0) >= 1)');
  });
});
