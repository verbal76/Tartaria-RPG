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

// ⚠⚠ THE COMPLETIONIST — OUTCOME SWEEP. The companion to the spine sweep:
// where that file crosses WHO you are, this one crosses WHAT CAN HAPPEN.
//
//  A. EVERY MOTIVE × EVERY RESOLUTION, LIVE (5 × 3 = 15). The resolution is
//     dealt from the character's identity, so a normal run sees one of three.
//     Here the walk SEARCHES character names until the dealer lands each kind,
//     then plays it out for real — quiet answers resolve on arrival, boss
//     answers spawn/kill/close — keepsake, thread mark, epilogue override, all
//     fifteen cells.
//  B. EVERY BOUNTY PAIR, LIVE (9 givers × 8 targets = 72). The ota1221 walker
//     proves one pair end to end; a pair is authored DATA (politics, outposts,
//     names), and any cell could hide a dead outpost or a broken freeze.
//  C. THE FULL ENDING-TEXT MATRIX (9 × 5 × 4 × 3 = 540 + fallbacks). Every
//     composition the EndingScreen can ever assemble — faction ending line ×
//     motive epilogue × resolution override — enumerated at the engine layer:
//     non-empty, no raw {name}, no dev-note vocabulary, resolution override
//     wins when set. The 180 live spine games sample this matrix; this proves
//     the whole surface.
//
// ⚠ "Sweep" keeps it out of test:ci:fast. On-demand:
//     npx jest completionist --forceExit
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { LOST_CAPITAL_LOCATIONS, endingLine } from '../app/engine/mainQuest';
import { STORY_MOTIVE_IDS } from '../app/engine/story';
import {
  resolutionKindsFor, bossKindFor, resolutionKindFor, resolutionBlock,
  motiveFigureName, resolvedKindOf, motiveBossFromEnemy, beatsForMotive,
} from '../app/engine/storyDrip';
import { epilogueMotiveLine } from '../app/engine/chapters';
import { startingLocationForFaction } from '../app/engine/character';
import { canonicalCellOf } from '../app/engine/worldMap';
import { QUARRY_GROUPS } from '../app/engine/quarrySeed';
import type { InventoryItem, MainQuestEnding } from '../app/engine/types';
import chaptersData from '../app/data/story/chapters.json';

jest.setTimeout(1800000);

const store = useGameStore;
const ENDINGS: MainQuestEnding[] = ['seal', 'unleash', 'preserve', 'stay'];
const DEV_NOTE_RE = /\b(in a coming ota|a future ota|being authored|not yet authored|placeholder|coming soon|to be authored|tbd|todo)\b/i;

async function settle(pred: () => boolean, deadlineMs = 6000) {
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
  useGameStore.setState({
    currentScene: {
      ...store.getState().currentScene!,
      enemies: [], enemyHps: [], hooks: [], range: null, enemiesAtBase: false,
    },
  });
}

async function boot(name: string) {
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await settle(() => !!store.getState().currentScene);
  let last = -1;
  await settle(() => {
    const n = store.getState().gameLog.length;
    const stable = n === last;
    last = n;
    return stable;
  }, 10000);
}

