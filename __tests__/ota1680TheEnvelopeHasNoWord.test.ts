/**
 * OTA-1680 — THE ENVELOPE HAS NO WORD.
 *
 * 1677 claimed the base64 alphabet "has no word". True of `@password`,
 * `@email` and `@ip`; false of the rules that match SHAPES. The owner's first
 * whole log under 1679 (bundle #mtnrscwz8, part 29) came back with block 2
 * unreadable, and Sentry's `_meta` on the event says why:
 *
 *   "chunkBlocks": { "2": { "": { "rem": [["@iban:filter", "s", 264, 274]], "len": 436, … } } }
 *
 * An IBAN is two letters, two digits and a run of letters and digits — a shape
 * random base64 produces about once in a thousand blocks. `@creditcard`
 * (thirteen digits) and the case-insensitive `auth` / `secret` of `@password`
 * are the same class: they need a RUN, and a dense alphabet eventually hands
 * them one.
 *
 * So the envelope gets a seam: a `-` after every third character. The longest
 * run of letters-and-digits any rule can see is three. The relay strips the
 * seams and decodes exactly as before; the encoding name changes so an old
 * relay never misreads a seamed block.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('../app/diagnostics/crashReporter', () => ({
  reportingEnabled: () => true,
  crashReportDsn: () => 'https://k@o.ingest.sentry.io/1',
}));

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  encodeLogBlock, base64Of, splitLogIntoBlocks, packLogIntoParts,
  LOG_BLOCK_ENCODING, LOG_BLOCK_SEPARATOR, LOG_BLOCK_SEAM_EVERY,
  INLINE_PART_BUDGET_CHARS, INLINE_CHUNK_CHARS,
} from '../app/diagnostics/sentryTransport';

const ROOT = join(__dirname, '..');
const src = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8');
/** The relay's decoder, mirrored: strip the seams, then base64. */
const relayDecode = (b: string): string => Buffer.from(b.replace(/-/g, ''), 'base64').toString('utf8');

function realLog(): string {
  const p = join(ROOT, 'sentry-inbox', 'assembled_mtj4hpttgrw4', 'game-log.txt');
  if (existsSync(p)) return readFileSync(p, 'utf8');
  return '[2026-09-03T00:31:47.037Z] [world] You salvage the oyster bed. The take is small but real.\n'.repeat(4500);
}

/** A deterministic pseudo-random byte string — the adversary is the alphabet, not the prose. */
function noise(n: number, seed: number): string {
  let x = seed >>> 0;
  let out = '';
  for (let i = 0; i < n; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    out += String.fromCharCode(32 + (x >>> 24) % 95);
  }
  return out;
}

// The shapes the default rules need, as the loosest regexes that still describe them.
const RULES: Array<[string, RegExp]> = [
  ['@password (the word "auth", any case)', /auth/i],
  ['@password ("secret")', /secret/i],
  ['@password ("token…=" or ":")', /token[^\s]*[:=]/i],
  ['@iban (two letters, two digits, then letters-and-digits)', /\b[A-Z]{2}\d{2}[A-Z0-9]{4,}\b/],
  ['@creditcard (13+ digits)', /\d{13,}/],
  ['@ip', /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/],
  ['@email', /@/],
];

describe('OTA-1680 — the measured failure, on the record', () => {
  it('⚠⚠⚠ the inbox carries the proof: a base64 block redacted by @iban:filter', () => {
    const dir = join(ROOT, 'sentry-inbox');
    if (!existsSync(dir)) return;
    const hits: string[] = [];
    for (const d of readdirSync(dir)) {
      if (!d.startsWith('player-log_2026-09-05T02-34-53_')) continue;
      const p = join(dir, d, 'event.json');
      if (!existsSync(p)) continue;
      const ev = JSON.parse(readFileSync(p, 'utf8')) as { message?: string; _meta?: { context?: { chunkBlocks?: Record<string, unknown> } } };
      const meta = ev._meta?.context?.chunkBlocks;
      if (meta && JSON.stringify(meta).includes('@iban:filter')) hits.push(ev.message ?? d);
    }
    // Part 29 of #mtnrscwz8. If the inbox is ever pruned this proves nothing and says so.
    if (hits.length === 0) return;
    expect(hits.some((m) => m.includes('[inline 29/42]'))).toBe(true);
  });
});

