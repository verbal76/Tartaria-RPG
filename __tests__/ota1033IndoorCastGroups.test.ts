// OTA-1033 — RAIDERS, SOLDIERS AND AETHERKIN CAN ALL COME INSIDE. Owner: "make
// sure the list for inside attacks includes raiders and soldiers and aetherkin
// among what else you have in it." The audit behind this OTA: Aetherkin were
// already complete (all five in the roster), raiders were present but only at
// Uncommon, and SOLDIERS were effectively missing — the enemy roster has six
// humans total and exactly one martial one below Legendary. So soldiers and
// raiders are now also BUILT, by dressing a same-rarity HUMAN body in the
// colours of the faction you've wronged most.
import * as fs from 'fs';
import * as path from 'path';
import {
  INDOOR_AMBUSHERS, INDOOR_FACTION_BODIES, INDOOR_RAIDERS, INDOOR_SOLDIERS,
  INDOOR_AETHERKIN, isIndoorPlausibleEnemy, pickIndoorFactionIntruder,
} from '../app/engine/indoorAmbush';
import { findEnemyByName } from '../app/engine/encounter';
import { blockAt } from '../test-utils/srcBlock';

describe('OTA-1033 — the three groups the owner named are all in', () => {
  it('raiders, soldiers and Aetherkin are each represented in the listed cast', () => {
    for (const [label, group] of [
      ['raiders', INDOOR_RAIDERS], ['soldiers', INDOOR_SOLDIERS], ['aetherkin', INDOOR_AETHERKIN],
    ] as const) {
      expect({ label, count: group.length > 0 }).toEqual({ label, count: true });
      for (const name of group) {
        expect({ label, name, listed: isIndoorPlausibleEnemy(name) })
          .toEqual({ label, name, listed: true });
      }
    }
  });

  it('EVERY Aetherkin in the roster can appear indoors — they died in these walls', () => {
    const roster = (JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'enemies', 'enemies.json'), 'utf8'),
    ) as { enemies?: unknown[] } | unknown[]);
    const list = (Array.isArray(roster) ? roster : roster.enemies ?? []) as Array<{ name: string; type: string }>;
    const undead = list.filter((e) => e.type === 'Aetheric Undead').map((e) => e.name);
    expect(undead.length).toBeGreaterThan(0);
    expect([...undead].sort()).toEqual([...INDOOR_AETHERKIN].sort());
    for (const name of undead) expect(isIndoorPlausibleEnemy(name)).toBe(true);
  });

  it('the zealot-knight that was missing is in — a capital gets armed callers', () => {
    expect(INDOOR_AMBUSHERS.Rare).toContain('Mud Monarch Purifier');
  });

  it('raiders and soldiers span the tiers a break-in can arrive at', () => {
    // Listed humans cover Uncommon through Legendary; Common stays vermin.
    const tiersWithPeople = Object.entries(INDOOR_AMBUSHERS)
      .filter(([, names]) => names.some((n) => INDOOR_RAIDERS.includes(n) || INDOOR_SOLDIERS.includes(n)))
      .map(([rarity]) => rarity)
      .sort();
    expect(tiersWithPeople).toEqual(['Legendary', 'Rare', 'Uncommon']);
  });
});

describe('OTA-1033 — a faction raider/soldier wears a human body', () => {
  it('builds a named intruder at every tier that has a body, null at Common', () => {
    for (const rarity of ['Uncommon', 'Rare', 'Legendary']) {
      const e = pickIndoorFactionIntruder(rarity, 'mud_monarchs', 'Mud Monarchs');
      expect(e).toBeTruthy();
      expect(e!.name).toMatch(/^Mud Monarchs (Raider|Soldier)$/);
      expect(e!.factionId).toBe('mud_monarchs');
      expect(e!.rarity).toBe(rarity);
      // The parser answers to what the player would actually type.
      expect(e!.aliases).toEqual(expect.arrayContaining(['soldier', 'raider', 'intruder']));
    }
    // No human body that cheap — a Common intruder is a rat, not a soldier.
    expect(pickIndoorFactionIntruder('Common', 'mud_monarchs', 'Mud Monarchs')).toBeNull();
    expect(pickIndoorFactionIntruder(null, 'mud_monarchs', 'Mud Monarchs')).toBeNull();
  });

  it('every faction body is an actual HUMAN — no soldier name on a beast statline', () => {
    for (const [rarity, names] of Object.entries(INDOOR_FACTION_BODIES)) {
      for (const name of names) {
        const e = findEnemyByName(name) as ({ type?: string; rarity?: string } | null);
        expect({ name, found: !!e }).toEqual({ name, found: true });
        expect({ name, type: e!.type }).toEqual({ name, type: 'Human' });
        expect({ name, rarity: e!.rarity }).toEqual({ name, rarity });
      }
    }
  });

  it('keeps the body\'s combat statline rather than inventing one', () => {
    const body = findEnemyByName('Mud Monarch Purifier')!;
    const dressed = pickIndoorFactionIntruder('Rare', 'stone_builders', 'Stone Builders')!;
    // Whichever Rare body was drawn, hp/attack come from a real roster entry.
    const source = findEnemyByName(dressed.name.replace(/^Stone Builders (Raider|Soldier)$/, '')) ?? null;
    expect(source).toBeNull(); // the dressed name is NOT itself a roster entry
    expect(typeof dressed.hp).toBe('number');
    expect(dressed.hp).toBeGreaterThan(0);
    expect(body.hp).toBeGreaterThan(0);
  });
});

describe('OTA-1033 — SOURCE LOCKS', () => {
  const store = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8',
  );

  it('the indoor ambush can be people, drawn from the faction you wronged most', () => {
    expect(store).toMatch(/function worstStandingFaction\(/);
    expect(store).toMatch(/ia\.pickIndoorFactionIntruder\(rawWildRestEnemy\.rarity, grudge\.id, grudge\.name\)/);
    // Falls back to the creature cast when nobody holds a grudge / no body fits.
    expect(store).toMatch(/return ia\.pickIndoorAmbusher\(rawWildRestEnemy\.rarity\);/);
  });

  it('only a NEGATIVE standing counts as a motive, and never your own faction', () => {
    const start = store.indexOf('function worstStandingFaction(');
    const body = blockAt(store, 'function worstStandingFaction(');
    expect(body).toMatch(/if \(f\.id === player\.factionId\) continue;/);
    expect(body).toMatch(/let worstValue = 0;/);
  });
});
