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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠ OTA-1222 — TEXAS RANGER CLIMBS THE TOWERS AND CHASES THE WHISPERS. The
// last two side-quest machines join the walker fleet. Neither runs on stage
// verbs, so each walk speaks its family's own language:
//
// GREAT CLIMBS (5): stand at the landmark with the real gear (Hardened
// Climbing Strap worn on LEGS + a whole Reclaimer's Rope — the same gate the
// game enforces), the climb unlocked (map read), then CLIMB the tower tier by
// tier through the real dice — 11-15 tiers each. At the crown the summit boss
// SPAWNS (approach line + the summit_climb: trait); killing it banks the crest
// (worldMemory.summitBossesDefeated) and pays the Skyreacher piece — exactly
// once. The walker asserts the whole ladder: refused-without-gear is covered
// by climbReadiness/climbRopeMechanics; here the PAYING path is walked.
//
// WHISPERS (every CHAINS entry): the family is ARRIVAL-driven — the dispatcher
// (resolveWhispersForTile) fires on cardinal steps, not verbs. The walk plants
// the whisper, STEPS onto the rendezvous tile inside the chain's active hours
// (meet), accepts the fetch, WALKS east to the thief's tile (combat spawns),
// kills the thief for the stolen goods, and WALKS back to the fire — where the
// turn-in pays 5 Aetheric Discs + 30 TC and completes the chain outright
// (arb120). Every transition is a real map step through the real dispatcher.
//
// ⚠⚠ HARNESS TRAPS: the five in the ota1219HuntWalker header all apply. Two
// new ones, this file's own:
//  6. STEP, DON'T TELEPORT: whisper transitions fire ONLY inside the cardinal
//     step handler. Setting mapX/mapY directly skips the dispatcher and the
//     chain never advances. The walk seeds the TARGET ON THE STARTING TILE,
//     steps away and steps back — no direction math to rot.
//  7. THE CLIMB IS STATEFUL: elevatedOn is the live ladder. Scene edits at the
//     summit (isolating the boss) MUST spread the existing scene or the climb
//     state resets and the boss respawn logic re-arms.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { GREAT_CLIMBS, SUMMIT_BOSS_TRAIT_PREFIX } from '../app/engine/greatClimbs';
import { CHAINS } from '../app/engine/whispers';
import type { InventoryItem } from '../app/engine/types';

jest.setTimeout(600000);

const store = useGameStore;

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

function drainRolls() {
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 60) throw new Error('roll loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 15));
  }
}

function clearEnemies() {
  const scene = store.getState().currentScene!;
  useGameStore.setState({
    currentScene: { ...scene, enemies: [], enemyHps: [], hooks: [], range: null },
  });
}