describe('OTA-1680 — no run longer than three, so no shape can match', () => {
  it('every seamed block is base64 groups of three joined by the seam, and strips back to the plain form', () => {
    expect(LOG_BLOCK_ENCODING).toBe('base64-3');
    expect(LOG_BLOCK_SEPARATOR).toBe('-');
    expect(LOG_BLOCK_SEAM_EVERY).toBe(3);
    for (const block of splitLogIntoBlocks(realLog()).slice(0, 300)) {
      const seamed = encodeLogBlock(block);
      expect(seamed).toMatch(/^([A-Za-z0-9+/=]{1,3})(-[A-Za-z0-9+/=]{1,3})*$/);
      expect(seamed.replace(/-/g, '')).toBe(base64Of(block));
      expect(relayDecode(seamed)).toBe(block);
      // The property the whole OTA rests on.
      expect(/[A-Za-z0-9]{4}/.test(seamed)).toBe(false);
    }
  });

  it('⚠⚠⚠ ten thousand blocks of noise: the plain base64 trips the shape rules, the seamed form never does', () => {
    let plainHits = 0;
    for (let i = 0; i < 10_000; i++) {
      const block = noise(400, 7 + i * 13);
      const plain = base64Of(block);
      const seamed = encodeLogBlock(block);
      if (RULES.some(([, re]) => re.test(plain))) plainHits++;
      for (const [name, re] of RULES) {
        expect({ name, hit: re.test(seamed) }).toEqual({ name, hit: false });
      }
      expect(relayDecode(seamed)).toBe(block);
    }
    // Plain base64 is NOT safe — that is the finding. (auth alone is ~1 in 1,700 blocks.)
    expect(plainHits).toBeGreaterThan(0);
  });

  it('the real log, seamed, matches none of the shapes either, and packs whole under the budget', () => {
    const log = realLog();
    const parts = packLogIntoParts(log);
    for (const p of parts) {
      expect(JSON.stringify(p.blocks).length).toBeLessThanOrEqual(INLINE_PART_BUDGET_CHARS);
      expect(p.raw.length).toBeLessThanOrEqual(INLINE_CHUNK_CHARS);
      for (const b of p.blocks) {
        for (const [name, re] of RULES) expect({ name, hit: re.test(b) }).toEqual({ name, hit: false });
      }
      expect(p.blocks.map(relayDecode).join('')).toBe(p.raw);
    }
    expect(parts.map((p) => p.raw).join('')).toBe(log);
    // The seams cost parts: a 400 KB log is ~55 of them now (was 42 under 1679, 28 under 1677).
    expect(parts.length).toBeGreaterThan(45);
    expect(parts.length).toBeLessThan(70);
  });

  it('a seam is never inside a base64 quartet\'s meaning — stripping is lossless for every padding case', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'abcd', '✦', 'é✦🐶x', 'x'.repeat(401)]) {
      expect(relayDecode(encodeLogBlock(s))).toBe(s);
      expect(encodeLogBlock(s).replace(/-/g, '')).toBe(Buffer.from(s, 'utf8').toString('base64'));
    }
  });
});

describe('OTA-1680 — the relay and the puller strip the seam before decoding', () => {
  const RELAY = src('.github', 'workflows', 'sentry-inbox.yml');
  const TRANSPORT = src('app', 'diagnostics', 'sentryTransport.ts');

  it('the relay takes both encodings through one decoder that strips the seam first', () => {
    expect(RELAY.includes("if extraval(ev, 'chunkEncoding') in ('base64', 'base64-3'):")).toBe(true);
    const fn = RELAY.slice(RELAY.indexOf('def decode_block(b):'), RELAY.indexOf('def extraval(ev, key):'));
    expect(fn.includes("b = b.replace('-', '')")).toBe(true);
    expect(fn.indexOf("b = b.replace('-', '')")).toBeLessThan(fn.indexOf('base64.b64decode(b, validate=True)'));
    // A plain 1677 block has no '-' — the strip is a no-op on it, so old bundles still decode.
    expect(/-/.test(Buffer.from('any 1677 block', 'utf8').toString('base64'))).toBe(false);
  });

  it('the sender names the seamed encoding on every part', () => {
    expect(TRANSPORT.includes("export const LOG_BLOCK_ENCODING = 'base64-3';")).toBe(true);
    expect(TRANSPORT.includes('chunkEncoding: LOG_BLOCK_ENCODING,')).toBe(true);
    expect(TRANSPORT.includes('chunkBlocks: part.blocks,')).toBe(true);
  });
});
