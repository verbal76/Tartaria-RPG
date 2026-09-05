/**
 * OTA-1543/1544/1545/1546 — four root causes from the owner's directive list.
 *
 * ⚠⚠⚠ (1543) THE FEED NEVER PRINTS A FRAGMENT. Owner's log: the Arbiter said
 * *"…each one a testament to the rich tapestry of"* — beheaded mid-phrase.
 * `trimToLastSentence`, whose whole contract is "never display a partial
 * ending", RETURNED THE RAW TEXT when no terminal punctuation existed — so a
 * generation capped mid-run-on sailed through the one function built to stop
 * it. Empty is honest now: the live path falls back to its template, ambient
 * discards as ∅. And the register half: the line was stock-fantasy filler
 * ("labyrinthine streets of the bustling markets") that the off-canon guard
 * can't touch because nothing in it is a NAMED place. A small gate of MEASURED
 * clichés — grown one slip at a time, per OTA-1124's warning that wholesale
 * scenery-policing is how OTA-1031 ate a feature — now drops them.
 *
 * ⚠⚠⚠ (1544) A REFUSED GIFT SAYS WHERE THE ITEM WENT, AND WHY. Owner: *"when I
 * gift is refused they should have various scripted ways of telling us they
 * don't want it, and the scene prose should mention that we put it back in our
 * pack and hint why they didn't like it."* The variety already exists — all 72
 * NPCs carry an authored insult line — but the prose ended at the voice, so a
 * correct refusal read as a broken gift (*"did she give it back? ... it didn't
 * leave my inventory"*). The refusal now closes with a pack-return coda whose
 * hint is honest BY CONSTRUCTION: the only road to 'insulted' is the worth
 * floor, so "worth more than this" is the actual reason. And the renderer owns
 * grammar now — an authored "a {item}" collapses to withArticle, ending
 * "a Aetheric Helm of Command".
 *
 * ⚠⚠ (1545) ONE NUMBER, ONE DERIVATION. The spawn debug line hand-rolled
 * `5 + ap (+boss)` and drifted from combatRules.enemyAC by exactly
 * traitACBonus — the owner's ledger said ac=10 while every swing fought AC 11.
 * It calls the exported real derivation now. And the qwen timing line's
 * "read ⚠364996ms NOT-PER-CALL" — llama.rn's native mis-split, thrice
 * documented, unreachable by OTA — is re-rendered so it cannot be read as a
 * measurement of the call it sits on.
 *
 * ⚠⚠⚠ (1546) THE DYING BREATH NAMES THE NATIVE JOB. All three post-1526
 * process deaths land on model-invoking actions with the native queue
 * degraded, and the freeze watch is JS-only — blind to the one suspect. Every
 * native-ML op funnels through the ONE lock, so its pump now stamps the
 * breadcrumb phase at start (with queue depth) and settle. The next
 * post-mortem reads `native:llm:start q1 (+8342ms)` — died inside inference —
 * or `native:llm:done` — native exonerated. Either answer moves #81.
 */
// narration.ts drags the native world in; same mock preamble the other suites use.
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
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import { trimToLastSentence, sentenceIsStockLlmFiller } from '../app/ai/narration';
import { resolveGift } from '../app/engine/gifting';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('OTA-1543 — the feed never prints a fragment', () => {
  it('⚠⚠⚠ the owner\'s exact line yields NOTHING, not a beheaded sentence', () => {
    const capped = 'You had traversed the borders of the ancient lands, navigating through '
      + 'the labyrinthine streets of the bustling markets, each one a testament to the rich tapestry of';
    expect(trimToLastSentence(capped)).toBe('');
  });

  it('⚠⚠⚠ a complete sentence followed by a fragment keeps only the sentence', () => {
    // The function's original job, still intact.
    expect(trimToLastSentence('The silt holds its shape tonight. And each stroke echoing in the'))
      .toBe('The silt holds its shape tonight.');
    expect(trimToLastSentence('"Keep walking," she says.')).toBe('"Keep walking," she says.');
  });

  it('⚠⚠ the register gate catches every measured slip — and only those', () => {
    for (const bad of [
      'each one a testament to the rich tapestry of survival',
      'the labyrinthine streets wind on',
      'the bustling market swallows you',
      'You find yourself at the bazaar',
      'You had traversed the borders of the ancient lands',
    ]) {
      expect([bad, sentenceIsStockLlmFiller(bad)]).toEqual([bad, true]);
    }
    for (const fine of [
      'The mud takes the print of your boot and keeps it.',
      'You have come farther than the silt expected.',
      'The Aetherstone hums against your back.',
      // "You had" without the past-participle travelogue shape stays legal.
      'You had better eat before the light goes.',
    ]) {
      expect([fine, sentenceIsStockLlmFiller(fine)]).toEqual([fine, false]);
    }
  });

  it('⚠⚠ the gate is wired into BOTH filter chains — live narration and ambient', () => {
    const code = codeOnly(src('app', 'ai', 'narration.ts'));
    const hits = code.match(/\.filter\(\(s\) => !sentenceIsStockLlmFiller\(s\)\)/g) ?? [];
    expect(hits.length).toBe(2);
  });
});

