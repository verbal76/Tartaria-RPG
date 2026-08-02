/**
 * OTA-1045 — "2 Scrap Drones close on you", then a Mud Wasp attacks.
 *
 * ROOT CAUSE (from the owner's 4.28.75 log, 23:41:56):
 *
 *   The scene-arrival announcer read
 *       `${enemies.length} ${enemies[0].name}s close on you`
 *   which is true only when every member of the party is the same enemy.
 *
 *   That invariant DID hold when the announcer was written: the only
 *   multi-enemy source was pickGroupForLocation, which spawns `count` copies
 *   of ONE prototype (encounter.ts — `out.push({ ...proto, ... })` in a loop).
 *
 *   Two later features broke it and neither revisited the announcer:
 *     - OTA-808 (menace pressure) appends an independent ladder pick, which
 *       can be a different enemy.
 *     - OTA-817 (mixed-role packs) appends members that are GUARANTEED to
 *       differ — rollExtraPackMembers filters the pool by `usedNames` and
 *       prefers an unused `type`. Every pack it produces is heterogeneous by
 *       design, so the announcer was not occasionally wrong on those, it was
 *       always wrong.
 *
 *   Compounding it: gameStore ~7623 comments that narration names only the
 *   first enemy as "the scene representative" because "the full group is
 *   surfaced via the EnemyPanel + a follow-up line when it's actually a pack."
 *   This announcer IS that follow-up line. It was delegated the job of naming
 *   the rest of the group and wasn't doing it.
 *
 * The EnemyPanel was checked and is fine — it FlatLists every member; the
 * single-card branch is gated on length === 1.
 */
import {
  describeEnemyParty,
  describeEnemyPartyCap,
  pluralizeNoun,
} from '../app/engine/grammar';

describe('OTA-1045 — pluralizeNoun', () => {
  it('handles the plain case', () => {
    expect(pluralizeNoun('Scrap Drone')).toBe('Scrap Drones');
    expect(pluralizeNoun('Mudling')).toBe('Mudlings');
  });

  it('handles sibilant endings a bare +s gets wrong', () => {
    expect(pluralizeNoun('Mud Lich')).toBe('Mud Liches');
    expect(pluralizeNoun('Ash')).toBe('Ashes');
    expect(pluralizeNoun('Aetheric Ooze')).toBe('Aetheric Oozes');
  });

  it('handles consonant-y endings', () => {
    expect(pluralizeNoun('Mud Harpy')).toBe('Mud Harpies');
  });

  it('leaves vowel-y endings alone', () => {
    expect(pluralizeNoun('Grey')).toBe('Greys');
  });
});

describe('OTA-1045 — describeEnemyParty', () => {
  it('names a lone enemy with the right article', () => {
    expect(describeEnemyParty(['Scrap Drone'])).toBe('a Scrap Drone');
    expect(describeEnemyParty(['Aetheric Raven'])).toBe('an Aetheric Raven');
  });

  it('counts a homogeneous pack — the case that was already correct', () => {
    expect(describeEnemyParty(['Mudling', 'Mudling', 'Mudling'])).toBe('3 Mudlings');
  });

  it('THE REPORTED BUG: names both members of a mixed pair', () => {
    // Was: "2 Scrap Drones close on you" — and then a Mud Wasp swung.
    expect(describeEnemyParty(['Scrap Drone', 'Mud Wasp']))
      .toBe('a Scrap Drone and a Mud Wasp');
  });

  it('mixes counts and singletons', () => {
    expect(describeEnemyParty(['Mudling', 'Mudling', 'Scrap Drone']))
      .toBe('2 Mudlings and a Scrap Drone');
  });

  it('serial-commas three or more distinct kinds', () => {
    expect(describeEnemyParty(['Scrap Drone', 'Mud Wasp', 'Gutter Rat']))
      .toBe('a Scrap Drone, a Mud Wasp, and a Gutter Rat');
  });

  it('keeps first-seen order rather than sorting', () => {
    // The first enemy is the one narration already named as the scene
    // representative; leading with something else would read as a mismatch.
    expect(describeEnemyParty(['Mud Wasp', 'Scrap Drone', 'Scrap Drone']))
      .toBe('a Mud Wasp and 2 Scrap Drones');
  });

  it('ignores blank names instead of emitting a stray article', () => {
    expect(describeEnemyParty(['Scrap Drone', '', '  '])).toBe('a Scrap Drone');
    expect(describeEnemyParty([])).toBe('');
  });
});

describe('OTA-1045 — the announced line', () => {
  const line = (names: string[]) =>
    `${describeEnemyPartyCap(names)} close on you. Tap the right-side panel to cycle targets.`;

  it('reads correctly for the reported pack', () => {
    expect(line(['Scrap Drone', 'Mud Wasp']))
      .toBe('A Scrap Drone and a Mud Wasp close on you. Tap the right-side panel to cycle targets.');
  });

  it('leaves a count-led phrase uncapitalised-looking but intact', () => {
    expect(line(['Mudling', 'Mudling'])).toMatch(/^2 Mudlings close on you\./);
  });

  it('never claims a count of one kind that the party does not hold', () => {
    // The property that failed in production: for any party, the announced
    // count of a given name must match how many of that name are present.
    const party = ['Scrap Drone', 'Mud Wasp', 'Mud Wasp'];
    const out = describeEnemyParty(party);
    expect(out).toContain('2 Mud Wasps');
    expect(out).not.toContain('3 Scrap Drones');
    expect(out).not.toContain('2 Scrap Drones');
  });
});
