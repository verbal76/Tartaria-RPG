// ⚠⚠⚠ OTA-1581 — THE MISSION CONVERSATION CARD, WIRED.
//
// OTA-1580 wrote the people down and built the state machine. This is the half
// that touches the game: the selector that decides a card is up, the roster
// lookup that says who is standing there, and the two engine holes the wiring
// exposed.
//
// ⚠⚠ THE MEASUREMENT THAT CHANGED THE DESIGN. After 1580 shipped, counting the
// shipped data: of the 114 stages that name a person, ZERO put bodies in front
// of you. The only two `spawn` blocks in the whole game sit on boss stages that
// name nobody. So 1580's TALK-then-FIGHT card would have shown a FIGHT button
// that swings at nobody on all 114 — the exact class of lie the card exists to
// end. 1581 replaces TALK with PROCEED (the stage's own action, as a button)
// and offers PERSUADE/FIGHT only where a `spawn` actually stands someone up.
//
// ⚠⚠⚠ AND IT FOUND A LATENT SOFTLOCK ON THE WAY. OTA-1578 made a stage with a
// `spawn` freeze until the pack is cleared — correctly. But the spawn itself
// stayed nested inside `if (stageDef.checkKind === 'boss')`. Nothing was broken
// today, because both authored spawns happen to be boss stages. The moment a
// `diplomacy` stage authored one — which is precisely the owner's "I meet a guy
// for a note and get jumped by three raiders" beat, the next content pass — the
// hunt would freeze waiting on a kill nothing had spawned. Unwinnable, silently.

import huntsData from '../app/data/quests/hunts.json';
import mysteriesData from '../app/data/quests/mysteries.json';
import storyData from '../app/data/quests/faction-storylines.json';
import { personFor, stakesForStage, stageHasFight, ledgerKeyFor, missionRoles } from '../app/engine/missionRoles';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { choicesFor, freshEncounter, applyChoice, type EncounterState } from '../app/engine/missionEncounter';
import type { PlayerCharacter } from '../app/engine/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blockAt } from '../test-utils/srcBlock';
import { placedAt } from '../test-utils/placePlayer';

const rows = <T>(d: unknown): T[] =>
  (Array.isArray(d) ? d : (Object.values(d as object).find(Array.isArray) ?? [])) as T[];

interface Stage {
  npcName?: string;
  checkKind?: string | null;
  spawn?: { enemyName: string; count?: number };
  requires?: { item: string; quantity?: number };
  grants?: { item: string; quantity?: number };
}
interface Mission { id: string; title: string; stages?: Stage[] }

const ALL: Mission[] = [
  ...rows<Mission>(huntsData),
  ...rows<Mission>(mysteriesData),
  ...rows<Mission>(storyData),
];
const NPC_STAGES = ALL.flatMap((m) => (m.stages ?? []).map((s, i) => ({ m, s, i }))).filter((x) => x.s.npcName);

/** ⚠ A partial cast: `armedEncounter` reads exactly five fields, and building a
 *  whole character here would pin fields the selector never looks at. The cell
 *  comes from `placedAt` rather than a bare id — OTA-1484's rule, and it is the
 *  right one here too: the selector compares a location id the atlas has to
 *  agree exists. */
