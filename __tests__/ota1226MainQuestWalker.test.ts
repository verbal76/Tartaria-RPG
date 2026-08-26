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

// ⚠⚠ OTA-1226 — TEXAS RANGER WALKS THE MAIN QUEST. The last unwalked road, and
// the one that matters most: every side-quest family had an end-to-end walker
// while the SPINE — creation → hook → revelation → nine Core Guardians → the
// Endless Stair → the Nexus → an ending — had never been played by a test even
// once. The ending suites (ota1225) start from a SEEDED choice phase: they
// prove the doors work, not that anyone can reach them. A defect anywhere on
// this road does not break a side quest — it makes the game UNCOMPLETABLE.
//
// The walk, per faction (all NINE, because each faction recovers Cores through
// its own gate and its own Guardian fights):
//   • real character creation on that faction (motive rotated too)
//   • first Capital arrival flips hook → revelation
//   • at each of the nine Lost Capitals: ★ SUMMON (the canonical route since
//     OTA-148/arb144), the Guardian spawns, dies through the real dice, the
//     defeat hook grants the Core ITEM and advances the phase
//   • nine Cores → descent
//   • arrival at the Mud Flood Nexus → choice, with the slot-beat cinematic
//     AND the Reckoning (OTA-1225) in the feed
//   • an ending is chosen and recorded — rotated so all FOUR doors are walked,
//     STAY on runs seeded to the Arbiter's kin band before the Nexus
//
// ⚠⚠ HARNESS TRAPS: the five in the ota1219HuntWalker header apply, plus:
//  9. TRAVEL, DON'T TELEPORT-BY-FIELDS. travelTo(locationId) is the real
//     arrival: it fires first_capital_visit, reached_nexus, the drip, the
//     cinematic. Hand-setting currentLocationId skips every trigger this
//     suite exists to test.
// 10. THE GUARDIAN IS THE TRIGGER-CARRIER. The Core is granted by the DEFEAT
//     hook reading the guardian's own trait — isolate the guardian when you
//     wound it (fresh enemy arrays, enemiesAtBase false) but never rebuild the
//     enemy object, or the capital id rides away with the old reference.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { LOST_CAPITAL_LOCATIONS, canStayAtTheNexus, ensureMainQuest } from '../app/engine/mainQuest';
import { isCoreGuardian, coreSettleState } from '../app/engine/coreGuardians';
import { STORY_MOTIVE_IDS } from '../app/engine/story';
import type { MainQuestEnding } from '../app/engine/types';

jest.setTimeout(900000);

const store = useGameStore;

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

const mq = () => ensureMainQuest(store.getState().player!.mainQuest);
const CORE_NAMES: Record<string, string> = {
  asgardar: 'Asgardar Core', samarran: 'Samarran Core', nimari: 'Nimari Core',
  drakova: 'Drakova Core', voronov: 'Voronov Core', karok_sa: 'Karok-Sa Core',
  yuldra_tul: 'Yuldra-Tul Core', ostragar: 'Ostragar Core', iskan_veil: 'Iskan-Veil Core',
};

/** Conduct that reaches the Arbiter's kin band, seeded the way the OTA-1225
 *  suite proved it out: nearly the whole clamped spread at once. */
function seedKin() {
  const p = store.getState().player!;
  useGameStore.setState({
    player: {
      ...p,
      corruption: 0, menace: 0,
      factionStanding: getFactions().map((f) => ({ factionId: f.id, standing: 60 })),
      storyChoices: {},
      pressure: 'bury_me',
      titleProgress: { ...(p.titleProgress ?? {}), loreRead: 30, relicsPreserved: 12, relicsTraded: 0 },
    } as typeof p,
  });
  useGameStore.setState({
    worldMemory: {
      ...store.getState().worldMemory,
      npcRelations: {
        a: { wrongs: 0, amendsCleared: 3, gifts: [{ item: 'x' }, { item: 'y' }, { item: 'z' }] },
        b: { wrongs: 0, amendsCleared: 2, gifts: [{ item: 'x' }, { item: 'y' }, { item: 'z' }] },
      } as never,
    },
  });
}

// All four doors get walked; STAY lands on runs that will be seeded to kin.
const ENDINGS: MainQuestEnding[] = ['seal', 'unleash', 'preserve', 'stay'];

