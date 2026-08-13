jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1245 — THE PICKER WAS NEVER ACTUALLY TAUGHT.
//
// Owner: *"have we addressed the tutorial yet where we need to go over this new
// style of picker?"*
//
// ⚠⚠ NO — AND TWO COPY PASSES HAD DISGUISED THAT. OTA-1237 renamed the retired
// button labels and OTA-1243 swapped SCRAP→SALVAGE, so the tutorial *read*
// correct. But both picker beats narrow the chip list to ONE prop (OTA-1233, so a
// guided beat cannot offer the room's real nouns beside the demo one — playtest:
// *"neither of those are the cudgel"*), which means a first-timer sees a single
// lane, twice, and never meets the layout at all. Rendered:
//
//     CUDGEL BEAT  GEAR    | ⚔ cudgel             | TAKE ALL GEAR (1)  | IGNORE
//     SCRAP  BEAT  SALVAGE | ⚒ broken chest plate | ⚒ SALVAGE ALL (1)  | IGNORE
//
// The redesign's entire idea — *here is everything, grouped by colour, choose* —
// is invisible during the only part of the game that explains anything.
//
// ⚠ AND IT CANNOT BE TAUGHT INSIDE THE TUTORIAL WITHOUT LYING. There are exactly
// four tutorial props (cudgel, rope, chest plate, note) and all are spent or
// unavailable by the scrap beat. Faking a second lane means placing a prop that is
// not in the room — the exact class of defect OTAs 1234–1244 have been closing.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create(el: React.ReactElement): { toJSON(): unknown };
};
import { GatherModal } from '../app/components/GatherModal';
import { classifyGatherNoun, laneForKind } from '../app/engine/gatherSort';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