describe('OTA-1544 — a refused gift says where the item went, and why', () => {
  const cheap = { name: 'Aetheric Helm of Command', tags: ['loot'], worth: 0 };

  it('⚠⚠⚠ the refusal prose returns the item to the pack, in words', () => {
    const out = resolveGift('ilva_sidelong', 'Ilva Sidelong', cheap, { trades: 0 } as never);
    expect(out.refused).toBe(true);
    expect(out.line).toMatch(/back into your pack|goes back into your pack|pocket the/i);
  });

  it('⚠⚠⚠ …and hints the honest why — worth, the only road to a refusal', () => {
    const out = resolveGift('ilva_sidelong', 'Ilva Sidelong', cheap, { trades: 0 } as never);
    expect(out.line).toMatch(/worth|salvage/i);
    // The coda never leaks mechanics vocabulary into prose.
    expect(out.line).not.toMatch(/GIFT_FLOOR|standing|tag/i);
  });

  it('⚠⚠⚠ an authored "a {item}" renders with the right article', () => {
    // Ilva's own template carries "a {item}" under her REAL ledger key
    // (roadside:ilva_sidelong — a first draft used the bare slug, missed her
    // entry, and tested the generic fallback instead). The owner's feed
    // printed "a Aetheric Helm of Command"; the renderer owns grammar now.
    const out = resolveGift('roadside:ilva_sidelong', 'Ilva Sidelong', cheap, { trades: 0 } as never);
    expect(out.line).toContain('watched me sidelong');
    expect(out.line).toContain('an Aetheric Helm of Command');
    expect(out.line).not.toMatch(/\ba Aetheric/);
  });

  it('⚠⚠ the coda varies — one refusal sentence is not printed four times', () => {
    const lines = new Set(
      ['Nail', 'Rock', 'Rope', 'Fig'].map((n) =>
        resolveGift('ilva_sidelong', 'Ilva Sidelong', { name: n, tags: [], worth: 0 }, { trades: 0 } as never).line,
      ),
    );
    expect(lines.size).toBeGreaterThan(2);
  });

  it('⚠ OTA-1534 is untouched: first offer free, repeat still costs', () => {
    const first = resolveGift('ilva_sidelong', 'Ilva Sidelong', cheap, { trades: 0 } as never);
    expect(first.standingDelta).toBe(0);
    const again = resolveGift('ilva_sidelong', 'Ilva Sidelong', cheap,
      { trades: 0, gifts: [{ name: cheap.name, atHours: 1 }] } as never);
    expect(again.standingDelta).toBeLessThan(0);
  });
});

describe('OTA-1545 — one number, one derivation', () => {
  it('⚠⚠⚠ the spawn debug line fights with combatRules.enemyAC, not a hand copy', () => {
    const store = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(store).not.toContain("const ac = Math.max(5, Math.min(18, 5 + ap)) + (e['boss'] ? 6 : 0);");
    expect(store).toContain('const ac = enemyAC(');
    expect(codeOnly(src('app', 'engine', 'combatRules.ts'))).toContain('export function enemyAC(enemy: Enemy): number {');
  });

  it('⚠⚠ the impossible native split is quarantined in words, never printed as this call', () => {
    const boot = codeOnly(src('app', 'state', 'slices', 'bootSlice.ts'));
    expect(boot).not.toContain('NOT-PER-CALL');
    expect(boot).toContain('read/write unusable (native mis-reported');
    // The possible-timings path still prints real numbers untouched.
    expect(boot).toContain('` read ${r.prefillMs ?? \'?\'}ms/write ${r.decodeMs ?? \'?\'}ms`');
  });
});

describe('OTA-1546 — the dying breath names the native job', () => {
  it('⚠⚠⚠ the ONE lock stamps start (with queue depth) and settle', () => {
    const lock = codeOnly(src('app', 'ai', 'nativeMlLock.ts'));
    expect(lock).toContain("stampNativePhase('start', task.priority, pending.length);");
    expect(lock).toContain("stampNativePhase('done', task.priority, pending.length);");
    // start BEFORE task.fn runs, done AFTER it settles — the order is the
    // instrument: a death between them is a death inside native work.
    // ⚠ OTA-1675 — the done stamp moved into a `settle` closure that runs in
    // the settle handlers BEFORE the caller is resolved (it used to ride the
    // `.then` after `task.resolve`, one microtask late, so the caller's
    // continuation ran under the previous checkpoint). The property pinned
    // here is unchanged — done is stamped once the fn has settled — so the
    // pin reads the call site in the handlers, not the closure's definition.
    const start = lock.indexOf("stampNativePhase('start'");
    const fn = lock.indexOf('.then(task.fn)');
    const done = lock.indexOf('(v) => { settle(); task.resolve(v); }');
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(fn);
    expect(fn).toBeLessThan(done);
  });

  it('⚠⚠ the stamp can never wedge the chain it observes', () => {
    const lock = src('app', 'ai', 'nativeMlLock.ts');
    const i = lock.indexOf('function stampNativePhase');
    // ⚠ WINDOW WIDENED BY OTA-1567, which added a long note above the stamp
    // explaining why queue depth now rides `done` as well as `start`. The
    // property is unchanged — the stamp is wrapped, so a broken instrument can
    // never wedge the ML chain it observes — and a fixed character window is
    // the fragile way to assert it, so this reads to the end of the function.
    const fnEnd = lock.indexOf('\n}', i);
    expect(lock.slice(i, fnEnd)).toContain('catch');
  });

  it('⚠ priority maps to a legible job class — the ledger reads like a sentence', () => {
    const lock = codeOnly(src('app', 'ai', 'nativeMlLock.ts'));
    for (const cls of ["'homework'", "'teardown'", "'voice'", "'cognition'", "'llm'"]) {
      expect(lock).toContain(cls);
    }
    expect(lock).toContain('native:${cls}:${tag}');
  });
});
