// arb45 — locks the title-earning engine: award predicates fire on the right
// counters / derived state, and perks aggregate from earned titles.

import {
  evaluateEarnedTitles,
  newlyEarnedTitles,
  titlePerkModifiers,
  withTitleProgress,
  WIRED_TITLE_IDS,
  STORM_TICKS_FOR_ATTUNED,
  STORM_TICKS_FOR_STORMCALLER,
  STANDING_FOR_SCION,
  GOLEM_STRIKES_FOR_WHISPERER,
  REPAIRS_FOR_ARCHITECTS_EYE,
} from '../app/engine/titles';
import type { PlayerCharacter } from '../app/engine/types';

// Minimal player factory — the engine only reads a handful of fields.
function mk(partial: Record<string, unknown>): PlayerCharacter {
  return {
    raceId: 'mud_dweller',
    factionId: 'reclaimers_guild',
    corruption: 0,
    earnedTitles: [],
    discoveredLocationIds: [],
    ...partial,
  } as unknown as PlayerCharacter;
}

describe('titles — earning engine', () => {
  it('awards nothing on a fresh character', () => {
    expect(evaluateEarnedTitles(mk({}))).toEqual([]);
  });

  it('Bane of Sentinels after 5 sentinel kills, with the mechanical-damage perk', () => {
    const p = mk({ titleProgress: withTitleProgress({ sentinelsDefeated: 5 }) });
    expect(evaluateEarnedTitles(p)).toContain('bane_of_sentinels');
    const earned = mk({ earnedTitles: ['bane_of_sentinels'] });
    expect(titlePerkModifiers(earned).mechanicalDamageDice).toBe(1);
  });

  it('Seeker / Relic Trader / Scholar on their counters', () => {
    expect(evaluateEarnedTitles(mk({ titleProgress: withTitleProgress({ relicsFound: 3 }) }))).toContain('seeker_of_lost_relics');
    expect(evaluateEarnedTitles(mk({ titleProgress: withTitleProgress({ relicsTraded: 5 }) }))).toContain('relic_trader');
    expect(evaluateEarnedTitles(mk({ titleProgress: withTitleProgress({ loreRead: 3 }) }))).toContain('scholar_of_forgotten_lore');
  });

  it('storm survival awards Etherbound Survivor + Aetheric Attuned', () => {
    // OTA-1046 — this asserted stormsSurvived: 1, which was the defect itself:
    // one tick of ambient weather paid out both titles, in the tutorial, before
    // the player had done anything. Retargeted to the real thresholds so the
    // test still proves the titles ARE reachable without re-encoding the bug.
    const got = evaluateEarnedTitles(mk({
      titleProgress: withTitleProgress({ stormsSurvived: STORM_TICKS_FOR_ATTUNED }),
    }));
    expect(got).toContain('etherbound_survivor');
    expect(got).toContain('aetheric_attuned');
  });

  it('one ambient storm tick awards NOTHING (OTA-1046)', () => {
    const got = evaluateEarnedTitles(mk({ titleProgress: withTitleProgress({ stormsSurvived: 1 }) }));
    expect(got).not.toContain('etherbound_survivor');
    expect(got).not.toContain('aetheric_attuned');
  });

  it('Survivor of Aetherstone at high corruption load', () => {
    expect(evaluateEarnedTitles(mk({ titleProgress: withTitleProgress({ maxCorruption: 25 }) }))).toContain('survivor_of_aetherstone');
    expect(evaluateEarnedTitles(mk({ titleProgress: withTitleProgress({ maxCorruption: 10 }) }))).not.toContain('survivor_of_aetherstone');
  });

  it('Stormcaller needs a companion present during the storm', () => {
    expect(evaluateEarnedTitles(mk({ titleProgress: withTitleProgress({ stormsSurvived: 1 }) }))).not.toContain('stormcaller');
    expect(evaluateEarnedTitles(mk({
      titleProgress: withTitleProgress({ stormsSurvivedWithCompanion: STORM_TICKS_FOR_STORMCALLER }),
    }))).toContain('stormcaller');
  });

  it('derived titles: Scion (race+faction), Explorer (locations), Golem (companion), Aetherborn (race+corruption)', () => {
    // OTA-1047 — descent alone used to award this, and both fields are set at
    // CHARACTER CREATION, so the assertion below was pinning "earned for free".
    // Canon asks the player to PROVE descent; standing is the proof.
    expect(evaluateEarnedTitles(mk({ raceId: 'tartarian_giant', factionId: 'servants_of_giants' }))).not.toContain('scion_of_the_giants');
    expect(evaluateEarnedTitles(mk({
      raceId: 'tartarian_giant', factionId: 'servants_of_giants',
      factionStanding: [{ factionId: 'servants_of_giants', standing: STANDING_FOR_SCION }],
    }))).toContain('scion_of_the_giants');
    expect(evaluateEarnedTitles(mk({
      raceId: 'tartarian_giant', factionId: 'mud_monarchs',
      factionStanding: [{ factionId: 'mud_monarchs', standing: STANDING_FOR_SCION }],
    }))).not.toContain('scion_of_the_giants');
    expect(evaluateEarnedTitles(mk({ mainQuest: { coresRecovered: ['asgardar'] } }))).toContain('etheric_explorer');
    // OTA-1047 — was `!!player.golem`. Canon asks for CONTROL, so the golem has
    // to have actually fought for you.
    expect(evaluateEarnedTitles(mk({ golem: { hp: 10 } }))).not.toContain('golem_whisperer');
    expect(evaluateEarnedTitles(mk({
      golem: { hp: 10 },
      titleProgress: withTitleProgress({ golemStrikesLanded: GOLEM_STRIKES_FOR_WHISPERER }),
    }))).toContain('golem_whisperer');
    expect(evaluateEarnedTitles(mk({ raceId: 'aetherborn', corruption: 12 }))).toContain('aetherborn_awakened');
    expect(evaluateEarnedTitles(mk({ raceId: 'aetherborn', corruption: 4 }))).not.toContain('aetherborn_awakened');
  });

  it('fusion + repair award their titles', () => {
    expect(evaluateEarnedTitles(mk({ titleProgress: withTitleProgress({ fusionsCompleted: 1 }) }))).toContain('master_of_aethercraft');
    // OTA-1047 — was 1 repair.
    expect(evaluateEarnedTitles(mk({ titleProgress: withTitleProgress({ repairsCompleted: 1 }) }))).not.toContain('architects_eye');
    expect(evaluateEarnedTitles(mk({
      titleProgress: withTitleProgress({ repairsCompleted: REPAIRS_FOR_ARCHITECTS_EYE }),
    }))).toContain('architects_eye');
  });

  it('newlyEarnedTitles excludes already-earned', () => {
    const p = mk({ titleProgress: withTitleProgress({ sentinelsDefeated: 5 }), earnedTitles: ['bane_of_sentinels'] });
    expect(newlyEarnedTitles(p)).not.toContain('bane_of_sentinels');
  });

  it('wires all 21 titles (14 Tier-A/B + 6 Tier-C + Skyreacher)', () => {
    expect(WIRED_TITLE_IDS.size).toBe(21);
    expect(WIRED_TITLE_IDS.has('guild_broker')).toBe(true);
    expect(WIRED_TITLE_IDS.has('speaker_of_forgotten_tongues')).toBe(true);
    expect(WIRED_TITLE_IDS.has('skyreacher')).toBe(true);
  });

  it('Skyreacher earns at 5 great climbs and grants half-fall + DEX', () => {
    const notYet = mk({ titleProgress: withTitleProgress({ greatClimbsCompleted: 4 }) });
    expect(evaluateEarnedTitles(notYet)).not.toContain('skyreacher');
    const done = mk({ titleProgress: withTitleProgress({ greatClimbsCompleted: 5 }) });
    expect(evaluateEarnedTitles(done)).toContain('skyreacher');
    const perks = titlePerkModifiers(mk({ earnedTitles: ['skyreacher'] }));
    expect(perks.climbFallHalved).toBe(true);
    expect(perks.dexterityBonus).toBe(2);
  });

  it('Tier-C titles never auto-earn while their counters sit at zero', () => {
    const p = mk({ titleProgress: withTitleProgress({}) });
    const earned = newlyEarnedTitles(p);
    for (const id of [
      'speaker_of_forgotten_tongues', 'wayfarer_of_the_lost_paths', 'guild_broker',
      'protector_of_the_forgotten', 'shadow_diver', 'warden_of_the_old_world',
    ]) {
      expect(earned).not.toContain(id);
    }
  });

  it('perks aggregate across multiple earned titles', () => {
    const perks = titlePerkModifiers(mk({ earnedTitles: ['seeker_of_lost_relics', 'scholar_of_forgotten_lore', 'survivor_of_aetherstone'] }));
    expect(perks.investigationBonus).toBe(2);
    expect(perks.loreBonus).toBe(2);
    expect(perks.corruptionResist).toBe(true);
  });
});
