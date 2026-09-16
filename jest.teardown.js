// Jest teardown — the homework scheduler stops when the suite does.
//
// ⚠⚠⚠ WHY THIS IS A SEPARATE FILE AND NOT THREE LINES IN jest.setup.js.
// `setupFiles` runs BEFORE the test framework is installed, so `describe`,
// `beforeEach` and `afterAll` are all `undefined` there — measured, not assumed:
// a probe printed `beforeEach=undefined afterAll=undefined describe=undefined`
// from inside jest.setup.js. A hook registered there is silently never
// registered. `setupFilesAfterEnv` runs after the framework, which is where a
// hook has to live. (jest.setup.js's own `typeof beforeEach === 'function'`
// re-seed guard has therefore always been false; its load-bearing per-FILE
// re-seed happens at module scope and is unaffected. Reported, not changed
// here.)
//
// ⚠⚠ THE DEFECT. gameStore.setHomeworkTick(fn) arms a 5s setInterval and holds
// the handle at module scope; setHomeworkTick(null) clears it. That disarm is
// the product's own stop path — nothing here invents one — and nothing called
// it, in the app or in a test. Hydrate armed the interval and it outlived the
// suite that armed it.
//
// After teardown the interval still fires, homeworkTick re-enters app code, and
// Jest answers the first post-teardown `require` with "You are trying to
// `import` a file after the Jest environment has been torn down" — 58 of those
// in one full-fast run. The NEXT tick is worse: the dead environment hands back
// a module object whose exports are gone, so
// `const { findWeaponByName } = require('./crafting')` yields undefined and the
// call throws `_findWeaponByName2 is not a function` from a bare Node timer,
// outside any Jest frame. Nothing catches it and the WORKER DIES — which is
// where the "jest worker process was terminated by SIGKILL" and "child process
// exceptions" suite failures came from. The blamed suite is whichever one that
// worker held next, so the attribution moves run to run:
// ota1471TheGridHasToSettle carried it once and passed the next time with the
// same crash still firing. This is the "late imports remain, a different class"
// residue OTA-1798 named and left open.
//
// ⚠ ONLY IF THE SUITE ACTUALLY LOADED THE STORE. require.cache is per-suite
// here, so a suite that never touched gameStore is not made to load a
// 22k-line module in teardown. Product code is untouched: this calls an API
// that already exists, at the boundary that already exists, from the side that
// was missing.
globalThis.__TARTARIA_HOMEWORK_TEARDOWN_REGISTERED__ = true;

afterAll(() => {
  const cache = require.cache;
  if (!cache) return;
  const loaded = Object.keys(cache).some((k) => k.endsWith('/app/state/gameStore.ts'));
  if (!loaded) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require('./app/state/gameStore');
  if (typeof store.setHomeworkTick === 'function') store.setHomeworkTick(null);
});