describe('OTA-1226 — the main quest walker: creation to credits, nine factions, four endings', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  const factions = getFactions();
  for (let fi = 0; fi < factions.length; fi++) {
    const faction = factions[fi]!;
    const ending = ENDINGS[fi % ENDINGS.length]!;
    const motive = STORY_MOTIVE_IDS[fi % STORY_MOTIVE_IDS.length]!;

    it(`⚠⚠ ${faction.id} (${motive}) — hook → 9 Guardians → descent → Nexus → ${ending.toUpperCase()}`, async () => {
      await store.getState().hydrate();
      await store.getState().startNewGame({
        name: `Spine${fi}`, raceId: getRaces()[fi % getRaces().length]!.id,
        factionId: faction.id, motiveId: motive,
      } as never);
      store.getState().skipTutorial?.();
      await settle(() => !!store.getState().currentScene);
      let last = -1;
      await settle(() => {
        const n = store.getState().gameLog.length;
        const stable = n === last;
        last = n;
        return stable;
      }, 10000);

      // Strong enough to end every fight the walk starts; no side contracts.
      const p0 = store.getState().player!;
      useGameStore.setState({
        player: {
          ...p0,
          hp: 800, hpMax: 800, stamina: 200, staminaMax: 200,
          // ⚠⚠ OTA-1301 — INT BELONGS IN THIS LIST TOO, AND ITS ABSENCE WAS A
          // KNIFE-EDGE. The line above this one says "strong enough to end every
          // fight the walk starts" — but it buffed only STR and DEX, and several
          // starting weapons (the Pyric Wand among them) scale on INTELLIGENCE.
          // A wand-carrying walker therefore swung at INT 7 all the way to the
          // Nexus. `drainRolls` pins every d20 to 15, so that attack totalled a
          // FIXED 15 + 7 + 2 = 24 every single round — and Heir Atalan-Drowned
          // at Samarran has AC 25. Not an unlucky streak: an arithmetically
          // unwinnable fight, identical on every round, for as many rounds as
          // the budget allowed.
          //
          // ⚠ It passed before only because the guardian's scaling happened to
          // land at AC 24 or lower for the exact gear that run produced. OTA-1301
          // changed which gear a tile offers, the scaling moved by one, and the
          // knife-edge fell the other way — which is why the failure wandered
          // between capitals and factions every time the suite was filtered or
          // reordered. Buffing the stat the weapon actually uses removes the
          // edge instead of re-balancing it: no real player is capped at 24.
          stats: { ...p0.stats, strength: 20, dexterity: 20, intelligence: 20, wisdom: 20 },
          activeHunts: [], activeMysteries: [], activeStorylines: [], activeQuests: [],
        },
      });
      expect(mq().phase).toBe('hook');

      // ── The nine Capitals, in canon order ──
      // ⚠ OTA-1471 — how many seats actually made this walk sleep. Counted so
      // the settle block below cannot quietly become a no-op: if the walk's own
      // clock ever outruns the window on every capital, the `if` stops firing
      // and the coverage evaporates without a single test going red. An empty
      // result is a failure, never a clean board.
      let seatsThatMadeHimWait = 0;
      for (const capital of LOST_CAPITAL_LOCATIONS) {
        // Trap #9 — the REAL arrival, with every trigger it carries.
        store.getState().travelTo(capital);
        await settle(() => store.getState().player!.currentLocationId === capital);
        if (capital === LOST_CAPITAL_LOCATIONS[0]) {
          await settle(() => mq().phase === 'revelation');
          expect({ faction: faction.id, phase: mq().phase }).toEqual({ faction: faction.id, phase: 'revelation' });
        }
        // A hostile arrival blocks nothing for the SUMMON path, but clear the
        // field so the fight that matters is the Guardian's.
        useGameStore.setState({
          currentScene: {
            ...store.getState().currentScene!,
            enemies: [], enemyHps: [], hooks: [], range: null, enemiesAtBase: false,
          },
        });
        // ⚠⚠⚠ OTA-1471 — THE WALKER HAS TO SLEEP BETWEEN SEATS, because a real
        // player now does. Drakova and Voronov sit 2 tiles apart against a
        // 16.55-tile median, and difficulty is keyed to KILL COUNT, so a Core's
        // removal now shuts the next seat for one rest — a fixed 8 in-game hours.
        // This walker teleports with `travelTo`, which advances no clock at all,
        // so before this block it took all nine Guardians in zero hours and the
        // new gate refused seats two through nine. THAT REFUSAL WAS CORRECT; the
        // walker was the thing modelling the world wrongly.
        //
        // ⚠ The rule is COVERED, not routed around. The assertion here proves the
        // summon is refused BEFORE the rest and accepted after, on every capital
        // of every faction — nine factions × eight seats, which makes this walk
        // the widest coverage the settle gate has. Winding the clock forward
        // silently would have deleted that.
        {
          // ⚠ ASK THE HELPER WHETHER THE GATE APPLIES, don't assume it does.
          // The first draft asserted a refusal on every capital after the first
          // and failed at Drakova, because the walk's own clock had already run
          // past the window by then (arrivals and fights advance it). That was
          // the instrument inventing a precondition. The real claim is that the
          // ACTION and the HELPER agree — which is checkable wherever the gate
          // happens to bite, and is silent where it does not.
          const pNow = store.getState().player!;
          if (!coreSettleState(pNow.hoursElapsed ?? 0, pNow.mainQuest?.lastCoreAtHours).ready) {
            const tooSoon = store.getState().summonCoreGuardian();
            expect({ capital, refusedBeforeRest: tooSoon.reason })
              .toEqual({ capital, refusedBeforeRest: 'core_settling' });
            seatsThatMadeHimWait++;
            // One rest. The parser rest's fixed 8 hours, applied straight to the
            // clock so the walk need not route through the rest handler.
            useGameStore.setState((s) => ({
              player: { ...s.player!, hoursElapsed: (s.player!.hoursElapsed ?? 0) + 8 },
            }));
          }
        }
        const res = store.getState().summonCoreGuardian();
        expect({ faction: faction.id, capital, summon: res.ok }).toEqual({ faction: faction.id, capital, summon: true });
        await settle(() => (store.getState().currentScene?.enemies ?? []).some((e) => isCoreGuardian(e)));
        const guardian = store.getState().currentScene!.enemies.find((e) => isCoreGuardian(e))!;
        // Trap #10 — wound the SAME guardian object to a sliver, then finish it
        // through the real dice.
        useGameStore.setState({
          currentScene: {
            ...store.getState().currentScene!,
            // ⚠ OTA-1506 — the gate reads the TARGET'S OWN ring now, so the
            // fixture moves the BODY to arm's reach, not just the legacy label.
            enemies: [{ ...guardian, pos: { bearing: 0, distance: 0.5 } }], enemyHps: [1], activeEnemyIdx: 0, range: 'close',
            enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
            enemyArmorShred: [0], enemyCorruptionStacks: [0], enemiesAtBase: false,
          },
        });
        for (let round = 0; round < 8 && !mq().coresRecovered.includes(capital); round++) {
          await store.getState().submitPlayerAction('attack');
          drainRolls();
          await new Promise((r) => setTimeout(r, 120));
          drainRolls();
        }
        await settle(() => mq().coresRecovered.includes(capital));
        expect({ faction: faction.id, capital, core: mq().coresRecovered.includes(capital) })
          .toEqual({ faction: faction.id, capital, core: true });
        // The Core is a real ITEM in the pack, not just a counter.
        expect(store.getState().player!.inventory.some((i) => i.name === CORE_NAMES[capital])).toBe(true);
      }

      // ⚠ OTA-1471 — and the settle gate really did bite on this walk. Without
      // this line the block above is free to become a silent no-op the day the
      // walk's clock changes, and nine green rows would say the rule is covered
      // when nothing had exercised it.
      expect({ faction: faction.id, seatsThatMadeHimWait: seatsThatMadeHimWait > 0 })
        .toEqual({ faction: faction.id, seatsThatMadeHimWait: true });

      // Nine Cores → the Stair opens.
      expect(mq().coresRecovered.length).toBe(9);
      expect(mq().phase).toBe('descent');

      // STAY runs earn the fourth door BEFORE the Nexus, so the walk-up names it.
      if (ending === 'stay') seedKin();

      // ── The Nexus ──
      store.getState().travelTo('mud_flood_nexus');
      await settle(() => mq().phase === 'choice');
      expect(mq().phase).toBe('choice');
      const log = () => store.getState().gameLog.map((e) => e.text).join('\n');
      // The slot-beat cinematic and the Reckoning both played.
      expect(log()).toMatch(/it tells you what you have done/);
      if (ending === 'stay') {
        expect(canStayAtTheNexus(store.getState().player, store.getState().worldMemory)).toBe(true);
        expect(log()).toMatch(/Four actions remain/);
      } else {
        expect(log()).toMatch(/actions remain/);
      }

      // ── The door ──
      store.getState().chooseEndingMainQuest(ending);
      await settle(() => mq().phase === 'ended');
      expect({ faction: faction.id, ending: mq().ending }).toEqual({ faction: faction.id, ending });
    });
  }
});
