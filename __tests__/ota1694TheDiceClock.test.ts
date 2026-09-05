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
 * OTA-1694 — THE DICE CLOCK. Owner: "I am talking specifically about lag
 * during combat." The 09-05 log put attack→dice at a 5.4s median and could not
 * say where the seconds went — the roll modal had no clock. Four moments per
 * step: the store OPENS it (pendingRolls.openedAt), the modal SHOWS it, the
 * player TAPS ROLL, the hold SETTLES into resolveRollStep. One debug line per
 * step names the three gaps; a hold that fires 100ms+ past 800 is called late.
 */
import fs from 'node:fs';
import path from 'node:path';
import { useGameStore } from '../app/state/gameStore';
import { rollTimingLine, AUTO_RESOLVE_HOLD_MS, HOLD_LATE_MS } from '../app/diagnostics/rollTiming';
import type { RollStep } from '../app/engine/types';
import { beginnersLuck } from '../app/engine/combatRules';

jest.setTimeout(120000);

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

describe('OTA-1694 — the line', () => {
  it('names the three gaps and the total; a hold on time is not called late', () => {
    const opened = 10_000;
    expect(rollTimingLine('attack', opened, { shownAt: 10_012, tappedAt: 13_412 }, 14_232)).toBe(
      'dice⏱ attack: shown +12ms, tapped +3400ms, settled +820ms = 4232ms',
    );
    // Exactly the hold: silent about lateness. 99ms over: still silent.
    expect(rollTimingLine('damage', opened, { shownAt: 10_005, tappedAt: 10_905 }, 11_705)).toBe(
      'dice⏱ damage: shown +5ms, tapped +900ms, settled +800ms = 1705ms',
    );
    expect(rollTimingLine('damage', opened, { shownAt: 10_005, tappedAt: 10_905 }, 11_804)!.includes('hold late')).toBe(false);
  });

  it('a hold that fires 100ms+ past the constant is called late by the excess — the starved-thread signal', () => {
    expect(rollTimingLine('damage', 10_000, { shownAt: 10_005, tappedAt: 10_905 }, 13_005)).toBe(
      'dice⏱ damage: shown +5ms, tapped +900ms, settled +2100ms (hold late 1300ms) = 3005ms',
    );
    expect(rollTimingLine('attack', 10_000, { shownAt: 10_000, tappedAt: 10_100 }, 10_100 + AUTO_RESOLVE_HOLD_MS + HOLD_LATE_MS)!.includes('(hold late 100ms)')).toBe(true);
    expect(AUTO_RESOLVE_HOLD_MS).toBe(800);
    expect(HOLD_LATE_MS).toBe(100);
  });

  it('never invents a number: no open, no timing, or no tap → null; a stale shown stamp → "shown ?" and the tap measured from the open', () => {
    expect(rollTimingLine('attack', undefined, { shownAt: 1, tappedAt: 2 }, 3)).toBeNull();
    expect(rollTimingLine('attack', 10_000, undefined, 12_000)).toBeNull();
    expect(rollTimingLine('attack', 10_000, { shownAt: 10_001, tappedAt: 0 }, 12_000)).toBeNull();
    // The commit effect did not run for this step: the ref still holds the last step's stamp.
    expect(rollTimingLine('damage', 10_000, { shownAt: 9_000, tappedAt: 11_000 }, 11_820)).toBe(
      'dice⏱ damage: shown ?, tapped +1000ms, settled +820ms = 1820ms',
    );
    // Clock noise never prints a negative.
    expect(rollTimingLine('attack', 10_000, { shownAt: 10_000, tappedAt: 10_000 }, 9_990)!.includes('-')).toBe(false);
  });
});

