jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1236 — THE BULK BUTTON THAT COULD EAT THE DOG QUEST.
//
// Owner: *"I don't like that salvage all can bury the dog quest, that if it is
// there should always be the last thing listed so the next step is right there to
// see. So investigate all skips the dead ends, shows what was found on investigate
// or does a story hook pop-up, then does the dog quest."*
//
// ⚠⚠ THE FIRST CLAUSE IS A BUG, AND THIS SUITE MEASURES IT FROM THE SHIPPED DATA
// RATHER THAN ASSERTING IT. Ten of the twenty dog-rescue hook nouns match a
// salvage pool. `salvageAllAmbient` skipped catalog items (OTA-1231) and nothing
// else, so one tap of SALVAGE ALL pried apart the chain the dog is on. Salvage
// writes `searchedAmbientNouns`; every picker reads it. **The rescue noun then
// left the investigate list entirely** — still typeable, which is worse than
// useless, because nobody types a noun the game has stopped showing them. And
// OTA-1235's yellow SCRAP lane had just put those nouns under a one-tap sweep.
//
// ⚠ THE SECOND CLAUSE IS AN ORDERING RULE WITH TEETH. The rescue SPAWNS A CAPTOR
// AND STARTS A FIGHT. Reached mid-sweep, every remaining `investigate` in the loop
// lands during combat and is refused. "Then does the dog quest" is not decoration:
// anywhere but last breaks the rest of the sweep.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): { toJSON(): unknown; update(el: React.ReactElement): void };
};
import { GatherModal } from '../app/components/GatherModal';
import { laneForKind, laneHasSweep } from '../app/engine/gatherSort';
import {
  rescueScenarioForNoun, isLeadNoun, storyTier, orderByStoryTier,
} from '../app/engine/storyNouns';
import { RESCUE_SCENARIOS } from '../app/engine/dogCompanion';
import { hasSalvageYield } from '../app/engine/salvagePools';
import type { Hook } from '../app/engine/hooks';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

function renderRoom(chips: { noun: string }[], leadNouns: string[]) {
  const tree = renderer.create(
    <GatherModal
      visible
      player={null}
      chips={chips}
      leadNouns={leadNouns}
      onTake={() => {}}
      onSalvage={() => {}}
      onTakeAll={() => {}}
      onSalvageAll={() => {}}
      onInvestigate={() => {}}
      onCancel={() => {}}
    />,
  );
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const node = n as { children?: unknown[] } | null;
    if (node && node.children) node.children.forEach(walk);
  };
  walk(tree.toJSON());
  return out.join('|');
}

describe('OTA-1236 — the exposure, measured from the shipped data', () => {
  it('⚠⚠ TEN of the twenty dog-rescue nouns ARE salvageable — this is the bug, not a worry', () => {
    const salvageable: string[] = [];
    const all: string[] = [];
    for (const s of Object.values(RESCUE_SCENARIOS)) {
      for (const n of s.hookNouns) {
        all.push(n);
        if (hasSalvageYield(n)) salvageable.push(n);
      }
    }
    // ⚠ 19, not 20: OTA-1241 dropped bare `pit` from the snare scenario — censused
    // against the world's nouns it matched only `mud pit`, while costing `firepit`,
    // `pulpit` and `climbing piton` under the old substring rule.
    expect(all.length).toBe(19);
    // If this number moves, the pools or the scenarios changed — re-read the
    // guard below before assuming it still covers them.
    expect(salvageable.length).toBeGreaterThanOrEqual(10);
    // Named, because the abstract count does not carry the point.
    for (const n of ['chain', 'overturned wagon', 'cellar door', 'snare pit', 'trap']) {
      expect(hasSalvageYield(n)).toBe(true);
      expect(rescueScenarioForNoun(n)).not.toBeNull();
    }
  });

  it('⚠⚠ the guard uses the SAME rule the engine dispatch fires on — one place, not two', () => {
    // A protector matching a different set from the firer is the same bug as no
    // protector: a noun the engine treats as the dog hook could still be swept.
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).toContain("import { rescueScenarioForNoun } from '../engine/storyNouns'");
    const i = store.indexOf('function matchRescueHookNoun(');
    expect(i).toBeGreaterThan(-1);
    const body = store.slice(i, i + 200);
    expect(body).toContain('return rescueScenarioForNoun(text);');
  });
});

