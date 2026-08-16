import { resolveItemAlias, __TEST_ONLY__ } from '../app/engine/itemAliases';
import { findCatalogItem } from '../app/engine/crafting';

describe('item alias layer', () => {
  it('returns null for nouns with no alias mapping', () => {
    expect(resolveItemAlias('pillar')).toBeNull();
    expect(resolveItemAlias('mud')).toBeNull();
    expect(resolveItemAlias('silt')).toBeNull();
    expect(resolveItemAlias('')).toBeNull();
  });

  it('⚠⚠ the LANTERN family is NOT an alias — a room lantern is not a free torch', () => {
    // Owner: *"reduce the free lantern spawn rate, they should be a rare find,
    // mostly crafted."* This family used to collapse to Aetheric Torch, and since
    // `lantern` is ordinary authored furniture that handed one over in every room
    // holding one — measured at five torches in about an hour of play. It also
    // undid OTA-752, which had already rationed the torch out of the salvage pools
    // as "a managed resource". A lantern is scenery now: SALVAGE it, and ~3% of the
    // time you get a working torch (salvagePools `light`, rareFind).
    for (const n of ['lantern', 'dust lantern', 'frost lantern', 'broken lantern', 'torch']) {
      expect(resolveItemAlias(n)).toBeNull();
    }
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
    expect(resolveItemAlias('Rope Coil')).toBe('Climbing Rope');
    expect(resolveItemAlias('Broken Compass')).toBe('Aetheric Compass');
  });
});

describe('findCatalogItem with alias layer', () => {
  it('resolves ambient nouns to real catalog entries via aliases', () => {
    // ⚠ 'frost lantern' USED to resolve here; see the lantern test above for why
    // the whole light family left. It stays in this suite as the negative case.
    expect(findCatalogItem('frost lantern')).toBeNull();

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
