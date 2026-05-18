// Year-long playthrough simulation. Drives the gameStore through ~365
// in-game days, picking rational actions every loop, and reports the
// final stats block. Defensive: every call to submitPlayerAction is
// wrapped in try/catch, every pendingRoll is resolved, and stuck-action
// detection switches verbs after two no-progress turns.

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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// Silence the noisy logger so test output stays readable.
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

describe('Year-long Tartaria Realms playthrough simulation', () => {
  jest.setTimeout(120000);

  beforeAll(() => {
    // Mute log spam during the run; we'll restore for the summary.
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  afterAll(() => {
    console.log = _origLog;
    console.warn = _origWarn;
    console.error = _origErr;
  });

  it('simulates 365 in-game days and reports stats', async () => {
    const store = useGameStore;
    await store.getState().hydrate();

    const races = getRaces();
    const factions = getFactions();
    const race = races.find((r) => r.id === 'reclaimer') ?? races[0]!;
    const fac = factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!;

    await store.getState().startNewGame({
      name: 'Yearling',
      raceId: race.id,
      factionId: fac.id,
    });
    // Auto-skip the tutorial; it intercepts inputs.
    store.getState().skipTutorial?.();

    // Telemetry --------------------------------------------------------
    const crashes: string[] = [];
    const slotLoadErrors: string[] = [];
    const channelCounts: Counter = {};
    const killCounts: Counter = {};
    const craftedItems: Counter = {};
    const questsAccepted = new Set<string>();
    const questsCompleted = new Set<string>();
    let lastEnemyName: string | null = null;
    let prevEnemyHp: number | null = null;
    let deaths = 0;
    let resurrections = 0;
    let tcEarned = 0;
    let tcSpent = 0;
    let prevTc = store.getState().player?.tc ?? 0;
    let prevHoursElapsed = 0;
    let prevLogLen = 0;
    let prevLocationId: string | null = null;
    let stuckCount = 0;
    let actionsAttempted = 0;
    let pendingResolves = 0;
    const tacticCycle: string[] = [
      'look',
      'search the ground',
      'inventory',
      'go north',
      'go east',
      'rest',
      'go south',
      'go west',
      'search',
      'look around',
    ];
    let tacticIdx = 0;

    const directions = ['north', 'east', 'south', 'west'];
    let dirIdx = 0;

    const resolveAnyPendingRoll = () => {
      // Resolve the entire pending-rolls chain by sending random valid
      // dice values for each step.
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
          crashes.push(`resolveRollStep: ${e?.message ?? e}`);
          try { store.getState().cancelPendingRolls(); } catch {}
          break;
        }
        safety++;
      }
      if (safety >= 50) {
        try { store.getState().cancelPendingRolls(); } catch {}
      }
    };

    const submit = (text: string) => {
      actionsAttempted++;
      try {
        store.getState().submitPlayerAction(text);
      } catch (e: any) {
        crashes.push(`submitPlayerAction("${text}"): ${e?.message ?? e}`);
      }
      // Drain any pending dice immediately.
      resolveAnyPendingRoll();
    };

    const pickAction = (): string => {
      const s = store.getState();
      const p = s.player;
      const scene = s.currentScene;
      if (!p) return 'look';
      const hpFrac = p.hp / Math.max(1, p.hpMax);
      const enemy = scene && scene.enemies.length > 0 ? scene.enemies[scene.activeEnemyIdx] ?? scene.enemies[0] : null;

      // In combat
      if (enemy) {
        if (hpFrac < 0.25) return 'flee';
        if (hpFrac < 0.5 && Math.random() < 0.3) return 'dodge';
        return `attack ${enemy.name}`;
      }

      // Stamina critical -> eat rations if any
      if (p.stamina <= 1) {
        const ration = p.inventory.find((it) =>
          /ration|bread|food|jerky|fruit|meat|fish|stew|berry|mushroom/i.test(it.name),
        );
        if (ration) return `eat ${ration.name}`;
        return 'rest';
      }
      if (hpFrac < 0.6) return 'rest';

      // Vendor present -> try buying
      if (scene?.vendor) {
        if (Math.random() < 0.25) {
          // Try gifting first item we have to vendor for rep
          if (p.inventory.length > 0 && Math.random() < 0.3) {
            return `gift ${p.inventory[0]!.name}`;
          }
        }
      }

      // Hooks present -> try to follow
      if (scene && scene.hooks && scene.hooks.length > 0 && Math.random() < 0.4) {
        const hook = scene.hooks[0]!;
        const verb = (hook as any).verb || 'investigate';
        const target = (hook as any).target || (hook as any).name || '';
        if (target) return `${verb} ${target}`;
      }

      // Cycle exploration verbs / travel — bias toward time-advancing
      // verbs (travel/rest/search) so we hit 365 days in a reasonable
      // number of submitPlayerAction calls.
      const roll = Math.random();
      if (roll < 0.55) {
        const dir = directions[dirIdx % directions.length];
        dirIdx++;
        return `go ${dir}`;
      }
      if (roll < 0.7) return 'rest';
      if (roll < 0.82) return 'search the ground';
      if (roll < 0.9) return 'look';
      if (roll < 0.95) return 'craft';
      return tacticCycle[tacticIdx++ % tacticCycle.length]!;
    };

    // Main loop ---------------------------------------------------------
    const MAX_ACTIONS = 8000;
    let actions = 0;
    let endReason = 'max_actions';
    while (actions < MAX_ACTIONS) {
      // Yield to event loop every 50 actions so setTimeout/microtask
      // callbacks (death handler, persist) get a chance to run.
      if (actions % 50 === 0) {
        await new Promise<void>((r) => setImmediate(r));
      }
      actions++;
      const sBefore = store.getState();
      const pBefore = sBefore.player;
      if (!pBefore) {
        endReason = 'no_player';
        break;
      }

      const hoursElapsed = pBefore.hoursElapsed ?? 0;
      const day = Math.floor(hoursElapsed / 24) + 1;
      if (day >= 365) {
        endReason = 'reached_365_days';
        break;
      }

      if (pBefore.dead) {
        deaths++;
        if (sBefore.resurrectionGems > 0) {
          // Try to resurrect via slot
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
        endReason = 'died_no_gems';
        break;
      }

      // Track enemy kills (transition: had active enemy, now gone)
      const enemyNow = sBefore.currentScene && sBefore.currentScene.enemies.length > 0
        ? sBefore.currentScene.enemies[sBefore.currentScene.activeEnemyIdx] ?? sBefore.currentScene.enemies[0]
        : null;
      const enemyHpNow = sBefore.currentScene && sBefore.currentScene.enemyHps.length > 0
        ? sBefore.currentScene.enemyHps[sBefore.currentScene.activeEnemyIdx] ?? sBefore.currentScene.enemyHps[0]
        : null;
      if (lastEnemyName && (!enemyNow || enemyNow.name !== lastEnemyName)) {
        // Enemy went away — if prevEnemyHp was reaching 0, count as kill
        if ((prevEnemyHp ?? 1) <= 0) {
          bump(killCounts, lastEnemyName);
        }
      }
      lastEnemyName = enemyNow?.name ?? null;
      prevEnemyHp = enemyHpNow;

      // Track quests
      for (const id of pBefore.completedFactionQuestIds ?? []) questsCompleted.add(id);
      for (const id of pBefore.activeFactionQuestIds ?? []) questsAccepted.add(id);
      for (const q of pBefore.activeFactionQuests ?? []) questsAccepted.add(q.id);
      for (const id of pBefore.completedHuntIds ?? []) questsCompleted.add(id);
      for (const id of pBefore.completedMysteryIds ?? []) questsCompleted.add(id);
      for (const id of pBefore.completedStorylineIds ?? []) questsCompleted.add(id);

      // Track TC delta
      if (pBefore.tc > prevTc) tcEarned += pBefore.tc - prevTc;
      else if (pBefore.tc < prevTc) tcSpent += prevTc - pBefore.tc;
      prevTc = pBefore.tc;

      // Track slotLoadError
      if (sBefore.slotLoadError) {
        slotLoadErrors.push(sBefore.slotLoadError);
        store.getState().clearSlotLoadError();
      }

      // Track channel counts
      const newLogs = sBefore.gameLog.slice(prevLogLen);
      for (const entry of newLogs) bump(channelCounts, entry.channel);
      // Detect crafted items in logs
      for (const entry of newLogs) {
        const m = /(?:You craft|crafted|forged|brewed)\s+(?:an?|the)?\s*([A-Z][a-zA-Z\s]+)/.exec(entry.text);
        if (m) bump(craftedItems, m[1]!.trim());
      }
      prevLogLen = sBefore.gameLog.length;

      // Action selection & stuck detection
      let action = pickAction();
      const sameScene = sBefore.currentScene?.location.id === prevLocationId;
      const sameLog = sBefore.gameLog.length === prevLogLen && actions > 1;
      const sameClock = hoursElapsed === prevHoursElapsed;
      if (sameScene && sameClock && sameLog && !enemyNow) {
        stuckCount++;
        if (stuckCount >= 2) {
          action = tacticCycle[tacticIdx++ % tacticCycle.length]!;
          stuckCount = 0;
        }
      } else {
        stuckCount = 0;
      }
      prevLocationId = sBefore.currentScene?.location.id ?? null;
      prevHoursElapsed = hoursElapsed;

      submit(action);
    }

    // Final stats -------------------------------------------------------
    const sFinal = store.getState();
    const pFinal = sFinal.player;
    const finalHours = pFinal?.hoursElapsed ?? 0;
    const finalDay = Math.floor(finalHours / 24) + 1;

    // Also collect remaining new logs since last loop
    const tailLogs = sFinal.gameLog.slice(prevLogLen);
    for (const entry of tailLogs) bump(channelCounts, entry.channel);
    for (const id of pFinal?.completedFactionQuestIds ?? []) questsCompleted.add(id);
    for (const id of pFinal?.completedHuntIds ?? []) questsCompleted.add(id);
    for (const id of pFinal?.completedMysteryIds ?? []) questsCompleted.add(id);
    for (const id of pFinal?.completedStorylineIds ?? []) questsCompleted.add(id);

    const factionRep = (pFinal?.factionStanding ?? [])
      .filter((s) => s.standing !== 0)
      .map((s) => `${s.factionId}=${s.standing}`)
      .join(', ');

    const notableItems = (pFinal?.inventory ?? [])
      .slice(0, 10)
      .map((it) => `${it.name}${it.quantity > 1 ? ` x${it.quantity}` : ''}`);

    // Restore console for the report
    console.log = _origLog;

    const report = `
================ YEAR SIMULATION REPORT ================
End reason:         ${endReason}
Actions attempted:  ${actionsAttempted}
Pending rolls done: ${pendingResolves}
Crashes captured:   ${crashes.length}
slotLoadErrors:     ${slotLoadErrors.length}

Survived:           Day ${finalDay} (${finalHours.toFixed(1)} in-game hours)
Status:             ${pFinal?.dead ? 'DEAD (permadeath)' : 'ALIVE'}
HP:                 ${pFinal?.hp}/${pFinal?.hpMax}
Stamina:            ${pFinal?.stamina}/${pFinal?.staminaMax}
TC current:         ${pFinal?.tc}
TC earned (gross):  ${tcEarned}
TC spent (gross):   ${tcSpent}
Corruption:         ${pFinal?.corruption ?? 0}
Stats:              STR ${pFinal?.stats.strength} DEX ${pFinal?.stats.dexterity} INT ${pFinal?.stats.intelligence} WIS ${pFinal?.stats.wisdom} CHA ${pFinal?.stats.charisma}
Race / Faction:     ${pFinal?.raceId} / ${pFinal?.factionId}
Location:           ${sFinal.currentScene?.location.name ?? pFinal?.currentLocationId ?? '?'}
Deaths/resurrects:  ${deaths} / ${resurrections}

Milestones:         enemies=${pFinal?.milestones?.enemiesDefeated ?? 0}, travels=${pFinal?.milestones?.travelsCompleted ?? 0}, checks=${pFinal?.milestones?.checksSucceeded ?? 0}

Inventory size:     ${pFinal?.inventory.length}
Notable items:      ${notableItems.join(', ') || '(none)'}

Kills (top 5):      ${topN(killCounts, 5).map(([k, v]) => `${k}×${v}`).join(', ') || '(none)'}
Quests accepted:    ${questsAccepted.size}
Quests completed:   ${questsCompleted.size}
Completed list:     ${[...questsCompleted].join(', ') || '(none)'}
Factions joined+rep:${factionRep || '(none)'}

Crafted items:      ${Object.keys(craftedItems).length} unique
                    ${topN(craftedItems, 5).map(([k, v]) => `${k}×${v}`).join(', ') || '(none)'}

Top log channels:   ${topN(channelCounts, 5).map(([k, v]) => `${k}=${v}`).join(', ')}

First 5 crashes:    ${crashes.slice(0, 5).join(' | ') || '(none)'}
First 3 slotErrs:   ${slotLoadErrors.slice(0, 3).join(' | ') || '(none)'}
========================================================
`.trim();
    console.log(report);

    // The test is informational — assert only that we ran without
    // unhandled crashes preventing the loop.
    expect(actionsAttempted).toBeGreaterThan(0);
  });
});
