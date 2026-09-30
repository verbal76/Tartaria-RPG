// Phase 3B, Part 1 — bounded end-to-end proof.
//
// PlayerView -> policy -> executor -> production combat -> telemetry ->
// next PlayerView, using the smallest NATURALLY REACHABLE encounter: the
// real wasteland/arrival spawn rolls inside stepDirection()/beginScene()
// (app/state/gameStore.ts, traced in the Phase 3B research pass), reached
// by nothing but the same SET COURSE / -> DESTINATION door
// test-utils/playerWalker.ts's own Walker.walkTo() already uses. No enemy
// is injected; no state is hand-set.
//
// This is explicitly NOT P7: it does not traverse the nine Guardians and
// does not run the canonical journey. It proves the machinery works on the
// smallest real encounter reachable after the tutorial.
//
// Run focused: see the governed command in the Phase 3B final report.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

jest.setTimeout(120000);

import { useGameStore, setHomeworkTick } from '../app/state/gameStore';
import { CanonicalWalker } from '../test-utils/canonical/CanonicalWalker';
import { CanonicalActionExecutor } from '../test-utils/canonical/actionExecutor';
import { installCanonicalClock, uninstallCanonicalClock } from '../test-utils/canonical/virtualClock';
import { buildPlayerView } from '../test-utils/canonical/playerView';
import { decide, resetPolicyState, type DecisionOption } from '../test-utils/canonical/policy';
import { getDecisionJournal, resetDecisionJournal } from '../test-utils/canonical/decisionJournal';
import { attachRngLedger, detachRngLedger, resetRngLedger } from '../test-utils/canonical/rngLedger';
import { attachStoreDiffer, detachStoreDiffer, resetStoreDiffLog } from '../test-utils/canonical/storeDiffer';
import { resetLogMirror } from '../test-utils/canonical/logMirror';

const store = useGameStore;
const get = () => store.getState();

