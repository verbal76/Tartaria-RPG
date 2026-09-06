/**
 * OTA-1722 — THE TRADER WHO FOLLOWED YOU (and did not).
 *
 * Owner: *"the stores and crucibles don't seem anchored to a tile anymore, when
 * I go into the next tile they are still there."*
 *
 * ⚠⚠⚠ THE ANCHORING WAS FINE, AND THE REPORT WAS STILL RIGHT. A probe walking
 * 118 real tiles — outdoors, peaceful, serpentine so no tile repeats — found
 * ZERO vendors surviving a step. `stepDirection` clears the vendor on every
 * cardinal move (POLISH-4) and `travelTo` rebuilds through `beginScene`. Nothing
 * follows anybody.
 *
 * ⚠⚠ WHAT THE PROBE ACTUALLY CAUGHT was this, two tiles apart:
 *
 *     step 101 @(74,10): vendor "Duvo Saltbeard" (roadside_honest_…3411)
 *     step 102 @(75,10): vendor "Duvo Saltbeard" (roadside_honest_…3424)
 *
 * Different id, same NAME, adjacent tiles. The old trader was cleared and a
 * brand-new one spawned who happens to be called the same thing — because
 * OTA-1055 gave each archetype TWELVE people, and twelve is small enough that
 * the same name lands on the next tile regularly. From the player's chair that
 * is a store that followed them. He reported the symptom exactly; the cause was
 * one layer down from where anyone would look for it.
 *
 * ⚠ SO THE FIX IS NAMING, NOT ANCHORING. A ring of the ten most recent roadside
 * names rides on worldMemory, and the picker steers around it. Measured after:
 * 197 tiles, 29 sightings, 23 distinct names, ZERO adjacent repeats. Names still
 * recur across a long walk — they should, there are only 24 traders on the
 * roads — but never one step apart.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { pickRoadsideTrader, ROADSIDE_NAME_MEMORY } from '../app/engine/vendors';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const people = (): string[] => {
  const d = JSON.parse(src('app', 'data', 'npcs', 'roadside_traders.json')) as
    { archetypes: { people?: string[] }[] };
  return d.archetypes.flatMap((a) => a.people ?? []);
};

describe('OTA-1722 — ⚠⚠⚠ the picker steers around who you just met', () => {
  it('a name in the recent ring is not handed out again', () => {
    // Drawn many times against a ring holding everything but a couple of names:
    // every draw has to come from what is left.
    const all = people();
    expect(all.length).toBeGreaterThanOrEqual(20);
    const keep = new Set([all[0]!, all[1]!, all[all.length - 1]!]);
    const recent = all.filter((n) => !keep.has(n));
    for (let i = 0; i < 60; i++) {
      const v = pickRoadsideTrader(recent);
      expect({ i, name: v.name, allowed: keep.has(v.name) }).toEqual({ i, name: v.name, allowed: true });
    }
  });

  it('⚠⚠ IT FAILS OPEN — a full ring returns a trader, never nothing', () => {
    // A stall that does not appear because the game ran out of names is a worse
    // bug than a repeated name, so the filter is what gets dropped.
    for (let i = 0; i < 20; i++) {
      const v = pickRoadsideTrader(people());
      expect(v).toBeTruthy();
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.offers.length).toBeGreaterThan(0);
    }
  });

  it('and no ring at all behaves exactly as before', () => {
    // Pre-feature saves have no ring. That has to read as "nothing to avoid".
    const names = new Set<string>();
    for (let i = 0; i < 80; i++) names.add(pickRoadsideTrader().name);
    expect(names.size).toBeGreaterThan(4);
  });

  it('⚠ the memory is smaller than the pool, so the draw can never starve', () => {
    // Ten against twenty-four leaves at least fourteen choices. A ring as large
    // as the pool would silently fall back to the unfiltered pool every time —
    // a feature that looks present and does nothing.
    expect(ROADSIDE_NAME_MEMORY).toBeLessThan(people().length);
    expect(people().length - ROADSIDE_NAME_MEMORY).toBeGreaterThanOrEqual(10);
  });
});

describe('OTA-1722 — ⚠⚠ the ring is written in ONE place', () => {
  const STORE = src('app', 'state', 'gameStore.ts');

  it('sightVendor records it — the funnel OTA-1055 built for exactly this', () => {
    // Recording at the two spawn sites would be two copies of one rule, which is
    // the shape this area of the file keeps paying for (OTA-1053, OTA-1055).
    const fn = STORE.slice(STORE.indexOf('function sightVendor('), STORE.indexOf('function applyTopicGrant('));
    expect(fn.includes("if ((vendor.id ?? '').startsWith('roadside_'))")).toBe(true);
    expect(fn.includes('recentRoadsideNames:')).toBe(true);
    expect(fn.includes('.slice(0, ROADSIDE_NAME_MEMORY)')).toBe(true);
  });

  it('both spawn sites read it', () => {
    expect(STORE.split('pickRoadsideTrader(get().worldMemory.recentRoadsideNames)').length - 1).toBe(2);
    expect(STORE.includes('pickRoadsideTrader(),')).toBe(false);
  });

  it('⚠ and a name already in the ring moves to the front rather than duplicating', () => {
    const fn = STORE.slice(STORE.indexOf('function sightVendor('), STORE.indexOf('function applyTopicGrant('));
    expect(fn.includes('.filter((n) => n !== vendor.name)')).toBe(true);
  });
});

describe('OTA-1722 — ⚠ what this OTA does NOT claim', () => {
  it('the anchoring is untouched — it was never the defect', () => {
    // The probe found zero vendors surviving a step BEFORE this change. Touching
    // the clear would have been a fix for a bug that did not exist, on top of
    // the one that did.
    const STORE = src('app', 'state', 'gameStore.ts');
    expect(STORE.includes("{ currentScene: { ...s.currentScene, vendor: null, elevatedOn: null } }")).toBe(true);
    expect(STORE.includes('vendors no longer follow the player')).toBe(true);
  });
});
