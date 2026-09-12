// OTA-1485 — THE CHIP JOINS THE TAP LEDGER.
//
// ⚠⚠ Owner: *"so when I pick a newly highlighted item from the text roll you
// have nothing in place to track that?"* He was right. Since OTA-1276 every
// control in the input row logs `ui: tap "<label>"` AND stamps a crash-proof
// breadcrumb BEFORE any work runs — that ordering is what tells a frozen
// screen from a frozen engine. The feed's trailing take-&-wear chip (OTA-1457)
// is the ONLY pressable in the text roll, and its handler went straight into
// `takeAndWear` — no tap line, no breadcrumb. Two of his reports (taps that
// did nothing, a take-and-wear landing on the wrong slot) were unanswerable
// from the log for exactly this reason: the evidence was never written.
//
// Two fixes, both diagnostic-only (the `debug` channel is feed-hidden):
//   1. The chip's onPress calls `logUiTap(<the chip's own label>)` FIRST.
//   2. `takeAndWear` logs which slot the equip resolves to — or that the take
//      did not land and the equip was skipped — so the wrong-slot report is
//      answerable from the next log.

import * as fs from 'fs';
import * as path from 'path';
import { between, blockAt } from '../test-utils/srcBlock';

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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const EXPL = read('app', 'screens', 'ExplorationScreen.tsx');
const FEED = read('app', 'components', 'AdventureFeed.tsx');

describe('OTA-1485 — the tap is logged before the work', () => {
  it('⚠⚠ the chip handler calls logUiTap FIRST, with the chip\'s own label', () => {
    // between() requires order: the span runs from the closure's opening to the
    // takeAndWear call, so a logUiTap found inside it provably fires BEFORE the
    // work — the OTA-1276 ordering rule, now holding on the feed's one chip.
    const span = between(
      EXPL,
      'onActionChipPress={feedChip ? () => {',
      'takeAndWear(feedChip.noun);',
    );
    expect(span).toContain('logUiTap(feedActionChipLabel(feedChip));');
  });

  it('⚠ the label logged is the label RENDERED — one derivation, not a twin string', () => {
    // The tap line must name what the player actually saw. A hand-written
    // "feed chip" twin label would drift from the button face the first time
    // the wording moved; deriving both from feedActionChipLabel cannot.
    expect(EXPL).not.toMatch(/logUiTap\(\s*['"`]/);
    expect(EXPL).toContain('actionChipLabel={feedChip ? feedActionChipLabel(feedChip) : null}');
  });

  it('⚠⚠ logUiTap is imported from the store — not a local lookalike', () => {
    expect(EXPL).toMatch(/import \{[^}]*\blogUiTap\b[^}]*\} from '\.\.\/state\/gameStore';/);
  });
});

describe('OTA-1485 — takeAndWear says what the equip half did', () => {
  const body = blockAt(EXPL, '(noun: string) => {', {
    from: EXPL.indexOf('const takeAndWear'),
    mode: 'opener',
  });

  it('⚠⚠ the equip branch names the ITEM and the SLOT it resolved to', () => {
    // "take and wear put it on my hand" is only diagnosable if the log says
    // which slot the equip was GIVEN. The line logs before equipItem runs, in
    // the same branch, from the same `wear` the call uses — one derivation.
    const branch = between(body, 'take&wear: equipping', 'equipItem(wear.name, wear.slot);');
    expect(branch).toContain('${wear.slot}');
    expect(branch).toContain('${wear.name}');
  });

  it('⚠⚠ the skipped branch is not silent either', () => {
    expect(body).toContain('take&wear: take of');
    expect(body).toContain('equip skipped');
  });

  it('⚠ both lines ride the debug channel — diagnostic, never feed noise', () => {
    for (const m of body.matchAll(/appendLog\('(\w+)', `take&wear:/g)) {
      expect(m[1]).toBe('debug');
    }
    expect((body.match(/appendLog\('debug', `take&wear:/g) ?? []).length).toBe(2);
  });
});

describe('OTA-1485 — the feed has exactly one pressable, and it is the logged one', () => {
  it('⚠⚠ one touchable in the text roll, wired to the onActionChipPress prop', () => {
    // The gap existed because a pressable shipped outside the ledger. Cheapest
    // structural guard: the feed renders ONE touchable, and its onPress is the
    // prop this OTA instrumented. A second pressable added later fails here
    // and forces the author to route it through logUiTap too.
    // OTA-1498 — the pack chip is the second pressable this pin existed to
    // catch, and it pays the toll this comment demanded: its handler in
    // ExplorationScreen calls logUiTap first (pinned in ota1498). Count is now
    // exactly TWO, each wired to a named prop — never an inline handler.
    // ⚠ OTA-1806 RE-ANCHORED THE PRIMITIVE, NOT THE CLAIM. Both chips became
    // `Pressable` when the depress pass closed the fade-only class — a
    // `TouchableOpacity` cannot report `pressed` at all. What this pin exists to
    // catch is unchanged: the feed renders EXACTLY TWO pressables and each is
    // wired to a NAMED prop, so a third one cannot ship outside the tap ledger.
    expect((FEED.match(/<Pressable/g) ?? []).length).toBe(2);
    expect((FEED.match(/onPress=/g) ?? []).length).toBe(2);
    expect(FEED).toContain('onPress={onActionChipPress}');
    expect(FEED).toContain('onPress={onPackChipPress}');
    expect(FEED).not.toContain('TouchableOpacity');
  });
});

describe('OTA-1485 — live: the tap line actually lands in the log', () => {
  // ⚠ LAG-2 — THE LEDGER MOVED HOUSE, THE CLAIM DID NOT. `logUiTap` used to go
  // through `appendLog`, which meant recording a line of hidden diagnostic text
  // swept every mounted store subscriber before the tapped handler had begun.
  // It now writes straight to the DISK log — the same sink `appendLog` persists
  // through, the same file COPY LOG and the LogScreen read — so the line is
  // still there in the same format; this test just reads it where it lives.
  it('⚠⚠ logUiTap writes `ui: tap "<label>"` on the debug channel', async () => {
    // The pins above prove the wiring; this proves the sink. The same call the
    // chip now makes, against the real store.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logUiTap } = require('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const save = require('../app/engine/saveSystem') as {
      setActiveSlot(id: string): Promise<void>; flushLogWrites(): Promise<void>; readFullLog(): Promise<string>;
    };
    await save.setActiveSlot('ota1485_tap_ledger');
    logUiTap('⬆ Take & wear Scrap Vest');
    await save.flushLogWrites();
    const disk = await save.readFullLog();
    expect(disk).toContain('[debug] ui: tap "⬆ Take & wear Scrap Vest"');
  });
});
