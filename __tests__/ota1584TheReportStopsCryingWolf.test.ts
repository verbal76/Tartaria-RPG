// ⚠⚠⚠ OTA-1584 — THE REPORT STOPS CRYING WOLF, AND THE LAST TWO PACKS SAY THEIR
// OWN NAMES.
//
// ⚠⚠ THE LESSON THIS OTA IS ABOUT. OTA-1583 tightened `PROMISES_COMBAT` because
// five of its nine hits were the pattern's own noise, and the four real ones were
// nearly lost inside them. Sections 4 and 5 were the same failure, uncaught:
// both fired at the SAME EIGHT STAGES, and all eight are the final beat of their
// mission — verbless, naming a person, written as aftermath. "You carry the
// Drowned Bell back and the founder strikes it." "The lodge-master carves your
// name small among the founders."
//
// The owner ruled on exactly those: *"that sounds like a cue for a remote turn in
// with prose, I'm ok with that."* There is nothing for a player to DO in them.
// A check that is wrong at every site it fires is worse than no check, so they
// are now counted as their OWN CLASS and the two gap sections read None.
//
// ⚠⚠⚠ AND THE CLASS GOT A GUARD, because it is only true at the END. A verbless
// stage naming a person is one of two things and the position decides which: at
// the end an epilogue, anywhere else a person the chain walks past without
// meeting — no verb can pay it and the conversation card is the only other door.
// That is precisely the defect OTA-1580's roster and OTA-1582's accept fix were
// built to end, reintroduced mid-chain. Verified to fire.

import huntsData from '../app/data/quests/hunts.json';
import mysteriesData from '../app/data/quests/mysteries.json';
import storyData from '../app/data/quests/faction-storylines.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rows = <T>(d: unknown): T[] =>
  (Array.isArray(d) ? d : (Object.values(d as object).find(Array.isArray) ?? [])) as T[];

interface Stage { narration: string; checkKind?: string | null; npcName?: string; spawn?: { enemyName: string } }
interface Mission { id: string; stages?: Stage[] }

const ALL = [
  ...rows<Mission>(huntsData),
  ...rows<Mission>(mysteriesData),
  ...rows<Mission>(storyData),
];

describe('OTA-1584 — a verbless person is an epilogue, and only at the end', () => {
  it('⚠⚠⚠ NO MID-CHAIN BEAT PARKS A PERSON WHERE NO VERB CAN REACH THEM', () => {
    const stranded: string[] = [];
    for (const m of ALL) {
      const st = m.stages ?? [];
      st.forEach((s, i) => {
        if (s.checkKind === null && s.npcName && i !== st.length - 1) stranded.push(`${m.id}#${i}`);
      });
    }
    expect(stranded).toEqual([]);
  });

  it('⚠⚠ the fourteen epilogues are all genuinely LAST', () => {
    // The claim the report's new section 4b rests on. If one of these ever stops
    // being last, the check above turns it into a hard failure rather than
    // letting it rot into a person nobody meets.
    const epilogues = ALL.flatMap((m) => {
      const st = m.stages ?? [];
      return st.map((s, i) => ({ m, s, i })).filter((x) => x.s.checkKind === null && x.s.npcName);
    });
    expect(epilogues.length).toBe(14);
    for (const { m, s, i } of epilogues) {
      expect({ at: `${m.id}#${i}`, last: i === (m.stages ?? []).length - 1 })
        .toEqual({ at: `${m.id}#${i}`, last: true });
    }
  });
});

describe('OTA-1584 — every pack says its own name', () => {
  it('⚠⚠⚠ THE LAST TWO EXCEPTIONS ARE CLOSED', () => {
    // The OTA-1576 false summits named their packs obliquely — "three of her
    // daughters", "three of his sworn, jaw-marked in the old sign". Good prose
    // that a player could not connect to the name in the combat log, which is
    // the whole class of bug 1576 was filed for, surviving inside 1576's own fix.
    const namesIt = (prose: string, enemy: string): boolean =>
      prose.includes(enemy)
      || prose.includes(`${enemy}s`)
      || (enemy.endsWith('y') && prose.includes(`${enemy.slice(0, -1)}ies`));
    const silent = ALL.flatMap((m) =>
      (m.stages ?? []).map((s, i) => ({ m, s, i })).filter((x) => x.s.spawn),
    ).filter(({ s }) => !namesIt(s.narration, s.spawn!.enemyName))
      .map(({ m, i }) => `${m.id}#${i}`);
    expect(silent).toEqual([]);
  });

  it('⚠ and the voice survived the edit', () => {
    const queen = rows<Mission>(huntsData).find((m) => m.id === 'hunt_mud_siren_queen')!;
    expect(queen.stages![1]!.narration).toContain('three Mud Sirens');
    expect(queen.stages![1]!.narration).toContain('her daughters');
    const doubter = rows<Mission>(huntsData).find((m) => m.id === 'hunt_servants_doubter')!;
    expect(doubter.stages![1]!.narration).toContain('Tartarian Raiders jaw-marked in the old sign');
  });
});

describe('OTA-1584 — the report and the gate learned the ruling', () => {
  const REPORT = readFileSync(join(__dirname, '..', 'scripts', 'mission-gap-report.mjs'), 'utf8');
  const GATE = readFileSync(join(__dirname, '..', 'scripts', 'check-mission-claims.mjs'), 'utf8');
  const GAPS = readFileSync(join(__dirname, '..', 'MISSION_GAPS.md'), 'utf8');

  it('⚠⚠⚠ SECTIONS 4 AND 5 READ NONE, because they were wrong at every site', () => {
    expect(GAPS).toContain('## 4b. Epilogues');
    // Both gap sections now report clean; the epilogues are their own class.
    const sec4 = GAPS.slice(GAPS.indexOf('## 4. No early completion'), GAPS.indexOf('## 4b.'));
    const sec5 = GAPS.slice(GAPS.indexOf('## 5. Prose says you take'));
    expect(sec4).toContain('**None.**');
    expect(sec5).toContain('**None.**');
  });

  it('⚠⚠ the owner\'s words are recorded where the rule lives', () => {
    // A ruling that only exists in a chat log is a ruling that gets re-litigated.
    expect(REPORT).toContain('a cue for a remote turn in with prose');
    expect(GATE).toContain('remote turn in with prose');
  });

  it('⚠⚠⚠ and the class is GUARDED, not merely excused', () => {
    expect(GATE).toContain('stands in a verbless MID-CHAIN beat');
    expect(GATE).toContain('walks past the person without meeting them');
  });
});
