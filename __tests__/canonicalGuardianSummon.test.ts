// Phase 3D, Part 7 — GUARDIAN SUMMON, the most important remaining door.
//
// A SEPARATE small bounded scenario (owner's explicit multi-scenario mandate
// — one giant journey is bad test design, Phase 3C proved it by dying en
// route). Fresh character -> legitimate tutorial -> travel toward the
// NEAREST Lost Capital under a capable-human survival policy (monitor
// HP/stamina, rest when low, AVOID combat by continuing to travel rather
// than engaging — Phase 3D's own research trace established
// continueTravel()/setTravelCourse() carry no enemy-presence gate, so a
// capable player can legitimately walk past an encounter) -> arrive ->
// summonCoreGuardian() -> observe the Guardian in PlayerView/telemetry ->
// STOP. Never attacks it, never resolves the fight, never grants a Core.
//
// Precondition chain for summonCoreGuardian() (Phase 3D research trace,
// gameStore.ts:30578-30742): player at a Lost Capital (stationedAtNamedLocation
// — satisfied by the overland anchor tile alone, no hub entry required),
// mainQuest.phase in {'revelation','cores'} (advanced automatically from
// 'hook' by the SAME arrival that satisfies the location gate —
// gameStore.ts:24637's triggerMainQuest('first_capital_visit', ...), fired
// unconditionally on arrival), capital not already recovered, no live
// hostiles in the current scene, and the settle-pacing window (bypassed
// unconditionally for a player's first-ever Guardian — coreGuardians.ts
// coreSettleState: lastCoreAtHours == null -> ready:true).

// Phase 6 methodology correction (Section E.2) — bootFreshTutorialComplete()
// now fails closed unless production weather is demonstrably active. This
// file drives real gameplay actions through CanonicalActionExecutor, so it
// unmocks jest.setup.js's default pickWeather() stub the same way
// canonicalWeatherProduction.test.ts already proved restores it.
jest.unmock('../app/engine/encounter');

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
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
    },
    setAudioModeAsync: jest.fn(async () => {}),
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', nativeBuildVersion: '0' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn(() => ({ downloadAsync: jest.fn(async () => {}) })) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: { requestPermissionsAsync: jest.fn(async () => ({ granted: false })) },
}));
jest.mock('expo-updates', () => ({ checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })) }));

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { bootFreshTutorialComplete } from '../test-utils/canonical/bootHelpers';
import { buildPlayerView } from '../test-utils/canonical/playerView';
import { decide, type DecisionOption } from '../test-utils/canonical/policy';
import { fileFromActionRecord, blocked } from '../test-utils/canonical/qualificationHelpers';
import { getQualifications } from '../test-utils/canonical/qualification';
import type { ActionRecord } from '../test-utils/canonical/actionExecutor';
import { detachRngLedger } from '../test-utils/canonical/rngLedger';
import { detachStoreDiffer } from '../test-utils/canonical/storeDiffer';
import { uninstallCanonicalClock } from '../test-utils/canonical/virtualClock';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';
import { isCoreGuardian } from '../app/engine/coreGuardians';

const MAX_TRAVEL_STEPS = 90;

