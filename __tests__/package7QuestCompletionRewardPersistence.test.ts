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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * PACKAGE 7 — QUEST COMPLETION / REWARD / PERSISTENCE INTEGRITY.
 *
 * ⚠⚠⚠ WHAT THIS SUITE IS, AND WHY IT CARRIES NO OTA NUMBER. Package 7 asked
 * whether an authored arc that reaches its legitimate ending is recognised as
 * finished exactly once, pays every declared consequence exactly once, leaves
 * the slate cleanly, survives save/load/relaunch, and cannot restart, re-pay,
 * vanish or corrupt a neighbour. Sixteen runtime proofs later the answer is yes
 * on every count, so NOTHING WAS REPAIRED and nothing was stamped. This file is
 * the measured contract written down so it cannot drift silently. As with
 * Package 6, `check:otastamp` keys on `^ota(\d{3,4})` filenames, so an
 * un-numbered suite is correctly invisible to it and the live stamp stays where
 * the last real repair left it.
 *
 * ⚠⚠ WHERE COMPLETION ACTUALLY LIVES, because the obvious-looking answer is the
 * wrong one. `worldMemory.completedQuestIds` and `worldMemory.completeQuest()`
 * read like the ledger and are NOT: the function has zero callers anywhere in
 * `app/`, `__tests__/` or `scripts/`, the array has zero readers in `app/`, and
 * a real completion measured end to end leaves it `[]`. The authority is three
 * fields on the PLAYER — `completedHuntIds`, `completedMysteryIds`,
 * `completedStorylineIds` — written by the typed turn-ins and read by the board
 * filters, the accept doors and the Contracts UI. §F pins the dead pair as dead
 * so a future pass cannot mistake it for a second source of truth and "restore"
 * a parallel ledger the game would then have to keep in sync.
 *
 * ⚠⚠⚠ AND THE EXACTLY-ONCE GUARD IS THE REMOVAL, NOT A FLAG. A turn-in requires
 * the record to still be present in `active*`; completion filters it out in the
 * same `set`. A second press therefore finds nothing on the slate and refuses —
 * there is no separate "already paid" boolean that could disagree with the
 * slate. That makes the re-entry question sharp rather than vague: the only way
 * to pay twice is to put the record BACK, and §D proves no reachable writer can.
 *
 * ⚠⚠ THE CORPUS IT GOVERNS, recomputed rather than remembered: 50 arcs / 281
 * stages — hunt 18, mystery 18, storyline 14. Thirty-six end on a `boss` beat
 * and fourteen end on a verbless one (`checkKind: null`), all fourteen with a
 * tail of exactly one. Every arc declares `rewardTc`; 48 declare `rewardItem`,
 * 36 a `trophyName`, and 32 declare BOTH `factionId` AND `rewardRep`.
 *
 * ⚠ THAT LAST NUMBER CORRECTS AN EARLIER OBSERVATION. A prior broad audit noted
 * that authored arcs "apparently do not write faction relations". Measured, the
 * opposite holds: 32 of 50 arcs declare the consequence and every one of the
 * three turn-ins calls `applyRepChange`, so §B watches standing move by the
 * authored amount on all three families. The lead was real to chase and wrong
 * to believe.
 */

import { useGameStore } from '../app/state/gameStore';
import { HUNTS, findHuntById, availableHunts } from '../app/engine/hunts';
import { MYSTERIES, findMysteryById, availableMysteries } from '../app/engine/mysteries';
import { STORYLINES, findStorylineById, availableStorylines } from '../app/engine/factionStorylines';
import { getStanding } from '../app/engine/factions';
import { repairMissionRecords } from '../app/engine/missionRepair';
import { STORYLINE_TEXT_REWARDS } from '../app/engine/aetherTechniques';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

type Fam = 'hunt' | 'mystery' | 'storyline';

const ACTIVE = { hunt: 'activeHunts', mystery: 'activeMysteries', storyline: 'activeStorylines' } as const;
const DONE = { hunt: 'completedHuntIds', mystery: 'completedMysteryIds', storyline: 'completedStorylineIds' } as const;

