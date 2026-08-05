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
// OTA-1122 — THE BANK. Step two of the LLM headroom track.
//
// The economics of an ambient musing were upside down. It is generated ON
// DEMAND, takes 8-16 seconds, and is then checked against the world it was
// composed for. The OTA-1107 telemetry says two of three came back unusable —
// ~16.6 seconds of model time for lines nobody read — and the single biggest
// killer is `stale`: the player kept playing while the model wrote, so by the
// time the line existed it no longer belonged to the moment.
//
// That is a race we were never going to win by generating faster.
//
// So stop racing. A musing is UNPROMPTED by construction — AMBIENT_INSTRUCTION
// forbids it from reacting to the last action — which is exactly the property
// that makes it pre-generatable. Write them when the world is standing still
// (rest), spend them when it isn't.
//
// ⚠ AND A STALE LINE IS NOT A WASTED LINE. `stale` almost always means "you
// walked somewhere else", and the line is still perfectly good FOR THE PLACE IT
// WAS WRITTEN ABOUT. Banked against its own stamp, walking back into that room
// spends it instantly instead of paying for it twice. The discard that was the
// headline waste becomes the stock.
//
// Validity is `ambientStaleReason` UNCHANGED — the same five checks the live
// path already ran, asked at SPEND time instead of at finish time. That is the
// whole trick: a banked line cannot go stale between being wanted and being
// spoken, because there is no gap.

jest.setTimeout(60_000);

import {
  useGameStore,
  _resetMusingBank,
  _musingBankSize,
  _bankMusingForTest,
  _takeBankedMusingForTest,
  _takeAmbientStampForTest,
  _MUSING_BANK_CAP,
  _AMBIENT_STALE_LINES,
} from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SRC: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');

const store = useGameStore;

async function boot(name: string) {
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id,
  });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  _resetMusingBank();
  return store;
}

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
beforeEach(() => _resetMusingBank());

describe('OTA-1122 — a banked musing is spent when it still fits', () => {
  it('⚠ a line banked in this moment comes straight back out', async () => {
    await boot('Bank');
    _bankMusingForTest('The road behind you is longer than the one ahead.', _takeAmbientStampForTest());
    expect(_musingBankSize()).toBe(1);
    expect(_takeBankedMusingForTest()).toBe('The road behind you is longer than the one ahead.');
    // Spent, not copied — a musing is said once.
    expect(_musingBankSize()).toBe(0);
  });

  it('⚠ a line whose world has moved on is NOT spent, and stays banked', async () => {
    await boot('Bank');
    const stamp = _takeAmbientStampForTest();
    _bankMusingForTest('You carry more than you did.', stamp);
    // Push the player-visible log past the staleness window.
    for (let i = 0; i <= _AMBIENT_STALE_LINES; i++) store.getState().appendLog('reward', `✦ later ${i}`);
    expect(_takeBankedMusingForTest()).toBeNull();
    // ...and it is KEPT. This is the whole point: it may fit again later.
    expect(_musingBankSize()).toBe(1);
  });

  it('a fight is the loudest change of subject — nothing is spent into one', async () => {
    await boot('Bank');
    _bankMusingForTest('Quiet suits you better than you admit.', _takeAmbientStampForTest());
    const sc = store.getState().currentScene!;
    store.setState({ currentScene: { ...sc,
      enemies: [{ name: 'Bog Hound', hp: 10, hpMax: 10, ac: 10, attack: 40, damage: '1d4',
        traits: [], loot: [], rarity: 'Common' } as never],
      enemyHps: [10], activeEnemyIdx: 0, range: 'close' } });
    expect(_takeBankedMusingForTest()).toBeNull();
    expect(_musingBankSize()).toBe(1);
  });

  it('⚠ a line the Arbiter has effectively just said is not spent twice', async () => {
    await boot('Bank');
    const line = 'You have come a long way from the mud you started in.';
    store.getState().appendLog('arbiter', line);
    _bankMusingForTest(line, _takeAmbientStampForTest());
    expect(_takeBankedMusingForTest()).toBeNull();
  });

  it('the first VALID entry is spent, not simply the first entry', async () => {
    await boot('Bank');
    const staleStamp = _takeAmbientStampForTest();
    _bankMusingForTest('A musing about somewhere else.', staleStamp);
    for (let i = 0; i <= _AMBIENT_STALE_LINES; i++) store.getState().appendLog('reward', `✦ move ${i}`);
    // Banked AFTER the log moved, so this one still fits the moment.
    _bankMusingForTest('A musing about right here.', _takeAmbientStampForTest());
    expect(_takeBankedMusingForTest()).toBe('A musing about right here.');
    expect(_musingBankSize()).toBe(1);
  });
});