function render(chips: { noun: string }[]) {
  const tree = renderer.create(
    <GatherModal
      visible player={null} chips={chips} leadNouns={[]}
      onTake={() => {}} onSalvage={() => {}} onTakeAll={() => {}} onSalvageAll={() => {}}
      onInvestigate={() => {}} onCancel={() => {}}
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

/** The lane count the screen computes, mirrored. */
const lanes = (nouns: string[]): number =>
  new Set(nouns.map((n) => laneForKind(classifyGatherNoun(n))).filter(Boolean)).size;

describe('OTA-1245 — the gap, measured before it is filled', () => {
  it('⚠⚠ RENDERED: each tutorial beat really does show ONE lane, so the layout is unteachable there', () => {
    // This is the finding, kept as a live assertion rather than a claim in a
    // comment: if a future edit widens a beat, this fails and whoever wrote it
    // learns the hint may no longer be the only teacher.
    const cudgel = render([{ noun: 'cudgel' }]);
    expect(cudgel).toContain('GEAR');
    expect(cudgel).not.toContain('ITEMS');
    expect(cudgel).not.toContain('WORTH A LOOK');
    expect(lanes(['cudgel'])).toBe(1);

    const plate = render([{ noun: 'broken chest plate' }]);
    expect(plate).toContain('SALVAGE');
    expect(plate).not.toContain('GEAR');
    expect(lanes(['broken chest plate'])).toBe(1);
  });

  it('⚠ the beats still narrow to their own prop — the fix must not undo the OTA-1233 rule', () => {
    // "Neither of those are the cudgel" was a real playtest failure. Teaching the
    // layout must not come at the cost of a guided beat offering eight rows.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const chips = screen.slice(screen.indexOf('const gatherChips = useMemo('), screen.indexOf('const gatherLaneCount'));
    expect(chips).toContain("noun: 'cudgel'");
    expect(chips).toContain("noun: 'broken chest plate'");
  });
});

describe('OTA-1245 — taught where it is true', () => {
  it('⚠⚠ the hint fires on a REAL multi-lane room and never during a beat', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('id="picker_colour_lanes"');
    const i = screen.indexOf('{!tutBeat && gatherLaneCount >= 2 && (');
    expect(i).toBeGreaterThan(-1);
    // ⚠ `!tutBeat` matters: during a beat the room is narrowed to one prop, so a
    // hint promising colour groups would describe a card the player is not looking
    // at — the same "describes a state the game is not in" rule this project runs
    // on everywhere else.
  });

  it('⚠⚠ the gate reads the SAME array the picker renders — not a second copy', () => {
    // ⚠ THE REASON THE CHIP LIST WAS HOISTED. This session has now paid three
    // times for a rule computed twice (OTA-1236's guard vs its firer, OTA-1241's
    // matcher vs its census, OTA-1244's display guarantee vs its recompute). A
    // hint that promised lanes the picker would not show would be the fourth.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('chips={gatherChips}');
    const i = screen.indexOf('const gatherLaneCount = useMemo(');
    expect(i).toBeGreaterThan(-1);
    const block = screen.slice(i, i + 700);
    expect(block).toContain('for (const c of gatherChips)');
    expect(block).toContain('c.consumed');          // a spent row is not a lane
    expect(block).toContain('}, [gatherChips]);');  // and it tracks that array
  });

  it('⚠⚠ the lane count is HONEST — it matches what the picker actually draws', () => {
    // Behavioural, not a source pin: feed the same nouns through the shared
    // helpers and through the component, and the answers must agree.
    const room = ['Compact Blaster', 'Aetheric Torch', 'bench'];
    expect(lanes(room)).toBe(3);
    const text = render(room.map((noun) => ({ noun })));
    for (const heading of ['GEAR', 'ITEMS', 'SALVAGE']) expect(text).toContain(heading);

    const oneLane = ['bench', 'banner'];
    expect(lanes(oneLane)).toBe(1);
    const single = render(oneLane.map((noun) => ({ noun })));
    expect(single).toContain('SALVAGE');
    expect(single).not.toContain('GEAR');
    expect(single).not.toContain('ITEMS');
  });

  it('⚠ the hint obeys the house word limit — long copy is why nobody reads hints', () => {
    // FirstTimeHint's authoring rule (OTA-229): ~25 words, 2 sentences. The owner
    // has already pushed back once on tutorial verbosity ("way too much text for
    // the salvage button", OTA-1075).
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('id="picker_colour_lanes"');
    const body = /body="([^"]+)"/.exec(screen.slice(i, i + 600));
    expect(body).not.toBeNull();
    expect(body![1]!.split(/\s+/).length).toBeLessThanOrEqual(30);
    // It names the colours, because the colours ARE the system.
    for (const w of ['orange', 'green', 'yellow']) expect(body![1]!.toLowerCase()).toContain(w);
  });
});

describe('OTA-1245 — the beats stopped promising what they cannot show', () => {
  it('⚠⚠ the cudgel beat no longer claims it opens "everything in the room at once"', () => {
    // It opens exactly one row. A claim the very next frame contradicts is worse
    // than no claim — it teaches the player that the text is decorative.
    const steps = src('app', 'components', 'tutorialSteps.ts');
    const beat = steps.slice(steps.indexOf("id: 'cudgel'"), steps.indexOf("id: 'rope'"));
    expect(beat).not.toContain('everything in the room at once');
    expect(beat).not.toContain('shows you the whole room');
    expect(beat).toContain('TAKE / SALVAGE');
  });

  it('⚠ the scrap beat drops "group" but KEEPS the colour word, which is true', () => {
    // The plate really does come up under a yellow SALVAGE heading, so the
    // vocabulary is introduced honestly and pays off when the real board appears.
    const steps = src('app', 'components', 'tutorialSteps.ts');
    const beat = steps.slice(steps.indexOf("id: 'scrap'"), steps.indexOf("id: 'climb'"));
    expect(beat).not.toContain('SALVAGE group');
    expect(beat).toContain('yellow SALVAGE');
    // And the render backs the claim.
    expect(render([{ noun: 'broken chest plate' }])).toContain('SALVAGE');
  });
});
