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
// here — ⚠ OTA-1831 HAS NOW CHANGED IT, at the bottom of this file, for exactly
// the reason this paragraph gives. The note stands as written: this is where the
// hook had to go.)
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

// ⚠⚠⚠ OTA-1831 — THE PER-TEST RE-SEED, REGISTERED WHERE HOOKS EXIST.
// jest.setup.js seeds Math.random and publishes the reset; it cannot register a
// hook (see the top of this file). Without this line every test in a file shares
// one stream, so its dice depend on how many draws happened earlier — and ~270k
// of those draws per gameStore import belong to Jest's own source-map quicksort,
// which moves whenever any loaded file's byte layout moves. That made unrelated
// suites flip on edits that roll nothing. With it, every test starts at the same
// seed regardless of what was imported or how it was formatted.
// Registered from setupFilesAfterEnv, so it runs before any suite's own
// beforeEach; a test that overrides Math.random locally still wins in its own
// scope and restores to this baseline afterwards.
beforeEach(() => {
  if (typeof globalThis.__TARTARIA_RESEED_RANDOM__ === 'function') {
    globalThis.__TARTARIA_RESEED_RANDOM__();
  }
});

// ⚠⚠⚠ OTA-1891 — A TIMER MAY NOT OUTLIVE THE SUITE THAT ARMED IT.
//
// THE FLAKE. CI shard 2/4 on golem-line c725bd01 failed `ota952ZeroGrip › eating a field kit…`
// with `TypeError: Cannot read properties of undefined (reading 'OS')` out of PiperTTSManager's
// prewarmKokoro — in a suite that never touches a voice. The same code had passed that shard on the
// PR run. The log carried the tell: "You are trying to `import` a file after the Jest environment
// has been torn down. From __tests__/importSave.test.ts." (it prints on every importSave run; it is
// reproducible with `jest --runInBand importSave ota952ZeroGrip`).
//
// ⚠⚠ THE MECHANISM, same family as the homework interval above. gameStore's vendor-warm settle timer
// (a 2.5 s setTimeout, VENDOR_WARM_SETTLE_MS) is armed when a scene installs a vendor, and nothing in
// a suite disarms it. It fires after the suite that armed it has been torn down, `require`s into the
// dead environment, and gets a module whose exports are gone (`Platform` undefined). That throws from
// a bare Node timer, outside any Jest frame, where the worker's uncaught-exception handler hands it to
// WHICHEVER test is running next — here a perfectly healthy suite. So the red lands on an innocent test
// and moves from run to run, which is exactly what made it look like a flake of that test.
//
// ⚠ THE FIX IS HERE AND NOT IN THE PRODUCT. On a device there is no environment to tear down, the timer
// is correct, and nothing in the app changes. A suite owns the timers it armed: at the end of the file
// every timer still pending is cleared, so nothing can fire into a dead environment. Tracked per file
// (this file runs once per suite in its own global), real timers only — a suite that installs fake
// timers replaces these globals and is unaffected. Handles keep the identity Node gave them, and a
// timer that already ran or was cleared by its owner is forgotten, so this never touches a live one.
(() => {
  const g = globalThis;
  if (g.__TARTARIA_TIMER_TRACKER__) return;
  const realSetTimeout = g.setTimeout;
  const realClearTimeout = g.clearTimeout;
  const realSetInterval = g.setInterval;
  const realClearInterval = g.clearInterval;
  if (typeof realSetTimeout !== 'function' || typeof realSetInterval !== 'function') return;
  const pendingTimeouts = new Set();
  const pendingIntervals = new Set();
  const carry = (wrapper, original) => {
    // util.promisify(setTimeout) and friends hang their behaviour off properties of the original.
    for (const k of Reflect.ownKeys(original)) {
      if (k === 'length' || k === 'name' || k === 'prototype') continue;
      try { Object.defineProperty(wrapper, k, Object.getOwnPropertyDescriptor(original, k)); } catch { /* skip */ }
    }
    return wrapper;
  };
  const trackedSetTimeout = carry(function setTimeout(fn, ms, ...rest) {
    if (typeof fn !== 'function') return realSetTimeout.call(this, fn, ms, ...rest);
    let handle;
    handle = realSetTimeout.call(this, (...args) => { pendingTimeouts.delete(handle); return fn(...args); }, ms, ...rest);
    pendingTimeouts.add(handle);
    return handle;
  }, realSetTimeout);
  const trackedClearTimeout = carry(function clearTimeout(handle) {
    pendingTimeouts.delete(handle);
    return realClearTimeout.call(this, handle);
  }, realClearTimeout);
  const trackedSetInterval = carry(function setInterval(fn, ms, ...rest) {
    const handle = realSetInterval.call(this, fn, ms, ...rest);
    pendingIntervals.add(handle);
    return handle;
  }, realSetInterval);
  const trackedClearInterval = carry(function clearInterval(handle) {
    pendingIntervals.delete(handle);
    return realClearInterval.call(this, handle);
  }, realClearInterval);
  g.setTimeout = trackedSetTimeout;
  g.clearTimeout = trackedClearTimeout;
  g.setInterval = trackedSetInterval;
  g.clearInterval = trackedClearInterval;
  /** Clear every timer this suite armed and has not since run or cleared. Returns how many. */
  const clearLeaked = () => {
    let n = 0;
    for (const h of Array.from(pendingTimeouts)) { realClearTimeout(h); n += 1; }
    for (const h of Array.from(pendingIntervals)) { realClearInterval(h); n += 1; }
    pendingTimeouts.clear();
    pendingIntervals.clear();
    return n;
  };
  g.__TARTARIA_TIMER_TRACKER__ = { clearLeaked, pending: () => pendingTimeouts.size + pendingIntervals.size };
  afterAll(() => { clearLeaked(); });
})();
