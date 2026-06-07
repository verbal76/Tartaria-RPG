import { getItemPreview } from '../app/components/itemPreview';

// arb-fix — Trail Rations (and other effect-less food) showed no restore value
// in the inventory; the eat handler heals a default 2d6 HP. The preview now
// surfaces that. Structured-effect foods are unchanged.
describe('consumable restore preview', () => {
  it('Trail Rations surfaces the default 2d6 HP food heal', () => {
    const p = getItemPreview('Trail Rations');
    const restore = p.stats.find((s) => s.startsWith('Restores:'));
    expect(restore).toBeDefined();
    expect(restore).toMatch(/2d6 HP/);
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
