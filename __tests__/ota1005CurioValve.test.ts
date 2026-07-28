// OTA-1005 — the CURIO VALVE. The Fusing Crucible was built (OTA-193/194/195) to
// give catalog-ABSENT "inferred" junk a destiny, from the owner's own challenge:
// "we are generating an endless stream of items that will never have a real
// use." Two later cleanups starved it — arb61 filtered salvage output down to
// materials.json names (all catalog items, so salvage produced ZERO Crucible
// fuel), and the standing backfill practice kept converting what fuel remained
// into catalog rows. This suite locks the valve open AND locks the drain shut.
import curiosData from '../app/data/relics/curios.json';
import { rollSalvagePool } from '../app/engine/salvagePools';
import { isForgeReservableItem, fusionMaterialTags, gateFusion } from '../app/engine/itemFusion';
import { isInferredItem, lookupCraftedItem } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

const CURIOS = (curiosData as { curios: { name: string; rarity: string }[] }).curios;

/** Build the inventory item a curio actually becomes when salvage grants it —
 *  same path gameStore uses (lookupCraftedItem for kind + tags). */
function asItem(name: string, rarity = 'Common', id = 'c'): InventoryItem {
  const look = lookupCraftedItem(name);
  return {
    id, name, kind: look.kind, quantity: 1, rarity,
    tags: look.tags ?? [], reservedForFusion: true,
  } as unknown as InventoryItem;
}

describe('OTA-1005 — curios refuel the Crucible', () => {
  it('THE DRAIN LOCK: every curio is catalog-ABSENT — never backfill these', () => {
    // If this fails, someone added a curio to materials.json (or any catalog).
    // That silently retires it as Crucible fuel — the exact drift that starved
    // the feature over ~900 OTAs. Remove the catalog row, don't relax this test.
    const leaked = CURIOS.filter((c) => !isInferredItem(c.name)).map((c) => c.name);
    expect(leaked).toEqual([]);
  });

  it('every curio is forge-reservable and carries a real material', () => {
    const broken = CURIOS
      .map((c) => ({ c, item: asItem(c.name, c.rarity) }))
      .filter(({ item }) => !isForgeReservableItem(item) || fusionMaterialTags(item).length === 0)
      .map(({ c }) => c.name);
    expect(broken).toEqual([]);
  });

  it('the pool spans every material family, so a diverse set is reachable', () => {
    const fams = new Set(CURIOS.flatMap((c) => fusionMaterialTags(asItem(c.name))));
    for (const need of ['metal', 'fiber', 'organic', 'crystal', 'stone', 'wood', 'cloth']) {
      expect([...fams]).toContain(need);
    }
  });

  it('salvage actually yields curios — and roughly at the authored rate', () => {
    const names = new Set(CURIOS.map((c) => c.name));
    let curioHits = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      // Deterministic-ish sweep across the rng space so the rate is measurable.
      let calls = 0;
      const seq = [(i % 100) / 100, ((i * 7) % 100) / 100, ((i * 13) % 100) / 100, 0.5, 0.5, 0.5];
      const out = rollSalvagePool('crate', () => seq[calls++ % seq.length]!);
      if (out?.itemName && names.has(out.itemName)) curioHits++;
    }
    // 18% authored; the driver above is not a true uniform rng, so assert the
    // BEHAVIOUR (curios really drop, and don't take over) with wide margins.
    expect(curioHits).toBeGreaterThan(0);
    expect(curioHits).toBeLessThan(N * 0.6);
  });

  it('a curio roll reads as a curio — poolId and flavor say so', () => {
    // Step the rng: past the 5% consolation branch, then into the curio roll.
    const seq = [0.9, 0.01, 0, 0];
    let n = 0;
    const out = rollSalvagePool('crate', () => seq[Math.min(n++, seq.length - 1)]!);
    expect(out?.poolId).toBe('curio');
    expect(out?.itemName).toBeTruthy();
    expect(new Set(CURIOS.map((c) => c.name)).has(out!.itemName!)).toBe(true);
    expect(out!.line.length).toBeGreaterThan(10);
  });

  it('THE POINT: three salvaged curios can clear the Crucible gate', () => {
    // One from three different families — exactly what a couple of salvage
    // sweeps now hands you, and what the bench has always demanded.
    const inv = [
      asItem('Brass Cog Cluster', 'Common', 'a'),   // metal
      asItem('Knotted Sinew Braid', 'Common', 'b'), // fiber
      asItem('Split Slate Piece', 'Common', 'c'),   // stone
    ];
    const gate = gateFusion(inv);
    expect(gate.ok).toBe(true);
    expect(gate.tagProfile.length).toBeGreaterThanOrEqual(3);
  });

  it('a multi-material curio pulls its weight toward the diversity gate', () => {
    // 'Iron-Pinned Plank Shard' alone covers metal + wood + crystal.
    expect(fusionMaterialTags(asItem('Iron-Pinned Plank Shard')).length).toBeGreaterThanOrEqual(3);
  });

  it('the ordinary salvage economy still works — catalog materials keep dropping', () => {
    const curioNames = new Set(CURIOS.map((c) => c.name));
    let material = 0;
    for (let i = 0; i < 200; i++) {
      const out = rollSalvagePool('crate', () => 0.9); // past the curio + nothing rolls
      if (out?.itemName && !curioNames.has(out.itemName)) material++;
    }
    expect(material).toBe(200);
  });
});
