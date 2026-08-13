jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1233 — ONE PICKER, AND A SUITE THAT ACTUALLY RENDERS IT.
//
// Owner: *"what if we combined both and the popup had three buttons... you can
// still take individual items by tapping them."* TAKE and SALVAGE were two modals
// over the SAME scene-noun list, each with its own consumed-predicate — the seam
// OTA-1231's bugs lived in. Merging deletes the seam.
//
// ⚠⚠ AND THIS SUITE RENDERS THE COMPONENT RATHER THAN GREPPING IT, which is the
// lesson of the OTA-1232 miss. That OTA added row icons, every source-pin passed,
// the bundle published — and the owner played a whole session and saw nothing,
// because the marks shipped at 13px in the same muted tan as the text beside
// them. Source pins prove a line exists. They cannot prove a player can see it.
// So: assertions below read the RENDERED OUTPUT, and the mark sizes are pinned
// as numbers with the reason attached.
import React from 'react';
// ⚠ `react-test-renderer` ships no bundled types in this tree, and adding
// @types just to satisfy one import would put a dependency in package.json for a
// test-only concern. The require is typed locally instead — narrowly, to the one
// call this suite makes — so the ratchet stays at baseline rather than growing by
// one to buy a convenience.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create(el: React.ReactElement): { toJSON(): unknown };
};
import { GatherModal } from '../app/components/GatherModal';
import { classifyGatherNoun, isActionableGatherKind, laneForKind } from '../app/engine/gatherSort';
import { hasSalvageYield } from '../app/engine/salvagePools';
import { findCatalogItem } from '../app/engine/crafting';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

