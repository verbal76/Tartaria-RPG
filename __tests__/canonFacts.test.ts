// OTA-232 — canon fact ingestion + picker contract.
//
// Validates that the 3 ingested data files load, have the expected
// shape, and that buildCanonFactsParagraph picks sensible matches
// for common scene keyword bags. Phase 2+ will lean on this contract
// when adding MiniLM-backed semantic lookup.

import {
  CANON_EVENTS,
  CANON_FOOD_DRINK,
  ARBITER_TITLES,
  buildCanonFactsParagraph,
  findArbiterTitle,
} from '../app/engine/canonFacts';

describe('OTA-232 — canon data files load with the expected shapes', () => {
  it('canon-events.json has all 18 historical events', () => {
    expect(CANON_EVENTS.length).toBe(18);
    for (const e of CANON_EVENTS) {
      expect(e.id).toMatch(/^[a-z0-9_]+$/);
      expect(typeof e.year).toBe('number');
      expect(e.title.length).toBeGreaterThan(3);
      expect(e.factions.length).toBeGreaterThan(0);
      expect(e.tags.length).toBeGreaterThan(0);
    }
  });

  it('canon-food-drink.json has all 20 items', () => {
    expect(CANON_FOOD_DRINK.length).toBe(20);
    for (const it of CANON_FOOD_DRINK) {
      expect(it.id).toMatch(/^[a-z0-9_]+$/);
      expect(['food', 'drink']).toContain(it.type);
      expect(typeof it.tcValue).toBe('number');
      expect(it.effect.length).toBeGreaterThan(5);
    }
  });

  it('arbiter-titles.json has all 20 titles', () => {
    expect(ARBITER_TITLES.length).toBe(20);
    for (const t of ARBITER_TITLES) {
      expect(t.id).toMatch(/^[a-z0-9_]+$/);
      expect(t.requirement.length).toBeGreaterThan(5);
      expect(t.perk.length).toBeGreaterThan(5);
      expect(t.tags.length).toBeGreaterThan(0);
    }
  });

  it('canon event tags are lowercase normalized', () => {
    for (const e of CANON_EVENTS) {
      for (const tag of e.tags) {
        expect(tag).toBe(tag.toLowerCase());
      }
    }
  });
});

describe('OTA-232 — buildCanonFactsParagraph picks contextually relevant events', () => {
  it('Berlin scene surfaces the 1998 Berlin Betrayal', () => {
    const para = buildCanonFactsParagraph({
      sceneKeywords: ['berlin', 'germany', 'wasteland'],
      hasVendor: false,
    });
    expect(para).not.toBeNull();
    expect(para!).toMatch(/1998/);
    expect(para!).toMatch(/Berlin Betrayal/);
  });

  it('Great Tartary Plains scene surfaces 1567 Fall of Tartaria', () => {
    const para = buildCanonFactsParagraph({
      sceneKeywords: ['great', 'tartary', 'plains', 'buried'],
      hasVendor: false,
    });
    expect(para).not.toBeNull();
    expect(para!).toMatch(/1567/);
  });

  it('mud dweller / vendor scene surfaces a mud-dweller-sourced food line', () => {
    const para = buildCanonFactsParagraph({
      sceneKeywords: ['mud', 'dweller', 'camp'],
      hasVendor: true,
    });
    expect(para).not.toBeNull();
    // Should include a canon food/drink line with TC value.
    expect(para!).toMatch(/TC/);
  });

  it('returns null for a scene with no matching tags + no vendor', () => {
    const para = buildCanonFactsParagraph({
      sceneKeywords: ['xyzzy', 'completely', 'unmatched'],
      hasVendor: false,
    });
    expect(para).toBeNull();
  });

  it('paragraph stays under 80 words (token-budget cap)', () => {
    const para = buildCanonFactsParagraph({
      sceneKeywords: ['berlin', 'mud', 'dweller'],
      hasVendor: true,
    });
    expect(para).not.toBeNull();
    const wc = para!.split(/\s+/).filter(Boolean).length;
    expect(wc).toBeLessThan(80);
  });

  it('faction id biases event pick toward events involving that faction', () => {
    // No location tags, but Reclaimer faction → should surface a
    // Reclaimer-involved event.
    const para = buildCanonFactsParagraph({
      sceneKeywords: [],
      hasVendor: false,
      playerFactionId: 'reclaimers',
    });
    expect(para).not.toBeNull();
    // Any Reclaimer event will mention either 'Reclaimer' or its year.
    expect(para!.toLowerCase()).toMatch(/reclaimer|guild/);
  });

  it('deterministic per scene — same keywords always pick the same food line', () => {
    const a = buildCanonFactsParagraph({
      sceneKeywords: ['mud', 'dweller', 'camp'],
      hasVendor: true,
    });
    const b = buildCanonFactsParagraph({
      sceneKeywords: ['mud', 'dweller', 'camp'],
      hasVendor: true,
    });
    expect(a).toBe(b);
  });
});

describe('OTA-232 — findArbiterTitle resolves by name or tag', () => {
  it('finds "Seeker of Lost Relics" by full title', () => {
    const t = findArbiterTitle('Seeker of Lost Relics');
    expect(t?.id).toBe('seeker_of_lost_relics');
  });

  it('finds "Aetheric Attuned" by partial substring', () => {
    const t = findArbiterTitle('aetheric');
    expect(t).not.toBeNull();
    // Could resolve to several aetheric-tagged titles; just assert non-null.
  });

  it('finds by tag', () => {
    const t = findArbiterTitle('stealth');
    expect(t?.id).toBe('shadow_diver');
  });

  it('returns null for unmatched query', () => {
    expect(findArbiterTitle('xyzzy_no_match')).toBeNull();
  });
});
