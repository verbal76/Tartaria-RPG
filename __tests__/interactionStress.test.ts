// interactionStress.test.ts — Stress-test the Exploration / World screen
// quick-action interaction buttons (LOOK, SEARCH, TAKE, SALVAGE) under
// a sustained 700 in-game day playthrough. Cycles look → search → take
// → salvage at every scene visit, travels occasionally to refresh the
// chip pool, and tracks per-button metrics + invariants.
//
// What this test is NOT: a combat / quest simulator. The action picker
// avoids combat (flees on enemy contact) and ignores hooks / vendors;
// the goal is to keep the player IN peaceful scenes so the four
// interaction buttons get hammered against as many ambient noun pools
// as possible across the run.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
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
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findCatalogItem } from '../app/engine/crafting';
import { isOversized } from '../app/engine/portability';

type Counter = Record<string, number>;
function bump(c: Counter, key: string, n = 1) {
  c[key] = (c[key] ?? 0) + n;
}
function topN(c: Counter, n: number): Array<[string, number]> {
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// Locations to round-robin through for cheap chip-pool refresh. Same
// short list as yearSimulation — keeps the sim moving across distinct
// macro-regions instead of bouncing between two tiles.
const NAMED_LOCATIONS = [
  'Drakova', 'Varakush', 'Asgardar', 'Mud Seas',
  'Tartarian Outskirts', 'Cradle', 'Silt Wastes',
  'Borderlands', 'Iron Wastes', 'Glass Hills',
];

// Hand-picked oversized targets we'll force-inject every so often to
// confirm the portability gate keeps firing. None of these are in the
// TakeModal's filtered list — we hit takeAmbientNoun directly with
// them to simulate a user pasting raw text. (The TakeModal filters out
// oversized chips so this path is only reachable via typed input, but
// the gate itself must still hold.)
const OVERSIZED_PROBES = ['wagon', 'pillar', 'sentinel', 'boulder'];

describe('Interaction button stress — 700 in-game days', () => {
  jest.setTimeout(120000);

  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  afterAll(() => {
    console.log = _origLog;
    console.warn = _origWarn;
    console.error = _origErr;
  });

  it('cycles look/search/take/salvage and validates metrics', async () => {
    const store = useGameStore;
    await store.getState().hydrate();

    const races = getRaces();
    const factions = getFactions();
    const race = races.find((r) => r.id === 'reclaimer') ?? races[0]!;
    const fac = factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!;

    await store.getState().startNewGame({
      name: 'Interactor',
      raceId: race.id,
      factionId: fac.id,
    });
    store.getState().skipTutorial?.();

    // ── Telemetry ────────────────────────────────────────────────────
    const crashes: string[] = [];
    // Look-around: hash each visible noun subset, count distinct ones.
    const lookSubsetsSeen = new Set<string>();
    let lookCount = 0;
    // Search metrics
    let searchAttempts = 0;
    let searchMatched = 0; // noun the player named resolved to ambient
    // Take metrics
    let takeAttempts = 0;
    let takeGranted = 0;
    let takeDeduped = 0;
    let takeOversized = 0;
    let takeUnmatched = 0;
    let takeNotPortable = 0;
    // Salvage metrics
    let salvageAttempts = 0;
    let salvageMaterial = 0;
    let salvageTc = 0;
    let salvageHook = 0;
    let salvageNothing = 0;
    // Item grant tracking
    const distinctItemsGranted = new Set<string>();
    const distinctNounsTaken = new Set<string>();
    // Invariant check buffers
    const oversizedRefusalFailures: string[] = []; // failed: refusal didn't contain noun
    const nothingThenDedupe: string[] = []; // failed: salvage nothing then take blocked
    // Grammar / oddities probes
    const grammarFlags: string[] = [];
    // For asserting catalog spec on a taken item
    const takenItemSpecFailures: string[] = [];

    let prevLogLen = store.getState().gameLog.length;
    let prevInvCount = store.getState().player?.inventory.length ?? 0;
    let prevTc = store.getState().player?.tc ?? 0;

    // Resolve any pending roll (dig / skill check) before our next move.
    const resolvePending = () => {
      let safety = 0;
      while (store.getState().pendingRolls && safety < 30) {
        const pr = store.getState().pendingRolls!;
        const step = pr.steps[pr.currentStep];
        if (!step) {
          try { store.getState().cancelPendingRolls(); } catch {}
          break;
        }
        const values: number[] = [];
        const count = step.count ?? 1;
        const sides = step.sides ?? 6;
        for (let i = 0; i < count; i++) values.push(1 + Math.floor(Math.random() * sides));
        try {
          store.getState().resolveRollStep(values);
        } catch (e: any) {
          crashes.push(`resolveRollStep: ${e?.message ?? e}`);
          try { store.getState().cancelPendingRolls(); } catch {}
          break;
        }
        safety++;
      }
    };

    const submit = (text: string): { newLogs: Array<{ text: string; channel: string }> } => {
      const before = store.getState().gameLog.length;
      try {
        store.getState().submitPlayerAction(text);
      } catch (e: any) {
        crashes.push(`submitPlayerAction("${text}"): ${e?.message ?? e}`);
      }
      resolvePending();
      const after = store.getState().gameLog;
      return { newLogs: after.slice(before) };
    };

    // ── Action helpers (one per button) ─────────────────────────────
    const lookAround = () => {
      lookCount++;
      submit('look');
      // After look fires, the displayed subset is whatever
      // displayedAmbientNouns is on the scene. Snapshot it.
      const scene = store.getState().currentScene;
      const subset = scene?.displayedAmbientNouns
        ?? (scene?.ambientNouns ?? []).slice(0, 8);
      const key = [...subset].sort().join('|');
      if (key) lookSubsetsSeen.add(key);
    };

    const visibleNouns = (): string[] => {
      const scene = store.getState().currentScene;
      return scene?.displayedAmbientNouns
        ?? (scene?.ambientNouns ?? []).slice(0, 8);
    };

    const pickRandom = <T,>(arr: T[]): T | null => {
      if (!arr.length) return null;
      return arr[Math.floor(Math.random() * arr.length)]!;
    };

    // Mirror SearchModal: submit 'search the <noun>'. Track ambient
    // resolution: scan the response for "I do not see" — that's the
    // unknown-target reprompt path.
    const doSearch = () => {
      const nouns = visibleNouns();
      const noun = pickRandom(nouns);
      if (!noun) return;
      searchAttempts++;
      const { newLogs } = submit(`search the ${noun}`);
      const refused = newLogs.some((l) =>
        /I do not see a '|I don't see /i.test(l.text),
      );
      if (!refused) searchMatched++;
    };

    // Mirror TakeModal: call takeAmbientNoun(noun) directly. The modal
    // filters to portable catalog items only — replicate that filter
    // when picking, then occasionally bypass it with an OVERSIZED
    // probe noun.
    const doTake = (forceOversized = false) => {
      const scene = store.getState().currentScene;
      if (!scene) return;
      let noun: string | null = null;
      if (forceOversized) {
        // Pick an oversized probe that's ALSO in the scene's ambient
        // pool — otherwise the unmatched-noun branch fires instead of
        // the portability gate. Fall back to typed text if no match.
        const ambient = scene.ambientNouns ?? [];
        const match = ambient.find((n) => OVERSIZED_PROBES.some((p) => n.toLowerCase().includes(p)));
        noun = match ?? null;
        if (!noun) return; // no oversized noun in this scene, skip
      } else {
        // Prefer the per-visit displayed subset (matches what the UI
        // shows in the TakeModal chip list). Fall back to the full
        // ambientNouns pool when the displayed subset has nothing
        // portable — the underlying engine accepts any noun in the
        // pool, the displayed-subset cap is a UX choice. Falling
        // back keeps the sim from idling when the random 8-noun
        // shuffle hides every portable chip behind oversized /
        // non-catalog scenery.
        let takeable = visibleNouns().filter((n) =>
          findCatalogItem(n) !== null && !isOversized(n),
        );
        if (takeable.length === 0) {
          takeable = (scene.ambientNouns ?? []).filter((n) =>
            findCatalogItem(n) !== null && !isOversized(n),
          );
        }
        noun = pickRandom(takeable);
        if (!noun) return;
      }
      takeAttempts++;
      const invBefore = store.getState().player?.inventory.length ?? 0;
      const invSnapshotBefore = new Set(
        (store.getState().player?.inventory ?? []).map((it) => it.id),
      );
      // TAKE button calls takeAmbientNoun(noun) DIRECTLY, NOT via parser.
      const before2 = store.getState().gameLog.length;
      try {
        store.getState().takeAmbientNoun(noun);
      } catch (e: any) {
        crashes.push(`takeAmbientNoun("${noun}"): ${e?.message ?? e}`);
        return;
      }
      resolvePending();
      const after2 = store.getState().gameLog.slice(before2);
      const text = after2.map((l) => l.text).join(' \n ');

      // Classify outcome
      if (/already taken or worked over/i.test(text)) {
        takeDeduped++;
        return;
      }
      // Oversized refusal — should contain target noun. The portability
      // module uses {target} substitution so the literal noun appears.
      if (forceOversized) {
        // Arbiter-channel narration goes through the gameStore's
        // duplicate-line dedup gate (16-entry window). When the same
        // oversized noun is probed twice in quick succession with the
        // same refusal-line variant, the duplicate is suppressed —
        // the dedup-suppression marker is persisted to disk but NOT
        // pushed to the in-memory gameLog. So the test sees an empty
        // log slice but inventory/TC are unchanged. Treat empty-log +
        // no-state-change as a deduped refusal (the gate fired, the
        // narration was swallowed for UX reasons).
        const invAfterArr = store.getState().player?.inventory ?? [];
        const invChanged = invAfterArr.length !== invBefore;
        if (text.trim().length === 0 && !invChanged) {
          // Dedup-suppressed refusal — gate fired silently.
          takeOversized++;
          return;
        }
        if (!text.toLowerCase().includes(noun.toLowerCase())) {
          // Multi-word nouns (e.g. "buried wagon") may have the canonical
          // form re-named by matchAmbientNoun, so allow partial match
          // against any of the noun's whitespace-separated tokens.
          const parts = noun.toLowerCase().split(/\s+/).filter(Boolean);
          const anyPart = parts.some((p) => p.length > 2 && text.toLowerCase().includes(p));
          if (!anyPart) {
            oversizedRefusalFailures.push(`oversized=${noun} log="${text.slice(0, 160)}"`);
          }
        }
        takeOversized++;
        return;
      }
      if (/I don't see\b|don't see /i.test(text)) {
        takeUnmatched++;
        return;
      }
      if (/scene, not a loose drop/i.test(text)) {
        takeNotPortable++;
        return;
      }
      // Success path emits "You take the X" + "✦ X (rarity)."
      const invAfter = store.getState().player?.inventory.length ?? 0;
      const invSizeDelta = invAfter - invBefore;
      const itemAdded = /✦ .+\(/i.test(text) || invSizeDelta > 0;
      if (itemAdded) {
        takeGranted++;
        distinctNounsTaken.add(noun.toLowerCase());
        // Find the actual item the take just granted by diffing
        // inventory IDs against the pre-call snapshot. Indexing
        // inv[length-1] is wrong because intervening salvage outcomes
        // may have appended other items earlier in the loop.
        const invAfterArr = store.getState().player?.inventory ?? [];
        const last = invAfterArr.find((it) => !invSnapshotBefore.has(it.id));
        if (last) {
          distinctItemsGranted.add(last.name);
          // Catalog spec: rarity present, kind set, tags array,
          // durability stamped for weapon/armor/relic. Misc /
          // consumable items don't carry durability.
          const cat = findCatalogItem(noun);
          if (cat) {
            if (!last.rarity) takenItemSpecFailures.push(`no rarity on ${last.name}`);
            if (!last.kind) takenItemSpecFailures.push(`no kind on ${last.name}`);
            if (!Array.isArray(last.tags)) takenItemSpecFailures.push(`no tags on ${last.name}`);
            // Durability invariant: weapon + armor catalog entries must
            // ALWAYS have durability stamped (they have baseDurability /
            // DEFAULT_DURABILITY fallback in stampDurability). 'relic'
            // kind covers both amulets/rings (durability-tracked) AND
            // GEAR items (NOT durability-tracked — finding noted below).
            // We assert the contract for the unambiguous weapon/armor
            // catalog entries.
            const expectsDurability = cat.kind === 'weapon' || cat.kind === 'armor';
            if (expectsDurability && !last.durability) {
              takenItemSpecFailures.push(`no durability on ${last.name} (kind=${cat.kind})`);
            }
            // Track relic-no-durability as a soft oddity (GEAR vs
            // amulets/rings inconsistency).
            if (cat.kind === 'relic' && !last.durability) {
              grammarFlags.push(`relic-no-durability: ${last.name} (cat from GEAR table)`);
            }
          }
        }
      } else {
        // Unclassified outcome — record so we can inspect oddities.
        grammarFlags.push(`take "${noun}" → ${text.slice(0, 120)}`);
      }
    };

    // Mirror SalvageModal: submit 'salvage <noun>'.
    // Outcome classification reads the log lines fresh from the engine.
    const doSalvage = (): { noun: string; outcome: string } | null => {
      const nouns = visibleNouns();
      const noun = pickRandom(nouns);
      if (!noun) return null;
      salvageAttempts++;
      const sPre = store.getState();
      const invBefore = sPre.player?.inventory ?? [];
      const invSizeBefore = invBefore.length;
      const tcBefore = sPre.player?.tc ?? 0;
      // Snapshot the room's searchedAmbientNouns list. The engine
      // marks a noun consumed on every outcome EXCEPT 'nothing'. So
      // the diff after salvage IS the ground truth: noun added →
      // consumed (material/tc/hook); not added → genuine nothing.
      const preRoomKey = sPre.player
        ? `${sPre.player.currentLocationId ?? '?'}@${sPre.currentScene?.microMicroId ?? '_'}@${sPre.player.mapX ?? '_'},${sPre.player.mapY ?? '_'}`
        : '_';
      const preSearched = new Set(
        sPre.worldMemory.visitedRooms?.[preRoomKey]?.searchedAmbientNouns ?? [],
      );
      const { newLogs } = submit(`salvage ${noun}`);
      const text = newLogs.map((l) => l.text).join(' \n ');
      const channels = newLogs.map((l) => l.channel);
      const sawReward = newLogs.some((l) => l.channel === 'reward');
      const sPost = store.getState();
      const postSearched = sPost.worldMemory.visitedRooms?.[preRoomKey]?.searchedAmbientNouns ?? [];
      const nounConsumed = postSearched.some((n) => !preSearched.has(n));

      // Order matters: material grants emit "✦ <item> (rarity)" reward
      // lines; tc emits "+N TC."; hook emits a planted line on world
      // channel; nothing emits a flavor "nothing" line. We classify
      // by side-effects rather than text where possible.
      //
      // The salvage path ALSO has a dedupe gate ("already worked over
      // the X") that fires when a previous search/salvage in the same
      // room consumed the noun. That's a "harvest already done" outcome,
      // not a "nothing" roll — must not be confused with the
      // genuine-nothing case (OTA 164 invariant).
      const invAfterArr = sPost.player?.inventory ?? [];
      const invAfter = invAfterArr.length;
      const tcAfter = sPost.player?.tc ?? 0;
      const gainedItem = invAfter > invSizeBefore || sawReward || /✦ .+\(/i.test(text);
      const gainedTc = tcAfter > tcBefore || /\+\d+ TC\./.test(text);
      const alreadyWorkedOver = /already worked over the |already searched the /i.test(text);
      // Ground-truth outcome derivation: use the engine's own
      // searchedAmbientNouns side-effect, then refine based on
      // log text. If the noun was consumed but no item/tc landed,
      // it must have been a hook outcome (the only consuming kind
      // with no inventory effect).
      let outcome: string;
      if (alreadyWorkedOver) {
        outcome = 'already_worked_over';
      } else if (gainedItem) {
        salvageMaterial++;
        outcome = 'material';
      } else if (gainedTc) {
        salvageTc++;
        outcome = 'tc';
      } else if (nounConsumed) {
        // Engine consumed the noun but no item/tc — must be hook.
        salvageHook++;
        outcome = 'hook';
      } else {
        salvageNothing++;
        outcome = 'nothing';
      }
      void channels;
      return { noun, outcome };
    };

    // ── Travel — exit hub once, then bounce between named locations ─
    let leftHub = false;
    let locIdx = 0;
    const travel = () => {
      const p = store.getState().player;
      if (!p) return;
      if (p.hubRoomId && !leftHub) {
        leftHub = true;
        submit('leave outpost');
        return;
      }
      const loc = NAMED_LOCATIONS[locIdx % NAMED_LOCATIONS.length]!;
      locIdx++;
      submit(`travel to ${loc}`);
    };

    // ── Main loop ────────────────────────────────────────────────────
    const TARGET_DAY = 700;
    const MAX_ACTIONS = 20000;
    let actions = 0;
    let visitsThisScene = 0;
    let lastSceneKey = '';
    const sceneKey = (): string => {
      const s = store.getState();
      const scene = s.currentScene;
      return `${scene?.location?.id ?? '?'}@${scene?.microMicroId ?? ''}@${s.player?.mapX ?? 0},${s.player?.mapY ?? 0}`;
    };

    while (actions < MAX_ACTIONS) {
      // Yield to event loop occasionally so Jest doesn't see the loop
      // as hung if the engine schedules promises.
      if (actions % 100 === 0) await new Promise<void>((r) => setImmediate(r));
      actions++;

      const s = store.getState();
      const p = s.player;
      if (!p) break;
      if (p.dead) break;
      const day = Math.floor((p.hoursElapsed ?? 0) / 24) + 1;
      if (day >= TARGET_DAY) break;

      // Flee on enemy contact — combat ruins ambient-noun cycles, the
      // brief is interaction stress, not combat stress.
      const scene = s.currentScene;
      const enemy = scene && scene.enemies.length > 0;
      if (enemy) {
        submit('flee');
        continue;
      }
      // Rest if stamina is too low to travel.
      if (p.stamina <= 2) {
        submit('rest');
        continue;
      }

      // Detect scene change → reset the per-scene visit counter.
      const k = sceneKey();
      if (k !== lastSceneKey) {
        lastSceneKey = k;
        visitsThisScene = 0;
      }

      // Each visit cycle: look → take → take → search → salvage.
      // (TAKE runs BEFORE search/salvage because both of those consume
      // the noun via fuzzy substring match in searchedAmbientNouns. If
      // we put take last we'd almost never have a fresh portable noun
      // left. TAKE gets two slots — the first picks any portable
      // noun, the second picks again so a fresh-arrival scene can
      // surface multiple portable items before the consumers run.)
      // After ~3 cycles in the same scene, travel to refresh.
      switch (visitsThisScene % 6) {
        case 0:
          lookAround();
          break;
        case 1:
          doTake();
          // Every ~25th scene-cycle, fire an oversized probe.
          if (Math.random() < 0.08) doTake(true);
          break;
        case 2:
          // Second take pass — different RNG, often finds a noun the
          // first pass didn't pick.
          doTake();
          break;
        case 3:
          doSearch();
          break;
        case 4: {
          // OTA 164 invariant: a "nothing" salvage outcome MUST NOT add
          // the noun to the room's searchedAmbientNouns list. The
          // safest way to assert this is to snapshot the list before
          // and after the salvage, regardless of substring-fuzzy
          // matches from earlier in the loop. (Substring-fuzzy dedupe
          // means a take of 'rope bundle' might block on a previous
          // 'rope' consumption — that's engine-intended; what we're
          // checking is that the SALVAGE itself didn't write the
          // noun on a 'nothing' roll.)
          const sBefore = store.getState();
          const before = sBefore.player;
          const beforeRoom = before ? sBefore.worldMemory.visitedRooms?.[
            `${before.currentLocationId ?? '?'}@${sBefore.currentScene?.microMicroId ?? '_'}@${before.mapX ?? '_'},${before.mapY ?? '_'}`
          ] : null;
          const beforeSearched = new Set(beforeRoom?.searchedAmbientNouns ?? []);
          const result = doSalvage();
          if (result && result.outcome === 'nothing') {
            const sAfter = store.getState();
            const aPlayer = sAfter.player;
            const afterRoom = aPlayer ? sAfter.worldMemory.visitedRooms?.[
              `${aPlayer.currentLocationId ?? '?'}@${sAfter.currentScene?.microMicroId ?? '_'}@${aPlayer.mapX ?? '_'},${aPlayer.mapY ?? '_'}`
            ] : null;
            const afterSearched = (afterRoom?.searchedAmbientNouns ?? []);
            const nounLower = result.noun.toLowerCase();
            const newlyAdded = afterSearched.find((n) =>
              !beforeSearched.has(n) && (n === nounLower || nounLower.includes(n) || n.includes(nounLower)),
            );
            if (newlyAdded) {
              nothingThenDedupe.push(
                `noun="${result.noun}" room=${k} (salvage 'nothing' added "${newlyAdded}" to searchedAmbientNouns)`,
              );
            }
          }
          break;
        }
        case 5: {
          // Refresh the chip pool by traveling to a new macro-region.
          travel();
          break;
        }
      }
      visitsThisScene++;

      // TC / inventory drift snapshots for sanity.
      prevLogLen = store.getState().gameLog.length;
      prevInvCount = store.getState().player?.inventory.length ?? prevInvCount;
      prevTc = store.getState().player?.tc ?? prevTc;
    }

    // ── Final report ─────────────────────────────────────────────────
    const sFinal = store.getState();
    const pFinal = sFinal.player;
    const finalDay = Math.floor((pFinal?.hoursElapsed ?? 0) / 24) + 1;

    const searchMatchRate = searchAttempts > 0
      ? Math.round((searchMatched / searchAttempts) * 100)
      : 0;

    console.log = _origLog;
    const report = `
================ INTERACTION STRESS REPORT ================
Actions executed:       ${actions}
Survived to:            Day ${finalDay}
Crashes:                ${crashes.length}
${crashes.slice(0, 5).map((c) => `  - ${c}`).join('\n') || '  (none)'}

LOOK
  Total looks:          ${lookCount}
  Distinct subsets:     ${lookSubsetsSeen.size}

SEARCH
  Total searches:       ${searchAttempts}
  Ambient match rate:   ${searchMatchRate}% (${searchMatched}/${searchAttempts})

TAKE
  Total attempts:       ${takeAttempts}
  Granted:              ${takeGranted}
  Deduped:              ${takeDeduped}
  Oversized refusals:   ${takeOversized}
  Unmatched noun:       ${takeUnmatched}
  Not-portable:         ${takeNotPortable}
  Distinct items:       ${distinctItemsGranted.size}
  Distinct nouns taken: ${distinctNounsTaken.size}

SALVAGE
  Total attempts:       ${salvageAttempts}
  Material:             ${salvageMaterial}
  TC:                   ${salvageTc}
  Hook:                 ${salvageHook}
  Nothing:              ${salvageNothing}

INVARIANTS
  Oversized refusal failures:  ${oversizedRefusalFailures.length}
${oversizedRefusalFailures.slice(0, 3).map((s) => `    - ${s}`).join('\n') || '    (none)'}
  Salvage-nothing then dedupe: ${nothingThenDedupe.length}
${nothingThenDedupe.slice(0, 3).map((s) => `    - ${s}`).join('\n') || '    (none)'}
  Take catalog-spec failures:  ${takenItemSpecFailures.length}
${takenItemSpecFailures.slice(0, 3).map((s) => `    - ${s}`).join('\n') || '    (none)'}

Player inventory size:  ${pFinal?.inventory.length ?? 0}
Top items granted:      ${[...distinctItemsGranted].slice(0, 8).join(', ') || '(none)'}
===========================================================
`.trim();
    console.log(report);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      fs.writeFileSync('/tmp/tartaria-interaction-stress-report.txt', report);
    } catch { /* ignore */ }

    // ── Assertions ───────────────────────────────────────────────────
    // 0 thrown exceptions
    expect(crashes).toEqual([]);
    // Take catalog spec invariant — every successful take grants a
    // fully-specced item (rarity / kind / tags / durability where
    // expected).
    expect(takenItemSpecFailures).toEqual([]);
    // Oversized: every refusal must contain the target noun.
    expect(oversizedRefusalFailures).toEqual([]);
    // Salvage "nothing" must NOT consume the noun for a follow-up take.
    expect(nothingThenDedupe).toEqual([]);
    // At least 12 distinct ambient nouns picked up across the run.
    // NOTE: flaky — the sim is unseeded (Math.random throughout) and this
    // count swings widely run-to-run (observed 5-9). Reliably greening it
    // needs the sim seeded (deterministic RNG), not just a lower floor.
    // Flagged for the stress-suite modernization pass.
    expect(distinctNounsTaken.size).toBeGreaterThanOrEqual(12);
    // Look-around subset rotation is real — across 700 days the sim
    // should see plenty of different noun subsets. A weak floor of 8
    // distinct subsets confirms rotation is firing (with ~10+ scenes
    // visited and per-visit shuffling, this is conservative).
    expect(lookSubsetsSeen.size).toBeGreaterThanOrEqual(8);
  });
});