describe('OTA-1694 — the wiring', () => {
  it('the modal stamps the commit and the tap and hands both to onRoll; the hold constant has one home', () => {
    const dice = src('app', 'components', 'DiceRoller.tsx');
    expect(dice.includes("import { AUTO_RESOLVE_HOLD_MS, type RollTapTiming } from '../diagnostics/rollTiming';")).toBe(true);
    expect(dice.includes('const AUTO_RESOLVE_HOLD_MS = 800;')).toBe(false);
    expect(dice.includes('useEffect(() => { shownAt.current = Date.now(); }, [state.currentStep, state.openedAt]);')).toBe(true);
    // The tap stamp is the first statement of the handler — before the animation, like logUiTap.
    expect(dice.includes('function handleRoll() {\n    tappedAt.current = Date.now();')).toBe(true);
    expect(dice.includes('const timing: RollTapTiming = { shownAt: shownAt.current, tappedAt: tappedAt.current };')).toBe(true);
    expect(dice.includes('onRoll([kept], timing);')).toBe(true);
    expect(dice.includes('onRoll(rolledValues, timing);')).toBe(true);
    expect(dice.includes('}, AUTO_RESOLVE_HOLD_MS);')).toBe(true);
    // The screen still hands the store's resolver straight to the modal.
    expect(src('app', 'screens', 'ExplorationScreen.tsx').includes('onRoll={resolveRollStep}')).toBe(true);
  });

  it('every door that opens the modal stamps openedAt, the advance re-stamps it, and the resolver prints the line before any arithmetic', () => {
    const store = src('app', 'state', 'gameStore.ts');
    // Four creation sites + the step advance.
    expect(store.split('currentStep: 0, openedAt: Date.now()').length - 1).toBe(4);
    expect(store.includes('currentStep: nextIdx, openedAt: Date.now() }')).toBe(true);
    // No creation site without the stamp.
    expect(/pendingRolls: \{ actionText: trimmed, steps, currentStep: 0(?!, openedAt)/.test(store)).toBe(false);
    expect(store.includes('resolveRollStep(values: number[], timing?: RollTapTiming) {')).toBe(true);
    expect(store.includes("{ const tl = rollTimingLine(step.id, state.openedAt, timing); if (tl) get().appendLog('debug', tl); }")).toBe(true);
    const at = store.indexOf('const tl = rollTimingLine(');
    const math = store.indexOf('let total = values.reduce((a, b) => a + b, 0) + step.bonus;');
    expect(at).toBeGreaterThan(-1);
    expect(math).toBeGreaterThan(at);
    expect(src('app', 'engine', 'types.ts').includes('openedAt?: number;')).toBe(true);
    expect(store.split('\n').length).toBeLessThan(37000);
  });

  it("Beginner's Luck left the store whole: the extracted helper rerolls a failed targeted throw for a token-holder only, and the store burns the token", () => {
    const d1: RollStep = { id: 'skill', label: 'x', sides: 1, count: 1, bonus: 0, bonusLabel: '', target: 1, context: 'x' };
    const holder = { raceId: 'unknowing_mass', luckyRerollReady: true } as const;
    // A failed throw (0 vs DC 1) on a one-sided die rerolls to 1: pulls it off.
    expect(beginnersLuck(d1, [0], 0, false, holder)).toEqual({
      values: [1], total: 1, success: true,
      line: "✦ Beginner's Luck — you throw again and pull it off (1 vs DC 1).",
    });
    // Still short: the reroll cannot beat DC 2 on a d1 — the better total is kept, the line says so.
    expect(beginnersLuck({ ...d1, target: 2 }, [1], 1, false, holder)!.line).toBe("✦ Beginner's Luck — you throw again and still come up short (1 vs DC 2).");
    // Not a failure, no target, no token, wrong race, no player: nothing.
    expect(beginnersLuck(d1, [1], 1, true, holder)).toBeNull();
    expect(beginnersLuck({ ...d1, target: undefined }, [0], 0, undefined, holder)).toBeNull();
    expect(beginnersLuck(d1, [0], 0, false, { raceId: 'unknowing_mass', luckyRerollReady: false })).toBeNull();
    expect(beginnersLuck(d1, [0], 0, false, { raceId: 'human', luckyRerollReady: true })).toBeNull();
    expect(beginnersLuck(d1, [0], 0, false, null)).toBeNull();
    const store = src('app', 'state', 'gameStore.ts');
    expect(store.includes('const luck = beginnersLuck(step, values, total, success, get().player);')).toBe(true);
    expect(store.includes('({ values, total, success } = luck);')).toBe(true);
    expect(store.includes('set((s) => s.player ? { player: { ...s.player, luckyRerollReady: false } } : s);')).toBe(true);
    expect(store.includes("get().appendLog('reward', luck.line)")).toBe(true);
  });
});

describe('OTA-1694 — the store prints it', () => {
  const store = useGameStore;
  const get = () => store.getState();

  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await get().hydrate();
    await get().startNewGame({ name: 'Clock', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    get().skipTutorial?.();
    // The roll's OUTCOME is not under test; the clock is. Stub the conclusion
    // so a hand-built step does not have to be a real swing.
    store.setState({ concludeRolls: () => {} } as never);
  });

  const attack: RollStep = { id: 'attack', label: 'Attack', sides: 20, count: 1, bonus: 2, bonusLabel: '+2', target: 12, targetLabel: 'AC 12', context: 'test' };
  const damage: RollStep = { id: 'damage', label: 'Damage', sides: 6, count: 1, bonus: 0, bonusLabel: '', context: 'test' };

  it('one debug line per step, each step measured from its own open; an untimed call prints nothing', async () => {
    const opened = Date.now() - 3000;
    store.setState({ pendingRolls: { actionText: 'attack', steps: [attack, damage], currentStep: 0, openedAt: opened } });
    const mark = get().gameLog.length;
    get().resolveRollStep([15], { shownAt: opened + 20, tappedAt: opened + 2000 });
    const first = get().gameLog.slice(mark).find((e) => e.text.startsWith('dice⏱ attack:'));
    expect(first?.channel).toBe('debug');
    expect(first!.text.includes('shown +20ms, tapped +1980ms, settled +')).toBe(true);
    expect(first!.text.includes('(hold late ')).toBe(true); // 3000 - 2000 = ~1000ms "hold" → 200ms late
    // The advance re-stamped the open for the damage step.
    const pr = get().pendingRolls!;
    expect(pr.currentStep).toBe(1);
    expect(pr.openedAt).toBeGreaterThan(opened);
    const mark2 = get().gameLog.length;
    const o2 = pr.openedAt!;
    get().resolveRollStep([4], { shownAt: o2, tappedAt: Date.now() });
    const second = get().gameLog.slice(mark2).find((e) => e.text.startsWith('dice⏱ damage:'));
    expect(second).toBeTruthy();
    expect(second!.text.includes('(hold late ')).toBe(false);
    expect(get().pendingRolls).toBeNull();
    // An internal caller with no modal stamps prints no clock.
    store.setState({ pendingRolls: { actionText: 'attack', steps: [attack], currentStep: 0, openedAt: Date.now() } });
    const mark3 = get().gameLog.length;
    get().resolveRollStep([15]);
    expect(get().gameLog.slice(mark3).some((e) => e.text.startsWith('dice⏱'))).toBe(false);
  });
});
