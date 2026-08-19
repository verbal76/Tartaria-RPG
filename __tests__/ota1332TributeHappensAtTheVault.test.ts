// ⚠⚠ OTA-1332 — THE LAST P19 INSTANCE, IN THE FAMILY THAT LOOKED EXEMPT.
//
// Owner, after I gave five families a green check and faction quests a hedge: *"don't we
// have to check the faction quests? since they don't have a green check mark from you."*
// He was right to push. I had waved the family through BY ANALOGY with bounties instead of
// measuring it, which is the exact habit that produced "all 18 hunts are finishable."
//
// The measurement across all 65: 47 are fetch ("Gather N"), and of the 18 staged ones,
// 17 are honest counters whose objective line SAYS so — "Defeat 3 enemies", "Travel 5
// times", "Discover 2 locations". Their narration is flavour over a tally and promises
// nothing the engine cannot pay. Those are fine, and this suite pins that so nobody
// "fixes" them into being location quests they were never written as.
//
// Exactly ONE is not: `fq_servants_tribute` — "Travel to the Giant Vault and leave
// tribute", whose own stage reads "Carry it to the Vault. Set it on the threshold." Every
// stage is advanceOn:'travel', and the advance counted ANY travel — so three steps in the
// opposite direction reported that you had laid the tribute down at a place you never
// went. Same hole as P19, hiding in the family whose shape made it look exempt.
import { FACTION_QUESTS, findFactionQuestById } from '../app/engine/factionQuests';
import { missionObjectiveLocationId } from '../app/engine/missionRouting';

describe('OTA-1332 — a faction quest that names a destination has to check it', () => {
  it('⚠⚠ the tribute quest names the Giant Vault, and the name resolves to a real tile', () => {
    const def = findFactionQuestById('fq_servants_tribute')!;
    expect(def).toBeTruthy();
    expect(missionObjectiveLocationId(def)).toBe('giant_vault');
    // Every stage is travel-gated — which is WHY the old any-travel count was wrong here.
    expect((def.stages ?? []).every((s) => s.advanceOn === 'travel')).toBe(true);
  });

  it('⚠ only ONE staged quest is BOTH travel-gated and destination-naming — that is the gate\'s whole surface', () => {
    // ⚠ This is the half that stops an over-correction. 17 of 18 staged quests are "Defeat
    // 3 enemies" / "Travel 5 times" by design; gating those on a place would break
    // contracts never written as journeys.
    //
    // ⚠⚠ AND IT CAUGHT A FALSE POSITIVE ON ITS FIRST RUN, which is worth writing down
    // rather than quietly narrowing the assertion: `missionObjectiveLocationId` finds a
    // destination in `fq_order_relic` too — because its text opens "Varakush has heard of
    // a Relic Seeker's Lens", and Varakush is BOTH a stronghold on the atlas and, here, the
    // name of the person handing you the map. The resolver scans prose for location names
    // and cannot tell those apart.
    //
    // That quest is unharmed only because it is `advanceOn: 'kill'` and the new gate fires
    // on TRAVEL alone — safe by construction, not by luck, and this test pins the
    // construction. If anyone ever widens the gate to 'kill', fq_order_relic starts
    // demanding the player stand in Varakush to punch an Aetheric creature, and this
    // assertion is the thing that will say so.
    const staged = FACTION_QUESTS.filter((q) => (q.stages ?? []).length > 0);
    expect(staged.length).toBe(18);

    const namesAPlace = staged.filter((q) => !!missionObjectiveLocationId(q));
    expect(namesAPlace.map((q) => q.id).sort()).toEqual(['fq_order_relic', 'fq_servants_tribute']);

    // The gate's ACTUAL surface: travel-triggered AND naming a place.
    const gated = staged.filter(
      (q) => !!missionObjectiveLocationId(q)
        && (q.stages ?? []).some((st) => st.advanceOn === 'travel'),
    );
    expect(gated.map((q) => q.id)).toEqual(['fq_servants_tribute']);
    // And the false positive is kill-gated, so the gate cannot reach it.
    const relic = findFactionQuestById('fq_order_relic')!;
    expect((relic.stages ?? []).every((st) => st.advanceOn === 'kill')).toBe(true);
  });

  it('⚠ every staged quest that names a destination resolves it to a routable tile', () => {
    // A destination that does not resolve would gate the quest shut forever — the refusal
    // would be permanent and unexplainable, which is worse than the bug it replaced.
    for (const q of FACTION_QUESTS) {
      if (!(q.stages ?? []).length) continue;
      const dest = missionObjectiveLocationId(q);
      if (dest) expect(typeof dest).toBe('string');
    }
  });
});
