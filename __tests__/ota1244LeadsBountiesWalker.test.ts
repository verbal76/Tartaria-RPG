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

// ⚠⚠ OTA-1244 — TEXAS RANGER RIDES THE LAST TWO FAMILIES: LEADS + BOUNTIES.
//
// LEADS have no fixed catalog — they are GENERATED — so the walker loops the
// AUTHORING POOL instead: one lead per objectives.json verb (all 18), seeded at
// its own pinned site, completed through the LEAD_VERB_TRIGGERS door for that
// verb. Wrong intent refused first, payment and the "Lead resolved" line
// required. A new objective verb added without a trigger entry already fails
// the ota1237 audit; this walker additionally proves the trigger DOOR WORKS
// LIVE for every verb, and walks the kill-door (onKillAtSite) once.
//
// BOUNTIES are kill-driven, not stage-driven: accept → the politics freeze
// stamps → arrival on the contract's ground seeds the quarry (OTA-1189
// one-shot) → each quarry kill ticks progress → the final kill PAYS ON THE
// SPOT (no separate turn-in). The walk asserts every link, including the
// negative: a kill of the WRONG faction ticks nothing.
//
// ⚠⚠ HARNESS TRAPS: see the ota1242HuntWalker header — all five apply here
// verbatim. READ THEM before editing this file.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import objectivesData from '../app/data/quests/objectives.json';
import { LEAD_VERB_TRIGGERS } from '../app/engine/questGenerator';
import { startingLocationForFaction } from '../app/engine/character';
import { canonicalCellOf } from '../app/engine/worldMap';
import { QUARRY_GROUPS } from '../app/engine/quarrySeed';

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

function clearScene() {
  const scene = store.getState().currentScene!;
  useGameStore.setState({
    currentScene: { ...scene, enemies: [], enemyHps: [], hooks: [], range: null },
  });
}

const PHRASE_FOR_INTENT: Record<string, string> = {
  investigate: 'investigate the area',
  diplomacy: 'negotiate',
  cast: 'cast stone shaping',
  attack: 'attack',
};

function seedLead(verb: string, target: string) {
  const p = store.getState().player!;
  const lead = {
    id: `lead_walk_${verb.toLowerCase()}`,
    objective: { verb, target, tags: [] },
    complication: { text: 'the silt is unstable', tags: [] },
    location: { id: p.currentLocationId, name: 'Walk Site', danger: 2, description: '', tags: [], discoverable: true },
    reward: { type: 'currency', amount: 40, label: '40 TC', tags: [] },
    state: 'open',
    tracked: true,
  };
  useGameStore.setState({
    player: { ...p, activeQuests: [lead as unknown as NonNullable<typeof p.activeQuests>[number]] },
  });
}

function seedQuarryEnemy(name: string, factionId: string) {
  useGameStore.setState({
    currentScene: {
      ...store.getState().currentScene!,
      enemies: [{ name, hp: 1, hpMax: 1, ac: 5, attack: 1, damage: '1d4', traits: [], loot: [], rarity: 'Common', factionId } as never],
      enemyHps: [1], activeEnemyIdx: 0, range: 'close',
      enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      enemyArmorShred: [0], enemyCorruptionStacks: [0], hooks: [],
    },
  });
}

async function killCurrentEnemy() {
  for (let round = 0; round < 6 && (store.getState().currentScene?.enemies.length ?? 0) > 0; round++) {
    await store.getState().submitPlayerAction('attack');
    drainRolls();
    await new Promise((r) => setTimeout(r, 120));
    drainRolls();
  }
}

