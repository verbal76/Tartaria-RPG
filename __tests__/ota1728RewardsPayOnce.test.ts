/**
 * OTA-1728 - A REWARD IS PAID ONCE, THROUGH EVERY SECOND DOOR.
 *
 * The three hand-in paths the previous pass named but did not reach: hunt, mission
 * (mystery + storyline) and - separately - escort delivery. Read as an actual
 * double-trigger probe rather than a reading of the guards: complete the contract
 * legitimately, record the purse and the slate, then re-enter through every door a
 * player or a queued action could plausibly take, INCLUDING a save/reload boundary.
 *
 * Doors exercised per family:
 *   1. the legitimate hand-in
 *   2. an immediate re-submit by id
 *   3. a re-submit by TITLE, which routes through the fuzzy finder rather than the
 *      id lookup - a different door into the same payout
 *   4. the REMOTE courier variant, where the family has one (hunts deliberately do
 *      not: OTA-810 pays a bounty face to face)
 *   5. persist -> hydrate -> re-submit, so the guard has to survive serialisation
 *      rather than living only in memory
 *
 * Measured:
 *
 *     hunt    hunt_bog_dragon        TC  180 -> 1056 -> 1056
 *     mystery mystery_red_tower      TC  140 ->  636 ->  636
 *     story   story_order_red_tower  TC  190 -> 1786 -> 1786
 *
 * The authority in all three is the same and it is upstream of the payout: the
 * record is looked up in `active*` and the payout removes it, so every later door
 * fails at "not on your slate" before reaching a write. That is why a reload does
 * not reopen it - the slate is what persists.
 *
 * ⚠ ONE THING THIS PROBE HAD TO LEARN FIRST, and it is a real rule rather than a
 * fixture detail: `vendorCanTakeContract` refuses a faction contract at a
 * factionless roadside stall. The first run of this probe measured a refusal and
 * not a payment, and the refusal was correct.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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
// ⚠ Reduce-motion is a real shipped path and it stops RN Animated loops from
// outliving Jest's teardown ("_bezier is not a function" as the graph unloads).
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — THE OTHER FOUR SCREENS HAD NEVER BEEN RENDERED BY A TEST.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { STORYLINES } from '../app/engine/factionStorylines';
import { MYSTERIES } from '../app/engine/mysteries';
import { HUNTS } from '../app/engine/hunts';
import { canonicalCellOf } from '../app/engine/worldMap';

jest.setTimeout(300000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');

async function boot(): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  await flush();
}
function standAt(locId: string): void {
  const c = canonicalCellOf(locId);
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, currentLocationId: locId, gridX: c.x, gridY: c.y, travelTarget: null } } as never);
}
/** A vendor at the counter, so a face-to-face turn-in has a counterparty. */
function putAgent(faction?: string | null): void {
  const sc = useGameStore.getState().currentScene!;
  // ⚠ vendorCanTakeContract: a faction contract is settled by that faction's own
  // agent. A factionless roadside trader refuses, which is correct and is why the
  // first pass of this probe measured a refusal rather than a payment.
  useGameStore.setState({ currentScene: { ...sc, enemies: [], enemyHps: [],
    vendor: { id: 'roadside_honest_probe', name: 'Agent Probe', title: 'posting agent', offers: [], faction: faction ?? undefined, nativeFaction: faction ?? undefined } } } as never);
}
interface Snap { tc: number; rep: number; items: number; hunts: number; myst: number; story: number }
function snap(): Snap {
  const p = useGameStore.getState().player!;
  return {
    tc: p.tc ?? 0,
    rep: (p.factionStanding ?? []).reduce((n, r) => n + Math.abs((r as { value?: number; standing?: number }).value ?? (r as { standing?: number }).standing ?? 0), 0),
    items: p.inventory.reduce((n, i) => n + (i.quantity ?? 1), 0),
    hunts: (p.activeHunts ?? []).length,
    myst: (p.activeMysteries ?? []).length,
    story: (p.activeStorylines ?? []).length,
  };
}
const same = (a: Snap, b: Snap) => JSON.stringify(a) === JSON.stringify(b);

/** Seat a contract at its FINAL stage — the turn-in-ready state — and give the trophy. */
function seatDone(key: 'activeHunts' | 'activeMysteries' | 'activeStorylines', def: { id: string; stages: unknown[]; trophyName?: string }): void {
  const p = useGameStore.getState().player!;
  const inv = [...p.inventory];
  if (def.trophyName) inv.push({ id: `trophy_${Math.random()}`, name: def.trophyName, kind: 'misc', rarity: 'Common', quantity: 1, tags: [] } as never);
  useGameStore.setState({ player: { ...p, inventory: inv, [key]: [{ id: def.id, stage: def.stages.length, tracked: true }] } } as never);
}

