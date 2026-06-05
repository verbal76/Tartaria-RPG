import {
  TIER_C_ENABLED,
  LOCATION_CHALLENGES,
  challengeActive,
  activeChallengesAt,
  FACTION_COVETED_ITEM,
  eligibleBrokerFactions,
  AFFILIATED_STANDING,
} from '../app/engine/locationChallenges';

describe('Tier-C location challenges — 4 LIVE (Labyrinth/Speaker/Warden/Broker), 2 still OFF (arb53)', () => {
  const LIVE = ['labyrinth_of_shadows', 'tongue_of_the_red_tower', 'warden_of_the_cathedral', 'parley_of_factions'];
  const OFF = ['trap_dives_of_the_stair', 'defense_of_the_enclave'];

  it('master switch is ON', () => {
    expect(TIER_C_ENABLED).toBe(true);
  });

  it('registers 6 Tier-C challenges; exactly the 3 built ones are enabled', () => {
    expect(LOCATION_CHALLENGES).toHaveLength(6);
    const enabled = LOCATION_CHALLENGES.filter((c) => c.enabled).map((c) => c.id).sort();
    expect(enabled).toEqual([...LIVE].sort());
  });

  it('challengeActive is true for the 3 built challenges, false for the 3 deferred', () => {
    for (const c of LOCATION_CHALLENGES) {
      expect(challengeActive(c.id)).toBe(LIVE.includes(c.id));
    }
    for (const id of OFF) expect(challengeActive(id)).toBe(false);
  });

  it('each challenge targets a distinct title and a location id', () => {
    const titles = new Set(LOCATION_CHALLENGES.map((c) => c.titleId));
    expect(titles.size).toBe(6);
    for (const c of LOCATION_CHALLENGES) {
      expect(c.locationId).toBeTruthy();
    }
  });

  it('activeChallengesAt surfaces each live challenge at its tile, nothing for the OFF ones', () => {
    expect(activeChallengesAt('iskan_veil').map((c) => c.id)).toEqual(['labyrinth_of_shadows']);
    expect(activeChallengesAt('red_tower_of_nimari').map((c) => c.id)).toEqual(['tongue_of_the_red_tower']);
    expect(activeChallengesAt('sinking_cathedral').map((c) => c.id)).toEqual(['warden_of_the_cathedral']);
    expect(activeChallengesAt('parley_ground').map((c) => c.id)).toEqual(['parley_of_factions']);
    for (const c of LOCATION_CHALLENGES) {
      if (OFF.includes(c.id)) expect(activeChallengesAt(c.locationId)).toHaveLength(0);
    }
  });

  it('challengeActive is false for unknown ids', () => {
    expect(challengeActive('not_a_real_challenge')).toBe(false);
  });
});

describe('Guild Broker — faction coveted-item chart', () => {
  const ALL_FACTIONS = [
    'mud_monarchs', 'forgotten_order', 'reclaimers_guild', 'true_tartarians',
    'eternal_dynasty', 'conspiracy_architects', 'servants_of_giants',
    'stone_builders', 'tartarian_revivalists',
  ];

  it('covers all 9 factions, each with a distinct item + source', () => {
    expect(Object.keys(FACTION_COVETED_ITEM).sort()).toEqual([...ALL_FACTIONS].sort());
    const items = Object.values(FACTION_COVETED_ITEM).map((c) => c.itemId);
    expect(new Set(items).size).toBe(9);
    for (const c of Object.values(FACTION_COVETED_ITEM)) {
      expect(c.name).toBeTruthy();
      expect(c.sourceLocationId).toBeTruthy();
    }
  });

  it('excludes the player faction and affiliated factions from brokering', () => {
    const standings = [
      { factionId: 'forgotten_order', standing: AFFILIATED_STANDING }, // affiliated → excluded
      { factionId: 'reclaimers_guild', standing: AFFILIATED_STANDING - 1 }, // below → eligible
    ];
    const eligible = eligibleBrokerFactions('mud_monarchs', standings);
    expect(eligible).not.toContain('mud_monarchs'); // player's faction
    expect(eligible).not.toContain('forgotten_order'); // affiliated
    expect(eligible).toContain('reclaimers_guild');
    expect(eligible).toContain('true_tartarians'); // unknown standing → 0 → eligible
  });

  it('can always find at least two factions to broker for a low-standing player', () => {
    const eligible = eligibleBrokerFactions('mud_monarchs', []);
    expect(eligible.length).toBeGreaterThanOrEqual(2);
  });
});
