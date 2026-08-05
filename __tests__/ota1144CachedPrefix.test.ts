// OTA-1144 — THE CACHED PREFIX. The first real win of the headroom track, and
// it costs nothing: no new generation, no new model, no content removed.
//
// OTA-1131 measured prefix reuse at exactly ZERO across a whole session and
// recorded it as "the cache saved us nothing". That reading was wrong in a
// useful way. llama.cpp reuses the longest COMMON PREFIX between the previous
// prompt and this one — and every prompt we built put a VARIABLE line SECOND
// (the room name), so the reusable prefix ended after ~14 tokens no matter how
// much byte-identical text came after it.
//
// Measured on the ambient prompt before this change: 327 tokens, of which 287
// were identical on every single call, of which 19 were ever reused. At the
// measured ~10.5ms/token that is ~2.8 seconds per ambient line spent re-reading
// text the model had already read.
//
// The fix is ORDER, not content:
//
//     STABLE PREFIX  →  VARIABLE BODY  →  IMPERATIVE TAIL
//
// Every sentence keeps its original wording. The only rewrites are the
// "above"/"below" pointers the move forces — OTA-1131 is the standing lesson
// that a prompt which lies about its own layout costs a whole generation.
//
// ⚠ WHY THE IMPERATIVE STAYS LAST. A 0.5B model follows the instruction
// nearest the generation point best. Leaving the task uncached costs ~40
// tokens; moving it would risk the thing the prompt exists to produce. So the
// instruction blocks are SPLIT — rules in front where they cache, task at the
// back where it binds — rather than moved wholesale.
//
// ⚠ AND WHY THE PREAMBLE IS SHARED ACROSS JOBS. The cache holds ONE sequence,
// so an ambient call that follows a combat call reuses only what those two
// prompts share. An identical opening across ambient / peaceful / combat means
// the preamble survives a job switch.

import { buildSystemPrompt } from '../app/engine/contextInjector';

const base = {
  room_name: "The Architect's Blind",
  current_biome: 'Buried Capital',
  player_stats: 'STR5 DEX12 INT7 WIS6 CHA4, 30/30 HP',
  environmental_description: 'Mud to the ankles, and a ceiling that drips.',
  available_exits: 'north, east',
  active_entities: 'none',
  full_inventory: 'Cudgel, 2 rations',
  recent_history: 'you looked around',
  in_combat: false,
  ambient: false,
  player_faction_id: 'reclaimers_guild',
};
const prompt = (over: Record<string, unknown> = {}): string =>
  buildSystemPrompt({ ...base, ...over } as never)[0]!.content;

