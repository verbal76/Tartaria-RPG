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

// ⚠⚠ OTA-1223 — EVERY REASON YOU CAME DOWN NOW ENDS SOMEWHERE. Owner, after the
// arc read: "complete gap one." The gap: only The Missing had an in-world payoff
// scene — the grave, the lie, or the thing that walks. Debt, Exile, Calling and
// Record each got five drip beats, two forks and an epilogue paragraph, but never
// the moment the thing you came for is finally in front of you. Twelve new
// authored answers (three per motive) close it, on the Missing's own machine.
//
// This suite walks all FIVE motives through the REAL store, both shapes:
//   • the quiet answers  — arrival lines, keepsake in the pack, thread marked
//   • the boss answers   — spawn, kill, closing beats, keepsake, thread marked
// plus the authoring audit (every motive has three answers, exactly one a fight,
// every {name} token fillable) and the EndingScreen override for all five.
//
// ⚠⚠ HARNESS TRAPS: the ota1219HuntWalker header's five all apply. One of this
// file's own:
//  8. THE RESOLUTION IS AN ARRIVAL EVENT. It fires from advanceStoryDrip on a
//     LOST CAPITAL arrival, and holds while the tutorial/crawl/chapter card owns
//     the screen or the scene is hostile. Seed all five beats seen + 3 Cores,
//     clear the scene, and travel in — do not expect a verb to trigger it.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { STORY_MOTIVE_IDS, motiveById } from '../app/engine/story';
import {
  resolutionKindsFor, bossKindFor, resolutionKindFor, resolutionBlock, resolutionDue,
  resolvedEpilogue, resolvedKindOf, motiveFigureName, resolutionBossEnemy,
  motiveBossFromEnemy, beatsForMotive, storySeed, isMissingWalker,
} from '../app/engine/storyDrip';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';

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

describe('OTA-1223 — the authoring audit: no motive without an ending', () => {
  it('⚠⚠ every motive has three authored answers, exactly ONE of them a fight', () => {
    for (const id of STORY_MOTIVE_IDS) {
      const kinds = resolutionKindsFor(id);
      expect({ motive: id, count: kinds.length }).toEqual({ motive: id, count: 3 });
      const bossKinds = kinds.filter((k) => (resolutionBlock(id, k, 'X').defeat?.length ?? 0) > 0);
      expect({ motive: id, fights: bossKinds.length }).toEqual({ motive: id, fights: 1 });
      expect(bossKindFor(id)).toBe(bossKinds[0]);
    }
  });

  it('⚠⚠ every answer is complete — arrival lines, a real keepsake, an epilogue, and no unfilled {name}', () => {
    for (const id of STORY_MOTIVE_IDS) {
      for (const kind of resolutionKindsFor(id)) {
        const b = resolutionBlock(id, kind, 'Testname');
        expect(b.arrival.length).toBeGreaterThan(0);
        expect(b.keepsake.name.length).toBeGreaterThan(0);
        expect(b.keepsake.description.length).toBeGreaterThan(0);
        expect(b.epilogue.length).toBeGreaterThan(0);
        // {name} must be SUBSTITUTED everywhere, never shipped raw to a player.
        const all = [...b.arrival.map((l) => l.text), ...(b.defeat ?? []).map((l) => l.text),
          b.keepsake.name, b.keepsake.description, b.epilogue].join('\n');
        expect({ motive: id, kind, raw: all.includes('{name}') }).toEqual({ motive: id, kind, raw: false });
        for (const l of b.arrival) expect(['world', 'arbiter']).toContain(l.speaker);
      }
    }
  });

  it('⚠ the dealer is stable per character and spreads across characters', () => {
    for (const id of STORY_MOTIVE_IDS) {
      const seed = `Verbal|unknowing_mass|reclaimers_guild`;
      expect(resolutionKindFor(id, seed)).toBe(resolutionKindFor(id, seed));
      expect(motiveFigureName(id, seed)).toBe(motiveFigureName(id, seed));
      const dealt = new Set(
        Array.from({ length: 60 }, (_, i) => resolutionKindFor(id, `C${i}|r|f`)),
      );
      // All three answers must be reachable, or a variant can never be seen.
      expect({ motive: id, reachable: dealt.size }).toEqual({ motive: id, reachable: 3 });
    }
  });

  it('⚠ every boss answer builds a real, killable boss carrying its own thread tag', () => {
    for (const id of STORY_MOTIVE_IDS) {
      const foe = resolutionBossEnemy(id, 30, 'Testname');
      expect(foe.hp).toBeGreaterThan(0);
      expect(foe.boss).toBe(true);
      expect(foe.name.length).toBeGreaterThan(0);
      const tag = motiveBossFromEnemy(foe);
      expect(tag).toEqual({ motive: id, kind: bossKindFor(id) });
    }
    // ⚠ The Missing's walker keeps its ORIGINAL marker as well — its own suite
    // and any save caught mid-fight across this update still read as before.
    expect(isMissingWalker(resolutionBossEnemy('missing', 30, 'Maren'))).toBe(true);
  });
});

