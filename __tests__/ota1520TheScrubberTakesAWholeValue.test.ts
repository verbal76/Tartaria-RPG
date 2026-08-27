// OTA-1520 — THE SCRUBBER TAKES A WHOLE VALUE.
//
// ⚠⚠⚠ NINE OF FORTY-NINE PARTS NEVER CONTAINED A WORD OF THE OWNER'S LOG. The
// first send that worked — OTA-1519, 2026-08-27, both devices, 588,818
// characters through the door — arrived with 135,000 characters replaced by the
// literal ten-character string `[Filtered]`. hal lost parts 1, 5, 9, 12, 16;
// golem lost 3, 9, 10, 11. The relay stitched them in as if they were text and
// wrote "27/27 parts" over a file with holes in it.
//
// ⚠⚠⚠ AND SENTRY HAD BEEN NAMING THE RULE THE WHOLE TIME, in `_meta`, in events
// already synced into this repo — nobody had read the field:
//
//   "context": { "chunk": { "": { "len": 15000,
//      "rem": [["@password:filter", "s", 0, 10]],
//      "chunks": [{ "type": "redaction", "text": "[Filtered]",
//                   "rule_id": "@password:filter", "remark": "s" }] } } }
//
// `@password:filter` is one of Sentry's DEFAULT data-scrubbing rules. Two
// properties of it did all the damage, and both are pinned below:
//   · it is a KeyValue pattern — tested against the VALUE, not merely the field
//     name, so the innocent key `chunk` was never the trigger;
//   · it has NO word boundaries — `secret` fires inside "the secret door",
//     `auth` fires inside "authored by".
// On a match the redaction is `replace_value`: the ENTIRE string goes.
//
// ⚠⚠ DOUBLE-VERIFIED BEFORE ONE LINE CHANGED, because three wrong root causes
// have already cost the owner a send apiece:
//   · forwards — the 588,818 characters that SURVIVED contain exactly ZERO
//     matches of that pattern. Perfect discrimination over 40 parts.
//   · backwards — the game's own prose is full of substrings that trip it:
//     `authored` ×246, `secrets` ×40, `secret` ×35, `authority`,
//     `authoritative`, `secretive`. A fantasy RPG log cannot avoid "secret".
//
// ⚠⚠⚠ SO THE DEFECT IS OURS. Sentry did exactly what it is for. We handed an
// all-or-nothing redactor a 15,000-character document as ONE scalar, and an
// all-or-nothing redactor destroys everything it is handed in one piece — plus,
// worse, the evidence of its own trigger. THAT is the error class, and the fix
// is not to dodge the scrubber: it is to stop offering it 15,000 characters at a
// time. Blocks of ~400 mean one "secret" costs the lines around it and the
// surviving neighbours finally name what tripped it.

import { readFileSync } from 'fs';
import { join } from 'path';
import { splitLogIntoBlocks, INLINE_BLOCK_CHARS, INLINE_CHUNK_CHARS } from '../app/diagnostics/sentryTransport';

jest.mock('../app/diagnostics/crashReporter', () => ({
  reportingEnabled: () => true,
  crashReportDsn: () => 'https://k@o.ingest.sentry.io/1',
}));

const ROOT = join(__dirname, '..');
const SRC = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
const RELAY = readFileSync(join(ROOT, '.github', 'workflows', 'sentry-inbox.yml'), 'utf8');

/** Relay's PASSWORD_KEY_REGEX, verbatim from relay-pii/src/regexes.rs — the rule
 *  Sentry named in `_meta`. Kept here so the fix is measured against the actual
 *  cause and not against a paraphrase of it. */
const PASSWORD_KEY_REGEX =
  /(password|secret|passwd|api[-_]key|apikey|auth|credentials|mysql_pwd|privatekey|private[-_]key|token[^\s]*[:=]|^otp$|^two[-_]factor$)/i;

function inlineBody(): string {
  const fn = SRC.slice(SRC.indexOf('export async function sendGameLogInline'));
  return fn.slice(0, fn.indexOf('\n}'));
}

/** A part shaped like the real thing: ordinary game log with one line of prose
 *  carrying the substring that cost the owner 15,000 characters. */
function partWithTheTrigger(): string {
  const lines: string[] = [];
  for (let i = 0; i < 300; i++) {
    lines.push(`[2026-08-27T02:0${i % 10}:${String(i % 60).padStart(2, '0')}.000Z] [system] `
      + `You cross the ridge and the wind takes the dust off it. (step ${i})`);
  }
  lines[150] = '[2026-08-27T02:05:00.000Z] [system] The secret door gives under your shoulder.';
  return lines.join('\n') + '\n';
}

