// OTA-1212 — PUNCHLIST P6 CLOSED. The Siren of Zharak's Teeth pays +1 Charisma.
//
// ⚠ WHY IT WAS OPEN. The owner picked six stories for perks in OTA-1207; five shipped.
// The Siren did not, because the obvious reading is resistance to her lure and **the game
// has no charm, compulsion or mental-influence mechanic to resist** — verified across
// statusEffects.ts and combatRules.ts. Inventing a status effect to justify a buff is
// backwards, so it was filed rather than quietly substituted.
//
// Owner's answer (2026-08-09): *"p6 charisma?"* — and the fiction supports it. Five verses
// scratched inside a Reclaimer's flask, the hand growing more careful as it goes, the flask
// found empty. He is not resisting her; he is writing her down. What the player inherits is
// not immunity to a voice but knowing how a voice takes hold.

import {
  STORY_PERKS,
  storyPerkModifiers,
  storyPerkLabel,
  CHARACTER_STORIES,
} from '../app/engine/collectables';
import { EMPTY_TITLE_PERKS } from '../app/engine/titles';
import fs from 'fs';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const idsOf = (storyId: string) =>
  CHARACTER_STORIES.find((s) => s.id === storyId)!.fragments.map((f) => f.id);

describe('OTA-1212 — the Siren finally pays', () => {
  test('the story carries a perk now', () => {
    expect(storyPerkLabel('story_siren')).not.toBeNull();
    expect(storyPerkLabel('story_siren')).toMatch(/charisma/i);
  });

  test('a completed set grants +1 CHA', () => {
    expect(storyPerkModifiers(idsOf('story_siren')).charismaBonus).toBe(1);
  });

  test('⚠ a PARTIAL set grants nothing, like every other story perk', () => {
    const partial = idsOf('story_siren').slice(0, -1);
    expect(storyPerkModifiers(partial).charismaBonus).toBe(0);
  });

  test('an empty collection grants nothing', () => {
    expect(storyPerkModifiers([]).charismaBonus).toBe(0);
  });

  test('it is the SIXTH perk — the other five are untouched', () => {
    expect(STORY_PERKS).toHaveLength(6);
    const both = [...idsOf('story_siren'), ...idsOf('story_zalmar_cascade')];
    const m = storyPerkModifiers(both);
    expect(m.charismaBonus).toBe(1);
    expect(m.electricalDamageBonus).toBe(1);
  });

  test('⚠ The Family in the Mud still pays lore only — the owner dropped it', () => {
    expect(storyPerkLabel('story_family')).toBeNull();
  });

  test('half the stories still pay nothing, which is what keeps the six meaningful', () => {
    const withPerk = CHARACTER_STORIES.filter((s) => storyPerkLabel(s.id) !== null).length;
    expect(withPerk).toBe(6);
    expect(withPerk).toBeLessThan(CHARACTER_STORIES.length);
  });
});

describe('⚠⚠ OTA-1212 — THE PERK HAS CONSUMERS. Same rule OTA-1207 shipped under.', () => {
  test('it merges into the ONE accumulator every consumer already calls', () => {
    const titles = SRC('app/engine/titles.ts');
    expect(titles).toContain('acc.charismaBonus += sp.charismaBonus;');
    expect(EMPTY_TITLE_PERKS.charismaBonus).toBe(0);
  });

  test('⚠ it is injected at effectiveStats — the single funnel every stat read passes', () => {
    // Exactly how OTA-910's Skyreacher +DEX is wired. One injection, no call site can miss it.
    const eq = SRC('app/engine/equipment.ts');
    expect(eq).toContain('const titleCha = titlePerks.charismaBonus ?? 0;');
    // ⚠ Read the LINE, not a regex across it. The first version used `[^)]*`, which cannot
    // cross the `)` in `(bonus.charisma ?? 0)` — a pattern that could never have matched
    // the correct code. Same shape of mistake as the OTA-1209 call-site regex.
    const chaLine = eq.split('\n').find((l) => l.trim().startsWith('charisma: Math.max(1,'));
    expect(chaLine).toBeDefined();
    expect(chaLine!).toContain('+ titleCha)');
  });

  test('⚠⚠ CONSUMER 1 — diplomacy checks read charisma', () => {
    // If this mapping ever moved, the perk would still aggregate and quietly stop mattering
    // for half its purpose — the "ends in nothing" defect in miniature.
    expect(SRC('app/engine/combatRules.ts')).toMatch(/diplomacy:\s*'charisma'/);
  });

  test('⚠⚠ CONSUMER 2 — the vendor discount reads charisma', () => {
    const rapport = SRC('app/engine/factionRapport.ts');
    expect(rapport).toContain('export function chaPriceDiscount(charisma: number)');
    expect(rapport).toMatch(/chaPriceDiscount\(charisma\)/);
  });

  test('⚠ and the floor still applies, so no debuff stack can drive CHA below 1', () => {
    const eq = SRC('app/engine/equipment.ts');
    expect(eq).toMatch(/charisma: Math\.max\(1,/);
  });
});

describe('⚠ OTA-1212 — no charm mechanic was invented to justify it', () => {
  test('statusEffects still has no charm, compulsion or lure state', () => {
    // The reason P6 stayed open. If someone later builds one, this fails and the perk
    // choice should be revisited on purpose rather than by accident.
    const se = SRC('app/engine/statusEffects.ts');
    expect(se).not.toMatch(/\b(charmed|compelled|beguiled|enthralled)\b/i);
  });
});
