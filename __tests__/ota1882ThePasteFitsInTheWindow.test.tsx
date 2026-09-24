// OTA-1882 — THE PASTE FITS IN THE WINDOW (#214).
//
// ⚠⚠⚠ THE OWNER COULD NOT PASTE HIS OWN CRASH REPORT. The title screen showed
// `CRASHED SAVE CAPTURED · screen-render · 60m ago · 420072 bytes` with a COPY
// CRASHED SAVE button; he pressed it and the payload was too large to post
// through the support path it exists to feed. A diagnostic nobody can deliver is
// not a diagnostic.
//
// ⚠⚠ WHAT THIS SUITE IS ACTUALLY GUARDING, and why a character count would not
// do it. The budget is in UTF-8 BYTES, so every size assertion here encodes the
// final string the way a byte-sensitive destination will and checks THAT number.
// §E drives the same paths through multibyte content, where `.length` and byte
// length diverge by up to 4×, because a cap enforced on `.length` is not a cap.
//
// ⚠ AND IT GUARDS THE THING THE REPAIR MUST NOT COST. The retained artifact is
// recovery evidence for a save that can never be loaded (OTA-341/343), so §G
// asserts the capture's own `raw` is untouched by every export path. Bounding the
// paste may not shrink the evidence.
import React from 'react';
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// ⚠ NO `{ virtual: true }` — these modules genuinely exist, and a virtual mock on
// a real module holds only while this suite runs ALONE; in a shared run the real
// onnxruntime binding loads and dies in a NEIGHBOUR suite. OTA-1246's house
// pattern, and OTA-1881 paid for relearning it.
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PORTABLE_REPORT_MAX_BYTES,
  assemblePortableReport,
  collectionKind,
  renderBoundedCollection,
  truncateToBytes,
  utf8Bytes,
} from '../app/diagnostics/portableReport';
import { crashCorrelationId } from '../app/diagnostics/crashCorrelation';
import { buildCrashSaveExport, type CrashSaveCapture } from '../app/diagnostics/crashSave';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** ⚠⚠ Every source census below reads code with comments REMOVED. OTA-1721's
 *  lesson, paid for twice inside this very package: a file that documents why it
 *  avoids a thing necessarily contains the name of that thing, and a naive scan
 *  convicts the explanation. */
const stripComments = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const DEVICE = 'Tartaria Realms · test device\nApp 4.32.11 · APK 2.5.0 · OTA 2026-09-24-1882';

/** ⚠ A save shaped like the owner's, not a toy. The measured breakdown of his real
 *  export put 37% in `player.inventory`, 18% in `visitedRooms`, 15% in
 *  `worldEvents` — all of it play, none of it a leak — so the fixture grows those
 *  same collections, and each item carries the `description` prose that is the
 *  actual bulk. */
function bigSave(opts: { items?: number; events?: number; unicode?: boolean } = {}): string {
  const items = opts.items ?? 400;
  const events = opts.events ?? 400;
  const pad = opts.unicode
    ? '𝔘𝔫𝔦𝔠𝔬𝔡𝔢 — 石の建築者 · ⚔️🛡️🐕 アエーテル残渣 '.repeat(6)
    : 'A hand-held aether-light that resonates when the ruins remember. '.repeat(6);
  return JSON.stringify({
    version: 1,
    savedAt: 1790000000000,
    player: {
      name: opts.unicode ? 'チェダー・ボブ' : 'Cheddar Bob',
      raceId: 'reclaimer',
      factionId: 'reclaimers_guild',
      hp: 40, hpMax: 47, dead: false, hoursElapsed: 812.5,
      currentLocationId: 'asgardar',
      // ⚠ OTA-1484's ratchet: a save fixture carries its coordinates. This is real
      // player state, not a pure-predicate argument, so it spreads placedAt rather
      // than taking a re-baseline — which is exactly what that pin asks for.
      placedAt: { locationId: 'asgardar', gridX: 41, gridY: 20 },
      mainQuest: { phase: 3, guardiansDefeated: ['a', 'b'] },
      statusEffects: [],
      equipped: { weaponId: 'w1', armorId: 'a1' },
      inventory: Array.from({ length: items }, (_, i) => ({
        id: `it_${i}`, name: `${opts.unicode ? 'アエーテル' : 'Aetheric'} Piece ${i}`,
        kind: 'relic', rarity: 'Common', quantity: (i % 4) + 1,
        tags: ['light', 'relic'], description: `${pad}${i}`,
      })),
    },
    worldMemory: {
      worldEvents: Array.from({ length: events }, (_, i) => ({
        text: `${pad} event ${i}`, kind: 'bloc_battle', hour: 10 + i * 0.05,
      })),
      recentRaids: Array.from({ length: 30 }, (_, i) => ({
        defenderId: 'eternal_dynasty', attackerId: 'mud_monarchs', hour: 20 + i,
      })),
      patrols: Array.from({ length: 40 }, (_, i) => ({
        factionId: 'stone_builders', gx: i, gy: i, homeX: 1, homeY: 2, phase: i,
      })),
      visitedRooms: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [
        `room_${i}@_@1,${i}@gate`,
        { firstVisitAt: 1, lastVisitAt: 2, visitCount: i, searchedAmbientNouns: [pad, pad] },
      ])),
    },
    gameLog: Array.from({ length: 500 }, (_, i) => ({ text: `${pad} log ${i}`, channel: 'world' })),
    currentScreen: 'exploration',
  });
}

