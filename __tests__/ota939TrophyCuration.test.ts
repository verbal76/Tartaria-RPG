// OTA-939 — the curated trophy pass: 35 iconic boss/creature trophies promoted from
// rarity-priced fallback trophies to REAL authored materials, + the provable
// Aetheric<->Aether synonym aliases. Everything else uncatalogued deliberately stays
// a trophy (sharing one word does not make two items the same thing).
import { resolveLootItem, MATERIALS } from '../app/engine/crafting';

const PROMOTED_LEGENDARY = [
  'Aether Core', 'Aether Pearl', 'Aetheric Core', 'Aetheric Heart', 'Aetheric Mud Heart',
  'Core Relic', 'Demon Core', 'Dragon Scale', 'Elemental Core', 'Guardian Core',
  'Hydra Core', 'Kraken Ink', 'Leviathan Fang', 'Leviathan Scale', 'Phoenix Feather',
  'Sentinel Core', 'Siren Crystal', 'Thunder Core', 'Titan Core', 'Wyvern Scale',
];
const PROMOTED_RARE = [
  'Aetheric Fang', 'Aetheric Gem', 'Beast Fang', 'Clockwork Core', 'Crystal Core',
  'Drake Scale', 'Harpy Feather', 'Phantom Core', 'Serpent Fang', 'Serpent Scale',
  'Shadow Core', 'Silt Heart', 'Siren Scale', 'Steam Core', 'Wraith Essence',
];

describe('OTA-939 — promoted trophy materials are real catalog rows', () => {
  for (const name of PROMOTED_LEGENDARY) {
    it(`${name} is an authored Legendary material (no longer a fallback trophy)`, () => {
      const m = MATERIALS.find((x) => x.name === name);
      expect(m?.rarity).toBe('Legendary');
      const r = resolveLootItem(name, 'Common' as never);
      expect(r.rarity).toBe('Legendary'); // catalog wins over the enemy-rarity fallback
      expect(r.tags).not.toContain('trophy');
    });
  }
  for (const name of PROMOTED_RARE) {
    it(`${name} is an authored Rare material`, () => {
      const m = MATERIALS.find((x) => x.name === name);
      expect(m?.rarity).toBe('Rare');
      expect(resolveLootItem(name).tags).not.toContain('trophy');
    });
  }
});

describe('OTA-939 — provable synonym aliases', () => {
  it('Aetheric Residue / Aetheric Crystal land on their Aether-prefixed catalog rows', () => {
    expect(resolveLootItem('Aetheric Residue').name).toBe('Aether Residue');
    expect(resolveLootItem('Aetheric Crystal').name).toBe('Aether Crystal');
  });

  it('a merely word-sharing name still (correctly) stays a trophy', () => {
    const r = resolveLootItem('Totally Unknown Fang', 'Uncommon' as never); // OTA-1642: Aether Fang is authored now
    expect(r.tags).toEqual(['trophy']);
  });
});