/* The three representatives, one per family, each chosen because it declares the
 * FULL consequence set — coin, a reward item, a faction and a reputation delta —
 * so a single completion exercises every class at once. */
const HUNT = 'hunt_mud_titan';
const MYSTERY = 'mystery_red_tower';
const STORY = 'story_order_red_tower';
const CASES: ReadonlyArray<{ fam: Fam; id: string }> = [
  { fam: 'hunt', id: HUNT }, { fam: 'mystery', id: MYSTERY }, { fam: 'storyline', id: STORY },
];

function defOf(fam: Fam, id: string): any {
  return fam === 'hunt' ? findHuntById(id) : fam === 'mystery' ? findMysteryById(id) : findStorylineById(id);
}

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'P7', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

/**
 * Put a ready-to-hand-in record on the slate with a matching agent in the scene.
 *
 * ⚠ `hubRoomId` is cleared deliberately. OTA-1201 makes a hub room's ANCHOR
 * answer for the SITE OWNER rather than for whatever faction the vendor carries,
 * so an agent standing in the starter hub would be re-pointed and the turn-in
 * refused as wrong-counterparty — a true rule, and not the one under test here.
 */
function arm(store: typeof useGameStore, fam: Fam, id: string, startingTc = 1000) {
  const def = defOf(fam, id);
  store.setState((s) => ({
    currentScene: { ...s.currentScene!, enemies: [], vendor: { id: 'p7_agent', name: 'P7 Agent', faction: def.factionId ?? null } } as never,
    player: {
      ...s.player!,
      hubRoomId: undefined,
      tc: startingTc,
      [ACTIVE[fam]]: [
        ...((s.player as never as Record<string, Array<{ id: string }>>)[ACTIVE[fam]] ?? []).filter((r) => r.id !== id),
        { id, stage: def.stages.length, postedByFaction: def.factionId ?? null, acceptedAt: 0 },
      ],
    } as never,
  }));
  return def;
}

function snap(store: typeof useGameStore, fam: Fam, id: string, factionId: string | null) {
  const p = store.getState().player! as never as Record<string, never>;
  const inv = (p.inventory as never as Array<{ name: string }>);
  return {
    tc: p.tc as never as number,
    invCount: inv.length,
    names: inv.map((i) => i.name).sort(),
    rep: factionId ? getStanding(p.factionStanding as never, factionId) : null,
    onSlate: ((p[ACTIVE[fam]] ?? []) as never as Array<{ id: string }>).some((r) => r.id === id),
    done: ((p[DONE[fam]] ?? []) as never as string[]).filter((x) => x === id).length,
  };
}

function turnIn(store: typeof useGameStore, fam: Fam, id: string) {
  if (fam === 'hunt') store.getState().turnInHunt(id);
  else if (fam === 'mystery') store.getState().turnInMystery(id);
  else store.getState().turnInStoryline(id);
}

const ALL: ReadonlyArray<{ fam: Fam; def: { id: string; stages: ReadonlyArray<{ checkKind: string | null }> } }> = [
  ...MYSTERIES.map((d) => ({ fam: 'mystery' as Fam, def: d as never })),
  ...STORYLINES.map((d) => ({ fam: 'storyline' as Fam, def: d as never })),
  ...HUNTS.map((d) => ({ fam: 'hunt' as Fam, def: d as never })),
];

// ─────────────────────────────────────────────────────────────────────────────

