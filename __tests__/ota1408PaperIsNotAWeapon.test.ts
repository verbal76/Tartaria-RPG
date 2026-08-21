/**
 * OTA-1408 — A PAPER CHART OFFERED TO BE WIELDED.
 *
 * Owner, from his 4.31.5 pack dump: *"also fix the fang thing from the last log
 * as well."* Five identical Skyreacher charts, and exactly one of them carried
 * equip actions:
 *
 *   Skyreacher Map 1 of 5 — Grand Spire      actions: use, drop
 *   Skyreacher Map 4 of 5 — Thametan Tower   actions: use, drop
 *   Skyreacher Map 5 of 5 — Zharak Fang      actions: equip:main, equip:off, use(off)
 *
 * `validSlotsForItem` ends in a deliberately generous name-regex — the owner's
 * own rule was *"anything that LOOKS equippable should BE equippable, even if
 * the catalog row hasn't been written yet"* — and that regex matches `\bfang\b`.
 * Zharak Fang is a mountain. Maps 1-4 name towers and spires, so the defect
 * could only ever surface on one row out of five.
 *
 * ⚠⚠ THE SAME TRAP, PREDICTED AND UNDER-SCOPED. The MATERIALS guard directly
 * above it exists because "Sentinel Core Plate" matched the ARMOR regex and got
 * routed to the chest slot, and its comment says out loud: *"Same trap for any
 * future material whose name happens to contain helm / boot / blade tokens."*
 * It was right about the trap and wrong about the class — the class is not
 * materials, it is EVERYTHING THAT ALREADY SAYS WHAT IT IS. A chart, a journal
 * leaf, a coin and a fusion trophy all say so in their tags, and all of them
 * were falling through to a regex that only reads names.
 */
import { validSlotsForItem } from '../app/engine/equipment';
import type { InventoryItem } from '../app/engine/types';

const mk = (name: string, tags: string[], over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'x', name, kind: 'misc', rarity: 'Common', quantity: 1, tags, ...over,
} as InventoryItem);

describe('OTA-1408 — the row from the owner\'s pack', () => {
  it('⚠⚠ Skyreacher Map 5 of 5 — Zharak Fang is paper, not a weapon', () => {
    expect(validSlotsForItem(mk('Skyreacher Map 5 of 5 — Zharak Fang',
      ['gift', 'map', 'skyreacher', 'skyreacher_chart', 'chart']))).toEqual([]);
  });

  it('⚠ …and the four that were already right are still right', () => {
    for (const n of ['Grand Spire', 'Asgardar Spire', 'Obsidian Monolith', 'Thametan Tower']) {
      expect(validSlotsForItem(mk(`Skyreacher Map of 5 — ${n}`,
        ['gift', 'map', 'skyreacher', 'skyreacher_chart', 'chart']))).toEqual([]);
    }
  });
});

describe('OTA-1408 — the rest of the class the materials guard missed', () => {
  it('⚠ coins, keepsakes and fusion trophies are not gear either', () => {
    expect(validSlotsForItem(mk('Worn Tartarian Coin', ['currency', 'metal', 'pre-flood']))).toEqual([]);
    expect(validSlotsForItem(mk('True Tartarian Sigil', ['sigil', 'keepsake', 'loot']))).toEqual([]);
    // A trophy named for the thing it came off — "Brittle Antler Fork",
    // "Coiled Snare Thread" — is a fusion piece, never a held item.
    expect(validSlotsForItem(mk('Serpent Fang Trophy', ['trophy', 'organic']))).toEqual([]);
  });

  it('⚠ a journal leaf stays readable rather than becoming a club', () => {
    expect(validSlotsForItem(mk('Personal Report B — The Black Cloak Confessions',
      ['collectable', 'page', 'lore']))).toEqual([]);
  });
});

describe('OTA-1408 — and the generosity the regex exists for is UNTOUCHED', () => {
  it('⚠⚠ the playtest case that put the regex there still works', () => {
    // "Player picked up Mud-Rend Blade — clearly a weapon by name — but the
    // inventory modal said 'No record of this item in the catalog'." That is the
    // whole reason the fallback is generous, and this fix must not narrow it.
    expect(validSlotsForItem(mk('Mud-Rend Blade', ['weapon', 'melee']))).toEqual(['main', 'off']);
  });

  it('⚠⚠ a REAL weapon called a Fang still equips — the word was never the problem', () => {
    expect(validSlotsForItem(mk('Serpent Fang Dagger', ['weapon', 'melee', 'blade']))).toEqual(['main', 'off']);
    expect(validSlotsForItem(mk('Zharak Fang Spear', ['weapon', 'melee']))).toEqual(['main', 'off']);
  });

  it('⚠ an unknown-to-catalog helm is still a helm', () => {
    expect(validSlotsForItem(mk('Drowned Warden\'s Faceguard', ['armor', 'head']))).toEqual(['head']);
  });
});

describe('OTA-1408 — the guard is tag-driven, and no real gear carries those tags', () => {
  it('⚠⚠ a weapon that somehow carried a paper tag would lose its slot — so none may', () => {
    // This is the risk the fix takes, stated rather than hidden: the guard sits
    // BEFORE the name regex, so a tag collision costs a real item its slot. Every
    // catalog file was scanned when this shipped and zero weapons or armour carry
    // any of these tags. This test is the reminder to re-check if that changes.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app', 'engine', 'equipment.ts'), 'utf8') as string;
    expect(src).toContain('const NEVER_EQUIPPABLE_TAGS = new Set([');
    expect(src).toContain('Verified against every catalog file');
    // ⚠⚠ ORDERED ABOVE EVERY NAME-BASED LOOKUP, and that ordering is the fix.
    // Probing found THREE layers of name inference, not one: the bottom regex,
    // the fuzzy catalog lookups (a document titled "The Black Cloak Confessions"
    // resolves to cloak ARMOUR), and `canonicalItemTags`, which invents tags from
    // names outright ("Serpent Fang Trophy" → weapon, natural, melee, improvised).
    // A guard placed after the catalog lookups fixed the chart and missed both.
    expect(src.indexOf('NEVER_EQUIPPABLE_TAGS.has'))
      .toBeLessThan(src.indexOf('if (findWeaponByName(item.name))'));
    expect(src.indexOf('NEVER_EQUIPPABLE_TAGS.has'))
      .toBeLessThan(src.indexOf('const armor = findArmorByName(item.name);'));
    // …but BELOW uniqueStats: a fused piece's name is synthesised, so it must
    // route off its own stats before any tag is read (OTA-224).
    expect(src.indexOf("if (u.kind === 'weapon') return ['main', 'off'];"))
      .toBeLessThan(src.indexOf('NEVER_EQUIPPABLE_TAGS.has'));
  });

  it('⚠ a fused piece still routes off its uniqueStats, ahead of any tag', () => {
    // OTA-224's path: a fused weapon's name is synthesised and catalog-absent, so
    // it must never depend on tags at all.
    expect(validSlotsForItem(mk('Quarry-Hewn Skewer', ['trophy'], {
      kind: 'weapon', uniqueStats: { kind: 'weapon' } as InventoryItem['uniqueStats'],
    }))).toEqual(['main', 'off']);
  });
});