describe('OTA-1520 — the split is lossless, which is the whole basis of the fix', () => {
  it('⚠⚠⚠ JOINING THE BLOCKS REPRODUCES THE SLICE EXACTLY — every character, every newline', () => {
    // If this is ever false the relay stitches a log that never existed, which
    // is a worse failure than the one being fixed.
    const cases = [
      '',
      'no newline at all',
      'a\nb\nc\n',
      '\n\n\n\n',
      partWithTheTrigger(),
      'x'.repeat(INLINE_BLOCK_CHARS * 3 + 7),           // no line breaks at all
      ('line\n'.repeat(4000)).slice(0, INLINE_CHUNK_CHARS), // a full-size part
    ];
    for (const c of cases) {
      expect(splitLogIntoBlocks(c).join('')).toBe(c);
    }
  });

  it('⚠⚠⚠ NO BLOCK EXCEEDS THE BUDGET — the cap IS the blast radius', () => {
    for (const c of [partWithTheTrigger(), 'z'.repeat(9_999), ('a\n'.repeat(9_000))]) {
      for (const b of splitLogIntoBlocks(c)) {
        expect(b.length).toBeLessThanOrEqual(INLINE_BLOCK_CHARS);
        expect(b.length).toBeGreaterThan(0); // an empty block is a wasted array slot
      }
    }
  });

  it('⚠⚠ A FULL PART STAYS A SMALL ARRAY — event trimming must never come near it', () => {
    // Floor is size/2 + 1, so a 15,000-char part cannot exceed ~75 elements.
    const full = ('a line of log that runs about forty chars\n'.repeat(1000)).slice(0, INLINE_CHUNK_CHARS);
    const blocks = splitLogIntoBlocks(full);
    expect(blocks.length).toBeLessThanOrEqual(80);
    expect(blocks.length).toBeGreaterThanOrEqual(INLINE_CHUNK_CHARS / INLINE_BLOCK_CHARS);
  });

  it('⚠ blocks break on line boundaries when one is in reach, so a redaction eats whole lines', () => {
    const blocks = splitLogIntoBlocks(partWithTheTrigger());
    // Every block but the last ends at a newline: the lines here are ~100 chars,
    // so a boundary always falls in the back half of a 400-char window.
    for (const b of blocks.slice(0, -1)) {
      expect(b.endsWith('\n')).toBe(true);
    }
  });
});

describe('OTA-1520 — measured against the actual rule, not a paraphrase of it', () => {
  it('⚠⚠⚠ THE OLD SHAPE LOSES THE WHOLE PART; THE NEW SHAPE LOSES ONE BLOCK', () => {
    const part = partWithTheTrigger();
    // The scalar `chunk` of OTA-1519: one match anywhere and `replace_value`
    // takes all of it. This is exactly what happened nine times on 08-27.
    expect(PASSWORD_KEY_REGEX.test(part)).toBe(true);
    const lostAsScalar = part.length;

    // The array of OTA-1520: the rule is applied to each string leaf, so only
    // the blocks that actually match are replaced.
    const blocks = splitLogIntoBlocks(part);
    const hit = blocks.filter((b) => PASSWORD_KEY_REGEX.test(b));
    const lostAsBlocks = hit.reduce((n, b) => n + b.length, 0);

    expect(hit).toHaveLength(1);                       // one line of prose, one block
    expect(lostAsBlocks).toBeLessThanOrEqual(INLINE_BLOCK_CHARS);
    expect(lostAsBlocks).toBeLessThan(lostAsScalar / 10); // and it is not close
  });

  it('⚠⚠ `secret` and `auth` INSIDE ORDINARY WORDS are the trigger — no word boundaries', () => {
    // This is the property that made the fault invisible: nothing in the log
    // looks remotely like a credential, and it still matches.
    for (const line of [
      'The secret door gives under your shoulder.',
      'Codex authored by the Tomekeep, third seal.',
      'You defer to the authority of the Arbiter.',
      'A secretive figure watches from the colonnade.',
    ]) {
      expect(PASSWORD_KEY_REGEX.test(line)).toBe(true);
    }
    // And ordinary log lines do not — which is why 40 of 49 parts came through.
    for (const line of [
      '[2026-08-27T02:09:00.677Z] You repair the Forge-Black Cowl',
      '[2026-08-27T02:10:33.963Z] arbiter: ambient held',
      "You've stood here before. (visit 2)",
    ]) {
      expect(PASSWORD_KEY_REGEX.test(line)).toBe(false);
    }
  });
});

describe('OTA-1520 — the sender hands over blocks, and says how many characters it owes', () => {
  it('⚠⚠⚠ THE SLICE GOES AS AN ARRAY, AND THE SCALAR IS GONE', () => {
    const body = inlineBody();
    expect(body).toContain('extra: { chunkBlocks: splitLogIntoBlocks(slice), chunkChars: slice.length },');
    // A lingering `chunk: slice` would be filtered on exactly the parts that
    // matter and would double the payload to do it.
    expect(body).not.toMatch(/chunk: slice/);
    // Still no attachment anywhere — OTA-1519's finding is not being undone.
    expect(body).not.toMatch(/attachments/);
  });

  it('⚠⚠ `chunkChars` SURVIVES AS THE RECEIPT — it is what makes a loss impossible to hide', () => {
    // The relay compares it against what it reassembles. Without it, a redacted
    // block, a trimmed array and a clean part all look identical after joining.
    expect(inlineBody()).toContain('chunkChars: slice.length');
  });
});

