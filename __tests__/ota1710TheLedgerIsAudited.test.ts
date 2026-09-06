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

/**
 * STEP 3c / OTA-1710 — THE FACTION LEDGER IS AUDITED, NOT WALKED.
 *
 * The contrary walker asks a NARRATIVE question, and the four roads work because
 * a hunt, a mystery and a storyline are the same object underneath: an ordered
 * list of beats a player action closes.
 *
 * A faction quest mostly is not that object. Measured across the 65 authored
 * contracts: escort 29 (45%) · fetch 18 (28%) · staged 17 (26%) · staged+tc 1.
 * Only the staged quarter has beats. The rest keep a LEDGER — a count of items
 * in the pack, a party that has to arrive alive, a purse that has to hold a
 * number — and a ledger cannot be walked, only audited: put it in a state the
 * author did not picture, then ask whether the books still balance and whether
 * the game SAID SO.
 *
 * ⚠⚠ WHAT THE AUDIT FOUND. Mostly good news, which is worth saying plainly: the
 * fetch counter is re-read live at turn-in, consumes exactly the requirement and
 * not the whole stack, survives abandon-and-re-accept, and every refusal on the
 * family already names its number ("needs 3× Scrap Metal — you've brought 0").
 * That is the habit this codebase learned from OTA-1349 and it is being kept.
 *
 * ⚠⚠⚠ ONE HOLE, AND IT WAS A REAL ONE. `tcThreshold` — the wealth gate OTA-1594
 * added to "Run the haul" (*"Reach 100 TC, then complete the quest"*) — was
 * enforced on the STAGE-ADVANCE path and nowhere else. So the rule it actually
 * enforced was "you held 100 TC at the moment of one particular action". The
 * probe below is the measurement, and there is no cheat in it: earn 500 TC,
 * close both stages by travelling, spend down to 3 TC, hand it in. Before this
 * OTA that completed and paid +100.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { FACTION_QUESTS, factionQuestReady } from '../app/engine/factionQuests';
import {
  bootWithAgent, holdItems, countHeld, isActive, isComplete, trackedFlag,
  feedMark, feedSince, feedSees, saidWithNumber, questsOfShape, shapeOf,
} from '../test-utils/factionProbes';
import type { PlayerCharacter } from '../app/engine/types';

jest.setTimeout(180_000);
const store = useGameStore;
const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** Stand the agent back in front of the player. Travel walks away from whoever
 *  handed the contract over, and a refusal about the ROOM is not a refusal about
 *  the ledger — an earlier draft of this probe measured exactly that mistake. */
function agentInScene(factionId: string): void {
  const agent = { id: 'v_probe_agent', name: 'Sallow Vek', title: 'agent', faction: factionId, description: 'an agent', offers: [] };
  store.setState((s) => ({
    currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], vendor: agent } as never,
  }));
}

const setPurse = (tc: number): void => {
  store.setState((s) => ({ player: { ...s.player!, tc } as PlayerCharacter }));
};

describe('STEP 3c — the instrument reads the feed before it grades anything', () => {
  it('⚠⚠⚠ the probe can SEE — every grade below is worthless otherwise', async () => {
    // The first draft of this harness read `store.log` / `entry.type`. The store's
    // feed is `gameLog` / `channel`, so it got `undefined ?? []` every time and
    // reported EVERY refusal in the family as silent. I was one step from filing
    // a defect against the game for a bug in the instrument. A probe that grades
    // "did it say so" must prove it can hear the answer.
    await bootWithAgent('reclaimers_guild');
    expect(feedSees()).toBe(true);
  });

  it('the catalog is the four shapes this audit claims, in the proportions it claims', () => {
    const counts = { fetch: 0, escort: 0, staged: 0, tc: 0 };
    for (const q of FACTION_QUESTS) counts[shapeOf(q)] += 1;
    expect(FACTION_QUESTS.length).toBe(65);
    expect(counts).toEqual({ escort: 29, fetch: 18, staged: 17, tc: 1 });
  });
});

