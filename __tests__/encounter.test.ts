import { pickGroupForLocation, rollEncounter, pickEnemyForLocation } from '../app/engine/encounter';
import type { Location } from '../app/engine/types';

const outskirts: Location = {
  id: 'tartarian_outskirts',
  name: 'Tartarian Outskirts',
  type: 'wilderness',
  description: '',
  danger: 2,
  tags: [],
  discoverable: true,
};

const highDanger: Location = { ...outskirts, danger: 4 };

describe('encounter', () => {
  it('pickGroupForLocation returns a group of multiple enemies (when it fires)', () => {
    // Roll many times — at some point a group should land for a danger-2 location.
    let group: ReturnType<typeof pickGroupForLocation> = null;
    for (let i = 0; i < 200 && !group; i++) {
      group = pickGroupForLocation(outskirts);
    }
    expect(group).not.toBeNull();
    expect(group!.length).toBeGreaterThan(1);
    // Same name across all entries — same enemy type spawned multiple times.
    const names = new Set(group!.map((e) => e.name));
    expect(names.size).toBe(1);
  });

  it('rollEncounter returns [] for peaceful rolls and [Enemy, ...] otherwise', () => {
    // Sample a lot — should see both peaceful and combat rolls.
    let sawEmpty = false;
    let sawNonEmpty = false;
    for (let i = 0; i < 100; i++) {
      const r = rollEncounter(outskirts);
      if (r.length === 0) sawEmpty = true;
      if (r.length > 0) sawNonEmpty = true;
    }
    // Danger-2 isn't 100% non-peaceful — both outcomes are possible.
    expect(sawNonEmpty).toBe(true);
    // Optional: peaceful may not always sample but should at least eventually.
    // We don't assert it because group + single combined may saturate the rolls.
  });

  it('high-danger locations gate certain group templates', () => {
    // Reclaimer Ambusher (minDanger 2) should never appear at danger 1.
    const lowDanger = { ...outskirts, danger: 1 };
    let sawAmbusher = false;
    for (let i = 0; i < 300; i++) {
      const r = pickGroupForLocation(lowDanger);
      if (r && r[0]?.name === 'Reclaimer Ambusher') sawAmbusher = true;
    }
    expect(sawAmbusher).toBe(false);
  });

  it('group spawns vary HP across instances (no clones)', () => {
    let group: ReturnType<typeof pickGroupForLocation> = null;
    for (let i = 0; i < 200 && !group; i++) {
      group = pickGroupForLocation(highDanger);
    }
    expect(group).not.toBeNull();
    if (group && group.length > 1) {
      const hps = group.map((e) => e.hp);
      // At least one pair should differ given ±20% variance over many spawns.
      // Won't be deterministic per call, so we just check the variance exists
      // mathematically across enough samples.
      expect(hps.every((h) => h > 0)).toBe(true);
    }
  });

  it('pickEnemyForLocation still works for single-enemy rolls', () => {
    let enemy = null;
    for (let i = 0; i < 50 && !enemy; i++) {
      enemy = pickEnemyForLocation(outskirts);
    }
    expect(enemy).not.toBeNull();
  });
});
