// OTA-1184 — COMPLETED STORIES NOW GRANT PERMANENT BUFFS.
//
// Owner (2026-08-09): *"see if there are certain stories that lead well into adding an
// active buff. completing certain storyline collectable should maybe add +1 damage to
// electrical items, or +1 frost defense if the story is about dying in the cold. it
// doesn't have to be for all of them, but enough to make it worthwhile collecting them."*
// Then, on the shortlist: *"I like 5 of the 6, drop the mud family and add the st.
// petersburg perk story."*
//
// ⚠⚠ THE RULE THIS SUITE ENFORCES ABOVE ALL ELSE: **every perk must have a real
// consumption point.** A buff that aggregates and is never read is a NEW "ends in
// nothing" — the exact defect PUNCHLIST P1 was filed for. Adding five of them while
// closing P1 would have been the funniest possible own goal. Each perk below is asserted
// against the code that actually reads it.
//
// ⚠ THE SIREN OF ZHARAK'S TEETH IS NOT HERE, and its absence is the point. The owner
// picked it (charm resistance) and the theme fits — but the game has **no charm or
// mental-influence mechanic**, verified across `statusEffects.ts` and `combatRules.ts`.
// Shipping it would have meant inventing a status effect to justify a buff. It is on the
// punch list as an open design question instead of being quietly dropped.

// ⚠ OTA-1399 — SLICE 8 sent vendor / inventory / crafting into
// `app/state/slices/`. Re-pointed via `storeSource()`, which reads gameStore AND
// every slice — that is what a pin on THE STORE has meant since slice 4, and this
// is the case the helper was built for: a slice IS the store, same object, same
// keys, same 473 importers. (Slices 5-7 moved code DOWN to leaves instead, which
// storeSource deliberately does NOT see; those suites name their leaf directly.)
import { storeSource } from '../test-utils/storeSource';
import {
  STORY_PERKS,
  storyPerkModifiers,
  storyPerkLabel,
  CHARACTER_STORIES,
} from '../app/engine/collectables';
import fs from 'fs';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const idsOf = (storyId: string) =>
  CHARACTER_STORIES.find((s) => s.id === storyId)!.fragments.map((f) => f.id);

describe('OTA-1184 — the five perks the owner picked', () => {
  test('the five the owner chose here all carry a perk', () => {
    // ⚠ RETARGETED BY OTA-1189. This asserted the perk list was EXACTLY these five, which
    // was right when it was written and became wrong the moment PUNCHLIST P6 closed and the
    // Siren joined them. It now pins what this OTA actually decided — that these five were
    // chosen and shipped — and leaves the total to the OTA that owns it.
    const ids = new Set(STORY_PERKS.map((p) => p.storyId));
    for (const id of [
      'story_giant', 'story_reclaimer_greed', 'story_sentinel',
      'story_siege', 'story_zalmar_cascade',
    ]) expect(ids.has(id)).toBe(true);
  });

  test('⚠ The Family in the Mud pays lore only — dropped by the owner', () => {
    expect(storyPerkLabel('story_family')).toBeNull();
  });

  test('⚠⚠ the Siren was the SIXTH pick and did not ship here — closed later by OTA-1189', () => {
    // The owner picked six; this OTA shipped five. The Siren was held back because the
    // obvious perk was charm resistance and the game had no charm mechanic — inventing a
    // status effect to justify a buff is backwards. It was filed as PUNCHLIST P6 and the
    // owner answered it with charisma, so it now carries a perk. What matters to THIS
    // suite is that it was not quietly substituted at the time, and it was not.
    const src = fs.readFileSync(path.join(__dirname, '..', 'app/engine/collectables.ts'), 'utf8');
    expect(src).toContain('OTA-1189 (PUNCHLIST P6 CLOSED)');
    expect(storyPerkLabel('story_siren')).toMatch(/charisma/i);
  });

  test('most stories still pay nothing, which is what keeps the perks meaningful', () => {
    // ⚠ RETARGETED: was a hardcoded 5. The rule is what matters — a perk on every story
    // would make finishing any particular one unremarkable — and the rule survives a
    // sixth perk being added, which a fixed count does not.
    const withPerk = CHARACTER_STORIES.filter((s) => storyPerkLabel(s.id) !== null).length;
    expect(withPerk).toBeGreaterThanOrEqual(5);
    expect(withPerk).toBeLessThan(CHARACTER_STORIES.length);
  });

  test('every perk row points at a story that exists', () => {
    const known = new Set(CHARACTER_STORIES.map((s) => s.id));
    for (const p of STORY_PERKS) expect(known.has(p.storyId)).toBe(true);
  });

  test('every perk has a player-facing label', () => {
    for (const p of STORY_PERKS) {
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(8);
    }
  });
});

