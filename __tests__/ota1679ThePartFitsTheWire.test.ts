/**
 * OTA-1679 — THE PART FITS THE WIRE.
 *
 * OTA-1677 base64-encoded every log block so Sentry's scrubber is handed no
 * text. It was measured against the scrubber and it won. It was not measured
 * against Sentry's TRIM: a 15,000-character raw part encodes to ~20,000
 * characters of array, and Sentry cuts the `extra` value at a fixed budget.
 * The owner's first two bundles after 1677 (56 full parts) came back as 33–37
 * blocks each, JSON 16,413–16,424 characters, the last block cut mid-string
 * and everything after it gone: 11,891 of 15,000 characters per part, a 21%
 * hole in every log — where 1520's problem had been one 400-character block
 * in 29% of events. The pre-1677 part (15,000 raw, ~15.1K JSON) had sat just
 * under the same budget, which is why the trim had never shown itself.
 *
 * So parts are no longer cut by raw length. Blocks are packed into parts by
 * the ENCODED cost they will occupy on the wire, under a budget with a fifth
 * in hand, and nothing the log contains can push a part past it.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('../app/diagnostics/crashReporter', () => ({
  reportingEnabled: () => true,
  crashReportDsn: () => 'https://k@o.ingest.sentry.io/1',
}));

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  packLogIntoParts, splitLogIntoBlocks, encodeLogBlock,
  INLINE_PART_BUDGET_CHARS, INLINE_CHUNK_CHARS, INLINE_BLOCK_CHARS,
} from '../app/diagnostics/sentryTransport';

const ROOT = join(__dirname, '..');
const decode = (b: string): string => Buffer.from(b, 'base64').toString('utf8');
/** What Sentry measures: the JSON of the array, quotes and commas included. */
const wireLen = (blocks: string[]): number => JSON.stringify(blocks).length;
/** The trim, as measured on 56 parts: 16,413 … 16,424 JSON characters. */
const MEASURED_TRIM_MIN = 16_413;

function realLog(): string {
  const p = join(ROOT, 'sentry-inbox', 'assembled_mtj4hpttgrw4', 'game-log.txt');
  if (existsSync(p)) return readFileSync(p, 'utf8');
  return '[2026-09-03T00:31:47.037Z] [world] You salvage the oyster bed. The take is small but real.\n'.repeat(4500);
}

describe('OTA-1679 — the budget is below the measured trim, with room', () => {
  it('14,000 of the 16,413 Sentry allows — a fifth in hand', () => {
    expect(INLINE_PART_BUDGET_CHARS).toBe(14_000);
    expect(INLINE_PART_BUDGET_CHARS).toBeLessThan(MEASURED_TRIM_MIN * 0.9);
    // The old raw part could never have fit once encoded: 15,000 → 20,000.
    expect(Math.ceil(15_000 / 3) * 4).toBeGreaterThan(MEASURED_TRIM_MIN);
    // The raw ceiling is what the budget can carry in ASCII, not more.
    expect(INLINE_CHUNK_CHARS).toBe(10_000);
    expect(Math.ceil(INLINE_CHUNK_CHARS / 3) * 4).toBeLessThan(INLINE_PART_BUDGET_CHARS);
  });
});