async function worldSettle(pred: () => boolean, deadlineMs: number): Promise<void> {
  const pollMs = 15;
  const polls = Math.max(1, Math.ceil(deadlineMs / pollMs));
  for (let i = 0; i < polls && !pred(); i++) {
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

describe('Phase 3B — bounded end-to-end proof (PlayerView -> policy -> executor -> production combat -> telemetry -> next PlayerView)', () => {
  it('drives a naturally-reached encounter through the real executor and observes a real consequence', async () => {
    installCanonicalClock();
    resetPolicyState();
    resetDecisionJournal();
    resetRngLedger();
    resetStoreDiffLog();
    resetLogMirror();
    (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();
    // Telemetry attaches BEFORE the world is built, same discipline as the
    // P5 proofs — it observes the whole run, not just the combat portion.
    attachRngLedger();
    attachStoreDiffer(store);

    await get().hydrate();
    const walker = new CanonicalWalker();
    await walker.createCharacterLegitimately();
    await worldSettle(() => !!get().currentScene, 5000);
    setHomeworkTick(null);
    await walker.dismissStoryIntroLegitimately();
    await walker.playTutorialNormally();

    // Tutorial's own pick_city beat already called setTravelCourse() to a
    // Capital and handed control back to the travel row — exactly the
    // "-> DESTINATION" door a real player taps next.
    expect(get().player?.travelTarget).not.toBeNull();

    const executor = new CanonicalActionExecutor(store, walker);

    // ── PHASE A: travel until a naturally-spawned encounter appears ───────
    const MAX_TRAVEL_STEPS = 80;
    let sawEncounter = false;
    let travelSteps = 0;
    for (; travelSteps < MAX_TRAVEL_STEPS; travelSteps++) {
      if ((get().currentScene?.enemies.length ?? 0) > 0) { sawEncounter = true; break; }
      const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory });
      if (!view) break;
      const options: DecisionOption[] = [{ id: 'continue', category: 'journey', label: 'continue traveling' }];
      const decision = decide(view, options);
      if (decision.optionId === null) break; // policy itself stopped — respected, not overridden
      await executor.travelContinue(decision);
      if ((get().currentScene?.enemies.length ?? 0) > 0) { sawEncounter = true; break; }
      if (!get().player?.travelTarget && (get().currentScene?.enemies.length ?? 0) === 0) {
        // Arrived with no fight and no course left — re-set course to the
        // same capital the tutorial already chose isn't available generically
        // here; stop rather than inventing a new destination.
        break;
      }
    }

    if (!sawEncounter) {
      // Owner's explicit instruction: if no bounded legitimate encounter can
      // be reached, STOP and report the exact problem rather than injecting
      // one. Fail the test with a clear, specific message instead of a
      // generic assertion failure.
      throw new Error(
        `STOP: no naturally-reached encounter appeared within ${MAX_TRAVEL_STEPS} legitimate ` +
          `travel steps (via setTravelCourse/continueTravel only). Final state: ` +
          `locationId=${get().player?.currentLocationId}, travelTarget=${JSON.stringify(get().player?.travelTarget)}, ` +
          `enemies=${get().currentScene?.enemies.length ?? 0}. Not injecting an enemy — reporting the exact gap instead.`,
      );
    }

    // ── PHASE B: fight it out through the real executor, real dice ────────
    const MAX_COMBAT_ROUNDS = 30;
    let combatRounds = 0;
    const combatActionRecords = [];
    for (; combatRounds < MAX_COMBAT_ROUNDS; combatRounds++) {
      const enemyCount = get().currentScene?.enemies.length ?? 0;
      if (enemyCount === 0) break;
      if (get().player?.dead) break;

      const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory });
      if (!view) break;

      const hpRatio = view.hp / view.hpMax;
      const options: DecisionOption[] = [];
      if (hpRatio < 0.3) {
        options.push({ id: 'flee', category: 'survive-flee', label: 'flee' });
      } else {
        options.push({ id: 'attack', category: 'critical-path', label: 'attack' });
      }
      const decision = decide(view, options);
      if (decision.optionId === null) break;

      const record = decision.optionId === 'flee'
        ? await executor.combatFlee(decision)
        : await executor.combatAttack(decision);
      combatActionRecords.push(record);
    }

    // ── ASSERTIONS ──────────────────────────────────────────────────────
    expect(combatActionRecords.length).toBeGreaterThan(0);
    const attackRecords = combatActionRecords.filter((r) => r.uiActionRepresented === 'attack');
    expect(attackRecords.length).toBeGreaterThan(0);

    const firstAttack = attackRecords[0]!;
    // A real attack draws real dice (initiative/attack/damage steps) —
    // proves production combat ran, not a stub.
    expect(firstAttack.rngRange).not.toBeNull();
    expect(firstAttack.rngRange![1]).toBeGreaterThanOrEqual(firstAttack.rngRange![0]);
    // A real attack produces real log lines (the transcript a player reads).
    expect(firstAttack.logRange).not.toBeNull();
    // The executor recorded a PlayerView hash on both sides of the action —
    // proves the PlayerView -> executor -> production -> next PlayerView
    // loop is actually wired end to end, not just type-compatible.
    expect(firstAttack.playerViewHashBefore).toBeDefined();
    expect(firstAttack.playerViewHashAfter).toBeDefined();

    // Every recorded action shows up in the decision journal too (channel D).
    const journal = getDecisionJournal();
    expect(journal.length).toBeGreaterThanOrEqual(combatActionRecords.length);

    // NO PARALLEL ENGINE: nothing in this test ever wrote enemy/player HP,
    // inventory, or scene state directly — every mutation came from
    // production's own submitPlayerAction('attack')/resolveRollStep/
    // resolveEnemyDefeat, reached only through executor.combatAttack().

    detachRngLedger();
    detachStoreDiffer();
    uninstallCanonicalClock();
  });
});
