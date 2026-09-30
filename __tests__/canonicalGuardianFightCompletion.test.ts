// Phase 12 — GUARDIAN COMBAT COMPLETION QUALIFICATION.
//
// Answers exactly ONE question, distinct from "can a fresh character
// survive the whole journey to a Guardian" (that is Life 4's own question,
// not this apparatus's): once a legitimate production state capable of
// summoning a Guardian exists, can the canonical combat apparatus actually
// conduct that Guardian encounter through the real production combat
// system to a production-native terminal state — GUARDIAN_DEFEATED,
// PLAYER_DIED, or PLAYER_FLED?
//
// Steps 1-2 (fresh character -> tutorial -> avoidance-first travel to the
// nearest Lost Capital -> clear the arrival encounter by fleeing ->
// summon) are VERBATIM REUSE of canonicalGuardianSummon.test.ts's own
// already-qualified bounded scenario — no new capability, no shortcut, no
// fabricated combat power. Step 3 (the fight itself) is VERBATIM REUSE of
// canonicalLife3.test.ts's own resolveCombat() wrapper — the same
// attack/dodge/block/advance/retreat/flee/heal option-construction and the
// same decide()/execute() wiring through real production doors, at the
// same 300-round Guardian budget Life 3 already used. Nothing new is added
// to combat intelligence, policy, or observability here. This file adds
// exactly one thing: it does NOT stop after the Guardian appears — it
// plays the fight out, and records why it ended the way it did.
//
// ONE run. No retry on a bad outcome, no Guardian-shopping, no rerun for a
// better result — a death, a flee, or a budget-exhausted stall are all
// legitimate answers to "does the apparatus resolve this fight honestly."

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

jest.setTimeout(600000);

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { bootFreshTutorialComplete } from '../test-utils/canonical/bootHelpers';
import { buildPlayerView, type PlayerView } from '../test-utils/canonical/playerView';
import { decide, type DecisionOption } from '../test-utils/canonical/policy';
import { resolveCombatRounds, describeCombatOutcome, type CombatOutcome, type CombatRoundTrace } from '../test-utils/canonical/combatLoop';
import { getLogMirror } from '../test-utils/canonical/logMirror';
import { fileFromActionRecord, blocked } from '../test-utils/canonical/qualificationHelpers';
import { getQualifications } from '../test-utils/canonical/qualification';
import { buildArtifactPaths } from '../test-utils/canonical/artifactIdentity';
import type { ActionRecord } from '../test-utils/canonical/actionExecutor';
import { detachRngLedger } from '../test-utils/canonical/rngLedger';
import { detachStoreDiffer } from '../test-utils/canonical/storeDiffer';
import { uninstallCanonicalClock } from '../test-utils/canonical/virtualClock';
import { resolveItemEffect } from '../app/engine/itemEffect';
import { findGearByName, findExplorationItemByName, findMaterialByName } from '../app/engine/crafting';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';
import { isCoreGuardian, capitalIdFromGuardian, GUARDIANS_BY_CAPITAL, tierForKills } from '../app/engine/coreGuardians';

const MAX_TRAVEL_STEPS = 90;
const GUARDIAN_ROUND_BUDGET = 300; // owner instruction: keep at 300, do not raise it in this task.

type TerminalVerdict =
  | 'GUARDIAN_DEFEATED'
  | 'PLAYER_DIED'
  | 'PLAYER_FLED'
  | 'ROUND_BUDGET_EXHAUSTED'
  | 'NO_LEGAL_ACTION';

type Mechanism = 'A_FORWARD_PROGRESS' | 'B_WALKER_ACTION_LOOP' | 'C_MUTUAL_STALEMATE' | 'D_HEAL_REGEN_EQUILIBRIUM' | 'E_RANGE_MOVEMENT_LOOP' | 'F_FLEE_LOOP' | 'G_OBSERVABILITY_GAP' | 'H_PRODUCTION_DEFECT' | 'I_UNKNOWN';