describe('OTA-1679 — no part can exceed the wire budget', () => {
  it('⚠⚠⚠ a real 400 KB delivered log packs into parts that all fit, and joins back exactly', () => {
    const log = realLog();
    const parts = packLogIntoParts(log);
    expect(parts.length).toBeGreaterThan(20);
    for (const p of parts) {
      expect(wireLen(p.blocks)).toBeLessThanOrEqual(INLINE_PART_BUDGET_CHARS);
      expect(p.raw.length).toBeLessThanOrEqual(INLINE_CHUNK_CHARS);
      expect(p.blocks.map(decode).join('')).toBe(p.raw);
    }
    expect(parts.map((p) => p.raw).join('')).toBe(log);
    // And the packing is not timid: on mostly-ASCII prose the raw ceiling
    // closes a part first, at ~10,000 raw → ~13,000–13,400 on the wire, so
    // every full part sits within a block or two of the budget, not at half.
    const full = parts.slice(0, -1);
    expect(Math.min(...full.map((p) => wireLen(p.blocks)))).toBeGreaterThan(INLINE_PART_BUDGET_CHARS - 1_200);
    expect(Math.min(...full.map((p) => p.raw.length))).toBeGreaterThan(INLINE_CHUNK_CHARS - INLINE_BLOCK_CHARS - 1);
  });

  it('⚠⚠ a log of three-byte glyphs — the worst case the raw cut ignored — still fits', () => {
    // 400 characters of ✦ are 1,200 bytes → 1,600 base64 characters per block.
    const glyphs = '✦'.repeat(60_000);
    const parts = packLogIntoParts(glyphs);
    for (const p of parts) {
      expect(wireLen(p.blocks)).toBeLessThanOrEqual(INLINE_PART_BUDGET_CHARS);
      expect(p.blocks.map(decode).join('')).toBe(p.raw);
    }
    expect(parts.map((p) => p.raw).join('')).toBe(glyphs);
    // Under the OLD rule the same text would have been 4 parts of 15,000 raw,
    // each ~60,000 on the wire (38 blocks × 1,600) — more than three times the trim.
    expect(wireLen(splitLogIntoBlocks(glyphs.slice(0, 15_000)).map(encodeLogBlock))).toBeGreaterThan(MEASURED_TRIM_MIN * 3);
    expect(parts.length).toBeGreaterThan(4);
  });

  it('the raw ceiling holds on plain ASCII too, and the receipt is the raw length', () => {
    const ascii = 'x'.repeat(50_000);
    const parts = packLogIntoParts(ascii);
    for (const p of parts) {
      expect(p.raw.length).toBeLessThanOrEqual(INLINE_CHUNK_CHARS);
      expect(wireLen(p.blocks)).toBeLessThanOrEqual(INLINE_PART_BUDGET_CHARS);
      // Every block is a whole 400 (the splitter's ceiling) except the tail.
      for (const b of p.blocks.slice(0, -1)) expect(decode(b).length).toBe(INLINE_BLOCK_CHARS);
    }
    expect(parts.map((p) => p.raw.length).reduce((a, b) => a + b, 0)).toBe(50_000);
  });

  it('an empty log is one empty part, never zero parts (the beacon still says 1)', () => {
    expect(packLogIntoParts('')).toEqual([{ raw: '', blocks: [] }]);
    expect(packLogIntoParts('short')).toEqual([{ raw: 'short', blocks: [encodeLogBlock('short')] }]);
  });

  it('a block is never split across parts and never dropped, whatever the budget', () => {
    const log = realLog().slice(0, 40_000);
    const blocks = splitLogIntoBlocks(log);
    for (const budget of [3_000, 6_000, INLINE_PART_BUDGET_CHARS]) {
      const parts = packLogIntoParts(log, budget);
      const flat = parts.flatMap((p) => p.blocks.map(decode));
      expect(flat).toEqual(blocks);
      for (const p of parts) expect(wireLen(p.blocks)).toBeLessThanOrEqual(budget);
    }
  });
});

describe('OTA-1679 — the sender ships the packed parts', () => {
  const TRANSPORT = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
  const fn = TRANSPORT.slice(TRANSPORT.indexOf('export async function sendGameLogInline'));
  const body = fn.slice(0, fn.indexOf('\n}'));

  it('the part count is the packing\'s, and each event carries its packed blocks and raw receipt', () => {
    expect(body.includes('const packed = packLogIntoParts(text);')).toBe(true);
    expect(body.includes('const total = packed.length;')).toBe(true);
    expect(body.includes('const part = packed[i]!;')).toBe(true);
    expect(body.includes('const slice = part.raw;')).toBe(true);
    expect(body.includes('chunkBlocks: part.blocks,')).toBe(true);
    expect(body.includes('chunkChars: slice.length,')).toBe(true);
    // No raw cut survives anywhere in the sender.
    expect(body.includes('text.slice(i * INLINE_CHUNK_CHARS')).toBe(false);
    expect(body.includes('Math.ceil(text.length / INLINE_CHUNK_CHARS)')).toBe(false);
  });
});