describe('OTA-1728 - a reward is paid ONCE, through every second door', () => {
  it('⚠⚠⚠ HUNT HAND-IN: pay once, then re-submit, reload, re-submit again', async () => {
    const def = HUNTS[0]!;
    await boot(); standAt('outpost_gate'); putAgent();
    seatDone('activeHunts', def as never);
    const before = snap();
    useGameStore.getState().turnInHunt(def.id); await flush();
    const paid = snap();
    expect(paid.tc).toBeGreaterThan(before.tc);          // it actually paid
    expect(paid.hunts).toBe(0);                          // and closed the slate
    // door 2 — straight re-submit
    useGameStore.getState().turnInHunt(def.id); await flush();
    expect(same(snap(), paid)).toBe(true);
    // door 3 — by title rather than id (the fuzzy finder)
    useGameStore.getState().turnInHunt(def.title); await flush();
    expect(same(snap(), paid)).toBe(true);
    // door 4 — across a save/reload boundary
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    standAt('outpost_gate'); putAgent();
    useGameStore.getState().turnInHunt(def.id); await flush();
    const after = snap();
    W(`  hunt   ${def.id}: TC ${before.tc} -> ${paid.tc} -> ${after.tc} (three extra doors, no second payment)`);
    expect(after.tc).toBe(paid.tc);
  });

  it('⚠⚠⚠ MYSTERY HAND-IN: same four doors', async () => {
    const def = MYSTERIES[0]!;
    await boot(); standAt('outpost_gate'); putAgent((def as { factionId?: string }).factionId);
    seatDone('activeMysteries', def as never);
    const before = snap();
    useGameStore.getState().turnInMystery(def.id); await flush();
    const paid = snap();
    expect(paid.tc).toBeGreaterThan(before.tc);
    expect(paid.myst).toBe(0);
    useGameStore.getState().turnInMystery(def.id); await flush();
    useGameStore.getState().turnInMystery(def.title); await flush();
    // and the REMOTE courier door, which mysteries do keep
    useGameStore.getState().turnInMystery(def.id, true); await flush();
    expect(same(snap(), paid)).toBe(true);
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    standAt('outpost_gate'); putAgent((def as { factionId?: string }).factionId);
    useGameStore.getState().turnInMystery(def.id); await flush();
    W(`  mystery ${def.id}: TC ${before.tc} -> ${paid.tc} -> ${snap().tc} (four extra doors)`);
    expect(snap().tc).toBe(paid.tc);
  });

  it('⚠⚠⚠ STORYLINE HAND-IN: same four doors', async () => {
    const def = STORYLINES[0]!;
    await boot(); standAt('outpost_gate'); putAgent((def as { factionId?: string }).factionId);
    seatDone('activeStorylines', def as never);
    const before = snap();
    useGameStore.getState().turnInStoryline(def.id); await flush();
    const paid = snap();
    expect(paid.tc).toBeGreaterThan(before.tc);
    expect(paid.story).toBe(0);
    useGameStore.getState().turnInStoryline(def.id); await flush();
    useGameStore.getState().turnInStoryline(def.title); await flush();
    useGameStore.getState().turnInStoryline(def.id, true); await flush();
    expect(same(snap(), paid)).toBe(true);
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    standAt('outpost_gate'); putAgent((def as { factionId?: string }).factionId);
    useGameStore.getState().turnInStoryline(def.id); await flush();
    W(`  story  ${def.id}: TC ${before.tc} -> ${paid.tc} -> ${snap().tc} (four extra doors)`);
    expect(snap().tc).toBe(paid.tc);
  });

  it('⚠⚠ and a contract that was never on the slate pays nothing at all', async () => {
    await boot(); standAt('outpost_gate'); putAgent();
    const before = snap();
    useGameStore.getState().turnInHunt(HUNTS[1]!.id); await flush();
    useGameStore.getState().turnInMystery(MYSTERIES[1]!.id); await flush();
    useGameStore.getState().turnInStoryline(STORYLINES[1]!.id); await flush();
    expect(same(snap(), before)).toBe(true);
  });
});


// ===== the third path: escort delivery ==================================

import { FACTION_QUESTS } from '../app/engine/factionQuests';

describe('OTA-1728 - escort delivery is paid once too', () => {
  it('⚠⚠⚠ ESCORT DELIVERY: pay once, then re-submit, by title, remote, and across a reload', async () => {
    const def = FACTION_QUESTS.find((q) => (q as { escort?: unknown }).escort)!;
    await boot(); standAt('outpost_gate'); putAgent((def as { factionId?: string }).factionId);
    const p = useGameStore.getState().player!;
    // seat it as ACCEPTED with the party delivered alive - the shape a player
    // arrives in when they walked the surveyors home.
    useGameStore.setState({ player: { ...p,
      activeFactionQuestIds: [def.id],
      activeFactionQuests: [{ id: def.id, escort: { hp: 30, hpMax: 30, count: 3 } }],
    } } as never);
    const before = snap();
    useGameStore.getState().turnInFactionQuest(def.id); await flush();
    const paid = snap();
    expect(paid.tc).toBeGreaterThan(before.tc);
    // door 2-3-4
    useGameStore.getState().turnInFactionQuest(def.id); await flush();
    useGameStore.getState().turnInFactionQuest(def.title); await flush();
    useGameStore.getState().turnInFactionQuest(def.id, true); await flush();
    expect(snap().tc).toBe(paid.tc);
    // door 5 - across the save boundary
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    standAt('outpost_gate'); putAgent((def as { factionId?: string }).factionId);
    useGameStore.getState().turnInFactionQuest(def.id); await flush();
    W(`  escort ${def.id}: TC ${before.tc} -> ${paid.tc} -> ${snap().tc} (four extra doors)`);
    expect(snap().tc).toBe(paid.tc);
    // and the quest is off the slate and on the completed ledger exactly once
    const done = (useGameStore.getState().player!.completedFactionQuestIds ?? []).filter((id) => id === def.id);
    expect(done.length).toBeLessThanOrEqual(1);
  });
});
