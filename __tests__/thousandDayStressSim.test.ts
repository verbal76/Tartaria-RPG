// Thousand-day stress simulation. Drives the gameStore through 1000
// in-game days (24000 hours) with an action picker that responds to
// scene state — combat, vendors, hooks, climbables, salvageables —
// and surfaces bugs by tracking coverage stats and bug signals (hp
// jumps, stuck actions, uncaught exceptions).
//
// Filename contains "Stress" so the default `npm test` ignores it
// via --testPathIgnorePatterns. Run explicitly:
//   npx jest __tests__/thousandDayStressSim.test.ts --runInBand --testTimeout=600000
//
// Mocking block copied verbatim from twoYearChaosSim so the Jest env
// can load gameStore without native modules.

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

jest.mock('../app/ai/generation/QwenGenerativeEngine', () => {
  class MockQwen {
    isReady() { return true; }
    getModelId() { return 'mock-qwen'; }
    getStatus() { return 'ready' as const; }
    async initialize(_opts: any) { /* no-op */ }
    async generate(_messages: any, _opts?: any) {
      return JSON.stringify({ intent: 'look', target: '' });
    }
  }
  return {
    QwenGenerativeEngine: MockQwen,
    DEFAULT_QWEN_MODEL_ID: 'mock-qwen',
  };
});

const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { isSalvageable, isClimbable } from '../app/engine/interactionTags';

type Counter = Record<string, number>;
function bump(c: Counter, key: string, n = 1) {
  c[key] = (c[key] ?? 0) + n;
}
function topN(c: Counter, n: number): Array<[string, number]> {
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);
}