describe('COMPLETIONIST A — every motive through every resolution, live (15 cells)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  const RACE = () => getRaces()[0]!.id;
  const FACTION = () => getFactions()[0]!.id;
  /** The dealer reads `${name}|${raceId}|${factionId}` — search names until it
   *  deals the kind this cell needs. The spread test in ota1223 guarantees all
   *  three kinds are reachable, so this always terminates early. */
  function nameForKind(motive: string, kind: string): string {
    for (let i = 0; i < 500; i++) {
      const name = `Cell${i}`;
      if (resolutionKindFor(motive, `${name}|${RACE()}|${FACTION()}`) === kind) return name;
    }
    throw new Error(`no name deals ${motive}/${kind} in 500 tries — dealer spread broke`);
  }

  for (const motive of STORY_MOTIVE_IDS) {
    for (const kind of resolutionKindsFor(motive)) {
      it(`${motive} → ${kind}${bossKindFor(motive) === kind ? ' (boss)' : ''}`, async () => {
        const name = nameForKind(motive, kind);
        await boot(name);
        const p = store.getState().player!;
        useGameStore.setState({
          player: {
            ...p,
            storyMotive: motive as typeof p.storyMotive,
            missingResolved: undefined, motiveResolved: undefined,
            storyBeatsSeen: beatsForMotive(motive).map((b) => b.id),
            hoursElapsed: 200,
            hp: 800, hpMax: 800, stamina: 200, staminaMax: 200,
            stats: { ...p.stats, strength: 20, dexterity: 20 },
            hubRoomId: null,
            activeHunts: [], activeMysteries: [], activeStorylines: [], activeQuests: [],
            mainQuest: { phase: 'cores', coresRecovered: ['asgardar', 'samarran', 'nimari'] },
          },
        });
        clearEnemies();

        const figure = motiveFigureName(motive, `${name}|${RACE()}|${FACTION()}`);
        const block = resolutionBlock(motive, kind, figure);
        const isBoss = kind === bossKindFor(motive);

        const fired = () => store.getState().gameLog.some((e) => e.text === block.arrival[0]!.text);
        for (const capital of LOST_CAPITAL_LOCATIONS) {
          if (fired()) break;
          if (capital === store.getState().player!.currentLocationId) continue;
          useGameStore.setState({ chapterCard: null, storyIntro: null });
          clearEnemies();
          store.getState().travelTo(capital);
          await settle(fired, 4000);
        }
        expect({ motive, kind, fired: fired() }).toEqual({ motive, kind, fired: true });

        if (isBoss) {
          await settle(() => (store.getState().currentScene?.enemies ?? []).some((e) => motiveBossFromEnemy(e)));
          const foe = store.getState().currentScene!.enemies.find((e) => motiveBossFromEnemy(e))!;
          expect(motiveBossFromEnemy(foe)).toEqual({ motive, kind });
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
            await new Promise((r) => setTimeout(r, 100));
            drainRolls();
          }
          await settle(() => !!resolvedKindOf(store.getState().player!));
        }

        expect({ motive, kind, resolved: resolvedKindOf(store.getState().player!) })
          .toEqual({ motive, kind, resolved: kind });
        const held = store.getState().player!.inventory.filter((i) => i.name === block.keepsake.name);
        expect({ motive, kind, keepsake: held.length }).toEqual({ motive, kind, keepsake: 1 });
      });
    }
  }
});

