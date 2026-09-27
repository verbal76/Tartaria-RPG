/**
 * OTA-1527 — THE CHIP ROW ANSWERED WHAT THE INTEL GATE HAD JUST REFUSED.
 *
 * The owner sent a portrait of an Eternal Dynasty Raider and asked what the words
 * under the BURN box were. Twelve chips:
 *
 *   Armored · Savage · Quick · Ambusher · Bleeder · Concussive · Vuln Piercing
 *   inured:slashing · inured:poison · inured:corruption · Resist Aetheric · profiled
 *
 * Three of them were raw ids, one was a duplicate of the line four rows above,
 * and one was internal bookkeeping. But reading them settled something larger.
 *
 * ⚠⚠ THE SPAWN IS RECONSTRUCTIBLE FROM ITS OWN CHIPS. randomizeEnemyDefense
 * stamps `inured:` on every kind-weakness EXCEPT the rolled one, and
 * `vulnerable:<rolled>`. inured{slashing, poison, corruption} + vulnerable:piercing
 * matches exactly one row of TYPE_RESISTANCE_MAP — Human, weak to
 * piercing/slashing/poison/corruption. So this raider's real defences are
 * `RESIST Aetheric · WEAK Piercing, Slashing, Poison, Corruption`.
 *
 * The card read `RESIST Aetheric · WEAK Burn`. Running defensesFor's arithmetic
 * over that trait set against every type in the table returns Piercing in the
 * weakness list for all ten rows — no type yields `WEAK Burn` alone. The card was
 * therefore in the OTA-838 OBSERVED branch, showing only what the player had
 * learned by hitting. The chip row underneath was showing the ground truth.
 *
 * ⚠⚠⚠ THE ERROR CLASS: A GATE ON ONE READER AND A SECOND READER OF THE SAME DATA.
 * OTA-798 gates the RESIST/WEAK block on Wisdom, OTA-838 replaces the free read
 * with strike-to-learn, OTA-1117 adds a dial that switches the free read off
 * entirely. Three OTAs guarding one reader. The chip row mapped every trait
 * unconditionally, so a card printing `DEF ? — strike to learn` could be answered
 * by reading two lines down — and the detail popup had the identical hole,
 * narrating "You can't read its weaknesses at a glance" and then listing the raw
 * traits beneath it. Same shape as OTA-1413's many-doors mistake, which the file
 * names in as many words.
 */
import { describeTrait, portraitTraitChips } from '../app/engine/enemyTraits';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const PANEL = src('app', 'components', 'EnemyPanel.tsx');

/** The owner's raider, exactly as its portrait printed it. */
const RAIDER = [
  'armored', 'savage', 'quick', 'ambush_strike', 'bleeder', 'concussive',
  'vulnerable:piercing', 'inured:slashing', 'inured:poison', 'inured:corruption',
  'resist:aetheric', 'profiled',
];

describe('OTA-1527 — the chip row respects the gate that guards the line above it', () => {
  it('⚠⚠⚠ GATE CLOSED: nothing in the row names a damage type', () => {
    const chips = portraitTraitChips(RAIDER, false).map(describeTrait);
    // Behavioural traits stay — you can see how a thing fights by watching it.
    expect(chips).toEqual([
      'Armored (+2 AC)', 'Savage (+1 ATK)', 'Quick (+1 ATK, 12% dodge)',
      'Ambusher (+2 first strike)', 'Bleeder (50% bleed)', 'Concussive (20% stun)',
    ]);
    // ⚠ THE CLAIM THAT MATTERS: with the gate shut, the row cannot be read as a
    // defence sheet. Pre-1527 it printed Vuln Piercing and Resist Aetheric here.
    for (const c of chips) {
      expect(c).not.toMatch(/piercing|slashing|poison|corruption|aetheric|burn/i);
    }
  });

  it('⚠⚠⚠ GATE OPEN: the inured chips come back, and only those', () => {
    const chips = portraitTraitChips(RAIDER, true).map(describeTrait);
    expect(chips).toEqual([
      'Armored (+2 AC)', 'Savage (+1 ATK)', 'Quick (+1 ATK, 12% dodge)',
      'Ambusher (+2 first strike)', 'Bleeder (50% bleed)', 'Concussive (20% stun)',
      'Not Weak: Slashing', 'Not Weak: Poison', 'Not Weak: Corruption',
    ]);
  });

  it('⚠⚠ resist:/vulnerable: are dropped as REDUNDANT, not censored — even wide open', () => {
    // They feed defensesFor, so whatever they say is already in the RESIST/WEAK
    // line with the type table folded in. Keeping the chip printed the raw input
    // to a sum the card had already shown.
    const chips = portraitTraitChips(RAIDER, true);
    expect(chips).not.toContain('resist:aetheric');
    expect(chips).not.toContain('vulnerable:piercing');
  });

  it('⚠⚠ `profiled` never reaches the player — it is bookkeeping, not a trait', () => {
    // randomizeEnemyDefense's idempotence marker. It showed up only because it
    // fell through `TRAIT_LABEL[t] ?? t` to its own id.
    expect(portraitTraitChips(RAIDER, true)).not.toContain('profiled');
    expect(portraitTraitChips(RAIDER, false)).not.toContain('profiled');
    expect(portraitTraitChips(['profiled'], true)).toEqual([]);
  });

  it('⚠ a boss shows its inured chips, because a boss shows its defences', () => {
    // OTA-798: the boss reveal exists because the owner asked for it twice. The
    // panel passes `boss || canRead`, so this helper never has to know about
    // bosses — but the composed behaviour is the thing worth pinning.
    expect(portraitTraitChips(RAIDER, true).filter((t) => t.startsWith('inured:')))
      .toHaveLength(3);
  });

  it('⚠ an enemy with nothing to say produces an empty row, not an empty box', () => {
    expect(portraitTraitChips([], false)).toEqual([]);
    expect(portraitTraitChips(undefined, true)).toEqual([]);
    expect(portraitTraitChips(['profiled', 'resist:burn'], false)).toEqual([]);
  });
});

