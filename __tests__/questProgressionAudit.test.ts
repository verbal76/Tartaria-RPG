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
import { escortSpecForQuest } from '../app/engine/escort';
import { missionObjectiveLocationId } from '../app/engine/missionRouting';
import { HUNTS } from '../app/engine/hunts';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { FACTIONS } from '../app/engine/factions';
import { VENDORS } from '../app/engine/vendors';
import enemiesData from '../app/data/enemies/enemies.json';
import locationsData from '../app/data/locations/locations.json';

// A ring of distinct, travelable location ids. A multi-stage `travel` quest
// advances on reaching a NEW location, so bouncing between two isn't enough —
// rotate through fresh ones.
const TRAVEL_RING: string[] = (locationsData as Array<{ id: string }>).map((l) => l.id);

interface Failure {
  id: string;
  title: string;
  kind: 'fq' | 'hunt' | 'mystery' | 'storyline';
  reason: string;
}

describe('Quest progression audit', () => {
  jest.setTimeout(180000);

  // OTA 037 — deterministic seed. The engine uses Math.random
  // heavily (weather, encounter, scene generation) and a handful of
  // travel-only faction quests (fq_order_field, fq_tartarians_pilgrimage)
  // intermittently failed turn-in across runs because the random
  // path through beginScene occasionally inserted state that
  // de-synced the audit's expectations. Seed Math.random with a
  // simple LCG so every run sees the same path.
  let _realRandom: typeof Math.random;
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    _realRandom = Math.random;
    let seed = 0x12345678 >>> 0;
    Math.random = () => {
      // Numerical Recipes LCG — good enough for a deterministic test
      // path; not cryptographic.
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
  });

  afterAll(() => {
    console.log = _origLog;
    console.warn = _origWarn;
    console.error = _origErr;
    Math.random = _realRandom;
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

    // ⚠⚠ OTA-1450 — AND FORCE THE HP CEILING, for the same reason the standing
    // is forced below. This audit asks *"can every authored quest be walked from
    // accept to turn-in?"* — a CONTENT question. It is not asking whether a
    // day-one character is ready for the Apex hunts, and reputation stopped
    // being the only thing a board checks: hunts now post only when their
    // authored `recommendedHp` is within reach of yours. A fresh Auditor sits
    // around 50 HP, so 86 of the catalogue's stages went unwalkable overnight
    // and the audit reported them as broken content. The character is a probe,
    // not a playthrough; give it the reach to see the whole catalogue.
    store.setState((s) => (s.player ? { ...s, player: { ...s.player, hpMax: 999 } } : s));

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
      // OTA-970 (#117) — stranded escorts are HOOK-granted only: boards, vendors,
      // and acceptFactionQuest refuse them by design (you find the stranded
      // soul in the wild). Seed the active record the way applyHookEffect's
      // start_escort_contract does, then walk stages + turn-in exactly like
      // every other contract. The hook ACCEPT path itself is covered by
      // ota988HookEscort and the escort gauntlet suite.
      if (/_stranded_/.test(q.id)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const escortMod = require('../app/engine/escort');
        const spec = escortMod.escortSpecForQuest(q);
        const escort = spec ? escortMod.spawnEscortPool(spec.count, store.getState().player?.hpMax ?? 20, spec.label) : null;
        store.setState((s) => {
          if (!s.player) return s;
          return {
            ...s,
            player: {
              ...s.player,
              activeFactionQuestIds: [...(s.player.activeFactionQuestIds ?? []), q.id],
              activeFactionQuests: [
                ...(s.player.activeFactionQuests ?? []),
                { id: q.id, stage: 0, postedByFaction: q.factionId, acceptedAt: Date.now(), tracked: true, ...(escort ? { escort } : {}) },
              ],
            },
          };
        });
      } else {
        store.getState().acceptFactionQuest(q.id);
      }
      let active = (store.getState().player?.activeFactionQuestIds ?? []);
      if (!active.includes(q.id)) {
        acceptFailures.push({ id: q.id, title: q.title, kind: 'fq',
          reason: `not on active list after accept (snippet: "${titleSnippet}")` });
        continue;
      }

      // ⚠⚠ SNAPSHOT AT ACCEPT, NOT AT TURN-IN. The reward check below used to measure the
      // TC/rep delta across the `turnInFactionQuest` call alone, which quietly assumed the
      // payment always happens INSIDE that call. It doesn't: a travel-gated quest whose
      // last stage advance completes it is paid right there, and the later turn-in is
      // correctly a no-op — so the narrow window reads 0/60 and the audit calls a healthy
      // quest broken.
      //
      // That is the mechanism-vs-rule trap. The RULE is "accepting and finishing this
      // quest pays the player its reward, once." Where in the flow the credit lands is an
      // implementation detail the audit has no business pinning. Measuring accept→end
      // states the rule directly and stops the assertion from being seed-fragile.
      //
      // ⚠ It surfaced when two locations were added to the atlas: the seeded LCG stream
      // shifted, the pilgrimage's final hop landed on a different tile, and it began
      // self-completing. This suite's own header already names `fq_tartarians_pilgrimage`
      // as historically seed-fragile — this is that same fragility, fixed at the root
      // rather than re-seeded around.
      const pAtAccept = store.getState().player!;
      const tcAtAccept = pAtAccept.tc;
      const repAtAccept = pAtAccept.factionStanding
        .find((r) => r.factionId === q.factionId)?.standing ?? 0;

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

        // ⚠ OTA-1594 — THE PURSE GATE. A quest with a tcThreshold refuses its
        // FINAL advance (and says so) until the purse holds the number its
        // objective names. Top the purse up before the last trigger: this audit
        // asks whether the content is walkable, not whether the Auditor is rich
        // — and the refusal path has its own dedicated coverage in ota1594.
        if (i === stages.length - 1 && q.tcThreshold) {
          store.setState((s) => (s.player
            ? { ...s, player: { ...s.player, tc: Math.max(s.player.tc, q.tcThreshold!) } }
            : s));
        }

        if (trigger === 'steal') {
          // ⚠ OTA-1594 — drive the REAL theft door, stealFromVendor, with a
          // stacked deck: STE 30 clears the alert-merchant DC 16 on any d20, so
          // the clean-lift branch (the one that now reports the deed to the
          // quest machine) always runs. Anything less would be the audit
          // hand-bumping the stage — the exact shortcut that let "Pinch from
          // the Monarchs" ship broken.
          store.setState((s) => {
            if (!s.player || !s.currentScene) return s;
            return {
              ...s,
              player: { ...s.player, stats: { ...s.player.stats, stealth: 30 } },
              currentScene: {
                ...s.currentScene,
                vendor: {
                  id: 'audit_vendor', name: 'Audit Vendor', title: 'Auditor',
                  faction: q.factionId, description: '', gender: 'female' as const,
                  demeanor: 'sketchy' as const,
                  offers: [{ itemName: 'Audit Trinket', price: 1 }],
                },
                enemies: [], enemyHps: [], range: null,
              },
            };
          });
          store.getState().stealFromVendor('Audit Trinket');
        } else if (trigger === 'travel' || trigger === 'any' && stage.advanceOn === undefined) {
          // For travel: hop to a NEW location each stage (these stages advance on
          // discovering a fresh place, so rotate the ring rather than bounce two).
          const cur = store.getState().player?.currentLocationId;
          let targetLoc = TRAVEL_RING[i % TRAVEL_RING.length]!;
          if (targetLoc === cur) targetLoc = TRAVEL_RING[(i + 1) % TRAVEL_RING.length]!;
          // ⚠⚠ OTA-1332 — THE ARRIVAL BEAT HAPPENS AT THE PLACE THE QUEST NAMES. A
          // travel-gated FINAL stage of a quest that names a destination no longer counts
          // any old road: `fq_servants_tribute` says "Carry it to the Vault. Set it on the
          // threshold", and it used to complete three steps in the opposite direction.
          // This audit rotated a ring of convenient tiles and so walked straight into the
          // new gate — which is the harness standing still again, not a regression. Where
          // the quest names somewhere, go THERE for the last hop.
          if (i === stages.length - 1) {
            const dest = missionObjectiveLocationId(q);
            if (dest) targetLoc = dest;
          }
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

      // OTA-450 fetch quests gate turn-in on holding the gathered items (they're
      // consumed on hand-in). The stage walk above only fires travel/kill
      // triggers, so put the required items in the pack before turning in —
      // otherwise turn-in correctly refuses an unfulfilled fetch.
      const fetchReq = (q as { fetch?: { itemName: string; quantity: number } }).fetch;
      if (fetchReq) {
        store.setState((s) => (s.player ? {
          player: {
            ...s.player,
            inventory: [
              ...s.player.inventory,
              { id: `fetch_${q.id}`, name: fetchReq.itemName, kind: 'misc' as const, rarity: 'Common' as const, quantity: fetchReq.quantity, tags: [] },
            ],
          },
        } : s));
      }

      // ⚠ OTA-1711 — an ESCORT will not be handed back on the spot it was picked
      // up from, because that means nobody was escorted anywhere. Same shape as
      // the fetch block above: satisfy the precondition rather than simulate it,
      // by standing the pickup cell somewhere other than here — which is what
      // "you carried these people" means to the turn-in.
      if (escortSpecForQuest(q)) {
        store.setState((s) => (s.player ? {
          player: {
            ...s.player,
            activeFactionQuests: (s.player.activeFactionQuests ?? []).map((r) =>
              r.id === q.id ? { ...r, acceptedAtCell: { x: -99, y: -99 } } : r),
          },
        } : s));
      }

      // Force a SAME-FACTION vendor onto the scene for the hand-in. The last
      // travel stage rolls a fresh scene that may carry a DIFFERENT faction's
      // real vendor, which turn-in correctly refuses — overwrite it so we're
      // exercising the turn-in path, not the wrong-faction guard.
      store.setState((s) => (s.currentScene ? {
        currentScene: {
          ...s.currentScene,
          vendor: {
            id: 'audit_vendor', name: 'Audit Vendor', title: 'Auditor',
            faction: q.factionId, description: '', offers: [], gender: 'female' as const,
          },
        },
      } : s));

      // Turn-in. Calling it is still right for every quest that waits to be handed in;
      // for one already completed by its final stage advance it is a harmless no-op.
      const pBefore = store.getState().player!;
      store.getState().turnInFactionQuest(q.id);
      const pAfter = store.getState().player!;
      const inCompleted = (pAfter.completedFactionQuestIds ?? []).includes(q.id);
      const stillActive = (pAfter.activeFactionQuestIds ?? []).includes(q.id);
      // ⚠ Deltas measured from ACCEPT, so the reward counts wherever in the flow it was
      // credited. See the note at the accept-time snapshot above for why.
      const tcDelta = pAfter.tc - tcAtAccept;
      const repAfter = pAfter.factionStanding.find((r) => r.factionId === q.factionId)?.standing ?? 0;
      const repDelta = repAfter - repAtAccept;
      if (!inCompleted || stillActive || tcDelta < q.reward.tc || repDelta < q.reward.rep) {
        const recAtTurnIn = (pBefore.activeFactionQuests ?? []).find((r) => r.id === q.id);
        turnInFailures.push({
          id: q.id, title: q.title, kind: 'fq',
          reason: `turn-in failed: completed=${inCompleted}, stillActive=${stillActive}, tcDelta=${tcDelta}/${q.reward.tc} (from accept), repDelta=${repDelta}/${q.reward.rep} (from accept), stage=${recAtTurnIn?.stage ?? '?'}/${(q.stages ?? []).length}`,
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

      // Drive every stage forward via advanceHunt. Each boss stage spawns a
      // scaled enemy; resolveEnemyDefeat closes it. NOTE (OTA-426): several
      // hunts carry a MID-hunt boss stage AND a final boss stage, and only the
      // FINAL one completes the hunt (resolveEnemyDefeat advances only when the
      // record is already past the last boss stage). So we must NOT stop at the
      // first boss — keep advancing and resolving each boss stage until the hunt
      // actually completes.
      let bossSpawned = false;
      let bossKilled = false;
      for (let i = 0; i < h.stages.length + 2 && !bossKilled; i++) {
        const cur = (store.getState().player?.activeHunts ?? []).find((r) => r.id === h.id);
        if (!cur) break;
        if (cur.stage >= h.stages.length) { bossKilled = true; break; }
        store.getState().advanceHunt(h.id);
        // OTA-796 — the FINAL boss stage FREEZES the hunt (advanceHunt spawns the
        // boss but does NOT increment the stage; only the kill advances it). So a
        // stage-delta check misses it — detect the spawned boss by a LIVE enemy in
        // the scene instead. This covers both the mid-hunt boss (which increments
        // on spawn) and the frozen final boss (which doesn't).
        const scene = store.getState().currentScene;
        const liveEnemy = !!scene && scene.enemies.some((_, idx) => (scene.enemyHps[idx] ?? 0) > 0);
        if (liveEnemy) {
          bossSpawned = true;
          // Zero its HP so resolveEnemyDefeat registers the kill (and advances the
          // hunt iff it's the final boss).
          store.setState((s) => {
            if (!s.currentScene) return s;
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
          if (!finalRec || finalRec.stage >= h.stages.length) bossKilled = true;
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
      // ⚠⚠⚠ OTA-1583 — A CHAPTER THAT STANDS SOMETHING UP IS CLOSED BY THE KILL,
      // not by the next advance. `spawn` moved up to the shared stage binding
      // this OTA so a storyline can finally put on the stair the thing its own
      // prose says is on the stair — and the chapter FREEZES until the pack is
      // down, which is exactly what the hunt loop above has always had to handle
      // for boss stages. This audit fast-forwards, so it resolves the pack the
      // same way the hunt loop does; ota1220's walker plays it properly, verb by
      // verb, and is the end-to-end proof.
      for (let i = rec.stage; i < s.stages.length + 2; i++) {
        const cur = (store.getState().player?.activeStorylines ?? []).find((r) => r.id === s.id);
        if (!cur || cur.stage >= s.stages.length) break;
        store.getState().advanceStoryline(s.id);
        const scene = store.getState().currentScene;
        const liveEnemy = !!scene && scene.enemies.some((_, idx) => (scene.enemyHps[idx] ?? 0) > 0);
        if (liveEnemy) {
          store.setState((st) => (st.currentScene
            ? { ...st, currentScene: { ...st.currentScene, enemyHps: st.currentScene.enemyHps.map(() => 0) } }
            : st));
          store.getState().resolveEnemyDefeat();
        }
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