describe('OTA-1236 — SALVAGE ALL leaves the lead alone, and says so', () => {
  it('⚠⚠ the bulk loop SKIPS a lead noun, in its own bucket', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('salvageAllAmbient(nouns) {');
    expect(i).toBeGreaterThan(-1);
    const fn = store.slice(i, i + 14000);
    expect(fn).toContain('const skippedLead: string[] = []');
    expect(fn).toContain('isBulkLeadNoun(noun, bulkLeadCtx)');
    expect(fn).toContain('skippedLead.push(noun)');
    // Its own bucket, exactly like OTA-1231's takeable skip — folding it into
    // "already worked over" would be a message describing a state the game is
    // not in.
    expect(fn).not.toContain('skippedAlready.push(noun); // lead');
  });

  it('⚠⚠ ...and the player is TOLD, on the arbiter channel, with the verb that works', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('if (skippedLead.length > 0)');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 500);
    expect(block).toContain("'arbiter'");
    expect(block).toContain('(INVESTIGATE.)');
  });

  it('⚠ a lead-only batch is NOT the "button did nothing" case', () => {
    // Both empty-output guards have to count the lead line as output, or a room
    // whose only scrap-shaped noun is the dog chain reports the sweep as broken.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const hadOtherOutput =');
    expect(store.slice(i, i + 400)).toContain('skippedLead.length > 0');
    const j = store.indexOf('&& skippedTakeable.length === 0');
    expect(store.slice(j, j + 200)).toContain('&& skippedLead.length === 0');
  });

  it('⚠⚠ the protection LIFTS once the quest cannot fire — a snare is a snare again', () => {
    // Protecting it forever would keep scrap out of the player's hands for a
    // quest that already happened.
    expect(isLeadNoun('snare pit', { rescueEligible: true })).toBe(true);
    expect(isLeadNoun('snare pit', { rescueEligible: false })).toBe(false);
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const bulkLeadCtx =');
    const block = store.slice(i, i + 400);
    expect(block).toContain('rescueEligible');
    expect(block).toContain('player?.dog');
    expect(block).toContain('pendingDogOnboarding');
  });
});

describe('OTA-1236 — RENDERED: the lead is last, and no button touches it', () => {
  const SMELTER = [
    { noun: 'chain' }, { noun: 'bench' },
    { noun: 'Aetheric Torch' }, { noun: 'Compact Blaster' },
  ];

  it('⚠⚠ the chain leaves the SCRAP lane, and the salvage count drops with it', () => {
    const guarded = renderRoom(SMELTER, ['chain']);
    expect(guarded).toContain('WORTH A LOOK');
    expect(guarded).toContain('✦|chain|INVESTIGATE');
    // The scrap sweep now counts the bench and ONLY the bench.
    expect(guarded).toContain('⚒ SALVAGE ALL (1)');
    // ⚠ The control: with no live rescue the same noun is scrap again and the
    // count goes back to 2. If this half were missing, the fix would be a
    // permanent tax on the salvage economy rather than a guard.
    const unguarded = renderRoom(SMELTER, []);
    expect(unguarded).not.toContain('WORTH A LOOK');
    expect(unguarded).toContain('⚒|chain');
    expect(unguarded).toContain('⚒ SALVAGE ALL (2)');
  });

  it('⚠⚠ the lead lane is LAST — after gear, after items, after scrap', () => {
    // Owner: *"if it is there should always be the last thing listed so the next
    // step is right there to see."* The buttons sit at the bottom of the card, so
    // the last block is the one the thumb is already next to.
    const text = renderRoom(SMELTER, ['chain']);
    expect(text.indexOf('WORTH A LOOK')).toBeGreaterThan(text.indexOf('GEAR'));
    expect(text.indexOf('WORTH A LOOK')).toBeGreaterThan(text.indexOf('ITEMS'));
    expect(text.indexOf('WORTH A LOOK')).toBeGreaterThan(text.indexOf('SCRAP'));
    expect(text.indexOf('chain')).toBeGreaterThan(text.indexOf('bench'));
    // ...and still above the way out, so it is the last thing READ.
    expect(text.indexOf('WORTH A LOOK')).toBeLessThan(text.indexOf('IGNORE THE REST'));
  });

  it('⚠⚠ THE LEAD LANE HAS NO SWEEP BUTTON, and its absence is the whole message', () => {
    // Every other colour promises a matching button will clear it. This colour
    // promises the opposite.
    expect(laneHasSweep('gear')).toBe(true);
    expect(laneHasSweep('items')).toBe(true);
    expect(laneHasSweep('scrap')).toBe(true);
    expect(laneHasSweep('lead')).toBe(false);
    // A room of nothing BUT leads offers no bulk action at all.
    const leadOnly = renderRoom([{ noun: 'chain' }, { noun: 'cage' }], ['chain', 'cage']);
    expect(leadOnly).toContain('WORTH A LOOK');
    expect(leadOnly).not.toContain('TAKE ALL');
    expect(leadOnly).not.toContain('SALVAGE ALL');
    expect(leadOnly).toContain('IGNORE THE REST');
  });

  it('⚠ the lead has its own lane and NO BUTTON — that is what makes it unsweepable', () => {
    // ⚠⚠ OTA-1317 — this used to require the lead's hue be distinct from the
    // three sweep hues, which cannot hold now the owner has ruled every lane
    // amber. Re-pointed to the rule the test is NAMED for: nothing bulk touches
    // the lead. Its hue was a hint; the missing button is the guarantee, and the
    // rendered assertions in this file already prove no sweep offers it.
    expect(laneForKind('lead')).toBe('lead');
    const mod = src('app', 'components', 'GatherModal.tsx');
    expect(mod).toMatch(/^const LEAD = LANE;/m);
    expect(mod).toContain('rowLead: { borderColor: LEAD }');
    expect(mod).toContain('textLead: { color: LEAD }');
    // ⚠ THE GUARANTEE: there is no sweepLead style and no lead sweep handler,
    // so no bulk control can ever be wired to this lane by accident.
    expect(mod).not.toContain('sweepLead');
    expect(mod).not.toContain("renderLane('lead', lead, (n)");
  });

  it('⚠⚠ tapping a lead INVESTIGATES — the only verb that fires the rescue', () => {
    const mod = src('app', 'components', 'GatherModal.tsx');
    // Checked FIRST in the press handler, before the scrap and take branches.
    const i = mod.indexOf('onPress={() => {');
    const handler = mod.slice(i, i + 320);
    expect(handler.indexOf("lane === 'lead'")).toBeLessThan(handler.indexOf("lane === 'scrap'"));
    expect(handler).toContain('onInvestigate(noun)');
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('onInvestigate={(noun) => {');
    expect(screen).toContain('submit(`investigate ${noun}`)');
  });
});

