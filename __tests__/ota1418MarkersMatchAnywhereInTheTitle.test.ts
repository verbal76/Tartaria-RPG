/**
 * OTA-1418 — TWO MARKERS ONLY WORKED IN FIRST POSITION, AND IT HAD ALREADY BITTEN.
 *
 * Nine commit-title markers drive this repo's builds and publishes. Seven matched
 * anywhere in the message. Two — `[build-ios]` and `[build-ios-native]` — were
 * anchored with `^`, so they fired only when they LED the title.
 *
 * ⚠⚠ The odd ones out were the ones it had already cost. At OTA-302 a commit led
 * with `[build-aab]`, so the `[build-ios]` later in the same title was ignored,
 * the profile silently resolved to `preview`, and the run built an IPA that could
 * never reach TestFlight. That story is written in build-ios.yml's own header —
 * the file recorded the failure and kept the rule that caused it.
 *
 * A marker that only works in first position fails whenever two products ship
 * together, which is the normal case on a trunk that builds four.
 *
 * ⚠ WHAT WAS KEPT. The old comment justified `^` with "so a commit BODY
 * discussing [build-ios] doesn't false-positive production". That hazard is real
 * and has nothing to do with position WITHIN the title, so the profile
 * resolution still reads `$FIRST_LINE` only. Anywhere in the title; never the
 * body.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const WF = join(__dirname, '..', '.github', 'workflows');
const read = (f: string) => readFileSync(join(WF, f), 'utf8');
const IOS = read('build-ios.yml');
const NATIVE = read('build-ios-native.yml');
const DOCS = readFileSync(join(__dirname, '..', 'docs', 'WORKFLOWS.md'), 'utf8');

/** The shipped shell rule, mirrored: does this commit select a production iOS build? */
const firesProduction = (msg: string, marker = '[build-ios]') => {
  const firstLine = msg.split('\n')[0]!;
  return firstLine.includes(marker);
};

describe('OTA-1418 — the OTA-302 commit shape now works', () => {
  it('⚠⚠ a title that leads with another marker still fires iOS', () => {
    expect(firesProduction('[build-aab] [build-ios] OTA-302 — the promoted build')).toBe(true);
  });

  it('⚠⚠ …and leading with it still works, because nothing was traded away', () => {
    expect(firesProduction('[build-ios] OTA-XXXX — description')).toBe(true);
    expect(firesProduction('[build-ios] [submit-ios] OTA-XXXX — description')).toBe(true);
  });

  it('⚠ order is irrelevant, which is the whole point of the change', () => {
    for (const t of [
      '[build-ios] [build-aab] OTA-1 — a',
      '[build-aab] [build-exe] [build-ios] OTA-2 — b',
      'OTA-3 — c [build-ios]',
    ]) expect(firesProduction(t)).toBe(true);
  });

  it('⚠⚠ a BODY mention still does NOT select production — the guard that mattered', () => {
    // The hazard the old `^` was really defending against, and it survives:
    // resolution reads the first line only.
    expect(firesProduction('OTA-1418 — markers match anywhere in the title\n\nThis commit explains [build-ios] at length.')).toBe(false);
    expect(firesProduction('OTA-302 — notes\n\n[build-ios]')).toBe(false);
  });

  it('⚠⚠ THE COST, STATED: a TITLE that merely discusses the marker now fires it', () => {
    // The old `^` also happened to protect this case, and dropping the anchor
    // gives it up. Written as a passing expectation rather than left for
    // somebody to discover: under the new rule the string in the title IS the
    // instruction, wherever it sits and whatever the surrounding words mean.
    //
    // Accepted because the failure directions are not equal. This one builds an
    // IPA nobody asked for — minutes, and a build sitting unused. The anchor's
    // failure was a requested TestFlight build silently not happening, twice,
    // each time diagnosed from scratch. Cheap-and-loud beats quiet-and-wrong.
    //
    // ⚠ The mitigation is a habit, not code: do not put a marker in a commit
    // TITLE unless you mean it. Say "the ios marker" in prose instead.
    expect(firesProduction('Fix the false-positive on [build-ios] in titles')).toBe(true);
  });

  it('⚠ the native marker follows the identical rule', () => {
    expect(firesProduction('[build-aab] [build-ios-native] OTA-X — y', '[build-ios-native]')).toBe(true);
    expect(firesProduction('OTA-X — y\n\n[build-ios-native]', '[build-ios-native]')).toBe(false);
  });
});

