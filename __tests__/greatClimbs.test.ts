// OTA-910 — The Great Climbs + the Skyreacher armor set.
//
// Five landmark climbs of 11–15 tiers that require the Hardened Climbing Strap
// to finish (you must rest on the way up); each summit hands a guaranteed piece
// of the Legendary Skyreacher set — AC+4, three heavy resistances each, the
// only armor authored with three resistance slots, and collect-only (no craft,
// no vendor, no meaningful sell). This pins the data + engine contract; the
// store-level climb/reward/title flow is covered by titles.test.ts and the
// climb handler wiring.

import {
  GREAT_CLIMBS,
  SKYREACHER_SET,
  greatClimbFor,
  greatClimbForLocation,
  greatClimbHeight,
  isGreatClimbNoun,
} from '../app/engine/greatClimbs';
import { climbHeightFor } from '../app/engine/climbHeight';
import { isClimbable } from '../app/engine/interactionTags';
import { ARMOR, findArmorByName, armorResistances } from '../app/engine/crafting';
import { sellPriceFor } from '../app/engine/sellPrice';
import type { InventoryItem } from '../app/engine/types';

describe('OTA-910 — great climb registry', () => {
  it('has five climbs, all above ten tiers (11–15), one per landmark', () => {
    expect(GREAT_CLIMBS).toHaveLength(5);
    const tiers = GREAT_CLIMBS.map((c) => c.tiers).sort((a, b) => a - b);
    expect(tiers).toEqual([11, 12, 13, 14, 15]);
    for (const c of GREAT_CLIMBS) expect(c.tiers).toBeGreaterThan(10);
    // Distinct landmark locations.
    expect(new Set(GREAT_CLIMBS.map((c) => c.locationId)).size).toBe(5);
  });

  it('resolves a great climb by canonical noun and by distinctive token', () => {
    expect(greatClimbFor('the Grand Spire of Etheria')?.id).toBe('grand_spire');
    // article-stripped / shortened forms still resolve via tokens
    expect(greatClimbFor('grand spire of etheria')?.id).toBe('grand_spire');
    expect(greatClimbFor("thametan's tower")?.id).toBe('thametan_tower');
    expect(greatClimbFor('the great obsidian monolith')?.id).toBe('obsidian_monolith');
    expect(greatClimbFor('the great fang of zharak')?.id).toBe('zharak_fang');
    expect(greatClimbFor('asgardar')?.id).toBe('asgardar_spire');
  });

  it('does NOT collide with the generic curated climbables that share a location', () => {
    // generic inside/outside props keep their small tier counts...
    expect(greatClimbFor('grand spire capacitor')).toBeNull();
    expect(greatClimbFor('obsidian pillar')).toBeNull();
    expect(greatClimbFor("zharak's teeth spire")).toBeNull();
    // ...and climbHeightFor returns their generic heights, not a great count
    expect(climbHeightFor('grand spire capacitor')).toBeLessThanOrEqual(5);
    expect(climbHeightFor('obsidian pillar')).toBeLessThanOrEqual(5);
  });

  it('location gate: a token only counts at its own landmark when a location is supplied', () => {
    expect(greatClimbFor('asgardar', 'asgardar')?.id).toBe('asgardar_spire');
    expect(greatClimbFor('asgardar', 'grand_spire_of_etheria')).toBeNull();
    expect(greatClimbForLocation('zharaks_teeth')?.id).toBe('zharak_fang');
    expect(greatClimbForLocation('nowhere')).toBeNull();
  });

  it('climbHeightFor + isClimbable recognise great-climb props with their real tier count', () => {
    for (const c of GREAT_CLIMBS) {
      expect(greatClimbHeight(c.noun)).toBe(c.tiers);
      expect(climbHeightFor(c.noun)).toBe(c.tiers);
      expect(isClimbable(c.noun)).toBe(true);
      expect(isGreatClimbNoun(c.noun)).toBe(true);
    }
  });
});

describe('OTA-910 — the Skyreacher armor set', () => {
  const pieces = SKYREACHER_SET.map((n) => findArmorByName(n));

  it('every great climb rewards a distinct Skyreacher piece', () => {
    expect(SKYREACHER_SET).toHaveLength(5);
    expect(new Set(SKYREACHER_SET).size).toBe(5);
    for (const p of pieces) expect(p).not.toBeNull();
  });

  it('each piece is Legendary AC+4 that resists cold as its baseline (OTA-912)', () => {
    for (const p of pieces) {
      expect(p!.rarity).toBe('Legendary');
      expect(p!.acBonus).toBe(4);
      // OTA-912 — baseline cold only; the other resist slots are left OPEN for
      // the player to fill by choice (coating vials → up to 3 addedResists).
      expect(p!.resistances).toEqual(['cold']);
      // collect-only, uncraftable, unbuyable. tcBuy is read loosely because the
      // engine-line CatalogArmor type doesn't declare it; the data carries it.
      expect(p!.tags).toContain('collect_only');
      expect((p as unknown as { tcBuy?: number }).tcBuy).toBe(0);
    }
  });

  it('covers head/chest/cloak/feet/hands and NEVER legs (left free for the climbing strap)', () => {
    // OTA-911 — the Hardened Climbing Strap now occupies the LEGS slot, so the
    // set piece that used to be legs (Greaves) moved to the cloak slot (Mantle).
    // The full set + strap can then be worn together during the climb.
    const slots = pieces.map((p) => p!.slot).sort();
    expect(slots).toEqual(['chest', 'cloak', 'feet', 'hands', 'head']);
    expect(slots).not.toContain('legs');
  });

  it('the Legendary ladder is SUPPRESSED for Skyreacher — effective resist stays just cold, leaving slots open', () => {
    for (const p of pieces) {
      // OTA-912 — armorResistances returns only the authored baseline (cold); the
      // rarity ladder does NOT top it up, so the 3 coating slots stay choosable.
      expect(armorResistances(p!)).toEqual(['cold']);
    }
    // A non-Skyreacher Legendary still gets laddered up to its full 3 fixed resists.
    const otherLeg = ARMOR.find((a) => a.rarity === 'Legendary' && !(a.tags ?? []).some((t) => t.toLowerCase() === 'skyreacher'));
    expect(otherLeg).toBeDefined();
    expect(armorResistances(otherLeg!).length).toBeGreaterThanOrEqual(3);
  });

  it('collect-only gear cannot be meaningfully sold (nominal 1 TC)', () => {
    const item: InventoryItem = {
      id: 'sky_test',
      name: 'Skyreacher Crown',
      kind: 'armor',
      rarity: 'Legendary',
      quantity: 1,
      tags: ['armor', 'head', 'skyreacher', 'legendary', 'collect_only'],
    };
    expect(sellPriceFor(item, null)).toBe(1);
  });
});
