// OTA-837 — Tier-1 QoL #2: discovery codex. The Lore codex gained a BESTIARY tab
// (fills in as you defeat enemy types) and a LORE tab that surfaces the concepts
// bank that was in the files but never shown to the player. No component-render
// harness exists in this repo, so this locks the two things the UI depends on:
//   (1) the data contracts (enemies catalog + concepts bank are well-formed), and
//   (2) the bestiary discovery predicate (case-insensitive name match vs
//       worldMemory.defeatedEnemies) reveals exactly the beaten foes.

import enemiesData from '../app/data/enemies/enemies.json';
import conceptsData from '../app/data/lore/concepts.json';

interface CodexEnemy { name: string; type?: string; hp?: number }
interface LoreConcept { id: string; title: string; answer: string }

const enemies = enemiesData as CodexEnemy[];
const concepts = (conceptsData as { concepts: LoreConcept[] }).concepts;

// The exact gate the component uses.
const revealed = (defeated: string[]) => {
  const set = new Set(defeated.map((n) => n.toLowerCase()));
  return enemies.filter((e) => set.has(e.name.toLowerCase()));
};

describe('OTA-837 (1) — data contracts the codex renders', () => {
  it('the enemy catalog is a non-empty list of named foes', () => {
    expect(Array.isArray(enemies)).toBe(true);
    expect(enemies.length).toBeGreaterThan(50);
    expect(enemies.every((e) => typeof e.name === 'string' && e.name.length > 0)).toBe(true);
  });
  it('the concepts bank is non-empty and every entry has a title + answer', () => {
    expect(concepts.length).toBeGreaterThan(100);
    expect(concepts.every((c) => !!c.id && !!c.title && !!c.answer)).toBe(true);
  });
});

describe('OTA-837 (2) — bestiary discovery gate', () => {
  it('reveals nothing before any kill', () => {
    expect(revealed([])).toHaveLength(0);
  });
  it('reveals a foe once its type is defeated (case-insensitive)', () => {
    const first = enemies[0]!.name;
    const shown = revealed([first.toUpperCase()]); // stored casing must not matter
    expect(shown.map((e) => e.name)).toContain(first);
    expect(shown).toHaveLength(1);
  });
  it('an unbeaten foe stays hidden', () => {
    const shownNames = revealed([enemies[0]!.name]).map((e) => e.name);
    expect(shownNames).not.toContain(enemies[1]!.name);
  });
});
