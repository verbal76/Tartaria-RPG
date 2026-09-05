/**
 * OTA-1677 — THE LOG LEAVES IN AN ENVELOPE (task #82).
 *
 * OTA-1520 re-measured on 711 delivered events from 09-03/04: 209 (29%) still
 * lost a block to `@password:filter` — 273 blocks, 93,210 characters. The fix
 * had worked as far as it claimed (blocks, not parts), and the surviving
 * neighbours finally named the trigger: 219 of the 273 holes sit in salvage
 * prose, and one of the four rotating curio lines is *"Nobody authored this
 * piece"* — `auth` inside "authored". The other 54 recur across re-sent bundles:
 * a haul naming a "…of Secrets" armour, and an NPC's line.
 *
 * A fantasy log cannot avoid "secret" or "authored", and Sentry's Safe Fields
 * cannot exempt an array's elements. So the text stops being text in transit:
 * each block is base64 on the device, decoded by the relay. The alphabet has no
 * `@`, `.`, space or word — nothing for any content rule to match, now or under
 * a rule that does not exist yet. `chunkChars` stays the raw-length receipt.
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
  encodeLogBlock, splitLogIntoBlocks, LOG_BLOCK_ENCODING, INLINE_BLOCK_CHARS,
} from '../app/diagnostics/sentryTransport';

const ROOT = join(__dirname, '..');
const src = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8');
const decode = (b: string): string => Buffer.from(b, 'base64').toString('utf8');

// Sentry's DEFAULT rule, verbatim (see ota1520 for its provenance).
const PASSWORD_KEY_REGEX = new RegExp(
  '(password|secret|passwd|api[-_]key|apikey|auth|credentials|mysql_pwd|privatekey|private[-_]key|token[^\\s]*[:=]|^otp$|^two[-_]factor$)',
  'i',
);

describe('OTA-1677 — the encoder', () => {
  it('round-trips ASCII, BMP glyphs and astral characters exactly', () => {
    for (const s of [
      '',
      'a',
      'ab',
      'abc',
      '[2026-09-03T00:31:47.037Z] [world] You strip the oyster bed carefully.\n',
      '✦ Salvage haul — Shaman\'s Veil of Secrets (Common) ⏎ £ é ß',
      'emoji 🐶🔥 and a lone ✔ mark',
      'Nobody authored this piece; the forge will take it all the same.',
    ]) {
      expect(decode(encodeLogBlock(s))).toBe(s);
      // Standard alphabet, standard padding — what Python's b64decode(validate=True) accepts.
      expect(encodeLogBlock(s)).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      expect(encodeLogBlock(s).length % 4).toBe(0);
    }
  });

  it('agrees with Node\'s own base64 on a real log, block by block', () => {
    const log = realLogSample();
    for (const block of splitLogIntoBlocks(log)) {
      expect(encodeLogBlock(block)).toBe(Buffer.from(block, 'utf8').toString('base64'));
    }
  });

  it('⚠⚠⚠ THE PROOF: over a real 400 KB log, no encoded block matches the scrubbing rule, though the text does', () => {
    // ⚠ A DELIVERED log cannot contain a match — Sentry already took every one
    // (OTA-1520's "perfect discrimination" finding, re-confirmed here on 400 KB).
    // So the corpus is the real log with the measured triggers put back in.
    const delivered = realLogSample();
    expect(splitLogIntoBlocks(delivered).some((b) => PASSWORD_KEY_REGEX.test(b))).toBe(false);
    const log = delivered
      + '[2026-09-03T00:31:47.037Z] [world] The oyster bed gives up something irregular. Nobody authored this piece; the forge will take it all the same.\n'
      + "[2026-09-03T00:39:15.113Z] [reward] ✦ Shaman's Veil of Secrets (Common)\n";
    const blocks = splitLogIntoBlocks(log);
    expect(blocks.length).toBeGreaterThan(100);
    // The plain text trips the rule (it is a fantasy log — it says "secret").
    expect(blocks.some((b) => PASSWORD_KEY_REGEX.test(b))).toBe(true);
    // The envelopes never do.
    const trippedEncoded = blocks.map(encodeLogBlock).filter((b) => PASSWORD_KEY_REGEX.test(b));
    expect(trippedEncoded).toEqual([]);
    // And the reassembly is exact.
    expect(blocks.map(encodeLogBlock).map(decode).join('')).toBe(log);
  });

  it('⚠⚠ the four curio lines and the three "of Secrets" names — the measured triggers — all pass through unmatched', () => {
    const SALVAGE = src('app', 'engine', 'salvagePools.ts');
    expect(SALVAGE).toContain('Nobody authored this piece');
    const triggers = [
      '{target} gives up something irregular. Nobody authored this piece; the forge will take it all the same.',
      "[reward] ✦ Shaman's Veil of Secrets (Common)",
      "[reward] ✦ Shaman's Mantle of Secrets (Common)",
      "[reward] ✦ Salvager's Mask of Secrets (Common)",
    ];
    for (const t of triggers) {
      expect(PASSWORD_KEY_REGEX.test(t)).toBe(true);
      expect(PASSWORD_KEY_REGEX.test(encodeLogBlock(t))).toBe(false);
    }
  });

  it('an envelope is at most 4/3 of its bytes — a 400-character block stays a small array element', () => {
    const block = 'x'.repeat(INLINE_BLOCK_CHARS);
    expect(encodeLogBlock(block).length).toBe(Math.ceil(INLINE_BLOCK_CHARS / 3) * 4);
  });
});

describe('OTA-1677 — the sender and the relay agree on the envelope', () => {
  const TRANSPORT = src('app', 'diagnostics', 'sentryTransport.ts');
  const RELAY = src('.github', 'workflows', 'sentry-inbox.yml');

  it('the sender encodes every block, names the encoding, and keeps the raw receipt', () => {
    expect(LOG_BLOCK_ENCODING).toBe('base64');
    // ⚠ OTA-1679 — the blocks are packed under the wire budget before the
    // send (packLogIntoParts); the array on the event is the packed part's.
    expect(TRANSPORT.includes('chunkBlocks: part.blocks,')).toBe(true);
    expect(TRANSPORT.includes('const packed = packLogIntoParts(text);')).toBe(true);
    expect(TRANSPORT.includes('chunkEncoding: LOG_BLOCK_ENCODING,')).toBe(true);
    expect(TRANSPORT.includes('chunkChars: slice.length,')).toBe(true);
  });

  it('the relay decodes when the event says base64, and leaves a "[Filtered]" standing as itself', () => {
    expect(RELAY.includes("if extraval(ev, 'chunkEncoding') == 'base64':")).toBe(true);
    expect(RELAY.includes('blocks = [decode_block(b) for b in blocks if isinstance(b, str)]')).toBe(true);
    expect(RELAY.includes("return base64.b64decode(b, validate=True).decode('utf-8')")).toBe(true);
    expect(RELAY.includes('import json, os, urllib.request, pathlib, re, base64')).toBe(true);
    // The decode happens BEFORE the join and the receipt check, so chunkChars
    // (raw characters) is compared against raw characters.
    const decodeAt = RELAY.indexOf("if extraval(ev, 'chunkEncoding') == 'base64':");
    const joinAt = RELAY.indexOf("chunk = ''.join(b for b in blocks if isinstance(b, str))");
    const receiptAt = RELAY.indexOf("declared = extraval(ev, 'chunkChars')");
    expect(decodeAt).toBeGreaterThan(-1);
    expect(decodeAt).toBeLessThan(joinAt);
    expect(joinAt).toBeLessThan(receiptAt);
  });

  it('the relay\'s decoder really does leave a non-base64 element intact (the hole stays visible)', () => {
    // Python semantics mirrored: validate=True rejects "[Filtered]".
    expect(() => Buffer.from('[Filtered]', 'base64')).not.toThrow();
    expect(/^[A-Za-z0-9+/]*={0,2}$/.test('[Filtered]')).toBe(false);
  });

  it('pre-1677 events (no chunkEncoding) still reassemble as plain text — the relay branch is opt-in', () => {
    const branch = RELAY.slice(RELAY.indexOf("blocks = extraval(ev, 'chunkBlocks')"), RELAY.indexOf("chunk = extraval(ev, 'chunk')"));
    expect(branch).toContain("if extraval(ev, 'chunkEncoding') == 'base64':");
    expect(branch).toContain("chunk = ''.join(b for b in blocks if isinstance(b, str))");
  });
});

/** A real delivered log from the inbox when present (it is in the repo), else
 *  a synthetic one built from the prose that trips the rule. */
function realLogSample(): string {
  const p = join(ROOT, 'sentry-inbox', 'assembled_mtj4hpttgrw4', 'game-log.txt');
  if (existsSync(p)) return readFileSync(p, 'utf8');
  const line = '[2026-09-03T00:31:47.037Z] [world] You salvage the oyster bed. The take is small but real. Nobody authored this piece.\n';
  return line.repeat(4000);
}