describe('OTA-1418 — the source no longer anchors, and no sibling does either', () => {
  it('⚠⚠ both iOS resolutions dropped the ^ anchor', () => {
    expect(IOS).toContain('elif [[ "$FIRST_LINE" =~ \\[build-ios\\] ]]; then');
    expect(NATIVE).toContain('elif [[ "$FIRST_LINE" =~ \\[build-ios-native\\] ]]; then');
    expect(IOS).not.toContain('=~ ^\\[build-ios\\]');
    expect(NATIVE).not.toContain('=~ ^\\[build-ios-native\\]');
  });

  it('⚠⚠ …and both job gates use contains(), like the other five workflows', () => {
    expect(IOS).toContain("contains(github.event.head_commit.message, '[build-ios]')");
    expect(NATIVE).toContain("contains(github.event.head_commit.message, '[build-ios-native]')");
  });

  it('⚠⚠ NO workflow anywhere still prefix-anchors a marker', () => {
    // The class, not the two instances. A new workflow copying the old shape
    // fails here rather than shipping a marker that quietly does nothing.
    const offenders: string[] = [];
    for (const f of readdirSync(WF).filter((n) => n.endsWith('.yml'))) {
      const src = read(f);
      if (src.includes('startsWith(github.event.head_commit.message')) offenders.push(`${f}: startsWith()`);
      if (/=~ \^\\\[/.test(src)) offenders.push(`${f}: =~ ^\\[`);
    }
    expect(offenders).toEqual([]);
  });

  it('⚠ every marker still reads the FIRST LINE for profile selection', () => {
    for (const src of [IOS, NATIVE]) {
      expect(src).toContain('FIRST_LINE=$(echo "$COMMIT_MSG" | head -1)');
    }
  });
});

describe('OTA-1418 — the record, including what was deliberately left open', () => {
  it('⚠⚠ the OTA-302 failure is written where the rule lives', () => {
    expect(IOS).toContain('ANYWHERE IN THE TITLE, NOT ONLY AT THE FRONT');
    // ⚠ one line's worth — the sentence wraps in the source, and asserting
    // across the wrap would pin line width rather than the claim.
    expect(IOS).toContain('commit led with [build-aab]');
  });

  it('⚠⚠ …and the workaround notes it caused are kept, marked superseded', () => {
    // Two trailer comments at the foot of build-ios.yml were LIVE INSTRUCTIONS
    // to lead the title with the marker. Together they prove the anchor cost a
    // build TWICE — OTA-302, then arb172 — and that both times somebody wrote
    // down the workaround instead of changing the rule. Deleting them would
    // erase the evidence; leaving them unmarked would leave two sets of wrong
    // instructions in a file people copy from.
    expect(IOS).toContain('THE TWO NOTES BELOW ARE HISTORY NOW');
    expect(IOS).toContain('the anchor cost a build TWICE');
    expect(IOS).toContain('#   [superseded] arb172 trigger-touch');
    expect(IOS).toContain('#   [superseded] arb172 re-trigger #2');
    // …and neither still reads as a live instruction.
    expect(IOS).not.toContain('# arb172 trigger-touch — re-fire');
    expect(IOS).not.toContain('# arb172 re-trigger #2 — [build-ios] MUST be the first token');
  });

  it('⚠⚠ …and so is the reason the first-line limit was KEPT', () => {
    // Deleting the guard along with the anchor would have been the easy read of
    // "make it grep", and it would have traded a silent no-op for a silent
    // TestFlight submission.
    expect(IOS).toContain('THE FIRST-LINE RESTRICTION IS KEPT ON PURPOSE');
  });

  it('⚠⚠ the gap this OTA did NOT close is documented, not quietly left', () => {
    // Job gates and the OTA publisher still read the whole message. On the
    // publisher that means a BODY mention of [ota-hal] reaches live players —
    // which the OTA-1417 commit body would have done on its own.
    expect(DOCS).toContain('KNOWN GAP, NOT CLOSED HERE');
    expect(DOCS).toContain('publishes to the live player channel');
    expect(DOCS).toContain('the OTA-1417 commit body contained the string');
  });

  it('⚠ the docs table no longer teaches the old rule', () => {
    expect(DOCS).not.toContain('must **lead the commit title**');
    expect(DOCS).toContain('**Anywhere in the commit TITLE.**');
  });
});
