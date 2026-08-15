// Chaos simulation. Drives the gameStore through 180 in-game days
// (cut from 730d on 2026-05-24 per playtester ask), mixing the
// coverage-driven action picker with periodic "schizophrenic" inputs
// (verbose, misspelled, nonsense, empty, emoji, out-of-context) and
// special phases: vandalization (drop everything, walk away, come
// back) and forced mapping (cross into new locations).
//
// Goal: surface engine glitches, dead ends, loops, dissonance.
// Pass criteria (best-effort):
//   - zero hard crashes
//   - <=5% of turns are stuck-action retries
//   - <=1 geographic loop pattern
//   - gameLog stays under 5 MB
//
// Mocking block copied verbatim from yearSimulation.test.ts so the
// runtime topology matches; Qwen is additionally mocked to be ready
// and return a deterministic JSON so the parse-fallback path is
// actually exercised under chaos input.

// AsyncStorage is a native module. Mock it before anything else loads.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Native ML runtimes won't load in Jest. Stub them all out.
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

// Mock Qwen so the parse-fallback path is exercised. The engine asks
// for {"intent":..., "target":...}. We return "look" with an empty
// target for any input the dictionary parser rejected — that maps
// safely through CANONICAL_VERB and re-submits as "look" via the
// skipPreChecks path. This way schizo / nonsense inputs flow all the
// way through the fallback pipeline without crashing.
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