describe('Thousand-day stress simulation of Tartaria Realms', () => {
  // v2.4.1 — bumped from 600s to 900s. Grid expanded from 21×21 to
  // 41×41, so D5 cities are 20-28 tiles out instead of 10-19. 1000
  // days of sim now involves more wander steps + more encounters
  // per cross-grid trip.
  jest.setTimeout(900000);

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

  it('runs 1000 in-game days exercising every interaction surface', async () => {
    const store = useGameStore;
    await store.getState().hydrate();

    const races = getRaces();
    const factions = getFactions();
    const race = races.find((r) => r.id === 'reclaimer') ?? races[0]!;
    const fac = factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!;

    await store.getState().startNewGame({
      name: 'Millennial',
      raceId: race.id,
      factionId: fac.id,
    });
    store.getState().skipTutorial?.();

    // ── Telemetry ─────────────────────────────────────────────────────
    const exceptions = {
      count: 0,
      samples: [] as Array<{ turn: number; input: string; message: string; stack: string }>,
    };
    const stuckActions = {
      count: 0,
      samples: [] as Array<{ turn: number; input: string; repeats: number }>,
    };
    const actionsByVerb: Counter = {};
    const combat = {
      kills: 0,
      deaths: 0,
      resurrections: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      fleesAttempted: 0,
      fleesSucceeded: 0,
    };
    const climbs = {
      attempted: 0,
      tiersCleared: 0,
      topsReached: 0,
      topLootDropped: {} as Counter,
    };
    const trades = {
      buyCount: 0,
      sellCount: 0,
      stealAttempted: 0,
      stealSuccess: 0,
      stealCaught: 0,
      vendorTypesEncountered: new Set<string>(),
    };
    const quests = {
      accepted: {} as Counter,
      completed: {} as Counter,
      abandoned: {} as Counter,
    };
    const inventory = {
      uniqueItemsFound: new Set<string>(),
      tcEarned: 0,
      tcSpent: 0,
    };
    const worldCoverage = {
      distinctLocationsVisited: new Set<string>(),
      distinctMicroMicros: new Set<string>(),
      distinctEnemyTypesFought: new Set<string>(),
      distinctVendorsMet: new Set<string>(),
    };
    const hpJumpsDetected: Array<{ turn: number; from: number; to: number; allowed: number; hoursDelta: number }> = [];

    let pendingResolves = 0;
    let totalActions = 0;
    let prevLogLen = 0;
    let prevKills = 0;
    let prevTc = store.getState().player?.tc ?? 0;
    let prevHp = store.getState().player?.hp ?? 0;
    let prevHpMax = store.getState().player?.hpMax ?? 1;
    let prevHours = store.getState().player?.hoursElapsed ?? 0;
    let prevInventoryNames = new Set<string>();
    const acceptedQuestIds = new Set<string>();
    const completedQuestIds = new Set<string>();
    let prevElevatedTier = 0;
    let prevElevatedNoun: string | null = null;
    let prevActiveEnemyHp: number | null = null;
    let leftHub = false;
    let lastInput = '';
    let lastStateSnap = '';
    let stuckStreak = 0;
    let stuckFlaggedThisStreak = false;
    let periodicCounter = 0;

    const intentOf = (text: string): string => {
      const t = text.trim().toLowerCase();
      if (!t) return '<empty>';
      return t.split(/\s+/)[0]!;
    };

    const resolveAnyPendingRoll = () => {
      let safety = 0;
      while (store.getState().pendingRolls && safety < 50) {
        const pr = store.getState().pendingRolls!;
        const step = pr.steps[pr.currentStep];
        if (!step) {
          try { store.getState().cancelPendingRolls(); } catch {}
          break;
        }
        const values: number[] = [];
        const count = step.count ?? 1;
        const sides = step.sides ?? 6;
        for (let i = 0; i < count; i++) {
          values.push(1 + Math.floor(Math.random() * sides));
        }
        try {
          store.getState().resolveRollStep(values);
          pendingResolves++;
        } catch (e: any) {
          if (exceptions.count < 5) {
            exceptions.samples.push({
              turn: totalActions,
              input: 'resolveRollStep',
              message: e?.message ?? String(e),
              stack: (e?.stack ?? '').slice(0, 600),
            });
          }
          exceptions.count++;
          try { store.getState().cancelPendingRolls(); } catch {}
          break;
        }
        safety++;
      }
      if (safety >= 50) {
        try { store.getState().cancelPendingRolls(); } catch {}
      }
    };

    const inspectNewLogs = (newLogs: Array<{ text: string; channel: string }>) => {
      for (const l of newLogs) {
        const text = l.text ?? '';
        // Combat outcomes
        const dmgDealt = /you deal (\d+)/i.exec(text);
        if (dmgDealt) combat.totalDamageDealt += parseInt(dmgDealt[1]!, 10);
        const dmgTaken = /you take (\d+)/i.exec(text);
        if (dmgTaken) combat.totalDamageTaken += parseInt(dmgTaken[1]!, 10);
        // Flee outcomes
        if (/you (?:break away|slip free|escape|get away|disengage and escape)/i.test(text)) {
          combat.fleesSucceeded++;
        }
        // Climb / tier / top
        if (/you reach the top|crowns? (?:the|of)/i.test(text) || /you stand atop/i.test(text)) {
          climbs.topsReached++;
        }
        if (/clear(?:ed)?\s+(?:a|the|another)?\s*tier|climb(?:ed)? (?:up )?to tier/i.test(text)) {
          climbs.tiersCleared++;
        }
        const lootMatch = /(?:from the top|atop[^.]*?)[,.]?\s*(?:you find|you spot|you recover|you pull|dropped?|yields?)\s+(?:an?|the)?\s*([A-Z][a-zA-Z\s]+)/.exec(text);
        if (lootMatch) bump(climbs.topLootDropped, lootMatch[1]!.trim());
        // Steal outcomes
        if (/you (?:pocket|lift|slip away with|filch)/i.test(text)) trades.stealSuccess++;
        if (/(?:caught (?:stealing|red-handed)|guards? (?:notice|spot)|spotted|(?:vendor|trader) sees you)/i.test(text)) trades.stealCaught++;
      }
    };

    const submit = (text: string) => {
      totalActions++;
      lastInput = text;
      bump(actionsByVerb, intentOf(text));

      const sBefore = store.getState();
      const pBefore = sBefore.player;
      const logLenBefore = sBefore.gameLog.length;
      const snapBefore = JSON.stringify({
        loc: pBefore?.currentLocationId,
        mx: pBefore?.mapX,
        my: pBefore?.mapY,
        hp: pBefore?.hp,
        stam: pBefore?.stamina,
        tc: pBefore?.tc,
        inv: pBefore?.inventory.length,
        hrs: pBefore?.hoursElapsed,
      });
      const hpBefore = pBefore?.hp ?? 0;
      const tcBefore = pBefore?.tc ?? 0;
      const hoursBefore = pBefore?.hoursElapsed ?? 0;
      const invNamesBefore = new Set((pBefore?.inventory ?? []).map((i) => i.name));

      try {
        store.getState().submitPlayerAction(text);
      } catch (e: any) {
        exceptions.count++;
        if (exceptions.samples.length < 5) {
          exceptions.samples.push({
            turn: totalActions,
            input: text,
            message: e?.message ?? String(e),
            stack: (e?.stack ?? '').slice(0, 800),
          });
        }
      }
      resolveAnyPendingRoll();

      const sAfter = store.getState();
      const pAfter = sAfter.player;
      const newLogs = sAfter.gameLog.slice(logLenBefore);
      inspectNewLogs(newLogs);

      // Coverage
      if (pAfter?.currentLocationId) worldCoverage.distinctLocationsVisited.add(pAfter.currentLocationId);
      if (sAfter.currentScene?.microMicroId) worldCoverage.distinctMicroMicros.add(sAfter.currentScene.microMicroId);
      if (sAfter.currentScene?.enemies) {
        for (const e of sAfter.currentScene.enemies) {
          worldCoverage.distinctEnemyTypesFought.add(e.type ?? e.name);
        }
      }
      if (sAfter.currentScene?.vendor) {
        const v: any = sAfter.currentScene.vendor;
        worldCoverage.distinctVendorsMet.add(v.name);
        const vt = v.demeanor
          ? `roadside_${v.demeanor}`
          : (v.faction ? 'hub' : 'roadside_unknown');
        trades.vendorTypesEncountered.add(vt);
      }
      for (const it of pAfter?.inventory ?? []) {
        inventory.uniqueItemsFound.add(it.name);
      }

      // Kills
      const curKills = pAfter?.milestones?.enemiesDefeated ?? 0;
      if (curKills > prevKills) {
        combat.kills += (curKills - prevKills);
        prevKills = curKills;
      }

      // TC delta → earned/spent
      const tcAfter = pAfter?.tc ?? 0;
      if (tcAfter > tcBefore) inventory.tcEarned += (tcAfter - tcBefore);
      else if (tcAfter < tcBefore) inventory.tcSpent += (tcBefore - tcAfter);
      prevTc = tcAfter;

      // HP-jump detector. Single set is one "submit" call. allowed
      // healing comes from rest cap (16) plus a hours-scaled buffer:
      // hoursDelta * 2 + 16. Catches anomalous up-jumps; ignores
      // down-jumps (damage is unbounded in concept).
      const hpAfter = pAfter?.hp ?? 0;
      const hoursAfter = pAfter?.hoursElapsed ?? 0;
      const hoursDelta = Math.max(0, hoursAfter - hoursBefore);
      const allowed = hoursDelta * 2 + 16;
      if (hpAfter > hpBefore + allowed) {
        if (hpJumpsDetected.length < 30) {
          hpJumpsDetected.push({
            turn: totalActions,
            from: hpBefore,
            to: hpAfter,
            allowed: hpBefore + allowed,
            hoursDelta,
          });
        }
      }
      prevHp = hpAfter;
      prevHpMax = pAfter?.hpMax ?? prevHpMax;
      prevHours = hoursAfter;

      // Buy / sell detection — inventory delta + tc delta.
      const invNamesAfter = new Set((pAfter?.inventory ?? []).map((i) => i.name));
      let added = 0, removed = 0;
      for (const n of invNamesAfter) if (!invNamesBefore.has(n)) added++;
      for (const n of invNamesBefore) if (!invNamesAfter.has(n)) removed++;
      if (text.toLowerCase().startsWith('buy') && added > 0 && tcAfter < tcBefore) trades.buyCount++;
      if (text.toLowerCase().startsWith('sell') && removed > 0 && tcAfter > tcBefore) trades.sellCount++;
      if (text.toLowerCase().startsWith('steal')) trades.stealAttempted++;
      prevInventoryNames = invNamesAfter;

      // Climb tracking from elevatedOn deltas
      const elev = sAfter.currentScene?.elevatedOn ?? null;
      const tier = elev?.tier ?? 0;
      const noun = elev?.noun ?? null;
      if (text.toLowerCase().startsWith('climb')) climbs.attempted++;
      if (tier > prevElevatedTier && noun === prevElevatedNoun) {
        climbs.tiersCleared += (tier - prevElevatedTier);
      }
      if (elev && elev.tier === elev.totalTiers && prevElevatedTier < elev.totalTiers && elev.totalTiers > 0) {
        climbs.topsReached++;
      }
      prevElevatedTier = tier;
      prevElevatedNoun = noun;

      // Flee attempted counter (separate from succeeded which comes from log)
      if (text.toLowerCase().startsWith('flee')) combat.fleesAttempted++;

      // Quests
      const allActive = [
        ...(pAfter?.activeFactionQuests ?? []).map((q) => ({ id: q.id, kind: 'faction' })),
        ...(pAfter?.activeHunts ?? []).map((q) => ({ id: q.id, kind: 'hunt' })),
        ...(pAfter?.activeMysteries ?? []).map((q) => ({ id: q.id, kind: 'mystery' })),
        ...(pAfter?.activeStorylines ?? []).map((q) => ({ id: q.id, kind: 'storyline' })),
      ];
      for (const q of allActive) {
        if (!acceptedQuestIds.has(q.id)) {
          acceptedQuestIds.add(q.id);
          bump(quests.accepted, q.kind);
        }
      }
      const allCompleted = [
        ...(pAfter?.completedFactionQuestIds ?? []).map((id) => ({ id, kind: 'faction' })),
        ...(pAfter?.completedHuntIds ?? []).map((id) => ({ id, kind: 'hunt' })),
        ...(pAfter?.completedMysteryIds ?? []).map((id) => ({ id, kind: 'mystery' })),
        ...(pAfter?.completedStorylineIds ?? []).map((id) => ({ id, kind: 'storyline' })),
      ];
      for (const q of allCompleted) {
        if (!completedQuestIds.has(q.id)) {
          completedQuestIds.add(q.id);
          bump(quests.completed, q.kind);
        }
      }

      // Active enemy HP tracking (just for combat texture).
      const aIdx = sAfter.currentScene?.activeEnemyIdx ?? 0;
      const aHp = sAfter.currentScene?.enemyHps?.[aIdx] ?? null;
      prevActiveEnemyHp = aHp;

      // Stuck-action detection
      const snapAfter = JSON.stringify({
        loc: pAfter?.currentLocationId,
        mx: pAfter?.mapX,
        my: pAfter?.mapY,
        hp: pAfter?.hp,
        stam: pAfter?.stamina,
        tc: pAfter?.tc,
        inv: pAfter?.inventory.length,
        hrs: pAfter?.hoursElapsed,
      });
      const stateChanged = snapAfter !== snapBefore;
      const newLogText = newLogs.map((l) => l.text).join('|');
      // Stuck = same VERB (not literal text) producing zero state
      // delta. Picker varies the noun each turn so checking literal
      // equality never triggers.
      const sameVerb = intentOf(lastInput) === intentOf(text);
      const noStateNoNewLog = !stateChanged && newLogText.length === 0;
      if (sameVerb && noStateNoNewLog) {
        stuckStreak++;
        if (stuckStreak >= 5 && !stuckFlaggedThisStreak) {
          stuckActions.count++;
          if (stuckActions.samples.length < 10) {
            stuckActions.samples.push({ turn: totalActions, input: text, repeats: stuckStreak });
          }
          stuckFlaggedThisStreak = true;
        }
      } else {
        stuckStreak = 0;
        stuckFlaggedThisStreak = false;
      }
      lastStateSnap = snapAfter;

      prevLogLen = sAfter.gameLog.length;
    };

    // Action picker. Reads the scene and chooses based on context.
    const pickAction = (): string => {
      const s = store.getState();
      const p = s.player;
      const scene = s.currentScene;
      if (!p) return 'look';

      // Always escape the hub once so encounters can fire.
      if (p.hubRoomId && !leftHub) {
        leftHub = true;
        return 'leave outpost';
      }

      const hpMax = Math.max(1, p.hpMax);
      const enemy = scene && scene.enemies.length > 0
        ? scene.enemies[scene.activeEnemyIdx] ?? scene.enemies[0]
        : null;
      const enemyHp = enemy
        ? scene!.enemyHps[scene!.activeEnemyIdx] ?? scene!.enemyHps[0] ?? enemy.hp
        : 0;

      // ── In combat ────────────────────────────────────────────────
      if (enemy) {
        if (p.stamina < 3) return 'flee';
        if (enemy.boss || enemyHp > hpMax * 2) return 'flee';
        if (enemyHp <= hpMax * 1.3) {
          const r = Math.random();
          if (r < 0.6) return `attack ${enemy.name}`;
          if (r < 0.8) return 'dodge';
          if (r < 0.9) return `approach ${enemy.name}`;
          return 'flee';
        }
        // bigger enemy but not boss-class
        const r = Math.random();
        if (r < 0.35) return 'dodge';
        if (r < 0.55) return 'block';
        if (r < 0.85) return `attack ${enemy.name}`;
        return 'flee';
      }

      // ── Peaceful with vendor ─────────────────────────────────────
      if (scene?.vendor) {
        const v: any = scene.vendor;
        const offers: Array<{ itemName: string; price: number }> = v.offers ?? [];
        const offer = offers.length > 0
          ? offers[Math.floor(Math.random() * offers.length)]!
          : null;
        const r = Math.random();
        if (offer) {
          if (r < 0.35 && p.tc >= offer.price) {
            return `buy ${offer.itemName}`;
          }
          if (r < 0.6) {
            const sellable = p.inventory.find((i) => i.kind !== 'relic');
            if (sellable) return `sell ${sellable.name}`;
            // fallthrough to steal
          }
          if (r < 0.85) {
            return `steal ${offer.itemName}`;
          }
        }
        // dismiss / move on
        return 'leave';
      }

      // ── Peaceful with hooks — only sometimes engage. Otherwise
      //    the picker locks onto the same unresolved hooks every
      //    turn and never advances the clock. ─────────────────────
      if (scene?.hooks && scene.hooks.length > 0 && Math.random() < 0.2) {
        const hook = scene.hooks.find((h) => !h.resolved) ?? scene.hooks[0]!;
        const nouns = (hook as any).nouns as string[] | undefined;
        const noun = nouns && nouns.length > 0 ? nouns[0]! : null;
        if (noun) {
          return Math.random() < 0.6 ? `investigate ${noun}` : `approach ${noun}`;
        }
      }

      // Stamina / HP base care
      if (p.stamina < 4) {
        const ration = p.inventory.find((it) =>
          /ration|bread|food|jerky|fruit|meat|fish|stew|berry|mushroom/i.test(it.name),
        );
        if (ration) return `eat ${ration.name}`;
        return 'rest';
      }
      if (p.hp < hpMax * 0.4) {
        const ration = p.inventory.find((it) =>
          /ration|bread|food|jerky|fruit|meat|fish|stew|berry|mushroom/i.test(it.name),
        );
        if (ration) return `eat ${ration.name}`;
        return 'rest';
      }

      // ── Peaceful with ambient nouns — only sometimes engage,
      //    otherwise the sim camps in one scene exhausting the
      //    same prop list and never moves. ──────────────────────
      const displayed = scene?.displayedAmbientNouns ?? scene?.ambientNouns ?? [];
      if (displayed.length > 0 && Math.random() < 0.35) {
        const r = Math.random();
        // 30% climb-everything-climbable
        if (r < 0.3) {
          // If already elevated, sometimes climb down.
          if (scene?.elevatedOn && Math.random() < 0.3) {
            return 'climb down';
          }
          const climbables = displayed.filter((n) => isClimbable(n));
          if (climbables.length > 0) {
            return `climb ${climbables[Math.floor(Math.random() * climbables.length)]!}`;
          }
        }
        // 25% salvage a salvageable
        if (r < 0.55) {
          const salvageables = displayed.filter((n) => isSalvageable(n));
          if (salvageables.length > 0) {
            return `salvage ${salvageables[Math.floor(Math.random() * salvageables.length)]!}`;
          }
        }
        // 25% take a pickup
        if (r < 0.8) {
          const noun = displayed[Math.floor(Math.random() * displayed.length)]!;
          return `take ${noun}`;
        }
        // 20% investigate a random noun
        const noun = displayed[Math.floor(Math.random() * displayed.length)]!;
        return `investigate ${noun}`;
      }

      // ── Idle default ─────────────────────────────────────────────
      const r = Math.random();
      if (r < 0.7) {
        const dirs = ['north', 'south', 'east', 'west'];
        return `go ${dirs[Math.floor(Math.random() * dirs.length)]!}`;
      }
      return 'look around you';
    };

    // ── Main loop ─────────────────────────────────────────────────────
    const TARGET_HOURS = 24000; // 1000 days
    const MAX_ACTIONS = 50000;
    const MAX_EXCEPTIONS = 10;
    let hoursBaseline = 0; // accumulated across reincarnations
    let endReason = 'cap_actions';

    while (totalActions < MAX_ACTIONS) {
      if (totalActions % 50 === 0) {
        await new Promise<void>((r) => setImmediate(r));
      }
      // Trim gameLog every turn — the store keeps every entry in
      // memory (MAX_LOG_IN_MEMORY = Infinity) and `get().persist()`
      // fires after almost every action, JSON.stringify-ing the full
      // array into the AsyncStorage mock. Without aggressive trimming
      // a 50k-action sim OOMs V8 (>8 GB strings). submit() reads the
      // post-action log slice for stats before this trims, so drops
      // are safe.
      const curLog = store.getState().gameLog;
      if (curLog.length > 80) {
        store.setState({ gameLog: curLog.slice(-40) });
        prevLogLen = Math.min(prevLogLen, 40);
      }
      if (exceptions.count >= MAX_EXCEPTIONS) {
        endReason = 'exception_cap_hit';
        break;
      }

      const s = store.getState();
      const p = s.player;
      if (!p) {
        try {
          await store.getState().startNewGame({
            name: `Millennial-${combat.deaths + 1}`,
            raceId: race.id,
            factionId: fac.id,
          });
          store.getState().skipTutorial?.();
          leftHub = false;
          continue;
        } catch (e: any) {
          exceptions.count++;
          if (exceptions.samples.length < 5) {
            exceptions.samples.push({
              turn: totalActions,
              input: 'startNewGame(no-player)',
              message: e?.message ?? String(e),
              stack: (e?.stack ?? '').slice(0, 600),
            });
          }
          endReason = 'no_player';
          break;
        }
      }

      const totalHours = hoursBaseline + (p.hoursElapsed ?? 0);
      if (totalHours >= TARGET_HOURS) {
        endReason = 'reached_1000_days';
        break;
      }

      // Death handling — resurrect if possible, otherwise restart.
      if (p.dead) {
        combat.deaths++;
        const slotId = s.activeSlotId;
        if (s.resurrectionGems > 0 && slotId) {
          try {
            const ok = await store.getState().resurrectSlot(slotId);
            if (ok) {
              combat.resurrections++;
              await store.getState().loadSlotIntoGame(slotId);
              continue;
            }
          } catch (e: any) {
            exceptions.count++;
            if (exceptions.samples.length < 5) {
              exceptions.samples.push({
                turn: totalActions,
                input: 'resurrectSlot',
                message: e?.message ?? String(e),
                stack: (e?.stack ?? '').slice(0, 600),
              });
            }
          }
        }
        // Permadeath path — bank hours, restart.
        hoursBaseline += (p.hoursElapsed ?? 0);
        try {
          await store.getState().startNewGame({
            name: `Millennial-${combat.deaths + 1}`,
            raceId: race.id,
            factionId: fac.id,
          });
          store.getState().skipTutorial?.();
          leftHub = false;
          // Reset per-life trackers
          prevKills = 0;
          prevElevatedTier = 0;
          prevElevatedNoun = null;
          continue;
        } catch (e: any) {
          exceptions.count++;
          if (exceptions.samples.length < 5) {
            exceptions.samples.push({
              turn: totalActions,
              input: 'startNewGame(post-death)',
              message: e?.message ?? String(e),
              stack: (e?.stack ?? '').slice(0, 600),
            });
          }
          endReason = 'died_restart_failed';
          break;
        }
      }

      // ── Periodic moves ──────────────────────────────────────────
      periodicCounter++;
      // Force time progression every 5 turns — peaceful exploration
      // verbs (investigate/look) often advance zero hours, so without
      // an injected `rest` the clock never moves toward 1000 days.
      if (periodicCounter % 5 === 0 && !(s.currentScene?.enemies?.length)) {
        submit('rest');
        continue;
      }
      // Force a fresh-location attempt every 12 turns out of combat —
      // peaceful scenes don't auto-roll new encounters until the
      // player walks to a new tile.
      if (periodicCounter % 12 === 0 && !(s.currentScene?.enemies?.length)) {
        const dirs = ['north', 'south', 'east', 'west'];
        submit(`go ${dirs[Math.floor(Math.random() * dirs.length)]!}`);
        continue;
      }
      if (periodicCounter % 50 === 0) {
        // Try a quest accept against any vendor offering one.
        if (s.currentScene?.vendor && (s.currentScene.vendor as any).faction) {
          submit('accept');
          continue;
        }
        // Otherwise surface a recipe completion.
        if (periodicCounter % 100 === 0) {
          const tries = ['Club', 'Cudgel', 'Stone Spear', 'Patched Cloth', 'Torch'];
          submit(`craft ${tries[Math.floor(Math.random() * tries.length)]!}`);
          continue;
        }
      }

      const action = pickAction();
      submit(action);

      // If stuck-flagged this turn, force a different action.
      if (stuckFlaggedThisStreak) {
        const dirs = ['north', 'south', 'east', 'west'];
        const alt = `go ${dirs[Math.floor(Math.random() * dirs.length)]!}`;
        if (alt !== action) {
          submit(alt);
        } else {
          submit('look around you');
        }
        stuckStreak = 0;
        stuckFlaggedThisStreak = false;
      }
    }

    // ── Final report ─────────────────────────────────────────────────
    const sFinal = store.getState();
    const pFinal = sFinal.player;
    const finalLifeHours = pFinal?.hoursElapsed ?? 0;
    const finalHours = hoursBaseline + finalLifeHours;
    const daysElapsed = finalHours / 24;

    console.log = _origLog;

    const exceptionsBlock = exceptions.samples.length
      ? exceptions.samples.map((e, i) =>
          `  ${i + 1}. turn=${e.turn} input="${e.input.slice(0, 60)}"\n     msg: ${e.message}\n     stack:\n${e.stack.split('\n').slice(0, 8).map((l) => '       ' + l).join('\n')}`,
        ).join('\n')
      : '  (none)';

    const stuckBlock = stuckActions.samples.length
      ? stuckActions.samples.map((s, i) =>
          `  ${i + 1}. turn=${s.turn} input="${s.input.slice(0, 60)}" repeats=${s.repeats}`,
        ).join('\n')
      : '  (none)';

    const hpJumpsBlock = hpJumpsDetected.length
      ? hpJumpsDetected.slice(0, 10).map((h, i) =>
          `  ${i + 1}. turn=${h.turn} ${h.from} → ${h.to} (allowed ≤ ${h.allowed}, hoursΔ=${h.hoursDelta})`,
        ).join('\n')
      : '  (none)';

    const bugSignals: string[] = [];
    if (exceptions.count > 5) bugSignals.push(`HIGH EXCEPTION COUNT: ${exceptions.count}`);
    if (daysElapsed < 900) bugSignals.push(`SIM STALLED: only ${daysElapsed.toFixed(1)} days reached (target 1000)`);
    if (combat.kills < 50) bugSignals.push(`LOW KILL COUNT: ${combat.kills} (expected > 50)`);
    if (climbs.topsReached === 0) bugSignals.push('ZERO CLIMB TOPS REACHED');
    if (Object.keys(climbs.topLootDropped).length === 0) bugSignals.push('ZERO TOP-LOOT DROPS DETECTED');
    if (trades.stealSuccess === 0) bugSignals.push('ZERO STEAL SUCCESSES');
    if (trades.stealCaught === 0) bugSignals.push('ZERO STEAL CAUGHT EVENTS');
    if (worldCoverage.distinctLocationsVisited.size <= 3) bugSignals.push(`POOR LOCATION COVERAGE: ${worldCoverage.distinctLocationsVisited.size}`);
    if (stuckActions.count >= 100) bugSignals.push(`HIGH STUCK ACTIONS: ${stuckActions.count}`);
    if (hpJumpsDetected.length > 0) bugSignals.push(`HP JUMPS DETECTED: ${hpJumpsDetected.length} (potential healing regression)`);

    const report = `
================ THOUSAND-DAY STRESS SIM REPORT ================
End reason:              ${endReason}
Days elapsed:            ${daysElapsed.toFixed(2)} / 1000
Total actions:           ${totalActions} / ${MAX_ACTIONS}
Pending rolls resolved:  ${pendingResolves}
Status:                  ${pFinal?.dead ? 'DEAD' : 'ALIVE'}
HP / Stamina:            ${pFinal?.hp ?? '?'}/${pFinal?.hpMax ?? '?'}  ·  ${pFinal?.stamina ?? '?'}/${pFinal?.staminaMax ?? '?'}
TC:                      ${pFinal?.tc ?? '?'}

─── SUMMARY ──────────────────────────────────────
Distinct locations:      ${worldCoverage.distinctLocationsVisited.size}
Distinct micro-micros:   ${worldCoverage.distinctMicroMicros.size}
Distinct enemy types:    ${worldCoverage.distinctEnemyTypesFought.size}
Distinct vendors met:    ${worldCoverage.distinctVendorsMet.size}
Top verbs:               ${topN(actionsByVerb, 10).map(([k, v]) => `${k}×${v}`).join(', ')}

─── COMBAT ───────────────────────────────────────
Kills:                   ${combat.kills}
Deaths / resurrects:     ${combat.deaths} / ${combat.resurrections}
Damage dealt (total):    ${combat.totalDamageDealt}
Damage taken (total):    ${combat.totalDamageTaken}
Flees attempted/succ:    ${combat.fleesAttempted} / ${combat.fleesSucceeded}

─── CLIMBS ───────────────────────────────────────
Attempted:               ${climbs.attempted}
Tiers cleared:           ${climbs.tiersCleared}
Tops reached:            ${climbs.topsReached}
Top loot dropped:        ${Object.keys(climbs.topLootDropped).length === 0 ? '(none)' : topN(climbs.topLootDropped, 8).map(([k, v]) => `${k}×${v}`).join(', ')}

─── TRADES ───────────────────────────────────────
Buy / Sell counts:       ${trades.buyCount} / ${trades.sellCount}
Steal attempted:         ${trades.stealAttempted}
Steal success / caught:  ${trades.stealSuccess} / ${trades.stealCaught}
Vendor types met:        ${[...trades.vendorTypesEncountered].join(', ') || '(none)'}

─── QUESTS ───────────────────────────────────────
Accepted:                ${Object.entries(quests.accepted).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}
Completed:               ${Object.entries(quests.completed).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}
Abandoned:               ${Object.entries(quests.abandoned).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}

─── INVENTORY ────────────────────────────────────
Unique items seen:       ${inventory.uniqueItemsFound.size}
TC earned (cumulative):  ${inventory.tcEarned}
TC spent (cumulative):   ${inventory.tcSpent}
Final inventory size:    ${pFinal?.inventory.length ?? 0}

─── EXCEPTIONS (${exceptions.count}) ─────────────
${exceptionsBlock}

─── STUCK ACTIONS (${stuckActions.count}) ────────
${stuckBlock}

─── HP JUMPS (${hpJumpsDetected.length}) ─────────
${hpJumpsBlock}

─── BUG SIGNALS ──────────────────────────────────
${bugSignals.length === 0 ? '  (none — soft expectations met)' : bugSignals.map((s) => '  ! ' + s).join('\n')}
==============================================================
`.trim();

    console.log(report);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      fs.writeFileSync('/tmp/tartaria-thousand-day-sim.txt', report);
    } catch { /* ignore */ }

    expect(exceptions.count).toBeLessThan(10);
  });
});
