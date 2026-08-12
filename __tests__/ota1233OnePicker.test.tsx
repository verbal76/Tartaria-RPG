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

describe('OTA-1233 — one picker shows the whole room', () => {
  it('⚠⚠ RENDERED: loot and scrap appear in ONE list, sorted, verb per row', () => {
    const text = renderRoom(ROOM).join('|');
    // Takeables first, in kind order, each headed for the pack...
    expect(text).toContain('⚔|Compact Blaster|→ pack');
    expect(text).toContain('🛡|Aetherbound Mask|→ pack');
    expect(text).toContain('◆|Aetheric Torch|→ pack');
    // ...then scenery, marked as scrap.
    expect(text).toContain('⚒|bench|scrap');
    expect(text).toContain('⚒|rusted royal vault pedestal|scrap');
    // And the order really is loot-then-scrap, not interleaved.
    expect(text.indexOf('Compact Blaster')).toBeLessThan(text.indexOf('bench'));
  });

  it('⚠⚠ RENDERED: both bulk buttons COUNT, and count DIFFERENT things', () => {
    const text = renderRoom(ROOM).join('|');
    // 3 takeables, 2 fixtures — a bulk action whose size you learn only after
    // committing is one players stop trusting, and the count catches a mis-tap.
    expect(text).toContain('TAKE ALL (|3|)');
    expect(text).toContain('⚒ SALVAGE |2| |FIXTURES');
  });

  it('⚠ RENDERED: singular reads as a sentence, not as a template', () => {
    const text = renderRoom([{ noun: 'bench' }]).join('|');
    expect(text).toContain('⚒ SALVAGE |1| |FIXTURE');
    expect(text).not.toContain('FIXTURES');
  });

  it('⚠ RENDERED: a picked-clean room says so instead of showing an empty list', () => {
    const text = renderRoom([]).join('|');
    expect(text).toContain('picked clean');
    expect(text).not.toContain('TAKE ALL');
    expect(text).not.toContain('SALVAGE');
  });

  it('⚠ RENDERED: a room of pure scrap offers no TAKE ALL, and vice versa', () => {
    const scrapOnly = renderRoom([{ noun: 'bench' }, { noun: 'wall' }]).join('|');
    expect(scrapOnly).not.toContain('TAKE ALL');
    expect(scrapOnly).toContain('SALVAGE');
    const lootOnly = renderRoom([{ noun: 'Compact Blaster' }]).join('|');
    expect(lootOnly).toContain('TAKE ALL');
    expect(lootOnly).not.toContain('SALVAGE |');
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
    expect(mod).toContain('upgrade && styles.rowUpgrade');
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