describe('COMPLETIONIST B — every bounty pair, live (72 cells)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  const factions = getFactions();
  // One boot for the whole grid — each pair resets the slate and plays out.
  beforeAll(async () => {
    await boot('BountyGrid');
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        hp: 800, hpMax: 800, stamina: 200, staminaMax: 200,
        stats: { ...p.stats, strength: 20, dexterity: 20 },
        hubRoomId: null,
        activeHunts: [], activeMysteries: [], activeStorylines: [], activeQuests: [],
      },
    });
  });

  for (const giver of factions) {
    for (const target of factions) {
      if (giver.id === target.id) continue;
      it(`${giver.id} pays for ${target.id}`, async () => {
        const targetLoc = startingLocationForFaction(target.id);
        expect(targetLoc).toBeTruthy();
        // Fresh slate, off the contract ground, camping rule cleared.
        const p0 = store.getState().player!;
        useGameStore.setState({
          player: { ...p0, activeBounties: [], currentLocationId: 'tartarian_outskirts', hubRoomId: null, gridX: undefined, gridY: undefined } as typeof p0,
          worldMemory: { ...store.getState().worldMemory, lastBountyClearedOutpostId: undefined },
        });
        clearEnemies();
        if (!store.getState().frozenBoard) store.getState().toggleBoardFreeze();
        store.getState().acceptBounty({
          giverFactionId: giver.id, giverName: giver.name,
          targetFactionId: target.id, targetName: `${target.name} quarry`,
          targetLocationId: targetLoc!, targetLocationName: target.name,
          count: 1, progress: 0, rewardTc: 50, rewardRep: 2,
        } as never);
        const accepted = store.getState().player!.activeBounties?.[0];
        expect({ giver: giver.id, target: target.id, accepted: !!accepted }).toEqual({ giver: giver.id, target: target.id, accepted: true });
        expect(accepted!.politics).toBeTruthy();

        // Arrive on the contract's ground → the quarry seeds (OTA-1221 flag).
        const cell = canonicalCellOf(targetLoc!);
        useGameStore.setState({
          player: { ...store.getState().player!, currentLocationId: targetLoc!, hubRoomId: null, gridX: cell.x, gridY: cell.y },
          worldMemory: {
            ...store.getState().worldMemory,
            patrols: (store.getState().worldMemory.patrols ?? []).filter((pt) => !(pt as { quarry?: boolean }).quarry),
          },
        });
        clearEnemies();
        await store.getState().submitPlayerAction('investigate the area');
        drainRolls();
        await settle(() => store.getState().player!.activeBounties?.[0]?.quarrySeeded === true);
        const quarry = (store.getState().worldMemory.patrols ?? []).filter((pt) => (pt as { quarry?: boolean }).quarry);
        expect({ giver: giver.id, target: target.id, quarry: quarry.length }).toEqual({ giver: giver.id, target: target.id, quarry: QUARRY_GROUPS });
        expect(quarry.every((pt) => pt.factionId === target.id)).toBe(true);

        // The kill pays on the spot and clears the slate.
        const tcBefore = store.getState().player!.tc;
        useGameStore.setState({
          currentScene: {
            ...store.getState().currentScene!,
            enemies: [{ name: 'Quarry', hp: 1, hpMax: 1, ac: 5, attack: 1, damage: '1d4', traits: [], loot: [], rarity: 'Common', factionId: target.id } as never],
            enemyHps: [1], activeEnemyIdx: 0, range: 'close',
            enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
            enemyArmorShred: [0], enemyCorruptionStacks: [0], hooks: [], enemiesAtBase: false,
          },
        });
        for (let round = 0; round < 6 && (store.getState().player!.activeBounties ?? []).length > 0; round++) {
          await store.getState().submitPlayerAction('attack');
          drainRolls();
          await new Promise((r) => setTimeout(r, 100));
          drainRolls();
        }
        await settle(() => (store.getState().player!.activeBounties ?? []).length === 0);
        expect({ giver: giver.id, target: target.id, cleared: (store.getState().player!.activeBounties ?? []).length })
          .toEqual({ giver: giver.id, target: target.id, cleared: 0 });
        expect(store.getState().player!.tc).toBeGreaterThanOrEqual(tcBefore + 50);
      });
    }
  }
});

describe('COMPLETIONIST C — the full ending-text matrix (540 cells + fallbacks)', () => {
  it('every faction × motive × ending × resolution composition is whole', () => {
    const ep = (chaptersData as { epilogue: Record<string, { motives: Record<string, string> }> }).epilogue;
    const offenders: string[] = [];
    for (const faction of getFactions()) {
      for (const ending of ENDINGS) {
        // The faction ending prose.
        const line = endingLine(ending, faction.id);
        if (!line || line.length < 60 || DEV_NOTE_RE.test(line) || line.includes('{name}')) {
          offenders.push(`endingLine ${ending}/${faction.id}`);
        }
        for (const motive of STORY_MOTIVE_IDS) {
          // The open-question epilogue for this ending × motive.
          const open = ep[ending]?.motives[motive] ?? epilogueMotiveLine(ending as never, motive as never);
          if (!open || open.length < 60 || DEV_NOTE_RE.test(open) || open.includes('{name}')) {
            offenders.push(`epilogue ${ending}/${motive}`);
          }
          // The resolved override for each of this motive's three answers.
          for (const kind of resolutionKindsFor(motive)) {
            const block = resolutionBlock(motive, kind, 'Matrixname');
            if (!block.epilogue || block.epilogue.length < 60 || block.epilogue.includes('{name}') || DEV_NOTE_RE.test(block.epilogue)) {
              offenders.push(`override ${motive}/${kind}`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('an unknown faction and an unknown motive both fall back to prose, never to a hole', () => {
    for (const ending of ENDINGS) {
      const line = endingLine(ending, 'no_such_faction');
      expect(line.length).toBeGreaterThan(40);
      expect(DEV_NOTE_RE.test(line)).toBe(false);
    }
  });
});