describe('STEP 3c — the fetch counter, audited', () => {
  const def = questsOfShape('fetch')[0]!;
  const need = def.fetch!;

  beforeEach(async () => {
    await bootWithAgent(def.factionId);
    store.getState().acceptFactionQuest(def.title);
    expect(isActive(def.id)).toBe(true);
  });

  it('⚠⚠ refuses an empty hand-in AND SAYS THE COUNT', async () => {
    const m = feedMark();
    store.getState().turnInFactionQuest(def.title);
    const saw = feedSince(m);
    expect(isComplete(def.id)).toBe(false);
    // Not merely refused — refused with the number in it. A silent refusal on a
    // counter the player cannot see reads as the button being broken.
    expect(saidWithNumber(saw, need.quantity)).toBe('yes');
    expect(saw.join(' ').toLowerCase()).toContain(need.itemName.toLowerCase());
  });

  it('⚠⚠ refuses one short, and says how many are actually in hand', async () => {
    holdItems(need.itemName, need.quantity - 1);
    const m = feedMark();
    store.getState().turnInFactionQuest(def.title);
    expect(isComplete(def.id)).toBe(false);
    expect(feedSince(m).join(' ')).toContain(String(need.quantity - 1));
  });

  it('⚠⚠⚠ takes EXACTLY the requirement out of a bigger stack', async () => {
    // The greedy-consume defect this family could have had: a contract that
    // wants 3 must not empty a stack of 6.
    holdItems(need.itemName, need.quantity + 3);
    store.getState().turnInFactionQuest(def.title);
    expect({ done: isComplete(def.id), left: countHeld(need.itemName) })
      .toEqual({ done: true, left: 3 });
  });

  it('⚠⚠ the count is re-read at the hand-in, not cached when the items were gathered', async () => {
    holdItems(need.itemName, need.quantity);      // ready…
    holdItems(need.itemName, need.quantity - 1);  // …then sold one on the way
    const m = feedMark();
    store.getState().turnInFactionQuest(def.title);
    expect(isComplete(def.id)).toBe(false);
    expect(feedSince(m).length).toBeGreaterThan(0);
  });

  it('abandoning mid-count keeps the items — they are real things in a real pack', async () => {
    holdItems(need.itemName, need.quantity);
    store.getState().abandonContract('faction_quest', def.id);
    expect({ active: isActive(def.id), held: countHeld(need.itemName) })
      .toEqual({ active: false, held: need.quantity });
    // And re-accepting credits what is already in hand rather than restarting
    // the gathering — the counter was never a counter, it is the pack.
    store.getState().acceptFactionQuest(def.title);
    store.getState().turnInFactionQuest(def.title);
    expect(isComplete(def.id)).toBe(true);
  });
});

describe('STEP 3c — the staged shape, audited', () => {
  it('⚠⚠ refuses before the last beat and names the step you are on', async () => {
    const def = questsOfShape('staged').find((q) => (q.stages?.length ?? 0) >= 3)!;
    await bootWithAgent(def.factionId);
    store.getState().acceptFactionQuest(def.title);
    const m = feedMark();
    store.getState().turnInFactionQuest(def.title);
    const saw = feedSince(m).join(' ');
    expect(isComplete(def.id)).toBe(false);
    expect(saw).toContain(`of ${def.stages!.length}`);
  });
});

