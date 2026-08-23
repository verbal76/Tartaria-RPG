/* eslint-disable @typescript-eslint/no-explicit-any */
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
/**
 * OTA-1444 — THE RECORD IS COMPLETED FOR EVERY VETERAN.
 *
 * Owner: *"I want all of the save files that were done before this OTA to be
 * fixed ... let's do a one-time follow-up ... soon as they open their
 * character ... make it sound lore-wise ... I don't want any character no
 * matter where they are in their journey — whether they haven't touched it in
 * 2 months or they played yesterday — to [not] be able to see all of the new
 * character build portraits."*
 *
 * What was actually missing, measured: race and faction have been REQUIRED at
 * creation since day one; the motive is asked of veterans by the OTA-1022
 * one-time picker on load. Sex (OTA-1439) is the ONLY field a pre-pick save
 * cannot show. So the ask is one question, on the character sheet — the exact
 * screen where the incomplete banner would be seen — in the Arbiter's voice,
 * mirroring the OTA-1022 pattern the owner cited.
 */
import { useGameStore } from '../app/state/gameStore';
import type { PlayerCharacter } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const MODAL = read('app', 'components', 'SexPickerModal.tsx');
const SHEET = read('app', 'screens', 'CharacterScreen.tsx');

const veteran = () => ({
  name: 'Great Scott', raceId: 'reclaimer', factionId: 'reclaimers_guild',
  tc: 100, hp: 20, maxHp: 20, inventory: [],
} as unknown as PlayerCharacter);

describe('OTA-1444 — the commit: write-once, junk-proof', () => {
  beforeEach(() => {
    useGameStore.setState({ player: veteran() });
  });

  it('⚠⚠ a veteran save gains the sign — and it persists on the record', () => {
    useGameStore.getState().confirmSexPick('female');
    expect(useGameStore.getState().player?.sex).toBe('female');
  });

  it('⚠⚠ WRITE-ONCE — a recorded answer is never flipped from this path', () => {
    // The creation screen enforces its answer with a dead NEXT; this path
    // enforces it by refusing a second write. "Asked once, kept forever."
    useGameStore.getState().confirmSexPick('male');
    useGameStore.getState().confirmSexPick('female');
    expect(useGameStore.getState().player?.sex).toBe('male');
  });

  it('⚠ a character created WITH the pick is untouched by this action', () => {
    useGameStore.setState({ player: { ...veteran(), sex: 'female' } as PlayerCharacter });
    useGameStore.getState().confirmSexPick('male');
    expect(useGameStore.getState().player?.sex).toBe('female');
  });

  it('⚠ junk values and no-player are refused without a crash', () => {
    useGameStore.getState().confirmSexPick('attack helicopter' as never);
    expect(useGameStore.getState().player?.sex).toBeUndefined();
    useGameStore.setState({ player: null });
    expect(() => useGameStore.getState().confirmSexPick('male')).not.toThrow();
  });

  it('⚠ the Arbiter acknowledges in the feed — the game says what it did', () => {
    useGameStore.getState().confirmSexPick('male');
    const log = useGameStore.getState().gameLog;
    expect(log.some((l) => l.text.includes('So marked. The record keeps you whole'))).toBe(true);
  });
});

describe('OTA-1444 — the ask itself', () => {
  it('⚠⚠ it lives on the CHARACTER SHEET — where the gap would show', () => {
    expect(SHEET).toContain("import { SexPickerModal } from '../components/SexPickerModal';");
    expect(SHEET).toContain('<SexPickerModal />');
  });

  it('⚠⚠ the data is the flag: recorded sex (or no player) renders nothing', () => {
    expect(MODAL).toContain('if (!player || player.sex || dismissed) return null;');
  });

  it('⚠⚠ NOTHING is preselected and CONFIRM is dead until a sign is chosen', () => {
    // The mud could deal a motive; it must not deal a sex — a preselected
    // answer would be wrong half the time by construction.
    expect(MODAL).toContain("useState<'male' | 'female' | null>(null)");
    expect(MODAL).toContain('disabled={!selected}');
    expect(MODAL).toContain('{ if (selected) confirm(selected); }');
  });

  it('⚠ backing out postpones rather than answers — the ask returns while the datum is missing', () => {
    // Unlike OTA-1022 (back = keep the guess) there is no guess to keep, so
    // Android back dismisses for this visit only; the missing field raises the
    // modal again next time the sheet opens.
    expect(MODAL).toContain('onRequestClose={() => setDismissed(true)}');
    expect(MODAL).not.toContain('confirmMotivePick');
  });

  it('⚠ the ask speaks in the Arbiter\'s voice, sir-or-miss included', () => {
    expect(MODAL).toContain('The Arbiter turns back to an old page.');
    expect(MODAL).toContain('is it sir, or miss?');
    expect(MODAL).toContain('MALE OR FEMALE?');
  });
});
