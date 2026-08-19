// ⚠ PORTED FROM THE GOLEM LINE during the golem-parity pass. Golem is the model
// line, so its version of this suite is authoritative; the OTA numbers in the
// commentary below are GOLEM's, which is the honest provenance for where the
// behaviour being pinned was actually written.
// ⚠⚠ OTA-1317 — AND THIS TIME ON THE MODAL THE PLAYER ACTUALLY SEES.
//
// OTA-1312 recoloured `SalvageModal.tsx`. That file has had ZERO importers since
// OTA-1233 merged TakeModal + SalvageModal into ONE PICKER — GatherModal — and
// ExplorationScreen says so in a standing comment. So the amber landed on a
// component the game does not render, and the owner, on the very build that was
// supposed to contain it: *"remember the coloring we were going to be doing on
// the take /salvage screen?"* He was right. It was never on his screen.
//
// ⚠ The lesson is cheap and the test below is cheaper: a cosmetic change has to
// name the component that is MOUNTED, and "the file whose name matches the
// feature" is not that. These tests fail if the recolour ever drifts back onto a
// dead file.
import { readFileSync } from 'fs';
import { join } from 'path';
import { rarityHexColor } from '../app/components/InventoryCategorize';
import { findCatalogItem } from '../app/engine/crafting';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', 'app', ...p), 'utf8');
const GATHER = read('components', 'GatherModal.tsx');
const EXPLORATION = read('screens', 'ExplorationScreen.tsx');

describe('OTA-1317 — the picker the player opens is the one that changed', () => {
  it('⚠⚠ THE MISS: GatherModal is mounted; SalvageModal is not rendered anywhere', () => {
    expect(EXPLORATION).toContain('<GatherModal');
    // If this ever flips, the recolour has to move with it.
    expect(EXPLORATION).not.toContain('<SalvageModal');
  });

  it('⚠⚠ the lanes are amber — one hue, not four', () => {
    const code = GATHER.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).toContain("const LANE = '#c9a86a'");
    for (const dead of ['#b5773f', '#6f9c58', '#b0a04f', '#9a8cbb']) {
      expect(code).not.toContain(dead);
    }
  });

  it('⚠ IGNORE stays red — it is the one control that walks away from loot', () => {
    expect(GATHER).toContain("const IGNORE = '#94533f'");
  });

  it('⚠⚠ rows carry rarity on the LEFT EDGE, at the shop\'s weight', () => {
    expect(GATHER).toContain('rowRarityEdge(noun)');
    expect(GATHER).toContain('borderLeftWidth: 4');
    expect(GATHER).toContain('rarityHexColor(cat.rarity)');
  });

  it('⚠ only a row with a real rarity gets an edge — scenery keeps the neutral one', () => {
    // The helper's contract, exercised through the same catalog the picker uses.
    expect(findCatalogItem('rubble', { aliases: true })).toBeNull();
    const gear = findCatalogItem("Mud-Treader's Greaves", { aliases: true });
    expect(gear).not.toBeNull();
    expect(rarityHexColor(gear!.rarity)).toBe('#c9a86a');
  });

  it('⚠ the sort and the lane grouping are untouched — colour changed, order did not', () => {
    expect(GATHER).toContain("renderLane('gear'");
    expect(GATHER).toContain("renderLane('items'");
    expect(GATHER).toContain('TAKE ALL GEAR');
    expect(GATHER).toContain('sortGatherRows');
  });
});