describe('Package 7 §A — the authored ending corpus', () => {
  it('⚠⚠ 50 arcs across three families; 14 of them end on a verbless beat, each with a tail of one', () => {
    expect(ALL.length).toBe(50);
    expect(HUNTS.length).toBe(18);
    expect(MYSTERIES.length).toBe(18);
    expect(STORYLINES.length).toBe(14);
    const tails = ALL.filter(({ def }) => def.stages[def.stages.length - 1]!.checkKind === null);
    expect(tails.length).toBe(14);
    // Every verbless ending is exactly ONE beat long. A longer tail would mean
    // the auto-consume loops (OTA-871 / OTA-1219) had to walk further than the
    // single step §C measures, so the claim is pinned rather than assumed.
    for (const { def } of tails) {
      let n = 0;
      for (let i = def.stages.length - 1; i >= 0 && def.stages[i]!.checkKind === null; i--) n++;
      expect(n).toBe(1);
    }
    // No arc is ALL epilogue — every one has a beat a verb can pay.
    for (const { def } of ALL) expect(def.stages.some((s) => s.checkKind !== null)).toBe(true);
  });

  it('⚠⚠ every arc declares coin, and 32 declare BOTH a faction and a reputation delta', () => {
    const defs = ALL.map(({ def }) => def as never as { rewardTc?: number; rewardItem?: string; trophyName?: string; factionId?: string | null; rewardRep?: number });
    expect(defs.every((d) => typeof d.rewardTc === 'number' && d.rewardTc > 0)).toBe(true);
    expect(defs.filter((d) => !!d.rewardItem).length).toBe(48);
    expect(defs.filter((d) => !!d.trophyName).length).toBe(36);
    // ⚠ THE CORRECTED LEAD. A declared consequence with no reachable writer would
    // be a defect; §B proves the writer runs. This pins that the declarations are
    // there to be written in the first place.
    expect(defs.filter((d) => !!d.factionId && !!d.rewardRep).length).toBe(32);
    // Each representative carries the full set, which is why one run covers every class.
    for (const { fam, id } of CASES) {
      const d = defOf(fam, id);
      expect(d.rewardTc).toBeGreaterThan(0);
      expect(d.rewardItem).toBeTruthy();
      expect(d.factionId).toBeTruthy();
      expect(d.rewardRep).toBeGreaterThan(0);
    }
  });
});

describe('Package 7 §B — the arc ends, and every declared consequence lands once', () => {
  it.each(CASES.map((c) => [c.fam, c.id] as const))(
    '⚠⚠⚠ a finished %s pays coin, goods and standing, leaves the slate and is recorded exactly once',
    async (fam, id) => {
      const store = await boot();
      const def = arm(store, fam, id);
      const before = snap(store, fam, id, def.factionId);
      expect(before.onSlate).toBe(true);
      expect(before.done).toBe(0);

      turnIn(store, fam, id);
      const after = snap(store, fam, id, def.factionId);

      // Coin: at LEAST the authored rate. B2/OTA-824's long-haul bonus scales with
      // how far the hand-in tile sits from the starter hub, so the floor is the
      // honest assertion and the exact total is the journey's business.
      expect(after.tc).toBeGreaterThanOrEqual(before.tc + def.rewardTc);
      // Goods: the authored reward item, plus the trophy when the arc declares one.
      const gained = after.names.filter((n) => !before.names.includes(n));
      expect(gained).toContain(def.rewardItem);
      if (def.trophyName) expect(gained).toContain(def.trophyName);
      // Standing: the authored delta, on the authored faction.
      expect(after.rep).toBe((before.rep ?? 0) + def.rewardRep);
      // The slate transitions — off `active*`, onto `completed*`, exactly once.
      expect(after.onSlate).toBe(false);
      expect(after.done).toBe(1);
    },
  );

  it('⚠⚠⚠ the second press pays nothing — through the typed door AND the Contracts UI', async () => {
    for (const { fam, id } of CASES) {
      const store = await boot();
      const def = arm(store, fam, id);
      turnIn(store, fam, id);
      const paid = snap(store, fam, id, def.factionId);

      turnIn(store, fam, id);                       // the typed turn-in again
      store.getState().completeContractFromUI(fam, id); // and the Contracts-UI door
      const after = snap(store, fam, id, def.factionId);

      expect(after.tc).toBe(paid.tc);
      expect(after.invCount).toBe(paid.invCount);
      expect(after.rep).toBe(paid.rep);
      expect(after.done).toBe(1);
      expect(after.onSlate).toBe(false);
    }
  });

  it('⚠⚠ the four PROCEDURE-TEXT storylines hand over the text ALONGSIDE the reward, once', async () => {
    // OTA-1203 route C: these four grant the faction's written procedure IN
    // ADDITION to the authored reward item. An extra grant on the completion path
    // is exactly the kind of consequence a "pays once" claim can quietly miss, so
    // it gets its own measurement rather than riding on the generic one.
    const ids = Object.keys(STORYLINE_TEXT_REWARDS);
    expect(ids.length).toBe(4);
    for (const id of ids) {
      const store = await boot();
      const def = arm(store, 'storyline', id);
      const before = snap(store, 'storyline', id, def.factionId);
      turnIn(store, 'storyline', id);
      const once = snap(store, 'storyline', id, def.factionId);

      const gained = once.names.filter((n) => !before.names.includes(n));
      expect(gained).toContain(def.rewardItem);
      expect(gained.some((n) => n.startsWith('Procedure Text:'))).toBe(true);

      turnIn(store, 'storyline', id);
      const twice = snap(store, 'storyline', id, def.factionId);
      expect(twice.names).toEqual(once.names);
      expect(twice.tc).toBe(once.tc);
      expect(twice.done).toBe(1);
    }
  });

  it('⚠⚠ the record is the proof, not the pack — an empty pack still closes a finished arc', async () => {
    // ⚠ MEASURED, AND DELIBERATE. The turn-ins gate on `record.stage >=
    // stages.length` and never re-read the inventory, and the trophy is MINTED at
    // hand-in rather than surrendered from the pack — `mystery_red_tower` grants a
    // "Fragment of the Red Tower" whose name matches its own final `requires`.
    // So an arc walked to its end and then stripped bare still pays. The gate that
    // matters ran at the last stage (Package 6's `stageRequirementMet`); re-charging
    // for the artifact here would mean a player who sold a spent quest item could
    // never close an arc the game already agreed was finished.
    for (const { fam, id } of CASES) {
      const store = await boot();
      const def = arm(store, fam, id);
      store.setState((s) => ({ player: { ...s.player!, inventory: [] } as never }));
      const before = snap(store, fam, id, def.factionId);
      turnIn(store, fam, id);
      const after = snap(store, fam, id, def.factionId);
      expect(after.tc).toBeGreaterThanOrEqual(before.tc + def.rewardTc);
      expect(after.done).toBe(1);
      expect(after.onSlate).toBe(false);
    }
  });
});

