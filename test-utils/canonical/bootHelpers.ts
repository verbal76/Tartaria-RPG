// Phase 3D — shared boot sequence for bounded scenario test files.
//
// Every Phase 3D test file still needs its OWN jest.mock(...) calls at the
// top (jest hoists per-file; a shared non-test module can't declare them on
// a caller's behalf), but the actual "fresh character -> legitimate tutorial
// -> telemetry attached" sequence is identical everywhere and belongs in one
// place, per the owner's "multiple small bounded scenarios" instruction —
// small scenarios still deserve to share setup, not reinvent it five times.

import { useGameStore, setHomeworkTick } from '../../app/state/gameStore';
import { pickWeather } from '../../app/engine/encounter';
import { qwen } from '../../app/ai/engines';
import { CanonicalWalker } from './CanonicalWalker';
import { CanonicalActionExecutor } from './actionExecutor';
import { installCanonicalClock } from './virtualClock';
import { resetPolicyState } from './policy';
import { resetDecisionJournal } from './decisionJournal';
import { attachRngLedger, resetRngLedger } from './rngLedger';
import { attachStoreDiffer, resetStoreDiffLog } from './storeDiffer';
import { resetLogMirror } from './logMirror';
import { resetSnapshots } from './snapshot';
import { resetQualifications } from './qualification';
import { assertProductionWeatherActive, assertNoLlm } from './hostProfile';

const store = useGameStore;
const get = () => store.getState();

export async function worldSettle(pred: () => boolean, deadlineMs: number): Promise<void> {
  const pollMs = 15;
  const polls = Math.max(1, Math.ceil(deadlineMs / pollMs));
  for (let i = 0; i < polls && !pred(); i++) {
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export interface BootedRun {
  store: typeof useGameStore;
  get: () => ReturnType<typeof useGameStore.getState>;
  walker: CanonicalWalker;
  executor: CanonicalActionExecutor;
}

/**
 * Fresh character -> legitimate 12-beat tutorial -> telemetry attached.
 * Leaves the character exactly where CanonicalWalker.playTutorialNormally()
 * leaves it: in the tutorial hub, travelTarget set toward a Lost Capital,
 * tutorialExploreChosen true (lockdown lifted, free hub movement unlocked).
 * Does NOT reset the qualification ledger — callers share one ledger per
 * process unless they explicitly resetQualifications() themselves (a single
 * jest test FILE is one process; multiple it() blocks in the same file
 * accumulate into the same qualificationResults.json unless reset).
 */
export async function bootFreshTutorialComplete(
  resetQualLedger = true,
  creationChoices?: { raceId?: string; factionId?: string; motiveId?: string; pressure?: string; sex?: 'male' | 'female' },
  nameOverride?: string,
): Promise<BootedRun> {
  installCanonicalClock();
  resetPolicyState();
  resetDecisionJournal();
  resetRngLedger();
  resetStoreDiffLog();
  resetLogMirror();
  resetSnapshots();
  if (resetQualLedger) resetQualifications();
  (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();

  // Phase 6 methodology correction (Section E.2/E.3) — this shared boot
  // routine is what every gameplay-driving canonical host calls, so it is
  // where the fail-closed host-profile checks belong: a host file that
  // forgets jest.unmock('../app/engine/encounter') (jest.setup.js:133-146
  // globally pins pickWeather() to a fixed mock for every test by default)
  // now throws here rather than silently completing a whole canonical run
  // under the wrong weather system. assertNoLlm(qwen) uses the REAL
  // production singleton (app/ai/engines.ts's qwen), not a fake — under the
  // standard jest.setup.js native-module stubs (llama.rn/onnxruntime/
  // react-native-executorch, all inert) this always resolves qwenReady:false,
  // proving the boundary rather than assuming it. Both run BEFORE
  // attachRngLedger() so their own RNG draws (assertProductionWeatherActive
  // samples pickWeather 20x) are host-boot diagnostics, excluded from the
  // gameplay RNG stream the ledger will track from here on.
  assertProductionWeatherActive(pickWeather);
  assertNoLlm(qwen);

  attachRngLedger();
  attachStoreDiffer(store);

  await get().hydrate();
  const walker = new CanonicalWalker();
  if (nameOverride) walker.canonicalNameOverride = nameOverride;
  await walker.createCharacterLegitimately(creationChoices);
  await worldSettle(() => !!get().currentScene, 5000);
  setHomeworkTick(null);
  await walker.dismissStoryIntroLegitimately();
  await walker.playTutorialNormally();

  const executor = new CanonicalActionExecutor(store, walker);
  return { store, get, walker, executor };
}