describe('OTA-1184 — only a COMPLETED set pays', () => {
  test('an empty collection grants nothing', () => {
    const m = storyPerkModifiers([]);
    expect(m.tradeBonus).toBe(0);
    expect(m.ruinsDefenseBonus).toBe(0);
    expect(m.mechanicalDamageDice).toBe(0);
    expect(m.electricalDamageBonus).toBe(0);
    expect(m.grantsColdResist).toBe(false);
  });

  test('⚠ a PARTIAL set grants nothing — that is what makes finishing worth doing', () => {
    const partial = idsOf('story_zalmar_cascade').slice(0, -1);
    expect(storyPerkModifiers(partial).electricalDamageBonus).toBe(0);
  });

  test('the closing fragment turns the perk on', () => {
    expect(storyPerkModifiers(idsOf('story_zalmar_cascade')).electricalDamageBonus).toBe(1);
  });

  test('each of the five lands its own effect', () => {
    expect(storyPerkModifiers(idsOf('story_giant')).grantsColdResist).toBe(true);
    expect(storyPerkModifiers(idsOf('story_reclaimer_greed')).tradeBonus).toBe(1);
    expect(storyPerkModifiers(idsOf('story_sentinel')).mechanicalDamageDice).toBe(1);
    expect(storyPerkModifiers(idsOf('story_siege')).ruinsDefenseBonus).toBe(1);
  });

  test('they stack when several sets are done', () => {
    const both = [...idsOf('story_zalmar_cascade'), ...idsOf('story_siege')];
    const m = storyPerkModifiers(both);
    expect(m.electricalDamageBonus).toBe(1);
    expect(m.ruinsDefenseBonus).toBe(1);
  });
});

describe('⚠⚠ OTA-1184 — EVERY PERK HAS A CONSUMER. This is the whole rule.', () => {
  const STORE = storeSource();
  const TITLES = SRC('app/engine/titles.ts');

  test('story perks merge into the ONE accumulator every consumer already calls', () => {
    // A parallel aggregator would have meant finding and updating every existing call
    // site — and missing one silently is how a buff ends up aggregated and never read.
    expect(TITLES).toContain('const sp = storyPerkModifiers(player.collectables ?? [])');
    expect(TITLES).toContain('acc.tradeBonus += sp.tradeBonus;');
    expect(TITLES).toContain('acc.ruinsDefenseBonus += sp.ruinsDefenseBonus;');
    expect(TITLES).toContain('acc.mechanicalDamageDice += sp.mechanicalDamageDice;');
    expect(TITLES).toContain('acc.electricalDamageBonus += sp.electricalDamageBonus;');
  });

  test('tradeBonus is read by the sell-price path', () => {
    expect(STORE).toMatch(/tPerksSell\.tradeBonus > 0/);
    expect(STORE).toMatch(/0\.05 \* tPerksSell\.tradeBonus/);
  });

  test('ruinsDefenseBonus is read by the AC path', () => {
    expect(STORE).toMatch(/tPerks\.ruinsDefenseBonus > 0/);
    expect(STORE).toContain("detectACContexts(player, scene).has('constructed_environment')");
  });

  test('mechanicalDamageDice is read by the attack path', () => {
    expect(STORE).toMatch(/tPerksAtk\.mechanicalDamageDice > 0/);
    expect(STORE).toMatch(/titleDmgBonus \+= rollDie\(6\)/);
  });

  test('⚠ electricalDamageBonus is read, and gated on the WEAPON type', () => {
    // Gated on the swing's own type, not the enemy's: Zalmar built the Engine, so what he
    // teaches is how to drive the current, not what to point it at.
    expect(STORE).toContain('if (tPerksAtk.electricalDamageBonus > 0)');
    expect(STORE).toContain("const swingType = String(weaponType ?? '').toLowerCase();");
    expect(STORE).toContain("swingType === 'electrical' || swingType === 'aetheric'");
    expect(STORE).toContain('titleDmgBonus += tPerksAtk.electricalDamageBonus;');
  });

  test('⚠ cold resist is injected at the ONE function ~16 sites read', () => {
    // playerArmorResistKinds feeds weather ticks, weather stat modifiers, attack
    // penalties and visibility. Injecting at the source means no site is silently missed.
    const i = STORE.indexOf('export function playerArmorResistKinds');
    expect(i).toBeGreaterThan(-1);
    const body = STORE.slice(i, i + 1400);
    expect(body).toContain('grantsColdResist');
    expect(body).toContain("kinds.push('cold')");
    // ⚠ And it must not double-add over an armour piece that already resists cold.
    expect(body).toContain("!kinds.includes('cold')");
  });

  test('⚠ the perk lookup can never break the resist read', () => {
    const i = STORE.indexOf('export function playerArmorResistKinds');
    const body = STORE.slice(i, i + 1400);
    expect(body).toContain('try {');
    expect(body).toContain('catch');
  });

  test('the Collectibles tab shows the buff a finished story pays', () => {
    const src = SRC('app/screens/ContractsScreen.tsx');
    expect(src).toContain('storyPerkLabel(story.id)');
  });
});
