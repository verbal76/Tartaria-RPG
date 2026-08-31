jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠⚠ OTA-1593 — THE BOOT GETS CHECKPOINTS, AND THE LAUNCH LINE REACHES THE LOG.
//
// The owner's first log on 1592 (bundle mthbxrkq1jas, 2026-08-31T14:24) put
// OTA-1587's instrument to work and it delivered — two receipts:
//
//   launch: died 892ms into the process · not an OTA-apply boot
//   launch: died 859ms into the process · not an OTA-apply boot
//   its own model ledger at the last stamp: o0/r0/l0/p0/dn0
//
// which KILLED the orphaned-context hypothesis for #110: the dead processes
// were under a second old, followed no reload, and had opened ZERO model
// contexts. But the same receipts exposed the instrument's own ceiling: every
// kill still reads `native:cognition:done · alive 0ms after it`, because
// between the classifier's first job and the first screen NOTHING stamps the
// crumb — the heartbeat only runs on the exploration screen. The death window
// is real ~500ms wide and the ledger cannot see into it.
//
// Two closures, both instrument, no behaviour:
//   1. `setStage` (App.tsx's one boot-stage writer, 28 call sites) now mirrors
//      every stage into the breadcrumb as `boot:<stage>` — the next boot kill
//      names the exact step it died under.
//   2. The seam re-emits the launch line: hydrate() printed it into the
//      pre-slot buffer the save load replaces, so the owner's log had the
//      trace and the banner and not one launch line.

import { launchLineCached, noteLaunchFacts, launchFacts, _resetLaunchFactsForTest } from '../app/diagnostics/bootIdentity';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('OTA-1593 — every boot stage stamps the dying breath', () => {
  const APP = src('App.tsx');

  it('⚠⚠⚠ THE ONE WRITER MIRRORS INTO THE CRUMB — all 28 sites inherit it', () => {
    // At the definition, not per call site: a stamp added at 27 of 28 sites
    // leaves the missing one as the only unnamed death, which is the OTA-1584
    // lesson (a partial instrument misleads more than none).
    expect(APP).toContain('__TARTARIA_BOOT_STAGE = s;');
    expect(APP).toContain('save.stampBreadcrumbPhase(`boot:${s}`);');
  });

  it('⚠⚠ lazily and swallowed — a boot tracer that can break boot is worse than none', () => {
    const i = APP.indexOf('save.stampBreadcrumbPhase(`boot:${s}`);');
    const around = APP.slice(Math.max(0, i - 400), i + 100);
    expect(around).toContain("require('./app/engine/saveSystem')");
    expect(around).toContain('try {');
  });
});

describe('OTA-1593 — the launch line reaches the persisted log', () => {
  beforeEach(() => _resetLaunchFactsForTest());

  it('⚠⚠⚠ THE SEAM RE-EMITS FROM THE CACHE hydrate() RESOLVED', () => {
    const SLOT = src('app', 'state', 'slices', 'slotSlice.ts');
    expect(SLOT).toContain('bi.launchLineCached()');
    expect(SLOT).toContain("if (ll) get().appendLog('debug', ll);");
  });

  it('⚠⚠ the cache serves the line once resolved, and refuses to guess before', () => {
    // Null before boot resolves it: the seam staying silent is honest; a
    // fabricated "cold start" would be the OTA-1526 defect in miniature — the
    // instrument describing its own assumptions instead of the last session.
    expect(launchLineCached()).toBeNull();
    noteLaunchFacts(launchFacts(null));
    expect(launchLineCached()).toContain('not an OTA apply');
  });
});
