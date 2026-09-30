// Phase 6 — OWNER-AUTHORIZED MEASURED CANONICAL RUN.
//
// This is P7: the actual Nine-Core-Guardian journey, driven end to end
// through PlayerView -> policy.decide() -> CanonicalActionExecutor -> real
// production doors -> telemetry, exactly as governed by the Phase 6
// methodology correction and the "full legitimate action space" clarification.
//
// Character: race=mud_golem, faction=eternal_dynasty, motive=missing,
// pressure=owed (=DEFAULT_PRESSURE), sex=male — the owner's five explicit
// creation choices. Name: CANONICAL_NAME ("Aless Vance"), per the previously
// authorized canonical naming rule (name is mechanically neutral).
//
// NO GOD MODE: every mutation in this file goes through CanonicalActionExecutor
// (a real production door) or CanonicalWalker's already-audited helpers
// (createCharacterLegitimately/dismissStoryIntroLegitimately/
// playTutorialNormally/drainRolls/dismissPresentationIfPending). Nothing here
// writes player/enemy/world state directly, peeks RNG, or rewinds a roll.
//
// STOP CONDITIONS (owner's exact list): (1) an OWNER DECISION REQUIRED choice
// with no governance — recorded, not resolved; (2) a materially relevant
// APPARATUS GAP — LEGITIMATE PLAYER ACTION HAS NO FAITHFUL EXECUTOR; (3) loss
// of canonical-history integrity; (4) an unrecoverable legitimate-player
// blocker; (5) success (all 9 Cores + Nexus choice reached). A finite harness
// step/wall-time budget is a SIXTH, HARNESS-ONLY condition — reported as
// exactly that, never conflated with a legitimate in-game stop.

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

// Phase 6 (Section E.3) — this host must run under REAL production weather,
// not jest.setup.js's fixed "Eerie Calm" mock, or the run is not canonical.
jest.unmock('../app/engine/encounter');

jest.setTimeout(600000);

import { useGameStore } from '../app/state/gameStore';
import { bootFreshTutorialComplete } from '../test-utils/canonical/bootHelpers';
import { buildPlayerView } from '../test-utils/canonical/playerView';
import { decide, type DecisionOption } from '../test-utils/canonical/policy';
import { getDecisionJournal } from '../test-utils/canonical/decisionJournal';
import { detachRngLedger } from '../test-utils/canonical/rngLedger';
import { detachStoreDiffer } from '../test-utils/canonical/storeDiffer';
import { uninstallCanonicalClock } from '../test-utils/canonical/virtualClock';
import { resolveItemEffect } from '../app/engine/itemEffect';
import { findGearByName, findExplorationItemByName, findMaterialByName } from '../app/engine/crafting';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';
import { isCoreGuardian } from '../app/engine/coreGuardians';

const store = useGameStore;
const get = () => store.getState();

// The owner's five explicit creation choices (measured run authorization).
const CREATION_CHOICES = {
  raceId: 'mud_golem',
  factionId: 'eternal_dynasty',
  motiveId: 'missing',
  pressure: 'owed',
  sex: 'male' as const,
};

function view() {
  return buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory });
}

/** A player reads an item's card text ("restores N HP") to know whether it
 *  heals — resolveItemEffect() is the exact production lookup that text is
 *  drawn from (itemEffect.ts), applied here to the player's own named
 *  inventory rows, never to hidden enemy/world data. */
function findHealingItemName(): string | null {
  const inv = get().player?.inventory ?? [];
  for (const item of inv) {
    if (item.quantity <= 0) continue;
    const fx = resolveItemEffect(item.name, [findGearByName, findExplorationItemByName, findMaterialByName]);
    if (fx?.kind === 'consumable' && (fx.healHP ?? 0) > 0) return item.name;
  }
  return null;
}