/** Characters of shared leading text — what llama.cpp gets to skip. */
function commonPrefixChars(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
const tokens = (chars: number): number => Math.round(chars / 4);

const OTHER_SCENE = {
  ambient: true,
  room_name: 'The Obsidian Pillars',
  current_biome: 'Wasteland',
  player_stats: 'STR9 DEX3 INT5 WIS8 CHA6, 12/44 HP',
};

describe('OTA-1144 — the reusable prefix is large, and that is the whole point', () => {
  it('⚠ two ambient calls in DIFFERENT scenes share a big prefix (was 19 tokens)', () => {
    const reused = tokens(commonPrefixChars(prompt({ ambient: true }), prompt(OTHER_SCENE)));
    expect(reused).toBeGreaterThan(200);
  });

  it('⚠ a job switch still shares the preamble (was 14 tokens)', () => {
    const reused = tokens(commonPrefixChars(prompt({ ambient: true }), prompt()));
    expect(reused).toBeGreaterThan(60);
  });

  it('⚠ narration → combat shares nearly everything (was 114 tokens)', () => {
    const reused = tokens(commonPrefixChars(
      prompt(), prompt({ in_combat: true, active_entities: 'Bog Hound, Silt Thief' })));
    // ⚠ RETARGETED BY OTA-1151, and the number moved for a good reason: the
    // shared prefix IS the rules block, and OTA-1151 halved that block by
    // deleting three duplicate statements of the no-invented-places rule.
    // The property this test exists for — a job switch reuses MOST of the
    // prompt rather than the 114 tokens it reused before OTA-1144 — is
    // untouched; the prefix is simply made of less padding now.
    expect(reused).toBeGreaterThan(300);
  });

  it('⚠ OTA-1144 was REORDERING; OTA-1151 did the trimming, deliberately', () => {
    // ORIGINAL INTENT, KEPT: a future edit must not "improve" the prefix by
    // quietly deleting content — that is a different change with different
    // risks and it must not pass as a caching win.
    // ⚠ RETARGETED BY OTA-1151, which is exactly such a change and made it on
    // purpose, with the arithmetic written down first: the peaceful prompt
    // measured 888 tokens, of which ~123 were the SAME "do not invent places"
    // rule stated FOUR times by three successive OTAs that each added a guard
    // and removed none. Deleting three of the four costs no instruction at
    // all. So the floor moves down rather than the test being deleted, and a
    // ceiling joins it — re-inflation is still caught, and so is a second
    // round of cutting done quietly.
    expect(tokens(prompt({ ambient: true }).length)).toBeGreaterThan(300);
    expect(tokens(prompt().length)).toBeGreaterThan(450);
    expect(tokens(prompt().length)).toBeLessThan(560);
  });
});

describe('OTA-1144 — the ordering invariant itself', () => {
  it('the stable preamble opens EVERY narration job, byte-identical', () => {
    const opener = 'You are the Arbiter, the ancient narrator of Tartaria.\n**SECOND PERSON ONLY.**';
    for (const p of [prompt({ ambient: true }), prompt(), prompt({ in_combat: true })]) {
      expect(p.startsWith(opener)).toBe(true);
    }
  });

  it('⚠ no VARIABLE value appears before the stable block ends', () => {
    // This is the invariant that was silently broken: one interpolated value
    // early in the prompt caps reuse no matter what follows it.
    const p = prompt({ ambient: true });
    const firstVariable = p.indexOf("The Architect's Blind");
    expect(firstVariable).toBeGreaterThan(800);
  });

  it('the imperative stays LAST, after the scene facts', () => {
    const amb = prompt({ ambient: true });
    expect(amb.indexOf('UNPROMPTED')).toBeGreaterThan(amb.indexOf('Your read of them:'));
    const nar = prompt();
    expect(nar.indexOf('Narrate the situation')).toBeGreaterThan(nar.indexOf("Player's Last Action:"));
  });

  it('⚠ the room-specific anchor is still adjacent to generation', () => {
    // The generic NEVER-name list moved into the cached prefix, but the line
    // that names THIS room stays in the tail — closest to the tokens it has to
    // constrain. Both halves together say what the one interpolated line said.
    const amb = prompt({ ambient: true });
    expect(amb).toContain('**If you name any place, it MUST be "The Architect\'s Blind".**');
    expect(amb.indexOf('it MUST be')).toBeGreaterThan(amb.indexOf('Your read of them:'));
    // RETARGETED BY OTA-1151 — the generic list is still in the prefix and
    // still names "Borderlands" (that example IS the playtest failure it was
    // written for), but the sentence around it was rewritten when the four
    // duplicate copies of this rule collapsed into one. Anchored on the
    // example rather than the sentence, so the next rewording does not
    // re-break it.
    expect(amb).toContain('"Borderlands"');
    expect(amb.indexOf('"Borderlands"')).toBeLessThan(amb.indexOf('it MUST be'));
  });
});

describe('OTA-1144 — ⚠ the prompt still says what it said, and points the right way', () => {
  it('ambient still omits every scene-reaction field (OTA-1129 holds)', () => {
    const p = prompt({ ambient: true });
    for (const f of ['Exits:', 'Entities Present:', 'Inventory & Equipment:',
      "Player's Last Action:", 'Environment:']) {
      expect(p).not.toContain(f);
    }
  });

  it('reactive narration still carries the full dossier', () => {
    const p = prompt();
    for (const f of ['[SYSTEM FACTS', 'Exits:', 'Entities Present:',
      'Inventory & Equipment:', "Player's Last Action:"]) {
      expect(p).toContain(f);
    }
  });

  it('⚠ no rule points at a section that is no longer where it says', () => {
    // OTA-1131 lost a whole generation to exactly this: the ambient prompt
    // referred twice to a SYSTEM FACTS block that had been removed. The rules
    // now PRECEDE the facts, so every "above" that meant the facts had to
    // become "below".
    const nar = prompt();
    expect(nar).toContain('not listed in the SYSTEM FACTS below');
    expect(nar).not.toContain('not listed in the SYSTEM FACTS above');
    const amb = prompt({ ambient: true });
    // RETARGETED BY OTA-1151 — the ambient copy of this rule was one of the
    // three duplicates that collapsed into NO_INVENTED_PLACES, so the wording
    // changed while the DIRECTION under test did not. Anchored on the
    // direction word itself, which is the whole point of the test.
    expect(amb).toContain('that is not named below');
    expect(amb).not.toContain('named above');
    // Combat's "entities listed above" is STILL correct — its task sits after
    // the entity block — so it must NOT have been flipped.
    expect(prompt({ in_combat: true })).toContain('entities listed above');
  });

  it('ambient never regains the contradiction OTA-1131 removed', () => {
    const p = prompt({ ambient: true });
    expect(p).toContain('DO NOT narrate or react to their last action');
    expect(p).not.toContain("Only narrate the player's last action");
    expect(p).not.toContain('AVAILABLE PLAYER ACTIONS');
  });
});