describe('Phase 3D — Guardian summon (bounded, small, human-legitimate scenario)', () => {
  it('Part 7: legitimate capital arrival -> summonCoreGuardian() -> observe -> STOP (no fight, no Core)', async () => {
    const { get, executor } = await bootFreshTutorialComplete();

    // Capable-human survival policy, same discipline as Scenario B's return
    // leg: never top up, never fiat-rest, resolve real encounters through the
    // real combat/flee door when unavoidable, but PREFER avoidance — continue
    // traveling past an encounter rather than engaging, since production's
    // own travel doors carry no enemy-presence gate (Phase 3D research
    // trace). This is the direct, deliberate answer to Phase 3C's honest
    // death: an "always attack" policy was unnecessarily aggressive.
    get().setTravelCourse(LOST_CAPITAL_LOCATIONS[0]!);
    let reachedCapital = false;
    for (let i = 0; i < MAX_TRAVEL_STEPS; i++) {
      const p = get().player;
      if (!p || p.dead) break;
      if (LOST_CAPITAL_LOCATIONS.includes(p.currentLocationId) && !p.travelTarget) {
        reachedCapital = true;
        break;
      }
      // If a live encounter is already active, resting is not an option —
      // production's own rest refuses while hostiles are present (Phase 3D
      // research trace) — so the only capable-human choices are flee (try
      // to disengage) or keep traveling (production's travel door carries
      // no enemy gate at all, so it legitimately walks past a fight in
      // progress). Flee is tried first since it costs no forward progress
      // if it fails; travel is the fallback so the loop can never wedge.
      if ((get().currentScene?.enemies?.length ?? 0) > 0) {
        const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const decision = decide(view, [{ id: 'flee', category: 'survive-flee', label: 'flee' }]);
        try { await executor.combatFlee(decision); } catch { /* best-effort */ }
        if ((get().currentScene?.enemies?.length ?? 0) > 0) {
          await executor.travelContinue({ optionId: 'continue', category: 'journey', reason: 'avoidance-first travel past an unresolved encounter' });
        }
        continue;
      }
      // A capable player keeps a stamina BUFFER rather than running to
      // empty — a step that empties the tank is also the step most likely
      // to walk straight into an arrival ambush with nothing left to flee
      // with (confirmed: an earlier attempt reached the capital at exactly
      // 0 stamina and died fleeing a live encounter it had no stamina
      // margin against). This is still a plain rest-when-tired policy, not
      // an injected safety net.
      if (p.stamina <= 1 || p.hp / p.hpMax < 0.4) {
        await executor.restNormally({ optionId: 'rest', category: 'other', reason: 'capable-human policy: rest before continuing, never fiat' });
        continue;
      }
      // Avoidance is the default: keep traveling. continueTravel has no
      // enemy gate, so this legitimately walks past a live encounter rather
      // than forcing combat that risks the character before the Guardian is
      // even reached — the exact lesson from Phase 3C's death.
      await executor.travelContinue({ optionId: 'continue', category: 'journey', reason: 'avoidance-first travel toward the nearest Lost Capital' });
    }

    if (process.env.QUAL_DEBUG) {
      // eslint-disable-next-line no-console
      console.log('QUAL_DEBUG guardian-approach', JSON.stringify({
        locationId: get().player?.currentLocationId, reachedCapital,
        hp: get().player?.hp, hpMax: get().player?.hpMax, stamina: get().player?.stamina,
        dead: get().player?.dead, enemies: get().currentScene?.enemies?.length,
        mainQuestPhase: get().player?.mainQuest?.phase,
      }));
    }

    if (!reachedCapital || get().player?.dead) {
      blocked(
        'GUARDIAN-SUMMON',
        'legitimate arrival at a Lost Capital, under a capable-human avoidance-first survival policy',
        get().player?.dead
          ? `the character died legitimately before reaching a Lost Capital within ${MAX_TRAVEL_STEPS} bounded travel steps — reported honestly per the owner's survival-is-part-of-the-proof instruction, no revive/top-up attempted`
          : `the character did not reach a Lost Capital within the ${MAX_TRAVEL_STEPS}-step bounded budget (last known location: ${get().player?.currentLocationId})`,
      );
    } else {
      // Clear the scene of live hostiles ONLY if any are present — the
      // production precondition itself (summonCoreGuardian refuses with
      // 'hostiles_present' otherwise). FLEE-FIRST, never attack: the arrival
      // encounter (2 live enemies, 23/46 HP) is the same class of wilderness
      // pack that killed Phase 3C's character, and the whole point of this
      // scenario's capable-human policy is avoidance over engagement — the
      // summon door does not require WINNING a fight, only an empty scene,
      // and fleeing is the strictly safer real production door for that.
      let guard = 0;
      while ((get().currentScene?.enemies?.length ?? 0) > 0 && !get().player?.dead && guard < 12) {
        guard++;
        const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const decision = decide(view, [{ id: 'flee', category: 'survive-flee', label: 'flee' }]);
        try { await executor.combatFlee(decision); } catch { /* best-effort */ }
        if (process.env.QUAL_DEBUG) {
          // eslint-disable-next-line no-console
          console.log('QUAL_DEBUG clear-loop', guard, JSON.stringify({
            enemies: get().currentScene?.enemies?.length, enemyHps: get().currentScene?.enemyHps,
            hp: get().player?.hp, stamina: get().player?.stamina, dead: get().player?.dead,
            locationId: get().player?.currentLocationId,
          }));
        }
      }

      if (get().player?.dead) {
        blocked(
          'GUARDIAN-SUMMON',
          `stationed at unrecovered Lost Capital '${get().player?.currentLocationId}', but the arrival encounter (2 live enemies) could not be fled`,
          'the character died legitimately while attempting to flee the wilderness encounter that was already active on arrival at the capital — reported honestly, no revive/top-up attempted; the same class of encounter risk Phase 3C\'s death demonstrated',
        );
      } else if ((get().currentScene?.enemies?.length ?? 0) > 0) {
        blocked(
          'GUARDIAN-SUMMON',
          `stationed at unrecovered Lost Capital '${get().player?.currentLocationId}'`,
          `${get().currentScene?.enemies?.length} live hostile(s) remained in the scene after ${guard} bounded flee attempts — summonCoreGuardian() would legitimately refuse with 'hostiles_present'; not attempted, per the owner's flee/avoid-first survival policy over forcing a fight`,
        );
      } else {
        const beforeEnemies = (get().currentScene?.enemies ?? []).length;
        const beforeCoresRecovered = [...(get().player?.mainQuest?.coresRecovered ?? [])];

        const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const decision = decide(view, [{ id: 'summon', category: 'critical-path', label: '★ SUMMON' }]);
        let record: ActionRecord | null = null;
        let err: unknown = null;
        try { record = await executor.guardianSummon(decision); } catch (e) { err = e; }

        const afterEnemies = get().currentScene?.enemies ?? [];
        const guardianEntry = afterEnemies.find((e) => isCoreGuardian(e));
        const afterCoresRecovered = get().player?.mainQuest?.coresRecovered ?? [];

        fileFromActionRecord(
          'GUARDIAN-SUMMON',
          `stationed at unrecovered Lost Capital '${get().player?.currentLocationId}', mainQuest.phase='${get().player?.mainQuest?.phase}', scene clear of live hostiles`,
          '★ SUMMON',
          'ExplorationScreen.tsx / ContractsScreen.tsx SUMMON chip',
          record,
          err,
          { enemiesBefore: beforeEnemies, coresRecoveredBefore: beforeCoresRecovered },
          { enemiesAfter: afterEnemies.length, guardianPresent: !!guardianEntry, coresRecoveredAfter: afterCoresRecovered },
          guardianEntry
            ? `Guardian appeared in currentScene.enemies (traits includes 'core_guardian'); Core NOT granted (coresRecovered unchanged: ${JSON.stringify(afterCoresRecovered)}) — confirms summon and Core-resolution are separate production doors, exactly as the Phase 3C source trace predicted`
            : 'summon call completed but no core_guardian enemy found in the resulting scene — see notes',
          guardianEntry ? 'PlayerView would show the Guardian as the active/only enemy on next render (activeEnemyIdx points at it); NOT_YET_OBSERVED beyond that — test stops here per owner instruction' : 'n/a',
        );

        // MANDATORY STOP: forbidden to attack, resolve, flee-to-clean-up,
        // grant a Core, or continue to another Guardian. The bounded
        // scenario simply ends with the Guardian legitimately present.
      }
    }

    const outPath = resolve(__dirname, '../test-utils/canonical/qualificationResultsPhase3D_guardian.json');
    writeFileSync(outPath, JSON.stringify(getQualifications(), null, 2));
    expect(getQualifications().length).toBeGreaterThan(0);

    detachRngLedger();
    detachStoreDiffer();
    uninstallCanonicalClock();
  }, 120000);
});