describe('Phase 12 — Guardian combat completion qualification (bounded, single run)', () => {
  it('carries the first legitimately-reachable Guardian fight through real production combat to a terminal state (or explains exactly why it did not)', async () => {
    const REPORT: string[] = [];
    const log = (line: string) => REPORT.push(line);
    log('=== GUARDIAN COMBAT COMPLETION QUALIFICATION ===');

    const { get, executor } = await bootFreshTutorialComplete();

    // ── Step 1: reach the first Lost Capital, avoidance-first — VERBATIM
    // reuse of canonicalGuardianSummon.test.ts's own already-qualified
    // travel policy. ──
    get().setTravelCourse(LOST_CAPITAL_LOCATIONS[0]!);
    let reachedCapital = false;
    for (let i = 0; i < MAX_TRAVEL_STEPS; i++) {
      const p = get().player;
      if (!p || p.dead) break;
      if (LOST_CAPITAL_LOCATIONS.includes(p.currentLocationId) && !p.travelTarget) {
        reachedCapital = true;
        break;
      }
      if ((get().currentScene?.enemies?.length ?? 0) > 0) {
        const v = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const d = decide(v, [{ id: 'flee', category: 'survive-flee', label: 'flee' }]);
        try { await executor.combatFlee(d); } catch { /* best-effort */ }
        if ((get().currentScene?.enemies?.length ?? 0) > 0) {
          await executor.travelContinue({ optionId: 'continue', category: 'journey', reason: 'avoidance-first travel past an unresolved encounter' });
        }
        continue;
      }
      if (p.stamina <= 1 || p.hp / p.hpMax < 0.4) {
        await executor.restNormally({ optionId: 'rest', category: 'other', reason: 'capable-human policy: rest before continuing, never fiat' });
        continue;
      }
      await executor.travelContinue({ optionId: 'continue', category: 'journey', reason: 'avoidance-first travel toward the nearest Lost Capital' });
    }

    let finalVerdict: 'A_QUALIFIED' | 'B_APPARATUS_DEFECT' | 'C_BUDGET_REQUALIFICATION_NEEDED' | 'D_PRODUCTION_DEFECT' | 'E_BLOCKED_PREREQUISITE' | 'F_MORE_EVIDENCE' = 'F_MORE_EVIDENCE';
    let verdictNote = '';
    let terminal: TerminalVerdict | null = null;
    let mechanism: Mechanism | null = null;
    let guardianTrace: CombatRoundTrace[] = [];
    let startState: Record<string, unknown> = {};
    let coreConsequence: Record<string, unknown> | null = null;

    if (!reachedCapital || get().player?.dead) {
      finalVerdict = 'E_BLOCKED_PREREQUISITE';
      verdictNote = get().player?.dead
        ? `character died legitimately before reaching a Lost Capital within ${MAX_TRAVEL_STEPS} bounded travel steps`
        : `did not reach a Lost Capital within ${MAX_TRAVEL_STEPS} steps (last known location: ${get().player?.currentLocationId})`;
      blocked('GUARDIAN-FIGHT-COMPLETION', 'legitimate arrival at a Lost Capital', verdictNote);
    } else {
      // ── Step 2: clear the arrival encounter, flee-first — VERBATIM reuse. ──
      let guard = 0;
      while ((get().currentScene?.enemies?.length ?? 0) > 0 && !get().player?.dead && guard < 12) {
        guard++;
        const v = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const d = decide(v, [{ id: 'flee', category: 'survive-flee', label: 'flee' }]);
        try { await executor.combatFlee(d); } catch { /* best-effort */ }
      }

      if (get().player?.dead) {
        finalVerdict = 'E_BLOCKED_PREREQUISITE';
        verdictNote = 'character died legitimately while attempting to flee the wilderness encounter active on arrival at the capital';
        blocked('GUARDIAN-FIGHT-COMPLETION', `stationed at unrecovered Lost Capital '${get().player?.currentLocationId}'`, verdictNote);
      } else if ((get().currentScene?.enemies?.length ?? 0) > 0) {
        finalVerdict = 'E_BLOCKED_PREREQUISITE';
        verdictNote = `${get().currentScene?.enemies?.length} live hostile(s) remained after ${guard} bounded flee attempts — summonCoreGuardian() would legitimately refuse with 'hostiles_present'`;
        blocked('GUARDIAN-FIGHT-COMPLETION', `stationed at unrecovered Lost Capital '${get().player?.currentLocationId}'`, verdictNote);
      } else {
        // ── Step 3: summon — VERBATIM reuse. ──
        const beforeEnemies = (get().currentScene?.enemies ?? []).length;
        const beforeCoresRecovered = [...(get().player?.mainQuest?.coresRecovered ?? [])];
        const v = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const d = decide(v, [{ id: 'summon', category: 'critical-path', label: '★ SUMMON' }]);
        let record: ActionRecord | null = null;
        let err: unknown = null;
        try { record = await executor.guardianSummon(d); } catch (e) { err = e; }

        const afterEnemies = get().currentScene?.enemies ?? [];
        const guardianEntry = afterEnemies.find((e) => isCoreGuardian(e));
        const afterCoresRecovered = get().player?.mainQuest?.coresRecovered ?? [];

        fileFromActionRecord(
          'GUARDIAN-FIGHT-COMPLETION',
          `stationed at unrecovered Lost Capital '${get().player?.currentLocationId}', mainQuest.phase='${get().player?.mainQuest?.phase}', scene clear of live hostiles`,
          '★ SUMMON', 'ExplorationScreen.tsx / ContractsScreen.tsx SUMMON chip',
          record, err,
          { enemiesBefore: beforeEnemies, coresRecoveredBefore: beforeCoresRecovered },
          { enemiesAfter: afterEnemies.length, guardianPresent: !!guardianEntry, coresRecoveredAfter: afterCoresRecovered },
          guardianEntry ? 'Guardian appeared; fight will now be carried through to a terminal state (Phase 12).' : 'summon call completed but no core_guardian enemy found — see notes',
          'n/a',
        );

        if (!record || record.result !== 'ok' || !guardianEntry) {
          finalVerdict = 'E_BLOCKED_PREREQUISITE';
          verdictNote = `summonCoreGuardian() did not legitimately place a Guardian in the scene (record.result=${record?.result ?? 'n/a'}, err=${err ? String(err) : 'none'})`;
        } else {
          const capitalId = get().player?.currentLocationId ?? LOST_CAPITAL_LOCATIONS[0]!;
          const def = GUARDIANS_BY_CAPITAL[capitalId];
          const tier = tierForKills((get().player?.mainQuest?.coresRecovered ?? []).length);
          const startView = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory });

          startState = {
            capitalId,
            guardianName: def?.base.name ?? guardianEntry.name,
            guardianTier: tier,
            coresRecoveredEntering: (get().player?.mainQuest?.coresRecovered ?? []).length,
            playerHp: startView?.hp, playerHpMax: startView?.hpMax,
            playerStamina: startView?.stamina, playerStaminaMax: startView?.staminaMax,
            equipped: startView?.equipped,
            rangeLabel: startView?.scene?.enemies?.[0]?.rangeLabel,
            mainHandReach: startView?.scene?.enemies?.[0]?.mainHandReach,
            guardianHpStart: startView?.scene?.enemies?.[0]?.currentHp,
            guardianHpMax: startView?.scene?.enemies?.[0]?.hpMax,
          };
          log(`Guardian encounter start: ${JSON.stringify(startState)}`);

          function findHealingItemName(): string | null {
            const inv = get().player?.inventory ?? [];
            for (const item of inv) {
              if (item.quantity <= 0) continue;
              const fx = resolveItemEffect(item.name, [findGearByName, findExplorationItemByName, findMaterialByName]);
              if (fx?.kind === 'consumable' && (fx.healHP ?? 0) > 0) return item.name;
            }
            return null;
          }
          let prevHp: number | undefined;
          let prevStamina: number | undefined;
          function view(): PlayerView | null {
            const vv = buildPlayerView(
              { player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory },
              { previousHp: prevHp, previousStamina: prevStamina },
            );
            if (vv) { prevHp = vv.hp; prevStamina = vv.stamina; }
            return vv;
          }

          // ── The fight itself — VERBATIM reuse of canonicalLife3.test.ts's
          // resolveCombat() option-construction/execute wiring. No new
          // combat intelligence, no policy change, no observability change. ──
          const result = await resolveCombatRounds(
            {
              isDead: () => Boolean(get().player?.dead),
              view,
              buildOptions: (vv) => {
                const options: DecisionOption[] = [];
                const enemy = vv.scene?.enemies[0] ?? null;
                if (!enemy || enemy.mainHandReach.inRange) {
                  options.push({ id: 'attack', category: 'engage', label: 'attack' });
                } else {
                  options.push({ id: 'advance', category: 'engage-approach', label: 'advance', meta: { rangeLabel: enemy.rangeLabel, reachLabel: enemy.mainHandReach.label } });
                }
                options.push({ id: 'dodge', category: 'dodge', label: 'dodge' });
                if (vv.canBlock) options.push({ id: 'block', category: 'block', label: 'block' });
                options.push({ id: 'flee', category: 'survive-flee', label: 'flee' });
                options.push({ id: 'retreat', category: 'survive-retreat', label: 'retreat' });
                const healName = findHealingItemName();
                if (healName && vv.hp < vv.hpMax) options.push({ id: 'heal', category: 'survive-heal', label: `heal self with ${healName}` });
                return options;
              },
              decide: (vv, options) => decide(vv, options as DecisionOption[]),
              execute: async (dec) => {
                if (dec.optionId === 'heal') {
                  const name = findHealingItemName();
                  if (!name) throw new Error('resolveCombat: heal option offered but findHealingItemName() now returns null.');
                  return executor.useHealBatch(name, 'self', 1, dec);
                }
                if (dec.optionId === 'flee') return executor.combatFlee(dec);
                if (dec.optionId === 'dodge') return executor.combatDodge(dec);
                if (dec.optionId === 'block') return executor.combatBlock(dec);
                if (dec.optionId === 'advance') return executor.combatAdvance(dec);
                if (dec.optionId === 'retreat') return executor.combatRetreat(dec);
                return executor.combatAttack(dec);
              },
              resolveLogDelta: (range) => {
                if (!range) return [];
                const [start, end] = range;
                return getLogMirror().slice(start - 1, end).map((l) => l.text);
              },
            },
            GUARDIAN_ROUND_BUDGET,
            (row) => {
              log(`  round ${row.round}: playerHp ${row.playerHpBefore}->${row.playerHpAfter}, guardianHp ${row.enemiesBefore[0]?.hp}->${row.enemiesAfter[0]?.hp ?? 'gone'}, choice=${row.optionSelected} (${row.policyReason})`);
            },
          );
          guardianTrace = [...result.trace];
          log(`Combat outcome: ${describeCombatOutcome(result.outcome, result.roundsConsumed, GUARDIAN_ROUND_BUDGET)}`);

          const outcome: CombatOutcome = result.outcome;
          if (outcome.kind === 'DEAD') {
            terminal = 'PLAYER_DIED';
            finalVerdict = 'A_QUALIFIED';
            verdictNote = `Guardian legitimately killed the player after ${result.roundsConsumed} round(s) of real production combat.`;
          } else if (outcome.kind === 'FLED') {
            terminal = 'PLAYER_FLED';
            finalVerdict = 'A_QUALIFIED';
            verdictNote = `policy legitimately chose FLEE and production resolved the Guardian encounter after ${result.roundsConsumed} round(s).`;
          } else if (outcome.kind === 'CLEARED') {
            terminal = 'GUARDIAN_DEFEATED';
            finalVerdict = 'A_QUALIFIED';
            verdictNote = `Guardian HP reached production defeat after ${result.roundsConsumed} round(s) of real production combat.`;
            // ── §9: trace Core/progression consequences. No manual grant,
            // no manual repair — read only what production already did. ──
            const afterMq = get().player?.mainQuest;
            const guardianDefeatedList = afterMq?.guardiansDefeated ?? [];
            const coresAfter = afterMq?.coresRecovered ?? [];
            coreConsequence = {
              capitalId,
              guardiansDefeatedIncludesCapital: guardianDefeatedList.includes(capitalId),
              coresRecoveredIncludesCapital: coresAfter.includes(capitalId),
              coresRecoveredCountBefore: startState.coresRecoveredEntering,
              coresRecoveredCountAfter: coresAfter.length,
              mainQuestPhaseAfter: afterMq?.phase,
              inventoryHasSignatureDrop: (get().player?.inventory ?? []).some((it) => it.name === def?.base.name || /guardian/i.test(it.tags?.join(' ') ?? '')),
              awardedAutomaticallyAtDeath: true, // traced from gameStore.ts source (§25422-25472): the Core grant is inside the SAME synchronous enemy-death handler every kill uses — no separate player action exists or is required.
            };
            log(`Core/progression consequence: ${JSON.stringify(coreConsequence)}`);
          } else if (outcome.kind === 'NO_LEGAL_ACTION') {
            terminal = 'NO_LEGAL_ACTION';
            finalVerdict = 'B_APPARATUS_DEFECT';
            verdictNote = `decide()/buildOptions() found nothing legitimate to do at round ${result.roundsConsumed} — a bounded apparatus deficiency, not a production or budget issue.`;
          } else {
            // ROUND_BUDGET_EXHAUSTED — §8 mechanism classification.
            terminal = 'ROUND_BUDGET_EXHAUSTED';
            const thirdSize = Math.ceil(guardianTrace.length / 3);
            const early = guardianTrace.slice(0, thirdSize);
            const middle = guardianTrace.slice(thirdSize, thirdSize * 2);
            const late = guardianTrace.slice(thirdSize * 2);
            const guardianHpOf = (row: CombatRoundTrace | undefined, before: boolean): number | null => {
              if (!row) return null;
              const e = before ? row.enemiesBefore[0] : row.enemiesAfter[0];
              return e ? e.hp : null;
            };
            const windowDelta = (rows: CombatRoundTrace[]): number | null => {
              const startHp = guardianHpOf(rows[0], true);
              const endHp = guardianHpOf(rows[rows.length - 1], false);
              if (startHp === null || endHp === null) return null;
              return startHp - endHp; // positive = net Guardian HP lost this window
            };
            const earlyDelta = windowDelta(early);
            const middleDelta = windowDelta(middle);
            const lateDelta = windowDelta(late);
            const totalDelta = windowDelta(guardianTrace);
            const guardianHpStartOverall = guardianHpOf(guardianTrace[0], true);
            const guardianHpEndOverall = guardianHpOf(guardianTrace[guardianTrace.length - 1], false);

            const optionCounts = new Map<string, number>();
            for (const row of guardianTrace) optionCounts.set(row.optionSelected ?? 'null', (optionCounts.get(row.optionSelected ?? 'null') ?? 0) + 1);
            const advanceRatio = (optionCounts.get('advance') ?? 0) / guardianTrace.length;
            const fleeRatio = (optionCounts.get('flee') ?? 0) / guardianTrace.length;
            const healRatio = (optionCounts.get('heal') ?? 0) / guardianTrace.length;
            const attackRatio = (optionCounts.get('attack') ?? 0) / guardianTrace.length;
            const refusedRounds = guardianTrace.filter((r) => r.actionResult !== 'ok').length;

            log(`§8 windows: early=${earlyDelta} middle=${middleDelta} late=${lateDelta} total=${totalDelta} (Guardian HP ${guardianHpStartOverall}->${guardianHpEndOverall})`);
            log(`§8 option mix: attack=${(attackRatio * 100).toFixed(1)}% advance=${(advanceRatio * 100).toFixed(1)}% flee=${(fleeRatio * 100).toFixed(1)}% heal=${(healRatio * 100).toFixed(1)}% refusedRounds=${refusedRounds}`);

            // Classification, in priority order — each rules out the ones above it.
            if (advanceRatio > 0.5) {
              mechanism = 'E_RANGE_MOVEMENT_LOOP';
              verdictNote = `${(advanceRatio * 100).toFixed(0)}% of rounds were ADVANCE — combat positioning never converged to attack range.`;
            } else if (fleeRatio > 0.5) {
              mechanism = 'F_FLEE_LOOP';
              verdictNote = `${(fleeRatio * 100).toFixed(0)}% of rounds were FLEE attempts against a Guardian encounter that never actually disengaged — repeated escape behavior consumed the budget.`;
            } else if (refusedRounds > guardianTrace.length * 0.2) {
              mechanism = 'H_PRODUCTION_DEFECT';
              verdictNote = `${refusedRounds}/${guardianTrace.length} rounds were refused by production (actionResult !== 'ok') despite decide() selecting a legitimate-looking option — investigate as a possible production defect before any ceiling change.`;
            } else if (guardianHpStartOverall !== null && guardianHpEndOverall !== null && guardianHpEndOverall <= 0) {
              // Guardian HP hit 0/below but the loop still read ROUND_BUDGET_EXHAUSTED — a genuine observability gap between our HP snapshot and production's own defeat check.
              mechanism = 'G_OBSERVABILITY_GAP';
              verdictNote = `trace shows Guardian HP reaching ${guardianHpEndOverall} (<=0) but the loop still exhausted its budget instead of reading CLEARED — production has a signal (Guardian defeated) this harness is not correctly observing.`;
            } else if (totalDelta !== null && totalDelta > 0 && earlyDelta !== null && middleDelta !== null && lateDelta !== null && earlyDelta > 0 && middleDelta > 0 && lateDelta > 0) {
              mechanism = 'A_FORWARD_PROGRESS';
              const avgPerRound = totalDelta / guardianTrace.length;
              const roundsToFinishEstimate = guardianHpEndOverall !== null && avgPerRound > 0 ? Math.ceil(guardianHpEndOverall / avgPerRound) : null;
              verdictNote = `Guardian HP fell every window (early ${earlyDelta}, middle ${middleDelta}, late ${lateDelta}; total ${totalDelta} over ${guardianTrace.length} rounds, ${avgPerRound.toFixed(2)}/round) — sustained, non-stalled progress. At this rate roughly ${roundsToFinishEstimate ?? 'an unknown number of'} more rounds would be needed to finish. 300 may be undersized for this Guardian's tier, but the ceiling is NOT raised in this task per owner instruction.`;
            } else if (totalDelta !== null && Math.abs(totalDelta) < (guardianHpStartOverall ?? 1) * 0.02) {
              mechanism = healRatio > 0.15 ? 'D_HEAL_REGEN_EQUILIBRIUM' : 'C_MUTUAL_STALEMATE';
              verdictNote = mechanism === 'D_HEAL_REGEN_EQUILIBRIUM'
                ? `Guardian net HP change over 300 rounds was ${totalDelta} (~0) while the Walker healed in ${(healRatio * 100).toFixed(0)}% of rounds — damage dealt is being offset by recovery, not by a Walker defect.`
                : `Guardian net HP change over 300 rounds was ${totalDelta} (~0 of ${guardianHpStartOverall}) with no dominant single-option pattern — neither side is meaningfully progressing under real production mechanics.`;
            } else if (attackRatio < 0.3 && advanceRatio < 0.3) {
              mechanism = 'B_WALKER_ACTION_LOOP';
              verdictNote = `neither attack (${(attackRatio * 100).toFixed(0)}%) nor advance (${(advanceRatio * 100).toFixed(0)}%) dominated — the Walker repeated an ineffective or non-progressing action pattern.`;
            } else {
              mechanism = 'I_UNKNOWN';
              verdictNote = `windowed HP deltas (early ${earlyDelta}, middle ${middleDelta}, late ${lateDelta}) do not cleanly match any classification above — evidence is insufficient to determine the mechanism with confidence.`;
            }

            finalVerdict = mechanism === 'A_FORWARD_PROGRESS' ? 'C_BUDGET_REQUALIFICATION_NEEDED'
              : mechanism === 'H_PRODUCTION_DEFECT' ? 'D_PRODUCTION_DEFECT'
              : mechanism === 'G_OBSERVABILITY_GAP' ? 'B_APPARATUS_DEFECT'
              : mechanism === 'B_WALKER_ACTION_LOOP' || mechanism === 'E_RANGE_MOVEMENT_LOOP' || mechanism === 'F_FLEE_LOOP' ? 'B_APPARATUS_DEFECT'
              : 'F_MORE_EVIDENCE';
          }
        }
      }
    }

    log(`=== VERDICT: ${finalVerdict} — ${verdictNote} ===`);
    if (process.env.QUAL_DEBUG) {
      // eslint-disable-next-line no-console
      console.log(REPORT.join('\n'));
    }

    // ── Persist full evidence, collision-safe (Phase 11 mechanism, unmodified). ──
    const artifactDir = resolve(__dirname, '../scratchpad/canonical-life-reports');
    mkdirSync(artifactDir, { recursive: true });
    const RUN_STARTED_AT = new Date().toISOString();
    const { jsonPath, txtPath } = buildArtifactPaths(artifactDir, 'guardian-fight-completion-run', RUN_STARTED_AT);
    writeFileSync(txtPath, REPORT.join('\n'));
    writeFileSync(jsonPath, JSON.stringify({
      runStartedAt: RUN_STARTED_AT,
      reachedCapital,
      finalVerdict,
      verdictNote,
      terminal,
      mechanism,
      startState,
      coreConsequence,
      roundsConsumed: guardianTrace.length,
      guardianRoundBudget: GUARDIAN_ROUND_BUDGET,
      trace: guardianTrace,
    }, null, 2));

    const qualOutPath = resolve(__dirname, '../test-utils/canonical/qualificationResultsPhase12_guardianFight.json');
    writeFileSync(qualOutPath, JSON.stringify(getQualifications(), null, 2));

    log(`Evidence written: ${jsonPath}`);
    expect(getQualifications().length).toBeGreaterThan(0);

    detachRngLedger();
    detachStoreDiffer();
    uninstallCanonicalClock();

    // Record the verdict on the test's own output for the human report —
    // this assertion documents the run's classification, it does not gate
    // pass/fail on a favorable OUTCOME (death/flee/exhaustion are all valid).
    expect(['A_QUALIFIED', 'B_APPARATUS_DEFECT', 'C_BUDGET_REQUALIFICATION_NEEDED', 'D_PRODUCTION_DEFECT', 'E_BLOCKED_PREREQUISITE', 'F_MORE_EVIDENCE']).toContain(finalVerdict);
  });
});
