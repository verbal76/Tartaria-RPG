import { FACTION_QUESTS } from '../app/engine/factionQuests';
import factionsData from '../app/data/factions/factions.json';
import type { Faction } from '../app/engine/types';

const FACTIONS = factionsData as Faction[];

// HANDOFF §5 #8: turn-in failure messages now name the actual faction(s)
// the player owes a contract to instead of saying generic "find a faction
// agent." That lookup chain is: active faction-quest id → FactionQuest.
// factionId → FACTIONS[].name. If the data files ever drift apart this
// chain silently falls back to a raw id with underscores, which is the
// exact UX regression the fix was meant to remove.

describe('faction-quest → faction-name lookup chain', () => {
  it('every faction quest references a faction that exists in FACTIONS', () => {
    const knownIds = new Set(FACTIONS.map((f) => f.id));
    const orphans: string[] = [];
    for (const q of FACTION_QUESTS) {
      if (!knownIds.has(q.factionId)) {
        orphans.push(`${q.id} → ${q.factionId}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('every faction has a human-readable name (no raw id leakage)', () => {
    for (const f of FACTIONS) {
      expect(f.name.length).toBeGreaterThan(0);
      // A "human-readable" name should not be the raw id (no underscores).
      expect(f.name).not.toMatch(/_/);
    }
  });
});
