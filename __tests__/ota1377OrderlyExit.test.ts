/**
 * OTA-1377 — the freeze breadcrumb tells a clean exit from a death.
 *
 * Owner, on whether closing this adds instrumentation or fixes something:
 * *"so if I say close it are you putting in more trackers or a fix"* — a fix,
 * and one that SUBTRACTS. No new key, no new write, no new log line. The record
 * was already written, already survived, already read at boot; the half that
 * was missing is anything ever marking a session as having ended on purpose,
 * so the reader had one input and two possible causes and always guessed the
 * same one.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const store = src('app', 'state', 'gameStore.ts');
const save = src('app', 'engine', 'saveSystem.ts');

describe('OTA-1377 — the orderly exit is marked', () => {
  it('⚠⚠ the crumb is cleared when the app reaches background', () => {
    // This is the whole fix. Before it, `clearLiveBreadcrumb` had exactly ONE
    // caller — hydrate(), at boot — so nothing on the way OUT ever cleared it.
    expect(store).toContain("if (nextStr === 'background') void clearLiveBreadcrumb();");
  });

  it('⚠⚠ …as the LAST statement of the handler, so OTA-1357 keeps its window', () => {
    // OTA-1357 stamps a phase at the TOP of this handler because the third B9
    // freeze died within 1ms of a state change, on a path nothing else covered.
    // Clearing at the top would trade a false positive for a blind spot over
    // exactly that window. Anything that dies earlier never reaches the clear,
    // so the crumb survives and still names the transition it died in.
    const start = store.indexOf("rpAppStateSub = AppState.addEventListener");
    const handler = store.slice(
      start, store.indexOf('}) as { remove: () => void } | null;', start));
    const stamp = handler.indexOf('stampBreadcrumbPhase(');
    const clear = handler.indexOf('clearLiveBreadcrumb()');
    expect(stamp).toBeGreaterThanOrEqual(0);
    expect(clear).toBeGreaterThan(stamp);
    // nothing but the closing brace after it
    expect(handler.slice(clear).replace(/[^a-z(]/gi, '')).toBe('clearLiveBreadcrumb(');
  });

  it("⚠ 'background' only — never 'inactive'", () => {
    // iOS reports `inactive` for a notification banner, a Control Center pull,
    // a peek at the app switcher. None is an exit, and clearing on one would
    // drop the crumb for a freeze that happened while the banner was up.
    expect(store).not.toContain("nextStr === 'inactive') void clearLiveBreadcrumb");
    expect(store).not.toContain("nextStr !== 'active') void clearLiveBreadcrumb");
  });

  it('the invariant the crumb rests on is now actually enforced', () => {
    // saveSystem states it plainly; until now it was aspirational.
    expect(save).toContain('Cleared on an ORDERLY exit');
    // two writers, one reader, one clearer — and the clearer now has the two
    // callers the contract always implied: boot (consume) and background (mark).
    expect(store.match(/clearLiveBreadcrumb\(\)/g)?.length).toBe(2);
  });

  it('⚠ and it adds no new instrument — the fix is a deletion', () => {
    // No new AsyncStorage key, no new counter, no new log line. If a future
    // change needs one it should be argued for on its own; the value here is
    // that an existing signal starts meaning something, not that there is more
    // of it.
    const start = store.indexOf('rpAppStateSub = AppState.addEventListener');
    const handler = store.slice(
      start, store.indexOf('}) as { remove: () => void } | null;', start));
    expect(handler).not.toContain('AsyncStorage');
    expect(handler).not.toContain('setItem');
    // exactly one appendLog in the handler, the pre-existing appstate line
    expect(handler.match(/appendLog\(/g)?.length).toBe(1);
  });
});