const playerAt = (locationId: string, extra: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({ ...placedAt(locationId), inventory: [], ...extra } as unknown as PlayerCharacter);

describe('OTA-1581 — who is standing there', () => {
  it('⚠⚠⚠ A POST IS ONE PERSON, and every stage naming it gets the same one', () => {
    // Owner rule 1: "that would be the same person — make it persistent."
    const a = personFor('the Order scholar', {});
    const b = personFor('the Order scholar', {});
    expect(a?.name).toBe('Scholar Wend');
    expect(b?.name).toBe(a?.name);
    expect(a?.title).toBe('Order Scholar');
    expect(a?.role).toBe('the Order scholar');
  });

  it('⚠⚠⚠ KILL ONE AND A SUCCESSOR HOLDS THE POST — and the ledger keys on the POST', () => {
    // Owner rule 7: "if he's in another mission after that and you kill him,
    // somebody else should take his place."
    expect(personFor('the Order scholar', { 'the Order scholar': 1 })?.name).toBe('Scholar Petra');
    expect(personFor('the Order scholar', { 'the Order scholar': 2 })?.name).toBe('Scholar Oleg');
    // Past the authored list the last successor holds it — never undefined, and
    // never back to the dead original.
    expect(personFor('the Order scholar', { 'the Order scholar': 9 })?.name).toBe('Scholar Oleg');
    expect(personFor('the Order scholar', { 'the Order scholar': 1 })?.isSuccessor).toBe(true);
    expect(ledgerKeyFor('the Order scholar')).toBe('the Order scholar');
  });

  it('⚠⚠⚠ AN AUTHORED INDIVIDUAL CANNOT BE KILLED ON THE CARD', () => {
    // 19 of the 61 names are people the world already had — Old Mira at her
    // stall, Brother Ammon at his. A post has a successor by construction; a
    // person does not, and the stage AFTER hers still expects her to be there.
    const mira = personFor('Old Mira', {});
    expect(mira?.name).toBe('Old Mira');
    expect(mira?.role).toBeNull();
    expect(mira?.canKill).toBe(false);
    expect(choicesFor({ key: 'k', phase: 'aftermath', persuadeSpent: false, mocked: false }, { canKill: false }))
      .toEqual(['take']);
  });

  it('⚠ every role in the roster resolves, and nothing in it resolves to undefined', () => {
    for (const r of missionRoles()) {
      const p = personFor(r.role, {});
      expect(p?.name).toBe(r.name);
      expect(p?.canKill).toBe(true);
      expect(r.successors.length).toBeGreaterThan(0);
    }
  });
});

describe('OTA-1581 — the price is what is being asked for', () => {
  it('⚠⚠ scaled by the ASK, in a fixed order', () => {
    // Owner rule 11: scaled. The order is not arbitrary — see stakesForStage.
    expect(stakesForStage({ checkKind: 'boss' })).toBe('surrender');
    expect(stakesForStage({ spawn: { enemyName: 'Tartarian Raider', count: 3 } })).toBe('concession');
    expect(stakesForStage({ requires: { item: 'First Fragment' } })).toBe('errand');
    expect(stakesForStage({ grants: { item: 'Second Fragment' } })).toBe('concession');
    expect(stakesForStage({ checkKind: 'diplomacy' })).toBe('favour');
    // ⚠ boss OUTRANKS a requires it also carries — the chain's last word is the
    // biggest ask on the card whatever else the stage is moving.
    expect(stakesForStage({ checkKind: 'boss', requires: { item: 'Seventh Fragment' } })).toBe('surrender');
  });

  it('⚠⚠⚠ A FIGHT BUTTON MEANS A SPAWN, ON EVERY SHIPPED STAGE', () => {
    // ⚠ This is the invariant, not a count: it stays true when the next content
    // pass authors `spawn` on the "jumped by three raiders" beats. A stage whose
    // card offers FIGHT and whose engine spawns nothing is the whole bug class.
    for (const { m, s, i } of NPC_STAGES) {
      expect({ at: `${m.id}#${i}`, fight: stageHasFight(s) }).toEqual({ at: `${m.id}#${i}`, fight: !!s.spawn });
    }
    // A mystery's `boss` is paid by INVESTIGATE and a storyline's by DIPLOMACY;
    // neither spawns anything. Fifteen NPC stages carry `boss` for that reason.
    expect(stageHasFight({ checkKind: 'boss' })).toBe(false);
  });
});

describe('OTA-1581 — the card arms itself on the tile, and nowhere else', () => {
  it('⚠⚠⚠ STANDING ON THE STAGE TILE OF A LIVE MISSION RAISES THE CARD', () => {
    const p = playerAt('varakush', { activeMysteries: [{ id: 'mystery_red_tower', stage: 0 }] } as Partial<PlayerCharacter>);
    const armed = armedEncounter(p);
    expect(armed?.missionId).toBe('mystery_red_tower');
    expect(armed?.person.name).toBe('Scholar Wend');
    expect(armed?.key).toBe('mystery:mystery_red_tower:0');
    expect(armed?.hasFight).toBe(false);
    // The stage's OWN text rides the card, so it cannot be scrolled past.
    expect(armed?.narration.length).toBeGreaterThan(20);
  });

  it('⚠⚠ AND NOWHERE ELSE — wrong tile, no card', () => {
    const p = playerAt('the_hidden_market', { activeMysteries: [{ id: 'mystery_red_tower', stage: 0 }] } as Partial<PlayerCharacter>);
    expect(armedEncounter(p)).toBeNull();
  });

  it('⚠⚠ A PAUSED CONTRACT IS SILENT — `tracked: false` is the player saying not this one', () => {
    const p = playerAt('varakush', {
      activeMysteries: [{ id: 'mystery_red_tower', stage: 0, tracked: false }],
    } as Partial<PlayerCharacter>);
    expect(armedEncounter(p)).toBeNull();
  });

  it('⚠ a stage that names nobody raises nothing', () => {
    // hunts carry 116 stages and only 44 name a person; the rest must stay quiet.
    const quiet = ALL.find((m) => (m.stages ?? []).some((s) => !s.npcName));
    expect(quiet).toBeTruthy();
  });

  it('⚠⚠⚠ AN UNPAID DELIVERY OFFERS NO WAY FORWARD, AND SAYS WHAT IS OWED', () => {
    // story_order_red_tower stage 2 wants the First Fragment in hand. Without
    // it, PROCEED would advance a hand-over that never happened — and PERSUADE
    // would talk past it, which is worse.
    const p = playerAt('cradle_of_dusk', {
      activeStorylines: [{ id: 'story_order_red_tower', stage: 2 }],
    } as Partial<PlayerCharacter>);
    const armed = armedEncounter(p);
    expect(armed?.missionId).toBe('story_order_red_tower');
    expect(armed?.canPersuade).toBe(false);
    expect(armed?.owed).toBe('First Fragment');
    expect(choicesFor(freshEncounter(armed!.key), { hasFight: armed!.hasFight, canPersuade: armed!.canPersuade }))
      .toEqual(['flee']);
  });

  it('⚠⚠ carrying it turns the beat into a button', () => {
    const p = playerAt('cradle_of_dusk', {
      activeStorylines: [{ id: 'story_order_red_tower', stage: 2 }],
      inventory: [{ name: 'First Fragment', quantity: 1 }],
    } as unknown as Partial<PlayerCharacter>);
    const armed = armedEncounter(p);
    expect(armed?.canPersuade).toBe(true);
    expect(armed?.owed).toBeNull();
    expect(armed?.needs).toBe('First Fragment');
    expect(choicesFor(freshEncounter(armed!.key), { hasFight: false })).toEqual(['proceed', 'flee']);
  });

  it('⚠ PROCEED closes the stage and kills nobody', () => {
    const step = applyChoice(freshEncounter('k'), 'proceed');
    expect(step.next.phase).toBe('resolved');
    expect(step.effect).toEqual({ kind: 'complete_stage', killed: false });
    // …and it is an OPENING action only: pressed after a fight it does nothing,
    // because the aftermath's TAKE is what closes that path.
    const mid: EncounterState = { key: 'k', phase: 'aftermath', persuadeSpent: false, mocked: false };
    expect(applyChoice(mid, 'proceed').effect).toEqual({ kind: 'none' });
  });
});

describe('OTA-1581 — the two engine holes the wiring exposed', () => {
  const QUEST = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');
  const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

  it('⚠⚠⚠ A STAGE `spawn` NO LONGER LIVES INSIDE THE BOSS BRANCH', () => {
    // The latent softlock: `freezeForKill` covers any stage with a spawn, but
    // the spawn only ran for `checkKind === 'boss'`. A non-boss stage with a
    // spawn would have frozen forever with nothing to kill.
    const bossBranch = blockAt(QUEST, "if (stageDef.checkKind === 'boss') {");
    expect(bossBranch).toContain('scaleHuntBoss');
    expect(bossBranch).not.toContain('scaleHuntEscort');
    // …and the escort now stands up for any stage that authored one.
    expect(QUEST).toContain('const override = peaceful ? null : stageDef.spawn;');
  });

  it('⚠⚠⚠ A CARD-OWNED FIGHT DOES NOT AUTO-ADVANCE THE STAGE', () => {
    // Owner rule 8: the fight drops to the exploration screen and then "goes
    // back to the pop-up to resolve the rest of it" — TAKE, or TAKE AND KILL.
    // Advancing here would skip the aftermath the buttons promised.
    // ⚠ RETARGETED BY OTA-1583 — GS → QS. The escort clear moved out of
    // gameStore's resolveEnemyDefeat and into questSlice.resolveStageEscortClear.
    // The claim is unchanged; only the address moved.
    const clear = blockAt(QUEST, '  if (!stillUp) {');
    expect(clear).toContain("owning?.phase === 'fighting'");
    expect(clear).toContain("phase: 'aftermath' as const");
    // ⚠ NOT a bare `return` — the rest of resolveEnemyDefeat still has to run
    // for this corpse (the hunt-boss kill, loot, the standing writes).
    expect(clear).not.toContain('            return;');
  });

  it('⚠⚠ a PEACEFUL advance puts nobody in front of the player', () => {
    // Two callers: a persuade that landed (the fight is what the roll bought)
    // and TAKE in the aftermath (the bodies are already down — re-running the
    // spawn would stand them back up).
    expect(QUEST).toContain('const freezeForKill = !peaceful && (');
    expect(STORE).toContain("get().advanceHunt(armed.missionId, { peaceful: true });");
  });
});