describe('Package 7 §C — the verbless ending is never a stranded stage', () => {
  it('⚠⚠⚠ all 14 tail arcs heal from the epilogue beat to READY, and then close normally', async () => {
    // Two defences stand behind this, and BOTH are measured here. The advance
    // loops auto-consume a `checkKind: null` beat in passing (OTA-871 / OTA-1219),
    // so a live record never STOPS on one; and `repairMissionRecords` (OTA-1589)
    // moves any record an older build already parked there. Without either, 14 of
    // 50 arcs would be walked to their end and then be unturn-in-able forever —
    // the "stranded stage" this package exists to rule out.
    const tails = ALL.filter(({ def }) => def.stages[def.stages.length - 1]!.checkKind === null);
    expect(tails.length).toBe(14);
    for (const { fam, def } of tails) {
      const parked = { activeHunts: [], activeMysteries: [], activeStorylines: [] } as Record<string, Array<{ id: string; stage: number }>>;
      parked[ACTIVE[fam]] = [{ id: def.id, stage: def.stages.length - 1 }];
      const { player: fixed, notes } = repairMissionRecords(parked as never);
      const rec = (fixed as never as Record<string, Array<{ stage: number }>>)[ACTIVE[fam]]![0]!;
      expect(rec.stage).toBeGreaterThanOrEqual(def.stages.length); // READY
      expect(notes.length).toBe(1);                                 // and it SAID so
    }
    // And a healed tail arc hands in like any other.
    const store = await boot();
    const d = arm(store, 'mystery', 'mystery_drowned_bell_samarran');
    const b = snap(store, 'mystery', 'mystery_drowned_bell_samarran', d.factionId);
    turnIn(store, 'mystery', 'mystery_drowned_bell_samarran');
    const a = snap(store, 'mystery', 'mystery_drowned_bell_samarran', d.factionId);
    expect(a.tc).toBeGreaterThanOrEqual(b.tc + d.rewardTc);
    expect(a.done).toBe(1);
  });
});

