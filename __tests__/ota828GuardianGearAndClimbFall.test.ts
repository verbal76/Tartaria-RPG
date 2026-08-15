// OTA-808 — two device-log fixes.
//   (1) Core Guardian reward gear was cosmetic-only: the weapon() helper dropped
//       the `damage` param and set no damageType/stat, and neither weapon nor armor
//       carried uniqueStats or a catalog row — so getEquippedWeapon/aggregateArmor
//       couldn't resolve them. "Atalan's Trident can't be used as a weapon." Now
//       both carry uniqueStats, so the whole 9-weapon / 9-armor set actually works.
//   (2) (covered by ota828ClimbFallReset via the store — this file locks the pure
//       Guardian-gear resolution.)

import { dropsForCapital } from '../app/engine/coreGuardians';
import { getEquippedWeapon } from '../app/engine/combatRules';
import type { PlayerCharacter } from '../app/engine/types';

describe('OTA-808 — Core Guardian weapons are real, usable weapons', () => {
  it("Atalan's Trident carries its damage dice + a derived type/stat", () => {
    const drop = dropsForCapital('samarran');
    expect(drop).not.toBeNull();
    const w = drop!.weapon;
    expect(w.name).toBe("Atalan's Trident");
    expect(w.uniqueStats?.kind).toBe('weapon');
    expect(w.uniqueStats?.damageDice).toBe('1d10+2');
    expect(w.uniqueStats?.damageType).toBe('piercing'); // from the 'piercing' tag
    expect(w.uniqueStats?.scalesWith).toBe('strength');
  });

  it('getEquippedWeapon resolves the Trident from inventory + equipped (was barehanded)', () => {
    const w = dropsForCapital('samarran')!.weapon;
    const player = {
      inventory: [w],
      equipped: { main: w.name, mainId: w.id },
    } as unknown as PlayerCharacter;
    const resolved = getEquippedWeapon(player, 'main');
    expect(resolved).not.toBeNull();
    expect(resolved!.damageDice).toBe('1d10+2');
    expect(resolved!.damageType).toBe('piercing');
    expect(resolved!.stat).toBe('strength');
  });

  it('the Giant-tomb staff derives COLD damage (ties into the new cold type)', () => {
    const w = dropsForCapital('yuldra_tul')!.weapon; // Hierophant's Staff, tag cold_damage
    expect(w.uniqueStats?.damageType).toBe('cold');
  });

  it('Guardian armor carries its AC + slot via uniqueStats (was 0 AC)', () => {
    const a = dropsForCapital('samarran')!.armor; // Drowned Mantle, AC 3, chest
    expect(a.uniqueStats?.kind).toBe('armor');
    expect(a.uniqueStats?.acBonus).toBe(3);
    expect(a.uniqueStats?.armorSlot).toBe('chest');
  });

  it('a fresh drop is not mistaken for a Crucible fusion (keeps its name, no fused tag)', () => {
    const w = dropsForCapital('samarran')!.weapon;
    expect((w.tags ?? []).map((t) => t.toLowerCase())).toContain('core_guardian_set');
    expect((w.tags ?? []).map((t) => t.toLowerCase())).not.toContain('fused');
  });
});