describe('OTA-1244 — Texas Ranger on leads and bounties', () => {
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
    // Strong, isolated: no boot-granted contracts muddying the walks.
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        hp: 500, hpMax: 500, stamina: 200, staminaMax: 200,
        hubRoomId: null,
        stats: { ...p.stats, strength: 20, dexterity: 20 },
        activeHunts: [], activeMysteries: [], activeStorylines: [], activeQuests: [],
      },
    });
  });

  // ⚠⚠ LEADS — one per authored objective verb, completed through its own door.
  for (const obj of objectivesData as Array<{ verb: string; target: string }>) {
    it(`⚠⚠ lead "${obj.verb} ${obj.target}" — wrong intent holds, its own intent completes and pays`, async () => {
      const trigger = LEAD_VERB_TRIGGERS[obj.verb.toLowerCase()];
      expect(trigger).toBeTruthy();
      const payIntent = trigger!.intents?.[0];
      expect(payIntent).toBeTruthy(); // every authored verb has an intent door today

      seedLead(obj.verb, obj.target);
      clearScene();

      // Wrong intent first: an intent NOT in this verb's trigger list.
      const wrongIntent = (trigger!.intents ?? []).includes('investigate') ? 'diplomacy' : 'investigate';
      if (!(trigger!.intents ?? []).includes(wrongIntent)) {
        await store.getState().submitPlayerAction(PHRASE_FOR_INTENT[wrongIntent]!);
        await new Promise((r) => setTimeout(r, 250));
        drainRolls();
        expect({ verb: obj.verb, after: 'wrong intent', state: store.getState().player!.activeQuests?.[0]?.state })
          .toEqual({ verb: obj.verb, after: 'wrong intent', state: 'open' });
      }

      const tcBefore = store.getState().player!.tc;
      clearScene();
      await store.getState().submitPlayerAction(PHRASE_FOR_INTENT[payIntent!]!);
      drainRolls();
      await settle(() => store.getState().player!.activeQuests?.[0]?.state === 'completed');
      drainRolls();
      expect({ verb: obj.verb, state: store.getState().player!.activeQuests?.[0]?.state })
        .toEqual({ verb: obj.verb, state: 'completed' });
      expect(store.getState().player!.tc).toBe(tcBefore + 40);
      const log = store.getState().gameLog.map((e) => e.text).join('\n');
      expect(log).toContain(`Lead resolved: ${obj.verb} ${obj.target}`);
    });
  }

  it('⚠⚠ the kill door: a violence-shape lead also completes on an enemy defeated AT the site', async () => {
    seedLead('Silence', 'an inconvenient witness');
    const tcBefore = store.getState().player!.tc;
    seedQuarryEnemy('Hired Witness-Keeper', 'forgotten_order');
    await killCurrentEnemy();
    await settle(() => store.getState().player!.activeQuests?.[0]?.state === 'completed');
    expect(store.getState().player!.activeQuests?.[0]?.state).toBe('completed');
    expect(store.getState().player!.tc).toBeGreaterThanOrEqual(tcBefore + 40);
  });

  // ⚠⚠ BOUNTIES — accept → politics freeze → quarry seeded on arrival →
  // wrong-faction kill ticks nothing → quarry kills tick → final kill pays.
  it('⚠⚠ bounty: the full chain, accept to on-the-spot payout', async () => {
    const giver = 'mud_monarchs';
    const target = 'eternal_dynasty';
    const targetLocationId = startingLocationForFaction(target);
    expect(targetLocationId).toBeTruthy();

    // Clean slate, standing where the contract will point.
    const p0 = store.getState().player!;
    useGameStore.setState({ player: { ...p0, activeQuests: [], activeBounties: [] } });
    // ⚠ OTA-1188 — accepting REQUIRES the politics board frozen first (the
    // snapshot is what the payout is signed under). The real flow: freeze,
    // then accept — and the accept releases the freeze.
    store.getState().toggleBoardFreeze();
    expect(store.getState().frozenBoard).toBeTruthy();
    store.getState().acceptBounty({
      giverFactionId: giver, giverName: 'the Mud Monarchs',
      targetFactionId: target, targetName: 'Dynasty Blades',
      targetLocationId: targetLocationId!, targetLocationName: 'the Dynasty outpost',
      count: 2, progress: 0, rewardTc: 100, rewardRep: 3,
    } as never);
    const accepted = store.getState().player!.activeBounties?.[0];
    expect(accepted?.progress).toBe(0);
    expect(accepted?.deadlineHours).toBeGreaterThanOrEqual(24); // OTA-863 distance-aware stamp
    expect(accepted?.politics).toBeTruthy(); // OTA-1188 freeze

    // Walk onto the contract's ground and take any action → quarry seeds (OTA-1189).
    const cell = canonicalCellOf(targetLocationId!);
    useGameStore.setState({
      player: { ...store.getState().player!, currentLocationId: targetLocationId!, hubRoomId: null, gridX: cell.x, gridY: cell.y },
    });
    clearScene();
    await store.getState().submitPlayerAction('investigate the area');
    drainRolls();
    await settle(() => store.getState().player!.activeBounties?.[0]?.quarrySeeded === true);
    expect(store.getState().player!.activeBounties?.[0]?.quarrySeeded).toBe(true);
    // ⚠ Assert the QUARRY ENTRIES, not the table total — the war simulation
    // churns ordinary patrols every tick (a run of this walk saw +3 quarry and
    // −3 war losses net to zero). The contract's guarantee is that its own
    // flagged groups exist and survive the maintenance cull (OTA-1244 exempts
    // them — before that, the tick deleted them within the hour).
    const patrols = store.getState().worldMemory.patrols ?? [];
    const quarry = patrols.filter((pt) => (pt as { quarry?: boolean }).quarry);
    expect(quarry.length).toBe(QUARRY_GROUPS);
    expect(quarry.every((pt) => pt.factionId === target)).toBe(true);

    // Negative: a kill of the WRONG faction ticks nothing.
    seedQuarryEnemy('Passing Reclaimer', 'reclaimers_guild');
    await killCurrentEnemy();
    await new Promise((r) => setTimeout(r, 250));
    expect(store.getState().player!.activeBounties?.[0]?.progress).toBe(0);

    // Kill 1 of 2 — progress line, contract still open.
    seedQuarryEnemy('Dynasty Blade', target);
    await killCurrentEnemy();
    await settle(() => store.getState().player!.activeBounties?.[0]?.progress === 1);
    expect(store.getState().player!.activeBounties?.[0]?.progress).toBe(1);
    expect(store.getState().gameLog.map((e) => e.text).join('\n')).toContain('Bounty: 1/2');

    // Kill 2 of 2 — pays on the spot, drops off the slate.
    const tcBefore = store.getState().player!.tc;
    seedQuarryEnemy('Dynasty Blade', target);
    await killCurrentEnemy();
    await settle(() => (store.getState().player!.activeBounties ?? []).length === 0);
    expect(store.getState().player!.activeBounties ?? []).toHaveLength(0);
    // >= — the final kill can also drop the enemy's own coin on top of the contract.
    expect(store.getState().player!.tc).toBeGreaterThanOrEqual(tcBefore + 100);
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toContain('Bounty complete');
  });
});
