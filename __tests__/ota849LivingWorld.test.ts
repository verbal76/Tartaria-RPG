// OTA-849 [living world] — pins the pure World-Pulse "teeth" helpers: the tide→
// price curve, the escalating raid-size curve, raider selection (a rival of a
// faction you favor, most-ascendant wins), the kill→rival routing, and the fix
// that keeps phantom pseudo-ids out of the tide map.

import {
  tideVendorPriceMult,
  raidPartySize,
  pickRaid,
  strongestRivalOf,
  nextWorldTide,
  type FactionMeta,
} from '../app/engine/worldPulse';

const FACTIONS: FactionMeta[] = [
  { id: 'order', name: 'Forgotten Order', rivals: ['monarchs', 'not_a_real_faction'], allies: [] },
  { id: 'monarchs', name: 'Mud Monarchs', rivals: ['order', 'tartarians'], allies: ['architects_pseudo'] },
  { id: 'tartarians', name: 'True Tartarians', rivals: ['monarchs'], allies: [] },
];

describe('OTA-849 — tideVendorPriceMult', () => {
  it('is 1.0 at neutral, ±20% at the extremes, and clamps', () => {
    expect(tideVendorPriceMult(0)).toBeCloseTo(1.0);
    expect(tideVendorPriceMult(5)).toBeCloseTo(1.2);
    expect(tideVendorPriceMult(-5)).toBeCloseTo(0.8);
    expect(tideVendorPriceMult(99)).toBeCloseTo(1.2); // clamped to +5
    expect(tideVendorPriceMult(undefined)).toBeCloseTo(1.0);
  });
});

describe('OTA-849 — raidPartySize escalates with ascendancy', () => {
  it('a quiet faction sends 2; an ascendant one fields up to 5', () => {
    expect(raidPartySize(0)).toBe(2);
    expect(raidPartySize(2)).toBe(3);
    expect(raidPartySize(5)).toBe(5);
    expect(raidPartySize(99)).toBe(5); // capped
    expect(raidPartySize(-3)).toBe(2); // waning still fields a minimum party
  });
});

describe('OTA-849 — pickRaid', () => {
  it('sends a rival of a faction you favor', () => {
    const standings = [{ factionId: 'order', standing: 30 }]; // favor the Order
    const plan = pickRaid(FACTIONS, standings, {});
    // Order's only REAL rival is monarchs → they raid.
    expect(plan?.raiderId).toBe('monarchs');
    expect(plan?.provokedAllyId).toBe('order');
    expect(plan?.partySize).toBeGreaterThanOrEqual(2);
  });

  it('the most ASCENDANT eligible rival is chosen', () => {
    // Favor both order (rival monarchs) and tartarians (rival monarchs) — same rival;
    // give monarchs a high tide → still them, and party size escalates with it.
    const standings = [
      { factionId: 'order', standing: 25 },
      { factionId: 'tartarians', standing: 25 },
    ];
    const plan = pickRaid(FACTIONS, standings, { monarchs: 4 });
    expect(plan?.raiderId).toBe('monarchs');
    expect(plan?.partySize).toBe(raidPartySize(4));
  });

  it('never picks a faction you favor as the raider', () => {
    // Favor both order and monarchs. Monarchs is favored → never the raider even
    // though it's order's rival. Monarchs' own rival tartarians (unfavored) is the
    // one who comes for you.
    const standings = [
      { factionId: 'order', standing: 25 },
      { factionId: 'monarchs', standing: 25 },
    ];
    const plan = pickRaid(FACTIONS, standings, {});
    expect(plan?.raiderId).not.toBe('monarchs'); // a favored faction is never the raider
    expect(plan?.raiderId).not.toBe('order');
    expect(plan?.raiderId).toBe('tartarians');
  });

  it('returns null with no positive standings', () => {
    expect(pickRaid(FACTIONS, [], {})).toBeNull();
    expect(pickRaid(FACTIONS, [{ factionId: 'order', standing: 5 }], {})).toBeNull(); // below threshold
  });
});

describe('OTA-849 — strongestRivalOf', () => {
  it('returns the real rival the player stands highest with', () => {
    // monarchs rivals: order, tartarians. Player stands higher with tartarians.
    const standings = [
      { factionId: 'order', standing: 5 },
      { factionId: 'tartarians', standing: 40 },
    ];
    expect(strongestRivalOf(FACTIONS, 'monarchs', standings)).toBe('tartarians');
  });
  it('ignores pseudo-ids and returns null when there are no real rivals', () => {
    expect(strongestRivalOf(FACTIONS, 'tartarians', [])).toBe('monarchs');
    expect(strongestRivalOf([{ id: 'x', name: 'X', rivals: ['ghost'] }], 'x', [])).toBeNull();
  });
});

describe('OTA-849 — nextWorldTide filters phantom ids', () => {
  it('does not create momentum entries for pseudo-ids', () => {
    // tickIndex 0 → mover is FACTIONS[0] = order, whose rivals include the phantom.
    const r = nextWorldTide(FACTIONS, {}, 0);
    expect(r.moverId).toBe('order');
    expect(r.tides.order).toBe(1);
    expect(r.tides.monarchs).toBe(-1);          // real rival moved
    expect('not_a_real_faction' in r.tides).toBe(false); // phantom skipped
  });
});