describe('STEP 3c — ⚠⚠⚠ the wealth gate, which was the hole', () => {
  const def = FACTION_QUESTS.find((q) => q.tcThreshold)!;

  it('the probe walks a plain player path — earn, finish, spend, hand in', async () => {
    await bootWithAgent(def.factionId);
    store.getState().acceptFactionQuest(def.title);
    setPurse(500);   // earned, honestly

    // Close every stage through the REAL advance path. Both of this contract's
    // stages are `advanceOn: 'any'`, and travel is the cheapest 'any' there is.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const LOCATIONS = require('../app/data/locations/locations.json') as { id: string }[];
    const stageNow = (): number =>
      (store.getState().player?.activeFactionQuests ?? []).find((q) => q.id === def.id)?.stage ?? 0;
    for (let i = 0; i < 8 && stageNow() < (def.stages?.length ?? 0); i++) {
      const here = store.getState().player!.currentLocationId;
      store.getState().travelTo(LOCATIONS.find((l) => l.id !== here)!.id);
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(stageNow()).toBe(def.stages!.length);

    // Then spend it, which is the ordinary thing to do with money between
    // finishing the work and finding somebody to hand it to.
    setPurse(3);
    agentInScene(def.factionId);

    const m = feedMark();
    store.getState().turnInFactionQuest(def.title);
    const saw = feedSince(m);
    // ⚠ Before OTA-1710 this completed and paid +100 TC.
    expect(isComplete(def.id)).toBe(false);
    expect(saidWithNumber(saw, def.tcThreshold!)).toBe('yes');
    expect(saw.join(' ')).toContain(String(def.tcThreshold));

    // And with the purse actually full, it closes.
    setPurse(def.tcThreshold!);
    store.getState().turnInFactionQuest(def.title);
    expect(isComplete(def.id)).toBe(true);
  });

  it('⚠⚠ the gate lives in the SHARED predicate, so every path reads one answer', () => {
    // The bug's real shape was a rule enforced in one of four places. The READY
    // pill, the route's objective→turn-in swap, the auto-submit-on-arrival sweep
    // and the turn-in itself all ask factionQuestReady now.
    const none = () => 0;
    const stages = def.stages!.length;
    expect(factionQuestReady(def, stages, none, def.tcThreshold! - 1)).toBe(false);
    expect(factionQuestReady(def, stages, none, def.tcThreshold!)).toBe(true);
    // It does not replace the stage counter — both have to hold.
    expect(factionQuestReady(def, stages - 1, none, 10_000)).toBe(false);
  });

  it('⚠ `purse` is REQUIRED on the predicate, so a caller cannot quietly re-open this', () => {
    // An optional argument with a default would let the next call site forget it
    // and restore the exact hole. A required one makes the compiler name every
    // reader — which is how the four above were found.
    const mod = src('app', 'engine', 'factionQuests.ts');
    expect(mod.includes('purse: number,')).toBe(true);
    expect(mod.includes('purse?: number')).toBe(false);
    expect(mod.includes('if (def.tcThreshold && purse < def.tcThreshold) return false;')).toBe(true);
    const ready = src('app', 'engine', 'missionReady.ts');
    expect(ready.includes('subject.countItem, subject.purse')).toBe(true);
  });

  it('⚠⚠ all four readers pass the purse — named here because gameStore has no room to say it', () => {
    // The gameStore line ratchet is at its ceiling, so the auto-submit call site
    // carries no comment of its own. It is the one that matters most for this
    // defect: walking into the faction's own hall auto-closes every READY
    // contract, so an unpursed answer there would hand the payout over behind
    // the player's back without anybody tapping anything.
    const g = src('app', 'state', 'gameStore.ts');
    expect(g.includes('factionQuestReady(def, rec.stage, countItem, player.tc ?? 0) && atFactionTurnInBuilding')).toBe(true);
    expect(g.includes('factionQuestReady(def, rec.stage, countItem, player.tc ?? 0);')).toBe(true);
    const trace = src('app', 'engine', 'missionTrace.ts');
    expect(trace.includes("purse: player.tc ?? 0")).toBe(true);
    const screen = src('app', 'screens', 'ContractsScreen.tsx');
    expect(screen.includes('purse: player?.tc ?? 0')).toBe(true);
    // And nothing still calls the 3-argument shape.
    for (const [name, body] of [['gameStore', g], ['missionTrace', trace], ['ContractsScreen', screen]] as const) {
      expect({ name, stale: /factionQuestReady\([^)]*countItem\s*\)/.test(body) }).toEqual({ name, stale: false });
    }
  });

  it('⚠ the coin is a THRESHOLD, not a price — completing does not empty the purse', async () => {
    // Nobody decided that this contract should cost 100 TC to hand in; it pays
    // 40. Reading the gate as a cost would make finishing it a net loss.
    await bootWithAgent(def.factionId);
    store.getState().acceptFactionQuest(def.title);
    store.setState((s) => ({
      player: {
        ...s.player!, tc: 200,
        activeFactionQuests: (s.player!.activeFactionQuests ?? []).map((q) =>
          q.id === def.id ? { ...q, stage: def.stages!.length } : q),
      } as PlayerCharacter,
    }));
    store.getState().turnInFactionQuest(def.title);
    expect(isComplete(def.id)).toBe(true);
    expect(store.getState().player!.tc).toBeGreaterThan(200);
  });
});

describe('STEP 3c — the shapes this audit did NOT reach, named rather than assumed', () => {
  it('SINGLE-ACTIVE: a second contract is accepted PAUSED, and the first keeps the focus', async () => {
    const a = questsOfShape('fetch')[0]!;
    const b = FACTION_QUESTS.find((q) => q.factionId === a.factionId && q.id !== a.id)!;
    await bootWithAgent(a.factionId);
    store.getState().acceptFactionQuest(a.title);
    store.getState().acceptFactionQuest(b.title);
    // Both are on the slate — a paused contract is never dropped, that is ABANDON.
    expect({ a: isActive(a.id), b: isActive(b.id) }).toEqual({ a: true, b: true });
    // ⚠ The NEW one does not steal the focus. Recorded because it is a real
    // design choice a reader would otherwise have to infer from behaviour.
    expect({ a: trackedFlag(a.id), b: trackedFlag(b.id) }).toEqual({ a: true, b: false });
  });

  it('⚠⚠ ESCORT is 45% of the family and is NOT audited here — said out loud, not left blank', () => {
    // A skip that nobody names reads as a pass. Escort's ledger is a party of
    // bodies taking collateral damage across real fights, so auditing it means
    // driving combat rather than setting a counter — a probe set of its own,
    // and the largest remaining piece of step 3c. ota962/964/966 cover the pool
    // maths and the pay split; what is missing is the out-of-order player: two
    // escorts at once, abandoning with the party alive, delivering an empty pool.
    expect(questsOfShape('escort').length).toBe(29);
  });
});
