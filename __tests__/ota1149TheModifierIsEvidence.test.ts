// OTA-1149 — THE MODIFIER IS EVIDENCE, and the head-noun passes were binning it.
//
// Device log, OTA-1143, 20:56:02 and earlier:
//     craft Frost Paste  → parser: ... target=frost paste resolved=Searing Paste
//
// The craft went through correctly — craft matches RECIPES, not inventory — so
// the only visible symptom was a wrong word in a debug line. That is the whole
// danger of this one: it looked cosmetic. ~25 gameStore handlers read
// parsed.resolvedNoun BEFORE parsed.target, so the same resolution under `use`
// spends the wrong consumable and the player never learns why.
//
// Mechanism: resolveItem pass 2 matched on the item's HEAD NOUN (last word) and
// never looked at the rest of the name. "frost paste" → head "paste" → the
// first inventory row ending in "paste" wins. OTA-093 had already closed the
// mirror-image hole (adjective-ONLY matches like "bone" → Bone Fragment) and
// its comment says as much; nobody checked the direction where the INPUT is the
// side carrying the adjective.
//
// ⚠ The fix has to cover pass 3 as well, or it does nothing. Pass 3 fuzzy-
// matches input tokens against head nouns, and fuzzyEqual('paste','paste') is
// true — a pass-2-only fix hands Searing Paste straight back one loop later.
import { parseInput } from '../app/engine/parser';

const inv = (id: string, name: string) =>
  ({ id, name, kind: 'misc' as const, quantity: 1, tags: [] });

const SEARING = inv('p1', 'Searing Paste');
const STATIC_PASTE = inv('p2', 'Static Paste');
const RUSTED_BLADE = inv('b1', 'Rusted Blade');
const MUD_REND = inv('b2', 'Mud-Rend Blade');
const LOCKET = inv('l1', 'Aetheric Locket');

describe('OTA-1149 — the reported case', () => {
  it('⚠ "frost paste" no longer resolves to a Searing Paste you happen to own', () => {
    const p = parseInput('use frost paste', { inventory: [SEARING, STATIC_PASTE] });
    // The player named something not in the pack. A miss is recoverable; a
    // confident wrong answer burns the wrong item.
    expect(p.resolvedNoun).not.toBe('Searing Paste');
    expect(p.resolvedItemId).toBeUndefined();
  });

  it('the pack order does not decide it either — reversed, still no match', () => {
    const p = parseInput('use frost paste', { inventory: [STATIC_PASTE, SEARING] });
    expect(p.resolvedItemId).toBeUndefined();
  });

  it('naming a paste you DO own still resolves, and to the right one', () => {
    const p = parseInput('use static paste', { inventory: [SEARING, STATIC_PASTE] });
    expect(p.resolvedItemId).toBe('p2');
    const q = parseInput('use searing paste', { inventory: [SEARING, STATIC_PASTE] });
    expect(q.resolvedItemId).toBe('p1');
  });
});

describe('OTA-1149 — the modifier now picks between same-noun rows', () => {
  it('two blades, and the adjective decides which', () => {
    const p = parseInput('attack with the mud-rend blade', {
      inventory: [RUSTED_BLADE, MUD_REND],
      // ⚠ Not a "Rust Lurker" — an enemy name sharing a word with an item name
      // is resolved by a DIFFERENT matcher upstream, which eats the adjective
      // before resolveItem ever sees it. That is a real behaviour, just not the
      // one under test here.
      enemyNames: ['Iron Spider'],
      enemyPresent: true,
    });
    expect(p.resolvedItemId).toBe('b2');
    const q = parseInput('attack with the rusted blade', {
      inventory: [RUSTED_BLADE, MUD_REND],
      // ⚠ Not a "Rust Lurker" — an enemy name sharing a word with an item name
      // is resolved by a DIFFERENT matcher upstream, which eats the adjective
      // before resolveItem ever sees it. That is a real behaviour, just not the
      // one under test here.
      enemyNames: ['Iron Spider'],
      enemyPresent: true,
    });
    expect(q.resolvedItemId).toBe('b1');
  });
});

describe('OTA-1149 — ⚠ what must NOT change', () => {
  it('a bare head noun with nothing contradicting it still matches first-in-pack', () => {
    // "use the blade" carries no adjective, so nothing is being ignored. This
    // is case (b) in the fix: keep the historical behaviour rather than start
    // refusing inputs that worked yesterday.
    const p = parseInput('use the blade', { inventory: [RUSTED_BLADE, MUD_REND] });
    expect(p.resolvedItemId).toBe('b1');
  });

  it('the full item name still wins outright (pass 1 is untouched)', () => {
    const p = parseInput('use the aetheric locket', { inventory: [LOCKET, SEARING] });
    expect(p.resolvedItemId).toBe('l1');
  });

  it('typo tolerance survives — pass 3 still fuzzes the head noun', () => {
    const p = parseInput('use lockett', { inventory: [LOCKET] });
    expect(p.resolvedItemId).toBe('l1');
  });

  it('hyphen/space equivalence survives', () => {
    const p = parseInput('use the mud rend blade', { inventory: [RUSTED_BLADE, MUD_REND] });
    expect(p.resolvedItemId).toBe('b2');
  });
});
