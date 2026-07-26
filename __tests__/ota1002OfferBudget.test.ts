// OTA-979 — #121: the offer firehose. Root cause: four independent offer
// emitters in the scene-entry vendor block (contract / bounty board / mystery
// notice / thick scroll), each firing whenever its pool was stocked — no
// aggregate budget. Agents now pitch two rotating categories per macro visit.
// Plus: the all_or_nothing escort tier (full pay or lose everything) sat at
// rep 18-22 — a newcomer trap. Floored at rep 25.
import * as fs from 'fs';
import * as path from 'path';
import { FACTION_QUESTS, availableFactionQuests } from '../app/engine/factionQuests';

describe('OTA-979 — offer budget + all_or_nothing rep floors', () => {
  it('every all_or_nothing escort demands rep 25+ (earned trust, not a newcomer trap)', () => {
    const aon = FACTION_QUESTS.filter((q) => q.escort?.mode === 'all_or_nothing');
    expect(aon.length).toBeGreaterThanOrEqual(8);
    for (const q of aon) {
      expect(q.requirement.rep).toBeGreaterThanOrEqual(25);
    }
  });

  it('a rep-24 visitor is never offered the hard tier; a rep-30 regular is', () => {
    const low = availableFactionQuests('stone_builders', 24, [], []);
    expect(low.some((q) => q.escort?.mode === 'all_or_nothing')).toBe(false);
    const high = availableFactionQuests('stone_builders', 30, [], []);
    expect(high.some((q) => q.escort?.mode === 'all_or_nothing')).toBe(true);
  });

  it('category lock: all four offer emitters are budget-gated; turn-in hints are not', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'),
      'utf8',
    );
    // The rotation exists once, keyed on macroVisitSeq.
    expect(src).toMatch(/offerRot = \(player\.macroVisitSeq \?\? 0\) % 4/);
    // Each of the four offer pools is wrapped in the budget…
    expect(src).toContain("offerAllowed.has('fq') && pool.length > 0");
    expect(src).toContain("offerAllowed.has('hunt') && huntPool.length > 0");
    expect(src).toContain("offerAllowed.has('mystery') && mysteryPool.length > 0");
    expect(src).toContain("offerAllowed.has('storyline') && storyPool.length > 0");
    // …and no offer pool is left unbudgeted (the raw guards must be gone).
    expect(src).not.toMatch(/^\s*if \(pool\.length > 0\) \{/m);
    expect(src).not.toMatch(/^\s*if \(huntPool\.length > 0\) \{/m);
    expect(src).not.toMatch(/^\s*if \(mysteryPool\.length > 0\) \{/m);
    expect(src).not.toMatch(/^\s*if \(storyPool\.length > 0\) \{/m);
    // Turn-in hints stay unbudgeted — owed work always gets a word.
    expect(src).toMatch(/^\s*if \(turnable\.length > 0\) \{/m);
    expect(src).toMatch(/^\s*if \(huntTurnable\.length > 0\) \{/m);
  });

  it('the rotation covers every category within two consecutive visits', () => {
    const cats = ['fq', 'hunt', 'mystery', 'storyline'];
    for (let seq = 0; seq < 8; seq++) {
      const rot = seq % 4;
      const now = new Set([cats[rot]!, cats[(rot + 1) % 4]!]);
      const next = new Set([cats[(rot + 1) % 4]!, cats[(rot + 2) % 4]!]);
      expect(now.size).toBe(2);
      const union = new Set([...now, ...next]);
      expect(union.size).toBe(3); // walks one step — fresh category every visit
    }
  });
});
