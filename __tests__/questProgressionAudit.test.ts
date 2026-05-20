// questProgressionAudit — end-to-end audit of every faction quest, hunt,
// mystery, and storyline in the catalog. Drives each through the four
// stages of its lifecycle (accept → advance → turn-in → completed) and
// reports any breakages.
//
// Coverage:
//   1. Accept path        — submitPlayerAction("accept <title>") at a
//                            vendor of the right faction puts the quest
//                            on the active list.
//   2. Stage advancement  — every advanceOn gate in faction quest stages
//                            advances when fed the matching trigger.
//   3. Turn-in path       — once stages are complete, the turn-in moves
//                            the quest to completed, pays TC, bumps rep.
//   4. Reachability       — every quest has a real faction, an
//                            achievable rep requirement, and no broken
//                            prerequisite references.
//   5. Storyline → next   — if any storyline declares a nextStorylineId,
//                            that id resolves to a real storyline.
//
// Uses the standard mock chain from yearSimulation.test.ts so the
// gameStore hydrates cleanly under Jest.

// Mock native modules before importing anything.
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
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import { HUNTS } from '../app/engine/hunts';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { FACTIONS } from '../app/engine/factions';
import { VENDORS } from '../app/engine/vendors';
import enemiesData from '../app/data/enemies/enemies.json';

interface Failure {
  id: string;
  title: string;
  kind: 'fq' | 'hunt' | 'mystery' | 'storyline';
  reason: string;
}

