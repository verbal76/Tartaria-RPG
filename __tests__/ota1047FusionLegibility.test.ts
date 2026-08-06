// OTA-1047 — FUSION LEGIBILITY. Owner, reading 29 identical ♥ rows: "they are
// all too alike, there isn't 3 different kinds here?" — then a fee denial he
// only met AFTER tapping. Locks: (1) inventory rows surface the SAME material
// kinds the diversity gate counts; (2) the vendor Crucible button says the fee
// and the balance before the tap; (3) the row helper mirrors the gate exactly.
import * as fs from 'fs';
import * as path from 'path';
import { gateFusion, fusionMaterialTags } from '../app/engine/itemFusion';

const inv = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'InventoryScreen.tsx'), 'utf8');
const vend = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'VendorScreen.tsx'), 'utf8');

describe('OTA-1047 — SOURCE LOCKS (category: legibility reaches the screen)', () => {
  it('forge-reservable inventory rows carry their material kinds', () => {
    expect(inv).toMatch(/isForgeReservableItem\(item\) && \(/);
    expect(inv).toMatch(/fusionMaterialTags\(item\)\.join/);
  });
  it('the vendor Crucible button states fee + balance when short', () => {
    expect(vend).toMatch(/you have \$\{player\?\.tc \?\? 0\}/);
    expect(vend).toMatch(/crucibleBtnShort/);
  });
});

describe('OTA-1047 — the row label mirrors the diversity gate', () => {
  const mk = (id: string, name: string, tags: string[]) =>
    ({ id, name, quantity: 1, reservedForFusion: true, tags } as any);
  it('a 3-kind spread passes with exactly the kinds the rows would show', () => {
    const pile = [
      mk('a', 'Flint Core Nodule', ['stone']),
      mk('b', 'Moth Wing', ['trophy', 'loot', 'organic']),
      mk('c', 'Amber Droplet', ['crystal']),
    ];
    const rowKinds = new Set(pile.flatMap((i) => fusionMaterialTags(i)));
    const gate = gateFusion(pile);
    expect(gate.ok).toBe(true);
    expect(new Set(gate.tagProfile)).toEqual(rowKinds);
  });
  it('a same-kind trio still refuses, with the reason naming the spread', () => {
    const pile = [
      mk('a', 'Moth Wing', ['trophy', 'loot', 'organic']),
      mk('b', 'Raven Feather', ['trophy', 'loot', 'organic']),
      mk('c', 'Slug Slime', ['trophy', 'loot', 'organic']),
    ];
    const gate = gateFusion(pile);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/too alike/);
  });
});
