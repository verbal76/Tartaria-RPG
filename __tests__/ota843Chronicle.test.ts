// OTA-843 [Character Chronicle] — a long-lived character was a pile of numbers, not a
// legend. buildChronicle pulls the accreted state together into a readable record: a
// headline (who they've become), a deed-list, and the memorable beats as a timeline.
// These lock the shape the CharacterScreen renders.

import { buildChronicle } from '../app/engine/chronicle';
import type { PlayerCharacter, MemorableEvent } from '../app/engine/types';

function mkPlayer(over: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Vale', raceId: 'reclaimer', factionId: 'reclaimers_guild',
    hoursElapsed: 50, corruption: 0,
    milestones: { enemiesDefeated: 7, travelsCompleted: 3, checksSucceeded: 4 },
    earnedTitles: [],
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 0 },
    ...over,
  } as unknown as PlayerCharacter;
}

const evt = (kind: MemorableEvent['kind'], text: string): MemorableEvent =>
  ({ id: `e_${text}`, kind, text, timestamp: 0 } as MemorableEvent);

describe('OTA-843 — buildChronicle', () => {
  it('titles the chronicle after the character', () => {
    expect(buildChronicle(mkPlayer(), []).title).toBe('The Chronicle of Vale');
  });

  it('the headline carries race, faction, and time survived', () => {
    const c = buildChronicle(mkPlayer({ hoursElapsed: 50 }), [], { raceName: 'Reclaimer', factionName: "Reclaimers' Guild" });
    expect(c.headline).toContain('Reclaimer');
    expect(c.headline).toContain("Reclaimers' Guild");
    // 50h → 2d 2h in Tartaria
    expect(c.headline).toMatch(/2d 2h in Tartaria/);
  });

  it('deeds include foes bested and the corruption tier', () => {
    const c = buildChronicle(mkPlayer({ milestones: { enemiesDefeated: 7, travelsCompleted: 0, checksSucceeded: 0 } }), []);
    expect(c.deeds.some((d) => /7 foes bested/.test(d))).toBe(true);
    expect(c.deeds.some((d) => /Corruption:/.test(d))).toBe(true);
  });

  it('lists earned titles and distinct-foe / Core counts when present', () => {
    const c = buildChronicle(
      mkPlayer({ earnedTitles: ['Bane of Sentinels'] }),
      [],
      { distinctFoes: 12, coresRecovered: 3, coresTotal: 9 },
    );
    expect(c.deeds.some((d) => /Bane of Sentinels/.test(d))).toBe(true);
    expect(c.deeds.some((d) => /12 kinds catalogued/.test(d))).toBe(true);
    expect(c.deeds.some((d) => /3\/9 Cores recovered/.test(d))).toBe(true);
  });

  it('maps memorable events to timeline entries with a glyph, oldest → newest', () => {
    const events = [
      evt('first_kill', 'You draw first blood on a Mud Boar.'),
      evt('faction_join', "You swear to the Reclaimers' Guild."),
      evt('mq_guardian_defeated', 'The Guardian of Nimari falls.'),
    ];
    const c = buildChronicle(mkPlayer(), events);
    expect(c.entries).toHaveLength(3);
    expect(c.entries[0].text).toContain('first blood');
    expect(c.entries[2].text).toContain('Guardian of Nimari');
    // every entry has a non-empty glyph
    expect(c.entries.every((e) => e.glyph.length > 0)).toBe(true);
    // a known kind gets a real glyph (not the fallback dot)
    expect(c.entries[0].glyph).not.toBe('·');
  });

  it('a fresh character has no timeline entries', () => {
    expect(buildChronicle(mkPlayer(), []).entries).toEqual([]);
    expect(buildChronicle(mkPlayer(), undefined).entries).toEqual([]);
  });

  it('reflects a corrupted character in the deeds', () => {
    const c = buildChronicle(mkPlayer({ corruption: 80 }), []);
    // 80 corruption is a worse tier than clean — the label must not read "Clean".
    const corrLine = c.deeds.find((d) => d.startsWith('Corruption:'))!;
    expect(corrLine.toLowerCase()).not.toContain('clean');
  });
});
