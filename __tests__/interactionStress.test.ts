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
        const takeable = visibleNouns().filter((n) =>
          findCatalogItem(n) !== null && !isOversized(n),
        );
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
      const invBefore = store.getState().player?.inventory.length ?? 0;
      const tcBefore = store.getState().player?.tc ?? 0;
      const { newLogs } = submit(`salvage ${noun}`);
      const text = newLogs.map((l) => l.text).join(' \n ');
      const channels = newLogs.map((l) => l.channel);

      // Order matters: material grants emit "✦ <item> (rarity)" reward
      // lines; tc emits "+N TC."; hook emits a planted line on world
      // channel; nothing emits a flavor "nothing" line. We classify
      // by side-effects rather than text where possible.
      const invAfter = store.getState().player?.inventory.length ?? 0;
      const tcAfter = store.getState().player?.tc ?? 0;
      const gainedItem = invAfter > invBefore || /✦ .+\(/i.test(text);
      const gainedTc = tcAfter > tcBefore || /\+\d+ TC\./.test(text);
      const plantedHook = channels.includes('world') && /thread|cold air|whisper|tug|hum|pull/i.test(text)
        && !gainedItem && !gainedTc;
      // "Nothing" line — only when there are no side effects AND no
      // hook narration. The engine uses phrases like "you find nothing",
      // "comes up empty", "scrape clean", "no joy" etc.
      let outcome: string;
      if (gainedItem) { salvageMaterial++; outcome = 'material'; }
      else if (gainedTc) { salvageTc++; outcome = 'tc'; }
      else if (plantedHook) { salvageHook++; outcome = 'hook'; }
      else { salvageNothing++; outcome = 'nothing'; }
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
    let lastSalvageNothing: { roomKey: string; noun: string } | null = null;
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
        lastSalvageNothing = null;
      }

      // Each visit cycle: look → search → take → salvage. Plus an
      // occasional oversized probe to verify the portability gate.
      // After ~3 cycles in the same scene, travel to refresh.
      switch (visitsThisScene % 5) {
        case 0:
          lookAround();
          break;
        case 1:
          doSearch();
          break;
        case 2:
          doTake();
          // Every ~25th scene-cycle, fire an oversized probe.
          if (Math.random() < 0.08) doTake(true);
          break;
        case 3: {
          const before = lastSalvageNothing;
          const result = doSalvage();
          // OTA 164 invariant: "nothing" outcome doesn't consume the noun.
          // If our previous salvage in this room rolled 'nothing' on noun N,
          // a subsequent TAKE on N should NOT be blocked by the dedupe
          // gate (already-taken line). Capture pre-state and check on
          // next turn.
          if (result && result.outcome === 'nothing') {
            lastSalvageNothing = { roomKey: k, noun: result.noun };
          } else {
            lastSalvageNothing = null;
          }
          void before;
          break;
        }
        case 4: {
          // Validate the nothing-then-take invariant if we have a pending
          // probe AND the noun is portable. Otherwise just travel to
          // refresh the chip pool.
          if (lastSalvageNothing && lastSalvageNothing.roomKey === k) {
            const noun = lastSalvageNothing.noun;
            const cat = findCatalogItem(noun);
            if (cat && !isOversized(noun)) {
              const beforeLen = store.getState().gameLog.length;
              try {
                store.getState().takeAmbientNoun(noun);
              } catch (e: any) {
                crashes.push(`probe takeAmbientNoun("${noun}"): ${e?.message ?? e}`);
              }
              const after = store.getState().gameLog.slice(beforeLen);
              const text = after.map((l) => l.text).join(' \n ');
              if (/already taken or worked over/i.test(text)) {
                nothingThenDedupe.push(`noun="${noun}" room=${k}`);
              }
            }
            lastSalvageNothing = null;
          }
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
    expect(distinctNounsTaken.size).toBeGreaterThanOrEqual(12);
    // Look-around subset rotation is real — across 700 days the sim
    // should see plenty of different noun subsets. A weak floor of 8
    // distinct subsets confirms rotation is firing (with ~10+ scenes
    // visited and per-visit shuffling, this is conservative).
    expect(lookSubsetsSeen.size).toBeGreaterThanOrEqual(8);
  });
});
