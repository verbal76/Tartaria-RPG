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
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
// ⚠ OTA-1395 — reads the store AND its slices. Part 4 is splitting gameStore into
// slices and the literals these pins look for travel with the code; a pin like
// this was never a claim about a FILE. See test-utils/storeSource.ts.
import { storeSource } from '../test-utils/storeSource';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const save = src('app', 'engine', 'saveSystem.ts');

// ⚠⚠ OTA-1396 — AND HERE IS WHERE `storeSource()` STOPPED BEING ENOUGH, which is worth
// stating rather than papering over. Slice 5 did not move the app-state handler into a
// SLICE; it moved it DOWN, out of the store's neighbourhood entirely, into
// `app/diagnostics/runtimePressureWatch.ts`. `storeSource()` is "the store plus its
// slices" on purpose and must stay that — widening it to "wherever the code went" would
// make every pin in the repo unfalsifiable.
//
// So this suite names the handler's file explicitly, and the ONE claim that was really
// about the whole app — how many callers `clearLiveBreadcrumb` has — is now counted
// across `app/` instead of across whatever text happened to be concatenated. That is
// strictly stronger: a third caller added in a screen would have slipped past the old
// count, and cannot slip past this one.
const store = storeSource();
const watch = src('app', 'diagnostics', 'runtimePressureWatch.ts');

function appFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) appFiles(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

describe('OTA-1377 — the orderly exit is marked', () => {
  it('⚠⚠ the crumb is cleared when the app reaches background', () => {
    // This is the whole fix. Before it, `clearLiveBreadcrumb` had exactly ONE
    // caller — hydrate(), at boot — so nothing on the way OUT ever cleared it.
    expect(watch).toContain("if (nextStr === 'background') void clearLiveBreadcrumb();");
  });

  it('⚠⚠ …as the LAST statement of the handler, so OTA-1357 keeps its window', () => {
    // OTA-1357 stamps a phase at the TOP of this handler because the third B9
    // freeze died within 1ms of a state change, on a path nothing else covered.
    // Clearing at the top would trade a false positive for a blind spot over
    // exactly that window. Anything that dies earlier never reaches the clear,
    // so the crumb survives and still names the transition it died in.
    const start = watch.indexOf("rpAppStateSub = AppState.addEventListener");
    const handler = watch.slice(
      start, watch.indexOf('}) as { remove: () => void } | null;', start));
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
    for (const body of [store, watch]) {
      expect(body).not.toContain("nextStr === 'inactive') void clearLiveBreadcrumb");
      expect(body).not.toContain("nextStr !== 'active') void clearLiveBreadcrumb");
    }
  });

  it('the invariant the crumb rests on is now actually enforced', () => {
    // saveSystem states it plainly; until now it was aspirational.
    expect(save).toContain('Cleared on an ORDERLY exit');
    // two writers, one reader, one clearer — and the clearer now has the two
    // callers the contract always implied: boot (consume) and background (mark).
    // ⚠ OTA-1396 — counted across `app/` rather than across the store text, because
    // "two callers" was always a claim about the application and never about a file.
    // saveSystem.ts is excluded: that is where the function is DEFINED.
    //
    // ⚠⚠⚠ OTA-1521 — A THIRD CALLER, AND IT IS ARGUED, NOT SNUCK IN. This list was
    // never a cap on how many orderly exits may exist; it enumerated the ones that
    // DID exist, so that a careless fourth could not appear unnoticed. The contract
    // above is the real rule — "Cleared on an ORDERLY exit" — and the OTA reload is
    // the most deliberate exit the app has: it chooses it.
    // It was missing, and the cost is measured. `reloadAsync()` tears the process
    // down with no orderly JS exit, so hydrate() promoted the surviving crumb into
    // a `native-death`. Eight of the eighteen death records in the owner's logs
    // follow "ota: Restarting to apply…" by 4s · 4s · 5s · 5s · 6s · 7s · 18s ·
    // 103s — six of them inside seven seconds. Nearly half the crash ledger was the
    // app killing itself on purpose and being recorded as a victim, which is why an
    // OTA was spent on a memory-pressure hypothesis that could not have been right.
    // So: three callers, each named, and a fourth still cannot appear in silence.
    // ⚠⚠ OTA-1521 — MATCH CODE, NOT PROSE. This scanned raw file text, so
    // buildInfo.ts registered as a "caller" the moment an OTA note happened to
    // mention `clearLiveBreadcrumb()` in a comment. A guard that counts English
    // sentences as call sites reports drift that is not there and, worse,
    // teaches you to edit the guard instead of reading it.
    const codeOf = (f: string) => readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const callers = appFiles(join(__dirname, '..', 'app'))
      .filter((f) => !f.endsWith(join('engine', 'saveSystem.ts')))
      .filter((f) => /clearLiveBreadcrumb\(\)/.test(codeOf(f)));
    expect(callers.map((f) => f.split('app/')[1]).sort()).toEqual([
      'diagnostics/runtimePressureWatch.ts',   // background — mark the orderly exit
      'state/slices/bootSlice.ts',             // boot — consume the survivor
      'updates/checkAndApplyOTA.ts',           // OTA reload — mark the deliberate exit
    ]);
  });

  it('⚠ and it adds no new instrument — the fix is a deletion', () => {
    // No new AsyncStorage key, no new counter, no new log line. If a future
    // change needs one it should be argued for on its own; the value here is
    // that an existing signal starts meaning something, not that there is more
    // of it.
    const start = watch.indexOf('rpAppStateSub = AppState.addEventListener');
    const handler = watch.slice(
      start, watch.indexOf('}) as { remove: () => void } | null;', start));
    expect(handler).not.toContain('AsyncStorage');
    expect(handler).not.toContain('setItem');
    // exactly one appendLog in the handler, the pre-existing appstate line
    expect(handler.match(/appendLog\(/g)?.length).toBe(1);
  });
});