describe('OTA-1236 — INVESTIGATE ALL runs the owner’s order, and stops at a fight', () => {
  const hook = (nouns: string[]): Hook =>
    ({ kind: 'smoke', stage: 0, nouns, resolved: false } as unknown as Hook);

  it('⚠⚠ ordinary nouns → story hook → dog quest, exactly the sentence he wrote', () => {
    const ctx = { hooks: [hook(['column'])], rescueEligible: true };
    expect(storyTier('bench', ctx)).toBe('ordinary');
    expect(storyTier('column', ctx)).toBe('hook');
    expect(storyTier('snare pit', ctx)).toBe('rescue');
    const ordered = orderByStoryTier(
      ['snare pit', 'bench', 'column', 'shelf'], (n) => n, ctx,
    );
    expect(ordered).toEqual(['bench', 'shelf', 'column', 'snare pit']);
  });

  it('⚠ the order is a STABLE PARTITION — the list you read is the order that runs', () => {
    const ctx = { hooks: [], rescueEligible: true };
    const input = ['zeta', 'alpha', 'mid'];
    expect(orderByStoryTier(input, (n) => n, ctx)).toEqual(input);
    // And a rescue noun anywhere in the input still lands last, once.
    expect(orderByStoryTier(['trap', 'zeta', 'alpha'], (n) => n, ctx))
      .toEqual(['zeta', 'alpha', 'trap']);
  });

  it('⚠⚠ THE SWEEP BREAKS THE MOMENT AN ENEMY IS ON THE BOARD', () => {
    // The rescue spawns a captor. Without this, the investigates queued behind it
    // fire into a fight the player has not seen yet and are refused one by one —
    // "Not while the Reclaimer Deserter is on you." Ordering alone does not fix
    // that, because a hook can start a fight too.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('onInvestigateAll={(nouns) => {');
    expect(i).toBeGreaterThan(-1);
    // ⚠ OTA-1268 — window widened past the self-abort fix's incident note; the
    // enemy-abort rule this pins is unchanged (ota1268 now also proves it
    // BEHAVIOURALLY, by staging an enemy mid-sweep and counting).
    const block = screen.slice(i, i + 2400);
    expect(block).toContain('orderByStoryTier(nouns');
    expect(block).toContain('currentScene?.enemies ?? []).length > 0');
    // ⚠ OTA-1263 paced the sweep, so the abort is an early `return` out of the
    // scheduled step rather than a `break` out of a for-loop. **The rule is
    // unchanged and is what matters:** the enemy check runs before every submit,
    // and now it runs before EACH one rather than once per frame — which is
    // strictly stronger, because the sweep is live for seconds.
    expect(block).toContain("(s.currentScene?.enemies ?? []).length > 0) return;");
  });

  it('⚠⚠ the investigate picker LISTS in the same order it SWEEPS', () => {
    // A list ordered one way and a sweep ordered another is a picker that lies
    // about what it is about to do.
    const modal = src('app', 'components', 'SearchModal.tsx');
    expect(modal).toContain('leadNouns');
    const i = modal.indexOf('const visibleChips = [');
    expect(i).toBeGreaterThan(-1);
    const block = modal.slice(i, i + 260);
    expect(block).toContain('!isLeadChip(c.noun)');
    // Non-leads first, leads appended after — the same partition as the sweep.
    expect(block.indexOf('!isLeadChip')).toBeLessThan(block.lastIndexOf('isLeadChip'));
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('leadNouns={leadNouns}');
  });

  it('⚠⚠ OTA-1238: THE PICKER SURVIVES A SELECTION — take, salvage and both sweeps', () => {
    // Owner: *"the top hat should stay open during all of the selections until you
    // hit the ignore button so you don't have to keep reopening it."* Clearing a
    // five-noun room used to be ten taps: act, reopen, act, reopen. The list is
    // already reactive, so the popup only had to stop dismissing itself.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('<GatherModal');
    const j = screen.indexOf('<MissionBoardModal');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    const block = screen.slice(i, j);
    // Exactly THREE closers survive in the picker block, and each is deliberate:
    // the two tutorial beats, the lead tap, and IGNORE.
    for (const handler of ['onStealthTake', 'onTakeAll', 'onSalvageAll']) {
      const h = block.slice(block.indexOf(`${handler}={`), block.indexOf(`${handler}={`) + 320);
      expect(h).not.toContain('setTakeOpen(false)');
    }
    // IGNORE still closes — the way out never moves.
    expect(block).toContain('onCancel={() => { Keyboard.dismiss(); setTakeOpen(false); }}');
  });

  it('⚠⚠ OTA-1238: ...except a LEAD tap and a TUTORIAL beat, both for stated reasons', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const block = screen.slice(screen.indexOf('<GatherModal'), screen.indexOf('<MissionBoardModal'));
    // A lead spawns the rescue captor / opens a hook popup — never leave a loot
    // list floating over that.
    const lead = block.slice(block.indexOf('onInvestigate={'), block.indexOf('onInvestigate={') + 220);
    expect(lead).toContain('setTakeOpen(false)');
    // A tutorial beat's NEXT target is the input row or a quick button, both of
    // which sit behind this modal. Leaving it open puts the pulse under the scrim.
    const take = block.slice(block.indexOf('onTake={'), block.indexOf('onTake={') + 400);
    expect(take).toContain("tutBeat === 'cudgel'");
    expect(take).toContain('setTakeOpen(false)');
    const salv = block.slice(block.indexOf('onSalvage={'), block.indexOf('onSalvage={') + 300);
    expect(salv).toContain("tutBeat === 'scrap'");
  });

  it('⚠⚠ OTA-1238: a fight closes it, because every action behind it would be refused', () => {
    // `salvage <noun>` routes through the investigate verb, which carries a 6%
    // ambush roll. A picker that survives a selection can now outlive the room
    // being safe, and a loot list over a fight is the "button did nothing"
    // complaint wearing a different hat.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('const liveEnemyCount =');
    expect(i).toBeGreaterThan(-1);
    const block = screen.slice(i, i + 300);
    expect(block).toContain('takeOpen && liveEnemyCount > 0');
    expect(block).toContain('setTakeOpen(false)');
  });

  it('⚠⚠ OTA-1238: the lane hues are DIMMED — saturation on near-black is the glow', () => {
    // Owner: *"dim the selections a bit, they glow when they shouldn't."* Real
    // effect, not a preference: the outline-only rework left the border as the ONLY
    // place the colour lives, so all of that saturation ended up on a 1px edge over
    // #13110f. Pinned as a ceiling on both channels rather than as four exact
    // strings, so the palette can be tuned without rewriting the test — but it
    // cannot creep back up to full brightness.
    // ⚠⚠ OTA-1317 — the lanes are ONE amber now, so this walks the two colour
    // VALUES the card still declares rather than five lane names. The rule is
    // unchanged and still worth having: nothing here may sit near full
    // brightness, because that is what blooms on a near-black OLED panel.
    const mod = src('app', 'components', 'GatherModal.tsx');
    const chan = (hex: string, i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    for (const name of ['LANE', 'IGNORE']) {
      const m = new RegExp(`^const ${name} = '(#[0-9a-f]{6})';`, 'm').exec(mod);
      expect(m).not.toBeNull();
      const hex = m![1]!;
      const [r, g, b] = [chan(hex, 0), chan(hex, 1), chan(hex, 2)];
      // No channel pinned at/near full — that is what blooms on an OLED panel.
      // ⚠ Ceiling raised 200 -> 201 by exactly one, and only because the house
      // amber (#c9a86a) reads 201 on red. That is the accent the rest of the game
      // already uses, not an invented lane hue — the old ceiling was tuned against
      // five bespoke colours. Still nowhere near the 255 that actually blooms.
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(201);
      // ...and still bright enough to read as a colour rather than as grey.
      expect(Math.max(r, g, b)).toBeGreaterThanOrEqual(120);
      // Not fully saturated: the darkest channel is never crushed to nothing.
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(40);
    }
    // The upgrade accent rides the same card and blooms the same way.
    expect(mod).not.toContain('#ffb066');
  });

  it('⚠⚠ OTA-1240: an EMPTIED picker closes itself — no ceremonial tap on an empty card', () => {
    // Owner: *"if there is nothing left, it doesn't need to wait for the ignore
    // button."* OTA-1238 made the picker survive a selection so clearing a room is
    // one visit instead of ten; the last step of that visit was still a mandatory
    // tap on a card showing nothing. IGNORE means *leave the rest*, and there is
    // no rest.
    jest.useFakeTimers();
    try {
      let closed = 0;
      const el = (chips: { noun: string }[]) => (
        <GatherModal
          visible player={null} chips={chips} leadNouns={[]}
          onTake={() => {}} onSalvage={() => {}} onTakeAll={() => {}} onSalvageAll={() => {}}
          onInvestigate={() => {}} onCancel={() => { closed += 1; }}
        />
      );
      let tree!: { toJSON(): unknown; update(e: React.ReactElement): void };
      renderer.act(() => { tree = renderer.create(el([{ noun: 'bench' }])); });
      renderer.act(() => { tree.update(el([])); });
      // ⚠ THE HOLD IS REAL AND IS ASSERTED AS SUCH — the same 800ms beat the
      // investigate picker has used since OTA-257. The player taps the last row,
      // and the card must still be there long enough for the tap to have visibly
      // landed; snapping shut on the same frame reads as a crash, not as done.
      renderer.act(() => { jest.advanceTimersByTime(400); });
      expect(closed).toBe(0);
      renderer.act(() => { jest.advanceTimersByTime(500); });
      expect(closed).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('⚠⚠ OTA-1240: ...but a picker that OPENS empty explains itself and WAITS', () => {
    // Opening onto an empty list and closing instantly is indistinguishable from a
    // button that did nothing — the exact complaint this run of OTAs has been
    // chasing. That player needs an explanation, not a dismissal.
    jest.useFakeTimers();
    try {
      let closed = 0;
      renderer.act(() => {
        renderer.create(
          <GatherModal
            visible player={null} chips={[]} leadNouns={[]}
            onTake={() => {}} onSalvage={() => {}} onTakeAll={() => {}} onSalvageAll={() => {}}
            onInvestigate={() => {}} onCancel={() => { closed += 1; }}
          />,
        );
      });
      renderer.act(() => { jest.advanceTimersByTime(5000); });
      expect(closed).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('⚠ the close timer does not depend on the inline onCancel, or it would never fire', () => {
    // `onCancel` is an inline arrow at the call site, so its identity changes on
    // every parent render. If the effect depended on it, each render would tear
    // down and restart the 800ms timer and the picker would never close.
    const mod = src('app', 'components', 'GatherModal.tsx');
    expect(mod).toContain('const cancelRef = useRef(onCancel)');
    expect(mod).toContain('setTimeout(() => cancelRef.current(), 800)');
    expect(mod).toContain('}, [visible, rowCount]);');
  });

  it('⚠ a SPENT lead stops being one — it must not pin scrap out of reach forever', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('const leadNouns = useMemo(');
    expect(i).toBeGreaterThan(-1);
    expect(screen.slice(i, i + 900)).toContain('!isExhaustedHookNoun(n)');
  });
});