describe('Package 7 §D — a finished arc cannot start again', () => {
  it('⚠⚠⚠ the boards drop it and the accept doors refuse it, by id as well as by name', async () => {
    const store = await boot();
    const p = store.getState().player! as never as { factionStanding: never; hpMax: number };
    for (const { fam, id } of CASES) {
      const def = defOf(fam, id);
      const fid = def.factionId;
      const rep = getStanding(p.factionStanding, fid);
      // Give the character enough standing that the posting is genuinely on offer
      // BEFORE completion — otherwise "absent afterwards" proves nothing.
      const open = Math.max(rep, def.minRep ?? 0, 0);
      const pool = (done: string[]) =>
        fam === 'hunt' ? availableHunts(fid, open, [], done, 9999).map((h) => h.id)
        : fam === 'mystery' ? availableMysteries(fid, open, [], done).map((m) => m.id)
        : availableStorylines(fid, open, [], done).map((s) => s.id);
      expect(pool([])).toContain(id);
      expect(pool([id])).not.toContain(id);
    }
    // And the live accept door, asked for the arc BY EXACT ID — the shortcut a
    // fuzzy-name refusal would not cover. All three doors resolve a direct hit
    // only when the pool still holds it (`direct && pool.includes(direct)`), so a
    // completed arc is unreachable through the id path too.
    const store2 = await boot();
    store2.setState((s) => ({
      player: { ...s.player!, completedHuntIds: [HUNT], completedMysteryIds: [MYSTERY], completedStorylineIds: [STORY], activeHunts: [], activeMysteries: [], activeStorylines: [] } as never,
    }));
    store2.getState().acceptHunt(HUNT);
    store2.getState().acceptMystery(MYSTERY);
    store2.getState().acceptStoryline(STORY);
    const back = store2.getState().player! as never as Record<string, Array<{ id: string }>>;
    expect(back.activeHunts).toHaveLength(0);
    expect(back.activeMysteries).toHaveLength(0);
    expect(back.activeStorylines).toHaveLength(0);
  });

  it('⚠⚠⚠ the no-vendor doors refuse it too, and the load-time repair pass can add nothing', async () => {
    // ⚠ THIS IS THE ONE THAT MATTERS, and it is why the exactly-once guard being a
    // REMOVAL is safe rather than fragile. Put a completed record back on the slate
    // by hand and the turn-in pays again in full — there is no second latch. So the
    // whole guarantee rests on nothing being able to put it back.
    //
    // ⚠ WHAT IS EXERCISED HERE AND WHAT IS ONLY READ. The five accept doors are
    // live-tested — the three vendor ones in the test above, the two no-vendor
    // neutral ones here, which are a genuinely different branch with their own
    // `alreadyDone` guard rather than a pool filter. `repairMissionRecords` is
    // exercised too, and it is a MAPPER: it walks records that already exist and
    // returns one per input, so it can conjure none. The sixth writer,
    // `grantQuestHook`, is module-private to gameStore and reachable only from the
    // encounter path, so it is READ, NOT RUN: both its branches open with
    // `if (active || done) return;` before any `set`. That one line is the claim
    // this test cannot cover, and saying so is better than implying it did.
    const store = await boot();
    store.setState((s) => ({
      player: { ...s.player!, completedHuntIds: [HUNT], completedMysteryIds: [MYSTERY], activeHunts: [], activeMysteries: [] } as never,
      currentScene: { ...s.currentScene!, vendor: null } as never,
    }));
    store.getState().acceptHunt(HUNT);
    store.getState().acceptMystery(MYSTERY);
    const p = store.getState().player! as never as Record<string, Array<{ id: string }>>;
    expect((p.activeHunts ?? []).some((h) => h.id === HUNT)).toBe(false);
    expect((p.activeMysteries ?? []).some((m) => m.id === MYSTERY)).toBe(false);
    // The repair pass is a mapper, not a writer: one record out per record in.
    const { player: repaired } = repairMissionRecords({ activeHunts: [], activeMysteries: [], activeStorylines: [] } as never);
    const r = repaired as never as Record<string, unknown[]>;
    expect(r.activeHunts ?? []).toHaveLength(0);
    expect(r.activeMysteries ?? []).toHaveLength(0);
    expect(r.activeStorylines ?? []).toHaveLength(0);
  });

  it('⚠⚠⚠ finishing one arc does not finish, move, pay or drop any other', async () => {
    const store = await boot();
    // Four records: the storyline being closed, a SECOND storyline of the SAME
    // faction also standing ready, a ready mystery, and a mid-arc mystery. If
    // completion leaked by family, by faction, or by "whatever is ready", one of
    // these four would move.
    const OTHER_STORY = STORYLINES.find((s) => s.factionId === findStorylineById(STORY)!.factionId && s.id !== STORY)!.id;
    arm(store, 'storyline', STORY);
    arm(store, 'storyline', OTHER_STORY);
    arm(store, 'mystery', MYSTERY);
    const mid = MYSTERIES.find((m) => m.id !== MYSTERY)!;
    store.setState((s) => ({
      player: { ...s.player!, activeMysteries: [...((s.player as never as Record<string, unknown[]>).activeMysteries ?? []), { id: mid.id, stage: 1, postedByFaction: mid.factionId ?? null, acceptedAt: 0 }] } as never,
      currentScene: { ...s.currentScene!, vendor: { id: 'p7_agent', name: 'P7 Agent', faction: findStorylineById(STORY)!.factionId } } as never,
    }));
    const read = () => {
      const p = store.getState().player! as never as Record<string, never>;
      return {
        stories: ((p.activeStorylines ?? []) as never as Array<{ id: string; stage: number }>).map((r) => `${r.id}@${r.stage}`).sort(),
        mysteries: ((p.activeMysteries ?? []) as never as Array<{ id: string; stage: number }>).map((r) => `${r.id}@${r.stage}`).sort(),
        doneM: [...((p.completedMysteryIds ?? []) as never as string[])],
        doneS: [...((p.completedStorylineIds ?? []) as never as string[])],
      };
    };
    const before = read();
    store.getState().turnInStoryline(STORY);
    const after = read();

    expect(after.doneS).toEqual([STORY]);
    // The neighbour storyline is untouched — same faction, equally ready.
    expect(after.stories).toEqual(before.stories.filter((s) => !s.startsWith(`${STORY}@`)));
    expect(after.stories.some((s) => s.startsWith(`${OTHER_STORY}@`))).toBe(true);
    // Neither mystery moved a stage, and neither was marked finished.
    expect(after.mysteries).toEqual(before.mysteries);
    expect(after.doneM).toEqual([]);
  });
});

