/**
 * OTA-1580 — THE GUY WHO WAS NEVER THERE.
 *
 * ⚠⚠⚠ THE OWNER ASKED IT PLAINLY: *"I have to meet a guy to get a note, right?"*
 * There was no guy. Not for that mission and not for any of them. 114 stages
 * across hunts, mysteries and storylines name a person, and `npcName` was read
 * in exactly ONE place in the entire codebase — `questStage.ts:112`, building
 * the hint string `find <name>`. Nothing placed them, gave them dialogue, or let
 * them hand anything over. Sixty-four of those stages advance on ARRIVAL, which
 * is how a conversation the text describes in full can happen without ever
 * happening.
 *
 * ⚠⚠⚠ WHICH IS WHY THE CARD IS THE ARCHITECTURE, not a nicer wrapper on working
 * machinery. Every previous pass — three of them, by the owner's count — fixed
 * individual stages where the prose and the bindings disagreed. A card cannot
 * disagree with itself: if the beat is a set of buttons, the text cannot promise
 * an option the buttons do not offer.
 *
 * This suite pins the owner's ruleset of 2026-08-30. Every `it` below is one of
 * his answers, in his words where they were decisive.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  persuadeDc, resolvePersuade, freshEncounter, choicesFor, applyChoice,
  onFightWon, onReenter, PERSUADE_DC, SUCCESSOR_DC_STEP, SUCCESSOR_DC_MAX,
  type EncounterState, type PersuadeStakes,
} from '../app/engine/missionEncounter';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const ROLES = JSON.parse(src('app/data/npcs/mission-roles.json')) as {
  roles: Array<{ role: string; title: string; name: string; faction: string | null; successors: string[] }>;
};
const LOCS = JSON.parse(src('app/data/locations/locations.json')) as Array<{ id: string; name: string }>;
const ATLAS = src('app/engine/atlasCoords.ts');

describe('OTA-1580 — every named role is now a person (owner rules 1-3)', () => {
  it('⚠⚠⚠ ALL 42 GENERIC ROLES IN THE MISSION DATA HAVE A NAME', () => {
    // Measured against the shipped quest data, not against a list I keep here —
    // a roster that drifts from the missions is the same defect one level up.
    const used = new Set<string>();
    for (const f of ['hunts', 'mysteries', 'faction-storylines']) {
      const raw = JSON.parse(src(`app/data/quests/${f}.json`)) as unknown;
      const rows = (Array.isArray(raw) ? raw : Object.values(raw as object).find(Array.isArray)) as
        Array<{ stages?: Array<{ npcName?: string }> }>;
      for (const h of rows) for (const s of h.stages ?? []) {
        const n = (s.npcName ?? '').trim();
        if (n && /^(the|a) /i.test(n)) used.add(n);
      }
    }
    const covered = new Set(ROLES.roles.map((r) => r.role));
    const missing = [...used].filter((u) => !covered.has(u));
    expect({ generic: used.size, missing }).toEqual({ generic: 42, missing: [] });
  });

  it('⚠⚠⚠ ONE PERSON PER ROLE — a repeated role is the same man, not a new one', () => {
    // Owner: "that would be the same person… make it persistent." So the roster
    // is keyed by ROLE and there is exactly one name behind each.
    const byRole = new Map<string, string[]>();
    for (const r of ROLES.roles) byRole.set(r.role, [...(byRole.get(r.role) ?? []), r.name]);
    for (const [role, names] of byRole) expect({ role, count: names.length }).toEqual({ role, count: 1 });
  });

  it('⚠⚠⚠ EVERY ROLE HAS SUCCESSORS, because you can kill them (rule 7)', () => {
    for (const r of ROLES.roles) {
      expect({ role: r.role, n: r.successors.length }).toEqual({ role: r.role, n: 2 });
      // A successor must not be the man they replace.
      expect(r.successors).not.toContain(r.name);
    }
  });

  it('⚠⚠ the TITLE is addressable on its own — "talk to the reclaimer broker" works', () => {
    // Owner: "it's okay to use titles… you can speak to him by his position name."
    for (const r of ROLES.roles) {
      expect(typeof r.title).toBe('string');
      expect(r.title.trim().length).toBeGreaterThan(2);
    }
    const broker = ROLES.roles.find((r) => r.role === 'the Reclaimer broker')!;
    expect(broker.title).toBe('Reclaimer Broker');
    expect(broker.name).toBe('Sabin the Broker');
  });

  it('⚠ the 19 already-named people were left alone', () => {
    // Old Mira, Brother Ammon, Jarn the dive-master and the rest were authored
    // long ago and are not in this roster — renaming them would break prose.
    const names = new Set(ROLES.roles.map((r) => r.role));
    for (const n of ['Old Mira', 'Brother Ammon', 'Jarn the dive-master', 'Sasha Ironheart']) {
      expect(names.has(n)).toBe(false);
    }
  });
});

describe('OTA-1580 — the Sentinel Ward was never missing (a correction)', () => {
  it('⚠⚠⚠ IT ALREADY RESOLVED — to the Aetheric Chamber, by alias', () => {
    // ⚠ I REPORTED THIS AS A BREAK AND IT WAS NOT. The mission gap report said
    // nine stages pointed at a tile that does not exist, including a hunt apex.
    // That was a false positive of my own making: the report used a NAME-ONLY
    // index while the real resolver (contractMarkers.posterLocationIndex) reads
    // aliases as well, and "the Sentinel Ward" has been an alias of the Aetheric
    // Chamber all along — beside "inner archive".
    const raw = JSON.parse(src('app/data/locations/locations.json')) as
      Array<{ id: string; name: string; aliases?: string[] }>;
    const chamber = raw.find((l) => l.id === 'etheric_chamber')!;
    const aliases = (chamber.aliases ?? []).map((a) => a.toLowerCase());
    expect(aliases).toContain('the sentinel ward');
    // ⚠ OTA-1601 supersede — "inner archive" WAS an alias here, and that fact
    // is what named the new ground: The Inner Archive is now a real location
    // one tile from the Ward (the apex fight moved onto it), so the chamber
    // gave the name up — ota988 refuses a shared alias rather than guessing.
    expect(aliases).not.toContain('inner archive');
    expect(raw.some((l) => l.id === 'inner_archive' && l.name === 'The Inner Archive')).toBe(true);
    // …and no second location competes for the name, which is what a new tile
    // would have created (ota988 refuses a shared alias rather than guessing).
    const claimants = raw.filter((l) =>
      (l.aliases ?? []).some((a) => a.toLowerCase().replace(/^the /, '') === 'sentinel ward'));
    expect(claimants.map((l) => l.id)).toEqual(['etheric_chamber']);
  });

  it('⚠⚠ and the PROSE is the vault, not an open field', () => {
    // "the Ward opens for you" · "drones rise from concealed cradles" · "the
    // INNER ARCHIVE is colder than the Ward outside" · "taller than the CHAMBER
    // was meant for". Written in the Aetheric Chamber's own alias vocabulary.
    const raw = JSON.parse(src('app/data/quests/hunts.json')) as { hunts?: unknown } | unknown[];
    const rows = (Array.isArray(raw) ? raw : (raw as { hunts: unknown[] }).hunts) as
      Array<{ title: string; stages: Array<{ locationName?: string; narration: string }> }>;
    const iron = rows.find((h) => h.title.includes('Iron Titan'))!;
    // ⚠ OTA-1601 supersede — combat separates: the apex stage moved one tile
    // to The Inner Archive (the place its own narration always named), so ONE
    // stage keeps the Ward's name and the archive line lives at the new ground.
    const ward = iron.stages.filter((s) => s.locationName === 'the Sentinel Ward');
    expect(ward.length).toBe(1);
    const archive = iron.stages.find((s) => s.locationName === 'The Inner Archive')!;
    expect(archive.narration).toMatch(/inner archive/i);
  });

  it('⚠ the painted-landmark count is unchanged — 38, plus the OTA-1599 satellites', () => {
    // 38 is the number the map spec hands the artist, and it still is. The
    // OTA-1599 battle-grounds are unpainted satellites in SATELLITE_ATLAS_COORDS.
    const raw = JSON.parse(src('app/data/locations/locations.json')) as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AC = require('../app/engine/atlasCoords') as typeof import('../app/engine/atlasCoords');
    // (The painted TABLE is 37 — the Hidden Market has always been the 38th
    // location, carried on the hidden record instead of the atlas table.)
    expect(Object.keys(AC.LOCATION_ATLAS_COORDS).length).toBe(37);
    expect(raw.length).toBe(38 + Object.keys(AC.SATELLITE_ATLAS_COORDS).length);
  });
});

describe('OTA-1580 — persuade is a build, not a lucky d20 (owner rules 4, 11)', () => {
  it('⚠⚠⚠ THE AVERAGE PLAYER CANNOT JUST ROLL IT AND WALK AWAY', () => {
    // Owner: "making him give it up should be a hard roll. you should have to
    // really train your charisma. plus have armor with buff stats… the average
    // player shouldn't just roll it and walk away."
    //
    // ⚠ THE FIRST DC TABLE FAILED THIS TEST, and the table was what was wrong.
    // At errand 10 / favour 14 / concession 18 / surrender 22 the owner's own
    // CHA 2 character cleared EVERY tier on a natural 20 — a skeleton key, not a
    // build. Retuned so the top of the ladder is out of reach without investment.
    //
    // CHA 2 (his character) cannot talk anyone into surrendering, on any face.
    for (let roll = 1; roll <= 20; roll++) {
      expect(resolvePersuade({ stakes: 'surrender', charisma: 2, predecessorsKilled: 0, roll }).success).toBe(false);
    }
    // …and a concession costs him a natural 20 exactly.
    const cha2 = Array.from({ length: 20 }, (_, i) =>
      resolvePersuade({ stakes: 'concession', charisma: 2, predecessorsKilled: 0, roll: i + 1 }).success)
      .filter(Boolean).length;
    expect(cha2).toBe(1);
    // An AVERAGE player is not walking away from the hard asks either.
    const cha8 = (st: PersuadeStakes) => Array.from({ length: 20 }, (_, i) =>
      resolvePersuade({ stakes: st, charisma: 8, predecessorsKilled: 0, roll: i + 1 }).success).filter(Boolean).length;
    expect(cha8('concession')).toBeLessThanOrEqual(8);
    expect(cha8('surrender')).toBeLessThanOrEqual(4);
    // A trained talker with gear (CHA 14) gets a real but not certain shot at
    // the hardest ask.
    const wins = Array.from({ length: 20 }, (_, i) =>
      resolvePersuade({ stakes: 'surrender', charisma: 16, predecessorsKilled: 0, roll: i + 1 }).success).filter(Boolean).length;
    expect(wins).toBeGreaterThanOrEqual(8);
    expect(wins).toBeLessThanOrEqual(14);
  });

  it('⚠⚠⚠ SCALED BY WHAT IS ASKED, not a flat number', () => {
    // Owner picked "scaled". Handing over a token the asker wants you to have is
    // nothing; calling off the men posted to kill you is the hard end.
    expect(PERSUADE_DC.errand).toBeLessThan(PERSUADE_DC.favour);
    expect(PERSUADE_DC.favour).toBeLessThan(PERSUADE_DC.concession);
    expect(PERSUADE_DC.concession).toBeLessThan(PERSUADE_DC.surrender);
  });

  it('⚠⚠⚠ A WIN SKIPS THE FIGHT AND CLOSES THE STAGE, and nobody dies', () => {
    // Owner: "a good enough charisma roll should eliminate the fight and just get
    // to whatever the point of the conversation was… whoever is there to fight,
    // you should just be like — oh, I guess they figured it out."
    const st = freshEncounter('hunt_servants_doubter:1');
    const step = applyChoice(st, 'persuade', {
      persuade: { stakes: 'errand', charisma: 12, predecessorsKilled: 0, roll: 20 },
    });
    expect(step.effect).toEqual({ kind: 'complete_stage', killed: false });
    expect(step.next.phase).toBe('resolved');
  });
});

describe('OTA-1580 — one attempt, ever (owner rule 5)', () => {
  it('⚠⚠⚠ A FAILED PERSUADE GOES STRAIGHT TO THE FIGHT', () => {
    const st = freshEncounter('k');
    const step = applyChoice(st, 'persuade', {
      persuade: { stakes: 'surrender', charisma: 2, predecessorsKilled: 0, roll: 1 },
    });
    expect(step.effect).toEqual({ kind: 'start_fight' });
    expect(step.next.phase).toBe('fighting');
    expect(step.next.persuadeSpent).toBe(true);
  });

  it('⚠⚠⚠ AND IT DOES NOT RESET ON FLEE-AND-RETURN — "even if you flee and come back"', () => {
    let st = freshEncounter('k');
    st = applyChoice(st, 'persuade', {
      persuade: { stakes: 'surrender', charisma: 2, predecessorsKilled: 0, roll: 1 },
    }).next;
    st = applyChoice(st, 'flee').next;
    expect(st.phase).toBe('fled');
    const back = onReenter(st);
    expect(back.next.phase).toBe('opening');
    // The button is GONE, not greyed out and not silently ignored.
    expect(choicesFor(back.next)).not.toContain('persuade');
    // ⚠ SUPERSEDED BY OTA-1581, DELIBERATELY AND IN THE OPEN. 1580 opened every
    // card with a TALK button. Counting the shipped data afterwards showed that
    // of the 114 stages naming a person, ZERO spawn anything — so TALK-then-
    // FIGHT would have put a FIGHT button that swings at nobody on all of them.
    // 1581 replaces `talk` with `proceed` (the stage's own action) and offers
    // PERSUADE/FIGHT only where a `spawn` actually stands someone up. The rule
    // this test exists for — a spent persuade never comes back — is unchanged.
    expect(choicesFor(back.next)).toEqual(['fight', 'flee']);
  });

  it('⚠⚠⚠ THEY MOCK YOU ON THE WAY BACK IN — once, not every time', () => {
    // Owner: "if you lose a persuade and you flee and come back, have them mock
    // you a little bit then fight you."
    let st: EncounterState = { key: 'k', phase: 'fled', persuadeSpent: true, mocked: false };
    const first = onReenter(st);
    expect(first.mock).toBe(true);
    st = { ...first.next, phase: 'fled' };
    expect(onReenter(st).mock).toBe(false);
  });

  it('⚠⚠ fleeing WITHOUT having spoken keeps the attempt in hand', () => {
    let st = freshEncounter('k');
    st = applyChoice(st, 'flee').next;
    const back = onReenter(st);
    expect(back.mock).toBe(false);
    expect(choicesFor(back.next)).toContain('persuade');
  });

  it('⚠ a spent attempt pressed again is refused, not re-rolled', () => {
    const st: EncounterState = { key: 'k', phase: 'opening', persuadeSpent: true, mocked: false };
    const step = applyChoice(st, 'persuade', {
      persuade: { stakes: 'errand', charisma: 20, predecessorsKilled: 0, roll: 20 },
    });
    expect(step.effect).toEqual({ kind: 'none' });
    expect(step.next.phase).toBe('opening');
  });
});

describe('OTA-1580 — successors are harder, not softer (owner rules 7, 12)', () => {
  it('⚠⚠⚠ "THEY ARE PREPARED TO DIE" — killing the last holder RAISES the bar', () => {
    // The intuitive reading is that fear makes them fold. The owner chose the
    // other one, and it is the better one: a man who watched his predecessor die
    // for this has already decided how it ends.
    const base = persuadeDc('concession', 0);
    expect(persuadeDc('concession', 1)).toBe(base + SUCCESSOR_DC_STEP);
    expect(persuadeDc('concession', 2)).toBe(base + SUCCESSOR_DC_STEP * 2);
  });

  it('⚠⚠⚠ THE SUCCESSOR GETS A FRESH ATTEMPT — new person, new conversation', () => {
    // Confirmed by the owner: the one-attempt rule is per encounter, and a
    // successor is a different man. Harder, but he will hear you out.
    const st = freshEncounter('mission_b:3');
    expect(choicesFor(st)).toContain('persuade');
    const step = applyChoice(st, 'persuade', {
      persuade: { stakes: 'favour', charisma: 16, predecessorsKilled: 1, roll: 15 },
    });
    expect(step.next.persuadeSpent).toBe(true);
  });

  it('⚠⚠ the escalation is CLAMPED — a serial killer meets a wall, not a brick one', () => {
    const base = persuadeDc('favour', 0);
    expect(persuadeDc('favour', 9)).toBe(base + SUCCESSOR_DC_MAX);
    expect(persuadeDc('favour', 99)).toBe(base + SUCCESSOR_DC_MAX);
  });

  it('⚠⚠ the card SAYS when a dead predecessor is what beat you', () => {
    // A roll that would have cleared the base bar and lost to the fear bump is
    // exactly the moment the player deserves to be told why.
    const out = resolvePersuade({ stakes: 'favour', charisma: 4, predecessorsKilled: 2, roll: 11 });
    expect(out.success).toBe(false);
    expect(out.hardenedByFear).toBe(true);
    const step = applyChoice(freshEncounter('k'), 'persuade', {
      persuade: { stakes: 'favour', charisma: 4, predecessorsKilled: 2, roll: 11 },
    });
    expect(step.say).toMatch(/seen what happens/i);
  });
});

describe('OTA-1580 — the card owns the encounter (owner rules 8, 10)', () => {
  it('⚠⚠⚠ A FIGHT HANDS OFF TO THE EXPLORATION SCREEN AND THE CARD COMES BACK', () => {
    // Owner: "if it does go to a fight, it drops back into the exploration
    // screen until that part is over. then it goes back to the pop-up to resolve
    // the rest of it."
    let st = freshEncounter('k');
    st = applyChoice(st, 'fight').next;
    expect(st.phase).toBe('fighting');
    expect(choicesFor(st)).toEqual([]);      // the card is not showing
    st = onFightWon(st);
    expect(st.phase).toBe('aftermath');
    expect(choicesFor(st)).toEqual(['take', 'take_and_kill']);
  });

  it('⚠⚠⚠ TAKE, OR TAKE AND KILL — and only the second one makes a successor', () => {
    const won = onFightWon(applyChoice(freshEncounter('k'), 'fight').next);
    expect(applyChoice(won, 'take').effect).toEqual({ kind: 'complete_stage', killed: false });
    expect(applyChoice(won, 'take_and_kill').effect).toEqual({ kind: 'complete_stage', killed: true });
  });

  it('⚠⚠ FLEE IS ALWAYS ON THE CARD — a modal with no exit is how a player gets wedged', () => {
    expect(choicesFor(freshEncounter('k'))).toContain('flee');
    expect(choicesFor({ key: 'k', phase: 'opening', persuadeSpent: true, mocked: true })).toContain('flee');
    // …even when the stage has no fight in it at all.
    // ⚠ OTA-1581: no fight to remove means no persuade to sell — the beat gets
    // its own action as a button instead. FLEE still stands, which is the rule
    // this test is actually pinning.
    expect(choicesFor(freshEncounter('k'), { hasFight: false })).toEqual(['proceed', 'flee']);
  });

  it('⚠⚠ a resolved encounter never re-opens; a fled one does', () => {
    // Owner rule 10: auto-open while the mission is active, SUMMON after a flee.
    const done: EncounterState = { key: 'k', phase: 'resolved', persuadeSpent: false, mocked: false };
    expect(onReenter(done).next.phase).toBe('resolved');
    expect(choicesFor(done)).toEqual([]);
    const fled: EncounterState = { key: 'k', phase: 'fled', persuadeSpent: false, mocked: false };
    expect(onReenter(fled).next.phase).toBe('opening');
  });

  it('⚠ take pressed outside the aftermath does nothing', () => {
    const step = applyChoice(freshEncounter('k'), 'take');
    expect(step.effect).toEqual({ kind: 'none' });
  });
});