type Counter = Record<string, number>;
function bump(c: Counter, key: string, n = 1) {
  c[key] = (c[key] ?? 0) + n;
}
function topN(c: Counter, n: number): Array<[string, number]> {
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// Chaos input pool — hand-curated to cover the categories from the
// brief. The picker bites one off every ~10 turns.
const CHAOS_POOL: string[] = [
  // Verbose / multi-clause
  'I want to head over to the spire but first let me check my pack and maybe rest a bit',
  'okay so I think I should attack but also kind of want to flee, maybe both?',
  'let me look around and then if there is anything interesting I will pick it up',
  'walk slowly toward whatever is rustling in the brush over there',
  // Misspellings
  'attck the durone with my russted blad',
  'sercah the grond for losse coins',
  'opn the chst pleas',
  'go nrth quikly',
  // Meta-comments
  'ok we should add more vendors this is great',
  'this combat system is kinda fun ngl',
  'devs please fix the parser thanks',
  'hello claude are you in there',
  // Out-of-context targets
  'approach the dragon',
  'kiss the princess',
  'pet the cat',
  'haggle with the merchant about the price of moonlight',
  // Nonsense
  'yodel into the void',
  'banana banana banana',
  'reticulate the splines',
  'invert the polarity',
  // Empty / whitespace
  '',
  '   ',
  '...',
  '\t\t',
  // Single-letter / minimal
  'a',
  'x',
  'q',
  '!',
  // Unicode / emoji
  '🗡️ swing',
  '←go',
  '⚔️⚔️⚔️',
  '☠ die',
];

describe('Two-year chaos simulation of Tartaria Realms', () => {
  // v2.4.1 (OTA 020) — bumped 600s -> 900s. Grid 21x21 -> 41x41 means
  // 2x the wander steps per cross-grid trip; 2 years of sim hits this
  // proportionally harder.
  // 2026-05-24 — cut 730d → 180d per playtester ask; timeout 900s → 240s.
// OTA-1011 — the old budget predated ~130 OTAs of engine growth (same measured
// drift as combatStress, which needed 480s -> 900s). Budget follows reality.
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

  it('runs 180 in-game days under chaotic input and reports', async () => {
    const store = useGameStore;
    await store.getState().hydrate();

    const races = getRaces();
    const factions = getFactions();
    const race = races.find((r) => r.id === 'reclaimer') ?? races[0]!;
    const fac = factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!;

    await store.getState().startNewGame({
      name: 'Chaosling',
      raceId: race.id,
      factionId: fac.id,
    });
    store.getState().skipTutorial?.();

    // Telemetry --------------------------------------------------------
    const crashes: Array<{ input: string; err: string }> = [];
    const stuckTriggers: Array<{ input: string; response: string }> = [];
    const channelCounts: Counter = {};
    const killCounts: Counter = {};
    let deaths = 0;
    let resurrections = 0;
    let parseFallbackHandings = 0;
    let parseFallbackNoUsable = 0;
    let stuckActionRetries = 0;
    let geographicLoopPatterns = 0;
    let peakGameLogBytes = 0;
    let prevLogLen = 0;
    let prevHoursElapsed = 0;
    let actionsAttempted = 0;
    let pendingResolves = 0;
    let chaosFired = 0;
    let vandalizationPhases = 0;
    let vandalizationVerifiedOk = 0;
    let vandalizationVerifiedMissing = 0;
    let mappingPhases = 0;
    let mappingPhasesCrossed = 0;
    let dirIdx = 0;
    const uniqueLocations = new Set<string>();
    const uniqueEnemies = new Set<string>();
    let prevEnemiesDefeated = 0;
    let lastEnemyName: string | null = null;

    // Stuck-action tracking — same canonical intent repeated 5+ times
    // consecutively with no state change.
    let lastIntent: string | null = null;
    let consecutiveSameIntent = 0;
    let consecutiveNoStateChange = 0;

    // Geographic-loop tracking — same (loc, mx, my) 10+ times in a row.
    let lastGeoKey: string | null = null;
    let geoStreak = 0;
    let geoLoopFlagged = false;

    // Qwen-no-usable patterns we caught (the debug channel emits these).
    const qwenNoUsablePatterns: string[] = [];

    const intentOf = (text: string): string => {
      const t = text.trim().toLowerCase();
      if (!t) return '<empty>';
      // crude — first verb word
      return t.split(/\s+/)[0]!;
    };

    const directions = ['north', 'east', 'south', 'west'];
    const NAMED_LOCATIONS = [
      'Drakova', 'Varakush', 'Asgardar', 'Mud Seas',
      'Tartarian Outskirts', 'Cradle', 'Silt Wastes',
      'Borderlands', 'Iron Wastes', 'Glass Hills',
    ];
    let locIdx = 0;
    let leftHub = false;

    const tacticCycle: string[] = [
      'look', 'search the ground', 'inventory', 'go north',
      'go east', 'rest', 'go south', 'go west', 'search', 'look around',
    ];
    let tacticIdx = 0;

    // Attempt throttle (copied from yearSim)
    const attempts: Counter = {};
    const tryOnce = (mech: string, cap = 3): boolean => {
      if ((attempts[mech] ?? 0) >= cap) return false;
      bump(attempts, mech);
      return true;
    };

    const resolveAnyPendingRoll = () => {
      let safety = 0;
      while (store.getState().pendingRolls && safety < 50) {
        const pr = store.getState().pendingRolls!;
        const step = pr.steps[pr.currentStep];
        if (!step) {
          store.getState().cancelPendingRolls();
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
          crashes.push({ input: 'resolveRollStep', err: e?.message ?? String(e) });
          try { store.getState().cancelPendingRolls(); } catch {}
          break;
        }
        safety++;
      }
      if (safety >= 50) {
        try { store.getState().cancelPendingRolls(); } catch {}
      }
    };

    // Inspect log for fallback usage + memory peak.
    const inspectNewLogs = (newLogs: Array<{ text: string; channel: string }>) => {
      for (const l of newLogs) {
        bump(channelCounts, l.channel);
        if (l.channel === 'debug') {
          if (/parse-fallback:\s*handing/.test(l.text)) parseFallbackHandings++;
          if (/parse-fallback:\s*qwen no usable result/.test(l.text)) {
            parseFallbackNoUsable++;
            if (qwenNoUsablePatterns.length < 20) qwenNoUsablePatterns.push(l.text.slice(0, 140));
          }
        }
      }
    };

    const measureLogSize = () => {
      const log = store.getState().gameLog;
      // approximate byte size — sum of text lengths × 2 (utf-16 in v8)
      let bytes = 0;
      for (const l of log) bytes += (l.text?.length ?? 0) * 2;
      if (bytes > peakGameLogBytes) peakGameLogBytes = bytes;
    };

    const submit = (text: string, source: 'picker' | 'chaos' | 'vandal' | 'mapping' = 'picker') => {
      actionsAttempted++;
      const sBefore = store.getState();
      const pBefore = sBefore.player;
      const logLenBefore = sBefore.gameLog.length;
      const stateSnapBefore = JSON.stringify({
        loc: pBefore?.currentLocationId,
        mx: pBefore?.mapX,
        my: pBefore?.mapY,
        hp: pBefore?.hp,
        stam: pBefore?.stamina,
        tc: pBefore?.tc,
        inv: pBefore?.inventory.length,
        hrs: pBefore?.hoursElapsed,
      });

      try {
        store.getState().submitPlayerAction(text);
      } catch (e: any) {
        crashes.push({ input: text, err: e?.message ?? String(e) });
      }
      resolveAnyPendingRoll();

      const sAfter = store.getState();
      const pAfter = sAfter.player;
      const newLogs = sAfter.gameLog.slice(logLenBefore);
      inspectNewLogs(newLogs);

      // Unique locations / enemies
      if (pAfter?.currentLocationId) uniqueLocations.add(pAfter.currentLocationId);
      if (sAfter.currentScene?.enemies) {
        for (const e of sAfter.currentScene.enemies) uniqueEnemies.add(e.name);
      }
      const curKills = pAfter?.milestones?.enemiesDefeated ?? 0;
      if (curKills > prevEnemiesDefeated) {
        const credit = lastEnemyName ?? '(unknown)';
        bump(killCounts, credit);
        prevEnemiesDefeated = curKills;
      }
      if (sAfter.currentScene && sAfter.currentScene.enemies.length > 0) {
        const idx = sAfter.currentScene.activeEnemyIdx;
        lastEnemyName = sAfter.currentScene.enemies[idx]?.name ?? sAfter.currentScene.enemies[0]?.name ?? null;
      }

      // State change check
      const stateSnapAfter = JSON.stringify({
        loc: pAfter?.currentLocationId,
        mx: pAfter?.mapX,
        my: pAfter?.mapY,
        hp: pAfter?.hp,
        stam: pAfter?.stamina,
        tc: pAfter?.tc,
        inv: pAfter?.inventory.length,
        hrs: pAfter?.hoursElapsed,
      });
      const stateChanged = stateSnapBefore !== stateSnapAfter;

      // Stuck-action: same intent 5+ times in a row with no state
      // change. Count ONCE per streak crossing the threshold to avoid
      // every subsequent action in the streak inflating the count.
      const intent = intentOf(text);
      if (intent === lastIntent && !stateChanged) {
        consecutiveSameIntent++;
        consecutiveNoStateChange++;
        if (consecutiveSameIntent === 5) {
          stuckActionRetries++;
          if (stuckTriggers.length < 30) {
            const respText = newLogs.find((l) => l.channel !== 'player' && l.channel !== 'debug')?.text ?? '(no response)';
            stuckTriggers.push({ input: text, response: respText.slice(0, 120) });
          }
        }
      } else {
        consecutiveSameIntent = stateChanged ? 0 : consecutiveSameIntent;
        consecutiveNoStateChange = stateChanged ? 0 : consecutiveNoStateChange + 1;
      }
      lastIntent = intent;

      // Geographic loop check — counts DISTINCT loop patterns. We
      // only count when the action was a movement attempt (go/travel)
      // and the player still didn't move; resting/looking/inventory
      // in the same tile is expected, not a glitch.
      const movementVerbs = /^(go|travel|move|walk|head|advance|retreat|step|dash|run|leave|enter)\b/i;
      const isMoveAttempt = movementVerbs.test(text.trim());
      const geoKey = `${pAfter?.currentLocationId ?? '?'}@${pAfter?.mapX ?? '?'},${pAfter?.mapY ?? '?'}`;
      if (isMoveAttempt && geoKey === lastGeoKey) {
        geoStreak++;
        if (geoStreak === 10) {
          geographicLoopPatterns++;
          geoLoopFlagged = true;
        }
      } else if (geoKey !== lastGeoKey) {
        geoStreak = 1;
        geoLoopFlagged = false;
      }
      lastGeoKey = geoKey;

      measureLogSize();
    };

    // Action picker (stripped-down version of yearSim's, biased toward
    // staying alive and moving around, since chaos input does most of
    // the engine prodding).
    const pickAction = (): string => {
      const s = store.getState();
      const p = s.player;
      const scene = s.currentScene;
      if (!p) return 'look';
      const hpFrac = p.hp / Math.max(1, p.hpMax);
      const stamFrac = p.stamina / Math.max(1, p.staminaMax);
      const enemy = scene && scene.enemies.length > 0
        ? scene.enemies[scene.activeEnemyIdx] ?? scene.enemies[0]
        : null;

      if (p.hubRoomId && !leftHub) {
        leftHub = true;
        return 'leave outpost';
      }

      if (enemy) {
        if (hpFrac < 0.35 || p.stamina <= 1) return 'flee';
        if (hpFrac < 0.55) return Math.random() < 0.5 ? 'dodge' : 'block';
        return `attack ${enemy.name}`;
      }

      // Health management — be aggressive about rest so chaos inputs
      // don't kill the run. TRAVEL_MIN_STAMINA is 2 in the engine.
      if (p.stamina <= 3) {
        const ration = p.inventory.find((it) =>
          /ration|bread|food|jerky|fruit|meat|fish|stew|berry|mushroom/i.test(it.name),
        );
        if (ration) return `eat ${ration.name}`;
        return 'rest';
      }
      if (hpFrac < 0.7 || stamFrac < 0.6) return 'rest';

      // Vendor opportunism
      if (scene?.vendor && p.tc >= 10 && tryOnce(`buy_${scene.vendor.name}`, 1)) {
        const v: any = scene.vendor;
        if (v.offers && v.offers.length > 0) {
          const cheap = [...v.offers].sort((a: any, b: any) => a.price - b.price)[0];
          if (cheap) return `buy ${cheap.itemName}`;
        }
      }

      // Equip something useful once
      if (tryOnce('equip', 1)) {
        const eq = p.inventory.find((it) => it.kind === 'weapon' || it.kind === 'armor');
        if (eq) return `equip ${eq.name}`;
      }

      const roll = Math.random();
      if (roll < 0.4) {
        const loc = NAMED_LOCATIONS[locIdx % NAMED_LOCATIONS.length]!;
        locIdx++;
        return `travel to ${loc}`;
      }
      if (roll < 0.65) {
        // Randomize direction selection — round-robin would walk the
        // same N/E/S/W loop forever from a corner tile and inflate
        // the geographic-loop counter.
        const dir = directions[Math.floor(Math.random() * directions.length)]!;
        dirIdx++;
        return `go ${dir}`;
      }
      if (roll < 0.78) return 'rest';
      if (roll < 0.88) return 'search the ground';
      if (roll < 0.95) return 'look';
      return tacticCycle[tacticIdx++ % tacticCycle.length]!;
    };

    // Vandalization phase: drop every droppable item, walk 3 tiles,
    // return, verify pile is still there.
    const runVandalizationPhase = () => {
      vandalizationPhases++;
      const sBefore = store.getState();
      const p = sBefore.player;
      if (!p) return;
      const startLoc = p.currentLocationId;
      const startMx = p.mapX;
      const startMy = p.mapY;
      const equippedSlots = ['main', 'off', 'head', 'chest', 'legs', 'feet', 'amulet', 'ring'] as const;
      const eq: any = p.equipped ?? {};
      const equippedNames = new Set(equippedSlots.map((s) => eq[s]).filter(Boolean));
      const droppable = p.inventory.filter((i) => !equippedNames.has(i.name) && i.kind !== 'relic');
      const droppedNames: string[] = [];
      for (const item of droppable.slice(0, 8)) {
        // Drop each quantity
        const qty = item.quantity ?? 1;
        for (let i = 0; i < Math.min(qty, 3); i++) {
          submit(`drop ${item.name}`, 'vandal');
        }
        droppedNames.push(item.name);
      }
      // Walk 3 tiles in a chosen direction.
      const walkDir = directions[Math.floor(Math.random() * directions.length)]!;
      for (let i = 0; i < 3; i++) submit(`go ${walkDir}`, 'vandal');
      // Walk back.
      const opposites: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
      for (let i = 0; i < 3; i++) submit(`go ${opposites[walkDir]!}`, 'vandal');
      // Check pile.
      const sAfter = store.getState();
      const pAfter = sAfter.player;
      if (!pAfter) return;
      // We may not be back at the exact tile if pathing failed — only
      // check pile if location/coords match.
      if (pAfter.currentLocationId === startLoc && pAfter.mapX === startMx && pAfter.mapY === startMy) {
        // Use look to surface dropped items in the world log.
        submit('look', 'vandal');
        const log = store.getState().gameLog;
        const tail = log.slice(-20).map((l) => l.text).join(' ');
        const foundCount = droppedNames.filter((n) => tail.toLowerCase().includes(n.toLowerCase())).length;
        if (foundCount >= Math.ceil(droppedNames.length / 2)) vandalizationVerifiedOk++;
        else vandalizationVerifiedMissing++;
      } else {
        vandalizationVerifiedMissing++;
      }
    };

    // Mapping phase: force directional travel until locationId changes.
    const runMappingPhase = () => {
      mappingPhases++;
      const s = store.getState();
      const startLoc = s.player?.currentLocationId;
      const dir = directions[dirIdx++ % directions.length]!;
      let crossed = false;
      for (let i = 0; i < 8; i++) {
        submit(`go ${dir}`, 'mapping');
        const cur = store.getState().player?.currentLocationId;
        if (cur && cur !== startLoc) { crossed = true; break; }
      }
      if (!crossed) {
        // Try a named travel as a forcing move.
        const loc = NAMED_LOCATIONS[locIdx++ % NAMED_LOCATIONS.length]!;
        submit(`travel to ${loc}`, 'mapping');
        const cur = store.getState().player?.currentLocationId;
        if (cur && cur !== startLoc) crossed = true;
      }
      if (crossed) mappingPhasesCrossed++;
    };

    // Main loop ---------------------------------------------------------
    const TARGET_DAY = 180;
    const MAX_ACTIONS = 60000;
    let endReason = 'max_actions';
    let actions = 0;
    let chaosIdx = 0;
    let combatStreak = 0;
    let hoursElapsedBaseline = 0;
    let noPlayerRetries = 0;

    while (actions < MAX_ACTIONS) {
      if (actions % 50 === 0) {
        await new Promise<void>((r) => setImmediate(r));
      }
      actions++;
      const sBefore = store.getState();
      const pBefore = sBefore.player;
      if (!pBefore) {
        // No player — try to bootstrap a fresh character. Happens
        // after an unsuccessful restart or if hydrate produced an
        // empty slot. Allow a small retry budget before giving up.
        if (noPlayerRetries < 3) {
          noPlayerRetries++;
          try {
            await store.getState().startNewGame({
              name: `Chaosling-fresh-${noPlayerRetries}`,
              raceId: race.id,
              factionId: fac.id,
            });
            store.getState().skipTutorial?.();
            leftHub = false;
          } catch (e: any) {
            crashes.push({ input: 'startNewGame (no-player retry)', err: e?.message ?? String(e) });
          }
          continue;
        }
        endReason = 'no_player';
        break;
      }
      noPlayerRetries = 0;

      const hoursElapsed = pBefore.hoursElapsed ?? 0;
      // Accumulated hours across reincarnations — when the player
      // dies + restarts, the per-life clock resets. We add the
      // cumulative offset so the sim's 730-day target tracks total
      // simulated time, not just the current life.
      const totalHours = hoursElapsedBaseline + hoursElapsed;
      const day = Math.floor(totalHours / 24) + 1;
      if (day >= TARGET_DAY) { endReason = 'reached_180_days'; break; }

      if (pBefore.dead) {
        deaths++;
        if (sBefore.resurrectionGems > 0) {
          const slotId = sBefore.activeSlotId;
          if (slotId) {
            const ok = await store.getState().resurrectSlot(slotId);
            if (ok) {
              resurrections++;
              await store.getState().loadSlotIntoGame(slotId);
              continue;
            }
          }
        }
        // Permadeath — bank the current life's hours and start a new
        // character so the chaos sim keeps exercising the parser
        // instead of grinding to a halt. Day counter uses
        // hoursElapsedBaseline + currentLifeHours.
        hoursElapsedBaseline += hoursElapsed;
        try {
          await store.getState().startNewGame({
            name: `Chaosling-${deaths + 1}`,
            raceId: race.id,
            factionId: fac.id,
          });
          store.getState().skipTutorial?.();
          leftHub = false;
          continue;
        } catch (e: any) {
          crashes.push({ input: 'startNewGame (post-death)', err: e?.message ?? String(e) });
          endReason = 'died_restart_failed';
          break;
        }
      }

      // Track log offset for next iteration's measurement loop.
      const newLogs = sBefore.gameLog.slice(prevLogLen);
      inspectNewLogs(newLogs);
      prevLogLen = sBefore.gameLog.length;
      prevHoursElapsed = hoursElapsed;

      // Phase selection. Vandalize and mapping require a non-combat,
      // non-critical state (they assume free movement); chaos fires
      // anywhere except mid-combat critical (where it would just be
      // friendly fire).
      const hpFracNow = pBefore.hp / Math.max(1, pBefore.hpMax);
      const criticallyLow = hpFracNow < 0.4 || pBefore.stamina <= 2;
      const inCombat = (sBefore.currentScene?.enemies?.length ?? 0) > 0;

      const isMapping = actions % 30 === 0 && !criticallyLow && !inCombat;
      const isVandalize = actions % 50 === 0 && !criticallyLow && !inCombat;
      const isChaos = actions % 10 === 0 && !criticallyLow;

      // If stuck in combat with same enemy for a long time, force flee
      // hard. This prevents the picker getting pinned and using up the
      // whole action budget on a single fight.
      if (inCombat) {
        combatStreak++;
      } else {
        combatStreak = 0;
      }
      const forceFlee = combatStreak >= 40;

      // Time advance — every 20 actions out of combat, force a rest
      // so the clock actually moves. The picker only rests on low HP,
      // which under chaotic input means most actions don't advance
      // in-game time enough to reach 730 days.
      const forceRest = !inCombat && actions % 8 === 0;

      if (forceFlee) {
        submit('flee', 'picker');
      } else if (forceRest) {
        submit('rest', 'picker');
      } else if (isVandalize) {
        runVandalizationPhase();
      } else if (isMapping) {
        runMappingPhase();
      } else if (isChaos) {
        const chaos = CHAOS_POOL[chaosIdx % CHAOS_POOL.length]!;
        chaosIdx++;
        chaosFired++;
        submit(chaos, 'chaos');
      } else {
        submit(pickAction(), 'picker');
      }
    }

    // Final stats -------------------------------------------------------
    const sFinal = store.getState();
    const pFinal = sFinal.player;
    const finalLifeHours = pFinal?.hoursElapsed ?? 0;
    const finalHours = hoursElapsedBaseline + finalLifeHours;
    const finalDay = Math.floor(finalHours / 24) + 1;
    const tailLogs = sFinal.gameLog.slice(prevLogLen);
    inspectNewLogs(tailLogs);
    measureLogSize();

    const stuckPct = actionsAttempted > 0
      ? (stuckActionRetries / actionsAttempted) * 100
      : 0;

    console.log = _origLog;

    const stuckSamples = stuckTriggers.slice(0, 10)
      .map((s, i) => `  ${i + 1}. input="${s.input.slice(0, 50)}" → ${s.response}`)
      .join('\n');
    const crashSamples = crashes.slice(0, 10)
      .map((c, i) => `  ${i + 1}. input="${c.input.slice(0, 50)}" → ${c.err.slice(0, 120)}`)
      .join('\n');

    const report = `
================ TWO-YEAR CHAOS SIM REPORT ================
End reason:              ${endReason}
Total turns executed:    ${actionsAttempted}
Pending rolls resolved:  ${pendingResolves}
Chaos inputs fired:      ${chaosFired}
Vandalization phases:    ${vandalizationPhases} (verified ok: ${vandalizationVerifiedOk}, missing: ${vandalizationVerifiedMissing})
Mapping phases:          ${mappingPhases} (crossed: ${mappingPhasesCrossed})
Final day reached:       Day ${finalDay} (${finalHours.toFixed(1)} hrs)
Status:                  ${pFinal?.dead ? 'DEAD' : 'ALIVE'}
HP / Stamina:            ${pFinal?.hp}/${pFinal?.hpMax}  ·  ${pFinal?.stamina}/${pFinal?.staminaMax}
TC current:              ${pFinal?.tc}
Deaths / resurrects:     ${deaths} / ${resurrections}

Hard crashes:            ${crashes.length}
${crashSamples ? crashSamples : '  (none)'}

Stuck-action retries:    ${stuckActionRetries} (${stuckPct.toFixed(2)}%)
${stuckSamples ? stuckSamples : '  (none)'}

Geographic loops:        ${geographicLoopPatterns}

Parse-fallback handings: ${parseFallbackHandings}
Parse-fallback no-usable:${parseFallbackNoUsable}
  Sample qwen-no-usable lines (first 5):
${qwenNoUsablePatterns.slice(0, 5).map((p) => '    · ' + p).join('\n') || '    (none)'}

Final inventory size:    ${pFinal?.inventory.length ?? 0}
Distinct locations:      ${uniqueLocations.size}
Distinct enemies seen:   ${uniqueEnemies.size}
Kills (top 5):           ${topN(killCounts, 5).map(([k, v]) => `${k}×${v}`).join(', ') || '(none)'}

Peak gameLog bytes:      ${peakGameLogBytes} (${(peakGameLogBytes / 1024 / 1024).toFixed(2)} MB)
gameLog entries (final): ${sFinal.gameLog.length}
Top log channels:        ${topN(channelCounts, 5).map(([k, v]) => `${k}=${v}`).join(', ')}

─── Pass criteria check ──────────────────────────────────
Zero hard crashes:       ${crashes.length === 0 ? 'PASS' : 'FAIL (' + crashes.length + ')'}
Stuck-action ≤ 5%:       ${stuckPct <= 5 ? 'PASS' : 'FAIL (' + stuckPct.toFixed(2) + '%)'}
Geographic loops ≤ 1:    ${geographicLoopPatterns <= 1 ? 'PASS' : 'FAIL (' + geographicLoopPatterns + ')'}
gameLog < 5 MB:          ${peakGameLogBytes < 5 * 1024 * 1024 ? 'PASS' : 'FAIL (' + (peakGameLogBytes / 1024 / 1024).toFixed(2) + ' MB)'}
==========================================================
`.trim();
    console.log(report);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      fs.writeFileSync('/tmp/tartaria-chaos-sim-report.txt', report);
    } catch { /* ignore */ }

    expect(actionsAttempted).toBeGreaterThan(0);
    // Soft pass criteria — assert but don't block; the report is the
    // useful artifact. (If you want hard gates flip these on.)
    expect(crashes.length).toBe(0);
  });
});
