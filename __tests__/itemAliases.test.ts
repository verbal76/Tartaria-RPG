import { resolveItemAlias, __TEST_ONLY__ } from '../app/engine/itemAliases';
import { findCatalogItem } from '../app/engine/crafting';

describe('item alias layer', () => {
  it('returns null for nouns with no alias mapping', () => {
    expect(resolveItemAlias('pillar')).toBeNull();
    expect(resolveItemAlias('mud')).toBeNull();
    expect(resolveItemAlias('silt')).toBeNull();
    expect(resolveItemAlias('')).toBeNull();
  });

  it('collapses lantern variants to Aetheric Torch', () => {
    expect(resolveItemAlias('lantern')).toBe('Aetheric Torch');
    expect(resolveItemAlias('dust lantern')).toBe('Aetheric Torch');
    expect(resolveItemAlias('frost lantern')).toBe('Aetheric Torch');
    expect(resolveItemAlias('broken lantern')).toBe('Aetheric Torch');
    expect(resolveItemAlias('torch')).toBe('Aetheric Torch');
  });

  it('collapses rope variants to Climbing Rope', () => {
    expect(resolveItemAlias('rope')).toBe('Climbing Rope');
    expect(resolveItemAlias('rope coil')).toBe('Climbing Rope');
    expect(resolveItemAlias('rope bundle')).toBe('Climbing Rope');
    expect(resolveItemAlias('frozen rope')).toBe('Climbing Rope');
  });

  it('collapses compass variants to Aetheric Compass', () => {
    expect(resolveItemAlias('compass')).toBe('Aetheric Compass');
    expect(resolveItemAlias('broken compass')).toBe('Aetheric Compass');
    expect(resolveItemAlias('lost echo compass')).toBe('Aetheric Compass');
  });

  it('case-insensitive', () => {
    expect(resolveItemAlias('LANTERN')).toBe('Aetheric Torch');
    expect(resolveItemAlias('Rope Coil')).toBe('Climbing Rope');
  });
});

describe('findCatalogItem with alias layer', () => {
  it('resolves ambient nouns to real catalog entries via aliases', () => {
    const lantern = findCatalogItem('frost lantern');
    expect(lantern).not.toBeNull();
    expect(lantern!.name).toBe('Aetheric Torch');

    const rope = findCatalogItem('rope coil');
    expect(rope).not.toBeNull();
    expect(rope!.name).toBe('Climbing Rope');

    const compass = findCatalogItem('broken compass');
    expect(compass).not.toBeNull();
    expect(compass!.name).toBe('Aetheric Compass');
  });

  it('still resolves exact catalog name matches directly', () => {
    const r = findCatalogItem('Rusted Blade');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('Rusted Blade');
  });

  it('returns null for genuine scene features', () => {
    expect(findCatalogItem('pillar')).toBeNull();
    expect(findCatalogItem('mud')).toBeNull();
    expect(findCatalogItem('horizon')).toBeNull();
    expect(findCatalogItem('arch')).toBeNull();
  });

  it('alias map has > 50 entries', () => {
    expect(Object.keys(__TEST_ONLY__.ALIAS_MAP).length).toBeGreaterThan(50);
  });
});