function renderRoom(chips: { noun: string; consumed?: boolean }[], player = null) {
  const tree = renderer.create(
    <GatherModal
      visible
      player={player}
      chips={chips}
      onTake={() => {}}
      onSalvage={() => {}}
      onTakeAll={() => {}}
      onSalvageAll={() => {}}
      onInvestigate={() => {}}
      onStealthTake={() => {}}
      stealthMeaningful={false}
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
  return out;
}

const ROOM = [
  { noun: 'bench' },
  { noun: 'Aetheric Torch' },
  { noun: 'Compact Blaster' },
  { noun: 'Aetherbound Mask' },
  { noun: 'rusted royal vault pedestal' },
];

describe('OTA-1235 — three lanes, three colours, all visible at once', () => {
  it('⚠⚠ RENDERED: every lane heading, every block and every button is present together', () => {
    const text = renderRoom(ROOM).join('|');
    // Nothing waits on anything. The whole room is on screen in one pass —
    // that is the complaint this redesign answers.
    expect(text).toContain('GEAR');
    expect(text).toContain('ITEMS');
    expect(text).toContain('SCRAP');
    expect(text).toContain('⚔|Compact Blaster');
    expect(text).toContain('🛡|Aetherbound Mask');
    expect(text).toContain('▪|Aetheric Torch');
    expect(text).toContain('⚒|bench');
    expect(text).toContain('⚒|rusted royal vault pedestal');
    expect(text).toContain('TAKE ALL GEAR (2)');
    expect(text).toContain('TAKE ALL ITEMS (1)');
    expect(text).toContain('⚒ SALVAGE ALL (2)');
  });

  it('⚠⚠ RENDERED: the lanes are ORDERED gear → items → scrap, and never interleaved', () => {
    const text = renderRoom(ROOM).join('|');
    // A heading owns everything until the next heading. If a block landed under
    // the wrong one, its colour would promise the wrong button.
    const gearAt = text.indexOf('GEAR');
    const itemsAt = text.indexOf('ITEMS');
    const scrapAt = text.indexOf('SCRAP');
    expect(gearAt).toBeLessThan(itemsAt);
    expect(itemsAt).toBeLessThan(scrapAt);
    expect(text.indexOf('Compact Blaster')).toBeLessThan(itemsAt);
    expect(text.indexOf('Aetheric Torch')).toBeGreaterThan(itemsAt);
    expect(text.indexOf('Aetheric Torch')).toBeLessThan(scrapAt);
    expect(text.indexOf('bench')).toBeGreaterThan(scrapAt);
  });

  it('⚠⚠ RENDERED: each button counts ITS OWN lane — the count is the safety', () => {
    // Gear 2, items 1, scrap 2. A bulk action whose size you learn only after
    // committing is one players stop trusting, and the count catches a mis-tap.
    const text = renderRoom(ROOM).join('|');
    expect(text).toContain('(2)');
    expect(text).toContain('TAKE ALL ITEMS (1)');
    // ...and a lane with nothing in it contributes no button at all.
    const scrapOnly = renderRoom([{ noun: 'bench' }]).join('|');
    expect(scrapOnly).toContain('⚒ SALVAGE ALL (1)');
    expect(scrapOnly).not.toContain('TAKE ALL');
    expect(scrapOnly).not.toContain('GEAR');
    expect(scrapOnly).not.toContain('ITEMS');
  });

  it('⚠⚠ RENDERED: gear alone shows the gear lane and NOTHING about salvage', () => {
    const lootOnly = renderRoom([{ noun: 'Compact Blaster' }]).join('|');
    expect(lootOnly).toContain('TAKE ALL GEAR (1)');
    expect(lootOnly).not.toContain('SALVAGE');
    expect(lootOnly).not.toContain('SCRAP');
  });

  it('⚠⚠ RENDERED: IGNORE is always offered, and it is named for what it does', () => {
    // Owner: *"a red ignore button for when your done to dismiss the rest."*
    // Leaving loot behind is a decision with a cost — the word says so, where
    // "CLOSE" said you had opened something by accident.
    expect(renderRoom(ROOM).join('|')).toContain('IGNORE THE REST');
    // Including in a picked-clean room, so the way out never moves.
    expect(renderRoom([]).join('|')).toContain('IGNORE THE REST');
  });

  it('⚠⚠ THE HUES ARE ONE-PER-LANE, and each is used on block, heading AND button', () => {
    // The whole redesign is that you never have to work out which button owns
    // which block. That only holds while each colour means exactly one thing.
    const mod = src('app', 'components', 'GatherModal.tsx');
    const hue = (name: string): string => {
      const m = new RegExp(`^const ${name} = '(#[0-9a-f]{6})';`, 'm').exec(mod);
      expect(m).not.toBeNull();
      return m![1]!;
    };
    const gear = hue('GEAR'); const items = hue('ITEMS');
    const scrap = hue('SCRAP'); const ignore = hue('IGNORE');
    expect(new Set([gear, items, scrap, ignore]).size).toBe(4);
    // Each lane hue is bound to a block border, a text colour and a button face.
    expect(mod).toContain('rowGear: { borderColor: GEAR');
    expect(mod).toContain('rowItems: { borderColor: ITEMS');
    expect(mod).toContain('rowScrap: { borderColor: SCRAP');
    expect(mod).toContain('sweepGear: { borderColor: GEAR');
    expect(mod).toContain('sweepItems: { borderColor: ITEMS');
    expect(mod).toContain('sweepScrap: { borderColor: SCRAP');
    expect(mod).toContain('textGear: { color: GEAR }');
    expect(mod).toContain('textItems: { color: ITEMS }');
    expect(mod).toContain('textScrap: { color: SCRAP }');
    expect(mod).toContain('ignoreText: { color: IGNORE');
  });

  it('⚠⚠ OTA-1237: LINE RECTANGLES, OUTLINE ONLY — the colour is on the edge, not behind the text', () => {
    // ⚠ THIS TEST USED TO ASSERT THE OPPOSITE, and the owner overruled it after
    // playing the tiles: *"we don't need the item boxes to have internal glow just
    // a colored border will work. also not actual boxes, line rectangles like
    // before are still fine."* He is right — the tint sat behind the noun and
    // fought it for contrast while adding nothing the border was not already
    // saying. The LANE COLOUR was the part worth keeping; the grid and the fill
    // were not. Pinned so the fill cannot creep back in.
    const mod = src('app', 'components', 'GatherModal.tsx');
    expect(mod).not.toContain("flexWrap: 'wrap'");
    expect(mod).not.toMatch(/flexBasis: '30%'/);
    // Full-width rows again, and every lane style is a BORDER with no fill.
    expect(/row: \{[^}]*flexDirection: 'row'[^}]*\}/s.test(mod)).toBe(true);
    expect(mod).toContain("backgroundColor: 'transparent'");
    for (const lane of ['Gear', 'Items', 'Scrap', 'Lead']) {
      const m = new RegExp(`row${lane}: \\{ borderColor: [A-Z]+ \\}`).test(mod);
      expect(m).toBe(true);   // borderColor ONLY — a backgroundColor here is the glow coming back
    }
  });

  it('⚠⚠ OTA-1237: the card GROWS with the room instead of scrolling inside a fixed box', () => {
    // Owner: *"we will have to make the layout popup taller when there are more
    // items."* The scroll was pinned at 380px, so a four-noun room and a
    // fourteen-noun room got the same window. flexShrink lets the list take what it
    // needs and the card's own 86% ceiling do the bounding.
    const mod = src('app', 'components', 'GatherModal.tsx');
    expect(mod).toContain('scroll: { flexShrink: 1 }');
    expect(mod).not.toMatch(/scroll: \{ maxHeight: \d+ \}/);
    expect(mod).toContain("maxHeight: '86%'");
  });

  it('⚠⚠ THE MARKS ARE BIG ENOUGH TO SEE — the OTA-1232 lesson, pinned as a number', () => {
    // OTA-1232 shipped these at fontSize 13 in #a2977b, the same muted tan as the
    // text beside them, and a full play session went by without them registering.
    // A mark the player does not notice is a mark that was not built.
    const mod = src('app', 'components', 'GatherModal.tsx');
    const m = /icon: \{ fontSize: (\d+)/.exec(mod);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(16);
    // And an upgrade colours the ROW, not only the glyph.
    expect(mod).toContain('rowUpgrade:');
    expect(mod).toContain('styles.rowUpgrade');
  });

  it('⚠⚠ SALVAGE ALL is visually SUBORDINATE — take is reversible, salvage is not', () => {
    // If the two bulk buttons ever look like peers, a mis-tap costs the room.
    const mod = src('app', 'components', 'GatherModal.tsx');
    const takeAll = /takeAllText: \{[^}]*fontSize: (\d+)[^}]*\}/.exec(mod);
    const salvageAll = /salvageAllText: \{[^}]*fontSize: (\d+)[^}]*\}/.exec(mod);
    expect(takeAll).not.toBeNull();
    expect(salvageAll).not.toBeNull();
    expect(Number(salvageAll![1])).toBeLessThan(Number(takeAll![1]));
  });
});

