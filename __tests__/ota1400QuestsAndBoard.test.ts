/**
 * OTA-1400 — SLICE 9: contracts and the mission board leave gameStore.
 *
 * Thirty actions, 2,373 lines, two slice files — the last of the nine slices
 * Part 4 planned.
 *
 * ⚠⚠ SLICE 8 MEASURED AND SPLIT. SLICE 9 MEASURED AND DID NOT. Same method,
 * opposite answer, and that is the whole argument for measuring rather than
 * assuming — a method that always says "split" is not a measurement, it is a
 * preference wearing one.
 *
 * The four contract families look like four jobs and are one:
 *
 *     faction ∩ hunt      = 17 shared module symbols
 *     hunt    ∩ storyline = 18
 *     mystery ∩ storyline = 18
 *
 * out of roughly twenty each. Four files would have been four deps objects
 * naming almost the same twenty functions.
 *
 * ⚠⚠ AND THE ONE THING THAT DID SPLIT OFF IS THE ONE NOBODY WOULD HAVE GUESSED.
 * The mission BOARD shares ZERO module symbols with all four families and zero
 * with the contract admin. It reads as part of the quest system and is not: it
 * is where offers are POSTED, not where contracts are run.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { storeSource, sliceNames } from '../test-utils/storeSource';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

const store = src('app', 'state', 'gameStore.ts');
const quest = src('app', 'state', 'slices', 'questSlice.ts');
const board = src('app', 'state', 'slices', 'boardSlice.ts');

const QUEST_ACTIONS = [
  'generateNewQuest', 'acceptFactionQuest', 'setFactionQuestActive', 'routeMission',
  'turnInFactionQuest', 'acceptHunt', 'advanceHunt', 'turnInHunt', 'acceptMystery',
  'advanceMystery', 'turnInMystery', 'acceptStoryline', 'advanceStoryline',
  'turnInStoryline', 'setContractActive', 'completeContractFromUI',
  'completeContractFromUIInner', 'abandonContract', 'requestContractsTab',
  'clearPendingContractsTab', 'toggleReserveForQuest', 'clearMissionCompleteNotice',
  'clearContractsNotice', 'announceMissionComplete', 'raiseMissionCompleteNotice',
];
const BOARD_ACTIONS = [
  'readMissionBoard', 'toggleBoardFreeze', 'acceptMissionOffer', 'declineMissionOffer',
  'acceptBounty',
];

describe('OTA-1400 — thirty actions moved into two files', () => {
  it.each(QUEST_ACTIONS)('quest: %s lives in the slice, not in gameStore', (name) => {
    expect(quest).toMatch(new RegExp(`^  (async )?${name}\\(`, 'm'));
    expect(store).not.toMatch(new RegExp(`^  (async )?${name}\\(`, 'm'));
  });

  it.each(BOARD_ACTIONS)('board: %s lives in the slice, not in gameStore', (name) => {
    expect(board).toMatch(new RegExp(`^  (async )?${name}\\(`, 'm'));
    expect(store).not.toMatch(new RegExp(`^  (async )?${name}\\(`, 'm'));
  });

  it('⚠ the store still declares all thirty, so no consumer changes', () => {
    for (const n of [...QUEST_ACTIONS, ...BOARD_ACTIONS]) expect(store).toContain(`  ${n}: `);
    expect(store).toContain('...createQuestSlice(set, get, {');
    expect(store).toContain('...createBoardSlice(set, get, {');
  });

  it('⚠⚠ neither imports a VALUE from gameStore', () => {
    for (const body of [quest, board]) {
      for (const line of body.split('\n')) {
        if (!/from\s+['"]\.\.\/gameStore['"]/.test(line)) continue;
        expect(line.trim().startsWith('import type ')).toBe(true);
      }
    }
  });
});

describe('OTA-1400 — the split that was measured, and the one that was not', () => {
  it('⚠⚠ the board shares NOTHING with contracts — that is why it is its own file', () => {
    // Structural: no dep named by one appears in the other's object.
    const depsOf = (body: string): string[] =>
      [...body.matchAll(/^  (\w+): typeof Store\.\w+;$/gm)].map((m) => m[1] ?? '');
    const q = new Set(depsOf(quest));
    const b = depsOf(board);
    expect(b.length).toBeGreaterThan(0);
    expect(b.filter((d) => q.has(d))).toEqual([]);
    expect(board).toContain('THE ONLY CLEAN ISLAND IN THE QUEST SYSTEM');
  });

  it('⚠⚠ the four families were NOT split, and the header says why with numbers', () => {
    // The temptation was four files, one per family. The measurement refused it:
    // 14-18 shared symbols out of ~20 each. A slice per family would have been
    // four copies of one coupling.
    expect(quest).toContain('SLICE 8 MEASURED AND SPLIT. SLICE 9 MEASURED AND DID NOT');
    for (const family of ['acceptFactionQuest', 'acceptHunt', 'acceptMystery', 'acceptStoryline']) {
      expect(quest).toContain(family);
    }
    expect(sliceNames().filter((f) => /hunt|mystery|storyline|faction/i.test(f))).toEqual([]);
  });

  it('⚠ the board slice is small and its deps object is honest about it', () => {
    const count = (body: string): number =>
      [...body.matchAll(/^  \w+: typeof Store\.\w+;$/gm)].length;
    expect(count(board)).toBeLessThanOrEqual(3);
    expect(count(quest)).toBeGreaterThan(count(board) * 5);
  });
});

describe('OTA-1400 — what travelled, and the helper that deliberately did not', () => {
  it('⚠⚠ the one mutable `let` came with the gate that owns it', () => {
    // `lastAcceptChaTrainAtHours` stops accept→abandon→re-accept being a free
    // charisma grind. Every read and write is inside `trainAcceptCharismaGated`,
    // which only these actions call — so it had no choice but to travel.
    expect(quest).toMatch(/let lastAcceptChaTrainAtHours/);
    expect(store).not.toMatch(/^let lastAcceptChaTrainAtHours/m);
    expect(quest).toContain('function trainAcceptCharismaGated(');
    expect(store).not.toMatch(/^function trainAcceptCharismaGated\(/m);
  });

  it('⚠⚠ nextAcceptBurstIndex was INJECTED even though only a moved thing calls it', () => {
    // The scan flagged it exclusive: its one caller, `acceptIsCompact`, moved.
    // It is not exclusive — it READS `_burstCount` and `_burstLastAt`, module
    // state owned by `bumpQuestsAccepted`, which stays. Moving it would have
    // stranded that state or stolen it.
    //
    // Exclusive CALLERS do not make a helper exclusive; exclusive STATE does.
    expect(quest).toContain('nextAcceptBurstIndex: typeof Store.nextAcceptBurstIndex;');
    expect(store).toMatch(/^export function nextAcceptBurstIndex\(\)/m);
    expect(store).toMatch(/^let _burstCount/m);
    expect(quest).toContain('Exclusive CALLERS do not make a helper exclusive');
  });

  it('⚠ six more private helpers came along for the ordinary reason', () => {
    for (const fn of [
      'creditTurnIn', 'turnInCounterparty', 'plantNextContractHint',
      'isBrokerVendorId', 'acceptIsCompact', 'parkedTag',
    ]) {
      expect(quest).toContain(`function ${fn}(`);
      expect(store).not.toMatch(new RegExp(`^function ${fn}\\(`, 'm'));
    }
  });

  it('⚠⚠ the helpers sit INSIDE the factory, and the header says why', () => {
    // They reference injected deps. At module scope they would have no `deps` in
    // scope, and both alternatives were worse: a parameter on each is a
    // signature EDIT hiding inside a move, and a module-level `let deps` the
    // factory assigns is silently wrong the second time it is called.
    expect(quest).toContain('THE PRIVATE HELPERS LIVE INSIDE THE FACTORY');
    const factory = quest.indexOf('export const createQuestSlice');
    expect(quest.indexOf('  function creditTurnIn(')).toBeGreaterThan(factory);
  });
});

describe('OTA-1400 — the source pins slice 9 turned up', () => {
  it('⚠⚠ a window that ran BACKWARDS was found, not papered over', () => {
    // ota1201 windowed `turnInCounterparty` → `creditTurnIn`, which only worked
    // while those two sat in that order in one file. This slice moved both with
    // creditTurnIn FIRST, so the window inverted and produced an empty string —
    // a pin asserting against nothing, which would have gone on "passing".
    const t = src('__tests__', 'ota1201HostHandIn.test.ts');
    expect(t).toContain('the old window ran backwards');
    expect(t).not.toContain("STORE.indexOf('function creditTurnIn')");
  });

  it('⚠⚠ …and a NON-UNIQUE anchor, which is the same failure in a different coat', () => {
    // ota1163 anchored on `"Another contract," the Arbiter says`. Once the store
    // and its slices were read together, that string also matched a canned
    // flavour line in gameStore — and indexOf found THAT one, windowing 1,200
    // characters of unrelated text.
    const t = src('__tests__', 'ota1163BountyPrimer.test.ts');
    expect(t).toContain('NON-UNIQUE');
    expect(t).toContain('boardSlice.ts');
  });

  it('⚠ injected calls are pinned as injected, which is not a looser claim', () => {
    // A slice reaches a store helper through `deps.X(...)`. The deps object is
    // typed `typeof Store.X`, so the compiler guarantees it is the same
    // function; the prefix is the proof of the wiring, not a hole in it.
    expect(src('__tests__', 'ota1187ContractFixes.test.ts'))
      .toContain('acceptCellStamp');
    expect(quest).toContain('...deps.acceptCellStamp(get)');
  });
});

describe('OTA-1400 — nine slices in, and Part 4 is done', () => {
  it('gameStore is under 37,000 lines', () => {
    // 45,050 → 44,891 → 44,816 → 44,160 → 43,542 → 43,281 → 42,956 → 41,650
    //        → 39,470 → here.
    expect(store.split('\n').length).toBeLessThan(37000);
  });

  it('⚠ there are nine slices, and the policy suite covers every one', () => {
    expect(sliceNames()).toEqual([
      'aiLifecycleSlice.ts',
      'boardSlice.ts',
      'bootSlice.ts',
      'craftingSlice.ts',
      'inventorySlice.ts',
      'persistSlice.ts',
      'questSlice.ts',
      'slotSlice.ts',
      'vendorSlice.ts',
    ]);
    for (const f of sliceNames()) expect(existsSync(path('app', 'state', 'slices', f))).toBe(true);
  });

  it('⚠ every action moved across all nine slices is still findable through the store', () => {
    const all = storeSource();
    for (const n of [...QUEST_ACTIONS, ...BOARD_ACTIONS]) {
      expect(all).toMatch(new RegExp(`^  (async )?${n}\\(`, 'm'));
    }
  });
});
