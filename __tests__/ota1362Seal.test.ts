// ⚠⚠ OTA-1362 — THE SEAL: HMAC-SHA256, checked against published vectors.
//
// GOLEM LINE ONLY.
//
// A hand-rolled hash that is subtly wrong is worse than no hash at all: it
// looks like a signature, it verifies against itself, and it protects nothing.
// So this suite does not test the seal against the seal. It tests SHA-256
// against the FIPS 180-4 published digests and HMAC against RFC 4231's test
// vectors, and separately against node's own crypto where it is available.
//
// The seal answers exactly one question — did the house whose card I hold write
// this? — and it is the third of three separate defences, not a replacement for
// either of the others:
//   1. sane?   → the validator's clamps and allowlists
//   2. wanted? → the pairing list
//   3. theirs? → here
import { sha256, hmacSha256, seal, sealMatches, mintSendingKey } from '../app/engine/fallenSeal';

function hex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 1) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}
function bytes(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

describe('OTA-1362 — SHA-256 against the published digests', () => {
  it('⚠⚠ FIPS 180-4 vectors', () => {
    expect(hex(sha256(bytes('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(bytes('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(sha256(bytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(hex(sha256(bytes('The quick brown fox jumps over the lazy dog'))))
      .toBe('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
  });

  it('⚠ the padding boundaries, where a hand-rolled digest goes wrong', () => {
    // 55/56/63/64 bytes straddle the "does the length fit in this block" case
    // that breaks naive implementations.
    expect(hex(sha256(bytes('a'.repeat(55))))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318');
    expect(hex(sha256(bytes('a'.repeat(56))))).toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a');
    expect(hex(sha256(bytes('a'.repeat(63))))).toBe('7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34');
    expect(hex(sha256(bytes('a'.repeat(64))))).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
    expect(hex(sha256(bytes('a'.repeat(1000))))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });

  it('⚠ multi-byte text hashes as its UTF-8 bytes, not as UTF-16 code units', () => {
    // The ledger carries epitaphs with em-dashes and player-chosen house names.
    // A digest that hashed code units would disagree with every other tool.
    const s = 'héllo wörld — Aetherkin';
    // Reference: node's crypto, when this runtime has it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto') as typeof import('crypto');
    const ref = nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex');
    // Our own UTF-8 encoder feeds the same bytes the digest expects.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(hmacSha256('k', s)).toBe(nodeCrypto.createHmac('sha256', 'k').update(s, 'utf8').digest('hex'));
    expect(ref).toHaveLength(64);
  });
});

describe('OTA-1362 — HMAC against RFC 4231', () => {
  it('⚠⚠ RFC 4231 test case 2', () => {
    expect(hmacSha256('Jefe', 'what do ya want for nothing?'))
      .toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  it('⚠⚠ a key LONGER than the 64-byte block is hashed first, per the spec', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto') as typeof import('crypto');
    const longKey = 'k'.repeat(200);
    expect(hmacSha256(longKey, 'ledger payload'))
      .toBe(nodeCrypto.createHmac('sha256', longKey).update('ledger payload', 'utf8').digest('hex'));
  });

  it('⚠ agrees with node crypto across assorted keys and payloads', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto') as typeof import('crypto');
    const cases: [string, string][] = [
      ['', ''],
      ['k', 'a'],
      [mintSendingKey(), JSON.stringify({ fallen: [{ name: 'Francis' }] })],
      ['key with spaces', 'x'.repeat(500)],
    ];
    for (const [k, m] of cases) {
      expect(hmacSha256(k, m)).toBe(nodeCrypto.createHmac('sha256', k).update(m, 'utf8').digest('hex'));
    }
  });
});

describe('OTA-1362 — sealing a payload', () => {
  it('⚠⚠ a payload seals and verifies, and ONE flipped character breaks it', () => {
    const key = mintSendingKey();
    const body = JSON.stringify({ v: 1, house: 'Sasmooch', fallen: [{ name: 'Francis', kills: 42 }] });
    const env = seal(key, body);
    expect(sealMatches(key, env.body, env.seal)).toBe(true);
    // The tamper this exists to catch: a corpse edited in flight.
    const tampered = body.replace('"kills":42', '"kills":9999');
    expect(sealMatches(key, tampered, env.seal)).toBe(false);
  });

  it('⚠⚠ another house cannot sign as you', () => {
    const body = '{"fallen":[]}';
    const mine = seal('my-key', body);
    expect(sealMatches('their-key', body, mine.seal)).toBe(false);
  });

  it('⚠ a missing, short, or non-string seal is refused rather than thrown at', () => {
    const body = '{"fallen":[]}';
    for (const bad of [undefined, null, 42, '', 'abc', 'z'.repeat(64)]) {
      expect(sealMatches('k', body, bad)).toBe(false);
    }
  });

  it('⚠ sending keys do not collide', () => {
    const keys = new Set(Array.from({ length: 200 }, () => mintSendingKey()));
    expect(keys.size).toBe(200);
  });
});