describe('OTA-1233 — the merge did not cost anything that was already working', () => {
  it('⚠⚠ BOTH tutorial beats still show their prop ALONE', () => {
    // The guided beats must not offer the room's real nouns beside the demo one
    // — playtest, pre-fix: "neither of those are the cudgel". Each beat used to
    // own its own picker; with one picker each must narrow the WHOLE list.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const block = screen.slice(screen.indexOf('<GatherModal'), screen.indexOf('onCancel={() => { Keyboard.dismiss(); setTakeOpen(false); }}'));
    expect(block).toContain("tutBeat === 'cudgel'");
    expect(block).toContain("tutBeat === 'scrap'");
    expect(block).toContain("noun: 'cudgel'");
    expect(block).toContain("noun: 'broken chest plate'");
  });

  it('⚠ the elevation filter survived — while up a climb you only see what you can reach', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const block = screen.slice(screen.indexOf('<GatherModal'), screen.indexOf('<GatherModal') + 2600);
    expect(block).toContain('reachableWhileElevated');
  });

  it('⚠⚠ bulk salvage still routes through the store path that spares takeables', () => {
    // OTA-1231's guard lives in salvageAllAmbient. The merged picker must use it
    // rather than rolling its own loop, or that fix quietly stops applying.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('salvageAllAmbient(nouns)');
    const store = src('app', 'state', 'gameStore.ts');
    const bulk = store.slice(store.indexOf('salvageAllAmbient(nouns) {'));
    expect(bulk.slice(0, 4000)).toContain('skippedTakeable');
  });

  it('⚠⚠ ONE action button now, and the tutorial can still drive it', () => {
    const input = src('app', 'components', 'InputBox.tsx');
    expect(input).toContain('label="take / salvage"');
    // Both overrides honoured — a beat that cannot be tapped is a stalled
    // tutorial, the one failure this merge must not introduce.
    expect(input).toContain('takeOverride ?? salvageOverride ?? onOpenTake');
    // ...and it only greys when NEITHER kind of thing is present.
    expect(input).toContain('blocked={takeBlocked && salvageBlocked}');
    // The old separate buttons are gone.
    expect(input).not.toContain('label="take"');
    expect(input).not.toContain('label="salvage"');
  });

  it('⚠⚠ OTA-1237: THE INTRO TEACHES THE BUTTON THAT EXISTS', () => {
    // Owner: *"we have to rework the intro now to reflect the new system."* Since
    // OTA-1233 the quick row carries ONE `take / salvage` button over ONE picker,
    // and both tutorial beats still said "Tap TAKE" / "Tap SALVAGE" — labels that
    // are not on the row. ⚠ The beats still WORKED, because the tutorial overrides
    // drive the merged button either way, which is the worst kind of stale copy:
    // not broken enough to fail anything, just wrong enough to strand a first-time
    // player hunting for a button on turn one.
    const steps = src('app', 'components', 'tutorialSteps.ts');
    const cudgel = steps.slice(steps.indexOf("id: 'cudgel'"), steps.indexOf("id: 'rope'"));
    const scrap = steps.slice(steps.indexOf("id: 'scrap'"), steps.indexOf("id: 'climb'"));
    for (const beat of [cudgel, scrap]) {
      expect(beat).toContain('TAKE / SALVAGE');
      // No instruction to tap a button that is not on the row.
      expect(beat).not.toMatch(/Tap TAKE\b(?! \/)/);
      expect(beat).not.toMatch(/Tap SALVAGE\b/);
    }
    // ...and the same for the blocked-tutorial nudges, which are what a stuck
    // player actually reads.
    const store = src('app', 'state', 'gameStore.ts');
    const hints = store.slice(store.indexOf('nudgeTutorialBlocked()'), store.indexOf('nudgeTutorialBlocked()') + 1400);
    expect(hints).not.toContain('glowing TAKE button');
    expect(hints).not.toContain('glowing SALVAGE button');
    expect(hints).toContain('TAKE / SALVAGE');
  });

  it('⚠⚠ OTA-1237: no refusal line points at a button that was retired', () => {
    // A refusal that names the wrong button is the same failure as the tutorial's,
    // and these fire far more often than the tutorial does.
    const port = src('app', 'engine', 'portability.ts');
    const store = src('app', 'state', 'gameStore.ts');
    for (const text of [port, store]) {
      expect(text).not.toContain('Try the SALVAGE button');
      expect(text).not.toContain('SALVAGE button.`');
    }
    expect(port).toContain('TAKE / SALVAGE');
  });

  it('⚠ the retired picker is retired, not orphaned — its predicate still has a job', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    // The COMPONENT import is gone...
    expect(screen).not.toContain('<TakeModal');
    expect(screen).not.toContain('<SalvageModal');
    // ...but isSalvageable still drives the action-button count, so the module
    // stays imported for that and only that.
    expect(screen).toContain('isSalvageable as isSalvageableForModal');
  });
});

