// OTA-236 — Arbiter Titles on Character Screen contract.
//
// The CharacterScreen section is display-only Phase 1 (no auto-
// unlock yet). This test pins what the render path will be reading:
//   - arbiter-titles.json has the 20 expected entries
//   - each entry has the fields the section reads
//   - player.earnedTitles default (undefined) safely maps to 0
//     earned. None of the rendering paths crash on undefined.

import arbiterTitlesData from '../app/data/lore/arbiter-titles.json';
import type { PlayerCharacter } from '../app/engine/types';

interface ArbiterTitle {
  id: string;
  title: string;
  requirement: string;
  perk: string;
  tags: string[];
}

const TITLES = (arbiterTitlesData as { titles: ArbiterTitle[] }).titles;

describe('OTA-236 — Arbiter Titles render contract', () => {
  it('arbiter-titles.json has 20 entries', () => {
    expect(TITLES.length).toBe(20);
  });

  it('every title has the fields the CharacterScreen section reads', () => {
    for (const t of TITLES) {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.title).toBe('string');
      expect(t.title.length).toBeGreaterThan(2);
      expect(typeof t.requirement).toBe('string');
      expect(t.requirement.length).toBeGreaterThan(5);
      expect(typeof t.perk).toBe('string');
      expect(t.perk.length).toBeGreaterThan(5);
    }
  });

  it('title ids are unique', () => {
    const ids = new Set(TITLES.map((t) => t.id));
    expect(ids.size).toBe(TITLES.length);
  });

  it('PlayerCharacter.earnedTitles is optional and defaults safely to undefined', () => {
    const player: Partial<PlayerCharacter> = {};
    // Reads in the CharacterScreen section: `player.earnedTitles ?? []`.
    const earned = new Set(player.earnedTitles ?? []);
    expect(earned.size).toBe(0);
  });

  it('a player with one earned title splits the list correctly', () => {
    const player: Partial<PlayerCharacter> = { earnedTitles: ['seeker_of_lost_relics'] };
    const earned = new Set(player.earnedTitles ?? []);
    const earnedCount = TITLES.filter((t) => earned.has(t.id)).length;
    const lockedCount = TITLES.filter((t) => !earned.has(t.id)).length;
    expect(earnedCount).toBe(1);
    expect(lockedCount).toBe(19);
  });

  it('sort puts earned titles first then alphabetical (mirrors render path)', () => {
    const player: Partial<PlayerCharacter> = { earnedTitles: ['stormcaller'] };
    const earned = new Set(player.earnedTitles ?? []);
    const sorted = [...TITLES].sort((a, b) => {
      const ea = earned.has(a.id) ? 0 : 1;
      const eb = earned.has(b.id) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return a.title.localeCompare(b.title);
    });
    // First entry should be the earned one.
    expect(sorted[0]!.id).toBe('stormcaller');
    // Remaining should be alphabetical by title.
    for (let i = 2; i < sorted.length; i++) {
      expect(sorted[i - 1]!.title.localeCompare(sorted[i]!.title)).toBeLessThanOrEqual(0);
    }
  });
});
