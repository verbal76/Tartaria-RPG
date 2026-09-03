// OTA-938 — canonical loot resolution + rarity-aware trophy fallback.
// The audit's SEV-1: 136 of ~190 authored loot names exist in no catalog and the
// exact-match chain minted each as a 2-TC tagless Common misc — so every trophy from
// a big kill was identical junk and the Legendary tier inverted (organic Legendaries
// worth less than machine ones). resolveLootItem closes the whole class:
// catalog-canonical (case/alias-tolerant) when known, trophy at the ENEMY'S rarity
// when not. The sweep below locks the epidemic shut against future data.
import { resolveLootItem, MATERIALS } from '../app/engine/crafting';
import enemiesData from '../app/data/enemies/enemies.json';

type EnemyRow = { name: string; rarity?: string; loot?: string[] };
const enemies: EnemyRow[] = enemiesData as unknown as EnemyRow[];

describe('OTA-938 resolveLootItem', () => {
  it('an exact catalog name resolves to its real row', () => {
    const r = resolveLootItem('Aether Dust');
    expect(r.name).toBe('Aether Dust');
    expect(r.kind).toBe('misc');
    expect(r.tags).not.toContain('trophy');
  });

  it('a miscapitalized name lands on the canonical, STACKABLE catalog name', () => {
    expect(resolveLootItem('aether dust').name).toBe('Aether Dust');
    expect(resolveLootItem('AETHER DUST').name).toBe('Aether Dust');
  });

  it("the Aetherwing/Aether Wing split is healed by alias", () => {
    expect(resolveLootItem('Aetherwing').name).toBe('Aether Wing');
    expect(MATERIALS.some((m) => m.name === 'Aether Wing')).toBe(true);
  });

  it("an unknown trophy prices at the ENEMY'S rarity, tagged 'trophy'", () => {
    const r = resolveLootItem('Totally Unknown Fang', 'Legendary' as never); // OTA-1642: Aether Fang is authored now
    expect(r.rarity).toBe('Legendary');
    expect(r.tags).toEqual(['trophy']);
    expect(r.kind).toBe('misc');
  });

  it('no enemy rarity given -> Common trophy (never undefined)', () => {
    const r = resolveLootItem('Totally Unknown Thing');
    expect(r.rarity).toBe('Common');
    expect(r.tags).toEqual(['trophy']);
  });

  it('SWEEP: no loot name in the enemy data can mint the old tagless-Common fallback again', () => {
    for (const e of enemies) {
      for (const lootName of e.loot ?? []) {
        const r = resolveLootItem(lootName, (e.rarity ?? 'Common') as never);
        expect(r.rarity).toBeTruthy();
        // the epidemic signature: misc + Common + no tags, from a non-Common enemy
        if ((e.rarity ?? 'Common') !== 'Common') {
          const oldEpidemic = r.kind === 'misc' && r.rarity === 'Common' && r.tags.length === 0;
          expect(oldEpidemic).toBe(false);
        }
      }
    }
  });
});