describe('Phase 6 — MEASURED CANONICAL RUN (P7): Nine Core Guardians', () => {
  it('drives the owner-authorized character from ACTION 0001 toward the Nine Cores and the Nexus', async () => {
    const REPORT: string[] = [];
    const log = (line: string) => { REPORT.push(line); };

    log('=== MEASURED CANONICAL RUN — REPORT ===');
    log(`Creation: ${JSON.stringify(CREATION_CHOICES)}`);

    const { walker, executor } = await bootFreshTutorialComplete(true, CREATION_CHOICES);

    log(`ACTION 0001-000N complete: character created, story intro dismissed, tutorial played normally (12 beats, no SKIP).`);
    log(`Post-tutorial state: location=${get().player?.currentLocationId}, hp=${get().player?.hp}/${get().player?.hpMax}, travelTarget=${JSON.stringify(get().player?.travelTarget)}`);

    let stopped = false;
    let stopReason = '';
    const ownerDecisionsRequired: string[] = [];
    const apparatusGaps: string[] = [];

    function stop(reason: string): void {
      stopped = true;
      stopReason = reason;
    }

    // ── one leg of travel: SET COURSE (if needed) -> answer any departure
    // confirm -> -> DESTINATION until arrival, an encounter, or a stall. ────
    async function travelTo(locationId: string, maxSteps: number): Promise<'arrived' | 'encounter' | 'stalled'> {
      if (get().player?.currentLocationId === locationId && !get().player?.travelTarget) {
        return 'arrived';
      }
      if (get().player?.travelTarget?.locationId !== locationId) {
        const v = view();
        if (!v) return 'stalled';
        const d = decide(v, [{ id: 'set-course', category: 'route', label: `set course to ${locationId}` }]);
        if (d.optionId === null) return 'stalled';
        await executor.travelSetCourse(locationId, d);
      }
      if (get().pendingTravelConfirm) {
        const v = view();
        if (!v) return 'stalled';
        const d = decide(v, [{ id: 'confirm', category: 'route', label: 'LEAVE AND TRAVEL' }]);
        if (d.optionId === null) return 'stalled';
        await executor.confirmDeparture(d);
      }
      for (let i = 0; i < maxSteps; i++) {
        if ((get().currentScene?.enemies.length ?? 0) > 0) return 'encounter';
        if (get().player?.currentLocationId === locationId && !get().player?.travelTarget) return 'arrived';
        if (!get().player?.travelTarget) {
          // Course dropped without arriving and without an encounter —
          // a real player would tap SET COURSE again, once.
          const v = view();
          if (!v) return 'stalled';
          const d = decide(v, [{ id: 'set-course-again', category: 'route', label: `set course to ${locationId}` }]);
          if (d.optionId === null) return 'stalled';
          await executor.travelSetCourse(locationId, d);
          if (get().pendingTravelConfirm) {
            const v2 = view();
            if (!v2) return 'stalled';
            const d2 = decide(v2, [{ id: 'confirm', category: 'route', label: 'LEAVE AND TRAVEL' }]);
            if (d2.optionId === null) return 'stalled';
            await executor.confirmDeparture(d2);
          }
          if (!get().player?.travelTarget) return 'stalled';
          continue;
        }
        const v = view();
        if (!v) return 'stalled';
        const d = decide(v, [{ id: 'continue', category: 'journey', label: '→ DESTINATION' }]);
        if (d.optionId === null) return 'stalled';
        await executor.travelContinue(d);
      }
      return 'stalled';
    }

    // ── one legitimate combat, round by round, through the real executor. ──
    async function resolveCombat(maxRounds: number): Promise<'cleared' | 'dead' | 'stalled'> {
      for (let i = 0; i < maxRounds; i++) {
        if (get().player?.dead) return 'dead';
        const enemyCount = get().currentScene?.enemies.length ?? 0;
        if (enemyCount === 0) return 'cleared';
        const v = view();
        if (!v) return 'stalled';

        const hpRatio = v.hp / v.hpMax;
        const options: DecisionOption[] = [];
        if (hpRatio < 0.3) {
          const healName = findHealingItemName();
          if (healName) options.push({ id: 'heal', category: 'survive-heal', label: `heal self with ${healName}` });
          options.push({ id: 'flee', category: 'survive-flee', label: 'flee' });
        } else {
          options.push({ id: 'attack', category: 'engage', label: 'attack' });
        }
        const d = decide(v, options);

        // POSTMORTEM (read-only, additive) — full PLAYER_VISIBLE PlayerView
        // dump immediately before this decision, plus the exact options
        // offered and the decision taken. Pure reads of already-captured
        // state (view() above); adds no store call, no decide() call with a
        // different option set, and no RNG draw, so it cannot alter the
        // CANONICAL LIFE 1 sequence or outcome.
        // eslint-disable-next-line no-console
        console.log(
          `    [POSTMORTEM round ${i}] hp=${v.hp}/${v.hpMax} stamina=${v.stamina}/${v.staminaMax} ac=${v.ac} ` +
            `equipped=${JSON.stringify(v.equipped)} ` +
            `statusEffects=${JSON.stringify(v.statusEffects)} inventory=${JSON.stringify(v.inventory.map((it) => ({ name: it.name, qty: it.quantity, kind: it.kind })))} ` +
            `sceneWeather=${JSON.stringify(v.scene?.weather)} sceneDangerRating=${v.scene?.dangerRating} sceneThreatWord=${JSON.stringify(v.scene?.threatWord)} ` +
            `enemies=${JSON.stringify(v.scene?.enemies)} optionsOffered=${JSON.stringify(options)} ` +
            `decision=${JSON.stringify(d)}`,
        );

        if (d.optionId === null) return 'stalled';

        const enemyBefore = get().currentScene?.enemies.map((e, idx) => `${e.name}:${get().currentScene?.enemyHps[idx]}/${e.hp}`).join(',');
        if (d.optionId === 'heal') {
          const healName = findHealingItemName()!;
          await executor.useHealBatch(healName, 'self', 1, d);
        } else if (d.optionId === 'flee') {
          await executor.combatFlee(d);
        } else {
          await executor.combatAttack(d);
        }
        // eslint-disable-next-line no-console
        console.log(`    round ${i}: hp ${v.hp}->${get().player?.hp}/${get().player?.hpMax} choice=${d.optionId} enemiesBefore=[${enemyBefore}] enemiesAfter=[${get().currentScene?.enemies.map((e, idx) => `${e.name}:${get().currentScene?.enemyHps[idx]}/${e.hp}`).join(',')}]`);
      }
      return 'stalled';
    }

    // ── the whole run: visit every uncleared Lost Capital, summon and
    // defeat its Guardian, then head to the Nexus. ─────────────────────────
    const MAX_LEGS = LOST_CAPITAL_LOCATIONS.length + 2;
    let leg = 0;

    legLoop:
    for (; leg < MAX_LEGS && !stopped; leg++) {
      const mainQuest = get().player?.mainQuest;
      const coresRecovered = mainQuest?.coresRecovered ?? [];

      if (coresRecovered.length >= 9) break;

      const nextCapital = LOST_CAPITAL_LOCATIONS.find((id) => !coresRecovered.includes(id));
      if (!nextCapital) {
        stop('LOST_CAPITAL_LOCATIONS exhausted without 9 recorded cores — catalog/state mismatch.');
        break;
      }

      log(`--- Leg ${leg + 1}: → ${nextCapital} (cores so far: ${coresRecovered.length}/9) ---`);

      const travelOutcome = await travelTo(nextCapital, 200);
      if (travelOutcome === 'encounter') {
        log(`  encounter en route to ${nextCapital}`);
        const combatOutcome = await resolveCombat(80);
        if (combatOutcome === 'dead') { stop('Player died en route to a Lost Capital — canonical run ends in-fiction.'); break; }
        if (combatOutcome === 'stalled') { stop(`Combat stalled en route to ${nextCapital} — no legitimate option remained (policy returned stop).`); break; }
        // Resume travel after clearing the encounter.
        const resumeOutcome = await travelTo(nextCapital, 200);
        if (resumeOutcome !== 'arrived') { stop(`Could not resume travel to ${nextCapital} after clearing an encounter (outcome=${resumeOutcome}).`); break; }
      } else if (travelOutcome === 'stalled') {
        stop(`Travel to ${nextCapital} stalled — no legitimate travel option remained.`);
        break;
      }

      log(`  arrived at ${nextCapital}: hp=${get().player?.hp}/${get().player?.hpMax}, stamina=${get().player?.stamina}/${get().player?.staminaMax}`);

      // Rest, if needed, before summoning — a capable player does not walk
      // into a Guardian fight below readiness when rest is freely available.
      let restGuard = 0;
      while ((get().player?.hp ?? 0) / (get().player?.hpMax ?? 1) < 0.85 && restGuard++ < 20) {
        const v = view();
        if (!v) { stop('PlayerView unavailable while resting before a Guardian summon.'); break legLoop; }
        const d = decide(v, [{ id: 'rest', category: 'guardian-prep', label: 'rest' }]);
        if (d.optionId === null) break;
        await executor.restNormally(d);
      }

      // Summon the Guardian — retry through the two legitimate refusal
      // reasons a capable player can resolve (settling window, live hostiles);
      // any other refusal is an apparatus gap or a hard stop.
      let summonGuard = 0;
      let guardianUp = (get().currentScene?.enemies ?? []).some((e) => isCoreGuardian(e));
      while (!guardianUp && summonGuard++ < 30) {
        const v = view();
        if (!v) { stop('PlayerView unavailable before Guardian summon.'); break legLoop; }
        const d = decide(v, [{ id: 'summon', category: 'critical-path', label: '★ SUMMON' }]);
        if (d.optionId === null) { stop(`Policy refused to summon the Guardian at ${nextCapital} — no legitimate option offered.`); break legLoop; }
        const record = await executor.guardianSummon(d);
        if (record.result === 'ok') {
          guardianUp = (get().currentScene?.enemies ?? []).some((e) => isCoreGuardian(e));
          break;
        }
        // Refused — figure out why via the scene/log, and resolve the two
        // recoverable cases; anything else is a stop.
        const liveEnemies = get().currentScene?.enemies.length ?? 0;
        if (liveEnemies > 0 && !(get().currentScene?.enemies ?? []).some((e) => isCoreGuardian(e))) {
          log(`  summon refused: ${liveEnemies} live enemy(ies) present — clearing first.`);
          const combatOutcome = await resolveCombat(80);
          if (combatOutcome === 'dead') { stop('Player died clearing hostiles before a Guardian summon.'); break legLoop; }
          if (combatOutcome === 'stalled') { stop('Combat stalled clearing hostiles before a Guardian summon.'); break legLoop; }
          continue;
        }
        // Otherwise assume the settling-window pacing gate — rest and retry.
        const vv = view();
        if (!vv) { stop('PlayerView unavailable during the Guardian settling-window wait.'); break legLoop; }
        const dd = decide(vv, [{ id: 'rest', category: 'guardian-prep', label: 'rest' }]);
        if (dd.optionId === null) { stop(`Guardian summon at ${nextCapital} kept refusing and no legitimate wait/rest option remained.`); break legLoop; }
        await executor.restNormally(dd);
      }
      if (stopped) break;
      if (!guardianUp) {
        stop(`Could not raise the Guardian at ${nextCapital} within ${summonGuard} legitimate attempts.`);
        break;
      }

      log(`  Guardian raised at ${nextCapital} — engaging.`);
      const guardianFight = await resolveCombat(150);
      if (guardianFight === 'dead') { stop(`Player died to the Guardian at ${nextCapital} — canonical run ends in-fiction.`); break; }
      if (guardianFight === 'stalled') { stop(`Guardian combat at ${nextCapital} stalled — no legitimate option remained.`); break; }

      const coresAfter = get().player?.mainQuest?.coresRecovered ?? [];
      log(`  Guardian defeated at ${nextCapital}. Cores recovered: ${coresAfter.length}/9 (${JSON.stringify(coresAfter)}).`);
      if (!coresAfter.includes(nextCapital)) {
        apparatusGaps.push(
          `APPARATUS GAP — LEGITIMATE PLAYER ACTION HAS NO FAITHFUL EXECUTOR: Guardian at ${nextCapital} was defeated ` +
            `(no live enemies remain) but coresRecovered does not include it — the Core-grant path did not fire as expected.`,
        );
        stop(`Core grant did not register after defeating the Guardian at ${nextCapital} — see apparatus gap log.`);
        break;
      }
    }

    // ── if all 9 Cores are in hand, head to the Nexus. ─────────────────────
    if (!stopped && (get().player?.mainQuest?.coresRecovered?.length ?? 0) >= 9) {
      log('--- All 9 Cores recovered. Traveling to the Nexus. ---');
      const NEXUS_LOCATION_ID = 'mud_flood_nexus';
      const outcome = await travelTo(NEXUS_LOCATION_ID, 300);
      if (outcome === 'encounter') {
        const combatOutcome = await resolveCombat(80);
        if (combatOutcome === 'dead') stop('Player died en route to the Nexus with all 9 Cores in hand.');
        else if (combatOutcome === 'stalled') stop('Combat stalled en route to the Nexus.');
        else {
          const resumeOutcome = await travelTo(NEXUS_LOCATION_ID, 300);
          if (resumeOutcome !== 'arrived') stop(`Could not resume travel to the Nexus after clearing an encounter (outcome=${resumeOutcome}).`);
        }
      } else if (outcome === 'stalled') {
        stop('Travel to the Nexus stalled — no legitimate travel option remained.');
      }

      if (!stopped) {
        const phase = get().player?.mainQuest?.phase;
        log(`Arrived at the Nexus. mainQuest.phase = '${phase}'.`);
        if (phase === 'choice') {
          ownerDecisionsRequired.push(
            'OWNER DECISION REQUIRED: mainQuest.phase is "choice" — the ending (seal | unleash | preserve | stay, via ' +
              'chooseEndingMainQuest) is a genuine discretionary narrative choice with no capable-player default and no ' +
              'prior owner governance. Not resolved by this run. STOPPING here, at the threshold of the choice, as the ' +
              'success condition for this measured run.',
          );
          stop('SUCCESS: reached the Nexus with all 9 Cores and mainQuest.phase === "choice" — the ending itself is an OWNER DECISION REQUIRED, not resolved here.');
        } else {
          stop(`Reached the Nexus with all 9 Cores but mainQuest.phase is '${phase}', not 'choice' — investigate before choosing an ending.`);
        }
      }
    }

    if (!stopped) {
      stopReason = `Harness leg budget (${MAX_LEGS}) exhausted without reaching 9 Cores — a HARNESS-ONLY limit, not a legitimate in-game stop. ` +
        `Cores recovered: ${get().player?.mainQuest?.coresRecovered?.length ?? 0}/9.`;
    }

    log(`=== STOP === ${stopReason}`);
    if (ownerDecisionsRequired.length) {
      log('--- OWNER DECISIONS REQUIRED ---');
      for (const d of ownerDecisionsRequired) log(d);
    }
    if (apparatusGaps.length) {
      log('--- APPARATUS GAPS ---');
      for (const g of apparatusGaps) log(g);
    }
    log(`Final state: location=${get().player?.currentLocationId}, hp=${get().player?.hp}/${get().player?.hpMax}, dead=${get().player?.dead}, cores=${get().player?.mainQuest?.coresRecovered?.length ?? 0}/9, phase=${get().player?.mainQuest?.phase}`);
    log(`Total decision-journal entries: ${getDecisionJournal().length}. Total executor action records: ${executor.records.length}.`);
    log(`Walker direct-door uses (tutorial only): ${walker.directDoors.length}.`);

    // eslint-disable-next-line no-console
    console.log(REPORT.join('\n'));

    // ── ASSERTIONS — the report above is the record; these just prove the
    // run actually executed through the real machinery, not a stub. ────────
    expect(executor.records.length).toBeGreaterThan(0);
    expect(getDecisionJournal().length).toBeGreaterThan(0);
    expect(get().player).not.toBeNull();

    detachRngLedger();
    detachStoreDiffer();
    uninstallCanonicalClock();
  });
});
