// OTA-941 — owner request: the Iron Spider's parts join the promoted materials.
// Its two authored drops were still generic trophies after the OTA-962 pass; they are
// now real Uncommon machine materials, at the Iron Spider's own tier.
import { resolveLootItem, MATERIALS } from '../app/engine/crafting';

describe('OTA-941 — Iron Spider materials', () => {
  it('Iron Fangs and Spider Mechanism are authored Uncommon machine materials', () => {
    for (const name of ['Iron Fangs', 'Spider Mechanism']) {
      const m = MATERIALS.find((x) => x.name === name);
      expect(m?.rarity).toBe('Uncommon');
      expect(m?.tags).toContain('machine');
      const r = resolveLootItem(name, 'Uncommon' as never);
      expect(r.name).toBe(name);
      expect(r.tags).not.toContain('trophy');
    }
  });
});