describe('OTA-1527 — `inured` is a cancellation and the label must not say otherwise', () => {
  it('⚠⚠⚠ it reads "Not Weak", never "Resist"', () => {
    expect(describeTrait('inured:slashing')).toBe('Not Weak: Slashing');
    // ⚠ The whole point. traitDamageMultiplier returns ×1.0 for inured and
    // combineDamageTypeMatch only ever cancels a WEAKNESS. Calling it "Resist
    // Slashing" would tell the player to put the axe away when the axe is merely
    // ORDINARY — the same inversion OTA-1093 was written to undo.
    expect(describeTrait('inured:slashing')).not.toContain('Resist');
  });

  it('⚠⚠ it no longer prints its own raw id', () => {
    // ⚠ The colon in "Not Weak: Slashing" is punctuation, not an id separator —
    // the first draft of this test banned ':' outright and failed on the very
    // label it was written to pin. What must not survive is the KEY.
    for (const t of ['inured:slashing', 'inured:poison', 'inured:corruption']) {
      expect(describeTrait(t)).not.toContain('inured');
      expect(describeTrait(t)).not.toBe(t);
      expect(describeTrait(t)).toMatch(/^Not Weak: [A-Z]/);
    }
  });

  it('⚠ the sibling labels are untouched', () => {
    expect(describeTrait('resist:aetheric')).toBe('Resist Aetheric');
    expect(describeTrait('vulnerable:piercing')).toBe('Vuln Piercing');
    expect(describeTrait('ambush_strike')).toBe('Ambusher (+2 first strike)');
  });
});

describe('OTA-1527 — BOTH readers were saying it, so both were fixed', () => {
  // ⚠ QUICK VISUAL TUNING (owner ruling, physical Golem screenshot, Mud
  // Monarch): the chip row is no longer a SECOND reader on the compact
  // card at all — the owner asked for it to live only on the expanded
  // detail popup, which has the room for it. `portraitTraitChips` is still
  // the single filter/gate both readers that remain (the popup, and the
  // plain-text `enemyDetailBody`) go through — see the isolation below.
  const codeOf = (startMarker: string, endMarker: string): string => {
    const start = PANEL.indexOf(startMarker);
    expect(start).toBeGreaterThan(-1);
    const end = PANEL.indexOf(endMarker, start + startMarker.length);
    expect(end).toBeGreaterThan(start);
    return PANEL.slice(start, end);
  };

  it('⚠⚠⚠ the compact card no longer renders a chip row at all', () => {
    const enemyCard = codeOf('function EnemyCard(', '\nfunction Stat(');
    expect(enemyCard).not.toContain('traitRow');
    expect(enemyCard).not.toContain('portraitTraitChips');
    expect(enemyCard).not.toContain('describeTrait');
    // …and the pre-1527 unfiltered map never crept back in either.
    const code = PANEL.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('view.enemy.traits.map((t) => (');
  });

  it('⚠⚠⚠ …the expanded popup is the one place it still reads, filtered', () => {
    // The many-doors mistake, avoided the other way this time: moving the row
    // off the compact card must not leave it unfiltered on the popup, nor
    // duplicate it back onto both.
    const detail = codeOf('function EnemyDetailContent(', '\nfunction EnemyCard(');
    expect(detail).toContain('const chips = portraitTraitChips(e.traits, e.boss || canRead);');
    expect(detail).toContain('{chips.map((t) => (');
    expect(detail).not.toContain('e.traits.map((t) => (');
  });

  it('⚠⚠ every remaining reader takes the SAME gate expression the RESIST/WEAK block uses', () => {
    // A row gated on something subtly different from the block above it is the
    // bug again with an extra step. enemyDetailBody (the plain-text twin of
    // the popup) still reads the same field under the same gate.
    const code = PANEL.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).toContain('e.boss || canRead');
    // The compact card's own RESIST/WEAK block keeps its gate too — only the
    // chip row moved, not the intel gate itself.
    expect(code).toContain('view.enemy.boss || canRead');
  });
});
