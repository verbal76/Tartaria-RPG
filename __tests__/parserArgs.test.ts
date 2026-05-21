// OTA 204 — verifies the predicate + argument-structure pass and the
// post-processing validator from parseValidator.ts.
//
// References (all sourced from the three PDFs the user supplied for
// this work):
//   - Jurafsky & Martin Ch.12 §12.3.5 — subcategorization frames
//   - Sleator & Temperley §7 — post-processing rules
//   - FSNLP slides 6 — PP attachment ambiguity (validates that
//     verb frames resolve "with" attachment correctly)
//
// The bug case anchoring this whole pass:
//   input: "it is supposed to remove a noun item from the popup
//           once you search and item"
//   pre-204: parser returned intent=equip, resolvedItemId=Aetheric
//           Torch, and the equip handler cleared the player's hands
//   post-204: parser returns intent='unknown' with
//           validationIssues:['meta_talk', 'junk_in_direct'] so the
//           handler never fires.

import { parseInput } from '../app/engine/parser';
import { validateParse } from '../app/engine/parseValidator';

const TORCH = { id: 'torch1', name: 'Aetheric Torch', kind: 'misc' as const, quantity: 1, tags: [] };
const BLADE = { id: 'blade1', name: 'Rusted Blade', kind: 'weapon' as const, quantity: 1, tags: [] };
const BOLT  = { id: 'bc1',    name: 'Bolt-Caster',   kind: 'weapon' as const, quantity: 1, tags: [] };
const LOCKET = { id: 'lck1',  name: 'Aetheric Locket', kind: 'misc' as const, quantity: 1, tags: [] };

describe('OTA 204 — argument extraction (J&M §12.3.5 frames)', () => {
  it('attack with explicit instrument: args has direct + instrument', () => {
    const p = parseInput('attack the drone with the bolt-caster', {
      inventory: [BOLT],
      enemyNames: ['Aetheric Drone'],
      enemyPresent: true,
    });
    expect(p.intent).toBe('attack');
    const direct = p.args?.find((a) => a.role === 'direct');
    const instr = p.args?.find((a) => a.role === 'instrument');
    expect(direct?.resolvedNoun).toMatch(/Drone/i);
    expect(instr?.resolvedItemId).toBe('bc1');
    // Back-compat: legacy target / resolvedNoun fields stay populated
    // from args[0] for the 25+ gameStore handlers that read them.
    expect(p.target).toMatch(/drone/i);
    expect(p.resolvedNoun).toMatch(/Drone/i);
  });

  it('attack with implicit target: instrument-only is legal (combat defaults to active enemy)', () => {
    const p = parseInput('attack with the bolt-caster', {
      inventory: [BOLT],
      enemyNames: ['Aetheric Drone'],
      enemyPresent: true,
    });
    expect(p.intent).toBe('attack');
    const instr = p.args?.find((a) => a.role === 'instrument');
    expect(instr?.resolvedItemId).toBe('bc1');
  });

  it('gift with PPto recipient: args has direct + recipient', () => {
    const p = parseInput('give the locket to Yulka', {
      inventory: [LOCKET],
      recentNouns: ['Yulka'],
    });
    expect(p.intent).toBe('gift');
    const direct = p.args?.find((a) => a.role === 'direct');
    const recip  = p.args?.find((a) => a.role === 'recipient');
    expect(direct?.resolvedItemId).toBe('lck1');
    expect(recip?.text.toLowerCase()).toContain('yulka');
  });

  it('search with adverb: args has direct + manner', () => {
    const p = parseInput('search the trap carefully', {
      recentNouns: ['trap'],
    });
    expect(p.intent).toBe('investigate');
    expect(p.args?.find((a) => a.role === 'direct')?.text).toContain('trap');
    expect(p.args?.find((a) => a.role === 'manner')?.text).toMatch(/carefully/);
  });

  it('bare verb (look): no args extracted', () => {
    const p = parseInput('look', {});
    expect(p.intent).toBe('investigate');
    expect(p.args ?? []).toHaveLength(0);
  });

  it('unframed verb falls through to DEFAULT_FRAME (direct + manner accepted)', () => {
    // 'climb' isn't in VERB_FRAMES; should still extract direct.
    const p = parseInput('climb the ladder', {
      recentNouns: ['ladder'],
    });
    expect(p.intent).toBe('climb');
    expect(p.args?.find((a) => a.role === 'direct')?.text).toContain('ladder');
  });
});