describe('OTA-1223 — LIVE: every motive answers itself at a Lost Capital', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  /** Boot a character on the given motive, standing one step from the answer:
   *  all five of that motive's drip beats seen, three Cores carried, unresolved. */
  async function bootAtTheEndOfTheTrail(motiveId: string) {
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: `Walker${motiveId}`, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    let last = -1;
    await settle(() => {
      const n = store.getState().gameLog.length;
      const stable = n === last;
      last = n;
      return stable;
    }, 10000);
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        storyMotive: motiveId as typeof p.storyMotive,
        missingResolved: undefined,
        motiveResolved: undefined,
        storyBeatsSeen: beatsForMotive(motiveId).map((b) => b.id),
        hoursElapsed: 200,
        hp: 500, hpMax: 500, stamina: 200, staminaMax: 200,
        stats: { ...p.stats, strength: 20, dexterity: 20 },
        hubRoomId: null,
        mainQuest: { phase: 'cores', coresRecovered: ['asgardar', 'samarran', 'nimari'] },
      },
    });
    useGameStore.setState({
      currentScene: { ...store.getState().currentScene!, enemies: [], enemyHps: [], hooks: [], range: null },
    });
    return store.getState().player!;
  }

  for (const motiveId of STORY_MOTIVE_IDS) {
    it(`⚠⚠ ${motiveId} (${motiveById(motiveId).title}) — the trail ends: answer fires, keepsake lands, epilogue closes`, async () => {
      const p = await bootAtTheEndOfTheTrail(motiveId);
      expect(resolutionDue(p)).toBe(true);

      const seed = storySeed(p);
      const kind = resolutionKindFor(motiveId, seed);
      const figure = motiveFigureName(motiveId, seed);
      const block = resolutionBlock(motiveId, kind, figure);
      const isFight = kind === bossKindFor(motiveId);

      // ⚠ Trap #8 — the answer is an ARRIVAL event at a Lost Capital.
      // ⚠ Trap #8 continued — the drip HOLDS on an arrival that lands during a
      // chapter card or into a hostile scene, and simply waits for the next
      // arrival (documented, deliberate). The walk mirrors a player's next trip:
      // clear the blockers and travel to the next Capital until it lands.
      const fired = () => store.getState().gameLog.some((e) => e.text === block.arrival[0]!.text);
      for (const capital of LOST_CAPITAL_LOCATIONS) {
        if (fired()) break;
        if (capital === store.getState().player!.currentLocationId) continue;
        useGameStore.setState({ chapterCard: null, storyIntro: null });
        useGameStore.setState({
          currentScene: { ...store.getState().currentScene!, enemies: [], enemyHps: [], hooks: [], range: null },
        });
        store.getState().travelTo(capital);
        await settle(fired, 4000);
      }
      if (!fired()) {
        process.stdout.write(`\n=== NO ANSWER ${motiveId}/${kind} loc=${store.getState().player!.currentLocationId} card=${!!store.getState().chapterCard} enemies=${store.getState().currentScene?.enemies.length} due=${resolutionDue(store.getState().player!)} ===\n`
          + store.getState().gameLog.slice(-8).map((e) => `${e.channel}: ${e.text.slice(0, 90)}`).join('\n') + '\n=== END ===\n');
      }

      const log = () => store.getState().gameLog.map((e) => e.text).join('\n');
      for (const line of block.arrival) {
        expect({ motive: motiveId, kind, arrived: log().includes(line.text) })
          .toEqual({ motive: motiveId, kind, arrived: true });
      }

      if (isFight) {
        // The fight answers: the boss is UP and the thread is still open —
        // spawning is not resolving (a fled fight must re-offer, never lose
        // the ending), exactly as the Missing walker has always behaved.
        await settle(() => (store.getState().currentScene?.enemies ?? []).some((e) => motiveBossFromEnemy(e)));
        const foe = store.getState().currentScene!.enemies.find((e) => motiveBossFromEnemy(e))!;
        expect(motiveBossFromEnemy(foe)).toEqual({ motive: motiveId, kind });
        expect(resolvedKindOf(store.getState().player!)).toBeNull();

        useGameStore.setState({
          currentScene: {
            ...store.getState().currentScene!,
            enemies: [foe], enemyHps: [1], activeEnemyIdx: 0, range: 'close',
            enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
            enemyArmorShred: [0], enemyCorruptionStacks: [0], enemiesAtBase: false,
          },
        });
        for (let round = 0; round < 8 && !resolvedKindOf(store.getState().player!); round++) {
          await store.getState().submitPlayerAction('attack');
          drainRolls();
          await new Promise((r) => setTimeout(r, 120));
          drainRolls();
        }
        await settle(() => !!resolvedKindOf(store.getState().player!));
        // The closing beats are GUARANTEED on the kill, never a dice roll.
        for (const line of block.defeat ?? []) {
          expect({ motive: motiveId, closed: log().includes(line.text) })
            .toEqual({ motive: motiveId, closed: true });
        }
      }

      // Resolved, once, with the keepsake really in the pack.
      expect({ motive: motiveId, resolved: resolvedKindOf(store.getState().player!) })
        .toEqual({ motive: motiveId, resolved: kind });
      const held = store.getState().player!.inventory.filter((i) => i.name === block.keepsake.name);
      expect({ motive: motiveId, keepsake: block.keepsake.name, held: held.length })
        .toEqual({ motive: motiveId, keepsake: block.keepsake.name, held: 1 });

      // And the ending screen closes on THIS answer, not the open-question line.
      expect(resolvedEpilogue(store.getState().player!)).toBe(block.epilogue);

      // ⚠ Once only: the trail cannot re-fire and re-pay at the next Capital.
      expect(resolutionDue(store.getState().player!)).toBe(false);
    });
  }

  it('⚠ an UNRESOLVED character still reads the open-question epilogue (the four-fifths of runs that never get there)', async () => {
    const p = await bootAtTheEndOfTheTrail('debt');
    useGameStore.setState({ player: { ...p, storyBeatsSeen: [] } });
    expect(resolutionDue(store.getState().player!)).toBe(false);
    expect(resolvedEpilogue(store.getState().player!)).toBeNull();
  });
});
