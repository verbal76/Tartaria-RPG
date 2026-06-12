import { getItemPreview } from '../app/components/itemPreview';

// arb-fix — food/consumables surface their restore value in the inventory
// preview. Trail Rations was originally effect-less (the eat handler healed a
// default 2d6 HP); it (and the rest of the food catalog) has since been given a
// structured effect block, so the preview now shows the exact authored values.
// The 2d6 fallback survives only for the rare consumable the inference can't
// resolve any restore for at all.
describe('consumable restore preview', () => {
  it('Trail Rations surfaces its structured +6 HP / +3 stamina heal', () => {
    const p = getItemPreview('Trail Rations');
    const restore = p.stats.find((s) => s.startsWith('Restores:'));
    expect(restore).toBeDefined();
    expect(restore).toMatch(/\+6 HP/);
    expect(restore).toMatch(/\+3 stamina/);
    expect(restore).not.toMatch(/2d6/);
  });

  it('First Aid Kit still shows its structured +25 HP (not the 2d6 fallback)', () => {
    const p = getItemPreview('First Aid Kit');
    const restore = p.stats.find((s) => s.startsWith('Restores:'));
    expect(restore).toMatch(/\+25 HP/);
    expect(restore).not.toMatch(/2d6/);
  });

  it('a structured food (healHP declared) keeps its exact value', () => {
    // gear.json foods declare e.g. healHP:2 — must show "+N HP", not 2d6.
    const onion = getItemPreview('Wild Onion');
    const restore = onion.stats.find((s) => s.startsWith('Restores:'));
    expect(restore).toBeDefined();
    expect(restore).not.toMatch(/2d6/);
    expect(restore).toMatch(/\+\d+ HP/);
  });
});