function capture(over: Partial<CrashSaveCapture> = {}): CrashSaveCapture {
  return {
    stage: 'screen-render',
    slotId: 'slot_abc',
    raw: bigSave(),
    capturedAt: 1790284571483,
    error: 'Rendered more hooks than during the previous render.',
    componentStack: '\n    at FusionPickerModal\n    at RCTView\n    at View',
    correlationId: crashCorrelationId(1790284571483, 'js-boundary'),
    ...over,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// §A — CORRELATION: ONE CRASH, ONE KEY, ON BOTH PATHS
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1882 §A — one crash carries one correlation key', () => {
  it('⚠⚠⚠ the key is a pure function of the crash — same inputs, same key, always', () => {
    expect(crashCorrelationId(1790284571483, 'js-boundary')).toBe('1790284571483_js-boundary');
    expect(crashCorrelationId(1790284571483, 'js-boundary'))
      .toBe(crashCorrelationId(1790284571483, 'js-boundary'));
  });

  it('⚠⚠⚠ adjacent crashes cannot cross-associate — different instant, different key', () => {
    const a = crashCorrelationId(1790284571483, 'js-boundary');
    const b = crashCorrelationId(1790284571484, 'js-boundary');
    expect(a).not.toBe(b);
  });

  it('⚠⚠ two kinds at one instant stay distinguishable', () => {
    expect(crashCorrelationId(1, 'js-fatal')).not.toBe(crashCorrelationId(1, 'js-boundary'));
  });

  it('⚠⚠⚠ the SUPPORTED contract, stated honestly: same ts AND same kind is ONE key', () => {
    // Not a unique id and never claimed as one. `recordCrash` already dedups on
    // this id on purpose, so a same-millisecond same-kind pair was one ledger row
    // before this package and still is. The regression pins the real guarantee
    // rather than a stronger one a future reader would trust wrongly.
    expect(crashCorrelationId(7, 'js-fatal')).toBe(crashCorrelationId(7, 'js-fatal'));
  });

  it('⚠⚠ NO RANDOMNESS, and no clock read inside the helper', () => {
    const code = src('app', 'diagnostics', 'crashCorrelation.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    expect(code).not.toContain('Math.random');
    expect(code).not.toContain('Date.now');
    expect(code).not.toContain('bundleId');
  });

  it('⚠⚠⚠ the ledger CALLS the helper — one spelling, not two', () => {
    const ledger = src('app', 'diagnostics', 'crashLedger.ts');
    expect(ledger).toContain("import { crashCorrelationId } from './crashCorrelation'");
    expect(ledger).toContain('id: crashCorrelationId(ts, rec.kind)');
    // And the old inline spelling is gone, so they cannot drift.
    expect(ledger).not.toContain('id: `${ts}_${rec.kind}`');
  });

  it('⚠⚠⚠ BOTH crash handlers take ONE timestamp and hand it to both writers', () => {
    const app = src('App.tsx');
    // boundary path
    expect(app).toContain("const correlationId = crashCorrelationId(crashTs, 'js-boundary')");
    expect(app).toContain('ts: crashTs,');
    // fatal path
    expect(app).toContain("const fatalCorrelationId = crashCorrelationId(fatalTs, 'js-fatal')");
    expect(app).toContain('ts: fatalTs,');
    // ⚠ The defect this pins: a second Date.now() on the other side of the
    // handler would key the two records to different instants.
    expect(app).toContain('correlationId,');
    expect(app).toContain('{ correlationId: fatalCorrelationId }');
  });

  it('⚠⚠ the export prints the key, and a LEGACY capture without one still exports', () => {
    expect(buildCrashSaveExport(capture(), DEVICE)).toContain('correlation: 1790284571483_js-boundary');
    const legacy = buildCrashSaveExport(capture({ correlationId: undefined }), DEVICE);
    expect(legacy).not.toContain('correlation:');
    expect(legacy.length).toBeGreaterThan(200);          // it still produced a report
    expect(legacy).toContain('CRASHED SAVE');
  });

  it('⚠⚠ no fabricated placeholder stands in for a missing key', () => {
    const legacy = buildCrashSaveExport(capture({ correlationId: undefined }), DEVICE);
    for (const fake of ['unknown', 'n/a', 'none', 'null', 'undefined', 'TBD']) {
      expect(legacy).not.toContain(`correlation: ${fake}`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — A SMALL REPORT IS NOT CHURNED
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1882 §B — ordinary reports keep their existing shape', () => {
  const small = capture({ raw: JSON.stringify({ version: 1, player: { name: 'Bob', inventory: [] }, worldMemory: {}, gameLog: [] }) });

  it('⚠⚠ still the familiar envelope and highlights, under budget', () => {
    const out = buildCrashSaveExport(small, DEVICE);
    expect(utf8Bytes(out)).toBeLessThanOrEqual(PORTABLE_REPORT_MAX_BYTES);
    expect(out).toContain('=== TARTARIA SAVE');
    expect(out).toContain('--- HIGHLIGHTS (brick-suspect fields) ---');
    expect(out).toContain('--- FULL STATE JSON');
    // The bounded machinery must be INVISIBLE here — that is the contract.
    expect(out).not.toContain('PORTABLE REPORT TRUNCATED');
    expect(out).not.toContain('PARTIAL');
  });

  it('⚠ and it carries the correlation key', () => {
    expect(buildCrashSaveExport(small, DEVICE)).toContain('correlation: ');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — OVERSIZED, PARSE-OK
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1882 §C — an oversized parse-OK report is bounded structurally', () => {
  const cap = capture();
  const out = buildCrashSaveExport(cap, DEVICE);

  it('⚠⚠⚠ the raw save really is the 420k class, and the OLD export would have been too', () => {
    expect(utf8Bytes(cap.raw ?? '')).toBeGreaterThan(200_000);
  });

  it('⚠⚠⚠ the clipboard payload is <= 40,000 UTF-8 BYTES', () => {
    expect(utf8Bytes(out)).toBeLessThanOrEqual(PORTABLE_REPORT_MAX_BYTES);
  });

  it('⚠⚠⚠ every Priority-1 fact survives', () => {
    expect(out).toContain('correlation: 1790284571483_js-boundary');
    expect(out).toContain('stage: screen-render');
    expect(out).toContain('Rendered more hooks than during the previous render.');
    expect(out).toContain('FusionPickerModal');
    expect(out).toContain('2026-09-24');                     // capture timestamp, ISO
    expect(out).toContain('APK 2.5.0');                      // device/build summary
  });

  it('⚠⚠ it says plainly that it is NOT the whole save', () => {
    expect(out).toContain('BOUNDED');
    expect(out).toMatch(/NOT the whole save/);
  });

  it('⚠⚠⚠ partial collections state original / retained / omitted and cannot pass as complete', () => {
    const inv = out.match(/player\.inventory: PARTIAL — (\d+) total, (\d+) shown, (\d+) omitted/);
    expect(inv).not.toBeNull();
    const [, total, shown, omitted] = inv!.map(Number) as unknown as [unknown, number, number, number];
    expect(total).toBe(400);
    expect(shown + omitted).toBe(total);
  });

  it('⚠⚠ chronological collections keep the NEWEST entries; current-state ones do not pretend to', () => {
    expect(collectionKind('worldMemory.worldEvents')).toBe('chronological');
    expect(collectionKind('worldMemory.recentRaids')).toBe('chronological');
    expect(collectionKind('player.inventory')).toBe('current');
    expect(collectionKind('worldMemory.patrols')).toBe('current');
    // The newest world event is hour 10 + 399*0.05 = 29.95 and must be present;
    // the oldest is the one that may go.
    const ev = renderBoundedCollection('worldMemory.worldEvents',
      Array.from({ length: 400 }, (_, i) => ({ kind: 'k', hour: 10 + i * 0.05 })), 20);
    expect(ev).toContain('29.95');
    expect(ev).toContain('newest kept');
    const pat = renderBoundedCollection('worldMemory.patrols',
      Array.from({ length: 99 }, (_, i) => ({ gx: i })), 5);
    expect(pat).toContain('current-state list, not history');
  });

  it('⚠⚠ nothing is dropped silently, and the reader is told the evidence survives', () => {
    // ⚠ On this fixture every bounded BLOCK fits, so a block-omission notice would
    // be a lie — the trimming happened INSIDE the collections, and each one says
    // so with its counts. Block-level omission is proven in §F, where the budget
    // is actually tight. What must always appear is the standing statement that
    // the full artifact and the full relay evidence both still exist.
    expect(out).toContain('The FULL crashed save is retained on the device');
    expect(out).toContain('went to Sentry independently');
    expect(out).toContain('quote the correlation id');
    expect(out).toContain('PARTIAL');
  });

  it('⚠⚠⚠ the retained artifact is untouched by exporting', () => {
    const before = capture().raw;
    const c = capture();
    buildCrashSaveExport(c, DEVICE);
    expect(c.raw).toBe(before);
    expect(c.raw?.length).toBe(before?.length);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — OVERSIZED, PARSE-FAIL — THE BRICK CASE
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1882 §D — a corrupt save still exports, bounded, unrepaired', () => {
  const corrupt = capture({ raw: `{"player":{"name":"Bob"` + 'x'.repeat(300_000) });
  const out = buildCrashSaveExport(corrupt, DEVICE);

  it('⚠⚠⚠ <= 40,000 UTF-8 bytes', () => {
    expect(utf8Bytes(out)).toBeLessThanOrEqual(PORTABLE_REPORT_MAX_BYTES);
  });

  it('⚠⚠⚠ the parse failure, the original size and the correlation key all survive', () => {
    expect(out).toContain('RAW PARSE FAILED');
    expect(out).toContain(`${utf8Bytes(corrupt.raw ?? '')} UTF-8 bytes`);
    expect(out).toContain('correlation: 1790284571483_js-boundary');
  });

  it('⚠⚠ a bounded excerpt is present and labelled, with the omitted count', () => {
    expect(out).toContain('--- RAW EXCERPT (BOUNDED)');
    expect(out).toMatch(/first \d+ of \d+ UTF-8 bytes; \d+ omitted/);
    expect(out).toContain('NOT repaired, NOT reformatted');
    expect(out).toContain('{"player":{"name":"Bob"');       // the informative head
  });

  it('⚠⚠⚠ the FULL malformed bytes stay on the device, and the report says so', () => {
    expect(out).toContain('@tartaria/lastCrashSave');
    expect(corrupt.raw?.length).toBe(`{"player":{"name":"Bob"`.length + 300_000);
  });

  it('⚠ no attempt is made to repair the JSON', () => {
    // ⚠⚠ COMMENTS STRIPPED FIRST — the OTA-1721 class. The unstripped census
    // failed on this module's own prose ("NOT repaired, NOT reformatted"), which
    // is an instrument acting on a comment that names what it hunts for.
    const code = stripComments(src('app', 'diagnostics', 'crashSave.ts'));
    expect(code).toContain('boundedCorruptExport');   // the stripper left code behind
    // ⚠⚠ ASSERT THE MECHANISM, NOT THE WORD. A `/repair/i` scan fails on the
    // report's own honest sentence "NOT repaired, NOT reformatted" — which is
    // CODE here, a string literal in the emitted text, so stripping comments does
    // not save it. Forbidding the word would mean the export could no longer SAY
    // it does not repair. So this pins the absent behaviours instead.
    expect(code).not.toContain('JSON.parse(capture.raw.slice');
    expect(code).not.toMatch(/\braw\s*=\s*[^;\n]*replace\(/);   // no rewriting of raw
    expect(code).not.toMatch(/try\s*\{[^}]*JSON\.parse[^}]*\}\s*catch[^}]*JSON\.parse/s); // no second-chance parse
    // The corrupt path emits the bytes it was given and nothing else.
    expect(code).toContain('truncateToBytes(capture.raw ?? \'\'');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — UNICODE: BYTES, NOT CODE UNITS
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1882 §E — multibyte content cannot breach a byte budget', () => {
  it('⚠⚠⚠ utf8Bytes counts bytes, and disagrees with .length exactly where it should', () => {
    expect(utf8Bytes('abc')).toBe(3);
    expect(utf8Bytes('é')).toBe(2);
    expect(utf8Bytes('石')).toBe(3);
    expect(utf8Bytes('🐕')).toBe(4);
    expect('🐕'.length).toBe(2);                 // the trap, named
    expect(utf8Bytes('🐕🐕')).toBe(8);
  });

  it('⚠⚠⚠ truncateToBytes never splits a character', () => {
    // 3 bytes available but the next character costs 4 — it must be left out
    // whole rather than halved into a broken surrogate.
    const cut = truncateToBytes('🐕🐕', 5);
    expect(utf8Bytes(cut)).toBeLessThanOrEqual(5);
    expect(cut).toBe('🐕');
    expect([...cut].every((ch) => (ch.codePointAt(0) ?? 0) < 0xd800 || (ch.codePointAt(0) ?? 0) > 0xdfff)).toBe(true);
    expect(cut.includes('�')).toBe(false);
  });

  it('⚠⚠⚠ a heavily multibyte oversized report still lands under the byte budget', () => {
    const uni = capture({ raw: bigSave({ unicode: true }) });
    const out = buildCrashSaveExport(uni, DEVICE);
    expect(utf8Bytes(out)).toBeLessThanOrEqual(PORTABLE_REPORT_MAX_BYTES);
    // ⚠ and the naive measure would have LIED: fewer code units than bytes.
    expect(out.length).toBeLessThan(utf8Bytes(out));
    expect(out).not.toContain('�');
  });

  it('⚠⚠ a corrupt multibyte save is also bounded in bytes', () => {
    const out = buildCrashSaveExport(capture({ raw: '{' + '石'.repeat(150_000) }), DEVICE);
    expect(utf8Bytes(out)).toBeLessThanOrEqual(PORTABLE_REPORT_MAX_BYTES);
    expect(out).not.toContain('�');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — BOUNDARIES, INCLUDING THE NOTICES' OWN COST
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1882 §F — the budget holds at its edges', () => {
  it('⚠⚠ under budget: everything is admitted and no notice appears', () => {
    const r = assemblePortableReport([
      { priority: 1, label: 'id', text: 'ID' },
      { priority: 3, label: 'ctx', text: 'CTX' },
    ], 1000);
    expect(r.omittedLabels).toEqual([]);
    expect(r.text).toContain('CTX');
    expect(r.bytes).toBeLessThanOrEqual(1000);
  });

  it('⚠⚠⚠ the truncation notice is paid for out of the budget, not appended after it', () => {
    // A P2 block that would fit on its own but NOT alongside the notice that
    // would then be required must be refused — otherwise the notice pushes the
    // payload over, which is the classic way a cap leaks.
    const p1 = 'X'.repeat(100);
    const r = assemblePortableReport([
      { priority: 1, label: 'id', text: p1 },
      { priority: 2, label: 'a', text: 'Y'.repeat(120) },
      { priority: 3, label: 'b', text: 'Z'.repeat(400) },
    ], 300);
    expect(r.bytes).toBeLessThanOrEqual(300);
    expect(r.omittedLabels.length).toBeGreaterThan(0);
    expect(r.text).toContain('PORTABLE REPORT TRUNCATED');
  });

  it('⚠⚠ exactly at budget is allowed; one byte over is not', () => {
    const exact = assemblePortableReport([{ priority: 1, label: 'id', text: 'A'.repeat(50) }], 50);
    expect(exact.bytes).toBe(50);
    const over = assemblePortableReport([{ priority: 1, label: 'id', text: 'A'.repeat(80) }], 50);
    expect(over.bytes).toBeLessThanOrEqual(50);
  });

  it('⚠⚠⚠ Priority 1 is never dropped to make room for anything lower', () => {
    const r = assemblePortableReport([
      { priority: 1, label: 'id', text: 'CORRELATION-AND-ERROR' },
      { priority: 4, label: 'bulk', text: 'B'.repeat(5000) },
    ], 200);
    expect(r.text).toContain('CORRELATION-AND-ERROR');
    expect(r.omittedLabels).toContain('bulk');
    expect(r.bytes).toBeLessThanOrEqual(200);
  });

  it('⚠ lower priorities are shed before higher ones', () => {
    const r = assemblePortableReport([
      { priority: 1, label: 'id', text: 'ID' },
      { priority: 2, label: 'near', text: 'N'.repeat(60) },
      { priority: 4, label: 'far', text: 'F'.repeat(60) },
    ], 330);
    expect(r.text).toContain('N'.repeat(60));
    expect(r.omittedLabels).toContain('far');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — RECOVERY AND §H — RELAY: NEITHER IS TOUCHED
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1882 §G/§H — the evidence and its delivery are unchanged', () => {
  it('⚠⚠⚠ the capture writer still stores raw VERBATIM — no trimming at capture', () => {
    const code = src('app', 'diagnostics', 'crashSave.ts');
    expect(code).toContain('const raw = slotId ? await AsyncStorage.getItem(slotSaveKey(slotId)) : null;');
    expect(code).toContain('raw,');
    // ⚠ The one thing that would betray #214: a bound applied at CAPTURE.
    expect(code).not.toMatch(/raw:\s*raw\?\.slice/);
    expect(code).not.toMatch(/truncateToBytes\(raw/);
  });

  it('⚠⚠ the retention key and its shape are untouched', () => {
    const code = src('app', 'diagnostics', 'crashSave.ts');
    expect(code).toContain("export const CRASH_SAVE_KEY = '@tartaria/lastCrashSave'");
    expect(code).toContain('await AsyncStorage.setItem(CRASH_SAVE_KEY, JSON.stringify(capture))');
  });

  it('⚠⚠⚠ no bundleId guessing and no latest-bundle lookup anywhere in the new code', () => {
    for (const f of [['app', 'diagnostics', 'crashCorrelation.ts'], ['app', 'diagnostics', 'portableReport.ts']]) {
      const code = src(...f).replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
      expect(code).not.toContain('bundleId');
      expect(code).not.toContain('pendingBundle');
      expect(code).not.toContain('Math.random');
    }
  });

  it('⚠⚠ the Sentry transport is not modified by this package', () => {
    const t = src('app', 'diagnostics', 'sentryTransport.ts');
    expect(t).not.toContain('correlationId');
    expect(t).not.toContain('portableReport');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §I — THE CARD'S NUMBER MEANS WHAT IT SAYS
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1882 §I — the orange card counts the unit it prints', () => {
  it('⚠⚠⚠ it measures UTF-8 bytes now, not UTF-16 code units', () => {
    const ts = src('app', 'screens', 'TitleScreen.tsx');
    expect(ts).toContain('const bytes = capture.raw ? utf8Bytes(capture.raw) : 0;');
    expect(ts).not.toContain('const bytes = capture.raw?.length ?? 0;');
    expect(ts).toContain('{bytes} bytes');   // the label it must now be honest about
  });

  it('⚠⚠ and the two numbers stay separate concepts', () => {
    // The card reports the RETAINED artifact. It must not start reporting the
    // paste budget, which is a different thing for a different reader.
    // ⚠ Stripped, for the same reason as §D: the card's own comment names the
    // budget constant in order to say it is a DIFFERENT number.
    const ts = stripComments(src('app', 'screens', 'TitleScreen.tsx'));
    expect(ts).not.toContain('PORTABLE_REPORT_MAX_BYTES');
    expect(ts).toContain('utf8Bytes(capture.raw)');   // the stripper left code behind
  });

  it('⚠ a multibyte save is reported in bytes, which exceeds its code-unit count', () => {
    const raw = '石'.repeat(1000);
    expect(utf8Bytes(raw)).toBe(3000);
    expect(raw.length).toBe(1000);
  });
});