describe('OTA 204 — validator (Sleator §7 post-processing rules)', () => {
  // THE PLAYTEST REGRESSION CASE — the entire reason for this work.
  it('rejects meta-talk feedback typed into action input', () => {
    const p = parseInput(
      'it is supposed to remove a noun item from the popup once you search and item',
      { inventory: [TORCH] },
    );
    expect(p.intent).toBe('unknown');
    expect(p.validationIssues).toContain('meta_talk');
    // CRITICAL: the Aetheric Torch must NOT have resolved. Pre-204
    // the equip handler would have unequipped it.
    expect(p.resolvedItemId).toBeUndefined();
  });

  it('rejects "should add a search button" — meta-talk variant', () => {
    const p = parseInput('should add a search button to the menu', { inventory: [TORCH] });
    expect(p.intent).toBe('unknown');
    expect(p.validationIssues).toContain('meta_talk');
  });

  it('rejects "i wish the parser would understand idioms"', () => {
    const p = parseInput('i wish the parser would understand idioms', { inventory: [BLADE] });
    expect(p.intent).toBe('unknown');
    expect(p.validationIssues).toContain('meta_talk');
  });

  it('rejects junk-in-direct when frame requires direct', () => {
    // Construct a fake equip command with UI-talk in the target.
    // Equip frame requires direct, and the text contains 'item' /
    // 'popup' → junk_in_direct fires.
    const p = parseInput('equip the popup button', { inventory: [TORCH] });
    expect(p.intent).toBe('unknown');
    expect(p.validationIssues).toContain('junk_in_direct');
  });

  it('does NOT reject legitimate equip commands', () => {
    const p = parseInput('equip the rusted blade', { inventory: [BLADE] });
    expect(p.intent).toBe('equip');
    expect(p.validationIssues).toBeUndefined();
    expect(p.resolvedItemId).toBe('blade1');
  });

  it('does NOT reject legitimate "use" with consumables', () => {
    const p = parseInput('use the aetheric torch', { inventory: [TORCH] });
    // 'use' routes to use_relic intent.
    expect(p.intent).toBe('use_relic');
    expect(p.resolvedItemId).toBe('torch1');
  });

  it('caps too-long inputs (>12 content tokens)', () => {
    const p = parseInput(
      'attack the drone and then retreat and find a place to rest and then come back here later when the storm has passed',
      { enemyNames: ['Aetheric Drone'], enemyPresent: true },
    );
    // Whether the parser routes this to attack or something else
    // depends on verb-first-match; either way it should reject as
    // too long (it's commentary, not a command).
    expect(p.intent).toBe('unknown');
    expect(p.validationIssues).toContain('too_long');
  });

  it('validator: pure validateParse function on a clean parse returns no issues', () => {
    const clean = parseInput('attack the drone with the blade', {
      inventory: [BLADE],
      enemyNames: ['Aetheric Drone'],
      enemyPresent: true,
    });
    expect(validateParse(clean)).toEqual([]);
  });
});

describe('OTA 204 — PP attachment ambiguity (FSNLP slides 6)', () => {
  // The textbook case: "I shot the elephant in my pajamas" — does
  // "in my pajamas" attach to the verb (shot in pajamas) or the
  // noun (elephant wearing pajamas)? Our verb frames resolve this
  // per-verb. For attack, "with X" → instrument (attaches to verb).
  it('"attack the drone with the blade" — with attaches to attack as instrument, not drone as modifier', () => {
    const p = parseInput('attack the drone with the blade', {
      inventory: [BLADE],
      enemyNames: ['Aetheric Drone'],
      enemyPresent: true,
    });
    const direct = p.args?.find((a) => a.role === 'direct');
    const instr  = p.args?.find((a) => a.role === 'instrument');
    // 'drone' is in direct, 'blade' is in instrument — NOT in direct
    expect(direct?.text.toLowerCase()).toContain('drone');
    expect(direct?.text.toLowerCase()).not.toContain('blade');
    expect(instr?.resolvedItemId).toBe('blade1');
  });
});