describe('Package 7 §E — completion survives the save, and the save does not re-pay it', () => {
  it('⚠⚠⚠ a save taken BEFORE the hand-in restores an unfinished arc, and finishing it pays once', async () => {
    for (const { fam, id } of CASES) {
      const store = await boot();
      const def = arm(store, fam, id);
      await store.getState().persist();
      const slot = store.getState().activeSlotId!;
      const opening = snap(store, fam, id, def.factionId);

      turnIn(store, fam, id);
      expect(snap(store, fam, id, def.factionId).done).toBe(1);

      await store.getState().loadSlotIntoGame(slot);
      const rolled = snap(store, fam, id, def.factionId);
      // The older save is honestly older: the arc is back on the slate, unpaid.
      expect(rolled.done).toBe(0);
      expect(rolled.onSlate).toBe(true);
      expect(rolled.tc).toBe(opening.tc);
      expect(rolled.rep).toBe(opening.rep);
    }
  });

  it('⚠⚠⚠ a save taken AFTER the hand-in reloads finished — coin, goods, standing and ledger intact', async () => {
    for (const { fam, id } of CASES) {
      const store = await boot();
      const def = arm(store, fam, id);
      turnIn(store, fam, id);
      const live = snap(store, fam, id, def.factionId);
      await store.getState().persist();
      const slot = store.getState().activeSlotId!;

      await store.getState().loadSlotIntoGame(slot);
      const reloaded = snap(store, fam, id, def.factionId);
      expect(reloaded.tc).toBe(live.tc);
      expect(reloaded.invCount).toBe(live.invCount);
      expect(reloaded.rep).toBe(live.rep);
      expect(reloaded.done).toBe(1);
      expect(reloaded.onSlate).toBe(false);

      // ⚠ AND THE RELAUNCH DOES NOT RE-OPEN THE DOOR. A reconstructed state that
      // had lost the completion would show up here as a second payment.
      turnIn(store, fam, id);
      store.getState().completeContractFromUI(fam, id);
      const pressed = snap(store, fam, id, def.factionId);
      expect(pressed.tc).toBe(live.tc);
      expect(pressed.invCount).toBe(live.invCount);
      expect(pressed.done).toBe(1);
    }
  });

  it('⚠⚠ a save with the completion fields ABSENT loads cleanly and normalises to empty', async () => {
    // There is no version ladder — every save is written `version: 1` — so the
    // `?? []` block in the load path IS the migration, and this measures it. A
    // throw here, or an `undefined` reaching the board filters, would be a crash
    // class on the oldest saves. It normalises; nothing reconstructs completion
    // from elsewhere, because §F shows there IS no elsewhere.
    const store = await boot();
    arm(store, 'hunt', HUNT);
    turnIn(store, 'hunt', HUNT);
    await store.getState().persist();
    const slot = store.getState().activeSlotId!;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const save = require('../app/engine/saveSystem') as typeof import('../app/engine/saveSystem');
    const raw = (await save.loadSlot(slot))!;
    const legacy = { ...raw, player: { ...raw.player } } as Record<string, never>;
    for (const k of ['completedHuntIds', 'completedMysteryIds', 'completedStorylineIds']) {
      delete (legacy.player as never as Record<string, unknown>)[k];
    }
    await save.saveSlot(slot, legacy as never);
    await expect(store.getState().loadSlotIntoGame(slot)).resolves.not.toThrow();
    const p = store.getState().player! as never as Record<string, string[]>;
    expect(p.completedHuntIds).toEqual([]);
    expect(p.completedMysteryIds).toEqual([]);
    expect(p.completedStorylineIds).toEqual([]);
  });
});