describe('OTA-1520 — the relay reads the reason, and stops stitching silent holes', () => {
  it('⚠⚠⚠ IT READS `_meta` AND NAMES THE RULE THAT TOOK THE TEXT', () => {
    expect(RELAY).toContain('def scrub_notes(ev, field):');
    expect(RELAY).toContain("meta = ((ev.get('_meta') or {}).get('context') or {}).get(field) or {}");
    expect(RELAY).toContain("for rem in (ann.get('rem') or []):");
    expect(RELAY).toContain("print(f'  ⚠ SCRUBBED: {bid} part {part}, {where} — {rule} took {lost} chars')");
  });

  it('⚠⚠⚠ AND THE ASSEMBLED README CONFESSES IT — "27/27 parts" over a holed file, never again', () => {
    expect(RELAY).toContain("note += (f' — SCRUBBED: {len(notes)} redactions cost {sum(l for _, _, l in notes)} chars'");
  });

  it('⚠⚠ EVERY PART IS LENGTH-CHECKED AGAINST ITS OWN RECEIPT', () => {
    expect(RELAY).toContain("declared = extraval(ev, 'chunkChars')");
    expect(RELAY).toContain('if isinstance(declared, int) and declared != got:');
    expect(RELAY).toContain('SHORT PARTS (declared chars != reassembled chars)');
  });

  it('⚠⚠ AND IT COUNTS IN UTF-16 UNITS, so it never cries wolf on a clean part', () => {
    // `chunkChars` is JavaScript `.length` — UTF-16 code units. Python counts
    // code points, so one emoji makes a whole part read 1 short. The check's
    // first live run did exactly that on part 2 of mtawqnivyk0q, and a watchdog
    // that reports phantom losses is one you learn to ignore.
    expect(RELAY).toContain("got = len(chunk.encode('utf-16-le')) // 2");
  });

  it('⚠⚠ blocks are read, and the pre-1520 scalar still reassembles', () => {
    // The two days of evidence that found this fault live in already-synced
    // events carrying a single `chunk`. Dropping them would delete the proof.
    expect(RELAY).toContain("blocks = extraval(ev, 'chunkBlocks')");
    expect(RELAY).toContain("chunk = ''.join(b for b in blocks if isinstance(b, str))");
    expect(RELAY).toContain("chunk = extraval(ev, 'chunk')");
  });

  it('⚠ the scrubber settings are PRINTED, so nothing about them is ever assumed', () => {
    expect(RELAY).toContain("for k in ('dataScrubber', 'dataScrubberDefaults', 'scrubIPAddresses',");
    expect(RELAY).toContain("'sensitiveFields', 'safeFields'):");
  });

  it('⚠⚠ AND THE SAFE-FIELDS LINE NO LONGER PROMISES A RESULT IT DID NOT DELIVER', () => {
    // ⚠⚠⚠ THIS PIN WAS WRITTEN OPTIMISTIC AND THE OWNER'S DEVICES CORRECTED IT.
    // It originally required the line "chunkBlocks exempt: YES — redactions
    // should be zero from here on". He saved `chunkBlocks` into the project's
    // Safe Fields, the relay read it back as safeFields: ['chunkBlocks'], and
    // the four logs he then sent on OTA-1520 were STILL scrubbed — 4 redactions,
    // ~344 chars each, same trigger positions. Safe Fields excludes by field
    // NAME; the slice is an ARRAY, so the rule runs on chunkBlocks.0, .1, .2 …
    // and the parent's exemption does not follow it down.
    // The line now reports only what is SET and defers the outcome to the
    // measurement, which is the honest division of labour between config and
    // evidence.
    expect(RELAY).toContain("print('  ⚠ chunkBlocks in safeFields: '");
    expect(RELAY).toContain('measured NOT to stop @password:filter on');
    expect(RELAY).not.toContain('redactions should be zero from here on');
  });

  it('⚠⚠⚠ A TRUNCATED LISTING CAN NEVER AGAIN PASS AS "NOTHING THERE"', () => {
    // The reader could not distinguish "those parts are absent from Sentry" from
    // "I stopped asking at row 100", and both look identical on a re-sync: zero
    // new files either way. The owner was told twice that his log was somewhere
    // it was not. The run now states which case it is, last, so it lands in the
    // tail of the job log instead of buried mid-stream.
    expect(RELAY).toContain("print('════ VERDICT ════')");
    expect(RELAY).toContain('page_audit[path] = (pages, len(rows), bool(url))');
    expect(RELAY).toContain("state = 'TRUNCATED — more remain' if capped else 'COMPLETE — cursor exhausted'");
    expect(RELAY).toContain('are UNPROVEN — they may simply be unread.');
    expect(RELAY).toContain('therefore ABSENT FROM SENTRY, not unread');
  });
});