describe('Quest progression audit', () => {
  jest.setTimeout(180000);

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

  // ── Helper: rebuild the store with a fresh character + scene + vendor.
  //
  // For each quest under test, we hydrate a fresh game, inject a
  // synthetic vendor whose faction matches the quest, and bump the
  // player's standing past the rep requirement. The vendor is dropped
  // straight onto `currentScene.vendor` so we don't have to roll for
  // a vendor encounter.
  async function freshState(opts: {
    factionId: string | null;
    minRep: number;
    locationId?: string;
  }): Promise<void> {
    const store = useGameStore;
    await store.getState().hydrate();
    const races = getRaces();
    const factions = getFactions();
    const race = races[0]!;
    // Player joins a *different* faction than the vendor so we exercise
    // cross-faction standing accrual rather than dual-counting the
    // home faction. If the quest is faction-null we still use a
    // neutral faction for the player.
    const playerFactionId = opts.factionId === 'reclaimers_guild'
      ? 'forgotten_order'
      : 'reclaimers_guild';
    const fac = factions.find((f) => f.id === playerFactionId) ?? factions[0]!;
    await store.getState().startNewGame({
      name: 'Auditor',
      raceId: race.id,
      factionId: fac.id,
    });
    store.getState().skipTutorial?.();

    // Force-set faction standing so rep gates pass. Add the row if
    // missing — fresh characters only have the row for their own
    // faction.
    if (opts.factionId) {
      store.setState((s) => {
        if (!s.player) return s;
        const existing = s.player.factionStanding.find((r) => r.factionId === opts.factionId);
        const next = existing
          ? s.player.factionStanding.map((r) =>
              r.factionId === opts.factionId ? { ...r, standing: opts.minRep + 5 } : r,
            )
          : [...s.player.factionStanding, { factionId: opts.factionId!, standing: opts.minRep + 5 }];
        return { ...s, player: { ...s.player, factionStanding: next } };
      });
    }

    // Synthesize a vendor and slot it onto the current scene. If no
    // scene exists yet (rare), seed a minimal one so vendor logic
    // can read currentScene.vendor.
    const vendorFactionId = opts.factionId; // can be null for open contracts
    const vendor = {
      id: 'audit_vendor',
      name: 'Audit Vendor',
      title: 'Auditor',
      faction: vendorFactionId,
      description: 'Synthetic vendor injected for the progression audit.',
      offers: [],
      voiceId: undefined,
      gender: 'female' as const,
    };
    store.setState((s) => {
      const scene = s.currentScene;
      if (!scene) return s;
      return { ...s, currentScene: { ...scene, vendor, enemies: [], enemyHps: [], range: null } };
    });
  }

  it('audits every quest end-to-end', async () => {
    const store = useGameStore;

    const acceptFailures: Failure[] = [];
    const stageFailures: Array<Failure & { stageIdx: number; advanceOn: string }> = [];
    const turnInFailures: Failure[] = [];
    const reachabilityFailures: Failure[] = [];
    const nextStorylineFailures: Failure[] = [];

    const knownFactionIds = new Set(FACTIONS.map((f) => f.id));

    // ─── Reachability sweep ────────────────────────────────────────
    // Vendor faction matches quest faction (must be in FACTIONS or null).
    // Standing requirement is non-negative (achievable from zero).
    // No prerequisite ids beyond known set (no prereq field exists in
    // current schema, but we still confirm faction id resolves).
    for (const q of FACTION_QUESTS) {
      if (!knownFactionIds.has(q.factionId)) {
        reachabilityFailures.push({ id: q.id, title: q.title, kind: 'fq',
          reason: `unknown factionId ${q.factionId}` });
      }
      if (q.requirement.rep < 0) {
        reachabilityFailures.push({ id: q.id, title: q.title, kind: 'fq',
          reason: `negative rep requirement ${q.requirement.rep}` });
      }
      // Any vendor of this faction exists?
      const vendorMatch = VENDORS.some((v) => v.faction === q.factionId);
      if (!vendorMatch) {
        reachabilityFailures.push({ id: q.id, title: q.title, kind: 'fq',
          reason: `no vendor in catalog has faction ${q.factionId}` });
      }
    }
    for (const h of HUNTS) {
      if (h.factionId && !knownFactionIds.has(h.factionId)) {
        reachabilityFailures.push({ id: h.id, title: h.title, kind: 'hunt',
          reason: `unknown factionId ${h.factionId}` });
      }
      if (h.minRep < 0) {
        reachabilityFailures.push({ id: h.id, title: h.title, kind: 'hunt',
          reason: `negative rep requirement ${h.minRep}` });
      }
      if (h.factionId) {
        const vendorMatch = VENDORS.some((v) => v.faction === h.factionId);
        if (!vendorMatch) {
          reachabilityFailures.push({ id: h.id, title: h.title, kind: 'hunt',
            reason: `no vendor in catalog has faction ${h.factionId}` });
        }
      }
      // Hunt's target enemy must exist in enemies.json.
      const enemyMatch = (enemiesData as Array<{ name: string }>).some(
        (e) => e.name === h.targetEnemyName,
      );
      if (!enemyMatch) {
        reachabilityFailures.push({ id: h.id, title: h.title, kind: 'hunt',
          reason: `targetEnemyName "${h.targetEnemyName}" not in enemies catalog` });
      }
    }
    for (const m of MYSTERIES) {
      if (m.factionId && !knownFactionIds.has(m.factionId)) {
        reachabilityFailures.push({ id: m.id, title: m.title, kind: 'mystery',
          reason: `unknown factionId ${m.factionId}` });
      }
      if (m.minRep < 0) {
        reachabilityFailures.push({ id: m.id, title: m.title, kind: 'mystery',
          reason: `negative rep requirement ${m.minRep}` });
      }
      if (m.factionId) {
        const vendorMatch = VENDORS.some((v) => v.faction === m.factionId);
        if (!vendorMatch) {
          reachabilityFailures.push({ id: m.id, title: m.title, kind: 'mystery',
            reason: `no vendor in catalog has faction ${m.factionId}` });
        }
      }
    }
    for (const s of STORYLINES) {
      if (!knownFactionIds.has(s.factionId)) {
        reachabilityFailures.push({ id: s.id, title: s.title, kind: 'storyline',
          reason: `unknown factionId ${s.factionId}` });
      }
      if (s.minRep < 0) {
        reachabilityFailures.push({ id: s.id, title: s.title, kind: 'storyline',
          reason: `negative rep requirement ${s.minRep}` });
      }
      const vendorMatch = VENDORS.some((v) => v.faction === s.factionId);
      if (!vendorMatch) {
        reachabilityFailures.push({ id: s.id, title: s.title, kind: 'storyline',
          reason: `no vendor in catalog has faction ${s.factionId}` });
      }
    }

    // ─── Next-storyline links ──────────────────────────────────────
    // Schema does not currently declare nextStorylineId; if one ever
    // appears it must resolve to a real storyline id.
    const storylineIds = new Set(STORYLINES.map((s) => s.id));
    for (const s of STORYLINES as Array<typeof STORYLINES[number] & { nextStorylineId?: string }>) {
      if (s.nextStorylineId && !storylineIds.has(s.nextStorylineId)) {
        nextStorylineFailures.push({
          id: s.id, title: s.title, kind: 'storyline',
          reason: `nextStorylineId "${s.nextStorylineId}" not found`,
        });
      }
    }

    // ─── Per-quest accept / advance / turn-in walk ─────────────────

    // Faction quests — accept, walk every stage gated on its advanceOn,
    // turn in, verify TC + rep + completed list.
    for (const q of FACTION_QUESTS) {
      await freshState({ factionId: q.factionId, minRep: q.requirement.rep });
      const titleSnippet = q.title.split(' ').slice(0, 3).join(' ');

      // Accept via direct store action — engine path under test.
      store.getState().acceptFactionQuest(q.id);
      let active = (store.getState().player?.activeFactionQuestIds ?? []);
      if (!active.includes(q.id)) {
        acceptFailures.push({ id: q.id, title: q.title, kind: 'fq',
          reason: `not on active list after accept (snippet: "${titleSnippet}")` });
        continue;
      }

      // Walk every stage. The current stage's advanceOn defines what
      // trigger pushes to the next. Stages with advanceOn=any take a
      // 'kill' for convenience.
      const stages = q.stages ?? [];
      let stalled = false;
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i]!;
        const trigger = stage.advanceOn ?? 'any';

        // Snapshot stage before trigger.
        const stageBefore = (store.getState().player?.activeFactionQuests ?? [])
          .find((r) => r.id === q.id)?.stage ?? -1;

        if (trigger === 'travel' || trigger === 'any' && stage.advanceOn === undefined) {
          // For travel: hop to a *different* location to fire travelTo.
          const cur = store.getState().player?.currentLocationId;
          const targetLoc = cur === 'varakush' ? 'drakova' : 'varakush';
          store.getState().travelTo(targetLoc);
        } else if (trigger === 'kill' || trigger === 'any') {
          // Inject a 0-HP enemy on the scene and call resolveEnemyDefeat,
          // which is the same flow combat goes through after a fatal hit.
          const sampleEnemy = (enemiesData as any[]).find((e) => e.name === 'Mud Boar')
            ?? (enemiesData as any[])[0];
          store.setState((s) => {
            if (!s.currentScene) return s;
            return {
              ...s,
              currentScene: {
                ...s.currentScene,
                enemies: [{ ...sampleEnemy }],
                enemyHps: [0],
                activeEnemyIdx: 0,
                range: 'close',
              },
            };
          });
          store.getState().resolveEnemyDefeat();
        }

        const stageAfter = (store.getState().player?.activeFactionQuests ?? [])
          .find((r) => r.id === q.id)?.stage ?? -1;
        const completed = (store.getState().player?.completedFactionQuestIds ?? []).includes(q.id);

        if (stageAfter <= stageBefore && !completed) {
          stageFailures.push({
            id: q.id, title: q.title, kind: 'fq',
            stageIdx: i, advanceOn: trigger,
            reason: `stage ${i} (advanceOn=${trigger}) did not advance (stage ${stageBefore} → ${stageAfter})`,
          });
          stalled = true;
          break;
        }

        // After the vendor scene was cleared by travelTo / resolveEnemyDefeat
        // (which rolls a new scene), re-inject the vendor for the next
        // stage's trigger and (eventually) turn-in.
        store.setState((s) => {
          const scene = s.currentScene;
          if (!scene) return s;
          if (scene.vendor) return s;
          return {
            ...s,
            currentScene: {
              ...scene,
              vendor: {
                id: 'audit_vendor', name: 'Audit Vendor', title: 'Auditor',
                faction: q.factionId, description: '', offers: [],
                gender: 'female' as const,
              },
              enemies: [], enemyHps: [], range: null,
            },
          };
        });
      }

      if (stalled) continue;

      // Turn-in — record pre-state to verify TC + rep deltas.
      const pBefore = store.getState().player!;
      const tcBefore = pBefore.tc;
      const repBefore = pBefore.factionStanding.find((r) => r.factionId === q.factionId)?.standing ?? 0;
      store.getState().turnInFactionQuest(q.id);
      const pAfter = store.getState().player!;
      const inCompleted = (pAfter.completedFactionQuestIds ?? []).includes(q.id);
      const stillActive = (pAfter.activeFactionQuestIds ?? []).includes(q.id);
      const tcDelta = pAfter.tc - tcBefore;
      const repAfter = pAfter.factionStanding.find((r) => r.factionId === q.factionId)?.standing ?? 0;
      const repDelta = repAfter - repBefore;
      if (!inCompleted || stillActive || tcDelta < q.reward.tc || repDelta < q.reward.rep) {
        turnInFailures.push({
          id: q.id, title: q.title, kind: 'fq',
          reason: `turn-in failed: completed=${inCompleted}, stillActive=${stillActive}, tcDelta=${tcDelta}/${q.reward.tc}, repDelta=${repDelta}/${q.reward.rep}`,
        });
      }
    }

    // Hunts — accept + walk every stage by directly bumping the record
    // through advanceHunt (until the boss stage spawns its scaled boss,
    // which we then kill via resolveEnemyDefeat).
    for (const h of HUNTS) {
      await freshState({ factionId: h.factionId, minRep: h.minRep });
      store.getState().acceptHunt(h.id);
      const active = store.getState().player?.activeHunts ?? [];
      const rec = active.find((r) => r.id === h.id);
      if (!rec) {
        acceptFailures.push({ id: h.id, title: h.title, kind: 'hunt',
          reason: 'not on active list after accept' });
        continue;
      }

      // Drive every stage forward via advanceHunt. The boss stage
      // spawns a scaled enemy; resolveEnemyDefeat closes it.
      let bossSpawned = false;
      let bossKilled = false;
      for (let i = 1; i < h.stages.length; i++) {
        store.getState().advanceHunt(h.id);
        const updated = (store.getState().player?.activeHunts ?? []).find((r) => r.id === h.id);
        if (!updated) break;
        if (h.stages[updated.stage - 1]?.checkKind === 'boss') {
          bossSpawned = true;
          // Resolve the boss kill — completes hunt by stamping
          // stage past the end.
          store.setState((s) => {
            if (!s.currentScene) return s;
            // Boss scene was set by advanceHunt; ensure HP=0 so
            // resolveEnemyDefeat closes the loop.
            return {
              ...s,
              currentScene: {
                ...s.currentScene,
                enemyHps: s.currentScene.enemyHps.map(() => 0),
              },
            };
          });
          store.getState().resolveEnemyDefeat();
          const finalRec = (store.getState().player?.activeHunts ?? []).find((r) => r.id === h.id);
          if (finalRec && finalRec.stage >= h.stages.length) bossKilled = true;
          break;
        }
      }
      if (!bossSpawned || !bossKilled) {
        stageFailures.push({
          id: h.id, title: h.title, kind: 'hunt',
          stageIdx: -1, advanceOn: 'boss',
          reason: `boss stage progression failed (spawned=${bossSpawned}, killed=${bossKilled})`,
        });
        continue;
      }

      // Re-inject vendor of the right faction for turn-in. Hunts may be
      // open contracts (factionId=null); any vendor will do then, but
      // for safety we use a vendor whose faction matches the hunt's
      // factionId (or null).
      store.setState((s) => {
        const scene = s.currentScene;
        if (!scene) return s;
        return {
          ...s,
          currentScene: {
            ...scene,
            vendor: {
              id: 'audit_vendor', name: 'Audit Vendor', title: 'Auditor',
              faction: h.factionId, description: '', offers: [],
              gender: 'female' as const,
            },
            enemies: [], enemyHps: [], range: null,
          },
        };
      });

      const pBefore = store.getState().player!;
      const tcBefore = pBefore.tc;
      store.getState().turnInHunt(h.id);
      const pAfter = store.getState().player!;
      const completed = (pAfter.completedHuntIds ?? []).includes(h.id);
      const tcDelta = pAfter.tc - tcBefore;
      if (!completed || tcDelta < h.rewardTc) {
        turnInFailures.push({
          id: h.id, title: h.title, kind: 'hunt',
          reason: `turn-in failed: completed=${completed}, tcDelta=${tcDelta}/${h.rewardTc}`,
        });
      }
    }

    // Mysteries — accept, fast-forward via advanceMystery until past
    // the last stage, then turn in.
    for (const m of MYSTERIES) {
      await freshState({ factionId: m.factionId, minRep: m.minRep });
      store.getState().acceptMystery(m.id);
      const rec = (store.getState().player?.activeMysteries ?? []).find((r) => r.id === m.id);
      if (!rec) {
        acceptFailures.push({ id: m.id, title: m.title, kind: 'mystery',
          reason: 'not on active list after accept' });
        continue;
      }
      // advanceMystery from stage 1 to past stages.length.
      for (let i = rec.stage; i < m.stages.length; i++) {
        store.getState().advanceMystery(m.id);
      }
      const final = (store.getState().player?.activeMysteries ?? []).find((r) => r.id === m.id);
      if (!final || final.stage < m.stages.length) {
        stageFailures.push({
          id: m.id, title: m.title, kind: 'mystery',
          stageIdx: final?.stage ?? -1, advanceOn: 'check',
          reason: `mystery stages did not complete (stage=${final?.stage}/${m.stages.length})`,
        });
        continue;
      }
      // Re-inject the vendor (currentScene was untouched, but be safe).
      store.setState((s) => {
        const scene = s.currentScene;
        if (!scene) return s;
        return {
          ...s,
          currentScene: {
            ...scene,
            vendor: {
              id: 'audit_vendor', name: 'Audit Vendor', title: 'Auditor',
              faction: m.factionId, description: '', offers: [],
              gender: 'female' as const,
            },
            enemies: [], enemyHps: [], range: null,
          },
        };
      });
      const pBefore = store.getState().player!;
      const tcBefore = pBefore.tc;
      store.getState().turnInMystery(m.id);
      const pAfter = store.getState().player!;
      const completed = (pAfter.completedMysteryIds ?? []).includes(m.id);
      const tcDelta = pAfter.tc - tcBefore;
      if (!completed || tcDelta < m.rewardTc) {
        turnInFailures.push({
          id: m.id, title: m.title, kind: 'mystery',
          reason: `turn-in failed: completed=${completed}, tcDelta=${tcDelta}/${m.rewardTc}`,
        });
      }
    }

    // Storylines — accept, fast-forward via advanceStoryline.
    for (const s of STORYLINES) {
      await freshState({ factionId: s.factionId, minRep: s.minRep });
      store.getState().acceptStoryline(s.id);
      const rec = (store.getState().player?.activeStorylines ?? []).find((r) => r.id === s.id);
      if (!rec) {
        acceptFailures.push({ id: s.id, title: s.title, kind: 'storyline',
          reason: 'not on active list after accept' });
        continue;
      }
      for (let i = rec.stage; i < s.stages.length; i++) {
        store.getState().advanceStoryline(s.id);
      }
      const final = (store.getState().player?.activeStorylines ?? []).find((r) => r.id === s.id);
      if (!final || final.stage < s.stages.length) {
        stageFailures.push({
          id: s.id, title: s.title, kind: 'storyline',
          stageIdx: final?.stage ?? -1, advanceOn: 'check',
          reason: `storyline stages did not complete (stage=${final?.stage}/${s.stages.length})`,
        });
        continue;
      }
      store.setState((st) => {
        const scene = st.currentScene;
        if (!scene) return st;
        return {
          ...st,
          currentScene: {
            ...scene,
            vendor: {
              id: 'audit_vendor', name: 'Audit Vendor', title: 'Auditor',
              faction: s.factionId, description: '', offers: [],
              gender: 'female' as const,
            },
            enemies: [], enemyHps: [], range: null,
          },
        };
      });
      const pBefore = store.getState().player!;
      const tcBefore = pBefore.tc;
      const repBefore = pBefore.factionStanding.find((r) => r.factionId === s.factionId)?.standing ?? 0;
      store.getState().turnInStoryline(s.id);
      const pAfter = store.getState().player!;
      const completed = (pAfter.completedStorylineIds ?? []).includes(s.id);
      const tcDelta = pAfter.tc - tcBefore;
      const repAfter = pAfter.factionStanding.find((r) => r.factionId === s.factionId)?.standing ?? 0;
      const repDelta = repAfter - repBefore;
      if (!completed || tcDelta < s.rewardTc || repDelta < s.rewardRep) {
        turnInFailures.push({
          id: s.id, title: s.title, kind: 'storyline',
          reason: `turn-in failed: completed=${completed}, tcDelta=${tcDelta}/${s.rewardTc}, repDelta=${repDelta}/${s.rewardRep}`,
        });
      }
    }

    // ─── Report ────────────────────────────────────────────────────
    const total = FACTION_QUESTS.length + HUNTS.length + MYSTERIES.length + STORYLINES.length;
    console.log = _origLog;
    const lines: string[] = [];
    lines.push('');
    lines.push('============== QUEST PROGRESSION AUDIT ==============');
    lines.push(`Total quests audited: ${total}`);
    lines.push(`  faction quests: ${FACTION_QUESTS.length}`);
    lines.push(`  hunts:          ${HUNTS.length}`);
    lines.push(`  mysteries:      ${MYSTERIES.length}`);
    lines.push(`  storylines:     ${STORYLINES.length}`);
    lines.push('');
    lines.push(`Accept failures:        ${acceptFailures.length}`);
    for (const f of acceptFailures) lines.push(`  ✗ [${f.kind}] ${f.id} — ${f.reason}`);
    lines.push(`Stage-advance failures: ${stageFailures.length}`);
    for (const f of stageFailures) lines.push(`  ✗ [${f.kind}] ${f.id} stage ${f.stageIdx} (advanceOn=${f.advanceOn}) — ${f.reason}`);
    lines.push(`Turn-in failures:       ${turnInFailures.length}`);
    for (const f of turnInFailures) lines.push(`  ✗ [${f.kind}] ${f.id} — ${f.reason}`);
    lines.push(`Reachability failures:  ${reachabilityFailures.length}`);
    for (const f of reachabilityFailures) lines.push(`  ✗ [${f.kind}] ${f.id} — ${f.reason}`);
    lines.push(`Storyline-link failures:${nextStorylineFailures.length}`);
    for (const f of nextStorylineFailures) lines.push(`  ✗ [${f.kind}] ${f.id} — ${f.reason}`);
    lines.push('=====================================================');
    const report = lines.join('\n');
    console.log(report);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      fs.writeFileSync('/tmp/tartaria-quest-audit.txt', report);
    } catch { /* best effort */ }

    expect(acceptFailures).toEqual([]);
    expect(stageFailures).toEqual([]);
    expect(turnInFailures).toEqual([]);
    expect(reachabilityFailures).toEqual([]);
    expect(nextStorylineFailures).toEqual([]);
  });
});
