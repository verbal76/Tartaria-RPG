/**
 * OTA-1419 — WRITING ABOUT THE MARKER PUBLISHED TO LIVE PLAYERS.
 *
 * `eas-update-golem.yml` resolved which product line to publish by grepping the
 * WHOLE commit message. So any commit whose BODY mentioned `[ota-hal]` — in
 * prose, in an explanation, in a quoted policy — published to the live channel
 * at real testers.
 *
 * ⚠⚠ NOT THEORETICAL. Two commits the same day proved it:
 *   · OTA-1417's body carried the string while explaining what the marker does.
 *     It had the marker in its title too, so no harm landed — but the body alone
 *     would have been enough.
 *   · OTA-1418's body had to be written with the iOS markers deliberately
 *     UNBRACKETED, or it would have allocated a 10x macOS runner to start a job
 *     and immediately skip.
 *
 * When writing about your own tooling can ship to players, the tooling is wrong,
 * not the writing.
 *
 * ⚠ `head -1`, NOT a `^` anchor. The marker may still sit anywhere in the title
 * so it composes with others. Anchoring is the exact defect OTA-1418 removed
 * from the iOS workflows, where it silently cost two requested builds; trading
 * one silent failure for another is not a fix.
 *
 * ⚠ THE FIREWALL IS UNTOUCHED. An unattended push still cannot reach HAL — that
 * check is separate and older. What changed is only WHERE the marker is read.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const WF = join(__dirname, '..', '.github', 'workflows');
const PUB = readFileSync(join(WF, 'eas-update-golem.yml'), 'utf8');

/** The shipped rule, mirrored: `echo "$MSG" | head -1 | grep -q '\[marker\]'`. */
const fires = (msg: string, marker: string) => msg.split('\n')[0]!.includes(marker);

describe('OTA-1419 — the owner\'s live channel is reached by the title alone', () => {
  it('⚠⚠ a marker in the TITLE still publishes to HAL', () => {
    expect(fires('OTA-1420 — a fix [ota-hal]', '[ota-hal]')).toBe(true);
    expect(fires('[ota-hal] OTA-1420 — a fix', '[ota-hal]')).toBe(true);
  });

  it('⚠⚠ a marker in the BODY no longer does — the whole point', () => {
    const body = [
      'OTA-1419 — the publisher reads the title only',
      '',
      'This commit explains that [ota-hal] routes a publish to the live',
      'channel. Before this change, saying so was enough to do it.',
    ].join('\n');
    expect(fires(body, '[ota-hal]')).toBe(false);
  });

  it('⚠⚠ the OTA-1417 body, which is the actual evidence', () => {
    // Its title carried the marker too, so nothing went wrong. Stripped of the
    // title, the body alone would have published to live players.
    const body417 = [
      'OTA-1417 — HAL catches up',
      '',
      'This commit carries [ota-hal] in its title, which is the documented',
      'deliberate act that routes a publish to hal2001.',
    ].join('\n');
    expect(fires(body417.split('\n').slice(1).join('\n'), '[ota-hal]')).toBe(false);
  });

  it('⚠ order within the title is still free — this is head -1, not an anchor', () => {
    // OTA-1418 removed a `^` anchor because a marker that only works first
    // silently does nothing when two products ship together. Not reintroduced.
    expect(fires('[ota-android-only] OTA-X — y [ota-hal]', '[ota-hal]')).toBe(true);
    expect(PUB).not.toMatch(/grep -q '\^/);
  });
});

describe('OTA-1419 — all three reads, not just the loud one', () => {
  it('⚠⚠ every marker grep in the publisher is piped through head -1', () => {
    const greps = PUB.split('\n').filter((l) => l.includes('grep -q') && l.includes('COMMIT_MSG'));
    expect(greps.length).toBe(3);
    for (const g of greps) expect(g).toContain('| head -1 |');
  });

  it('⚠ the platform markers matter too, and they fail QUIETER', () => {
    // These narrow a publish rather than starting one. A body false-positive
    // would have silently dropped a platform from an otherwise correct publish,
    // and the run would still have reported success.
    expect(PUB).toContain("head -1 | grep -q '\\[ota-ios-only\\]'");
    expect(PUB).toContain("head -1 | grep -q '\\[ota-android-only\\]'");
    expect(fires('OTA-X — y\n\nmentions [ota-ios-only]', '[ota-ios-only]')).toBe(false);
  });

  it('⚠⚠ the unattended-push firewall is untouched', () => {
    // The thing that actually keeps players safe from an accidental publish is
    // older and separate. This OTA must not have loosened it.
    expect(PUB).toContain('NOTHING UNATTENDED REACHES A PLAYER');
    expect(PUB).toContain("an unselected (automatic) run may only target golem");
    expect(PUB).toContain('is not the trunk.');
  });
});

describe('OTA-1419 — the record', () => {
  it('⚠⚠ the reason is written where the pipe is', () => {
    expect(PUB).toContain('THE TITLE, NOT THE WHOLE MESSAGE');
    expect(PUB).toContain('the tooling is wrong');
  });

  it('⚠⚠ …including why it is head -1 and not an anchor', () => {
    expect(PUB).toContain('NOT a `^` anchor, deliberately');
  });

  it('⚠ no workflow anywhere re-anchors a marker, publisher included', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(WF).filter((n) => n.endsWith('.yml'))) {
      const src = readFileSync(join(WF, f), 'utf8');
      if (src.includes('startsWith(github.event.head_commit.message')) offenders.push(f);
      if (/=~ \^\\\[/.test(src)) offenders.push(f);
      if (/grep -q '\^\\\[/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