describe('OTA-1222 — Texas Ranger on the Great Climbs and the whisper chains', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    let last = -1;
    await settle(() => {
      const n = store.getState().gameLog.length;
      const stable = n === last;
      last = n;
      return stable;
    }, 10000);
  });

  for (const climb of GREAT_CLIMBS) {
    it(`⚠⚠ climb ${climb.id} — ${climb.tiers} tiers, summit boss falls, crest banks once, ${climb.rewardArmor} paid`, async () => {
      // The real gate: strap WORN on legs + a whole Reclaimer's Rope carried,
      // the climb unlocked (map read). Stamina for 2/tier with no discounts.
      const p = store.getState().player!;
      const rope: InventoryItem = { id: 'walker_rope', name: "Reclaimer's Rope", kind: 'misc', quantity: 1, tags: ['utility', 'gate'],
        // The gate reads durability — a great climb needs 15/tier left on the rope.
        durability: { current: 400, max: 400 } } as InventoryItem;
      const strap: InventoryItem = { id: 'walker_strap', name: 'Hardened Climbing Strap', kind: 'armor', quantity: 1, tags: ['utility', 'gate'] };
      useGameStore.setState({
        player: {
          ...p,
          currentLocationId: climb.locationId,
          hubRoomId: null,
          hp: 500, hpMax: 500, stamina: 200, staminaMax: 200,
          stats: { ...p.stats, strength: 20, dexterity: 20 },
          inventory: [
            ...p.inventory.filter((i) => i.name !== "Reclaimer's Rope" && i.name !== 'Hardened Climbing Strap'),
            rope, strap,
          ],
          equipped: { ...(p.equipped ?? {}), legs: 'Hardened Climbing Strap' },
          activeHunts: [], activeMysteries: [], activeStorylines: [], activeQuests: [],
        },
        worldMemory: {
          ...store.getState().worldMemory,
          unlockedGreatClimbs: Array.from(new Set([...(store.getState().worldMemory.unlockedGreatClimbs ?? []), climb.id])),
        },
      });
      useGameStore.setState({
        currentScene: {
          ...store.getState().currentScene!,
          ambientNouns: [climb.noun],
          elevatedOn: null,
          enemies: [], enemyHps: [], hooks: [], range: null,
        },
      });

      // The ladder: tier by tier through the real dice, until the crown.
      const isBossUp = () => (store.getState().currentScene?.enemies ?? [])
        .some((e) => (e.traits ?? []).some((t) => String(t).startsWith(SUMMIT_BOSS_TRAIT_PREFIX)));
      let guard = 0;
      while (!isBossUp()) {
        if (guard++ > climb.tiers * 3 + 6) {
          throw new Error(`${climb.id}: never reached the summit boss (tier state: ${JSON.stringify(store.getState().currentScene?.elevatedOn)})\n`
            + store.getState().gameLog.slice(-6).map((e) => `${e.channel}: ${e.text}`).join('\n'));
        }
        // ⚠ At the crown, STOP RESETTING THE SCENE and wait for the guardian —
        // the spawn can land a beat after the topping climb, and a rung reset
        // here deletes a boss that will never respawn ("already at the top").
        const elevNow = store.getState().currentScene?.elevatedOn;
        if (elevNow && elevNow.tier >= elevNow.totalTiers) {
          await settle(isBossUp, 4000);
          if (!isBossUp()) {
            throw new Error(`${climb.id}: crested the tower but no summit boss appeared — if the scene shows elevatedOverlayMeta, the OTA-1222 crown-overlay guard has regressed\n`
              + store.getState().gameLog.slice(-6).map((e) => `${e.channel}: ${e.text}`).join('\n'));
          }
          break;
        }
        // A wandering spawn mid-ladder blocks the climb verb ("not while
        // they're on you") — shoo anything that is NOT the summit boss. And
        // re-assert the tower into the scene's noun lists every rung: scene
        // re-rolls mid-ladder rebuild ambientNouns and the parser stops
        // resolving the climb target (resolved=-, silent no-op).
        useGameStore.setState({
          currentScene: {
            ...store.getState().currentScene!,
            ambientNouns: [climb.noun],
            displayedAmbientNouns: [climb.noun],
            enemies: [], enemyHps: [], hooks: [], range: null,
            enemiesAtBase: false,
          },
        });
        await store.getState().submitPlayerAction(`climb ${climb.noun}`);
        drainRolls();
        await new Promise((r) => setTimeout(r, 30));
        drainRolls();
      }
      const boss = store.getState().currentScene!.enemies.find((e) => (e.traits ?? []).some((t) => String(t).startsWith(SUMMIT_BOSS_TRAIT_PREFIX)))!;
      // Not banked yet — the crest needs the body, not the spawn.
      expect(store.getState().worldMemory.summitBossesDefeated ?? []).not.toContain(climb.id);

      // The kill: wound it to a sliver and swing through the real dice.
      // (Trap #7 — spread the live scene so elevatedOn survives.)
      useGameStore.setState({
        currentScene: {
          ...store.getState().currentScene!,
          enemies: [boss], enemyHps: [1], activeEnemyIdx: 0, range: 'close',
          enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
          enemyArmorShred: [0], enemyCorruptionStacks: [0],
          // ⚠ The summit boss is AT THE CROWN with you — a stale enemiesAtBase
          // from a mid-ladder wandering spawn turns every swing into the
          // "won't reach from up here" refusal.
          enemiesAtBase: false,
        },
      });
      for (let round = 0; round < 8 && !(store.getState().worldMemory.summitBossesDefeated ?? []).includes(climb.id); round++) {
        await store.getState().submitPlayerAction('attack');
        drainRolls();
        await new Promise((r) => setTimeout(r, 120));
        drainRolls();
      }
      await settle(() => (store.getState().worldMemory.summitBossesDefeated ?? []).includes(climb.id));
      expect(store.getState().worldMemory.summitBossesDefeated ?? []).toContain(climb.id);
      // The crest pays the named Skyreacher piece — exactly one.
      const pieces = store.getState().player!.inventory.filter((i) => i.name === climb.rewardArmor);
      expect({ climb: climb.id, piece: climb.rewardArmor, count: pieces.length })
        .toEqual({ climb: climb.id, piece: climb.rewardArmor, count: 1 });
    });
  }

  for (const chain of CHAINS) {
    it(`⚠⚠ whisper ${chain.id} — plant → step to the meet → fetch → kill → step back → paid and complete`, async () => {
      // Reset to the starter plains, inside the chain's active hours. The
      // dispatcher (resolveWhispersForTile) fires ONLY on steps landing on
      // OPEN ground — an arrival at a named location takes the arrival branch
      // and re-centers the map, which stales every stored tile coordinate. So
      // the whole dance happens in open wilderness, and any collision with a
      // named tile fails loudly instead of mysteriously.
      const p = store.getState().player!;
      const hour = chain.activeHours ? chain.activeHours[0] + 1 : 12;
      useGameStore.setState({
        player: {
          ...p,
          hp: 500, hpMax: 500, stamina: 200, staminaMax: 200,
          currentLocationId: 'tartarian_outskirts',
          hubRoomId: null,
          hoursElapsed: hour,
          tc: 0,
          activeWhispers: [],
          activeHunts: [], activeMysteries: [], activeStorylines: [], activeQuests: [],
          inventory: p.inventory.filter((i) => i.name !== 'Aetheric Disc' && i.name !== 'Stolen Aetheric Discs'),
        },
      });
      clearEnemies();
      const stepOpen = (dir: 'north' | 'south' | 'east' | 'west') => {
        const before = store.getState().player!.currentLocationId;
        clearEnemies();
        store.getState().stepDirection(dir);
        drainRolls();
        const after = store.getState().player!.currentLocationId;
        if (after !== before) {
          throw new Error(`whisper walk stepped ${dir} into named location '${after}' — reroute the walk (the dispatcher only fires on open ground)`);
        }
      };

      // Walk out into open plains, then seed the rendezvous on the tile we
      // stand on — the step-away-step-back arrival fires the meet through the
      // real dispatcher, with no direction math to rot (trap #6).
      stepOpen('north'); stepOpen('north'); stepOpen('north');
      const start = store.getState().player!;
      useGameStore.setState({
        player: {
          ...store.getState().player!,
          activeWhispers: [{
            id: chain.id,
            stage: 'planted',
            plantedAtHour: start.hoursElapsed ?? hour,
            targetMapX: start.mapX ?? 0,
            targetMapY: start.mapY ?? 0,
            targetLocationId: start.currentLocationId,
          }],
        },
      });
      stepOpen('north');
      stepOpen('south');
      const rec = () => (store.getState().player!.activeWhispers ?? []).find((w) => w.id === chain.id);
      await settle(() => rec()?.stage === 'met_yulka');
      expect({ chain: chain.id, stage: rec()?.stage }).toEqual({ chain: chain.id, stage: 'met_yulka' });

      // Take the fetch.
      await store.getState().submitPlayerAction(`accept yulka`);
      await settle(() => rec()?.stage === 'fetch_in_progress');
      expect(rec()?.stage).toBe('fetch_in_progress');
      const thiefX = rec()!.ctx!.thiefMapX as number;
      const stepsEast = thiefX - (store.getState().player!.mapX ?? 0);
      expect(stepsEast).toBeGreaterThan(0);

      // Walk east to the thief's tile — the combat spawns on arrival.
      for (let i = 0; i < stepsEast; i++) stepOpen('east');
      await settle(() => rec()?.stage === 'fetch_active');
      expect(rec()?.stage).toBe('fetch_active');
      await settle(() => (store.getState().currentScene?.enemies ?? []).length > 0);
      // Wound the thief to a sliver, keep ONLY the thief, and finish it.
      const thief = store.getState().currentScene!.enemies[0]!;
      useGameStore.setState({
        currentScene: {
          ...store.getState().currentScene!,
          enemies: [thief], enemyHps: [1], activeEnemyIdx: 0, range: 'close',
          enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
          enemyArmorShred: [0], enemyCorruptionStacks: [0],
        },
      });
      for (let round = 0; round < 8 && rec()?.stage !== 'fetch_returned'; round++) {
        await store.getState().submitPlayerAction('attack');
        drainRolls();
        await new Promise((r) => setTimeout(r, 120));
        drainRolls();
      }
      await settle(() => rec()?.stage === 'fetch_returned');
      expect(rec()?.stage).toBe('fetch_returned');
      expect(store.getState().player!.inventory.some((i) => i.name === 'Stolen Aetheric Discs' && i.quantity > 0)).toBe(true);

      // Walk back west to the fire — the turn-in pays and completes outright.
      const tcBefore = store.getState().player!.tc;
      for (let i = 0; i < stepsEast; i++) stepOpen('west');
      await settle(() => (store.getState().player!.completedWhisperIds ?? []).includes(chain.id));
      expect(store.getState().player!.completedWhisperIds ?? []).toContain(chain.id);
      expect(rec()).toBeUndefined(); // off the slate — no lingering epilogue (arb120)
      const discs = store.getState().player!.inventory.find((i) => i.name === 'Aetheric Disc');
      expect(discs?.quantity).toBe(5);
      expect(store.getState().player!.tc).toBe(tcBefore + 30);
    });
  }
});
