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

/**
 * OTA-1695 — THE TAP HAS A CLOCK. Owner: "I hit Dodge and it hangs for 4 or 5
 * seconds before it lets me touch anything else … you don't see those button
 * presses and the lags between inputs." `ui: tap` is stamped when the JS
 * thread RUNS the handler, not when the finger landed. The OS stamps every
 * touch on the monotonic clock (nativeEvent.timestamp); performance.now() is
 * the same clock; the difference at the DOWN event is how long the touch
 * waited for the app. It rides the tap line, flagged past the session floor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { useGameStore, logUiTap } from '../app/state/gameStore';
import {
  touchLateMs, noteTouchDown, takeTouchLateSuffix, tapLateSuffix, resetTapClock,
  TAP_LATE_FLAG_MS, TOUCH_FRESH_MS,
} from '../app/diagnostics/tapClock';

jest.setTimeout(120000);

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

describe('OTA-1695 — the arithmetic', () => {
  beforeEach(() => resetTapClock());

  it('the wait is JS-now minus the native stamp, floored at zero, rounded; an unshared base is null', () => {
    expect(touchLateMs(1000, 1037)).toBe(37);
    expect(touchLateMs(1000, 5237.4)).toBe(4237);
    expect(touchLateMs(1000, 999)).toBe(0); // a millisecond of jitter is not a negative wait
    expect(touchLateMs(1000, 800)).toBeNull(); // -200: the clocks do not share a base
    expect(touchLateMs(1000, 1000 + 600_001)).toBeNull(); // ten minutes: not a wait, a different clock
    expect(touchLateMs(undefined, 1000)).toBeNull();
    expect(touchLateMs('12', 1000)).toBeNull();
    expect(touchLateMs(NaN, 1000)).toBeNull();
    expect(touchLateMs(1000, NaN)).toBeNull();
  });

  it('the suffix names the wait, and calls it late only past the session floor by the flag', () => {
    expect(tapLateSuffix(37, 20)).toBe(' ⏱+37ms');
    expect(tapLateSuffix(269, 20)).toBe(' ⏱+269ms'); // 249 over: not yet
    expect(tapLateSuffix(270, 20)).toBe(' ⏱+270ms late 250ms');
    expect(tapLateSuffix(4237, 37)).toBe(' ⏱+4237ms late 4200ms');
    // No floor yet (first touch of the process): the number prints, nothing is flagged.
    expect(tapLateSuffix(4237, Number.POSITIVE_INFINITY)).toBe(' ⏱+4237ms');
    expect(TAP_LATE_FLAG_MS).toBe(250);
    expect(TOUCH_FRESH_MS).toBe(3000);
  });

  it('a noted touch is consumed by the next tap line, once; a stale or missing one leaves the line bare', () => {
    const now = performance.now();
    noteTouchDown({ nativeEvent: { timestamp: now - 40 } });
    expect(takeTouchLateSuffix()).toMatch(/^ ⏱\+\d+ms$/);
    expect(takeTouchLateSuffix()).toBe(''); // consumed
    // The floor is the smallest wait so far; a five-second wait after it is flagged.
    noteTouchDown({ nativeEvent: { timestamp: performance.now() - 5000 } });
    const s = takeTouchLateSuffix();
    expect(s.startsWith(' ⏱+')).toBe(true);
    expect(/ late \d+ms$/.test(s)).toBe(true);
    // A touch older than TOUCH_FRESH_MS is not this tap's touch.
    noteTouchDown({ nativeEvent: { timestamp: performance.now() } });
    expect(takeTouchLateSuffix(Date.now() + TOUCH_FRESH_MS + 1)).toBe('');
    // Garbage events never throw and never leave a number behind.
    noteTouchDown(undefined);
    noteTouchDown({ nativeEvent: {} });
    noteTouchDown({ nativeEvent: { timestamp: 'soon' } });
    expect(takeTouchLateSuffix()).toBe('');
  });
});

describe('OTA-1695 — the wiring', () => {
  it('both chip families and ROLL note the DOWN event; logUiTap keeps its pinned call shape and rides the suffix', () => {
    const input = src('app', 'components', 'InputBox.tsx');
    expect(input.split('onPressIn={noteTouchDown}').length - 1).toBe(2);
    expect(input.split('logUiTap(label);').length - 1).toBe(2); // OTA-1172's two, untouched
    const dice = src('app', 'components', 'DiceRoller.tsx');
    expect(dice.includes('onPressIn={noteTouchDown} onPress={handleRoll}')).toBe(true);
    // The ledger line comes right after the OTA-1694 stamp and before any work.
    expect(dice.includes("tappedAt.current = Date.now(); // OTA-1694 — before any work, like logUiTap\n    logUiTap('roll');")).toBe(true);
    const store = src('app', 'state', 'gameStore.ts');
    expect(store.includes('export function logUiTap(label: string): void {')).toBe(true);
    expect(store.includes('appendLog(\'debug\', `ui: tap "${label}"${takeTouchLateSuffix()}`)')).toBe(true);
    // The unbatched breadcrumb keeps its exact shape (OTA-1276 reads it at boot).
    expect(store.includes('what: `tap "${label}"`')).toBe(true);
    expect(store.split('\n').length).toBeLessThan(37000);
  });
});

describe('OTA-1695 — the line in the log', () => {
  const get = () => useGameStore.getState();

  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await get().hydrate();
    await get().startNewGame({ name: 'Clock', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    get().skipTutorial?.();
    resetTapClock();
  });

  it('a prompt touch prints its wait; a five-second wait is flagged late; a tap with no touch noted stays exactly the OTA-1172 line', () => {
    noteTouchDown({ nativeEvent: { timestamp: performance.now() - 30 } });
    logUiTap('dodge');
    noteTouchDown({ nativeEvent: { timestamp: performance.now() - 5000 } });
    logUiTap('approach');
    logUiTap('dodge');
    const tail = get().gameLog.slice(-8).filter((e) => e.text.startsWith('ui: tap')).map((e) => e.text);
    expect(tail.length).toBe(3);
    expect(/^ui: tap "dodge" ⏱\+\d+ms$/.test(tail[0]!)).toBe(true);
    expect(/^ui: tap "approach" ⏱\+\d+ms late \d+ms$/.test(tail[1]!)).toBe(true);
    expect(tail[2]).toBe('ui: tap "dodge"');
  });
});