describe('OTA-1122 — the bank stays small and honest', () => {
  it('⚠ it is capped — every entry is a generation someone\'s battery paid for', async () => {
    await boot('Bank');
    const stamp = _takeAmbientStampForTest();
    for (let i = 0; i < _MUSING_BANK_CAP + 3; i++) _bankMusingForTest(`musing ${i}`, stamp);
    expect(_musingBankSize()).toBe(_MUSING_BANK_CAP);
  });

  it('the OLDEST is evicted — a musing written six rooms ago fits least', async () => {
    await boot('Bank');
    const stamp = _takeAmbientStampForTest();
    for (let i = 0; i < _MUSING_BANK_CAP + 1; i++) _bankMusingForTest(`musing ${i}`, stamp);
    // 'musing 0' was pushed out; the next spend is 'musing 1'.
    expect(_takeBankedMusingForTest()).toBe('musing 1');
  });

  it('the same line cannot be banked twice', async () => {
    await boot('Bank');
    const stamp = _takeAmbientStampForTest();
    _bankMusingForTest('One thought, once.', stamp);
    _bankMusingForTest('One thought, once.', stamp);
    expect(_musingBankSize()).toBe(1);
  });

  it('an empty line is never banked', async () => {
    await boot('Bank');
    _bankMusingForTest('', _takeAmbientStampForTest());
    expect(_musingBankSize()).toBe(0);
  });
});

describe('OTA-1122 — the wiring, and the rules it must not break', () => {
  it('⚠ the spend sits ABOVE the model-readiness and cooldown gates', () => {
    // A banked line costs zero model time, so it must work while Qwen is
    // reloading and must not be rationed by a cooldown that exists to ration
    // GENERATIONS. Positional, because both lines existed already.
    const fn = SRC.slice(SRC.indexOf('async function maybeGenerateAmbientArbiter('));
    const spend = fn.indexOf('const banked = takeBankedMusing(get);');
    const ready = fn.indexOf('if (!qwen.isReady() || get().isGenerating) return;');
    const cooldown = fn.indexOf('AMBIENT_GEN_COOLDOWN_MS) return;');
    expect(spend).toBeGreaterThan(-1);
    expect(spend).toBeLessThan(ready);
    expect(spend).toBeLessThan(cooldown);
  });

  it('⚠ but BELOW the combat and tutorial muzzles', () => {
    // Those are about whether a musing is WANTED at all, and a free line is
    // still the wrong line mid-fight.
    const fn = SRC.slice(SRC.indexOf('async function maybeGenerateAmbientArbiter('));
    expect(fn.indexOf('scene.enemies.length > 0) return;'))
      .toBeLessThan(fn.indexOf('const banked = takeBankedMusing(get);'));
    expect(fn.indexOf('if (inScriptedTutorialPhase(get)) return;'))
      .toBeLessThan(fn.indexOf('const banked = takeBankedMusing(get);'));
  });

  it('a stale generation is banked rather than binned', () => {
    expect(SRC).toContain('if (staleReason && finalText) bankMusing(finalText, stamp);');
  });

  it('⚠ a banked line is deferred work, not WASTED work', () => {
    // qwenWasteTotals decides whether a job is worth keeping at all. Counting a
    // generation the player is still going to hear would make the bank look
    // like the problem it was built to solve.
    expect(SRC).toContain("if (!ambientUsable && !(staleReason && finalText)) noteQwenDiscarded(`ambient:${ambientMark}`);");
  });

  it('⚠ rest fills the bank, AFTER the rest resolves and BEFORE the ambush', () => {
    // After, so a slow generation never delays recovery. Before the ambush
    // spawn, so a fight simply leaves the bank untouched rather than poisoning
    // it with lines stamped mid-combat.
    const i = SRC.indexOf('void fillMusingBank(get, set);');
    expect(i).toBeGreaterThan(-1);
    expect(SRC.lastIndexOf('healEscortsOnRest(get, set);', i)).toBeLessThan(i);
    expect(SRC.indexOf('if (restAmbush) {', i)).toBeGreaterThan(i);
  });

  it('the filler reuses the live vetting path rather than copying it', () => {
    // Five OTAs of register / echo / off-canon work live in those filters. A
    // second copy would drift, and the drift would be invisible.
    expect(SRC).toContain("await maybeGenerateAmbientArbiter(get, set, { bankOnly: true });");
    expect(SRC).toContain('if (musingBank.length >= MUSING_BANK_CAP) return;');
  });

  it('the fill path never speaks', () => {
    // Sliced to the block's OWN end, not to a magic character count. A length
    // window overruns the moment anyone edits inside it, and then this reads
    // the live speaking path below and fails for a reason that isn't real.
    const start = SRC.indexOf('if (opts?.bankOnly) {');
    const end = SRC.indexOf('const staleReason = ambientStaleReason(get, stamp);', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = SRC.slice(start, end);
    expect(block).toContain('bankMusing(finalText, stamp)');
    expect(block).not.toContain("appendLog('arbiter'");
    // ...and it RETURNS rather than falling through into that path.
    expect(block).toContain('return;');
  });
});