describe('OTA-1234 — the picker never offers a verb that will find nothing', () => {
  // ⚠⚠ THE BUG, FROM THE OWNER'S DEVICE LOG, five taps in a row:
  //     tap "take / salvage"
  //     You look the firepit, marker, sack over and find nothing your tools
  //       can break down here.
  //     salvageAllAmbient: no pool matched for 4 noun(s) — firepit, marker,
  //       sack, stall.
  // OTA-1233 classified every non-catalog noun as scrap, so the button read
  // "⚒ SALVAGE 4 FIXTURES", the sweep found no pool, NOTHING was consumed, and
  // the count never dropped — it could be tapped forever, promising each time.
  // Owner: *"still showed salvage at 4 items but never let me salvage."*
  //
  // ⚠ `hasSalvageYield` was written the PREVIOUS OTA for exactly this
  // distinction — to stop the refusal copy advertising SALVAGE on nouns with no
  // pool — and the picker did not consult it. The prose knew; the button did not.
  const INERT = ['firepit', 'marker', 'sack', 'stall', 'signpost', 'tent', 'ladder'];

  it('⚠⚠ the four nouns from the log are not scrap, and not in the picker', () => {
    for (const noun of INERT) {
      expect(hasSalvageYield(noun)).toBe(false);
      expect(classifyGatherNoun(noun)).toBe('inert');
    }
    const text = renderRoom(INERT.map((noun) => ({ noun }))).join('|');
    // No blocks, no buttons, no lane headings, and the honest empty line instead.
    expect(text).toContain('picked clean');
    expect(text).not.toContain('SALVAGE');
    expect(text).not.toContain('TAKE ALL');
    for (const noun of INERT) expect(text).not.toContain(noun);
  });

  it('⚠⚠ RENDERED: the exact mixed room from the log counts 1 to salvage, not 4', () => {
    const text = renderRoom([
      { noun: 'firepit' }, { noun: 'marker' }, { noun: 'sack' }, { noun: 'stall' },
      { noun: 'banner' }, { noun: 'Aetheric Torch' },
    ]).join('|');
    expect(text).toContain('▪|Aetheric Torch');
    expect(text).toContain('⚒|banner');
    expect(text).toContain('TAKE ALL ITEMS (1)');
    expect(text).toContain('⚒ SALVAGE ALL (1)');
    expect(text).not.toContain('firepit');
  });

  it('⚠⚠ OTA-1235: an inert noun has NO LANE, so it can never be given a colour', () => {
    // In a colour-coded layout the inert bug would need a fourth hue that means
    // "this one does nothing" — the lane is null instead, and a null lane has
    // nowhere to render.
    for (const noun of INERT) expect(laneForKind(classifyGatherNoun(noun))).toBeNull();
    expect(laneForKind('weapon')).toBe('gear');
    expect(laneForKind('armor')).toBe('gear');
    expect(laneForKind('other')).toBe('items');
    expect(laneForKind('scenery')).toBe('scrap');
  });

  it('⚠ real scrap still IS scrap — the filter must not swing the other way', () => {
    for (const noun of ['bench', 'cart', 'banner', 'lamp', 'stone marker']) {
      expect(hasSalvageYield(noun)).toBe(true);
      expect(classifyGatherNoun(noun)).toBe('scenery');
    }
  });

  it('⚠⚠ EVERY row the picker offers can actually be acted on', () => {
    // The invariant, stated once: a row is present only if TAKE or SALVAGE will
    // do something. Anything else is a button that lies.
    const mixed = ['firepit', 'bench', 'Aetheric Torch', 'tent', 'Compact Blaster', 'cart'];
    for (const noun of mixed) {
      const kind = classifyGatherNoun(noun);
      if (!isActionableGatherKind(kind)) continue;
      const takeable = findCatalogItem(noun) !== null;
      const salvageable = hasSalvageYield(noun);
      expect(takeable || salvageable).toBe(true);
    }
  });
});
