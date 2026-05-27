// Wasteland encounters: every region must intersect at least one
// archetype's matcher list, otherwise pickWastelandEncounter
// always returns null and the player walks for hours with zero
// caravans, drifters, skirmishes, mini-dungeons, etc.
//
// Playtester report (2026-05-21): "moved a ton and not one
// encounter, NPC, quest, dungeon, enemy, trader". Audit found
// that 3 of 5 regions — Tartarian Outskirts (starter), Cradle of
// Dusk, and Mud Seas — had zero matcher overlap. Fix: added the
// missing tags. This test pins it so re-tagging a region without
// keeping a matcher-compatible tag fails CI loudly.

import locations from '../app/data/locations/locations.json';
import wasteland from '../app/data/world/wasteland_encounters.json';

type Loc = { id: string; name: string; type: string; tags?: string[] };
type Archetype = { matchers?: string[] };
type WastelandFile = Record<string, Archetype | unknown>;

function collectMatchers(): Set<string> {
  const file = wasteland as unknown as WastelandFile;
  const out = new Set<string>();
  for (const val of Object.values(file)) {
    if (val && typeof val === 'object' && 'matchers' in (val as object)) {
      const ms = (val as Archetype).matchers ?? [];
      for (const m of ms) out.add(m.toLowerCase());
    }
  }
  return out;
}

describe('wasteland encounter coverage', () => {
  const matchers = collectMatchers();

  it('every region location has at least one tag that matches an encounter archetype', () => {
    const regions = (locations as Loc[]).filter((l) => l.type === 'region');
    const failures: string[] = [];
    for (const loc of regions) {
      const tags = new Set((loc.tags ?? []).map((t) => t.toLowerCase()));
      const intersect = [...tags].filter((t) => matchers.has(t));
      if (intersect.length === 0) {
        failures.push(`${loc.name} (${loc.id}) — tags=${[...tags].join(',')} — zero matcher intersection`);
      }
    }
    if (failures.length > 0) {
      console.error('Regions with no encounter coverage:\n' + failures.join('\n'));
    }
    expect(failures).toEqual([]);
  });

  it('at least one region matches each commonly-authored matcher', () => {
    // Inverse check — a matcher that no region uses means an
    // authored archetype is dead content. Not a hard failure
    // (someone might be drafting a new biome) but useful for
    // catching obvious orphans during the next pass.
    const regions = (locations as Loc[]).filter((l) => l.type === 'region');
    const reachedMatchers = new Set<string>();
    for (const loc of regions) {
      for (const t of (loc.tags ?? []).map((t) => t.toLowerCase())) {
        if (matchers.has(t)) reachedMatchers.add(t);
      }
    }
    // Sanity floor — the three matchers we KNOW we use across the
    // existing roster (mud, open, ruin) MUST resolve to at least
    // one region. If any disappears, the encounters for that
    // matcher become unreachable.
    expect(reachedMatchers.has('mud')).toBe(true);
    expect(reachedMatchers.has('open')).toBe(true);
    expect(reachedMatchers.has('ruin')).toBe(true);
  });
});