describe('Package 7 §F — the ledger that looks like the authority and is not', () => {
  it('⚠⚠⚠ real completions never touch worldMemory.completedQuestIds, and nothing in app/ reads it', async () => {
    // ⚠ PINNED AS DEAD, ON PURPOSE. `completeQuest()` has no callers and
    // `completedQuestIds` has no readers; the risk is not that they misbehave but
    // that a later pass sees the names, assumes they are the ledger, and starts
    // writing a SECOND record of completion that the board filters do not read.
    // Two sources of truth for "is this arc finished" is the shape this package
    // exists to keep out of the game. If someone wires them up deliberately, this
    // test goes red and makes them say so.
    const store = await boot();
    const wmBefore = (store.getState().worldMemory as never as { completedQuestIds?: string[] }).completedQuestIds;
    expect(wmBefore).toEqual([]);

    arm(store, 'hunt', HUNT);
    turnIn(store, 'hunt', HUNT);
    arm(store, 'mystery', MYSTERY);
    turnIn(store, 'mystery', MYSTERY);
    arm(store, 'storyline', STORY);
    turnIn(store, 'storyline', STORY);

    const p = store.getState().player! as never as Record<string, string[]>;
    expect(p.completedHuntIds).toEqual([HUNT]);
    expect(p.completedMysteryIds).toEqual([MYSTERY]);
    expect(p.completedStorylineIds).toEqual([STORY]);
    // Three arcs closed across all three families, and the world ledger is still empty.
    expect((store.getState().worldMemory as never as { completedQuestIds?: string[] }).completedQuestIds).toEqual([]);
  });
});
