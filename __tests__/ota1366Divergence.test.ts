/**
 * OTA-1366 — Step 2: the three real drifts the census found, closed.
 *
 * Step 1 (DIVERGENCE.md) normalised away comment prose and per-line OTA
 * numbering and found that 1,053 differing paths between golem and HAL collapse
 * to 14 real code differences — of which three were drift nobody chose:
 *
 *   E1  the `tracked` single-active backfill existed on HAL + html and NOT on
 *       golem + steam, while all four read `q.tracked !== false` (undefined ⇒
 *       tracked). A legacy save therefore showed EVERY faction quest as active
 *       on two lines and exactly one on the other two.
 *   E2  steam carried `if (opts?.front) queue.length = 0;` twice.
 *   E3  the clipboard fallback (visible payload text) existed on steam + html
 *       and not on golem + HAL, so a failed clipboard write left the player's
 *       ledger nowhere.
 *
 * ⚠⚠ THIS SUITE IS THE SAME ON ALL FOUR LINES, ON PURPOSE. That is the point of
 * the exercise: a drift test is worthless on the line that already had the fix
 * and only meaningful when every line runs it. If a future port drops one of
 * these, the line that lost it goes red rather than silently diverging again.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const store = src('app', 'state', 'gameStore.ts');
const tts = src('app', 'voice', 'TTSManager.ts');
const codex = src('app', 'components', 'LoreCodexBody.tsx');

describe('OTA-1366 E1 — the single-active backfill exists on THIS line', () => {
  it('⚠⚠ legacy saves get exactly one tracked faction quest', () => {
    expect(store).toContain('.map((q, i) => (q.tracked === undefined ? { ...q, tracked: i === 0 } : q))');
  });

  it('⚠⚠ …and the predicate it exists to serve is still the undefined-is-tracked one', () => {
    // This is WHY the backfill matters. If the readers were ever changed to
    // `tracked === true`, the backfill would stop being load-bearing and this
    // test should be re-argued rather than silently kept.
    expect(store.match(/tracked !== false/g)?.length).toBeGreaterThanOrEqual(20);
  });

  it('⚠ it never overwrites a choice the player already made', () => {
    // Only records with `tracked === undefined` are touched. A post-feature save
    // carries the player's explicit pick and must survive load untouched.
    const i = store.indexOf('.map((q, i) => (q.tracked === undefined');
    const line = store.slice(i, store.indexOf('\n', i));
    expect(line).toContain('q.tracked === undefined ?');
    expect(line).toContain(': q)');   // the else branch is the record, unmodified
  });
});

describe('OTA-1366 E2 — the voice queue clears once, not twice', () => {
  it('⚠ exactly one front-clear in the whole file', () => {
    expect(tts.match(/if \(opts\?\.front\) queue\.length = 0;/g)?.length).toBe(1);
  });

  it('⚠ and it is the one that kept its explanation', () => {
    // The surviving copy sits under the OTA-635 comment block that says why an
    // urgent line clears the backlog. The deleted copy wore a trailing comment
    // ten lines further down — a port artifact with the reason detached.
    const i = tts.indexOf('if (opts?.front) queue.length = 0;');
    expect(tts.slice(Math.max(0, i - 400), i)).toContain('front: an urgent line');
  });
});

describe('OTA-1366 E3 — the payload travels as text when the clipboard will not', () => {
  it('⚠⚠ both boxes exist', () => {
    expect(codex).toContain("const [payloadIn, setPayloadIn] = useState('');");
    expect(codex).toContain("const [payloadOut, setPayloadOut] = useState('');");
    expect(codex).toContain('style={styles.payloadBox}');
  });

  it('⚠⚠ the export survives a clipboard that refuses', () => {
    // setPayloadOut happens BEFORE the copy is attempted, so a throwing
    // clipboard cannot cost the player the payload — which was the actual
    // failure: "Could not copy. Try again." and the ledger nowhere.
    const i = codex.indexOf('setPayloadOut(payload);');
    const j = codex.indexOf('Clipboard.setStringAsync(payload)', i);
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(codex).toContain('let copied = false;');
    expect(codex).toContain('This machine would not give up its clipboard.');
  });

  it('⚠⚠ the paste box takes precedence over the clipboard on import', () => {
    // Typed text wins. A stale clipboard silently beating what the player just
    // pasted in would be the worst of both.
    expect(codex).toContain('let text = payloadIn.trim();');
    const i = codex.indexOf('let text = payloadIn.trim();');
    const j = codex.indexOf('Clipboard.getStringAsync()', i);
    expect(j).toBeGreaterThan(i);
    expect(codex).toContain('if (text.length === 0) {');
  });

  it('⚠ a clipboard read that THROWS is handled, not just an empty one', () => {
    // The browser case refuses with an exception rather than returning ''.
    expect(codex).toContain("try { text = (await Clipboard.getStringAsync()) ?? ''; } catch { text = ''; }");
  });

  it('⚠ a successful import clears the paste box, so it cannot be re-imported', () => {
    expect(codex).toContain("if (out.added > 0 || out.rests > 0) setPayloadIn('');");
  });
});

describe('OTA-1366 — the census itself is repeatable', () => {
  it('⚠ the tooling ships with the finding, so this can be re-run after any port', () => {
    // A one-off audit rots. The script is the thing that keeps step 1 true.
    expect(() => src('scripts', 'divergence.py')).not.toThrow();
    expect(() => src('scripts', 'divergence-show.py')).not.toThrow();
    expect(src('scripts', 'divergence.py')).toContain('BASE = ');
  });
});
